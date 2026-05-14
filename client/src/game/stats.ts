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
      actualStats.constitution * 2 +
      (equipmentStatModifiers.maxHealth ?? 0),
    evasion:
      Math.floor(actualStats.dexterity / 2) +
      (equipmentStatModifiers.evasion ?? 0),
    block:
      Math.floor(actualStats.strength / 3) +
      Math.floor(actualStats.constitution / 3) +
      (equipmentStatModifiers.block ?? 0),
    magicPower:
      actualStats.intelligence +
      Math.floor(actualStats.wisdom / 2) +
      (equipmentStatModifiers.magicPower ?? 0),
    healingPower:
      actualStats.wisdom +
      Math.floor(actualStats.intelligence / 3) +
      (equipmentStatModifiers.healingPower ?? 0),
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

function clampActualPrimaryStat(value: number): number {
  return Math.max(MINIMUM_ACTUAL_PRIMARY_STAT, value);
}
