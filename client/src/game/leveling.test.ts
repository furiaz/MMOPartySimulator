import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  getLevelGapXpModifier,
  getPartySizeLimit,
  grantCharacterXpToCompanion,
  MAX_CHARACTER_LEVEL,
} from "./leveling";
import { createTestGameState } from "./testState";

describe("character leveling", () => {
  it("rolls XP into level-ups and preserves overflow", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");

    const updatedCompanion = grantCharacterXpToCompanion(companion, 8);

    expect(updatedCompanion.characterLevel).toBe(2);
    expect(updatedCompanion.characterXp).toBe(2);
    expect(updatedCompanion.lastCharacterXpGained).toBe(8);
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
});
