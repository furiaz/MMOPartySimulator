import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { updateAttackSystem } from "./attackSystem";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import type { Enemy, GameEntity, Position } from "./types";

describe("enemy attack leash movement", () => {
  it("lets enemies pursue beyond roam leash while inside attack leash", () => {
    const companion = createIdleCompanion("leader", { x: 6, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 3.95, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: companion.id,
      homePosition: { x: 0, y: 0 },
    };

    const nextState = updateAttackSystem(createState([companion, enemy]));
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.position.x).toBeGreaterThan(4);
    expect(nextEnemy.state).toBe("attack");
    expect(nextEnemy.currentTargetId).toBe(companion.id);
  });

  it("stops enemies from chasing targets outside attack leash and attack range", () => {
    const companion = createIdleCompanion("leader", { x: 10, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 7, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: companion.id,
      homePosition: { x: 0, y: 0 },
    };

    const nextState = updateAttackSystem(createState([companion, enemy]));
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.position).toEqual(enemy.position);
    expect(nextEnemy.state).toBe("idle");
    expect(nextEnemy.currentTargetId).toBeNull();
  });

  it("lets passive slime archetypes fight back after being attacked", () => {
    const companion = {
      ...createIdleCompanion("leader", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      archetypeId: "slime",
    });

    const nextState = updateAttackSystem(createState([companion, enemy]));
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.health).toBe(enemy.health - 1);
    expect(nextEnemy.state).toBe("attack");
    expect(nextEnemy.currentTargetId).toBe(companion.id);
  });

  it("lets ranged enemy archetypes attack from numeric range without closing to melee", () => {
    const companion = createIdleCompanion("leader", { x: 4, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 0, y: 0 }, undefined, {
        archetypeId: "goblin_thrower",
      }),
      state: "attack" as const,
      currentTargetId: companion.id,
    };

    const nextState = updateAttackSystem(createState([companion, enemy]));
    const nextEnemy = nextState.entities[enemy.id] as Enemy;
    const nextCompanion = nextState.entities[companion.id];

    expect(nextEnemy.position).toEqual(enemy.position);
    expect(nextCompanion).toMatchObject({
      health: companion.health - 1,
    });
  });
});

function createState(entities: GameEntity[]) {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId: "leader",
    }),
  );
}

function createIdleCompanion(id: string, position: Position) {
  return {
    ...createCompanion(id, position, id),
    state: "idle" as const,
    currentTargetId: null,
  };
}
