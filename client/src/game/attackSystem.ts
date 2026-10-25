import { finishDirectCompanionCommand, isDirectGatherPersonalThreat, hasDirectCompanionAuthority } from "./directCommandState";
import { getCombatFormationPreference, prepareCombatFormation } from "./combatFormation";
import {
  isAutonomousEntity,
  isCombatEntity,
  MOVEMENT_STEP_DISTANCE,
  setLastAttackAt,
} from "./entities";
import {
  chooseAttackSlot,
  type AttackSlotPathDistanceCache,
} from "./attackSlots";
import { getActiveCompanionsInPartyOrder, getPartyMembers, isPartyMember } from "./partySystem";
import { getPartyCombatTarget } from "./partyTargetSystem";
import { isActivePartyThreat } from "./partyThreatSystem";
import { applyTargetCommitment, canReacquireCombatTarget, isPrivateResponseTarget, isRetainableCombatEnemy, selectTargetCommitment } from "./targetCommitment";
import { getPartyExecutionIntent } from "./partyIntentState";
import { isDefenderAttackTargetRelevant } from "./roleSystem";
import {
  getEntityById,
  updateEntity,
  type GameState,
} from "./state";
import {
  isCombatPositionAvailable,
  flushNormalMovementForEntity,
  holdEntityMovement,
  moveEntityToPositionIfUnoccupied,
  moveEntityTowardPositionIfUnoccupied,
} from "./movementPlanning";
import { getNormalMovementResult } from "./movementAuthority";
import { getRolePriority } from "./roleProfiles";
import { isEnemyBound } from "./skillRuntime";
import {
  getEnemyAttackLeashDistance,
  getEnemyChaseSpeedMultiplier,
} from "./enemyAISystem";
import {
  isEnemyAoeChanneling,
  isStompOnlyEnemy,
} from "./enemyAoeChannelSystem";
import {
  isEnemyAbilityBusy,
  recordEnemyBasicAttackCommitted,
} from "./enemyAbilitySystem";
import {
  isCompanionAssignedToResurrectionRecovery,
  isPositionInActiveResurrectionArea,
} from "./resurrectionSystem";
import {
  arePositionsEqual,
  getEuclideanDistance,
  getGridDistance,
} from "./positionUtils";
import { isCombatPositionSpacedFromParty } from "./partySpacing";
import { isEnemyEntity } from "./entityGuards";
import { getCombatTargetPosition, getStructureApproachPosition, hasStructureLineOfSight } from "./combatStructures";
import { getEffectiveAttackRange, isWithinAttackReach } from "./spatialGeometry";
import { isInsideEnemyMovementBounds } from "./enemyMovementBounds";
import {
  getEnemyAttackRange,
} from "./enemyArchetypes";
import {
  DEFAULT_COMPANION_ATTACK_RANGE,
  getCompanionAttackRange,
} from "./companionCombat";
import {
  COMPANION_GLOBAL_COOLDOWN_MS,
  isCompanionGlobalCooldownActive,
  startCompanionGlobalCooldown,
} from "./companionCooldowns";
import { resolveBasicAttackImpact } from "./combatBasicAttackResolution";
import { launchBasicCombatProjectile } from "./combatProjectileSystem";
import {
  isAttackBlockedByStatus,
  isFakeDeathActive,
  isMovementBlockedByStatus,
} from "./statusEffects";
import {
  getCompanionBasicProjectileProfile,
  getEnemyBasicProjectileProfile,
  type CombatProjectileProfile,
} from "./combatProjectileProfiles";
import type {
  CombatEntity,
  Enemy,
  GameEntity,
  Companion,
  Position,
} from "./types";

export const ATTACK_COOLDOWN_MS = 2000;
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
  let nextState = resolveAutomaticAttackTargets(state);

  for (const entity of getCombatMovementOrder(state)) {
    let attacker = getEntityById(nextState, entity.id);

    if (
      !attacker ||
      (attacker.kind === "enemy" &&
        (isEnemyAbilityBusy(nextState, attacker.id) ||
          isEnemyAoeChanneling(nextState, attacker.id))) ||
      !isAttackingCombatEntity(attacker)
    ) {
      continue;
    }

    const command = nextState.directCompanionCommandsById?.[attacker.id];
    if (command?.type === "move") continue;
    if (command?.type === "gather" && (!attacker.currentTargetId ||
      !isDirectGatherPersonalThreat(nextState, attacker.id, nextState.entities[attacker.currentTargetId]))) continue;
    if (usesAutomaticAttackTarget(nextState, attacker) && !isRetainableCombatEnemy(nextState, nextState.entities[attacker.currentTargetId ?? ""])) {
      nextState = resolveAutomaticAttackTargets(nextState, true);
      attacker = getEntityById(nextState, entity.id);
      if (!attacker || !isAttackingCombatEntity(attacker)) continue;
    }
    if (usesAutomaticAttackTarget(nextState, attacker)) {
      const actor = attacker;
      nextState = applyTargetCommitment(nextState, actor, chooseAutomaticAttackTarget(nextState, actor));
      attacker = nextState.entities[actor.id];
      if (!isAttackingCombatEntity(attacker)) continue;
    }
    const target = getValidTarget(nextState, attacker);

    if (!target) {
      if (command?.type === "attack") {
        nextState = finishDirectCompanionCommand(nextState, command, now, "direct_command_completed", "target_invalid");
        continue;
      }
      nextState = finishAttack(nextState, attacker);
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
      nextState = finishAttack(nextState, currentAttacker);
      continue;
    }

    if (
      isEnemy(currentAttacker) &&
      isEnemyBound(nextState, currentAttacker) &&
      !isInAttackRange(currentAttacker, target)
    ) {
      continue;
    }

    const isResurrectionParticipant =
      isPartyCombatEntity(currentAttacker) &&
      isCompanionAssignedToResurrectionRecovery(nextState, currentAttacker.id);
    nextState = prepareCombatFormation(nextState);

    if (
      isResurrectionParticipant &&
      !isPositionInActiveResurrectionArea(nextState, target.position)
    ) {
      continue;
    }

    const candidateFinalStepPosition = getFinalStepAttackPosition(
      nextState,
      currentAttacker,
      target,
    );
    const candidateAllowedFinalStepPosition =
      candidateFinalStepPosition &&
      (!isResurrectionParticipant ||
        isPositionInActiveResurrectionArea(nextState, candidateFinalStepPosition))
        ? candidateFinalStepPosition
        : null;
    const finalStepPosition =
      candidateAllowedFinalStepPosition &&
      !movedEntityIds.has(currentAttacker.id) &&
      !getNormalMovementResult(nextState, currentAttacker.id) &&
      !isMovementBlockedByStatus(nextState, currentAttacker.id)
        ? candidateAllowedFinalStepPosition
        : null;
    if (finalStepPosition) {
      nextState = moveEntityToPositionIfUnoccupied(nextState, currentAttacker, finalStepPosition, {
        source: "attack", sourceReason: "combat final step", allowPartyPassThrough: true,
        combatSlot: { targetId: target.id, attackReach: getAttackRange(currentAttacker), position: finalStepPosition },
        isPositionAllowed: position => !isResurrectionParticipant || isPositionInActiveResurrectionArea(nextState, position),
      });
      nextState = flushNormalMovementForEntity(nextState, currentAttacker.id);
      if (didEntityMove(nextState, currentAttacker)) movedEntityIds.add(currentAttacker.id);
    }
    const attackReadyAttacker = nextState.entities[currentAttacker.id] as CombatEntity;

    if (
      isInAttackRange(attackReadyAttacker, target) &&
      isPartyCombatEntity(attackReadyAttacker) &&
      !isResurrectionParticipant &&
      !isCombatPositionSpacedFromParty(
        nextState,
        attackReadyAttacker,
        attackReadyAttacker.position,
      )
    ) {
      const spacedSlotState = moveTowardRequiredSpacedAttackSlot(
        nextState,
        attackReadyAttacker,
        target,
        now,
        movedEntityIds,
        pathDistanceCache,
      );

      const spacingMoved = didEntityMove(spacedSlotState, attackReadyAttacker);
      nextState = spacedSlotState;
      if (spacingMoved) {
        continue;
      }
    }

    if (isInAttackRange(attackReadyAttacker, target) &&
      isCombatPositionAvailable(nextState, attackReadyAttacker, attackReadyAttacker.position, { allowPartyPassThrough: true }) &&
      hasStructureLineOfSight(nextState, attackReadyAttacker.position, target)) {
      nextState = holdEntityMovement(nextState, attackReadyAttacker, "attack", "legal engagement");
      if (isEnemy(attackReadyAttacker) && isStompOnlyEnemy(attackReadyAttacker)) {
        nextState = clearAttackWindupInState(nextState, attackReadyAttacker);
        continue;
      }

      if (!canAttack(nextState, currentAttacker, now)) {
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
      const projectileProfile = getBasicAttackProjectileProfile(windupReadyAttacker);

      const updatedAttacker = clearAttackWindup(
        setLastAttackAt(windupReadyAttacker, now),
      );

      if (projectileProfile) {
        nextState = launchBasicCombatProjectile(
          nextState,
          windupReadyAttacker,
          target,
          projectileProfile,
          now,
        );
        if (isEnemy(windupReadyAttacker)) {
          nextState = recordEnemyBasicAttackCommitted(
            nextState,
            windupReadyAttacker.id,
          );
        }
        if (isPartyCombatEntity(windupReadyAttacker)) {
          nextState = startCompanionGlobalCooldown(
            nextState,
            windupReadyAttacker.id,
            now,
            "basic_attack",
          );
        }

        const currentUpdatedAttacker = getEntityById(nextState, updatedAttacker.id);
        const finalUpdatedAttacker = isCombatEntity(currentUpdatedAttacker)
          ? clearAttackWindup(setLastAttackAt(currentUpdatedAttacker, now))
          : updatedAttacker;

        nextState = updateEntity(nextState, finalUpdatedAttacker);
        continue;
      }

      const impactResult = resolveBasicAttackImpact(
        nextState,
        windupReadyAttacker,
        target,
        now,
      );
      nextState = impactResult.state;

      if (isEnemy(windupReadyAttacker)) {
        nextState = recordEnemyBasicAttackCommitted(
          nextState,
          windupReadyAttacker.id,
        );
      }

      if (isPartyCombatEntity(windupReadyAttacker)) {
        nextState = startCompanionGlobalCooldown(
          nextState,
          windupReadyAttacker.id,
          now,
          "basic_attack",
        );
      }

      const currentUpdatedAttacker = getEntityById(nextState, updatedAttacker.id);
      const finalUpdatedAttacker = isCombatEntity(currentUpdatedAttacker)
        ? clearAttackWindup(setLastAttackAt(currentUpdatedAttacker, now))
        : updatedAttacker;

      nextState = updateEntity(nextState, finalUpdatedAttacker);
      if (impactResult.target.state === "dead") {
        const automatic = usesAutomaticAttackTarget(nextState, finalUpdatedAttacker);
        nextState = resolveAutomaticAttackTargets(nextState, true);
        if (!automatic) nextState = finishAttack(nextState, finalUpdatedAttacker);
      }
      if (impactResult.target.state === "dead" && command?.type === "attack")
        nextState = finishDirectCompanionCommand(nextState, command, now, "direct_command_completed", "target_invalid");
      continue;
    }

    nextState = clearAttackWindupInState(nextState, attackReadyAttacker);

    if (movedEntityIds.has(currentAttacker.id) || getNormalMovementResult(nextState, currentAttacker.id)) {
      continue;
    }

    const candidateAttackSlot = chooseAttackSlot(
      nextState,
      currentAttacker,
      target,
      getAttackRange(currentAttacker),
      {
        allowPartyPassThrough: true,
        maxPathDistance: MAX_ATTACK_SLOT_PATH_DISTANCE,
        nowMs: now,
        pathDistanceCache,
        preferredSlotIndex: getAttackSlotPreference(currentAttacker),
        preferredFormationPosition: currentAttacker.kind === "companion" ? getCombatFormationPreference(nextState, currentAttacker) : undefined,
        partySpacingMode:
          currentAttacker.kind === "companion" && !isResurrectionParticipant
            ? "prefer"
            : "off",
      },
    );
    const attackSlot =
      candidateAttackSlot &&
      (!isResurrectionParticipant ||
        isPositionInActiveResurrectionArea(nextState, candidateAttackSlot))
        ? candidateAttackSlot
        : null;

    const movementTarget = isResurrectionParticipant
      ? attackSlot
      : attackSlot ?? (target.kind === "structure" ? getStructureApproachPosition(nextState, currentAttacker, target)
        : isInAttackRange(currentAttacker, target) ? null : target.position);

    if (!movementTarget) {
      nextState = holdEntityMovement(nextState, currentAttacker, "attack", "no legal engagement slot");
      continue;
    }

    const previousPosition = currentAttacker.position;

    nextState = moveEntityTowardPositionIfUnoccupied(nextState, currentAttacker, movementTarget, {
      source: "attack",
      combatSlot: attackSlot ? { targetId: target.id, attackReach: getAttackRange(currentAttacker), position: attackSlot } : undefined,
      isPositionAllowed: position => (!isResurrectionParticipant || isPositionInActiveResurrectionArea(nextState, position)) &&
        (!isEnemy(currentAttacker) || Boolean(currentAttacker.movementBounds) ||
        getEuclideanDistance(currentAttacker.homePosition, position) <= getEnemyAttackLeashDistance()),
      rejectedPositionOutcome: "held",
      allowPartyPassThrough: true,
      pathProfile: attackSlot ? "combatSlot" : "chase",
      pathTargetKey: attackSlot
        ? `combat-slot:${target.id}:${getPositionPathKey(attackSlot)}`
        : `chase:${target.id}`,
      pathTargetPosition: movementTarget,
      speedMultiplier: isEnemy(currentAttacker) ? getEnemyChaseSpeedMultiplier() : 1,
    });

    nextState = flushNormalMovementForEntity(nextState, currentAttacker.id);
    const movedAttacker = getEntityById(nextState, currentAttacker.id);

    if (attackSlot && getNormalMovementResult(nextState, currentAttacker.id)?.request.source === "attack")
      nextState = setCombatSlot(nextState, currentAttacker.id, attackSlot);

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
  const command = state.directCompanionCommandsById?.[attacker.id];
  if (command?.type === "attack") {
    const target = state.entities[command.targetId];
    return isLiveCombatTarget(target) ? target : undefined;
  }
  const currentTarget = attacker.currentTargetId
    ? getEntityById(state, attacker.currentTargetId)
    : undefined;

  if (isLiveCombatTarget(currentTarget) && !isFakeDeathTarget(state, attacker, currentTarget)) {
    return currentTarget;
  }

  if (!isAutonomousEntity(attacker) || !isPartyMember(attacker)) {
    return undefined;
  }

  // Explicit party focus remains independently authoritative for an assisting member.
  const shared = getPartyExecutionIntent(state)?.source === "player" ? getPartyCombatTarget(state) : null;
  return shared && getDistance(attacker.position, shared.position) <= TARGET_SWITCH_DISTANCE ? shared : undefined;
}

function usesAutomaticAttackTarget(state: GameState, actor: GameEntity): actor is Companion {
  return actor.kind === "companion" && actor.state === "attack" && !hasDirectCompanionAuthority(state, actor) &&
    !isCompanionAssignedToResurrectionRecovery(state, actor.id) && getPartyExecutionIntent(state)?.source !== "player" &&
    state.entities[actor.currentTargetId ?? ""]?.kind !== "structure";
}

/** Late invalidation uses the same acquisition order without reordering actions. */
function resolveAutomaticAttackTargets(state: GameState, onlyInvalid = false): GameState {
  let next = state;
  for (const actor of getActiveCompanionsInPartyOrder(state)) {
    if (usesAutomaticAttackTarget(next, actor) && (!onlyInvalid || !isRetainableCombatEnemy(next, next.entities[actor.currentTargetId ?? ""])))
      next = applyTargetCommitment(next, actor, chooseAutomaticAttackTarget(next, actor));
  }
  return next;
}

function chooseAutomaticAttackTarget(state: GameState, actor: Companion) {
  const assists = findPartyAssistTargets(state, actor).filter((target): target is Enemy => target.kind === "enemy");
  return selectTargetCommitment(state, actor, { preferredTarget: assists[0], candidateTargets: assists,
    isEligible: enemy => isDefenderAttackTargetRelevant(state, actor, enemy) });
}

function findPartyAssistTargets(
  state: GameState,
  attacker: Companion,
): CombatEntity[] {
  const partyTarget = getPartyCombatTarget(state);
  const targets: CombatEntity[] = [];
  for (const member of getPartyMembers(state).sort((a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id))) {
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
      if (target.kind === "enemy" && (!canReacquireCombatTarget(state, attacker, target) || isPrivateResponseTarget(state, target.id))) continue;
      // A private order is not shared focus. Existing party/threat authority can
      // still make that same target eligible independently.
      if (hasDirectCompanionAuthority(state, member) &&
        partyTarget?.id !== target.id && !isActivePartyThreat(state, target)) continue;
      if (!targets.some(other => other.id === target.id)) targets.push(target);
    }
  }

  return targets;
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
  return entity.kind !== "structure" && isCombatEntity(entity) && entity.state === "attack";
}

function isLiveCombatTarget(
  entity: GameEntity | undefined,
): entity is CombatEntity {
  return isCombatEntity(entity) && entity.state !== "dead" && entity.health > 0;
}

function isFakeDeathTarget(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): boolean {
  return (
    attacker.kind === "enemy" &&
    target.kind === "companion" &&
    isFakeDeathActive(state, target.id)
  );
}

function isInAttackRange(attacker: GameEntity, target: GameEntity): boolean {
  return isWithinAttackReach(attacker, target, getAttackRange(attacker));
}

function canAttack(
  state: GameState,
  entity: CombatEntity,
  now: number,
): boolean {
  if (isAttackBlockedByStatus(state, entity.id)) {
    return false;
  }

  if (isPartyCombatEntity(entity)) {
    return !isCompanionGlobalCooldownActive(state, entity.id, now);
  }

  return now - entity.lastAttackAt >= getAttackCooldownMs(entity);
}

export function getAttackCooldownMs(entity: CombatEntity): number {
  return entity.kind === "enemy"
    ? entity.attackCooldownMs ?? ATTACK_COOLDOWN_MS
    : COMPANION_GLOBAL_COOLDOWN_MS;
}

function finishAttack(state: GameState, attacker: CombatEntity): GameState {
  if (hasDirectCompanionAuthority(state, attacker)) return state;
  if (!isAutonomousEntity(attacker) || !isPartyMember(attacker)) {
    return updateEntity(state, {
      ...clearAttackWindup(attacker),
      state: "idle",
      currentTargetId: null,
    });
  }
  const decision = chooseAutomaticAttackTarget(state, attacker);
  return decision.kind === "none" ? updateEntity(state, { ...clearAttackWindup(attacker), state: "follow",
    currentTargetId: attacker.id === state.partyLeaderId ? null : state.partyLeaderId, commandPriority: "autonomous" })
    : applyTargetCommitment(state, clearAttackWindup(attacker), decision);
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return isEnemyEntity(entity);
}

function getPositionPathKey(position: Position): string {
  return `${Math.round(position.x)},${Math.round(position.y)}`;
}

function isPartyCombatEntity(entity: CombatEntity): entity is Companion {
  return entity.kind === "companion";
}

function didEntityMove(state: GameState, entity: GameEntity): boolean {
  const currentEntity = getEntityById(state, entity.id);

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

function getFinalStepAttackPosition(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): Position | null {
  if (isInAttackRange(attacker, target)) {
    return null;
  }

  const targetPosition = getCombatTargetPosition(attacker.position, target);
  const euclideanDistance = getEuclideanDistance(attacker.position, targetPosition);
  const effectiveAttackRange = getEffectiveAttackRange(attacker, target, getAttackRange(attacker));
  const gap = euclideanDistance - effectiveAttackRange;

  if (gap <= 0 || gap > FINAL_STEP_ATTACK_DISTANCE) {
    return null;
  }

  const direction = {
    x: attacker.position.x - targetPosition.x,
    y: attacker.position.y - targetPosition.y,
  };
  const directionLength = Math.hypot(direction.x, direction.y);

  if (directionLength === 0) {
    return null;
  }

  const finalPosition = {
    x: targetPosition.x + (direction.x / directionLength) * effectiveAttackRange,
    y: targetPosition.y + (direction.y / directionLength) * effectiveAttackRange,
  };

  if (
    getEuclideanDistance(attacker.position, finalPosition) >
      FINAL_STEP_ATTACK_DISTANCE ||
    !isCombatPositionAvailable(state, attacker, finalPosition, { allowPartyPassThrough: true }) ||
    !hasStructureLineOfSight(state, finalPosition, target) ||
    (isPartyCombatEntity(attacker) &&
      !isCombatPositionSpacedFromParty(state, attacker, finalPosition))
  ) {
    return null;
  }

  return finalPosition;
}

function moveTowardRequiredSpacedAttackSlot(
  state: GameState,
  attacker: Companion,
  target: CombatEntity,
  now: number,
  movedEntityIds: Set<string>,
  pathDistanceCache?: AttackSlotPathDistanceCache,
): GameState {
  if (movedEntityIds.has(attacker.id) || getNormalMovementResult(state, attacker.id)) {
    return state;
  }

  const attackSlot = chooseAttackSlot(
    state,
    attacker,
    target,
    getAttackRange(attacker),
    {
      allowPartyPassThrough: true,
      maxPathDistance: MAX_ATTACK_SLOT_PATH_DISTANCE,
      nowMs: now,
      pathDistanceCache,
      preferredSlotIndex: getAttackSlotPreference(attacker),
      preferredFormationPosition: getCombatFormationPreference(state, attacker),
      partySpacingMode: "required",
    },
  );

  if (!attackSlot || arePositionsEqual(attacker.position, attackSlot)) {
    return state;
  }

  let nextState = moveEntityTowardPositionIfUnoccupied(state, attacker, attackSlot, {
    source: "attack",
    combatSlot: { targetId: target.id, attackReach: getAttackRange(attacker), position: attackSlot },
    allowPartyPassThrough: true,
    pathProfile: "combatSlot",
    pathTargetKey: `combat-slot:${target.id}:${getPositionPathKey(attackSlot)}`,
    pathTargetPosition: attackSlot,
  });
  nextState = flushNormalMovementForEntity(nextState, attacker.id);
  if (getNormalMovementResult(nextState, attacker.id)?.request.source === "attack")
    nextState = setCombatSlot(nextState, attacker.id, attackSlot);

  if (didEntityMove(nextState, attacker)) {
    movedEntityIds.add(attacker.id);
    return nextState;
  }

  return nextState;
}

function getAttackRange(attacker: GameEntity): number {
  if (isEnemy(attacker)) {
    return getEnemyAttackRange(attacker);
  }

  return attacker.kind === "companion"
    ? getCompanionAttackRange(attacker)
    : DEFAULT_COMPANION_ATTACK_RANGE;
}

function getBasicAttackProjectileProfile(
  attacker: CombatEntity,
): CombatProjectileProfile | null {
  return isEnemy(attacker)
    ? getEnemyBasicProjectileProfile(attacker)
    : attacker.kind === "companion" ? getCompanionBasicProjectileProfile(attacker) : null;
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
  if (enemy.movementBounds) return isInsideEnemyMovementBounds(enemy, target.position);
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
