import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  applyOverchargeToSkillDefinition,
  getOverchargedSkillCooldownMs,
} from "./skillOvercharge";
import { SKILL_DEFINITIONS } from "./skills";
import { createTestGameState } from "./testState";

describe("skill overcharge", () => {
  it("boosts other skill strength and lengthens their cooldown", () => {
    const companion = createCompanion(
      "elementalist",
      { x: 0, y: 0 },
      "elementalist",
      "fighter",
      1,
      "elementalist",
    );
    const state = {
      ...createTestGameState({ partyLeaderId: companion.id }),
      skillOverchargesByCompanionId: {
        [companion.id]: {
          companionId: companion.id,
          skillPowerBonusPercent: 10,
          cooldownPenaltyPercent: 20,
          expiresAt: 60_000,
        },
      },
    };
    const boostedBolt = applyOverchargeToSkillDefinition(
      state,
      companion,
      SKILL_DEFINITIONS.elemental_bolt,
      1_000,
    );

    expect(boostedBolt.effect.type).toBe("damage");
    if (boostedBolt.effect.type === "damage") {
      expect(boostedBolt.effect.powerMultiplier).toBeCloseTo(1.375);
    }
    expect(
      getOverchargedSkillCooldownMs(
        state,
        companion,
        SKILL_DEFINITIONS.elemental_bolt,
        12_000,
        1_000,
      ),
    ).toBe(14_400);
  });

  it("does not boost or lengthen Overcharge itself", () => {
    const companion = createCompanion(
      "elementalist",
      { x: 0, y: 0 },
      "elementalist",
      "fighter",
      1,
      "elementalist",
    );
    const state = {
      ...createTestGameState({ partyLeaderId: companion.id }),
      skillOverchargesByCompanionId: {
        [companion.id]: {
          companionId: companion.id,
          skillPowerBonusPercent: 10,
          cooldownPenaltyPercent: 20,
          expiresAt: 60_000,
        },
      },
    };
    const overcharge = applyOverchargeToSkillDefinition(
      state,
      companion,
      SKILL_DEFINITIONS.overcharge,
      1_000,
    );

    expect(overcharge.effect).toEqual(SKILL_DEFINITIONS.overcharge.effect);
    expect(
      getOverchargedSkillCooldownMs(
        state,
        companion,
        SKILL_DEFINITIONS.overcharge,
        58_000,
        1_000,
      ),
    ).toBe(58_000);
  });
});
