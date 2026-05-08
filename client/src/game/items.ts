import type { ItemDefinition, ItemId, ResourceType } from "./types";

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  wood: {
    id: "wood",
    displayName: "Wood",
    category: "material",
    description: "Prototype gathered wood material.",
    rarity: "common",
    stackable: true,
    maxStack: 250,
  },
  ore: {
    id: "ore",
    displayName: "Ore",
    category: "material",
    description: "Prototype gathered ore material.",
    rarity: "common",
    stackable: true,
    maxStack: 250,
  },
  herb: {
    id: "herb",
    displayName: "Herb",
    category: "material",
    description: "Prototype gathered herb material.",
    rarity: "common",
    stackable: true,
    maxStack: 250,
  },
};

export function getItemDefinition(itemId: ItemId): ItemDefinition {
  return ITEM_DEFINITIONS[itemId];
}

export function getItemDefinitionForResourceType(
  resourceType: ResourceType,
): ItemDefinition {
  return getItemDefinition(resourceType);
}
