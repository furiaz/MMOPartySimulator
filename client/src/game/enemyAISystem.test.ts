import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  getEnemyAggroRange,
  getEnemyAttackLeashDistance,
  getEnemyDetectionRange,
  getEnemyHomeLeashDistance,
  updateEnemyAISystem,
} from "./enemyAISystem";
import { ENEMY_TYPES } from "./enemyArchetypes";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Enemy, GameEntity, Position } from "./types";

describe("enemy AI aggro and roaming", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("acquires a companion inside detection range and attack leash", () => {
    const leader = createIdleCompanion("leader", { x: 3, y: 0 });
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, "aggressive");

    const nextState = updateEnemyAISystem(createState([leader, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "attack",
      currentTargetId: leader.id,
    });
  });

  it("does not make companions target the enemy when aggro only acquires a chase target", () => {
    const leader = createIdleCompanion("leader", { x: 3, y: 0 });
    const ally = createIdleCompanion("ally", { x: 4, y: 0 });
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, "aggressive");

    const nextState = updateEnemyAISystem(createState([leader, ally, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "attack",
    });
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
    expect(nextState.entities[ally.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("uses doubled prototype leash and aggro tuning values", () => {
    expect(getEnemyHomeLeashDistance()).toBe(8);
    expect(getEnemyAttackLeashDistance()).toBe(16);
    expect(getEnemyDetectionRange()).toBe(10);
    expect(
      getEnemyAggroRange(
        createEnemy("enemy", { x: 0, y: 0 }, undefined, {
          enemyTypeId: "forest_spider",
        }),
      ),
    ).toBe(8);
    expect(
      getEnemyAggroRange(
        createEnemy("enemy", { x: 0, y: 0 }, undefined, {
          enemyTypeId: "goblin_scout",
        }),
      ),
    ).toBe(12);
  });

  it("does not acquire a companion inside detection range but outside attack leash", () => {
    const leader = createIdleCompanion("leader", { x: 17, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 8, y: 0 }, "aggressive"),
      homePosition: { x: 0, y: 0 },
    };

    const nextState = updateEnemyAISystem(createState([leader, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("keeps passive enemies from acquiring nearby targets", () => {
    const leader = createIdleCompanion("leader", { x: 1, y: 0 });
    const enemy = createEnemy("enemy", { x: 0, y: 0 });

    const nextState = updateEnemyAISystem(createState([leader, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("keeps starter slime archetypes from acquiring nearby targets", () => {
    const leader = createIdleCompanion("leader", { x: 1, y: 0 });
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "slime",
    });

    const nextState = updateEnemyAISystem(createState([leader, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("uses wolf lowest-health targeting inside detection range and attack leash", () => {
    const leader = createIdleCompanion("leader", { x: 3, y: 0 });
    const injured = {
      ...createIdleCompanion("injured", { x: 4, y: 0 }),
      health: 2,
    };
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "wolf",
    });

    const nextState = updateEnemyAISystem(createState([leader, injured, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "attack",
      currentTargetId: injured.id,
      targetDecisionReason: "lowest_health",
    });
  });

  it("uses leader targeting when an enemy type prefers the party leader", () => {
    const previousPreference = ENEMY_TYPES.wolf.targetPreference;
    ENEMY_TYPES.wolf.targetPreference = "leader";

    try {
      const leader = createIdleCompanion("leader", { x: 4, y: 0 });
      const closerCompanion = createIdleCompanion("closer", { x: 2, y: 0 });
      const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "wolf",
      });

      const nextState = updateEnemyAISystem(
        createState([leader, closerCompanion, enemy]),
      );

      expect(nextState.entities[enemy.id]).toMatchObject({
        state: "attack",
        currentTargetId: leader.id,
        targetDecisionReason: "leader",
      });
    } finally {
      ENEMY_TYPES.wolf.targetPreference = previousPreference;
    }
  });

  it("falls back from leader targeting when the leader is not valid", () => {
    const previousPreference = ENEMY_TYPES.wolf.targetPreference;
    ENEMY_TYPES.wolf.targetPreference = "leader";

    try {
      const distantLeader = createIdleCompanion("leader", { x: 13, y: 0 });
      const closerCompanion = createIdleCompanion("closer", { x: 2, y: 0 });
      const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
        enemyTypeId: "wolf",
      });

      const nextState = updateEnemyAISystem(
        createState([distantLeader, closerCompanion, enemy]),
      );

      expect(nextState.entities[enemy.id]).toMatchObject({
        state: "attack",
        currentTargetId: closerCompanion.id,
        targetDecisionReason: "closest",
      });
    } finally {
      ENEMY_TYPES.wolf.targetPreference = previousPreference;
    }
  });

  it("clears ranged archetype targets outside attack leash", () => {
    const leader = createIdleCompanion("leader", { x: 17, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 15, y: 0 }, undefined, {
        enemyTypeId: "goblin_thrower",
      }),
      state: "attack" as const,
      currentTargetId: leader.id,
      homePosition: { x: 0, y: 0 },
    };

    const nextState = updateEnemyAISystem(createState([leader, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("clears a target that leaves attack leash and attack range", () => {
    const leader = createIdleCompanion("leader", { x: 17, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 15, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
      homePosition: { x: 0, y: 0 },
    };

    const nextState = updateEnemyAISystem(createState([leader, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("chooses idle roam targets inside roam leash", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const enemy = {
      ...createEnemy("enemy", { x: 0, y: 0 }),
      nextRoamAt: 9_999,
    };

    const nextState = updateEnemyAISystem(createState([enemy]));
    const nextEnemy = nextState.entities[enemy.id] as Enemy;

    expect(nextEnemy.roamTargetPosition).toBeTruthy();
    expect(
      getDistance(nextEnemy.homePosition, nextEnemy.roamTargetPosition!),
    ).toBeLessThanOrEqual(8);
  });

  it("continues roaming across small real-time movement frames", () => {
    const enemy = {
      ...createEnemy("enemy", { x: 0, y: 0 }),
      roamTargetPosition: { x: 1, y: 0 },
      roamMoveUntil: 10_000,
    };
    let state = createState([enemy], { simulationDeltaMs: 16 });

    for (let frame = 0; frame < 10; frame += 1) {
      state = updateEnemyAISystem(state, {
        nowMs: 1_000 + frame * 16,
        deltaMs: 16,
        deltaSeconds: 0.016,
        frameNumber: frame + 1,
      });
    }

    const nextEnemy = state.entities[enemy.id] as Enemy;

    expect(nextEnemy.position.x).toBeGreaterThan(0.2);
    expect(nextEnemy.roamTargetPosition).toEqual(enemy.roamTargetPosition);
    expect(getDistance(nextEnemy.homePosition, nextEnemy.position)).toBeLessThanOrEqual(8);
  });
});

function createState(entities: GameEntity[], overrides: Partial<GameState> = {}) {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId: "leader",
      ...overrides,
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

function getDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
