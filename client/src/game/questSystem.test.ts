import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { createDebugTelemetryState, startDebugTelemetryRecording } from "./debugTelemetry";
import { DROP_VISUAL_DURATION_MS, updateDropSystem } from "./dropSystem";
import {
  createDebugMap,
  CLASS_MENTOR_NPC_ID,
  HUB_TWO_MAP_ID,
  MAP_TWO_ID,
  MAP_THREE_ID,
  MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
  MAP_ONE_ID,
  OLD_GROVE_PASSAGE_BLOCKER_POSITION,
  SECURE_LANDING_PASSAGE_GATE_ID,
  SECURE_LANDING_PASSAGE_GATE_POSITION,
  MAP_TWO_TO_MAP_THREE_TELEPORTER_ID,
  TELEPORTER_ID,
} from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import { buyMerchantItem } from "./merchant";
import { addEntity, PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS } from "./state";
import { equipFlaskToCompanion } from "./consumables";
import {
  acceptQuestFromQuestGiver,
  completeQuestObjective,
  createInitialQuestStates,
  finishReadyQuestsForQuestGiver,
  finishReadyQuestForQuestGiver,
  getQuestGiverAvailableQuests,
  getQuestGiverCurrentQuests,
  getQuestGiverReadyQuests,
  getQuestItemInventoryEntries,
  isMerchantUnlockedForQuests,
  QUEST_DEFINITIONS,
  QUEST_GIVER_POI_ID,
  recordEquippedItemObjectivesForQuests,
  recordEnemyDefeatedForQuests,
  recordQuestPoiReachedForQuests,
  recordQuestRepairProgress,
  recordResourceGatheredForQuests,
  updateQuestGiverInteraction,
} from "./questSystem";
import { isTeleportWorking } from "./teleportState";
import { isNavigationCellWalkable } from "./navigation";
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
    expect(state.quests.stolen_field_supplies.status).toBe("locked");
    expect(state.quests.break_lower_shore_blockage.status).toBe("locked");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(50);
    expect(state.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 2 },
      { itemId: "minor_recovery_flask", quantity: 1 },
      { itemId: "guard_coif", quantity: 1 },
    ]);
    expect(getCompanion(state, "companion-1").characterLevel).toBe(2);
    expect(getCompanion(state, "companion-1").characterXp).toBe(2);
    expect(getCompanion(state, "companion-1").lastCharacterXpGained).toBe(8);
    expect(getCompanion(state, "companion-2").characterLevel).toBe(2);
    expect(getCompanion(state, "companion-2").characterXp).toBe(2);
    expect(getCompanion(state, "companion-2").lastCharacterXpGained).toBe(8);
  });

  it("opens the Secure the Landing passage gate when the quest is completed on Map 1", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createInitialQuestStates(),
    });

    state = updateQuestGiverInteraction(state);
    const closedMap = state.map;
    expect(state.quests.clear_the_shore.status).toBe("active");
    expect(closedMap).toBeDefined();
    expect(
      isNavigationCellWalkable(closedMap!, SECURE_LANDING_PASSAGE_GATE_POSITION),
    ).toBe(false);

    for (let count = 0; count < 10; count += 1) {
      state = completeQuestObjective(
        state,
        "clear_the_shore",
        "defeat_shore_fringe_slimes",
      );
    }
    for (let count = 0; count < 3; count += 1) {
      state = completeQuestObjective(
        state,
        "clear_the_shore",
        "gather_shore_fringe_wood",
      );
    }
    state = completeQuestObjective(
      state,
      "clear_the_shore",
      "inspect_shore_fringe_marker",
    );
    expect(state.quests.clear_the_shore.status).toBe("ready_to_turn_in");

    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);
    const openedMap = state.map;
    expect(openedMap).toBeDefined();
    const gateVisual = openedMap!.visualObjects?.find(
      (visualObject) => visualObject.id === SECURE_LANDING_PASSAGE_GATE_ID,
    );

    expect(state.quests.clear_the_shore.status).toBe("completed");
    expect(gateVisual?.visualId).toBe("passage_gate_open");
    expect(
      isNavigationCellWalkable(openedMap!, SECURE_LANDING_PASSAGE_GATE_POSITION),
    ).toBe(true);
  });

  it("unlocks The Azure Trial and spawns the Class Mentor after Slimeward Trail", () => {
    let state = createStateWithParty({
      currentMapId: "hub",
      map: createDebugMap("hub"),
      quests: createQuestStates({
        find_slimeward_camp: "ready_to_turn_in",
      }),
    });

    expect(state.quests.azure_trial.status).toBe("locked");
    expect(state.entities[CLASS_MENTOR_NPC_ID]).toBeUndefined();

    state = finishReadyQuestForQuestGiver(
      state,
      QUEST_GIVER_POI_ID,
      "find_slimeward_camp",
      1_000,
    );

    expect(state.quests.find_slimeward_camp.status).toBe("completed");
    expect(state.quests.azure_trial.status).toBe("available");
    expect(state.entities[CLASS_MENTOR_NPC_ID]).toMatchObject({
      kind: "npc",
      displayName: "Class Mentor",
      npcRole: "class_mentor",
    });
    expect(
      getQuestGiverAvailableQuests(state, CLASS_MENTOR_NPC_ID).map(
        (quest) => quest.questId,
      ),
    ).toEqual(["azure_trial"]);
  });

  it("turns in The Azure Trial through the Class Mentor rewards", () => {
    const state = createStateWithParty({
      currentMapId: HUB_TWO_MAP_ID,
      map: createDebugMap(HUB_TWO_MAP_ID),
      quests: createQuestStates({
        azure_trial: "ready_to_turn_in",
      }),
    });

    const nextState = finishReadyQuestForQuestGiver(
      state,
      CLASS_MENTOR_NPC_ID,
      "azure_trial",
      1_000,
    );

    expect(nextState.quests.azure_trial.status).toBe("completed");
    expect(nextState.wallet.balancesByCurrencyId.crowns).toBe(100);
    expect(getCompanion(nextState, "companion-1").lastCharacterXpGained).toBe(1500);
    expect(getCompanion(nextState, "companion-2").lastCharacterXpGained).toBe(1500);
  });

  it("creates level-up feedback when quest XP levels companions", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state, 5_000);

    const levelUpEvents = state.combatFeedbackEvents.filter(
      (event) => event.type === "level_up",
    );

    expect(levelUpEvents).toHaveLength(2);
    expect(levelUpEvents).toEqual([
      expect.objectContaining({
        entityId: "companion-1",
        createdAt: 5_000,
        expiresAt: 5_000 + PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS,
      }),
      expect.objectContaining({
        entityId: "companion-2",
        createdAt: 5_000,
        expiresAt: 5_000 + PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS,
      }),
    ]);
  });

  it("initializes the early quest chain in serial order", () => {
    const quests = createInitialQuestStates();

    expect(Object.keys(quests)).toEqual([
      "clear_the_shore",
      "outfit_the_expedition",
      "stolen_field_supplies",
      "break_lower_shore_blockage",
      "scout_rise_samples",
      "rescue_the_grove_runner",
      "hold_the_field_cache",
      "open_wolf_causeway",
      "broken_thicket_survey",
      "crawler_shelf_report",
      "find_slimeward_camp",
      "azure_trial",
    ]);
    expect(quests.clear_the_shore.status).toBe("available");
    expect(quests.outfit_the_expedition.status).toBe("locked");
    expect(quests.open_wolf_causeway.status).toBe("locked");
    expect(quests.broken_thicket_survey.status).toBe("locked");
    expect(quests.crawler_shelf_report.status).toBe("locked");
    expect(quests.find_slimeward_camp.status).toBe("locked");
    expect(quests.azure_trial.status).toBe("locked");
  });

  it("unlocks the Third Wild Zone bridge quests before Slimeward Trail", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        open_wolf_causeway: "ready_to_turn_in",
      }),
    });

    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);

    expect(state.quests.open_wolf_causeway.status).toBe("completed");
    expect(state.quests.broken_thicket_survey.status).toBe("available");
    expect(state.quests.crawler_shelf_report.status).toBe("locked");
    expect(state.quests.find_slimeward_camp.status).toBe("locked");

    state = {
      ...state,
      quests: {
        ...state.quests,
        broken_thicket_survey: {
          ...state.quests.broken_thicket_survey,
          status: "ready_to_turn_in",
        },
      },
    };
    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);

    expect(state.quests.broken_thicket_survey.status).toBe("completed");
    expect(state.quests.crawler_shelf_report.status).toBe("available");
    expect(state.quests.find_slimeward_camp.status).toBe("locked");

    state = {
      ...state,
      quests: {
        ...state.quests,
        crawler_shelf_report: {
          ...state.quests.crawler_shelf_report,
          status: "ready_to_turn_in",
        },
      },
    };
    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);

    expect(state.quests.crawler_shelf_report.status).toBe("completed");
    expect(state.quests.find_slimeward_camp.status).toBe("available");
  });

  it("completes equipment tutorial objectives from current equipment state", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        outfit_the_expedition: "active",
      }),
    });

    state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    state = addItemToInventoryState(state, "guard_coif", 1, "debug").state;
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
      "guard_coif",
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
      state.quests.outfit_the_expedition.objectiveProgress.equip_guard_coif,
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
        head: "guard_coif" as const,
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
      state.quests.outfit_the_expedition.objectiveProgress.equip_guard_coif
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
        stolen_field_supplies: "available",
      }),
    });

    state = acceptQuestFromQuestGiver(
      state,
      QUEST_GIVER_POI_ID,
      "stolen_field_supplies",
    );

    expect(state.quests.clear_the_shore.status).toBe("available");
    expect(state.quests.stolen_field_supplies.status).toBe("active");
  });

  it("lists quest giver quests by menu status", () => {
    const state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "available",
        stolen_field_supplies: "active",
        break_lower_shore_blockage: "ready_to_turn_in",
        scout_rise_samples: "completed",
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
    ).toEqual(["stolen_field_supplies"]);
    expect(
      getQuestGiverReadyQuests(state, QUEST_GIVER_POI_ID).map(
        (quest) => quest.questId,
      ),
    ).toEqual(["break_lower_shore_blockage"]);
  });

  it("leaves state unchanged when finishing with no ready quests", () => {
    const state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "available",
        stolen_field_supplies: "active",
      }),
    });

    expect(finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID)).toBe(state);
  });

  it("finishes all ready quest giver quests when combined rewards fit", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
        stolen_field_supplies: "ready_to_turn_in",
      }),
    });

    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);

    expect(state.quests.clear_the_shore.status).toBe("completed");
    expect(state.quests.stolen_field_supplies.status).toBe("completed");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(85);
    expect(state.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 2 },
      { itemId: "minor_recovery_flask", quantity: 1 },
      { itemId: "guard_coif", quantity: 1 },
      { itemId: "hearty_trail_rations", quantity: 1 },
    ]);
    expect(getCompanion(state, "companion-1").lastCharacterXpGained).toBe(12);
  });

  it("does not partially finish ready quests when combined rewards cannot fit", () => {
    let state = createStateWithParty({
      inventory: {
        capacity: 4,
        slots: [],
      },
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
        stolen_field_supplies: "ready_to_turn_in",
        break_lower_shore_blockage: "ready_to_turn_in",
      }),
    });

    state = finishReadyQuestsForQuestGiver(state, QUEST_GIVER_POI_ID);

    expect(state.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(state.quests.stolen_field_supplies.status).toBe(
      "ready_to_turn_in",
    );
    expect(state.quests.break_lower_shore_blockage.status).toBe("ready_to_turn_in");
    expect(state.quests.clear_the_shore.lastTurnInError).toBe("inventory_full");
    expect(state.quests.stolen_field_supplies.lastTurnInError).toBe(
      "inventory_full",
    );
    expect(state.quests.break_lower_shore_blockage.lastTurnInError).toBe(
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
        stolen_field_supplies: "active",
        break_lower_shore_blockage: "active",
      }),
    });

    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("wrong-shore-bat", "bat", "shore-fringe"),
      MAP_ONE_ID,
    );
    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("shore-slime", "slime", "shore-fringe"),
      MAP_ONE_ID,
    );
    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("glade-bat", "bat", "mossy-glade"),
      MAP_ONE_ID,
      () => 0,
    );
    state = recordEnemyDefeatedForQuests(
      state,
      createDefeatedEnemy("lower-spider", "spider", "lower-shore"),
      MAP_ONE_ID,
    );

    expect(
      state.quests.clear_the_shore.objectiveProgress.defeat_shore_fringe_slimes
        .currentCount,
    ).toBe(1);
    expect(
      state.quests.stolen_field_supplies.objectiveProgress
        .collect_mossy_glade_supplies.currentCount,
    ).toBe(1);
    expect(
      state.quests.break_lower_shore_blockage.objectiveProgress
        .defeat_lower_shore_spiders.currentCount,
    ).toBe(1);
  });

  it("can require Superior enemy variants for future quest objectives", () => {
    const objective = QUEST_DEFINITIONS.clear_the_shore.objectives.find(
      (currentObjective) => currentObjective.id === "defeat_shore_fringe_slimes",
    );
    expect(objective).toBeDefined();
    objective!.enemyVariant = "superior";

    try {
      let state = createStateWithParty({
        currentMapId: MAP_ONE_ID,
        map: createDebugMap(MAP_ONE_ID),
        quests: createQuestStates({
          clear_the_shore: "active",
        }),
      });

      state = recordEnemyDefeatedForQuests(
        state,
        createDefeatedEnemy("normal-slime", "slime", "shore-fringe"),
        MAP_ONE_ID,
      );
      state = recordEnemyDefeatedForQuests(
        state,
        {
          ...createDefeatedEnemy("superior-slime", "slime", "shore-fringe"),
          variant: "superior",
        },
        MAP_ONE_ID,
      );

      expect(
        state.quests.clear_the_shore.objectiveProgress
          .defeat_shore_fringe_slimes.currentCount,
      ).toBe(1);
    } finally {
      delete objective!.enemyVariant;
    }
  });

  it("uses chance and pity for special enemy quest drops without overflowing", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createQuestStates({
        stolen_field_supplies: "active",
      }),
    });
    const defeatedBat = createDefeatedEnemy("glade-bat", "bat", "mossy-glade");

    state = recordEnemyDefeatedForQuests(state, defeatedBat, MAP_ONE_ID, () => 0.99);
    expect(
      state.quests.stolen_field_supplies.objectiveProgress
        .collect_mossy_glade_supplies.currentCount,
    ).toBe(0);

    state = recordEnemyDefeatedForQuests(state, defeatedBat, MAP_ONE_ID, () => 0.99);
    expect(
      state.quests.stolen_field_supplies.objectiveProgress
        .collect_mossy_glade_supplies.currentCount,
    ).toBe(1);

    for (let count = 0; count < 20; count += 1) {
      state = recordEnemyDefeatedForQuests(state, defeatedBat, MAP_ONE_ID, () => 0);
    }

    expect(
      state.quests.stolen_field_supplies.objectiveProgress
        .collect_mossy_glade_supplies,
    ).toMatchObject({
      currentCount: 10,
      completed: true,
    });
    expect(state.quests.stolen_field_supplies.status).toBe("ready_to_turn_in");
  });

  it("queues visual feedback and virtual inventory entries for special enemy quest drops", () => {
    const now = 5000;
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createQuestStates({
        stolen_field_supplies: "active",
      }),
    });
    const defeatedBat = createDefeatedEnemy("glade-bat", "bat", "mossy-glade");

    state = recordEnemyDefeatedForQuests(
      state,
      defeatedBat,
      MAP_ONE_ID,
      () => 0,
      now,
    );

    expect(state.inventory.slots).toEqual([]);
    expect(state.dropVisualEvents).toHaveLength(1);
    expect(state.dropVisualEvents?.[0]).toMatchObject({
      kind: "quest_item",
      displayName: "Stolen Supply Bundle",
      iconRole: "quest_giver",
      questId: "stolen_field_supplies",
      objectiveId: "collect_mossy_glade_supplies",
    });
    expect(getQuestItemInventoryEntries(state.quests)).toEqual([
      {
        key: "stolen_field_supplies:collect_mossy_glade_supplies",
        questId: "stolen_field_supplies",
        questDisplayName: "Stolen Field Supplies",
        objectiveId: "collect_mossy_glade_supplies",
        displayName: "Stolen Supply Bundle",
        quantity: 1,
        requiredCount: 10,
      },
    ]);

    const afterVisual = updateDropSystem(state, now + DROP_VISUAL_DURATION_MS);

    expect(afterVisual.inventory.slots).toEqual([]);
    expect(afterVisual.dropVisualEvents).toEqual([]);
    expect(afterVisual.combatFeedbackEvents.at(-1)?.text).toBe(
      "Stolen Supply Bundle",
    );
  });

  it("tracks repair progress and route unlock objectives", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        rescue_the_grove_runner: "active",
      }),
    });

    state = completeQuestObjective(
      state,
      "rescue_the_grove_runner",
      "reach_grove_runner",
    );
    state = completeQuestObjective(
      state,
      "rescue_the_grove_runner",
      "rescue_grove_runner",
    );
    state = recordQuestRepairProgress(
      state,
      "rescue_the_grove_runner",
      "repair_old_grove_cache",
      3000,
    );

    expect(
      state.quests.rescue_the_grove_runner.runtime?.repairProgressMsByObjectiveId
        ?.repair_old_grove_cache,
    ).toBe(3000);
    expect(
      state.quests.rescue_the_grove_runner.objectiveProgress.repair_old_grove_cache
        .completed,
    ).toBe(false);

    state = recordQuestRepairProgress(
      state,
      "rescue_the_grove_runner",
      "repair_old_grove_cache",
      6000,
    );

    expect(
      state.quests.rescue_the_grove_runner.objectiveProgress.repair_old_grove_cache,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(state.quests.rescue_the_grove_runner.status).toBe("ready_to_turn_in");

    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(false);
    state = completeQuestObjective(
      state,
      "break_lower_shore_blockage",
      "unlock_map_two_route",
    );
    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(true);
    expect(isTeleportWorking(state, MAP_TWO_TO_MAP_THREE_TELEPORTER_ID)).toBe(
      false,
    );
  });

  it("progresses the Third Wild Zone bridge quests and Slimeward route unlock", () => {
    let state = createStateWithParty({
      currentMapId: MAP_THREE_ID,
      map: createDebugMap(MAP_THREE_ID),
      quests: createQuestStates({
        broken_thicket_survey: "active",
        crawler_shelf_report: "active",
        find_slimeward_camp: "active",
      }),
    });
    const brokenThicketHerb = createResource("broken-thicket-herb", { x: 47, y: 7 }, {
      resourceType: "herb",
    });

    state = recordQuestPoiReachedForQuests(
      state,
      "broken-thicket-trail-marker",
      MAP_THREE_ID,
    );
    for (let count = 0; count < 10; count += 1) {
      state = recordEnemyDefeatedForQuests(
        state,
        createDefeatedEnemy("broken-crawler", "crawler", "south-west"),
        MAP_THREE_ID,
        () => 0.99,
      );
    }
    state = recordResourceGatheredForQuests(
      state,
      brokenThicketHerb,
      MAP_THREE_ID,
      2,
    );

    expect(state.quests.broken_thicket_survey.status).toBe("ready_to_turn_in");
    expect(
      state.quests.broken_thicket_survey.objectiveProgress
        .collect_crawler_shell_fragments,
    ).toMatchObject({
      currentCount: 5,
      completed: true,
    });

    state = recordQuestPoiReachedForQuests(
      state,
      "crawler-shelf-overlook",
      MAP_THREE_ID,
    );
    for (let count = 0; count < 8; count += 1) {
      state = recordEnemyDefeatedForQuests(
        state,
        createDefeatedEnemy("shelf-shaman", "goblin", "north-west"),
        MAP_THREE_ID,
        () => 0.99,
      );
    }
    state = recordQuestRepairProgress(
      state,
      "crawler_shelf_report",
      "repair_crawler_shelf_route_marker",
      6000,
    );

    expect(state.quests.crawler_shelf_report.status).toBe("ready_to_turn_in");
    expect(
      state.quests.crawler_shelf_report.objectiveProgress.collect_shelf_rune_scraps,
    ).toMatchObject({
      currentCount: 4,
      completed: true,
    });

    expect(isTeleportWorking(state, MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID)).toBe(
      false,
    );

    state = recordQuestPoiReachedForQuests(
      state,
      MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
      MAP_THREE_ID,
    );
    for (let count = 0; count < 4; count += 1) {
      state = recordEnemyDefeatedForQuests(
        state,
        createDefeatedEnemy("imp-fen-mossling", "mossling", "south-center"),
        MAP_THREE_ID,
      );
    }
    for (let count = 0; count < 8; count += 1) {
      state = recordEnemyDefeatedForQuests(
        state,
        createDefeatedEnemy("imp-fen-shaman", "goblin", "south-center"),
        MAP_THREE_ID,
        () => 0.99,
      );
    }
    state = recordQuestRepairProgress(
      state,
      "find_slimeward_camp",
      "repair_slimeward_camp_teleporter",
      8000,
    );

    expect(isTeleportWorking(state, MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID)).toBe(
      false,
    );

    state = completeQuestObjective(
      state,
      "find_slimeward_camp",
      "unlock_slimeward_camp_route",
    );

    expect(state.quests.find_slimeward_camp.status).toBe("ready_to_turn_in");
    expect(isTeleportWorking(state, MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID)).toBe(
      true,
    );
  });

  it("turns the Lower Shore route teleport working when repair completes", () => {
    let state = createStateWithParty({
      quests: createQuestStates({
        break_lower_shore_blockage: "active",
      }),
    });

    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(false);

    state = recordQuestRepairProgress(
      state,
      "break_lower_shore_blockage",
      "repair_lower_shore_blockage",
      8000,
    );

    expect(
      state.quests.break_lower_shore_blockage.objectiveProgress
        .repair_lower_shore_blockage,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(true);
  });

  it("opens the Old Grove passage blocker immediately when the cache repair completes", () => {
    let state = createStateWithParty({
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      quests: createQuestStates({
        rescue_the_grove_runner: "active",
      }),
    });

    expect(
      isNavigationCellWalkable(state.map!, OLD_GROVE_PASSAGE_BLOCKER_POSITION),
    ).toBe(false);

    state = completeQuestObjective(
      state,
      "rescue_the_grove_runner",
      "reach_grove_runner",
    );
    state = completeQuestObjective(
      state,
      "rescue_the_grove_runner",
      "rescue_grove_runner",
    );
    state = recordQuestRepairProgress(
      state,
      "rescue_the_grove_runner",
      "repair_old_grove_cache",
      3000,
    );

    expect(
      isNavigationCellWalkable(state.map!, OLD_GROVE_PASSAGE_BLOCKER_POSITION),
    ).toBe(false);

    state = recordQuestRepairProgress(
      state,
      "rescue_the_grove_runner",
      "repair_old_grove_cache",
      6000,
    );

    expect(
      state.quests.rescue_the_grove_runner.objectiveProgress.repair_old_grove_cache,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(
      isNavigationCellWalkable(state.map!, OLD_GROVE_PASSAGE_BLOCKER_POSITION),
    ).toBe(true);
  });

  it("filters Map 1 gathering quest progress by resource type and subzone", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createQuestStates({
        clear_the_shore: "active",
      }),
    });
    const shoreHerb = createResource("shore-herb", { x: 47, y: 25 }, {
      resourceType: "herb",
    });
    const gladeWood = createResource("glade-wood", { x: 101, y: 8 }, {
      resourceType: "wood",
    });
    const shoreWood = createResource("shore-wood", { x: 47, y: 25 }, {
      resourceType: "wood",
    });

    state = recordResourceGatheredForQuests(state, shoreHerb, MAP_ONE_ID, 1);
    state = recordResourceGatheredForQuests(state, gladeWood, MAP_ONE_ID, 1);
    state = recordResourceGatheredForQuests(state, shoreWood, MAP_ONE_ID, 3);

    expect(
      state.quests.clear_the_shore.objectiveProgress.gather_shore_fringe_wood,
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
        clear_the_shore: "active",
      }),
    });
    const shoreWood = createResource("shore-wood", { x: 47, y: 25 }, {
      resourceType: "wood",
    });
    const defeatedSlime = createDefeatedEnemy(
      "shore-slime",
      "slime",
      "shore-fringe",
    );

    state = recordResourceGatheredForQuests(state, shoreWood, MAP_ONE_ID, 3);
    expect(state.quests.clear_the_shore.status).toBe("active");
    expect(
      state.quests.clear_the_shore.objectiveProgress
        .gather_shore_fringe_wood.completed,
    ).toBe(true);

    state = recordQuestPoiReachedForQuests(
      state,
      "shore-fringe-supply-marker",
      MAP_ONE_ID,
    );

    expect(
      state.quests.clear_the_shore.objectiveProgress
        .inspect_shore_fringe_marker.completed,
    ).toBe(true);

    for (let count = 0; count < 10; count += 1) {
      state = recordEnemyDefeatedForQuests(state, defeatedSlime, MAP_ONE_ID);
    }

    expect(
      state.quests.clear_the_shore.objectiveProgress
        .defeat_shore_fringe_slimes.completed,
    ).toBe(true);
    expect(state.quests.clear_the_shore.status).toBe(
      "ready_to_turn_in",
    );
  });

  it("uses existing stack space before requiring new reward slots", () => {
    let state = createStateWithParty({
      inventory: {
        capacity: 1,
        slots: [{ itemId: "hearty_trail_rations", quantity: 1 }],
      },
      quests: createQuestStates({
        clear_the_shore: "completed",
        stolen_field_supplies: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state);

    expect(state.quests.stolen_field_supplies.status).toBe("completed");
    expect(state.inventory.slots).toEqual([
      { itemId: "hearty_trail_rations", quantity: 2 },
    ]);
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(35);
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
      { itemId: "guard_coif", quantity: 1 },
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
