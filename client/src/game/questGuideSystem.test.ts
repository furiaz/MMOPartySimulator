import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc } from "./entities";
import {
  MAP_TWO_ID,
  createDebugMap,
  mapTwoEnemyStartData,
} from "./debugMap";
import {
  createInitialQuestStates,
  recordEnemyDefeatedForQuests,
} from "./questSystem";
import {
  createActiveQuestGuideNpc,
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
        ?.ambientEnemySuppressionsByGroupId?.["wolf-causeway-encounter"]
        ?.enemySnapshots[0]?.id,
    ).toBe(enemy.id);
  });

  it("starts the Causeway defense with one wave and a one-shot Worker speech cue", () => {
    const leader = createCompanion("leader", { x: 153, y: 29 }, "leader");
    const worker = createNpc(
      "map-2-causeway-worker",
      { x: 153, y: 29 },
      "Causeway Worker",
      "quest_guide",
    );
    const startState = createMapTwoState([leader, worker], {
      partyLeaderId: leader.id,
      quests: createQuestStates(
        { open_wolf_causeway: "active" },
        { open_wolf_causeway: ["escort_causeway_worker"] },
      ),
    });
    expect(createActiveQuestGuideNpc(startState, MAP_TWO_ID)).toMatchObject({
      id: worker.id,
      displayName: "Causeway Worker",
      position: { x: 153, y: 29 },
    });

    const startedState = updateQuestGuideSystem(
      startState,
      new Set(),
      createTiming(2_000, 100),
    );
    const cue = startedState.questNpcSpeechCue;
    const countDefenseEnemies = (state: GameState) =>
      Object.values(state.entities).filter(
        (entity) =>
          entity.kind === "enemy" &&
          entity.questSpawn?.questId === "open_wolf_causeway" &&
          entity.questSpawn.objectiveId === "defend_wolf_causeway",
      ).length;

    expect(cue).toMatchObject({
      mapId: MAP_TWO_ID,
      npcId: worker.id,
      text: "Its an ambush! Protect me!",
      createdAt: 2_000,
    });
    expect(countDefenseEnemies(startedState)).toBe(3);

    const halfwayState = updateQuestGuideSystem(
      startedState,
      new Set(),
      createTiming(7_100, 5_000),
    );
    const afterRepairProgress = updateQuestGuideSystem(
      halfwayState,
      new Set(),
      createTiming(7_200, 100),
    );

    expect(countDefenseEnemies(afterRepairProgress)).toBe(3);
    expect(afterRepairProgress.questNpcSpeechCue).toBe(cue);
    expect(
      afterRepairProgress.quests.open_wolf_causeway.runtime
        ?.repairProgressMsByObjectiveId?.defend_wolf_causeway,
    ).toBe(5_200);
  });

  it("keeps the Causeway suppressed through repair and the tracked Superior Wolf", () => {
    const leader = createCompanion("leader", { x: 153, y: 29 }, "leader");
    const ambient = createEnemy("causeway-ambient", { x: 143, y: 24 }, undefined, {
      enemyTypeId: "wolf",
      subzoneId: "north-east",
    });
    const startedState = updateQuestGuideSystem(
      createMapTwoState([leader, ambient], {
        partyLeaderId: leader.id,
        quests: createQuestStates(
          { open_wolf_causeway: "active" },
          { open_wolf_causeway: ["escort_causeway_worker"] },
        ),
      }),
      new Set(),
      createTiming(2_000, 0),
    );
    const defenderIds =
      startedState.quests.open_wolf_causeway.runtime
        ?.questSpawnedEnemyIdsByObjectiveId?.defend_wolf_causeway ?? [];

    expect(defenderIds).toHaveLength(3);
    expect(startedState.entities[ambient.id]).toBeUndefined();

    const repairedState = updateQuestGuideSystem(
      startedState,
      new Set(),
      createTiming(12_000, 10_000),
    );
    expect(
      repairedState.quests.open_wolf_causeway.runtime
        ?.repairProgressMsByObjectiveId?.defend_wolf_causeway,
    ).toBe(10_000);
    expect(
      repairedState.quests.open_wolf_causeway.objectiveProgress
        .defend_wolf_causeway.completed,
    ).toBe(false);
    expect(
      repairedState.entities[
        "quest-open_wolf_causeway-defeat_causeway_elite-target"
      ],
    ).toBeUndefined();

    const defeatedDefendersState = {
      ...repairedState,
      entities: Object.fromEntries(
        Object.entries(repairedState.entities).map(([id, entity]) => [
          id,
          defenderIds.includes(id) && entity.kind === "enemy"
            ? { ...entity, state: "dead" as const, health: 0 }
            : entity,
        ]),
      ),
    };
    const repairCompleteState = updateQuestGuideSystem(
      defeatedDefendersState,
      new Set(),
      createTiming(12_100, 100),
    );
    const wolfId =
      "quest-open_wolf_causeway-defeat_causeway_elite-target";
    const wolfStepState = updateQuestGuideSystem(
      repairCompleteState,
      new Set(),
      createTiming(12_101, 1),
    );
    const runtime =
      wolfStepState.quests.open_wolf_causeway.runtime
        ?.ambientEnemySuppressionsByGroupId?.["wolf-causeway-encounter"];

    expect(
      wolfStepState.quests.open_wolf_causeway.objectiveProgress
        .defend_wolf_causeway.completed,
    ).toBe(true);
    expect(wolfStepState.entities[wolfId]).toMatchObject({
      kind: "enemy",
      enemyTypeId: "wolf",
      variant: "superior",
      encounterBand: "standard",
    });
    expect(runtime?.activeObjectiveIds).toEqual(["defeat_causeway_elite"]);
    expect(runtime?.restoreAtMs).toBeUndefined();
    expect(wolfStepState.entities[ambient.id]).toBeUndefined();

    const trackedWolf = wolfStepState.entities[wolfId];
    if (trackedWolf?.kind !== "enemy") {
      throw new Error("Expected the tracked Superior Wolf to be spawned");
    }
    const killedWolf = { ...trackedWolf, state: "dead" as const, health: 0 };
    let wolfDefeatedState = recordEnemyDefeatedForQuests(
      {
        ...wolfStepState,
        entities: { ...wolfStepState.entities, [wolfId]: killedWolf },
      },
      killedWolf,
      MAP_TWO_ID,
      Math.random,
      12_200,
    );
    wolfDefeatedState = recordEnemyDefeatedForQuests(
      wolfDefeatedState,
      killedWolf,
      MAP_TWO_ID,
      Math.random,
      12_201,
    );

    expect(
      wolfDefeatedState.quests.open_wolf_causeway.objectiveProgress
        .defeat_causeway_elite,
    ).toMatchObject({ currentCount: 1, completed: true });

    const releasedState = updateQuestGuideSystem(
      wolfDefeatedState,
      new Set(),
      createTiming(12_202, 1),
    );
    expect(
      releasedState.quests.open_wolf_causeway.runtime
        ?.ambientEnemySuppressionsByGroupId?.["wolf-causeway-encounter"]
        ?.restoreAtMs,
    ).toBe(15_202);

    const beforeRestore = updateQuestGuideSystem(
      releasedState,
      new Set(),
      createTiming(15_201, 1),
    );
    expect(beforeRestore.entities[ambient.id]).toBeUndefined();

    const afterRestore = updateQuestGuideSystem(
      beforeRestore,
      new Set(),
      createTiming(15_202, 1),
      () => 0.99,
    );
    expect(afterRestore.entities[ambient.id]).toBeDefined();
    expect(
      afterRestore.quests.open_wolf_causeway.runtime
        ?.ambientEnemySuppressionsByGroupId?.["wolf-causeway-encounter"],
    ).toBeUndefined();
  });

  it("does not finish the Causeway defense when defenders die before repair finishes", () => {
    const leader = createCompanion("leader", { x: 153, y: 29 }, "leader");
    const startedState = updateQuestGuideSystem(
      createMapTwoState([leader], {
        partyLeaderId: leader.id,
        quests: createQuestStates(
          { open_wolf_causeway: "active" },
          { open_wolf_causeway: ["escort_causeway_worker"] },
        ),
      }),
      new Set(),
      createTiming(2_000, 0),
    );
    const defenderIds =
      startedState.quests.open_wolf_causeway.runtime
        ?.questSpawnedEnemyIdsByObjectiveId?.defend_wolf_causeway ?? [];
    const defeatedState = {
      ...startedState,
      entities: Object.fromEntries(
        Object.entries(startedState.entities).map(([id, entity]) => [
          id,
          defenderIds.includes(id) && entity.kind === "enemy"
            ? { ...entity, state: "dead" as const, health: 0 }
            : entity,
        ]),
      ),
    };

    const waitingState = updateQuestGuideSystem(
      defeatedState,
      new Set(),
      createTiming(2_100, 100),
    );
    expect(
      waitingState.quests.open_wolf_causeway.objectiveProgress
        .defend_wolf_causeway.completed,
    ).toBe(false);
    expect(
      waitingState.quests.open_wolf_causeway.runtime
        ?.repairProgressMsByObjectiveId?.defend_wolf_causeway,
    ).toBe(100);

    const repairCompleteState = updateQuestGuideSystem(
      waitingState,
      new Set(),
      createTiming(12_100, 10_000),
    );
    expect(
      repairCompleteState.quests.open_wolf_causeway.objectiveProgress
        .defend_wolf_causeway.completed,
    ).toBe(true);
    const finishedState = updateQuestGuideSystem(
      repairCompleteState,
      new Set(),
      createTiming(12_101, 1),
    );
    expect(
      finishedState.entities[
        "quest-open_wolf_causeway-defeat_causeway_elite-target"
      ],
    ).toBeDefined();
  });

  it("recreates a legacy Causeway Elite as the configured tracked Superior Wolf", () => {
    const legacyId =
      "quest-open_wolf_causeway-defeat_causeway_elite-elite";
    const legacyElite = createEnemy(
      legacyId,
      { x: 148, y: 25 },
      "aggressive",
      {
        enemyTypeId: "wolf",
        level: 8,
        encounterBand: "elite",
        questSpawn: {
          questId: "open_wolf_causeway",
          objectiveId: "defeat_causeway_elite",
          targetPosition: { x: 145, y: 22 },
          isElite: true,
          suppressNormalDrops: true,
        },
      },
    );
    const baseState = createMapTwoState([legacyElite], {
      quests: createQuestStates(
        { open_wolf_causeway: "active" },
        {
          open_wolf_causeway: [
            "escort_causeway_worker",
            "defend_wolf_causeway",
          ],
        },
      ),
    });
    const quest = baseState.quests.open_wolf_causeway;
    const state = {
      ...baseState,
      quests: {
        ...baseState.quests,
        open_wolf_causeway: {
          ...quest,
          runtime: {
            questSpawnedEnemyIdsByObjectiveId: {
              defeat_causeway_elite: [legacyId],
            },
          },
        },
      },
    };

    const nextState = updateQuestGuideSystem(
      state,
      new Set(),
      createTiming(5_000, 100),
    );
    const target = nextState.entities[legacyId];

    expect(target).toMatchObject({
      kind: "enemy",
      enemyTypeId: "wolf",
      level: 8,
      variant: "superior",
      encounterBand: "standard",
      aggressionMode: "aggressive",
      position: { x: 145, y: 22 },
      questSpawn: {
        questId: "open_wolf_causeway",
        objectiveId: "defeat_causeway_elite",
        targetPosition: { x: 145, y: 22 },
      },
    });
    expect(target?.kind === "enemy" && target.questSpawn?.isElite).toBeFalsy();
    expect(
      target?.kind === "enemy" && target.questSpawn?.suppressNormalDrops,
    ).toBeFalsy();
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
