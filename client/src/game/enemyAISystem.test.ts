import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { updateEnemyAISystem } from "./enemyAISystem";
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
