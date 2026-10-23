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
import { isCombatPositionSpacedFromParty } from "./partySpacing";
import { getEffectiveAttackRange, isWithinAttackReach } from "./spatialGeometry";
import { isCombatPositionAvailable } from "./movementPlanning";
import { isForcedMovementPositionAvailable } from "./forcedMovement";
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
  it.each([false, true])("protects a friendly forced landing when choosing a slot (cached=%s)", cached => {
    const actor = createCombatCompanion("actor", { x: 2, y: 5 });
    const enemy = createEnemy("target", { x: 5, y: 5 }, "passive", { combatBodyRadius: 0.7 });
    const friend = createCompanion("friend", { x: 9, y: 5 }, actor.id);
    let state = createTestGameState({ entities: { actor, target: enemy, friend }, map: testMap });
    const oldSlot = { x: 3.3, y: 5 };
    if (cached) state = rememberAttackSlot(state, actor, enemy, 1, oldSlot, { allowPartyPassThrough: true });
    const landing = { x: 3.5, y: 5 };
    state.forcedMovementsByEntityId = { friend: { targetId: friend.id, sourceId: "source", origin: friend.position,
      direction: { x: -1, y: 0 }, distance: 5.5, startedAt: 0, endsAt: 1000, lastSafePosition: friend.position } };
    expect(isForcedMovementPositionAvailable(state, friend, landing, true)).toBe(true);
    const slot = chooseAttackSlot(state, actor, enemy, 1, { allowPartyPassThrough: true, partySpacingMode: "prefer", maxPathDistance: 6 })!;
    expect(slot).not.toBeNull();
    expect(slot).not.toEqual(oldSlot);
    state.entities.actor = { ...actor, position: slot };
    expect(isForcedMovementPositionAvailable(state, friend, landing, true)).toBe(true);
  });

  it("normalizes diagonal slots to the same Euclidean attack edge", () => {
    const actor = createCombatCompanion("actor", { x: 6, y: 6 });
    const enemy = createEnemy("target", { x: 9, y: 9 }, undefined, { combatBodyRadius: 0.7 });
    const state = createTestGameState({ entities: { actor, target: enemy }, map: testMap });
    const slot = chooseAttackSlot(state, actor, enemy, 1)!;
    expect(slot).not.toBeNull();
    expect(Math.hypot(slot.x - 9, slot.y - 9)).toBeCloseTo(1.7);
    expect(slot.x).toBeCloseTo(slot.y);
    expect(isCombatPositionAvailable(state, actor, slot)).toBe(true);
  });

  it("invalidates a remembered slot when enemy growth consumes its clearance", () => {
    const actor = createCombatCompanion("actor", { x: 2, y: 5 });
    const enemy = createEnemy("target", { x: 5, y: 5 }, undefined, { combatBodyRadius: 0.7 });
    const cached = { x: 3.3, y: 5 };
    const state = rememberAttackSlot(createTestGameState({ entities: { actor, target: enemy }, map: testMap }), actor, enemy, 1, cached);
    const grown = { ...enemy, combatSizeMultiplier: 2 };
    state.entities.target = grown;
    const slot = chooseAttackSlot(state, actor, grown, 1, { nowMs: 100 })!;
    expect(slot).not.toBeNull();
    expect(slot).not.toEqual(cached);
    expect(Math.hypot(slot.x - 5, slot.y - 5)).toBeCloseTo(2.4);
    expect(isCombatPositionAvailable(state, actor, slot)).toBe(true);
  });

  it("retains an existing legal engagement position without a path search", () => {
    const actor = createCombatCompanion("actor", { x: 3.4, y: 5.2 });
    const enemy = createEnemy("target", { x: 5, y: 5 }, undefined, { combatBodyRadius: 0.7 });
    const state = createTestGameState({ entities: { actor, target: enemy }, map: testMap });
    consumeGamePerformanceMetrics();
    expect(chooseAttackSlot(state, actor, enemy, 1, { maxPathDistance: 6 })).toEqual(actor.position);
    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });

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
      chooseAttackSlot(state, attacker, target, 1, {
        maxPathDistance: 6,
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

    const slot = chooseAttackSlot(state, attacker, target, 1, {
        maxPathDistance: 6,
      });
    expect(slot).not.toBeNull();
    expect(slot).not.toEqual({ x: 4, y: 5 });
    expect(isCombatPositionAvailable(state, attacker, slot!)).toBe(true);
    expect(isWithinAttackReach(attacker, target, 1, slot!)).toBe(true);

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
    };

    expect(chooseAttackSlot(state, attacker, target, 1, options)).toEqual({
      x: 4,
      y: 5,
    });
    expect(chooseAttackSlot(state, attacker, target, 1, options)).toEqual({
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
      target,
      1,
      { x: 4, y: 5 },
      {
        nowMs: 1000,
      },
    );
    consumeGamePerformanceMetrics();

    expect(
      chooseAttackSlot(state, attacker, target, 1, {
        maxPathDistance: 6,
        nowMs: 1100,
      }),
    ).toEqual({ x: 4, y: 5 });

    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });

  it("reuses a recently remembered valid slot after tiny target movement", () => {
    const movedTarget = {
      ...target,
      position: { x: 5.2, y: 5 },
    };
    const state = rememberAttackSlot(
      createTestGameState({
        entities: {
          [attacker.id]: attacker,
          [movedTarget.id]: movedTarget,
        },
        map: testMap,
        simulationTimeMs: 1000,
      }),
      attacker,
      target,
      1,
      { x: 4.3, y: 5 },
      {
        nowMs: 1000,
      },
    );
    consumeGamePerformanceMetrics();

    expect(
      chooseAttackSlot(state, attacker, movedTarget, 1, {
        maxPathDistance: 6,
        nowMs: 1100,
      }),
    ).toEqual({ x: 4.3, y: 5 });

    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });

  it("does not reuse a remembered slot after meaningful target movement", () => {
    const movedTarget = {
      ...target,
      position: { x: 5.5, y: 5 },
    };
    const state = rememberAttackSlot(
      createTestGameState({
        entities: {
          [attacker.id]: attacker,
          [movedTarget.id]: movedTarget,
        },
        map: testMap,
        simulationTimeMs: 1000,
      }),
      attacker,
      target,
      1,
      { x: 4.3, y: 5 },
      {
        nowMs: 1000,
      },
    );

    expect(
      chooseAttackSlot(state, attacker, movedTarget, 1, {
        maxPathDistance: 6,
        nowMs: 1100,
      }),
    ).not.toEqual({ x: 4.3, y: 5 });
  });

  it("does not reuse a remembered slot when the cached slot becomes blocked", () => {
    const movedTarget = {
      ...target,
      position: { x: 5.2, y: 5 },
    };
    const state = rememberAttackSlot(
      createTestGameState({
        entities: {
          [attacker.id]: attacker,
          [movedTarget.id]: movedTarget,
        },
        map: {
          ...testMap,
          walls: [{ x: 4, y: 5 }],
        },
        simulationTimeMs: 1000,
      }),
      attacker,
      target,
      1,
      { x: 4.3, y: 5 },
      {
        nowMs: 1000,
      },
    );

    expect(
      chooseAttackSlot(state, attacker, movedTarget, 1, {
        maxPathDistance: 6,
        nowMs: 1100,
      }),
    ).not.toEqual({ x: 4.3, y: 5 });
  });

  it("prefers a different combat slot when the nearest slot is too close to a living companion", () => {
    const combatAttacker = createCombatCompanion("attacker", { x: 3, y: 5 });
    const combatTarget = createEnemy("target", { x: 5, y: 5 });
    const blocker = createCombatCompanion("blocker", { x: 3.5, y: 5 });
    const state = createTestGameState({
      entities: {
        [combatAttacker.id]: combatAttacker,
        [combatTarget.id]: combatTarget,
        [blocker.id]: blocker,
      },
      map: testMap,
    });

    const slot = chooseAttackSlot(state, combatAttacker, combatTarget, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
      });
    expect(slot).not.toBeNull();
    expect(slot).not.toEqual({ x: 3.3, y: 5 });
    expect(isCombatPositionSpacedFromParty(state, combatAttacker, slot!)).toBe(true);
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
      chooseAttackSlot(state, combatAttacker, combatTarget, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
      }),
    ).toEqual({ x: 3.3, y: 5 });
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
      chooseAttackSlot(state, combatAttacker, combatTarget, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "required",
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
        [blocker.id]: { x: 3.5, y: 5 },
      },
    });

    const slot = chooseAttackSlot(state, combatAttacker, combatTarget, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
      });
    expect(slot).not.toBeNull();
    expect(slot).not.toEqual({ x: 3.3, y: 5 });
    expect(isCombatPositionSpacedFromParty(state, combatAttacker, slot!)).toBe(true);
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
      chooseAttackSlot(state, combatAttacker, combatTarget, 1, {
        allowPartyPassThrough: true,
        maxPathDistance: 6,
        partySpacingMode: "prefer",
      }),
    ).toEqual({ x: 3.3, y: 5 });
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
      const dx = position.x - targetPosition.x, dy = position.y - targetPosition.y;
      const radius = getEffectiveAttackRange(attacker, createEnemy("target", targetPosition), 1);
      const blocker = createCombatCompanion(`blocker-${index}`, {
        x: targetPosition.x + dx / Math.hypot(dx, dy) * radius + 0.2,
        y: targetPosition.y + dy / Math.hypot(dx, dy) * radius,
      });

      return [blocker.id, blocker];
    }),
  );
}
