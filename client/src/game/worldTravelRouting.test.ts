import { describe, expect, it } from "vitest";
import {
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  HUB_TWO_TO_MAP_FOUR_TELEPORTER_ID,
  HUB_TWO_TO_MAP_THREE_TELEPORTER_ID,
  HUB_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
  MAP_FOUR_TO_HUB_TWO_TELEPORTER_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_THREE_TO_HUB_TWO_TELEPORTER_ID,
  MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
  MAP_TWO_ID,
  MAP_TWO_TO_MAP_THREE_TELEPORTER_ID,
  SLIMEWARD_CAMP_ID,
  SLIMEWARD_CAMP_TO_MAP_THREE_TELEPORTER_ID,
  TELEPORTER_ID,
} from "./debugMap";
import { createTestGameState } from "./testState";
import { getNextWorldTravelTeleport } from "./worldTravelRouting";
import type { GameState } from "./state";

describe("world travel routing", () => {
  it("routes hub to map 4 through map 1 when main route steps are unlocked", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(createUnlockedMainRouteTeleportStates()),
      HUB_MAP_ID,
      MAP_FOUR_ID,
    );

    expect(teleport?.id).toBe("hub-to-map-1");
  });

  it("routes map 3 to map 4 through Forward Bastion", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(createUnlockedMainRouteTeleportStates()),
      MAP_THREE_ID,
      MAP_FOUR_ID,
    );

    expect(teleport?.id).toBe(MAP_THREE_TO_HUB_TWO_TELEPORTER_ID);
  });

  it("routes Forward Bastion south to map 4", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(createUnlockedMainRouteTeleportStates()),
      HUB_TWO_MAP_ID,
      MAP_FOUR_ID,
    );

    expect(teleport?.id).toBe(HUB_TWO_TO_MAP_FOUR_TELEPORTER_ID);
  });

  it("routes map 4 back toward the first hub through Forward Bastion", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(createUnlockedMainRouteTeleportStates()),
      MAP_FOUR_ID,
      HUB_MAP_ID,
    );

    expect(teleport?.id).toBe(MAP_FOUR_TO_HUB_TWO_TELEPORTER_ID);
  });

  it("routes Forward Bastion west toward map 3", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(createUnlockedMainRouteTeleportStates()),
      HUB_TWO_MAP_ID,
      MAP_THREE_ID,
    );

    expect(teleport?.id).toBe(HUB_TWO_TO_MAP_THREE_TELEPORTER_ID);
  });

  it("does not route map 1 to map 2 through a non-working forward teleport", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(),
      MAP_ONE_ID,
      MAP_TWO_ID,
    );

    expect(teleport).toBeNull();
  });

  it("ignores Stay in Subzone preferences for world travel route selection", () => {
    const teleport = getNextWorldTravelTeleport(
      createTestGameState({
        poiPreferences: {
          stayInMap: true,
          searchScope: "subzone_only",
        },
        teleportStatesById: createUnlockedMainRouteTeleportStates(),
      }),
      HUB_MAP_ID,
      MAP_FOUR_ID,
    );

    expect(teleport?.id).toBe("hub-to-map-1");
  });

  it("routes hub to Slimeward Camp directly", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(),
      HUB_MAP_ID,
      SLIMEWARD_CAMP_ID,
    );

    expect(teleport?.id).toBe(HUB_TO_SLIMEWARD_CAMP_TELEPORTER_ID);
  });

  it("routes map 3 to Slimeward Camp only when that route is unlocked", () => {
    const lockedTeleport = getNextWorldTravelTeleport(
      createRoutingState(),
      MAP_THREE_ID,
      SLIMEWARD_CAMP_ID,
    );
    const unlockedTeleport = getNextWorldTravelTeleport(
      createRoutingState({
        [MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID]: { isWorking: true },
      }),
      MAP_THREE_ID,
      SLIMEWARD_CAMP_ID,
    );

    expect(lockedTeleport).toBeNull();
    expect(unlockedTeleport?.id).toBe(
      MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
    );
  });

  it("routes Slimeward Camp to map 4 through map 3", () => {
    const teleport = getNextWorldTravelTeleport(
      createRoutingState(),
      SLIMEWARD_CAMP_ID,
      MAP_FOUR_ID,
    );

    expect(teleport?.id).toBe(SLIMEWARD_CAMP_TO_MAP_THREE_TELEPORTER_ID);
  });

  it("returns null for same-map and missing-current-map inputs", () => {
    expect(
      getNextWorldTravelTeleport(createRoutingState(), HUB_MAP_ID, HUB_MAP_ID),
    ).toBeNull();
    expect(
      getNextWorldTravelTeleport(createRoutingState(), undefined, MAP_FOUR_ID),
    ).toBeNull();
  });
});

function createRoutingState(
  teleportStatesById: GameState["teleportStatesById"] = {},
): GameState {
  return createTestGameState({ teleportStatesById });
}

function createUnlockedMainRouteTeleportStates(): GameState["teleportStatesById"] {
  return {
    [TELEPORTER_ID]: { isWorking: true },
    [MAP_TWO_TO_MAP_THREE_TELEPORTER_ID]: { isWorking: true },
  };
}
