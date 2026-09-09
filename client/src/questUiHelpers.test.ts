import { describe, expect, it } from "vitest";
import {
  createInitialQuestStates,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
  type QuestState,
} from "./game";
import { createTestGameState } from "./game/testState";
import {
  getNpcQuestRouteHintGroupsByMap,
  getObjectiveLabel,
  getQuestDetailLocations,
  getQuestRuntimeProgressDisplay,
  getQuestTrackerRouteActionDisplay,
} from "./questUiHelpers";

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

  it("renders the dungeon chest objective label", () => {
    expect(
      getObjectiveLabel({
        id: "collect_slimeward_boss_chest",
        type: "collect_dungeon_chest",
      }),
    ).toBe("Collect Dungeon Chest");
  });

  it("shows Hold the Field Cache at Briarwood Rise Thicket", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.hold_the_field_cache);
    const updatedQuests = {
      ...quests,
      hold_the_field_cache: quest,
    };

    expect(getQuestDetailLocations(quest).map((location) => location.label)).toEqual([
      "Briarwood Rise / Thicket",
    ]);

    const groupsByMap = getNpcQuestRouteHintGroupsByMap(updatedQuests);
    const thicketGroup = groupsByMap[MAP_TWO_ID]?.find(
      (group) => group.location.label === "Briarwood Rise / Thicket",
    );

    expect(thicketGroup?.hints).toContainEqual(
      expect.objectContaining({
        questName: "Hold the Field Cache",
        status: "active",
        objectiveLines: ["Defend Area 0/1"],
      }),
    );
  });

  it("shows ready-to-turn-in quests at the quest giver hub without objectives", () => {
    const quests = createInitialQuestStates();
    const quest: QuestState = {
      ...quests.hold_the_field_cache,
      status: "ready_to_turn_in",
      objectiveProgress: {
        defend_old_grove_cache: {
          objectiveId: "defend_old_grove_cache",
          currentCount: 1,
          completed: true,
        },
      },
    };
    const updatedQuests = {
      ...quests,
      hold_the_field_cache: quest,
    };

    expect(getQuestDetailLocations(quest).map((location) => location.label)).toEqual([
      "Harbor Union Bastion",
    ]);

    const groupsByMap = getNpcQuestRouteHintGroupsByMap(updatedQuests);
    const hubGroup = groupsByMap[HUB_MAP_ID]?.find(
      (group) => group.location.label === "Harbor Union Bastion",
    );

    expect(hubGroup?.hints).toContainEqual(
      expect.objectContaining({
        questName: "Hold the Field Cache",
        status: "ready_to_turn_in",
        objectiveLines: [],
      }),
    );
  });

  it("maps Slimeward dungeon quest objectives to the parent route zone", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.azure_trial);
    const updatedQuests = {
      ...quests,
      azure_trial: quest,
    };

    expect(getQuestDetailLocations(quest).map((location) => location.label)).toEqual([
      "Azurefen Hollow / Imp Fen",
    ]);

    const groupsByMap = getNpcQuestRouteHintGroupsByMap(updatedQuests);
    const slimewardParentGroup = groupsByMap[MAP_THREE_ID]?.find(
      (group) => group.location.label === "Azurefen Hollow / Imp Fen",
    );

    expect(slimewardParentGroup?.hints).toContainEqual(
      expect.objectContaining({
        questName: "The Azure Trial",
        status: "active",
      }),
    );
  });

  it("routes unmapped active NPC quest objectives to Harbor Union Bastion", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.outfit_the_expedition);
    const updatedQuests = {
      ...quests,
      outfit_the_expedition: quest,
    };

    expect(getQuestDetailLocations(quest).map((location) => location.label)).toEqual([
      "Harbor Union Bastion",
    ]);

    const groupsByMap = getNpcQuestRouteHintGroupsByMap(updatedQuests);
    const hubGroup = groupsByMap[HUB_MAP_ID]?.find(
      (group) => group.location.label === "Harbor Union Bastion",
    );

    expect(hubGroup?.hints).toContainEqual(
      expect.objectContaining({
        questName: "Outfit the Expedition",
        status: "active",
      }),
    );
  });

  it("shows The Azure Trial turn-in at Forward Bastion", () => {
    const quests = createInitialQuestStates();
    const quest: QuestState = {
      ...quests.azure_trial,
      status: "ready_to_turn_in",
      objectiveProgress: {
        enter_slimeward_floor_one: {
          objectiveId: "enter_slimeward_floor_one",
          currentCount: 1,
          completed: true,
        },
        defeat_azure_mass: {
          objectiveId: "defeat_azure_mass",
          currentCount: 1,
          completed: true,
        },
        collect_slimeward_boss_chest: {
          objectiveId: "collect_slimeward_boss_chest",
          currentCount: 1,
          completed: true,
        },
      },
    };
    const updatedQuests = {
      ...quests,
      azure_trial: quest,
    };

    expect(getQuestDetailLocations(quest).map((location) => location.label)).toEqual([
      "Forward Bastion",
    ]);

    const groupsByMap = getNpcQuestRouteHintGroupsByMap(updatedQuests);
    const hubTwoGroup = groupsByMap[HUB_TWO_MAP_ID]?.find(
      (group) => group.location.label === "Forward Bastion",
    );

    expect(hubTwoGroup?.hints).toContainEqual(
      expect.objectContaining({
        questName: "The Azure Trial",
        status: "ready_to_turn_in",
        objectiveLines: [],
      }),
    );
  });

  it("shows Set Route for an active quest with a known objective zone", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.clear_the_shore);
    const state = createTestGameState({
      currentMapId: HUB_MAP_ID,
      quests: {
        ...quests,
        clear_the_shore: quest,
      },
      worldDiscovery: {
        visitedMapIds: [MAP_ONE_ID],
        visitedSubzonesByMapId: {},
      },
    });

    expect(getQuestTrackerRouteActionDisplay(state, quest)).toEqual({
      label: "Set Route",
      disabled: false,
      targetMapId: MAP_ONE_ID,
      title: "Set route to quest objective.",
    });
  });

  it("shows Deliver for a ready-to-turn-in quest", () => {
    const quests = createInitialQuestStates();
    const quest: QuestState = {
      ...quests.clear_the_shore,
      status: "ready_to_turn_in",
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      quests: {
        ...quests,
        clear_the_shore: quest,
      },
    });

    expect(getQuestTrackerRouteActionDisplay(state, quest)).toEqual({
      label: "Deliver",
      disabled: false,
      targetMapId: HUB_MAP_ID,
      title: "Set route to quest turn-in.",
    });
  });

  it("disables Set Route for active quests without a strict route target", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.outfit_the_expedition);
    const state = createTestGameState({
      currentMapId: HUB_MAP_ID,
      quests: {
        ...quests,
        outfit_the_expedition: quest,
      },
    });

    expect(getQuestTrackerRouteActionDisplay(state, quest)).toEqual({
      label: "Set Route",
      disabled: true,
      targetMapId: null,
      title: "No route target.",
    });
  });

  it("disables Set Route for unvisited objective zones", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.clear_the_shore);
    const state = createTestGameState({
      currentMapId: HUB_MAP_ID,
      quests: {
        ...quests,
        clear_the_shore: quest,
      },
      worldDiscovery: {
        visitedMapIds: [],
        visitedSubzonesByMapId: {},
      },
    });

    expect(getQuestTrackerRouteActionDisplay(state, quest)).toEqual({
      label: "Set Route",
      disabled: true,
      targetMapId: MAP_ONE_ID,
      title: "Zone not visited.",
    });
  });

  it("disables Set Route when the quest target is already in the current zone", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.clear_the_shore);
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      quests: {
        ...quests,
        clear_the_shore: quest,
      },
      worldDiscovery: {
        visitedMapIds: [MAP_ONE_ID],
        visitedSubzonesByMapId: {},
      },
    });

    expect(getQuestTrackerRouteActionDisplay(state, quest)).toEqual({
      label: "Set Route",
      disabled: true,
      targetMapId: MAP_ONE_ID,
      title: "Already in that zone.",
    });
  });

  it("disables Set Route when the route to a known objective zone is blocked", () => {
    const quests = createInitialQuestStates();
    const quest = activateQuest(quests.scout_rise_samples);
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      quests: {
        ...quests,
        scout_rise_samples: quest,
      },
      worldDiscovery: {
        visitedMapIds: [MAP_TWO_ID],
        visitedSubzonesByMapId: {},
      },
    });

    expect(getQuestTrackerRouteActionDisplay(state, quest)).toEqual({
      label: "Set Route",
      disabled: true,
      targetMapId: MAP_TWO_ID,
      title: "Route unavailable because the next path is blocked.",
    });
  });
});
