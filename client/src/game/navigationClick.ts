import {
  getNavigationPositionKey,
  isNavigationCellWalkable,
} from "./navigation";
import { getPartyLeader } from "./partySystem";
import {
  ENTITY_COLLISION_DISTANCE,
  getBoundedNavigationDistance,
  type GameState,
} from "./state";
import type { GameEntity, GameMap, Position } from "./types";
import { getEuclideanDistance, getManhattanDistance } from "./positionUtils";

const RESOURCE_COLLISION_DISTANCE = 0.7;
const POSITION_EPSILON = 0.001;

export function resolveNavigationClickTarget(
  state: GameState,
  clickedPosition: Position,
): Position | null {
  const map = state.map;
  const leader = getPartyLeader(state);

  if (!map || !leader) {
    return null;
  }

  const maxDistance = map.columns * map.rows * 2;
  const candidates = getMapPositionsByDistance(map, clickedPosition);

  for (const candidate of candidates) {
    if (!isValidNavigationClickDestination(state, candidate, leader.id)) {
      continue;
    }

    const distance = getBoundedNavigationDistance(
      state,
      leader.position,
      candidate,
      maxDistance,
      leader.id,
      { allowPartyPassThrough: true },
    );

    if (distance !== null) {
      return candidate;
    }
  }

  return null;
}

function getMapPositionsByDistance(map: GameMap, origin: Position): Position[] {
  const positions: Position[] = [];

  for (let y = 0; y < map.rows; y += 1) {
    for (let x = 0; x < map.columns; x += 1) {
      positions.push({ x, y });
    }
  }

  return positions.sort((first, second) => {
    const firstGridDistance = getManhattanDistance(first, origin);
    const secondGridDistance = getManhattanDistance(second, origin);

    if (firstGridDistance !== secondGridDistance) {
      return firstGridDistance - secondGridDistance;
    }

    const firstDistance = getEuclideanDistance(first, origin);
    const secondDistance = getEuclideanDistance(second, origin);

    if (firstDistance !== secondDistance) {
      return firstDistance - secondDistance;
    }

    if (first.y !== second.y) {
      return first.y - second.y;
    }

    return first.x - second.x;
  });
}

function isValidNavigationClickDestination(
  state: GameState,
  position: Position,
  leaderId: string,
): boolean {
  const map = state.map;

  return Boolean(
    map &&
      isNavigationCellWalkable(map, position) &&
      !isReservedNavigationPosition(state, position, leaderId) &&
      !Object.values(state.entities).some((entity) =>
        blocksNavigationClickDestination(entity, position, leaderId),
      ),
  );
}

function isReservedNavigationPosition(
  state: GameState,
  position: Position,
  leaderId: string,
): boolean {
  const positionKey = getNavigationPositionKey(position);

  return Object.entries(state.reservedPositionsByEntityId ?? {}).some(
    ([entityId, reservedPosition]) =>
      entityId !== leaderId &&
      getNavigationPositionKey(reservedPosition) === positionKey,
  );
}

function blocksNavigationClickDestination(
  entity: GameEntity,
  position: Position,
  leaderId: string,
): boolean {
  if (entity.id === leaderId) {
    return false;
  }

  if (entity.kind === "resource") {
    return (
      !entity.isDepleted &&
      entity.quantity > 0 &&
      getEuclideanDistance(entity.position, position) < RESOURCE_COLLISION_DISTANCE
    );
  }

  return (
    entity.state !== "dead" &&
    getEuclideanDistance(entity.position, position) <
      Math.max(POSITION_EPSILON, ENTITY_COLLISION_DISTANCE)
  );
}
