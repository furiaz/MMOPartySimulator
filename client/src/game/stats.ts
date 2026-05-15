import { getCompanionEquipmentStatModifiers } from "./equipmentRules";
import type {
  ClassId,
  Companion,
  CompanionDerivedStats,
  CompanionPrimaryStatModifiers,
  CompanionPrimaryStats,
  EquipmentStatModifiers,
  PrimaryStatId,
} from "./types";

export const PRIMARY_STAT_IDS: PrimaryStatId[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
];

export const MINIMUM_ACTUAL_PRIMARY_STAT = 1;
export const STARTING_PRIMARY_STAT_VALUE = 1;
export const BEGINNER_STAT_GROWTH_PER_LEVEL = createCompanionPrimaryStats(1);
export const BASE_CLASS_AUTOMATIC_STAT_POINTS_PER_LEVEL = 5;
export const PLAYER_STAT_POINTS_PER_LEVEL_AFTER_CLASS_UNLOCK = 2;
export const MAX_ALLOCATED_PRIMARY_STAT_POINTS_PER_STAT = 99;

export const BASE_CLASS_STAT_GROWTHS: Record<
  Exclude<ClassId, "beginner">,
  CompanionPrimaryStats
> = {
  blade: createCompanionPrimaryStatsFromValues(2, 2, 1, 0, 0),
  aegis: createCompanionPrimaryStatsFromValues(1, 0, 3, 0, 1),
  hunter: createCompanionPrimaryStatsFromValues(1, 3, 0, 0, 1),
  beast: createCompanionPrimaryStatsFromValues(2, 1, 2, 0, 0),
  elementalist: createCompanionPrimaryStatsFromValues(0, 0, 1, 4, 0),
  runecaster: createCompanionPrimaryStatsFromValues(0, 0, 1, 2, 2),
  lightbearer: createCompanionPrimaryStatsFromValues(0, 0, 1, 1, 3),
  penitent: createCompanionPrimaryStatsFromValues(1, 0, 2, 0, 2),
};

export function createDefaultNaturalCompanionStats(): CompanionPrimaryStats {
  return createCompanionPrimaryStats(STARTING_PRIMARY_STAT_VALUE);
}

export function createEmptyAllocatedCompanionStats(): CompanionPrimaryStats {
  return createCompanionPrimaryStats(0);
}

export function createCompanionPrimaryStats(value: number): CompanionPrimaryStats {
  return createCompanionPrimaryStatsFromValues(value, value, value, value, value);
}

export function addCompanionPrimaryStats(
  first: CompanionPrimaryStats,
  second: CompanionPrimaryStatModifiers,
): CompanionPrimaryStats {
  return createCompanionPrimaryStatsFromValues(
    first.strength + (second.strength ?? 0),
    first.dexterity + (second.dexterity ?? 0),
    first.constitution + (second.constitution ?? 0),
    first.intelligence + (second.intelligence ?? 0),
    first.wisdom + (second.wisdom ?? 0),
  );
}

export type StatAllocationStatus =
  | "success"
  | "failed_no_points"
  | "failed_invalid_stat"
  | "failed_stat_cap";

export type StatAllocationResult = {
  status: StatAllocationStatus;
  companion: Companion;
  statId: PrimaryStatId | null;
};

export function applyCompanionLevelUpStatGrowth(
  companion: Companion,
  levelsGained: number,
): Companion {
  const levelUps = Math.max(0, Math.floor(levelsGained));

  if (levelUps <= 0) {
    return companion;
  }

  const automaticGrowth = getClassStatGrowth(companion.classId);
  const unspentPointsPerLevel = getPlayerStatPointsPerLevel(companion.classId);
  const naturalStats = addRepeatedCompanionPrimaryStats(
    companion.naturalStats,
    automaticGrowth,
    levelUps,
  );

  return syncCompanionDerivedMaxHealth({
    ...companion,
    naturalStats,
    unspentStatPoints:
      companion.unspentStatPoints + unspentPointsPerLevel * levelUps,
  });
}

export function allocateCompanionStatPoint(
  companion: Companion,
  statId: PrimaryStatId,
): StatAllocationResult {
  if (!PRIMARY_STAT_IDS.includes(statId)) {
    return {
      status: "failed_invalid_stat",
      companion,
      statId: null,
    };
  }

  if (companion.unspentStatPoints <= 0) {
    return {
      status: "failed_no_points",
      companion,
      statId,
    };
  }

  if (
    companion.allocatedStats[statId] >= MAX_ALLOCATED_PRIMARY_STAT_POINTS_PER_STAT
  ) {
    return {
      status: "failed_stat_cap",
      companion,
      statId,
    };
  }

  return {
    status: "success",
    companion: syncCompanionDerivedMaxHealth({
      ...companion,
      allocatedStats: {
        ...companion.allocatedStats,
        [statId]: companion.allocatedStats[statId] + 1,
      },
      unspentStatPoints: companion.unspentStatPoints - 1,
    }),
    statId,
  };
}

export function getCompanionActualStats(
  companion: Companion,
  temporaryStatModifiers: CompanionPrimaryStatModifiers = {},
): CompanionPrimaryStats {
  const permanentStats = addCompanionPrimaryStats(
    companion.naturalStats,
    companion.allocatedStats,
  );
  const actualStats = addCompanionPrimaryStats(permanentStats, temporaryStatModifiers);

  return createCompanionPrimaryStatsFromValues(
    clampActualPrimaryStat(actualStats.strength),
    clampActualPrimaryStat(actualStats.dexterity),
    clampActualPrimaryStat(actualStats.constitution),
    clampActualPrimaryStat(actualStats.intelligence),
    clampActualPrimaryStat(actualStats.wisdom),
  );
}

export function getCompanionDerivedStats(
  companion: Companion,
  options: {
    temporaryStatModifiers?: CompanionPrimaryStatModifiers;
    equipmentStatModifiers?: EquipmentStatModifiers;
  } = {},
): CompanionDerivedStats {
  const actualStats = getCompanionActualStats(
    companion,
    options.temporaryStatModifiers,
  );
  const equipmentStatModifiers =
    options.equipmentStatModifiers ?? getCompanionEquipmentStatModifiers(companion);

  return {
    attack:
      1 +
      actualStats.strength +
      Math.floor(actualStats.dexterity / 2) +
      (equipmentStatModifiers.attack ?? 0),
    defense:
      Math.floor(actualStats.constitution / 2) +
      Math.floor(actualStats.wisdom / 3) +
      (equipmentStatModifiers.defense ?? 0),
    maxHealth:
      10 +
      companion.characterLevel * 2 +
      actualStats.constitution * 2 +
      (equipmentStatModifiers.maxHealth ?? 0),
    evasion:
      Math.floor(actualStats.dexterity / 2) +
      (equipmentStatModifiers.evasion ?? 0),
    block:
      Math.floor(actualStats.strength / 3) +
      Math.floor(actualStats.constitution / 2) +
      (equipmentStatModifiers.block ?? 0),
    magicPower:
      actualStats.intelligence +
      Math.floor(actualStats.wisdom / 2) +
      (equipmentStatModifiers.magicPower ?? 0),
    healingPower:
      actualStats.wisdom +
      Math.floor(actualStats.intelligence / 3) +
      (equipmentStatModifiers.healingPower ?? 0),
    magicDefense:
      Math.floor(actualStats.wisdom / 2) +
      Math.floor(actualStats.intelligence / 3) +
      (equipmentStatModifiers.magicDefense ?? 0),
    accuracy:
      actualStats.dexterity +
      Math.floor(actualStats.wisdom / 3) +
      (equipmentStatModifiers.accuracy ?? 0),
    criticalChance: 0.05 + (equipmentStatModifiers.criticalChance ?? 0),
    criticalDamage: 1.2 + (equipmentStatModifiers.criticalDamage ?? 0),
    healthRegen: Math.max(
      1,
      Math.floor(actualStats.constitution / 8) +
        (equipmentStatModifiers.healthRegen ?? 0),
    ),
  };
}

export function syncCompanionDerivedMaxHealth(companion: Companion): Companion {
  const nextMaxHealth = getCompanionDerivedStats(companion).maxHealth;

  if (companion.maxHealth === nextMaxHealth) {
    return companion;
  }

  const healthPercent =
    companion.maxHealth > 0 ? companion.health / companion.maxHealth : 1;
  const nextHealth =
    companion.health <= 0
      ? 0
      : Math.min(nextMaxHealth, Math.max(1, Math.round(healthPercent * nextMaxHealth)));

  return {
    ...companion,
    health: nextHealth,
    maxHealth: nextMaxHealth,
  };
}

function createCompanionPrimaryStatsFromValues(
  strength: number,
  dexterity: number,
  constitution: number,
  intelligence: number,
  wisdom: number,
): CompanionPrimaryStats {
  return {
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
  };
}

function getClassStatGrowth(classId: ClassId): CompanionPrimaryStats {
  return classId === "beginner"
    ? BEGINNER_STAT_GROWTH_PER_LEVEL
    : BASE_CLASS_STAT_GROWTHS[classId];
}

function getPlayerStatPointsPerLevel(classId: ClassId): number {
  return classId === "beginner"
    ? 0
    : PLAYER_STAT_POINTS_PER_LEVEL_AFTER_CLASS_UNLOCK;
}

function addRepeatedCompanionPrimaryStats(
  stats: CompanionPrimaryStats,
  growth: CompanionPrimaryStats,
  multiplier: number,
): CompanionPrimaryStats {
  return createCompanionPrimaryStatsFromValues(
    stats.strength + growth.strength * multiplier,
    stats.dexterity + growth.dexterity * multiplier,
    stats.constitution + growth.constitution * multiplier,
    stats.intelligence + growth.intelligence * multiplier,
    stats.wisdom + growth.wisdom * multiplier,
  );
}

function clampActualPrimaryStat(value: number): number {
  return Math.max(MINIMUM_ACTUAL_PRIMARY_STAT, value);
}
