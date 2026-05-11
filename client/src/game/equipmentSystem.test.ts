import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import { createEmptyPartyInventory, addItemToInventoryState } from "./inventory";
import {
  equipItemToCompanion,
  unequipItemFromCompanion,
} from "./equipmentSystem";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { ClassId, Companion, ItemId } from "./types";

function createStateWithCompanion(
  classId: ClassId,
  itemIds: ItemId[] = [],
  capacity = 10,
): { state: GameState; companion: Companion } {
  const companion = createCompanion(
    "companion-1",
    { x: 0, y: 0 },
    "companion-1",
    "fighter",
    0,
    classId,
  );
  const state = itemIds.reduce(
    (nextState, itemId) =>
      addItemToInventoryState(nextState, itemId, 1, "debug").state,
    createTestGameState({
      entities: { [companion.id]: companion },
      inventory: createEmptyPartyInventory(capacity),
      partyLeaderId: companion.id,
      followTrailsByEntityId: { [companion.id]: [] },
    }),
  );

  return { state, companion };
}

describe("prototype equipment system", () => {
  it("equips valid class gear and removes it from inventory", () => {
    const { state, companion } = createStateWithCompanion("blade", ["iron_sword"]);

    const { state: nextState, result } = equipItemToCompanion(
      state,
      companion.id,
      "iron_sword",
      "mainHand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("iron_sword");
    expect(nextState.inventory.slots).toEqual([]);
  });

  it("rejects equipment for invalid classes with a clear reason", () => {
    const { state, companion } = createStateWithCompanion("blade", [
      "wooden_shield",
    ]);

    const { state: nextState, result } = equipItemToCompanion(
      state,
      companion.id,
      "wooden_shield",
      "offhand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result).toMatchObject({
      status: "failed",
      reason: "invalid_class",
    });
    expect(nextCompanion.equipment.offhand).toBeNull();
    expect(nextState.inventory.slots).toEqual([
      { itemId: "wooden_shield", quantity: 1 },
    ]);
  });

  it("rejects equipment placed into an invalid slot", () => {
    const { state, companion } = createStateWithCompanion("blade", ["iron_sword"]);

    const { result } = equipItemToCompanion(
      state,
      companion.id,
      "iron_sword",
      "offhand",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "invalid_slot",
    });
  });

  it("blocks offhand equipment while a both-hands weapon is equipped", () => {
    const { state, companion } = createStateWithCompanion("hunter", [
      "short_bow",
      "wooden_shield",
    ]);
    const bowState = equipItemToCompanion(
      state,
      companion.id,
      "short_bow",
      "mainHand",
    ).state;

    const { result } = equipItemToCompanion(
      bowState,
      companion.id,
      "wooden_shield",
      "offhand",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "offhand_blocked_by_both_hands",
    });
  });

  it("returns replaced equipment to inventory without deleting items", () => {
    const { state, companion } = createStateWithCompanion("aegis", [
      "training_mace",
      "wooden_shield",
      "cloth_cap",
    ]);
    const equippedState = equipItemToCompanion(
      equipItemToCompanion(
        state,
        companion.id,
        "training_mace",
        "mainHand",
      ).state,
      companion.id,
      "wooden_shield",
      "offhand",
    ).state;

    const { state: nextState, result } = equipItemToCompanion(
      equippedState,
      companion.id,
      "cloth_cap",
      "head",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("training_mace");
    expect(nextCompanion.equipment.offhand).toBe("wooden_shield");
    expect(nextCompanion.equipment.head).toBe("cloth_cap");
  });

  it("clears and returns offhand when equipping a both-hands weapon", () => {
    const { state, companion } = createStateWithCompanion("aegis", [
      "training_mace",
      "wooden_shield",
      "short_bow",
    ]);
    const equippedState = equipItemToCompanion(
      equipItemToCompanion(
        state,
        companion.id,
        "training_mace",
        "mainHand",
      ).state,
      companion.id,
      "wooden_shield",
      "offhand",
    ).state;
    const hunter = {
      ...(equippedState.entities[companion.id] as Companion),
      classId: "hunter" as const,
    };
    const hunterState = {
      ...equippedState,
      entities: {
        ...equippedState.entities,
        [companion.id]: hunter,
      },
    };

    const { state: nextState, result } = equipItemToCompanion(
      hunterState,
      companion.id,
      "short_bow",
      "mainHand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("short_bow");
    expect(nextCompanion.equipment.offhand).toBeNull();
    expect(nextState.inventory.slots).toEqual(
      expect.arrayContaining([
        { itemId: "training_mace", quantity: 1 },
        { itemId: "wooden_shield", quantity: 1 },
      ]),
    );
  });

  it("does not unequip when inventory is full", () => {
    const { state, companion } = createStateWithCompanion("blade", [
      "iron_sword",
      "wood",
    ], 1);
    const equippedState = equipItemToCompanion(
      state,
      companion.id,
      "iron_sword",
      "mainHand",
    ).state;
    const fullState = addItemToInventoryState(
      equippedState,
      "wood",
      1,
      "debug",
    ).state;

    const { state: nextState, result } = unequipItemFromCompanion(
      fullState,
      companion.id,
      "mainHand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result).toMatchObject({
      status: "failed",
      reason: "inventory_full",
    });
    expect(nextCompanion.equipment.mainHand).toBe("iron_sword");
  });
});
