import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  applySkillPowerBonusesToSkillDefinition,
  getOverchargeRankValues,
  getOverchargedSkillCooldownMs,
} from "./skillOvercharge";
import { SKILL_DEFINITIONS } from "./skills";
import { createTestGameState } from "./testState";

describe("skill overcharge", () => {
  it("preserves Overcharge duration, base cooldown, and refresh window", () => {
    expect(SKILL_DEFINITIONS.overcharge.cooldownMs).toBe(118_000);
    expect(SKILL_DEFINITIONS.overcharge.effect).toMatchObject({
      type: "overcharge",
      durationMs: 120_000,
      refreshWindowMs: 2_000,
    });
  });

  it.each([
    { rank: 1, power: 10, penalty: 20 },
    { rank: 5, power: 20, penalty: 28 },
    { rank: 6, power: 21.25, penalty: 29 },
    { rank: 10, power: 26.25, penalty: 33 },
    { rank: 15, power: 32.5, penalty: 38 },
  ])(
    "calculates the bespoke rank $rank values",
    ({ rank, power, penalty }) => {
      expect(getOverchargeRankValues(rank)).toEqual({
        skillPowerBonusPercent: power,
        cooldownPenaltyPercent: penalty,
      });
    },
  );

  it("ignores negative cooldown reductions and clamps large reductions to zero", () => {
    expect(getOverchargeRankValues(5, -10).cooldownPenaltyPercent).toBe(28);
    expect(getOverchargeRankValues(5, 100).cooldownPenaltyPercent).toBe(0);
  });

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
    const boostedBolt = applySkillPowerBonusesToSkillDefinition(
      state,
      companion,
      SKILL_DEFINITIONS.elemental_bolt,
      { now: 1_000 },
    );

    expect(boostedBolt.effect.type).toBe("damage");
    if (boostedBolt.effect.type === "damage") {
      expect(boostedBolt.effect.powerMultiplier).toBeCloseTo(1.65);
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

  it("combines Overcharge and a future skill-power bonus additively", () => {
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
    const boostedBolt = applySkillPowerBonusesToSkillDefinition(
      state,
      companion,
      SKILL_DEFINITIONS.elemental_bolt,
      { now: 1_000, additionalBonusPercent: 20 },
    );

    expect(boostedBolt.effect.type).toBe("damage");
    if (boostedBolt.effect.type === "damage") {
      expect(boostedBolt.effect.powerMultiplier).toBeCloseTo(1.95);
      expect(boostedBolt.effect.powerMultiplier).not.toBeCloseTo(1.98);
    }
  });

  it("applies a future skill-power bonus without active Overcharge", () => {
    const companion = createCompanion(
      "elementalist",
      { x: 0, y: 0 },
      "elementalist",
      "fighter",
      1,
      "elementalist",
    );
    const boostedBolt = applySkillPowerBonusesToSkillDefinition(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
      SKILL_DEFINITIONS.elemental_bolt,
      { now: 1_000, additionalBonusPercent: 20 },
    );

    expect(boostedBolt.effect.type).toBe("damage");
    if (boostedBolt.effect.type === "damage") {
      expect(boostedBolt.effect.powerMultiplier).toBeCloseTo(1.8);
    }
  });

  it("stops applying Overcharge after the snapshot expires", () => {
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
          expiresAt: 1_000,
        },
      },
    };

    expect(
      applySkillPowerBonusesToSkillDefinition(
        state,
        companion,
        SKILL_DEFINITIONS.elemental_bolt,
        { now: 1_000 },
      ),
    ).toBe(SKILL_DEFINITIONS.elemental_bolt);
    expect(
      getOverchargedSkillCooldownMs(
        state,
        companion,
        SKILL_DEFINITIONS.elemental_bolt,
        12_000,
        1_000,
      ),
    ).toBe(12_000);
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
    const overcharge = applySkillPowerBonusesToSkillDefinition(
      state,
      companion,
      SKILL_DEFINITIONS.overcharge,
      { now: 1_000, additionalBonusPercent: 20 },
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
