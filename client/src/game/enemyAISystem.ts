import { isAutonomousEntity } from "./entities";
import { protectPartyMember } from "./partyProtectionSystem";
import {
  getEntityById,
  moveEntityTowardPositionIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import type { AutonomousEntity, Enemy, GameEntity, Position } from "./types";

const ENEMY_DETECTION_RANGE = 5;
const ENEMY_HOME_LEASH_DISTANCE = 2;
const ENEMY_WANDER_MIN_INTERVAL_TICKS = 7;
const ENEMY_WANDER_INTERVAL_VARIANCE_TICKS = 9;
const ENEMY_WANDER_RADIUS = 1.9;
const ENEMY_WANDER_MIN_DISTANCE = 0.8;
const ENEMY_WANDER_ATTEMPTS = 5;

export function updateEnemyAISystem(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isEnemy(entity) || entity.state === "dead") {
      continue;
    }

    if (getDistance(entity.position, entity.homePosition) > ENEMY_HOME_LEASH_DISTANCE) {
      nextState = moveEnemyTowardHome(nextState, entity);
      continue;
    }

    const currentTarget = entity.currentTargetId
      ? getEntityById(nextState, entity.currentTargetId)
      : undefined;

    if (
      currentTarget &&
      isValidEnemyTarget(currentTarget) &&
      isInsideHomeLeash(entity, currentTarget.position)
    ) {
      if (entity.state === "attack") {
        if (isAutonomousEntity(currentTarget)) {
          nextState = protectPartyMember(nextState, currentTarget, entity);
        }

        continue;
      }

      const updatedEnemy: Enemy = {
        ...entity,
        state: "attack",
      };

      nextState = updateEntity(nextState, updatedEnemy);
      if (isAutonomousEntity(currentTarget)) {
        nextState = protectPartyMember(nextState, currentTarget, updatedEnemy);
      }
      continue;
    }

    if (entity.currentTargetId) {
      nextState = updateEntity(nextState, clearEnemyTarget(entity));
      continue;
    }

    if (entity.aggressionMode === "passive") {
      nextState = updateEnemyWander(nextState, entity);
      continue;
    }

    const target = findClosestTarget(entity, Object.values(nextState.entities));

    if (!target) {
      nextState = updateEnemyWander(nextState, entity);
      continue;
    }

    const updatedEnemy: Enemy = {
      ...entity,
      state: "attack",
      currentTargetId: target.id,
    };

    nextState = updateEntity(nextState, updatedEnemy);
    if (isAutonomousEntity(target)) {
      nextState = protectPartyMember(nextState, target, updatedEnemy);
    }
  }

  return nextState;
}

export function getEnemyHomeLeashDistance(): number {
  return ENEMY_HOME_LEASH_DISTANCE;
}

function clearEnemyTarget(enemy: Enemy): Enemy {
  return {
    ...enemy,
    state: "idle",
    currentTargetId: null,
  };
}

function findClosestTarget(
  enemy: Enemy,
  entities: GameEntity[],
): GameEntity | undefined {
  let closestTarget: GameEntity | undefined;
  let closestDistance = Infinity;

  for (const entity of entities) {
    if (!isValidEnemyTarget(entity)) {
      continue;
    }

    const distance = getDistanceSquared(enemy, entity);

    if (
      distance <= ENEMY_DETECTION_RANGE * ENEMY_DETECTION_RANGE &&
      isInsideHomeLeash(enemy, entity.position) &&
      distance < closestDistance
    ) {
      closestTarget = entity;
      closestDistance = distance;
    }
  }

  return closestTarget;
}

function isValidEnemyTarget(entity: GameEntity): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state !== "dead";
}

function getDistanceSquared(a: GameEntity, b: GameEntity): number {
  const xDistance = b.position.x - a.position.x;
  const yDistance = b.position.y - a.position.y;

  return xDistance * xDistance + yDistance * yDistance;
}

function updateEnemyWander(state: GameState, enemy: Enemy): GameState {
  if (!shouldEnemyWanderThisTick(state.simulationTick, enemy)) {
    return state;
  }

  const wanderTarget = getRandomWanderTarget(enemy);

  return wanderTarget
    ? moveEntityTowardPositionIfUnoccupied(state, enemy, wanderTarget)
    : state;
}

function shouldEnemyWanderThisTick(tick: number, enemy: Enemy): boolean {
  const seed = getEnemyWanderSeed(enemy);
  const interval =
    ENEMY_WANDER_MIN_INTERVAL_TICKS +
    (seed % ENEMY_WANDER_INTERVAL_VARIANCE_TICKS);
  const phase = seed % interval;

  return (tick + phase) % interval === 0;
}

function moveEnemyTowardHome(state: GameState, enemy: Enemy): GameState {
  const clearedEnemy = clearEnemyTarget(enemy);
  const nextState =
    enemy.state === "idle" && !enemy.currentTargetId
      ? state
      : updateEntity(state, clearedEnemy);

  return moveEntityTowardPositionIfUnoccupied(nextState, clearedEnemy, enemy.homePosition);
}

function getRandomWanderTarget(enemy: Enemy): Position | null {
  for (let attempt = 0; attempt < ENEMY_WANDER_ATTEMPTS; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance =
      ENEMY_WANDER_MIN_DISTANCE +
      Math.random() * (ENEMY_WANDER_RADIUS - ENEMY_WANDER_MIN_DISTANCE);
    const position = {
      x: enemy.homePosition.x + Math.cos(angle) * distance,
      y: enemy.homePosition.y + Math.sin(angle) * distance,
    };

    if (isInsideHomeLeash(enemy, position)) {
      return position;
    }
  }

  return null;
}

function getEnemyWanderSeed(enemy: Enemy): number {
  return [...enemy.id].reduce(
    (seed, character) => seed + character.charCodeAt(0),
    0,
  );
}

function isInsideHomeLeash(enemy: Enemy, position: Position): boolean {
  return getDistance(enemy.homePosition, position) <= ENEMY_HOME_LEASH_DISTANCE;
}

function getDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return entity.kind === "enemy";
}
