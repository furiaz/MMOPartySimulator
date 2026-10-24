import { hasDirectCompanionAuthority } from "./directCommandState";
import { isCompanionEntity, isLivingEnemy } from "./entityGuards";
import {
  canAutoRouteInterrupt,
  isAutoRouteActive,
} from "./autoRouteSystem";
import { getPartyMembers } from "./partySystem";
import { getGridDistance } from "./positionUtils";
import { captureInterruptedPoiTarget } from "./poiResumeSystem";
import { isMovementBlockedByStatus } from "./statusEffects";
import {
  getEntityById,
  type GameState,
} from "./state";
import {
  getPartyExecutionIntent,
  queuePartyIntent,
  restoreQueuedPartyIntent,
  setPartyIntent,
  setPartyExecutionIntent,
} from "./partyIntentState";
import { canAssignSelfDefenseTarget } from "./partyActivityCoordinator";
import { getCommittedPartyThreatTarget } from "./partyThreatSystem";
import { applyTargetCommitment, isAutomaticCombatTarget, isPlayerInteractionDefense, selectTargetCommitment } from "./targetCommitment";
import { isDefenderAttackTargetRelevant } from "./roleSystem";
import type {
  Companion,
  Enemy,
  GameEntity,
  PartyExecutionIntent,
} from "./types";

const STUCK_SELF_DEFENSE_RADIUS = 2;
const AUTO_ROUTE_BODY_BLOCK_RADIUS = 3;
const AUTO_ROUTE_BODY_BLOCK_MS = 1000;
const AUTO_ROUTE_LOW_HEALTH_THREAT_RADIUS = 5;
const AUTO_ROUTE_LOW_HEALTH_RATIO = 0.5;

/** Consume late attack-approach evidence after its single movement result is final. */
export function updateFinalizedTargetApproaches(state: GameState): GameState {
  let next = state;
  for (const member of getPartyMembers(state).sort((a, b) => a.id.localeCompare(b.id))) {
    const actor = next.entities[member.id], observation = next.targetApproachesByEntityId?.[member.id];
    if (actor?.kind !== "companion" || !observation || observation.frame !== (next.simulationFrame ?? next.simulationTick) ||
      observation.timeMs !== (next.simulationTimeMs ?? 0) || observation.targetId !== actor.currentTargetId) continue;
    const decision = selectTargetCommitment(next, actor, { allowEmergency: false, allowOrdinaryThreat: false,
      isEligible: enemy => isDefenderAttackTargetRelevant(next, actor, enemy) });
    if ((decision.kind !== "switch" && decision.kind !== "release") ||
      (decision.reason !== "sustained_obstruction" && decision.reason !== "unreachable_engagement")) continue;
    const intent = getPartyExecutionIntent(next);
    next = applyTargetCommitment(next, actor, decision, actor.state === "defend" ? "defend" : "attack");
    if (decision.kind === "release" && actor.id === next.partyLeaderId && intent?.source !== "player" &&
      intent?.type === "attack" && intent.targetId === actor.currentTargetId) next = setPartyExecutionIntent(next, null);
  }
  return next;
}

export function updatePartyIntentRecoverySystem(state: GameState): GameState {
  const deadCompanion = getDeadCompanion(state);

  if (!deadCompanion) {
    return state.partyIntent?.recoveryIntent
      ? restoreQueuedPartyIntent(state)
      : state;
  }

  const livingCompanions = getPartyMembers(state);

  if (livingCompanions.length === 0) {
    return state;
  }

  const queuedState = queuePartyIntent(state);

  return setResurrectionRecoveryIntent(queuedState, deadCompanion);
}

export function getPartyResurrectionRecoveryTargetId(
  state: GameState,
): string | null {
  const recoveryIntent = state.partyIntent?.recoveryIntent;

  return recoveryIntent?.action === "resurrect"
    ? recoveryIntent.deadCompanionId
    : null;
}

export function updatePartyIntentSelfDefenseSystem(state: GameState): GameState {
  const executionIntent = getPartyExecutionIntent(state);

  if (!isAutoRouteActive(state)) {
    let next = state;
    for (const companion of getPartyMembers(state).sort((a, b) => a.id.localeCompare(b.id))) {
      const actor = next.entities[companion.id];
      if (actor?.kind !== "companion" || actor.state === "dead" || state.resurrectionChannelsByHelperId?.[actor.id]) continue;
      const command = next.directCompanionCommandsById?.[actor.id];
      if ((hasDirectCompanionAuthority(next, actor) && command?.type !== "gather") ||
        (executionIntent?.source === "player" && !command && !isPlayerInteractionDefense(next, actor))) continue;
      const decision = selectTargetCommitment(next, actor, { allowOrdinaryThreat: Boolean(executionIntent) || next.autoModeEnabled,
        isEligible: enemy => isDefenderAttackTargetRelevant(next, actor, enemy) });
      next = applyTargetCommitment(next, actor, decision);
      if (decision.kind === "release" && decision.reason === "unreachable_engagement" && actor.id === next.partyLeaderId &&
        executionIntent?.type === "attack" && executionIntent.source !== "player" && executionIntent.targetId === actor.currentTargetId)
        next = setPartyExecutionIntent(next, null);
    }
    return next;
  }
  if (executionIntent?.source === "player") return state;
  const current = getCurrentExecutionEnemyTarget(state);
  const selfDefenseTarget = current && isAutomaticCombatTarget(state, current)
    ? getCommittedPartyThreatTarget(state, { currentTarget: current, range: 3 }) : getAutoRouteEmergencyTarget(state);

  if (!selfDefenseTarget) {
    return state;
  }

  const baseState =
    executionIntent?.type === "attack" &&
    executionIntent.targetId === selfDefenseTarget.id
      ? state
      : captureInterruptedPoiTarget(state, selfDefenseTarget);
  const defenseState = setPartyIntent(baseState, {
    mode: "engage",
    source: "ai",
    executionIntent: createAttackIntent(selfDefenseTarget),
    globalPoiIntent: baseState.globalPoiIntent,
    localPoiTarget: baseState.localPoiTarget,
    worldTravelTargetMapId: baseState.worldTravelTargetMapId,
    lastPoiDecision: baseState.lastPoiDecision,
    queuedIntent: baseState.partyIntent?.queuedIntent ?? null,
    recoveryIntent: baseState.partyIntent?.recoveryIntent ?? null,
  });

  return assignCompanionsToSelfDefense(defenseState, selfDefenseTarget);
}

function setResurrectionRecoveryIntent(
  state: GameState,
  deadCompanion: Companion,
): GameState {
  return setPartyIntent(state, {
    mode: "resurrect",
    source: "ai",
    executionIntent: null,
    globalPoiIntent: null,
    localPoiTarget: null,
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    queuedIntent: state.partyIntent?.queuedIntent ?? null,
    recoveryIntent: {
      action: "resurrect",
      deadCompanionId: deadCompanion.id,
      threatEnemyIds: [],
    },
  });
}

function assignCompanionsToSelfDefense(
  state: GameState,
  target: Enemy,
): GameState {
  let nextState = state;

  for (const companion of getPartyMembers(nextState)) {
    if (!canAssignSelfDefenseTarget(nextState, companion, target)) {
      continue;
    }

    nextState = applyTargetCommitment(nextState, companion, selectTargetCommitment(nextState, companion, { preferredTarget: target }));
  }

  return nextState;
}

function getDeadCompanion(state: GameState): Companion | null {
  const configuredLeader = getEntityById(state, state.partyLeaderId);

  if (isDeadCompanion(configuredLeader)) {
    return configuredLeader;
  }

  return (
    Object.values(state.entities).find(
      (entity): entity is Companion => isDeadCompanion(entity),
    ) ?? null
  );
}

function getAutoRouteEmergencyTarget(state: GameState): Enemy | null {
  const forcedTarget =
    getRouteMovementBlockedTarget(state) ??
    getRouteStatusBlockedTarget(state) ??
    getRouteLowHealthTarget(state);

  if (forcedTarget) {
    return forcedTarget;
  }

  if (!canAutoRouteInterrupt(state)) {
    return null;
  }

  return getStuckNearEnemyTarget(
    state,
    AUTO_ROUTE_BODY_BLOCK_RADIUS,
    AUTO_ROUTE_BODY_BLOCK_MS,
  );
}

function getBlockedMovementEnemyTarget(state: GameState): Enemy | null {
  const candidates = getPartyMembers(state)
    .filter((companion) => !hasDirectCompanionAuthority(state, companion))
    .map((companion) => ({
      companion,
      enemy: getMovementBlockerEnemy(state, companion),
    }))
    .filter(
      (candidate): candidate is { companion: Companion; enemy: Enemy } =>
        Boolean(candidate.enemy),
    )
    .sort(
      (first, second) =>
        getGridDistance(first.companion.position, first.enemy.position) -
          getGridDistance(second.companion.position, second.enemy.position) ||
        first.enemy.id.localeCompare(second.enemy.id),
    );

  return candidates[0]?.enemy ?? null;
}

function getMovementBlockerEnemy(
  state: GameState,
  companion: Companion,
): Enemy | null {
  const failure = state.movementFailuresByEntityId?.[companion.id];
  const blocker = failure?.blockerId
    ? getEntityById(state, failure.blockerId)
    : undefined;

  return isLivingEnemy(blocker) ? blocker : null;
}

function getStuckNearEnemyTarget(
  state: GameState,
  radius = STUCK_SELF_DEFENSE_RADIUS,
  minimumFailureMs = 1,
): Enemy | null {
  const candidates = getPartyMembers(state)
    .filter(
      (companion) =>
        !hasDirectCompanionAuthority(state, companion) &&
        (state.movementFailureMsByEntityId?.[companion.id] ?? 0) >=
          minimumFailureMs,
    )
    .flatMap((companion) =>
      Object.values(state.entities)
        .filter(isLivingEnemy)
        .filter(
          (enemy) =>
            getGridDistance(companion.position, enemy.position) <=
            radius,
        )
        .map((enemy) => ({ companion, enemy })),
    )
    .sort(
      (first, second) =>
        getGridDistance(first.companion.position, first.enemy.position) -
          getGridDistance(second.companion.position, second.enemy.position) ||
        first.enemy.id.localeCompare(second.enemy.id),
    );

  return candidates[0]?.enemy ?? null;
}

function getRouteMovementBlockedTarget(state: GameState): Enemy | null {
  return getBlockedMovementEnemyTarget(state);
}

function getRouteStatusBlockedTarget(state: GameState): Enemy | null {
  const candidates = getPartyMembers(state)
    .filter((companion) => !hasDirectCompanionAuthority(state, companion))
    .filter(
      (companion) =>
        isMovementBlockedByStatus(state, companion.id) ||
        hasActiveStatusType(state, companion.id, "taunted"),
    )
    .flatMap((companion) =>
      Object.values(state.entities)
        .filter(isLivingEnemy)
        .filter(
          (enemy) =>
            enemy.currentTargetId === companion.id ||
            getGridDistance(companion.position, enemy.position) <=
              AUTO_ROUTE_LOW_HEALTH_THREAT_RADIUS,
        )
        .map((enemy) => ({ companion, enemy })),
    )
    .sort(
      (first, second) =>
        getGridDistance(first.companion.position, first.enemy.position) -
          getGridDistance(second.companion.position, second.enemy.position) ||
        first.enemy.id.localeCompare(second.enemy.id),
    );

  return candidates[0]?.enemy ?? null;
}

function getRouteLowHealthTarget(state: GameState): Enemy | null {
  const candidates = getPartyMembers(state)
    .filter((companion) => companion.health / companion.maxHealth <= AUTO_ROUTE_LOW_HEALTH_RATIO)
    .flatMap((companion) =>
      Object.values(state.entities)
        .filter(isLivingEnemy)
        .filter(
          (enemy) =>
            getGridDistance(companion.position, enemy.position) <=
            AUTO_ROUTE_LOW_HEALTH_THREAT_RADIUS,
        )
        .map((enemy) => ({ companion, enemy })),
    )
    .sort(
      (first, second) =>
        getGridDistance(first.companion.position, first.enemy.position) -
          getGridDistance(second.companion.position, second.enemy.position) ||
        first.enemy.id.localeCompare(second.enemy.id),
    );

  return candidates[0]?.enemy ?? null;
}

function hasActiveStatusType(
  state: GameState,
  targetId: string,
  type: "taunted",
): boolean {
  const nowMs = state.simulationTimeMs ?? 0;

  return Object.values(state.statusEffectsById ?? {}).some(
    (status) =>
      status.targetId === targetId &&
      status.type === type &&
      status.expiresAt > nowMs,
  );
}

function getCurrentExecutionEnemyTarget(state: GameState): Enemy | null {
  const executionIntent = getPartyExecutionIntent(state);
  const target = executionIntent?.targetId
    ? getEntityById(state, executionIntent.targetId)
    : undefined;

  return isLivingEnemy(target) ? target : null;
}

function createAttackIntent(target: Enemy): PartyExecutionIntent {
  return {
    type: "attack",
    targetId: target.id,
    targetPosition: target.position,
    source: "ai",
  };
}

function isDeadCompanion(entity: GameEntity | undefined): entity is Companion {
  return Boolean(
    isCompanionEntity(entity) &&
      (entity.state === "dead" || entity.health <= 0),
  );
}
