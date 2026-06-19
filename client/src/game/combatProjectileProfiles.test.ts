import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  BASIC_PROJECTILE_IMPACT_RADIUS,
  BASIC_PROJECTILE_SPEED,
  getCompanionBasicProjectileProfile,
  getEnemyBasicProjectileProfile,
} from "./combatProjectileProfiles";

describe("combat projectile profiles", () => {
  it("uses class identity for companion basic projectiles", () => {
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
    const elementalist = createCompanion(
      "elementalist",
      { x: 0, y: 0 },
      "elementalist",
      "fighter",
      0,
      "elementalist",
    );
    const runecaster = createCompanion(
      "runecaster",
      { x: 0, y: 0 },
      "runecaster",
      "fighter",
      0,
      "runecaster",
    );
    const lightbearer = createCompanion(
      "lightbearer",
      { x: 0, y: 0 },
      "lightbearer",
      "support",
      0,
      "lightbearer",
    );
    const penitent = createCompanion(
      "penitent",
      { x: 0, y: 0 },
      "penitent",
      "support",
      0,
      "penitent",
    );

    expect(getCompanionBasicProjectileProfile(beginner)).toBeNull();
    expect(getCompanionBasicProjectileProfile(penitent)).toBeNull();
    expect(getCompanionBasicProjectileProfile(hunter)).toEqual({
      damageType: "physical",
      powerMultiplier: 1,
      visualProfileId: "hunter_arrow",
      speed: BASIC_PROJECTILE_SPEED,
      impactRadius: BASIC_PROJECTILE_IMPACT_RADIUS,
    });
    expect(getCompanionBasicProjectileProfile(elementalist)).toEqual({
      damageType: "magic",
      powerMultiplier: 1,
      visualProfileId: "elementalist_arcane_bolt",
      speed: BASIC_PROJECTILE_SPEED,
      impactRadius: BASIC_PROJECTILE_IMPACT_RADIUS,
    });
    expect(getCompanionBasicProjectileProfile(runecaster)).toEqual({
      damageType: "magic",
      powerMultiplier: 1,
      visualProfileId: "runecaster_rune_bolt",
      speed: BASIC_PROJECTILE_SPEED,
      impactRadius: BASIC_PROJECTILE_IMPACT_RADIUS,
    });
    expect(getCompanionBasicProjectileProfile(lightbearer)).toEqual({
      damageType: "magic",
      powerMultiplier: 1,
      visualProfileId: "lightbearer_holy_bolt",
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
