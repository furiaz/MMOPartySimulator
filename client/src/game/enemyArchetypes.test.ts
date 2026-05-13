import { describe, expect, it } from "vitest";
import { ENEMY_ARCHETYPES } from "./enemyArchetypes";
import { createEnemy } from "./entities";

describe("prototype enemy archetypes", () => {
  it("defines twelve lightweight prototype enemy archetypes", () => {
    expect(Object.keys(ENEMY_ARCHETYPES)).toHaveLength(12);
    expect(ENEMY_ARCHETYPES).toHaveProperty("wolf");
    expect(ENEMY_ARCHETYPES).toHaveProperty("orc");
    expect(ENEMY_ARCHETYPES).toHaveProperty("goblin_shaman");
  });

  it("keeps archetype ranges numeric and prototype-safe", () => {
    for (const archetype of Object.values(ENEMY_ARCHETYPES)) {
      expect(archetype.detectionRange).toBeGreaterThan(0);
      expect(archetype.attackRange).toBeGreaterThan(0);
      expect(archetype.level).toBeGreaterThan(0);
      expect(archetype.maxHealth).toBeGreaterThan(0);
      expect(archetype.attackCooldownMs).toBeGreaterThan(0);
      expect(Number.isFinite(archetype.detectionRange)).toBe(true);
      expect(Number.isFinite(archetype.attackRange)).toBe(true);
      expect(Number.isFinite(archetype.level)).toBe(true);
      expect(Number.isFinite(archetype.maxHealth)).toBe(true);
      expect(Number.isFinite(archetype.attackCooldownMs)).toBe(true);
    }
  });

  it("applies supported archetype setup values when enemies are created", () => {
    const enemy = createEnemy("thrower", { x: 0, y: 0 }, undefined, {
      archetypeId: "goblin_thrower",
    });

    expect(enemy.aggressionMode).toBe("aggressive");
    expect(enemy.level).toBe(7);
    expect(enemy.health).toBe(3);
    expect(enemy.maxHealth).toBe(3);
    expect(enemy.attackCooldownMs).toBe(1300);
    expect(enemy.attackRange).toBe(4);
  });

  it("lets explicit enemy setup options override archetype defaults", () => {
    const enemy = createEnemy("custom-slime", { x: 0, y: 0 }, undefined, {
      archetypeId: "slime",
      level: 5,
      maxHealth: 9,
      attackCooldownMs: 500,
      attackRange: 2,
    });

    expect(enemy.level).toBe(5);
    expect(enemy.health).toBe(9);
    expect(enemy.maxHealth).toBe(9);
    expect(enemy.attackCooldownMs).toBe(500);
    expect(enemy.attackRange).toBe(2);
  });
});
