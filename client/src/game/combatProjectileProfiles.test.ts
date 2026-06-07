import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  BASIC_PROJECTILE_IMPACT_RADIUS,
  BASIC_PROJECTILE_SPEED,
  getCompanionBasicProjectileProfile,
  getEnemyBasicProjectileProfile,
} from "./combatProjectileProfiles";

describe("combat projectile profiles", () => {
  it("uses Hunter class, not range alone, for companion basic projectiles", () => {
    const beginner = createCompanion(
      "beginner",
      { x: 0, y: 0 },
      "beginner",
      "fighter",
      0,
      "beginner",
    );
    const hunter = createCompanion(
      "hunter",
      { x: 0, y: 0 },
      "hunter",
      "fighter",
      0,
      "hunter",
    );

    expect(getCompanionBasicProjectileProfile(beginner)).toBeNull();
    expect(getCompanionBasicProjectileProfile(hunter)).toEqual({
      visualProfileId: "hunter_arrow",
      speed: BASIC_PROJECTILE_SPEED,
      impactRadius: BASIC_PROJECTILE_IMPACT_RADIUS,
    });
  });

  it("uses resolved ranged combat style for enemy basic projectiles", () => {
    const thrower = createEnemy("thrower", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "goblin_thrower",
    });
    const bogImp = createEnemy("bog-imp", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "bog_imp",
    });
    const shaman = createEnemy("shaman", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "goblin_shaman",
    });
    const azureMass = createEnemy("azure-mass", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "azure_mass",
    });

    expect(getEnemyBasicProjectileProfile(thrower)?.visualProfileId).toBe(
      "goblin_thrower",
    );
    expect(getEnemyBasicProjectileProfile(bogImp)?.visualProfileId).toBe("bog_imp");
    expect(getEnemyBasicProjectileProfile(shaman)).toBeNull();
    expect(getEnemyBasicProjectileProfile(azureMass)).toBeNull();
  });
});
