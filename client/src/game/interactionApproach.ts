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
import type { LocalPoiTarget } from "./questTypes";

type InteractionStandOptions = {
  range: number;
  ignoredEntityId: string;
};

const INTERACTION_STAND_REACHED_DISTANCE = 1;

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

export function isInteractionStandPositionUsable(
  state: GameState,
  actor: GameEntity,
  targetPosition: Position,
  position: Position,
  range: number,
): boolean {
  return (
    getEuclideanDistance(position, targetPosition) <= range &&
    isPositionAvailable(state, position, { ignoredEntityId: actor.id }) &&
    !isReservedPosition(state, position, actor.id)
  );
}

export function isInteractionTargetReached(
  state: GameState,
  actor: GameEntity,
  target: LocalPoiTarget,
): boolean {
  const range = target.interactionRange;

  if (!range || !isInteractionPoiTarget(target)) {
    return false;
  }

  const targetPosition = getInteractionTargetPosition(state, target);

  if (getEuclideanDistance(actor.position, targetPosition) <= range) {
    return true;
  }

  return isCachedInteractionStandReached(
    state,
    actor,
    target,
    targetPosition,
    range,
  );
}

export function isInteractionPoiTarget(target: LocalPoiTarget): boolean {
  return (
    target.category !== "combat" &&
    target.category !== "resource" &&
    target.category !== "teleport" &&
    Boolean(target.interactionRange)
  );
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

  const minX = Math.max(0, Math.floor(targetPosition.x - range));
  const maxX = Math.min(state.map.columns - 1, Math.ceil(targetPosition.x + range));
  const minY = Math.max(0, Math.floor(targetPosition.y - range));
  const maxY = Math.min(state.map.rows - 1, Math.ceil(targetPosition.y + range));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
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

function isCachedInteractionStandReached(
  state: GameState,
  actor: GameEntity,
  target: LocalPoiTarget,
  targetPosition: Position,
  range: number,
): boolean {
  return Boolean(
    target.interactionStandActorId === actor.id &&
      target.interactionStandPosition &&
      target.interactionStandTargetPosition &&
      arePositionsEqual(target.interactionStandTargetPosition, targetPosition) &&
      getEuclideanDistance(actor.position, target.interactionStandPosition) <=
        INTERACTION_STAND_REACHED_DISTANCE &&
      isInteractionStandPositionUsable(
        state,
        actor,
        targetPosition,
        target.interactionStandPosition,
        range,
      ),
  );
}

function getInteractionTargetPosition(
  state: GameState,
  target: LocalPoiTarget,
): Position {
  const entity = target.targetEntityId
    ? state.entities[target.targetEntityId]
    : undefined;

  return entity?.position ?? target.position;
}

function isInteractionStandPositionReachable(
  state: GameState,
  actor: GameEntity,
  targetPosition: Position,
  position: Position,
  options: InteractionStandOptions,
  maxDistance = state.map ? state.map.columns * state.map.rows * 2 : Number.POSITIVE_INFINITY,
): boolean {
  if (
    !isInteractionStandPositionUsable(
      state,
      actor,
      targetPosition,
      position,
      options.range,
    )
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

function arePositionsEqual(first: Position, second: Position): boolean {
  return first.x === second.x && first.y === second.y;
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
