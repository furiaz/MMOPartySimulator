import { describe, expect, it } from "vitest";
import {
  createCompanion,
  createEnemy,
} from "./entities";
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
import type { CombatEntity, GameEntity, GameMap, Position } from "./types";

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

  it("prefers a different combat slot when the nearest slot is too close to a living companion", () => {
    const combatAttacker = createCombatCompanion("attacker", { x: 3, y: 5 });
    const combatTarget = createEnemy("target", { x: 5, y: 5 });
    const blocker = createCombatCompanion("blocker", { x: 4.2, y: 5 });
    const state = createTestGameState({
      entities: {
        [combatAttacker.id]: combatAttacker,
        [combatTarget.id]: combatTarget,
        [blocker.id]: blocker,
      },
      map: testMap,
    });

    expect(
      chooseAttackSlot(state, combatAttacker, combatTarget.position, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
        targetId: combatTarget.id,
      }),
    ).toEqual({ x: 5, y: 4 });
  });

  it("falls back to an unspaced combat slot when every spaced slot is blocked", () => {
    const combatAttacker = createCombatCompanion("attacker", { x: 3, y: 5 });
    const combatTarget = createEnemy("target", { x: 5, y: 5 });
    const state = createTestGameState({
      entities: {
        [combatAttacker.id]: combatAttacker,
        [combatTarget.id]: combatTarget,
        ...createSlotBlockers(combatTarget.position),
      },
      map: testMap,
    });

    expect(
      chooseAttackSlot(state, combatAttacker, combatTarget.position, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
        targetId: combatTarget.id,
      }),
    ).toEqual({ x: 4, y: 5 });
  });

  it("returns null when required spacing has no valid combat slot", () => {
    const combatAttacker = createCombatCompanion("attacker", { x: 3, y: 5 });
    const combatTarget = createEnemy("target", { x: 5, y: 5 });
    const state = createTestGameState({
      entities: {
        [combatAttacker.id]: combatAttacker,
        [combatTarget.id]: combatTarget,
        ...createSlotBlockers(combatTarget.position),
      },
      map: testMap,
    });

    expect(
      chooseAttackSlot(state, combatAttacker, combatTarget.position, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "required",
        targetId: combatTarget.id,
      }),
    ).toBeNull();
  });

  it("treats reserved positions from living companions as spacing blockers", () => {
    const combatAttacker = createCombatCompanion("attacker", { x: 3, y: 5 });
    const combatTarget = createEnemy("target", { x: 5, y: 5 });
    const blocker = createCombatCompanion("blocker", { x: 1, y: 1 });
    const state = createTestGameState({
      entities: {
        [combatAttacker.id]: combatAttacker,
        [combatTarget.id]: combatTarget,
        [blocker.id]: blocker,
      },
      map: testMap,
      reservedPositionsByEntityId: {
        [blocker.id]: { x: 4.2, y: 5 },
      },
    });

    expect(
      chooseAttackSlot(state, combatAttacker, combatTarget.position, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
        targetId: combatTarget.id,
      }),
    ).toEqual({ x: 5, y: 4 });
  });

  it("ignores dead companions when checking combat spacing", () => {
    const combatAttacker = createCombatCompanion("attacker", { x: 3, y: 5 });
    const combatTarget = createEnemy("target", { x: 5, y: 5 });
    const blocker = {
      ...createCombatCompanion("blocker", { x: 4.2, y: 5 }),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      entities: {
        [combatAttacker.id]: combatAttacker,
        [combatTarget.id]: combatTarget,
        [blocker.id]: blocker,
      },
      map: testMap,
    });

    expect(
      chooseAttackSlot(state, combatAttacker, combatTarget.position, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
        targetId: combatTarget.id,
      }),
    ).toEqual({ x: 4, y: 5 });
  });
});

function createCombatCompanion(id: string, position: Position): CombatEntity {
  return {
    ...createCompanion(id, position, id, "fighter"),
    state: "attack",
    currentTargetId: "target",
  };
}

function createSlotBlockers(
  targetPosition: Position,
): Record<string, CombatEntity> {
  const blockerPositions = [
    { x: targetPosition.x, y: targetPosition.y - 1 },
    { x: targetPosition.x, y: targetPosition.y + 1 },
    { x: targetPosition.x + 1, y: targetPosition.y },
    { x: targetPosition.x - 1, y: targetPosition.y },
    { x: targetPosition.x + 1, y: targetPosition.y - 1 },
    { x: targetPosition.x - 1, y: targetPosition.y - 1 },
    { x: targetPosition.x + 1, y: targetPosition.y + 1 },
    { x: targetPosition.x - 1, y: targetPosition.y + 1 },
  ];

  return Object.fromEntries(
    blockerPositions.map((position, index) => {
      const blocker = createCombatCompanion(`blocker-${index}`, {
        x: position.x + 0.2,
        y: position.y,
      });

      return [blocker.id, blocker];
    }),
  );
}
