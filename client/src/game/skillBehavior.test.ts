import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_BLOOD_FEAST_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_FAKE_DEATH_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_HOLD_FAST_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_MOBILITY_SKILL_USE_MODE,
  DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT,
  BLOOD_FEAST_USE_HP_THRESHOLD_MAX_PERCENT,
  FAKE_DEATH_USE_HP_THRESHOLD_MAX_PERCENT,
  HOLD_FAST_USE_HP_THRESHOLD_MAX_PERCENT,
  SECOND_WIND_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
  DEFAULT_SUPPORT_FOCUS,
  createDefaultCompanionSkillBehavior,
  getCompanionSkillBehavior,
  updateCompanionSkillBehavior,
} from "./skillBehavior";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import type { Companion } from "./types";

describe("companion skill behavior", () => {
  it("defaults Beginner First Aid self-heal priority to 20 percent", () => {
    expect(createDefaultCompanionSkillBehavior()).toEqual({
      beginnerFirstAidAllyHealHpThresholdPercent:
        DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      beginnerFirstAidSelfHealHpThresholdPercent:
        DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
      secondWindSelfHealHpThresholdPercent:
        DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT,
      holdFastUseHpThresholdPercent: DEFAULT_HOLD_FAST_USE_HP_THRESHOLD_PERCENT,
      fakeDeathUseHpThresholdPercent: DEFAULT_FAKE_DEATH_USE_HP_THRESHOLD_PERCENT,
      bloodFeastUseHpThresholdPercent:
        DEFAULT_BLOOD_FEAST_USE_HP_THRESHOLD_PERCENT,
      mobilitySkillUseMode: DEFAULT_MOBILITY_SKILL_USE_MODE,
      supportFocus: DEFAULT_SUPPORT_FOCUS,
    });
  });

  it("clamps Beginner First Aid threshold updates", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      beginnerFirstAidAllyHealHpThresholdPercent: -20,
      beginnerFirstAidSelfHealHpThresholdPercent: -10,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      beginnerFirstAidAllyHealHpThresholdPercent: 200,
      beginnerFirstAidSelfHealHpThresholdPercent: 150,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .beginnerFirstAidSelfHealHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .beginnerFirstAidAllyHealHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .beginnerFirstAidSelfHealHpThresholdPercent
        : null,
    ).toBe(100);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .beginnerFirstAidAllyHealHpThresholdPercent
        : null,
    ).toBe(100);
  });

  it("clamps Second Wind threshold updates to the hard cap", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      secondWindSelfHealHpThresholdPercent: -20,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      secondWindSelfHealHpThresholdPercent: 80,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .secondWindSelfHealHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .secondWindSelfHealHpThresholdPercent
        : null,
    ).toBe(SECOND_WIND_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT);
  });

  it("clamps Hold Fast use threshold updates", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      holdFastUseHpThresholdPercent: -20,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      holdFastUseHpThresholdPercent: 140,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .holdFastUseHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .holdFastUseHpThresholdPercent
        : null,
    ).toBe(HOLD_FAST_USE_HP_THRESHOLD_MAX_PERCENT);
  });

  it("clamps Fake Death use threshold updates to the hard cap", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      fakeDeathUseHpThresholdPercent: -20,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      fakeDeathUseHpThresholdPercent: 80,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .fakeDeathUseHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .fakeDeathUseHpThresholdPercent
        : null,
    ).toBe(FAKE_DEATH_USE_HP_THRESHOLD_MAX_PERCENT);
  });

  it("clamps Blood Feast use threshold updates to the hard cap", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      bloodFeastUseHpThresholdPercent: -20,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      bloodFeastUseHpThresholdPercent: 80,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .bloodFeastUseHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .bloodFeastUseHpThresholdPercent
        : null,
    ).toBe(BLOOD_FEAST_USE_HP_THRESHOLD_MAX_PERCENT);
  });

  it("normalizes invalid Support Focus updates", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const nextState = updateCompanionSkillBehavior(state, companion.id, {
      supportFocus: "missing" as Companion["skillBehavior"]["supportFocus"],
    });

    expect(
      nextState.entities.companion.kind === "companion"
        ? nextState.entities.companion.skillBehavior.supportFocus
        : null,
    ).toBe(DEFAULT_SUPPORT_FOCUS);
  });

  it("normalizes invalid mobility skill preference updates", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const nextState = updateCompanionSkillBehavior(state, companion.id, {
      mobilitySkillUseMode: "missing" as Companion["skillBehavior"]["mobilitySkillUseMode"],
    });

    expect(
      nextState.entities.companion.kind === "companion"
        ? nextState.entities.companion.skillBehavior.mobilitySkillUseMode
        : null,
    ).toBe(DEFAULT_MOBILITY_SKILL_USE_MODE);
  });

  it("fills missing saved skill behavior fields with defaults", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "leader"),
      skillBehavior: {
        beginnerFirstAidSelfHealHpThresholdPercent: 45,
      } as Partial<Companion["skillBehavior"]> as Companion["skillBehavior"],
    };

    expect(getCompanionSkillBehavior(companion)).toEqual({
      beginnerFirstAidAllyHealHpThresholdPercent:
        DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      beginnerFirstAidSelfHealHpThresholdPercent: 45,
      secondWindSelfHealHpThresholdPercent:
        DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT,
      holdFastUseHpThresholdPercent: DEFAULT_HOLD_FAST_USE_HP_THRESHOLD_PERCENT,
      fakeDeathUseHpThresholdPercent: DEFAULT_FAKE_DEATH_USE_HP_THRESHOLD_PERCENT,
      bloodFeastUseHpThresholdPercent:
        DEFAULT_BLOOD_FEAST_USE_HP_THRESHOLD_PERCENT,
      mobilitySkillUseMode: DEFAULT_MOBILITY_SKILL_USE_MODE,
      supportFocus: DEFAULT_SUPPORT_FOCUS,
    });
  });

  it("migrates legacy Hold Fast self-heal threshold saves to use threshold", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "leader"),
      skillBehavior: {
        holdFastSelfHealHpThresholdPercent: 65,
      } as Partial<Companion["skillBehavior"]> as Companion["skillBehavior"],
    };

    expect(getCompanionSkillBehavior(companion).holdFastUseHpThresholdPercent).toBe(
      65,
    );
  });
});
