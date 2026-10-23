import { describe, expect, it } from "vitest";
import { CRAFTING_RECIPES, type CraftingRecipe } from "./crafting";
import { debugMapDefinitions } from "./debugMap";
import {
  getEnemyDropTable,
  getEnemyTypeDropTable,
  getLootTierForLevel,
} from "./dropTables";
import { ENEMY_TYPES } from "./enemyArchetypes";
import { createEnemy } from "./entities";
import { ITEM_DEFINITIONS, getItemDefinitionForResourceType } from "./items";
import {
  LIVESTOCK_CREATURE_DEFINITIONS,
  tryUnlockLivestockCreatureFromEnemyDefeat,
} from "./livestock";
import { createTestGameState } from "./testState";
import type { EnemyTypeDefinition, ItemDefinition, ItemId } from "./types";

type MaterialSource = { level: number; gathered: boolean };

// Content checks only: none of this lookup/validation runs in the simulation.
function getMaterialSources(
  enemyTypes: EnemyTypeDefinition[] = Object.values(ENEMY_TYPES),
): Map<ItemId, MaterialSource> {
  const sources = new Map<ItemId, MaterialSource>();
  const initialState = createTestGameState();
  const record = (id: ItemId, level: number, gathered = false) => {
    const previous = sources.get(id);
    sources.set(id, {
      level: Math.min(level, previous?.level ?? Infinity),
      gathered: gathered || (previous?.gathered ?? false),
    });
  };

  for (const enemy of enemyTypes) {
    const tier = getLootTierForLevel(enemy.level);
    const typeTable = getEnemyTypeDropTable(enemy.id, tier);
    const tables = [
      typeTable?.overridesArchetypeDrops
        ? undefined
        : getEnemyDropTable(enemy.archetypeId, tier),
      typeTable,
    ];
    for (const table of tables) {
      for (const group of table?.groups ?? []) {
        if (group.chance <= 0) continue;
        for (const entry of group.entries) {
          if (entry.quantity > 0 && ITEM_DEFINITIONS[entry.itemId].category === "material") {
            record(entry.itemId, enemy.level);
          }
        }
      }
    }

    // Exercise the actual discovery mapping instead of duplicating creature IDs
    // or assigning Tin Ore the level implied by its legacy Tier-1 label.
    const discovered = tryUnlockLivestockCreatureFromEnemyDefeat(
      initialState,
      createEnemy("material-source", { x: 0, y: 0 }, undefined, {
        enemyTypeId: enemy.id,
        level: enemy.level,
      }),
      0,
      () => 0,
    );
    for (const creature of LIVESTOCK_CREATURE_DEFINITIONS) {
      if (creature.output?.destination !== "inventory") continue;
      const before = initialState.livestock?.ownedCreaturesById[creature.id] ?? 0;
      const after = discovered.livestock?.ownedCreaturesById[creature.id] ?? 0;
      const output = Object.values(ITEM_DEFINITIONS).find(
        (item) => item.id === creature.output?.id && item.category === "material",
      );
      if (after > before && output) record(output.id, enemy.level);
    }
  }

  for (const map of Object.values(debugMapDefinitions)) {
    for (const subzone of map.subzones ?? []) {
      for (const resource of subzone.resourceLocations) {
        record(
          getItemDefinitionForResourceType(resource.resourceType, resource.tier ?? 1).id,
          subzone.levelRange.min,
          true,
        );
      }
    }
  }
  return sources;
}

function getMaterialViolations(
  recipe: CraftingRecipe,
  sources: Map<ItemId, MaterialSource>,
  output: ItemDefinition | undefined = recipe.outputItemId
    ? ITEM_DEFINITIONS[recipe.outputItemId]
    : undefined,
): string[] {
  if (recipe.outputKind !== "item" || output?.category !== "equipment") return [];
  const level = output.levelRequirement ?? 1;
  const isWeapon = output.equipmentKind === "weapon" || output.equipmentType === "dagger";
  const maximum = level + (isWeapon ? 3 : 2);
  const costs = recipe.costs.filter((cost) => cost.kind === "item");
  const mainQuantity = Math.max(0, ...costs
    .filter((cost) => sources.get(cost.itemId)?.gathered)
    .map((cost) => cost.quantity));
  const violations: string[] = [];

  for (const cost of costs) {
    if (ITEM_DEFINITIONS[cost.itemId].category !== "material") continue;
    const source = sources.get(cost.itemId);
    if (!source) {
      violations.push(`Unknown material source: ${cost.itemId}`);
      continue;
    }
    if (source.level > maximum) {
      violations.push(`${cost.itemId}: source level ${source.level} exceeds ${maximum}`);
    }
    if (source.level > level && cost.quantity >= mainQuantity) {
      violations.push(`${cost.itemId}: above-level quantity must be below ${mainQuantity}`);
    }
  }
  return violations;
}

function sampleRecipe(outputItemId: ItemId, itemId: ItemId, quantity = 2): CraftingRecipe {
  return {
    id: "guard_mace",
    outputKind: "item",
    outputItemId,
    outputQuantity: 1,
    crownCost: 1,
    costs: [
      { kind: "item", itemId: "iron_ore", quantity: 10 },
      { kind: "item", itemId, quantity },
    ],
  };
}

const sources = getMaterialSources();
const equipmentRecipes = CRAFTING_RECIPES.filter(
  (recipe) => recipe.outputItemId && ITEM_DEFINITIONS[recipe.outputItemId].category === "equipment",
);

describe("equipment recipe material policy", () => {
  it.each(equipmentRecipes)("validates material sources and quantities for $id", (recipe) => {
    expect(getMaterialViolations(recipe, sources)).toEqual([]);
  });

  it("resolves actual tiered enemy, resource and Livestock sources", () => {
    expect(sources.get("wolf_pelt")?.level).toBe(6);
    expect(sources.get("wolf_pelt_t2")?.level).toBe(15);
    expect(sources.get("goblin_tooth_t2")?.level).toBe(10);
    expect(sources.get("imp_horn_chip_t2")?.level).toBe(12);
    expect(sources.get("orc_hide")?.level).toBe(18);
    expect(sources.get("orc_tusk")?.level).toBe(18);
    expect(sources.get("tin_ore")).toEqual({ level: 13, gathered: false });
    expect(sources.get("hardwood")).toEqual({ level: 8, gathered: true });
    expect(sources.get("redleaf_herb")).toEqual({ level: 8, gathered: true });
    expect(sources.get("iron_ore")).toEqual({ level: 9, gathered: true });
  });

  it("uses the earliest shared source regardless of enemy definition order", () => {
    const shared = getMaterialSources([ENEMY_TYPES.cinder_wisp, ENEMY_TYPES.ash_wisp]);
    expect(shared.get("wisp_ash_t2")?.level).toBe(11);
    expect(shared.get("wisp_ember_t2")?.level).toBe(11);
  });

  it.each([
    ["trailrunner_cap", "imp_horn_chip_t2", true],
    ["trailrunner_cap", "crawler_pebble_t2", false],
    ["guard_mace", "crawler_pebble_t2", true],
    ["guard_mace", "wolf_pelt_t2", false],
    ["sacrificial_dagger", "crawler_plate_t2", true],
    ["wooden_shield", "crawler_plate_t2", false],
    ["leather_quiver", "crawler_plate_t2", false],
    ["simple_talisman", "crawler_plate_t2", false],
    ["bronze_pendant", "tin_ore", false],
    ["sentinel_boots", "moss_tuft_t2", true],
    ["sentinel_boots", "orc_hide", false],
    ["steel_sword", "orc_hide", true],
  ] as const)("checks %s with %s against its ceiling", (output, material, allowed) => {
    expect(getMaterialViolations(sampleRecipe(output, material), sources).length === 0).toBe(allowed);
  });

  it("rejects exactly one level beyond either ceiling", () => {
    for (const output of [ITEM_DEFINITIONS.guard_mace, ITEM_DEFINITIONS.wooden_shield]) {
      const sourceLevel = sources.get("crawler_pebble_t2")!.level;
      const allowance = output.equipmentKind === "weapon" ? 3 : 2;
      const recipe = sampleRecipe(output.id, "crawler_pebble_t2");
      expect(getMaterialViolations(recipe, sources, {
        ...output, levelRequirement: sourceLevel - allowance,
      })).toEqual([]);
      expect(getMaterialViolations(recipe, sources, {
        ...output, levelRequirement: sourceLevel - allowance - 1,
      })).toContain(`crawler_pebble_t2: source level 13 exceeds 12`);
    }
  });

  it("requires above-level quantities strictly below the largest gathered ingredient", () => {
    const recipe = sampleRecipe("guard_mace", "imp_horn_chip_t2", 4);
    recipe.costs = [
      { kind: "item", itemId: "hardwood", quantity: 3 },
      { kind: "item", itemId: "iron_ore", quantity: 5 },
      recipe.costs[1],
    ];
    expect(getMaterialViolations(recipe, sources)).toEqual([]);
    for (const quantity of [5, 6]) {
      recipe.costs[2].quantity = quantity;
      expect(getMaterialViolations(recipe, sources)).toContain(
        "imp_horn_chip_t2: above-level quantity must be below 5",
      );
    }
    expect(getMaterialViolations(sampleRecipe("guard_mace", "goblin_ear_t2", 10), sources)).toEqual([]);
  });

  it("fails clearly for an unknown material source instead of assigning level zero", () => {
    expect(getMaterialViolations(sampleRecipe("guard_mace", "wood"), sources)).toEqual([
      "Unknown material source: wood",
    ]);
  });

  it("excludes key-item recipes and leaves Orc materials outside current recipe costs", () => {
    const echo = CRAFTING_RECIPES.find((recipe) => recipe.outputKind === "key_item")!;
    expect(getMaterialViolations(echo, new Map())).toEqual([]);
    expect(CRAFTING_RECIPES.flatMap((recipe) => recipe.costs).some(
      (cost) => cost.kind === "item" && ["orc_hide", "orc_tusk"].includes(cost.itemId),
    )).toBe(false);
  });
});
