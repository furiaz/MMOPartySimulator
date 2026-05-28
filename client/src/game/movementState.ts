import { getGridDistance } from "./positionUtils";
import type { GameState, MovementFailureDetail } from "./state";
import type { DebugNavigationReason, GameEntity, Position } from "./types";

const MOVEMENT_REPATH_FAILURE_BACKOFF_MS = 250;

export function clearFrameMovementPlanning(state: GameState): GameState {
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
