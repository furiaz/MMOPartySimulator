import { describe, expect, it } from "vitest";
import {
  addEntity,
  createCompanion,
  createEnemy,
  createNpc,
  createResource,
} from ".";
import { resolveNavigationClickTarget } from "./navigationClick";
import { createTestGameState } from "./testState";
import type { GameMap, Position } from "./types";

function createMap(overrides: Partial<GameMap> = {}): GameMap {
  return {
    debugName: "Test Map",
    displayName: "Test Map",
    columns: 6,
    rows: 5,
    walls: [],
    teleports: [],
    healingFountains: [],
    ...overrides,
  };
}

function createState({
  leaderPosition = { x: 1, y: 1 },
  map = createMap(),
  extraEntities = [],
}: {
  leaderPosition?: Position;
  map?: GameMap | undefined;
  extraEntities?: ReturnType<
    typeof createEnemy | typeof createResource | typeof createNpc
  >[];
} = {}) {
  const leader = createCompanion("leader", leaderPosition, "leader");
  const state = createTestGameState({
    map,
    partyLeaderId: leader.id,
  });

  return [leader, ...extraEntities].reduce(addEntity, state);
}

describe("resolveNavigationClickTarget", () => {
  it("returns a reachable clicked floor tile", () => {
    const state = createState();

    expect(resolveNavigationClickTarget(state, { x: 4, y: 3 })).toEqual({
      x: 4,
      y: 3,
    });
  });

  it("falls back from a wall tile to the nearest reachable floor tile", () => {
    const state = createState({
      map: createMap({ walls: [{ x: 3, y: 2 }] }),
    });

    expect(resolveNavigationClickTarget(state, { x: 3, y: 2 })).toEqual({
      x: 3,
      y: 1,
    });
  });

  it("falls back from an unreachable area to the nearest reachable floor tile", () => {
    const state = createState({
      map: createMap({
        walls: [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 2, y: 3 },
          { x: 2, y: 4 },
        ],
      }),
    });

    expect(resolveNavigationClickTarget(state, { x: 4, y: 2 })).toEqual({
      x: 1,
      y: 2,
    });
  });

  it("does not return occupied resources, live entities, or NPC positions", () => {
    const blockedPositions = [
      { x: 3, y: 2 },
      { x: 3, y: 1 },
      { x: 2, y: 2 },
    ];
    const state = createState({
      extraEntities: [
        createResource("wood", blockedPositions[0]),
        createEnemy("enemy", blockedPositions[1]),
        createNpc("npc", blockedPositions[2], "NPC", "dog"),
      ],
    });

    expect(resolveNavigationClickTarget(state, { x: 3, y: 2 })).toEqual({
      x: 4,
      y: 2,
    });
  });

  it("returns null when there is no leader, map, or reachable destination", () => {
    const noLeaderState = createTestGameState({ map: createMap() });
    const leader = createCompanion("leader", { x: 1, y: 1 }, "leader");
    const noMapState = addEntity(
      createTestGameState({ partyLeaderId: leader.id }),
      leader,
    );
    const surroundedState = createState({
      map: createMap({
        walls: Array.from({ length: 5 }, (_, y) =>
          Array.from({ length: 6 }, (__, x) => ({ x, y })),
        ).flat(),
      }),
    });

    expect(resolveNavigationClickTarget(noLeaderState, { x: 1, y: 1 })).toBeNull();
    expect(resolveNavigationClickTarget(noMapState, { x: 1, y: 1 })).toBeNull();
    expect(resolveNavigationClickTarget(surroundedState, { x: 4, y: 3 })).toBeNull();
  });
});
