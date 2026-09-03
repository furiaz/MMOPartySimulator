import { describe, expect, it } from "vitest";
import { createDebugMap, MAP_ONE_ID } from "./debugMap";
import { createCompanion } from "./entities";
import {
  MIN_GUILD_SECONDARY_PARTY_ASSIGNMENT_REDEEM_MS,
  assignGuildSecondaryParty,
  getGuildSecondaryPartyAssignmentDestinations,
  getGuildSecondaryPartyAssignmentPreview,
  redeemGuildSecondaryPartyAssignment,
  refreshGuildSecondaryPartyAssignments,
  returnGuildSecondaryPartyAssignment,
} from "./guildSecondaryPartyAssignments";
import { createInitialGuildUpgradesState } from "./guildRecruitUpgrades";
import {
  GUILD_SECONDARY_PARTY_ID,
  moveGuildRosterCompanion,
} from "./guildSecondaryParties";
import { takeGuildNoticeBoardQuest } from "./guildNoticeBoard";
import { createEmptyPartyInventory } from "./inventory";
import { createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Companion, GuildSecondaryPartyAssignmentState } from "./types";
import { recordCurrentWorldDiscovery } from "./worldDiscovery";

const NOW_MS = 1_000_000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * ONE_HOUR_MS;
const SHORE_FRINGE_ID = "shore-fringe";

describe("guild field team assignments", () => {
  it("records visited wild subzones as assignment destinations", () => {
    const state = recordCurrentWorldDiscovery(createAssignmentState());

    expect(getGuildSecondaryPartyAssignmentDestinations(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mapId: MAP_ONE_ID,
          subzoneId: SHORE_FRINGE_ID,
        }),
      ]),
    );
  });

  it("hides unvisited destinations and blocks assigning to them", () => {
    const state = createAssignmentState({ visited: false });

    expect(getGuildSecondaryPartyAssignmentDestinations(state)).toEqual([]);

    const result = assignGuildSecondaryParty(
      state,
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unvisited_destination");
    }
  });

  it("previews an unlocked party against a visited destination", () => {
    const preview = getGuildSecondaryPartyAssignmentPreview(
      createAssignmentState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }

    expect(preview.estimate.available).toBe(true);
    expect(preview.experienceEfficiency).toBe(0.5);
    expect(preview.dropEfficiency).toBe(0.5);
    expect(preview.maxDurationMs).toBe(SIX_HOURS_MS);
  });

  it("assigns with max duration and locks roster movement", () => {
    const result = assignGuildSecondaryParty(
      createAssignmentState(),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const assignment = result.state.guildSecondaryParties?.parties[0].assignment;
    expect(assignment).toMatchObject({
      status: "assigned",
      mapId: MAP_ONE_ID,
      subzoneId: SHORE_FRINGE_ID,
      assignedAtMs: NOW_MS,
      lastSettledAtMs: NOW_MS,
      capsAtMs: NOW_MS + SIX_HOURS_MS,
      maxDurationMs: SIX_HOURS_MS,
    });

    const moved = moveGuildRosterCompanion(result.state, "secondary", {
      area: "inn_reserve",
      slotIndex: 0,
    });
    expect(moved).toMatchObject({ ok: false, reason: "party_assigned" });
  });

  it("requires one minute before redeeming", () => {
    const assigned = assignOneFieldTeam();

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const redeemed = redeemGuildSecondaryPartyAssignment(
      assigned.state,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + MIN_GUILD_SECONDARY_PARTY_ASSIGNMENT_REDEEM_MS - 1,
    );

    expect(redeemed.ok).toBe(false);
    if (!redeemed.ok) {
      expect(redeemed.reason).toBe("not_ready");
    }
  });

  it("returns before one minute without rewards and unlocks roster movement", () => {
    const assigned = assignOneFieldTeam();

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const returned = returnGuildSecondaryPartyAssignment(
      assigned.state,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + 30_000,
    );

    expect(returned.ok).toBe(true);
    if (!returned.ok) {
      return;
    }

    expect(returned.summary).toBeNull();
    expect(returned.state.restingCompanionsById?.secondary.characterXp).toBe(0);
    expect(returned.state.guildSecondaryParties?.parties[0].assignment).toBeNull();

    const moved = moveGuildRosterCompanion(returned.state, "secondary", {
      area: "inn_reserve",
      slotIndex: 0,
    });
    expect(moved.ok).toBe(true);
  });

  it("caps claimable progress at max duration", () => {
    const assigned = assignOneFieldTeam();

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const refreshed = refreshGuildSecondaryPartyAssignments(
      assigned.state,
      NOW_MS + SIX_HOURS_MS + ONE_HOUR_MS,
    );

    expect(refreshed.guildSecondaryParties?.parties[0].assignment?.status).toBe(
      "capped",
    );

    const redeemed = redeemGuildSecondaryPartyAssignment(
      refreshed,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + SIX_HOURS_MS + ONE_HOUR_MS,
    );

    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) {
      return;
    }
    expect(redeemed.summary).not.toBeNull();
    if (!redeemed.summary) {
      return;
    }

    expect(redeemed.summary.elapsedMs).toBe(SIX_HOURS_MS);
  });

  it("redeems assignment rewards to inactive Field Team members and renews the timer", () => {
    const assigned = assignOneFieldTeam();

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const redeemed = redeemGuildSecondaryPartyAssignment(
      assigned.state,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) {
      return;
    }
    expect(redeemed.summary).not.toBeNull();
    if (!redeemed.summary) {
      return;
    }

    expect(redeemed.summary.result.xpGranted).toBeGreaterThan(0);
    expect(redeemed.state.restingCompanionsById?.secondary.characterXp).toBeGreaterThan(0);
    expect(redeemed.state.guildSecondaryParties?.parties[0].assignment).toMatchObject({
      status: "assigned",
      lastSettledAtMs: NOW_MS + ONE_HOUR_MS,
      capsAtMs: NOW_MS + ONE_HOUR_MS + SIX_HOURS_MS,
    });
  });

  it("returns by redeeming assignment rewards and clearing the assignment", () => {
    const assigned = assignOneFieldTeam();

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const returned = returnGuildSecondaryPartyAssignment(
      assigned.state,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(returned.ok).toBe(true);
    if (!returned.ok) {
      return;
    }

    expect(returned.summary?.elapsedMs).toBe(ONE_HOUR_MS);
    expect(returned.summary?.result.xpGranted).toBeGreaterThan(0);
    expect(returned.state.restingCompanionsById?.secondary.characterXp).toBeGreaterThan(0);
    expect(returned.state.guildSecondaryParties?.parties[0].assignment).toBeNull();
  });

  it("shares redeemed assignment XP across that Field Team's members", () => {
    const assigned = assignGuildSecondaryParty(
      createAssignmentState({ secondaryPartyOneSecondCompanion: true }),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS,
    );

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const withXp = withPendingAssignmentResult(assigned.state, {
      xpGranted: 5,
      loot: [],
      resources: [],
      enemyKills: 0,
      enemyKillsByType: [],
    });
    const redeemed = redeemGuildSecondaryPartyAssignment(
      withXp,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) {
      return;
    }
    expect(redeemed.summary).not.toBeNull();
    if (!redeemed.summary) {
      return;
    }

    expect(redeemed.summary.result.xpGranted).toBe(5);
    expect(redeemed.state.restingCompanionsById?.secondary.characterXp).toBe(3);
    expect(redeemed.state.restingCompanionsById?.["secondary-two"].characterXp).toBe(2);
  });

  it("blocks remote redeem when inventory cannot hold generated loot and keeps it pending", () => {
    const assigned = assignGuildSecondaryParty(
      createAssignmentState({ inventory: createEmptyPartyInventory(0) }),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS,
    );

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const withLoot = withPendingAssignmentResult(assigned.state, {
      enemyKills: 1,
      enemyKillsByType: [],
      xpGranted: 0,
      loot: [{ itemId: "training_sword", quantity: 1 }],
      resources: [],
    });
    const redeemed = redeemGuildSecondaryPartyAssignment(
      withLoot,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(redeemed.ok).toBe(false);
    if (!redeemed.ok) {
      expect(redeemed.reason).toBe("inventory_full");
    }
    expect(
      redeemed.state.guildSecondaryParties?.parties[0].assignment?.pendingResult,
    ).toBeTruthy();
  });

  it("blocks returning when pending loot cannot fit and keeps the assignment pending", () => {
    const assigned = assignGuildSecondaryParty(
      createAssignmentState({ inventory: createEmptyPartyInventory(0) }),
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS,
    );

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const withLoot = withPendingAssignmentResult(assigned.state, {
      enemyKills: 1,
      enemyKillsByType: [],
      xpGranted: 0,
      loot: [{ itemId: "training_sword", quantity: 1 }],
      resources: [],
    });
    const returned = returnGuildSecondaryPartyAssignment(
      withLoot,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(returned.ok).toBe(false);
    if (!returned.ok) {
      expect(returned.reason).toBe("inventory_full");
    }
    expect(
      returned.state.guildSecondaryParties?.parties[0].assignment?.pendingResult,
    ).toBeTruthy();

    const moved = moveGuildRosterCompanion(returned.state, "secondary", {
      area: "inn_reserve",
      slotIndex: 0,
    });
    expect(moved).toMatchObject({ ok: false, reason: "party_assigned" });
  });

  it("reassigns by settling first, then changing destination", () => {
    const assigned = assignOneFieldTeam();

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const reassigned = assignGuildSecondaryParty(
      assigned.state,
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(reassigned.ok).toBe(true);
    if (!reassigned.ok) {
      return;
    }

    expect(reassigned.settledSummary?.elapsedMs).toBe(ONE_HOUR_MS);
    expect(reassigned.state.guildSecondaryParties?.parties[0].assignment).toMatchObject({
      assignedAtMs: NOW_MS + ONE_HOUR_MS,
      lastSettledAtMs: NOW_MS + ONE_HOUR_MS,
    });
  });

  it("keeps multiple party assignments independent", () => {
    const state = createAssignmentState({
      unlockedPartyCount: 2,
      secondaryPartyTwoCompanion: true,
    });
    const first = assignGuildSecondaryParty(
      state,
      "secondary-party-1",
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = assignGuildSecondaryParty(
      first.state,
      "secondary-party-2",
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS + 10,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.state.guildSecondaryParties?.parties[0].assignment?.rewardSeed)
      .not.toBe(second.state.guildSecondaryParties?.parties[1].assignment?.rewardSeed);
  });

  it("progresses taken Notice Board quests from redeemed assignment kills", () => {
    const taken = takeGuildNoticeBoardQuest(createAssignmentState(), NOW_MS, 0);
    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    const assigned = assignGuildSecondaryParty(
      taken.state,
      GUILD_SECONDARY_PARTY_ID,
      MAP_ONE_ID,
      SHORE_FRINGE_ID,
      NOW_MS,
    );
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const withKills = withPendingAssignmentResult(assigned.state, {
      enemyKills: 2,
      enemyKillsByType: [
        { enemyTypeId: "goblin_shaman", enemyLevel: 10, quantity: 2 },
      ],
      xpGranted: 0,
      loot: [],
      resources: [],
    });
    const redeemed = redeemGuildSecondaryPartyAssignment(
      withKills,
      GUILD_SECONDARY_PARTY_ID,
      NOW_MS + ONE_HOUR_MS,
    );

    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) {
      return;
    }

    expect(
      redeemed.state.guildNoticeBoard?.slots[0]?.objectives[0].currentCount,
    ).toBe(2);
  });

  it("preserves assignment and pending generated rewards through save restore", () => {
    const assigned = assignOneFieldTeam();

    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    const withPending = withPendingAssignmentResult(assigned.state, {
      enemyKills: 1,
      enemyKillsByType: [{ enemyTypeId: "green_slime", enemyLevel: 1, quantity: 1 }],
      xpGranted: 3,
      loot: [{ itemId: "training_sword", quantity: 1 }],
      resources: [],
    });
    const assignment = withPending.guildSecondaryParties?.parties[0].assignment;
    const restored = restoreGameStateFromSave(
      createSavedGame(withPending, NOW_MS + 1000),
    );

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildSecondaryParties?.parties[0].assignment).toEqual(
      assignment,
    );
  });
});

function assignOneFieldTeam() {
  return assignGuildSecondaryParty(
    createAssignmentState(),
    GUILD_SECONDARY_PARTY_ID,
    MAP_ONE_ID,
    SHORE_FRINGE_ID,
    NOW_MS,
  );
}

function createAssignmentState({
  inventory = createEmptyPartyInventory(),
  unlockedPartyCount = 1,
  visited = true,
  secondaryPartyOneSecondCompanion = false,
  secondaryPartyTwoCompanion = false,
}: {
  inventory?: GameState["inventory"];
  unlockedPartyCount?: number;
  visited?: boolean;
  secondaryPartyOneSecondCompanion?: boolean;
  secondaryPartyTwoCompanion?: boolean;
} = {}): GameState {
  const leader = createTestCompanion("leader", 0, { x: 14, y: 29 });
  const secondary = createTestCompanion("secondary", 1, { x: 14, y: 29 });
  const secondaryTwo = createTestCompanion("secondary-two", 2, { x: 15, y: 29 });
  const guildUpgrades = createInitialGuildUpgradesState();
  guildUpgrades.secondaryParties.secondary_party_count = unlockedPartyCount;
  const shouldIncludeSecondaryTwo =
    secondaryPartyOneSecondCompanion || secondaryPartyTwoCompanion;

  if (secondaryPartyOneSecondCompanion) {
    guildUpgrades.secondaryParties.parties[
      GUILD_SECONDARY_PARTY_ID
    ].secondary_party_members = 2;
  }

  return createTestGameState({
    entities: {
      leader,
    },
    restingCompanionsById: {
      secondary,
      ...(shouldIncludeSecondaryTwo ? { "secondary-two": secondaryTwo } : {}),
    },
    inventory,
    partyLeaderId: leader.id,
    highestCharacterLevelEver: 10,
    guildUpgrades,
    guildSecondaryParties: {
      parties: [
        {
          id: "secondary-party-1",
          displayName: "Field Team 1",
          companionIds: secondaryPartyOneSecondCompanion
            ? ["secondary", "secondary-two"]
            : ["secondary"],
          assignment: null,
        },
        {
          id: "secondary-party-2",
          displayName: "Field Team 2",
          companionIds:
            secondaryPartyTwoCompanion && !secondaryPartyOneSecondCompanion
              ? ["secondary-two"]
              : [null],
          assignment: null,
        },
      ],
    },
    currentMapId: visited ? MAP_ONE_ID : undefined,
    map: visited ? createDebugMap(MAP_ONE_ID) : undefined,
    worldDiscovery: visited
      ? {
          visitedMapIds: [MAP_ONE_ID],
          visitedSubzonesByMapId: {
            [MAP_ONE_ID]: [SHORE_FRINGE_ID],
          },
        }
      : {
          visitedMapIds: [],
          visitedSubzonesByMapId: {},
        },
  });
}

function createTestCompanion(
  id: string,
  partyOrder: number,
  position: { x: number; y: number },
): Companion {
  return {
    ...createCompanion(id, position, "leader", "fighter", partyOrder),
    state: "idle",
    currentTargetId: null,
  };
}

function withPendingAssignmentResult(
  state: GameState,
  result: NonNullable<GuildSecondaryPartyAssignmentState["pendingResult"]>,
): GameState {
  const party = state.guildSecondaryParties?.parties[0];
  const assignment = party?.assignment;

  if (!party || !assignment) {
    return state;
  }

  return {
    ...state,
    guildSecondaryParties: {
      parties: state.guildSecondaryParties?.parties.map((candidate) =>
        candidate.id === party.id
          ? {
              ...candidate,
              assignment: {
                ...assignment,
                status: "pending_loot",
                pendingResult: result,
                pendingElapsedMs: ONE_HOUR_MS,
              },
            }
          : candidate,
      ) ?? [],
    },
  };
}
