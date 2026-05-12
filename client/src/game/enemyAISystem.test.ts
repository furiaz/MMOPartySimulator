import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { updateEnemyAISystem } from "./enemyAISystem";
import { ENEMY_ARCHETYPES } from "./enemyArchetypes";
import { addEntity } from "./state";
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

  it("does not acquire a companion inside detection range but outside attack leash", () => {
    const leader = createIdleCompanion("leader", { x: 9, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 4, y: 0 }, "aggressive"),
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

  it("keeps passive slime archetypes from acquiring nearby targets", () => {
    const leader = createIdleCompanion("leader", { x: 1, y: 0 });
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      archetypeId: "slime",
    });

    const nextState = updateEnemyAISystem(createState([leader, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
      targetDecisionReason: "passive_no_auto_target",
    });
  });

  it("uses wolf lowest-health targeting inside detection range and attack leash", () => {
    const leader = createIdleCompanion("leader", { x: 3, y: 0 });
    const injured = {
      ...createIdleCompanion("injured", { x: 4, y: 0 }),
      health: 2,
    };
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
      archetypeId: "wolf",
    });

    const nextState = updateEnemyAISystem(createState([leader, injured, enemy]));

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "attack",
      currentTargetId: injured.id,
      targetDecisionReason: "lowest_health",
    });
  });

  it("uses leader targeting when an archetype prefers the party leader", () => {
    const previousPreference = ENEMY_ARCHETYPES.wolf.targetPreference;
    ENEMY_ARCHETYPES.wolf.targetPreference = "leader";

    try {
      const leader = createIdleCompanion("leader", { x: 4, y: 0 });
      const closerCompanion = createIdleCompanion("closer", { x: 2, y: 0 });
      const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
        archetypeId: "wolf",
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
      ENEMY_ARCHETYPES.wolf.targetPreference = previousPreference;
    }
  });

  it("falls back from leader targeting when the leader is not valid", () => {
    const previousPreference = ENEMY_ARCHETYPES.wolf.targetPreference;
    ENEMY_ARCHETYPES.wolf.targetPreference = "leader";

    try {
      const distantLeader = createIdleCompanion("leader", { x: 9, y: 0 });
      const closerCompanion = createIdleCompanion("closer", { x: 2, y: 0 });
      const enemy = createEnemy("enemy", { x: 0, y: 0 }, undefined, {
        archetypeId: "wolf",
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
      ENEMY_ARCHETYPES.wolf.targetPreference = previousPreference;
    }
  });

  it("clears ranged archetype targets outside attack leash", () => {
    const leader = createIdleCompanion("leader", { x: 10, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 7, y: 0 }, undefined, {
        archetypeId: "goblin_thrower",
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
    const leader = createIdleCompanion("leader", { x: 9, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 4, y: 0 }, "aggressive"),
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
    ).toBeLessThanOrEqual(4);
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

function getDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
