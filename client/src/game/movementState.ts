import { getGridDistance } from "./positionUtils";
import type { MovementFailureDetail } from "./movementTypes";
import type { GameState } from "./state";
import type { DebugNavigationReason, GameEntity, Position } from "./types";

const MOVEMENT_REPATH_FAILURE_BACKOFF_MS = 250;

export function clearFrameMovementPlanning(state: GameState): GameState {
  const isLiving = (id: string) => state.entities[id] && state.entities[id].state !== "dead";
  const travel = state.formationAssignments?.travel;
  if (travel && [...Object.entries(travel.goalsByEntityId), ...Object.entries(travel.proposedGoalsByEntityId ?? {})]
    .some(([id, goal]) => goal.recovery && !isLiving(id))) state = { ...state,
      formationAssignments: { ...state.formationAssignments!, travel: { ...travel,
        goalsByEntityId: Object.fromEntries(Object.entries(travel.goalsByEntityId).filter(([id]) => isLiving(id))),
        proposedGoalsByEntityId: travel.proposedGoalsByEntityId && Object.fromEntries(Object.entries(travel.proposedGoalsByEntityId).filter(([id]) => isLiving(id))),
      } },
    };
  if (Object.keys(state.formationPathSearchesByEntityId ?? {}).some(id => !isLiving(id))) state = { ...state,
    formationPathSearchesByEntityId: Object.fromEntries(Object.entries(state.formationPathSearchesByEntityId ?? {}).filter(([id]) => isLiving(id))),
  };
  const avoidance = Object.entries(state.localAvoidanceByEntityId ?? {});
  const recovery = Object.entries(state.overlapRecoveryByEntityId ?? {});
  if (avoidance.some(([id, entry]) => !isLiving(id) || (state.simulationTimeMs ?? 0) - entry.lastActiveAtMs > 750) ||
    recovery.some(([id]) => !isLiving(id))) state = { ...state,
      localAvoidanceByEntityId: Object.fromEntries(avoidance.filter(([id, entry]) => isLiving(id) && (state.simulationTimeMs ?? 0) - entry.lastActiveAtMs <= 750)),
      overlapRecoveryByEntityId: Object.fromEntries(recovery.filter(([id]) => isLiving(id))),
    };
  const hasFramePlanning =
    Boolean(state.companionTargetTransitions?.length) ||
    Boolean(state.normalMovementPhase) ||
    Object.keys(state.movementPositionCommitsByEntityId ?? {}).length > 0 ||
    Object.keys(state.normalMovementResultsByEntityId ?? {}).length > 0 ||
    Object.keys(state.externalMovementOwnersByEntityId ?? {}).length > 0 ||
    Object.keys(state.failedMoveByEntityId ?? {}).length > 0 ||
    Object.keys(state.movementFailuresByEntityId ?? {}).length > 0 ||
    Object.keys(state.movementDecisionsByEntityId ?? {}).length > 0 ||
    Object.keys(state.moveIntentsByEntityId ?? {}).length > 0 ||
    Object.keys(state.reservedPositionsByEntityId ?? {}).length > 0 ||
    Object.keys(state.movementFailureMsByEntityId ?? {}).length > 0 ||
    Object.keys(state.movementPathRetryAtMsByEntityId ?? {}).some(
      (entityId) =>
        (state.movementPathRetryAtMsByEntityId?.[entityId] ?? 0) <=
        (state.simulationTimeMs ?? 0),
    );

  if (!hasFramePlanning) {
    return state;
  }

  const movementFailureMsByEntityId = { ...(state.movementFailureMsByEntityId ?? {}) };
  const movementPathRetryAtMsByEntityId = {
    ...(state.movementPathRetryAtMsByEntityId ?? {}),
  };

  for (const entityId of Object.keys(movementFailureMsByEntityId)) {
    if (!state.failedMoveByEntityId?.[entityId]) {
      delete movementFailureMsByEntityId[entityId];
    }
  }

  for (const [entityId, retryAtMs] of Object.entries(movementPathRetryAtMsByEntityId)) {
    if (retryAtMs <= (state.simulationTimeMs ?? 0)) {
      delete movementPathRetryAtMsByEntityId[entityId];
    }
  }

  return {
    ...state,
    companionTargetTransitions: [],
    normalMovementResultsByEntityId: {},
    movementPositionCommitsByEntityId: {},
    normalMovementPhase: undefined,
    externalMovementOwnersByEntityId: {},
    failedMoveByEntityId: {},
    movementFailureMsByEntityId,
    movementFailuresByEntityId: {},
    movementPathRetryAtMsByEntityId,
    movementDecisionsByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
  };
}

export const clearTickMovementPlanning = clearFrameMovementPlanning;

export function markMoveSucceeded(
  state: GameState,
  entityId: string,
  previousPosition: Position,
): GameState {
  const failedMoveByEntityId = { ...(state.failedMoveByEntityId ?? {}) };
  const movementFailureMsByEntityId = { ...(state.movementFailureMsByEntityId ?? {}) };
  const movementFailuresByEntityId = { ...(state.movementFailuresByEntityId ?? {}) };
  const movementPathRetryAtMsByEntityId = {
    ...(state.movementPathRetryAtMsByEntityId ?? {}),
  };
  delete failedMoveByEntityId[entityId];
  delete movementFailureMsByEntityId[entityId];
  delete movementFailuresByEntityId[entityId];
  delete movementPathRetryAtMsByEntityId[entityId];

  return {
    ...state,
    lastPositionsByEntityId: {
      ...(state.lastPositionsByEntityId ?? {}),
      [entityId]: previousPosition,
    },
    failedMoveByEntityId,
    movementFailureMsByEntityId,
    movementFailuresByEntityId,
    movementPathRetryAtMsByEntityId,
  };
}

export function markMovementDecision(
  state: GameState,
  entityId: string,
  reason: DebugNavigationReason,
): GameState {
  return {
    ...state,
    movementDecisionsByEntityId: {
      ...(state.movementDecisionsByEntityId ?? {}),
      [entityId]: reason,
    },
  };
}

export function markMoveFailed(
  state: GameState,
  entityId: string,
  detail: MovementFailureDetail = {},
  reason: DebugNavigationReason = "blocked",
): GameState {
  const deltaMs = state.simulationDeltaMs ?? 100;
  const currentRetryAtMs = state.movementPathRetryAtMsByEntityId?.[entityId];
  const nowMs = state.simulationTimeMs ?? 0;
  const retryAtMs = currentRetryAtMs && currentRetryAtMs > nowMs
    ? currentRetryAtMs
    : nowMs + MOVEMENT_REPATH_FAILURE_BACKOFF_MS;

  return {
    ...state,
    failedMoveByEntityId: {
      ...(state.failedMoveByEntityId ?? {}),
      [entityId]: true,
    },
    movementFailureMsByEntityId: {
      ...(state.movementFailureMsByEntityId ?? {}),
      [entityId]: (state.movementFailureMsByEntityId?.[entityId] ?? 0) + deltaMs,
    },
    movementFailuresByEntityId: {
      ...(state.movementFailuresByEntityId ?? {}),
      [entityId]: detail,
    },
    movementPathRetryAtMsByEntityId: {
      ...(state.movementPathRetryAtMsByEntityId ?? {}),
      [entityId]: retryAtMs,
    },
    movementDecisionsByEntityId: {
      ...(state.movementDecisionsByEntityId ?? {}),
      [entityId]: reason,
    },
  };
}

export function getFailedMovementReason(
  state: GameState,
  entityId: string,
): DebugNavigationReason {
  return state.map && !state.movementPathsByEntityId?.[entityId]
    ? "no_path"
    : "blocked";
}

export function createMovementFailureDetail(
  entity: GameEntity,
  target: GameEntity,
  intendedPosition: Position | null | undefined,
  blocker: { id?: string; kind: MovementFailureDetail["blockerKind"] } | undefined,
): MovementFailureDetail {
  return {
    targetId: target.id === "__position_target__" ? null : target.id,
    targetDistance: getGridDistance(entity.position, target.position),
    intendedPosition: intendedPosition ?? null,
    blockerId: blocker?.id,
    blockerKind: blocker?.kind,
  };
}
