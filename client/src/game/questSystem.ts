import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { DROP_VISUAL_DURATION_MS } from "./dropSystem";
import {
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
  MAP_TWO_ID,
  MAP_TWO_TO_MAP_THREE_TELEPORTER_ID,
  TELEPORTER_ID,
  npcIds,
} from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinition } from "./items";
import {
  MAX_CHARACTER_LEVEL,
  getDebugXpMultiplier,
  grantCharacterXpToCompanion,
} from "./leveling";
import { getPartyMembers } from "./partySystem";
import { updateEntity, type GameState } from "./state";
import { getSubzoneAtPosition } from "./subzoneSystem";
import { setTeleportWorking } from "./teleportState";
import { addCurrencyToWalletState } from "./wallet";
import type {
  DebugMapId,
  Enemy,
  EquipmentSlot,
  InventorySlot,
  ItemId,
  Position,
  ResourceEntity,
  ResourceType,
} from "./types";
import type {
  QuestDefinition,
  QuestId,
  QuestObjectiveDefinition,
  QuestReward,
  QuestRewardItem,
  QuestState,
} from "./questTypes";

export const QUEST_GIVER_POI_ID = npcIds[0];
export const EQUIPMENT_TUTORIAL_QUEST_ID: QuestId = "outfit_the_expedition";

export const QUEST_ORDER: QuestId[] = [
  "clear_the_shore",
  EQUIPMENT_TUTORIAL_QUEST_ID,
  "stolen_field_supplies",
  "break_lower_shore_blockage",
  "scout_rise_samples",
  "rescue_the_grove_runner",
  "hold_the_field_cache",
  "open_wolf_causeway",
  "find_slimeward_camp",
];

export const QUEST_DEFINITIONS: Record<QuestId, QuestDefinition> = {
  clear_the_shore: {
    id: "clear_the_shore",
    displayName: "Secure the Landing",
    sourceType: "npc",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "defeat_shore_fringe_slimes",
        type: "defeat_enemy_count",
        enemyMapId: MAP_ONE_ID,
        targetSubzoneId: "shore-fringe",
        enemyArchetypeId: "slime",
        requiredCount: 10,
      },
      {
        id: "gather_shore_fringe_wood",
        type: "gather_item_count",
        targetMapId: MAP_ONE_ID,
        targetSubzoneId: "shore-fringe",
        resourceType: "wood",
        requiredCount: 3,
      },
      {
        id: "inspect_shore_fringe_marker",
        type: "inspect_poi",
        targetMapId: MAP_ONE_ID,
        targetSubzoneId: "shore-fringe",
        targetPoiId: "shore-fringe-supply-marker",
        targetPosition: { x: 46, y: 22 },
        requiredCount: 1,
      },
    ],
    unlocksQuestIds: [EQUIPMENT_TUTORIAL_QUEST_ID],
    rewards: {
      crowns: 50,
      characterXp: 8,
      items: [
        { itemId: "wolf_pelt", quantity: 2 },
        { itemId: "minor_recovery_flask", quantity: 1 },
      ],
      equipment: [{ itemId: "guard_coif", quantity: 1 }],
    },
  },
  outfit_the_expedition: {
    id: EQUIPMENT_TUTORIAL_QUEST_ID,
    displayName: "Outfit the Expedition",
    sourceType: "npc",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "equip_training_sword",
        type: "equip_item",
        itemId: "training_sword",
        targetSlot: "mainHand",
        requiredCount: 1,
      },
      {
        id: "equip_guard_coif",
        type: "equip_item",
        itemId: "guard_coif",
        targetSlot: "head",
        requiredCount: 1,
      },
      {
        id: "equip_minor_recovery_flask",
        type: "equip_flask",
        itemId: "minor_recovery_flask",
        requiredCount: 1,
      },
      {
        id: "buy_merchant_equipment",
        type: "buy_merchant_equipment",
        requiredCount: 1,
      },
    ],
    unlocksQuestIds: ["stolen_field_supplies"],
    rewards: {
      crowns: 10,
      characterXp: 4,
    },
  },
  stolen_field_supplies: {
    id: "stolen_field_supplies",
    displayName: "Stolen Field Supplies",
    sourceType: "npc",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "collect_mossy_glade_supplies",
        type: "collect_enemy_quest_drop_count",
        enemyMapId: MAP_ONE_ID,
        targetSubzoneId: "mossy-glade",
        enemyArchetypeId: "bat",
        requiredCount: 10,
        questItemDisplayName: "Stolen Supply Bundle",
        dropChance: 0.55,
        pityKillCount: 2,
      },
    ],
    unlocksQuestIds: ["break_lower_shore_blockage"],
    rewards: {
      crowns: 35,
      characterXp: 12,
      items: [{ itemId: "hearty_trail_rations", quantity: 1 }],
    },
  },
  break_lower_shore_blockage: {
    id: "break_lower_shore_blockage",
    displayName: "Break the Lower Shore Blockage",
    sourceType: "npc",
    objectiveFlow: "sequential",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "inspect_lower_shore_wreckage",
        type: "inspect_poi",
        targetMapId: MAP_ONE_ID,
        targetSubzoneId: "lower-shore",
        targetPoiId: "lower-shore-webbed-wreckage",
        targetPosition: { x: 150, y: 28 },
        requiredCount: 1,
      },
      {
        id: "defeat_lower_shore_spiders",
        type: "defeat_enemy_count",
        enemyMapId: MAP_ONE_ID,
        targetSubzoneId: "lower-shore",
        enemyArchetypeId: "spider",
        requiredCount: 20,
      },
      {
        id: "escort_lower_shore_worker",
        type: "guide_npc_to_poi",
        targetMapId: MAP_ONE_ID,
        targetSubzoneId: "lower-shore",
        targetPoiId: "lower-shore-route-blockage",
        targetPosition: { x: 154, y: 29 },
        guideNpcId: "map-1-route-worker",
        npcDisplayName: "Route Worker",
        guideStartPosition: { x: 110, y: 29 },
        guideTargetPosition: { x: 153, y: 29 },
        requiredCount: 1,
      },
      {
        id: "repair_lower_shore_blockage",
        type: "repair_poi",
        targetMapId: MAP_ONE_ID,
        targetSubzoneId: "lower-shore",
        targetPoiId: "lower-shore-route-blockage",
        targetPosition: { x: 153, y: 29 },
        repairDurationMs: 8000,
        routeTeleportId: TELEPORTER_ID,
        requiredCount: 1,
      },
      {
        id: "unlock_map_two_route",
        type: "unlock_route",
        targetMapId: MAP_ONE_ID,
        targetSubzoneId: "lower-shore",
        targetPoiId: TELEPORTER_ID,
        targetPosition: { x: 154, y: 29 },
        routeTeleportId: TELEPORTER_ID,
        requiredCount: 1,
      },
    ],
    unlocksQuestIds: ["scout_rise_samples"],
    rewards: {
      crowns: 60,
      characterXp: 18,
      equipment: [{ itemId: "scout_boots", quantity: 1 }],
    },
  },
  scout_rise_samples: {
    id: "scout_rise_samples",
    displayName: "Scout Rise Samples",
    sourceType: "npc",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "collect_scout_rise_samples",
        type: "collect_enemy_quest_drop_count",
        enemyMapId: MAP_TWO_ID,
        targetSubzoneId: "south-center",
        requiredCount: 12,
        questItemDisplayName: "Scout Report Sample",
        dropChance: 0.5,
        pityKillCount: 2,
      },
    ],
    unlocksQuestIds: ["rescue_the_grove_runner"],
    rewards: {
      crowns: 45,
      characterXp: 18,
      items: [{ itemId: "minor_recovery_flask", quantity: 1 }],
    },
  },
  rescue_the_grove_runner: {
    id: "rescue_the_grove_runner",
    displayName: "Rescue the Grove Runner",
    sourceType: "npc",
    objectiveFlow: "sequential",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "reach_grove_runner",
        type: "reach_poi",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "south-east",
        targetPoiId: "old-grove-runner",
        targetPosition: { x: 78, y: 25 },
        requiredCount: 1,
      },
      {
        id: "rescue_grove_runner",
        type: "rescue_npc",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "south-east",
        targetPoiId: "old-grove-runner",
        targetPosition: { x: 78, y: 25 },
        guideNpcId: "map-2-grove-runner",
        npcDisplayName: "Grove Runner",
        guideStartPosition: { x: 78, y: 25 },
        requiredCount: 1,
      },
      {
        id: "repair_old_grove_cache",
        type: "repair_poi",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "south-east",
        targetPoiId: "old-grove-field-cache",
        targetPosition: { x: 100, y: 25 },
        repairDurationMs: 6000,
        requiredCount: 1,
      },
    ],
    unlocksQuestIds: ["hold_the_field_cache"],
    rewards: {
      crowns: 55,
      characterXp: 22,
      items: [{ itemId: "skirmisher_rations", quantity: 1 }],
    },
  },
  hold_the_field_cache: {
    id: "hold_the_field_cache",
    displayName: "Hold the Field Cache",
    sourceType: "npc",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "defend_old_grove_cache",
        type: "defend_area",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "south-east",
        targetPoiId: "old-grove-field-cache",
        targetPosition: { x: 100, y: 25 },
        repairDurationMs: 12000,
        defenseRadius: 14,
        waveProgressPercents: [0, 25, 50, 75],
        questSpawnEnemies: [
          { enemyTypeId: "goblin_scout", level: 5, count: 1 },
          { enemyTypeId: "bog_imp", level: 5, count: 1 },
        ],
        requiredCount: 1,
      },
    ],
    unlocksQuestIds: ["open_wolf_causeway"],
    rewards: {
      crowns: 75,
      characterXp: 28,
      items: [{ itemId: "soldiers_recovery_flask", quantity: 1 }],
    },
  },
  open_wolf_causeway: {
    id: "open_wolf_causeway",
    displayName: "Open the Wolf Causeway",
    sourceType: "npc",
    objectiveFlow: "sequential",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "escort_causeway_worker",
        type: "guide_npc_to_poi",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "north-east",
        targetPoiId: "wolf-causeway-blockage",
        targetPosition: { x: 154, y: 29 },
        guideNpcId: "map-2-causeway-worker",
        npcDisplayName: "Causeway Worker",
        guideStartPosition: { x: 8, y: 29 },
        guideTargetPosition: { x: 153, y: 29 },
        requiredCount: 1,
      },
      {
        id: "defend_wolf_causeway",
        type: "defend_area",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "north-east",
        targetPoiId: "wolf-causeway-blockage",
        targetPosition: { x: 153, y: 29 },
        repairDurationMs: 10000,
        defenseRadius: 14,
        waveProgressPercents: [0, 50],
        questSpawnEnemies: [
          { enemyTypeId: "wolf", level: 7, count: 2 },
          { enemyTypeId: "goblin_thrower", level: 7, count: 1 },
        ],
        requiredCount: 1,
      },
      {
        id: "defeat_causeway_elite",
        type: "defeat_elite",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "north-east",
        targetPoiId: "wolf-causeway-elite",
        targetPosition: { x: 145, y: 22 },
        eliteSpawnPosition: { x: 145, y: 22 },
        eliteEnemy: { enemyTypeId: "wolf", level: 8, count: 1 },
        requiredCount: 1,
      },
      {
        id: "unlock_map_three_route",
        type: "unlock_route",
        targetMapId: MAP_TWO_ID,
        targetSubzoneId: "north-east",
        targetPoiId: MAP_TWO_TO_MAP_THREE_TELEPORTER_ID,
        targetPosition: { x: 154, y: 29 },
        routeTeleportId: MAP_TWO_TO_MAP_THREE_TELEPORTER_ID,
        requiredCount: 1,
      },
    ],
    rewards: {
      crowns: 100,
      characterXp: 40,
      equipment: [
        { itemId: "bulwark_cuirass", quantity: 1 },
        { itemId: "plain_charm", quantity: 1 },
      ],
    },
    unlocksQuestIds: ["find_slimeward_camp"],
  },
  find_slimeward_camp: {
    id: "find_slimeward_camp",
    displayName: "Slimeward Trail",
    sourceType: "npc",
    objectiveFlow: "sequential",
    questGiverPoiId: QUEST_GIVER_POI_ID,
    objectives: [
      {
        id: "unlock_slimeward_camp_route",
        type: "unlock_route",
        targetMapId: MAP_THREE_ID,
        targetSubzoneId: "north-west",
        targetPoiId: MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
        targetPosition: { x: 98, y: 5 },
        routeTeleportId: MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
        requiredCount: 1,
      },
    ],
    rewards: {
      crowns: 25,
      characterXp: 10,
    },
  },
};

export type QuestItemInventoryEntry = {
  key: string;
  questId: QuestId;
  questDisplayName: string;
  objectiveId: string;
  displayName: string;
  quantity: number;
  requiredCount: number;
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
      questId?: QuestId;
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

export function getQuestItemInventoryEntries(
  quests: GameState["quests"],
): QuestItemInventoryEntry[] {
  const entries: QuestItemInventoryEntry[] = [];

  for (const questId of QUEST_ORDER) {
    const quest = quests[questId];

    if (
      quest.status !== "active" &&
      quest.status !== "ready_to_turn_in"
    ) {
      continue;
    }

    const definition = QUEST_DEFINITIONS[questId];

    for (const objective of definition.objectives) {
      if (objective.type !== "collect_enemy_quest_drop_count") {
        continue;
      }

      const progress = quest.objectiveProgress[objective.id];
      const quantity = progress?.currentCount ?? 0;

      if (quantity <= 0) {
        continue;
      }

      entries.push({
        key: `${questId}:${objective.id}`,
        questId,
        questDisplayName: definition.displayName,
        objectiveId: objective.id,
        displayName: getQuestDropItemDisplayName(definition, objective),
        quantity,
        requiredCount: objective.requiredCount ?? 1,
      });
    }
  }

  return entries;
}

export function getAvailableQuest(state: GameState): QuestState | null {
  return getQuestByStatuses(state, ["available"]);
}

export function getQuestGiverAvailableQuests(
  state: GameState,
  questGiverPoiId: string,
): QuestState[] {
  return getQuestGiverQuestsByStatuses(state, questGiverPoiId, ["available"]);
}

export function getQuestGiverCurrentQuests(
  state: GameState,
  questGiverPoiId: string,
): QuestState[] {
  return getQuestGiverQuestsByStatuses(state, questGiverPoiId, ["active"]);
}

export function getQuestGiverReadyQuests(
  state: GameState,
  questGiverPoiId: string,
): QuestState[] {
  return getQuestGiverQuestsByStatuses(state, questGiverPoiId, [
    "ready_to_turn_in",
  ]);
}

export function getQuestDefinition(questId: QuestId): QuestDefinition {
  return QUEST_DEFINITIONS[questId];
}

export function getQuestDropItemDisplayName(
  questDefinition: QuestDefinition,
  objective: QuestObjectiveDefinition,
): string {
  return objective.questItemDisplayName ?? `${questDefinition.displayName} Quest Item`;
}

export function getFirstIncompleteObjective(
  state: GameState,
  questId: QuestId,
): QuestObjectiveDefinition | null {
  return getIncompleteObjectives(state, questId)[0] ?? null;
}

export function getIncompleteObjectives(
  state: GameState,
  questId: QuestId,
): QuestObjectiveDefinition[] {
  const quest = state.quests[questId];
  const definition = QUEST_DEFINITIONS[questId];

  return definition.objectives.filter(
    (objective) => !quest.objectiveProgress[objective.id]?.completed,
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

export function isMerchantUnlockedForQuests(state: GameState): boolean {
  const status = state.quests[EQUIPMENT_TUTORIAL_QUEST_ID]?.status;

  return (
    status === "active" ||
    status === "ready_to_turn_in" ||
    status === "completed"
  );
}

export function recordMerchantLockedForQuest(
  state: GameState,
  merchantNpcId: string,
  reason: string,
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: "merchant_locked_for_quest",
    entityId: merchantNpcId,
    questId: EQUIPMENT_TUTORIAL_QUEST_ID,
    result: "blocked",
    reason,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
  });
}

export function updateQuestGiverInteraction(state: GameState): GameState {
  const nextState = appendDebugTelemetryEvent(state, {
    type: "quest_dialog_opened",
    entityId: QUEST_GIVER_POI_ID,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
  });
  const readyQuest = getQuestByStatuses(state, ["ready_to_turn_in"]);

  if (readyQuest) {
    return claimQuestReward(nextState, readyQuest.questId, QUEST_GIVER_POI_ID);
  }

  const availableQuest = getAvailableQuest(nextState);

  return availableQuest
    ? acceptQuestFromQuestGiver(nextState, QUEST_GIVER_POI_ID, availableQuest.questId)
    : nextState;
}

export function acceptQuestFromQuestGiver(
  state: GameState,
  questGiverPoiId: string,
  questId: QuestId,
): GameState {
  if (QUEST_DEFINITIONS[questId].questGiverPoiId !== questGiverPoiId) {
    return state;
  }

  return acceptQuest(state, questId, questGiverPoiId);
}

export function finishReadyQuestsForQuestGiver(
  state: GameState,
  questGiverPoiId: string,
): GameState {
  const readyQuests = getQuestGiverReadyQuests(state, questGiverPoiId);

  if (readyQuests.length === 0) {
    return state;
  }

  let nextState = state;

  for (const quest of readyQuests) {
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "quest_finish_selected",
      entityId: questGiverPoiId,
      questId: quest.questId,
      currentMapId: nextState.currentMapId,
      currentMapDisplayName: nextState.map?.displayName,
      currentMapDebugName: nextState.map?.debugName,
    });
  }

  for (const quest of readyQuests) {
    nextState = appendQuestRewardValidationStarted(
      nextState,
      quest.questId,
      questGiverPoiId,
    );
  }

  const validation = validateQuestRewards(
    nextState,
    readyQuests.map((quest) => quest.questId),
  );

  if (validation.status !== "success") {
    const errorType =
      validation.status === "failed_inventory_full"
        ? "inventory_full"
        : "invalid_reward";
    const failureEventType =
      validation.status === "failed_inventory_full"
        ? "quest_reward_validation_failed_inventory_full"
        : "quest_reward_claim_failed";
    const failedQuests = Object.fromEntries(
      readyQuests.map((quest) => [
        quest.questId,
        {
          ...nextState.quests[quest.questId],
          lastTurnInError: errorType,
        },
      ]),
    ) as Partial<Record<QuestId, QuestState>>;

    return appendDebugTelemetryEvent(
      {
        ...nextState,
        quests: {
          ...nextState.quests,
          ...failedQuests,
        },
      },
      {
        type: failureEventType,
        entityId: questGiverPoiId,
        questId: validation.questId,
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

  for (const quest of readyQuests) {
    nextState = claimQuestReward(nextState, quest.questId, questGiverPoiId, {
      skipValidation: true,
      skipFinishSelectedTelemetry: true,
    });
  }

  return nextState;
}

export function recordEnemyDefeatedForQuests(
  state: GameState,
  defeatedEnemy: Enemy,
  mapId?: DebugMapId,
  random = Math.random,
  now = Date.now(),
): GameState {
  if (!mapId || defeatedEnemy.state !== "dead") {
    return state;
  }

  let nextState = updateMatchingQuestObjectives(
    state,
    (objective) =>
      objective.type === "defeat_enemy_count" &&
      objective.enemyMapId === mapId &&
      matchesOptionalSubzone(objective, defeatedEnemy.subzoneId) &&
      matchesOptionalEnemyArchetype(objective, defeatedEnemy.archetypeId) &&
      matchesOptionalEnemyVariant(objective, defeatedEnemy),
    1,
  );

  nextState = recordEnemyQuestDropObjectives(
    nextState,
    defeatedEnemy,
    mapId,
    random,
    now,
  );

  if (defeatedEnemy.questSpawn?.isElite) {
    nextState = updateMatchingQuestObjectives(
      nextState,
      (objective) =>
        objective.type === "defeat_elite" &&
        objective.targetMapId === mapId &&
        objective.id === defeatedEnemy.questSpawn?.objectiveId,
      1,
    );
  }

  return nextState;
}

export function recordResourceGatheredForQuests(
  state: GameState,
  resource: ResourceEntity | ResourceType,
  mapId: DebugMapId | undefined,
  quantity: number,
): GameState {
  if (!mapId || quantity <= 0) {
    return state;
  }

  const resourceType =
    typeof resource === "string" ? resource : resource.resourceType;
  const resourceSubzoneId =
    typeof resource === "string"
      ? undefined
      : getSubzoneIdAtPosition(state, resource.position);

  return updateMatchingQuestObjectives(
    state,
    (objective) =>
      objective.type === "gather_item_count" &&
      objective.targetMapId === mapId &&
      objective.resourceType === resourceType &&
      matchesOptionalSubzone(objective, resourceSubzoneId),
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
      objective.targetMapId === mapId &&
      !objective.targetPoiId &&
      !objective.targetPosition,
    1,
  );
}

export function recordQuestPoiReachedForQuests(
  state: GameState,
  poiId: string,
  mapId: DebugMapId | undefined,
): GameState {
  if (!mapId) {
    return state;
  }

  return updateMatchingQuestObjectives(
    state,
    (objective) =>
      (objective.type === "inspect_poi" ||
        objective.type === "guide_npc_to_poi" ||
        objective.type === "rescue_npc" ||
        objective.type === "reach_poi") &&
      objective.targetMapId === mapId &&
      objective.targetPoiId === poiId,
    1,
  );
}

export function recordQuestRepairProgress(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
  progressMs: number,
): GameState {
  const objective = QUEST_DEFINITIONS[questId].objectives.find(
    (candidate) => candidate.id === objectiveId,
  );

  if (
    !objective ||
    (objective.type !== "repair_poi" && objective.type !== "defend_area")
  ) {
    return state;
  }

  const durationMs = objective.repairDurationMs ?? 1;
  const clampedProgressMs = Math.min(durationMs, Math.max(0, progressMs));
  const quest = state.quests[questId];
  const nextState: GameState = {
    ...state,
    quests: {
      ...state.quests,
      [questId]: {
        ...quest,
        runtime: {
          ...quest.runtime,
          repairProgressMsByObjectiveId: {
            ...quest.runtime?.repairProgressMsByObjectiveId,
            [objectiveId]: clampedProgressMs,
          },
        },
      },
    },
  };

  return clampedProgressMs >= durationMs
    ? updateObjectiveProgress(nextState, questId, objective, 1)
    : nextState;
}

export function completeQuestObjective(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
): GameState {
  const objective = QUEST_DEFINITIONS[questId].objectives.find(
    (candidate) => candidate.id === objectiveId,
  );

  return objective ? updateObjectiveProgress(state, questId, objective, 1) : state;
}

export function isObjectiveCompleted(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
): boolean {
  return Boolean(state.quests[questId]?.objectiveProgress[objectiveId]?.completed);
}

export function recordEquippedItemObjectivesForQuests(
  state: GameState,
  reason = "equipment_state_check",
): GameState {
  let nextState = state;

  for (const questId of QUEST_ORDER) {
    const quest = nextState.quests[questId];

    if (quest?.status !== "active") {
      continue;
    }

    for (const objective of QUEST_DEFINITIONS[questId].objectives) {
      if (
        (objective.type !== "equip_item" && objective.type !== "equip_flask") ||
        quest.objectiveProgress[objective.id]?.completed ||
        !objective.itemId
      ) {
        continue;
      }

      const isEquipped =
        objective.type === "equip_flask"
          ? isFlaskEquippedByAnyCompanion(nextState, objective.itemId)
          : isItemEquippedByAnyCompanion(
              nextState,
              objective.itemId,
              objective.targetSlot,
            );

      nextState = appendDebugTelemetryEvent(nextState, {
        type: "quest_equipment_state_checked",
        entityId: "party",
        questId,
        objectiveId: objective.id,
        itemId: objective.itemId,
        targetSlot: objective.targetSlot,
        result: isEquipped ? "matched" : "not_matched",
        reason,
        currentMapId: nextState.currentMapId,
        currentMapDisplayName: nextState.map?.displayName,
        currentMapDebugName: nextState.map?.debugName,
      });

      if (isEquipped) {
        nextState = updateObjectiveProgress(nextState, questId, objective, 1);
      }
    }
  }

  return nextState;
}

export function recordMerchantEquipmentPurchasedForQuests(
  state: GameState,
  itemId: ItemId,
): GameState {
  const itemDefinition = getItemDefinition(itemId);

  if (!itemDefinition || itemDefinition.category !== "equipment") {
    return state;
  }

  return updateMatchingQuestObjectives(
    state,
    (objective) => objective.type === "buy_merchant_equipment",
    1,
  );
}

export function getSubzoneIdAtPosition(
  state: GameState,
  position: Position | undefined,
): string | undefined {
  return getSubzoneAtPosition(state.map, position)?.id;
}

export function matchesObjectiveSubzoneAtPosition(
  state: GameState,
  objective: QuestObjectiveDefinition,
  position: Position | undefined,
): boolean {
  return matchesOptionalSubzone(
    objective,
    getSubzoneIdAtPosition(state, position),
  );
}

function acceptQuest(
  state: GameState,
  questId: QuestId,
  questGiverPoiId = QUEST_GIVER_POI_ID,
): GameState {
  const quest = state.quests[questId];

  if (quest?.status !== "available") {
    return state;
  }

  let nextState = appendDebugTelemetryEvent(
    {
      ...state,
      autoModeEnabled:
        questId === EQUIPMENT_TUTORIAL_QUEST_ID ? false : state.autoModeEnabled,
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
      entityId: questGiverPoiId,
      questId,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
    },
  );

  if (questId === EQUIPMENT_TUTORIAL_QUEST_ID) {
    nextState = recordEquippedItemObjectivesForQuests(
      nextState,
      "quest_acceptance",
    );
  }

  return nextState;
}

function claimQuestReward(
  state: GameState,
  questId: QuestId,
  questGiverPoiId: string,
  options: {
    skipValidation?: boolean;
    skipFinishSelectedTelemetry?: boolean;
  } = {},
): GameState {
  const quest = state.quests[questId];

  if (
    quest?.status !== "ready_to_turn_in" ||
    QUEST_DEFINITIONS[questId].questGiverPoiId !== questGiverPoiId ||
    quest.rewardClaimedCycle === quest.completedCycle
  ) {
    return state;
  }

  let nextState = options.skipFinishSelectedTelemetry
    ? state
    : appendDebugTelemetryEvent(state, {
        type: "quest_finish_selected",
        entityId: questGiverPoiId,
        questId,
        currentMapId: state.currentMapId,
        currentMapDisplayName: state.map?.displayName,
        currentMapDebugName: state.map?.debugName,
      });

  if (!options.skipValidation) {
    nextState = appendQuestRewardValidationStarted(
      nextState,
      questId,
      questGiverPoiId,
    );
  }

  const validation = options.skipValidation
    ? {
        status: "success" as const,
        requiredNewSlots: 0,
        inventoryUsedSlots: nextState.inventory.slots.length,
        inventoryCapacity: nextState.inventory.capacity,
      }
    : validateQuestRewards(nextState, [questId]);

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
        entityId: questGiverPoiId,
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
    entityId: questGiverPoiId,
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
      entityId: questGiverPoiId,
      questId,
      currentMapId: nextState.currentMapId,
      currentMapDisplayName: nextState.map?.displayName,
      currentMapDebugName: nextState.map?.debugName,
    },
  );

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "quest_completed",
    entityId: questGiverPoiId,
    questId,
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
  });

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "quest_reward_claim_succeeded",
    entityId: questGiverPoiId,
    questId,
    result: "success",
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
  });

  return unlockAvailableQuests(nextState, questId);
}

function validateQuestRewards(
  state: GameState,
  questIds: QuestId[],
): QuestRewardValidationResult {
  const inventoryUsedSlots = state.inventory.slots.length;
  const inventoryCapacity = state.inventory.capacity;
  const slots = state.inventory.slots.map((slot) => ({ ...slot }));
  let requiredNewSlots = 0;

  for (const questId of questIds) {
    const reward = QUEST_DEFINITIONS[questId].rewards;

    if (!reward) {
      continue;
    }

    const rewardValueValidation = validateRewardValues(reward);

    if (rewardValueValidation) {
      return {
        status: "failed_invalid",
        reason: rewardValueValidation,
        questId,
        requiredNewSlots,
        inventoryUsedSlots,
        inventoryCapacity,
      };
    }

    for (const rewardItem of getRewardInventoryItems(reward)) {
      const result = simulateRewardItemAdd(slots, inventoryCapacity, rewardItem);
      requiredNewSlots += result.createdSlots;

      if (result.status !== "success") {
        return {
          status: result.status,
          reason: result.reason,
          questId,
          itemId: rewardItem.itemId,
          requiredNewSlots,
          inventoryUsedSlots,
          inventoryCapacity,
        };
      }
    }
  }

  return {
    status: "success",
    requiredNewSlots,
    inventoryUsedSlots,
    inventoryCapacity,
  };
}

function appendQuestRewardValidationStarted(
  state: GameState,
  questId: QuestId,
  questGiverPoiId: string,
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: "quest_reward_validation_started",
    entityId: questGiverPoiId,
    questId,
    inventoryUsedSlots: state.inventory.slots.length,
    inventoryCapacity: state.inventory.capacity,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
  });
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
  const baseXpAmount = Math.floor(amount);
  const xpModifier = getDebugXpMultiplier(state);
  const xpAmount = Math.floor(baseXpAmount * xpModifier);

  for (const companion of getPartyMembers(nextState)) {
    if (companion.characterLevel >= MAX_CHARACTER_LEVEL) {
      nextState = appendDebugTelemetryEvent(nextState, {
        type: "character_xp_skipped",
        entityId: companion.id,
        questId,
        xpAmount: 0,
        baseXpAmount,
        modifiedXpAmount: 0,
        xpModifier,
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
      baseXpAmount,
      modifiedXpAmount: xpAmount,
      xpModifier,
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

function matchesOptionalSubzone(
  objective: QuestObjectiveDefinition,
  subzoneId: string | undefined,
): boolean {
  return !objective.targetSubzoneId || objective.targetSubzoneId === subzoneId;
}

function matchesOptionalEnemyArchetype(
  objective: QuestObjectiveDefinition,
  archetypeId: Enemy["archetypeId"],
): boolean {
  return !objective.enemyArchetypeId || objective.enemyArchetypeId === archetypeId;
}

function matchesOptionalEnemyVariant(
  objective: QuestObjectiveDefinition,
  enemy: Enemy,
): boolean {
  return !objective.enemyVariant || objective.enemyVariant === enemy.variant;
}

function isItemEquippedByAnyCompanion(
  state: GameState,
  itemId: ItemId,
  targetSlot: EquipmentSlot | undefined,
): boolean {
  return Object.values(state.entities).some((entity) => {
    if (entity.kind !== "companion") {
      return false;
    }

    return targetSlot
      ? entity.equipment[targetSlot] === itemId
      : Object.values(entity.equipment).includes(itemId);
  });
}

function isFlaskEquippedByAnyCompanion(state: GameState, itemId: ItemId): boolean {
  return Object.values(state.entities).some((entity) => {
    if (entity.kind !== "companion") {
      return false;
    }

    return entity.consumables.flask?.itemId === itemId;
  });
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

function recordEnemyQuestDropObjectives(
  state: GameState,
  defeatedEnemy: Enemy,
  mapId: DebugMapId,
  random: () => number,
  now: number,
): GameState {
  let nextState = state;

  for (const questId of QUEST_ORDER) {
    const quest = nextState.quests[questId];

    if (quest?.status !== "active") {
      continue;
    }

    for (const objective of QUEST_DEFINITIONS[questId].objectives) {
      if (
        objective.type !== "collect_enemy_quest_drop_count" ||
        objective.enemyMapId !== mapId ||
        !matchesOptionalSubzone(objective, defeatedEnemy.subzoneId) ||
        !matchesOptionalEnemyArchetype(objective, defeatedEnemy.archetypeId) ||
        !matchesOptionalEnemyVariant(objective, defeatedEnemy)
      ) {
        continue;
      }

      const progress = quest.objectiveProgress[objective.id];

      if (!progress || progress.completed) {
        continue;
      }

      const missCounts = quest.runtime?.questDropMissCountsByObjectiveId ?? {};
      const missCount = missCounts[objective.id] ?? 0;
      const pityKillCount = Math.max(1, objective.pityKillCount ?? 1);
      const didDrop =
        random() <= (objective.dropChance ?? 1) || missCount + 1 >= pityKillCount;
      const nextMissCount = didDrop ? 0 : missCount + 1;

      nextState = {
        ...nextState,
        quests: {
          ...nextState.quests,
          [questId]: {
            ...nextState.quests[questId],
            runtime: {
              ...nextState.quests[questId].runtime,
              questDropMissCountsByObjectiveId: {
                ...nextState.quests[questId].runtime
                  ?.questDropMissCountsByObjectiveId,
                [objective.id]: nextMissCount,
              },
            },
          },
        },
      };

      if (didDrop) {
        nextState = queueQuestDropVisualEvent(
          nextState,
          defeatedEnemy,
          questId,
          objective,
          now,
        );
        nextState = updateObjectiveProgress(nextState, questId, objective, 1);
      }
    }
  }

  return nextState;
}

function queueQuestDropVisualEvent(
  state: GameState,
  defeatedEnemy: Enemy,
  questId: QuestId,
  objective: QuestObjectiveDefinition,
  now: number,
): GameState {
  const definition = QUEST_DEFINITIONS[questId];
  const displayName = getQuestDropItemDisplayName(definition, objective);
  const event = {
    id: `${now}-quest-drop-${defeatedEnemy.id}-${questId}-${objective.id}-${state.dropVisualEvents?.length ?? 0}`,
    kind: "quest_item" as const,
    enemyId: defeatedEnemy.id,
    enemyTypeId: defeatedEnemy.enemyTypeId,
    enemyArchetypeId: defeatedEnemy.archetypeId,
    enemyVariant: defeatedEnemy.variant,
    displayName,
    iconRole: "quest_giver" as const,
    questId,
    objectiveId: objective.id,
    quantity: 1,
    position: defeatedEnemy.position,
    createdAt: now,
    expiresAt: now + DROP_VISUAL_DURATION_MS,
    currentMapId: state.currentMapId,
    dropChance: objective.dropChance,
  };

  return appendDebugTelemetryEvent(
    {
      ...state,
      dropVisualEvents: [...(state.dropVisualEvents ?? []), event],
    },
    {
      type: "quest_drop_visual_started",
      entityId: defeatedEnemy.id,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
      enemyTypeId: defeatedEnemy.enemyTypeId,
      enemyArchetypeId: defeatedEnemy.archetypeId,
      enemyVariant: defeatedEnemy.variant,
      enemyPosition: defeatedEnemy.position,
      itemDisplayName: displayName,
      itemCategory: "quest",
      requestedQuantity: 1,
      dropChance: objective.dropChance,
      questId,
      objectiveId: objective.id,
    },
  );
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

    if (objective.routeTeleportId) {
      nextState = setTeleportWorking(nextState, objective.routeTeleportId, true);
    }
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

function getQuestGiverQuestsByStatuses(
  state: GameState,
  questGiverPoiId: string,
  statuses: QuestState["status"][],
): QuestState[] {
  return QUEST_ORDER
    .map((questId) => state.quests[questId])
    .filter((quest): quest is QuestState => {
      return (
        Boolean(quest) &&
        QUEST_DEFINITIONS[quest.questId].questGiverPoiId === questGiverPoiId &&
        statuses.includes(quest.status)
      );
    });
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
