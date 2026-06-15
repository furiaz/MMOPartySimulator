import { countInventoryItem, removeItemFromInventoryState } from "./inventory";
import { getItemDefinition } from "./items";
import { getSkillsForClass, SKILL_DEFINITIONS } from "./skills";
import type { GameState } from "./state";
import type {
  ClassId,
  Companion,
  CompanionSkillProgression,
  ItemDefinition,
  ItemId,
  SkillDefinition,
  SkillId,
} from "./types";

export const BEGINNER_SKILL_MAX_RANK = 3;
export const CLASS_SKILL_MAX_RANK = 5;
export const SKILL_RANK_BONUS_PER_RANK = 0.05;

export const SKILL_BOOK_ITEM_IDS_BY_SKILL_ID: Record<SkillId, ItemId> = {
  throw_rock: "throw_rock_skill_book",
  kick: "kick_skill_book",
  guard_up: "guard_up_skill_book",
  first_aid: "first_aid_skill_book",
  deep_breath: "deep_breath_skill_book",
  rally_call: "rally_call_skill_book",
  field_hands: "field_hands_skill_book",
  quick_step: "quick_step_skill_book",
  sweeping_strike: "sweeping_strike_skill_book",
  guard_wall: "guard_wall_skill_book",
  mark_target: "mark_target_skill_book",
  feral_surge: "feral_surge_skill_book",
  elemental_bolt: "elemental_bolt_skill_book",
  binding_rune: "binding_rune_skill_book",
  light_mend: "light_mend_skill_book",
  penitents_gift: "penitents_gift_skill_book",
};

export type ReadSkillBookFailureReason =
  | "invalid_companion"
  | "invalid_item"
  | "not_skill_book"
  | "book_not_in_inventory"
  | "unknown_skill"
  | "skill_unavailable"
  | "skill_maxed"
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
    }
  | {
      status: "failed";
      companionId: string;
      itemId: ItemId;
      skillId?: SkillId;
      displayName?: string;
      currentRank?: number;
      maxRank?: number;
      reason: ReadSkillBookFailureReason;
    };

export type LearnedSkillGroup = {
  classId: ClassId;
  skills: SkillDefinition[];
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
      getSkillMaxRank(skill),
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

export function getSkillMaxRank(skill: SkillDefinition): number {
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

  return clampRank(storedRank ?? 1, getSkillMaxRank(skill));
}

export function getSkillRankMultiplier(rank: number): number {
  return 1 + (Math.max(1, Math.floor(rank)) - 1) * SKILL_RANK_BONUS_PER_RANK;
}

export function getActiveSkillsForCompanion(
  companion: Companion,
): SkillDefinition[] {
  const activeSkillsById = new Map<SkillId, SkillDefinition>();

  for (const skill of getSkillsForClass(companion.classId)) {
    activeSkillsById.set(skill.id, skill);
  }

  for (const skillId of companion.skillProgression?.legacyEnabledSkillIds ?? []) {
    const skill = SKILL_DEFINITIONS[skillId];

    if (skill && isLegacySkillEligibleForCompanion(companion, skillId)) {
      activeSkillsById.set(skill.id, skill);
    }
  }

  return [...activeSkillsById.values()];
}

export function getLegacySkillCandidatesForCompanion(
  companion: Companion,
): SkillDefinition[] {
  return Object.values(SKILL_DEFINITIONS).filter((skill) =>
    isLegacySkillEligibleForCompanion(companion, skill.id),
  );
}

export function getLearnedSkillGroupsForCompanion(
  companion: Companion,
): LearnedSkillGroup[] {
  const classIds = getLearnedClassIdsForCompanion(companion);

  return classIds
    .map((classId) => ({
      classId,
      skills: getSkillsForClass(classId).filter(
        (skill) => skill.classId === companion.classId || hasCompanionLearnedSkill(companion, skill.id),
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
    skill.classId === companion.classId ||
    skill.canLegacyCarry === false ||
    !isSkillInCompanionClassLineage(companion, skill)
  ) {
    return false;
  }

  return (
    hasCompanionLearnedSkill(companion, skillId) &&
    getCompanionSkillRank(companion, skillId) >= getSkillMaxRank(skill)
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
  skill: SkillDefinition,
): SkillDefinition {
  const multiplier = getSkillRankMultiplier(
    getCompanionSkillRank(companion, skill.id),
  );

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

  if (effect.type === "mark") {
    return {
      ...skill,
      effect: { ...effect, bonusDamage: effect.bonusDamage * multiplier },
    };
  }

  if (effect.type === "selfBuff") {
    return {
      ...skill,
      effect: { ...effect, bonusDamage: effect.bonusDamage * multiplier },
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
): Companion[] {
  const skillId = getSkillBookSkillId(itemId);

  if (!skillId) {
    return [];
  }

  return companions.filter(
    (companion) =>
      canCompanionReadSkillBook(companion, skillId) === "eligible",
  );
}

export function canCompanionReadSkillBook(
  companion: Companion,
  skillId: SkillId,
): "eligible" | "unavailable" | "maxed" {
  const skill = SKILL_DEFINITIONS[skillId];

  if (!skill || !hasCompanionLearnedSkill(companion, skillId)) {
    return "unavailable";
  }

  return getCompanionSkillRank(companion, skillId) >= getSkillMaxRank(skill)
    ? "maxed"
    : "eligible";
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

  if (countInventoryItem(state.inventory, itemId) <= 0) {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        itemId,
        skillId,
        displayName: skill.displayName,
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
  const maxRank = getSkillMaxRank(skill);

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

  const removeResult = removeItemFromInventoryState(
    state,
    itemId,
    1,
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

    ranksBySkillId[skillId] = clampRank(rank, getSkillMaxRank(skill));
  }

  for (const skill of getSkillsForClass(companion.classId)) {
    ranksBySkillId[skill.id] = clampRank(
      ranksBySkillId[skill.id] ?? 1,
      getSkillMaxRank(skill),
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
