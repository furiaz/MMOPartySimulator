import { describe, expect, it } from "vitest";
import {
  MAP_SIX_ID,
  MAP_TWO_ID,
  createDebugMap,
  createDebugMapForQuestState,
} from "./debugMap";
import { createEnemy, createTargetDummy } from "./entities";
import {
  beginQuestAmbientEnemySuppression,
  releaseQuestAmbientEnemySuppression,
  sanitizeQuestAmbientEnemySuppressionsAfterLoad,
  updateQuestAmbientEnemySuppressionSystem,
} from "./questAmbientEnemySuppressionSystem";
import {
  NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID,
  createInitialQuestStates,
} from "./questSystem";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Enemy, GameEntity } from "./types";

describe("quest ambient enemy suppression", () => {
  it("suppresses every ambient enemy on a configured map while preserving quest entities", () => {
    const livingEnemy = createEnemy("living", { x: 20, y: 20 }, undefined, {
      enemyTypeId: "night_bat",
      subzoneId: "nightmire-canopy",
    });
    const deadSuperior: Enemy = {
      ...createEnemy("dead-superior", { x: 40, y: 20 }, undefined, {
        enemyTypeId: "cinder_wisp",
        subzoneId: "another-subzone",
        variant: "superior",
      }),
      state: "dead",
      health: 0,
      defeatedAtMs: 500,
    };
    const targetDummy = createTargetDummy("dummy", { x: 50, y: 20 });
    const questDefender = createEnemy(
      "quest-defender",
      { x: 60, y: 20 },
      "aggressive",
      {
        enemyTypeId: "night_bat",
        questSpawn: {
          questId: "the_patrons_shadow",
          objectiveId: "break_night_bat_ward",
        },
      },
    );
    let state = createNightmireState([
      livingEnemy,
      deadSuperior,
      targetDummy,
      questDefender,
    ]);

    state = beginQuestAmbientEnemySuppression(
      state,
      "the_patrons_shadow",
      "break_night_bat_ward",
    );

    expect(state.entities[livingEnemy.id]).toBeUndefined();
    expect(state.entities[deadSuperior.id]).toBeUndefined();
    expect(state.entities[targetDummy.id]).toBeDefined();
    expect(state.entities[questDefender.id]).toBeDefined();
    expect(
      state.quests.the_patrons_shadow.runtime
        ?.ambientEnemySuppressionsByGroupId?.[
        NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID
      ]?.enemySnapshots.map((enemy) => enemy.id),
    ).toEqual(["dead-superior", "living"]);

    const introducedEnemy = createEnemy(
      "introduced",
      { x: 70, y: 20 },
      undefined,
      { enemyTypeId: "elder_mossling" },
    );
    state = addEntity(state, introducedEnemy);
    state = updateQuestAmbientEnemySuppressionSystem(state, 1_000);

    expect(state.entities[introducedEnemy.id]).toBeUndefined();
  });

  it("restores preserved map enemies exactly at the configured delay", () => {
    const enemy: Enemy = {
      ...createEnemy("a-superior", { x: 20, y: 20 }, "aggressive", {
        enemyTypeId: "night_bat",
        subzoneId: "nightmire-canopy",
        encounterAreaId: "nightmire-bat-hollow",
        variant: "superior",
      }),
      health: 1,
      state: "attack",
    };
    const overlappingEnemy = createEnemy(
      "z-overlapping",
      enemy.homePosition,
      undefined,
      { enemyTypeId: "elder_mossling" },
    );
    let state = createNightmireState([enemy, overlappingEnemy]);
    state = beginQuestAmbientEnemySuppression(
      state,
      "the_patrons_shadow",
      "break_night_bat_ward",
    );
    state = releaseQuestAmbientEnemySuppression(
      state,
      "the_patrons_shadow",
      "break_night_bat_ward",
      1_000,
    );

    state = updateQuestAmbientEnemySuppressionSystem(state, 2_999);
    expect(state.entities[enemy.id]).toBeUndefined();

    state = updateQuestAmbientEnemySuppressionSystem(state, 3_000);
    expect(state.entities[enemy.id]).toMatchObject({
      id: enemy.id,
      kind: "enemy",
      state: "idle",
      health: enemy.maxHealth,
      maxHealth: enemy.maxHealth,
      variant: "superior",
      aggressionMode: "aggressive",
      subzoneId: "nightmire-canopy",
      encounterAreaId: "nightmire-bat-hollow",
      homePosition: enemy.homePosition,
    });
    expect(state.entities[overlappingEnemy.id]?.position).not.toEqual(
      overlappingEnemy.homePosition,
    );
    expect(
      state.quests.the_patrons_shadow.runtime
        ?.ambientEnemySuppressionsByGroupId?.[
        NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID
      ],
    ).toBeUndefined();
  });

  it("cancels a grouped restoration when another owner starts", () => {
    const enemy = createEnemy("ambient", { x: 20, y: 20 }, undefined, {
      enemyTypeId: "night_bat",
    });
    let state = createNightmireState([enemy]);
    state = beginQuestAmbientEnemySuppression(
      state,
      "the_patrons_shadow",
      "break_night_bat_ward",
    );
    state = releaseQuestAmbientEnemySuppression(
      state,
      "the_patrons_shadow",
      "break_night_bat_ward",
      1_000,
    );
    state = beginQuestAmbientEnemySuppression(
      state,
      "the_patrons_shadow",
      "break_elder_mossling_ward",
    );

    state = updateQuestAmbientEnemySuppressionSystem(state, 3_000);
    expect(state.entities[enemy.id]).toBeUndefined();

    state = releaseQuestAmbientEnemySuppression(
      state,
      "the_patrons_shadow",
      "break_elder_mossling_ward",
      2_500,
    );
    state = updateQuestAmbientEnemySuppressionSystem(state, 4_499);
    expect(state.entities[enemy.id]).toBeUndefined();
    state = updateQuestAmbientEnemySuppressionSystem(state, 4_500);
    expect(state.entities[enemy.id]).toBeDefined();
  });

  it("uses subzone scope and rerolls variants for existing defense quests", () => {
    const inside = createEnemy("inside", { x: 100, y: 25 }, undefined, {
      enemyTypeId: "goblin_scout",
      subzoneId: "south-east",
      variant: "superior",
    });
    const outside = createEnemy("outside", { x: 130, y: 25 }, undefined, {
      enemyTypeId: "wolf",
      subzoneId: "north-east",
    });
    let state = createMapTwoState([inside, outside]);
    state = beginQuestAmbientEnemySuppression(
      state,
      "hold_the_field_cache",
      "defend_old_grove_cache",
    );

    expect(state.entities[inside.id]).toBeUndefined();
    expect(state.entities[outside.id]).toBeDefined();

    state = releaseQuestAmbientEnemySuppression(
      state,
      "hold_the_field_cache",
      "defend_old_grove_cache",
      1_000,
    );
    state = updateQuestAmbientEnemySuppressionSystem(state, 3_999, () => 0.99);
    expect(state.entities[inside.id]).toBeUndefined();
    state = updateQuestAmbientEnemySuppressionSystem(state, 4_000, () => 0.99);
    expect(state.entities[inside.id]).toMatchObject({
      state: "idle",
      variant: undefined,
      health: expect.any(Number),
    });
  });

  it("restores recoverable snapshots and clears malformed saved sessions", () => {
    const enemy = createEnemy("recoverable", { x: 20, y: 20 }, undefined, {
      enemyTypeId: "night_bat",
    });
    const quests = createInitialQuestStates();
    quests.the_patrons_shadow = {
      ...quests.the_patrons_shadow,
      runtime: {
        ambientEnemySuppressionsByGroupId: {
          [NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID]: {
            targetMapId: MAP_SIX_ID,
            scope: "invalid",
            restoreDelayMs: Number.NaN,
            variantPolicy: "preserve",
            activeObjectiveIds: [],
            enemySnapshots: [enemy],
          } as never,
        },
      },
    };
    const state = createTestGameState({
      currentMapId: MAP_SIX_ID,
      map: createDebugMapForQuestState(MAP_SIX_ID, quests),
      quests,
      entities: {},
      followTrailsByEntityId: {},
    });

    const restored = sanitizeQuestAmbientEnemySuppressionsAfterLoad(
      state,
      5_000,
    );

    expect(restored.entities[enemy.id]).toMatchObject({
      state: "idle",
      health: enemy.maxHealth,
    });
    expect(
      restored.quests.the_patrons_shadow.runtime
        ?.ambientEnemySuppressionsByGroupId,
    ).toEqual({});
  });

  it("restores and clears an orphaned active owner during save sanitation", () => {
    const enemy = createEnemy("orphaned", { x: 20, y: 20 }, undefined, {
      enemyTypeId: "night_bat",
    });
    const quests = createInitialQuestStates();
    quests.the_patrons_shadow = {
      ...quests.the_patrons_shadow,
      runtime: {
        ambientEnemySuppressionsByGroupId: {
          [NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID]: {
            targetMapId: MAP_SIX_ID,
            scope: "map",
            restoreDelayMs: 2_000,
            variantPolicy: "preserve",
            activeObjectiveIds: ["break_night_bat_ward"],
            enemySnapshots: [enemy],
          },
        },
      },
    };
    const state = createTestGameState({
      currentMapId: MAP_SIX_ID,
      map: createDebugMapForQuestState(MAP_SIX_ID, quests),
      quests,
      entities: {},
      followTrailsByEntityId: {},
    });

    const restored = sanitizeQuestAmbientEnemySuppressionsAfterLoad(
      state,
      5_000,
    );

    expect(restored.entities[enemy.id]).toBeDefined();
    expect(
      restored.quests.the_patrons_shadow.runtime
        ?.ambientEnemySuppressionsByGroupId,
    ).toEqual({});
  });
});

function createNightmireState(entities: GameEntity[]): GameState {
  const quests = createInitialQuestStates();

  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: MAP_SIX_ID,
      map: createDebugMapForQuestState(MAP_SIX_ID, quests),
      quests,
      entities: {},
      followTrailsByEntityId: {},
    }),
  );
}

function createMapTwoState(entities: GameEntity[]): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      quests: createInitialQuestStates(),
      entities: {},
      followTrailsByEntityId: {},
    }),
  );
}
