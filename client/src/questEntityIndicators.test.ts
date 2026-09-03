import { describe, expect, it } from "vitest";
import {
  createDebugMap,
  createEnemy,
  createInitialQuestStates,
  createNpc,
  createResource,
  MAP_ONE_ID,
  MAP_TWO_ID,
  QUEST_GIVER_POI_ID,
  type GameEntity,
  type GameState,
  type GuildNoticeBoardQuest,
  type GuildNoticeBoardState,
  type QuestId,
} from "./game";
import { createTestGameState } from "./game/testState";
import { getQuestEntityIndicators } from "./questEntityIndicators";

describe("getQuestEntityIndicators", () => {
  it("marks living Cave Bats in Mossy Glade for Stolen Field Supplies only", () => {
    const matchingBat = createEnemy("matching-bat", { x: 64, y: 14 }, "passive", {
      enemyTypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });
    const wrongSubzoneBat = createEnemy(
      "wrong-subzone-bat",
      { x: 18, y: 13 },
      "passive",
      {
        enemyTypeId: "cave_bat",
        subzoneId: "shore-fringe",
      },
    );
    const deadBat = {
      ...createEnemy("dead-bat", { x: 76, y: 9 }, "passive", {
        enemyTypeId: "cave_bat",
        subzoneId: "mossy-glade",
      }),
      health: 0,
      state: "dead" as const,
    };
    const spider = createEnemy("spider", { x: 79, y: 16 }, "passive", {
      enemyTypeId: "forest_spider",
      subzoneId: "mossy-glade",
    });

    const indicators = getQuestEntityIndicators(
      createState({
        currentMapId: MAP_ONE_ID,
        entities: [matchingBat, wrongSubzoneBat, deadBat, spider],
        questStatuses: {
          stolen_field_supplies: "active",
        },
      }),
    );

    expect(getIndicatorEntityIds(indicators)).toEqual(["matching-bat"]);
  });

  it("removes indicators when the related objective is complete", () => {
    const bat = createEnemy("matching-bat", { x: 64, y: 14 }, "passive", {
      enemyTypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });

    const indicators = getQuestEntityIndicators(
      createState({
        currentMapId: MAP_ONE_ID,
        entities: [bat],
        objectiveCompletions: {
          stolen_field_supplies: ["collect_mossy_glade_supplies"],
        },
        questStatuses: {
          stolen_field_supplies: "active",
        },
      }),
    );

    expect(indicators).toEqual([]);
  });

  it("marks only active matching resources for gather objectives", () => {
    const activeWood = createResource("active-wood", { x: 9, y: 8 }, {
      resourceType: "wood",
    });
    const depletedWood = createResource("depleted-wood", { x: 10, y: 8 }, {
      quantity: 0,
      resourceType: "wood",
    });
    const activeHerb = createResource("active-herb", { x: 47, y: 25 }, {
      resourceType: "herb",
    });

    const indicators = getQuestEntityIndicators(
      createState({
        currentMapId: MAP_ONE_ID,
        entities: [activeWood, depletedWood, activeHerb],
        questStatuses: {
          clear_the_shore: "active",
        },
      }),
    );

    expect(getIndicatorEntityIds(indicators)).toEqual(["active-wood"]);
  });

  it("marks explicit guide and rescue NPC objectives when they are current", () => {
    const guideNpc = createNpc(
      "map-2-causeway-worker",
      { x: 8, y: 29 },
      "Causeway Worker",
      "quest_guide",
    );
    const rescueNpc = createNpc(
      "map-2-grove-runner",
      { x: 78, y: 25 },
      "Grove Runner",
      "quest_guide",
    );

    const guideIndicators = getQuestEntityIndicators(
      createState({
        currentMapId: MAP_TWO_ID,
        entities: [guideNpc],
        questStatuses: {
          open_wolf_causeway: "active",
        },
      }),
    );
    const rescueIndicators = getQuestEntityIndicators(
      createState({
        currentMapId: MAP_TWO_ID,
        entities: [rescueNpc],
        objectiveCompletions: {
          rescue_the_grove_runner: ["reach_grove_runner"],
        },
        questStatuses: {
          rescue_the_grove_runner: "active",
        },
      }),
    );

    expect(getIndicatorEntityIds(guideIndicators)).toEqual([
      "map-2-causeway-worker",
    ]);
    expect(getIndicatorEntityIds(rescueIndicators)).toEqual([
      "map-2-grove-runner",
    ]);
  });

  it("marks available and ready-to-turn-in quest giver NPCs", () => {
    const questGiver = createNpc(
      QUEST_GIVER_POI_ID,
      { x: 10, y: 10 },
      "Field Captain",
      "quest_giver",
    );

    const availableIndicators = getQuestEntityIndicators(
      createState({
        entities: [questGiver],
        questStatuses: {
          clear_the_shore: "available",
        },
      }),
    );
    const turnInIndicators = getQuestEntityIndicators(
      createState({
        entities: [questGiver],
        questStatuses: {
          clear_the_shore: "ready_to_turn_in",
        },
      }),
    );

    expect(availableIndicators).toMatchObject([
      {
        entityId: QUEST_GIVER_POI_ID,
        kind: "available_quest",
      },
    ]);
    expect(turnInIndicators).toMatchObject([
      {
        entityId: QUEST_GIVER_POI_ID,
        kind: "turn_in",
      },
    ]);
  });

  it("marks living enemies for taken incomplete Notice Board kill objectives", () => {
    const bat = createEnemy("notice-bat", { x: 64, y: 14 }, "passive", {
      enemyTypeId: "cave_bat",
    });
    const slime = createEnemy("notice-slime", { x: 18, y: 13 }, "passive", {
      enemyTypeId: "green_slime",
    });
    const deadBat = {
      ...createEnemy("notice-dead-bat", { x: 76, y: 9 }, "passive", {
        enemyTypeId: "cave_bat",
      }),
      health: 0,
      state: "dead" as const,
    };

    const indicators = getQuestEntityIndicators(
      createState({
        entities: [bat, slime, deadBat],
        guildNoticeBoard: {
          ...createEmptyNoticeBoardState(),
          slots: [
            createNoticeBoardQuest("taken-notice", "taken", {
              currentCount: 1,
              enemyTypeId: "cave_bat",
              id: "kill-cave-bats",
              requiredCount: 3,
            }),
            createNoticeBoardQuest("available-notice", "available", {
              currentCount: 0,
              enemyTypeId: "green_slime",
              id: "kill-slimes",
              requiredCount: 3,
            }),
          ],
        },
      }),
    );

    expect(getIndicatorEntityIds(indicators)).toEqual(["notice-bat"]);
  });

  it("dedupes indicators when multiple quests match one entity", () => {
    const bat = createEnemy("shared-bat", { x: 64, y: 14 }, "passive", {
      enemyTypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });

    const indicators = getQuestEntityIndicators(
      createState({
        currentMapId: MAP_ONE_ID,
        entities: [bat],
        guildNoticeBoard: {
          ...createEmptyNoticeBoardState(),
          slots: [
            createNoticeBoardQuest("taken-notice", "taken", {
              currentCount: 0,
              enemyTypeId: "cave_bat",
              id: "kill-cave-bats",
              requiredCount: 3,
            }),
          ],
        },
        questStatuses: {
          stolen_field_supplies: "active",
        },
      }),
    );

    expect(indicators).toHaveLength(1);
    expect(indicators[0]).toMatchObject({
      entityId: "shared-bat",
      source: "main_quest",
    });
  });
});

function createState({
  currentMapId = MAP_ONE_ID,
  entities = [],
  guildNoticeBoard = createEmptyNoticeBoardState(),
  objectiveCompletions = {},
  questStatuses = {},
}: {
  currentMapId?: GameState["currentMapId"];
  entities?: GameEntity[];
  guildNoticeBoard?: GuildNoticeBoardState;
  objectiveCompletions?: Partial<Record<QuestId, string[]>>;
  questStatuses?: Partial<Record<QuestId, GameState["quests"][QuestId]["status"]>>;
} = {}): GameState {
  const quests = createInitialQuestStates();

  for (const [questId, status] of Object.entries(questStatuses)) {
    quests[questId as QuestId] = {
      ...quests[questId as QuestId],
      status,
    };
  }

  for (const [questId, objectiveIds] of Object.entries(objectiveCompletions)) {
    const quest = quests[questId as QuestId];

    quests[questId as QuestId] = {
      ...quest,
      objectiveProgress: {
        ...quest.objectiveProgress,
        ...Object.fromEntries(
          objectiveIds.map((objectiveId) => [
            objectiveId,
            {
              objectiveId,
              currentCount: 1,
              completed: true,
            },
          ]),
        ),
      },
    };
  }

  return createTestGameState({
    currentMapId,
    entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
    guildNoticeBoard,
    map: currentMapId ? createDebugMap(currentMapId) : undefined,
    quests,
  });
}

function getIndicatorEntityIds(
  indicators: ReturnType<typeof getQuestEntityIndicators>,
): string[] {
  return indicators.map((indicator) => indicator.entityId).sort();
}

function createEmptyNoticeBoardState(): GuildNoticeBoardState {
  return {
    hasSeenCurrentRefresh: true,
    nextRefreshAtMs: 0,
    questSequence: 0,
    rerollDayStartMs: 0,
    rerollsUsedToday: 0,
    slots: [],
  };
}

function createNoticeBoardQuest(
  id: string,
  status: GuildNoticeBoardQuest["status"],
  objective: GuildNoticeBoardQuest["objectives"][number],
): GuildNoticeBoardQuest {
  return {
    generatedAtMs: 0,
    id,
    levelAnchor: null,
    levelRange: null,
    objectives: [objective],
    rewardClaimedAtMs: null,
    rewards: {
      crowns: 10,
      skillBookItemId: "first_aid_skill_book",
    },
    sequence: 0,
    status,
    takenAtMs: status === "taken" ? 0 : null,
    title: id,
  };
}
