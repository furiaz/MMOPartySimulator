import type {
  Enemy,
  EnemyArchetypeDefinition,
  EnemyArchetypeId,
  EnemyCombatStyle,
  EnemyFamilyId,
  EnemyTargetPreference,
  EnemyTemperament,
} from "./types";

const DEFAULT_ENEMY_ATTACK_RANGE = 1;

export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetypeDefinition> = {
  slime: {
    id: "slime",
    displayName: "Slime",
    temperament: "aggressive",
    combatStyle: "melee",
    targetPreference: "closest",
    level: 1,
    maxHealth: 2,
    attackCooldownMs: 1200,
    detectionRange: 5,
    attackRange: 1,
  },
  cave_bat: {
    id: "cave_bat",
    displayName: "Cave Bat",
    temperament: "aggressive",
    combatStyle: "melee",
    targetPreference: "closest",
    level: 2,
    maxHealth: 2,
    attackCooldownMs: 900,
    detectionRange: 5,
    attackRange: 1,
  },
  forest_spider: {
    id: "forest_spider",
    displayName: "Forest Spider",
    temperament: "aggressive",
    combatStyle: "melee",
    targetPreference: "closest",
    level: 3,
    maxHealth: 3,
    attackCooldownMs: 1200,
    detectionRange: 4,
    attackRange: 1,
  },
  goblin_scout: {
    id: "goblin_scout",
    displayName: "Goblin Scout",
    temperament: "aggressive",
    combatStyle: "melee",
    targetPreference: "leader",
    level: 4,
    maxHealth: 3,
    attackCooldownMs: 1000,
    detectionRange: 6,
    attackRange: 1,
  },
  goblin_thrower: {
    id: "goblin_thrower",
    displayName: "Goblin Thrower",
    temperament: "aggressive",
    combatStyle: "ranged",
    targetPreference: "lowestHealth",
    level: 7,
    maxHealth: 3,
    attackCooldownMs: 1300,
    detectionRange: 5,
    attackRange: 4,
  },
  bog_imp: {
    id: "bog_imp",
    displayName: "Bog Imp",
    temperament: "aggressive",
    combatStyle: "ranged",
    targetPreference: "closest",
    level: 5,
    maxHealth: 3,
    attackCooldownMs: 1300,
    detectionRange: 5,
    attackRange: 3,
  },
  stone_crawler: {
    id: "stone_crawler",
    displayName: "Stone Crawler",
    temperament: "aggressive",
    combatStyle: "melee",
    targetPreference: "leader",
    level: 8,
    maxHealth: 5,
    attackCooldownMs: 1500,
    detectionRange: 4,
    attackRange: 1,
  },
  goblin_shaman: {
    id: "goblin_shaman",
    displayName: "Goblin Shaman",
    temperament: "aggressive",
    combatStyle: "support",
    targetPreference: "lowestHealth",
    level: 10,
    maxHealth: 3,
    attackCooldownMs: 1500,
    detectionRange: 5,
    attackRange: 3,
  },
  ash_wisp: {
    id: "ash_wisp",
    displayName: "Ash Wisp",
    temperament: "aggressive",
    combatStyle: "ranged",
    targetPreference: "leader",
    level: 11,
    maxHealth: 3,
    attackCooldownMs: 1200,
    detectionRange: 6,
    attackRange: 4,
  },
  mossling: {
    id: "mossling",
    displayName: "Mossling",
    temperament: "aggressive",
    combatStyle: "support",
    targetPreference: "closest",
    level: 9,
    maxHealth: 2,
    attackCooldownMs: 1400,
    detectionRange: 4,
    attackRange: 1,
  },
  wolf: {
    id: "wolf",
    displayName: "Wolf",
    temperament: "aggressive",
    combatStyle: "melee",
    targetPreference: "lowestHealth",
    level: 6,
    maxHealth: 3,
    attackCooldownMs: 1000,
    detectionRange: 5,
    attackRange: 1,
  },
  orc: {
    id: "orc",
    displayName: "Orc",
    temperament: "aggressive",
    combatStyle: "melee",
    targetPreference: "leader",
    level: 12,
    maxHealth: 6,
    attackCooldownMs: 1330,
    detectionRange: 5,
    attackRange: 1,
  },
};

export function getEnemyArchetype(
  archetypeId: EnemyArchetypeId | undefined,
): EnemyArchetypeDefinition | undefined {
  return archetypeId ? ENEMY_ARCHETYPES[archetypeId] : undefined;
}

export function getEnemyFamilyId(enemy: Enemy): EnemyFamilyId | undefined {
  if (enemy.enemyType) {
    return enemy.enemyType;
  }

  switch (enemy.archetypeId) {
    case "slime":
      return "slime";
    case "cave_bat":
      return "bat";
    case "forest_spider":
      return "spider";
    case "goblin_scout":
    case "goblin_thrower":
    case "goblin_shaman":
      return "goblin";
    case "bog_imp":
      return "imp";
    case "wolf":
      return "wolf";
    case "stone_crawler":
      return "crawler";
    case "mossling":
      return "mossling";
    case "ash_wisp":
      return "wisp";
    case "orc":
      return "orc";
    default:
      return undefined;
  }
}

export function getEnemyTemperament(enemy: Enemy): EnemyTemperament {
  return getEnemyArchetype(enemy.archetypeId)?.temperament ?? enemy.aggressionMode;
}

export function getEnemyCombatStyle(enemy: Enemy): EnemyCombatStyle {
  return getEnemyArchetype(enemy.archetypeId)?.combatStyle ?? "melee";
}

export function getEnemyTargetPreference(enemy: Enemy): EnemyTargetPreference {
  return getEnemyArchetype(enemy.archetypeId)?.targetPreference ?? "closest";
}

export function getEnemyDetectionRange(
  enemy: Enemy,
  fallbackRange: number,
): number {
  return getEnemyArchetype(enemy.archetypeId)?.detectionRange ?? fallbackRange;
}

export function getEnemyAttackRange(enemy: Enemy): number {
  return (
    enemy.attackRange ??
    getEnemyArchetype(enemy.archetypeId)?.attackRange ??
    DEFAULT_ENEMY_ATTACK_RANGE
  );
}
