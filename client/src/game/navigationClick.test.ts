import { describe, expect, it } from "vitest";
import {
  addEntity,
  createCompanion,
  createEnemy,
  createNpc,
  createResource,
} from ".";
import {
  createDebugMap,
  createDebugMapForQuestState,
  MAP_ONE_ID,
} from "./debugMap";
import {
  buildNavigationClickAccessibility,
  isNavigationClickAccessible,
  resolveNavigationClickTarget,
  resolveNpcInteractionApproachTarget,
} from "./navigationClick";
import { isActiveResourcePosition } from "./movementPlanning";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
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

  it("does not snap distant unreachable clicks back to reachable floor", () => {
    const state = createState({
      map: createMap({
        columns: 8,
        walls: [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 2, y: 3 },
          { x: 2, y: 4 },
        ],
      }),
    });

    expect(resolveNavigationClickTarget(state, { x: 6, y: 2 })).toBeNull();
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

  it("keeps active resource collision at the movement blocker radius", () => {
    const resource = createResource("wood", { x: 3, y: 2 });
    const state = createState({ extraEntities: [resource] });

    expect(isActiveResourcePosition(state, { x: 3.69, y: 2 })).toBe(true);
    expect(isActiveResourcePosition(state, { x: 3.7, y: 2 })).toBe(false);
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

  it("rejects map one Lower Shore clicks while the Secure the Landing gate is closed", () => {
    const state = createState({
      leaderPosition: { x: 7, y: 29 },
      map: createDebugMap(MAP_ONE_ID),
    });
    const accessibility = buildNavigationClickAccessibility(state);

    consumeGamePerformanceMetrics();

    expect(isNavigationClickAccessible(accessibility, { x: 110, y: 29 })).toBe(
      false,
    );
    expect(
      resolveNavigationClickTarget(
        state,
        { x: 110, y: 29 },
        accessibility,
      ),
    ).toBeNull();
    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });

  it("allows map one Lower Shore clicks after the Secure the Landing gate opens", () => {
    const state = createState({
      leaderPosition: { x: 7, y: 29 },
      map: createDebugMapForQuestState(MAP_ONE_ID, {
        clear_the_shore: { status: "completed" },
      }),
    });
    const accessibility = buildNavigationClickAccessibility(state);

    expect(isNavigationClickAccessible(accessibility, { x: 110, y: 29 })).toBe(
      true,
    );
    expect(
      resolveNavigationClickTarget(
        state,
        { x: 110, y: 29 },
        accessibility,
      ),
    ).toEqual({ x: 110, y: 29 });
  });
});

describe("resolveNpcInteractionApproachTarget", () => {
  it("returns a reachable approach position instead of the occupied NPC position", () => {
    const npc = createNpc("merchant", { x: 3, y: 2 }, "Merchant", "merchant");
    const state = createState({ extraEntities: [npc] });

    expect(resolveNpcInteractionApproachTarget(state, npc.position, 1.5)).toEqual({
      x: 3,
      y: 1,
    });
  });

  it("uses the interaction range to find farther reachable approach positions", () => {
    const npc = createNpc("quest-giver", { x: 3, y: 3 }, "Quest Giver", "quest_giver");
    const state = createState({
      leaderPosition: { x: 0, y: 3 },
      map: createMap({
        columns: 7,
        rows: 7,
        walls: [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
          { x: 4, y: 2 },
          { x: 2, y: 3 },
          { x: 4, y: 3 },
          { x: 2, y: 4 },
          { x: 3, y: 4 },
          { x: 4, y: 4 },
        ],
      }),
      extraEntities: [npc],
    });

    expect(resolveNpcInteractionApproachTarget(state, npc.position, 1.5)).toBeNull();
    expect(resolveNpcInteractionApproachTarget(state, npc.position, 2)).toEqual({
      x: 3,
      y: 1,
    });
  });

  it("returns null when every in-range approach position is blocked or unreachable", () => {
    const npc = createNpc("merchant", { x: 3, y: 2 }, "Merchant", "merchant");
    const state = createState({
      map: createMap({
        walls: [
          { x: 2, y: 1 },
          { x: 3, y: 1 },
          { x: 4, y: 1 },
          { x: 2, y: 2 },
          { x: 4, y: 2 },
          { x: 2, y: 3 },
          { x: 3, y: 3 },
          { x: 4, y: 3 },
        ],
      }),
      extraEntities: [npc],
    });

    expect(resolveNpcInteractionApproachTarget(state, npc.position, 1.5)).toBeNull();
  });
});
