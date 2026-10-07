import { describe, expect, it } from "vitest";
import { FIRST_CLASS_IDS } from "./classes";
import { createCompanion } from "./entities";
import { createEmptyPartyInventory, addItemToInventoryState } from "./inventory";
import {
  equipItemToCompanion,
  unequipItemFromCompanion,
} from "./equipmentSystem";
import {
  getAllowedEquipmentTypeLabels,
  getCompanionEquipmentStatModifiers,
} from "./equipmentRules";
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

  it("equips both Training Sword variants on every current class", () => {
    const classIds: ClassId[] = ["beginner", ...FIRST_CLASS_IDS];
    const itemIds = ["training_sword", "copper_training_sword"] as const;

    for (const classId of classIds) {
      for (const itemId of itemIds) {
        const { state, companion } = createStateWithCompanion(classId, [itemId]);
        const result = equipItemToCompanion(
          state,
          companion.id,
          itemId,
          "mainHand",
        );

        expect(result.result.status).toBe("success");
        expect(
          (result.state.entities[companion.id] as Companion).equipment.mainHand,
        ).toBe(itemId);
      }
    }
  });

  it("reports the universal Training Sword type once for every class", () => {
    const classIds: ClassId[] = ["beginner", ...FIRST_CLASS_IDS];

    for (const classId of classIds) {
      const labels = getAllowedEquipmentTypeLabels(classId);

      expect(labels.mainHand.filter((type) => type === "training_sword")).toHaveLength(
        1,
      );
    }
  });

  it("keeps specialized main-hand weapons restricted", () => {
    const { state, companion } = createStateWithCompanion("hunter", ["iron_sword"]);

    const { result } = equipItemToCompanion(
      state,
      companion.id,
      "iron_sword",
      "mainHand",
    );

    expect(result).toMatchObject({
      status: "failed",
      reason: "invalid_class",
    });
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

  it("allows a Hunter to equip a Quiver with a Bow", () => {
    const { state, companion } = createStateWithCompanion("hunter", [
      "short_bow",
      "leather_quiver",
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
      "leather_quiver",
      "offhand",
    );

    expect(result.status).toBe("success");
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

  it("keeps shared Lantern permissions specific to the requested slot", () => {
    const { state, companion } = createStateWithCompanion("lightbearer", [
      "rune_lantern",
      "guard_mace",
    ]);
    const maceState = equipItemToCompanion(
      state,
      companion.id,
      "guard_mace",
      "mainHand",
    ).state;

    const { state: nextState, result } = equipItemToCompanion(
      maceState,
      companion.id,
      "rune_lantern",
      "offhand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("guard_mace");
    expect(nextCompanion.equipment.offhand).toBe("rune_lantern");

    const invalidMainHand = createStateWithCompanion("lightbearer", [
      "rune_lantern",
    ]);
    expect(
      equipItemToCompanion(
        invalidMainHand.state,
        invalidMainHand.companion.id,
        "rune_lantern",
        "mainHand",
      ).result,
    ).toMatchObject({ status: "failed", reason: "invalid_class" });

    const invalidOffhand = createStateWithCompanion("runecaster", [
      "rune_lantern",
    ]);
    expect(
      equipItemToCompanion(
        invalidOffhand.state,
        invalidOffhand.companion.id,
        "rune_lantern",
        "offhand",
      ).result,
    ).toMatchObject({ status: "failed", reason: "invalid_class" });
  });

  it.each([
    ["blade", "iron_sword", "sacrificial_dagger"],
    ["aegis", "guard_mace", "wooden_shield"],
    ["hunter", "short_bow", "leather_quiver"],
    ["beast", "claw_gauntlets", "claw_gauntlets"],
    ["elementalist", "apprentice_orb", "apprentice_orb"],
    ["runecaster", "rune_lantern", "simple_talisman"],
    ["lightbearer", "guard_mace", "rune_lantern"],
    ["penitent", "thorn_whip", "sacrificial_dagger"],
  ] as const)(
    "equips the %s first-class hand loadout",
    (classId, mainHandItemId, offhandItemId) => {
      const { state, companion } = createStateWithCompanion(classId, [
        mainHandItemId,
        offhandItemId,
      ]);
      const mainHandState = equipItemToCompanion(
        state,
        companion.id,
        mainHandItemId,
        "mainHand",
      ).state;
      const offhandResult = equipItemToCompanion(
        mainHandState,
        companion.id,
        offhandItemId,
        "offhand",
      );
      const equippedCompanion = offhandResult.state.entities[
        companion.id
      ] as Companion;

      expect(offhandResult.result.status).toBe("success");
      expect(equippedCompanion.equipment.mainHand).toBe(mainHandItemId);
      expect(equippedCompanion.equipment.offhand).toBe(offhandItemId);
    },
  );

  it("keeps Beginner without an allowed offhand", () => {
    const { state, companion } = createStateWithCompanion("beginner", [
      "sacrificial_dagger",
    ]);

    expect(
      equipItemToCompanion(
        state,
        companion.id,
        "sacrificial_dagger",
        "offhand",
      ).result,
    ).toMatchObject({ status: "failed", reason: "invalid_class" });
  });

  it("requires and applies two separate Claw items for both Beast hands", () => {
    const { state, companion } = createStateWithCompanion("beast", [
      "claw_gauntlets",
      "claw_gauntlets",
    ]);
    const mainHandState = equipItemToCompanion(
      state,
      companion.id,
      "claw_gauntlets",
      "mainHand",
    ).state;
    const equippedState = equipItemToCompanion(
      mainHandState,
      companion.id,
      "claw_gauntlets",
      "offhand",
    ).state;
    const equippedCompanion = equippedState.entities[companion.id] as Companion;

    expect(equippedCompanion.equipment).toMatchObject({
      mainHand: "claw_gauntlets",
      offhand: "claw_gauntlets",
    });
    expect(getCompanionEquipmentStatModifiers(equippedCompanion)).toMatchObject({
      attack: 6,
      evasion: 2,
    });
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

  it("equips a level 20 Bow and Quiver loadout", () => {
    const { state, companion } = createStateWithCompanion(
      "hunter",
      ["veteran_warbow", "veteran_quiver"],
      10,
      20,
    );

    const bowState = equipItemToCompanion(
      state,
      companion.id,
      "veteran_warbow",
      "mainHand",
    ).state;
    const { state: nextState, result } = equipItemToCompanion(
      bowState,
      companion.id,
      "veteran_quiver",
      "offhand",
    );
    const nextCompanion = nextState.entities[companion.id] as Companion;

    expect(result.status).toBe("success");
    expect(nextCompanion.equipment.mainHand).toBe("veteran_warbow");
    expect(nextCompanion.equipment.offhand).toBe("veteran_quiver");
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
