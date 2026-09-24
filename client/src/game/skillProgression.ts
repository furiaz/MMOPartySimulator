import { countInventoryItem, removeItemFromInventoryState } from "./inventory";
import { getItemDefinition } from "./items";
import {
  getActiveSkillsForClass,
  getSkillsForClass,
  SKILL_DEFINITIONS,
} from "./skills";
import { getOverchargeRankValues } from "./skillOvercharge";
import type { GameState } from "./state";
import type {
  ClassId,
  Companion,
  CompanionSkillProgression,
  ActiveSkillDefinition,
  ItemDefinition,
  ItemId,
  PartyInventory,
  PassiveSkillDefinition,
  SkillDefinition,
  SkillId,
} from "./types";

export const BEGINNER_SKILL_MAX_RANK = 5;
export const BEGINNER_SKILL_MAX_RANK_AFTER_FIRST_CLASS = 10;
export const CLASS_SKILL_MAX_RANK = 5;
export const LEGACY_SKILL_UNLOCK_RANK = 5;
export const SKILL_RANK_BONUS_PER_RANK = 0.05;

const DOT_DAMAGE_PERCENT_BY_SKILL_RANK: Partial<Record<SkillId, number[]>> = {
  poison_coating: [1, 2, 3, 4, 5],
  flame_step: [4, 6, 8, 10, 12],
  fire_burst: [2, 3, 4, 5, 6],
  whip_prison: [3, 4, 5, 6, 7],
  flagellant_lash: [2, 3, 4, 5, 6],
};

export const SKILL_BOOK_ITEM_IDS_BY_SKILL_ID: Record<SkillId, ItemId> = {
  throw_rock: "throw_rock_skill_book",
  kick: "kick_skill_book",
  guard_up: "guard_up_skill_book",
  first_aid: "first_aid_skill_book",
  deep_breath: "deep_breath_skill_book",
  rally_call: "rally_call_skill_book",
  field_hands: "field_hands_skill_book",
  follow_through: "follow_through_skill_book",
  resourcefulness: "resourcefulness_skill_book",
  steady_nerves: "steady_nerves_skill_book",
  duelists_momentum: "duelists_momentum_skill_book",
  riposte_training: "riposte_training_skill_book",
  duelist_challenge: "duelist_challenge_skill_book",
  second_wind: "second_wind_skill_book",
  blade_parry: "blade_parry_skill_book",
  edge_focus: "edge_focus_skill_book",
  press_the_opening: "press_the_opening_skill_book",
  woodcutter_rhythm: "woodcutter_rhythm_skill_book",
  flash_step: "flash_step_skill_book",
  sweeping_strike: "sweeping_strike_skill_book",
  rooted_bastion: "rooted_bastion_skill_book",
  unbroken_line: "unbroken_line_skill_book",
  shield_challenge: "shield_challenge_skill_book",
  hold_fast: "hold_fast_skill_book",
  guard_wall: "guard_wall_skill_book",
  iron_stance: "iron_stance_skill_book",
  shield_formation: "shield_formation_skill_book",
  stonebreaker_rhythm: "stonebreaker_rhythm_skill_book",
  shield_rush: "shield_rush_skill_book",
  shield_shockwave: "shield_shockwave_skill_book",
  pinning_shot: "pinning_shot_skill_book",
  fake_death: "fake_death_skill_book",
  evasive_instinct: "evasive_instinct_skill_book",
  hunters_focus: "hunters_focus_skill_book",
  poison_coating: "poison_coating_skill_book",
  herbalist_rhythm: "herbalist_rhythm_skill_book",
  skirmish_shot: "skirmish_shot_skill_book",
  arrow_burst: "arrow_burst_skill_book",
  headhunter: "headhunter_skill_book",
  exploit_the_snare: "exploit_the_snare_skill_book",
  threatening_roar: "threatening_roar_skill_book",
  blood_feast: "blood_feast_skill_book",
  rugged_hide: "rugged_hide_skill_book",
  feral_surge: "feral_surge_skill_book",
  pack_frenzy: "pack_frenzy_skill_book",
  stoneclaw_rhythm: "stoneclaw_rhythm_skill_book",
  pounce: "pounce_skill_book",
  maul_sweep: "maul_sweep_skill_book",
  blood_scent: "blood_scent_skill_book",
  pack_instinct: "pack_instinct_skill_book",
  elemental_bolt: "elemental_bolt_skill_book",
  mana_shield: "mana_shield_skill_book",
  frost_armor: "frost_armor_skill_book",
  overcharge: "overcharge_skill_book",
  arcane_conduit: "arcane_conduit_skill_book",
  emberwood_rhythm: "emberwood_rhythm_skill_book",
  flame_step: "flame_step_skill_book",
  fire_burst: "fire_burst_skill_book",
  stable_overcharge: "stable_overcharge_skill_book",
  arcane_crescendo: "arcane_crescendo_skill_book",
  binding_rune: "binding_rune_skill_book",
  rune_lance: "rune_lance_skill_book",
  warding_glyph: "warding_glyph_skill_book",
  rewind_rune: "rewind_rune_skill_book",
  runic_focus: "runic_focus_skill_book",
  leyline_matrix: "leyline_matrix_skill_book",
  stone_sigil_rhythm: "stone_sigil_rhythm_skill_book",
  rune_step: "rune_step_skill_book",
  word_resonance: "word_resonance_skill_book",
  living_inscription: "living_inscription_skill_book",
  blinding_ray: "blinding_ray_skill_book",
  light_mend: "light_mend_skill_book",
  sanctuary_veil: "sanctuary_veil_skill_book",
  guiding_light: "guiding_light_skill_book",
  radiant_benediction: "radiant_benediction_skill_book",
  herbalist_hymn: "herbalist_hymn_skill_book",
  dawn_step: "dawn_step_skill_book",
  circle_of_renewal: "circle_of_renewal_skill_book",
  overflowing_grace: "overflowing_grace_skill_book",
  many_beacons: "many_beacons_skill_book",
  whip_prison: "whip_prison_skill_book",
  flagellant_lash: "flagellant_lash_skill_book",
  martyrs_veil: "martyrs_veil_skill_book",
  penitents_gift: "penitents_gift_skill_book",
  eternal_hope: "eternal_hope_skill_book",
  burdened_benediction: "burdened_benediction_skill_book",
  woodcutting_penance: "woodcutting_penance_skill_book",
  atonement_step: "atonement_step_skill_book",
  crimson_authority: "crimson_authority_skill_book",
  cruel_mercy: "cruel_mercy_skill_book",
};

export type ReadSkillBookFailureReason =
  | "invalid_companion"
  | "invalid_item"
  | "not_skill_book"
  | "book_not_in_inventory"
  | "unknown_skill"
  | "skill_unavailable"
  | "skill_maxed"
  | "insufficient_books"
  | "inventory_remove_failed";

export type ReadSkillBookResult =
  | {
      status: "success";
      companionId: string;
      itemId: ItemId;
      skillId: SkillId;
      displayName: string;
      previousRank: number;
      newRank: number;
      maxRank: number;
      booksConsumed: number;
    }
  | {
      status: "failed";
      companionId: string;
      itemId: ItemId;
      skillId?: SkillId;
      displayName?: string;
      currentRank?: number;
      maxRank?: number;
      requiredBooks?: number;
      availableBooks?: number;
      reason: ReadSkillBookFailureReason;
    };

export type SkillBookReadCandidate = {
  companion: Companion;
  currentRank: number;
  maxRank: number;
  requiredBooks: number;
  availableBooks: number;
  status: "eligible" | "insufficient_books";
};

export type LearnedSkillGroup = {
  classId: ClassId;
  skills: ActiveSkillDefinition[];
};

export function createCompanionSkillProgressionForClass(
  classId: ClassId,
): CompanionSkillProgression {
  return {
    ranksBySkillId: Object.fromEntries(
      getSkillsForClass(classId).map((skill) => [skill.id, 1]),
    ) as Partial<Record<SkillId, number>>,
    legacyEnabledSkillIds: [],
  };
}

export function ensureCompanionSkillProgressionForClass(
  companion: Companion,
  classId = companion.classId,
): Companion {
  const progression = companion.skillProgression ?? {
    ranksBySkillId: {},
    legacyEnabledSkillIds: [],
  };
  const ranksBySkillId = { ...progression.ranksBySkillId };

  for (const skill of getSkillsForClass(classId)) {
    ranksBySkillId[skill.id] = clampRank(
      ranksBySkillId[skill.id] ?? 1,
      getCompanionSkillMaxRank(companion, skill),
    );
  }

  return {
    ...companion,
    classId,
    skillProgression: sanitizeCompanionSkillProgression({
      ...companion,
      classId,
      skillProgression: {
        ranksBySkillId,
        legacyEnabledSkillIds: progression.legacyEnabledSkillIds ?? [],
      },
    }),
  };
}

export function getCompanionSkillMaxRank(
  companion: Companion,
  skill: SkillDefinition,
): number {
  if (skill.classId === "beginner" && companion.classId !== "beginner") {
    return BEGINNER_SKILL_MAX_RANK_AFTER_FIRST_CLASS;
  }

  return skill.classId === "beginner"
    ? BEGINNER_SKILL_MAX_RANK
    : CLASS_SKILL_MAX_RANK;
}

export function getCompanionSkillRank(
  companion: Companion,
  skillId: SkillId,
): number {
  const skill = SKILL_DEFINITIONS[skillId];
  const storedRank = companion.skillProgression?.ranksBySkillId?.[skillId];

  return clampRank(storedRank ?? 1, getCompanionSkillMaxRank(companion, skill));
}

export function getSkillRankMultiplier(rank: number): number {
  return 1 + getSkillRankGrowthSteps(rank) * SKILL_RANK_BONUS_PER_RANK;
}

export function getSkillRankGrowthSteps(rank: number): number {
  const normalizedRank = Math.max(1, Math.floor(rank));

  return normalizedRank <= 5
    ? normalizedRank - 1
    : 4 + (normalizedRank - 5) * 0.5;
}

export function getSkillScaleUnits(rank: number): number {
  const normalizedRank = Math.max(1, Math.floor(rank));

  return normalizedRank <= 5
    ? normalizedRank
    : 5 + (normalizedRank - 5) * 0.5;
}

export function getActiveSkillsForCompanion(
  companion: Companion,
): ActiveSkillDefinition[] {
  const activeSkillsById = new Map<SkillId, ActiveSkillDefinition>();

  for (const skill of getActiveSkillsForClass(companion.classId)) {
    activeSkillsById.set(skill.id, skill);
  }

  for (const skillId of companion.skillProgression?.legacyEnabledSkillIds ?? []) {
    const skill = SKILL_DEFINITIONS[skillId];

    if (
      skill?.type === "active" &&
      isLegacySkillEligibleForCompanion(companion, skillId)
    ) {
      activeSkillsById.set(skill.id, skill);
    }
  }

  return [...activeSkillsById.values()];
}

export function getLegacySkillCandidatesForCompanion(
  companion: Companion,
): ActiveSkillDefinition[] {
  return Object.values(SKILL_DEFINITIONS).filter(
    (skill): skill is ActiveSkillDefinition =>
      skill.type === "active" &&
      isLegacySkillEligibleForCompanion(companion, skill.id),
  );
}

export function getLearnedPassivesForCompanion(
  companion: Companion,
): PassiveSkillDefinition[] {
  return getCompanionClassLineageIds(companion).flatMap((classId) =>
    getSkillsForClass(classId).filter(
      (skill): skill is PassiveSkillDefinition =>
        skill.type === "passive" &&
        hasCompanionLearnedSkill(companion, skill.id),
    ),
  );
}

export function getLearnedSkillGroupsForCompanion(
  companion: Companion,
): LearnedSkillGroup[] {
  const classIds = getLearnedClassIdsForCompanion(companion);

  return classIds
    .map((classId) => ({
      classId,
      skills: getActiveSkillsForClass(classId).filter(
        (skill) =>
          skill.classId === companion.classId ||
          hasCompanionLearnedSkill(companion, skill.id),
      ),
    }))
    .filter((group) => group.skills.length > 0);
}

export function isLegacySkillEnabledForCompanion(
  companion: Companion,
  skillId: SkillId,
): boolean {
  return (companion.skillProgression?.legacyEnabledSkillIds ?? []).includes(skillId);
}

export function isLegacySkillEligibleForCompanion(
  companion: Companion,
  skillId: SkillId,
): boolean {
  const skill = SKILL_DEFINITIONS[skillId];

  if (
    !skill ||
    skill.type !== "active" ||
    skill.classId === companion.classId ||
    skill.canLegacyCarry === false ||
    !isSkillInCompanionClassLineage(companion, skill)
  ) {
    return false;
  }

  return (
    hasCompanionLearnedSkill(companion, skillId) &&
    getCompanionSkillRank(companion, skillId) >= LEGACY_SKILL_UNLOCK_RANK
  );
}

export function setCompanionLegacySkillEnabled(
  state: GameState,
  companionId: string,
  skillId: SkillId,
  enabled: boolean,
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion" || !SKILL_DEFINITIONS[skillId]) {
    return state;
  }

  const currentIds = companion.skillProgression?.legacyEnabledSkillIds ?? [];
  const nextIds = enabled
    ? isLegacySkillEligibleForCompanion(companion, skillId)
      ? [...new Set([...currentIds, skillId])]
      : currentIds
    : currentIds.filter((candidateId) => candidateId !== skillId);

  const nextCompanion = {
    ...companion,
    skillProgression: sanitizeCompanionSkillProgression({
      ...companion,
      skillProgression: {
        ranksBySkillId: companion.skillProgression?.ranksBySkillId ?? {},
        legacyEnabledSkillIds: nextIds,
      },
    }),
  };

  return nextCompanion === companion
    ? state
    : {
        ...state,
        entities: {
          ...state.entities,
          [companion.id]: nextCompanion,
        },
      };
}

export function getScaledSkillDefinitionForCompanion(
  companion: Companion,
  skill: ActiveSkillDefinition,
): ActiveSkillDefinition;
export function getScaledSkillDefinitionForCompanion(
  companion: Companion,
  skill: SkillDefinition,
): SkillDefinition;
export function getScaledSkillDefinitionForCompanion(
  companion: Companion,
  skill: SkillDefinition,
): SkillDefinition {
  if (skill.type === "passive") {
    return skill;
  }

  const rank = getCompanionSkillRank(companion, skill.id);
  const multiplier = getSkillRankMultiplier(rank);

  if (skill.id === "throw_rock" && skill.effect.type === "taunt") {
    return {
      ...skill,
      effect: {
        ...skill.effect,
        durationMs:
          3000 +
          500 * Math.min(rank - 1, 4) +
          250 * Math.max(rank - 5, 0),
      },
    };
  }

  if (skill.id === "guard_up" && skill.effect.type === "shieldBlock") {
    return {
      ...skill,
      effect: {
        ...skill.effect,
        durationMs:
          6000 +
          1000 * Math.min(rank - 1, 4) +
          500 * Math.max(rank - 5, 0),
        blocks: rank >= 10 ? 3 : rank >= 5 ? 2 : 1,
      },
    };
  }

  if (skill.id === "deep_breath" && skill.effect.type === "selfBuff") {
    return {
      ...skill,
      effect: {
        ...skill.effect,
        bonusDamage: getBeginnerFlatDamageBonus(rank),
      },
    };
  }

  if (skill.id === "rally_call" && skill.effect.type === "allyBuff") {
    return {
      ...skill,
      effect: {
        ...skill.effect,
        bonusDamage: getBeginnerFlatDamageBonus(rank),
      },
    };
  }

  if (skill.effect.type === "followThrough") {
    return {
      ...skill,
      effect: {
        ...skill.effect,
        powerMultiplier:
          1 + 0.1 * Math.min(rank - 1, 4) + 0.05 * Math.max(rank - 5, 0),
        conditionalBonusMultiplier:
          0.2 +
          0.05 * Math.min(rank - 1, 4) +
          0.025 * Math.max(rank - 5, 0),
      },
    };
  }

  if (skill.effect.type === "overcharge") {
    return {
      ...skill,
      effect: {
        ...skill.effect,
        ...getOverchargeRankValues(rank),
      },
    };
  }

  if (multiplier === 1) {
    return skill;
  }

  const { effect } = skill;

  if (effect.type === "damage") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "lungeDamage") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "sweepingDamage") {
    return {
      ...skill,
      effect: {
        ...effect,
        mainPowerMultiplier: effect.mainPowerMultiplier * multiplier,
        splashPowerMultiplier: effect.splashPowerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "pinningShot") {
    return {
      ...skill,
      effect: {
        ...effect,
        durationMs:
          effect.durationMs +
          (Math.max(1, Math.floor(rank)) - 1) *
            (skill.id === "binding_rune" ? 175 : 125),
      },
    };
  }

  if (effect.type === "selfBuff") {
    return {
      ...skill,
      effect: {
        ...effect,
        bonusDamage: effect.bonusDamage * multiplier,
        movementSpeedBonusPercent: effect.movementSpeedBonusPercent
          ? effect.movementSpeedBonusPercent * multiplier
          : undefined,
      },
    };
  }

  if (effect.type === "allyBuff") {
    return {
      ...skill,
      effect: { ...effect, bonusDamage: effect.bonusDamage * multiplier },
    };
  }

  if (effect.type === "gatherBuff") {
    return {
      ...skill,
      effect: {
        ...effect,
        bonusGatherSpeed: effect.bonusGatherSpeed * multiplier,
      },
    };
  }

  if (effect.type === "partyBuff") {
    return {
      ...skill,
      effect: { ...effect, bonusDamage: effect.bonusDamage * multiplier },
    };
  }

  if (effect.type === "partyClassBuff") {
    return {
      ...skill,
      effect: {
        ...effect,
        primaryStatBonusPercentByStat:
          effect.primaryStatBonusPercentByStat &&
          Object.fromEntries(
            Object.entries(effect.primaryStatBonusPercentByStat).map(
              ([statId, percent]) => [
                statId,
                getScaledPartyClassBuffStatPercent(percent, rank),
              ],
            ),
          ),
        poisonCoating: effect.poisonCoating
          ? {
              ...effect.poisonCoating,
              poisonDamageAttackPowerPercent: getRankedDotDamagePercent(
                skill.id,
                rank,
                effect.poisonCoating.poisonDamageAttackPowerPercent,
              ),
            }
          : undefined,
      },
    };
  }

  if (effect.type === "manaShield") {
    return {
      ...skill,
      effect: {
        ...effect,
        absorbPercentMaxHealth:
          effect.absorbPercentMaxHealth +
          (Math.max(1, Math.floor(rank)) - 1) * 1.25,
      },
    };
  }

  if (effect.type === "frostArmor") {
    return {
      ...skill,
      effect: {
        ...effect,
        defenseBonusPercent: effect.defenseBonusPercent * multiplier,
        mitigationPercent: effect.mitigationPercent * multiplier,
      },
    };
  }

  if (effect.type === "barrierBlock") {
    return {
      ...skill,
      effect: {
        ...effect,
        blocks: Math.min(3, effect.blocks + Math.floor((rank - 1) / 4)),
        healPercentMaxHealthOnConsume: effect.healPercentMaxHealthOnConsume
          ? effect.healPercentMaxHealthOnConsume * multiplier
          : undefined,
      },
    };
  }

  if (effect.type === "rewindRune") {
    return {
      ...skill,
      effect: {
        ...effect,
        healPercentRecordedDamage:
          effect.healPercentRecordedDamage +
          (Math.max(1, Math.floor(rank)) - 1) * 3.75,
      },
    };
  }

  if (effect.type === "fakeDeath") {
    return {
      ...skill,
      effect: {
        ...effect,
        nextAttackDamageMultiplierBonus:
          effect.nextAttackDamageMultiplierBonus * multiplier,
      },
    };
  }

  if (effect.type === "partyPoisonCoating") {
    return {
      ...skill,
      effect: {
        ...effect,
        poisonDamageAttackPowerPercent:
          getRankedDotDamagePercent(
            skill.id,
            rank,
            effect.poisonDamageAttackPowerPercent,
          ),
      },
    };
  }

  if (effect.type === "skirmishShot") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "arrowBurst") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "lifestealBuff") {
    return {
      ...skill,
      effect: {
        ...effect,
        durationMs: effect.durationMs + (Math.max(1, Math.floor(rank)) - 1) * 500,
        lifestealPercent: effect.lifestealPercent * multiplier,
      },
    };
  }

  if (effect.type === "pounce" || effect.type === "maulSweep") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "flameStep") {
    return {
      ...skill,
      effect: {
        ...effect,
        burnDamageMagicPowerPercent:
          getRankedDotDamagePercent(
            skill.id,
            rank,
            effect.burnDamageMagicPowerPercent,
          ),
      },
    };
  }

  if (effect.type === "runeStep") {
    return {
      ...skill,
      effect: {
        ...effect,
        trapImmobilizeDurationMs:
          effect.trapImmobilizeDurationMs +
          (Math.max(1, Math.floor(rank)) - 1) * 100,
      },
    };
  }

  if (effect.type === "silencingRay") {
    return {
      ...skill,
      effect: {
        ...effect,
        durationMs:
          effect.durationMs + (Math.max(1, Math.floor(rank)) - 1) * 150,
      },
    };
  }

  if (effect.type === "healOverTime") {
    return {
      ...skill,
      effect: {
        ...effect,
        durationMs:
          effect.durationMs + (Math.max(1, Math.floor(rank)) - 1) * 1250,
      },
    };
  }

  if (effect.type === "circleOfRenewal") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "whipPrison") {
    return {
      ...skill,
      effect: {
        ...effect,
        bleedDamageAttackPowerPercent:
          getRankedDotDamagePercent(
            skill.id,
            rank,
            effect.bleedDamageAttackPowerPercent,
          ),
      },
    };
  }

  if (effect.type === "flagellantLash") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
        bleedDamageAttackPowerPercent:
          getRankedDotDamagePercent(
            skill.id,
            rank,
            effect.bleedDamageAttackPowerPercent,
          ),
      },
    };
  }

  if (effect.type === "sacrificialBarrier") {
    return {
      ...skill,
      effect: {
        ...effect,
        blocks: Math.min(3, effect.blocks + Math.floor((rank - 1) / 4)),
      },
    };
  }

  if (effect.type === "eternalHope") {
    const rankBonus = Math.max(1, Math.floor(rank)) - 1;

    return {
      ...skill,
      cooldownMs: Math.max(15000, (skill.cooldownMs ?? 20000) - rankBonus * 1250),
      effect: {
        ...effect,
        healSacrificeMultiplier: effect.healSacrificeMultiplier + rankBonus * 0.125,
      },
    };
  }

  if (effect.type === "atonementStep") {
    return {
      ...skill,
      effect: {
        ...effect,
        healSacrificeMultiplier: effect.healSacrificeMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "fireBurst") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
        burnDamageMagicPowerPercent:
          getRankedDotDamagePercent(
            skill.id,
            rank,
            effect.burnDamageMagicPowerPercent,
          ),
      },
    };
  }

  if (effect.type === "damageMitigation") {
    return {
      ...skill,
      effect: {
        ...effect,
        mitigationPercent: effect.mitigationPercent * multiplier,
      },
    };
  }

  if (effect.type === "absorbShield") {
    return {
      ...skill,
      effect: {
        ...effect,
        absorbPercentMaxHealth: effect.absorbPercentMaxHealth * multiplier,
      },
    };
  }

  if (effect.type === "holdFast") {
    const inverseMultiplier =
      1 - (Math.max(1, Math.floor(rank)) - 1) * SKILL_RANK_BONUS_PER_RANK;

    return {
      ...skill,
      effect: {
        ...effect,
        defenseBonusPercent: effect.defenseBonusPercent * multiplier,
        absorbPercentMaxHealth: effect.absorbPercentMaxHealth * multiplier,
        immobilizeDurationMs: Math.max(
          0,
          Math.round(effect.immobilizeDurationMs * inverseMultiplier),
        ),
      },
    };
  }

  if (
    effect.type === "selfMitigationBuff" ||
    effect.type === "partyMitigationBuff"
  ) {
    return {
      ...skill,
      effect: {
        ...effect,
        mitigationPercent: effect.mitigationPercent * multiplier,
      },
    };
  }

  if (effect.type === "shockwave") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  if (effect.type === "selfPercentHeal") {
    return {
      ...skill,
      effect: { ...effect, healPercent: effect.healPercent * multiplier },
    };
  }

  if (effect.type === "heal" || effect.type === "selfCostHeal") {
    return {
      ...skill,
      effect: {
        ...effect,
        powerMultiplier: effect.powerMultiplier * multiplier,
      },
    };
  }

  return skill;
}

function getBeginnerFlatDamageBonus(rank: number): number {
  return Math.min(rank, 5) + 0.5 * Math.max(rank - 5, 0);
}

function getScaledPartyClassBuffStatPercent(
  basePercent: number,
  rank: number,
): number {
  const rankBonus = (Math.max(1, Math.floor(rank)) - 1) * 1.25;

  return Math.min(10, basePercent + rankBonus);
}

function getRankedDotDamagePercent(
  skillId: SkillId,
  rank: number,
  fallbackPercent: number,
): number {
  const rankTable = DOT_DAMAGE_PERCENT_BY_SKILL_RANK[skillId];

  if (!rankTable) {
    return fallbackPercent * getSkillRankMultiplier(rank);
  }

  const rankIndex = Math.min(rankTable.length, Math.max(1, Math.floor(rank))) - 1;
  return rankTable[rankIndex];
}

export function isSkillBookItemDefinition(
  itemDefinition: ItemDefinition,
): boolean {
  return (
    itemDefinition.category === "skill_book" &&
    Boolean(itemDefinition.skillBookSkillId)
  );
}

export function getSkillBookSkillId(itemId: ItemId): SkillId | null {
  const itemDefinition = getItemDefinition(itemId);

  return isSkillBookItemDefinition(itemDefinition)
    ? itemDefinition.skillBookSkillId ?? null
    : null;
}

export function getSkillBookReadCandidates(
  companions: Companion[],
  itemId: ItemId,
  inventory: PartyInventory,
): SkillBookReadCandidate[] {
  const skillId = getSkillBookSkillId(itemId);

  if (!skillId) {
    return [];
  }

  const availableBooks = countInventoryItem(inventory, itemId);

  return companions.flatMap((companion) => {
    const status = canCompanionReadSkillBook(
      companion,
      skillId,
      availableBooks,
    );
    const requiredBooks = getSkillBooksRequiredForNextRank(companion, skillId);

    if (
      (status !== "eligible" && status !== "insufficient_books") ||
      requiredBooks === null
    ) {
      return [];
    }

    return [
      {
        companion,
        currentRank: getCompanionSkillRank(companion, skillId),
        maxRank: getCompanionSkillMaxRank(companion, SKILL_DEFINITIONS[skillId]),
        requiredBooks,
        availableBooks,
        status,
      },
    ];
  });
}

export function canCompanionReadSkillBook(
  companion: Companion,
  skillId: SkillId,
  availableBooks: number,
): "eligible" | "insufficient_books" | "unavailable" | "maxed" {
  const skill = SKILL_DEFINITIONS[skillId];

  if (!skill || !hasCompanionLearnedSkill(companion, skillId)) {
    return "unavailable";
  }

  if (
    getCompanionSkillRank(companion, skillId) >=
    getCompanionSkillMaxRank(companion, skill)
  ) {
    return "maxed";
  }

  const requiredBooks = getSkillBooksRequiredForNextRank(companion, skillId);

  return requiredBooks !== null && availableBooks >= requiredBooks
    ? "eligible"
    : "insufficient_books";
}

export function getSkillBooksRequiredForTargetRank(targetRank: number): number {
  const normalizedTargetRank = Math.max(2, Math.floor(targetRank));

  return (normalizedTargetRank * (normalizedTargetRank + 1)) / 2 - 2;
}

export function getSkillBooksRequiredForNextRank(
  companion: Companion,
  skillId: SkillId,
): number | null {
  const skill = SKILL_DEFINITIONS[skillId];

  if (!skill || !hasCompanionLearnedSkill(companion, skillId)) {
    return null;
  }

  const currentRank = getCompanionSkillRank(companion, skillId);

  return currentRank >= getCompanionSkillMaxRank(companion, skill)
    ? null
    : getSkillBooksRequiredForTargetRank(currentRank + 1);
}

export function readSkillBook(
  state: GameState,
  companionId: string,
  itemId: ItemId,
): { state: GameState; result: ReadSkillBookResult } {
  const itemDefinition = getItemDefinition(itemId);

  if (!itemDefinition) {
    return {
      state,
      result: { status: "failed", companionId, itemId, reason: "invalid_item" },
    };
  }

  const skillId = itemDefinition.skillBookSkillId;

  if (!isSkillBookItemDefinition(itemDefinition) || !skillId) {
    return {
      state,
      result: { status: "failed", companionId, itemId, reason: "not_skill_book" },
    };
  }

  const skill = SKILL_DEFINITIONS[skillId];

  if (!skill) {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        reason: "unknown_skill",
      },
    };
  }

  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        displayName: skill.displayName,
        reason: "invalid_companion",
      },
    };
  }

  const availableBooks = countInventoryItem(state.inventory, itemId);

  if (availableBooks <= 0) {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        displayName: skill.displayName,
        availableBooks,
        reason: "book_not_in_inventory",
      },
    };
  }

  if (!hasCompanionLearnedSkill(companion, skillId)) {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        displayName: skill.displayName,
        reason: "skill_unavailable",
      },
    };
  }

  const currentRank = getCompanionSkillRank(companion, skillId);
  const maxRank = getCompanionSkillMaxRank(companion, skill);

  if (currentRank >= maxRank) {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        displayName: skill.displayName,
        currentRank,
        maxRank,
        reason: "skill_maxed",
      },
    };
  }

  const requiredBooks = getSkillBooksRequiredForTargetRank(currentRank + 1);

  if (availableBooks < requiredBooks) {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        displayName: skill.displayName,
        currentRank,
        maxRank,
        requiredBooks,
        availableBooks,
        reason: "insufficient_books",
      },
    };
  }

  const removeResult = removeItemFromInventoryState(
    state,
    itemId,
    requiredBooks,
    "skill_book",
  );

  if (removeResult.result.status !== "success") {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        displayName: skill.displayName,
        currentRank,
        maxRank,
        requiredBooks,
        availableBooks,
        reason: "inventory_remove_failed",
      },
    };
  }

  const nextRank = Math.min(maxRank, currentRank + 1);
  const nextCompanion = sanitizeProgressionForCompanion({
    ...companion,
    skillProgression: {
      ranksBySkillId: {
        ...(companion.skillProgression?.ranksBySkillId ?? {}),
        [skillId]: nextRank,
      },
      legacyEnabledSkillIds: companion.skillProgression?.legacyEnabledSkillIds ?? [],
    },
  });
  const nextState = {
    ...removeResult.state,
    entities: {
      ...removeResult.state.entities,
      [companionId]: nextCompanion,
    },
  };

  return {
    state: nextState,
    result: {
      status: "success",
      companionId,
      itemId,
      skillId,
      displayName: skill.displayName,
      previousRank: currentRank,
      newRank: nextRank,
      maxRank,
      booksConsumed: requiredBooks,
    },
  };
}

export function sanitizeProgressionForCompanion(
  companion: Companion,
): Companion {
  return {
    ...companion,
    skillProgression: sanitizeCompanionSkillProgression(companion),
  };
}

export function sanitizeCompanionSkillProgression(
  companion: Companion,
): CompanionSkillProgression {
  const progression = companion.skillProgression ?? {
    ranksBySkillId: {},
    legacyEnabledSkillIds: [],
  };
  const ranksBySkillId: Partial<Record<SkillId, number>> = {};

  for (const [skillId, rank] of Object.entries(progression.ranksBySkillId ?? {})) {
    if (!isKnownSkillId(skillId) || !Number.isFinite(rank)) {
      continue;
    }

    const skill = SKILL_DEFINITIONS[skillId];

    if (!isSkillInCompanionClassLineage(companion, skill)) {
      continue;
    }

    ranksBySkillId[skillId] = clampRank(
      rank,
      getCompanionSkillMaxRank(companion, skill),
    );
  }

  for (const skill of getSkillsForClass(companion.classId)) {
    ranksBySkillId[skill.id] = clampRank(
      ranksBySkillId[skill.id] ?? 1,
      getCompanionSkillMaxRank(companion, skill),
    );
  }

  const companionWithRanks: Companion = {
    ...companion,
    skillProgression: {
      ranksBySkillId,
      legacyEnabledSkillIds: [],
    },
  };
  const legacyEnabledSkillIds = [
    ...new Set(progression.legacyEnabledSkillIds ?? []),
  ].filter(
    (skillId): skillId is SkillId =>
      isKnownSkillId(skillId) &&
      isLegacySkillEligibleForCompanion(companionWithRanks, skillId),
  );

  return {
    ranksBySkillId,
    legacyEnabledSkillIds,
  };
}

function hasCompanionLearnedSkill(companion: Companion, skillId: SkillId): boolean {
  const skill = SKILL_DEFINITIONS[skillId];

  if (!skill) {
    return false;
  }

  if (!isSkillInCompanionClassLineage(companion, skill)) {
    return false;
  }

  return (
    skill.classId === companion.classId ||
    companion.skillProgression?.ranksBySkillId?.[skillId] !== undefined
  );
}

function getLearnedClassIdsForCompanion(companion: Companion): ClassId[] {
  const learnedClassIds = new Set<ClassId>();

  for (const skill of Object.values(SKILL_DEFINITIONS)) {
    if (hasCompanionLearnedSkill(companion, skill.id)) {
      learnedClassIds.add(skill.classId);
    }
  }

  return getCompanionClassLineageIds(companion).filter((classId) =>
    learnedClassIds.has(classId),
  );
}

function getCompanionClassLineageIds(companion: Companion): ClassId[] {
  return companion.classId === "beginner"
    ? ["beginner"]
    : [companion.classId, "beginner"];
}

function isSkillInCompanionClassLineage(
  companion: Companion,
  skill: SkillDefinition,
): boolean {
  return getCompanionClassLineageIds(companion).includes(skill.classId);
}

function isKnownSkillId(skillId: string): skillId is SkillId {
  return skillId in SKILL_DEFINITIONS;
}

function clampRank(rank: number, maxRank: number): number {
  return Math.min(maxRank, Math.max(1, Math.floor(rank)));
}
