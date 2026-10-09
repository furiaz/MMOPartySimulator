import { describe, expect, it } from "vitest";
import { createCompanion, createNpc } from "./entities";
import { updateEntitySeparationSystem } from "./entitySeparationSystem";
import {
  GUILD_INN_COMPANION_CAPACITY,
  GUILD_SECONDARY_PARTY_ID,
  createInitialGuildSecondaryPartiesState,
  getGuildCompanionCapacity,
  getGuildSecondaryPartiesState,
  getInnReserveCompanions,
  getTotalRosterCompanionCount,
  getTotalRosterCompanionLevel,
  moveGuildRosterCompanion,
} from "./guildSecondaryParties";
import { isGuildTavernServiceAvailable } from "./guildTavern";
import { getGuildRecruitDestination } from "./guildRecruit";
import {
  createInitialGuildUpgradesState,
  getGuildSecondaryPartyCount,
} from "./guildRecruitUpgrades";
import { createInitialInnUpgradesState } from "./innRoomUpgrades";
import { isPositionAvailable } from "./movementPlanning";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Companion } from "./types";

describe("guild secondary parties", () => {
  it("creates three locked Field Team shells with one empty slot each", () => {
    expect(createInitialGuildSecondaryPartiesState()).toEqual({
      parties: [
        {
          id: GUILD_SECONDARY_PARTY_ID,
          displayName: "Field Team 1",
          companionIds: [null],
          assignment: null,
        },
        {
          id: "secondary-party-2",
          displayName: "Field Team 2",
          companionIds: [null],
          assignment: null,
        },
        {
          id: "secondary-party-3",
          displayName: "Field Team 3",
          companionIds: [null],
          assignment: null,
        },
      ],
    });
  });

  it("starts with zero unlocked Field Teams", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      unlockedSecondaryParties: 0,
    });

    expect(getGuildSecondaryPartyCount(state)).toBe(0);
    expect(getGuildSecondaryPartiesState(state).parties[0].companionIds).toEqual([
      null,
    ]);
  });

  it("moves an active companion to the Inn's Reserve", () => {
    const state = createRosterState({
      activeIds: ["leader", "ally"],
    });

    const result = moveGuildRosterCompanion(state, "ally", {
      area: "inn_reserve",
      slotIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.entities.ally).toBeUndefined();
    expect(result.state.restingCompanionsById?.ally).toMatchObject({
      id: "ally",
      state: "idle",
      currentTargetId: null,
    });
    expect(getInnReserveCompanions(result.state).map((companion) => companion.id)).toEqual([
      "ally",
    ]);
  });

  it("moves an active companion to Field Team 1", () => {
    const state = createRosterState({
      activeIds: ["leader", "ally"],
    });

    const result = moveGuildRosterCompanion(state, "ally", {
      area: "secondary_party",
      partyId: GUILD_SECONDARY_PARTY_ID,
      slotIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.entities.ally).toBeUndefined();
    expect(result.state.restingCompanionsById?.ally).toBeDefined();
    expect(result.state.guildSecondaryParties?.parties[0].companionIds).toEqual([
      "ally",
    ]);
    expect(getInnReserveCompanions(result.state)).toEqual([]);
  });

  it("moves an Inn reserve companion back to Main Party near the leader", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["reserve"],
      highestCharacterLevelEver: 10,
    });

    const result = moveGuildRosterCompanion(state, "reserve", {
      area: "main_party",
      slotIndex: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.entities.reserve).toMatchObject({
      id: "reserve",
      kind: "companion",
      partyOrder: 1,
      followTargetId: "leader",
      state: "idle",
    });
    expect(
      isPositionAvailable(result.state, result.state.entities.reserve.position, {
        ignoredEntityId: "reserve",
      }),
    ).toBe(true);
    expect(result.state.restingCompanionsById?.reserve).toBeUndefined();
  });

  it("spawns a returning companion around the leader without using occupied spaces", () => {
    const state = createRosterState({
      activeIds: ["leader", "ally"],
      restingIds: ["reserve"],
      highestCharacterLevelEver: 10,
      positionsById: {
        leader: { x: 10, y: 10 },
        ally: { x: 10, y: 11.25 },
        reserve: { x: 50, y: 50 },
      },
    });

    const result = moveGuildRosterCompanion(state, "reserve", {
      area: "main_party",
      slotIndex: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const reserve = result.state.entities.reserve;

    expect(reserve.position).not.toEqual({ x: 10, y: 10 });
    expect(reserve.position).not.toEqual({ x: 10, y: 11.25 });
    expect(
      isPositionAvailable(result.state, reserve.position, {
        ignoredEntityId: reserve.id,
      }),
    ).toBe(true);
  });

  it("does not let roster spawn separation move the leader", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["reserve"],
      highestCharacterLevelEver: 10,
      positionsById: {
        leader: { x: 10, y: 10 },
        reserve: { x: 50, y: 50 },
      },
    });

    const result = moveGuildRosterCompanion(state, "reserve", {
      area: "main_party",
      slotIndex: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const leaderPositionBeforeSeparation = result.state.entities.leader.position;
    const reservePositionBeforeSeparation = result.state.entities.reserve.position;
    const separatedState = updateEntitySeparationSystem(result.state, new Set());

    expect(separatedState.entities.leader.position).toEqual(
      leaderPositionBeforeSeparation,
    );
    expect(separatedState.entities.reserve.position).toEqual(
      reservePositionBeforeSeparation,
    );
  });

  it("clears active movement intent when returning a companion to Main Party", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["reserve"],
      highestCharacterLevelEver: 10,
    });

    const result = moveGuildRosterCompanion(
      {
        ...state,
        autoModeEnabled: true,
        worldTravelTargetMapId: "map-1",
        moveIntentsByEntityId: {
          leader: { x: 20, y: 20 },
        },
        reservedPositionsByEntityId: {
          leader: { x: 20, y: 20 },
        },
        partyFormation: {
          phase: "traveling",
          targetId: null,
          approachPoint: { x: 20, y: 20 },
          direction: { x: 1, y: 0 },
          slotsByEntityId: {
            leader: { x: 20, y: 20 },
          },
          slotReasonsByEntityId: {
            leader: "stale-travel",
          },
          skippedTargetIds: [],
        },
      },
      "reserve",
      {
        area: "main_party",
        slotIndex: 1,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.autoModeEnabled).toBe(false);
    expect(result.state.worldTravelTargetMapId).toBeNull();
    expect(result.state.moveIntentsByEntityId).toEqual({});
    expect(result.state.reservedPositionsByEntityId).toEqual({});
    expect(result.state.partyFormation).toBeUndefined();
  });

  it("swaps occupied slots between Main Party and Field Team", () => {
    const state = createRosterState({
      activeIds: ["leader", "ally"],
      restingIds: ["secondary"],
      secondaryIds: ["secondary"],
      highestCharacterLevelEver: 10,
    });

    const result = moveGuildRosterCompanion(state, "ally", {
      area: "secondary_party",
      partyId: GUILD_SECONDARY_PARTY_ID,
      slotIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(Object.values(result.state.entities).filter((entity) => entity.kind === "companion").map((entity) => entity.id)).toEqual([
      "leader",
      "secondary",
    ]);
    expect(result.state.entities.secondary).toMatchObject({
      partyOrder: 1,
      followTargetId: "leader",
    });
    expect(result.state.guildSecondaryParties?.parties[0].companionIds).toEqual([
      "ally",
    ]);
    expect(result.state.restingCompanionsById?.ally).toBeDefined();
  });

  it("swaps occupied slots between Inn's Reserve and Field Team", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["reserve", "secondary"],
      secondaryIds: ["secondary"],
    });

    const result = moveGuildRosterCompanion(state, "reserve", {
      area: "secondary_party",
      partyId: GUILD_SECONDARY_PARTY_ID,
      slotIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.guildSecondaryParties?.parties[0].companionIds).toEqual([
      "reserve",
    ]);
    expect(getInnReserveCompanions(result.state).map((companion) => companion.id)).toEqual([
      "secondary",
    ]);
  });

  it("swaps occupied slots within Main Party without duplicating companions", () => {
    const state = createRosterState({
      activeIds: ["leader", "middle", "tail"],
      highestCharacterLevelEver: 10,
    });

    const result = moveGuildRosterCompanion(state, "leader", {
      area: "main_party",
      slotIndex: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(getActiveCompanionIds(result.state)).toEqual([
      "tail",
      "middle",
      "leader",
    ]);
    expect(new Set(getActiveCompanionIds(result.state)).size).toBe(3);
  });

  it("swaps occupied slots within Inn's Reserve without duplicating companions", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["reserve-a", "reserve-b"],
    });

    const result = moveGuildRosterCompanion(state, "reserve-a", {
      area: "inn_reserve",
      slotIndex: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(getInnReserveCompanions(result.state).map((companion) => companion.id)).toEqual([
      "reserve-b",
      "reserve-a",
    ]);
  });

  it("blocks moves that would leave Main Party empty", () => {
    const state = createRosterState({
      activeIds: ["leader"],
    });

    const result = moveGuildRosterCompanion(state, "leader", {
      area: "inn_reserve",
      slotIndex: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "main_party_requires_companion",
    });
    expect(result.state.entities.leader).toBeDefined();
  });

  it("hands leadership to the incoming swapped companion when the leader leaves Main Party", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["incoming"],
      secondaryIds: ["incoming"],
    });

    const result = moveGuildRosterCompanion(state, "leader", {
      area: "secondary_party",
      partyId: GUILD_SECONDARY_PARTY_ID,
      slotIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.partyLeaderId).toBe("incoming");
    expect(result.state.entities.incoming).toMatchObject({
      followTargetId: "incoming",
      partyOrder: 0,
    });
    expect(result.state.guildSecondaryParties?.parties[0].companionIds).toEqual([
      "leader",
    ]);
  });

  it("keeps the Guild and Inn interface usable when leadership changes during a roster move", () => {
    const state = createRosterState({
      activeIds: ["leader", "ally"],
      positionsById: {
        leader: { x: 50, y: 55.5 },
        ally: { x: 46, y: 55.5 },
      },
      npcs: [
        createNpc(
          "guild-coordinator",
          { x: 50, y: 56 },
          "Guild Coordinator",
          "guild_coordinator",
        ),
      ],
    });

    expect(isGuildTavernServiceAvailable(state)).toBe(true);

    const result = moveGuildRosterCompanion(state, "leader", {
      area: "secondary_party",
      partyId: GUILD_SECONDARY_PARTY_ID,
      slotIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.partyLeaderId).toBe("ally");
    expect(result.state.entities.ally).toMatchObject({
      position: { x: 50, y: 55.5 },
    });
    expect(isGuildTavernServiceAvailable(result.state)).toBe(true);
  });

  it("keeps the Guild and Inn interface usable when a companion returns to Main Party", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["reserve"],
      highestCharacterLevelEver: 10,
      positionsById: {
        leader: { x: 50, y: 55.5 },
        reserve: { x: 10, y: 10 },
      },
      npcs: [
        createNpc(
          "guild-coordinator",
          { x: 50, y: 56 },
          "Guild Coordinator",
          "guild_coordinator",
        ),
      ],
    });

    expect(isGuildTavernServiceAvailable(state)).toBe(true);

    const result = moveGuildRosterCompanion(state, "reserve", {
      area: "main_party",
      slotIndex: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.partyLeaderId).toBe("leader");
    expect(isGuildTavernServiceAvailable(result.state)).toBe(true);
  });

  it("compacts Main Party party order after moves", () => {
    const state = createRosterState({
      activeIds: ["leader", "middle", "tail"],
      highestCharacterLevelEver: 10,
    });

    const result = moveGuildRosterCompanion(state, "middle", {
      area: "inn_reserve",
      slotIndex: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.state.entities.leader).toMatchObject({ partyOrder: 0 });
    expect(result.state.entities.tail).toMatchObject({ partyOrder: 1 });
  });

  it("rejects locked Main Party slots", () => {
    const state = createRosterState({
      activeIds: ["leader"],
      restingIds: ["reserve"],
      highestCharacterLevelEver: 1,
    });

    const result = moveGuildRosterCompanion(state, "reserve", {
      area: "main_party",
      slotIndex: 2,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "locked_main_party_slot",
    });
    expect(result.state.restingCompanionsById?.reserve).toBeDefined();
  });

  it("counts total roster capacity and level across Main Party, Inn's Reserve, and Field Team", () => {
    const state = createRosterState({
      activeIds: ["leader", "ally"],
      restingIds: ["reserve", "secondary"],
      secondaryIds: ["secondary"],
      levelsById: {
        leader: 10,
        ally: 5,
        reserve: 3,
        secondary: 2,
      },
    });

    expect(getGuildCompanionCapacity()).toBe(GUILD_INN_COMPANION_CAPACITY);
    expect(getGuildCompanionCapacity(state)).toBe(GUILD_INN_COMPANION_CAPACITY);
    expect(getTotalRosterCompanionCount(state)).toBe(4);
    expect(getTotalRosterCompanionLevel(state)).toBe(20);
  });

  it("uses upgraded Inn room capacity for recruit blocking", () => {
    const state = createRosterState({
      activeIds: ["leader", "ally"],
      restingIds: ["reserve", "secondary"],
      secondaryIds: ["secondary"],
      innRoomLevel: 2,
    });

    expect(getGuildCompanionCapacity(state)).toBe(5);
    expect(getTotalRosterCompanionCount(state)).toBe(4);
    expect(getGuildRecruitDestination(state)).toBe("tavern_reserve");
  });

  it("blocks new recruits at total capacity but tolerates old over-cap states", () => {
    const fullState = createRosterState({
      activeIds: ["leader", "ally"],
      restingIds: ["reserve", "secondary"],
      secondaryIds: ["secondary"],
    });
    const overCapState = createRosterState({
      activeIds: ["leader", "ally"],
      restingIds: ["reserve", "secondary", "extra"],
      secondaryIds: ["secondary"],
    });

    expect(getGuildRecruitDestination(fullState)).toBe("blocked_full");
    expect(getTotalRosterCompanionCount(overCapState)).toBe(5);
    expect(getGuildSecondaryPartiesState(overCapState).parties[0].companionIds).toEqual([
      "secondary",
    ]);
    expect(getGuildRecruitDestination(overCapState)).toBe("blocked_full");
  });
});

function createRosterState({
  activeIds,
  restingIds = [],
  secondaryIds = [null],
  highestCharacterLevelEver = 1,
  levelsById = {},
  npcs = [],
  positionsById = {},
  unlockedSecondaryParties = 1,
  innRoomLevel = 1,
}: {
  activeIds: string[];
  restingIds?: string[];
  secondaryIds?: Array<string | null>;
  highestCharacterLevelEver?: number;
  levelsById?: Record<string, number>;
  npcs?: GameState["entities"][string][];
  positionsById?: Record<string, { x: number; y: number }>;
  unlockedSecondaryParties?: number;
  innRoomLevel?: number;
}): GameState {
  const activeCompanions = activeIds.map((id, index) =>
    createRosterCompanion(
      id,
      index,
      levelsById[id] ?? 1,
      positionsById[id],
    ),
  );
  const restingCompanions = restingIds.map((id, index) =>
    createRosterCompanion(
      id,
      activeCompanions.length + index,
      levelsById[id] ?? 1,
      positionsById[id],
    ),
  );

  const guildUpgrades = createInitialGuildUpgradesState();
  guildUpgrades.secondaryParties.secondary_party_count =
    unlockedSecondaryParties;
  const innUpgrades = createInitialInnUpgradesState();
  innUpgrades.rooms.inn_room_count = innRoomLevel;

  return createTestGameState({
    currentMapId: "hub-2",
    entities: Object.fromEntries(
      [...activeCompanions, ...npcs].map((entity) => [entity.id, entity]),
    ),
    restingCompanionsById: Object.fromEntries(
      restingCompanions.map((companion) => [companion.id, companion]),
    ),
    partyLeaderId: activeIds[0] ?? "",
    highestCharacterLevelEver,
    guildUpgrades,
    innUpgrades,
    guildSecondaryParties: {
      parties: [
        {
          id: GUILD_SECONDARY_PARTY_ID,
          displayName: "Field Team 1",
          companionIds: secondaryIds,
        },
      ],
    },
  });
}

function createRosterCompanion(
  id: string,
  partyOrder: number,
  characterLevel: number,
  position = { x: 10 + partyOrder, y: 10 },
): Companion {
  return {
    ...createCompanion(
      id,
      position,
      "leader",
      partyOrder === 0 ? "defender" : "fighter",
      partyOrder,
    ),
    characterLevel,
    state: "idle",
    currentTargetId: null,
  };
}

function getActiveCompanionIds(state: GameState): string[] {
  return Object.values(state.entities)
    .filter((entity): entity is Companion => entity.kind === "companion")
    .sort((a, b) => a.partyOrder - b.partyOrder)
    .map((companion) => companion.id);
}
