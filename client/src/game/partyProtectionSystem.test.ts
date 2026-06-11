import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { protectPartyMember } from "./partyProtectionSystem";
import { createTestGameState } from "./testState";

describe("party protection target stability", () => {
  it("keeps a retainable autonomous combat target when another nearby enemy hits", () => {
    const leader = {
      ...createCompanion("leader", { x: 0, y: 0 }, "leader", "defender", 0),
      state: "attack" as const,
      currentTargetId: "focused-threat",
    };
    const follower = {
      ...createCompanion("follower", { x: -1, y: 0 }, leader.id, "fighter", 1),
      state: "attack" as const,
      currentTargetId: "focused-threat",
    };
    const focusedThreat = {
      ...createEnemy("focused-threat", { x: 1, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const latestAttacker = {
      ...createEnemy("latest-attacker", { x: 0, y: 1 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
        [focusedThreat.id]: focusedThreat,
        [latestAttacker.id]: latestAttacker,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: focusedThreat.id,
        targetPosition: focusedThreat.position,
        source: "ai",
      },
    });

    const nextState = protectPartyMember(state, leader, latestAttacker);

    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: focusedThreat.id,
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: focusedThreat.id,
    });
    expect(nextState.entities[follower.id]).toMatchObject({
      state: "attack",
      currentTargetId: focusedThreat.id,
    });
  });

  it("switches to the attacker when the current combat target is no longer retainable", () => {
    const leader = {
      ...createCompanion("leader", { x: 0, y: 0 }, "leader", "defender", 0),
      state: "attack" as const,
      currentTargetId: "old-threat",
    };
    const oldThreat = {
      ...createEnemy("old-threat", { x: 1, y: 0 }, "aggressive"),
      state: "dead" as const,
      health: 0,
      currentTargetId: leader.id,
    };
    const latestAttacker = {
      ...createEnemy("latest-attacker", { x: 0, y: 1 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [oldThreat.id]: oldThreat,
        [latestAttacker.id]: latestAttacker,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: oldThreat.id,
        targetPosition: oldThreat.position,
        source: "ai",
      },
    });

    const nextState = protectPartyMember(state, leader, latestAttacker);

    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: latestAttacker.id,
    });
  });
});
