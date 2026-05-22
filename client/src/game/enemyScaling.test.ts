import { describe, expect, it } from "vitest";
import { createEnemy } from "./entities";
import { getScaledEnemyStats } from "./enemyScaling";

describe("enemy scaling", () => {
  it("scales level 1 enemies to the starter baseline", () => {
    expect(getScaledEnemyStats(1)).toMatchObject({
      effectiveLevel: 1,
      scalingBand: "starter",
      maxHealth: 8,
      attack: 2,
      defense: 0,
      magicDefense: 0,
      evasion: 0,
      threat: 1,
    });
  });

  it("uses explicit early starter HP tuning through level 7", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7].map((level) => ({
        level,
        maxHealth: getScaledEnemyStats(level).maxHealth,
      })),
    ).toEqual([
      { level: 1, maxHealth: 8 },
      { level: 2, maxHealth: 14 },
      { level: 3, maxHealth: 23 },
      { level: 4, maxHealth: 30 },
      { level: 5, maxHealth: 37 },
      { level: 6, maxHealth: 41 },
      { level: 7, maxHealth: 45 },
    ]);
  });

  it("keeps level 8 and higher starter HP on the existing curve", () => {
    expect(getScaledEnemyStats(8).maxHealth).toBe(48);
    expect(getScaledEnemyStats(9).maxHealth).toBe(54);
    expect(getScaledEnemyStats(10).maxHealth).toBe(60);
  });

  it("scales level 10 enemies to the starter upper boundary", () => {
    expect(getScaledEnemyStats(10)).toMatchObject({
      effectiveLevel: 10,
      scalingBand: "starter",
      maxHealth: 60,
      attack: 8,
      defense: 6,
      magicDefense: 6,
      evasion: 3,
      threat: 10,
    });
  });

  it("scales level 11 enemies to the early lower boundary", () => {
    expect(getScaledEnemyStats(11)).toMatchObject({
      effectiveLevel: 11,
      scalingBand: "early",
      maxHealth: 70,
      attack: 10,
      defense: 7,
      magicDefense: 7,
      evasion: 3,
      threat: 11,
    });
  });

  it("scales level 20 enemies to the early upper boundary", () => {
    expect(getScaledEnemyStats(20)).toMatchObject({
      effectiveLevel: 20,
      scalingBand: "early",
      maxHealth: 160,
      attack: 20,
      defense: 16,
      magicDefense: 16,
      evasion: 7,
      threat: 20,
    });
  });

  it("clamps scaling outside the supported prototype level range", () => {
    expect(getScaledEnemyStats(0)).toMatchObject({
      level: 0,
      effectiveLevel: 1,
      scalingBand: "starter",
      maxHealth: 8,
    });
    expect(getScaledEnemyStats(99)).toMatchObject({
      level: 99,
      effectiveLevel: 20,
      scalingBand: "early",
      maxHealth: 160,
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
