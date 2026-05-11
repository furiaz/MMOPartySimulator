import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { createDebugMap, MAP_ONE_ID } from "./debugMap";
import { updateExplorationSystem } from "./explorationSystem";
import { createInitialQuestStates } from "./questSystem";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import type { GameEntity } from "./types";
import type { QuestId, QuestStatus } from "./questTypes";

describe("game update intent priority", () => {
  it("keeps active gather quest intent when a reachable enemy exists", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const distantCompanion = {
      ...createCompanion("companion-2", { x: 40, y: 22 }, leader.id),
      state: "idle" as const,
      currentTargetId: null,
    };
    const wood = createResource("quest-wood", { x: 8, y: 4 }, {
      resourceType: "wood",
    });
    const reachableEnemy = createEnemy("nearby-passive-enemy", { x: 6, y: 4 });

    const nextState = updateGame(
      createMapOneState(
        [leader, distantCompanion, wood, reachableEnemy],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            gather_expedition_supplies: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("gather");
    expect(nextState.leaderIntent?.targetId).toBe(wood.id);
  });

  it("sends the party to gather a reached resource POI", () => {
    const leader = createLeader({ x: 5, y: 5 });
    const follower = {
      ...createCompanion("companion-2", { x: 6, y: 5 }, leader.id, "defender"),
      state: "idle" as const,
      currentTargetId: null,
    };
    const wood = createResource("quest-wood", { x: 4, y: 6 }, {
      resourceType: "wood",
    });

    const nextState = updateGame(
      createMapOneState(
        [leader, follower, wood],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            gather_expedition_supplies: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("gather");
    expect(nextState.leaderIntent?.targetId).toBe(wood.id);
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: wood.id,
    });
    expect(nextState.entities[follower.id]).toMatchObject({
      state: "gather",
      currentTargetId: wood.id,
    });
  });

  it("switches to attack intent when an enemy is attacking the party", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const wood = createResource("quest-wood", { x: 8, y: 4 }, {
      resourceType: "wood",
    });
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 5, y: 4 }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };

    const nextState = updateGame(
      createMapOneState(
        [leader, wood, attacker],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            gather_expedition_supplies: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(attacker.id);
  });

  it("still explores unexplored positions without a quest or POI target", () => {
    const leader = createLeader({ x: 3, y: 3 });
    const nextState = updateExplorationSystem(
      createMapOneState(
        [leader],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates(),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("explore");
    expect(nextState.leaderIntent?.targetPosition).not.toBeNull();
  });

  it("keeps combat quest targeting under POI control", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const questEnemy = createEnemy("quest-enemy", { x: 5, y: 4 });

    const nextState = updateGame(
      createMapOneState(
        [leader, questEnemy],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            clear_the_shore: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(questEnemy.id);
  });
});

function createLeader(position: { x: number; y: number }) {
  return {
    ...createCompanion("leader", position, "leader", "fighter", 0),
    state: "idle" as const,
    currentTargetId: null,
  };
}

function createMapOneState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      activeTeleport: null,
      exploredTiles: {},
      ...overrides,
    }),
  );
}

function createQuestStates(
  statuses: Partial<Record<QuestId, QuestStatus>> = {},
) {
  const quests = createInitialQuestStates();

  for (const questId of Object.keys(quests) as QuestId[]) {
    quests[questId] = {
      ...quests[questId],
      status: statuses[questId] ?? "completed",
    };
  }

  return quests;
}
