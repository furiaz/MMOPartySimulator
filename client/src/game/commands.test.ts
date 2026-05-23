import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import { issuePartyOrder } from "./commands";
import type { GameEntity } from "./types";

describe("party orders", () => {
  it("issues party gather as player intent without locking companions as direct commands", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const fighter = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const resource = createResource("wood", { x: 4, y: 0 });

    const nextState = issuePartyOrder(
      createState([leader, fighter, resource], leader.id),
      {
        type: "gather",
        targetId: resource.id,
      },
    );

    expect(nextState.leaderIntent).toMatchObject({
      type: "gather",
      targetId: resource.id,
      source: "player",
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "autonomous",
    });
    expect(nextState.entities[fighter.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "autonomous",
    });
  });

  it("lets a later party move reclaim companions from a previous party gather", () => {
    const leader = {
      ...createCompanion("leader", { x: 0, y: 0 }, "leader"),
      state: "gather" as const,
      currentTargetId: "wood",
      commandPriority: "autonomous" as const,
    };
    const fighter = {
      ...createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter"),
      state: "gather" as const,
      currentTargetId: "wood",
      commandPriority: "autonomous" as const,
    };
    const resource = createResource("wood", { x: 4, y: 0 });

    const nextState = issuePartyOrder(
      createState([leader, fighter, resource], leader.id),
      {
        type: "move",
        targetPosition: { x: 8, y: 0 },
      },
    );

    expect(nextState.leaderIntent).toMatchObject({
      type: "move",
      targetId: null,
      targetPosition: { x: 8, y: 0 },
      source: "player",
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "follow",
      currentTargetId: null,
      commandPriority: "autonomous",
    });
    expect(nextState.entities[fighter.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
      commandPriority: "autonomous",
    });
  });

  it("lets a later party attack reclaim companions from a previous party gather", () => {
    const leader = {
      ...createCompanion("leader", { x: 0, y: 0 }, "leader"),
      state: "gather" as const,
      currentTargetId: "wood",
      commandPriority: "autonomous" as const,
    };
    const fighter = {
      ...createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter"),
      state: "gather" as const,
      currentTargetId: "wood",
      commandPriority: "autonomous" as const,
    };
    const resource = createResource("wood", { x: 4, y: 0 });
    const enemy = createEnemy("enemy", { x: 6, y: 0 });

    const nextState = issuePartyOrder(
      createState([leader, fighter, resource, enemy], leader.id),
      {
        type: "attack",
        targetId: enemy.id,
      },
    );

    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: enemy.id,
      commandPriority: "autonomous",
    });
    expect(nextState.entities[fighter.id]).toMatchObject({
      state: "attack",
      currentTargetId: enemy.id,
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
