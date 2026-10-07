import { describe, expect, it } from "vitest";
import {
  getEquipmentDropPopupThreshold,
  normalizeEquipmentDropPopupThreshold,
  setEquipmentDropPopupThreshold,
  shouldShowEquipmentDropPopup,
} from "./equipmentDropPopups";
import { getItemDefinition } from "./items";
import { createTestGameState } from "./testState";
import type {
  EquipmentDropPopupThreshold,
  ItemRarity,
} from "./types";

describe("equipment drop popup preferences", () => {
  it("normalizes supported thresholds and defaults missing or invalid values to Common", () => {
    const supportedThresholds: EquipmentDropPopupThreshold[] = [
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary",
      "off",
    ];

    for (const threshold of supportedThresholds) {
      expect(normalizeEquipmentDropPopupThreshold(threshold)).toBe(threshold);
    }

    expect(normalizeEquipmentDropPopupThreshold(undefined)).toBe("common");
    expect(normalizeEquipmentDropPopupThreshold("mythic")).toBe("common");
  });

  it("compares equipment rarity inclusively and treats missing rarity as Common", () => {
    const equipment = getItemDefinition("rune_lantern");
    const rarityOrder: ItemRarity[] = [
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary",
    ];

    expect(equipment.rarity).toBeUndefined();
    expect(shouldShowEquipmentDropPopup(equipment, "common")).toBe(true);
    expect(shouldShowEquipmentDropPopup(equipment, "uncommon")).toBe(false);

    for (const [itemIndex, rarity] of rarityOrder.entries()) {
      const itemAtRarity = { ...equipment, rarity };

      for (const [thresholdIndex, threshold] of rarityOrder.entries()) {
        expect(shouldShowEquipmentDropPopup(itemAtRarity, threshold)).toBe(
          itemIndex >= thresholdIndex,
        );
      }
    }
  });

  it("rejects non-equipment items and disables all equipment at Off", () => {
    expect(
      shouldShowEquipmentDropPopup(getItemDefinition("softwood"), "common"),
    ).toBe(false);
    expect(
      shouldShowEquipmentDropPopup(getItemDefinition("rune_lantern"), "off"),
    ).toBe(false);
  });

  it("reads the Common default and applies a changed threshold to game state", () => {
    const state = createTestGameState();

    expect(getEquipmentDropPopupThreshold(state)).toBe("common");

    const nextState = setEquipmentDropPopupThreshold(state, "epic");

    expect(nextState).not.toBe(state);
    expect(getEquipmentDropPopupThreshold(nextState)).toBe("epic");
    expect(setEquipmentDropPopupThreshold(nextState, "epic")).toBe(nextState);
  });
});
