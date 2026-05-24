import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  ENEMY_RESPAWN_DELAY_MS,
  updateEnemyRespawnSystem,
} from "./enemyRespawnSystem";
import { updateDropSystem } from "./dropSystem";
import { createTestGameState } from "./testState";
import { createDebugMap, MAP_ONE_ID, HUB_MAP_ID } from "./debugMap";
import { countInventoryItem } from "./inventory";

describe("enemy respawn system", () => {
  it("records defeat time without respawning immediately", () => {
    const enemy = {
      ...createEnemy("enemy", { x: 8, y: 7 }),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [enemy.id]: enemy },
    });

    const nextState = updateEnemyRespawnSystem(state, 5000);
    const nextEnemy = nextState.entities[enemy.id];

    expect(nextEnemy).toMatchObject({
      state: "dead",
      health: 0,
      defeatedAtMs: 5000,
    });
  });

  it("does not respawn before ten seconds", () => {
    const enemy = {
      ...createEnemy("enemy", { x: 8, y: 7 }),
      state: "dead" as const,
      health: 0,
      defeatedAtMs: 1000,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [enemy.id]: enemy },
    });

    const nextState = updateEnemyRespawnSystem(
      state,
      1000 + ENEMY_RESPAWN_DELAY_MS - 1,
    );

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "dead",
      health: 0,
      defeatedAtMs: 1000,
    });
  });

  it("respawns a dead enemy after ten seconds using the same id and home position", () => {
    const enemy = {
      ...createEnemy("enemy", { x: 8, y: 7 }, "aggressive", {
        subzoneId: "north-west",
        encounterAreaId: "shore-fringe-den",
      }),
      position: { x: 12, y: 12 },
      state: "dead" as const,
      health: 0,
      currentTargetId: "test-companion",
      defeatedAtMs: 1000,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [enemy.id]: enemy },
      skillMarksByEnemyId: { [enemy.id]: { sourceId: "source", targetId: enemy.id, bonusDamage: 1, expiresAt: 20000 } },
      skillBindsByEnemyId: { [enemy.id]: { sourceId: "source", targetId: enemy.id, expiresAt: 20000 } },
    });

    const nextState = updateEnemyRespawnSystem(
      state,
      1000 + ENEMY_RESPAWN_DELAY_MS,
    );

    expect(nextState.entities[enemy.id]).toMatchObject({
      id: enemy.id,
      state: "idle",
      health: enemy.maxHealth,
      currentTargetId: null,
      position: enemy.homePosition,
      subzoneId: "north-west",
      encounterAreaId: "shore-fringe-den",
    });
    const respawnedEnemy = nextState.entities[enemy.id];
    expect(respawnedEnemy?.kind).toBe("enemy");
    expect(respawnedEnemy?.kind === "enemy" ? respawnedEnemy.defeatedAtMs : null).toBeUndefined();
    expect(nextState.skillMarksByEnemyId?.[enemy.id]).toBeUndefined();
    expect(nextState.skillBindsByEnemyId?.[enemy.id]).toBeUndefined();
  });

  it("does not respawn enemies while on the hub map", () => {
    const enemy = {
      ...createEnemy("enemy", { x: 8, y: 7 }),
      state: "dead" as const,
      health: 0,
      defeatedAtMs: 0,
    };
    const state = createTestGameState({
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(HUB_MAP_ID),
      entities: { [enemy.id]: enemy },
    });

    const nextState = updateEnemyRespawnSystem(state, ENEMY_RESPAWN_DELAY_MS);

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "dead",
      health: 0,
      defeatedAtMs: 0,
    });
  });

  it("does not revive dead companions", () => {
    const companion = {
      ...createCompanion("companion", { x: 8, y: 7 }, "companion"),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [companion.id]: companion },
    });

    const nextState = updateEnemyRespawnSystem(state, ENEMY_RESPAWN_DELAY_MS);

    expect(nextState.entities[companion.id]).toMatchObject({
      state: "dead",
      health: 0,
    });
  });

  it("allows drop processing to observe a dead enemy before respawn", () => {
    const enemy = {
      ...createEnemy("enemy", { x: 8, y: 7 }, undefined, {
        enemyTypeId: "slime",
      }),
      state: "dead" as const,
      health: 0,
      defeatedAtMs: 0,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [enemy.id]: enemy },
      dropVisualEvents: [
        {
          id: "drop-1",
          enemyId: enemy.id,
          enemyTypeId: "slime",
          enemyArchetypeId: "slime",
          itemId: "slime_gel_t1",
          quantity: 1,
          position: enemy.position,
          createdAt: 0,
          expiresAt: 900,
          currentMapId: MAP_ONE_ID,
          tableId: "test",
          dropChance: 1,
        },
      ],
    });

    const afterDrops = updateDropSystem(state, 1000);
    const afterRespawn = updateEnemyRespawnSystem(
      afterDrops,
      ENEMY_RESPAWN_DELAY_MS,
    );

    expect(countInventoryItem(afterRespawn.inventory, "slime_gel_t1")).toBe(1);
    expect(afterRespawn.entities[enemy.id]).toMatchObject({
      state: "idle",
      health: enemy.maxHealth,
    });
  });
});
