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
  characterLevel = 10,
): { state: GameState; companion: Companion } {
  const companion = {
    ...createCompanion(
      "companion-1",
      { x: 0, y: 0 },
      "companion-1",
      "fighter",
      0,
      classId,
    ),
    characterLevel,
  };
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
      "guard_mace",
      "wooden_shield",
      "acolyte_hood",
    ]);
    const equippedState = equipItemToCompanion(
      equipItemToCompanion(
        state,
        companion.id,
        "guard_mace",
        "mainHand",
      ).state,
      companion.id,
      "wooden_shield",
      "offhand",
    ).state;

    const { state: nextState, result } = equipItemToCompanion(
      equippedState,
      companion.id,
      "acolyte_hood",
      "head",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("guard_mace");
    expect(nextCompanion.equipment.offhand).toBe("wooden_shield");
    expect(nextCompanion.equipment.head).toBe("acolyte_hood");
  });

  it("clears and returns offhand when equipping a both-hands weapon", () => {
    const { state, companion } = createStateWithCompanion("aegis", [
      "guard_mace",
      "wooden_shield",
      "short_bow",
    ]);
    const equippedState = equipItemToCompanion(
      equipItemToCompanion(
        state,
        companion.id,
        "guard_mace",
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
        { itemId: "guard_mace", quantity: 1 },
        { itemId: "wooden_shield", quantity: 1 },
      ]),
    );
  });

  it("lets armor ignore class restrictions when level requirements are met", () => {
    const { state, companion } = createStateWithCompanion("elementalist", [
      "bulwark_cuirass",
    ]);

    const { state: nextState, result } = equipItemToCompanion(
      state,
      companion.id,
      "bulwark_cuirass",
      "chest",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.chest).toBe("bulwark_cuirass");
  });

  it("rejects armor when the companion is below its level requirement", () => {
    const { state, companion } = createStateWithCompanion(
      "elementalist",
      ["bulwark_cuirass"],
      10,
      1,
    );

    const { result } = equipItemToCompanion(
      state,
      companion.id,
      "bulwark_cuirass",
      "chest",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "level_requirement_not_met",
    });
  });

  it("rejects moved level 5 leather armor at level 1", () => {
    const { state, companion } = createStateWithCompanion(
      "blade",
      ["stalker_vest"],
      10,
      1,
    );

    const { result } = equipItemToCompanion(
      state,
      companion.id,
      "stalker_vest",
      "chest",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "level_requirement_not_met",
    });
  });

  it("equips representative level 15 weapon and offhand loadouts", () => {
    const { state, companion } = createStateWithCompanion(
      "aegis",
      ["bastion_mace", "reinforced_shield"],
      10,
      15,
    );

    const maceState = equipItemToCompanion(
      state,
      companion.id,
      "bastion_mace",
      "mainHand",
    ).state;
    const { state: nextState, result } = equipItemToCompanion(
      maceState,
      companion.id,
      "reinforced_shield",
      "offhand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("bastion_mace");
    expect(nextCompanion.equipment.offhand).toBe("reinforced_shield");
  });

  it("equips representative level 20 both-hands weapons", () => {
    const { state, companion } = createStateWithCompanion(
      "hunter",
      ["veteran_warbow"],
      10,
      20,
    );

    const { state: nextState, result } = equipItemToCompanion(
      state,
      companion.id,
      "veteran_warbow",
      "mainHand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("veteran_warbow");
    expect(nextCompanion.equipment.offhand).toBeNull();
  });

  it("rejects level 15 and 20 scaled equipment below their requirements", () => {
    const level14State = createStateWithCompanion(
      "blade",
      ["steel_sword"],
      10,
      14,
    );
    const level19State = createStateWithCompanion(
      "blade",
      ["veteran_sword"],
      10,
      19,
    );

    expect(
      equipItemToCompanion(
        level14State.state,
        level14State.companion.id,
        "steel_sword",
        "mainHand",
      ).result,
    ).toMatchObject({
      status: "failed",
      reason: "level_requirement_not_met",
    });
    expect(
      equipItemToCompanion(
        level19State.state,
        level19State.companion.id,
        "veteran_sword",
        "mainHand",
      ).result,
    ).toMatchObject({
      status: "failed",
      reason: "level_requirement_not_met",
    });
  });

  it("equips scaled armor only when level requirements are met", () => {
    const underleveled = createStateWithCompanion(
      "elementalist",
      ["bastion_cuirass"],
      10,
      14,
    );
    const ready = createStateWithCompanion(
      "elementalist",
      ["ironhold_cuirass"],
      10,
      20,
    );

    expect(
      equipItemToCompanion(
        underleveled.state,
        underleveled.companion.id,
        "bastion_cuirass",
        "chest",
      ).result,
    ).toMatchObject({
      status: "failed",
      reason: "level_requirement_not_met",
    });

    const { state: nextState, result } = equipItemToCompanion(
      ready.state,
      ready.companion.id,
      "ironhold_cuirass",
      "chest",
    );
    const nextCompanion = nextState.entities[ready.companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.chest).toBe("ironhold_cuirass");
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
