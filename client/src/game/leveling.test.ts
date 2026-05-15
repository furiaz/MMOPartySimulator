import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  getCharacterXpToNextLevel,
  getLevelGapXpModifier,
  getPartySizeLimit,
  getPartySizeUnlockRequirement,
  grantCharacterXpToCompanion,
  grantCharacterXpToParty,
  MAX_CHARACTER_LEVEL,
} from "./leveling";
import { createCompanionPrimaryStats } from "./stats";
import { createTestGameState } from "./testState";

describe("character leveling", () => {
  it("rolls XP into level-ups and preserves overflow", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");

    const updatedCompanion = grantCharacterXpToCompanion(companion, 8);

    expect(updatedCompanion.characterLevel).toBe(2);
    expect(updatedCompanion.characterXp).toBe(2);
    expect(updatedCompanion.lastCharacterXpGained).toBe(8);
    expect(updatedCompanion.naturalStats).toEqual(createCompanionPrimaryStats(2));
  });

  it("applies base-class stat growth and allocation points when XP grants levels", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      classId: "aegis" as const,
      characterLevel: 10,
      characterXp: 0,
    };
    const xpToNextLevel = getCharacterXpToNextLevel(companion.characterLevel) ?? 0;

    const updatedCompanion = grantCharacterXpToCompanion(companion, xpToNextLevel);

    expect(updatedCompanion.characterLevel).toBe(11);
    expect(updatedCompanion.naturalStats).toEqual({
      strength: 2,
      dexterity: 1,
      constitution: 4,
      intelligence: 1,
      wisdom: 2,
    });
    expect(updatedCompanion.unspentStatPoints).toBe(2);
  });

  it("keeps max-level companions at max with zero current XP", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      characterLevel: MAX_CHARACTER_LEVEL,
      characterXp: 100,
    };

    const updatedCompanion = grantCharacterXpToCompanion(companion, 50);

    expect(updatedCompanion.characterLevel).toBe(MAX_CHARACTER_LEVEL);
    expect(updatedCompanion.characterXp).toBe(100);
    expect(updatedCompanion.lastCharacterXpGained).toBe(0);
  });

  it("uses documented level-gap XP modifier bands", () => {
    expect(getLevelGapXpModifier(11, 1)).toBe(1);
    expect(getLevelGapXpModifier(12, 1)).toBe(0.5);
    expect(getLevelGapXpModifier(22, 1)).toBe(0.25);
    expect(getLevelGapXpModifier(32, 1)).toBe(0);
  });

  it("derives party size limit from total party level", () => {
    const leader = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");
    const ally = {
      ...createCompanion("companion-2", { x: 1, y: 0 }, "companion-1"),
      characterLevel: 9,
    };

    expect(
      getPartySizeLimit(
        createTestGameState({
          entities: {
            [leader.id]: leader,
          },
        }),
      ),
    ).toBe(2);
    expect(
      getPartySizeLimit(
        createTestGameState({
          entities: {
            [leader.id]: leader,
            [ally.id]: ally,
          },
        }),
      ),
    ).toBe(3);
  });

  it("returns party size unlock requirements by slot", () => {
    expect(getPartySizeUnlockRequirement(1)).toBeNull();
    expect(getPartySizeUnlockRequirement(2)).toBeNull();
    expect(getPartySizeUnlockRequirement(3)).toBe(10);
    expect(getPartySizeUnlockRequirement(4)).toBe(30);
    expect(getPartySizeUnlockRequirement(5)).toBe(60);
    expect(getPartySizeUnlockRequirement(6)).toBeNull();
  });

  it("applies the debug super XP multiplier to enemy XP grants", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");
    const enemy = createEnemy("enemy-1", { x: 1, y: 0 }, "aggressive", {
      level: 1,
      xpReward: 2,
    });

    const nextState = grantCharacterXpToParty(
      createTestGameState({
        entities: {
          [companion.id]: companion,
          [enemy.id]: enemy,
        },
        debugOptions: {
          superSpeedEnabled: false,
          superExpEnabled: true,
        },
      }),
      enemy,
    );

    expect(nextState.entities[companion.id]).toMatchObject({
      characterLevel: 2,
      characterXp: 4,
      lastCharacterXpGained: 10,
    });
  });
});
