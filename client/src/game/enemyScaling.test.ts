import { describe, expect, it } from "vitest";
import { createEnemy } from "./entities";
import { getScaledEnemyStats } from "./enemyScaling";

describe("enemy scaling", () => {
  it("uses anchored enemy combat stats through the level 100 tuning target", () => {
    expect(
      [1, 5, 10, 15, 20, 30, 50, 75, 100].map((level) =>
        getScaledEnemyStats(level),
      ),
    ).toEqual([
      {
        level: 1,
        effectiveLevel: 1,
        scalingBand: "starter",
        maxHealth: 12,
        attack: 2,
        defense: 0,
        magicDefense: 0,
        evasion: 0,
        threat: 1,
      },
      {
        level: 5,
        effectiveLevel: 5,
        scalingBand: "starter",
        maxHealth: 45,
        attack: 5,
        defense: 2,
        magicDefense: 2,
        evasion: 1,
        threat: 5,
      },
      {
        level: 10,
        effectiveLevel: 10,
        scalingBand: "starter",
        maxHealth: 95,
        attack: 9,
        defense: 5,
        magicDefense: 5,
        evasion: 3,
        threat: 10,
      },
      {
        level: 15,
        effectiveLevel: 15,
        scalingBand: "early",
        maxHealth: 160,
        attack: 15,
        defense: 8,
        magicDefense: 8,
        evasion: 5,
        threat: 15,
      },
      {
        level: 20,
        effectiveLevel: 20,
        scalingBand: "early",
        maxHealth: 240,
        attack: 20,
        defense: 12,
        magicDefense: 12,
        evasion: 7,
        threat: 20,
      },
      {
        level: 30,
        effectiveLevel: 30,
        scalingBand: "early",
        maxHealth: 420,
        attack: 32,
        defense: 22,
        magicDefense: 22,
        evasion: 10,
        threat: 30,
      },
      {
        level: 50,
        effectiveLevel: 50,
        scalingBand: "early",
        maxHealth: 850,
        attack: 55,
        defense: 40,
        magicDefense: 40,
        evasion: 15,
        threat: 50,
      },
      {
        level: 75,
        effectiveLevel: 75,
        scalingBand: "early",
        maxHealth: 1450,
        attack: 82,
        defense: 65,
        magicDefense: 65,
        evasion: 22,
        threat: 75,
      },
      {
        level: 100,
        effectiveLevel: 100,
        scalingBand: "early",
        maxHealth: 2200,
        attack: 110,
        defense: 90,
        magicDefense: 90,
        evasion: 30,
        threat: 100,
      },
    ]);
  });

  it("interpolates between enemy scaling anchors", () => {
    expect(getScaledEnemyStats(12)).toMatchObject({
      maxHealth: 121,
      attack: 11,
      defense: 6,
      magicDefense: 6,
      evasion: 4,
    });
  });

  it("clamps scaling outside the supported prototype level range", () => {
    expect(getScaledEnemyStats(0)).toMatchObject({
      level: 0,
      effectiveLevel: 1,
      scalingBand: "starter",
      maxHealth: 12,
    });
    expect(getScaledEnemyStats(999)).toMatchObject({
      level: 999,
      effectiveLevel: 100,
      scalingBand: "early",
      maxHealth: 2200,
    });
  });

  it("lets explicit spawn stats override scaled defaults", () => {
    const enemy = createEnemy("custom", { x: 0, y: 0 }, "aggressive", {
      level: 5,
      maxHealth: 99,
      attack: 12,
      defense: 11,
      magicDefense: 10,
      evasion: 9,
    });

    expect(enemy).toMatchObject({
      level: 5,
      effectiveScalingLevel: 5,
      scalingBand: "starter",
      health: 99,
      maxHealth: 99,
      attack: 12,
      defense: 11,
      magicDefense: 10,
      evasion: 9,
      threat: 5,
      scalingOverrides: [
        "maxHealth",
        "attack",
        "defense",
        "magicDefense",
        "evasion",
      ],
    });
  });
});
