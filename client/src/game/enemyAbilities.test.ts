import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAoePattern } from "./aoePatterns";
import { updateCombatProjectileSystem } from "./combatProjectileSystem";
import { createCompanion, createEnemy, createTargetDummy } from "./entities";
import {
  ENEMY_ABILITY_DEFINITIONS,
  FORTIFYING_AURA_STATUS_SOURCE_KEY,
  NIGHT_BAT_RENDING_DASH_ABILITY_ID,
  ORC_RAIDER_RENDING_DASH_ABILITY_ID,
  ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID,
  TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID,
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

  it("registers the tuned Fortifying Aura variants on the intended enemies", () => {
    expect(
      getEnemyAbilityDefinition(TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID),
    ).toMatchObject({
      id: TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID,
      displayName: "Fortifying Aura",
      range: 6,
      cooldownMs: 14000,
      castDurationMs: 800,
      windupDurationMs: 200,
      aoePattern: { type: "circle", radius: 5 },
      aoeVisualIntent: "enemySupportive",
    });
    expect(
      getEnemyAbilityDefinition(ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID),
    ).toMatchObject({
      id: ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID,
      displayName: "Fortifying Aura",
      range: 10,
      cooldownMs: 16000,
      castDurationMs: 1000,
      windupDurationMs: 250,
      aoePattern: { type: "circle", radius: 6 },
      aoeVisualIntent: "enemySupportive",
    });
    expect(ENEMY_TYPES.tin_crawler.abilityIds).toEqual([
      TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID,
    ]);
    expect(ENEMY_TYPES.orc_shieldbearer.abilityIds).toEqual([
      ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID,
    ]);
  });

  it("registers the tuned Rending Dash variants on the intended enemies", () => {
    expect(
      getEnemyAbilityDefinition(NIGHT_BAT_RENDING_DASH_ABILITY_ID),
    ).toMatchObject({
      id: NIGHT_BAT_RENDING_DASH_ABILITY_ID,
      displayName: "Rending Dash",
      range: 6,
      cooldownMs: 8000,
      castDurationMs: 650,
      windupDurationMs: 150,
      aoePattern: { type: "line", squareCount: 4 },
      aoeVisualIntent: "enemyOffensive",
    });
    expect(
      getEnemyAbilityDefinition(ORC_RAIDER_RENDING_DASH_ABILITY_ID),
    ).toMatchObject({
      id: ORC_RAIDER_RENDING_DASH_ABILITY_ID,
      displayName: "Rending Dash",
      range: 7.5,
      cooldownMs: 10000,
      castDurationMs: 900,
      windupDurationMs: 200,
      aoePattern: { type: "rectangle", rows: 5, columns: 2 },
      aoeVisualIntent: "enemyOffensive",
    });
    expect(ENEMY_TYPES.night_bat.abilityIds).toEqual([
      NIGHT_BAT_RENDING_DASH_ABILITY_ID,
    ]);
    expect(ENEMY_TYPES.orc_raider.abilityIds).toEqual([
      ORC_RAIDER_RENDING_DASH_ABILITY_ID,
    ]);
  });

  it("buffs living non-dummy enemies by center position and leaves others alone", () => {
    const caster = createEnemy("crawler", { x: 0, y: 0 }, "aggressive", {
      enemyTypeId: "tin_crawler",
    });
    const boundaryAlly = createEnemy("boundary", { x: 5, y: 0 }, "aggressive", {
      enemyTypeId: "briar_wolf",
      variant: "superior",
    });
    const warmaster = createEnemy("warmaster", { x: 0, y: 4 }, "aggressive", {
      enemyTypeId: "orc_warmaster",
    });
    const outsideAlly = createEnemy("outside", { x: 5.01, y: 0 }, "aggressive", {
      enemyTypeId: "briar_wolf",
    });
    const deadAlly = {
      ...createEnemy("dead", { x: 1, y: 0 }, "aggressive", {
        enemyTypeId: "briar_wolf",
      }),
      state: "dead" as const,
      health: 0,
    };
    const dummy = createTargetDummy("dummy", { x: 1, y: 1 });
    const companion = createCompanion("companion", { x: 2, y: 0 }, "Companion");
    const state = [
      caster,
      boundaryAlly,
      warmaster,
      outsideAlly,
      deadAlly,
      dummy,
      companion,
    ].reduce(addEntity, createTestGameState({ partyLeaderId: companion.id }));
    const definition = getEnemyAbilityDefinition(
      TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID,
    );

    if (!definition?.resolve || !definition.aoePattern) {
      throw new Error("Expected Tin Crawler Fortifying Aura definition");
    }

    const cast = createAuraCast(caster, companion, definition, 1000);
    const nextState = definition.resolve({
      state,
      caster,
      target: companion,
      cast,
      definition,
      now: 2000,
    });
    const statuses = Object.values(nextState.statusEffectsById ?? {});

    expect(statuses.map((status) => status.targetId).sort()).toEqual(
      [boundaryAlly.id, caster.id, warmaster.id].sort(),
    );
    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: boundaryAlly.id,
          sourceId: caster.id,
          sourceKey: FORTIFYING_AURA_STATUS_SOURCE_KEY,
          defenseBonusPercent: 50,
          expiresAt: 10000,
          endsWhenSourceDies: true,
        }),
      ]),
    );
  });

  it("replaces Fortifying Aura strength, owner, and duration instead of stacking", () => {
    const crawler = createEnemy("crawler", { x: 0, y: 0 }, "aggressive", {
      enemyTypeId: "tin_crawler",
    });
    const shieldbearer = createEnemy(
      "shieldbearer",
      { x: 1, y: 0 },
      "aggressive",
      { enemyTypeId: "orc_shieldbearer" },
    );
    const target = createEnemy("target", { x: 2, y: 0 }, "aggressive", {
      enemyTypeId: "orc_warmaster",
    });
    const companion = createCompanion("companion", { x: 3, y: 0 }, "Companion");
    let state = [crawler, shieldbearer, target, companion].reduce(
      addEntity,
      createTestGameState({ partyLeaderId: companion.id }),
    );
    const stronger = getEnemyAbilityDefinition(
      ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID,
    );
    const weaker = getEnemyAbilityDefinition(
      TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID,
    );

    if (
      !stronger?.resolve ||
      !stronger.aoePattern ||
      !weaker?.resolve ||
      !weaker.aoePattern
    ) {
      throw new Error("Expected both Fortifying Aura definitions");
    }

    state = stronger.resolve({
      state,
      caster: shieldbearer,
      target: companion,
      cast: createAuraCast(shieldbearer, companion, stronger, 1000),
      definition: stronger,
      now: 2250,
    });
    state = weaker.resolve({
      state,
      caster: crawler,
      target: companion,
      cast: createAuraCast(crawler, companion, weaker, 3000),
      definition: weaker,
      now: 4000,
    });

    const targetStatuses = Object.values(state.statusEffectsById ?? {}).filter(
      (status) => status.targetId === target.id,
    );
    expect(targetStatuses).toEqual([
      expect.objectContaining({
        sourceId: crawler.id,
        defenseBonusPercent: 50,
        appliedAt: 4000,
        expiresAt: 12000,
      }),
    ]);
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

function createAuraCast(
  caster: Enemy,
  target: Companion,
  definition: EnemyAbilityDefinition,
  startedAt: number,
): EnemyAbilityCastState {
  if (!definition.aoePattern) {
    throw new Error("Expected an AoE pattern");
  }

  const direction = {
    x: target.position.x - caster.position.x,
    y: target.position.y - caster.position.y,
  };

  return {
    id: `${caster.id}:${definition.id}:${startedAt}`,
    abilityId: definition.id,
    casterId: caster.id,
    targetId: target.id,
    phase: "windup",
    startedAt,
    castEndsAt: startedAt + definition.castDurationMs,
    windupEndsAt:
      startedAt + definition.castDurationMs + (definition.windupDurationMs ?? 0),
    origin: { ...caster.position },
    targetPosition: { ...target.position },
    direction,
    area: resolveAoePattern(definition.aoePattern, {
      origin: caster.position,
      direction,
    }),
    visualIntent: definition.aoeVisualIntent,
  };
}
