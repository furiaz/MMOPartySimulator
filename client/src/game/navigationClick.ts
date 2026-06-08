import {
  getNavigationNeighborPositions,
  getNavigationPositionKey,
  isNavigationCellWalkable,
  toNavigationNode,
} from "./navigation";
import { getPartyLeader } from "./partySystem";
import {
  ENTITY_COLLISION_DISTANCE,
  getBoundedNavigationDistance,
} from "./movementPlanning";
import type { GameState } from "./state";
import type { GameEntity, GameMap, Position } from "./types";
import { getEuclideanDistance, getManhattanDistance } from "./positionUtils";

const RESOURCE_COLLISION_DISTANCE = 0.7;
const POSITION_EPSILON = 0.001;
const DEFAULT_CLICK_FALLBACK_RADIUS = 3;

export type NavigationClickAccessibility = {
  columns: number;
  rows: number;
  reachableCellKeys: Set<string>;
};

export type NavigationClickResolveOptions = {
  fallbackRadius?: number;
};

export function buildNavigationClickAccessibility(
  state: GameState,
): NavigationClickAccessibility | null {
  const map = state.map;
  const leader = getPartyLeader(state);

  if (!map || !leader) {
    return null;
  }

  const start = toNavigationNode(leader.position);

  if (!isNavigationCellWalkable(map, start)) {
    return {
      columns: map.columns,
      rows: map.rows,
      reachableCellKeys: new Set(),
    };
  }

  const reachableCellKeys = new Set<string>();
  const startKey = getNavigationPositionKey(start);
  const queue: Position[] = [start];
  let queueIndex = 0;
  reachableCellKeys.add(startKey);

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (!current) {
      continue;
    }

    for (const neighbor of getNavigationNeighborPositions(current)) {
      const neighborKey = getNavigationPositionKey(neighbor);

      if (
        reachableCellKeys.has(neighborKey) ||
        !isNavigationCellWalkable(map, neighbor)
      ) {
        continue;
      }

      reachableCellKeys.add(neighborKey);
      queue.push(neighbor);
    }
  }

  return {
    columns: map.columns,
    rows: map.rows,
    reachableCellKeys,
  };
}

export function isNavigationClickAccessible(
  accessibility: NavigationClickAccessibility | null | undefined,
  position: Position,
): boolean {
  if (!accessibility) {
    return false;
  }

  const node = toNavigationNode(position);

  return (
    node.x >= 0 &&
    node.x < accessibility.columns &&
    node.y >= 0 &&
    node.y < accessibility.rows &&
    accessibility.reachableCellKeys.has(getNavigationPositionKey(node))
  );
}

export function resolveNavigationClickTarget(
  state: GameState,
  clickedPosition: Position,
  accessibility = buildNavigationClickAccessibility(state),
  options: NavigationClickResolveOptions = {},
): Position | null {
  const map = state.map;
  const leader = getPartyLeader(state);

  if (!map || !leader || !accessibility) {
    return null;
  }

  const maxDistance = map.columns * map.rows * 2;
  const candidates = getMapPositionsByDistance(
    map,
    clickedPosition,
    options.fallbackRadius ?? DEFAULT_CLICK_FALLBACK_RADIUS,
  );

  for (const candidate of candidates) {
    if (!isNavigationClickAccessible(accessibility, candidate)) {
      continue;
    }

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

export function resolveNpcInteractionApproachTarget(
  state: GameState,
  npcPosition: Position,
  interactionRange: number,
): Position | null {
  const map = state.map;
  const leader = getPartyLeader(state);

  if (!map || !leader || interactionRange <= 0) {
    return null;
  }

  const maxDistance = map.columns * map.rows * 2;
  const candidates = getMapPositionsByDistance(map, npcPosition);

  for (const candidate of candidates) {
    if (getEuclideanDistance(candidate, npcPosition) > interactionRange) {
      continue;
    }

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

function getMapPositionsByDistance(
  map: GameMap,
  origin: Position,
  maxRadius = Number.POSITIVE_INFINITY,
): Position[] {
  const originNode = toNavigationNode(origin);
  const positions: Position[] = [];
  const minX = Math.max(0, originNode.x - maxRadius);
  const maxX = Math.min(map.columns - 1, originNode.x + maxRadius);
  const minY = Math.max(0, originNode.y - maxRadius);
  const maxY = Math.min(map.rows - 1, originNode.y + maxRadius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const position = { x, y };

      if (getManhattanDistance(originNode, position) <= maxRadius) {
        positions.push(position);
      }
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
