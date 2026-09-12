import { describe, expect, it } from "vitest";
import { createCompanion, createNpc } from "./entities";
import { isPartyLeaderNearGuildTavern } from "./guildTavern";
import { createTestGameState } from "./testState";

describe("guild tavern proximity", () => {
  it("detects the leader in range of the Guild Coordinator", () => {
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader");
    const coordinator = createNpc(
      "guild-coordinator",
      { x: 12, y: 10 },
      "Guild Coordinator",
      "guild_coordinator",
    );
    const state = createTestGameState({
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [coordinator.id]: coordinator,
      },
    });

    expect(isPartyLeaderNearGuildTavern(state)).toBe(true);
  });

  it("detects the leader in range of the Inn Keeper", () => {
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader");
    const tavernKeeper = createNpc(
      "tavern-keeper",
      { x: 10, y: 12 },
      "Inn Keeper",
      "tavern_keeper",
    );
    const state = createTestGameState({
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [tavernKeeper.id]: tavernKeeper,
      },
    });

    expect(isPartyLeaderNearGuildTavern(state)).toBe(true);
  });

  it("keeps the shell reference-only when the leader is outside range", () => {
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader");
    const coordinator = createNpc(
      "guild-coordinator",
      { x: 19, y: 10 },
      "Guild Coordinator",
      "guild_coordinator",
    );
    const state = createTestGameState({
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [coordinator.id]: coordinator,
      },
    });

    expect(isPartyLeaderNearGuildTavern(state)).toBe(false);
  });
});
