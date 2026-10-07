import { describe, expect, it } from "vitest";
import { addEntity } from "./state";
import {
  addItemToInventoryState,
  countInventoryItem,
  toggleInventorySlotLock,
} from "./inventory";
import { createCompanion, createNpc } from "./entities";
import { createTestGameState } from "./testState";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import {
  getCurrencyBalance,
  setCurrencyBalanceForDebug,
} from "./wallet";
import {
  buyMerchantItem,
  buyMerchantFarmSeed,
  buyMerchantLivestockCreature,
  getFilteredMerchantBuyStock,
  getMerchantLivestockStock,
  getMerchantBuyStock,
  getMerchantSellEntries,
  getMerchantSecondaryFilterOptions,
  isMerchantFirstAidPurchaseRequired,
  isMerchantStockEntryCompatibleWithParty,
  sellMerchantItem,
} from "./merchant";
import { getItemDefinition } from "./items";
import { createInitialQuestStates } from "./questSystem";
import { LIVESTOCK_DUSKHEN_CREATURE_ID } from "./livestock";
import { FARM_POTATO_CROP_ID } from "./farm";

const MERCHANT_ID = "test-merchant";

function createMerchantState() {
  const quests = createInitialQuestStates();
  quests.outfit_the_expedition = {
    ...quests.outfit_the_expedition,
    status: "completed",
  };

  return addEntity(
    createTestGameState({ currentMapId: "hub", quests }),
    createNpc(MERCHANT_ID, { x: 1, y: 1 }, "Merchant", "merchant"),
  );
}

function createMerchantTutorialState() {
  const quests = createInitialQuestStates();
  quests.outfit_the_expedition = {
    ...quests.outfit_the_expedition,
    status: "active",
  };

  return addEntity(
    createTestGameState({ currentMapId: "hub", quests }),
    createNpc(MERCHANT_ID, { x: 1, y: 1 }, "Merchant", "merchant"),
  );
}

describe("merchant buy", () => {
  it("returns fixed starter equipment and consumable stock for merchant NPCs", () => {
    const stock = getMerchantBuyStock(createMerchantState(), MERCHANT_ID);

    expect(stock).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: "minor_recovery_flask",
          priceCrowns: 30,
          group: "flasks",
        }),
        expect.objectContaining({
          itemId: "first_aid_skill_book",
          priceCrowns: 25,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "follow_through_skill_book",
          priceCrowns: 25,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "resourcefulness_skill_book",
          priceCrowns: 25,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "steady_nerves_skill_book",
          priceCrowns: 25,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "duelist_challenge_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "duelists_momentum_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "rooted_bastion_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "headhunter_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "blood_scent_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "flash_step_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "shield_challenge_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "shield_shockwave_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "pinning_shot_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "arrow_burst_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "threatening_roar_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "maul_sweep_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "binding_rune_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "rune_step_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "blinding_ray_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "circle_of_renewal_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "whip_prison_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "atonement_step_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "arcane_crescendo_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "living_inscription_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "many_beacons_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "cruel_mercy_skill_book",
          priceCrowns: 60,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "veteran_sword",
          priceCrowns: 180,
          group: "weapons",
        }),
        expect.objectContaining({
          itemId: "tower_shield",
          priceCrowns: 135,
          group: "offhands",
        }),
        expect.objectContaining({
          itemId: "ironhold_cuirass",
          priceCrowns: 210,
          group: "plate",
        }),
      ]),
    );
    expect(stock.map((stockEntry) => stockEntry.itemId)).not.toEqual(
      expect.arrayContaining([
        "training_sword",
        "guard_coif",
        "scout_cap",
        "plain_charm",
        "stalker_mask",
        "vanguard_coif",
        "iron_sword",
        "steel_sword",
        "reinforced_shield",
        "bastion_cuirass",
        "acolyte_robe",
        "blessed_robe",
        "hearty_trail_rations",
        "skirmisher_rations",
      ]),
    );
  });

  it("keeps non-craftable equipment prices in merchant stock", () => {
    const stock = getMerchantBuyStock(createMerchantState(), MERCHANT_ID);
    const pricesByItemId = Object.fromEntries(
      stock.map((stockEntry) => [stockEntry.itemId, stockEntry.priceCrowns]),
    );

    expect(pricesByItemId).toMatchObject({
      veteran_sword: 180,
      ironhold_mace: 180,
      deep_rune_lantern: 180,
      veteran_quiver: 135,
      oath_dagger: 135,
      tower_shield: 135,
      sanctuary_robe: 210,
      wayfarer_jacket: 210,
      ironward_hauberk: 210,
      ironhold_cuirass: 210,
      conqueror_cuirass: 210,
    });
  });

  it("buys stock equipment into shared inventory for Crowns", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 200).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "veteran_sword",
    );

    expect(result).toMatchObject({
      status: "success",
      itemId: "veteran_sword",
      priceCrowns: 180,
      previousCrowns: 200,
      newCrowns: 20,
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(20);
    expect(countInventoryItem(nextState.inventory, "veteran_sword")).toBe(1);
  });

  it("buys stock consumables into shared inventory for Crowns", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "minor_recovery_flask",
    );

    expect(result).toMatchObject({
      status: "success",
      itemId: "minor_recovery_flask",
      priceCrowns: 30,
      previousCrowns: 100,
      newCrowns: 70,
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(70);
    expect(countInventoryItem(nextState.inventory, "minor_recovery_flask")).toBe(1);
  });

  it("buys skill books into shared inventory for Crowns", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "first_aid_skill_book",
    );

    expect(result).toMatchObject({
      status: "success",
      itemId: "first_aid_skill_book",
      priceCrowns: 25,
      previousCrowns: 100,
      newCrowns: 75,
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(75);
    expect(countInventoryItem(nextState.inventory, "first_aid_skill_book")).toBe(1);
  });

  it("does not expose standalone materials in Merchant Buy stock", () => {
    const state = createMerchantState();

    const stock = getFilteredMerchantBuyStock(state, MERCHANT_ID);

    expect(
      stock.some(
        (entry) => getItemDefinition(entry.itemId)?.category === "material",
      ),
    ).toBe(false);
  });

  it("does not mutate state when Crowns are insufficient", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 5).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "veteran_sword",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "insufficient_crowns",
      previousCrowns: 5,
      newCrowns: 5,
    });
    expect(nextState.inventory).toEqual(state.inventory);
    expect(nextState.wallet).toEqual(state.wallet);
  });

  it("does not mutate state when inventory is full", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 200).state;

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "veteran_sword",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "inventory_full",
      previousCrowns: 200,
      newCrowns: 200,
    });
    expect(nextState.inventory).toEqual(state.inventory);
    expect(nextState.wallet).toEqual(state.wallet);
  });

  it("allows stackable consumable purchases when full inventory has matching stack space", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;
    state = addItemToInventoryState(state, "minor_recovery_flask", 98, "debug").state;

    for (let index = 1; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "minor_recovery_flask",
    );

    expect(result.status).toBe("success");
    expect(countInventoryItem(nextState.inventory, "minor_recovery_flask")).toBe(99);
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(70);
  });

  it("fails safely for invalid merchants and non-stock items", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    const invalidMerchantResult = buyMerchantItem(
      state,
      "missing-merchant",
      "training_sword",
    );
    const nonStockResult = buyMerchantItem(state, MERCHANT_ID, "slime_core_t1");

    expect(invalidMerchantResult.result).toMatchObject({
      status: "failed",
      reason: "invalid_merchant",
    });
    expect(nonStockResult.result).toMatchObject({
      status: "failed",
      reason: "item_not_in_stock",
    });
    expect(invalidMerchantResult.state.inventory).toEqual(state.inventory);
    expect(invalidMerchantResult.state.wallet).toEqual(state.wallet);
    expect(nonStockResult.state.inventory).toEqual(state.inventory);
    expect(nonStockResult.state.wallet).toEqual(state.wallet);
  });

  it("allows buying equipment before class or level requirements are met", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 200).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "veteran_sword",
    );

    expect(result.status).toBe("success");
    expect(countInventoryItem(nextState.inventory, "veteran_sword")).toBe(1);
  });

  it("records buy telemetry while debug recording is active", () => {
    let state = startDebugTelemetryRecording(createMerchantState());
    state = setCurrencyBalanceForDebug(state, "crowns", 200).state;

    const { state: nextState } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "veteran_sword",
    );

    expect(nextState.debugTelemetry?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "merchant_buy_attempt",
        "merchant_buy_currency_removed",
        "merchant_buy_item_added",
        "merchant_buy_completed",
      ]),
    );
    expect(nextState.debugTelemetry?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "merchant_buy_completed",
          entityId: MERCHANT_ID,
          itemId: "veteran_sword",
          currencyAmount: 180,
          previousCurrencyBalance: 200,
          nextCurrencyBalance: 20,
        }),
      ]),
    );
  });

  it("filters merchant stock by main filter, secondary filter, and party compatibility", () => {
    let state = createMerchantStateWithParty();
    const stock = getMerchantBuyStock(state, MERCHANT_ID);

    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, { mainFilter: "flasks" })
        .map((entry) => entry.itemId),
    ).toEqual(["minor_recovery_flask", "soldiers_recovery_flask"]);
    expect(
      getMerchantSecondaryFilterOptions(stock, "weapons"),
    ).toEqual(
      expect.arrayContaining([
        { id: "bow", label: "Bow" },
        { id: "one_handed_sword", label: "One-Handed Sword" },
      ]),
    );
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "weapons",
        secondaryFilter: "one_handed_sword",
        partyCompatibleOnly: true,
      }).map((entry) => entry.itemId),
    ).toEqual([]);
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "weapons",
        secondaryFilter: "one_handed_sword",
        partyCompatibleOnly: true,
      }),
    ).toEqual([]);

    const blade = createCompanion("blade", { x: 0, y: 0 }, "blade", "fighter", 0, "blade");
    state = addEntity(state, blade);

    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "weapons",
        secondaryFilter: "one_handed_sword",
        partyCompatibleOnly: true,
      }).map((entry) => entry.itemId),
    ).toEqual(["veteran_sword"]);
  });

  it("treats both Training Sword variants as compatible with a first-class party", () => {
    const hunter = createCompanion(
      "hunter",
      { x: 0, y: 0 },
      "hunter",
      "fighter",
      0,
      "hunter",
    );
    const state = addEntity(createMerchantState(), hunter);

    expect(
      isMerchantStockEntryCompatibleWithParty(state, {
        itemId: "training_sword",
        priceCrowns: 12,
        group: "weapons",
      }),
    ).toBe(true);
    expect(
      isMerchantStockEntryCompatibleWithParty(state, {
        itemId: "copper_training_sword",
        priceCrowns: 28,
        group: "weapons",
      }),
    ).toBe(true);
  });

  it("filters merchant books by class", () => {
    const state = createMerchantStateWithParty();
    const stock = getMerchantBuyStock(state, MERCHANT_ID);

    expect(getMerchantSecondaryFilterOptions(stock, "books")).toEqual(
      expect.arrayContaining([
        { id: "beginner", label: "Beginner" },
        { id: "blade", label: "Blade" },
        { id: "aegis", label: "Aegis" },
      ]),
    );
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "books",
        secondaryFilter: "beginner",
      }).map((entry) => entry.itemId),
    ).toContain("first_aid_skill_book");
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "books",
        secondaryFilter: "beginner",
      }).map((entry) => entry.itemId),
    ).toEqual(
      expect.arrayContaining([
        "resourcefulness_skill_book",
        "steady_nerves_skill_book",
      ]),
    );
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "books",
        secondaryFilter: "blade",
      }).map((entry) => entry.itemId),
    ).toContain("duelist_challenge_skill_book");
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "books",
        secondaryFilter: "blade",
      }).map((entry) => entry.itemId),
    ).not.toContain("first_aid_skill_book");
  });

  it("filters merchant stock by level requirement range", () => {
    const state = createMerchantStateWithParty();

    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "weapons",
        secondaryFilter: "one_handed_sword",
        minLevelRequirement: 15,
        maxLevelRequirement: 20,
      }).map((entry) => entry.itemId),
    ).toEqual(["veteran_sword"]);
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "weapons",
        secondaryFilter: "one_handed_sword",
        minLevelRequirement: 15,
        maxLevelRequirement: 15,
      }).map((entry) => entry.itemId),
    ).toEqual([]);
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "plate",
        secondaryFilter: "chest",
        minLevelRequirement: 20,
      }).map((entry) => entry.itemId),
    ).toEqual(["ironhold_cuirass", "conqueror_cuirass"]);
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "weapons",
        secondaryFilter: "one_handed_sword",
        maxLevelRequirement: 10,
      }).map((entry) => entry.itemId),
    ).toEqual([]);
  });
});

describe("merchant livestock", () => {
  it("sells one Duskhen at a time and scales price by owned count", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 500).state;

    expect(getMerchantLivestockStock(state, MERCHANT_ID)[0]).toMatchObject({
      creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
      ownedCount: 2,
      priceCrowns: 200,
    });

    const firstPurchase = buyMerchantLivestockCreature(
      state,
      MERCHANT_ID,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      1000,
    );

    expect(firstPurchase.result).toMatchObject({
      status: "success",
      creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
      priceCrowns: 200,
      previousCrowns: 500,
      newCrowns: 300,
      ownedCount: 3,
    });
    expect(
      firstPurchase.state.livestock?.ownedCreaturesById.duskhen,
    ).toBe(3);
    expect(firstPurchase.state.inventory.slots).toEqual([]);
    expect(getMerchantLivestockStock(firstPurchase.state, MERCHANT_ID)[0])
      .toMatchObject({
        ownedCount: 3,
        priceCrowns: 300,
      });
  });

  it("fails Duskhen purchase without enough Crowns", () => {
    const state = setCurrencyBalanceForDebug(createMerchantState(), "crowns", 50)
      .state;

    const purchase = buyMerchantLivestockCreature(
      state,
      MERCHANT_ID,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      1000,
    );

    expect(purchase.result).toMatchObject({
      status: "failed",
      reason: "insufficient_crowns",
      previousCrowns: 50,
      newCrowns: 50,
    });
    expect(purchase.state.livestock?.ownedCreaturesById.duskhen).toBe(2);
  });
});

describe("merchant sell", () => {
  it("lists merchant stock and enemy parts under their sell filters", () => {
    let state = createMerchantState();
    state = addItemToInventoryState(state, "minor_recovery_flask", 2, "debug").state;
    state = addItemToInventoryState(state, "goblin_tooth_t2", 3, "debug").state;
    state = addItemToInventoryState(state, "wood", 4, "debug").state;

    expect(getMerchantSellEntries(state, MERCHANT_ID)).toEqual([
      expect.objectContaining({
        itemId: "minor_recovery_flask",
        quantity: 2,
        unitPriceCrowns: 30,
        source: "merchant_stock",
      }),
      expect.objectContaining({
        itemId: "goblin_tooth_t2",
        quantity: 3,
        unitPriceCrowns: 16,
        source: "enemy_part",
      }),
    ]);
    expect(
      getMerchantSellEntries(state, MERCHANT_ID, "merchant_items").map(
        (entry) => entry.itemId,
      ),
    ).toEqual(["minor_recovery_flask"]);
    expect(
      getMerchantSellEntries(state, MERCHANT_ID, "enemy_parts").map(
        (entry) => entry.itemId,
      ),
    ).toEqual(["goblin_tooth_t2"]);
  });

  it("sells a selected quantity from one enemy-part stack", () => {
    let state = createMerchantState();
    state = addItemToInventoryState(state, "crawler_plate_t2", 5, "debug").state;

    const sale = sellMerchantItem(state, MERCHANT_ID, 0, 3);

    expect(sale.result).toMatchObject({
      status: "success",
      itemId: "crawler_plate_t2",
      soldQuantity: 3,
      unitPriceCrowns: 20,
      totalPriceCrowns: 60,
      previousCrowns: 0,
      newCrowns: 60,
    });
    expect(countInventoryItem(sale.state.inventory, "crawler_plate_t2")).toBe(2);
    expect(getCurrencyBalance(sale.state.wallet, "crowns")).toBe(60);
  });

  it("refunds merchant stock items at their full current buy price", () => {
    let state = createMerchantState();
    state = addItemToInventoryState(state, "veteran_sword", 1, "debug").state;

    const sale = sellMerchantItem(state, MERCHANT_ID, 0, 1);

    expect(sale.result).toMatchObject({
      status: "success",
      itemId: "veteran_sword",
      soldQuantity: 1,
      unitPriceCrowns: 180,
      totalPriceCrowns: 180,
      newCrowns: 180,
    });
    expect(countInventoryItem(sale.state.inventory, "veteran_sword")).toBe(0);
  });

  it("rejects locked slots, ineligible materials, and invalid quantities without mutation", () => {
    let state = createMerchantState();
    state = addItemToInventoryState(state, "slime_gel_t1", 4, "debug").state;
    state = addItemToInventoryState(state, "wood", 4, "debug").state;
    const unlockedState = state;
    state = {
      ...state,
      inventory: toggleInventorySlotLock(state.inventory, 0),
    };

    const lockedSale = sellMerchantItem(state, MERCHANT_ID, 0, 1);
    const ineligibleSale = sellMerchantItem(state, MERCHANT_ID, 1, 1);
    const oversizedSale = sellMerchantItem(unlockedState, MERCHANT_ID, 0, 5);

    expect(lockedSale.result).toMatchObject({
      status: "failed",
      reason: "slot_locked",
    });
    expect(ineligibleSale.result).toMatchObject({
      status: "failed",
      reason: "item_not_sellable",
    });
    expect(oversizedSale.result).toMatchObject({
      status: "failed",
      reason: "invalid_quantity",
    });
    expect(lockedSale.state.inventory).toEqual(state.inventory);
    expect(ineligibleSale.state.inventory).toEqual(state.inventory);
    expect(lockedSale.state.wallet).toEqual(state.wallet);
    expect(ineligibleSale.state.wallet).toEqual(state.wallet);
    expect(oversizedSale.state.inventory).toEqual(unlockedState.inventory);
    expect(oversizedSale.state.wallet).toEqual(unlockedState.wallet);
  });

  it("records sale telemetry while debug recording is active", () => {
    let state = startDebugTelemetryRecording(createMerchantState());
    state = addItemToInventoryState(state, "slime_core_t1", 2, "debug").state;

    const sale = sellMerchantItem(state, MERCHANT_ID, 0, 2);

    expect(sale.state.debugTelemetry?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "merchant_sell_attempt",
        "merchant_sell_item_removed",
        "merchant_sell_currency_added",
        "merchant_sell_completed",
      ]),
    );
    expect(sale.state.debugTelemetry?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "merchant_sell_completed",
          entityId: MERCHANT_ID,
          itemId: "slime_core_t1",
          requestedQuantity: 2,
          removedQuantity: 2,
          currencyAmount: 8,
          previousCurrencyBalance: 0,
          nextCurrencyBalance: 8,
        }),
      ]),
    );
  });
});

describe("merchant First Aid tutorial gate", () => {
  it("pins First Aid, blocks other purchases, and leaves selling available", () => {
    let state = createMerchantTutorialState();
    state = setCurrencyBalanceForDebug(state, "crowns", 500).state;
    state = addItemToInventoryState(state, "slime_gel_t1", 2, "debug").state;

    expect(isMerchantFirstAidPurchaseRequired(state)).toBe(true);
    expect(getMerchantBuyStock(state, MERCHANT_ID)[0]?.itemId).toBe(
      "first_aid_skill_book",
    );
    expect(
      buyMerchantItem(state, MERCHANT_ID, "minor_recovery_flask").result,
    ).toMatchObject({ status: "failed", reason: "first_aid_purchase_required" });
    expect(
      buyMerchantFarmSeed(
        state,
        MERCHANT_ID,
        FARM_POTATO_CROP_ID,
        1000,
      ).result,
    ).toMatchObject({ status: "failed", reason: "first_aid_purchase_required" });
    expect(
      buyMerchantLivestockCreature(
        state,
        MERCHANT_ID,
        LIVESTOCK_DUSKHEN_CREATURE_ID,
        1000,
      ).result,
    ).toMatchObject({ status: "failed", reason: "first_aid_purchase_required" });

    const saleEntry = getMerchantSellEntries(state, MERCHANT_ID)[0];
    const sale = sellMerchantItem(state, MERCHANT_ID, saleEntry.slotIndex, 2);

    expect(sale.result).toMatchObject({
      status: "success",
      itemId: "slime_gel_t1",
      totalPriceCrowns: 2,
    });
  });

  it("unlocks the remaining stock immediately after First Aid is purchased", () => {
    let state = createMerchantTutorialState();
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    const firstAidPurchase = buyMerchantItem(
      state,
      MERCHANT_ID,
      "first_aid_skill_book",
    );

    expect(firstAidPurchase.result.status).toBe("success");
    expect(isMerchantFirstAidPurchaseRequired(firstAidPurchase.state)).toBe(false);
    expect(
      buyMerchantItem(
        firstAidPurchase.state,
        MERCHANT_ID,
        "minor_recovery_flask",
      ).result.status,
    ).toBe("success");
  });
});

function createMerchantStateWithParty() {
  const leader = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");

  return addEntity(
    addEntity(createMerchantState(), leader),
    createCompanion("companion-2", { x: 1, y: 0 }, leader.id),
  );
}
