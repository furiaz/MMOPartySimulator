import { describe, expect, it } from "vitest";
import {
  addItemToInventoryState,
  countInventoryItem,
  createEmptyPartyInventory,
} from "./inventory";
import { createTestGameState } from "./testState";

describe("prototype inventory", () => {
  it("stacks items up to slot capacity and reports overflow", () => {
    const state = createTestGameState({
      inventory: createEmptyPartyInventory(1),
    });

    const { state: nextState, result } = addItemToInventoryState(
      state,
      "wood",
      300,
      "debug",
    );

    expect(result).toEqual({
      status: "partial",
      itemId: "wood",
      requestedQuantity: 300,
      addedQuantity: 250,
      overflowQuantity: 50,
    });
    expect(nextState.inventory.slots).toEqual([{ itemId: "wood", quantity: 250 }]);
    expect(countInventoryItem(nextState.inventory, "wood")).toBe(250);
  });

  it("rejects invalid item quantities without changing inventory", () => {
    const state = createTestGameState();

    const { state: nextState, result } = addItemToInventoryState(
      state,
      "ore",
      0,
      "debug",
    );

    expect(result.status).toBe("failed_invalid");
    expect(result.addedQuantity).toBe(0);
    expect(nextState.inventory.slots).toEqual([]);
  });
});
