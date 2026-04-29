import { isCombatEntity, isResourceEntity } from "./entities";
import {
  isActiveResourcePosition,
  isWallPosition,
  type GameState,
} from "./state";
import type { Enemy, GameEntity, Position, ResourceEntity } from "./types";

type EnemyTargetOptions = {
  maxDistance?: number;
  includeEngagedOutsideRange?: boolean;
};

type ResourceTargetOptions = {
  maxDistance: number;
};

export function findEnemyTarget(
  state: GameState,
  seeker: GameEntity,
  options: EnemyTargetOptions = {},
): Enemy | undefined {
  const enemies = Object.values(state.entities).filter(isValidEnemyTarget);
  const reachableEnemies = enemies.filter((enemy) =>
    isEnemyInRange(state, seeker.position, enemy.position, options.maxDistance),
  );
  const engagedEnemies = enemies.filter(
    (enemy) =>
      isEnemyEngagedWithParty(state, enemy) &&
      (options.includeEngagedOutsideRange ||
        reachableEnemies.some((reachableEnemy) => reachableEnemy.id === enemy.id)),
  );

  return (
    findNearestEnemy(seeker, engagedEnemies) ??
    findNearestEnemy(seeker, reachableEnemies)
  );
}

export function findResourceTarget(
  state: GameState,
  seeker: GameEntity,
  searchOrigin: Position,
  options: ResourceTargetOptions,
): ResourceEntity | undefined {
  const resources = Object.values(state.entities).filter(
    (entity): entity is ResourceEntity =>
      isValidResourceTarget(entity) &&
      isPositionReachableWithin(
        state,
        searchOrigin,
        entity.position,
        options.maxDistance,
        entity.id,
      ),
  );

  return findNearestEntity(seeker, resources);
}

export function isResourceTargetInRange(
  state: GameState,
  resource: ResourceEntity,
  searchOrigin: Position,
  options: ResourceTargetOptions,
): boolean {
  return (
    isValidResourceTarget(resource) &&
    isPositionReachableWithin(
      state,
      searchOrigin,
      resource.position,
      options.maxDistance,
      resource.id,
    )
  );
}

function isValidEnemyTarget(entity: GameEntity): entity is Enemy {
  return (
    entity.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function isValidResourceTarget(entity: GameEntity): entity is ResourceEntity {
  return isResourceEntity(entity) && !entity.isDepleted && entity.quantity > 0;
}

function isEnemyEngagedWithParty(state: GameState, enemy: Enemy): boolean {
  return Object.values(state.entities).some((entity) => {
    if (
      entity.state === "dead" ||
      (entity.kind !== "player" && entity.kind !== "companion")
    ) {
      return false;
    }

    return (
      (entity.state === "attack" && entity.currentTargetId === enemy.id) ||
      enemy.currentTargetId === entity.id
    );
  });
}

function isEnemyInRange(
  state: GameState,
  start: Position,
  target: Position,
  maxDistance: number | undefined,
): boolean {
  const searchLimit =
    maxDistance ??
    (state.map
      ? state.map.columns * state.map.rows
      : Number.POSITIVE_INFINITY);

  return isPositionReachableWithin(
    state,
    start,
    target,
    searchLimit,
  );
}

function findNearestEnemy(
  seeker: GameEntity,
  enemies: Enemy[],
): Enemy | undefined {
  return findNearestEntity(seeker, enemies);
}

function findNearestEntity<T extends GameEntity>(
  seeker: GameEntity,
  candidates: T[],
): T | undefined {
  return candidates.reduce<T | undefined>((nearestEntity, candidate) => {
    if (!nearestEntity) {
      return candidate;
    }

    return getPositionDistance(seeker.position, candidate.position) <
      getPositionDistance(seeker.position, nearestEntity.position)
      ? candidate
      : nearestEntity;
  }, undefined);
}

function isPositionReachableWithin(
  state: GameState,
  start: Position,
  target: Position,
  maxDistance: number,
  ignoredResourceId?: string,
): boolean {
  if (!state.map) {
    return getPositionDistance(start, target) <= maxDistance;
  }

  return (
    getReachableDistance(
      state,
      start,
      target,
      maxDistance,
      ignoredResourceId,
    ) !== null
  );
}

function getReachableDistance(
  state: GameState,
  start: Position,
  target: Position,
  maxDistance: number,
  ignoredResourceId?: string,
): number | null {
  const targetKey = getPositionKey(target);
  const visited = new Set<string>([getPositionKey(start)]);
  const queue: { position: Position; distance: number }[] = [
    { position: start, distance: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (getPositionKey(current.position) === targetKey) {
      return current.distance;
    }

    if (current.distance >= maxDistance) {
      continue;
    }

    for (const neighbor of getNeighborPositions(current.position)) {
      const key = getPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isInMapBounds(state, neighbor) ||
        isWallPosition(state, neighbor) ||
        isActiveResourcePosition(state, neighbor, ignoredResourceId)
      ) {
        continue;
      }

      visited.add(key);
      queue.push({
        position: neighbor,
        distance: current.distance + 1,
      });
    }
  }

  return null;
}

function getNeighborPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function isInMapBounds(state: GameState, position: Position): boolean {
  return Boolean(
    state.map &&
      position.x >= 0 &&
      position.x < state.map.columns &&
      position.y >= 0 &&
      position.y < state.map.rows,
  );
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function getPositionDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
