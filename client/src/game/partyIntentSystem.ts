import { isCompanionEntity, isLivingEnemy } from "./entityGuards";
import { getPartyMembers, isGathererBusy } from "./partySystem";
import { getGridDistance } from "./positionUtils";
import { captureInterruptedPoiTarget } from "./poiResumeSystem";
import { isCompanionResurrectionChanneling } from "./resurrectionSystem";
import {
  getEntityById,
  getPartyExecutionIntent,
  queuePartyIntent,
  restoreQueuedPartyIntent,
  setPartyIntent,
  updateEntity,
  type GameState,
} from "./state";
import { isActivePartyThreat } from "./partyThreatSystem";
import type {
  Companion,
  Enemy,
  GameEntity,
  PartyExecutionIntent,
} from "./types";

const DEAD_LEADER_THREAT_RADIUS = 6;
const SELF_DEFENSE_THREAT_RADIUS = 3;
const STUCK_SELF_DEFENSE_RADIUS = 2;

export function updatePartyIntentRecoverySystem(state: GameState): GameState {
  const configuredLeader = getEntityById(state, state.partyLeaderId);
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

  if (!isDeadCompanion(configuredLeader)) {
    return setResurrectionRecoveryIntent(queuedState, deadCompanion);
  }

  const nearbyThreats = getLivingEnemiesNear(queuedState, configuredLeader);

  if (nearbyThreats.length > 0) {
    const target = nearbyThreats[0];
    const recoveryState = setPartyIntent(queuedState, {
      mode: "engage",
      source: "ai",
      executionIntent: createAttackIntent(target),
      globalPoiIntent: null,
      localPoiTarget: null,
      worldTravelTargetMapId: queuedState.worldTravelTargetMapId,
      queuedIntent: queuedState.partyIntent?.queuedIntent ?? null,
      recoveryIntent: {
        action: "fight_near_dead_leader",
        deadCompanionId: configuredLeader.id,
        threatEnemyIds: nearbyThreats.map((enemy) => enemy.id),
      },
    });

    return assignLivingCompanionsToRecoveryFight(recoveryState, target);
  }

  return setResurrectionRecoveryIntent(queuedState, configuredLeader);
}

export function isPartyRecoveryFightActive(state: GameState): boolean {
  return state.partyIntent?.recoveryIntent?.action === "fight_near_dead_leader";
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
  if (isPartyRecoveryFightActive(state)) {
    return state;
  }

  const executionIntent = getPartyExecutionIntent(state);

  if (executionIntent?.source === "player") {
    return state;
  }

  const selfDefenseTarget = getSelfDefenseTarget(state, Boolean(executionIntent));

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

function assignLivingCompanionsToRecoveryFight(
  state: GameState,
  target: Enemy,
): GameState {
  let nextState = state;

  for (const companion of getPartyMembers(nextState)) {
    if (companion.commandPriority === "direct") {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...companion,
      state: "attack",
      currentTargetId: target.id,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function assignCompanionsToSelfDefense(
  state: GameState,
  target: Enemy,
): GameState {
  let nextState = state;

  for (const companion of getPartyMembers(nextState)) {
    if (
      isCompanionResurrectionChanneling(nextState, companion.id) ||
      (companion.commandPriority === "direct" &&
        !isCompanionPersonallyBlockedOrThreatened(nextState, companion, target)) ||
      (companion.commandPriority !== "direct" &&
        isGathererBusy(nextState, companion) &&
        !isCompanionPersonallyBlockedOrThreatened(nextState, companion, target))
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...companion,
      state: "attack",
      currentTargetId: target.id,
      commandPriority:
        companion.commandPriority === "direct" ? "direct" : "autonomous",
    });
  }

  return nextState;
}

function getDeadCompanion(state: GameState): Companion | null {
  return (
    Object.values(state.entities).find(
      (entity): entity is Companion => isDeadCompanion(entity),
    ) ?? null
  );
}

function getLivingEnemiesNear(state: GameState, companion: Companion): Enemy[] {
  return Object.values(state.entities)
    .filter(isLivingEnemy)
    .filter(
      (enemy) =>
        getGridDistance(enemy.position, companion.position) <=
        DEAD_LEADER_THREAT_RADIUS,
    )
    .sort(
      (first, second) =>
        getGridDistance(first.position, companion.position) -
          getGridDistance(second.position, companion.position) ||
        first.id.localeCompare(second.id),
    );
}

function getSelfDefenseTarget(
  state: GameState,
  hasManagerExecutionIntent: boolean,
): Enemy | null {
  const blockedTarget = getBlockedMovementEnemyTarget(state);

  if (blockedTarget) {
    return blockedTarget;
  }

  const stuckTarget = getStuckNearEnemyTarget(state);

  if (stuckTarget) {
    return stuckTarget;
  }

  return hasManagerExecutionIntent ? getCloseActiveThreatTarget(state) : null;
}

function getBlockedMovementEnemyTarget(state: GameState): Enemy | null {
  const candidates = getPartyMembers(state)
    .filter((companion) => companion.commandPriority !== "direct")
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

function getStuckNearEnemyTarget(state: GameState): Enemy | null {
  const candidates = getPartyMembers(state)
    .filter(
      (companion) =>
        companion.commandPriority !== "direct" &&
        (state.movementFailureMsByEntityId?.[companion.id] ?? 0) > 0,
    )
    .flatMap((companion) =>
      Object.values(state.entities)
        .filter(isLivingEnemy)
        .filter(
          (enemy) =>
            getGridDistance(companion.position, enemy.position) <=
            STUCK_SELF_DEFENSE_RADIUS,
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

function getCloseActiveThreatTarget(state: GameState): Enemy | null {
  return (
    Object.values(state.entities)
      .filter((entity): entity is Enemy => isActivePartyThreat(state, entity))
      .filter((enemy) =>
        getPartyMembers(state).some(
          (companion) =>
            companion.commandPriority !== "direct" &&
            getGridDistance(companion.position, enemy.position) <=
              SELF_DEFENSE_THREAT_RADIUS,
        ),
      )
      .sort(
        (first, second) =>
          getNearestCompanionDistance(state, first) -
            getNearestCompanionDistance(state, second) ||
          first.id.localeCompare(second.id),
      )[0] ?? null
  );
}

function getNearestCompanionDistance(state: GameState, enemy: Enemy): number {
  const distances = getPartyMembers(state)
    .filter((companion) => companion.commandPriority !== "direct")
    .map((companion) => getGridDistance(companion.position, enemy.position));

  return distances.length > 0 ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

function isCompanionPersonallyBlockedOrThreatened(
  state: GameState,
  companion: Companion,
  target: Enemy,
): boolean {
  return (
    getMovementBlockerEnemy(state, companion)?.id === target.id ||
    target.currentTargetId === companion.id
  );
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
