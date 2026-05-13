import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { createTestGameState } from "./testState";

describe("party formation real-time cohesion", () => {
  it("slows the leader instead of stopping when followers are slightly outside cohesion", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -4.5, y: 0 },
      leader.id,
      "support",
    );
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
      simulationDeltaMs: 100,
    });

    const nextState = updatePartyFormationSystem(state);
    const movedLeader = nextState.entities[leader.id];

    expect(movedLeader.position.x).toBeGreaterThan(0);
    expect(movedLeader.position.x).toBeLessThan(0.2);
  });

  it("still waits when followers are severely separated", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -8, y: 0 },
      leader.id,
      "support",
    );
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
      simulationDeltaMs: 100,
    });

    const nextState = updatePartyFormationSystem(state);

    expect(nextState.entities[leader.id].position).toEqual(leader.position);
  });

  it("slows instead of stopping for a transient blocked follower", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -4.5, y: 0 },
      leader.id,
      "support",
    );
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      failedMoveByEntityId: { [follower.id]: true },
      movementFailureMsByEntityId: { [follower.id]: 100 },
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
      simulationDeltaMs: 100,
    });

    const nextState = updatePartyFormationSystem(state);

    expect(nextState.entities[leader.id].position.x).toBeGreaterThan(0);
    expect(nextState.entities[leader.id].position.x).toBeLessThan(0.2);
  });

  it("keeps slowing instead of stopping for repeated blockage before severe separation", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -6.5, y: 0 },
      leader.id,
      "support",
    );
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      failedMoveByEntityId: { [follower.id]: true },
      movementFailureMsByEntityId: { [follower.id]: 1000 },
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
      simulationDeltaMs: 100,
    });

    const nextState = updatePartyFormationSystem(state);

    expect(nextState.entities[leader.id].position.x).toBeGreaterThan(0);
    expect(nextState.entities[leader.id].position.x).toBeLessThan(0.2);
  });

  it("waits when a blocked follower becomes severely separated", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -8, y: 0 },
      leader.id,
      "support",
    );
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      failedMoveByEntityId: { [follower.id]: true },
      movementFailureMsByEntityId: { [follower.id]: 1000 },
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
      simulationDeltaMs: 100,
    });

    const nextState = updatePartyFormationSystem(state);

    expect(nextState.entities[leader.id].position).toEqual(leader.position);
  });

  it("keeps leader and follower moving smoothly across variable real-time frames", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -4.5, y: 0 },
      leader.id,
      "support",
    );
    const frameDurations = [16, 33, 50, 100];
    let state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
    });

    for (const deltaMs of frameDurations) {
      const previousLeaderX = state.entities[leader.id].position.x;
      state = updatePartyFormationSystem({
        ...state,
        simulationDeltaMs: deltaMs,
      });

      expect(state.entities[leader.id].position.x).toBeGreaterThan(previousLeaderX);
    }

    expect(state.entities[follower.id].position.x).toBeGreaterThan(follower.position.x);
  });

  it("uses elapsed handoff milliseconds instead of legacy handoff ticks", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -8, y: 0 },
      leader.id,
      "support",
    );
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      leaderHandoffTicks: 999,
      leaderHandoffRemainingMs: 0,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
      simulationDeltaMs: 100,
    });

    const nextState = updatePartyFormationSystem(state);

    expect(nextState.entities[leader.id].position).toEqual(leader.position);
    expect(nextState.leaderHandoffTicks).toBe(999);
  });

  it("allows temporary leader handoff movement only while milliseconds remain", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const follower = createCompanion(
      "follower",
      { x: -8, y: 0 },
      leader.id,
      "support",
    );
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
      },
      partyLeaderId: leader.id,
      leaderHandoffRemainingMs: 50,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
      },
      simulationDeltaMs: 50,
    });

    const nextState = updatePartyFormationSystem(state);

    expect(nextState.entities[leader.id].position.x).toBeGreaterThan(0);
    expect(nextState.leaderHandoffRemainingMs).toBe(0);
  });
});
