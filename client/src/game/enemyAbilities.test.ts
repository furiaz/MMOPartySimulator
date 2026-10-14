import { afterEach, describe, expect, it, vi } from "vitest";
import { updateCombatProjectileSystem } from "./combatProjectileSystem";
import { createCompanion, createEnemy } from "./entities";
import {
  ENEMY_ABILITY_DEFINITIONS,
  getEnemyAbilityDefinition,
  type EnemyAbilityDefinition,
} from "./enemyAbilities";
import { ENEMY_TYPES } from "./enemyArchetypes";
import {
  isEnemyBasicAttackRequired,
  recordEnemyBasicAttackCommitted,
  updateEnemyAbilitySystem,
} from "./enemyAbilitySystem";
import { addEntity, updateEntity, type GameState } from "./state";
import { applyStatusEffect } from "./statusEffects";
import { createTestGameState } from "./testState";
import type { Companion, Enemy, EnemyAbilityCastState } from "./types";

describe("enemy ability definitions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers Fire Bolt and assigns it only to Ember Imp", () => {
    expect(getEnemyAbilityDefinition("fire_bolt")).toMatchObject({
      id: "fire_bolt",
      displayName: "Fire Bolt",
      range: 5,
      cooldownMs: 6000,
      castDurationMs: 900,
      windupDurationMs: 300,
    });
    expect(ENEMY_TYPES.ember_imp.abilityIds).toEqual(["fire_bolt"]);
    expect(
      Object.values(ENEMY_TYPES)
        .filter((definition) => definition.id !== "ember_imp")
        .some((definition) => definition.abilityIds?.includes("fire_bolt")),
    ).toBe(false);
  });

  it("rejects definitions without a usable display name", () => {
    const invalidDefinition = {
      ...ENEMY_ABILITY_DEFINITIONS.fire_bolt,
      displayName: "   ",
    } as EnemyAbilityDefinition;

    expect(
      getEnemyAbilityDefinition("fire_bolt", { fire_bolt: invalidDefinition }),
    ).toBeUndefined();
  });

  it("launches Fire Bolt from the locked cast origin with the agreed profile", () => {
    const caster = createEnemy("ember", { x: 4, y: 4 }, "aggressive", {
      enemyTypeId: "ember_imp",
    });
    const target = createCompanion(
      "target",
      { x: 8, y: 4 },
      "Target",
      "fighter",
    );
    const state = [caster, target].reduce(
      addEntity,
      createTestGameState({ partyLeaderId: target.id }),
    );
    const cast: EnemyAbilityCastState = {
      id: "ember:fire_bolt:1000",
      abilityId: "fire_bolt",
      casterId: caster.id,
      targetId: target.id,
      phase: "windup",
      startedAt: 1000,
      castEndsAt: 1900,
      windupEndsAt: 2200,
      origin: { x: 1, y: 2 },
      targetPosition: { x: 3, y: 2 },
      direction: { x: 1, y: 0 },
    };
    const definition = getEnemyAbilityDefinition("fire_bolt");

    if (!definition?.resolve) {
      throw new Error("Expected Fire Bolt resolver");
    }

    const nextState = definition.resolve({
      state,
      caster,
      target,
      cast,
      definition,
      now: 2200,
    });

    expect(nextState.combatProjectiles).toEqual([
      expect.objectContaining({
        sourceId: caster.id,
        targetId: target.id,
        position: cast.origin,
        targetFallbackPosition: target.position,
        speed: 8,
        impactRadius: 0.35,
        damageType: "magic",
        powerMultiplier: 1.5,
        visualProfileId: "enemy_fire_bolt",
        impactLabel: "Fire Bolt",
      }),
    ]);
  });

  it("casts immediately in range, preserves the locked origin, and tracks a moved target", () => {
    const { caster, state, target } = createEngagedFireBoltState({ x: 5, y: 0 });
    let nextState = updateEnemyAbilitySystem(state, 1000);

    expect(nextState.enemyAbilityCastsByEnemyId?.[caster.id]).toMatchObject({
      abilityId: "fire_bolt",
      phase: "casting",
      startedAt: 1000,
      castEndsAt: 1900,
      windupEndsAt: 2200,
      origin: caster.position,
    });
    expect(
      nextState.enemyAbilityCooldownsByEnemyId?.[caster.id]?.fire_bolt,
    ).toMatchObject({ startedAt: 1000, expiresAt: 7000 });
    expect(isEnemyBasicAttackRequired(nextState, caster.id)).toBe(true);

    nextState = updateEnemyAbilitySystem(nextState, 1900);
    expect(nextState.enemyAbilityCastsByEnemyId?.[caster.id]?.phase).toBe(
      "windup",
    );

    nextState = updateEntity(nextState, {
      ...(nextState.entities[caster.id] as Enemy),
      position: { x: 2, y: 2 },
    });
    nextState = updateEntity(nextState, {
      ...(nextState.entities[target.id] as Companion),
      position: { x: 10, y: 0 },
    });
    nextState = updateEnemyAbilitySystem(nextState, 2200);

    expect(nextState.enemyAbilityCastsByEnemyId?.[caster.id]).toBeUndefined();
    expect(nextState.combatProjectiles).toEqual([
      expect.objectContaining({
        position: caster.position,
        targetFallbackPosition: { x: 10, y: 0 },
      }),
    ]);

    nextState = applyStatusEffect(nextState, {
      type: "incapacitated",
      targetId: caster.id,
      durationMs: 1000,
    }, 2201);
    nextState = updateCombatProjectileSystem(nextState, 2301, 100);

    expect(nextState.combatProjectiles?.[0]?.position.x).toBeCloseTo(0.8);
  });

  it("falls back outside range and enforces a basic attack after resolution", () => {
    const outside = createEngagedFireBoltState({ x: 5.61, y: 0 });

    expect(updateEnemyAbilitySystem(outside.state, 1000).enemyAbilityCastsByEnemyId)
      .toEqual({});

    const inside = createEngagedFireBoltState({ x: 5, y: 0 });
    let nextState = updateEnemyAbilitySystem(inside.state, 1000);
    nextState = updateEnemyAbilitySystem(nextState, 2200);
    nextState = updateEnemyAbilitySystem(nextState, 7001);

    expect(nextState.enemyAbilityCastsByEnemyId?.[inside.caster.id]).toBeUndefined();

    nextState = recordEnemyBasicAttackCommitted(nextState, inside.caster.id);
    nextState = updateEnemyAbilitySystem(nextState, 7001);

    expect(nextState.enemyAbilityCastsByEnemyId?.[inside.caster.id]?.abilityId).toBe(
      "fire_bolt",
    );
  });

  it("resolves once as named magic damage and can be stopped by an active magic shield", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const first = createEngagedFireBoltState({ x: 0.2, y: 0 });
    let nextState = updateEnemyAbilitySystem(first.state, 1000);
    nextState = updateEnemyAbilitySystem(nextState, 2200);
    nextState = updateCombatProjectileSystem(nextState, 2300, 100);
    const damagedTarget = nextState.entities[first.target.id] as Companion;

    expect(damagedTarget.health).toBeLessThan(first.target.health);
    expect(
      nextState.combatFeedbackEvents.some(
        (event) =>
          event.text === "Fire Bolt" &&
          event.sourceEntityId === first.caster.id &&
          event.targetEntityId === first.target.id,
      ),
    ).toBe(true);
    expect(
      nextState.combatFeedbackEvents.some(
        (event) => event.damageType === "magic" && event.amount !== undefined,
      ),
    ).toBe(true);

    const second = createEngagedFireBoltState({ x: 0.2, y: 0 });
    let shieldedState: GameState = {
      ...second.state,
      skillShieldBlocksById: {
        magicShield: {
          id: "magicShield",
          ownerId: second.target.id,
          position: second.target.position,
          rotationRadians: 0,
          expiresAt: 5000,
          remainingBlocks: 1,
          blockedDamageTypes: ["magic" as const],
        },
      },
    };
    shieldedState = updateEnemyAbilitySystem(shieldedState, 1000);
    shieldedState = updateEnemyAbilitySystem(shieldedState, 2200);
    shieldedState = updateCombatProjectileSystem(shieldedState, 2300, 100);

    expect((shieldedState.entities[second.target.id] as Companion).health).toBe(
      second.target.health,
    );
    expect(shieldedState.skillShieldBlocksById?.magicShield).toBeUndefined();
  });
});

function createEngagedFireBoltState(targetPosition: { x: number; y: number }) {
  const target = createCompanion(
    "target",
    targetPosition,
    "target",
    "defender",
  );
  const caster = {
    ...createEnemy("ember", { x: 0, y: 0 }, "aggressive", {
      enemyTypeId: "ember_imp",
      attackCooldownMs: 1000,
    }),
    state: "attack" as const,
    currentTargetId: target.id,
    lastAttackAt: 0,
  };
  const state = [caster, target].reduce(
    addEntity,
    createTestGameState({ partyLeaderId: target.id }),
  );

  return { caster, state, target };
}
