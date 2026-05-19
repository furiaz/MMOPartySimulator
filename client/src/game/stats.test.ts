import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  BASE_CLASS_AUTOMATIC_STAT_POINTS_PER_LEVEL,
  BASE_CLASS_STAT_GROWTHS,
  BEGINNER_STAT_GROWTH_PER_LEVEL,
  MAX_ALLOCATED_PRIMARY_STAT_POINTS_PER_STAT,
  allocateCompanionStatPoint,
  applyCompanionLevelUpStatGrowth,
  createCompanionPrimaryStats,
  getCompanionActualStats,
  getCompanionDerivedStats,
  PLAYER_STAT_POINTS_PER_LEVEL_AFTER_CLASS_UNLOCK,
  PRIMARY_STAT_IDS,
} from "./stats";
import type { CompanionPrimaryStats } from "./types";

describe("prototype companion stats", () => {
  it("initializes level 1 companions with safe stat defaults", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");

    expect(companion.naturalStats).toEqual(createCompanionPrimaryStats(1));
    expect(companion.allocatedStats).toEqual(createCompanionPrimaryStats(0));
    expect(companion.unspentStatPoints).toBe(0);
  });

  it("combines natural and allocated primary stats", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      naturalStats: createPrimaryStats(2, 3, 4, 5, 6),
      allocatedStats: createPrimaryStats(1, 0, 2, 0, 3),
    };

    expect(getCompanionActualStats(companion)).toEqual(
      createPrimaryStats(3, 3, 6, 5, 9),
    );
  });

  it("clamps actual primary stats to a minimum of 1", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");

    expect(
      getCompanionActualStats(companion, {
        strength: -10,
        dexterity: -10,
        constitution: -10,
        intelligence: -10,
        wisdom: -10,
      }),
    ).toEqual(createCompanionPrimaryStats(1));
  });

  it("calculates derived stats from primary stats and equipped item modifiers", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      equipment: {
        ...createCompanion("equipment-source", { x: 0, y: 0 }, "equipment-source")
          .equipment,
        mainHand: "training_sword" as const,
        accessory1: "plain_charm" as const,
      },
    };

    expect(getCompanionDerivedStats(companion)).toMatchObject({
      attack: 3,
      maxHealth: 15,
      accuracy: 1,
      criticalChance: 0.05,
      criticalDamage: 1.2,
      healthRegen: 1,
    });
  });

  it("adds equipped primary stat modifiers to actual companion stats", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      equipment: {
        ...createCompanion("equipment-source", { x: 0, y: 0 }, "equipment-source")
          .equipment,
        head: "acolyte_hood" as const,
      },
    };

    expect(getCompanionActualStats(companion).wisdom).toBe(2);
  });

  it("flows equipped primary stat modifiers and penalties into derived stats", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      characterLevel: 10,
      equipment: {
        ...createCompanion("equipment-source", { x: 0, y: 0 }, "equipment-source")
          .equipment,
        chest: "bulwark_cuirass" as const,
        legs: "bulwark_greaves" as const,
      },
    };

    expect(getCompanionDerivedStats(companion)).toMatchObject({
      defense: 8,
      maxHealth: 37,
      evasion: -4,
      block: 1,
    });
  });

  it("lets wisdom contribute to defense, magic power, and healing power", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      naturalStats: createPrimaryStats(1, 1, 6, 6, 6),
    };

    expect(getCompanionDerivedStats(companion)).toMatchObject({
      defense: 5,
      magicDefense: 5,
      accuracy: 3,
      magicPower: 9,
      healingPower: 8,
      block: 3,
    });
  });

  it("defines 5-point base class growth profiles", () => {
    expect(BEGINNER_STAT_GROWTH_PER_LEVEL).toEqual(createCompanionPrimaryStats(1));
    expect(PLAYER_STAT_POINTS_PER_LEVEL_AFTER_CLASS_UNLOCK).toBe(2);
    expect(BASE_CLASS_STAT_GROWTHS).toEqual({
      blade: createPrimaryStats(2, 2, 1, 0, 0),
      aegis: createPrimaryStats(1, 0, 3, 0, 1),
      hunter: createPrimaryStats(1, 3, 0, 0, 1),
      beast: createPrimaryStats(2, 1, 2, 0, 0),
      elementalist: createPrimaryStats(0, 0, 1, 4, 0),
      runecaster: createPrimaryStats(0, 0, 1, 2, 2),
      lightbearer: createPrimaryStats(0, 0, 1, 1, 3),
      penitent: createPrimaryStats(1, 0, 2, 0, 2),
    });

    for (const growthProfile of Object.values(BASE_CLASS_STAT_GROWTHS)) {
      const totalGrowth = PRIMARY_STAT_IDS.reduce(
        (total, statId) => total + growthProfile[statId],
        0,
      );

      expect(totalGrowth).toBe(BASE_CLASS_AUTOMATIC_STAT_POINTS_PER_LEVEL);
    }
  });

  it("applies automatic level-up growth for Beginners without unspent points", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");

    const updatedCompanion = applyCompanionLevelUpStatGrowth(companion, 2);

    expect(updatedCompanion.naturalStats).toEqual(createCompanionPrimaryStats(3));
    expect(updatedCompanion.unspentStatPoints).toBe(0);
    expect(updatedCompanion.maxHealth).toBe(
      getCompanionDerivedStats(updatedCompanion).maxHealth,
    );
  });

  it("applies base-class growth and grants allocation points", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      classId: "blade" as const,
      characterLevel: 10,
    };

    const updatedCompanion = applyCompanionLevelUpStatGrowth(companion, 2);

    expect(updatedCompanion.naturalStats).toEqual(createPrimaryStats(5, 5, 3, 1, 1));
    expect(updatedCompanion.unspentStatPoints).toBe(4);
  });

  it("allocates stat points through game logic and syncs derived health", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      unspentStatPoints: 1,
    };

    const result = allocateCompanionStatPoint(companion, "constitution");

    expect(result.status).toBe("success");
    expect(result.companion.allocatedStats.constitution).toBe(1);
    expect(result.companion.unspentStatPoints).toBe(0);
    expect(result.companion.maxHealth).toBe(
      getCompanionDerivedStats(result.companion).maxHealth,
    );
  });

  it("fails allocation safely without points or above the prototype cap", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");
    const cappedCompanion = {
      ...companion,
      unspentStatPoints: 1,
      allocatedStats: {
        ...companion.allocatedStats,
        strength: MAX_ALLOCATED_PRIMARY_STAT_POINTS_PER_STAT,
      },
    };

    expect(allocateCompanionStatPoint(companion, "strength").status).toBe(
      "failed_no_points",
    );
    expect(allocateCompanionStatPoint(cappedCompanion, "strength").status).toBe(
      "failed_stat_cap",
    );
  });
});

function createPrimaryStats(
  strength: number,
  dexterity: number,
  constitution: number,
  intelligence: number,
  wisdom: number,
): CompanionPrimaryStats {
  return {
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
  };
}
