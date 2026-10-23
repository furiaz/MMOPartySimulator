import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  createInitialGuildRecruitState,
  getGuildRecruitDestination,
  getGuildRecruitReserveCapacity,
  GUILD_RECRUIT_REFRESH_INTERVAL_MS,
  recruitGuildCandidate,
  refreshGuildRecruitState,
} from "./guildRecruit";
import { createInitialInnUpgradesState } from "./innRoomUpgrades";
import { createInitialQuestStates } from "./questSystem";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion } from "./types";

const NOW_MS = 1_000_000;

describe("guild recruit", () => {
  it("routes a recruited companion to the active party when an active slot is open", () => {
    const state = createRosterState({
      activeCount: 2,
      highestCharacterLevelEver: 10,
    });

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.destination).toBe("active_party");
    expect(result.state.entities[result.companion.id]).toEqual(result.companion);
    expect(result.state.restingCompanionsById?.[result.companion.id]).toBeUndefined();
  });

  it("updates the active-party quest objective after recruitment", () => {
    const baseState = createRosterState({
      activeCount: 2,
      highestCharacterLevelEver: 10,
    });
    const quests = createInitialQuestStates();
    const state = {
      ...baseState,
      quests: {
        ...quests,
        into_the_briar_burrows: {
          ...quests.into_the_briar_burrows,
          status: "active" as const,
        },
      },
    };

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.state.quests.into_the_briar_burrows.objectiveProgress
        .assemble_three_companions,
    ).toMatchObject({ currentCount: 3, completed: true });
  });

  it("routes a recruited companion to the Inn's Reserve when active party is full", () => {
    const state = createRosterState({
      activeCount: 2,
      highestCharacterLevelEver: 1,
    });

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.destination).toBe("tavern_reserve");
    expect(result.state.entities[result.companion.id]).toBeUndefined();
    expect(result.state.restingCompanionsById?.[result.companion.id]).toMatchObject({
      id: result.companion.id,
      state: "idle",
      currentTargetId: null,
    });
  });

  it("blocks recruitment when total Inn companion capacity is full", () => {
    const state = createRosterState({
      activeCount: 2,
      restingCount: 2,
      highestCharacterLevelEver: 1,
    });

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(getGuildRecruitDestination(state)).toBe("blocked_full");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toBe("roster_full");
    expect(result.state.guildRecruit?.candidates[0]?.id).toBe(
      state.guildRecruit?.candidates[0]?.id,
    );
  });

  it("consumes only the recruited candidate and keeps the shared refresh timer", () => {
    const state = createRosterState({
      activeCount: 1,
      highestCharacterLevelEver: 10,
    });

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.guildRecruit?.candidates[0]).toBeNull();
    expect(result.state.guildRecruit?.nextRefreshAtMs).toBe(
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    );
  });

  it("replaces an ignored candidate when the three-hour timer expires", () => {
    const state = createRosterState({
      activeCount: 1,
      highestCharacterLevelEver: 10,
    });

    const refreshed = refreshGuildRecruitState(
      state,
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildRecruit?.candidates[0]).toMatchObject({
      id: "guild-recruit-candidate-2",
      sequence: 2,
      classId: "beginner",
      characterLevel: 1,
      role: "none",
    });
    expect(refreshed.guildRecruit?.nextRefreshAtMs).toBe(
      NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS * 2,
    );
  });

  it("creates a level 1 Beginner with None role and valid recruit defaults", () => {
    const state = createRosterState({
      activeCount: 1,
      highestCharacterLevelEver: 10,
    });

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.companion).toMatchObject({
      characterLevel: 1,
      characterXp: 0,
      classId: "beginner",
      role: "none",
    });
    expect(
      Object.values(result.companion.equipment).every(
        (item) => item === null || typeof item === "string",
      ),
    ).toBe(true);
  });

  it("keeps recruited companion ids unique across active and resting companions", () => {
    const existingActive = createActiveCompanion("guild-recruit-1", 0);
    const existingResting = createActiveCompanion("guild-recruit-2", 1);
    const leader = createActiveCompanion("companion-1", 2);
    const state = createTestGameState({
      entities: {
        [existingActive.id]: existingActive,
        [leader.id]: leader,
      },
      restingCompanionsById: {
        [existingResting.id]: existingResting,
      },
      partyLeaderId: leader.id,
      highestCharacterLevelEver: 30,
      guildRecruit: createInitialGuildRecruitState(NOW_MS),
    });

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.companion.id).toBe("guild-recruit-3");
    expect(result.state.entities["guild-recruit-1"]).toBeDefined();
    expect(result.state.restingCompanionsById?.["guild-recruit-2"]).toBeDefined();
    expect(result.state.entities["guild-recruit-3"]).toBeDefined();
  });

  it("uses a four-companion MVP Inn capacity", () => {
    expect(getGuildRecruitReserveCapacity()).toBe(4);
  });

  it("uses upgraded Inn room capacity when routing recruits", () => {
    const state = createRosterState({
      activeCount: 2,
      restingCount: 2,
      highestCharacterLevelEver: 1,
      innRoomLevel: 2,
    });

    const result = recruitGuildCandidate(state, NOW_MS);

    expect(getGuildRecruitReserveCapacity(state)).toBe(5);
    expect(getGuildRecruitDestination(state)).toBe("tavern_reserve");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.destination).toBe("tavern_reserve");
    expect(result.state.restingCompanionsById?.[result.companion.id]).toBeDefined();
  });
});

function createRosterState({
  activeCount,
  restingCount = 0,
  highestCharacterLevelEver,
  innRoomLevel = 1,
}: {
  activeCount: number;
  restingCount?: number;
  highestCharacterLevelEver: number;
  innRoomLevel?: number;
}): GameState {
  const activeCompanions = Array.from({ length: activeCount }, (_, index) =>
    createActiveCompanion(`companion-${index + 1}`, index),
  );
  const restingCompanions = Array.from({ length: restingCount }, (_, index) =>
    createActiveCompanion(`resting-${index + 1}`, activeCount + index),
  );
  const leader = activeCompanions[0];
  const innUpgrades = createInitialInnUpgradesState();
  innUpgrades.rooms.inn_room_count = innRoomLevel;

  return createTestGameState({
    entities: Object.fromEntries(
      activeCompanions.map((companion) => [companion.id, companion]),
    ),
    restingCompanionsById: Object.fromEntries(
      restingCompanions.map((companion) => [companion.id, companion]),
    ),
    partyLeaderId: leader?.id ?? "",
    highestCharacterLevelEver,
    innUpgrades,
    guildRecruit: createInitialGuildRecruitState(NOW_MS),
  });
}

function createActiveCompanion(id: string, partyOrder: number): Companion {
  return {
    ...createCompanion(
      id,
      { x: 10 + partyOrder, y: 10 },
      "companion-1",
      partyOrder === 0 ? "defender" : "fighter",
      partyOrder,
    ),
    state: "idle",
    currentTargetId: null,
  };
}
