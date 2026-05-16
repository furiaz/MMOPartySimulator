import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { updateDefendSystem } from "./defendSystem";
import { createTestGameState } from "./testState";

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

    expect(distanceMoved).toBeCloseTo(0.2);
  });
});
