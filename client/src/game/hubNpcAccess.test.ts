import { describe, expect, it } from "vitest";
import { createNpc } from "./entities";
import {
  isFunctionalHubNpcAvailable,
  isFunctionalHubNpcRole,
  isHubNpcRoleAvailable,
  isTownHubMapId,
} from "./hubNpcAccess";
import { createTestGameState } from "./testState";
import type { NpcEntity } from "./types";

describe("hub NPC access", () => {
  it("recognizes only Harbor Union Bastion and Forward Bastion as town hubs", () => {
    expect(isTownHubMapId("hub")).toBe(true);
    expect(isTownHubMapId("hub-2")).toBe(true);
    expect(isTownHubMapId("map-1")).toBe(false);
    expect(isTownHubMapId("slimeward-camp")).toBe(false);
    expect(isTownHubMapId(undefined)).toBe(false);
  });

  it("recognizes the agreed functional roles and excludes local interactions", () => {
    const functionalRoles: NpcEntity["npcRole"][] = [
      "quest_giver",
      "class_mentor",
      "merchant",
      "smith",
      "bank_chest",
      "guild_coordinator",
      "tavern_keeper",
      "farmer",
      "livestock_keeper",
    ];

    expect(functionalRoles.every(isFunctionalHubNpcRole)).toBe(true);
    expect(isFunctionalHubNpcRole("dog")).toBe(false);
    expect(isFunctionalHubNpcRole("quest_guide")).toBe(false);
    expect(isFunctionalHubNpcRole("dungeon_chest_closed")).toBe(false);
  });

  it("requires the functional NPC to exist on the current town hub", () => {
    const farmer = createNpc("farmer", { x: 100, y: 50 }, "Farmer", "farmer");
    const state = createTestGameState({
      currentMapId: "hub-2",
      entities: { [farmer.id]: farmer },
    });

    expect(isFunctionalHubNpcAvailable(state, farmer)).toBe(true);
    expect(isHubNpcRoleAvailable(state, ["farmer"])).toBe(true);
    expect(isHubNpcRoleAvailable(state, ["guild_coordinator"])).toBe(false);
    expect(isFunctionalHubNpcAvailable({ ...state, entities: {} }, farmer)).toBe(
      false,
    );
    expect(
      isFunctionalHubNpcAvailable(
        { ...state, currentMapId: "slimeward-camp" },
        farmer,
      ),
    ).toBe(false);
  });
});
