import {
  damageEntity,
  isAutonomousEntity,
  isCombatEntity,
  moveEntityToward,
  setLastAttackAt,
} from "./entities";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { CombatEntity, Enemy, GameEntity } from "./types";

const ATTACK_RANGE = 1;
const ATTACK_DAMAGE = 1;
const ATTACK_COOLDOWN_MS = 1000;

export function updateAttackSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
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

    if (!isCombatEntity(target) || target.state === "dead") {
      continue;
    }

    if (isInAttackRange(attacker, target)) {
      if (!canAttack(attacker, now)) {
        continue;
      }

      nextState = updateEntity(
        nextState,
        updateTargetAfterDamage(target, attacker),
      );
      nextState = updateEntity(nextState, setLastAttackAt(attacker, now));
      continue;
    }

    if (movedEntityIds.has(attacker.id)) {
      continue;
    }

    nextState = updateEntity(nextState, moveEntityToward(attacker, target));
    movedEntityIds.add(attacker.id);
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

function canAttack(entity: CombatEntity, now: number): boolean {
  return now - entity.lastAttackAt >= ATTACK_COOLDOWN_MS;
}

function updateTargetAfterDamage(
  target: CombatEntity,
  attacker: CombatEntity,
): CombatEntity {
  const damagedTarget = damageEntity(target, ATTACK_DAMAGE);

  if (
    !isEnemy(damagedTarget) ||
    damagedTarget.state === "dead" ||
    !isAutonomousEntity(attacker)
  ) {
    return damagedTarget;
  }

  const enemy: Enemy = {
    ...damagedTarget,
    state: "attack",
    currentTargetId: attacker.id,
  };

  return enemy;
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return entity.kind === "enemy";
}
