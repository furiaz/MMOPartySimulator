import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
  createDefaultCompanionSkillBehavior,
  updateCompanionSkillBehavior,
} from "./skillBehavior";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";

describe("companion skill behavior", () => {
  it("defaults Beginner First Aid self-heal priority to 20 percent", () => {
    expect(createDefaultCompanionSkillBehavior()).toEqual({
      beginnerFirstAidSelfHealHpThresholdPercent:
        DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
    });
  });

  it("clamps Beginner First Aid self-heal threshold updates", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "leader");
    const state = addEntity(createTestGameState(), companion);

    const belowMinimum = updateCompanionSkillBehavior(state, companion.id, {
      beginnerFirstAidSelfHealHpThresholdPercent: -10,
    });
    const aboveMaximum = updateCompanionSkillBehavior(state, companion.id, {
      beginnerFirstAidSelfHealHpThresholdPercent: 150,
    });

    expect(
      belowMinimum.entities.companion.kind === "companion"
        ? belowMinimum.entities.companion.skillBehavior
            .beginnerFirstAidSelfHealHpThresholdPercent
        : null,
    ).toBe(1);
    expect(
      aboveMaximum.entities.companion.kind === "companion"
        ? aboveMaximum.entities.companion.skillBehavior
            .beginnerFirstAidSelfHealHpThresholdPercent
        : null,
    ).toBe(100);
  });
});
