import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import {
  createDebugMap,
  MAP_ONE_ID,
  MAP_SIX_ID,
  SLIMEWARD_CHEST_ID,
  SLIMEWARD_FLOOR_ONE_ID,
  SLIMEWARD_FLOOR_TWO_ID,
  MAP_TWO_ID,
  TELEPORTER_ID,
} from "./debugMap";
import {
  completeQuestObjective,
  recordDungeonChestCollectedForQuests,
  recordEnemyDefeatedForQuests,
  recordEquippedItemObjectivesForQuests,
  recordMapReachedForQuests,
  recordMerchantItemPurchasedForQuests,
  recordQuestPoiReachedForQuests,
  recordQuestRepairProgress,
  recordResourceGatheredForQuests,
  reconcileStateDerivedQuestObjectivesForQuests,
} from "./questProgressionHooks";
import {
  createInitialQuestStates,
  QUEST_DEFINITIONS,
} from "./questSystem";
import { createTestGameState } from "./testState";
import { isTeleportWorking } from "./teleportState";
import type { EnemyArchetypeId } from "./types";
import type { QuestId, QuestState } from "./questTypes";

describe("quest progression hooks", () => {
  it("updates enemy, resource, and POI objectives before readying a quest", () => {
    let state = createStateWithParty({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      quests: createQuestStates({
        clear_the_shore: "active",
      }),
    });
    const defeatedSlime = createDefeatedEnemy(
      "shore-slime",
      "slime",
      "shore-fringe",
    );
    const gladeWood = createResource("glade-wood", { x: 101, y: 8 }, {
      resourceType: "wood",
    });
    const shoreWood = createResource("shore-wood", { x: 47, y: 25 }, {
      resourceType: "wood",
    });

    state = recordResourceGatheredForQuests(state, gladeWood, MAP_ONE_ID, 1);
    expect(
      state.quests.clear_the_shore.objectiveProgress.gather_shore_fringe_wood
        .currentCount,
    ).toBe(0);

    for (let count = 0; count < 10; count += 1) {
      state = recordEnemyDefeatedForQuests(state, defeatedSlime, MAP_ONE_ID);
    }
    state = recordResourceGatheredForQuests(state, shoreWood, MAP_ONE_ID, 3);
    state = recordQuestPoiReachedForQuests(
      state,
      "shore-fringe-supply-marker",
      MAP_ONE_ID,
    );

    expect(
      state.quests.clear_the_shore.objectiveProgress.defeat_shore_fringe_slimes,
    ).toMatchObject({
      currentCount: 10,
      completed: true,
    });
    expect(
      state.quests.clear_the_shore.objectiveProgress.gather_shore_fringe_wood,
    ).toMatchObject({
      currentCount: 3,
      completed: true,
    });
    expect(state.quests.clear_the_shore.status).toBe("ready_to_turn_in");
  });

  it("records map reach objectives that do not require a specific POI", () => {
    const objective = QUEST_DEFINITIONS.rescue_the_grove_runner.objectives.find(
      (candidate) => candidate.id === "reach_grove_runner",
    );
    expect(objective).toBeDefined();

    const originalTargetPoiId = objective!.targetPoiId;
    const originalTargetPosition = objective!.targetPosition;
    delete objective!.targetPoiId;
    delete objective!.targetPosition;

    try {
      let state = createStateWithParty({
        currentMapId: MAP_TWO_ID,
        map: createDebugMap(MAP_TWO_ID),
        quests: createQuestStates({
          rescue_the_grove_runner: "active",
        }),
      });

      state = recordMapReachedForQuests(state, MAP_TWO_ID);

      expect(
        state.quests.rescue_the_grove_runner.objectiveProgress.reach_grove_runner,
      ).toMatchObject({
        currentCount: 1,
        completed: true,
      });
    } finally {
      objective!.targetPoiId = originalTargetPoiId;
      objective!.targetPosition = originalTargetPosition;
    }
  });

  it("records Azure Trial dungeon entry, boss defeat, and chest collection", () => {
    let state = createStateWithParty({
      currentMapId: SLIMEWARD_FLOOR_ONE_ID,
      map: createDebugMap(SLIMEWARD_FLOOR_ONE_ID),
      quests: createQuestStates({
        azure_trial: "active",
      }),
    });

    state = recordMapReachedForQuests(state, SLIMEWARD_FLOOR_ONE_ID);
    expect(
      state.quests.azure_trial.objectiveProgress.enter_slimeward_floor_one,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(state.quests.azure_trial.status).toBe("active");

    state = {
      ...state,
      currentMapId: SLIMEWARD_FLOOR_TWO_ID,
      map: createDebugMap(SLIMEWARD_FLOOR_TWO_ID),
    };
    state = recordEnemyDefeatedForQuests(
      state,
      {
        ...createEnemy("normal-slime", { x: 0, y: 0 }, undefined, {
          enemyTypeId: "green_slime",
          archetypeId: "slime",
          subzoneId: "f2-boss-room",
        }),
        state: "dead" as const,
        health: 0,
      },
      SLIMEWARD_FLOOR_TWO_ID,
    );
    expect(
      state.quests.azure_trial.objectiveProgress.defeat_azure_mass.currentCount,
    ).toBe(0);

    state = recordEnemyDefeatedForQuests(
      state,
      {
        ...createEnemy("azure-mass", { x: 0, y: 0 }, undefined, {
          enemyTypeId: "azure_mass",
          archetypeId: "slime",
          subzoneId: "f2-boss-room",
        }),
        state: "dead" as const,
        health: 0,
      },
      SLIMEWARD_FLOOR_TWO_ID,
    );
    expect(
      state.quests.azure_trial.objectiveProgress.defeat_azure_mass,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });

    state = recordDungeonChestCollectedForQuests(
      state,
      SLIMEWARD_CHEST_ID,
      SLIMEWARD_FLOOR_TWO_ID,
    );
    expect(
      state.quests.azure_trial.objectiveProgress.collect_slimeward_boss_chest,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(state.quests.azure_trial.status).toBe("ready_to_turn_in");
  });

  it("tracks repair progress and unlocks route teleports on completion", () => {
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
      4000,
    );

    expect(
      state.quests.break_lower_shore_blockage.runtime
        ?.repairProgressMsByObjectiveId?.repair_lower_shore_blockage,
    ).toBe(4000);
    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(false);

    state = completeQuestObjective(
      state,
      "break_lower_shore_blockage",
      "unlock_map_two_route",
    );

    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(true);
  });

  it("uses chance and pity for quest drops and queues quest item visuals", () => {
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
      () => 0.99,
      1000,
    );
    expect(
      state.quests.stolen_field_supplies.objectiveProgress
        .collect_mossy_glade_supplies.currentCount,
    ).toBe(0);

    state = recordEnemyDefeatedForQuests(
      state,
      defeatedBat,
      MAP_ONE_ID,
      () => 0.99,
      2000,
    );

    expect(
      state.quests.stolen_field_supplies.objectiveProgress
        .collect_mossy_glade_supplies.currentCount,
    ).toBe(1);
    expect(
      state.quests.stolen_field_supplies.runtime
        ?.questDropMissCountsByObjectiveId?.collect_mossy_glade_supplies,
    ).toBe(0);
    expect(state.dropVisualEvents?.[0]).toMatchObject({
      kind: "quest_item",
      displayName: "Stolen Supply Bundle",
      questId: "stolen_field_supplies",
      objectiveId: "collect_mossy_glade_supplies",
    });
  });

  it("records equipment state and merchant purchase objectives", () => {
    const leader = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      equipment: {
        ...createCompanion("equipment-template", { x: 0, y: 0 }, "companion-1")
          .equipment,
        mainHand: "training_sword" as const,
        head: "guard_coif" as const,
      },
      consumables: {
        ...createCompanion("consumable-template", { x: 0, y: 0 }, "companion-1")
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
      quests: createQuestStates({
        outfit_the_expedition: "active",
      }),
    });

    state = recordEquippedItemObjectivesForQuests(state, "test_check");

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
    expect(
      state.quests.outfit_the_expedition.objectiveProgress.buy_first_aid_skill_book
        .completed,
    ).toBe(false);

    state = recordMerchantItemPurchasedForQuests(state, "first_aid_skill_book");

    expect(
      state.quests.outfit_the_expedition.objectiveProgress.buy_first_aid_skill_book,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(state.quests.outfit_the_expedition.status).toBe("ready_to_turn_in");
  });

  it("reconciles current livestock ownership and active party size until completion", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 0, y: 0 },
      "companion-1",
    );
    const follower = createCompanion(
      "companion-2",
      { x: 1, y: 0 },
      leader.id,
    );
    const thirdCompanion = {
      ...createCompanion("companion-3", { x: 2, y: 0 }, leader.id),
      state: "dead" as const,
      health: 0,
    };
    let state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      restingCompanionsById: {
        [thirdCompanion.id]: thirdCompanion,
      },
      partyLeaderId: leader.id,
      quests: createQuestStates({ into_the_briar_burrows: "active" }),
    });

    state = reconcileStateDerivedQuestObjectivesForQuests(state, "test");
    expect(
      state.quests.into_the_briar_burrows.objectiveProgress
        .assemble_three_companions,
    ).toMatchObject({ currentCount: 2, completed: false });

    const leaderOnlyEntities = { ...state.entities };
    delete leaderOnlyEntities[follower.id];
    state = reconcileStateDerivedQuestObjectivesForQuests(
      {
        ...state,
        entities: leaderOnlyEntities,
      },
      "test",
    );
    expect(
      state.quests.into_the_briar_burrows.objectiveProgress
        .assemble_three_companions,
    ).toMatchObject({ currentCount: 1, completed: false });

    state = reconcileStateDerivedQuestObjectivesForQuests(
      {
        ...state,
        entities: {
          ...state.entities,
          [follower.id]: follower,
          [thirdCompanion.id]: thirdCompanion,
        },
        restingCompanionsById: {},
        livestock: {
          ...state.livestock!,
          ownedCreaturesById: {
            ...state.livestock!.ownedCreaturesById,
            tin_crawler: 1,
          },
        },
      },
      "test",
    );
    expect(
      state.quests.into_the_briar_burrows.objectiveProgress
        .assemble_three_companions,
    ).toMatchObject({ currentCount: 3, completed: true });
    expect(
      state.quests.into_the_briar_burrows.objectiveProgress
        .find_tin_crawler_hatchling,
    ).toMatchObject({ currentCount: 1, completed: true });

    const withoutThirdCompanion = { ...state.entities };
    delete withoutThirdCompanion[thirdCompanion.id];
    state = reconcileStateDerivedQuestObjectivesForQuests(
      {
        ...state,
        entities: withoutThirdCompanion,
        livestock: {
          ...state.livestock!,
          ownedCreaturesById: {
            ...state.livestock!.ownedCreaturesById,
            tin_crawler: 0,
          },
        },
      },
      "test",
    );

    expect(
      state.quests.into_the_briar_burrows.objectiveProgress
        .assemble_three_companions,
    ).toMatchObject({ currentCount: 3, completed: true });
    expect(
      state.quests.into_the_briar_burrows.objectiveProgress
        .find_tin_crawler_hatchling,
    ).toMatchObject({ currentCount: 1, completed: true });
  });

  it("charges Patron Wards only from matching ambient Nightmire enemies", () => {
    let state = createStateWithParty({
      currentMapId: MAP_SIX_ID,
      map: createDebugMap(MAP_SIX_ID),
      quests: createQuestStates({ the_patrons_shadow: "active" }),
    });
    const nightBat = {
      ...createEnemy("night-bat", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "night_bat",
        subzoneId: "nightmire-canopy",
      }),
      state: "dead" as const,
      health: 0,
    };
    const superiorNightBat = {
      ...createEnemy("superior-night-bat", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "night_bat",
        subzoneId: "nightmire-canopy",
        variant: "superior",
      }),
      state: "dead" as const,
      health: 0,
    };
    const questDefender = {
      ...createEnemy("quest-night-bat", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "night_bat",
        subzoneId: "nightmire-canopy",
        questSpawn: {
          questId: "the_patrons_shadow",
          objectiveId: "break_night_bat_ward",
          targetPosition: { x: 96, y: 20 },
          patronAura: true,
        },
      }),
      state: "dead" as const,
      health: 0,
    };
    const wrongEnemy = {
      ...createEnemy("cinder-wisp", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "cinder_wisp",
        subzoneId: "nightmire-canopy",
      }),
      state: "dead" as const,
      health: 0,
    };

    state = recordEnemyDefeatedForQuests(state, nightBat, MAP_SIX_ID);
    state = recordEnemyDefeatedForQuests(state, superiorNightBat, MAP_SIX_ID);
    state = recordEnemyDefeatedForQuests(state, questDefender, MAP_SIX_ID);
    state = recordEnemyDefeatedForQuests(state, wrongEnemy, MAP_SIX_ID);

    expect(
      state.quests.the_patrons_shadow.objectiveProgress.break_night_bat_ward,
    ).toMatchObject({ currentCount: 3, completed: false });
    expect(
      state.quests.the_patrons_shadow.objectiveProgress.break_cinder_wisp_ward,
    ).toMatchObject({ currentCount: 1, completed: false });
  });

  it("completes a tracked quest-spawn target once without applying Superior double credit", () => {
    const quests = createQuestStates({ open_wolf_causeway: "active" });
    const causewayQuest = quests.open_wolf_causeway;
    quests.open_wolf_causeway = {
      ...causewayQuest,
      objectiveProgress: {
        ...causewayQuest.objectiveProgress,
        escort_causeway_worker: {
          objectiveId: "escort_causeway_worker",
          currentCount: 1,
          completed: true,
        },
        defend_wolf_causeway: {
          objectiveId: "defend_wolf_causeway",
          currentCount: 1,
          completed: true,
        },
      },
      runtime: {
        questSpawnedEnemyIdsByObjectiveId: {
          defeat_causeway_elite: ["tracked-superior-wolf"],
        },
      },
    };
    let state = createStateWithParty({
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      quests,
    });
    const unrelatedSuperiorWolf = {
      ...createEnemy("ambient-superior-wolf", { x: 0, y: 0 }, "aggressive", {
        enemyTypeId: "wolf",
        level: 8,
        variant: "superior",
        subzoneId: "north-east",
      }),
      state: "dead" as const,
      health: 0,
    };
    const trackedSuperiorWolf = {
      ...createEnemy(
        "tracked-superior-wolf",
        { x: 145, y: 22 },
        "aggressive",
        {
          enemyTypeId: "wolf",
          level: 8,
          variant: "superior",
          encounterBand: "standard",
          subzoneId: "north-east",
          questSpawn: {
            questId: "open_wolf_causeway",
            objectiveId: "defeat_causeway_elite",
            targetPosition: { x: 145, y: 22 },
          },
        },
      ),
      state: "dead" as const,
      health: 0,
    };

    state = recordEnemyDefeatedForQuests(
      state,
      unrelatedSuperiorWolf,
      MAP_TWO_ID,
    );
    expect(
      state.quests.open_wolf_causeway.objectiveProgress.defeat_causeway_elite,
    ).toMatchObject({ currentCount: 0, completed: false });

    state = recordEnemyDefeatedForQuests(
      state,
      trackedSuperiorWolf,
      MAP_TWO_ID,
    );
    expect(
      state.quests.open_wolf_causeway.objectiveProgress.defeat_causeway_elite,
    ).toMatchObject({ currentCount: 1, completed: true });

    state = recordEnemyDefeatedForQuests(
      state,
      trackedSuperiorWolf,
      MAP_TWO_ID,
    );
    expect(
      state.quests.open_wolf_causeway.objectiveProgress.defeat_causeway_elite,
    ).toMatchObject({ currentCount: 1, completed: true });
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
