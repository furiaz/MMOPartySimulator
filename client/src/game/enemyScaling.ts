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
export const MAX_ENEMY_SCALING_LEVEL = 20;

const DEFAULT_ARCHETYPE_THREAT_MODIFIER = 1;

const BAND_MODIFIERS: Record<EnemyScalingBand, number> = {
  starter: 1,
  early: 1,
};

const STANDARD_ENEMY_CURVES: Record<
  EnemyScalingBand,
  {
    minLevel: number;
    maxLevel: number;
    minStats: EnemyCombatStats;
    maxStats: EnemyCombatStats;
  }
> = {
  starter: {
    minLevel: 1,
    maxLevel: 10,
    minStats: {
      maxHealth: 6,
      attack: 2,
      defense: 0,
      magicDefense: 0,
      evasion: 0,
    },
    maxStats: {
      maxHealth: 60,
      attack: 8,
      defense: 6,
      magicDefense: 6,
      evasion: 3,
    },
  },
  early: {
    minLevel: 11,
    maxLevel: 20,
    minStats: {
      maxHealth: 70,
      attack: 10,
      defense: 7,
      magicDefense: 7,
      evasion: 3,
    },
    maxStats: {
      maxHealth: 160,
      attack: 20,
      defense: 16,
      magicDefense: 16,
      evasion: 7,
    },
  },
};

const STARTER_MAX_HEALTH_OVERRIDES: Partial<Record<number, number>> = {
  1: 8,
  2: 14,
  3: 23,
  4: 30,
  5: 37,
  6: 41,
  7: 45,
};

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
  const effectiveLevel = getEffectiveEnemyScalingLevel(level);
  const scalingBand = getEnemyScalingBand(effectiveLevel);
  const curve = STANDARD_ENEMY_CURVES[scalingBand];
  const progress =
    curve.maxLevel === curve.minLevel
      ? 0
      : (effectiveLevel - curve.minLevel) / (curve.maxLevel - curve.minLevel);
  const stats = {
    ...interpolateStats(curve.minStats, curve.maxStats, progress),
    maxHealth: getScaledMaxHealth(
      curve.minStats.maxHealth,
      curve.maxStats.maxHealth,
      progress,
      effectiveLevel,
    ),
  };
  const levelThreat = effectiveLevel;
  const archetypeThreatModifier = getArchetypeThreatModifier(archetypeId);
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

function interpolateStats(
  minStats: EnemyCombatStats,
  maxStats: EnemyCombatStats,
  progress: number,
): EnemyCombatStats {
  return {
    maxHealth: interpolateStat(minStats.maxHealth, maxStats.maxHealth, progress),
    attack: interpolateStat(minStats.attack, maxStats.attack, progress),
    defense: interpolateStat(minStats.defense, maxStats.defense, progress),
    magicDefense: interpolateStat(
      minStats.magicDefense,
      maxStats.magicDefense,
      progress,
    ),
    evasion: interpolateStat(minStats.evasion, maxStats.evasion, progress),
  };
}

function getScaledMaxHealth(
  minValue: number,
  maxValue: number,
  progress: number,
  effectiveLevel: number,
): number {
  return (
    STARTER_MAX_HEALTH_OVERRIDES[effectiveLevel] ??
    interpolateStat(minValue, maxValue, progress)
  );
}

function interpolateStat(minValue: number, maxValue: number, progress: number): number {
  return Math.round(minValue + (maxValue - minValue) * progress);
}

function getArchetypeThreatModifier(
  _archetypeId: EnemyArchetypeId | undefined,
): number {
  return DEFAULT_ARCHETYPE_THREAT_MODIFIER;
}
