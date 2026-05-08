import {
  damageEntity,
  isAutonomousEntity,
  isCombatEntity,
  moveEntityTo,
  MOVEMENT_STEP_DISTANCE,
  setLastAttackAt,
} from "./entities";
import { chooseAttackSlot } from "./attackSlots";
import { getPartyMembers, isPartyMember } from "./partySystem";
import {
  addCombatFeedback,
  getEntityById,
  isWalkablePosition,
  moveEntityTowardPositionIfUnoccupied,
  reservePositionForTick,
  updateEntity,
  type GameState,
} from "./state";
import { protectPartyMember } from "./partyProtectionSystem";
import { getRolePriority } from "./roleProfiles";
import {
  blockIncomingAttackIfShielded,
  getPrototypeAttackDamage,
  isEnemyBound,
} from "./skillRuntime";
import { getEnemyHomeLeashDistance } from "./enemyAISystem";
import type {
  CombatEntity,
  Enemy,
  GameEntity,
  Companion,
  Position,
} from "./types";

const ATTACK_RANGE = 1;
const ATTACK_DAMAGE = 1;
const ATTACK_COOLDOWN_MS = 1000;
const TARGET_SWITCH_DISTANCE = 6;
const MAX_ATTACK_SLOT_PATH_DISTANCE = 6;
const FINAL_STEP_ATTACK_DISTANCE = MOVEMENT_STEP_DISTANCE * 0.5;

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

    if (
      isEnemy(currentAttacker) &&
      !canEnemyChaseTarget(currentAttacker, target) &&
      !isInAttackRange(currentAttacker, target)
    ) {
      nextState = updateEntity(nextState, finishAttack(nextState, currentAttacker));
      continue;
    }

    if (
      isEnemy(currentAttacker) &&
      isEnemyBound(nextState, currentAttacker) &&
      !isInAttackRange(currentAttacker, target)
    ) {
      continue;
    }

    const finalStepPosition = getFinalStepAttackPosition(nextState, currentAttacker, target);
    const attackReadyAttacker = finalStepPosition
      ? moveEntityTo(currentAttacker, finalStepPosition)
      : currentAttacker;

    if (finalStepPosition) {
      nextState = reservePositionForTick(nextState, currentAttacker.id, finalStepPosition);
      nextState = updateEntity(nextState, attackReadyAttacker);
      movedEntityIds.add(currentAttacker.id);
    }

    if (isInAttackRange(attackReadyAttacker, target)) {
      if (!canAttack(currentAttacker, now)) {
        continue;
      }

      const attackDamage = getPrototypeAttackDamage(
        nextState,
        attackReadyAttacker,
        target,
        ATTACK_DAMAGE,
      );
      const shieldResult =
        isEnemy(attackReadyAttacker) && isPartyCombatEntity(target)
          ? blockIncomingAttackIfShielded(nextState, attackReadyAttacker, target, now)
          : { state: nextState, blocked: false };

      nextState = shieldResult.state;

      if (shieldResult.blocked) {
        nextState = updateEntity(
          nextState,
          setLastAttackAt(attackReadyAttacker, now),
        );
        continue;
      }

      const updatedTarget = updateTargetAfterDamage(
        target,
        attackReadyAttacker,
        attackDamage,
      );
      const updatedAttacker = setLastAttackAt(attackReadyAttacker, now);

      nextState = addAttackFeedback(
        nextState,
        attackReadyAttacker,
        updatedTarget,
        attackDamage,
        now,
      );
      nextState = updateEntity(nextState, updatedTarget);

      if (isEnemy(attackReadyAttacker) && isPartyCombatEntity(updatedTarget)) {
        nextState = protectPartyMember(nextState, updatedTarget, attackReadyAttacker);
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

    const attackSlot = chooseAttackSlot(
      nextState,
      currentAttacker,
      target.position,
      ATTACK_RANGE,
      {
        allowPartyPassThrough: true,
        maxPathDistance: MAX_ATTACK_SLOT_PATH_DISTANCE,
        preferredSlotIndex: getAttackSlotPreference(currentAttacker),
      },
    );

    const movementTarget = attackSlot ?? target.position;
    const previousPosition = currentAttacker.position;

    if (attackSlot) {
      nextState = setCombatSlot(nextState, currentAttacker.id, attackSlot);
      nextState = reservePositionForTick(nextState, currentAttacker.id, attackSlot, {
        allowPartyPassThrough: true,
      });
    }

    nextState = moveEntityTowardPositionIfUnoccupied(nextState, currentAttacker, movementTarget, {
      allowPartyPassThrough: true,
    });

    const movedAttacker = getEntityById(nextState, currentAttacker.id);

    if (
      movedAttacker &&
      isEnemy(currentAttacker) &&
      getEuclideanDistance(currentAttacker.homePosition, movedAttacker.position) >
        getEnemyHomeLeashDistance()
    ) {
      nextState = updateEntity(
        nextState,
        moveEntityTo(movedAttacker, previousPosition),
      );
      continue;
    }

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
  attacker: Companion,
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
  if (entity.kind === "companion") {
    return getRolePriority(entity.role);
  }

  return 5;
}

function addAttackFeedback(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  damage: number,
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
    text: `-${damage} HP`,
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
  damage: number,
): CombatEntity {
  const damagedTarget = damageEntity(target, damage);

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

function isPartyCombatEntity(entity: CombatEntity): entity is Companion {
  return entity.kind === "companion";
}

function getFinalStepAttackPosition(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): Position | null {
  if (isInAttackRange(attacker, target)) {
    return null;
  }

  const euclideanDistance = getEuclideanDistance(attacker.position, target.position);
  const gap = euclideanDistance - ATTACK_RANGE;

  if (gap <= 0 || gap > FINAL_STEP_ATTACK_DISTANCE) {
    return null;
  }

  const direction = {
    x: attacker.position.x - target.position.x,
    y: attacker.position.y - target.position.y,
  };
  const directionLength = Math.hypot(direction.x, direction.y);

  if (directionLength === 0) {
    return null;
  }

  const finalPosition = {
    x: target.position.x + (direction.x / directionLength) * ATTACK_RANGE,
    y: target.position.y + (direction.y / directionLength) * ATTACK_RANGE,
  };

  if (
    getEuclideanDistance(attacker.position, finalPosition) >
      FINAL_STEP_ATTACK_DISTANCE ||
    !isWalkablePosition(state, finalPosition, attacker.id)
  ) {
    return null;
  }

  return finalPosition;
}

function setCombatSlot(
  state: GameState,
  entityId: string,
  attackSlot: Position,
): GameState {
  if (!state.partyFormation || state.partyFormation.phase === "idle") {
    return state;
  }

  return {
    ...state,
    partyFormation: {
      ...state.partyFormation,
      slotsByEntityId: {
        ...state.partyFormation.slotsByEntityId,
        [entityId]: attackSlot,
      },
      slotReasonsByEntityId: {
        ...state.partyFormation.slotReasonsByEntityId,
        [entityId]: "combat attack slot",
      },
    },
  };
}

function getAttackSlotPreference(attacker: CombatEntity): number {
  if (attacker.kind === "companion") {
    return attacker.partyOrder;
  }

  return hashId(attacker.id);
}

function hashId(id: string): number {
  return [...id].reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

function getDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getEuclideanDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function canEnemyChaseTarget(enemy: Enemy, target: CombatEntity): boolean {
  return (
    getEuclideanDistance(enemy.homePosition, target.position) <=
    getEnemyHomeLeashDistance()
  );
}

function isSamePosition(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return a.x === b.x && a.y === b.y;
}
