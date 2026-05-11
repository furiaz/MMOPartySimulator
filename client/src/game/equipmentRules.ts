import { getItemDefinition } from "./items";
import { getAvailableInventorySlots, countInventoryItem } from "./inventory";
import type { GameState } from "./state";
import type {
  ClassId,
  Companion,
  EquipmentSlot,
  EquipmentStatModifiers,
  EquipmentType,
  ItemDefinition,
  ItemId,
} from "./types";
import {
  addEquipmentStatModifiers,
  CLASS_EQUIPMENT_PROFILES,
} from "./equipmentTypes";

export type EquipmentFailureReason =
  | "companion_not_found"
  | "item_not_found"
  | "item_not_in_inventory"
  | "item_not_equipment"
  | "invalid_slot"
  | "invalid_class"
  | "level_requirement_not_met"
  | "offhand_blocked_by_both_hands"
  | "inventory_full"
  | "slot_empty";

export type EquipmentValidationResult =
  | {
      ok: true;
      companion: Companion;
      itemDefinition: ItemDefinition;
      targetSlot: EquipmentSlot;
      itemsToReturn: ItemId[];
    }
  | {
      ok: false;
      reason: EquipmentFailureReason;
      companion?: Companion;
      itemDefinition?: ItemDefinition;
      targetSlot: EquipmentSlot;
    };

export function validateEquipItem(
  state: GameState,
  companionId: string,
  itemId: ItemId,
  targetSlot: EquipmentSlot,
): EquipmentValidationResult {
  const companion = state.entities[companionId];
  const itemDefinition = getItemDefinition(itemId);

  if (companion?.kind !== "companion") {
    return { ok: false, reason: "companion_not_found", targetSlot };
  }

  if (!itemDefinition) {
    return { ok: false, reason: "item_not_found", companion, targetSlot };
  }

  if (countInventoryItem(state.inventory, itemId) <= 0) {
    return {
      ok: false,
      reason: "item_not_in_inventory",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  const basicValidation = validateEquipmentItemForCompanion(
    companion,
    itemDefinition,
    targetSlot,
  );

  if (!basicValidation.ok) {
    return basicValidation;
  }

  const itemsToReturn = getItemsReturnedByEquip(
    companion,
    itemDefinition,
    targetSlot,
  );
  const availableSlotsAfterRemovingEquipItem =
    getAvailableInventorySlots(state.inventory) + 1;

  if (itemsToReturn.length > availableSlotsAfterRemovingEquipItem) {
    return {
      ok: false,
      reason: "inventory_full",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  return {
    ok: true,
    companion,
    itemDefinition,
    targetSlot,
    itemsToReturn,
  };
}

export function validateEquipmentItemForCompanion(
  companion: Companion,
  itemDefinition: ItemDefinition,
  targetSlot: EquipmentSlot,
): EquipmentValidationResult {
  if (itemDefinition.category !== "equipment") {
    return {
      ok: false,
      reason: "item_not_equipment",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  if (!isEquipmentSlotCompatible(itemDefinition, targetSlot)) {
    return {
      ok: false,
      reason: "invalid_slot",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  if (targetSlot === "offhand" && isMainHandOccupyingBothHands(companion)) {
    return {
      ok: false,
      reason: "offhand_blocked_by_both_hands",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  if (!isClassAllowedForEquipment(companion.classId, itemDefinition)) {
    return {
      ok: false,
      reason: "invalid_class",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  if (
    itemDefinition.levelRequirement &&
    companion.characterLevel < itemDefinition.levelRequirement
  ) {
    return {
      ok: false,
      reason: "level_requirement_not_met",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  return {
    ok: true,
    companion,
    itemDefinition,
    targetSlot,
    itemsToReturn: [],
  };
}

export function validateUnequipItem(
  state: GameState,
  companionId: string,
  targetSlot: EquipmentSlot,
): EquipmentValidationResult {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return { ok: false, reason: "companion_not_found", targetSlot };
  }

  const itemId = companion.equipment[targetSlot];

  if (!itemId) {
    return { ok: false, reason: "slot_empty", companion, targetSlot };
  }

  const itemDefinition = getItemDefinition(itemId);

  if (!itemDefinition) {
    return { ok: false, reason: "item_not_found", companion, targetSlot };
  }

  if (getAvailableInventorySlots(state.inventory) < 1) {
    return {
      ok: false,
      reason: "inventory_full",
      companion,
      itemDefinition,
      targetSlot,
    };
  }

  return {
    ok: true,
    companion,
    itemDefinition,
    targetSlot,
    itemsToReturn: [itemId],
  };
}

export function isEquipmentSlotCompatible(
  itemDefinition: ItemDefinition,
  targetSlot: EquipmentSlot,
): boolean {
  if (
    itemDefinition.equipmentKind === "accessory" &&
    (targetSlot === "accessory1" || targetSlot === "accessory2")
  ) {
    return true;
  }

  return itemDefinition.equipmentSlot === targetSlot;
}

export function isClassAllowedForEquipment(
  classId: ClassId,
  itemDefinition: ItemDefinition,
): boolean {
  if (
    itemDefinition.equipmentKind === "armor" ||
    itemDefinition.equipmentKind === "accessory"
  ) {
    return true;
  }

  if (itemDefinition.allowedClassIds) {
    return itemDefinition.allowedClassIds.includes(classId);
  }

  const profile = CLASS_EQUIPMENT_PROFILES[classId];

  if (
    itemDefinition.equipmentSlot === "mainHand" &&
    itemDefinition.equipmentType
  ) {
    return profile.mainHand.includes(itemDefinition.equipmentType as never);
  }

  if (
    itemDefinition.equipmentSlot === "offhand" &&
    itemDefinition.equipmentType
  ) {
    return profile.offhand.includes(itemDefinition.equipmentType as never);
  }

  return false;
}

export function getItemsReturnedByEquip(
  companion: Companion,
  itemDefinition: ItemDefinition,
  targetSlot: EquipmentSlot,
): ItemId[] {
  const itemIds = new Set<ItemId>();
  const currentItemId = companion.equipment[targetSlot];

  if (currentItemId) {
    itemIds.add(currentItemId);
  }

  if (itemDefinition.occupiesBothHands && companion.equipment.offhand) {
    itemIds.add(companion.equipment.offhand);
  }

  return [...itemIds];
}

export function isMainHandOccupyingBothHands(companion: Companion): boolean {
  const mainHandItemId = companion.equipment.mainHand;

  if (!mainHandItemId) {
    return false;
  }

  return Boolean(getItemDefinition(mainHandItemId).occupiesBothHands);
}

export function getCompanionEquipmentStatModifiers(
  companion: Companion,
): EquipmentStatModifiers {
  return Object.values(companion.equipment).reduce<EquipmentStatModifiers>(
    (statModifiers, itemId) => {
      if (!itemId) {
        return statModifiers;
      }

      return addEquipmentStatModifiers(
        statModifiers,
        getItemDefinition(itemId).statModifiers ?? {},
      );
    },
    {},
  );
}

export function getAllowedEquipmentTypeLabels(classId: ClassId): {
  mainHand: EquipmentType[];
  offhand: EquipmentType[];
} {
  const profile = CLASS_EQUIPMENT_PROFILES[classId];

  return {
    mainHand: [...profile.mainHand],
    offhand: [...profile.offhand],
  };
}
