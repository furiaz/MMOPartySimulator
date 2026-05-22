import {
  isAutonomousEntity,
  isCombatEntity,
  moveEntityTo,
  MOVEMENT_STEP_DISTANCE,
  setLastAttackAt,
} from "./entities";
import {
  chooseAttackSlot,
  rememberAttackSlot,
  type AttackSlotPathDistanceCache,
} from "./attackSlots";
import { getPartyMembers, isPartyMember } from "./partySystem";
import { grantCharacterXpToParty } from "./leveling";
import { recordEnemyDefeatedForQuests } from "./questSystem";
import {
  getEntityById,
  isWalkablePosition,
  moveEntityTowardPositionIfUnoccupied,
  reservePositionForFrame,
  updateEntity,
  type GameState,
} from "./state";
import { protectPartyMember } from "./partyProtectionSystem";
import { getRolePriority } from "./roleProfiles";
import { isEnemyBound } from "./skillRuntime";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import {
  getEnemyAttackLeashDistance,
  getEnemyChaseSpeedMultiplier,
} from "./enemyAISystem";
import { handleEnemyDefeatedDrops } from "./dropSystem";
import {
  cancelResurrectionChannelForHelper,
  isCompanionResurrectionChanneling,
} from "./resurrectionSystem";
import {
  arePositionsEqual,
  getEuclideanDistance,
  getGridDistance,
} from "./positionUtils";
import { isEnemyEntity, isTargetDummyEnemy } from "./entityGuards";
import { getEnemyAttackRange } from "./enemyArchetypes";
import {
  DEFAULT_COMPANION_ATTACK_RANGE,
  getCompanionAttackRange,
} from "./companionCombat";
import type {
  CombatEntity,
  Enemy,
  GameEntity,
  Companion,
  Position,
} from "./types";

export const ATTACK_COOLDOWN_MS = 1000;
export const ENEMY_ATTACK_WINDUP_MS = 500;
const TARGET_SWITCH_DISTANCE = 6;
const MAX_ATTACK_SLOT_PATH_DISTANCE = 6;
const FINAL_STEP_ATTACK_DISTANCE = MOVEMENT_STEP_DISTANCE * 0.5;

export function updateAttackSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
  now = Date.now(),
  pathDistanceCache?: AttackSlotPathDistanceCache,
): GameState {
  let nextState = state;

  for (const entity of getCombatMovementOrder(state)) {
    const attacker = getEntityById(nextState, entity.id);

    if (
      !attacker ||
      (attacker.kind === "companion" &&
        isCompanionResurrectionChanneling(nextState, attacker.id)) ||
      !isAttackingCombatEntity(attacker)
    ) {
      continue;
    }

    const target = getValidTarget(nextState, attacker);

    if (!target) {
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    if (target.id !== attacker.currentTargetId) {
      nextState = updateEntity(nextState, {
        ...clearAttackWindup(attacker),
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
      nextState = reservePositionForFrame(nextState, currentAttacker.id, finalStepPosition);
      nextState = updateEntity(nextState, attackReadyAttacker);
      movedEntityIds.add(currentAttacker.id);
    }

    if (isInAttackRange(attackReadyAttacker, target)) {
      if (!canAttack(currentAttacker, now)) {
        nextState = clearAttackWindupInState(nextState, attackReadyAttacker);
        continue;
      }

      const windupResult = updateEnemyAttackWindup(
        nextState,
        attackReadyAttacker,
        target,
        now,
      );
      nextState = windupResult.state;

      if (!windupResult.isComplete) {
        continue;
      }

      const windupReadyAttacker = windupResult.attacker;

      const combatResult = resolveAndApplyCombatDamage(
        nextState,
        windupReadyAttacker,
        target,
        {
          damageType: "physical",
          powerMultiplier: 1,
          allowEvasion: true,
          allowPassiveBlock: true,
          now,
          label: "Attack",
        },
      );
      nextState = combatResult.state;
      const updatedTarget = updateTargetAfterDamage(
        combatResult.target,
        windupReadyAttacker,
      );
      const updatedAttacker = clearAttackWindup(
        setLastAttackAt(windupReadyAttacker, now),
      );

      nextState = updateEntity(nextState, updatedTarget);

      if (
        isPartyCombatEntity(windupReadyAttacker) &&
        isEnemy(updatedTarget) &&
        updatedTarget.state === "dead"
      ) {
        nextState = grantCharacterXpToParty(
          nextState,
          updatedTarget,
          windupReadyAttacker.id,
        );
        nextState = recordEnemyDefeatedForQuests(
          nextState,
          updatedTarget,
          nextState.currentMapId,
        );
        nextState = handleEnemyDefeatedDrops(
          nextState,
          updatedTarget,
          windupReadyAttacker.id,
          now,
        );
      }

      if (isEnemy(windupReadyAttacker) && isPartyCombatEntity(updatedTarget)) {
        nextState = cancelResurrectionChannelForHelper(
          nextState,
          updatedTarget.id,
          now,
          "attacked",
        );
        nextState = protectPartyMember(nextState, updatedTarget, windupReadyAttacker);
      }

      const currentUpdatedAttacker = getEntityById(nextState, updatedAttacker.id);
      const finalUpdatedAttacker = isCombatEntity(currentUpdatedAttacker)
        ? clearAttackWindup(setLastAttackAt(currentUpdatedAttacker, now))
        : updatedAttacker;

      nextState = updateEntity(
        nextState,
        updatedTarget.state === "dead"
          ? finishAttack(nextState, finalUpdatedAttacker)
          : finalUpdatedAttacker,
      );
      continue;
    }

    nextState = clearAttackWindupInState(nextState, attackReadyAttacker);

    if (movedEntityIds.has(currentAttacker.id)) {
      continue;
    }

    const attackSlot = chooseAttackSlot(
      nextState,
      currentAttacker,
      target.position,
      getAttackRange(currentAttacker),
      {
        allowPartyPassThrough: true,
        maxPathDistance: MAX_ATTACK_SLOT_PATH_DISTANCE,
        nowMs: now,
        pathDistanceCache,
        preferredSlotIndex: getAttackSlotPreference(currentAttacker),
        targetId: target.id,
      },
    );

    const movementTarget = attackSlot ?? target.position;
    const previousPosition = currentAttacker.position;

    if (attackSlot) {
      nextState = rememberAttackSlot(
        nextState,
        currentAttacker,
        target.position,
        getAttackRange(currentAttacker),
        attackSlot,
        {
          allowPartyPassThrough: true,
          nowMs: now,
          targetId: target.id,
        },
      );
      nextState = setCombatSlot(nextState, currentAttacker.id, attackSlot);
      nextState = reservePositionForFrame(nextState, currentAttacker.id, attackSlot, {
        allowPartyPassThrough: true,
      });
    }

    nextState = moveEntityTowardPositionIfUnoccupied(nextState, currentAttacker, movementTarget, {
      allowPartyPassThrough: true,
      speedMultiplier: isEnemy(currentAttacker) ? getEnemyChaseSpeedMultiplier() : 1,
    });

    const movedAttacker = getEntityById(nextState, currentAttacker.id);

    if (
      movedAttacker &&
      isEnemy(currentAttacker) &&
      getEuclideanDistance(currentAttacker.homePosition, movedAttacker.position) >
        getEnemyAttackLeashDistance()
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

function updateEnemyAttackWindup(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  now: number,
): {
  state: GameState;
  attacker: CombatEntity;
  isComplete: boolean;
} {
  if (!isEnemy(attacker)) {
    return { state, attacker, isComplete: true };
  }

  const durationMs = attacker.attackWindupDurationMs ?? ENEMY_ATTACK_WINDUP_MS;
  const startedAt =
    attacker.attackWindupTargetId === target.id &&
    attacker.attackWindupStartedAt !== undefined
      ? attacker.attackWindupStartedAt
      : now;
  const updatedAttacker = {
    ...attacker,
    attackWindupStartedAt: startedAt,
    attackWindupDurationMs: durationMs,
    attackWindupTargetId: target.id,
  };
  const nextState = updateEntity(state, updatedAttacker);

  return {
    state: nextState,
    attacker: updatedAttacker,
    isComplete: now - startedAt >= durationMs,
  };
}

function clearAttackWindup<T extends CombatEntity>(entity: T): T {
  if (!isEnemy(entity)) {
    return entity;
  }

  return {
    ...entity,
    attackWindupStartedAt: undefined,
    attackWindupDurationMs: undefined,
    attackWindupTargetId: null,
  };
}

function clearAttackWindupInState(
  state: GameState,
  entity: CombatEntity,
): GameState {
  if (
    !isEnemy(entity) ||
    (entity.attackWindupStartedAt === undefined &&
      entity.attackWindupDurationMs === undefined &&
      entity.attackWindupTargetId == null)
  ) {
    return state;
  }

  return updateEntity(state, clearAttackWindup(entity));
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

function isAttackingCombatEntity(entity: GameEntity): entity is CombatEntity {
  return isCombatEntity(entity) && entity.state === "attack";
}

function isLiveCombatTarget(
  entity: GameEntity | undefined,
): entity is CombatEntity {
  return isCombatEntity(entity) && entity.state !== "dead" && entity.health > 0;
}

function isInAttackRange(attacker: GameEntity, target: GameEntity): boolean {
  return getDistance(attacker.position, target.position) <= getAttackRange(attacker);
}

function canAttack(entity: CombatEntity, now: number): boolean {
  return now - entity.lastAttackAt >= getAttackCooldownMs(entity);
}

export function getAttackCooldownMs(entity: CombatEntity): number {
  return entity.kind === "enemy"
    ? entity.attackCooldownMs ?? ATTACK_COOLDOWN_MS
    : ATTACK_COOLDOWN_MS;
}

function updateTargetAfterDamage(
  target: CombatEntity,
  attacker: CombatEntity,
): CombatEntity {
  if (
    !isEnemy(target) ||
    isTargetDummyEnemy(target) ||
    target.state === "dead" ||
    !isAutonomousEntity(attacker)
  ) {
    return target;
  }

  return {
    ...target,
    state: "attack",
    currentTargetId: attacker.id,
  };
}

function finishAttack(state: GameState, attacker: CombatEntity): CombatEntity {
  if (!isAutonomousEntity(attacker) || !isPartyMember(attacker)) {
    return {
      ...clearAttackWindup(attacker),
      state: "idle",
      currentTargetId: null,
    };
  }

  const sharedTarget = findPartyAssistTarget(state, attacker);

  if (sharedTarget) {
    return {
      ...clearAttackWindup(attacker),
      state: "attack",
      currentTargetId: sharedTarget.id,
      commandPriority: "autonomous",
    };
  }

  return {
    ...clearAttackWindup(attacker),
    state: "follow",
    currentTargetId: attacker.id === state.partyLeaderId ? null : state.partyLeaderId,
    commandPriority: "autonomous",
  };
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return isEnemyEntity(entity);
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
  const attackRange = getAttackRange(attacker);
  const gap = euclideanDistance - attackRange;

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
    x: target.position.x + (direction.x / directionLength) * attackRange,
    y: target.position.y + (direction.y / directionLength) * attackRange,
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

function getAttackRange(attacker: GameEntity): number {
  if (isEnemy(attacker)) {
    return getEnemyAttackRange(attacker);
  }

  return attacker.kind === "companion"
    ? getCompanionAttackRange(attacker)
    : DEFAULT_COMPANION_ATTACK_RANGE;
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
  return getGridDistance(from, to);
}

function canEnemyChaseTarget(enemy: Enemy, target: CombatEntity): boolean {
  return (
    getEuclideanDistance(enemy.homePosition, target.position) <=
    getEnemyAttackLeashDistance()
  );
}

function isSamePosition(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return arePositionsEqual(a, b);
}
