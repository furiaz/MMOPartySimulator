import { describe, expect, it } from "vitest";
import { getItemDefinitionForResourceType, ITEM_DEFINITIONS } from "./items";

describe("prototype item definitions", () => {
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
    const armorItems = Object.values(ITEM_DEFINITIONS).filter(
      (itemDefinition) => itemDefinition.equipmentKind === "armor",
    );

    expect(armorItems.length).toBe(40);

    for (const itemDefinition of armorItems) {
      expect(itemDefinition.armorFamily).toMatch(/^(cloth|leather|mail|plate)$/);
      expect(itemDefinition.allowedClassIds).toBeUndefined();
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
