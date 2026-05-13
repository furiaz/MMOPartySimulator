import { getGridDistance } from "./positionUtils";
import type { GameState, MovementFailureDetail } from "./state";
import type { DebugNavigationReason, GameEntity, Position } from "./types";

export function clearFrameMovementPlanning(state: GameState): GameState {
  const movementFailureMsByEntityId = { ...(state.movementFailureMsByEntityId ?? {}) };

  for (const entityId of Object.keys(movementFailureMsByEntityId)) {
    if (!state.failedMoveByEntityId?.[entityId]) {
      delete movementFailureMsByEntityId[entityId];
    }
  }

  return {
    ...state,
    failedMoveByEntityId: {},
    movementFailureMsByEntityId,
    movementFailuresByEntityId: {},
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
  delete failedMoveByEntityId[entityId];
  delete movementFailureMsByEntityId[entityId];
  delete movementFailuresByEntityId[entityId];

  return {
    ...state,
    lastPositionsByEntityId: {
      ...(state.lastPositionsByEntityId ?? {}),
      [entityId]: previousPosition,
    },
    failedMoveByEntityId,
    movementFailureMsByEntityId,
    movementFailuresByEntityId,
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
