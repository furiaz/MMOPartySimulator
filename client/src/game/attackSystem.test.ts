import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createTargetDummy } from "./entities";
import { DEFAULT_COMPANION_ATTACK_RANGE, getCompanionAttackRange } from "./companionCombat";
import { ENEMY_ATTACK_WINDUP_MS, updateAttackSystem } from "./attackSystem";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import type { Enemy, GameEntity, Position } from "./types";

describe("enemy attack leash movement", () => {
  it("keeps default companion basic attack range melee", () => {
    const companion = createIdleCompanion("leader", { x: 0, y: 0 });

    expect(getCompanionAttackRange(companion)).toBe(DEFAULT_COMPANION_ATTACK_RANGE);
    expect(getCompanionAttackRange(companion)).toBe(1);
  });

  it("lets enemies pursue beyond roam leash while inside attack leash", () => {
    const companion = createIdleCompanion("leader", { x: 12, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 7.95, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: companion.id,
      homePosition: { x: 0, y: 0 },
    };

    const nextState = updateAttackSystem(createState([companion, enemy]));
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.position.x).toBeGreaterThan(8);
    expect(nextEnemy.position.x).toBeGreaterThan(8.2);
    expect(nextEnemy.state).toBe("attack");
    expect(nextEnemy.currentTargetId).toBe(companion.id);
  });

  it("stops enemies from chasing targets outside attack leash and attack range", () => {
    const companion = createIdleCompanion("leader", { x: 18, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 15, y: 0 }, "aggressive"),
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

  it("lets slime archetypes fight back after being attacked", () => {
    const companion = {
      ...createIdleCompanion("leader", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "slime",
      maxHealth: 3,
    });

    const nextState = updateAttackSystem(createState([companion, enemy]));
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.health).toBe(enemy.health - 2);
    expect(nextEnemy.state).toBe("attack");
    expect(nextEnemy.currentTargetId).toBe(companion.id);
  });

  it("keeps target dummies alive and non-retaliatory when attacked", () => {
    const companion = {
      ...createIdleCompanion("leader", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: "dummy",
    };
    const dummy = {
      ...createTargetDummy("dummy", { x: 0, y: 0 }),
      health: 2,
    };

    const nextState = updateAttackSystem(createState([companion, dummy]));
    const nextDummy = nextState.entities[dummy.id] as Enemy;

    expect(nextDummy.health).toBe(1);
    expect(nextDummy.state).toBe("idle");
    expect(nextDummy.currentTargetId).toBeNull();
  });

  it("winds up ranged enemy attacks from numeric range without closing to melee", () => {
    const companion = createIdleCompanion("leader", { x: 4, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "goblin_thrower",
      }),
      state: "attack" as const,
      currentTargetId: companion.id,
      lastAttackAt: -1000,
    };

    const windupState = updateAttackSystem(
      createState([companion, enemy]),
      new Set(),
      1000,
    );
    const windupEnemy = windupState.entities[enemy.id] as Enemy;
    const windupCompanion = windupState.entities[companion.id];

    expect(windupEnemy.position).toEqual(enemy.position);
    expect(windupEnemy.attackWindupStartedAt).toBe(1000);
    expect(windupEnemy.attackWindupDurationMs).toBe(ENEMY_ATTACK_WINDUP_MS);
    expect(windupEnemy.attackWindupTargetId).toBe(companion.id);
    expect(windupCompanion).toMatchObject({
      health: companion.health,
    });

    const nextState = updateAttackSystem(
      windupState,
      new Set(),
      1000 + ENEMY_ATTACK_WINDUP_MS,
    );
    const nextEnemy = nextState.entities[enemy.id] as Enemy;
    const nextCompanion = nextState.entities[companion.id];

    expect(nextEnemy.position).toEqual(enemy.position);
    expect(nextEnemy.attackWindupStartedAt).toBeUndefined();
    expect(nextEnemy.attackWindupTargetId).toBeNull();
    expect(nextCompanion).toMatchObject({
      health: companion.health - enemy.attack,
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
