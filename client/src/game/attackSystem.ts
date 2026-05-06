import {
  damageEntity,
  isAutonomousEntity,
  isCombatEntity,
  setLastAttackAt,
} from "./entities";
import { getPartyMembers, isPartyMember } from "./partySystem";
import {
  addCombatFeedback,
  getEntityById,
  moveEntityTowardIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import { protectPartyMember } from "./partyProtectionSystem";
import { getRolePriority } from "./roleProfiles";
import type {
  CombatEntity,
  Enemy,
  GameEntity,
  Player,
  Companion,
} from "./types";

const ATTACK_RANGE = 1;
const ATTACK_DAMAGE = 1;
const ATTACK_COOLDOWN_MS = 1000;
const TARGET_SWITCH_DISTANCE = 6;

export function updateAttackSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const now = Date.now();

  for (const entity of getCombatMovementOrder(state)) {
    const attacker = getEntityById(nextState, entity.id);

    if (!attacker || !isAttackingCombatEntity(attacker)) {
      continue;
    }

    const target = getValidTarget(nextState, attacker);

    if (!target) {
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    if (target.id !== attacker.currentTargetId) {
      nextState = updateEntity(nextState, {
        ...attacker,
        currentTargetId: target.id,
      });
    }

    const currentAttacker = getEntityById(nextState, attacker.id);

    if (!currentAttacker || !isAttackingCombatEntity(currentAttacker)) {
      continue;
    }

    if (isInAttackRange(currentAttacker, target)) {
      if (!canAttack(currentAttacker, now)) {
        continue;
      }

      const updatedTarget = updateTargetAfterDamage(target, currentAttacker);
      const updatedAttacker = setLastAttackAt(currentAttacker, now);

      nextState = addAttackFeedback(nextState, currentAttacker, updatedTarget, now);
      nextState = updateEntity(nextState, updatedTarget);

      if (isEnemy(currentAttacker) && isPartyCombatEntity(updatedTarget)) {
        nextState = protectPartyMember(nextState, updatedTarget, currentAttacker);
      }

      nextState = updateEntity(
        nextState,
        updatedTarget.state === "dead"
          ? finishAttack(nextState, updatedAttacker)
          : updatedAttacker,
      );
      continue;
    }

    if (movedEntityIds.has(currentAttacker.id)) {
      continue;
    }

    const previousPosition = currentAttacker.position;

    nextState = moveEntityTowardIfUnoccupied(nextState, currentAttacker, target, {
      allowPartyPassThrough: true,
    });

    const movedAttacker = getEntityById(nextState, currentAttacker.id);

    if (
      movedAttacker &&
      !isSamePosition(previousPosition, movedAttacker.position)
    ) {
      movedEntityIds.add(currentAttacker.id);
    }
  }

  return nextState;
}

function getValidTarget(
  state: GameState,
  attacker: CombatEntity,
): CombatEntity | undefined {
  const currentTarget = attacker.currentTargetId
    ? getEntityById(state, attacker.currentTargetId)
    : undefined;

  if (isLiveCombatTarget(currentTarget)) {
    return currentTarget;
  }

  if (!isAutonomousEntity(attacker) || !isPartyMember(attacker)) {
    return undefined;
  }

  return findPartyAssistTarget(state, attacker);
}

function findPartyAssistTarget(
  state: GameState,
  attacker: Player | Companion,
): CombatEntity | undefined {
  for (const member of getPartyMembers(state)) {
    if (
      member.id === attacker.id ||
      member.state !== "attack" ||
      !member.currentTargetId
    ) {
      continue;
    }

    const target = getEntityById(state, member.currentTargetId);

    if (
      isLiveCombatTarget(target) &&
      getDistance(attacker.position, target.position) <= TARGET_SWITCH_DISTANCE
    ) {
      return target;
    }
  }

  return undefined;
}

function getCombatMovementOrder(state: GameState): GameEntity[] {
  return [...Object.values(state.entities)].sort(
    (a, b) => getCombatOrderPriority(a) - getCombatOrderPriority(b),
  );
}

function getCombatOrderPriority(entity: GameEntity): number {
  if (entity.kind === "player" || entity.kind === "companion") {
    return getRolePriority(entity.role);
  }

  return 5;
}

function addAttackFeedback(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  now: number,
): GameState {
  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: attacker.id,
    text: "Attack",
    now,
  });

  nextState = addCombatFeedback(nextState, {
    type: "damage",
    entityId: target.id,
    text: `-${ATTACK_DAMAGE} HP`,
    now,
  });

  if (target.state === "dead") {
    nextState = addCombatFeedback(nextState, {
      type: "death",
      entityId: target.id,
      text: "Defeated",
      now,
    });
  }

  return nextState;
}

function isAttackingCombatEntity(entity: GameEntity): entity is CombatEntity {
  return isCombatEntity(entity) && entity.state === "attack";
}

function isLiveCombatTarget(
  entity: GameEntity | undefined,
): entity is CombatEntity {
  return isCombatEntity(entity) && entity.state !== "dead" && entity.health > 0;
}

function isInAttackRange(attacker: GameEntity, target: GameEntity): boolean {
  return getDistance(attacker.position, target.position) <= ATTACK_RANGE;
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

  return {
    ...damagedTarget,
    state: "attack",
    currentTargetId: attacker.id,
  };
}

function finishAttack(state: GameState, attacker: CombatEntity): CombatEntity {
  if (!isAutonomousEntity(attacker) || !isPartyMember(attacker)) {
    return {
      ...attacker,
      state: "idle",
      currentTargetId: null,
    };
  }

  const sharedTarget = findPartyAssistTarget(state, attacker);

  if (sharedTarget) {
    return {
      ...attacker,
      state: "attack",
      currentTargetId: sharedTarget.id,
      commandPriority: "autonomous",
    };
  }

  return {
    ...attacker,
    state: "follow",
    currentTargetId: attacker.id === state.partyLeaderId ? null : state.partyLeaderId,
    commandPriority: "autonomous",
  };
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return entity.kind === "enemy";
}

function isPartyCombatEntity(entity: CombatEntity): entity is Player | Companion {
  return entity.kind === "player" || entity.kind === "companion";
}

function getDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function isSamePosition(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return a.x === b.x && a.y === b.y;
}
