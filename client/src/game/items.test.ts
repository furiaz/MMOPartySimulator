import { describe, expect, it } from "vitest";
import { getItemDefinitionForResourceType, ITEM_DEFINITIONS } from "./items";

describe("prototype item definitions", () => {
  const getArmorItems = () =>
    Object.values(ITEM_DEFINITIONS).filter(
      (itemDefinition) => itemDefinition.equipmentKind === "armor",
    );

  const getArmorItemIdsWithLevelRequirement = (levelRequirement: number) =>
    getArmorItems()
      .filter((itemDefinition) => itemDefinition.levelRequirement === levelRequirement)
      .map((itemDefinition) => itemDefinition.id)
      .sort();

  it("maps resource type and tier to the intended gathered item", () => {
    expect(getItemDefinitionForResourceType("wood", 1).id).toBe("softwood");
    expect(getItemDefinitionForResourceType("ore", 1).id).toBe("copper_ore");
    expect(getItemDefinitionForResourceType("herb", 1).id).toBe("field_herb");
    expect(getItemDefinitionForResourceType("wood", 2).id).toBe("hardwood");
    expect(getItemDefinitionForResourceType("ore", 2).id).toBe("iron_ore");
    expect(getItemDefinitionForResourceType("herb", 2).id).toBe("redleaf_herb");
  });

  it("defines tier and level metadata for all equipment", () => {
    const equipmentItems = Object.values(ITEM_DEFINITIONS).filter(
      (itemDefinition) => itemDefinition.category === "equipment",
    );

    expect(equipmentItems.length).toBeGreaterThan(0);

    for (const itemDefinition of equipmentItems) {
      expect(itemDefinition.tier).toBeDefined();
      expect(itemDefinition.levelRequirement).toBeDefined();
    }
  });

  it("keeps regular armor class-unrestricted and grouped by family", () => {
    const armorItems = getArmorItems();

    expect(armorItems.length).toBe(40);

    for (const itemDefinition of armorItems) {
      expect(itemDefinition.armorFamily).toMatch(/^(cloth|leather|mail|plate)$/);
      expect(itemDefinition.allowedClassIds).toBeUndefined();
    }
  });

  it("keeps early tier 1 armor unlocks split by level", () => {
    expect(getArmorItemIdsWithLevelRequirement(1)).toEqual([
      "guard_boots",
      "guard_coif",
      "guard_gloves",
      "guard_hauberk",
      "guard_legguards",
      "scout_boots",
      "scout_cap",
      "scout_gloves",
      "scout_jacket",
      "scout_trousers",
    ]);

    expect(getArmorItemIdsWithLevelRequirement(5)).toEqual([
      "stalker_boots",
      "stalker_grips",
      "stalker_leggings",
      "stalker_mask",
      "stalker_vest",
      "vanguard_boots",
      "vanguard_coif",
      "vanguard_gloves",
      "vanguard_hauberk",
      "vanguard_legguards",
    ]);
  });

  it("keeps cloth and plate tier 1 armor at level 10", () => {
    const clothAndPlateItems = getArmorItems().filter(
      (itemDefinition) =>
        itemDefinition.armorFamily === "cloth" ||
        itemDefinition.armorFamily === "plate",
    );
    const familiesAvailableAtLevel10 = new Set(
      getArmorItems()
        .filter((itemDefinition) => (itemDefinition.levelRequirement ?? 0) <= 10)
        .map((itemDefinition) => itemDefinition.armorFamily),
    );

    expect(clothAndPlateItems.length).toBe(20);
    for (const itemDefinition of clothAndPlateItems) {
      expect(itemDefinition.levelRequirement).toBe(10);
    }
    expect(familiesAvailableAtLevel10).toEqual(
      new Set(["cloth", "leather", "mail", "plate"]),
    );
  });

  it("keeps regular mail and plate away from magic and healing power", () => {
    const heavyArmorItems = Object.values(ITEM_DEFINITIONS).filter(
      (itemDefinition) =>
        itemDefinition.armorFamily === "mail" ||
        itemDefinition.armorFamily === "plate",
    );

    for (const itemDefinition of heavyArmorItems) {
      expect(itemDefinition.statModifiers?.magicPower).toBeUndefined();
      expect(itemDefinition.statModifiers?.healingPower).toBeUndefined();
    }
  });

  it("uses evasion penalties on mail and plate tradeoff pieces", () => {
    expect(ITEM_DEFINITIONS.guard_hauberk.statModifiers?.evasion).toBe(-1);
    expect(ITEM_DEFINITIONS.vanguard_boots.statModifiers?.evasion).toBe(-1);
    expect(ITEM_DEFINITIONS.bulwark_cuirass.statModifiers?.evasion).toBe(-2);
    expect(ITEM_DEFINITIONS.warplate_cuirass.statModifiers?.evasion).toBe(-2);
  });
});
