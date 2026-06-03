import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { updateEnemyAISystem } from "./enemyAISystem";
import { updateEntitySeparationSystem } from "./entitySeparationSystem";
import { getEuclideanDistance } from "./positionUtils";
import { createTestGameState } from "./testState";
import type { Enemy, GameEntity, GameMap, Position } from "./types";

const OPEN_MAP: GameMap = {
  displayName: "Open Test Map",
  debugName: "open-test-map",
  columns: 20,
  rows: 20,
  walls: [],
  teleports: [],
  healingFountains: [],
};

describe("stationary overlap separation", () => {
  it("does not separate a moving companion from a stationary normal enemy", () => {
    const companion = createCompanion("companion", { x: 5, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 });
    const state = createState([companion, enemy]);
    const nextState = updateEntitySeparationSystem(
      state,
      new Set([companion.id]),
    );

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[enemy.id].position).toEqual(enemy.position);
  });

  it("separates a stationary companion and stationary normal enemy", () => {
    const companion = createCompanion("companion", { x: 5, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 });
    const state = createState([companion, enemy]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).not.toEqual(
      companion.position,
    );
    expect(nextState.entities[enemy.id].position).not.toEqual(enemy.position);
    expect(
      getEuclideanDistance(
        nextState.entities[companion.id].position,
        nextState.entities[enemy.id].position,
      ),
    ).toBeGreaterThan(0);
  });

  it("does not separate a normal companion standing at a small enemy attack edge", () => {
    const companion = createCompanion(
      "companion",
      { x: 6.7, y: 5 },
      "companion",
      "fighter",
      1,
      "blade",
    );
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, undefined, {
      enemyTypeId: "slime",
    });
    const state = createState([companion, enemy]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[enemy.id].position).toEqual(enemy.position);
  });

  it("does not separate a Beginner companion standing at a small enemy attack edge", () => {
    const companion = createCompanion("companion", { x: 6.7, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, undefined, {
      enemyTypeId: "slime",
    });
    const state = createState([companion, enemy]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[enemy.id].position).toEqual(enemy.position);
  });

  it("pushes a companion that is clearly inside a small enemy body", () => {
    const companion = createCompanion("companion", { x: 5.5, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, undefined, {
      enemyTypeId: "slime",
    });
    const state = createState([companion, enemy]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).not.toEqual(
      companion.position,
    );
    expect(nextState.entities[enemy.id].position).toEqual(enemy.position);
  });

  it("does not separate a stationary companion from a moving normal enemy", () => {
    const companion = createCompanion("companion", { x: 5, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 });
    const state = createState([companion, enemy]);
    const nextState = updateEntitySeparationSystem(state, new Set([enemy.id]));

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[enemy.id].position).toEqual(enemy.position);
  });

  it("does not separate a fleeing moving companion from a stationary normal enemy", () => {
    const companion = createCompanion("companion", { x: 5.3, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 });
    const state = createState([companion, enemy], {
      moveIntentsByEntityId: {
        [companion.id]: { x: 6, y: 5 },
      },
    });
    const nextState = updateEntitySeparationSystem(
      state,
      new Set([companion.id]),
    );

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[enemy.id].position).toEqual(enemy.position);
  });

  it("does not separate a moving companion from a moving normal enemy", () => {
    const companion = createCompanion("companion", { x: 5, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 });
    const state = createState([companion, enemy]);
    const nextState = updateEntitySeparationSystem(
      state,
      new Set([companion.id, enemy.id]),
    );

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[enemy.id].position).toEqual(enemy.position);
  });

  it("pushes only the companion out of a stationary boss-like enemy", () => {
    const companion = createCompanion("companion", { x: 6, y: 5 }, "companion");
    const boss = createEnemy("boss", { x: 5, y: 5 }, "aggressive", {
      combatBodyRadius: 2,
    });
    const state = createState([companion, boss]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).not.toEqual(
      companion.position,
    );
    expect(nextState.entities[boss.id].position).toEqual(boss.position);
  });

  it("does not separate a companion standing at Azure Mass attack edge", () => {
    const companion = createCompanion("companion", { x: 8.5, y: 5 }, "companion");
    const boss = createEnemy("boss", { x: 5, y: 5 }, undefined, {
      enemyTypeId: "azure_mass",
    });
    const state = createState([companion, boss]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[boss.id].position).toEqual(boss.position);
  });

  it("does not separate a stationary companion from a moving boss-like enemy", () => {
    const companion = createCompanion("companion", { x: 6, y: 5 }, "companion");
    const boss = createEnemy("boss", { x: 5, y: 5 }, "aggressive", {
      combatBodyRadius: 2,
    });
    const state = createState([companion, boss]);
    const nextState = updateEntitySeparationSystem(state, new Set([boss.id]));

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[boss.id].position).toEqual(boss.position);
  });

  it("pushes only the companion out of a stationary NPC", () => {
    const companion = createCompanion("companion", { x: 5, y: 5 }, "companion");
    const npc = createNpc("npc", { x: 5, y: 5 }, "Quest Giver", "quest_giver");
    const state = createState([companion, npc]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).not.toEqual(
      companion.position,
    );
    expect(nextState.entities[npc.id].position).toEqual(npc.position);
  });

  it("does not separate a stationary companion from a moving NPC", () => {
    const companion = createCompanion("companion", { x: 5, y: 5 }, "companion");
    const npc = createNpc("npc", { x: 5, y: 5 }, "Quest Giver", "quest_giver");
    const state = createState([companion, npc]);
    const nextState = updateEntitySeparationSystem(state, new Set([npc.id]));

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[npc.id].position).toEqual(npc.position);
  });

  it("rejects separation into walls", () => {
    const companion = createCompanion("companion", { x: 1.55, y: 1 }, "companion");
    const enemy = createEnemy("enemy", { x: 1.45, y: 1 });
    const state = createState([companion, enemy], {
      map: {
        ...OPEN_MAP,
        walls: [{ x: 2, y: 1 }],
      },
    });
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
  });

  it("rejects separation into active resources", () => {
    const companion = createCompanion("companion", { x: 5.55, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5.45, y: 5 });
    const resource = createResource("resource", { x: 5.67, y: 5 });
    const state = createState([companion, enemy, resource]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
  });

  it("rejects separation into third-party entity overlap", () => {
    const companion = createCompanion("companion", { x: 5.55, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5.45, y: 5 });
    const blocker = createCompanion("blocker", { x: 5.67, y: 5 }, "companion");
    const state = createState([companion, enemy, blocker]);
    const nextState = updateEntitySeparationSystem(
      state,
      new Set([blocker.id]),
    );

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
  });

  it("rejects separation into reserved positions", () => {
    const companion = createCompanion("companion", { x: 5.55, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5.45, y: 5 });
    const state = createState([companion, enemy], {
      reservedPositionsByEntityId: {
        other: { x: 5.67, y: 5 },
      },
    });
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
  });

  it("ignores dead entities and resources as separation participants", () => {
    const companion = createCompanion("companion", { x: 5, y: 5 }, "companion");
    const deadEnemy: Enemy = {
      ...createEnemy("dead-enemy", { x: 5, y: 5 }),
      state: "dead",
      health: 0,
    };
    const resource = createResource("resource", { x: 5, y: 5 });
    const state = createState([companion, deadEnemy, resource]);
    const nextState = updateEntitySeparationSystem(state, new Set());

    expect(nextState.entities[companion.id].position).toEqual(companion.position);
    expect(nextState.entities[deadEnemy.id].position).toEqual(deadEnemy.position);
    expect(nextState.entities[resource.id].position).toEqual(resource.position);
  });

  it("marks enemy AI movement so moving enemies do not trigger separation", () => {
    const enemy: Enemy = {
      ...createEnemy("enemy", { x: 5, y: 5 }, "passive"),
      roamTargetPosition: { x: 8, y: 5 },
      roamMoveUntil: 1_000,
    };
    const state = createState([enemy]);
    const movedEntityIds = new Set<string>();

    updateEnemyAISystem(
      state,
      {
        nowMs: 100,
        deltaMs: 100,
        deltaSeconds: 0.1,
        frameNumber: 1,
      },
      movedEntityIds,
    );

    expect(movedEntityIds.has(enemy.id)).toBe(true);
  });
});

function createState(
  entities: GameEntity[],
  overrides: Partial<ReturnType<typeof createTestGameState>> = {},
) {
  return createTestGameState({
    map: OPEN_MAP,
    entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
    followTrailsByEntityId: Object.fromEntries(
      entities.map((entity) => [entity.id, [] as Position[]]),
    ),
    partyLeaderId: entities.find((entity) => entity.kind === "companion")?.id ?? "",
    ...overrides,
  });
}
