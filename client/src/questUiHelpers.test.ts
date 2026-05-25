import { describe, expect, it } from "vitest";
import { createInitialQuestStates, type QuestState } from "./game";
import { getQuestRuntimeProgressDisplay } from "./questUiHelpers";

function activateQuest(quest: QuestState): QuestState {
  return {
    ...quest,
    status: "active",
  };
}

describe("quest UI helpers", () => {
  it("shows active defense repair progress", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest({
      ...quests.hold_the_field_cache,
      runtime: {
        defenseStartedObjectiveIds: {
          defend_old_grove_cache: true,
        },
        repairProgressMsByObjectiveId: {
          defend_old_grove_cache: 6000,
        },
      },
    });

    expect(getQuestRuntimeProgressDisplay(quest)).toEqual({
      objectiveId: "defend_old_grove_cache",
      label: "Defending Area",
      currentMs: 6000,
      requiredMs: 12000,
      percent: 50,
      statusText: "Defending Area 50%",
    });
  });

  it("does not show inactive repair progress before it starts", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.break_lower_shore_blockage);

    expect(getQuestRuntimeProgressDisplay(quest)).toBeNull();
  });
});
