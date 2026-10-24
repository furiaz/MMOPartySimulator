import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { updatePartyIntentSelfDefenseSystem } from "./partyIntentSystem";
import { applyStatusEffect } from "./statusEffects";
import { createTestGameState } from "./testState";

describe("party intent self-defense", () => {
  it("does not let one-frame blocker evidence replace an autonomous POI", () => {
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

    expect(nextState.leaderIntent).toEqual(state.leaderIntent);
    expect(nextState.partyIntent).toBe(state.partyIntent);
    expect(nextState.interruptedPoiTarget).toBeUndefined();
    expect(nextState.entities[leader.id]).toBe(leader);
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

    expect(nextState.leaderIntent).toEqual(state.leaderIntent);
    expect(nextState.partyIntent).toBe(state.partyIntent);
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: attacker.id,
    });
  });

  it("does not treat a failure timer and proximity as actual blocker evidence", () => {
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

    expect(nextState.leaderIntent).toEqual(state.leaderIntent);
    expect(nextState.entities[leader.id]).toBe(leader);
  });

  it("keeps self-defense committed to the current valid active threat", () => {
    const leader = {
      ...createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter"),
      state: "attack" as const,
      currentTargetId: "current-threat",
    };
    const currentThreat = {
      ...createEnemy("current-threat", { x: 2, y: 0 }, "aggressive", {
        maxHealth: 30,
      }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const closerThreat = {
      ...createEnemy("closer-threat", { x: 1, y: 0 }, "aggressive", {
        maxHealth: 30,
      }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [currentThreat.id]: currentThreat,
        [closerThreat.id]: closerThreat,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: currentThreat.id,
        targetPosition: currentThreat.position,
        source: "ai",
      },
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.leaderIntent).toEqual(state.leaderIntent);
    expect(nextState.partyIntent).toBe(state.partyIntent);
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: currentThreat.id,
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

  it("interrupts Auto Route when a party member is body blocked near a hostile for 1000 ms", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const blocker = createEnemy("body-blocker", { x: 2, y: 0 }, "passive");
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [blocker.id]: blocker,
      },
      partyLeaderId: leader.id,
      worldTravelTargetMapId: "map-2",
      movementFailureMsByEntityId: {
        [leader.id]: 1000,
      },
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent?.executionIntent).toMatchObject({
      type: "attack",
      targetId: blocker.id,
    });
    expect(nextState.interruptedPoiTarget?.worldTravelTargetMapId).toBe("map-2");
  });

  it("does not interrupt Auto Route for body block detection during route cooldown", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const blocker = createEnemy("body-blocker", { x: 2, y: 0 }, "passive");
    const state = createTestGameState({
      autoRoute: {
        interruptCooldownUntilMs: 2500,
      },
      entities: {
        [leader.id]: leader,
        [blocker.id]: blocker,
      },
      partyLeaderId: leader.id,
      simulationTimeMs: 2000,
      worldTravelTargetMapId: "map-2",
      movementFailureMsByEntityId: {
        [leader.id]: 1000,
      },
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent).toBeNull();
  });

  it("lets movement-blocking status bypass Auto Route interrupt cooldown", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const attacker = {
      ...createEnemy("immobilizer", { x: 4, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = applyStatusEffect(
      createTestGameState({
        autoRoute: {
          interruptCooldownUntilMs: 2500,
        },
        entities: {
          [leader.id]: leader,
          [attacker.id]: attacker,
        },
        partyLeaderId: leader.id,
        simulationTimeMs: 2000,
        worldTravelTargetMapId: "map-2",
      }),
      {
        type: "immobilized",
        targetId: leader.id,
        sourceId: attacker.id,
        durationMs: 1000,
      },
      2000,
    );

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent?.executionIntent).toMatchObject({
      type: "attack",
      targetId: attacker.id,
    });
  });

  it("lets low health near a hostile bypass Auto Route interrupt cooldown", () => {
    const leader = {
      ...createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter"),
      health: 49,
      maxHealth: 100,
    };
    const hostile = createEnemy("hostile", { x: 5, y: 0 }, "passive");
    const state = createTestGameState({
      autoRoute: {
        interruptCooldownUntilMs: 2500,
      },
      entities: {
        [leader.id]: leader,
        [hostile.id]: hostile,
      },
      partyLeaderId: leader.id,
      simulationTimeMs: 2000,
      worldTravelTargetMapId: "map-2",
    });

    const nextState = updatePartyIntentSelfDefenseSystem(state);

    expect(nextState.partyIntent?.executionIntent).toMatchObject({
      type: "attack",
      targetId: hostile.id,
    });
  });
});
