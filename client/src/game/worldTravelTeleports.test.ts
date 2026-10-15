import { describe, expect, it } from "vitest";
import {
  HUB_MAP_ID,
  SLIMEWARD_CAMP_ID,
  slimewardCampDungeonEntranceArrivalPositions,
} from "./debugMap";
import { createInitialGameState } from "./createInitialGameState";
import { createCompanion } from "./entities";
import {
  TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
  TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
  awardKeyItem,
} from "./keyItems";
import { teleportWorldTravelDestination } from "./teleportSystem";
import { getWorldTravelTeleportStatus } from "./worldTravelTeleports";

describe("world travel teleport echoes", () => {
  it("shows locked teleport metadata with acquisition hints", () => {
    const state = createInitialGameState();
    const status = getWorldTravelTeleportStatus(state, SLIMEWARD_CAMP_ID);

    expect(status).toEqual(
      expect.objectContaining({
        targetMapId: SLIMEWARD_CAMP_ID,
        requiredKeyItemId: TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
        acquisitionHint: "Slimeward Drop",
        isUnlocked: false,
        canTeleport: false,
      }),
    );
  });

  it("disables teleporting to the current map even when unlocked", () => {
    const state = awardKeyItem(
      createInitialGameState(),
      TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID,
    ).state;
    const status = getWorldTravelTeleportStatus(state, HUB_MAP_ID);
    const teleport = teleportWorldTravelDestination(state, HUB_MAP_ID);

    expect(status).toEqual(
      expect.objectContaining({
        isCurrentMap: true,
        isUnlocked: true,
        canTeleport: false,
      }),
    );
    expect(teleport.result).toEqual({
      status: "failed",
      targetMapId: HUB_MAP_ID,
      reason: "current_map",
    });
  });

  it("teleports to Slimeward Camp for free when the echo is unlocked", () => {
    const state = awardKeyItem(
      createInitialGameState(),
      TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
    ).state;

    const teleport = teleportWorldTravelDestination(
      {
        ...state,
        worldTravelTargetMapId: HUB_MAP_ID,
        autoModeEnabled: true,
      },
      SLIMEWARD_CAMP_ID,
    );

    expect(teleport.result).toEqual({
      status: "success",
      targetMapId: SLIMEWARD_CAMP_ID,
      displayName: "Slimeward Camp",
    });
    expect(teleport.state.currentMapId).toBe(SLIMEWARD_CAMP_ID);
    expect(teleport.state.activeTeleport).toBeNull();
    expect(teleport.state.autoModeEnabled).toBe(false);
    expect(teleport.state.worldTravelTargetMapId).toBeNull();
    expect(teleport.state.entities["test-companion-1"]?.position).toEqual(
      slimewardCampDungeonEntranceArrivalPositions[0],
    );
  });

  it("preserves dynamically recruited companions during direct World Travel", () => {
    const dynamicCompanion = createCompanion(
      "guild-recruit-4",
      { x: 12, y: 12 },
      "test-companion-1",
      "fighter",
      2,
    );
    const baseState = createInitialGameState();
    const state = awardKeyItem(
      {
        ...baseState,
        entities: {
          ...baseState.entities,
          [dynamicCompanion.id]: dynamicCompanion,
        },
      },
      TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
    ).state;

    const teleport = teleportWorldTravelDestination(state, SLIMEWARD_CAMP_ID);

    expect(teleport.result.status).toBe("success");
    expect(teleport.state.entities[dynamicCompanion.id]).toMatchObject({
      id: dynamicCompanion.id,
      characterLevel: dynamicCompanion.characterLevel,
      classId: dynamicCompanion.classId,
    });
    expect(teleport.state.entities[dynamicCompanion.id]?.position).toEqual(
      slimewardCampDungeonEntranceArrivalPositions[2],
    );
  });

  it("blocks direct World Travel teleport while another transition is active", () => {
    const state = awardKeyItem(
      createInitialGameState(),
      TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
    ).state;

    const teleport = teleportWorldTravelDestination(
      {
        ...state,
        activeTeleport: {
          id: "active",
          position: { x: 1, y: 1 },
          range: 1,
          sourceMapId: HUB_MAP_ID,
          targetMapId: SLIMEWARD_CAMP_ID,
          triggeredBy: "player",
        },
      },
      SLIMEWARD_CAMP_ID,
    );

    expect(teleport.result).toEqual({
      status: "failed",
      targetMapId: SLIMEWARD_CAMP_ID,
      reason: "active_transition",
    });
    expect(teleport.state.currentMapId).toBe(HUB_MAP_ID);
  });
});
