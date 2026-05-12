import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { rollEnemyDropTable } from "./dropTables";
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
  EnemyType,
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
  if (!enemy.enemyType) {
    return appendDropTelemetry(state, enemy, {
      type: "enemy_drop_none",
      entityId: enemy.id,
      reason: "missing_enemy_type",
      targetId: defeatedByEntityId,
    });
  }

  let nextState = appendDropTelemetry(state, enemy, {
    type: "enemy_drop_roll_started",
    entityId: enemy.id,
    targetId: defeatedByEntityId,
    enemyType: enemy.enemyType,
  });
  const rolls = rollEnemyDropTable(enemy.enemyType, random);
  const droppedRolls = rolls.filter((roll) => roll.didDrop && roll.entry);

  for (const roll of rolls) {
    nextState = appendDropTelemetry(nextState, enemy, {
      type: roll.didDrop ? "enemy_drop_rolled" : "enemy_drop_none",
      entityId: enemy.id,
      targetId: defeatedByEntityId,
      enemyType: enemy.enemyType,
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
      enemy.enemyType,
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
      enemyType: enemy.enemyType,
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
  const itemDefinition = getItemDefinition(event.itemId);
  let nextState = appendDropVisualTelemetry(state, event, {
    type: "enemy_drop_visual_completed",
    entityId: event.enemyId,
  });

  if (event.currentMapId && state.currentMapId !== event.currentMapId) {
    return appendDropVisualTelemetry(nextState, event, {
      type: "enemy_drop_inventory_failed",
      entityId: event.enemyId,
      reason: "map_changed",
    });
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
  enemyType: EnemyType,
  itemId: DropVisualEvent["itemId"],
  quantity: number,
  tableId: string,
  dropChance: number,
  now: number,
): DropVisualEvent {
  return {
    id: `${now}-drop-${enemy.id}-${itemId}-${state.dropVisualEvents?.length ?? 0}`,
    enemyId: enemy.id,
    enemyType,
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
  const itemDefinition = getItemDefinition(event.itemId);

  return appendDebugTelemetryEvent(state, {
    ...telemetry,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
    enemyType: event.enemyType,
    enemyPosition: event.position,
    itemId: event.itemId,
    itemDisplayName: itemDefinition.displayName,
    itemCategory: itemDefinition.category,
    targetSlot: itemDefinition.equipmentSlot,
    equipmentType: itemDefinition.equipmentType,
    tableId: event.tableId,
    dropChance: event.dropChance,
    requestedQuantity: telemetry.requestedQuantity ?? event.quantity,
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
    enemyType: telemetry.enemyType ?? enemy.enemyType,
    enemyPosition: enemy.position,
    itemDisplayName: itemDefinition?.displayName,
    itemCategory: itemDefinition?.category,
    targetSlot: itemDefinition?.equipmentSlot,
    equipmentType: itemDefinition?.equipmentType,
  });
}
