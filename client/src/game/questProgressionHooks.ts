import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  MAP_TWO_ID,
  createDebugMapForQuestState,
} from "./debugMap";
import { DROP_VISUAL_DURATION_MS } from "./dropSystem";
import { getItemDefinition } from "./items";
import {
  QUEST_DEFINITIONS,
  QUEST_ORDER,
  getQuestDropItemDisplayName,
} from "./questSystem";
import type { GameState } from "./state";
import { getSubzoneAtPosition } from "./subzoneSystem";
import { setTeleportWorking } from "./teleportState";
import type {
  DebugMapId,
  Enemy,
  EquipmentSlot,
  ItemId,
  Position,
  ResourceEntity,
  ResourceType,
} from "./types";
import type { QuestId, QuestObjectiveDefinition } from "./questTypes";

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
      matchesOptionalEnemyType(objective, defeatedEnemy.enemyTypeId) &&
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

export function recordDungeonChestCollectedForQuests(
  state: GameState,
  chestId: string,
  mapId: DebugMapId | undefined,
): GameState {
  if (!mapId) {
    return state;
  }

  return updateMatchingQuestObjectives(
    state,
    (objective) =>
      objective.type === "collect_dungeon_chest" &&
      objective.targetMapId === mapId &&
      objective.targetPoiId === chestId,
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

function matchesOptionalEnemyType(
  objective: QuestObjectiveDefinition,
  enemyTypeId: Enemy["enemyTypeId"],
): boolean {
  return !objective.enemyTypeId || objective.enemyTypeId === enemyTypeId;
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

    nextState = refreshCurrentMapForQuestObjectiveCompletion(
      nextState,
      questId,
      objective.id,
    );
  }

  return maybeMarkQuestReadyToTurnIn(nextState, questId);
}

function refreshCurrentMapForQuestObjectiveCompletion(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
): GameState {
  if (
    questId !== "rescue_the_grove_runner" ||
    objectiveId !== "repair_old_grove_cache" ||
    state.currentMapId !== MAP_TWO_ID ||
    !state.map
  ) {
    return state;
  }

  return {
    ...state,
    map: createDebugMapForQuestState(MAP_TWO_ID, state.quests),
  };
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
