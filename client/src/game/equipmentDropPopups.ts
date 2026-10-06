import type { GameState } from "./state";
import type {
  EquipmentDropPopupThreshold,
  ItemDefinition,
  ItemRarity,
} from "./types";

export const DEFAULT_EQUIPMENT_DROP_POPUP_THRESHOLD: EquipmentDropPopupThreshold =
  "common";

const EQUIPMENT_DROP_POPUP_THRESHOLDS: readonly EquipmentDropPopupThreshold[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "off",
];

const ITEM_RARITY_RANK: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export function normalizeEquipmentDropPopupThreshold(
  value: unknown,
): EquipmentDropPopupThreshold {
  return typeof value === "string" &&
    EQUIPMENT_DROP_POPUP_THRESHOLDS.includes(
      value as EquipmentDropPopupThreshold,
    )
    ? (value as EquipmentDropPopupThreshold)
    : DEFAULT_EQUIPMENT_DROP_POPUP_THRESHOLD;
}

export function getEquipmentDropPopupThreshold(
  state: Pick<GameState, "equipmentDropPopupThreshold">,
): EquipmentDropPopupThreshold {
  return normalizeEquipmentDropPopupThreshold(
    state.equipmentDropPopupThreshold,
  );
}

export function setEquipmentDropPopupThreshold(
  state: GameState,
  threshold: EquipmentDropPopupThreshold,
): GameState {
  const normalizedThreshold = normalizeEquipmentDropPopupThreshold(threshold);

  return state.equipmentDropPopupThreshold === normalizedThreshold
    ? state
    : {
        ...state,
        equipmentDropPopupThreshold: normalizedThreshold,
      };
}

export function shouldShowEquipmentDropPopup(
  itemDefinition: ItemDefinition,
  threshold: EquipmentDropPopupThreshold,
): boolean {
  if (itemDefinition.category !== "equipment" || threshold === "off") {
    return false;
  }

  const itemRarity = itemDefinition.rarity ?? "common";

  return ITEM_RARITY_RANK[itemRarity] >= ITEM_RARITY_RANK[threshold];
}
