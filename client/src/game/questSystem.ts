import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { HUB_MAP_ID, MAP_ONE_ID, MAP_TWO_ID, npcIds } from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinition } from "./items";
import { MAX_CHARACTER_LEVEL, grantCharacterXpToCompanion } from "./leveling";
import { getPartyMembers } from "./partySystem";
import { updateEntity, type GameState } from "./state";
import { addCurrencyToWalletState } from "./wallet";
import type {
  DebugMapId,
  Enemy,
  InventorySlot,
  ItemId,
  ResourceType,
} from "./types";
import type {
  QuestDefinition,
  QuestId,
  QuestObjectiveDefinition,
  QuestReward,
  QuestRewardItem,
  QuestSourceType,
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
    sourceType: "npc",
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
    rewards: {
      crowns: 25,
      characterXp: 8,
      items: [{ itemId: "wolf_pelt", quantity: 2 }],
      equipment: [{ itemId: "worn_cap", quantity: 1 }],
    },
  },
  gather_expedition_supplies: {
    id: "gather_expedition_supplies",
    displayName: "Gather Expedition Supplies",
    sourceType: "npc",
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
    rewards: {
      crowns: 20,
      characterXp: 6,
      items: [{ itemId: "field_herb", quantity: 3 }],
    },
  },
  scout_the_northern_road: {
    id: "scout_the_northern_road",
    displayName: "Scout the Northern Road",
    sourceType: "npc",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "reach_map_2",
        type: "reach_poi",
        targetMapId: MAP_TWO_ID,
        requiredCount: 1,
      },
    ],
    rewards: {
      crowns: 30,
      characterXp: 10,
      equipment: [{ itemId: "travel_boots", quantity: 1 }],
    },
  },
  threat_beyond_the_pass: {
    id: "threat_beyond_the_pass",
    displayName: "Threat Beyond the Pass",
    sourceType: "npc",
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
    rewards: {
      crowns: 75,
      characterXp: 20,
      items: [{ itemId: "orc_tusk", quantity: 2 }],
      equipment: [{ itemId: "reinforced_armor", quantity: 1 }],
    },
  },
};

type QuestRewardValidationResult =
  | {
      status: "success";
      requiredNewSlots: number;
      inventoryUsedSlots: number;
      inventoryCapacity: number;
    }
  | {
      status: "failed_inventory_full" | "failed_invalid";
      reason: string;
      itemId?: ItemId;
      requiredNewSlots: number;
      inventoryUsedSlots: number;
      inventoryCapacity: number;
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
          completedCycle: 0,
          rewardClaimedCycle: null,
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
  let nextState = appendDebugTelemetryEvent(state, {
    type: "quest_dialog_opened",
    entityId: QUEST_GIVER_POI_ID,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
  });
  const readyQuest = getQuestByStatuses(state, ["ready_to_turn_in"]);

  if (readyQuest) {
    return claimQuestReward(nextState, readyQuest.questId, "npc");
  }

  const availableQuest = getAvailableQuest(nextState);

  return availableQuest ? acceptQuest(nextState, availableQuest.questId) : nextState;
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
          lastTurnInError: undefined,
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

function claimQuestReward(
  state: GameState,
  questId: QuestId,
  sourceType: QuestSourceType,
): GameState {
  const quest = state.quests[questId];

  if (
    quest?.status !== "ready_to_turn_in" ||
    sourceType !== "npc" ||
    quest.rewardClaimedCycle === quest.completedCycle
  ) {
    return state;
  }

  let nextState = appendDebugTelemetryEvent(state, {
    type: "quest_finish_selected",
    entityId: QUEST_GIVER_POI_ID,
    questId,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
  });

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "quest_reward_validation_started",
    entityId: QUEST_GIVER_POI_ID,
    questId,
    inventoryUsedSlots: nextState.inventory.slots.length,
    inventoryCapacity: nextState.inventory.capacity,
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
  });

  const validation = validateQuestReward(nextState, questId);

  if (validation.status !== "success") {
    const errorType =
      validation.status === "failed_inventory_full"
        ? "inventory_full"
        : "invalid_reward";
    const failureEventType =
      validation.status === "failed_inventory_full"
        ? "quest_reward_validation_failed_inventory_full"
        : "quest_reward_claim_failed";

    return appendDebugTelemetryEvent(
      {
        ...nextState,
        quests: {
          ...nextState.quests,
          [questId]: {
            ...quest,
            lastTurnInError: errorType,
          },
        },
      },
      {
        type: failureEventType,
        entityId: QUEST_GIVER_POI_ID,
        questId,
        itemId: validation.itemId,
        result: validation.status,
        reason: validation.reason,
        inventoryUsedSlots: validation.inventoryUsedSlots,
        inventoryCapacity: validation.inventoryCapacity,
        currentMapId: nextState.currentMapId,
        currentMapDisplayName: nextState.map?.displayName,
        currentMapDebugName: nextState.map?.debugName,
      },
    );
  }

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "quest_reward_claim_started",
    entityId: QUEST_GIVER_POI_ID,
    questId,
    inventoryUsedSlots: validation.inventoryUsedSlots,
    inventoryCapacity: validation.inventoryCapacity,
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
  });

  nextState = grantQuestRewards(nextState, questId);

  nextState = appendDebugTelemetryEvent(
    {
      ...nextState,
      quests: {
        ...nextState.quests,
        [questId]: {
          ...nextState.quests[questId],
          status: "completed",
          rewardClaimedCycle: quest.completedCycle,
          lastTurnInError: undefined,
        },
      },
    },
    {
      type: "quest_turned_in",
      entityId: QUEST_GIVER_POI_ID,
      questId,
      currentMapId: nextState.currentMapId,
      currentMapDisplayName: nextState.map?.displayName,
      currentMapDebugName: nextState.map?.debugName,
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

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "quest_reward_claim_succeeded",
    entityId: QUEST_GIVER_POI_ID,
    questId,
    result: "success",
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
  });

  return unlockAvailableQuests(nextState, questId);
}

function validateQuestReward(
  state: GameState,
  questId: QuestId,
): QuestRewardValidationResult {
  const reward = QUEST_DEFINITIONS[questId].rewards;
  const inventoryUsedSlots = state.inventory.slots.length;
  const inventoryCapacity = state.inventory.capacity;

  if (!reward) {
    return {
      status: "success",
      requiredNewSlots: 0,
      inventoryUsedSlots,
      inventoryCapacity,
    };
  }

  const rewardValueValidation = validateRewardValues(reward);

  if (rewardValueValidation) {
    return {
      status: "failed_invalid",
      reason: rewardValueValidation,
      requiredNewSlots: 0,
      inventoryUsedSlots,
      inventoryCapacity,
    };
  }

  const rewardItems = getRewardInventoryItems(reward);
  const slots = state.inventory.slots.map((slot) => ({ ...slot }));
  let requiredNewSlots = 0;

  for (const rewardItem of rewardItems) {
    const result = simulateRewardItemAdd(slots, inventoryCapacity, rewardItem);
    requiredNewSlots += result.createdSlots;

    if (result.status !== "success") {
      return {
        status: result.status,
        reason: result.reason,
        itemId: rewardItem.itemId,
        requiredNewSlots,
        inventoryUsedSlots,
        inventoryCapacity,
      };
    }
  }

  return {
    status: "success",
    requiredNewSlots,
    inventoryUsedSlots,
    inventoryCapacity,
  };
}

function validateRewardValues(reward: QuestReward): string | null {
  if (
    reward.crowns !== undefined &&
    (!Number.isFinite(reward.crowns) || Math.floor(reward.crowns) < 0)
  ) {
    return "invalid_reward_crowns";
  }

  if (
    reward.characterXp !== undefined &&
    (!Number.isFinite(reward.characterXp) || Math.floor(reward.characterXp) < 0)
  ) {
    return "invalid_reward_xp";
  }

  return null;
}

function getRewardInventoryItems(reward: QuestReward): QuestRewardItem[] {
  return [
    ...(reward.items ?? []),
    ...(reward.equipment ?? []),
  ];
}

function simulateRewardItemAdd(
  slots: InventorySlot[],
  capacity: number,
  rewardItem: QuestRewardItem,
): {
  status: "success" | "failed_inventory_full" | "failed_invalid";
  reason: string;
  createdSlots: number;
} {
  const requestedQuantity = Math.floor(rewardItem.quantity);
  const itemDefinition = getItemDefinition(rewardItem.itemId);
  let remainingQuantity = requestedQuantity;
  let createdSlots = 0;

  if (!itemDefinition || requestedQuantity <= 0) {
    return {
      status: "failed_invalid",
      reason: "invalid_reward_item",
      createdSlots,
    };
  }

  if (itemDefinition.stackable) {
    for (let slotIndex = 0; slotIndex < slots.length && remainingQuantity > 0; slotIndex += 1) {
      const slot = slots[slotIndex];

      if (slot.itemId !== itemDefinition.id || slot.quantity >= itemDefinition.maxStack) {
        continue;
      }

      const addedToStack = Math.min(
        itemDefinition.maxStack - slot.quantity,
        remainingQuantity,
      );
      slots[slotIndex] = {
        ...slot,
        quantity: slot.quantity + addedToStack,
      };
      remainingQuantity -= addedToStack;
    }
  }

  while (remainingQuantity > 0) {
    if (slots.length >= capacity) {
      return {
        status: "failed_inventory_full",
        reason: "inventory_full",
        createdSlots,
      };
    }

    const addedToStack = itemDefinition.stackable
      ? Math.min(itemDefinition.maxStack, remainingQuantity)
      : 1;
    slots.push({
      itemId: rewardItem.itemId,
      quantity: addedToStack,
    });
    remainingQuantity -= addedToStack;
    createdSlots += 1;
  }

  return {
    status: "success",
    reason: "validated",
    createdSlots,
  };
}

function grantQuestRewards(state: GameState, questId: QuestId): GameState {
  const reward = QUEST_DEFINITIONS[questId].rewards;

  if (!reward) {
    return state;
  }

  let nextState = state;

  if (reward.crowns && reward.crowns > 0) {
    const walletResult = addCurrencyToWalletState(
      nextState,
      "crowns",
      reward.crowns,
      "quest_reward",
    );
    nextState = appendDebugTelemetryEvent(walletResult.state, {
      type: "quest_reward_crowns_added",
      entityId: QUEST_GIVER_POI_ID,
      questId,
      currencyId: "crowns",
      currencyAmount: walletResult.result.changedAmount,
      result: walletResult.result.status,
      currentMapId: walletResult.state.currentMapId,
      currentMapDisplayName: walletResult.state.map?.displayName,
      currentMapDebugName: walletResult.state.map?.debugName,
    });
  }

  if (reward.characterXp && reward.characterXp > 0) {
    nextState = grantQuestXpToCurrentParty(nextState, questId, reward.characterXp);
  }

  for (const rewardItem of reward.items ?? []) {
    nextState = grantRewardInventoryItem(
      nextState,
      questId,
      rewardItem,
      "quest_reward_item_added",
    );
  }

  for (const rewardItem of reward.equipment ?? []) {
    nextState = grantRewardInventoryItem(
      nextState,
      questId,
      rewardItem,
      "quest_reward_equipment_added",
    );
  }

  return nextState;
}

function grantQuestXpToCurrentParty(
  state: GameState,
  questId: QuestId,
  amount: number,
): GameState {
  let nextState = state;
  const xpAmount = Math.floor(amount);

  for (const companion of getPartyMembers(nextState)) {
    if (companion.characterLevel >= MAX_CHARACTER_LEVEL) {
      nextState = appendDebugTelemetryEvent(nextState, {
        type: "character_xp_skipped",
        entityId: companion.id,
        questId,
        xpAmount: 0,
        baseXpAmount: xpAmount,
        modifiedXpAmount: 0,
        xpModifier: 1,
        previousLevel: companion.characterLevel,
        nextLevel: companion.characterLevel,
        previousXp: companion.characterXp,
        nextXp: companion.characterXp,
        reason: "quest_reward:max_level",
      });
      continue;
    }

    const updatedCompanion = grantCharacterXpToCompanion(companion, xpAmount);
    nextState = updateEntity(nextState, updatedCompanion);
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "quest_reward_xp_awarded",
      entityId: companion.id,
      questId,
      xpAmount,
      baseXpAmount: xpAmount,
      modifiedXpAmount: xpAmount,
      xpModifier: 1,
      previousLevel: companion.characterLevel,
      nextLevel: updatedCompanion.characterLevel,
      previousXp: companion.characterXp,
      nextXp: updatedCompanion.characterXp,
      reason: "quest_reward",
    });

    if (updatedCompanion.characterLevel > companion.characterLevel) {
      nextState = appendDebugTelemetryEvent(nextState, {
        type: "character_level_up",
        entityId: companion.id,
        questId,
        xpAmount,
        previousLevel: companion.characterLevel,
        nextLevel: updatedCompanion.characterLevel,
        previousXp: companion.characterXp,
        nextXp: updatedCompanion.characterXp,
      });
    }
  }

  return nextState;
}

function grantRewardInventoryItem(
  state: GameState,
  questId: QuestId,
  rewardItem: QuestRewardItem,
  telemetryType: "quest_reward_item_added" | "quest_reward_equipment_added",
): GameState {
  const addResult = addItemToInventoryState(
    state,
    rewardItem.itemId,
    rewardItem.quantity,
    "quest_reward",
  );

  return appendDebugTelemetryEvent(addResult.state, {
    type: telemetryType,
    entityId: QUEST_GIVER_POI_ID,
    questId,
    itemId: rewardItem.itemId,
    requestedQuantity: addResult.result.requestedQuantity,
    addedQuantity: addResult.result.addedQuantity,
    overflowQuantity: addResult.result.overflowQuantity,
    result: addResult.result.status,
    inventoryUsedSlots: addResult.state.inventory.slots.length,
    inventoryCapacity: addResult.state.inventory.capacity,
    currentMapId: addResult.state.currentMapId,
    currentMapDisplayName: addResult.state.map?.displayName,
    currentMapDebugName: addResult.state.map?.debugName,
  });
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
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "quest_available",
      entityId: QUEST_GIVER_POI_ID,
      questId,
      currentMapId: nextState.currentMapId,
      currentMapDisplayName: nextState.map?.displayName,
      currentMapDebugName: nextState.map?.debugName,
    });
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
