import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_BLOOD_FEAST_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_FAKE_DEATH_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_FIRE_BURST_TARGET_MODE,
  DEFAULT_HOLD_FAST_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_MOBILITY_SKILL_USE_MODE,
  DEFAULT_OVERCHARGE_ENABLED,
  DEFAULT_SELF_SACRIFICE_SAFETY_FLOOR_PERCENT,
  DEFAULT_PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_ETERNAL_HOPE_USE_HP_THRESHOLD_PERCENT,
  DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_PERCENT,
  DEFAULT_CIRCLE_OF_RENEWAL_TARGET_MODE,
  LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT,
  CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_MAX_PERCENT,
  BLOOD_FEAST_USE_HP_THRESHOLD_MAX_PERCENT,
  DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_MAX_PERCENT,
  ETERNAL_HOPE_USE_HP_THRESHOLD_MAX_PERCENT,
  FAKE_DEATH_USE_HP_THRESHOLD_MAX_PERCENT,
  HOLD_FAST_USE_HP_THRESHOLD_MAX_PERCENT,
  PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT,
  PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
  SECOND_WIND_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
  SELF_SACRIFICE_SAFETY_FLOOR_MAX_PERCENT,
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
      defensiveMobilityUseHpThresholdPercent:
        DEFAULT_DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_PERCENT,
      supportFocus: DEFAULT_SUPPORT_FOCUS,
      overchargeEnabled: DEFAULT_OVERCHARGE_ENABLED,
      fireBurstTargetMode: DEFAULT_FIRE_BURST_TARGET_MODE,
      lightMendAllyHealHpThresholdPercent:
        DEFAULT_LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      selfSacrificeSafetyFloorPercent:
        DEFAULT_SELF_SACRIFICE_SAFETY_FLOOR_PERCENT,
      penitentsGiftAllyHealHpThresholdPercent:
        DEFAULT_PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      penitentsGiftSelfHealHpThresholdPercent:
        DEFAULT_PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_PERCENT,
      eternalHopeUseHpThresholdPercent: DEFAULT_ETERNAL_HOPE_USE_HP_THRESHOLD_PERCENT,
      circleOfRenewalTargetMode: DEFAULT_CIRCLE_OF_RENEWAL_TARGET_MODE,
      circleOfRenewalMainTargetHpThresholdPercent:
        DEFAULT_CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_PERCENT,
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

  it("clamps defensive mobility threshold updates to the hard cap", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      defensiveMobilityUseHpThresholdPercent: -20,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      defensiveMobilityUseHpThresholdPercent: 80,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .defensiveMobilityUseHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .defensiveMobilityUseHpThresholdPercent
        : null,
    ).toBe(DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_MAX_PERCENT);
  });

  it("normalizes invalid FireBurst target mode updates", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const nextState = updateCompanionSkillBehavior(state, companion.id, {
      fireBurstTargetMode: "missing" as Companion["skillBehavior"]["fireBurstTargetMode"],
    });

    expect(
      nextState.entities.companion.kind === "companion"
        ? nextState.entities.companion.skillBehavior.fireBurstTargetMode
        : null,
    ).toBe(DEFAULT_FIRE_BURST_TARGET_MODE);
  });

  it("clamps Lightbearer healing thresholds and target mode updates", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      lightMendAllyHealHpThresholdPercent: -1,
      circleOfRenewalMainTargetHpThresholdPercent: 0,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      lightMendAllyHealHpThresholdPercent: 100,
      circleOfRenewalMainTargetHpThresholdPercent: 100,
      circleOfRenewalTargetMode:
        "missing" as Companion["skillBehavior"]["circleOfRenewalTargetMode"],
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .lightMendAllyHealHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .circleOfRenewalMainTargetHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .lightMendAllyHealHpThresholdPercent
        : null,
    ).toBe(LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .circleOfRenewalMainTargetHpThresholdPercent
        : null,
    ).toBe(CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_MAX_PERCENT);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior.circleOfRenewalTargetMode
        : null,
    ).toBe(DEFAULT_CIRCLE_OF_RENEWAL_TARGET_MODE);
  });

  it("clamps Penitent self-sacrifice and sustain thresholds", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      selfSacrificeSafetyFloorPercent: -1,
      penitentsGiftAllyHealHpThresholdPercent: 0,
      penitentsGiftSelfHealHpThresholdPercent: -20,
      eternalHopeUseHpThresholdPercent: 0,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      selfSacrificeSafetyFloorPercent: 100,
      penitentsGiftAllyHealHpThresholdPercent: 100,
      penitentsGiftSelfHealHpThresholdPercent: 100,
      eternalHopeUseHpThresholdPercent: 100,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .selfSacrificeSafetyFloorPercent
        : null,
    ).toBe(1);
    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .penitentsGiftAllyHealHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .penitentsGiftSelfHealHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .eternalHopeUseHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .selfSacrificeSafetyFloorPercent
        : null,
    ).toBe(SELF_SACRIFICE_SAFETY_FLOOR_MAX_PERCENT);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .penitentsGiftAllyHealHpThresholdPercent
        : null,
    ).toBe(PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .penitentsGiftSelfHealHpThresholdPercent
        : null,
    ).toBe(PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .eternalHopeUseHpThresholdPercent
        : null,
    ).toBe(ETERNAL_HOPE_USE_HP_THRESHOLD_MAX_PERCENT);
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
      defensiveMobilityUseHpThresholdPercent:
        DEFAULT_DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_PERCENT,
      supportFocus: DEFAULT_SUPPORT_FOCUS,
      overchargeEnabled: DEFAULT_OVERCHARGE_ENABLED,
      fireBurstTargetMode: DEFAULT_FIRE_BURST_TARGET_MODE,
      lightMendAllyHealHpThresholdPercent:
        DEFAULT_LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      selfSacrificeSafetyFloorPercent:
        DEFAULT_SELF_SACRIFICE_SAFETY_FLOOR_PERCENT,
      penitentsGiftAllyHealHpThresholdPercent:
        DEFAULT_PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      penitentsGiftSelfHealHpThresholdPercent:
        DEFAULT_PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_PERCENT,
      eternalHopeUseHpThresholdPercent: DEFAULT_ETERNAL_HOPE_USE_HP_THRESHOLD_PERCENT,
      circleOfRenewalTargetMode: DEFAULT_CIRCLE_OF_RENEWAL_TARGET_MODE,
      circleOfRenewalMainTargetHpThresholdPercent:
        DEFAULT_CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_PERCENT,
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
