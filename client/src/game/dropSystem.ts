import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getLootTierForLevel, rollEnemyDropTable } from "./dropTables";
import { getEnemyDropArchetypeId } from "./enemyArchetypes";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinition } from "./items";
import {
  addCombatFeedback,
  type GameState,
} from "./state";
import type {
  DebugTelemetryEvent,
  DropVisualEvent,
  Enemy,
  InventoryAddResult,
} from "./types";

export const DROP_VISUAL_DURATION_MS = 900;

export function handleEnemyDefeatedDrops(
  state: GameState,
  enemy: Enemy,
  defeatedByEntityId: string,
  now = Date.now(),
  random = Math.random,
): GameState {
  const enemyArchetypeId = getEnemyDropArchetypeId(enemy);

  if (!enemyArchetypeId) {
    return appendDropTelemetry(state, enemy, {
      type: "enemy_drop_none",
      entityId: enemy.id,
      reason: "missing_enemy_archetype",
      targetId: defeatedByEntityId,
    });
  }

  const lootTier = getLootTierForLevel(enemy.level);
  let nextState = appendDropTelemetry(state, enemy, {
    type: "enemy_drop_roll_started",
    entityId: enemy.id,
    targetId: defeatedByEntityId,
    enemyTypeId: enemy.enemyTypeId,
    enemyArchetypeId,
  });
  const rolls = rollEnemyDropTable(
    enemyArchetypeId,
    lootTier,
    random,
    enemy.enemyTypeId,
  );
  const droppedRolls = rolls.filter((roll) => roll.didDrop && roll.entry);

  for (const roll of rolls) {
    nextState = appendDropTelemetry(nextState, enemy, {
      type: roll.didDrop ? "enemy_drop_rolled" : "enemy_drop_none",
      entityId: enemy.id,
      targetId: defeatedByEntityId,
      enemyTypeId: enemy.enemyTypeId,
      enemyArchetypeId,
      itemId: roll.entry?.itemId,
      tableId: roll.tableId,
      dropChance: roll.chance,
      requestedQuantity: roll.entry?.quantity,
      reason: roll.didDrop ? undefined : roll.groupId,
    });
  }

  for (const roll of droppedRolls) {
    if (!roll.entry) {
      continue;
    }

    const event = createDropVisualEvent(
      nextState,
      enemy,
      enemyArchetypeId,
      roll.entry.itemId,
      roll.entry.quantity,
      roll.tableId,
      roll.chance,
      now,
    );
    nextState = {
      ...nextState,
      dropVisualEvents: [...(nextState.dropVisualEvents ?? []), event],
    };
    nextState = appendDropTelemetry(nextState, enemy, {
      type: "enemy_drop_visual_started",
      entityId: enemy.id,
      enemyTypeId: enemy.enemyTypeId,
      enemyArchetypeId,
      itemId: event.itemId,
      tableId: event.tableId,
      dropChance: event.dropChance,
      requestedQuantity: event.quantity,
    });
  }

  return nextState;
}

export function updateDropSystem(
  state: GameState,
  now = Date.now(),
): GameState {
  const dropVisualEvents = state.dropVisualEvents ?? [];
  const activeEvents: DropVisualEvent[] = [];
  let nextState = state;

  for (const event of dropVisualEvents) {
    if (event.expiresAt > now) {
      activeEvents.push(event);
      continue;
    }

    nextState = completeDropVisualEvent(nextState, event, now);
  }

  return {
    ...nextState,
    dropVisualEvents: activeEvents,
  };
}

function completeDropVisualEvent(
  state: GameState,
  event: DropVisualEvent,
  now: number,
): GameState {
  const enemy = state.entities[event.enemyId];
  const itemDefinition = event.itemId ? getItemDefinition(event.itemId) : null;
  const displayName = event.displayName ?? itemDefinition?.displayName ?? "Quest Item";
  const isQuestItemDrop = event.kind === "quest_item";
  let nextState = appendDropVisualTelemetry(state, event, {
    type: isQuestItemDrop
      ? "quest_drop_visual_completed"
      : "enemy_drop_visual_completed",
    entityId: event.enemyId,
  });

  if (event.currentMapId && state.currentMapId !== event.currentMapId) {
    return appendDropVisualTelemetry(nextState, event, {
      type: "enemy_drop_inventory_failed",
      entityId: event.enemyId,
      reason: "map_changed",
    });
  }

  if (isQuestItemDrop) {
    return addCombatFeedback(nextState, {
      type: "gather",
      entityId: enemy?.id ?? event.enemyId,
      text: displayName,
      now,
    });
  }

  if (!event.itemId || !itemDefinition) {
    return nextState;
  }

  nextState = appendDropVisualTelemetry(nextState, event, {
    type: "enemy_drop_inventory_add_attempt",
    entityId: event.enemyId,
    requestedQuantity: event.quantity,
  });

  const itemAdd = addItemToInventoryState(
    nextState,
    event.itemId,
    event.quantity,
    "combat_loot",
  );
  nextState = itemAdd.state;
  nextState = appendInventoryResultTelemetry(nextState, event, itemAdd.result);
  nextState = addCombatFeedback(nextState, {
    type: "gather",
    entityId: enemy?.id ?? event.enemyId,
    text:
      itemAdd.result.addedQuantity > 0
        ? itemDefinition.displayName
        : "Inventory Full",
    now,
  });

  return nextState;
}

function createDropVisualEvent(
  state: GameState,
  enemy: Enemy,
  enemyArchetypeId: DropVisualEvent["enemyArchetypeId"],
  itemId: DropVisualEvent["itemId"],
  quantity: number,
  tableId: string,
  dropChance: number,
  now: number,
): DropVisualEvent {
  return {
    id: `${now}-drop-${enemy.id}-${itemId}-${state.dropVisualEvents?.length ?? 0}`,
    enemyId: enemy.id,
    enemyTypeId: enemy.enemyTypeId,
    enemyArchetypeId,
    itemId,
    quantity,
    position: enemy.position,
    createdAt: now,
    expiresAt: now + DROP_VISUAL_DURATION_MS,
    currentMapId: state.currentMapId,
    tableId,
    dropChance,
  };
}

function appendInventoryResultTelemetry(
  state: GameState,
  event: DropVisualEvent,
  result: InventoryAddResult,
): GameState {
  const type =
    result.status === "success"
      ? "enemy_drop_inventory_added"
      : result.status === "partial"
        ? "enemy_drop_inventory_partial"
        : "enemy_drop_inventory_failed";
  let nextState = appendDropVisualTelemetry(state, event, {
    type,
    entityId: event.enemyId,
    result: result.status,
    requestedQuantity: result.requestedQuantity,
    addedQuantity: result.addedQuantity,
    overflowQuantity: result.overflowQuantity,
  });

  if (result.overflowQuantity > 0) {
    nextState = appendDropVisualTelemetry(nextState, event, {
      type: "enemy_drop_overflow",
      entityId: event.enemyId,
      result: result.status,
      overflowQuantity: result.overflowQuantity,
    });
  }

  return nextState;
}

function appendDropVisualTelemetry(
  state: GameState,
  event: DropVisualEvent,
  telemetry: Omit<DebugTelemetryEvent, "tick">,
): GameState {
  const itemDefinition = event.itemId ? getItemDefinition(event.itemId) : null;

  return appendDebugTelemetryEvent(state, {
    ...telemetry,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
    enemyTypeId: event.enemyTypeId,
    enemyArchetypeId: event.enemyArchetypeId,
    enemyPosition: event.position,
    itemId: event.itemId,
    itemDisplayName: event.displayName ?? itemDefinition?.displayName,
    itemCategory: itemDefinition?.category ?? (event.kind === "quest_item" ? "quest" : undefined),
    targetSlot: itemDefinition?.equipmentSlot,
    equipmentType: itemDefinition?.equipmentType,
    tableId: event.tableId,
    dropChance: event.dropChance,
    requestedQuantity: telemetry.requestedQuantity ?? event.quantity,
    questId: event.questId,
    objectiveId: event.objectiveId,
  });
}

function appendDropTelemetry(
  state: GameState,
  enemy: Enemy,
  telemetry: Omit<DebugTelemetryEvent, "tick">,
): GameState {
  const itemDefinition = telemetry.itemId
    ? getItemDefinition(telemetry.itemId)
    : null;

  return appendDebugTelemetryEvent(state, {
    ...telemetry,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
    enemyTypeId: telemetry.enemyTypeId ?? enemy.enemyTypeId,
    enemyArchetypeId:
      telemetry.enemyArchetypeId ?? getEnemyDropArchetypeId(enemy),
    enemyPosition: enemy.position,
    itemDisplayName: itemDefinition?.displayName,
    itemCategory: itemDefinition?.category,
    targetSlot: itemDefinition?.equipmentSlot,
    equipmentType: itemDefinition?.equipmentType,
  });
}
