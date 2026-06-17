import { describe, expect, it } from "vitest";
import { addEntity } from "./state";
import { addItemToInventoryState, countInventoryItem } from "./inventory";
import { createCompanion, createNpc } from "./entities";
import { createTestGameState } from "./testState";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import {
  getCurrencyBalance,
  setCurrencyBalanceForDebug,
} from "./wallet";
import {
  buyMerchantItem,
  getFilteredMerchantBuyStock,
  getMerchantBuyStock,
  getMerchantSecondaryFilterOptions,
  getQuickExchangeItems,
  quickExchangeParts,
} from "./merchant";
import { createInitialQuestStates } from "./questSystem";

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

describe("merchant quick exchange", () => {
  it("returns no_items without changing inventory or wallet", () => {
    const state = addItemToInventoryState(createMerchantState(), "wood", 20, "debug").state;
    const { state: nextState, result } = quickExchangeParts(state, MERCHANT_ID);

    expect(result.status).toBe("no_items");
    expect(nextState.inventory).toEqual(state.inventory);
    expect(nextState.wallet).toEqual(state.wallet);
  });

  it("exchanges mixed junk for exact Crown value", () => {
    let state = createMerchantState();
    state = addItemToInventoryState(state, "slime_gel_t1", 2, "debug").state;
    state = addItemToInventoryState(state, "wolf_pelt", 1, "debug").state;
    state = addItemToInventoryState(state, "orc_hide", 3, "debug").state;
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;

    const { state: nextState, result } = quickExchangeParts(state, MERCHANT_ID);

    expect(result).toMatchObject({
      status: "success",
      totalExchangeValue: 30,
      previousCrowns: 10,
      newCrowns: 40,
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(40);
    expect(getQuickExchangeItems(nextState)).toEqual([]);
  });

  it("does not exchange materials or equipment", () => {
    let state = createMerchantState();
    state = addItemToInventoryState(state, "softwood", 5, "debug").state;
    state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    state = addItemToInventoryState(state, "wolf_fang", 2, "debug").state;

    const { state: nextState, result } = quickExchangeParts(state, MERCHANT_ID);

    expect(result.status).toBe("success");
    expect(result.totalExchangeValue).toBe(28);
    expect(nextState.inventory.slots).toEqual([
      { itemId: "softwood", quantity: 5 },
      { itemId: "training_sword", quantity: 1 },
    ]);
  });

  it("fails safely if inventory removal fails", () => {
    let state = createMerchantState();
    state = addItemToInventoryState(state, "goblin_tooth_t1", 2, "debug").state;

    const { state: nextState, result } = quickExchangeParts(state, MERCHANT_ID, {
      removeItemFromInventory: (currentState, itemId, quantity) => ({
        state: currentState,
        result: {
          status: "partial",
          itemId,
          requestedQuantity: quantity,
          removedQuantity: 1,
          remainingQuantity: quantity - 1,
        },
      }),
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "remove_partial",
      totalExchangeValue: 20,
    });
    expect(nextState.inventory).toEqual(state.inventory);
    expect(nextState.wallet).toEqual(state.wallet);
  });

  it("records development telemetry while debug recording is active", () => {
    let state = startDebugTelemetryRecording(createMerchantState());
    state = addItemToInventoryState(state, "slime_gel_t1", 1, "debug").state;

    const { state: nextState } = quickExchangeParts(state, MERCHANT_ID);

    expect(nextState.debugTelemetry?.events.map((event) => event.type)).toContain(
      "quick_exchange_completed",
    );
    expect(nextState.debugTelemetry?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "quick_exchange_item_selected",
          entityId: MERCHANT_ID,
          itemId: "slime_gel_t1",
          quantitySold: 1,
          valueEach: 1,
          totalItemValue: 1,
          totalExchangeValue: 1,
        }),
        expect.objectContaining({
          type: "quick_exchange_currency_added",
          entityId: MERCHANT_ID,
          previousCurrencyBalance: 0,
          nextCurrencyBalance: 1,
          totalExchangeValue: 1,
        }),
      ]),
    );
  });
});

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
          itemId: "hearty_trail_rations",
          priceCrowns: 15,
          group: "food",
        }),
        expect.objectContaining({
          itemId: "first_aid_skill_book",
          priceCrowns: 25,
          group: "books",
        }),
        expect.objectContaining({
          itemId: "duelist_challenge_skill_book",
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
          itemId: "training_sword",
          priceCrowns: 12,
          group: "weapons",
        }),
        expect.objectContaining({
          itemId: "plain_charm",
          priceCrowns: 25,
          group: "accessories",
        }),
      ]),
    );
  });

  it("prices armor stock by early Tier 1 unlock progression", () => {
    const stock = getMerchantBuyStock(createMerchantState(), MERCHANT_ID);
    const pricesByItemId = Object.fromEntries(
      stock.map((stockEntry) => [stockEntry.itemId, stockEntry.priceCrowns]),
    );

    expect(pricesByItemId).toMatchObject({
      guard_coif: 26,
      guard_hauberk: 35,
      guard_legguards: 28,
      guard_gloves: 24,
      guard_boots: 24,
      stalker_mask: 44,
      stalker_vest: 60,
      stalker_leggings: 50,
      stalker_grips: 46,
      stalker_boots: 44,
      acolyte_robe: 82,
      acolyte_pants: 62,
      acolyte_wraps: 52,
      acolyte_sandals: 52,
      scholar_hood: 62,
      scholar_robe: 82,
      scholar_pants: 62,
      scholar_gloves: 52,
      scholar_sandals: 52,
    });
  });

  it("buys stock equipment into shared inventory for Crowns", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "training_sword",
    );

    expect(result).toMatchObject({
      status: "success",
      itemId: "training_sword",
      priceCrowns: 12,
      previousCrowns: 100,
      newCrowns: 88,
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(88);
    expect(countInventoryItem(nextState.inventory, "training_sword")).toBe(1);
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

  it("does not mutate state when Crowns are insufficient", () => {
    let state = createMerchantState();
    state = setCurrencyBalanceForDebug(state, "crowns", 5).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "training_sword",
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
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "plain_charm",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "inventory_full",
      previousCrowns: 100,
      newCrowns: 100,
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
    const nonStockResult = buyMerchantItem(state, MERCHANT_ID, "holy_lantern");

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
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    const { state: nextState, result } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "iron_sword",
    );

    expect(result.status).toBe("success");
    expect(countInventoryItem(nextState.inventory, "iron_sword")).toBe(1);
  });

  it("records buy telemetry while debug recording is active", () => {
    let state = startDebugTelemetryRecording(createMerchantState());
    state = setCurrencyBalanceForDebug(state, "crowns", 100).state;

    const { state: nextState } = buyMerchantItem(
      state,
      MERCHANT_ID,
      "training_sword",
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
          itemId: "training_sword",
          currencyAmount: 12,
          previousCurrencyBalance: 100,
          nextCurrencyBalance: 88,
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
        { id: "training_sword", label: "Training Sword" },
        { id: "one_handed_sword", label: "One-Handed Sword" },
      ]),
    );
    expect(
      getFilteredMerchantBuyStock(state, MERCHANT_ID, {
        mainFilter: "weapons",
        secondaryFilter: "training_sword",
        partyCompatibleOnly: true,
      }).map((entry) => entry.itemId),
    ).toEqual(["training_sword"]);
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
    ).toEqual(["iron_sword"]);
  });
});

function createMerchantStateWithParty() {
  const leader = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");

  return addEntity(
    addEntity(createMerchantState(), leader),
    createCompanion("companion-2", { x: 1, y: 0 }, leader.id),
  );
}
