import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import {
  createDebugMap,
  MAP_ONE_ID,
  MAP_TWO_ID,
  TELEPORTER_ID,
} from "./debugMap";
import {
  completeQuestObjective,
  recordEnemyDefeatedForQuests,
  recordEquippedItemObjectivesForQuests,
  recordMapReachedForQuests,
  recordMerchantEquipmentPurchasedForQuests,
  recordQuestPoiReachedForQuests,
  recordQuestRepairProgress,
  recordResourceGatheredForQuests,
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
      state.quests.outfit_the_expedition.objectiveProgress.buy_merchant_equipment
        .completed,
    ).toBe(false);

    state = recordMerchantEquipmentPurchasedForQuests(state, "training_sword");

    expect(
      state.quests.outfit_the_expedition.objectiveProgress.buy_merchant_equipment,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(state.quests.outfit_the_expedition.status).toBe("ready_to_turn_in");
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
