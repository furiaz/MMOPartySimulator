import { describe, expect, it } from "vitest";
import {
  createDebugMap,
  MAP_ONE_ID,
  MAP_TWO_ID,
  TELEPORTER_ID,
} from "./debugMap";
import {
  getTeleportWorkingStateById,
  isTeleportWorking,
  setTeleportWorking,
} from "./teleportState";
import { createTestGameState } from "./testState";

describe("teleport working state", () => {
  it("defaults teleports to working when startsWorking is not set", () => {
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
    });

    expect(isTeleportWorking(state, "map-1-to-hub")).toBe(true);
  });

  it("uses startsWorking false for broken-start teleports", () => {
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
    });

    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(false);
  });

  it("uses runtime state as the source of truth when set", () => {
    const state = setTeleportWorking(
      createTestGameState({
        currentMapId: MAP_ONE_ID,
        map: createDebugMap(MAP_ONE_ID),
      }),
      TELEPORTER_ID,
      true,
    );

    expect(isTeleportWorking(state, TELEPORTER_ID)).toBe(true);
  });

  it("returns UI-facing working state for the current map teleports", () => {
    const state = setTeleportWorking(
      createTestGameState({
        currentMapId: MAP_TWO_ID,
        map: createDebugMap(MAP_TWO_ID),
      }),
      "map-2-to-map-1",
      false,
    );

    expect(getTeleportWorkingStateById(state)).toMatchObject({
      "map-2-to-map-1": false,
      "map-2-to-map-3": false,
    });
  });
});
