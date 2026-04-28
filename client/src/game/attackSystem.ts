import { damageEntity, isAutonomousEntity, moveEntityToward } from "./entities";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { AutonomousEntity, GameEntity } from "./types";

const ATTACK_RANGE = 1;
const ATTACK_DAMAGE = 1;

export function updateAttackSystem(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isAttackingAutonomousEntity(entity)) {
      continue;
    }

    if (!entity.currentTargetId) {
      continue;
    }

    const target = getEntityById(nextState, entity.currentTargetId);

    if (!target) {
      continue;
    }

    if (target.state === "dead") {
      continue;
    }

    if (isInAttackRange(entity, target)) {
      nextState = updateEntity(nextState, damageEntity(target, ATTACK_DAMAGE));
      continue;
    }

    nextState = updateEntity(nextState, moveEntityToward(entity, target));
  }

  return nextState;
}

function isAttackingAutonomousEntity(
  entity: GameEntity,
): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "attack";
}

function isInAttackRange(attacker: GameEntity, target: GameEntity): boolean {
  const xDistance = Math.abs(target.position.x - attacker.position.x);
  const yDistance = Math.abs(target.position.y - attacker.position.y);

  return xDistance <= ATTACK_RANGE && yDistance <= ATTACK_RANGE;
}
