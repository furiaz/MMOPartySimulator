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
      lastAttackAt: -2000,
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

  it("lets companions attack Azure Mass from its combat body edge", () => {
    const companion = {
      ...createAttackingCompanion("attacker", { x: 3.5, y: 0 }, 0),
      lastAttackAt: -2000,
    };
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "azure_mass",
      maxHealth: 50,
    });
    const nextState = updateAttackSystem(
      createState([companion, enemy]),
      new Set(),
      1000,
    );
    const nextEnemy = nextState.entities[enemy.id] as Enemy;
    const nextCompanion = nextState.entities[companion.id];

    expect(nextEnemy.health).toBeLessThan(enemy.health);
    expect(nextCompanion.position).toEqual(companion.position);
  });

  it("lets Azure Mass attack from its combat body edge", () => {
    const companion = createIdleCompanion("leader", { x: 4.5, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "azure_mass",
      }),
      state: "attack" as const,
      currentTargetId: companion.id,
      lastAttackAt: -2000,
    };

    const windupState = updateAttackSystem(
      createState([companion, enemy]),
      new Set(),
      1000,
    );
    const windupEnemy = windupState.entities[enemy.id] as Enemy;

    expect(windupEnemy.position).toEqual(enemy.position);
    expect(windupEnemy.attackWindupStartedAt).toBe(1000);

    const nextState = updateAttackSystem(
      windupState,
      new Set(),
      1000 + ENEMY_ATTACK_WINDUP_MS,
    );
    const nextEnemy = nextState.entities[enemy.id] as Enemy;
    const nextCompanion = nextState.entities[companion.id];

    expect(nextEnemy.position).toEqual(enemy.position);
    expect(nextCompanion).toMatchObject({
      health: companion.health - enemy.attack,
    });
  });

  it("keeps normal enemy melee range center-to-center without body spacing", () => {
    const companion = {
      ...createAttackingCompanion("attacker", { x: 1.2, y: 0 }, 0),
      lastAttackAt: -2000,
    };
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "slime",
      maxHealth: 50,
    });

    const nextState = updateAttackSystem(
      createState([companion, enemy]),
      new Set(),
      1000,
    );
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.health).toBe(enemy.health);
  });

  it("prevents Heavy Slimes from using a basic attack", () => {
    const companion = createIdleCompanion("leader", { x: 1, y: 0 });
    const enemy = {
      ...createEnemy("heavy-slime", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "slimeward_heavy_slime",
      }),
      state: "attack" as const,
      currentTargetId: companion.id,
      lastAttackAt: -5000,
    };

    const nextState = updateAttackSystem(
      createState([companion, enemy]),
      new Set(),
      1000,
    );
    const nextEnemy = nextState.entities[enemy.id] as Enemy;
    const nextCompanion = nextState.entities[companion.id];

    expect(nextCompanion).toMatchObject({ health: companion.health });
    expect(nextEnemy.attackWindupStartedAt).toBeUndefined();
    expect(nextEnemy.state).toBe("attack");
    expect(nextEnemy.currentTargetId).toBe(companion.id);
  });

  it("moves attacking companions toward distinct combat positions around the same target", () => {
    const first = createAttackingCompanion("first", { x: 3, y: 5 }, 0);
    const second = createAttackingCompanion("second", { x: 3, y: 5.2 }, 1);
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, undefined, {
      maxHealth: 50,
    });
    let state = createState([first, second, enemy]);

    for (let tick = 0; tick < 3; tick += 1) {
      state = updateAttackSystem(
        {
          ...state,
          simulationDeltaMs: 100,
          simulationTimeMs: tick * 100,
        },
        new Set(),
        1000 + tick * 100,
      );
    }

    const movedFirst = state.entities[first.id];
    const movedSecond = state.entities[second.id];
    const distance = Math.hypot(
      movedFirst.position.x - movedSecond.position.x,
      movedFirst.position.y - movedSecond.position.y,
    );

    expect(distance).toBeGreaterThanOrEqual(0.7);
  });

  it("repositions an in-range stacked companion before attacking when a spaced slot exists", () => {
    const attacker = createAttackingCompanion("attacker", { x: 4, y: 5 }, 0);
    const blocker = createIdleCompanion("blocker", { x: 4.2, y: 5 });
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, undefined, {
      maxHealth: 10,
    });
    const state = createState([attacker, blocker, enemy]);

    const nextState = updateAttackSystem(state, new Set(), 2000);
    const movedAttacker = nextState.entities[attacker.id];
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.health).toBe(enemy.health);
    expect(movedAttacker.position).not.toEqual(attacker.position);
  });

  it("places attack slots outside Azure Mass combat body spacing", () => {
    const attacker = createAttackingCompanion("attacker", { x: 1.4, y: 5 }, 0);
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, undefined, {
      enemyTypeId: "azure_mass",
      maxHealth: 50,
    });
    const state = createState([attacker, enemy]);

    const nextState = updateAttackSystem(state, new Set(), 2000);
    const cachedSlot = nextState.attackSlotCacheByEntityId?.[attacker.id];

    expect(cachedSlot?.attackRange).toBe(3.5);
    expect(cachedSlot?.attackSlot).toEqual({ x: 1.5, y: 5 });
  });

  it("still attacks from an unspaced position when no spaced combat slot exists", () => {
    const attacker = createAttackingCompanion("attacker", { x: 4, y: 5 }, 0);
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, undefined, {
      maxHealth: 20,
    });
    const state = createState([
      attacker,
      enemy,
      ...createSpacingBlockers(enemy.position),
    ]);

    const nextState = updateAttackSystem(state, new Set(), 2000);
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.health).toBeLessThan(enemy.health);
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

function createAttackingCompanion(
  id: string,
  position: Position,
  partyOrder: number,
) {
  return {
    ...createCompanion(id, position, id, "fighter", partyOrder),
    state: "attack" as const,
    currentTargetId: "enemy",
    lastAttackAt: 0,
  };
}

function createSpacingBlockers(targetPosition: Position): GameEntity[] {
  const blockerPositions = [
    { x: targetPosition.x, y: targetPosition.y - 1 },
    { x: targetPosition.x, y: targetPosition.y + 1 },
    { x: targetPosition.x + 1, y: targetPosition.y },
    { x: targetPosition.x - 1, y: targetPosition.y },
    { x: targetPosition.x + 1, y: targetPosition.y - 1 },
    { x: targetPosition.x - 1, y: targetPosition.y - 1 },
    { x: targetPosition.x + 1, y: targetPosition.y + 1 },
    { x: targetPosition.x - 1, y: targetPosition.y + 1 },
  ];

  return blockerPositions.map((position, index) =>
    createIdleCompanion(`blocker-${index}`, {
      x: position.x + 0.2,
      y: position.y,
    }),
  );
}
