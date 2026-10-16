import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  MAP_TWO_ID,
  createDebugMap,
  mapTwoEnemyStartData,
} from "./debugMap";
import { createInitialQuestStates } from "./questSystem";
import {
  QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS,
  updateQuestGuideSystem,
} from "./questGuideSystem";
import { sanitizeQuestAmbientEnemySuppressionsAfterLoad } from "./questAmbientEnemySuppressionSystem";
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

  it("suppresses living and dead normal subzone enemies when Hold the Field Cache starts", () => {
    const leader = createCompanion("leader", { x: 100, y: 25 }, "leader");
    const livingEnemy = createEnemy("living-normal", { x: 99, y: 25 }, undefined, {
      enemyTypeId: "goblin_scout",
      subzoneId: "south-east",
    });
    const deadEnemy: Enemy = {
      ...createEnemy("dead-normal", { x: 101, y: 25 }, undefined, {
        enemyTypeId: "bog_imp",
        subzoneId: "south-east",
      }),
      state: "dead",
      health: 0,
      defeatedAtMs: 1_000,
    };
    const outsideEnemy = createEnemy("outside-normal", { x: 130, y: 25 }, undefined, {
      enemyTypeId: "wolf",
      subzoneId: "north-east",
    });

    const nextState = updateQuestGuideSystem(
      createMapTwoState([leader, livingEnemy, deadEnemy, outsideEnemy], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          hold_the_field_cache: "active",
        }),
      }),
      new Set(),
      createTiming(2_000, 100),
    );

    expect(nextState.entities[livingEnemy.id]).toBeUndefined();
    expect(nextState.entities[deadEnemy.id]).toBeUndefined();
    expect(nextState.entities[outsideEnemy.id]).toBeDefined();
    expect(
      nextState.quests.hold_the_field_cache.runtime
        ?.ambientEnemySuppressionsByGroupId?.defend_old_grove_cache?.enemySnapshots.map(
          (enemy) => enemy.id,
        )
        .sort(),
    ).toEqual(["dead-normal", "living-normal"]);
  });

  it("restores suppressed Hold the Field Cache enemies together after the breathing room", () => {
    const leader = createCompanion("leader", { x: 100, y: 25 }, "leader");
    const enemy = createEnemy("normal-enemy", { x: 99, y: 25 }, undefined, {
      enemyTypeId: "goblin_scout",
      subzoneId: "south-east",
    });
    const startedState = updateQuestGuideSystem(
      createMapTwoState([leader, enemy], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          hold_the_field_cache: "active",
        }),
      }),
      new Set(),
      createTiming(2_000, 12_000),
      () => 0.99,
    );

    expect(startedState.entities[enemy.id]).toBeUndefined();
    expect(
      startedState.quests.hold_the_field_cache.objectiveProgress
        .defend_old_grove_cache.completed,
    ).toBe(true);
    expect(
      Object.values(startedState.entities).some(
        (entity) =>
          entity.kind === "enemy" &&
          entity.questSpawn?.objectiveId === "defend_old_grove_cache",
      ),
    ).toBe(false);

    const beforeRestore = updateQuestGuideSystem(
      startedState,
      new Set(),
      createTiming(
        2_000 + QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS - 1,
        100,
      ),
      () => 0.99,
    );
    expect(beforeRestore.entities[enemy.id]).toBeUndefined();

    const afterRestore = updateQuestGuideSystem(
      beforeRestore,
      new Set(),
      createTiming(
        2_000 + QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS,
        100,
      ),
      () => 0.99,
    );
    const restoredEnemy = afterRestore.entities[enemy.id];

    expect(restoredEnemy).toMatchObject({
      id: enemy.id,
      kind: "enemy",
      state: "idle",
      health: enemy.maxHealth,
      position: enemy.homePosition,
      currentTargetId: null,
      variant: undefined,
    });
    expect(
      afterRestore.quests.hold_the_field_cache.runtime
        ?.ambientEnemySuppressionsByGroupId?.defend_old_grove_cache,
    ).toBeUndefined();
  });

  it("suppresses normal subzone enemies for Open the Causeway defense", () => {
    const leader = createCompanion("leader", { x: 153, y: 29 }, "leader");
    const enemy = createEnemy("causeway-normal", { x: 145, y: 22 }, undefined, {
      enemyTypeId: "wolf",
      subzoneId: "north-east",
    });

    const nextState = updateQuestGuideSystem(
      createMapTwoState([leader, enemy], {
        partyLeaderId: leader.id,
        quests: createQuestStates(
          {
            open_wolf_causeway: "active",
          },
          {
            open_wolf_causeway: ["escort_causeway_worker"],
          },
        ),
      }),
      new Set(),
      createTiming(2_000, 100),
    );

    expect(nextState.entities[enemy.id]).toBeUndefined();
    expect(
      nextState.quests.open_wolf_causeway.runtime
        ?.ambientEnemySuppressionsByGroupId?.defend_wolf_causeway
        ?.enemySnapshots[0]?.id,
    ).toBe(enemy.id);
  });

  it("restores legacy id-only suppressed enemies from authored map starts", () => {
    const legacyEnemyStart = mapTwoEnemyStartData.find(
      (enemyStart) => enemyStart.subzoneId === "south-east",
    );
    expect(legacyEnemyStart).toBeDefined();
    const questState = createQuestStates({
      hold_the_field_cache: "ready_to_turn_in",
    });
    questState.hold_the_field_cache = {
      ...questState.hold_the_field_cache,
      runtime: {
        defenseStartedObjectiveIds: { defend_old_grove_cache: true },
        despawnedSubzoneEnemyIdsByObjectiveId: {
          defend_old_grove_cache: [legacyEnemyStart!.id],
        },
      },
    };
    questState.hold_the_field_cache.objectiveProgress.defend_old_grove_cache = {
      objectiveId: "defend_old_grove_cache",
      currentCount: 1,
      completed: true,
    };

    const loadedState = sanitizeQuestAmbientEnemySuppressionsAfterLoad(
      createMapTwoState([], {
        quests: questState,
      }),
      5_000,
    );
    const scheduledState = updateQuestGuideSystem(
      loadedState,
      new Set(),
      createTiming(5_000, 100),
      () => 0.99,
    );
    expect(scheduledState.entities[legacyEnemyStart!.id]).toBeUndefined();

    const restoredState = updateQuestGuideSystem(
      scheduledState,
      new Set(),
      createTiming(
        5_000 + QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS,
        100,
      ),
      () => 0.99,
    );

    expect(restoredState.entities[legacyEnemyStart!.id]).toMatchObject({
      kind: "enemy",
      id: legacyEnemyStart!.id,
      state: "idle",
      position: legacyEnemyStart!.position,
      subzoneId: "south-east",
    });
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

function createTiming(nowMs: number, deltaMs: number) {
  return {
    nowMs,
    deltaMs,
    deltaSeconds: deltaMs / 1000,
    frameNumber: 1,
  };
}

function createQuestStates(
  statuses: Partial<Record<QuestId, QuestState["status"]>>,
  completedObjectiveIdsByQuestId: Partial<Record<QuestId, string[]>> = {},
) {
  const quests = createInitialQuestStates();

  for (const questId of Object.keys(quests) as Array<keyof typeof quests>) {
    const completedObjectiveIds = completedObjectiveIdsByQuestId[questId] ?? [];
    const objectiveProgress = { ...quests[questId].objectiveProgress };

    for (const objectiveId of completedObjectiveIds) {
      objectiveProgress[objectiveId] = {
        objectiveId,
        currentCount: 1,
        completed: true,
      };
    }

    quests[questId] = {
      ...quests[questId],
      status: statuses[questId] ?? quests[questId].status,
      objectiveProgress,
    };
  }

  return quests;
}
