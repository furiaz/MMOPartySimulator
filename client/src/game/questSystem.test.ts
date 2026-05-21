import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { createDebugTelemetryState, startDebugTelemetryRecording } from "./debugTelemetry";
import { createDebugMap, MAP_ONE_ID } from "./debugMap";
import {
  createInitialQuestStates,
  recordEnemyDefeatedForQuests,
  recordQuestPoiReachedForQuests,
  recordResourceGatheredForQuests,
  updateQuestGiverInteraction,
} from "./questSystem";
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
    expect(state.quests.gather_expedition_supplies.status).toBe("available");
    expect(state.quests.scout_the_northern_road.status).toBe("locked");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(25);
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
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(25);
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
