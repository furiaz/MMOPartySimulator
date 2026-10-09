import { describe, expect, it } from "vitest";
import { createCompanion, createNpc } from "./entities";
import { isGuildTavernServiceAvailable } from "./guildTavern";
import { createTestGameState } from "./testState";

describe("guild tavern availability", () => {
  it("detects the Guild Coordinator service in Forward Bastion", () => {
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader");
    const coordinator = createNpc(
      "guild-coordinator",
      { x: 12, y: 10 },
      "Guild Coordinator",
      "guild_coordinator",
    );
    const state = createTestGameState({
      currentMapId: "hub-2",
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [coordinator.id]: coordinator,
      },
    });

    expect(isGuildTavernServiceAvailable(state)).toBe(true);
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
      currentMapId: "hub-2",
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [tavernKeeper.id]: tavernKeeper,
      },
    });

    expect(isGuildTavernServiceAvailable(state)).toBe(true);
  });

  it("stays available when the leader is far across Forward Bastion", () => {
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader");
    const coordinator = createNpc(
      "guild-coordinator",
      { x: 19, y: 10 },
      "Guild Coordinator",
      "guild_coordinator",
    );
    const state = createTestGameState({
      currentMapId: "hub-2",
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [coordinator.id]: coordinator,
      },
    });

    expect(isGuildTavernServiceAvailable(state)).toBe(true);
  });

  it("is unavailable outside town hubs or when its NPC is missing", () => {
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader");
    const coordinator = createNpc(
      "guild-coordinator",
      { x: 12, y: 10 },
      "Guild Coordinator",
      "guild_coordinator",
    );
    const outsideHub = createTestGameState({
      currentMapId: "slimeward-camp",
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [coordinator.id]: coordinator,
      },
    });
    const missingNpc = createTestGameState({
      currentMapId: "hub-2",
      partyLeaderId: leader.id,
      entities: { [leader.id]: leader },
    });

    expect(isGuildTavernServiceAvailable(outsideHub)).toBe(false);
    expect(isGuildTavernServiceAvailable(missingNpc)).toBe(false);
  });
});
