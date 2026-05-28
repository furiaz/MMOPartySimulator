import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import {
  issueCompanionDirectCommand,
  updateDirectCompanionCommandSystem,
} from "./directCompanionCommands";
import { updateGatherSystem } from "./gatherSystem";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import type { GameEntity } from "./types";

describe("companion direct commands", () => {
  it("assigns one companion to direct gather without changing role or party intent", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const fighter = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const resource = createResource("wood", { x: 4, y: 0 });
    const state = createState([leader, fighter, resource], leader.id);

    const result = issueCompanionDirectCommand(state, {
      type: "gather",
      companionId: fighter.id,
      targetId: resource.id,
    }, 1000);

    expect(result.code).toBe("success");
    expect(result.state.partyIntent).toBeNull();
    expect(result.state.leaderIntent).toBeNull();
    expect(result.state.entities[fighter.id]).toMatchObject({
      role: "fighter",
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
    expect(result.state.entities[leader.id]).toMatchObject({
      commandPriority: "autonomous",
    });
  });

  it("assigns one companion to direct attack and leaves passive enemies passive until hit", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const fighter = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const enemy = createEnemy("enemy", { x: 4, y: 0 }, "passive");
    const state = createState([leader, fighter, enemy], leader.id);

    const result = issueCompanionDirectCommand(state, {
      type: "attack",
      companionId: fighter.id,
      targetId: enemy.id,
    }, 1000);

    expect(result.code).toBe("success");
    expect(result.state.entities[fighter.id]).toMatchObject({
      state: "attack",
      currentTargetId: enemy.id,
      commandPriority: "direct",
    });
    expect(result.state.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("replaces an enemy command with a floor move and clears the stale enemy target", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const fighter = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const enemy = createEnemy("enemy", { x: 4, y: 0 });
    const attackResult = issueCompanionDirectCommand(
      createState([leader, fighter, enemy], leader.id),
      {
        type: "attack",
        companionId: fighter.id,
        targetId: enemy.id,
      },
      1000,
    );

    const moveResult = issueCompanionDirectCommand(
      attackResult.state,
      {
        type: "move",
        companionId: fighter.id,
        targetPosition: fighter.position,
      },
      1100,
    );
    const completedState = updateDirectCompanionCommandSystem(
      moveResult.state,
      new Set(),
      1200,
    );

    expect(moveResult.code).toBe("success");
    expect(moveResult.state.directCompanionCommandsById?.[fighter.id]).toMatchObject({
      type: "move",
    });
    expect(moveResult.state.entities[fighter.id]).toMatchObject({
      state: "follow",
      currentTargetId: null,
      commandPriority: "direct",
    });
    expect(completedState.directCompanionCommandsById?.[fighter.id]).toBeUndefined();
    expect(completedState.directCommandGraceUntilByCompanionId?.[fighter.id]).toBeGreaterThan(1200);
  });

  it("expires direct command rejoin grace after the grace window", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const fighter = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const moveResult = issueCompanionDirectCommand(
      createState([leader, fighter], leader.id),
      {
        type: "move",
        companionId: fighter.id,
        targetPosition: fighter.position,
      },
      1000,
    );
    const completedState = updateDirectCompanionCommandSystem(
      moveResult.state,
      new Set(),
      1000,
    );

    const expiredState = updateDirectCompanionCommandSystem(
      completedState,
      new Set(),
      2600,
    );

    expect(completedState.directCommandGraceUntilByCompanionId?.[fighter.id]).toBeGreaterThan(1000);
    expect(expiredState.directCommandGraceUntilByCompanionId?.[fighter.id]).toBeUndefined();
  });

  it("rejects targets beyond the 30-cell direct command leash", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const resource = createResource("wood", { x: 31, y: 0 });
    const state = createState([leader, resource], leader.id);

    const result = issueCompanionDirectCommand(state, {
      type: "gather",
      companionId: leader.id,
      targetId: resource.id,
    }, 1000);

    expect(result.code).toBe("out_of_range");
    expect(result.state.directCompanionCommandsById?.[leader.id]).toBeUndefined();
  });

  it("rejects extra direct collectors when maxGatherers is already reserved by direct commands", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const fighter = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const support = createCompanion("support", { x: 2, y: 0 }, leader.id, "support");
    const resource = createResource("wood", { x: 4, y: 0 }, { maxGatherers: 1 });
    const firstResult = issueCompanionDirectCommand(
      createState([leader, fighter, support, resource], leader.id),
      {
        type: "gather",
        companionId: fighter.id,
        targetId: resource.id,
      },
      1000,
    );

    const secondResult = issueCompanionDirectCommand(firstResult.state, {
      type: "gather",
      companionId: support.id,
      targetId: resource.id,
    }, 1100);

    expect(firstResult.code).toBe("success");
    expect(secondResult.code).toBe("resource_full");
  });

  it("prioritizes a direct collector before an autonomous collector at resource capacity", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const directCollector = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const autonomousCollector = {
      ...createCompanion("support", { x: 1.2, y: 0 }, leader.id, "support"),
      state: "gather" as const,
      currentTargetId: "wood",
      commandPriority: "autonomous" as const,
    };
    const resource = createResource("wood", { x: 1.6, y: 0 }, { maxGatherers: 1 });
    const directResult = issueCompanionDirectCommand(
      createState([leader, directCollector, autonomousCollector, resource], leader.id),
      {
        type: "gather",
        companionId: directCollector.id,
        targetId: resource.id,
      },
      1000,
    );

    const nextState = updateGatherSystem(directResult.state, new Set(), 1000);

    expect(nextState.entities[directCollector.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
    expect(nextState.entities[autonomousCollector.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
      commandPriority: "autonomous",
    });
  });
});

function createState(entities: GameEntity[], partyLeaderId: string) {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId,
    }),
  );
}
