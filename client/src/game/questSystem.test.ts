import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { createDebugTelemetryState, startDebugTelemetryRecording } from "./debugTelemetry";
import { createDebugMap, MAP_ONE_ID } from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import { buyMerchantItem } from "./merchant";
import { addEntity } from "./state";
import { equipFlaskToCompanion } from "./consumables";
import {
  acceptQuestFromQuestGiver,
  createInitialQuestStates,
  finishReadyQuestsForQuestGiver,
  getQuestGiverAvailableQuests,
  getQuestGiverCurrentQuests,
  getQuestGiverReadyQuests,
  isMerchantUnlockedForQuests,
  QUEST_GIVER_POI_ID,
  recordEquippedItemObjectivesForQuests,
  recordEnemyDefeatedForQuests,
  recordQuestPoiReachedForQuests,
  recordResourceGatheredForQuests,
  updateQuestGiverInteraction,
} from "./questSystem";
import { equipItemToCompanion } from "./equipmentSystem";
import { createTestGameState } from "./testState";
import type { EnemyArchetypeId } from "./types";
import type { QuestId, QuestState } from "./questTypes";

describe("prototype quest system", () => {
  it("accepts, progresses, readies, turns in, and unlocks quests", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createInitialQuestStates(),
    });
    const defeatedEnemy = {
      ...createEnemy("enemy-1", { x: 10, y: 10 }, undefined, {
        archetypeId: "slime",
        subzoneId: "shore-fringe",
      }),
      state: "dead" as const,
      health: 0,
    };
    const shoreWood = createResource("shore-wood", { x: 9, y: 8 }, {
      resourceType: "wood",
    });

    state = updateQuestGiverInteraction(state);
    expect(state.quests.clear_the_shore.status).toBe("active");

    for (let count = 0; count < 10; count += 1) {
      state = recordEnemyDefeatedForQuests(state, defeatedEnemy, MAP_ONE_ID);
    }
    state = recordResourceGatheredForQuests(state, shoreWood, MAP_ONE_ID, 3);
    state = recordQuestPoiReachedForQuests(
      state,
      "shore-fringe-supply-marker",
      MAP_ONE_ID,
    );

    expect(state.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(
      state.quests.clear_the_shore.objectiveProgress.defeat_shore_fringe_slimes,
    ).toEqual({
      objectiveId: "defeat_shore_fringe_slimes",
      currentCount: 10,
      completed: true,
    });

    state = updateQuestGiverInteraction(state);
    expect(state.quests.clear_the_shore.status).toBe("completed");
    expect(state.quests.outfit_the_expedition.status).toBe("available");
    expect(state.quests.gather_expedition_supplies.status).toBe("locked");
    expect(state.quests.scout_the_northern_road.status).toBe("locked");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(50);
    expect(state.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 2 },
      { itemId: "minor_recovery_flask", quantity: 1 },
      { itemId: "acolyte_hood", quantity: 1 },
    ]);
    expect(getCompanion(state, "companion-1").characterLevel).toBe(2);
    expect(getCompanion(state, "companion-1").characterXp).toBe(2);
    expect(getCompanion(state, "companion-1").lastCharacterXpGained).toBe(8);
    expect(getCompanion(state, "companion-2").characterLevel).toBe(2);
    expect(getCompanion(state, "companion-2").characterXp).toBe(2);
    expect(getCompanion(state, "companion-2").lastCharacterXpGained).toBe(8);
  });

  it("completes equipment tutorial objectives from current equipment state", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        outfit_the_expedition: "active",
      }),
    });

    state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    state = addItemToInventoryState(state, "acolyte_hood", 1, "debug").state;
    state = addItemToInventoryState(state, "minor_recovery_flask", 1, "debug").state;
    state = equipItemToCompanion(
      state,
      "companion-1",
      "training_sword",
      "mainHand",
    ).state;
    state = equipItemToCompanion(
      state,
      "companion-1",
      "acolyte_hood",
      "head",
    ).state;
    state = equipFlaskToCompanion(
      state,
      "companion-1",
      "minor_recovery_flask",
    ).state;

    expect(
      state.quests.outfit_the_expedition.objectiveProgress.equip_training_sword,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(
      state.quests.outfit_the_expedition.objectiveProgress.equip_acolyte_hood,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(
      state.quests.outfit_the_expedition.objectiveProgress.equip_minor_recovery_flask,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(state.quests.outfit_the_expedition.status).toBe("active");
  });

  it("checks already-equipped tutorial items when the quest is accepted", () => {
    const leader = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      equipment: {
        ...createCompanion("companion-template", { x: 0, y: 0 }, "companion-1")
          .equipment,
        mainHand: "training_sword" as const,
        head: "acolyte_hood" as const,
      },
      consumables: {
        ...createCompanion("companion-template", { x: 0, y: 0 }, "companion-1")
          .consumables,
        flask: {
          itemId: "minor_recovery_flask" as const,
          charges: 0,
          lastUsedAt: null,
        },
      },
    };
    let state = createTestGameState({
      entities: {
        [leader.id]: leader,
      },
      partyLeaderId: leader.id,
      followTrailsByEntityId: {
        [leader.id]: [],
      },
      autoModeEnabled: true,
      quests: createQuestStates({
        outfit_the_expedition: "available",
      }),
    });

    state = acceptQuestFromQuestGiver(
      state,
      QUEST_GIVER_POI_ID,
      "outfit_the_expedition",
    );

    expect(state.autoModeEnabled).toBe(false);
    expect(
      state.quests.outfit_the_expedition.objectiveProgress.equip_training_sword
        .completed,
    ).toBe(true);
    expect(
      state.quests.outfit_the_expedition.objectiveProgress.equip_acolyte_hood
        .completed,
    ).toBe(true);
    expect(
      state.quests.outfit_the_expedition.objectiveProgress
        .equip_minor_recovery_flask.completed,
    ).toBe(true);
  });

  it("completes the merchant equipment objective only for equipment purchases", () => {
    const merchant = createNpc("merchant-1", { x: 2, y: 0 }, "Merchant", "merchant");
    let state = createStateWithParty({
      wallet: {
        balancesByCurrencyId: {
          crowns: 100,
        },
      },
      quests: createQuestStates({
        outfit_the_expedition: "active",
      }),
    });
    state = addEntity(state, merchant);

    state = buyMerchantItem(state, merchant.id, "minor_recovery_flask").state;
    expect(
      state.quests.outfit_the_expedition.objectiveProgress.buy_merchant_equipment,
    ).toMatchObject({
      currentCount: 0,
      completed: false,
    });

    state = buyMerchantItem(state, merchant.id, "training_sword").state;
    expect(
      state.quests.outfit_the_expedition.objectiveProgress.buy_merchant_equipment,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
  });

  it("keeps the merchant locked before the equipment tutorial is accepted", () => {
    const merchant = createNpc("merchant-1", { x: 2, y: 0 }, "Merchant", "merchant");
    let state = createStateWithParty({
      wallet: {
        balancesByCurrencyId: {
          crowns: 100,
        },
      },
      quests: createQuestStates({
        outfit_the_expedition: "available",
      }),
    });
    state = addEntity(state, merchant);

    expect(isMerchantUnlockedForQuests(state)).toBe(false);

    const lockedPurchase = buyMerchantItem(state, merchant.id, "training_sword");
    expect(lockedPurchase.result).toMatchObject({
      status: "failed",
      reason: "merchant_locked_for_quest",
    });

    state = acceptQuestFromQuestGiver(
      state,
      QUEST_GIVER_POI_ID,
      "outfit_the_expedition",
    );

    expect(isMerchantUnlockedForQuests(state)).toBe(true);
  });

  it("keeps rewards all-or-nothing when equipment reward cannot fit", () => {
    let state = createStateWithParty({
      inventory: {
        capacity: 1,
        slots: [{ itemId: "wolf_pelt", quantity: 1 }],
      },
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state);

    expect(state.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(state.quests.clear_the_shore.lastTurnInError).toBe("inventory_full");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(0);
    expect(state.inventory.slots).toEqual([{ itemId: "wolf_pelt", quantity: 1 }]);
    expect(getCompanion(state, "companion-1").characterXp).toBe(0);
  });

  it("accepts a selected available quest from the quest giver", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "available",
        gather_expedition_supplies: "available",
      }),
    });

    state = acceptQuestFromQuestGiver(
      state,
      QUEST_GIVER_POI_ID,
      "gather_expedition_supplies",
    );

    expect(state.quests.clear_the_shore.status).toBe("available");
    expect(state.quests.gather_expedition_supplies.status).toBe("active");
  });

  it("lists quest giver quests by menu status", () => {
    const state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "available",
        gather_expedition_supplies: "active",
        scout_the_northern_road: "ready_to_turn_in",
        threat_beyond_the_pass: "completed",
      }),
    });

    expect(
      getQuestGiverAvailableQuests(state, QUEST_GIVER_POI_ID).map(
        (quest) => quest.questId,
      ),
    ).toEqual(["clear_the_shore"]);
    expect(
      getQuestGiverCurrentQuests(state, QUEST_GIVER_POI_ID).map(
        (quest) => quest.questId,
      ),
    ).toEqual(["gather_expedition_supplies"]);
    expect(
      getQuestGiverReadyQuests(state, QUEST_GIVER_POI_ID).map(
        (quest) => quest.questId,
      ),
    ).toEqual(["scout_the_northern_road"]);
  });

  it("leaves state unchanged when finishing with no ready quests", () => {
    const state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "available",
        gather_expedition_supplies: "active",
      }),
    });

    expect(finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID)).toBe(state);
  });

  it("finishes all ready quest giver quests when combined rewards fit", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
        gather_expedition_supplies: "ready_to_turn_in",
      }),
    });

    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);

    expect(state.quests.clear_the_shore.status).toBe("completed");
    expect(state.quests.gather_expedition_supplies.status).toBe("completed");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(70);
    expect(state.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 2 },
      { itemId: "minor_recovery_flask", quantity: 1 },
      { itemId: "acolyte_hood", quantity: 1 },
      { itemId: "field_herb", quantity: 3 },
    ]);
    expect(getCompanion(state, "companion-1").lastCharacterXpGained).toBe(6);
  });

  it("does not partially finish ready quests when combined rewards cannot fit", () => {
    let state = createStateWithParty({
      inventory: {
        capacity: 4,
        slots: [],
      },
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
        gather_expedition_supplies: "ready_to_turn_in",
        scout_the_northern_road: "ready_to_turn_in",
      }),
    });

    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);

    expect(state.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(state.quests.gather_expedition_supplies.status).toBe(
      "ready_to_turn_in",
    );
    expect(state.quests.scout_the_northern_road.status).toBe("ready_to_turn_in");
    expect(state.quests.clear_the_shore.lastTurnInError).toBe("inventory_full");
    expect(state.quests.gather_expedition_supplies.lastTurnInError).toBe(
      "inventory_full",
    );
    expect(state.quests.scout_the_northern_road.lastTurnInError).toBe(
      "inventory_full",
    );
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(0);
    expect(state.inventory.slots).toEqual([]);
    expect(getCompanion(state, "companion-1").characterXp).toBe(0);
  });

  it("filters Map 1 combat quest progress by subzone and archetype", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createQuestStates({
        clear_the_shore: "active",
        gather_expedition_supplies: "active",
        scout_the_northern_road: "active",
      }),
    });

    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("wrong-shore-bat", "cave_bat", "shore-fringe"),
      MAP_ONE_ID,
    );
    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("shore-slime", "slime", "shore-fringe"),
      MAP_ONE_ID,
    );
    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("glade-bat", "cave_bat", "mossy-glade"),
      MAP_ONE_ID,
    );
    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("lower-spider", "forest_spider", "lower-shore"),
      MAP_ONE_ID,
    );

    expect(
      state.quests.clear_the_shore.objectiveProgress.defeat_shore_fringe_slimes
        .currentCount,
    ).toBe(1);
    expect(
      state.quests.gather_expedition_supplies.objectiveProgress
        .defeat_mossy_glade_bats.currentCount,
    ).toBe(1);
    expect(
      state.quests.scout_the_northern_road.objectiveProgress
        .defeat_lower_shore_spiders.currentCount,
    ).toBe(1);
  });

  it("filters Map 1 gathering quest progress by resource type and subzone", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createQuestStates({
        gather_expedition_supplies: "active",
      }),
    });
    const shoreHerb = createResource("shore-herb", { x: 47, y: 25 }, {
      resourceType: "herb",
    });
    const gladeWood = createResource("glade-wood", { x: 101, y: 8 }, {
      resourceType: "wood",
    });
    const gladeHerb = createResource("glade-herb", { x: 101, y: 51 }, {
      resourceType: "herb",
    });

    state = recordResourceGatheredForQuests(state, shoreHerb, MAP_ONE_ID, 1);
    state = recordResourceGatheredForQuests(state, gladeWood, MAP_ONE_ID, 1);
    state = recordResourceGatheredForQuests(state, gladeHerb, MAP_ONE_ID, 3);

    expect(
      state.quests.gather_expedition_supplies.objectiveProgress
        .gather_mossy_glade_herbs,
    ).toMatchObject({
      currentCount: 3,
      completed: true,
    });
  });

  it("allows Map 1 quest objectives to complete in any order", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createQuestStates({
        gather_expedition_supplies: "active",
      }),
    });
    const gladeHerb = createResource("glade-herb", { x: 101, y: 51 }, {
      resourceType: "herb",
    });
    const defeatedBat = createDefeatedEnemy(
      "glade-bat",
      "cave_bat",
      "mossy-glade",
    );

    state = recordResourceGatheredForQuests(state, gladeHerb, MAP_ONE_ID, 3);
    expect(state.quests.gather_expedition_supplies.status).toBe("active");
    expect(
      state.quests.gather_expedition_supplies.objectiveProgress
        .gather_mossy_glade_herbs.completed,
    ).toBe(true);

    for (let count = 0; count < 20; count += 1) {
      state = recordEnemyDefeatedForQuests(state, defeatedBat, MAP_ONE_ID);
    }

    expect(state.quests.gather_expedition_supplies.status).toBe("active");
    expect(
      state.quests.gather_expedition_supplies.objectiveProgress
        .defeat_mossy_glade_bats.completed,
    ).toBe(true);

    state = recordQuestPoiReachedForQuests(
      state,
      "mossy-glade-route-marker",
      MAP_ONE_ID,
    );

    expect(
      state.quests.gather_expedition_supplies.objectiveProgress
        .guide_mossy_glade_surveyor.completed,
    ).toBe(true);
    expect(state.quests.gather_expedition_supplies.status).toBe(
      "ready_to_turn_in",
    );
  });

  it("uses existing stack space before requiring new reward slots", () => {
    let state = createStateWithParty({
      inventory: {
        capacity: 1,
        slots: [{ itemId: "field_herb", quantity: 1 }],
      },
      quests: createQuestStates({
        clear_the_shore: "completed",
        gather_expedition_supplies: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state);

    expect(state.quests.gather_expedition_supplies.status).toBe("completed");
    expect(state.inventory.slots).toEqual([{ itemId: "field_herb", quantity: 4 }]);
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(20);
  });

  it("does not grant quest xp to dead party members or reduce xp by level gap", () => {
    const livingCompanion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      characterLevel: 50,
      characterXp: 0,
    };
    const deadCompanion = {
      ...createCompanion("companion-2", { x: 1, y: 0 }, "companion-1"),
      state: "dead" as const,
      health: 0,
      characterXp: 0,
    };
    let state = createTestGameState({
      entities: {
        [livingCompanion.id]: livingCompanion,
        [deadCompanion.id]: deadCompanion,
      },
      partyLeaderId: livingCompanion.id,
      followTrailsByEntityId: {
        [livingCompanion.id]: [],
        [deadCompanion.id]: [],
      },
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state);

    expect(getCompanion(state, livingCompanion.id).characterXp).toBe(8);
    expect(getCompanion(state, deadCompanion.id).characterXp).toBe(0);
  });

  it("applies the debug super XP multiplier to quest rewards", () => {
    let state = createStateWithParty({
      debugOptions: {
        superSpeedEnabled: false,
        superExpEnabled: true,
      },
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state);

    expect(getCompanion(state, "companion-1").lastCharacterXpGained).toBe(40);
    expect(getCompanion(state, "companion-2").lastCharacterXpGained).toBe(40);
  });

  it("does not grant non-repeatable quest rewards more than once", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state);
    state = updateQuestGiverInteraction(state);

    expect(state.quests.clear_the_shore.status).toBe("completed");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(50);
    expect(state.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 2 },
      { itemId: "minor_recovery_flask", quantity: 1 },
      { itemId: "acolyte_hood", quantity: 1 },
    ]);
  });

  it("records quest reward telemetry phases", () => {
    let state = startDebugTelemetryRecording(
      createStateWithParty({
        debugTelemetry: createDebugTelemetryState(),
        quests: createQuestStates({
          clear_the_shore: "ready_to_turn_in",
        }),
      }),
    );

    state = updateQuestGiverInteraction(state);

    const eventTypes = state.debugTelemetry?.events.map((event) => event.type);
    expect(eventTypes).toContain("quest_dialog_opened");
    expect(eventTypes).toContain("quest_finish_selected");
    expect(eventTypes).toContain("quest_reward_validation_started");
    expect(eventTypes).toContain("quest_reward_claim_started");
    expect(eventTypes).toContain("quest_reward_crowns_added");
    expect(eventTypes).toContain("quest_reward_xp_awarded");
    expect(eventTypes).toContain("quest_reward_item_added");
    expect(eventTypes).toContain("quest_reward_equipment_added");
    expect(eventTypes).toContain("quest_reward_claim_succeeded");
  });

  it("records equipment objective check telemetry", () => {
    let state = startDebugTelemetryRecording(
      createStateWithParty({
        debugTelemetry: createDebugTelemetryState(),
        quests: createQuestStates({
          outfit_the_expedition: "active",
        }),
      }),
    );

    state = recordEquippedItemObjectivesForQuests(state, "test_check");

    expect(state.debugTelemetry?.events).toContainEqual(
      expect.objectContaining({
        type: "quest_equipment_state_checked",
        questId: "outfit_the_expedition",
        objectiveId: "equip_training_sword",
        itemId: "training_sword",
        targetSlot: "mainHand",
        result: "not_matched",
      }),
    );
    expect(state.debugTelemetry?.events).toContainEqual(
      expect.objectContaining({
        type: "quest_equipment_state_checked",
        questId: "outfit_the_expedition",
        objectiveId: "equip_minor_recovery_flask",
        itemId: "minor_recovery_flask",
        result: "not_matched",
      }),
    );
  });
});

function createStateWithParty(
  overrides: Parameters<typeof createTestGameState>[0] = {},
) {
  const leader = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");
  const follower = createCompanion("companion-2", { x: 1, y: 0 }, leader.id);

  return createTestGameState({
    entities: {
      [leader.id]: leader,
      [follower.id]: follower,
    },
    partyLeaderId: leader.id,
    followTrailsByEntityId: {
      [leader.id]: [],
      [follower.id]: [],
    },
    ...overrides,
  });
}

function createQuestStates(statuses: Partial<Record<QuestId, QuestState["status"]>>) {
  const quests = createInitialQuestStates();

  for (const questId of Object.keys(quests) as QuestId[]) {
    quests[questId] = {
      ...quests[questId],
      status: statuses[questId] ?? quests[questId].status,
    };
  }

  return quests;
}

function createDefeatedEnemy(
  id: string,
  archetypeId: EnemyArchetypeId,
  subzoneId: string,
) {
  return {
    ...createEnemy(id, { x: 0, y: 0 }, undefined, {
      archetypeId,
      subzoneId,
    }),
    state: "dead" as const,
    health: 0,
  };
}

function getCompanion(state: ReturnType<typeof createTestGameState>, companionId: string) {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    throw new Error(`Missing companion ${companionId}`);
  }

  return companion;
}
