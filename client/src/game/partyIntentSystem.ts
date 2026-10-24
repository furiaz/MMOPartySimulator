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
  updateEntity,
  type GameState,
} from "./state";
import {
  getPartyExecutionIntent,
  queuePartyIntent,
  restoreQueuedPartyIntent,
  setPartyIntent,
} from "./partyIntentState";
import { canAssignSelfDefenseTarget } from "./partyActivityCoordinator";
import { getCommittedPartyThreatTarget } from "./partyThreatSystem";
import type {
  Companion,
  Enemy,
  GameEntity,
  PartyExecutionIntent,
} from "./types";

const SELF_DEFENSE_THREAT_RADIUS = 3;
const STUCK_SELF_DEFENSE_RADIUS = 2;
const AUTO_ROUTE_BODY_BLOCK_RADIUS = 3;
const AUTO_ROUTE_BODY_BLOCK_MS = 1000;
const AUTO_ROUTE_LOW_HEALTH_THREAT_RADIUS = 5;
const AUTO_ROUTE_LOW_HEALTH_RATIO = 0.5;

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

  if (executionIntent?.source === "player") {
    return state;
  }

  const selfDefenseTarget = isAutoRouteActive(state)
    ? getAutoRouteEmergencyTarget(state)
    : getSelfDefenseTarget(
        state,
        Boolean(executionIntent) || state.autoModeEnabled,
      );

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

    nextState = updateEntity(nextState, {
      ...companion,
      state: "attack",
      currentTargetId: target.id,
      commandPriority:
        hasDirectCompanionAuthority(nextState, companion) ? "direct" : "autonomous",
    });
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

function getCloseActiveThreatTarget(state: GameState): Enemy | null {
  return getCommittedPartyThreatTarget(state, {
    currentTarget: getCurrentExecutionEnemyTarget(state),
    range: SELF_DEFENSE_THREAT_RADIUS,
  });
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
