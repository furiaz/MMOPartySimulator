import { FIRST_CLASS_IDS, type FirstClassId, isFirstClassId } from "./classes";
import { isClassAllowedForEquipment } from "./equipmentRules";
import { getItemDefinition } from "./items";
import { BEGINNER_CLASS_UNLOCK_LEVEL } from "./leveling";
import { setPartyMemberClass, type GameState } from "./state";
import type { ClassId, Companion, ItemId } from "./types";

export type FirstClassSelectionFailureReason =
  | "companion_not_found"
  | "companion_dead"
  | "not_beginner"
  | "level_too_low"
  | "invalid_class"
  | "incompatible_equipment";

export type FirstClassSelectionValidation =
  | {
      ok: true;
      companion: Companion;
      classId: FirstClassId;
    }
  | {
      ok: false;
      reason: FirstClassSelectionFailureReason;
      companion?: Companion;
      incompatibleItemIds?: ItemId[];
    };

export type FirstClassSelectionResult =
  | {
      status: "success";
      companionId: string;
      classId: FirstClassId;
    }
  | {
      status: "failed";
      companionId: string;
      classId: ClassId;
      reason: FirstClassSelectionFailureReason;
      incompatibleItemIds?: ItemId[];
    };

export function validateFirstClassSelection(
  state: GameState,
  companionId: string,
  classId: ClassId,
): FirstClassSelectionValidation {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return { ok: false, reason: "companion_not_found" };
  }

  if (!isFirstClassId(classId)) {
    return {
      ok: false,
      reason: "invalid_class",
      companion,
    };
  }

  if (companion.state === "dead" || companion.health <= 0) {
    return {
      ok: false,
      reason: "companion_dead",
      companion,
    };
  }

  if (companion.classId !== "beginner") {
    return {
      ok: false,
      reason: "not_beginner",
      companion,
    };
  }

  if (companion.characterLevel < BEGINNER_CLASS_UNLOCK_LEVEL) {
    return {
      ok: false,
      reason: "level_too_low",
      companion,
    };
  }

  const incompatibleItemIds = getIncompatibleEquipmentItemIds(companion, classId);

  if (incompatibleItemIds.length > 0) {
    return {
      ok: false,
      reason: "incompatible_equipment",
      companion,
      incompatibleItemIds,
    };
  }

  return {
    ok: true,
    companion,
    classId,
  };
}

export function selectFirstClass(
  state: GameState,
  companionId: string,
  classId: ClassId,
): { state: GameState; result: FirstClassSelectionResult } {
  const validation = validateFirstClassSelection(state, companionId, classId);

  if (!validation.ok) {
    return {
      state,
      result: {
        status: "failed",
        companionId,
        classId,
        reason: validation.reason,
        incompatibleItemIds: validation.incompatibleItemIds,
      },
    };
  }

  return {
    state: setPartyMemberClass(state, companionId, validation.classId),
    result: {
      status: "success",
      companionId,
      classId: validation.classId,
    },
  };
}

export function canCompanionEnterFirstClassSelection(companion: Companion): boolean {
  if (
    companion.state === "dead" ||
    companion.health <= 0 ||
    companion.classId !== "beginner" ||
    companion.characterLevel < BEGINNER_CLASS_UNLOCK_LEVEL
  ) {
    return false;
  }

  return FIRST_CLASS_IDS.every(
    (classId) => getIncompatibleEquipmentItemIds(companion, classId).length === 0,
  );
}

function getIncompatibleEquipmentItemIds(
  companion: Companion,
  classId: FirstClassId,
): ItemId[] {
  return Object.values(companion.equipment).filter((itemId): itemId is ItemId => {
    if (!itemId) {
      return false;
    }

    return !isClassAllowedForEquipment(classId, getItemDefinition(itemId));
  });
}
