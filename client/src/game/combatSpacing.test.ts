import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateAttackSystem } from "./attackSystem";
import { BARRACK_DEFINITIONS, createBarrackEntity } from "./barrackDefinitions";
import { updateDefendSystem } from "./defendSystem";
import { createCompanion, createEnemy, createResource } from "./entities";
import { updateOverlapRecoverySystem } from "./overlapRecovery";
import { isCombatPositionAvailable } from "./movementPlanning";
import { clearFrameMovementPlanning } from "./movementState";
import { areEntitiesOverlapping, isWithinAttackReach } from "./spatialGeometry";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, Enemy, GameMap, Position } from "./types";

const openMap: GameMap = {
  columns: 30, rows: 25, walls: [], teleports: [], healingFountains: [], displayName: "Combat spacing", debugName: "combat-spacing",
};
beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.99));
afterEach(() => vi.restoreAllMocks());

function advance(state: GameState, frame: number, defender: boolean): GameState {
  const now = frame * 100;
  let next = clearFrameMovementPlanning({ ...state, simulationTimeMs: now, simulationDeltaMs: 100 });
  const moved = new Set<string>();
  // Match the real loop: exceptional recovery precedes ordinary approach/action.
  next = updateOverlapRecoverySystem(next, moved);
  next = defender ? updateDefendSystem(next, moved, { nowMs: now, deltaMs: 100, deltaSeconds: 0.1, frameNumber: frame })
    : updateAttackSystem(next, moved, now);
  return next;
}

describe.each([false, true])("settled combat spacing (Defender=%s)", defender => {
  it("leaves an in-range resource overlap before attacking and keeps its target", () => {
    const actor: Companion = { ...createCompanion("actor", { x: 8.3, y: 10 }, "actor", defender ? "defender" : "fighter"),
      state: defender ? "defend" : "attack", currentTargetId: "target", lastAttackAt: -2000 };
    const target = createEnemy("target", { x: 10, y: 10 }, "passive", {
      combatBodyRadius: 0.7, maxHealth: 10000, defense: 0, evasion: 0, isTargetDummy: true,
    });
    const resource = createResource("resource", { x: 8.3, y: 11.5 });
    let state = createTestGameState({ map: openMap, entities: { actor, target, resource }, partyLeaderId: actor.id,
      leaderIntent: { type: "attack", targetId: target.id, targetPosition: target.position } });
    expect(isWithinAttackReach(actor, target, 1)).toBe(true);
    expect(isCombatPositionAvailable(state, actor, actor.position)).toBe(false);
    state = advance(state, 1, defender);
    expect((state.entities.target as Enemy).health).toBe(target.health);
    for (let frame = 2; frame <= 60; frame++) state = advance(state, frame, defender);
    expect(isCombatPositionAvailable(state, state.entities.actor, state.entities.actor.position)).toBe(true);
    expect((state.entities.target as Enemy).health).toBeLessThan(target.health);
    const settled = state.entities.actor.position;
    for (let frame = 61; frame <= 90; frame++) {
      state = advance(state, frame, defender);
      expect(state.entities.actor.position).toEqual(settled);
      expect((state.entities.actor as Companion).currentTargetId).toBe(target.id);
    }
  });

  it.each([
    { name: "small enemy", radius: 0.7, scale: 1, diagonal: false, bounded: false },
    { name: "large Orc", radius: 1.25, scale: 1, diagonal: false, bounded: false },
    { name: "scaled Orc, diagonal approach", radius: 1.25, scale: 1.5, diagonal: true, bounded: false },
    { name: "Orc at reserved movement-bound edge", radius: 1.25, scale: 1, diagonal: false, bounded: true },
  ])("approaches and stays settled against $name", scenario => {
    const targetPosition = { x: scenario.bounded ? 7.05 : 10, y: 10 };
    const offset = scenario.diagonal ? { x: -5 / Math.SQRT2, y: -5 / Math.SQRT2 } : { x: -5, y: 0 };
    const actor: Companion = { ...createCompanion("actor", {
      x: targetPosition.x + offset.x, y: targetPosition.y + offset.y,
    }, "actor", defender ? "defender" : "fighter"), state: defender ? "defend" : "attack", currentTargetId: "target" };
    const target: Enemy = { ...createEnemy("target", targetPosition, "passive", {
      enemyTypeId: "orc", combatBodyRadius: scenario.radius, maxHealth: 10_000, defense: 0, evasion: 0, isTargetDummy: true,
    }), combatSizeMultiplier: scenario.scale,
      ...(scenario.bounded ? { minimumMovementBodyRadius: 2, movementBounds: { minX: 5, maxX: 30, minY: 5, maxY: 30 } } : {}) };
    let state = createTestGameState({ map: openMap, entities: { actor, target }, partyLeaderId: actor.id,
      leaderIntent: { type: "attack", targetId: target.id, targetPosition } });
    for (let frame = 1; frame <= 60; frame++) state = advance(state, frame, defender);
    const settled = state.entities.actor.position;
    expect(settled).not.toEqual(actor.position);
    expect(isWithinAttackReach(state.entities.actor, state.entities.target, 1)).toBe(true);
    expect(isCombatPositionAvailable(state, state.entities.actor, settled)).toBe(true);
    expect(areEntitiesOverlapping(state.entities.actor, state.entities.target)).toBe(false);
    for (let frame = 61; frame <= 90; frame++) {
      state = advance(state, frame, defender);
      expect(state.entities.actor.position).toEqual(settled);
      expect((state.entities.actor as Companion).currentTargetId).toBe(target.id);
      expect(state.entities.target.position).toEqual(targetPosition);
    }
    expect((state.entities.target as Enemy).health).toBeLessThan(target.health);
  });
});

describe("structure approach across updates", () => {
  it("holds an invalid in-range focus when every legal slot is reserved instead of chasing the center", () => {
    const actor: Companion = { ...createCompanion("actor", { x: 8.3, y: 10 }, "actor", "fighter"),
      state: "attack", commandPriority: "direct", currentTargetId: "target" };
    const target = createEnemy("target", { x: 10, y: 10 }, "passive", {
      combatBodyRadius: 0.7, maxHealth: 10000, isTargetDummy: true,
    });
    const resource = createResource("resource", { x: 8.3, y: 11.5 });
    const directions = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];
    const state = createTestGameState({ map: openMap, entities: { actor, target, resource }, partyLeaderId: actor.id,
      reservedPositionsByEntityId: Object.fromEntries(directions.map(([x, y], index) => ["reserved-" + index, {
        x: 10 + x / Math.hypot(x, y) * 1.7, y: 10 + y / Math.hypot(x, y) * 1.7,
      }])) });
    const next = updateAttackSystem(state, new Set(), 1000);
    expect(next.entities.actor.position).toEqual(actor.position);
    expect((next.entities.actor as Companion).currentTargetId).toBe(target.id);
    expect((next.entities.target as Enemy).health).toBe(target.health);
  });

  it("repositions instead of attacking from an in-range ground-footprint overlap", () => {
    const target = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), position: { x: 10, y: 10 },
      footprint: { minX: 7.5, maxX: 12.5, minY: 9.5, maxY: 11.5 },
      attackBounds: { minX: 8, maxX: 13, minY: 7, maxY: 12 } };
    const actor: Companion = { ...createCompanion("actor", { x: 10, y: 8.5 }, "actor", "fighter"),
      state: "attack", currentTargetId: target.id };
    let state = createTestGameState({ map: openMap, entities: { actor, [target.id]: target }, partyLeaderId: actor.id });
    expect(isWithinAttackReach(actor, target, 1)).toBe(true);
    expect(isCombatPositionAvailable(state, actor, actor.position)).toBe(false);
    state = advance(state, 1, false);
    expect((state.entities[target.id] as typeof target).health).toBe(target.health);
    for (let frame = 2; frame <= 60; frame++) state = advance(state, frame, false);
    expect(isCombatPositionAvailable(state, state.entities.actor, state.entities.actor.position)).toBe(true);
    expect((state.entities[target.id] as typeof target).health).toBeLessThan(target.health);
    const settled = state.entities.actor.position;
    for (let frame = 61; frame <= 90; frame++) {
      state = advance(state, frame, false);
      expect(state.entities.actor.position).toEqual(settled);
    }
  });

  it("reaches a legal broad-edge position and stays there for 30 further updates", () => {
    // Same authored footprint/attack-bound dimensions, translated into a small map.
    const target = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), position: { x: 10, y: 10 },
      footprint: { minX: 7.5, maxX: 12.5, minY: 9.5, maxY: 11.5 },
      attackBounds: { minX: 8, maxX: 13, minY: 7, maxY: 12 } };
    const actor: Companion = { ...createCompanion("actor", { x: 10, y: 2 }, "actor", "fighter"),
      state: "attack", currentTargetId: target.id };
    let state = createTestGameState({ map: openMap, currentMapId: "map-7", entities: { actor, [target.id]: target }, partyLeaderId: actor.id });
    for (let frame = 1; frame <= 60; frame++) state = advance(state, frame, false);
    const settled: Position = state.entities.actor.position;
    expect(settled).not.toEqual(actor.position);
    expect(isCombatPositionAvailable(state, state.entities.actor, settled)).toBe(true);
    expect(isWithinAttackReach(state.entities.actor, state.entities[target.id], 1)).toBe(true);
    for (let frame = 61; frame <= 90; frame++) {
      state = advance(state, frame, false);
      expect(state.entities.actor.position).toEqual(settled);
      expect((state.entities.actor as Companion).currentTargetId).toBe(target.id);
    }
  });
});
