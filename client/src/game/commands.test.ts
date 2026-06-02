import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { issueCompanionCommand, issuePartyOrder } from "./commands";
import type { GameEntity, GameMap, Position } from "./types";

describe("party orders", () => {
  it("keeps a direct command to the current leader from becoming party-wide intent", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const follower = createCompanion("follower", { x: 1, y: 0 }, leader.id);
    const enemy = createEnemy("enemy", { x: 4, y: 0 });
    const state = createState([leader, follower, enemy], leader.id);

    const nextState = issueCompanionCommand(state, {
      type: "attack",
      companionId: leader.id,
      targetId: enemy.id,
    });

    expect(nextState.partyIntent).toBeNull();
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: enemy.id,
      commandPriority: "direct",
    });
    expect(nextState.entities[follower.id]).toMatchObject({
      state: follower.state,
      currentTargetId: follower.currentTargetId,
    });
  });

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
    expect(nextState.partyIntent).toMatchObject({
      mode: "travel",
      source: "player",
      executionIntent: {
        type: "gather",
        targetId: resource.id,
      },
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

  it.each([
    [
      "depleted",
      createResource("depleted-wood", { x: 4, y: 0 }, { quantity: 0 }),
    ],
    [
      "stale zero-quantity",
      {
        ...createResource("stale-wood", { x: 4, y: 0 }, { quantity: 0 }),
        isDepleted: false,
      },
    ],
  ])("ignores party gather orders for %s resources", (_label, resource) => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const fighter = createCompanion("fighter", { x: 1, y: 0 }, leader.id, "fighter");
    const state = createState([leader, fighter, resource], leader.id);

    const nextState = issuePartyOrder(state, {
      type: "gather",
      targetId: resource.id,
    });

    expect(nextState).toBe(state);
    expect(nextState.leaderIntent).toBeNull();
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
    expect(nextState.partyIntent).toMatchObject({
      mode: "travel",
      source: "player",
      executionIntent: {
        type: "move",
        targetPosition: { x: 8, y: 0 },
      },
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

    expect(nextState.partyIntent).toMatchObject({
      mode: "engage",
      source: "player",
      executionIntent: {
        type: "attack",
        targetId: enemy.id,
      },
    });
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

  it("rejects unreachable party attack orders", () => {
    const leader = createCompanion("leader", { x: 2, y: 2 }, "leader");
    const fighter = createCompanion("fighter", { x: 3, y: 2 }, leader.id, "fighter");
    const enemy = createEnemy("blocked-enemy", { x: 10, y: 10 });
    const state = createState([leader, fighter, enemy], leader.id, {
      map: createBlockedTargetMap(enemy.position),
    });

    const nextState = issuePartyOrder(state, {
      type: "attack",
      targetId: enemy.id,
    });

    expect(nextState.partyIntent).toBeNull();
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.entities[leader.id]).toMatchObject({
      state: leader.state,
      currentTargetId: leader.currentTargetId,
    });
    expect(nextState.entities[fighter.id]).toMatchObject({
      state: fighter.state,
      currentTargetId: fighter.currentTargetId,
    });
  });

  it("accepts reachable party attack orders when a path exists", () => {
    const leader = createCompanion("leader", { x: 2, y: 2 }, "leader");
    const enemy = createEnemy("enemy", { x: 6, y: 2 });
    const state = createState([leader, enemy], leader.id, {
      map: createOpenTestMap(),
    });

    const nextState = issuePartyOrder(state, {
      type: "attack",
      targetId: enemy.id,
    });

    expect(nextState.partyIntent).toMatchObject({
      mode: "engage",
      source: "player",
      executionIntent: {
        type: "attack",
        targetId: enemy.id,
      },
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: enemy.id,
    });
  });

  it("rejects unreachable party gather orders", () => {
    const leader = createCompanion("leader", { x: 2, y: 2 }, "leader");
    const resource = createResource("blocked-wood", { x: 10, y: 10 });
    const state = createState([leader, resource], leader.id, {
      map: createBlockedTargetMap(resource.position),
    });

    const nextState = issuePartyOrder(state, {
      type: "gather",
      targetId: resource.id,
    });

    expect(nextState.partyIntent).toBeNull();
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.entities[leader.id]).toMatchObject({
      state: leader.state,
      currentTargetId: leader.currentTargetId,
    });
  });

  it("rejects unreachable party move orders", () => {
    const leader = createCompanion("leader", { x: 2, y: 2 }, "leader");
    const targetPosition = { x: 10, y: 10 };
    const state = createState([leader], leader.id, {
      map: createBlockedTargetMap(targetPosition),
    });

    const nextState = issuePartyOrder(state, {
      type: "move",
      targetPosition,
    });

    expect(nextState.partyIntent).toBeNull();
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.entities[leader.id]).toMatchObject({
      state: leader.state,
      currentTargetId: leader.currentTargetId,
    });
  });
});

function createState(
  entities: GameEntity[],
  partyLeaderId: string,
  overrides: Partial<GameState> = {},
) {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId,
      ...overrides,
    }),
  );
}

function createOpenTestMap(): GameMap {
  return {
    displayName: "Open Test Map",
    debugName: "open-test-map",
    columns: 20,
    rows: 20,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

function createBlockedTargetMap(blockedPosition: Position): GameMap {
  return {
    displayName: "Blocked Test Map",
    debugName: "blocked-test-map",
    columns: 20,
    rows: 20,
    walls: [
      { x: blockedPosition.x - 1, y: blockedPosition.y },
      { x: blockedPosition.x + 1, y: blockedPosition.y },
      { x: blockedPosition.x, y: blockedPosition.y - 1 },
      { x: blockedPosition.x, y: blockedPosition.y + 1 },
    ],
    teleports: [],
    healingFountains: [],
  };
}
