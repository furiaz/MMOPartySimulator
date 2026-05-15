import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  createDebugMap,
  HUB_MAP_ID,
  hubHealingFountains,
  MAP_ONE_ID,
} from "./debugMap";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateHealingFountainSystem } from "./healingFountainSystem";
import type { GameEntity } from "./types";

describe("healing fountain system", () => {
  it("heals living party members to max when any living member is in range", () => {
    const fountain = hubHealingFountains[0];
    const leader = {
      ...createCompanion("leader", fountain.position, "leader"),
      health: 4,
    };
    const follower = {
      ...createCompanion("follower", { x: 8, y: 20 }, leader.id),
      health: 2,
    };

    const nextState = updateHealingFountainSystem(
      createHubState([leader, follower], { partyLeaderId: leader.id }),
    );

    expect(nextState.entities[leader.id]).toMatchObject({ health: leader.maxHealth });
    expect(nextState.entities[follower.id]).toMatchObject({ health: follower.maxHealth });
  });

  it("does not heal when all living party members are outside range", () => {
    const leader = {
      ...createCompanion("leader", { x: 7, y: 20 }, "leader"),
      health: 4,
    };
    const follower = {
      ...createCompanion("follower", { x: 8, y: 20 }, leader.id),
      health: 2,
    };

    const nextState = updateHealingFountainSystem(
      createHubState([leader, follower], { partyLeaderId: leader.id }),
    );

    expect(nextState.entities[leader.id]).toMatchObject({ health: 4 });
    expect(nextState.entities[follower.id]).toMatchObject({ health: 2 });
  });

  it("does not revive dead companions", () => {
    const fountain = hubHealingFountains[0];
    const leader = createCompanion("leader", fountain.position, "leader");
    const deadCompanion = {
      ...createCompanion("dead-companion", fountain.position, leader.id),
      state: "dead" as const,
      health: 0,
    };

    const nextState = updateHealingFountainSystem(
      createHubState([leader, deadCompanion], { partyLeaderId: leader.id }),
    );

    expect(nextState.entities[deadCompanion.id]).toMatchObject({
      state: "dead",
      health: 0,
    });
  });

  it("does not heal outside the hub map", () => {
    const fountain = hubHealingFountains[0];
    const leader = {
      ...createCompanion("leader", fountain.position, "leader"),
      health: 4,
    };

    const nextState = updateHealingFountainSystem(
      [leader].reduce(
        addEntity,
        createTestGameState({
          currentMapId: MAP_ONE_ID,
          map: createDebugMap(MAP_ONE_ID),
          partyLeaderId: leader.id,
        }),
      ),
    );

    expect(nextState.entities[leader.id]).toMatchObject({ health: 4 });
  });
});

function createHubState(
  entities: GameEntity[],
  overrides: Partial<GameState> = {},
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(HUB_MAP_ID),
      activeTeleport: null,
      ...overrides,
    }),
  );
}
