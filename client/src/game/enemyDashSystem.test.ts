import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { updateEnemyAbilitySystem } from "./enemyAbilitySystem";
import {
  cancelEnemyDash,
  cleanupEnemyDashRuntime,
  updateEnemyDashSystem,
} from "./enemyDashSystem";
import { addEntity, type GameState } from "./state";
import { applyStatusEffect } from "./statusEffects";
import { createTestGameState } from "./testState";
import { clearFrameMovementPlanning } from "./movementState";
import type { Companion, Enemy } from "./types";

describe("enemy Rending Dash runtime", () => {
  it("locks a Night Bat cast, defers completion through movement, and hits once", () => {
    const { enemy, leader, state } = createEngagedDashState("night_bat", {
      x: 3,
      y: 0,
    });
    let nextState = updateEnemyAbilitySystem(state, 1000);

    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toMatchObject({
      abilityId: "night_bat_rending_dash",
      startedAt: 1000,
      castEndsAt: 1650,
      windupEndsAt: 1800,
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      dashPlan: {
        destination: { x: 6, y: 0 },
        distance: 6,
        durationMs: 250,
      },
    });
    expect(
      nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]
        ?.night_bat_rending_dash,
    ).toMatchObject({ startedAt: 1000, expiresAt: 9000 });

    nextState = updateEnemyAbilitySystem(nextState, 1800);

    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeUndefined();
    expect(nextState.enemyDashesByEnemyId?.[enemy.id]).toMatchObject({
      startedAt: 1800,
      endsAt: 2050,
      powerMultiplier: 1.25,
      lastProgressDistance: 0,
    });
    expect(nextState.entities[enemy.id]).toMatchObject({ lastAttackAt: 0 });

    const movedEntityIds = new Set<string>();
    nextState = updateEnemyDashSystem(nextState, movedEntityIds, 1925, () => 0.99);

    expect(nextState.entities[enemy.id].position.x).toBeCloseTo(3);
    expect((nextState.entities[leader.id] as Companion).health).toBeLessThan(
      leader.health,
    );
    expect(nextState.enemyDashesByEnemyId?.[enemy.id]?.hitTargetIds).toEqual([
      leader.id,
    ]);
    expect(movedEntityIds.has(enemy.id)).toBe(true);
    expect(
      nextState.combatFeedbackEvents.some(
        (event) =>
          event.targetEntityId === leader.id && event.text === "Rending Dash",
      ),
    ).toBe(true);

    const healthAfterFirstAttempt = (nextState.entities[leader.id] as Companion).health;
    nextState = updateEnemyDashSystem(clearFrameMovementPlanning(nextState), movedEntityIds, 2050, () => 0.99);

    expect(nextState.enemyDashesByEnemyId?.[enemy.id]).toBeUndefined();
    expect(nextState.entities[enemy.id]).toMatchObject({
      position: { x: 6, y: 0 },
      lastAttackAt: 2050,
    });
    expect((nextState.entities[leader.id] as Companion).health).toBe(
      healthAfterFirstAttempt,
    );
    expect(
      nextState.enemyAbilityBasicAttackRequiredByEnemyId?.[enemy.id],
    ).toBe(true);
  });

  it("rejects a terrain-blocked candidate before cooldown and attack gating", () => {
    const { enemy, leader, state } = createEngagedDashState("night_bat", {
      x: 3,
      y: 0,
    });
    const blocker = createResource("blocker", { x: 1.5, y: 0 });
    const blockedState = addEntity(state, blocker);
    const nextState = updateEnemyAbilitySystem(blockedState, 1000);

    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeUndefined();
    expect(nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]).toBeUndefined();
    expect(
      nextState.enemyAbilityBasicAttackRequiredByEnemyId?.[enemy.id],
    ).toBeUndefined();
    expect(nextState.entities[leader.id]).toBeDefined();
  });

  it("clips distance before casting, preserves speed, and keeps the full cooldown", () => {
    const { enemy, state } = createEngagedDashState("night_bat", {
      x: 1,
      y: 0,
    });
    const blocker = createResource("distant-blocker", { x: 5.5, y: 0 });
    const nextState = updateEnemyAbilitySystem(addEntity(state, blocker), 1000);
    const cast = nextState.enemyAbilityCastsByEnemyId?.[enemy.id];

    expect(cast?.dashPlan?.distance).toBeGreaterThanOrEqual(3);
    expect(cast?.dashPlan?.distance).toBeLessThan(6);
    expect(cast?.dashPlan?.durationMs).toBeCloseTo(
      250 * ((cast?.dashPlan?.distance ?? 0) / 6),
    );
    expect(cast?.area?.bounds.maxX).toBeCloseTo(cast?.dashPlan?.distance ?? 0);
    expect(
      nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]
        ?.night_bat_rending_dash?.expiresAt,
    ).toBe(9000);
  });

  it("reserves a pending destination against a same-tick competing dash", () => {
    const leader = createCompanion("leader", { x: 3, y: 0 }, "leader", "fighter");
    const first = createReadyDashEnemy("first", leader.id);
    const second = createReadyDashEnemy("second", leader.id);
    const state = [leader, first, second].reduce(
      addEntity,
      createTestGameState({ partyLeaderId: leader.id }),
    );
    const nextState = updateEnemyAbilitySystem(state, 1000);

    expect(nextState.enemyAbilityCastsByEnemyId?.[first.id]?.dashPlan).toBeDefined();
    expect(nextState.enemyAbilityCastsByEnemyId?.[second.id]).toBeUndefined();
    expect(nextState.enemyAbilityCooldownsByEnemyId?.[second.id]).toBeUndefined();
  });

  it("accepts a free landing gap surrounded by companions", () => {
    const { enemy, leader, state } = createEngagedDashState("orc_raider", {
      x: 4,
      y: 0,
    });
    const surroundingCompanions = [
      createCompanion("north", { x: 7.5, y: -2.7 }, leader.id),
      createCompanion("south", { x: 7.5, y: 2 }, leader.id),
      createCompanion("west", { x: 5.8, y: 0 }, leader.id),
      createCompanion("east", { x: 9.2, y: 0 }, leader.id),
    ];
    const surroundedState = surroundingCompanions.reduce(addEntity, state);
    const nextState = updateEnemyAbilitySystem(surroundedState, 1000);

    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]?.dashPlan).toMatchObject({
      destination: { x: 7.5, y: 0 },
      distance: 7.5,
      durationMs: 350,
    });
  });

  it("uses swept progress for a large tick and records an evaded target once", () => {
    const { enemy, leader, state } = createEngagedDashState("orc_raider", {
      x: 4,
      y: 0,
    });
    let nextState = updateEnemyAbilitySystem(state, 1000);
    nextState = updateEnemyAbilitySystem(nextState, 2100);
    nextState = applyStatusEffect(
      nextState,
      {
        type: "forcedEvasion",
        targetId: leader.id,
        durationMs: 1000,
        sourceId: leader.id,
      },
      2100,
    );

    nextState = updateEnemyDashSystem(nextState, new Set(), 2450, () => 0);

    expect(nextState.enemyDashesByEnemyId?.[enemy.id]).toBeUndefined();
    expect((nextState.entities[leader.id] as Companion).health).toBe(leader.health);
    expect(
      nextState.combatFeedbackEvents.filter(
        (event) => event.entityId === leader.id && event.text === "Dodged",
      ),
    ).toHaveLength(1);
    expect(nextState.entities[enemy.id].position.x).toBeCloseTo(7.5);
  });

  it("ignores silence after launch but stops at the last safe point for hard control", () => {
    const { enemy, state } = createEngagedDashState("night_bat", {
      x: 3,
      y: 0,
    });
    let nextState = updateEnemyAbilitySystem(state, 1000);
    nextState = updateEnemyAbilitySystem(nextState, 1800);
    nextState = applyStatusEffect(
      nextState,
      { type: "silenced", targetId: enemy.id, durationMs: 1000 },
      1800,
    );
    nextState = updateEnemyDashSystem(nextState, new Set(), 1900, () => 0.99);

    expect(nextState.enemyDashesByEnemyId?.[enemy.id]).toBeDefined();
    expect(nextState.entities[enemy.id].position.x).toBeCloseTo(2.4);
    const lastSafePosition = nextState.enemyDashesByEnemyId?.[enemy.id]
      ?.lastSafePosition;

    nextState = applyStatusEffect(
      nextState,
      { type: "incapacitated", targetId: enemy.id, durationMs: 1000 },
      1900,
    );
    nextState = updateEnemyDashSystem(clearFrameMovementPlanning(nextState), new Set(), 1950, () => 0.99);

    expect(nextState.enemyDashesByEnemyId?.[enemy.id]).toBeUndefined();
    expect(nextState.entities[enemy.id].position).toEqual(lastSafePosition);
    expect(nextState.entities[enemy.id]).toMatchObject({ lastAttackAt: 1950 });
    expect(
      nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]
        ?.night_bat_rending_dash?.expiresAt,
    ).toBe(9000);
  });

  it("falls back backward when the planned landing becomes occupied", () => {
    const { enemy, state } = createEngagedDashState("night_bat", {
      x: 3,
      y: 0,
    });
    let nextState = updateEnemyAbilitySystem(state, 1000);
    nextState = updateEnemyAbilitySystem(nextState, 1800);
    const blocker = createEnemy("late-blocker", { x: 6, y: 0 }, "passive", {
      enemyTypeId: "briar_wolf",
    });
    nextState = addEntity(nextState, blocker);
    nextState = updateEnemyDashSystem(nextState, new Set(), 2050, () => 0.99);

    const finalPosition = nextState.entities[enemy.id].position;
    expect(finalPosition.x).toBeLessThan(6);
    expect(finalPosition.x).toBeGreaterThanOrEqual(3);
    expect(nextState.enemyDashesByEnemyId?.[enemy.id]).toBeUndefined();
  });

  it("cancels a launched dash without refunding its action state", () => {
    const { enemy, state } = createEngagedDashState("night_bat", {
      x: 3,
      y: 0,
    });
    let nextState = updateEnemyAbilitySystem(state, 1000);
    nextState = updateEnemyAbilitySystem(nextState, 1800);
    nextState = updateEnemyDashSystem(nextState, new Set(), 1900, () => 0.99);
    const lastSafePosition = nextState.enemyDashesByEnemyId?.[enemy.id]
      ?.lastSafePosition;

    nextState = cancelEnemyDash(clearFrameMovementPlanning(nextState), enemy.id, "encounter_reset", 1910);

    expect(nextState.enemyDashesByEnemyId?.[enemy.id]).toBeUndefined();
    expect(nextState.entities[enemy.id].position).toEqual(lastSafePosition);
    expect(nextState.entities[enemy.id]).toMatchObject({ lastAttackAt: 1910 });
    expect(
      nextState.enemyAbilityBasicAttackRequiredByEnemyId?.[enemy.id],
    ).toBe(true);
  });

  it("prunes a dash immediately when its caster dies or disappears", () => {
    const { enemy, state } = createEngagedDashState("night_bat", {
      x: 3,
      y: 0,
    });
    let nextState = updateEnemyAbilitySystem(state, 1000);
    nextState = updateEnemyAbilitySystem(nextState, 1800);
    nextState = updateEntityForTest(nextState, {
      ...(nextState.entities[enemy.id] as Enemy),
      state: "dead",
      health: 0,
    });

    expect(cleanupEnemyDashRuntime(nextState, 1810).enemyDashesByEnemyId).toEqual({});

    const entities = { ...nextState.entities };
    delete entities[enemy.id];
    expect(
      cleanupEnemyDashRuntime({ ...nextState, entities }, 1810)
        .enemyDashesByEnemyId,
    ).toEqual({});
  });
});

function createEngagedDashState(
  enemyTypeId: "night_bat" | "orc_raider",
  leaderPosition: { x: number; y: number },
): { enemy: Enemy; leader: Companion; state: GameState } {
  const leader = {
    ...createCompanion("leader", leaderPosition, "leader", "fighter"),
    state: "attack" as const,
    currentTargetId: "enemy",
  };
  const enemy = {
    ...createEnemy("enemy", { x: 0, y: 0 }, "aggressive", {
      enemyTypeId,
      attackCooldownMs: 1000,
      attack: 4,
    }),
    state: "attack" as const,
    currentTargetId: leader.id,
    lastAttackAt: 0,
  };
  const state = [leader, enemy].reduce(
    addEntity,
    createTestGameState({ partyLeaderId: leader.id }),
  );

  return { enemy, leader, state };
}

function createReadyDashEnemy(id: string, targetId: string): Enemy {
  return {
    ...createEnemy(id, { x: 0, y: 0 }, "aggressive", {
      enemyTypeId: "night_bat",
      attackCooldownMs: 1000,
    }),
    state: "attack",
    currentTargetId: targetId,
    lastAttackAt: 0,
  };
}

function updateEntityForTest(state: GameState, entity: Enemy): GameState {
  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
  };
}
