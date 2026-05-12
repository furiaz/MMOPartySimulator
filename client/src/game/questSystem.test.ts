import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { createDebugTelemetryState, startDebugTelemetryRecording } from "./debugTelemetry";
import {
  createInitialQuestStates,
  recordEnemyDefeatedForQuests,
  updateQuestGiverInteraction,
} from "./questSystem";
import { createTestGameState } from "./testState";
import type { QuestId, QuestState } from "./questTypes";

describe("prototype quest system", () => {
  it("accepts, progresses, readies, turns in, and unlocks quests", () => {
    let state = createStateWithParty({
      quests: createInitialQuestStates(),
    });
    const defeatedEnemy = {
      ...createEnemy("enemy-1", { x: 0, y: 0 }),
      state: "dead" as const,
      health: 0,
    };

    state = updateQuestGiverInteraction(state);
    expect(state.quests.clear_the_shore.status).toBe("active");

    for (let count = 0; count < 5; count += 1) {
      state = recordEnemyDefeatedForQuests(state, defeatedEnemy, "map-1");
    }

    expect(state.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(
      state.quests.clear_the_shore.objectiveProgress.clear_map_1_enemies,
    ).toEqual({
      objectiveId: "clear_map_1_enemies",
      currentCount: 5,
      completed: true,
    });

    state = updateQuestGiverInteraction(state);
    expect(state.quests.clear_the_shore.status).toBe("completed");
    expect(state.quests.gather_expedition_supplies.status).toBe("available");
    expect(state.quests.scout_the_northern_road.status).toBe("available");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(25);
    expect(state.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 2 },
      { itemId: "worn_cap", quantity: 1 },
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

  it("uses existing stack space before requiring new reward slots", () => {
    let state = createStateWithParty({
      inventory: {
        capacity: 1,
        slots: [{ itemId: "herb", quantity: 1 }],
      },
      quests: createQuestStates({
        clear_the_shore: "completed",
        gather_expedition_supplies: "ready_to_turn_in",
      }),
    });

    state = updateQuestGiverInteraction(state);

    expect(state.quests.gather_expedition_supplies.status).toBe("completed");
    expect(state.inventory.slots).toEqual([{ itemId: "herb", quantity: 4 }]);
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
      { itemId: "worn_cap", quantity: 1 },
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

function getCompanion(state: ReturnType<typeof createTestGameState>, companionId: string) {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    throw new Error(`Missing companion ${companionId}`);
  }

  return companion;
}
