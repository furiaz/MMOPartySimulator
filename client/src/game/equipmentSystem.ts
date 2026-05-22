import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  addItemToInventoryState,
  removeItemFromInventoryState,
} from "./inventory";
import { recordEquippedItemObjectivesForQuests } from "./questSystem";
import { updateEntity } from "./state";
import type { GameState } from "./state";
import type {
  Companion,
  DebugTelemetryEventType,
  EquipmentSlot,
  ItemDefinition,
  ItemId,
} from "./types";
import {
  type EquipmentFailureReason,
  validateEquipItem,
  validateUnequipItem,
} from "./equipmentRules";
import { syncCompanionDerivedMaxHealth } from "./stats";

export type EquipmentMutationStatus = "success" | "failed";

export type EquipmentMutationResult = {
  status: EquipmentMutationStatus;
  companionId: string;
  itemId?: ItemId;
  targetSlot: EquipmentSlot;
  previousItemId?: ItemId | null;
  reason?: EquipmentFailureReason;
};

export function equipItemToCompanion(
  state: GameState,
  companionId: string,
  itemId: ItemId,
  targetSlot: EquipmentSlot,
): { state: GameState; result: EquipmentMutationResult } {
  let nextState = appendEquipmentTelemetry(state, {
    type: "equipment_equip_attempt",
    companionId,
    itemId,
    targetSlot,
    result: "attempt",
  });
  const validation = validateEquipItem(nextState, companionId, itemId, targetSlot);

  if (!validation.ok) {
    nextState = appendEquipmentFailureTelemetry(
      nextState,
      "equipment_equip_failed",
      companionId,
      targetSlot,
      validation.reason,
      validation.itemDefinition,
      itemId,
      validation.companion,
    );

    return {
      state: nextState,
      result: {
        status: "failed",
        companionId,
        itemId,
        targetSlot,
        reason: validation.reason,
      },
    };
  }

  const previousItemId = validation.companion.equipment[targetSlot];
  const removedState = removeItemFromInventoryState(
    nextState,
    itemId,
    1,
    "equipment",
  ).state;
  let inventoryState = removedState;

  for (const returnedItemId of validation.itemsToReturn) {
    const addResult = addItemToInventoryState(
      inventoryState,
      returnedItemId,
      1,
      "equipment",
    );

    if (addResult.result.status !== "success") {
      nextState = appendEquipmentFailureTelemetry(
        nextState,
        "equipment_inventory_return_failed",
        companionId,
        targetSlot,
        "inventory_full",
        validation.itemDefinition,
        itemId,
        validation.companion,
      );

      return {
        state: nextState,
        result: {
          status: "failed",
          companionId,
          itemId,
          targetSlot,
          previousItemId,
          reason: "inventory_full",
        },
      };
    }

    inventoryState = addResult.state;
  }

  const equippedCompanion = equipItem(
    validation.companion,
    itemId,
    targetSlot,
    validation.itemDefinition.occupiesBothHands === true,
  );
  nextState = updateEntity(inventoryState, syncCompanionDerivedMaxHealth(equippedCompanion));
  nextState = appendEquipmentTelemetry(nextState, {
    type: "equipment_equipped",
    companionId,
    itemId,
    itemDefinition: validation.itemDefinition,
    targetSlot,
    previousItemId,
    result: "success",
  });
  nextState = recordEquippedItemObjectivesForQuests(
    nextState,
    "equipment_equipped",
  );

  return {
    state: nextState,
    result: {
      status: "success",
      companionId,
      itemId,
      targetSlot,
      previousItemId,
    },
  };
}

export function unequipItemFromCompanion(
  state: GameState,
  companionId: string,
  targetSlot: EquipmentSlot,
): { state: GameState; result: EquipmentMutationResult } {
  let nextState = appendEquipmentTelemetry(state, {
    type: "equipment_unequip_attempt",
    companionId,
    targetSlot,
    result: "attempt",
  });
  const validation = validateUnequipItem(nextState, companionId, targetSlot);

  if (!validation.ok) {
    const eventType =
      validation.reason === "inventory_full"
        ? "equipment_inventory_return_failed"
        : "equipment_unequip_failed";
    nextState = appendEquipmentFailureTelemetry(
      nextState,
      eventType,
      companionId,
      targetSlot,
      validation.reason,
      validation.itemDefinition,
      validation.itemDefinition?.id,
      validation.companion,
    );

    return {
      state: nextState,
      result: {
        status: "failed",
        companionId,
        itemId: validation.itemDefinition?.id,
        targetSlot,
        reason: validation.reason,
      },
    };
  }

  const itemId = validation.itemDefinition.id;
  const addResult = addItemToInventoryState(nextState, itemId, 1, "equipment");

  if (addResult.result.status !== "success") {
    nextState = appendEquipmentFailureTelemetry(
      nextState,
      "equipment_inventory_return_failed",
      companionId,
      targetSlot,
      "inventory_full",
      validation.itemDefinition,
      itemId,
      validation.companion,
    );

    return {
      state: nextState,
      result: {
        status: "failed",
        companionId,
        itemId,
        targetSlot,
        reason: "inventory_full",
      },
    };
  }

  const companion = {
    ...validation.companion,
    equipment: {
      ...validation.companion.equipment,
      [targetSlot]: null,
    },
  };
  nextState = updateEntity(addResult.state, syncCompanionDerivedMaxHealth(companion));
  nextState = appendEquipmentTelemetry(nextState, {
    type: "equipment_unequipped",
    companionId,
    itemId,
    itemDefinition: validation.itemDefinition,
    targetSlot,
    previousItemId: itemId,
    result: "success",
  });

  return {
    state: nextState,
    result: {
      status: "success",
      companionId,
      itemId,
      targetSlot,
      previousItemId: itemId,
    },
  };
}

function equipItem(
  companion: Companion,
  itemId: ItemId,
  targetSlot: EquipmentSlot,
  occupiesBothHands: boolean,
): Companion {
  const equipment = {
    ...companion.equipment,
    [targetSlot]: itemId,
  };

  if (targetSlot === "mainHand" && occupiesBothHands) {
    equipment.offhand = null;
  }

  return {
    ...companion,
    equipment,
  };
}

function appendEquipmentFailureTelemetry(
  state: GameState,
  type: DebugTelemetryEventType,
  companionId: string,
  targetSlot: EquipmentSlot,
  reason: EquipmentFailureReason,
  itemDefinition?: ItemDefinition,
  itemId?: ItemId,
  companion?: Companion,
): GameState {
  let nextState = appendEquipmentTelemetry(state, {
    type,
    companionId,
    itemId,
    itemDefinition,
    targetSlot,
    result: "failed",
    reason,
    companion,
  });

  if (reason === "invalid_class") {
    nextState = appendEquipmentTelemetry(nextState, {
      type: "equipment_invalid_class",
      companionId,
      itemId,
      itemDefinition,
      targetSlot,
      result: "failed",
      reason,
      companion,
    });
  }

  if (reason === "invalid_slot") {
    nextState = appendEquipmentTelemetry(nextState, {
      type: "equipment_invalid_slot",
      companionId,
      itemId,
      itemDefinition,
      targetSlot,
      result: "failed",
      reason,
      companion,
    });
  }

  return nextState;
}

function appendEquipmentTelemetry(
  state: GameState,
  event: {
    type: DebugTelemetryEventType;
    companionId: string;
    itemId?: ItemId;
    itemDefinition?: ItemDefinition;
    targetSlot: EquipmentSlot;
    previousItemId?: ItemId | null;
    result: string;
    reason?: string;
    companion?: Companion;
  },
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: event.type,
    entityId: event.companionId,
    companionClassId: event.companion?.classId,
    itemId: event.itemId,
    itemDisplayName: event.itemDefinition?.displayName,
    itemCategory: event.itemDefinition?.category,
    targetSlot: event.targetSlot,
    equipmentType: event.itemDefinition?.equipmentType,
    previousItemId: event.previousItemId,
    result: event.result,
    reason: event.reason,
    inventoryUsedSlots: state.inventory.slots.length,
    inventoryCapacity: state.inventory.capacity,
  });
}
