import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, getMovementStepDistance } from "./entities";
import { updateDefendSystem } from "./defendSystem";
import { createTestGameState } from "./testState";
import type { Enemy } from "./types";

describe("defender real-time movement", () => {
  it("uses delta-scaled catch-up speed instead of multi-step bursts", () => {
    const leader = {
      ...createCompanion("leader", { x: 2, y: 0 }, "leader", "fighter"),
      currentTargetId: "target",
    };
    const defender = {
      ...createCompanion("defender", { x: 0, y: 0 }, leader.id, "defender"),
      state: "defend" as const,
      defendPosition: { x: 3, y: 0 },
    };
    const target = createEnemy("target", { x: 4, y: 0 });
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [defender.id]: defender,
        [target.id]: target,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: target.id,
        targetPosition: target.position,
      },
      simulationDeltaMs: 50,
      defenderWaitMsByLeaderId: { [leader.id]: 100 },
    });

    const nextState = updateDefendSystem(state, new Set(), {
      nowMs: 1000,
      deltaMs: 50,
      deltaSeconds: 0.05,
      frameNumber: 1,
    });

    const movedDefender = nextState.entities[defender.id];
    const distanceMoved = Math.hypot(
      movedDefender.position.x - defender.position.x,
      movedDefender.position.y - defender.position.y,
    );

    expect(distanceMoved).toBeCloseTo(getMovementStepDistance(defender, 50) * 2);
  });

  it("repositions an in-range stacked defender before attacking when a spaced slot exists", () => {
    const leader = {
      ...createCompanion("leader", { x: 2, y: 0 }, "leader", "fighter"),
      currentTargetId: "target",
    };
    const defender = {
      ...createCompanion("defender", { x: 3, y: 0 }, leader.id, "defender"),
      state: "defend" as const,
      currentTargetId: "target",
      defendPosition: { x: 3, y: 0 },
    };
    const blocker = createCompanion("blocker", { x: 3.2, y: 0 }, leader.id);
    const target = createEnemy("target", { x: 4, y: 0 }, undefined, {
      maxHealth: 10,
    });
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [defender.id]: defender,
        [blocker.id]: blocker,
        [target.id]: target,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: target.id,
        targetPosition: target.position,
      },
      simulationDeltaMs: 100,
    });

    const nextState = updateDefendSystem(state, new Set(), {
      nowMs: 1000,
      deltaMs: 100,
      deltaSeconds: 0.1,
      frameNumber: 1,
    });
    const movedDefender = nextState.entities[defender.id];
    const nextTarget = nextState.entities[target.id] as Enemy;

    expect(nextTarget.health).toBe(target.health);
    expect(movedDefender.position).not.toEqual(defender.position);
  });

  it("keeps a defender committed to its current active threat over a closer alternate", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const defender = {
      ...createCompanion("defender", { x: 0, y: 1 }, leader.id, "defender"),
      state: "defend" as const,
      currentTargetId: "current-threat",
    };
    const currentThreat = {
      ...createEnemy("current-threat", { x: 2, y: 1 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: defender.id,
    };
    const closerThreat = {
      ...createEnemy("closer-threat", { x: 1, y: 1 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: defender.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [defender.id]: defender,
        [currentThreat.id]: currentThreat,
        [closerThreat.id]: closerThreat,
      },
      partyLeaderId: leader.id,
      simulationDeltaMs: 100,
    });

    const nextState = updateDefendSystem(state, new Set(), {
      nowMs: 0,
      deltaMs: 100,
      deltaSeconds: 0.1,
      frameNumber: 1,
    });

    expect(nextState.entities[defender.id]).toMatchObject({
      state: "defend",
      currentTargetId: currentThreat.id,
    });
  });
});
