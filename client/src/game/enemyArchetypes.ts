import type {
  Enemy,
  EnemyArchetypeDefinition,
  EnemyArchetypeId,
  EnemyCombatStyle,
  EnemyTargetPreference,
  EnemyTemperament,
  EnemyTypeDefinition,
  EnemyTypeId,
} from "./types";

const DEFAULT_ENEMY_ATTACK_RANGE = 1;
export const AZURE_MASS_COMBAT_BODY_RADIUS = 2.5;

export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetypeDefinition> = {
  slime: {
    id: "slime",
    displayName: "Slime",
    defaultCombatStyle: "melee",
    defaultAttackRange: 1,
    defaultTemperament: "passive",
  },
  bat: {
    id: "bat",
    displayName: "Bat",
    defaultCombatStyle: "melee",
    defaultAttackRange: 1,
    defaultTemperament: "aggressive",
  },
  spider: {
    id: "spider",
    displayName: "Spider",
    defaultCombatStyle: "melee",
    defaultAttackRange: 1,
    defaultTemperament: "aggressive",
  },
  goblin: {
    id: "goblin",
    displayName: "Goblin",
    defaultCombatStyle: "melee",
    defaultAttackRange: 1,
    defaultTemperament: "aggressive",
  },
  imp: {
    id: "imp",
    displayName: "Imp",
    defaultCombatStyle: "ranged",
    defaultAttackRange: 3,
    defaultTemperament: "aggressive",
  },
  wolf: {
    id: "wolf",
    displayName: "Wolf",
    defaultCombatStyle: "melee",
    defaultAttackRange: 1,
    defaultTemperament: "aggressive",
  },
  crawler: {
    id: "crawler",
    displayName: "Crawler",
    defaultCombatStyle: "melee",
    defaultAttackRange: 1,
    defaultTemperament: "aggressive",
  },
  mossling: {
    id: "mossling",
    displayName: "Mossling",
    defaultCombatStyle: "support",
    defaultAttackRange: 1,
    defaultTemperament: "aggressive",
  },
  wisp: {
    id: "wisp",
    displayName: "Wisp",
    defaultCombatStyle: "ranged",
    defaultAttackRange: 4,
    defaultTemperament: "aggressive",
  },
  orc: {
    id: "orc",
    displayName: "Orc",
    defaultCombatStyle: "melee",
    defaultAttackRange: 1,
    defaultTemperament: "aggressive",
  },
};

export const ENEMY_TYPES: Record<EnemyTypeId, EnemyTypeDefinition> = {
  slime: {
    id: "slime",
    displayName: "Slime",
    archetypeId: "slime",
    temperament: "passive",
    targetPreference: "closest",
    level: 1,
    attackCooldownMs: 2400,
    detectionRange: 10,
    combatBodyRadius: 0.7,
  },
  slimeward_heavy_slime: {
    id: "slimeward_heavy_slime",
    displayName: "Heavy Slime",
    archetypeId: "slime",
    temperament: "aggressive",
    targetPreference: "closest",
    level: 8,
    attackCooldownMs: 2600,
    detectionRange: 10,
    combatBodyRadius: 1.25,
  },
  slimeward_pale_ooze: {
    id: "slimeward_pale_ooze",
    displayName: "Pale Ooze",
    archetypeId: "slime",
    temperament: "aggressive",
    targetPreference: "closest",
    level: 8,
    attackCooldownMs: 2200,
    detectionRange: 10,
    combatBodyRadius: 0.6,
  },
  slimeward_spitter_slime: {
    id: "slimeward_spitter_slime",
    displayName: "Slime Spitter",
    archetypeId: "slime",
    temperament: "aggressive",
    combatStyle: "ranged",
    targetPreference: "lowestHealth",
    level: 9,
    attackCooldownMs: 2800,
    detectionRange: 11,
    attackRange: 4,
    combatBodyRadius: 1.4,
  },
  azure_mass: {
    id: "azure_mass",
    displayName: "The Azure Mass",
    archetypeId: "slime",
    temperament: "aggressive",
    targetPreference: "leader",
    level: 9,
    attackCooldownMs: 3000,
    detectionRange: 18,
    attackRange: 2,
    combatBodyRadius: AZURE_MASS_COMBAT_BODY_RADIUS,
  },
  cave_bat: {
    id: "cave_bat",
    displayName: "Cave Bat",
    archetypeId: "bat",
    temperament: "aggressive",
    targetPreference: "closest",
    level: 2,
    attackCooldownMs: 1800,
    detectionRange: 10,
    combatBodyRadius: 0.75,
  },
  forest_spider: {
    id: "forest_spider",
    displayName: "Forest Spider",
    archetypeId: "spider",
    temperament: "aggressive",
    targetPreference: "closest",
    level: 3,
    attackCooldownMs: 2400,
    detectionRange: 8,
    combatBodyRadius: 0.8,
  },
  goblin_scout: {
    id: "goblin_scout",
    displayName: "Goblin Scout",
    archetypeId: "goblin",
    temperament: "aggressive",
    targetPreference: "leader",
    level: 4,
    attackCooldownMs: 2000,
    detectionRange: 12,
    combatBodyRadius: 0.75,
  },
  goblin_thrower: {
    id: "goblin_thrower",
    displayName: "Goblin Thrower",
    archetypeId: "goblin",
    temperament: "aggressive",
    combatStyle: "ranged",
    targetPreference: "lowestHealth",
    level: 7,
    attackCooldownMs: 2600,
    detectionRange: 10,
    attackRange: 4,
    combatBodyRadius: 0.75,
  },
  bog_imp: {
    id: "bog_imp",
    displayName: "Bog Imp",
    archetypeId: "imp",
    temperament: "aggressive",
    targetPreference: "closest",
    level: 5,
    attackCooldownMs: 2600,
    detectionRange: 10,
    combatBodyRadius: 0.6,
  },
  stone_crawler: {
    id: "stone_crawler",
    displayName: "Stone Crawler",
    archetypeId: "crawler",
    temperament: "aggressive",
    targetPreference: "leader",
    level: 8,
    attackCooldownMs: 3000,
    detectionRange: 8,
    combatBodyRadius: 0.75,
  },
  goblin_shaman: {
    id: "goblin_shaman",
    displayName: "Goblin Shaman",
    archetypeId: "goblin",
    temperament: "aggressive",
    combatStyle: "support",
    targetPreference: "lowestHealth",
    level: 10,
    attackCooldownMs: 3000,
    detectionRange: 10,
    attackRange: 3,
    combatBodyRadius: 0.6,
  },
  ash_wisp: {
    id: "ash_wisp",
    displayName: "Ash Wisp",
    archetypeId: "wisp",
    temperament: "aggressive",
    targetPreference: "leader",
    level: 11,
    attackCooldownMs: 2400,
    detectionRange: 12,
    combatBodyRadius: 0.6,
  },
  mossling: {
    id: "mossling",
    displayName: "Mossling",
    archetypeId: "mossling",
    temperament: "aggressive",
    targetPreference: "closest",
    level: 9,
    attackCooldownMs: 2800,
    detectionRange: 8,
    combatBodyRadius: 0.6,
  },
  wolf: {
    id: "wolf",
    displayName: "Wolf",
    archetypeId: "wolf",
    temperament: "aggressive",
    targetPreference: "lowestHealth",
    level: 6,
    attackCooldownMs: 2000,
    detectionRange: 10,
    combatBodyRadius: 0.6,
  },
  orc: {
    id: "orc",
    displayName: "Orc",
    archetypeId: "orc",
    temperament: "aggressive",
    targetPreference: "leader",
    level: 12,
    attackCooldownMs: 2660,
    detectionRange: 10,
    combatBodyRadius: 0.6,
  },
};

export function getEnemyArchetype(
  archetypeId: EnemyArchetypeId | undefined,
): EnemyArchetypeDefinition | undefined {
  return archetypeId ? ENEMY_ARCHETYPES[archetypeId] : undefined;
}

export function getEnemyType(
  enemyTypeId: EnemyTypeId | undefined,
): EnemyTypeDefinition | undefined {
  return enemyTypeId ? ENEMY_TYPES[enemyTypeId] : undefined;
}

export function getEnemyDropArchetypeId(
  enemy: Enemy,
): EnemyArchetypeId | undefined {
  return enemy.archetypeId ?? getEnemyType(enemy.enemyTypeId)?.archetypeId;
}

function getEnemyTypeDefinition(enemy: Enemy): EnemyTypeDefinition | undefined {
  return getEnemyType(enemy.enemyTypeId);
}

function getEnemyArchetypeDefinition(
  enemy: Enemy,
): EnemyArchetypeDefinition | undefined {
  return getEnemyArchetype(getEnemyDropArchetypeId(enemy));
}

export function getEnemyTemperament(enemy: Enemy): EnemyTemperament {
  return (
    getEnemyTypeDefinition(enemy)?.temperament ??
    getEnemyArchetypeDefinition(enemy)?.defaultTemperament ??
    enemy.aggressionMode
  );
}

export function getEnemyCombatStyle(enemy: Enemy): EnemyCombatStyle {
  return (
    getEnemyTypeDefinition(enemy)?.combatStyle ??
    getEnemyArchetypeDefinition(enemy)?.defaultCombatStyle ??
    "melee"
  );
}

export function getEnemyTargetPreference(enemy: Enemy): EnemyTargetPreference {
  return getEnemyTypeDefinition(enemy)?.targetPreference ?? "closest";
}

export function getEnemyDetectionRange(
  enemy: Enemy,
  fallbackRange: number,
): number {
  return getEnemyTypeDefinition(enemy)?.detectionRange ?? fallbackRange;
}

export function getEnemyAttackRange(enemy: Enemy): number {
  return (
    enemy.attackRange ??
    getEnemyTypeDefinition(enemy)?.attackRange ??
    getEnemyArchetypeDefinition(enemy)?.defaultAttackRange ??
    DEFAULT_ENEMY_ATTACK_RANGE
  );
}

export function getEnemyCombatBodyRadius(enemy: Enemy): number {
  return Math.max(
    0,
    enemy.combatBodyRadius ??
      getEnemyTypeDefinition(enemy)?.combatBodyRadius ??
      0,
  );
}
