import { isAutonomousEntity } from "./entities";
import { protectLeader } from "./partyProtectionSystem";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { Enemy, GameEntity, Player } from "./types";

const ENEMY_DETECTION_RANGE = 5;

export function updateEnemyAISystem(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isEnemy(entity) || entity.state === "dead") {
      continue;
    }

    const currentTarget = entity.currentTargetId
      ? getEntityById(nextState, entity.currentTargetId)
      : undefined;

    if (currentTarget && isValidEnemyTarget(currentTarget)) {
      if (entity.state === "attack") {
        if (isPlayer(currentTarget)) {
          nextState = protectLeader(nextState, currentTarget, entity);
        }

        continue;
      }

      const updatedEnemy: Enemy = {
        ...entity,
        state: "attack",
      };

      nextState = updateEntity(nextState, updatedEnemy);
      if (isPlayer(currentTarget)) {
        nextState = protectLeader(nextState, currentTarget, updatedEnemy);
      }
      continue;
    }

    if (entity.currentTargetId) {
      nextState = updateEntity(nextState, clearEnemyTarget(entity));
      continue;
    }

    if (entity.aggressionMode === "passive") {
      continue;
    }

    const target = findClosestTarget(entity, Object.values(nextState.entities));

    if (!target) {
      continue;
    }

    const updatedEnemy: Enemy = {
      ...entity,
      state: "attack",
      currentTargetId: target.id,
    };

    nextState = updateEntity(nextState, updatedEnemy);
    if (isPlayer(target)) {
      nextState = protectLeader(nextState, target, updatedEnemy);
    }
  }

  return nextState;
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
      distance < closestDistance
    ) {
      closestTarget = entity;
      closestDistance = distance;
    }
  }

  return closestTarget;
}

function isValidEnemyTarget(entity: GameEntity): boolean {
  return isAutonomousEntity(entity) && entity.state !== "dead";
}

function getDistanceSquared(a: GameEntity, b: GameEntity): number {
  const xDistance = b.position.x - a.position.x;
  const yDistance = b.position.y - a.position.y;

  return xDistance * xDistance + yDistance * yDistance;
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return entity.kind === "enemy";
}

function isPlayer(entity: GameEntity): entity is Player {
  return entity.kind === "player";
}
