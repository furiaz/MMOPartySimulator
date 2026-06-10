import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
  DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
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

  it("fills missing saved skill behavior fields with defaults", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "leader"),
      skillBehavior: {
        beginnerFirstAidSelfHealHpThresholdPercent: 45,
      } as Companion["skillBehavior"],
    };

    expect(getCompanionSkillBehavior(companion)).toEqual({
      beginnerFirstAidAllyHealHpThresholdPercent:
        DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      beginnerFirstAidSelfHealHpThresholdPercent: 45,
      supportFocus: DEFAULT_SUPPORT_FOCUS,
    });
  });
});
