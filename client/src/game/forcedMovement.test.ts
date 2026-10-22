import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import { cancelForcedMovement, clearForcedMovements, isForcedMovementPositionAvailable, startForcedMovement, updateForcedMovements } from "./forcedMovement";
import { isAttackBlockedByStatus, isGatherBlockedByStatus, isMovementBlockedByStatus, isSkillUseBlockedByStatus } from "./statusEffects";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { sanitizeGameStateForSave } from "./saveGame";
import { issueCompanionDirectCommand, updateDirectCompanionCommandSystem } from "./directCompanionCommands";
import type { GameMap } from "./types";
function setup() {
  return addEntity(createTestGameState(), createCompanion("target", { x: 10, y: 10 }, "target"));
}
describe("reusable forced movement", () => {
  it("interpolates, records movement, blocks actions, and releases without changing orders", () => {
    let state = startForcedMovement(setup(), "target", "source", { x: 2, y: 0 }, 4, 250, 1000);
    expect(isMovementBlockedByStatus(state, "target")).toBe(true);
    expect(isAttackBlockedByStatus(state, "target")).toBe(true);
    expect(isSkillUseBlockedByStatus(state, "target")).toBe(true);
    expect(isGatherBlockedByStatus(state, "target")).toBe(true);
    const moved = new Set<string>();
    state = updateForcedMovements(state, moved, 1125);
    expect(state.entities.target.position.x).toBeCloseTo(12);
    expect(moved.has("target")).toBe(true);
    state = updateForcedMovements(state, moved, 1250);
    expect(state.entities.target.position.x).toBeCloseTo(14);
    expect(state.forcedMovementsByEntityId).toEqual({});
    expect(isSkillUseBlockedByStatus(state, "target")).toBe(false);
  });
  it("crosses living entities but selects a free landing", () => {
    let state = addEntity(setup(), createCompanion("blocker", { x: 14, y: 10 }, "blocker"));
    state = addEntity(state, createCompanion("crossed", { x: 11, y: 10 }, "crossed"));
    state = startForcedMovement(state, "target", "source", { x: 1, y: 0 }, 4, 250, 1000);
    const distance = state.forcedMovementsByEntityId?.target.distance ?? 0;
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(3);
    state = updateForcedMovements(state, new Set(), 2000);
    expect(isForcedMovementPositionAvailable(state, state.entities.target, state.entities.target.position, true)).toBe(true);
  });
  it("clips before walls using the whole capsule and preserves speed", () => {
    let state = setup();
    state = {
      ...state, map: {
        columns: 30,
        rows: 30,
        walls: [{ x: 13, y: 10 }],
        healingFountains: [],
        teleports: [],
        debugName: "test",
        displayName: "Test"
      } as GameMap
    };
    state = startForcedMovement(state, "target", "source", { x: 1, y: 0 }, 4, 250, 1000);
    const movement = state.forcedMovementsByEntityId!.target;
    expect(movement.distance).toBeGreaterThan(1.7);
    expect(movement.distance).toBeLessThan(2);
    expect(movement.endsAt - movement.startedAt).toBeCloseTo(250 * movement.distance / 4);
    state = updateForcedMovements(state, new Set(), 10000);
    expect(state.entities.target.position.x).toBeLessThan(12);
  });
  it("cannot tunnel through a newly introduced wall or blocking resource", () => {
    let state = startForcedMovement(setup(), "target", "source", { x: 1, y: 0 }, 4, 250, 1000);
    state = addEntity(state, createResource("resource", { x: 12, y: 10 }));
    state = updateForcedMovements(state, new Set(), 2000);
    expect(state.entities.target.position.x).toBeLessThan(11);
  });
  it("revalidates an occupied endpoint backward without lateral redirection", () => {
    let state = startForcedMovement(setup(), "target", "source", { x: 1, y: 0 }, 4, 250, 1000);
    state = updateForcedMovements(state, new Set(), 1100);
    state = addEntity(state, createEnemy("blocker", { x: 14, y: 10 }));
    state = updateForcedMovements(state, new Set(), 1250);
    expect(state.entities.target.position.x).toBeLessThan(13);
    expect(state.entities.target.position.y).toBe(10);
    expect(isForcedMovementPositionAvailable(state, state.entities.target, state.entities.target.position, true)).toBe(true);
  });
  it("tests even sub-sample endpoints against newly introduced terrain", () => {
    let state = startForcedMovement(setup(), "target", "source", { x: 1, y: 0 }, 4, 250, 1000);
    state = { ...state, map: { columns: 30, rows: 30, walls: [{ x: 11.15, y: 10 }], healingFountains: [], teleports: [], debugName: "test", displayName: "Test" } };
    state = updateForcedMovements(state, new Set(), 1005);
    expect(state.entities.target.position.x).toBe(10);
    expect(state.forcedMovementsByEntityId?.target).toBeUndefined();
  });
  it("clears transient movement and restores a safe position when saving", () => {
    let state = startForcedMovement(setup(), "target", "source", { x: 1, y: 0 }, 4, 250, 1000);
    state = updateForcedMovements(state, new Set(), 1125);
    state = addEntity(state, createEnemy("blocker", { x: 12, y: 10 }));
    state = updateForcedMovements(state, new Set(), 1130);
    const restored = sanitizeGameStateForSave(state, 1140);
    expect(restored.forcedMovementsByEntityId).toEqual({});
    expect(restored.entities.target.position).toEqual(state.forcedMovementsByEntityId?.target.lastSafePosition);
  });
  it("ignores invalid movement requests without interrupting actions", () => {
    const state = setup();
    expect(startForcedMovement(state, "target", "source", { x: 0, y: 0 }, 4, 250, 1000)).toBe(state);
    expect(startForcedMovement(state, "target", "source", { x: Infinity, y: 0 }, 4, 250, 1000)).toBe(state);
    expect(startForcedMovement(state, "target", "source", { x: 1, y: 0 }, -1, 250, 1000)).toBe(state);
  });
  it("preserves a direct move order until knockback finishes", () => {
    let state = issueCompanionDirectCommand(setup(), { type: "move", companionId: "target", targetPosition: { x: 18, y: 10 } }, 900).state;
    const command = state.directCompanionCommandsById?.target;
    state = startForcedMovement(state, "target", "source", { x: 1, y: 0 }, 4, 250, 1000);
    state = updateDirectCompanionCommandSystem(state, new Set(), 1100);
    expect(state.directCompanionCommandsById?.target).toBe(command);
    expect(state.entities.target.position).toEqual({ x: 10, y: 10 });
    state = updateForcedMovements(state, new Set(), 1250);
    expect(state.directCompanionCommandsById?.target).toBe(command);
  });
  it("does not depend on source survival and cancels at the last safe position", () => {
    let state = startForcedMovement(setup(), "target", "absent-source", { x: 1, y: 0 }, 4, 250, 1000);
    state = updateForcedMovements(state, new Set(), 1125);
    expect(state.entities.target.position.x).toBe(12);
    expect(cancelForcedMovement(state, "target").forcedMovementsByEntityId).toEqual({});
    expect(clearForcedMovements(state, "absent-source").entities.target.position.x).toBe(12);
    expect(clearMapTransitionRuntimeState(state).forcedMovementsByEntityId).toEqual({});
    state = { ...state, entities: {} };
    expect(pruneMissingEntityRuntimeState(state).forcedMovementsByEntityId).toEqual({});
  });
});
