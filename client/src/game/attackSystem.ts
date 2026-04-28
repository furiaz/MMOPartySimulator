import {
  damageEntity,
  isCombatEntity,
  moveEntityToward,
  setLastAttackAt,
} from "./entities";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { CombatEntity, GameEntity } from "./types";

const ATTACK_RANGE = 1;
const ATTACK_DAMAGE = 1;
const ATTACK_COOLDOWN_MS = 1000;

export function updateAttackSystem(state: GameState): GameState {
  let nextState = state;
  const now = Date.now();

  for (const entity of Object.values(state.entities)) {
    const attacker = getEntityById(nextState, entity.id);

    if (!attacker || !isAttackingCombatEntity(attacker)) {
      continue;
    }

    if (!attacker.currentTargetId) {
      continue;
    }

    const target = getEntityById(nextState, attacker.currentTargetId);

    if (!target) {
      continue;
    }

    if (target.state === "dead") {
      continue;
    }

    if (isInAttackRange(attacker, target)) {
      if (!canAttack(attacker, now)) {
        continue;
      }

      nextState = updateEntity(nextState, damageEntity(target, ATTACK_DAMAGE));
      nextState = updateEntity(nextState, setLastAttackAt(attacker, now));
      continue;
    }

    nextState = updateEntity(nextState, moveEntityToward(attacker, target));
  }

  return nextState;
}

function isAttackingCombatEntity(entity: GameEntity): entity is CombatEntity {
  return isCombatEntity(entity) && entity.state === "attack";
}

function isInAttackRange(attacker: GameEntity, target: GameEntity): boolean {
  const xDistance = Math.abs(target.position.x - attacker.position.x);
  const yDistance = Math.abs(target.position.y - attacker.position.y);

  return xDistance <= ATTACK_RANGE && yDistance <= ATTACK_RANGE;
}

function canAttack(entity: GameEntity, now: number): boolean {
  return now - entity.lastAttackAt >= ATTACK_COOLDOWN_MS;
}
