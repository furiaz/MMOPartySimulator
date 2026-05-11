import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { HUB_MAP_ID, MAP_ONE_ID, MAP_TWO_ID, npcIds } from "./debugMap";
import type { GameState } from "./state";
import type { DebugMapId, Enemy, ResourceType } from "./types";
import type {
  QuestDefinition,
  QuestId,
  QuestObjectiveDefinition,
  QuestState,
} from "./questTypes";

export const QUEST_GIVER_POI_ID = npcIds[0];

export const QUEST_ORDER: QuestId[] = [
  "clear_the_shore",
  "gather_expedition_supplies",
  "scout_the_northern_road",
  "threat_beyond_the_pass",
];

export const QUEST_DEFINITIONS: Record<QuestId, QuestDefinition> = {
  clear_the_shore: {
    id: "clear_the_shore",
    displayName: "Clear the Shore",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "clear_map_1_enemies",
        type: "defeat_enemy_count",
        enemyMapId: MAP_ONE_ID,
        requiredCount: 5,
      },
    ],
    unlocksQuestIds: [
      "gather_expedition_supplies",
      "scout_the_northern_road",
    ],
  },
  gather_expedition_supplies: {
    id: "gather_expedition_supplies",
    displayName: "Gather Expedition Supplies",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "gather_wood",
        type: "gather_item_count",
        targetMapId: MAP_ONE_ID,
        resourceType: "wood",
        requiredCount: 1,
      },
      {
        id: "gather_ore",
        type: "gather_item_count",
        targetMapId: MAP_ONE_ID,
        resourceType: "ore",
        requiredCount: 1,
      },
      {
        id: "gather_herb",
        type: "gather_item_count",
        targetMapId: MAP_ONE_ID,
        resourceType: "herb",
        requiredCount: 1,
      },
    ],
  },
  scout_the_northern_road: {
    id: "scout_the_northern_road",
    displayName: "Scout the Northern Road",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "reach_map_2",
        type: "reach_poi",
        targetMapId: MAP_TWO_ID,
        requiredCount: 1,
      },
    ],
  },
  threat_beyond_the_pass: {
    id: "threat_beyond_the_pass",
    displayName: "Threat Beyond the Pass",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    requiresCompletedQuestIds: [
      "gather_expedition_supplies",
      "scout_the_northern_road",
    ],
    objectives: [
      {
        id: "clear_map_2_enemies",
        type: "defeat_enemy_count",
        enemyMapId: MAP_TWO_ID,
        requiredCount: 5,
      },
    ],
  },
};

export function createInitialQuestStates(): Record<QuestId, QuestState> {
  return Object.fromEntries(
    QUEST_ORDER.map((questId) => {
      const definition = QUEST_DEFINITIONS[questId];

      return [
        questId,
        {
          questId,
          status: questId === "clear_the_shore" ? "available" : "locked",
          objectiveProgress: Object.fromEntries(
            definition.objectives.map((objective) => [
              objective.id,
              {
                objectiveId: objective.id,
                currentCount: 0,
                completed: false,
              },
            ]),
          ),
        },
      ];
    }),
  ) as Record<QuestId, QuestState>;
}

export function getCurrentQuest(state: GameState): QuestState | null {
  return getQuestByStatuses(state, ["ready_to_turn_in", "active", "available"]);
}

export function getActiveQuest(state: GameState): QuestState | null {
  return getQuestByStatuses(state, ["ready_to_turn_in", "active"]);
}

export function getAvailableQuest(state: GameState): QuestState | null {
  return getQuestByStatuses(state, ["available"]);
}

export function getQuestDefinition(questId: QuestId): QuestDefinition {
  return QUEST_DEFINITIONS[questId];
}

export function getFirstIncompleteObjective(
  state: GameState,
  questId: QuestId,
): QuestObjectiveDefinition | null {
  const quest = state.quests[questId];
  const definition = QUEST_DEFINITIONS[questId];

  return (
    definition.objectives.find(
      (objective) => !quest.objectiveProgress[objective.id]?.completed,
    ) ?? null
  );
}

export function hasQuestGiverWork(state: GameState): boolean {
  return Boolean(
    QUEST_ORDER.some((questId) => {
      const status = state.quests[questId]?.status;
      return status === "available" || status === "ready_to_turn_in";
    }),
  );
}

export function updateQuestGiverInteraction(state: GameState): GameState {
  const readyQuest = getQuestByStatuses(state, ["ready_to_turn_in"]);

  if (readyQuest) {
    return turnInQuest(state, readyQuest.questId);
  }

  const availableQuest = getAvailableQuest(state);

  return availableQuest ? acceptQuest(state, availableQuest.questId) : state;
}

export function recordEnemyDefeatedForQuests(
  state: GameState,
  defeatedEnemy: Enemy,
  mapId?: DebugMapId,
): GameState {
  if (!mapId || defeatedEnemy.state !== "dead") {
    return state;
  }

  return updateMatchingQuestObjectives(
    state,
    (objective) =>
      objective.type === "defeat_enemy_count" &&
      objective.enemyMapId === mapId,
    1,
  );
}

export function recordResourceGatheredForQuests(
  state: GameState,
  resourceType: ResourceType,
  mapId: DebugMapId | undefined,
  quantity: number,
): GameState {
  if (!mapId || quantity <= 0) {
    return state;
  }

  return updateMatchingQuestObjectives(
    state,
    (objective) =>
      objective.type === "gather_item_count" &&
      objective.targetMapId === mapId &&
      objective.resourceType === resourceType,
    quantity,
  );
}

export function recordMapReachedForQuests(
  state: GameState,
  mapId: DebugMapId,
): GameState {
  return updateMatchingQuestObjectives(
    state,
    (objective) =>
      objective.type === "reach_poi" &&
      objective.targetMapId === mapId,
    1,
  );
}

function acceptQuest(state: GameState, questId: QuestId): GameState {
  const quest = state.quests[questId];

  if (quest?.status !== "available") {
    return state;
  }

  return appendDebugTelemetryEvent(
    {
      ...state,
      quests: {
        ...state.quests,
        [questId]: {
          ...quest,
          status: "active",
        },
      },
    },
    {
      type: "quest_accepted",
      entityId: QUEST_GIVER_POI_ID,
      questId,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
    },
  );
}

function turnInQuest(state: GameState, questId: QuestId): GameState {
  const quest = state.quests[questId];

  if (quest?.status !== "ready_to_turn_in") {
    return state;
  }

  let nextState = appendDebugTelemetryEvent(
    {
      ...state,
      quests: {
        ...state.quests,
        [questId]: {
          ...quest,
          status: "completed",
        },
      },
    },
    {
      type: "quest_turned_in",
      entityId: QUEST_GIVER_POI_ID,
      questId,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
    },
  );

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "quest_completed",
    entityId: QUEST_GIVER_POI_ID,
    questId,
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
  });

  return unlockAvailableQuests(nextState, questId);
}

function unlockAvailableQuests(state: GameState, completedQuestId: QuestId): GameState {
  const completedDefinition = QUEST_DEFINITIONS[completedQuestId];
  let nextState = state;

  for (const questId of QUEST_ORDER) {
    const quest = nextState.quests[questId];

    if (!quest || quest.status !== "locked") {
      continue;
    }

    const isExplicitUnlock =
      completedDefinition.unlocksQuestIds?.includes(questId) ?? false;
    const requirements = QUEST_DEFINITIONS[questId].requiresCompletedQuestIds;
    const requirementsMet = requirements
      ? requirements.every(
          (requiredQuestId) =>
            nextState.quests[requiredQuestId]?.status === "completed",
        )
      : false;

    if (!isExplicitUnlock && !requirementsMet) {
      continue;
    }

    nextState = appendDebugTelemetryEvent(
      {
        ...nextState,
        quests: {
          ...nextState.quests,
          [questId]: {
            ...quest,
            status: "available",
          },
        },
      },
      {
        type: "quest_unlocked",
        entityId: QUEST_GIVER_POI_ID,
        questId,
        currentMapId: nextState.currentMapId,
        currentMapDisplayName: nextState.map?.displayName,
        currentMapDebugName: nextState.map?.debugName,
      },
    );
  }

  return nextState;
}

function updateMatchingQuestObjectives(
  state: GameState,
  matchesObjective: (objective: QuestObjectiveDefinition) => boolean,
  amount: number,
): GameState {
  let nextState = state;

  for (const questId of QUEST_ORDER) {
    const quest = nextState.quests[questId];

    if (quest?.status !== "active") {
      continue;
    }

    for (const objective of QUEST_DEFINITIONS[questId].objectives) {
      if (!matchesObjective(objective)) {
        continue;
      }

      nextState = updateObjectiveProgress(nextState, questId, objective, amount);
    }
  }

  return nextState;
}

function updateObjectiveProgress(
  state: GameState,
  questId: QuestId,
  objective: QuestObjectiveDefinition,
  amount: number,
): GameState {
  const quest = state.quests[questId];
  const progress = quest.objectiveProgress[objective.id];
  const requiredCount = objective.requiredCount ?? 1;

  if (progress.completed) {
    return state;
  }

  const currentCount = Math.min(requiredCount, progress.currentCount + amount);
  const completed = currentCount >= requiredCount;
  let nextState = appendDebugTelemetryEvent(
    {
      ...state,
      quests: {
        ...state.quests,
        [questId]: {
          ...quest,
          objectiveProgress: {
            ...quest.objectiveProgress,
            [objective.id]: {
              ...progress,
              currentCount,
              completed,
            },
          },
        },
      },
    },
    {
      type: "quest_objective_progress",
      entityId: "party",
      questId,
      objectiveId: objective.id,
      objectiveProgress: currentCount,
      objectiveRequiredCount: requiredCount,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
    },
  );

  if (completed) {
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "quest_objective_completed",
      entityId: "party",
      questId,
      objectiveId: objective.id,
      objectiveProgress: currentCount,
      objectiveRequiredCount: requiredCount,
      currentMapId: nextState.currentMapId,
      currentMapDisplayName: nextState.map?.displayName,
      currentMapDebugName: nextState.map?.debugName,
    });
  }

  return maybeMarkQuestReadyToTurnIn(nextState, questId);
}

function maybeMarkQuestReadyToTurnIn(state: GameState, questId: QuestId): GameState {
  const quest = state.quests[questId];

  if (
    quest.status !== "active" ||
    !Object.values(quest.objectiveProgress).every((progress) => progress.completed)
  ) {
    return state;
  }

  return appendDebugTelemetryEvent(
    {
      ...state,
      quests: {
        ...state.quests,
        [questId]: {
          ...quest,
          status: "ready_to_turn_in",
        },
      },
    },
    {
      type: "quest_ready_to_turn_in",
      entityId: "party",
      questId,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
    },
  );
}

function getQuestByStatuses(
  state: GameState,
  statuses: QuestState["status"][],
): QuestState | null {
  for (const questId of QUEST_ORDER) {
    const quest = state.quests[questId];

    if (quest && statuses.includes(quest.status)) {
      return quest;
    }
  }

  return null;
}

export function getQuestTargetMapId(
  state: GameState,
  questId: QuestId,
): DebugMapId {
  const quest = state.quests[questId];

  if (quest.status === "ready_to_turn_in") {
    return HUB_MAP_ID;
  }

  const objective = getFirstIncompleteObjective(state, questId);

  return (
    objective?.targetMapId ??
    objective?.enemyMapId ??
    HUB_MAP_ID
  );
}
