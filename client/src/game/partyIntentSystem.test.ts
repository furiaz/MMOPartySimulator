import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { updatePartyIntentSelfDefenseSystem } from "./partyIntentSystem";
import { createTestGameState } from "./testState";

describe("party intent self-defense", () => {
  it("turns blocked autonomous POI movement into self-defense against the enemy blocker", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const blocker = createEnemy("blocking-enemy", { x: 1, y: 0 }, "passive", {
      maxHealth: 30,
    });
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [blocker.id]: blocker,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
        source: "ai",
      },
      localPoiTarget: {
        poiId: "road-poi",
        category: "exploration",
        mapId: "map-1",
        position: { x: 10, y: 0 },
        reason: "test route",
      },
      movementFailuresByEntityId: {
        [leader.id]: {
          blockerId: blocker.id,
          blockerKind: "enemy",
          intendedPosition: blocker.position,
          targetDistance: 10,
        },
      },
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent).toMatchObject({
      mode: "engage",
      source: "ai",
      executionIntent: {
        type: "attack",
        targetId: blocker.id,
      },
    });
    expect(nextState.interruptedPoiTarget?.leaderIntent).toMatchObject({
      type: "move",
      targetPosition: { x: 10, y: 0 },
    });
    expect(nextState.interruptedPoiTarget?.localPoiTarget).toMatchObject({
      poiId: "road-poi",
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: blocker.id,
      commandPriority: "autonomous",
    });
  });

  it("responds to close same-frame enemy aggro before the attack system runs", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const attacker = {
      ...createEnemy("attacker", { x: 2, y: 0 }, "aggressive", {
        maxHealth: 30,
      }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [attacker.id]: attacker,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
        source: "ai",
      },
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent).toMatchObject({
      mode: "engage",
      executionIntent: {
        type: "attack",
        targetId: attacker.id,
      },
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: attacker.id,
    });
  });

  it("self-defends when a movement-stuck companion has a nearby enemy without a blocker id", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const nearbyEnemy = createEnemy("nearby-enemy", { x: 1, y: 0 }, "passive", {
      maxHealth: 30,
    });
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [nearbyEnemy.id]: nearbyEnemy,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
        source: "ai",
      },
      movementFailureMsByEntityId: {
        [leader.id]: 500,
      },
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent).toMatchObject({
      mode: "engage",
      executionIntent: {
        type: "attack",
        targetId: nearbyEnemy.id,
      },
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: nearbyEnemy.id,
    });
  });

  it("does not turn a direct companion's personal blockage into party-level intent", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const directCompanion = {
      ...createCompanion("direct", { x: 0, y: 1 }, leader.id, "support"),
      commandPriority: "direct" as const,
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const blocker = createEnemy("blocking-enemy", { x: 0, y: 2 }, "passive");
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [directCompanion.id]: directCompanion,
        [blocker.id]: blocker,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
        source: "ai",
      },
      movementFailuresByEntityId: {
        [directCompanion.id]: {
          blockerId: blocker.id,
          blockerKind: "enemy",
          intendedPosition: blocker.position,
          targetDistance: 1,
        },
      },
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent).toBeNull();
    expect(nextState.leaderIntent).toEqual(state.leaderIntent);
    expect(nextState.entities[directCompanion.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
      commandPriority: "direct",
    });
  });
});
