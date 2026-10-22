import { ENEMY_RESPAWN_DELAY_MS } from "./enemyRespawnSystem";
import { getEnemyType } from "./enemyArchetypes";
import { getScaledEnemyStats } from "./enemyScaling";
import { getSameLevelEnemyXp, getLevelGapXpModifier } from "./leveling";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import { getCompanionDerivedStatsWithPartyBuffs } from "./stats";
import { getSubzoneAtPosition } from "./subzoneSystem";
import { getActiveSkillsForCompanion, getScaledSkillDefinitionForCompanion } from "./skillProgression";
import { getSkillCooldownMs } from "./skills";
import { COMPANION_GLOBAL_COOLDOWN_MS } from "./companionCooldowns";
import { SUPERIOR_ENEMY_CHANCE } from "./enemyVariants";
import {
  estimateEnemyDropTableRewards,
  getLootTierForLevel,
  type AggregateDropReward,
} from "./dropTables";
import type { GameState } from "./state";
import type {
  Companion,
  EnemyArchetypeId,
  Enemy,
  EnemyTypeId,
  GameMap,
  ItemId,
  ResourceType,
  SkillDefinition,
  ZoneSubzone,
} from "./types";

export type AfkCombatRating = "Strong" | "Adequate" | "Weak" | "Overmatched";

export type AfkCombatEstimateWarning =
  | "low_damage"
  | "low_survivability"
  | "enemy_data_incomplete"
  | "respawn_data_estimated";

export type AfkCombatEnemySummary = {
  enemyTypeId: EnemyTypeId;
  displayName: string;
  level: number;
  maxHealth: number;
  attack: number;
  defense: number;
  magicDefense: number;
  attackCooldownMs: number;
  spawnCount: number;
};

export type AfkCombatDropEstimate = {
  itemId: ItemId;
  quantityPerHour: number;
};

export type AfkCombatMultiplierSource = {
  label: string;
  multiplier: number;
  description: string;
};

export type AfkCombatEnemyKillShare = {
  enemyTypeId: EnemyTypeId;
  displayName: string;
  level: number;
  killsPerHour: number;
};

export type AfkCombatEstimate = {
  available: true;
  rating: AfkCombatRating;
  mapId?: string;
  mapName: string;
  subzoneId: string;
  subzoneName: string;
  partyDamagePerMinute: number;
  partyKillPotentialPerMinute: number;
  subzoneSpawnCapPerMinute: number;
  accessEfficiencyPercent: number;
  downtimeSecondsPerKill: number;
  killsPerHour: number;
  experiencePerMinute: number;
  survivabilityPercent: number;
  combatExperienceMultiplier: number;
  combatDropMultiplier: number;
  combatExperienceMultiplierSources: AfkCombatMultiplierSource[];
  combatDropMultiplierSources: AfkCombatMultiplierSource[];
  resourceEstimatePerMinute: number;
  resources: ResourceType[];
  enemies: AfkCombatEnemySummary[];
  enemyKillShares: AfkCombatEnemyKillShare[];
  estimatedDropsPerHour: AfkCombatDropEstimate[];
  warnings: AfkCombatEstimateWarning[];
};

export type UnavailableAfkCombatEstimate = {
  available: false;
  reason:
    | "no_party"
    | "no_leader"
    | "no_map"
    | "no_subzone"
    | "no_enemies";
  message: string;
};

export type AfkCombatEstimateResult =
  | AfkCombatEstimate
  | UnavailableAfkCombatEstimate;

const DEFAULT_ENEMY_ATTACK_COOLDOWN_MS = 2_400;
const DEFAULT_RESPAWN_DELAY_MS = 30_000;
const DEFENSE_REDUCTION_FACTOR = 0.6;
const DEFENSE_SOFTNESS = 50;
const BASE_RETARGET_DOWNTIME_SECONDS = 1.5;
const CROSS_PACK_DOWNTIME_SECONDS = 2.5;
const PARTY_FORMATION_DOWNTIME_SECONDS_PER_EXTRA_COMPANION = 0.15;
const AFK_CONTROL_EFFICIENCY = 0.85;

const ROLE_COMBAT_EFFICIENCY: Record<Companion["role"], number> = {
  defender: 0.75,
  fighter: 1,
  support: 0.55,
  gatherer: 0.2,
  none: 0.45,
};

const ROLE_SURVIVABILITY_EFFICIENCY: Record<Companion["role"], number> = {
  defender: 1.25,
  fighter: 0.9,
  support: 1.15,
  gatherer: 0.75,
  none: 0.85,
};

export function estimateCurrentPartyAfkCombat(
  state: GameState,
): AfkCombatEstimateResult {
  const leader = getPartyLeader(state);

  if (!leader) {
    return unavailable("no_leader", "AFK estimate needs a living party leader.");
  }

  const map = state.map;

  if (!map) {
    return unavailable("no_map", "AFK estimate needs a current map.");
  }

  const subzone = getSubzoneAtPosition(map, leader.position);

  if (!subzone) {
    return unavailable(
      "no_subzone",
      "Move the party into a wild subzone to see AFK estimates.",
    );
  }

  return estimateAfkCombatForParty({
    state,
    map,
    subzone,
    companions: getPartyMembers(state),
  });
}

export function estimateAfkCombatForParty({
  state,
  map,
  subzone,
  companions,
}: {
  state: GameState;
  map: GameMap;
  subzone: ZoneSubzone;
  companions: Companion[];
}): AfkCombatEstimateResult {
  const livingCompanions = companions.filter((companion) => companion.state !== "dead");

  if (livingCompanions.length === 0) {
    return unavailable("no_party", "AFK estimate needs at least one living companion.");
  }

  const enemies = getSubzoneEnemySummaries(state, subzone);

  if (enemies.length === 0) {
    return unavailable("no_enemies", "This subzone has no enemies to estimate.");
  }

  const averageEnemyHealth = average(enemies.map((enemy) => enemy.maxHealth));
  const averageEnemyLevel = average(enemies.map((enemy) => enemy.level));
  const averageEnemyXp = average(enemies.map((enemy) => getSameLevelEnemyXp(enemy.level)));
  const partyDamagePerMinute = livingCompanions.reduce(
    (total, companion) =>
      total + getCompanionDamagePerMinute(state, companion, enemies),
    0,
  );
  const partyKillPotentialPerMinute =
    averageEnemyHealth > 0 ? partyDamagePerMinute / averageEnemyHealth : 0;
  const accessProfile = getAccessProfile(
    livingCompanions,
    enemies,
    averageEnemyHealth,
    partyDamagePerMinute,
    subzone,
  );
  const accessAdjustedKillPotentialPerMinute =
    partyKillPotentialPerMinute * accessProfile.accessEfficiency;
  const hasAuthoredRespawnDelay = Number.isFinite(ENEMY_RESPAWN_DELAY_MS) &&
    ENEMY_RESPAWN_DELAY_MS > 0;
  const respawnDelayMs = hasAuthoredRespawnDelay
    ? ENEMY_RESPAWN_DELAY_MS
    : DEFAULT_RESPAWN_DELAY_MS;
  const subzoneSpawnCapPerMinute = getSubzoneSpawnCount(state, subzone) *
    (60_000 / respawnDelayMs);
  const survivabilityPercent = getPartySurvivabilityPercent(
    state,
    livingCompanions,
    enemies,
  );
  const survivabilityMultiplier = getSurvivabilityRewardMultiplier(survivabilityPercent);
  const finalKillsPerMinute = Math.min(
    accessAdjustedKillPotentialPerMinute,
    subzoneSpawnCapPerMinute,
  ) * survivabilityMultiplier;
  const averageCompanionLevel = average(
    livingCompanions.map((companion) => companion.characterLevel),
  );
  const levelGapMultiplier = getLevelGapXpModifier(
    averageCompanionLevel,
    averageEnemyLevel,
  );
  const experiencePerMinute = Math.floor(
    finalKillsPerMinute * averageEnemyXp * levelGapMultiplier,
  );
  const combatExperienceMultiplier = roundToTwo(
    survivabilityMultiplier * levelGapMultiplier,
  );
  const combatDropMultiplier = roundToTwo(survivabilityMultiplier);
  const combatExperienceMultiplierSources: AfkCombatMultiplierSource[] = [
    {
      label: "Survivability",
      multiplier: survivabilityMultiplier,
      description: "Reduces rewards when the party cannot fully sustain enemy pressure.",
    },
    {
      label: "Level gap",
      multiplier: levelGapMultiplier,
      description: "Uses the current enemy XP level-gap modifier.",
    },
  ];
  const combatDropMultiplierSources: AfkCombatMultiplierSource[] = [
    {
      label: "Survivability",
      multiplier: survivabilityMultiplier,
      description: "Drops scale down when the party cannot safely maintain kills.",
    },
  ];
  const resourceEstimatePerMinute = getResourceEstimatePerMinute(
    state,
    livingCompanions,
    subzone,
  );
  const enemyKillShares = getEnemyKillShares(enemies, finalKillsPerMinute * 60);
  const estimatedDropsPerHour = getEstimatedDropsForKillShares(enemyKillShares);
  const warnings = getWarnings({
    partyKillPotentialPerMinute: accessAdjustedKillPotentialPerMinute,
    subzoneSpawnCapPerMinute,
    survivabilityPercent,
    enemies,
    isRespawnEstimated: !hasAuthoredRespawnDelay,
  });

  return {
    available: true,
    rating: getRating(
      partyKillPotentialPerMinute,
      subzoneSpawnCapPerMinute,
      survivabilityPercent,
    ),
    mapId: map.id,
    mapName: map.displayName,
    subzoneId: subzone.id,
    subzoneName: subzone.displayName,
    partyDamagePerMinute: Math.round(partyDamagePerMinute),
    partyKillPotentialPerMinute: roundToTwo(partyKillPotentialPerMinute),
    subzoneSpawnCapPerMinute: roundToTwo(subzoneSpawnCapPerMinute),
    accessEfficiencyPercent: Math.round(accessProfile.accessEfficiency * 100),
    downtimeSecondsPerKill: roundToTwo(accessProfile.downtimeSecondsPerKill),
    killsPerHour: Math.floor(finalKillsPerMinute * 60),
    experiencePerMinute,
    survivabilityPercent: Math.round(survivabilityPercent),
    combatExperienceMultiplier,
    combatDropMultiplier,
    combatExperienceMultiplierSources,
    combatDropMultiplierSources,
    resourceEstimatePerMinute: roundToTwo(resourceEstimatePerMinute),
    resources: [...new Set(subzone.resourceLocations.map((resource) => resource.resourceType))],
    enemies,
    enemyKillShares,
    estimatedDropsPerHour,
    warnings,
  };
}

function getSubzoneEnemySummaries(
  state: GameState,
  subzone: ZoneSubzone,
): AfkCombatEnemySummary[] {
  const liveEnemies = Object.values(state.entities).filter(
    (entity): entity is Enemy =>
      entity.kind === "enemy" &&
      !entity.isTargetDummy &&
      entity.subzoneId === subzone.id,
  );

  const enemyTypeIds = liveEnemies.length > 0
    ? [...new Set(liveEnemies.map((enemy) => enemy.enemyTypeId).filter(Boolean))]
    : subzone.enemyTypeIds;

  return enemyTypeIds.map((enemyTypeId) => {
    const enemyType = enemyTypeId ? getEnemyType(enemyTypeId) : undefined;
    const liveEnemy = liveEnemies.find((enemy) => enemy.enemyTypeId === enemyTypeId);
    const spawnCount = Math.max(
      1,
      liveEnemies.filter((enemy) => enemy.enemyTypeId === enemyTypeId).length,
    );
    const level = liveEnemy?.level ?? enemyType?.level ?? subzone.levelRange.min;
    const scaledStats = getScaledEnemyStats(level, enemyType?.archetypeId);

    return {
      enemyTypeId: enemyTypeId ?? subzone.enemyTypeIds[0],
      displayName: enemyType?.displayName ?? enemyTypeId ?? "Unknown Enemy",
      level,
      maxHealth: liveEnemy?.maxHealth ?? enemyType?.maxHealth ?? scaledStats.maxHealth,
      attack: liveEnemy?.attack ?? scaledStats.attack,
      defense: liveEnemy?.defense ?? scaledStats.defense,
      magicDefense: liveEnemy?.magicDefense ?? scaledStats.magicDefense,
      attackCooldownMs:
        liveEnemy?.attackCooldownMs ??
        enemyType?.attackCooldownMs ??
        DEFAULT_ENEMY_ATTACK_COOLDOWN_MS,
      spawnCount,
    };
  });
}

function getSubzoneSpawnCount(state: GameState, subzone: ZoneSubzone): number {
  const authoredEnemyCount = Object.values(state.entities).filter(
    (entity) =>
      entity.kind === "enemy" &&
      !entity.isTargetDummy &&
      entity.subzoneId === subzone.id,
  ).length;

  return Math.max(authoredEnemyCount, subzone.enemyTypeIds.length);
}

function getCompanionDamagePerMinute(
  state: GameState,
  companion: Companion,
  enemies: AfkCombatEnemySummary[],
): number {
  const stats = getCompanionDerivedStatsWithPartyBuffs(state, companion);
  const roleEfficiency = ROLE_COMBAT_EFFICIENCY[companion.role];
  const averagePhysicalDefense = average(enemies.map((enemy) => enemy.defense));
  const averageMagicDefense = average(enemies.map((enemy) => enemy.magicDefense));
  const basicAttackDamage = applyDefenseReduction(
    stats.attack,
    averagePhysicalDefense,
  );
  const basicAttackPerMinute =
    basicAttackDamage * (60_000 / COMPANION_GLOBAL_COOLDOWN_MS);
  const skillDamagePerMinute = getActiveSkillsForCompanion(companion).reduce(
    (total, skill) => {
      const scaledSkill = getScaledSkillDefinitionForCompanion(companion, skill);
      return total + getSkillDamagePerMinute(
        scaledSkill,
        stats.attack,
        stats.magicPower,
        averagePhysicalDefense,
        averageMagicDefense,
      );
    },
    0,
  );
  const buffMultiplier = getOffensiveBuffMultiplier(companion);

  return (basicAttackPerMinute + skillDamagePerMinute) * roleEfficiency * buffMultiplier;
}

function getAccessProfile(
  companions: Companion[],
  enemies: AfkCombatEnemySummary[],
  averageEnemyHealth: number,
  partyDamagePerMinute: number,
  subzone: ZoneSubzone,
): { accessEfficiency: number; downtimeSecondsPerKill: number } {
  if (partyDamagePerMinute <= 0 || averageEnemyHealth <= 0) {
    return { accessEfficiency: 0, downtimeSecondsPerKill: 0 };
  }

  const combatSecondsPerKill = averageEnemyHealth / (partyDamagePerMinute / 60);
  const encounterAreaCount = Math.max(1, subzone.encounterAreas?.length ?? 1);
  const averageSpawnCountPerArea =
    enemies.reduce((total, enemy) => total + enemy.spawnCount, 0) / encounterAreaCount;
  const crossPackDowntime = encounterAreaCount > 1
    ? CROSS_PACK_DOWNTIME_SECONDS / Math.max(1, averageSpawnCountPerArea)
    : 0;
  const formationDowntime =
    Math.max(0, companions.length - 1) *
    PARTY_FORMATION_DOWNTIME_SECONDS_PER_EXTRA_COMPANION;
  const downtimeSecondsPerKill =
    BASE_RETARGET_DOWNTIME_SECONDS + crossPackDowntime + formationDowntime;
  const accessEfficiency =
    combatSecondsPerKill / (combatSecondsPerKill + downtimeSecondsPerKill) *
    AFK_CONTROL_EFFICIENCY;

  return {
    accessEfficiency: Math.max(0, Math.min(1, accessEfficiency)),
    downtimeSecondsPerKill,
  };
}

function getSkillDamagePerMinute(
  skill: SkillDefinition,
  attack: number,
  magicPower: number,
  physicalDefense: number,
  magicDefense: number,
): number {
  const effect = skill.effect;
  const cooldownMs = getSkillCooldownMs(skill);
  const usesPerMinute = 60_000 / cooldownMs;

  switch (effect.type) {
    case "lungeDamage":
    case "skirmishShot":
    case "pounce":
    case "flagellantLash":
      return applyDefenseReduction(
        attack * effect.powerMultiplier,
        physicalDefense,
      ) * usesPerMinute;
    case "sweepingDamage":
      return applyDefenseReduction(
        attack * effect.mainPowerMultiplier,
        physicalDefense,
      ) * usesPerMinute;
    case "maulSweep":
      return applyDefenseReduction(
        attack * effect.powerMultiplier,
        physicalDefense,
      ) * usesPerMinute;
    case "shockwave":
      return applyDefenseReduction(
        attack * effect.powerMultiplier,
        physicalDefense,
      ) * usesPerMinute;
    case "arrowBurst":
      return applyDefenseReduction(
        attack * effect.powerMultiplier,
        physicalDefense,
      ) * usesPerMinute;
    case "circleOfRenewal":
      return applyDefenseReduction(
        magicPower * effect.powerMultiplier,
        magicDefense,
      ) * usesPerMinute;
    case "fireBurst":
      return applyDefenseReduction(
        magicPower * effect.powerMultiplier,
        magicDefense,
      ) * usesPerMinute;
    case "taunt":
      return effect.powerMultiplier
        ? applyDefenseReduction(attack * effect.powerMultiplier, physicalDefense) *
          usesPerMinute
        : 0;
    default:
      return 0;
  }
}

function getOffensiveBuffMultiplier(companion: Companion): number {
  return getActiveSkillsForCompanion(companion).reduce((multiplier, skill) => {
    const scaledSkill = getScaledSkillDefinitionForCompanion(companion, skill);
    const effect = scaledSkill.effect;

    if (
      effect.type !== "selfBuff" &&
      effect.type !== "partyBuff" &&
      effect.type !== "allyBuff"
    ) {
      return multiplier;
    }

    const uptime = Math.min(1, effect.durationMs / getSkillCooldownMs(scaledSkill));
    const bonusDamage = effect.bonusDamage;

    return multiplier + bonusDamage * 0.08 * uptime;
  }, 1);
}

function getPartySurvivabilityPercent(
  state: GameState,
  companions: Companion[],
  enemies: AfkCombatEnemySummary[],
): number {
  const incomingDamagePerMinute = enemies.reduce(
    (total, enemy) =>
      total + enemy.attack * (60_000 / enemy.attackCooldownMs),
    0,
  );
  const sustainPerMinute = companions.reduce((total, companion) => {
    const stats = getCompanionDerivedStatsWithPartyBuffs(state, companion);
    const defensiveReduction = getDefenseReduction(
      Math.max(stats.defense, stats.magicDefense),
    );
    const healthBuffer = stats.maxHealth / 3;
    const passiveSustain = stats.healthRegen * 12;
    const skillSustain = getSkillSurvivabilityPerMinute(companion, stats.maxHealth, stats.healingPower);
    const roleMultiplier = ROLE_SURVIVABILITY_EFFICIENCY[companion.role];

    return total +
      (healthBuffer + passiveSustain + skillSustain) *
        roleMultiplier *
        (1 + defensiveReduction);
  }, 0);

  if (incomingDamagePerMinute <= 0) {
    return 100;
  }

  return Math.max(0, Math.min(200, sustainPerMinute / incomingDamagePerMinute * 100));
}

function getSkillSurvivabilityPerMinute(
  companion: Companion,
  maxHealth: number,
  healingPower: number,
): number {
  return getActiveSkillsForCompanion(companion).reduce((total, skill) => {
    const scaledSkill = getScaledSkillDefinitionForCompanion(companion, skill);
    const effect = scaledSkill.effect;
    const usesPerMinute = 60_000 / getSkillCooldownMs(scaledSkill);

    switch (effect.type) {
      case "heal":
        return total + healingPower * effect.powerMultiplier * usesPerMinute;
      case "selfPercentHeal":
        return total + maxHealth * (effect.healPercent / 100) * usesPerMinute;
      case "healOverTime":
        return total +
          maxHealth *
            (effect.healPercentMaxHealth / 100) *
            (effect.durationMs / effect.tickIntervalMs) *
            usesPerMinute;
      case "damageMitigation":
      case "selfMitigationBuff":
        return total + maxHealth * (effect.mitigationPercent / 100) * usesPerMinute;
      case "shieldBlock":
      case "barrierBlock":
        return total + maxHealth * 0.2 * effect.blocks * usesPerMinute;
      case "manaShield":
      case "absorbShield":
        return total + maxHealth * (effect.absorbPercentMaxHealth / 100) * usesPerMinute;
      case "frostArmor":
        return total + maxHealth * (effect.mitigationPercent / 100) * usesPerMinute;
      case "partyClassBuff":
        return total + maxHealth * ((effect.mitigationPercent ?? 0) / 100) * usesPerMinute;
      default:
        return total;
    }
  }, 0);
}

function getResourceEstimatePerMinute(
  state: GameState,
  companions: Companion[],
  subzone: ZoneSubzone,
): number {
  if (subzone.resourceLocations.length === 0) {
    return 0;
  }

  const gatherScore = companions.reduce((total, companion) => {
    const stats = getCompanionDerivedStatsWithPartyBuffs(state, companion);
    const gathererBonus = companion.role === "gatherer" ? 1.5 : 0.35;

    return total + (companion.gatherSpeed + stats.healthRegen * 0.05) * gathererBonus;
  }, 0);

  return Math.min(subzone.resourceLocations.length * 2, gatherScore * 0.35);
}

function getSurvivabilityRewardMultiplier(survivabilityPercent: number): number {
  if (survivabilityPercent >= 100) {
    return 1;
  }

  if (survivabilityPercent < 25) {
    return 0;
  }

  return roundToTwo(survivabilityPercent / 100);
}

function getRating(
  partyKillPotentialPerMinute: number,
  subzoneSpawnCapPerMinute: number,
  survivabilityPercent: number,
): AfkCombatRating {
  const capRatio = subzoneSpawnCapPerMinute > 0
    ? partyKillPotentialPerMinute / subzoneSpawnCapPerMinute
    : 0;

  if (survivabilityPercent < 25 || capRatio < 0.05) {
    return "Overmatched";
  }

  if (survivabilityPercent < 70 || capRatio < 0.35) {
    return "Weak";
  }

  if (survivabilityPercent < 100 || capRatio < 0.8) {
    return "Adequate";
  }

  return "Strong";
}

function getWarnings({
  partyKillPotentialPerMinute,
  subzoneSpawnCapPerMinute,
  survivabilityPercent,
  enemies,
  isRespawnEstimated,
}: {
  partyKillPotentialPerMinute: number;
  subzoneSpawnCapPerMinute: number;
  survivabilityPercent: number;
  enemies: AfkCombatEnemySummary[];
  isRespawnEstimated: boolean;
}): AfkCombatEstimateWarning[] {
  const warnings = new Set<AfkCombatEstimateWarning>();

  if (
    subzoneSpawnCapPerMinute > 0 &&
    partyKillPotentialPerMinute / subzoneSpawnCapPerMinute < 0.35
  ) {
    warnings.add("low_damage");
  }

  if (survivabilityPercent < 100) {
    warnings.add("low_survivability");
  }

  if (enemies.some((enemy) => enemy.attackCooldownMs === DEFAULT_ENEMY_ATTACK_COOLDOWN_MS)) {
    warnings.add("enemy_data_incomplete");
  }

  if (isRespawnEstimated) {
    warnings.add("respawn_data_estimated");
  }

  return [...warnings];
}

function getEnemyKillShares(
  enemies: AfkCombatEnemySummary[],
  killsPerHour: number,
): AfkCombatEnemyKillShare[] {
  const totalSpawnCount = enemies.reduce(
    (total, enemy) => total + enemy.spawnCount,
    0,
  );

  if (totalSpawnCount <= 0 || killsPerHour <= 0) {
    return [];
  }

  return enemies.map((enemy) => ({
    enemyTypeId: enemy.enemyTypeId,
    displayName: enemy.displayName,
    level: enemy.level,
    killsPerHour: Math.floor(killsPerHour * (enemy.spawnCount / totalSpawnCount)),
  }));
}

function getEstimatedDropsForKillShares(
  killShares: AfkCombatEnemyKillShare[],
): AfkCombatDropEstimate[] {
  const rewards = killShares.flatMap((share) =>
    getEstimatedDropsForEnemyShare(share),
  );
  const quantitiesByItemId = new Map<ItemId, number>();

  for (const reward of rewards) {
    quantitiesByItemId.set(
      reward.itemId,
      (quantitiesByItemId.get(reward.itemId) ?? 0) + reward.quantity,
    );
  }

  return [...quantitiesByItemId.entries()]
    .filter(([, quantityPerHour]) => quantityPerHour > 0)
    .map(([itemId, quantityPerHour]) => ({ itemId, quantityPerHour }));
}

function getEstimatedDropsForEnemyShare(
  share: AfkCombatEnemyKillShare,
): AggregateDropReward[] {
  const enemyType = getEnemyType(share.enemyTypeId);
  const archetypeId = enemyType?.archetypeId as EnemyArchetypeId | undefined;

  if (!archetypeId || share.killsPerHour <= 0) {
    return [];
  }

  const tier = getLootTierForLevel(share.level);
  const superiorKills = share.killsPerHour * SUPERIOR_ENEMY_CHANCE;
  const normalKills = Math.max(0, share.killsPerHour - superiorKills);

  return [
    ...estimateEnemyDropTableRewards(
      archetypeId,
      tier,
      normalKills,
      () => 0,
      share.enemyTypeId,
    ),
    ...estimateEnemyDropTableRewards(
      archetypeId,
      tier,
      superiorKills,
      () => 0,
      share.enemyTypeId,
      "superior",
    ),
  ];
}

function applyDefenseReduction(rawDamage: number, defense: number): number {
  return Math.max(0, rawDamage * (1 - getDefenseReduction(defense)));
}

function getDefenseReduction(defense: number): number {
  return DEFENSE_REDUCTION_FACTOR * defense / (defense + DEFENSE_SOFTNESS);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function unavailable(
  reason: UnavailableAfkCombatEstimate["reason"],
  message: string,
): UnavailableAfkCombatEstimate {
  return {
    available: false,
    reason,
    message,
  };
}
