import { describe, expect, it } from "vitest";
import { ENEMY_ARCHETYPES, ENEMY_TYPES } from "./enemyArchetypes";
import { createEnemy } from "./entities";

describe("prototype enemy identity definitions", () => {
  it("defines broad archetypes and specific spawnable enemy types separately", () => {
    expect(Object.keys(ENEMY_ARCHETYPES)).toHaveLength(10);
    expect(Object.keys(ENEMY_TYPES)).toHaveLength(12);
    expect(ENEMY_ARCHETYPES).toHaveProperty("wolf");
    expect(ENEMY_ARCHETYPES).toHaveProperty("orc");
    expect(ENEMY_ARCHETYPES).toHaveProperty("goblin");
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
    expect(enemy.attackCooldownMs).toBe(1300);
    expect(enemy.attackRange).toBe(4);
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
    });

    expect(enemy.level).toBe(5);
    expect(enemy.health).toBe(9);
    expect(enemy.maxHealth).toBe(9);
    expect(enemy.attack).toBe(4);
    expect(enemy.scalingOverrides).toEqual(["maxHealth", "attack"]);
    expect(enemy.attackCooldownMs).toBe(500);
    expect(enemy.attackRange).toBe(2);
  });
});
