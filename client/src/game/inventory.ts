import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getItemDefinition } from "./items";
import type { GameState } from "./state";
import type {
  InventoryAddResult,
  InventoryMutationSource,
  InventoryRemoveResult,
  InventorySlot,
  ItemDefinition,
  ItemId,
  PartyInventory,
} from "./types";

export const STARTING_INVENTORY_CAPACITY = 50;
const INVENTORY_TELEMETRY_ENTITY_ID = "__inventory__";

export function createEmptyPartyInventory(
  capacity = STARTING_INVENTORY_CAPACITY,
): PartyInventory {
  return {
    capacity,
    slots: [],
  };
}

export function canStackItems(
  slot: InventorySlot,
  itemDefinition: ItemDefinition,
): boolean {
  return (
    itemDefinition.stackable &&
    slot.itemId === itemDefinition.id &&
    slot.quantity < itemDefinition.maxStack
  );
}

export function getUsedInventorySlots(inventory: PartyInventory): number {
  return inventory.slots.length;
}

export function getAvailableInventorySlots(inventory: PartyInventory): number {
  return Math.max(0, inventory.capacity - getUsedInventorySlots(inventory));
}

export function countInventoryItem(
  inventory: PartyInventory,
  itemId: ItemId,
): number {
  return inventory.slots
    .filter((slot) => slot.itemId === itemId)
    .reduce((total, slot) => total + slot.quantity, 0);
}

export function addItemToInventoryState(
  state: GameState,
  itemId: ItemId,
  quantity: number,
  source: InventoryMutationSource = "unknown",
): { state: GameState; result: InventoryAddResult } {
  const itemDefinition = getItemDefinition(itemId);
  const requestedQuantity = Math.floor(quantity);
  let nextState = appendInventoryTelemetry(state, itemDefinition, source, {
    type: "item_add_attempt",
    requestedQuantity,
  });
  nextState = appendCapacityTelemetry(nextState, itemDefinition, source);

  if (requestedQuantity <= 0) {
    return {
      state: nextState,
      result: {
        status: "failed_invalid",
        itemId,
        requestedQuantity,
        addedQuantity: 0,
        overflowQuantity: Math.max(0, requestedQuantity),
      },
    };
  }

  const slots = [...nextState.inventory.slots];
  let remainingQuantity = requestedQuantity;
  let addedQuantity = 0;

  if (itemDefinition.stackable) {
    for (let slotIndex = 0; slotIndex < slots.length && remainingQuantity > 0; slotIndex += 1) {
      const slot = slots[slotIndex];

      if (!canStackItems(slot, itemDefinition)) {
        continue;
      }

      const beforeQuantity = slot.quantity;
      const addedToStack = Math.min(
        itemDefinition.maxStack - slot.quantity,
        remainingQuantity,
      );
      slots[slotIndex] = {
        ...slot,
        quantity: slot.quantity + addedToStack,
      };
      remainingQuantity -= addedToStack;
      addedQuantity += addedToStack;
      nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
        type: "inventory_stack_updated",
        addedQuantity: addedToStack,
        slotIndex,
        stackQuantityBefore: beforeQuantity,
        stackQuantityAfter: slots[slotIndex].quantity,
      });
    }
  }

  while (
    remainingQuantity > 0 &&
    slots.length < nextState.inventory.capacity
  ) {
    const addedToStack = itemDefinition.stackable
      ? Math.min(itemDefinition.maxStack, remainingQuantity)
      : 1;
    const slotIndex = slots.length;
    slots.push({
      itemId,
      quantity: addedToStack,
    });
    remainingQuantity -= addedToStack;
    addedQuantity += addedToStack;
    nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
      type: "inventory_stack_created",
      addedQuantity: addedToStack,
      slotIndex,
      stackQuantityBefore: 0,
      stackQuantityAfter: addedToStack,
    });
  }

  const inventory = {
    ...nextState.inventory,
    slots,
  };
  nextState = {
    ...nextState,
    inventory,
  };

  const result: InventoryAddResult = {
    status:
      addedQuantity === requestedQuantity
        ? "success"
        : addedQuantity > 0
          ? "partial"
          : "failed_full",
    itemId,
    requestedQuantity,
    addedQuantity,
    overflowQuantity: remainingQuantity,
  };
  nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
    type:
      result.status === "success"
        ? "item_added"
        : result.status === "partial"
          ? "item_add_partial"
          : "item_add_failed_full",
    requestedQuantity,
    addedQuantity,
    overflowQuantity: remainingQuantity,
  });

  return { state: nextState, result };
}

export function removeItemFromInventoryState(
  state: GameState,
  itemId: ItemId,
  quantity: number,
  source: InventoryMutationSource = "unknown",
): { state: GameState; result: InventoryRemoveResult } {
  const itemDefinition = getItemDefinition(itemId);
  const requestedQuantity = Math.floor(quantity);

  if (requestedQuantity <= 0) {
    return {
      state,
      result: {
        status: "failed_invalid",
        itemId,
        requestedQuantity,
        removedQuantity: 0,
        remainingQuantity: Math.max(0, requestedQuantity),
      },
    };
  }

  const slots = [...state.inventory.slots];
  let nextState = state;
  let remainingQuantity = requestedQuantity;
  let removedQuantity = 0;

  for (let slotIndex = 0; slotIndex < slots.length && remainingQuantity > 0; slotIndex += 1) {
    const slot = slots[slotIndex];

    if (slot.itemId !== itemId) {
      continue;
    }

    const beforeQuantity = slot.quantity;
    const removedFromStack = Math.min(slot.quantity, remainingQuantity);
    const afterQuantity = slot.quantity - removedFromStack;
    slots[slotIndex] = {
      ...slot,
      quantity: afterQuantity,
    };
    remainingQuantity -= removedFromStack;
    removedQuantity += removedFromStack;
    nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
      type: "inventory_stack_updated",
      removedQuantity: removedFromStack,
      slotIndex,
      stackQuantityBefore: beforeQuantity,
      stackQuantityAfter: afterQuantity,
    });
  }

  const inventory = {
    ...nextState.inventory,
    slots: slots.filter((slot) => slot.quantity > 0),
  };
  nextState = {
    ...nextState,
    inventory,
  };

  if (removedQuantity > 0) {
    nextState = appendInventoryTelemetry(nextState, itemDefinition, source, {
      type: "item_removed",
      requestedQuantity,
      removedQuantity,
    });
  }

  return {
    state: nextState,
    result: {
      status:
        removedQuantity === requestedQuantity
          ? "success"
          : removedQuantity > 0
            ? "partial"
            : "failed_invalid",
      itemId,
      requestedQuantity,
      removedQuantity,
      remainingQuantity,
    },
  };
}

function appendCapacityTelemetry(
  state: GameState,
  itemDefinition: ItemDefinition,
  source: InventoryMutationSource,
): GameState {
  return appendInventoryTelemetry(state, itemDefinition, source, {
    type: "inventory_capacity_checked",
  });
}

function appendInventoryTelemetry(
  state: GameState,
  itemDefinition: ItemDefinition,
  source: InventoryMutationSource,
  event: {
    type:
      | "item_add_attempt"
      | "item_added"
      | "item_add_partial"
      | "item_add_failed_full"
      | "item_removed"
      | "inventory_stack_created"
      | "inventory_stack_updated"
      | "inventory_capacity_checked";
    requestedQuantity?: number;
    addedQuantity?: number;
    removedQuantity?: number;
    overflowQuantity?: number;
    slotIndex?: number;
    stackQuantityBefore?: number;
    stackQuantityAfter?: number;
  },
): GameState {
  return appendDebugTelemetryEvent(state, {
    ...event,
    entityId: INVENTORY_TELEMETRY_ENTITY_ID,
    itemId: itemDefinition.id,
    itemCategory: itemDefinition.category,
    inventoryUsedSlots: getUsedInventorySlots(state.inventory),
    inventoryCapacity: state.inventory.capacity,
    source,
  });
}
