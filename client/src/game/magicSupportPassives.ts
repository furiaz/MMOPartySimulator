import { isLivingCompanion } from "./entityGuards";
import { getLearnedPassiveRank } from "./passiveSkills";
import { getSkillScaleUnits } from "./skillProgression";
import type { GameState } from "./state";
import type {
  ActiveSkillDefinition,
  Companion,
  OverflowingGraceBarrierState,
  SkillDefinition,
} from "./types";

const MANY_BEACONS_MEMORY_MS = 10_000;
const CRUEL_MERCY_CHARGE_MS = 10_000;
const OVERFLOWING_GRACE_BARRIER_MS = 8_000;

export type PreparedMagicSupportSkill = {
  skill: ActiveSkillDefinition;
  additionalPowerBonusPercent: number;
};

export function getArcaneCrescendoSpellThreshold(rank: number): number {
  return Math.max(6, 10 - Math.floor((Math.max(1, Math.floor(rank)) - 1) / 5));
}

export function getArcaneCrescendoDamageBonusPercent(rank: number): number {
  return 4 * Math.max(1, Math.floor(rank));
}

export function getOverflowingGraceRankValues(rank: number): {
  conversionPercent: number;
  barrierCapPercentMaxHealth: number;
} {
  const normalizedRank = Math.max(1, Math.floor(rank));
  return {
    conversionPercent: 5 * normalizedRank,
    barrierCapPercentMaxHealth: normalizedRank,
  };
}

export function getStableOverchargeReductionPointsForRank(rank: number): number {
  return getSkillScaleUnits(rank);
}

export function getStableOverchargeReductionPoints(
  companion: Companion,
): number {
  const rank = getLearnedPassiveRank(companion, "stable_overcharge");
  return rank ? getStableOverchargeReductionPointsForRank(rank) : 0;
}

export function getActiveRunicInscriptionCount(
  state: GameState,
  caster: Companion,
  now: number,
): number {
  const hasBindingRune = Object.values(state.statusEffectsById ?? {}).some(
    (status) =>
      status.sourceId === caster.id &&
      status.sourceKey === "binding_rune" &&
      status.expiresAt > now,
  );
  const hasWardingGlyph = Object.values(state.skillShieldBlocksById ?? {}).some(
    (shield) =>
      shield.sourceId === caster.id &&
      shield.sourceSkillId === "warding_glyph" &&
      shield.expiresAt > now,
  );
  const hasRewindRune = Object.values(
    state.skillRewindRunesByCompanionId ?? {},
  ).some(
    (rewind) =>
      rewind.sourceId === caster.id &&
      rewind.sourceSkillId === "rewind_rune" &&
      rewind.expiresAt > now,
  );
  const hasLeylineMatrix = Object.values(
    state.skillPartyClassBuffsByCompanionId ?? {},
  ).some((buffsByClass) =>
    Object.values(buffsByClass).some(
      (buff) =>
        buff?.sourceId === caster.id &&
        buff.sourceSkillId === "leyline_matrix" &&
        buff.expiresAt > now,
    ),
  );
  const hasRuneStepTrap = Object.values(state.statusEffectsById ?? {}).some(
    (status) =>
      status.sourceId === caster.id &&
      status.sourceKey === "rune_step" &&
      status.expiresAt > now,
  );

  return Math.min(
    2,
    [
      hasBindingRune,
      hasWardingGlyph,
      hasRewindRune,
      hasLeylineMatrix,
      hasRuneStepTrap,
    ].filter(Boolean).length,
  );
}

export function prepareMagicSupportSkill(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  targetId: string | undefined,
  now: number,
  isRunicFocusDuplicate: boolean,
): PreparedMagicSupportSkill {
  let preparedSkill = skill;
  let additionalPowerBonusPercent = 0;

  if (!isRunicFocusDuplicate) {
    additionalPowerBonusPercent += getArcaneCrescendoBonusPercent(
      state,
      caster,
      skill,
    );
    additionalPowerBonusPercent += getManyBeaconsBonusPercent(
      state,
      caster,
      skill,
      targetId,
      now,
    );
    additionalPowerBonusPercent += getCruelMercyBonusPercent(
      state,
      caster,
      skill,
      now,
    );
  }

  const runecasterBonus = getRunecasterEffectStrengthBonusPercent(
    state,
    caster,
    skill,
    now,
    isRunicFocusDuplicate,
  );
  if (runecasterBonus > 0) {
    preparedSkill = applyRunecasterEffectStrength(preparedSkill, runecasterBonus);
  }

  return { skill: preparedSkill, additionalPowerBonusPercent };
}

export function getCrimsonAuthorityDurationMs(
  caster: Companion,
  skill: SkillDefinition,
  baseDurationMs: number,
): number {
  const rank = getLearnedPassiveRank(caster, "crimson_authority");
  if (
    !rank ||
    skill.classId !== "penitent" ||
    caster.maxHealth <= 0 ||
    caster.health / caster.maxHealth > 0.5
  ) {
    return baseDurationMs;
  }

  return Math.round(
    baseDurationMs * (1 + (3 * getSkillScaleUnits(rank)) / 100),
  );
}

export function recordSuccessfulMagicSupportSkill(
  beforeState: GameState,
  afterState: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  targetId: string | undefined,
  now: number,
  isRunicFocusDuplicate: boolean,
): GameState {
  if (isRunicFocusDuplicate) {
    return afterState;
  }

  let nextState = recordArcaneCrescendo(afterState, caster, skill);
  nextState = recordWordResonance(nextState, caster, skill);
  nextState = recordManyBeacons(nextState, caster, skill, targetId, now);
  nextState = updateCruelMercyAfterSkill(
    beforeState,
    nextState,
    caster,
    skill,
    targetId,
    now,
  );
  return nextState;
}

export function applyOverflowingGraceFromDirectHeal(
  state: GameState,
  caster: Companion,
  target: Companion,
  overhealingAmount: number,
  now: number,
): GameState {
  const rank = getLearnedPassiveRank(caster, "overflowing_grace");
  if (!rank || overhealingAmount <= 0) {
    return state;
  }

  const values = getOverflowingGraceRankValues(rank);
  const maxAbsorb = Math.max(
    1,
    Math.round(target.maxHealth * (values.barrierCapPercentMaxHealth / 100)),
  );
  const gainedAbsorb = Math.max(
    1,
    Math.round(overhealingAmount * (values.conversionPercent / 100)),
  );
  const current = state.overflowingGraceBarriersByCompanionId?.[target.id];
  const currentAbsorb = current && current.expiresAt > now
    ? current.remainingAbsorb
    : 0;
  const remainingAbsorb = Math.min(maxAbsorb, currentAbsorb + gainedAbsorb);

  return {
    ...state,
    overflowingGraceBarriersByCompanionId: {
      ...(state.overflowingGraceBarriersByCompanionId ?? {}),
      [target.id]: {
        targetId: target.id,
        sourceId: caster.id,
        remainingAbsorb,
        maxAbsorb,
        expiresAt: now + OVERFLOWING_GRACE_BARRIER_MS,
      },
    },
  };
}

export function absorbWithOverflowingGrace(
  state: GameState,
  target: Companion,
  rawDamage: number,
  now: number,
): { state: GameState; remainingDamage: number; absorbedDamage: number } {
  const barrier = state.overflowingGraceBarriersByCompanionId?.[target.id];
  if (!barrier || barrier.expiresAt <= now || rawDamage <= 0) {
    return { state, remainingDamage: rawDamage, absorbedDamage: 0 };
  }

  const absorbedDamage = Math.min(rawDamage, barrier.remainingAbsorb);
  const remainingAbsorb = barrier.remainingAbsorb - absorbedDamage;
  const overflowingGraceBarriersByCompanionId = {
    ...(state.overflowingGraceBarriersByCompanionId ?? {}),
  };
  if (remainingAbsorb > 0) {
    overflowingGraceBarriersByCompanionId[target.id] = {
      ...barrier,
      remainingAbsorb,
    };
  } else {
    delete overflowingGraceBarriersByCompanionId[target.id];
  }

  return {
    state: { ...state, overflowingGraceBarriersByCompanionId },
    remainingDamage: Math.max(0, rawDamage - absorbedDamage),
    absorbedDamage,
  };
}

export function updateMagicSupportPassiveRuntime(
  state: GameState,
  now: number,
): GameState {
  const isActiveCompanion = (companionId: string) =>
    isLivingCompanion(state.entities[companionId]);
  const arcaneCrescendoByCompanionId = filterRecord(
    state.arcaneCrescendoByCompanionId,
    (value) => isActiveCompanion(value.companionId),
  );
  const wordResonanceByCompanionId = filterRecord(
    state.wordResonanceByCompanionId,
    (value) => isActiveCompanion(value.companionId),
  );
  const manyBeaconsByCompanionId = filterRecord(
    state.manyBeaconsByCompanionId,
    (value) => value.expiresAt > now && isActiveCompanion(value.companionId),
  );
  const cruelMercyByCompanionId = filterRecord(
    state.cruelMercyByCompanionId,
    (value) => value.expiresAt > now && isActiveCompanion(value.companionId),
  );
  const overflowingGraceBarriersByCompanionId = filterRecord(
    state.overflowingGraceBarriersByCompanionId,
    (value) => value.expiresAt > now && isActiveCompanion(value.targetId),
  );

  if (
    arcaneCrescendoByCompanionId === state.arcaneCrescendoByCompanionId &&
    wordResonanceByCompanionId === state.wordResonanceByCompanionId &&
    manyBeaconsByCompanionId === state.manyBeaconsByCompanionId &&
    cruelMercyByCompanionId === state.cruelMercyByCompanionId &&
    overflowingGraceBarriersByCompanionId ===
      state.overflowingGraceBarriersByCompanionId
  ) {
    return state;
  }

  return {
    ...state,
    arcaneCrescendoByCompanionId,
    wordResonanceByCompanionId,
    manyBeaconsByCompanionId,
    cruelMercyByCompanionId,
    overflowingGraceBarriersByCompanionId,
  };
}

function getArcaneCrescendoBonusPercent(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
): number {
  const rank = getLearnedPassiveRank(caster, "arcane_crescendo");
  const runtime = state.arcaneCrescendoByCompanionId?.[caster.id];
  const charged = Boolean(
    runtime?.charged ||
      (rank &&
        (runtime?.offensiveSpellCount ?? 0) >=
          getArcaneCrescendoSpellThreshold(rank)),
  );
  return rank && charged && skill.offensiveSpell && skill.tags.includes("AoE")
    ? getArcaneCrescendoDamageBonusPercent(rank)
    : 0;
}

function getManyBeaconsBonusPercent(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  targetId: string | undefined,
  now: number,
): number {
  const rank = getLearnedPassiveRank(caster, "many_beacons");
  const memory = state.manyBeaconsByCompanionId?.[caster.id];
  return rank &&
    targetId &&
    isDirectHealingSkill(skill) &&
    memory &&
    memory.expiresAt > now &&
    memory.previousTargetId !== targetId
    ? 2 * getSkillScaleUnits(rank)
    : 0;
}

function getCruelMercyBonusPercent(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  now: number,
): number {
  const rank = getLearnedPassiveRank(caster, "cruel_mercy");
  const charge = state.cruelMercyByCompanionId?.[caster.id];
  return rank && charge && charge.expiresAt > now && isDamagingPenitentSkill(skill)
    ? 3 * getSkillScaleUnits(rank)
    : 0;
}

function getRunecasterEffectStrengthBonusPercent(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  now: number,
  isRunicFocusDuplicate: boolean,
): number {
  if (skill.classId !== "runecaster") {
    return 0;
  }

  let bonus = 0;
  const resonanceRank = getLearnedPassiveRank(caster, "word_resonance");
  const previousPrimary =
    state.wordResonanceByCompanionId?.[caster.id]?.previousPrimaryRuneWordId;
  if (
    !isRunicFocusDuplicate &&
    resonanceRank &&
    previousPrimary &&
    skill.runeWords &&
    previousPrimary !== skill.runeWords.primary.id
  ) {
    bonus += 2 * getSkillScaleUnits(resonanceRank);
  }

  const inscriptionRank = getLearnedPassiveRank(caster, "living_inscription");
  if (inscriptionRank) {
    bonus +=
      getActiveRunicInscriptionCount(state, caster, now) *
      getSkillScaleUnits(inscriptionRank);
  }
  return bonus;
}

function recordArcaneCrescendo(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
): GameState {
  const rank = getLearnedPassiveRank(caster, "arcane_crescendo");
  if (!rank || !skill.offensiveSpell) {
    return state;
  }

  const current = state.arcaneCrescendoByCompanionId?.[caster.id] ?? {
    companionId: caster.id,
    offensiveSpellCount: 0,
    charged: false,
  };
  const threshold = getArcaneCrescendoSpellThreshold(rank);
  const wasCharged = current.charged || current.offensiveSpellCount >= threshold;
  const triggered = wasCharged && skill.tags.includes("AoE");
  const offensiveSpellCount = triggered
    ? 0
    : wasCharged
      ? current.offensiveSpellCount
      : Math.min(threshold, current.offensiveSpellCount + 1);

  return {
    ...state,
    arcaneCrescendoByCompanionId: {
      ...(state.arcaneCrescendoByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        offensiveSpellCount,
        charged: triggered ? false : wasCharged || offensiveSpellCount >= threshold,
      },
    },
  };
}

function recordWordResonance(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
): GameState {
  if (
    !getLearnedPassiveRank(caster, "word_resonance") ||
    skill.classId !== "runecaster" ||
    !skill.runeWords
  ) {
    return state;
  }

  return {
    ...state,
    wordResonanceByCompanionId: {
      ...(state.wordResonanceByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        previousPrimaryRuneWordId: skill.runeWords.primary.id,
      },
    },
  };
}

function recordManyBeacons(
  state: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  targetId: string | undefined,
  now: number,
): GameState {
  if (
    !targetId ||
    !getLearnedPassiveRank(caster, "many_beacons") ||
    !isDirectHealingSkill(skill)
  ) {
    return state;
  }

  return {
    ...state,
    manyBeaconsByCompanionId: {
      ...(state.manyBeaconsByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        previousTargetId: targetId,
        expiresAt: now + MANY_BEACONS_MEMORY_MS,
      },
    },
  };
}

function updateCruelMercyAfterSkill(
  beforeState: GameState,
  afterState: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  targetId: string | undefined,
  now: number,
): GameState {
  const rank = getLearnedPassiveRank(caster, "cruel_mercy");
  if (!rank) {
    return afterState;
  }

  const cruelMercyByCompanionId = {
    ...(afterState.cruelMercyByCompanionId ?? {}),
  };
  const charge = beforeState.cruelMercyByCompanionId?.[caster.id];
  if (charge && charge.expiresAt > now && isDamagingPenitentSkill(skill)) {
    delete cruelMercyByCompanionId[caster.id];
  }

  if (didSuccessfullySupportOther(beforeState, afterState, caster, skill, targetId)) {
    cruelMercyByCompanionId[caster.id] = {
      companionId: caster.id,
      expiresAt: now + CRUEL_MERCY_CHARGE_MS,
    };
  }

  return { ...afterState, cruelMercyByCompanionId };
}

function didSuccessfullySupportOther(
  beforeState: GameState,
  afterState: GameState,
  caster: Companion,
  skill: ActiveSkillDefinition,
  targetId: string | undefined,
): boolean {
  const healedOther = Object.values(afterState.entities).some((entity) => {
    if (!isLivingCompanion(entity) || entity.id === caster.id) {
      return false;
    }
    const previous = beforeState.entities[entity.id];
    return isLivingCompanion(previous) && entity.health > previous.health;
  });
  const shieldedOther =
    targetId !== undefined &&
    targetId !== caster.id &&
    (skill.effect.type === "barrierBlock" ||
      skill.effect.type === "sacrificialBarrier");
  const graceShieldedOther = Object.values(
    afterState.overflowingGraceBarriersByCompanionId ?? {},
  ).some((barrier) => {
    if (barrier.sourceId !== caster.id || barrier.targetId === caster.id) {
      return false;
    }
    const previous =
      beforeState.overflowingGraceBarriersByCompanionId?.[barrier.targetId];
    return !previous || barrier.remainingAbsorb > previous.remainingAbsorb;
  });
  return healedOther || shieldedOther || graceShieldedOther;
}

function isDirectHealingSkill(skill: ActiveSkillDefinition): boolean {
  return [
    "heal",
    "circleOfRenewal",
    "selfPercentHeal",
    "sacrificeHeal",
    "atonementStep",
    "selfCostHeal",
  ].includes(skill.effect.type);
}

function isDamagingPenitentSkill(skill: ActiveSkillDefinition): boolean {
  return (
    skill.classId === "penitent" &&
    (skill.effect.type === "whipPrison" || skill.effect.type === "flagellantLash")
  );
}

function applyRunecasterEffectStrength(
  skill: ActiveSkillDefinition,
  bonusPercent: number,
): ActiveSkillDefinition {
  const multiplier = 1 + bonusPercent / 100;
  const effect = skill.effect;
  switch (effect.type) {
    case "damage":
      return { ...skill, effect: { ...effect, powerMultiplier: effect.powerMultiplier * multiplier } };
    case "pinningShot":
      return { ...skill, effect: { ...effect, durationMs: Math.round(effect.durationMs * multiplier) } };
    case "barrierBlock":
      return { ...skill, effect: { ...effect, durationMs: Math.round(effect.durationMs * multiplier) } };
    case "rewindRune":
      return { ...skill, effect: { ...effect, healPercentRecordedDamage: effect.healPercentRecordedDamage * multiplier } };
    case "partyClassBuff":
      return {
        ...skill,
        effect: {
          ...effect,
          primaryStatBonusPercentByStat: effect.primaryStatBonusPercentByStat
            ? Object.fromEntries(Object.entries(effect.primaryStatBonusPercentByStat).map(([id, value]) => [id, value * multiplier]))
            : undefined,
          mitigationPercent: effect.mitigationPercent
            ? effect.mitigationPercent * multiplier
            : undefined,
        },
      };
    case "gatherBuff":
      return { ...skill, effect: { ...effect, bonusGatherSpeed: effect.bonusGatherSpeed * multiplier } };
    case "runeStep":
      return {
        ...skill,
        effect: {
          ...effect,
          trapImmobilizeDurationMs: Math.round(effect.trapImmobilizeDurationMs * multiplier),
        },
      };
    default:
      return skill;
  }
}

function filterRecord<T>(
  record: Record<string, T> | undefined,
  keep: (value: T) => boolean,
): Record<string, T> | undefined {
  if (!record) {
    return record;
  }
  const entries = Object.entries(record);
  const keptEntries = entries.filter(([, value]) => keep(value));
  return keptEntries.length === entries.length
    ? record
    : Object.fromEntries(keptEntries);
}

export function getOverflowingGraceBarrier(
  state: GameState,
  targetId: string,
  now: number,
): OverflowingGraceBarrierState | undefined {
  const barrier = state.overflowingGraceBarriersByCompanionId?.[targetId];
  return barrier && barrier.expiresAt > now ? barrier : undefined;
}
