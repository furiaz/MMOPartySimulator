import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { handleEnemyDefeatedDrops } from "./dropSystem";
import {
  isLivingCompanion,
  isLivingEnemy,
  isTargetDummyEnemy,
} from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import { grantCharacterXpToParty } from "./leveling";
import { getGridDistance } from "./positionUtils";
import { recordEnemyDefeatedForQuests } from "./questSystem";
import {
  isCompanionAssignedToResurrectionRecovery,
  isPositionInActiveResurrectionArea,
} from "./resurrectionSystem";
import {
  startMaulSweepChannel,
  startShieldShockwaveChannel,
} from "./companionAoeChannelSystem";
import { getLeaderMovementDirection } from "./roleSystem";
import {
  getHealingAmount,
  resolveAndApplyCombatDamage,
} from "./combatResolver";
import {
  getClearLungePosition,
  getDirectionAwayFrom,
  getDirectionToward,
  getSkillDashPosition,
} from "./skillMovement";
import { getCompanionSkillBehavior } from "./skillBehavior";
import { applyOverchargeToSkillDefinition } from "./skillOvercharge";
import { getScaledSkillDefinitionForCompanion } from "./skillProgression";
import { findEnemyTarget } from "./skillTargeting";
import { getCompanionDerivedStatsWithPartyBuffs } from "./stats";
import { applyCompanionHealing, canUsePartyClassBuff } from "./skillRuntime";
import { applyStatusEffect, dropAggroFromTarget } from "./statusEffects";
import {
  addCombatFeedback,
  addSkillVisualEvent,
  updateEntity,
  type GameState,
} from "./state";
import type {
  Companion,
  Enemy,
  Position,
  SkillDefinition,
  SkillShieldBlockState,
} from "./types";

const LOW_HEALTH_BUFFER = 1;
const VISUAL_DURATION_MS = 600;
const PARTY_CLASS_BUFF_SKILLS_WITH_COMPANION_VISUALS = new Set<
  SkillDefinition["id"]
>(["press_the_opening", "shield_formation", "poison_coating", "pack_frenzy"]);
const SHIELD_OFFSET_DISTANCE = 1;
const DEFAULT_SHIELD_DIRECTION: Position = { x: 0, y: -1 };

export type SkillUse = {
  skill: SkillDefinition;
  target?: Enemy | Companion;
  score: number;
  selectionPriority: number;
};

export type SkillEffectResolutionResult = {
  state: GameState;
  appliedTargetId?: string;
  shouldConsumeCooldown: boolean;
};

export function resolveSkillEffect(
  state: GameState,
  caster: Companion,
  skillUse: SkillUse,
  now: number,
): SkillEffectResolutionResult {
  const result = resolveSkillEffectOnce(state, caster, skillUse, now);

  if (
    !result.shouldConsumeCooldown ||
    skillUse.skill.effect.type === "runicFocus"
  ) {
    return result;
  }

  return applyRunicFocusDuplicate(state, caster, skillUse, result, now);
}

function resolveSkillEffectOnce(
  state: GameState,
  caster: Companion,
  skillUse: SkillUse,
  now: number,
): SkillEffectResolutionResult {
  const { target } = skillUse;
  const skill = applyOverchargeToSkillDefinition(
    state,
    caster,
    getScaledSkillDefinitionForCompanion(caster, skillUse.skill),
    now,
  );

  if (skill.effect.type === "damage" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyDamageSkill(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "lungeDamage" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyLungeDamageSkill(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "sweepingDamage" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applySweepingStrike(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "taunt" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyTaunt(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "multiTaunt" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyMultiTaunt(state, caster, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "shockwave" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      startShieldShockwaveChannel(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "maulSweep" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      startMaulSweepChannel(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "pinningShot" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyPinningShot(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "fakeDeath") {
    return resolveAppliedSkillEffect(
      state,
      applyFakeDeath(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "forcedEvasion") {
    return resolveAppliedSkillEffect(
      state,
      applyForcedEvasion(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "selfBuff") {
    return resolveAppliedSkillEffect(
      state,
      applySelfBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "lifestealBuff") {
    return resolveAppliedSkillEffect(
      state,
      applyLifestealBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "partyBuff") {
    return resolveAppliedSkillEffect(
      state,
      applyPartyBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "partyClassBuff") {
    return resolveAppliedSkillEffect(
      state,
      applyPartyClassBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "partyPoisonCoating") {
    return resolveAppliedSkillEffect(
      state,
      applyPartyPoisonCoating(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "allyBuff" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyAllyBuff(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "barrierBlock" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyBarrierBlock(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "sacrificialBarrier" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applySacrificialBarrier(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "rewindRune" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyRewindRune(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "runicFocus") {
    return resolveAppliedSkillEffect(
      state,
      applyRunicFocus(state, caster, now),
      caster.id,
    );
  }

  if (skill.effect.type === "gatherBuff") {
    return resolveAppliedSkillEffect(
      state,
      applyGatherBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "quickStep") {
    const appliedState = applyQuickStep(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, caster.id);
  }

  if (skill.effect.type === "skirmishShot") {
    const appliedState = applySkirmishShot(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, target?.id ?? caster.id);
  }

  if (skill.effect.type === "pounce") {
    const appliedState = applyPounce(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, target?.id ?? caster.id);
  }

  if (skill.effect.type === "flameStep") {
    const appliedState = applyFlameStep(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, target?.id ?? caster.id);
  }

  if (skill.effect.type === "runeStep") {
    const appliedState = applyRuneStep(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, target?.id ?? caster.id);
  }

  if (skill.effect.type === "dawnStep") {
    const appliedState = applyDawnStep(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, target?.id ?? caster.id);
  }

  if (skill.effect.type === "atonementStep") {
    const appliedState = applyAtonementStep(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, target?.id ?? caster.id);
  }

  if (skill.effect.type === "whipPrison" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyWhipPrison(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "flagellantLash" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyFlagellantLash(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "silencingRay" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applySilencingRay(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "arrowBurst" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyArrowBurst(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "fireBurst" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyFireBurst(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "shieldBlock") {
    return resolveAppliedSkillEffect(
      state,
      applyShieldBlock(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "absorbShield") {
    return resolveAppliedSkillEffect(
      state,
      applyAbsorbShield(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "manaShield") {
    return resolveAppliedSkillEffect(
      state,
      applyManaShield(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "frostArmor" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyFrostArmor(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "healOverTime" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyHealOverTime(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "overcharge") {
    return resolveAppliedSkillEffect(
      state,
      applyOvercharge(state, caster, skill, now),
      caster.id,
    );
  }

  if (
    skill.effect.type === "holdFast" &&
    isLivingCompanion(target) &&
    target.id === caster.id
  ) {
    return resolveAppliedSkillEffect(
      state,
      applyHoldFast(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "damageMitigation") {
    return resolveAppliedSkillEffect(
      state,
      applyDamageMitigation(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "selfMitigationBuff") {
    return resolveAppliedSkillEffect(
      state,
      applySelfMitigationBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "partyMitigationBuff") {
    return resolveAppliedSkillEffect(
      state,
      applyPartyMitigationBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "bind" && isLivingEnemy(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyBind(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "heal" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyHeal(
        state,
        caster,
        target,
        skill.effect.powerMultiplier,
        0,
        skill.id,
        now,
      ),
      target.id,
    );
  }

  if (skill.effect.type === "circleOfRenewal" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyCircleOfRenewal(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "selfPercentHeal" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applySelfPercentHeal(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "sacrificeHeal" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applySacrificeHeal(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "eternalHope") {
    return resolveAppliedSkillEffect(
      state,
      applyEternalHope(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "selfCostHeal" && isLivingCompanion(target)) {
    return resolveAppliedSkillEffect(
      state,
      applyHeal(
        state,
        caster,
        target,
        skill.effect.powerMultiplier,
        skill.effect.hpCost,
        skill.id,
        now,
      ),
      target.id,
    );
  }

  return skipSkillEffect(state);
}

export function updateSkillShieldBlockPositions(state: GameState): GameState {
  const skillShieldBlocksById = Object.fromEntries(
    Object.entries(state.skillShieldBlocksById ?? {})
      .map(([shieldId, shield]) => {
        const owner = state.entities[shield.ownerId];

        if (!isLivingCompanion(owner)) {
          return null;
        }

        return [shieldId, getUpdatedShieldBlock(state, owner, shield)];
      })
      .filter(
        (entry): entry is [string, SkillShieldBlockState] => Boolean(entry),
      ),
  );

  return {
    ...state,
    skillShieldBlocksById,
  };
}

function consumeSkillEffect(
  state: GameState,
  appliedTargetId: string,
): SkillEffectResolutionResult {
  return {
    state,
    appliedTargetId,
    shouldConsumeCooldown: true,
  };
}

function resolveAppliedSkillEffect(
  originalState: GameState,
  appliedState: GameState,
  appliedTargetId: string,
): SkillEffectResolutionResult {
  return appliedState === originalState
    ? skipSkillEffect(originalState)
    : consumeSkillEffect(appliedState, appliedTargetId);
}

function skipSkillEffect(state: GameState): SkillEffectResolutionResult {
  return {
    state,
    shouldConsumeCooldown: false,
  };
}

function applyRunicFocusDuplicate(
  originalState: GameState,
  caster: Companion,
  skillUse: SkillUse,
  result: SkillEffectResolutionResult,
  now: number,
): SkillEffectResolutionResult {
  if (
    !originalState.skillRunicFocusByCompanionId?.[caster.id] ||
    !isRunicFocusEligibleSkill(skillUse.skill)
  ) {
    return result;
  }

  const currentCaster = result.state.entities[caster.id];

  if (!isLivingCompanion(currentCaster)) {
    return result;
  }

  const skillRunicFocusByCompanionId = {
    ...(result.state.skillRunicFocusByCompanionId ?? {}),
  };
  delete skillRunicFocusByCompanionId[caster.id];

  const stateWithoutFocus = {
    ...result.state,
    skillRunicFocusByCompanionId,
  };
  const duplicateTarget = findRunicFocusDuplicateTarget(
    stateWithoutFocus,
    currentCaster,
    skillUse.skill,
    skillUse.target,
  );

  if (!duplicateTarget) {
    return {
      ...result,
      state: stateWithoutFocus,
    };
  }

  const duplicateResult = resolveSkillEffectOnce(
    stateWithoutFocus,
    currentCaster,
    {
      ...skillUse,
      target: duplicateTarget,
    },
    now,
  );

  return {
    ...result,
    state: duplicateResult.shouldConsumeCooldown
      ? duplicateResult.state
      : stateWithoutFocus,
  };
}

function isRunicFocusEligibleSkill(skill: SkillDefinition): boolean {
  switch (skill.effect.type) {
    case "damage":
    case "taunt":
    case "pinningShot":
    case "silencingRay":
    case "bind":
    case "allyBuff":
    case "barrierBlock":
    case "rewindRune":
    case "frostArmor":
    case "healOverTime":
    case "heal":
    case "circleOfRenewal":
    case "selfCostHeal":
      return true;
    default:
      return false;
  }
}

function findRunicFocusDuplicateTarget(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  originalTarget: Enemy | Companion | undefined,
): Enemy | Companion | undefined {
  if (
    skill.effect.type === "damage" ||
    skill.effect.type === "taunt" ||
    skill.effect.type === "pinningShot" ||
    skill.effect.type === "silencingRay" ||
    skill.effect.type === "bind"
  ) {
    return (
      getLivingEnemiesInRange(state, caster, skill.range).find(
        (enemy) => enemy.id !== originalTarget?.id,
      ) ??
      (isLivingEnemy(originalTarget) ? originalTarget : undefined)
    );
  }

  return (
    getPartyMembers(state)
      .filter(
        (member) =>
          isLivingCompanion(member) &&
          getGridDistance(caster.position, member.position) <= skill.range &&
          member.id !== originalTarget?.id,
      )
      .sort(
        (a, b) =>
          a.health / a.maxHealth - b.health / b.maxHealth ||
          getGridDistance(caster.position, a.position) -
            getGridDistance(caster.position, b.position) ||
          a.id.localeCompare(b.id),
      )[0] ?? (isLivingCompanion(originalTarget) ? originalTarget : undefined)
  );
}

function applyDamageSkill(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "damage") {
    return state;
  }

  let nextState = damageEnemy(
    state,
    caster,
    target,
    skill.displayName,
    now,
    skill.effect.damageType,
    skill.effect.powerMultiplier,
    skill.effect.damageType === "physical",
  );

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyLungeDamageSkill(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "lungeDamage") {
    return state;
  }

  const lungePosition = getClearLungePosition(
    state,
    caster,
    target,
    skill.effect.lungeDistance,
  );

  if (!lungePosition) {
    return state;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, lungePosition)
  ) {
    return state;
  }

  const lungedCaster = {
    ...caster,
    position: lungePosition,
  };
  let nextState = updateEntity(state, lungedCaster);

  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget)) {
    nextState = damageEnemy(
      nextState,
      lungedCaster,
      currentTarget,
      skill.displayName,
      now,
      skill.effect.damageType,
      skill.effect.powerMultiplier,
      skill.effect.damageType === "physical",
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "slash",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position: lungePosition,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applySweepingStrike(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "sweepingDamage") {
    return state;
  }

  let nextState = damageEnemy(
    state,
    caster,
    target,
    skill.displayName,
    now,
    skill.effect.damageType,
    skill.effect.mainPowerMultiplier,
    true,
  );
  const currentTarget = nextState.entities[target.id];

  for (const enemy of Object.values(nextState.entities)) {
    if (
      enemy.kind !== "enemy" ||
      enemy.id === target.id ||
      enemy.state === "dead" ||
      !currentTarget ||
      getGridDistance(enemy.position, currentTarget.position) >
        skill.effect.splashRange
    ) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      enemy,
      "Sweep",
      now,
      skill.effect.damageType,
      skill.effect.splashPowerMultiplier,
      true,
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "slash",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyTaunt(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "taunt") {
    return state;
  }

  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  if (skill.effect.powerMultiplier && skill.effect.powerMultiplier > 0) {
    nextState = damageEnemy(
      nextState,
      caster,
      target,
      skill.displayName,
      now,
      skill.effect.damageType ?? "physical",
      skill.effect.powerMultiplier,
      skill.effect.damageType !== "magic",
    );
  }

  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget) && !isTargetDummyEnemy(currentTarget)) {
    nextState = updateEntity(nextState, {
      ...currentTarget,
      state: "attack",
      currentTargetId: caster.id,
    });
    nextState = applyStatusEffect(
      nextState,
      {
        type: "taunted",
        targetId: currentTarget.id,
        durationMs: skill.effect.durationMs,
        sourceId: caster.id,
        sourceKey: skill.id,
      },
      now,
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyMultiTaunt(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "multiTaunt") {
    return state;
  }

  const targets = getLivingEnemiesInRange(state, caster, skill.range)
    .sort(
      (a, b) =>
        getGridDistance(caster.position, a.position) -
          getGridDistance(caster.position, b.position) ||
        (a.currentTargetId === caster.id ? 1 : 0) -
          (b.currentTargetId === caster.id ? 1 : 0),
    )
    .slice(0, skill.effect.maxTargets);

  if (targets.length === 0) {
    return state;
  }

  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  for (const target of targets) {
    const currentTarget = nextState.entities[target.id];

    if (isLivingEnemy(currentTarget) && !isTargetDummyEnemy(currentTarget)) {
      nextState = updateEntity(nextState, {
        ...currentTarget,
        state: "attack",
        currentTargetId: caster.id,
      });
      nextState = applyStatusEffect(
        nextState,
        {
          type: "taunted",
          targetId: currentTarget.id,
          durationMs: skill.effect.durationMs,
          sourceId: caster.id,
          sourceKey: skill.id,
        },
        now,
      );
    }
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: targets[0]?.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyPinningShot(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "pinningShot") {
    return state;
  }

  let nextState = applyStatusEffect(
    state,
    {
      type: "immobilized",
      targetId: target.id,
      durationMs: skill.effect.durationMs,
      sourceId: caster.id,
      sourceKey: skill.id,
    },
    now,
  );

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyFakeDeath(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "fakeDeath") {
    return state;
  }

  let nextState = dropAggroFromTarget(state, caster.id);
  nextState = applyStatusEffect(
    nextState,
    {
      type: "fakeDeath",
      targetId: caster.id,
      durationMs: skill.effect.fakeDeathDurationMs,
      sourceId: caster.id,
      sourceKey: skill.id,
    },
    now,
  );
  nextState = applyStatusEffect(
    nextState,
    {
      type: "incapacitated",
      targetId: caster.id,
      durationMs: skill.effect.fakeDeathDurationMs,
      sourceId: caster.id,
      sourceKey: skill.id,
    },
    now,
  );
  nextState = applyStatusEffect(
    nextState,
    {
      type: "nextAttackDamageBonus",
      targetId: caster.id,
      durationMs:
        skill.effect.fakeDeathDurationMs + skill.effect.nextAttackBonusDurationMs,
      damageMultiplierBonus: skill.effect.nextAttackDamageMultiplierBonus,
      sourceId: caster.id,
      sourceKey: skill.id,
      damageTypes: ["physical"],
    },
    now,
  );

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyForcedEvasion(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "forcedEvasion") {
    return state;
  }

  let nextState = applyStatusEffect(
    state,
    {
      type: "forcedEvasion",
      targetId: caster.id,
      durationMs: skill.effect.durationMs,
      sourceId: caster.id,
      sourceKey: skill.id,
    },
    now,
  );
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applySelfBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "selfBuff" ||
    !canApplyRefreshableRuntimeState(
      state.skillSelfBuffsByCompanionId?.[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    ) ||
    caster.health <= skill.effect.hpCost + LOW_HEALTH_BUFFER
  ) {
    return state;
  }

  const damagedCaster = {
    ...caster,
    health: caster.health - skill.effect.hpCost,
  };
  let nextState: GameState = {
    ...updateEntity(state, damagedCaster),
    skillSelfBuffsByCompanionId: {
      ...(state.skillSelfBuffsByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        bonusDamage: skill.effect.bonusDamage,
        movementSpeedBonusPercent: skill.effect.movementSpeedBonusPercent,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: skill.effect.hpCost > 0 ? "red_flash" : "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 500,
  });
  nextState = addCombatFeedback(nextState, {
    type: skill.effect.hpCost > 0 ? "damage" : "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyPartyBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "partyBuff" ||
    !canApplyRefreshableRuntimeState(
      state.skillPartyBuffsBySourceId?.[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillPartyBuffsBySourceId: {
      ...(state.skillPartyBuffsBySourceId ?? {}),
      [caster.id]: {
        sourceId: caster.id,
        bonusDamage: skill.effect.bonusDamage,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  for (const member of getPartyMembers(nextState)) {
    if (!isLivingCompanion(member)) {
      continue;
    }

    nextState = addCombatFeedback(nextState, {
      type: "attack",
      entityId: member.id,
      text: skill.displayName,
      now,
    });
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyPartyClassBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "partyClassBuff" ||
    !canUsePartyClassBuff(state, caster, skill, now)
  ) {
    return state;
  }

  const tickDamage = skill.effect.poisonCoating
    ? Math.max(
        1,
        getCompanionDerivedStatsWithPartyBuffs(state, caster).attack *
          (skill.effect.poisonCoating.poisonDamageAttackPowerPercent / 100),
      )
    : undefined;
  let nextState: GameState = state;
  let skillPartyClassBuffsByCompanionId = {
    ...(state.skillPartyClassBuffsByCompanionId ?? {}),
  };
  const affectedMembers = getPartyMembers(state).filter(isLivingCompanion);

  for (const member of affectedMembers) {
    skillPartyClassBuffsByCompanionId = {
      ...skillPartyClassBuffsByCompanionId,
      [member.id]: {
        ...(skillPartyClassBuffsByCompanionId[member.id] ?? {}),
        [caster.classId]: {
          targetId: member.id,
          sourceId: caster.id,
          sourceClassId: caster.classId,
          sourceSkillId: skill.id,
          expiresAt: now + skill.effect.durationMs,
          primaryStatBonusPercentByStat:
            skill.effect.primaryStatBonusPercentByStat,
          physicalDamageBonusPercent: skill.effect.physicalDamageBonusPercent,
          magicDamageBonusPercent: skill.effect.magicDamageBonusPercent,
          mitigationPercent: skill.effect.mitigationPercent,
          mitigatedDamageTypes: skill.effect.mitigatedDamageTypes,
          healingReceivedBonusPercent: skill.effect.healingReceivedBonusPercent,
          poisonCoating:
            skill.effect.poisonCoating && tickDamage !== undefined
              ? {
                  sourceKey: skill.effect.poisonCoating.sourceKey,
                  tickDamage,
                  poisonDurationMs: skill.effect.poisonCoating.poisonDurationMs,
                  poisonTickIntervalMs:
                    skill.effect.poisonCoating.poisonTickIntervalMs,
                }
              : undefined,
        },
      },
    };
    nextState = addCombatFeedback(nextState, {
      type: "attack",
      entityId: member.id,
      text: skill.displayName,
      now,
    });
  }

  nextState = {
    ...nextState,
    skillPartyClassBuffsByCompanionId,
  };
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  if (PARTY_CLASS_BUFF_SKILLS_WITH_COMPANION_VISUALS.has(skill.id)) {
    for (const member of affectedMembers) {
      nextState = addSkillVisualEvent(nextState, {
        type: "heal",
        skillId: skill.id,
        sourceId: caster.id,
        targetId: member.id,
        now,
        durationMs: 600,
      });
    }
  }

  return nextState;
}

function applyLifestealBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "lifestealBuff") {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillLifestealBuffsByCompanionId: {
      ...(state.skillLifestealBuffsByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        lifestealPercent: skill.effect.lifestealPercent,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyPartyPoisonCoating(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "partyPoisonCoating" ||
    !canApplyRefreshableRuntimeState(
      state.skillPartyPoisonCoatingsBySourceId?.[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return state;
  }

  const tickDamage = Math.max(
    1,
    getCompanionDerivedStatsWithPartyBuffs(state, caster).attack *
      (skill.effect.poisonDamageAttackPowerPercent / 100),
  );
  let nextState: GameState = {
    ...state,
    skillPartyPoisonCoatingsBySourceId: {
      ...(state.skillPartyPoisonCoatingsBySourceId ?? {}),
      [caster.id]: {
        sourceId: caster.id,
        sourceKey: skill.effect.sourceKey,
        tickDamage,
        poisonDurationMs: skill.effect.poisonDurationMs,
        poisonTickIntervalMs: skill.effect.poisonTickIntervalMs,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  for (const member of getPartyMembers(nextState)) {
    if (!isLivingCompanion(member)) {
      continue;
    }

    nextState = addCombatFeedback(nextState, {
      type: "attack",
      entityId: member.id,
      text: skill.displayName,
      now,
    });
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyAllyBuff(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "allyBuff" ||
    state.skillSelfBuffsByCompanionId?.[target.id]
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillSelfBuffsByCompanionId: {
      ...(state.skillSelfBuffsByCompanionId ?? {}),
      [target.id]: {
        companionId: target.id,
        bonusDamage: skill.effect.bonusDamage,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyBarrierBlock(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "barrierBlock") {
    return state;
  }

  const barrierPlacement = getShieldPlacement(state, target);
  const barrierId = `${target.id}-${skill.id}`;
  let nextState: GameState = {
    ...state,
    skillShieldBlocksById: {
      ...(state.skillShieldBlocksById ?? {}),
      [barrierId]: {
        id: barrierId,
        ownerId: target.id,
        position: barrierPlacement.position,
        rotationRadians: barrierPlacement.rotationRadians,
        expiresAt: now + skill.effect.durationMs,
        remainingBlocks: skill.effect.blocks,
        blockedDamageTypes: skill.effect.blockedDamageTypes,
        healPercentMaxHealthOnConsume: skill.effect.healPercentMaxHealthOnConsume,
        sourceId: caster.id,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position: barrierPlacement.position,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applySacrificialBarrier(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "sacrificialBarrier") {
    return state;
  }

  const sacrifice = applyCurrentHpSacrifice(
    state,
    caster,
    skill.effect.hpCostCurrentPercent,
    { respectSafetyFloor: true },
  );

  if (!sacrifice) {
    return state;
  }

  const currentTarget = sacrifice.state.entities[target.id];

  if (!isLivingCompanion(currentTarget)) {
    return state;
  }

  const barrierPlacement = getShieldPlacement(sacrifice.state, currentTarget);
  const barrierId = `${currentTarget.id}-${skill.id}`;
  let nextState: GameState = {
    ...sacrifice.state,
    skillShieldBlocksById: {
      ...(sacrifice.state.skillShieldBlocksById ?? {}),
      [barrierId]: {
        id: barrierId,
        ownerId: currentTarget.id,
        position: barrierPlacement.position,
        rotationRadians: barrierPlacement.rotationRadians,
        expiresAt: now + skill.effect.durationMs,
        remainingBlocks: skill.effect.blocks,
        blockedDamageTypes: skill.effect.blockedDamageTypes,
        sourceId: caster.id,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: currentTarget.id,
    position: barrierPlacement.position,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: currentTarget.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyRewindRune(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "rewindRune") {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillRewindRunesByCompanionId: {
      ...(state.skillRewindRunesByCompanionId ?? {}),
      [target.id]: {
        id: `${target.id}-${skill.id}`,
        targetId: target.id,
        sourceId: caster.id,
        healPercentRecordedDamage: skill.effect.healPercentRecordedDamage,
        tickIntervalMs: skill.effect.tickIntervalMs,
        nextTickAt: now + skill.effect.tickIntervalMs,
        expiresAt: now + skill.effect.durationMs,
        recordedDamage:
          state.skillRewindRunesByCompanionId?.[target.id]?.recordedDamage ?? 0,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyRunicFocus(
  state: GameState,
  caster: Companion,
  now: number,
): GameState {
  if (state.skillRunicFocusByCompanionId?.[caster.id]) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillRunicFocusByCompanionId: {
      ...(state.skillRunicFocusByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        skillId: "runic_focus",
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: "runic_focus",
    sourceId: caster.id,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: "Runic Focus",
    now,
  });

  return nextState;
}

function applyGatherBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "gatherBuff" ||
    !canApplyRefreshableRuntimeState(
      state.skillGatherBuffsByCompanionId?.[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillGatherBuffsByCompanionId: {
      ...(state.skillGatherBuffsByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        bonusGatherSpeed: skill.effect.bonusGatherSpeed,
        expiresAt: now + skill.effect.durationMs,
        resourceType: skill.effect.resourceType,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "gather",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyDamageMitigation(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "damageMitigation") {
    return state;
  }

  const mitigationId = `${caster.id}-${skill.id}`;
  let nextState: GameState = {
    ...state,
    skillDamageMitigationsByCompanionId: {
      ...(state.skillDamageMitigationsByCompanionId ?? {}),
      [caster.id]: {
        id: mitigationId,
        ownerId: caster.id,
        expiresAt: now + skill.effect.durationMs,
        remainingProcs: skill.effect.procs,
        mitigationPercent: skill.effect.mitigationPercent,
        mitigatedDamageTypes: skill.effect.mitigatedDamageTypes ?? ["physical"],
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyAbsorbShield(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "absorbShield" ||
    state.skillAbsorbShieldsByCompanionId?.[caster.id]
  ) {
    return state;
  }

  const maxAbsorb = Math.max(
    1,
    Math.round(caster.maxHealth * (skill.effect.absorbPercentMaxHealth / 100)),
  );
  let nextState: GameState = {
    ...state,
    skillAbsorbShieldsByCompanionId: {
      ...(state.skillAbsorbShieldsByCompanionId ?? {}),
      [caster.id]: {
        id: `${caster.id}-${skill.id}`,
        ownerId: caster.id,
        remainingAbsorb: maxAbsorb,
        maxAbsorb,
        expiresAt: now + skill.effect.durationMs,
        absorbedDamageTypes: skill.effect.absorbedDamageTypes,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyManaShield(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "manaShield" ||
    state.skillManaShieldsByCompanionId?.[caster.id]
  ) {
    return state;
  }

  const maxAbsorb = Math.max(
    1,
    Math.round(caster.maxHealth * (skill.effect.absorbPercentMaxHealth / 100)),
  );
  let nextState: GameState = {
    ...state,
    skillManaShieldsByCompanionId: {
      ...(state.skillManaShieldsByCompanionId ?? {}),
      [caster.id]: {
        id: `${caster.id}-${skill.id}`,
        ownerId: caster.id,
        remainingAbsorb: maxAbsorb,
        maxAbsorb,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyFrostArmor(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "frostArmor") {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillFrostArmorsByCompanionId: {
      ...(state.skillFrostArmorsByCompanionId ?? {}),
      [target.id]: {
        id: `${target.id}-${skill.id}`,
        targetId: target.id,
        sourceId: caster.id,
        defenseBonusPercent: skill.effect.defenseBonusPercent,
        mitigationPercent: skill.effect.mitigationPercent,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyHealOverTime(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "healOverTime") {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillHealOverTimesByCompanionId: {
      ...(state.skillHealOverTimesByCompanionId ?? {}),
      [target.id]: {
        id: `${target.id}-${skill.id}`,
        targetId: target.id,
        sourceId: caster.id,
        healPercentMaxHealth: skill.effect.healPercentMaxHealth,
        tickIntervalMs: skill.effect.tickIntervalMs,
        nextTickAt: now + skill.effect.tickIntervalMs,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyOvercharge(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "overcharge" ||
    !getCompanionSkillBehavior(caster).overchargeEnabled ||
    !canApplyRefreshableRuntimeState(
      state.skillOverchargesByCompanionId?.[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillOverchargesByCompanionId: {
      ...(state.skillOverchargesByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        skillPowerBonusPercent: skill.effect.skillPowerBonusPercent,
        cooldownPenaltyPercent: skill.effect.cooldownPenaltyPercent,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyHoldFast(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "holdFast" ||
    state.skillAbsorbShieldsByCompanionId?.[caster.id]
  ) {
    return state;
  }

  const maxAbsorb = Math.max(
    1,
    Math.round(caster.maxHealth * (skill.effect.absorbPercentMaxHealth / 100)),
  );
  let nextState: GameState = {
    ...state,
    skillAbsorbShieldsByCompanionId: {
      ...(state.skillAbsorbShieldsByCompanionId ?? {}),
      [caster.id]: {
        id: `${caster.id}-${skill.id}`,
        ownerId: caster.id,
        remainingAbsorb: maxAbsorb,
        maxAbsorb,
        expiresAt: now + skill.effect.absorbDurationMs,
      },
    },
  };

  nextState = applyStatusEffect(
    nextState,
    {
      type: "defenseBuff",
      targetId: caster.id,
      durationMs: skill.effect.defenseDurationMs,
      defenseBonusPercent: skill.effect.defenseBonusPercent,
      sourceId: caster.id,
      sourceKey: skill.id,
    },
    now,
  );
  nextState = applyStatusEffect(
    nextState,
    {
      type: "immobilized",
      targetId: caster.id,
      durationMs: skill.effect.immobilizeDurationMs,
      sourceId: caster.id,
      sourceKey: skill.id,
    },
    now,
  );

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applySelfMitigationBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "selfMitigationBuff" ||
    !canApplyRefreshableRuntimeState(
      state.skillSelfMitigationBuffsByCompanionId?.[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillSelfMitigationBuffsByCompanionId: {
      ...(state.skillSelfMitigationBuffsByCompanionId ?? {}),
      [caster.id]: {
        id: `${caster.id}-${skill.id}`,
        sourceId: caster.id,
        mitigationPercent: skill.effect.mitigationPercent,
        expiresAt: now + skill.effect.durationMs,
        mitigatedDamageTypes: skill.effect.mitigatedDamageTypes,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyPartyMitigationBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "partyMitigationBuff" ||
    !canApplyRefreshableRuntimeState(
      state.skillPartyMitigationBuffsBySourceId?.[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillPartyMitigationBuffsBySourceId: {
      ...(state.skillPartyMitigationBuffsBySourceId ?? {}),
      [caster.id]: {
        id: `${caster.id}-${skill.id}`,
        sourceId: caster.id,
        mitigationPercent: skill.effect.mitigationPercent,
        expiresAt: now + skill.effect.durationMs,
        mitigatedDamageTypes: skill.effect.mitigatedDamageTypes,
      },
    },
  };

  for (const member of getPartyMembers(nextState)) {
    if (!isLivingCompanion(member)) {
      continue;
    }

    nextState = addCombatFeedback(nextState, {
      type: "attack",
      entityId: member.id,
      text: skill.displayName,
      now,
    });
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyQuickStep(
  state: GameState,
  caster: Companion,
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "quickStep" || !isLivingEnemy(target)) {
    return null;
  }

  const direction =
    getCompanionSkillBehavior(caster).mobilitySkillUseMode === "offensive"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  let nextState = updateEntity(state, {
    ...caster,
    position,
  });

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    position,
    now,
    durationMs: 400,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applySkirmishShot(
  state: GameState,
  caster: Companion,
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "skirmishShot" || !isLivingEnemy(target)) {
    return null;
  }

  const direction =
    getCompanionSkillBehavior(caster).mobilitySkillUseMode === "offensive"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  const movedCaster = {
    ...caster,
    position,
  };
  let nextState = updateEntity(state, movedCaster);
  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget)) {
    nextState = damageEnemy(
      nextState,
      movedCaster,
      currentTarget,
      skill.displayName,
      now,
      skill.effect.damageType,
      skill.effect.powerMultiplier,
      skill.effect.damageType !== "magic",
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position,
    now,
    durationMs: VISUAL_DURATION_MS,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyPounce(
  state: GameState,
  caster: Companion,
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "pounce" || !isLivingEnemy(target)) {
    return null;
  }

  const direction =
    getCompanionSkillBehavior(caster).mobilitySkillUseMode === "offensive"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  const movedCaster = {
    ...caster,
    position,
  };
  let nextState = updateEntity(state, movedCaster);
  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget)) {
    nextState = damageEnemy(
      nextState,
      movedCaster,
      currentTarget,
      skill.displayName,
      now,
      skill.effect.damageType,
      skill.effect.powerMultiplier,
      skill.effect.damageType !== "magic",
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "slash",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position,
    now,
    durationMs: VISUAL_DURATION_MS,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyFlameStep(
  state: GameState,
  caster: Companion,
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "flameStep" || !isLivingEnemy(target)) {
    return null;
  }

  const direction =
    getCompanionSkillBehavior(caster).mobilitySkillUseMode === "offensive"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  const movedCaster = {
    ...caster,
    position,
  };
  let nextState = updateEntity(state, movedCaster);
  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget)) {
    nextState = applyBurning(
      nextState,
      movedCaster,
      currentTarget,
      skill,
      now,
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "red_flash",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position,
    now,
    durationMs: VISUAL_DURATION_MS,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyRuneStep(
  state: GameState,
  caster: Companion,
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "runeStep" || !isLivingEnemy(target)) {
    return null;
  }

  const useMode = getCompanionSkillBehavior(caster).mobilitySkillUseMode;
  const direction =
    useMode === "offensive"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  const trapPosition = useMode === "offensive" ? position : caster.position;
  let nextState = updateEntity(state, {
    ...caster,
    position,
  });
  let affectedEnemies = 0;

  for (const enemy of Object.values(nextState.entities)) {
    if (
      !isLivingEnemy(enemy) ||
      getGridDistance(enemy.position, trapPosition) > skill.effect.trapRadius
    ) {
      continue;
    }

    nextState = applyStatusEffect(
      nextState,
      {
        type: "immobilized",
        targetId: enemy.id,
        durationMs: skill.effect.trapImmobilizeDurationMs,
        sourceId: caster.id,
        sourceKey: skill.id,
      },
      now,
    );
    affectedEnemies += 1;
  }

  if (affectedEnemies === 0) {
    return null;
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position: trapPosition,
    now,
    durationMs: VISUAL_DURATION_MS,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyDawnStep(
  state: GameState,
  caster: Companion,
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "dawnStep" || !isLivingEnemy(target)) {
    return null;
  }

  const useMode = getCompanionSkillBehavior(caster).mobilitySkillUseMode;
  const direction =
    useMode === "offensive"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  const disarmPosition = useMode === "offensive" ? position : caster.position;
  let nextState = updateEntity(state, {
    ...caster,
    position,
  });
  let affectedEnemies = 0;

  for (const enemy of Object.values(nextState.entities)) {
    if (
      !isLivingEnemy(enemy) ||
      getGridDistance(enemy.position, disarmPosition) >
        skill.effect.disarmRadius
    ) {
      continue;
    }

    nextState = applyStatusEffect(
      nextState,
      {
        type: "disarmed",
        targetId: enemy.id,
        durationMs: skill.effect.disarmDurationMs,
        sourceId: caster.id,
        sourceKey: skill.id,
      },
      now,
    );
    affectedEnemies += 1;
  }

  if (affectedEnemies === 0) {
    return null;
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position: disarmPosition,
    now,
    durationMs: VISUAL_DURATION_MS,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyArrowBurst(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "arrowBurst") {
    return state;
  }

  let nextState = state;
  const { damageType, powerMultiplier, radius } = skill.effect;
  const targets = Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        isLivingEnemy(entity) &&
        getGridDistance(entity.position, target.position) <= radius,
    )
    .sort(
      (a, b) =>
        getGridDistance(target.position, a.position) -
          getGridDistance(target.position, b.position) ||
        a.id.localeCompare(b.id),
    );

  if (targets.length === 0) {
    return state;
  }

  for (const burstTarget of targets) {
    const currentTarget = nextState.entities[burstTarget.id];

    if (!isLivingEnemy(currentTarget)) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      currentTarget,
      skill.displayName,
      now,
      damageType,
      powerMultiplier,
      damageType !== "magic",
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyFireBurst(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "fireBurst") {
    return state;
  }

  const effect = skill.effect;
  let nextState = state;
  const targets = Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        isLivingEnemy(entity) &&
        getGridDistance(entity.position, target.position) <= effect.radius,
    )
    .sort(
      (a, b) =>
        getGridDistance(target.position, a.position) -
          getGridDistance(target.position, b.position) ||
        a.id.localeCompare(b.id),
    );

  if (targets.length === 0) {
    return state;
  }

  for (const burstTarget of targets) {
    const currentTarget = nextState.entities[burstTarget.id];

    if (!isLivingEnemy(currentTarget)) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      currentTarget,
      skill.displayName,
      now,
      effect.damageType,
      effect.powerMultiplier,
      false,
    );

    const targetAfterDamage = nextState.entities[burstTarget.id];

    if (isLivingEnemy(targetAfterDamage)) {
      nextState = applyBurning(
        nextState,
        caster,
        targetAfterDamage,
        skill,
        now,
      );
    }
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "red_flash",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyShieldBlock(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "shieldBlock") {
    return state;
  }

  const shieldPlacement = getShieldPlacement(state, caster);
  const shieldId = `${caster.id}-${skill.id}`;
  let nextState: GameState = {
    ...state,
    skillShieldBlocksById: {
      ...(state.skillShieldBlocksById ?? {}),
      [shieldId]: {
        id: shieldId,
        ownerId: caster.id,
        position: shieldPlacement.position,
        rotationRadians: shieldPlacement.rotationRadians,
        expiresAt: now + skill.effect.durationMs,
        remainingBlocks: skill.effect.blocks,
        blockedDamageTypes: skill.effect.blockedDamageTypes ?? ["physical"],
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    position: shieldPlacement.position,
    now,
    durationMs: 600,
  });

  return nextState;
}

function applyBind(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "bind") {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillBindsByEnemyId: {
      ...(state.skillBindsByEnemyId ?? {}),
      [target.id]: {
        sourceId: caster.id,
        targetId: target.id,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyAtonementStep(
  state: GameState,
  caster: Companion,
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "atonementStep" || !isLivingEnemy(target)) {
    return null;
  }

  const effect = skill.effect;
  const useMode = getCompanionSkillBehavior(caster).mobilitySkillUseMode;
  const direction =
    useMode === "offensive"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  const effectPosition = useMode === "offensive" ? position : caster.position;
  const healTargets =
    useMode === "defensive"
      ? getPartyMembers(state).filter(
        (member) =>
          member.id !== caster.id &&
          isLivingCompanion(member) &&
          member.health < member.maxHealth &&
          getGridDistance(member.position, effectPosition) <=
              effect.healRadius,
        )
      : [];
  const affectedEnemies =
    useMode === "offensive"
      ? Object.values(state.entities).filter(
          (entity): entity is Enemy =>
            isLivingEnemy(entity) &&
            getGridDistance(entity.position, effectPosition) <=
              effect.disarmRadius,
        )
      : [];

  if (
    (useMode === "offensive" && affectedEnemies.length === 0) ||
    (useMode === "defensive" && healTargets.length === 0)
  ) {
    return null;
  }

  const sacrifice = applyCurrentHpSacrifice(
    state,
    caster,
    skill.effect.hpCostCurrentPercent,
    { respectSafetyFloor: true },
  );

  if (!sacrifice) {
    return null;
  }

  let nextState = updateEntity(sacrifice.state, {
    ...sacrifice.caster,
    position,
  });

  if (useMode === "offensive") {
    for (const enemy of affectedEnemies) {
      nextState = applyStatusEffect(
        nextState,
        {
          type: "disarmed",
          targetId: enemy.id,
            durationMs: effect.disarmDurationMs,
          sourceId: caster.id,
          sourceKey: skill.id,
        },
        now,
      );
    }
  } else {
    const healAmount = Math.max(
      1,
      Math.round(sacrifice.sacrificedHp * skill.effect.healSacrificeMultiplier),
    );

    for (const healTarget of healTargets) {
      const currentTarget = nextState.entities[healTarget.id];

      if (!isLivingCompanion(currentTarget)) {
        continue;
      }

      nextState = applyCompanionHealing(nextState, currentTarget, healAmount, now, {
        sourceId: caster.id,
      }).state;
    }
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position: effectPosition,
    now,
    durationMs: VISUAL_DURATION_MS,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applySilencingRay(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "silencingRay") {
    return state;
  }

  let nextState = applyStatusEffect(
    state,
    {
      type: "silenced",
      targetId: target.id,
      durationMs: skill.effect.durationMs,
      sourceId: caster.id,
      sourceKey: skill.id,
    },
    now,
  );

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return nextState;
}

function applyHeal(
  state: GameState,
  caster: Companion,
  target: Companion,
  powerMultiplier: number,
  hpCost: number,
  skillId: SkillDefinition["id"],
  now: number,
): GameState {
  if (hpCost > 0 && caster.health <= hpCost + LOW_HEALTH_BUFFER) {
    return state;
  }

  const amount = getHealingAmount(caster, powerMultiplier, state);
  const healResult = applyCompanionHealing(state, target, amount, now, {
    sourceId: caster.id,
    feedback: false,
  });
  let nextState = healResult.state;
  const healedTarget = healResult.target;

  if (hpCost > 0) {
    const currentCaster = nextState.entities[caster.id];

    if (isLivingCompanion(currentCaster)) {
      const damagedCaster = {
        ...currentCaster,
        health: currentCaster.health - hpCost,
      };

      nextState = updateEntity(nextState, damagedCaster);
      nextState = addSkillVisualEvent(nextState, {
        type: "red_flash",
        skillId,
        sourceId: caster.id,
        now,
        durationMs: 500,
      });
    }
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 1000,
  });
  nextState = addCombatFeedback(nextState, {
    type: "heal",
    entityId: target.id,
    amount: healResult.healedAmount,
    sourceEntityId: caster.id,
    targetEntityId: target.id,
    text: `+${healResult.healedAmount} HP`,
    now,
  });
  nextState = appendDebugTelemetryEvent(nextState, {
    type: "healing_resolved",
    entityId: caster.id,
    targetId: target.id,
    healingPowerRating: getCompanionDerivedStatsWithPartyBuffs(state, caster)
      .healingPower,
    healingMultiplier: powerMultiplier,
    healingAmount: healResult.healedAmount,
    previousHealth: target.health,
    nextHealth: healedTarget.health,
    skillId,
  });

  return nextState;
}

function applyCircleOfRenewal(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "circleOfRenewal") {
    return state;
  }

  const healAmount = getHealingAmount(caster, skill.effect.powerMultiplier, state);
  let nextState = state;
  let healedAny = false;

  for (const member of getPartyMembers(state)) {
    if (
      !isLivingCompanion(member) ||
      member.health >= member.maxHealth ||
      getGridDistance(member.position, target.position) > skill.effect.radius
    ) {
      continue;
    }

    const result = applyCompanionHealing(nextState, member, healAmount, now, {
      sourceId: caster.id,
    });
    nextState = result.state;
    healedAny ||= result.healedAmount > 0;
  }

  if (!healedAny) {
    return state;
  }

  const updatedTarget = nextState.entities[target.id];
  const nextTargetHealth = isLivingCompanion(updatedTarget)
    ? updatedTarget.health
    : target.health;

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position: target.position,
    now,
    durationMs: 1000,
  });
  nextState = appendDebugTelemetryEvent(nextState, {
    type: "healing_resolved",
    entityId: caster.id,
    targetId: target.id,
    healingPowerRating: getCompanionDerivedStatsWithPartyBuffs(state, caster)
      .healingPower,
    healingMultiplier: skill.effect.powerMultiplier,
    healingAmount: healAmount,
    previousHealth: target.health,
    nextHealth: nextTargetHealth,
    skillId: skill.id,
  });

  return nextState;
}

function applySelfPercentHeal(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "selfPercentHeal" ||
    target.id !== caster.id ||
    target.health >= target.maxHealth
  ) {
    return state;
  }

  const amount = Math.max(
    1,
    Math.round(target.maxHealth * (skill.effect.healPercent / 100)),
  );
  const healResult = applyCompanionHealing(state, target, amount, now, {
    sourceId: caster.id,
    feedback: false,
  });
  let nextState = healResult.state;
  const healedTarget = healResult.target;

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 1000,
  });
  nextState = addCombatFeedback(nextState, {
    type: "heal",
    entityId: target.id,
    amount: healResult.healedAmount,
    sourceEntityId: caster.id,
    targetEntityId: target.id,
    text: `+${healResult.healedAmount} HP`,
    now,
  });
  nextState = appendDebugTelemetryEvent(nextState, {
    type: "healing_resolved",
    entityId: caster.id,
    targetId: target.id,
    healingMultiplier: skill.effect.healPercent / 100,
    healingAmount: healResult.healedAmount,
    previousHealth: target.health,
    nextHealth: healedTarget.health,
    skillId: skill.id,
  });

  return nextState;
}

function applySacrificeHeal(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "sacrificeHeal") {
    return state;
  }

  const sacrifice = applyCurrentHpSacrifice(
    state,
    caster,
    skill.effect.hpCostCurrentPercent,
    { respectSafetyFloor: target.id !== caster.id },
  );

  if (!sacrifice) {
    return state;
  }

  const currentTarget = sacrifice.state.entities[target.id];

  if (!isLivingCompanion(currentTarget) || currentTarget.health >= currentTarget.maxHealth) {
    return state;
  }

  const healAmount = Math.max(
    1,
    Math.round(sacrifice.sacrificedHp * skill.effect.healSacrificeMultiplier),
  );
  const healResult = applyCompanionHealing(
    sacrifice.state,
    currentTarget,
    healAmount,
    now,
    { sourceId: caster.id, feedback: false },
  );
  let nextState = healResult.state;

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: currentTarget.id,
    now,
    durationMs: 1000,
  });
  nextState = addCombatFeedback(nextState, {
    type: "heal",
    entityId: currentTarget.id,
    amount: healResult.healedAmount,
    sourceEntityId: caster.id,
    targetEntityId: currentTarget.id,
    text: `+${healResult.healedAmount} HP`,
    now,
  });
  nextState = appendDebugTelemetryEvent(nextState, {
    type: "healing_resolved",
    entityId: caster.id,
    targetId: currentTarget.id,
    healingMultiplier: skill.effect.healSacrificeMultiplier,
    healingAmount: healResult.healedAmount,
    previousHealth: currentTarget.health,
    nextHealth: healResult.target.health,
    skillId: skill.id,
  });

  return nextState;
}

function applyEternalHope(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "eternalHope" ||
    state.skillSelfMitigationBuffsByCompanionId?.[caster.id] ||
    state.skillHealOverTimesByCompanionId?.[caster.id]
  ) {
    return state;
  }

  const sacrifice = applyCurrentHpSacrifice(
    state,
    caster,
    skill.effect.hpCostCurrentPercent,
    { respectSafetyFloor: false },
  );

  if (!sacrifice) {
    return state;
  }

  const tickCount = Math.max(
    1,
    Math.floor(skill.effect.durationMs / skill.effect.tickIntervalMs),
  );
  const healAmountPerTick = Math.max(
    1,
    Math.round(
      (sacrifice.sacrificedHp * skill.effect.healSacrificeMultiplier) /
        tickCount,
    ),
  );
  let nextState: GameState = {
    ...sacrifice.state,
    skillSelfMitigationBuffsByCompanionId: {
      ...(sacrifice.state.skillSelfMitigationBuffsByCompanionId ?? {}),
      [caster.id]: {
        id: `${caster.id}-${skill.id}`,
        sourceId: caster.id,
        mitigationPercent: skill.effect.mitigationPercent,
        expiresAt: now + skill.effect.durationMs,
        mitigatedDamageTypes: skill.effect.mitigatedDamageTypes,
      },
    },
    skillHealOverTimesByCompanionId: {
      ...(sacrifice.state.skillHealOverTimesByCompanionId ?? {}),
      [caster.id]: {
        id: `${caster.id}-${skill.id}`,
        targetId: caster.id,
        sourceId: caster.id,
        healAmountPerTick,
        tickIntervalMs: skill.effect.tickIntervalMs,
        nextTickAt: now + skill.effect.tickIntervalMs,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: caster.id,
    now,
    durationMs: 1000,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function canApplyRefreshableRuntimeState(
  expiresAt: number | undefined,
  refreshWindowMs = 0,
  now: number,
): boolean {
  return expiresAt === undefined || expiresAt - now <= refreshWindowMs;
}

function applyCurrentHpSacrifice(
  state: GameState,
  caster: Companion,
  hpCostCurrentPercent: number,
  { respectSafetyFloor }: { respectSafetyFloor: boolean },
): { state: GameState; caster: Companion; sacrificedHp: number } | null {
  const currentCaster = state.entities[caster.id];

  if (!isLivingCompanion(currentCaster)) {
    return null;
  }

  const sacrificedHp = Math.max(
    1,
    Math.ceil(currentCaster.health * (hpCostCurrentPercent / 100)),
  );
  const nextHealth = currentCaster.health - sacrificedHp;

  if (nextHealth < 1) {
    return null;
  }

  if (respectSafetyFloor) {
    const safetyFloor =
      getCompanionSkillBehavior(currentCaster).selfSacrificeSafetyFloorPercent;
    const nextHealthPercent =
      currentCaster.maxHealth > 0 ? (nextHealth / currentCaster.maxHealth) * 100 : 0;

    if (nextHealthPercent < safetyFloor) {
      return null;
    }
  }

  const nextCaster: Companion = {
    ...currentCaster,
    health: nextHealth,
  };

  return {
    state: updateEntity(state, nextCaster),
    caster: nextCaster,
    sacrificedHp,
  };
}

function getLivingEnemiesInRange(
  state: GameState,
  caster: Companion,
  range: number,
): Enemy[] {
  return Object.values(state.entities).filter(
    (entity): entity is Enemy =>
      isLivingEnemy(entity) &&
      getGridDistance(caster.position, entity.position) <= range,
  );
}

function damageEnemy(
  state: GameState,
  caster: Companion,
  target: Enemy,
  label: string,
  now: number,
  damageType: "physical" | "magic",
  powerMultiplier: number,
  allowPassiveBlock: boolean,
): GameState {
  const combatResult = resolveAndApplyCombatDamage(state, caster, target, {
    damageType,
    powerMultiplier,
    allowEvasion: true,
    allowPassiveBlock,
    now,
    label,
  });
  let nextState = combatResult.state;
  const damagedTarget = combatResult.target;

  if (damagedTarget.kind === "enemy" && damagedTarget.state === "dead") {
    nextState = grantCharacterXpToParty(nextState, damagedTarget, caster.id, now);
    nextState = recordEnemyDefeatedForQuests(
      nextState,
      damagedTarget,
      nextState.currentMapId,
      Math.random,
      now,
    );
    if (!damagedTarget.questSpawn?.suppressNormalDrops) {
      nextState = handleEnemyDefeatedDrops(nextState, damagedTarget, caster.id, now);
    }
  }

  if (damagedTarget.kind === "enemy" && damagedTarget.state !== "dead") {
    nextState = updateEntity(nextState, {
      ...damagedTarget,
      state: "attack",
      currentTargetId: caster.id,
    });
  }

  return nextState;
}

function applyWhipPrison(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "whipPrison") {
    return state;
  }

  let nextState = state;
  const controlTargets = [caster.id, target.id];

  for (const targetId of controlTargets) {
    for (const type of ["immobilized", "disarmed", "silenced"] as const) {
      nextState = applyStatusEffect(
        nextState,
        {
          type,
          targetId,
          durationMs: skill.effect.controlDurationMs,
          sourceId: caster.id,
          sourceKey: skill.id,
        },
        now,
      );
    }
  }

  nextState = applyBleed(nextState, caster, target, {
    durationMs: skill.effect.bleedDurationMs,
    tickIntervalMs: skill.effect.bleedTickIntervalMs,
    damageAttackPowerPercent: skill.effect.bleedDamageAttackPowerPercent,
    sourceKey: skill.effect.sourceKey,
    now,
  });
  nextState = updateEntity(nextState, {
    ...target,
    state: "attack",
    currentTargetId: caster.id,
  });
  nextState = addSkillVisualEvent(nextState, {
    type: "slash",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return nextState;
}

function applyFlagellantLash(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "flagellantLash") {
    return state;
  }

  const sacrifice = applyCurrentHpSacrifice(
    state,
    caster,
    skill.effect.hpCostCurrentPercent,
    { respectSafetyFloor: true },
  );

  if (!sacrifice) {
    return state;
  }

  const currentCaster = sacrifice.caster;
  let nextState = damageEnemy(
    sacrifice.state,
    currentCaster,
    target,
    skill.displayName,
    now,
    skill.effect.damageType,
    skill.effect.powerMultiplier,
    true,
  );
  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget)) {
    nextState = applyBleed(nextState, currentCaster, currentTarget, {
      durationMs: skill.effect.bleedDurationMs,
      tickIntervalMs: skill.effect.bleedTickIntervalMs,
      damageAttackPowerPercent: skill.effect.bleedDamageAttackPowerPercent,
      sourceKey: skill.effect.sourceKey,
      now,
    });
  }

  return nextState;
}

function applyBurning(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "flameStep" && skill.effect.type !== "fireBurst") {
    return state;
  }

  const magicPower = getCompanionDerivedStatsWithPartyBuffs(state, caster).magicPower;
  const tickDamage = Math.max(
    1,
    magicPower * (skill.effect.burnDamageMagicPowerPercent / 100),
  );

  return applyStatusEffect(
    state,
    {
      type: "burning",
      targetId: target.id,
      durationMs: skill.effect.burnDurationMs,
      tickDamage,
      sourceId: caster.id,
      sourceKey: skill.effect.sourceKey,
      tickIntervalMs: skill.effect.burnTickIntervalMs,
    },
    now,
  );
}

function applyBleed(
  state: GameState,
  caster: Companion,
  target: Enemy,
  {
    damageAttackPowerPercent,
    durationMs,
    now,
    sourceKey,
    tickIntervalMs,
  }: {
    damageAttackPowerPercent: number;
    durationMs: number;
    now: number;
    sourceKey: string;
    tickIntervalMs: number;
  },
): GameState {
  const attack = getCompanionDerivedStatsWithPartyBuffs(state, caster).attack;
  const tickDamage = Math.max(1, attack * (damageAttackPowerPercent / 100));

  return applyStatusEffect(
    state,
    {
      type: "bleed",
      targetId: target.id,
      durationMs,
      tickDamage,
      sourceId: caster.id,
      sourceKey,
      tickIntervalMs,
    },
    now,
  );
}

function getUpdatedShieldBlock(
  state: GameState,
  owner: Companion,
  shield: SkillShieldBlockState,
): SkillShieldBlockState {
  const shieldPlacement = getShieldPlacement(
    state,
    owner,
    getDirectionFromShieldRotation(shield.rotationRadians),
  );

  return {
    ...shield,
    position: shieldPlacement.position,
    rotationRadians: shieldPlacement.rotationRadians,
  };
}

function getShieldPlacement(
  state: GameState,
  caster: Companion,
  fallbackDirection = DEFAULT_SHIELD_DIRECTION,
): { position: Position; rotationRadians: number } {
  const direction = getUnitDirection(
    getShieldDirection(state, caster),
    fallbackDirection,
  );

  if (direction.x === 0 && direction.y === 0) {
    return {
      position: caster.position,
      rotationRadians: 0,
    };
  }

  return {
    position: {
      x: caster.position.x + direction.x * SHIELD_OFFSET_DISTANCE,
      y: caster.position.y + direction.y * SHIELD_OFFSET_DISTANCE,
    },
    rotationRadians: Math.atan2(direction.y, direction.x) - Math.PI / 2,
  };
}

function getUnitDirection(
  direction: Position,
  fallbackDirection: Position,
): Position {
  const directionLength = Math.hypot(direction.x, direction.y);

  if (directionLength > 0) {
    return {
      x: direction.x / directionLength,
      y: direction.y / directionLength,
    };
  }

  const fallbackLength = Math.hypot(fallbackDirection.x, fallbackDirection.y);

  if (fallbackLength === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: fallbackDirection.x / fallbackLength,
    y: fallbackDirection.y / fallbackLength,
  };
}

function getDirectionFromShieldRotation(rotationRadians: number): Position {
  const directionRadians = rotationRadians + Math.PI / 2;

  return {
    x: Math.cos(directionRadians),
    y: Math.sin(directionRadians),
  };
}

function getShieldDirection(state: GameState, caster: Companion): Position {
  const enemy = findEnemyTarget(state, caster, 5);
  const direction = enemy
    ? {
        x: Math.sign(enemy.position.x - caster.position.x),
        y: Math.sign(enemy.position.y - caster.position.y),
      }
    : getLeaderMovementDirection(state, caster);

  if (direction.x !== 0 || direction.y !== 0) {
    return direction;
  }

  const previousPosition = state.followTrailsByEntityId[caster.id]?.[0];

  if (!previousPosition) {
    return direction;
  }

  return {
    x: Math.sign(caster.position.x - previousPosition.x),
    y: Math.sign(caster.position.y - previousPosition.y),
  };
}
