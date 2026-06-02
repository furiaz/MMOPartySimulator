import { describe, expect, it } from "vitest";
import { clearFrameMovementPlanning } from "./movementState";
import { pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { clearExpiredSkillRuntimeState } from "./state";
import { createCompanion, createEnemy } from "./entities";
import { addEntity, updateEntity } from "./state";
import { createTestGameState } from "./testState";
import type { SkillMarkState, SkillVisualEvent } from "./types";

describe("runtime cleanup", () => {
  it("preserves the state reference when movement planning has no frame data", () => {
    const state = createTestGameState({
      movementPathRetryAtMsByEntityId: {
        "companion-1": 1500,
      },
      simulationTimeMs: 1000,
    });

    expect(clearFrameMovementPlanning(state)).toBe(state);
  });

  it("clears only expired movement retry entries when movement planning changes", () => {
    const state = createTestGameState({
      movementPathRetryAtMsByEntityId: {
        "companion-1": 900,
        "companion-2": 1500,
      },
      simulationTimeMs: 1000,
    });

    const nextState = clearFrameMovementPlanning(state);

    expect(nextState).not.toBe(state);
    expect(nextState.movementPathRetryAtMsByEntityId).toEqual({
      "companion-2": 1500,
    });
  });

  it("preserves the state reference when skill runtime data has not expired", () => {
    const activeMark: SkillMarkState = {
      sourceId: "companion-1",
      targetId: "enemy-1",
      bonusDamage: 2,
      expiresAt: 2000,
    };
    const activeVisual: SkillVisualEvent = {
      id: "visual-1",
      type: "slash",
      sourceId: "companion-1",
      targetId: "enemy-1",
      createdAt: 900,
      expiresAt: 2000,
    };
    const state = createTestGameState({
      skillMarksByEnemyId: {
        "enemy-1": activeMark,
      },
      skillVisualEvents: [activeVisual],
    });

    expect(clearExpiredSkillRuntimeState(state, 1000)).toBe(state);
  });

  it("removes expired skill runtime data while keeping active entries", () => {
    const activeMark: SkillMarkState = {
      sourceId: "companion-1",
      targetId: "enemy-1",
      bonusDamage: 2,
      expiresAt: 2000,
    };
    const expiredMark: SkillMarkState = {
      sourceId: "companion-2",
      targetId: "enemy-2",
      bonusDamage: 1,
      expiresAt: 900,
    };
    const activeVisual: SkillVisualEvent = {
      id: "visual-1",
      type: "slash",
      sourceId: "companion-1",
      targetId: "enemy-1",
      createdAt: 900,
      expiresAt: 2000,
    };
    const expiredVisual: SkillVisualEvent = {
      id: "visual-2",
      type: "heal",
      sourceId: "companion-2",
      createdAt: 800,
      expiresAt: 900,
    };
    const state = createTestGameState({
      skillMarksByEnemyId: {
        "enemy-1": activeMark,
        "enemy-2": expiredMark,
      },
      skillVisualEvents: [activeVisual, expiredVisual],
    });

    const nextState = clearExpiredSkillRuntimeState(state, 1000);

    expect(nextState).not.toBe(state);
    expect(nextState.skillMarksByEnemyId).toEqual({
      "enemy-1": activeMark,
    });
    expect(nextState.skillVisualEvents).toEqual([activeVisual]);
  });

  it("preserves the state reference when updating the same entity reference", () => {
    const companion = createCompanion("companion-1", { x: 1, y: 1 }, "Companion");
    const state = addEntity(createTestGameState(), companion);

    expect(updateEntity(state, companion)).toBe(state);
  });

  it("updates follow trails when an entity position changes", () => {
    const companion = createCompanion("companion-1", { x: 1, y: 1 }, "Companion");
    const state = addEntity(createTestGameState(), companion);

    const nextState = updateEntity(state, {
      ...companion,
      position: { x: 2, y: 1 },
    });

    expect(nextState).not.toBe(state);
    expect(nextState.followTrailsByEntityId[companion.id]).toEqual([
      companion.position,
    ]);
  });

  it("prunes retained runtime records for missing entities", () => {
    const companion = createCompanion("companion-1", { x: 1, y: 1 }, "Companion");
    const enemy = createEnemy("enemy-1", { x: 2, y: 1 });
    const state = addEntity(addEntity(createTestGameState(), companion), enemy);
    const nextState = pruneMissingEntityRuntimeState({
      ...state,
      entities: {
        [companion.id]: companion,
      },
      movementPathsByEntityId: {
        [companion.id]: {
          targetKey: "current",
          targetPosition: { x: 2, y: 2 },
          waypoints: [{ x: 1, y: 1 }],
        },
        [enemy.id]: {
          targetKey: "stale",
          targetPosition: { x: 3, y: 3 },
          waypoints: [{ x: 2, y: 1 }],
        },
      },
      skillMarksByEnemyId: {
        [enemy.id]: {
          bonusDamage: 2,
          expiresAt: 2_000,
          sourceId: companion.id,
          targetId: enemy.id,
        },
      },
      flaskRechargeCountedEnemyDefeats: {
        [enemy.id]: 1_000,
      },
    });

    expect(nextState.movementPathsByEntityId).toEqual({
      [companion.id]: {
        targetKey: "current",
        targetPosition: { x: 2, y: 2 },
        waypoints: [{ x: 1, y: 1 }],
      },
    });
    expect(nextState.skillMarksByEnemyId).toEqual({});
    expect(nextState.flaskRechargeCountedEnemyDefeats).toEqual({});
  });
});
