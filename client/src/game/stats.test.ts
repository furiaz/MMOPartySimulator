import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  BASE_CLASS_AUTOMATIC_STAT_POINTS_PER_LEVEL,
  BASE_CLASS_STAT_GROWTHS,
  BEGINNER_STAT_GROWTH_PER_LEVEL,
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
      maxHealth: 13,
    });
  });

  it("lets wisdom contribute to defense, magic power, and healing power", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      naturalStats: createPrimaryStats(1, 1, 6, 6, 6),
    };

    expect(getCompanionDerivedStats(companion)).toMatchObject({
      defense: 5,
      magicPower: 9,
      healingPower: 8,
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
