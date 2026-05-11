import { describe, expect, it } from "vitest";
import { createEnemy } from "./entities";
import {
  createInitialQuestStates,
  recordEnemyDefeatedForQuests,
  updateQuestGiverInteraction,
} from "./questSystem";
import { createTestGameState } from "./testState";

describe("prototype quest system", () => {
  it("accepts, progresses, readies, turns in, and unlocks quests", () => {
    let state = createTestGameState({
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
  });
});
