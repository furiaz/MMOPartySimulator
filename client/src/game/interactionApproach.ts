import {
  getNavigationPositionKey,
} from "./navigation";
import {
  getBoundedNavigationDistance,
  isPositionAvailable,
} from "./movementPlanning";
import {
  getEuclideanDistance,
  getManhattanDistance,
} from "./positionUtils";
import type { GameState } from "./state";
import type { GameEntity, Position } from "./types";

type InteractionStandOptions = {
  range: number;
  ignoredEntityId: string;
};

export function resolveInteractionStandPosition(
  state: GameState,
  actor: GameEntity,
  targetPosition: Position,
  range: number,
): Position | null {
  if (range <= 0) {
    return null;
  }

  const options = { range, ignoredEntityId: actor.id };

  if (isInteractionStandPositionReachable(state, actor, targetPosition, actor.position, options)) {
    return actor.position;
  }

  if (!state.map) {
    return null;
  }

  const maxDistance = state.map.columns * state.map.rows * 2;

  for (const candidate of getInteractionStandCandidates(state, actor, targetPosition, range)) {
    if (
      !isInteractionStandPositionReachable(
        state,
        actor,
        targetPosition,
        candidate,
        options,
        maxDistance,
      )
    ) {
      continue;
    }

    return candidate;
  }

  return null;
}

function getInteractionStandCandidates(
  state: GameState,
  actor: GameEntity,
  targetPosition: Position,
  range: number,
): Position[] {
  if (!state.map) {
    return [];
  }

  const candidates: Position[] = [];

  for (let y = 0; y < state.map.rows; y += 1) {
    for (let x = 0; x < state.map.columns; x += 1) {
      const position = { x, y };

      if (getEuclideanDistance(position, targetPosition) <= range) {
        candidates.push(position);
      }
    }
  }

  return candidates.sort((first, second) => {
    const firstTargetGridDistance = getManhattanDistance(first, targetPosition);
    const secondTargetGridDistance = getManhattanDistance(second, targetPosition);

    if (firstTargetGridDistance !== secondTargetGridDistance) {
      return firstTargetGridDistance - secondTargetGridDistance;
    }

    const firstActorDistance = getEuclideanDistance(first, actor.position);
    const secondActorDistance = getEuclideanDistance(second, actor.position);

    if (firstActorDistance !== secondActorDistance) {
      return firstActorDistance - secondActorDistance;
    }

    if (first.y !== second.y) {
      return first.y - second.y;
    }

    return first.x - second.x;
  });
}

function isInteractionStandPositionReachable(
  state: GameState,
  actor: GameEntity,
  targetPosition: Position,
  position: Position,
  options: InteractionStandOptions,
  maxDistance = state.map ? state.map.columns * state.map.rows * 2 : Number.POSITIVE_INFINITY,
): boolean {
  if (getEuclideanDistance(position, targetPosition) > options.range) {
    return false;
  }

  if (
    !isPositionAvailable(state, position, { ignoredEntityId: options.ignoredEntityId }) ||
    isReservedPosition(state, position, options.ignoredEntityId)
  ) {
    return false;
  }

  return (
    getBoundedNavigationDistance(
      state,
      actor.position,
      position,
      maxDistance,
      actor.id,
      { allowPartyPassThrough: true },
    ) !== null
  );
}

function isReservedPosition(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
): boolean {
  const positionKey = getNavigationPositionKey(position);

  return Object.entries(state.reservedPositionsByEntityId ?? {}).some(
    ([entityId, reservedPosition]) =>
      entityId !== ignoredEntityId &&
      getNavigationPositionKey(reservedPosition) === positionKey,
  );
}
