import { describe, expect, it } from "vitest";
import { HUB_DEPARTURE_FOOD_WARNING_DURATION_MS } from "./consumables";
import { createCompanion, createDebugMap } from "./index";
import { HUB_MAP_ID, MAP_ONE_ID } from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateTeleportSystem } from "./teleportSystem";
import type { ActiveTeleport } from "./types";

describe("teleport system", () => {
  it("uses supplied simulation time for hub departure food warning", () => {
    const nowMs = 12345;
    const state = createHubTeleportReadyState({
      hubDepartureFoodWarning: null,
    });

    const nextState = updateTeleportSystem(state, new Set(), nowMs);

    expect(nextState.currentMapId).toBe(MAP_ONE_ID);
    expect(nextState.hubDepartureFoodWarning).toMatchObject({
      createdAt: nowMs,
      expiresAt: nowMs + HUB_DEPARTURE_FOOD_WARNING_DURATION_MS,
    });
  });

  it("clears transient movement runtime after teleport completion", () => {
    const state = createHubTeleportReadyState({
      movementFailureMsByEntityId: {
        leader: 250,
      },
      movementFailuresByEntityId: {
        leader: {
          pathFailureReason: "unreachable",
        },
      },
      movementPathRetryAtMsByEntityId: {
        leader: 2000,
      },
      movementPathsByEntityId: {
        leader: {
          targetKey: "teleport:hub-to-map-1",
          waypoints: [{ x: 12, y: 12 }],
        },
      },
      attackSlotCacheByEntityId: {
        leader: {
          attackRange: 1,
          attackSlot: { x: 11, y: 12 },
          createdAtMs: 100,
          mapKey: HUB_MAP_ID,
          targetId: "enemy",
          targetPosition: { x: 12, y: 12 },
          usesPartyPassThrough: false,
        },
      },
    });

    const nextState = updateTeleportSystem(state, new Set(), 12345);

    expect(nextState.currentMapId).toBe(MAP_ONE_ID);
    expect(nextState.movementFailureMsByEntityId).toEqual({});
    expect(nextState.movementFailuresByEntityId).toEqual({});
    expect(nextState.movementPathRetryAtMsByEntityId).toEqual({});
    expect(nextState.movementPathsByEntityId).toEqual({});
    expect(nextState.attackSlotCacheByEntityId).toEqual({});
  });
});

function createHubTeleportReadyState(overrides: Partial<GameState> = {}) {
  const map = createDebugMap(HUB_MAP_ID);
  const teleport = map.teleports.find((candidate) => candidate.id === "hub-to-map-1");

  if (!teleport) {
    throw new Error("Missing hub-to-map-1 teleport in test map.");
  }

  const baseLeader = createCompanion(
    "leader",
    teleport.position,
    "leader",
    "fighter",
    0,
  );
  const leader = {
    ...baseLeader,
    consumables: {
      ...baseLeader.consumables,
      foodItemId: "hearty_trail_rations" as const,
    },
  };

  const state = createTestGameState({
    currentMapId: HUB_MAP_ID,
    map,
    entities: {
      [leader.id]: leader,
    },
    partyLeaderId: leader.id,
    activeTeleport: {
      id: teleport.id,
      position: teleport.position,
      range: teleport.range,
      sourceMapId: teleport.sourceMapId,
      targetMapId: teleport.targetMapId,
      triggeredBy: "player",
    } satisfies ActiveTeleport,
    ...overrides,
  });

  return addItemToInventoryState(
    state,
    "hearty_trail_rations",
    1,
    "debug",
  ).state;
}
