import type { Enemy, EnemyArchetypeId, EnemyScalingBand } from "./types";

export type EnemyCombatStats = {
  maxHealth: number;
  attack: number;
  defense: number;
  magicDefense: number;
  evasion: number;
};

export type EnemyScalingResult = EnemyCombatStats & {
  level: number;
  effectiveLevel: number;
  scalingBand: EnemyScalingBand;
  threat: number;
};

export const MIN_ENEMY_SCALING_LEVEL = 1;
export const MAX_ENEMY_SCALING_LEVEL = 100;

const DEFAULT_ARCHETYPE_THREAT_MODIFIER = 1;

const BAND_MODIFIERS: Record<EnemyScalingBand, number> = {
  starter: 1,
  early: 1,
};

const ENEMY_SCALING_ANCHORS: Record<number, EnemyCombatStats> = {
  1: { maxHealth: 12, attack: 2, defense: 0, magicDefense: 0, evasion: 0 },
  5: { maxHealth: 45, attack: 5, defense: 2, magicDefense: 2, evasion: 1 },
  10: { maxHealth: 95, attack: 9, defense: 5, magicDefense: 5, evasion: 3 },
  15: { maxHealth: 160, attack: 15, defense: 8, magicDefense: 8, evasion: 5 },
  20: { maxHealth: 240, attack: 20, defense: 12, magicDefense: 12, evasion: 7 },
  30: { maxHealth: 420, attack: 32, defense: 22, magicDefense: 22, evasion: 10 },
  50: { maxHealth: 850, attack: 55, defense: 40, magicDefense: 40, evasion: 15 },
  75: { maxHealth: 1450, attack: 82, defense: 65, magicDefense: 65, evasion: 22 },
  100: { maxHealth: 2200, attack: 110, defense: 90, magicDefense: 90, evasion: 30 },
};

const ENEMY_SCALING_ANCHOR_LEVELS = Object.keys(ENEMY_SCALING_ANCHORS)
  .map(Number)
  .sort((first, second) => first - second);

export function getEnemyScalingBand(level: number): EnemyScalingBand {
  return getEffectiveEnemyScalingLevel(level) <= 10 ? "starter" : "early";
}

export function getEffectiveEnemyScalingLevel(level: number): number {
  return Math.min(
    MAX_ENEMY_SCALING_LEVEL,
    Math.max(MIN_ENEMY_SCALING_LEVEL, Math.floor(level)),
  );
}

export function getScaledEnemyStats(
  level: number,
  archetypeId?: EnemyArchetypeId,
): EnemyScalingResult {
  void archetypeId;

  const effectiveLevel = getEffectiveEnemyScalingLevel(level);
  const scalingBand = getEnemyScalingBand(effectiveLevel);
  const stats = getAnchoredEnemyCombatStats(effectiveLevel);
  const levelThreat = effectiveLevel;
  const archetypeThreatModifier = getArchetypeThreatModifier();
  const threat = Math.round(
    levelThreat * archetypeThreatModifier * BAND_MODIFIERS[scalingBand],
  );

  return {
    ...stats,
    level,
    effectiveLevel,
    scalingBand,
    threat,
  };
}

export function getEnemyCombatStats(enemy: Enemy): EnemyCombatStats {
  return {
    maxHealth: enemy.maxHealth,
    attack: enemy.attack,
    defense: enemy.defense,
    magicDefense: enemy.magicDefense,
    evasion: enemy.evasion,
  };
}

function getAnchoredEnemyCombatStats(level: number): EnemyCombatStats {
  const exactStats = ENEMY_SCALING_ANCHORS[level];

  if (exactStats) {
    return exactStats;
  }

  const lowerLevel =
    [...ENEMY_SCALING_ANCHOR_LEVELS]
      .reverse()
      .find((anchorLevel) => anchorLevel < level) ??
    ENEMY_SCALING_ANCHOR_LEVELS[0];
  const upperLevel =
    ENEMY_SCALING_ANCHOR_LEVELS.find((anchorLevel) => anchorLevel > level) ??
    ENEMY_SCALING_ANCHOR_LEVELS[ENEMY_SCALING_ANCHOR_LEVELS.length - 1];
  const lowerStats = ENEMY_SCALING_ANCHORS[lowerLevel];
  const upperStats = ENEMY_SCALING_ANCHORS[upperLevel];
  const progress =
    upperLevel === lowerLevel ? 0 : (level - lowerLevel) / (upperLevel - lowerLevel);

  return interpolateStats(lowerStats, upperStats, progress);
}

function interpolateStats(
  lowerStats: EnemyCombatStats,
  upperStats: EnemyCombatStats,
  progress: number,
): EnemyCombatStats {
  const defense = interpolateStat(lowerStats.defense, upperStats.defense, progress);

  return {
    maxHealth: interpolateStat(lowerStats.maxHealth, upperStats.maxHealth, progress),
    attack: interpolateStat(lowerStats.attack, upperStats.attack, progress),
    defense,
    magicDefense: defense,
    evasion: interpolateStat(lowerStats.evasion, upperStats.evasion, progress),
  };
}

function interpolateStat(minValue: number, maxValue: number, progress: number): number {
  return Math.round(minValue + (maxValue - minValue) * progress);
}

function getArchetypeThreatModifier(): number {
  return DEFAULT_ARCHETYPE_THREAT_MODIFIER;
}
