import { isCombatEntity } from "./entities";
import { isActiveResource, isTargetDummyEnemy } from "./entityGuards";
import { getBoundedNavigationDistance } from "./movementPlanning";
import type { GameState } from "./state";
import { getEuclideanDistance } from "./positionUtils";
import type { Enemy, GameEntity, Position, ResourceEntity } from "./types";

type EnemyTargetOptions = {
  maxDistance?: number;
  includeEngagedOutsideRange?: boolean;
};

type ResourceTargetOptions = {
  maxDistance: number;
  isCandidatePositionAllowed?: (position: Position) => boolean;
};

export function findEnemyTarget(
  state: GameState,
  seeker: GameEntity,
  options: EnemyTargetOptions = {},
): Enemy | undefined {
  const enemies = Object.values(state.entities).filter(isValidEnemyTarget);
  const reachableEnemies = enemies.filter((enemy) =>
    isEnemyInRange(state, seeker.position, enemy, options.maxDistance),
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
      isResourcePositionAllowed(entity.position, options) &&
      getEuclideanDistance(searchOrigin, entity.position) <= options.maxDistance &&
      isPositionReachableWithin(
        state,
        searchOrigin,
        entity.position,
        getReachabilitySearchLimit(state),
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
    isResourcePositionAllowed(resource.position, options) &&
    isPositionReachableWithin(
      state,
      searchOrigin,
      resource.position,
      options.maxDistance,
      resource.id,
    )
  );
}

function isResourcePositionAllowed(
  position: Position,
  options: ResourceTargetOptions,
): boolean {
  return options.isCandidatePositionAllowed?.(position) ?? true;
}

function isValidEnemyTarget(entity: GameEntity): entity is Enemy {
  return (
    entity.kind === "enemy" &&
    !isTargetDummyEnemy(entity) &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function isValidResourceTarget(entity: GameEntity): entity is ResourceEntity {
  return isActiveResource(entity);
}

function isEnemyEngagedWithParty(state: GameState, enemy: Enemy): boolean {
  return Object.values(state.entities).some((entity) => {
    if (
      entity.state === "dead" ||
      entity.kind !== "companion"
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
  target: Enemy,
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
    target.position,
    searchLimit,
    target.id,
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

    return getEuclideanDistance(seeker.position, candidate.position) <
      getEuclideanDistance(seeker.position, nearestEntity.position)
      ? candidate
      : nearestEntity;
  }, undefined);
}

function isPositionReachableWithin(
  state: GameState,
  start: Position,
  target: Position,
  maxDistance: number,
  ignoredEntityId?: string,
): boolean {
  return (
    getBoundedNavigationDistance(
      state,
      start,
      target,
      maxDistance,
      ignoredEntityId,
    ) !== null
  );
}

function getReachabilitySearchLimit(state: GameState): number {
  return state.map
    ? state.map.columns * state.map.rows
    : Number.POSITIVE_INFINITY;
}
