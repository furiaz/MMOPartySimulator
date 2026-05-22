import { describe, expect, it } from "vitest";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { moveEntityTowardPositionIfUnoccupied } from "./state";
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
