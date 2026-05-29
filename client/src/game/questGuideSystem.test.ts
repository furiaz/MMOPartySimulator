import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import { MAP_TWO_ID, createDebugMap } from "./debugMap";
import { createInitialQuestStates } from "./questSystem";
import { updateQuestGuideSystem } from "./questGuideSystem";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Enemy, GameEntity } from "./types";
import type { QuestId, QuestState } from "./questTypes";

describe("quest guide defense objectives", () => {
  it("spawns one Goblin Scout and one Bog Imp for the Hold the Field Cache wave", () => {
    const leader = createCompanion(
      "leader",
      { x: 100, y: 25 },
      "leader",
    );

    const nextState = updateQuestGuideSystem(
      createMapTwoState([leader], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          hold_the_field_cache: "active",
        }),
      }),
      new Set(),
      {
        nowMs: 1_000,
        deltaMs: 100,
        deltaSeconds: 0.1,
        frameNumber: 1,
      },
    );

    const spawnedEnemies = Object.values(nextState.entities).filter(
      (entity): entity is Enemy =>
        entity.kind === "enemy" &&
        entity.questSpawn?.questId === "hold_the_field_cache" &&
        entity.questSpawn.objectiveId === "defend_old_grove_cache" &&
        entity.state !== "dead",
    );

    expect(spawnedEnemies).toHaveLength(2);
    expect(spawnedEnemies.map((enemy) => enemy.enemyTypeId).sort()).toEqual([
      "bog_imp",
      "goblin_scout",
    ]);
    expect(
      spawnedEnemies.every((enemy) => {
        const questSpawn = enemy.questSpawn;

        return Boolean(
          questSpawn?.targetPosition &&
            questSpawn.targetPosition.x === 100 &&
            questSpawn.targetPosition.y === 25 &&
            questSpawn.suppressNormalDrops,
        );
      }),
    ).toBe(true);
  });
});

function createMapTwoState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      activeTeleport: null,
      exploredTiles: {},
      ...overrides,
    }),
  );
}

function createQuestStates(
  statuses: Partial<Record<QuestId, QuestState["status"]>>,
) {
  const quests = createInitialQuestStates();

  for (const questId of Object.keys(quests) as Array<keyof typeof quests>) {
    quests[questId] = {
      ...quests[questId],
      status: statuses[questId] ?? quests[questId].status,
    };
  }

  return quests;
}
