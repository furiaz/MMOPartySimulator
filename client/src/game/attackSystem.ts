import {
  damageEntity,
  isAutonomousEntity,
  isCombatEntity,
  setLastAttackAt,
} from "./entities";
import {
  getEntityById,
  moveEntityTowardIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import { protectLeader } from "./partyProtectionSystem";
import type {
  AutonomousEntity,
  CombatEntity,
  Enemy,
  GameEntity,
  Player,
} from "./types";

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
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    const target = getEntityById(nextState, attacker.currentTargetId);

    if (!target) {
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    if (!isCombatEntity(target) || target.state === "dead") {
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    if (isInAttackRange(attacker, target)) {
      if (!canAttack(attacker, now)) {
        continue;
      }

      const updatedTarget = updateTargetAfterDamage(target, attacker);
      const updatedAttacker = setLastAttackAt(attacker, now);

      nextState = updateEntity(
        nextState,
        updatedTarget,
      );
      if (isEnemy(attacker) && isPlayer(updatedTarget)) {
        nextState = protectLeader(nextState, updatedTarget, attacker);
      }
      nextState = updateEntity(
        nextState,
        updatedTarget.state === "dead"
          ? finishAttack(nextState, updatedAttacker)
          : updatedAttacker,
      );
      continue;
    }

    if (movedEntityIds.has(attacker.id)) {
      continue;
    }

    nextState = moveEntityTowardIfUnoccupied(nextState, attacker, target);
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

function isPlayer(entity: GameEntity): entity is Player {
  return entity.kind === "player";
}

function finishAttack(state: GameState, attacker: CombatEntity): CombatEntity {
  if (!isAutonomousEntity(attacker)) {
    return {
      ...attacker,
      state: "idle",
      currentTargetId: null,
    };
  }

  const sharedTarget = findPartyCombatTarget(state, attacker.id);

  if (sharedTarget) {
    return {
      ...attacker,
      state: "attack",
      currentTargetId: sharedTarget.id,
    };
  }

  return switchToFollow(attacker);
}

function findPartyCombatTarget(
  state: GameState,
  attackerId: string,
): CombatEntity | undefined {
  for (const entity of Object.values(state.entities)) {
    if (
      entity.id === attackerId ||
      !isAutonomousEntity(entity) ||
      entity.state !== "attack" ||
      !entity.currentTargetId
    ) {
      continue;
    }

    const target = getEntityById(state, entity.currentTargetId);

    if (isCombatEntity(target) && target.state !== "dead") {
      return target;
    }
  }

  return undefined;
}

function switchToFollow(entity: AutonomousEntity): AutonomousEntity {
  return {
    ...entity,
    state: "follow",
    currentTargetId: entity.kind === "companion" ? entity.followTargetId : null,
    commandPriority: "autonomous",
  };
}
