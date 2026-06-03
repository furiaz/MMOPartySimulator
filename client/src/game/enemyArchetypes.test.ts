import { describe, expect, it } from "vitest";
import {
  AZURE_MASS_COMBAT_BODY_RADIUS,
  ENEMY_ARCHETYPES,
  ENEMY_TYPES,
  getEnemyCombatBodyRadius,
} from "./enemyArchetypes";
import { createEnemy } from "./entities";

const EXPECTED_ENEMY_COMBAT_BODY_RADII = {
  slime: 0.7,
  slimeward_heavy_slime: 1.25,
  slimeward_pale_ooze: 0.6,
  slimeward_spitter_slime: 1.4,
  azure_mass: AZURE_MASS_COMBAT_BODY_RADIUS,
  cave_bat: 0.75,
  forest_spider: 0.8,
  goblin_scout: 0.75,
  goblin_thrower: 0.75,
  bog_imp: 0.6,
  stone_crawler: 0.75,
  goblin_shaman: 0.6,
  ash_wisp: 0.6,
  mossling: 0.6,
  wolf: 0.6,
  orc: 0.6,
} satisfies Record<keyof typeof ENEMY_TYPES, number>;

describe("prototype enemy identity definitions", () => {
  it("defines broad archetypes and specific spawnable enemy types separately", () => {
    expect(Object.keys(ENEMY_ARCHETYPES)).toHaveLength(10);
    expect(Object.keys(ENEMY_TYPES)).toHaveLength(16);
    expect(ENEMY_ARCHETYPES).toHaveProperty("wolf");
    expect(ENEMY_ARCHETYPES).toHaveProperty("orc");
    expect(ENEMY_ARCHETYPES).toHaveProperty("goblin");
    expect(ENEMY_TYPES).toHaveProperty("slimeward_heavy_slime");
    expect(ENEMY_TYPES).toHaveProperty("slimeward_pale_ooze");
    expect(ENEMY_TYPES).toHaveProperty("slimeward_spitter_slime");
    expect(ENEMY_TYPES).toHaveProperty("azure_mass");
    expect(ENEMY_TYPES).toHaveProperty("goblin_shaman");
  });

  it("keeps archetype default attack ranges numeric and prototype-safe", () => {
    for (const archetype of Object.values(ENEMY_ARCHETYPES)) {
      expect(archetype.defaultAttackRange).toBeGreaterThan(0);
      expect(Number.isFinite(archetype.defaultAttackRange)).toBe(true);
    }

    for (const enemyType of Object.values(ENEMY_TYPES)) {
      expect(enemyType.detectionRange).toBeGreaterThan(0);
      expect(enemyType.level).toBeGreaterThan(0);
      expect(enemyType.attackCooldownMs).toBeGreaterThan(0);
      expect(Number.isFinite(enemyType.detectionRange)).toBe(true);
      expect(Number.isFinite(enemyType.level)).toBe(true);
      expect(Number.isFinite(enemyType.attackCooldownMs)).toBe(true);
    }
  });

  it("keeps starter slimes passive and later prototype enemy types aggressive", () => {
    for (const enemyType of Object.values(ENEMY_TYPES)) {
      if (enemyType.id === "slime") {
        expect(enemyType.temperament).toBe("passive");
      } else {
        expect(enemyType.temperament).toBe("aggressive");
      }
    }
  });

  it("maps specific enemy types to the correct broad archetypes", () => {
    expect(ENEMY_TYPES.cave_bat.archetypeId).toBe("bat");
    expect(ENEMY_TYPES.forest_spider.archetypeId).toBe("spider");
    expect(ENEMY_TYPES.goblin_thrower.archetypeId).toBe("goblin");
    expect(ENEMY_TYPES.ash_wisp.archetypeId).toBe("wisp");
  });

  it("applies supported enemy type setup values when enemies are created", () => {
    const enemy = createEnemy("thrower", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "goblin_thrower",
    });

    expect(enemy.enemyTypeId).toBe("goblin_thrower");
    expect(enemy.archetypeId).toBe("goblin");
    expect(enemy.aggressionMode).toBe("aggressive");
    expect(enemy.level).toBe(7);
    expect(enemy.health).toBe(45);
    expect(enemy.maxHealth).toBe(45);
    expect(enemy.attack).toBe(6);
    expect(enemy.defense).toBe(4);
    expect(enemy.magicDefense).toBe(4);
    expect(enemy.evasion).toBe(2);
    expect(enemy.scalingBand).toBe("starter");
    expect(enemy.attackCooldownMs).toBe(2600);
    expect(enemy.attackRange).toBe(4);
    expect(getEnemyCombatBodyRadius(enemy)).toBe(0.75);
  });

  it("configures combat body spacing for every current enemy type", () => {
    for (const [enemyTypeId, combatBodyRadius] of Object.entries(
      EXPECTED_ENEMY_COMBAT_BODY_RADII,
    )) {
      const enemy = createEnemy(enemyTypeId, { x: 0, y: 0 }, undefined, {
        enemyTypeId: enemyTypeId as keyof typeof ENEMY_TYPES,
      });

      expect(ENEMY_TYPES[enemyTypeId as keyof typeof ENEMY_TYPES].combatBodyRadius)
        .toBe(combatBodyRadius);
      expect(enemy.combatBodyRadius).toBe(combatBodyRadius);
      expect(getEnemyCombatBodyRadius(enemy)).toBe(combatBodyRadius);
    }
  });

  it("creates slime archetypes as passive starter enemies", () => {
    const enemy = createEnemy("starter-slime", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "slime",
    });

    expect(enemy.aggressionMode).toBe("passive");
    expect(enemy.level).toBe(1);
  });

  it("lets explicit enemy setup options override archetype defaults", () => {
    const enemy = createEnemy("custom-slime", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "slime",
      level: 5,
      maxHealth: 9,
      attack: 4,
      attackCooldownMs: 500,
      attackRange: 2,
      combatBodyRadius: 1.25,
    });

    expect(enemy.level).toBe(5);
    expect(enemy.health).toBe(9);
    expect(enemy.maxHealth).toBe(9);
    expect(enemy.attack).toBe(4);
    expect(enemy.scalingOverrides).toEqual(["maxHealth", "attack"]);
    expect(enemy.attackCooldownMs).toBe(500);
    expect(enemy.attackRange).toBe(2);
    expect(enemy.combatBodyRadius).toBe(1.25);
  });
});
