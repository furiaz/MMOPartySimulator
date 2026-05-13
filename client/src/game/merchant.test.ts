import { describe, expect, it } from "vitest";
import { addEntity } from "./state";
import { addItemToInventoryState } from "./inventory";
import { createNpc } from "./entities";
import { createTestGameState } from "./testState";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import {
  getCurrencyBalance,
  setCurrencyBalanceForDebug,
} from "./wallet";
import {
  getQuickExchangeItems,
  quickExchangeParts,
} from "./merchant";

const MERCHANT_ID = "test-merchant";

function createMerchantState() {
  return addEntity(
    createTestGameState({ currentMapId: "hub" }),
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
