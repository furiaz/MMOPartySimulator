import { describe, expect, it } from "vitest";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import {
  getEntityById,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
} from "./state";
import { createTestGameState } from "./testState";
import type { Companion, GameMap } from "./types";

const blockedMap: GameMap = {
  debugName: "Blocked Path Test Map",
  displayName: "Blocked Path Test Map",
  columns: 6,
  rows: 3,
  walls: [
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ],
  teleports: [],
  healingFountains: [],
};

const detourMap: GameMap = {
  debugName: "Detour Path Test Map",
  displayName: "Detour Path Test Map",
  columns: 6,
  rows: 5,
  walls: [
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 3 },
    { x: 2, y: 4 },
  ],
  teleports: [],
  healingFountains: [],
};

const openMap: GameMap = {
  debugName: "Open Path Test Map",
  displayName: "Open Path Test Map",
  columns: 6,
  rows: 5,
  walls: [],
  teleports: [],
  healingFountains: [],
};

const companion = {
  id: "companion-1",
  kind: "companion",
  position: { x: 1, y: 1 },
  state: "follow",
  health: 10,
  maxHealth: 10,
  lastAttackAt: 0,
  classId: "beginner",
  characterLevel: 1,
  characterXp: 0,
  lastCharacterXpGained: 0,
  naturalStats: {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    intelligence: 1,
    wisdom: 1,
  },
  allocatedStats: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
  },
  unspentStatPoints: 0,
  role: "fighter",
  partyOrder: 0,
  followTargetId: null,
  defendPosition: null,
  currentTargetId: null,
  lastGatherAt: 0,
  gatherSpeed: 1,
  commandPriority: "autonomous",
  equipment: {},
  consumables: {},
  consumableBuffs: [],
  consumableBehavior: "auto",
} as unknown as Companion;

describe("movement path backoff", () => {
  it("does not request a full navigation path for a walkable direct step", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: openMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(getEntityById(nextState, companion.id)?.position.x).toBeGreaterThan(
      companion.position.x,
    );
  });

  it("uses a cached path before direct movement toward the final target", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: openMap,
      movementPathsByEntityId: {
        [companion.id]: {
          blockedCount: 0,
          lastRequestedAtMs: 100,
          profile: "follow",
          targetKey: "follow:__position_target__:follow:leader:solid-party",
          targetPosition: { x: 4, y: 1 },
          waypoints: [{ x: 1, y: 2 }],
        },
      },
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    const movedCompanion = getEntityById(nextState, companion.id);

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(movedCompanion?.position.y).toBeGreaterThan(companion.position.y);
  });

  it("reuses a static profile path for a stable target", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: detourMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const firstMoveState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "gather",
        pathTargetKey: "gather:wood",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );
    const afterFirstMoveMetrics = consumeGamePerformanceMetrics();
    const movedCompanion = getEntityById(firstMoveState, companion.id) as Companion;
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      firstMoveState,
      movedCompanion,
      { x: 4, y: 1 },
      {
        pathProfile: "gather",
        pathTargetKey: "gather:wood",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    expect(afterFirstMoveMetrics.navigationPathQueries).toBe(1);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("throttles combat path refreshes while the target stays in the same navigation cell", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: detourMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const firstMoveState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "chase",
        pathTargetKey: "chase:enemy",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );
    const movedCompanion = getEntityById(firstMoveState, companion.id) as Companion;
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      {
        ...firstMoveState,
        simulationTimeMs: 200,
      },
      movedCompanion,
      { x: 4.4, y: 1 },
      {
        pathProfile: "chase",
        pathTargetKey: "chase:enemy",
        pathTargetPosition: { x: 4.4, y: 1 },
      },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("does not generate full navigation paths while previewing movement", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    previewMoveTowardPosition(state, companion, { x: 4, y: 1 });

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("keeps a blocked cached path after one failed waypoint step", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      movementPathsByEntityId: {
        [companion.id]: {
          blockedCount: 0,
          lastRequestedAtMs: 100,
          profile: "follow",
          targetKey: "follow:__position_target__:follow:leader:solid-party",
          targetPosition: { x: 4, y: 1 },
          waypoints: [{ x: 2, y: 1 }],
        },
      },
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    expect(nextState.movementPathsByEntityId?.[companion.id]).toMatchObject({
      blockedCount: 1,
      waypoints: [{ x: 2, y: 1 }],
    });
  });

  it("does not regenerate full navigation paths while retry backoff is active", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      simulationTimeMs: 100,
      movementPathRetryAtMsByEntityId: {
        [companion.id]: 250,
      },
    });
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("regenerates navigation paths after retry backoff expires", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      simulationTimeMs: 300,
      movementPathRetryAtMsByEntityId: {
        [companion.id]: 250,
      },
    });
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBeGreaterThan(0);
  });
});
