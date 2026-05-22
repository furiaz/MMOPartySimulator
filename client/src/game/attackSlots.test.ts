import { describe, expect, it } from "vitest";
import {
  chooseAttackSlot,
  createAttackSlotPathDistanceCache,
  getAttackSlotPathDistanceCacheKey,
  rememberAttackSlot,
} from "./attackSlots";
import {
  consumeGamePerformanceMetrics,
} from "./performanceMetrics";
import { createTestGameState } from "./testState";
import type { CombatEntity, GameEntity, GameMap } from "./types";

const entity: GameEntity = {
  id: "companion-1",
  kind: "companion",
  position: { x: 3, y: 4 },
  state: "idle",
  health: 10,
  maxHealth: 10,
} as GameEntity;

const testMap: GameMap = {
  debugName: "Attack Slot Test Map",
  displayName: "Attack Slot Test Map",
  columns: 10,
  rows: 10,
  walls: [],
  teleports: [],
  healingFountains: [],
};

const attacker: CombatEntity = {
  ...entity,
  id: "attacker",
  position: { x: 3, y: 5 },
  currentTargetId: "target",
} as CombatEntity;

const target: CombatEntity = {
  ...entity,
  id: "target",
  position: { x: 5, y: 5 },
} as CombatEntity;

describe("getAttackSlotPathDistanceCacheKey", () => {
  it("uses entity id, slot position, and max distance", () => {
    const state = createTestGameState({ map: testMap });

    expect(
      getAttackSlotPathDistanceCacheKey(state, entity, { x: 6, y: 8 }, 12),
    ).toBe("Attack Slot Test Map:companion-1:3,4:6,8:12:solid-party");
  });

  it("keeps different target slots separate", () => {
    const state = createTestGameState({ map: testMap });

    expect(
      getAttackSlotPathDistanceCacheKey(state, entity, { x: 6, y: 8 }, 12),
    ).not.toBe(
      getAttackSlotPathDistanceCacheKey(state, entity, { x: 7, y: 8 }, 12),
    );
  });
});

describe("chooseAttackSlot", () => {
  it("checks the first cheaply valid ranked slot without double-counting path distance", () => {
    const state = createTestGameState({
      entities: {
        [attacker.id]: attacker,
        [target.id]: target,
      },
      map: testMap,
    });
    consumeGamePerformanceMetrics();

    expect(
      chooseAttackSlot(state, attacker, target.position, 1, {
        maxPathDistance: 6,
        targetId: target.id,
      }),
    ).toEqual({ x: 4, y: 5 });

    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(1);
  });

  it("skips unavailable slots before asking for path distance", () => {
    const state = createTestGameState({
      entities: {
        [attacker.id]: attacker,
        [target.id]: target,
      },
      map: {
        ...testMap,
        walls: [{ x: 4, y: 5 }],
      },
    });
    consumeGamePerformanceMetrics();

    expect(
      chooseAttackSlot(state, attacker, target.position, 1, {
        maxPathDistance: 6,
        targetId: target.id,
      }),
    ).toEqual({ x: 5, y: 4 });

    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(1);
  });

  it("shares same-frame path distance checks through the provided cache", () => {
    const pathDistanceCache = createAttackSlotPathDistanceCache();
    const state = createTestGameState({
      entities: {
        [attacker.id]: attacker,
        [target.id]: target,
      },
      map: testMap,
    });
    consumeGamePerformanceMetrics();

    const options = {
      maxPathDistance: 6,
      pathDistanceCache,
      targetId: target.id,
    };

    expect(chooseAttackSlot(state, attacker, target.position, 1, options)).toEqual({
      x: 4,
      y: 5,
    });
    expect(chooseAttackSlot(state, attacker, target.position, 1, options)).toEqual({
      x: 4,
      y: 5,
    });

    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(1);
  });

  it("reuses a recently remembered valid slot without a path distance check", () => {
    const state = rememberAttackSlot(
      createTestGameState({
        entities: {
          [attacker.id]: attacker,
          [target.id]: target,
        },
        map: testMap,
        simulationTimeMs: 1000,
      }),
      attacker,
      target.position,
      1,
      { x: 5, y: 4 },
      {
        nowMs: 1000,
        targetId: target.id,
      },
    );
    consumeGamePerformanceMetrics();

    expect(
      chooseAttackSlot(state, attacker, target.position, 1, {
        maxPathDistance: 6,
        nowMs: 1100,
        targetId: target.id,
      }),
    ).toEqual({ x: 5, y: 4 });

    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });
});
