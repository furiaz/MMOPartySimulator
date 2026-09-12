import { describe, expect, it } from "vitest";
import {
  CRAFTING_RECIPES,
  type CraftingRecipe,
  craftRecipe,
  getCraftingRecipe,
  getCraftingRecipeStatus,
  getSortedCraftingRecipeStatuses,
  isPartyLeaderNearSmith,
} from "./crafting";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createCompanion, createNpc } from "./entities";
import { ITEM_DEFINITIONS } from "./items";
import {
  TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
  awardKeyItem,
  getKeyItemQuantity,
} from "./keyItems";
import {
  addItemToInventoryState,
  countInventoryItem,
  createEmptyPartyInventory,
  toggleInventorySlotLock,
} from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { DebugTelemetryEvent, ItemId } from "./types";
import { getCurrencyBalance, setCurrencyBalanceForDebug } from "./wallet";

describe("Smith crafting", () => {
  it("keeps the Harbor Union Bastion teleport echo recipe visible", () => {
    const statuses = getSortedCraftingRecipeStatuses(createCraftingState());
    const status = statuses.find(
      (recipeStatus) =>
        recipeStatus.recipe.id === "teleport_echo_harbor_union_bastion",
    );

    expect(statuses[0]?.recipe.id).toBe("teleport_echo_harbor_union_bastion");
    expect(status?.outputDisplayName).toBe(
      "Teleportation Echo - Harbor Union Bastion",
    );
    expect(status?.outputKeyItemDefinition?.id).toBe(
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    );
  });

  it("crafts an item near a Smith and consumes exact materials and Crowns", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["slime_gel_t1", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "softwood")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "slime_gel_t1")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "training_sword")).toBe(1);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(6);
  });

  it("crafts the Harbor Union Bastion teleport echo without using inventory slots", () => {
    let state = createCraftingState();
    state = addItems(state, getTeleportEchoCraftingCosts());
    state = setCurrencyBalanceForDebug(state, "crowns", 300).state;

    const result = craftRecipe(state, "teleport_echo_harbor_union_bastion");

    expect(result.result).toEqual({
      status: "success",
      recipeId: "teleport_echo_harbor_union_bastion",
      outputKind: "key_item",
      outputKeyItemId: TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
      outputQuantity: 1,
      displayName: "Teleportation Echo - Harbor Union Bastion",
      crownCost: 250,
      previousCrowns: 300,
      newCrowns: 50,
    });
    expect(getKeyItemQuantity(
      result.state,
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    )).toBe(1);
    expect(result.state.inventory.slots).toEqual([]);
    expect(result.state.newsBroadcasts?.at(-1)?.text).toBe(
      "Unlocked: Teleportation Echo - Harbor Union Bastion",
    );
  });

  it("disables repeat crafting for an owned teleport echo", () => {
    let state = awardKeyItem(
      createCraftingState(),
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    ).state;
    state = addItems(state, getTeleportEchoCraftingCosts());
    state = setCurrencyBalanceForDebug(state, "crowns", 300).state;
    const status = getCraftingRecipeStatus(
      state,
      getCraftingRecipe("teleport_echo_harbor_union_bastion")!,
    );
    const result = craftRecipe(state, "teleport_echo_harbor_union_bastion");

    expect(status.isOutputOwned).toBe(true);
    expect(status.canCraft).toBe(false);
    expect(result.result).toEqual({
      status: "failed",
      recipeId: "teleport_echo_harbor_union_bastion",
      reason: "already_owned",
    });
    expect(getKeyItemQuantity(
      result.state,
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    )).toBe(1);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(300);
  });

  it("records crafting attempt and success telemetry while debug recording", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["slime_gel_t1", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;
    state = startDebugTelemetryRecording(state);

    const result = craftRecipe(state, "training_sword");
    const events = getDebugTelemetryEvents(result.state);
    const successEvent = events.find((event) => event.type === "craft_succeeded");

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["craft_attempted", "craft_succeeded"]),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "craft_attempted",
          entityId: "leader",
          craftingRecipeId: "training_sword",
          outputItemId: "training_sword",
          outputQuantity: 1,
          crownCost: 4,
          previousCurrencyBalance: 10,
          nextCurrencyBalance: 10,
          craftingRequirements: expect.arrayContaining([
            expect.objectContaining({
              kind: "item",
              itemId: "softwood",
              ownedQuantity: 5,
              requiredQuantity: 5,
              isMet: true,
            }),
          ]),
        }),
      ]),
    );
    expect(successEvent).toMatchObject({
      craftingRecipeId: "training_sword",
      outputItemId: "training_sword",
      crownCost: 4,
      previousCurrencyBalance: 10,
      nextCurrencyBalance: 6,
    });
    expect(successEvent?.consumedCraftingItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "item", itemId: "softwood", quantity: 5 }),
        expect.objectContaining({
          kind: "item",
          itemId: "slime_gel_t1",
          quantity: 2,
        }),
      ]),
    );
  });

  it("does not record crafting telemetry when debug recording is off", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["slime_gel_t1", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.state.debugTelemetry?.events ?? []).toEqual([]);
  });

  it("fails without consuming anything when required materials are missing", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "missing_materials",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("records failed crafting telemetry without mutating inventory or wallet", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;
    state = startDebugTelemetryRecording(state);

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "missing_materials",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
    expect(getDebugTelemetryEvents(result.state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "craft_attempted",
          craftingRecipeId: "training_sword",
        }),
        expect.objectContaining({
          type: "craft_failed",
          craftingRecipeId: "training_sword",
          craftingFailureReason: "missing_materials",
          craftingRequirements: expect.arrayContaining([
            expect.objectContaining({
              itemId: "slime_gel_t1",
              ownedQuantity: 0,
              requiredQuantity: 2,
              isMet: false,
            }),
          ]),
        }),
      ]),
    );
  });

  it("fails without consuming anything when Crowns are insufficient", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["slime_gel_t1", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 3).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "insufficient_crowns",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("requires free inventory space after accounting for consumed inputs", () => {
    let state = createCraftingState({ inventory: createEmptyPartyInventory(2) });
    state = addItems(state, [
      ["softwood", 6],
      ["slime_gel_t1", 3],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "inventory_full",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("requires the leader to be near a Smith", () => {
    let state = createCraftingState({ leaderPosition: { x: 10, y: 10 } });
    state = addItems(state, [
      ["softwood", 5],
      ["slime_gel_t1", 1],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    expect(isPartyLeaderNearSmith(state)).toBe(false);

    const result = craftRecipe(state, "training_sword");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "leader_not_near_smith",
    });
    expect(result.state.inventory).toEqual(state.inventory);
    expect(result.state.wallet).toEqual(state.wallet);
  });

  it("reports invalid recipe ids safely", () => {
    const state = createCraftingState();

    const result = craftRecipe(state, "missing_recipe");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "missing_recipe",
      reason: "invalid_recipe",
    });
    expect(result.state).toBe(state);
  });

  it("records invalid recipe and output failure telemetry", () => {
    const invalidRecipeState = startDebugTelemetryRecording(createCraftingState());

    const invalidRecipeResult = craftRecipe(invalidRecipeState, "missing_recipe");

    expect(getDebugTelemetryEvents(invalidRecipeResult.state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "craft_failed",
          craftingRecipeId: "missing_recipe",
          craftingFailureReason: "invalid_recipe",
        }),
      ]),
    );

    const brokenRecipe = {
      id: "broken_output",
      outputItemId: "missing_item",
      outputQuantity: 1,
      costs: [],
      crownCost: 0,
    } as unknown as CraftingRecipe;

    CRAFTING_RECIPES.push(brokenRecipe);

    try {
      const invalidOutputState = startDebugTelemetryRecording(createCraftingState());
      const invalidOutputResult = craftRecipe(invalidOutputState, "broken_output");

      expect(getDebugTelemetryEvents(invalidOutputResult.state)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "craft_attempted",
            craftingRecipeId: "broken_output",
          }),
          expect.objectContaining({
            type: "craft_failed",
            craftingRecipeId: "broken_output",
            craftingFailureReason: "invalid_output",
          }),
        ]),
      );
    } finally {
      CRAFTING_RECIPES.pop();
    }
  });

  it("fails safely when a recipe output definition is invalid", () => {
    const state = createCraftingState();
    const brokenRecipe = {
      id: "broken_output",
      outputItemId: "missing_item",
      outputQuantity: 1,
      costs: [],
      crownCost: 0,
    } as unknown as CraftingRecipe;

    CRAFTING_RECIPES.push(brokenRecipe);

    try {
      const result = craftRecipe(state, "broken_output");

      expect(result.result).toEqual({
        status: "failed",
        recipeId: "broken_output",
        reason: "invalid_output",
      });
      expect(result.state).toBe(state);
    } finally {
      CRAFTING_RECIPES.pop();
    }
  });

  it("exposes recipe status for UI requirement display", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["softwood", 5],
      ["slime_gel_t1", 1],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 4).state;
    const recipe = getCraftingRecipe("training_sword");

    expect(recipe).toBeDefined();

    const status = getCraftingRecipeStatus(state, recipe!);

    expect(status.hasRequiredMaterials).toBe(false);
    expect(status.hasRequiredCrowns).toBe(true);
    expect(status.requirements).toContainEqual({
      kind: "item",
      itemId: "slime_gel_t1",
      quantity: 2,
      displayName: "Slime Gel (Tier 1)",
      ownedQuantity: 1,
      isMet: false,
    });
  });

  it("defines valid recipes for every planned level 1, 5, 10, and 15 equipment output", () => {
    const expectedRecipeIds = getPlannedCraftedEquipmentIds();

    for (const recipeId of expectedRecipeIds) {
      const recipe = getCraftingRecipe(recipeId);

      expect(recipe?.outputItemId).toBe(recipeId);
      expect(recipe?.outputQuantity).toBe(1);
    }
  });

  it("sorts the smithy recipe list by weapon path order and complete armor sets", () => {
    const sortedRecipeIds = getSortedCraftingRecipeStatuses(createCraftingState())
      .map((status) => status.recipe.outputItemId)
      .filter((itemId): itemId is ItemId => Boolean(itemId));

    expect(sortedRecipeIds.slice(0, 18)).toEqual([
      "training_sword",
      "copper_training_sword",
      "iron_sword",
      "steel_sword",
      "guard_mace",
      "bastion_mace",
      "short_bow",
      "reinforced_bow",
      "claw_gauntlets",
      "steel_claws",
      "apprentice_orb",
      "adept_orb",
      "rune_lantern",
      "etched_rune_lantern",
      "holy_mace",
      "sanctified_mace",
      "thorn_whip",
      "barbed_whip",
    ]);
    expectRecipeGroupOrder(sortedRecipeIds, [
      "acolyte_hood",
      "acolyte_robe",
      "acolyte_pants",
      "acolyte_wraps",
      "acolyte_sandals",
    ]);
    expectRecipeGroupOrder(sortedRecipeIds, [
      "warplate_helm",
      "warplate_cuirass",
      "warplate_greaves",
      "warplate_gauntlets",
      "warplate_sabatons",
    ]);
  });

  it("crafts level 5 equipment by consuming one matching level 1 armor piece", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["scout_cap", 1],
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["wolf_pelt", 1],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

    const status = getCraftingRecipeStatus(state, getCraftingRecipe("stalker_mask")!);
    const equipmentRequirement = status.requirements.find(
      (requirement) => requirement.kind === "equipment",
    );

    expect(equipmentRequirement).toMatchObject({
      displayName: "Any Level 1 Leather Head Armor",
      ownedQuantity: 1,
      isMet: true,
    });

    const result = craftRecipe(state, "stalker_mask");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "scout_cap")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "wolf_pelt")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "stalker_mask")).toBe(1);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(10);
  });

  it("rejects previous-equipment requirements with the wrong family, part, or level", () => {
    const cases: Array<[string, ItemId]> = [
      ["wrong family", "guard_coif"],
      ["wrong part", "scout_boots"],
      ["wrong level", "stalker_mask"],
    ];

    for (const [, itemId] of cases) {
      let state = createCraftingState();
      state = addItems(state, [
        [itemId, 1],
        ["softwood", 6],
        ["spider_silk_t1", 2],
        ["wolf_pelt", 1],
      ]);
      state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

      const result = craftRecipe(state, "stalker_mask");

      expect(result.result).toEqual({
        status: "failed",
        recipeId: "stalker_mask",
        reason: "missing_materials",
      });
      expect(result.state.inventory).toEqual(state.inventory);
      expect(result.state.wallet).toEqual(state.wallet);
    }
  });

  it("does not count equipped or banked gear for previous-equipment requirements", () => {
    let equippedState = createCraftingState();
    const leader = equippedState.entities.leader;

    if (!leader || leader.kind !== "companion") {
      throw new Error("Expected leader companion");
    }

    equippedState = {
      ...equippedState,
      entities: {
        ...equippedState.entities,
        leader: {
          ...leader,
          equipment: {
            ...leader.equipment,
            head: "scout_cap",
          },
        },
      },
    };
    equippedState = addItems(equippedState, [
      ["softwood", 6],
      ["spider_silk_t1", 2],
    ]);
    equippedState = setCurrencyBalanceForDebug(
      equippedState,
      "crowns",
      20,
    ).state;

    expect(craftRecipe(equippedState, "stalker_mask").result).toEqual({
      status: "failed",
      recipeId: "stalker_mask",
      reason: "missing_materials",
    });

    let bankState = createCraftingState();
    bankState = {
      ...bankState,
      bank: {
        capacity: 100,
        slots: [{ itemId: "scout_cap", quantity: 1, slotIndex: 0 }],
        lockedSlotIndices: [],
        autoRoutingMode: "keep_inventory",
      },
    };
    bankState = addItems(bankState, [
      ["softwood", 6],
      ["spider_silk_t1", 2],
    ]);
    bankState = setCurrencyBalanceForDebug(bankState, "crowns", 20).state;

    expect(craftRecipe(bankState, "stalker_mask").result).toEqual({
      status: "failed",
      recipeId: "stalker_mask",
      reason: "missing_materials",
    });
  });

  it("does not count locked equipment or material slots for crafting", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["scout_cap", 1],
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["wolf_pelt", 1],
    ]);
    state = {
      ...state,
      inventory: toggleInventorySlotLock(state.inventory, 0),
    };
    state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

    const result = craftRecipe(state, "stalker_mask");

    expect(result.result).toEqual({
      status: "failed",
      recipeId: "stalker_mask",
      reason: "missing_materials",
    });
    expect(result.state.inventory).toEqual(state.inventory);

    let materialState = createCraftingState();
    materialState = addItems(materialState, [
      ["softwood", 5],
      ["slime_gel_t1", 2],
    ]);
    materialState = {
      ...materialState,
      inventory: toggleInventorySlotLock(materialState.inventory, 0),
    };
    materialState = setCurrencyBalanceForDebug(materialState, "crowns", 10).state;

    const materialResult = craftRecipe(materialState, "training_sword");

    expect(materialResult.result).toEqual({
      status: "failed",
      recipeId: "training_sword",
      reason: "missing_materials",
    });
    expect(materialResult.state.inventory).toEqual(materialState.inventory);
  });

  it("allows consumed inputs to free the inventory space needed for the output", () => {
    let state = createCraftingState({ inventory: createEmptyPartyInventory(4) });
    state = addItems(state, [
      ["scout_cap", 1],
      ["softwood", 6],
      ["spider_silk_t1", 2],
      ["wolf_pelt", 1],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 20).state;

    expect(state.inventory.slots).toHaveLength(4);

    const result = craftRecipe(state, "stalker_mask");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "stalker_mask")).toBe(1);
  });

  it("uses the tutorial Plain Charm recipe and records successful craft progress", () => {
    const quests = createInitialQuestStates();
    quests.smiths_first_work = {
      ...quests.smiths_first_work,
      status: "active",
    };
    let state = createCraftingState({ quests });
    state = addItems(state, [
      ["copper_ore", 2],
      ["field_herb", 2],
      ["slime_gel_t1", 3],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const result = craftRecipe(state, "plain_charm");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "slime_gel_t1")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "copper_ore")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "field_herb")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "plain_charm")).toBe(1);
    expect(
      result.state.quests.smiths_first_work.objectiveProgress.craft_plain_charm,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
  });

  it("defines bronze accessory recipes from Tin Ore and Copper Ore", () => {
    expect(getCraftingRecipe("bronze_pendant")).toMatchObject({
      outputItemId: "bronze_pendant",
      outputQuantity: 1,
      crownCost: 18,
      costs: [
        { kind: "item", itemId: "copper_ore", quantity: 6 },
        { kind: "item", itemId: "tin_ore", quantity: 3 },
        { kind: "item", itemId: "crawler_pebble_t1", quantity: 2 },
      ],
    });
    expect(getCraftingRecipe("field_bronze_pendant")).toMatchObject({
      outputItemId: "field_bronze_pendant",
      outputQuantity: 1,
      crownCost: 18,
      costs: [
        { kind: "item", itemId: "copper_ore", quantity: 4 },
        { kind: "item", itemId: "tin_ore", quantity: 3 },
        { kind: "item", itemId: "field_herb", quantity: 3 },
      ],
    });
    expect(getCraftingRecipe("reinforced_bronze_pendant")).toMatchObject({
      outputItemId: "reinforced_bronze_pendant",
      outputQuantity: 1,
      crownCost: 32,
      costs: [
        {
          kind: "equipment",
          equipmentType: "accessory",
          levelRequirement: 10,
          quantity: 1,
        },
        { kind: "item", itemId: "copper_ore", quantity: 10 },
        { kind: "item", itemId: "tin_ore", quantity: 6 },
        { kind: "item", itemId: "crawler_plate_t1", quantity: 2 },
      ],
    });
    expect(getCraftingRecipe("polished_bronze_pendant")).toMatchObject({
      outputItemId: "polished_bronze_pendant",
      outputQuantity: 1,
      crownCost: 32,
      costs: [
        {
          kind: "equipment",
          equipmentType: "accessory",
          levelRequirement: 10,
          quantity: 1,
        },
        { kind: "item", itemId: "copper_ore", quantity: 8 },
        { kind: "item", itemId: "tin_ore", quantity: 6 },
        { kind: "item", itemId: "field_herb", quantity: 6 },
      ],
    });
  });

  it("adds previous-equipment requirements to every level 15 recipe", () => {
    for (const itemDefinition of Object.values(ITEM_DEFINITIONS)) {
      if (
        itemDefinition.category !== "equipment" ||
        itemDefinition.levelRequirement !== 15
      ) {
        continue;
      }

      const recipe = getCraftingRecipe(itemDefinition.id);
      const equipmentRequirement = recipe?.costs.find(
        (cost) => cost.kind === "equipment",
      );

      expect(equipmentRequirement).toMatchObject({
        kind: "equipment",
        equipmentType: itemDefinition.equipmentType,
        levelRequirement: 10,
        quantity: 1,
      });

      if (itemDefinition.equipmentKind === "armor") {
        expect(equipmentRequirement).toMatchObject({
          armorFamily: itemDefinition.armorFamily,
        });
      }
    }
  });

  it("does not require previous equipment for level 10 recipes", () => {
    for (const itemDefinition of Object.values(ITEM_DEFINITIONS)) {
      if (
        itemDefinition.category !== "equipment" ||
        itemDefinition.levelRequirement !== 10
      ) {
        continue;
      }

      const recipe = getCraftingRecipe(itemDefinition.id);

      expect(recipe?.costs.some((cost) => cost.kind === "equipment")).toBe(false);
    }
  });

  it("crafts level 15 armor with matching level 10 family and part", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["acolyte_hood", 1],
      ["redleaf_herb", 14],
      ["imp_horn_chip_t2", 5],
      ["imp_tail_t2", 1],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 50).state;

    const result = craftRecipe(state, "blessed_hood");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "acolyte_hood")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "blessed_hood")).toBe(1);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(20);
  });

  it("crafts level 15 accessories with any level 10 accessory", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["bronze_pendant", 1],
      ["copper_ore", 10],
      ["tin_ore", 6],
      ["crawler_plate_t1", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 40).state;

    const status = getCraftingRecipeStatus(
      state,
      getCraftingRecipe("reinforced_bronze_pendant")!,
    );
    const equipmentRequirement = status.requirements.find(
      (requirement) => requirement.kind === "equipment",
    );

    expect(equipmentRequirement).toMatchObject({
      displayName: "Any Level 10 Accessory",
      ownedQuantity: 1,
      isMet: true,
    });

    const result = craftRecipe(state, "reinforced_bronze_pendant");

    expect(result.result.status).toBe("success");
    expect(countInventoryItem(result.state.inventory, "bronze_pendant")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "copper_ore")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "tin_ore")).toBe(0);
    expect(countInventoryItem(result.state.inventory, "crawler_plate_t1")).toBe(0);
    expect(
      countInventoryItem(result.state.inventory, "reinforced_bronze_pendant"),
    ).toBe(1);
    expect(getCurrencyBalance(result.state.wallet, "crowns")).toBe(8);
  });

  it("rejects level 15 armor previous gear with the wrong family, part, level, equipped state, bank state, or lock state", () => {
    const cases: Array<[string, ItemId]> = [
      ["wrong family", "trailrunner_cap"],
      ["wrong part", "acolyte_sandals"],
      ["wrong level", "blessed_hood"],
    ];

    for (const [, itemId] of cases) {
      let state = createCraftingState();
      state = addItems(state, [
        [itemId, 1],
        ["redleaf_herb", 14],
        ["imp_horn_chip_t2", 5],
        ["imp_tail_t2", 1],
      ]);
      state = setCurrencyBalanceForDebug(state, "crowns", 50).state;

      const result = craftRecipe(state, "blessed_hood");

      expect(result.result).toEqual({
        status: "failed",
        recipeId: "blessed_hood",
        reason: "missing_materials",
      });
      expect(result.state.inventory).toEqual(state.inventory);
    }

    let equippedState = createCraftingState();
    const leader = equippedState.entities.leader;

    if (!leader || leader.kind !== "companion") {
      throw new Error("Expected leader companion");
    }

    equippedState = {
      ...equippedState,
      entities: {
        ...equippedState.entities,
        leader: {
          ...leader,
          equipment: {
            ...leader.equipment,
            head: "acolyte_hood",
          },
        },
      },
    };
    equippedState = addItems(equippedState, [
      ["redleaf_herb", 14],
      ["imp_horn_chip_t2", 5],
      ["imp_tail_t2", 1],
    ]);
    equippedState = setCurrencyBalanceForDebug(equippedState, "crowns", 50).state;

    expect(craftRecipe(equippedState, "blessed_hood").result).toEqual({
      status: "failed",
      recipeId: "blessed_hood",
      reason: "missing_materials",
    });

    let bankState = createCraftingState();
    bankState = {
      ...bankState,
      bank: {
        capacity: 100,
        slots: [{ itemId: "acolyte_hood", quantity: 1, slotIndex: 0 }],
        lockedSlotIndices: [],
        autoRoutingMode: "keep_inventory",
      },
    };
    bankState = addItems(bankState, [
      ["redleaf_herb", 14],
      ["imp_horn_chip_t2", 5],
      ["imp_tail_t2", 1],
    ]);
    bankState = setCurrencyBalanceForDebug(bankState, "crowns", 50).state;

    expect(craftRecipe(bankState, "blessed_hood").result).toEqual({
      status: "failed",
      recipeId: "blessed_hood",
      reason: "missing_materials",
    });

    let lockedState = createCraftingState();
    lockedState = addItems(lockedState, [
      ["acolyte_hood", 1],
      ["redleaf_herb", 14],
      ["imp_horn_chip_t2", 5],
      ["imp_tail_t2", 1],
    ]);
    lockedState = {
      ...lockedState,
      inventory: toggleInventorySlotLock(lockedState.inventory, 0),
    };
    lockedState = setCurrencyBalanceForDebug(lockedState, "crowns", 50).state;

    expect(craftRecipe(lockedState, "blessed_hood").result).toEqual({
      status: "failed",
      recipeId: "blessed_hood",
      reason: "missing_materials",
    });
  });

  it("crafts level 15 weapon and offhand recipes only with matching level 10 equipment types", () => {
    let weaponState = createCraftingState();
    weaponState = addItems(weaponState, [
      ["iron_sword", 1],
      ["iron_ore", 20],
      ["crawler_plate_t2", 2],
      ["wolf_fang_t2", 2],
    ]);
    weaponState = setCurrencyBalanceForDebug(weaponState, "crowns", 50).state;

    expect(craftRecipe(weaponState, "steel_sword").result.status).toBe("success");

    let wrongTypeState = createCraftingState();
    wrongTypeState = addItems(wrongTypeState, [
      ["guard_mace", 1],
      ["iron_ore", 20],
      ["crawler_plate_t2", 2],
      ["wolf_fang_t2", 2],
    ]);
    wrongTypeState = setCurrencyBalanceForDebug(
      wrongTypeState,
      "crowns",
      50,
    ).state;

    expect(craftRecipe(wrongTypeState, "steel_sword").result).toEqual({
      status: "failed",
      recipeId: "steel_sword",
      reason: "missing_materials",
    });

    let offhandState = createCraftingState();
    offhandState = addItems(offhandState, [
      ["wooden_shield", 1],
      ["iron_ore", 20],
      ["hardwood", 10],
      ["crawler_plate_t2", 3],
    ]);
    offhandState = setCurrencyBalanceForDebug(offhandState, "crowns", 50).state;

    expect(craftRecipe(offhandState, "reinforced_shield").result.status).toBe(
      "success",
    );
  });

  it("records the previous equipment consumed by a level 15 upgrade", () => {
    let state = createCraftingState();
    state = addItems(state, [
      ["iron_sword", 1],
      ["iron_ore", 20],
      ["crawler_plate_t2", 2],
      ["wolf_fang_t2", 2],
    ]);
    state = setCurrencyBalanceForDebug(state, "crowns", 50).state;
    state = startDebugTelemetryRecording(state);

    const result = craftRecipe(state, "steel_sword");
    const successEvent = getDebugTelemetryEvents(result.state).find(
      (event) => event.type === "craft_succeeded",
    );

    expect(result.result.status).toBe("success");
    expect(successEvent?.consumedCraftingItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "equipment",
          itemId: "iron_sword",
          itemDisplayName: "Iron Sword",
          quantity: 1,
          equipmentType: "one_handed_sword",
          levelRequirement: 10,
        }),
      ]),
    );
  });
});

function createCraftingState(options: {
  leaderPosition?: { x: number; y: number };
  inventory?: GameState["inventory"];
  quests?: GameState["quests"];
} = {}): GameState {
  const leader = createCompanion(
    "leader",
    options.leaderPosition ?? { x: 0, y: 0 },
    "Leader",
  );
  const smith = createNpc("smith", { x: 1, y: 0 }, "Smith", "smith");

  return createTestGameState({
    entities: {
      [leader.id]: leader,
      [smith.id]: smith,
    },
    partyLeaderId: leader.id,
    ...(options.inventory ? { inventory: options.inventory } : {}),
    ...(options.quests ? { quests: options.quests } : {}),
  });
}

function addItems(
  state: GameState,
  items: Array<[ItemId, number]>,
): GameState {
  return items.reduce(
    (nextState, [itemId, quantity]) =>
      addItemToInventoryState(nextState, itemId, quantity, "debug").state,
    state,
  );
}

function getTeleportEchoCraftingCosts(): Array<[ItemId, number]> {
  return [
    ["slime_gel_t1", 12],
    ["slime_core_t1", 2],
    ["bat_wing_t1", 8],
    ["bat_ear_t1", 1],
    ["spider_silk_t1", 8],
    ["spider_fang_t1", 1],
    ["goblin_ear_t1", 8],
    ["goblin_tooth_t1", 1],
    ["imp_horn_chip_t1", 8],
    ["imp_tail_t1", 1],
    ["wolf_pelt", 6],
    ["wolf_fang", 1],
    ["crawler_pebble_t1", 6],
    ["crawler_plate_t1", 1],
    ["moss_tuft_t1", 6],
    ["mossling_cap_t1", 1],
  ];
}

function getPlannedCraftedEquipmentIds(): ItemId[] {
  return Object.values(ITEM_DEFINITIONS)
    .filter(
      (itemDefinition) =>
        itemDefinition.category === "equipment" &&
        [1, 5, 10, 15].includes(itemDefinition.levelRequirement ?? 1),
    )
    .map((itemDefinition) => itemDefinition.id);
}

function getDebugTelemetryEvents(state: GameState): DebugTelemetryEvent[] {
  return state.debugTelemetry?.events ?? [];
}

function expectRecipeGroupOrder(
  sortedRecipeIds: ItemId[],
  expectedGroup: ItemId[],
): void {
  const startIndex = sortedRecipeIds.indexOf(expectedGroup[0]);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(sortedRecipeIds.slice(startIndex, startIndex + expectedGroup.length)).toEqual(
    expectedGroup,
  );
}
