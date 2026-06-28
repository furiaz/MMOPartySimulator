import { describe, expect, it } from "vitest";
import { getItemDefinitionForResourceType, ITEM_DEFINITIONS } from "./items";
import type { ItemId } from "./types";

const SCALED_EQUIPMENT_LEVEL_REQUIREMENTS: Partial<Record<ItemId, number>> = {
  steel_sword: 15,
  veteran_sword: 20,
  bastion_mace: 15,
  ironhold_mace: 20,
  steel_claws: 15,
  rending_claws: 20,
  barbed_whip: 15,
  bloodthorn_whip: 20,
  reinforced_bow: 15,
  veteran_warbow: 20,
  adept_orb: 15,
  storm_orb: 20,
  etched_rune_lantern: 15,
  deep_rune_lantern: 20,
  sanctified_mace: 15,
  dawn_mace: 20,
  reinforced_shield: 15,
  tower_shield: 20,
  warded_talisman: 15,
  greater_talisman: 20,
  bright_lantern: 15,
  radiant_lantern: 20,
  ritual_dagger: 15,
  oath_dagger: 20,
  bastion_helm: 15,
  bastion_cuirass: 15,
  bastion_greaves: 15,
  bastion_gauntlets: 15,
  bastion_sabatons: 15,
  ironhold_helm: 20,
  ironhold_cuirass: 20,
  ironhold_greaves: 20,
  ironhold_gauntlets: 20,
  ironhold_sabatons: 20,
  breaker_helm: 15,
  breaker_cuirass: 15,
  breaker_greaves: 15,
  breaker_gauntlets: 15,
  breaker_sabatons: 15,
  conqueror_helm: 20,
  conqueror_cuirass: 20,
  conqueror_greaves: 20,
  conqueror_gauntlets: 20,
  conqueror_sabatons: 20,
  blessed_hood: 15,
  blessed_robe: 15,
  blessed_pants: 15,
  blessed_wraps: 15,
  blessed_sandals: 15,
  sanctuary_hood: 20,
  sanctuary_robe: 20,
  sanctuary_pants: 20,
  sanctuary_wraps: 20,
  sanctuary_sandals: 20,
  adept_hood: 15,
  adept_robe: 15,
  adept_pants: 15,
  adept_gloves: 15,
  adept_sandals: 15,
  arcanist_hood: 20,
  arcanist_robe: 20,
  arcanist_pants: 20,
  arcanist_gloves: 20,
  arcanist_sandals: 20,
  pathfinder_cap: 15,
  pathfinder_jacket: 15,
  pathfinder_trousers: 15,
  pathfinder_gloves: 15,
  pathfinder_boots: 15,
  wayfarer_cap: 20,
  wayfarer_jacket: 20,
  wayfarer_trousers: 20,
  wayfarer_gloves: 20,
  wayfarer_boots: 20,
  striker_mask: 15,
  striker_vest: 15,
  striker_leggings: 15,
  striker_grips: 15,
  striker_boots: 15,
  duelist_mask: 20,
  duelist_vest: 20,
  duelist_leggings: 20,
  duelist_grips: 20,
  duelist_boots: 20,
  sentinel_coif: 15,
  sentinel_hauberk: 15,
  sentinel_legguards: 15,
  sentinel_gloves: 15,
  sentinel_boots: 15,
  ironward_coif: 20,
  ironward_hauberk: 20,
  ironward_legguards: 20,
  ironward_gloves: 20,
  ironward_boots: 20,
  marshal_coif: 15,
  marshal_hauberk: 15,
  marshal_legguards: 15,
  marshal_gloves: 15,
  marshal_boots: 15,
  frontline_coif: 20,
  frontline_hauberk: 20,
  frontline_legguards: 20,
  frontline_gloves: 20,
  frontline_boots: 20,
};

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

    expect(armorItems.length).toBe(120);

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
        itemDefinition.tier === 1 &&
        (itemDefinition.armorFamily === "cloth" ||
          itemDefinition.armorFamily === "plate"),
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

  it("defines level 15 and 20 scaled equipment as tier 2 one-off items", () => {
    const scaledEquipmentEntries = Object.entries(
      SCALED_EQUIPMENT_LEVEL_REQUIREMENTS,
    );

    expect(scaledEquipmentEntries).toHaveLength(104);

    for (const [itemId, levelRequirement] of scaledEquipmentEntries) {
      const itemDefinition = ITEM_DEFINITIONS[itemId as ItemId];

      expect(itemDefinition).toMatchObject({
        id: itemId,
        category: "equipment",
        rarity: "common",
        tier: 2,
        stackable: false,
        maxStack: 1,
        levelRequirement,
      });
    }
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
