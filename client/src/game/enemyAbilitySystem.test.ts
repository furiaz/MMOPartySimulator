import { afterEach, describe, expect, it } from "vitest";
import { updateAttackSystem } from "./attackSystem";
import { createCompanion, createEnemy } from "./entities";
import {
  type EnemyAbilityDefinition,
  type EnemyAbilityRegistry,
  type EnemyAbilityResolutionContext,
} from "./enemyAbilities";
import {
  clearEnemyAbilityRuntimeForEnemy,
  isEnemyBasicAttackRequired,
  sanitizeEnemyAbilityRuntimeForSave,
  updateEnemyAbilitySystem,
} from "./enemyAbilitySystem";
import { ENEMY_TYPES } from "./enemyArchetypes";
import {
  clearMapTransitionRuntimeState,
  pruneMissingEntityRuntimeState,
} from "./mapRuntimeCleanup";
import { addEntity, updateEntity, type GameState } from "./state";
import { sanitizeGameStateForSave } from "./saveGame";
import { applyStatusEffect } from "./statusEffects";
import { createTestGameState } from "./testState";
import type {
  Enemy,
  EnemyAbilityCastState,
  EnemyTypeId,
  GameEntity,
} from "./types";

const TEST_ENEMY_TYPE_IDS: EnemyTypeId[] = ["ember_imp", "tin_crawler"];
const originalAbilityIds = new Map(
  TEST_ENEMY_TYPE_IDS.map((enemyTypeId) => [
    enemyTypeId,
    ENEMY_TYPES[enemyTypeId].abilityIds,
  ]),
);

afterEach(() => {
  for (const enemyTypeId of TEST_ENEMY_TYPE_IDS) {
    const abilityIds = originalAbilityIds.get(enemyTypeId);

    if (abilityIds) {
      ENEMY_TYPES[enemyTypeId].abilityIds = abilityIds;
    } else {
      delete ENEMY_TYPES[enemyTypeId].abilityIds;
    }
  }
});

describe("enemy ability system", () => {
  it("leaves enemies without configured abilities unchanged", () => {
    const { state } = createEngagedState();
    const nextState = updateEnemyAbilitySystem(state, 1000, {
      ready: createAbility("ready"),
    });

    expect(nextState.enemyAbilityCastsByEnemyId).toEqual({});
    expect(nextState.enemyAbilityCooldownsByEnemyId).toEqual({});
  });

  it("starts the first valid ordered ability and locks its cast transform", () => {
    setAbilityIds("ember_imp", [
      "unknown",
      "cooling",
      "out_of_range",
      "missing_resolver",
      "ready",
    ]);
    const { state, enemy } = createEngagedState();
    const definitions: EnemyAbilityRegistry = {
      cooling: createAbility("cooling"),
      out_of_range: createAbility("out_of_range", { range: 0 }),
      missing_resolver: createAbility("missing_resolver", { resolve: undefined }),
      ready: createAbility("ready"),
    };
    const stateWithCooldown = {
      ...state,
      enemyAbilityCooldownsByEnemyId: {
        [enemy.id]: {
          cooling: {
            abilityId: "cooling",
            casterId: enemy.id,
            startedAt: 500,
            expiresAt: 2000,
          },
        },
      },
    };

    const nextState = updateEnemyAbilitySystem(stateWithCooldown, 1000, definitions);

    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toMatchObject({
      abilityId: "ready",
      casterId: enemy.id,
      targetId: "leader",
      phase: "casting",
      startedAt: 1000,
      castEndsAt: 1500,
      windupEndsAt: 1750,
      origin: { x: 0, y: 0 },
      targetPosition: { x: 2, y: 0 },
      direction: { x: 1, y: 0 },
    });
    expect(
      nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]?.ready,
    ).toEqual({
      abilityId: "ready",
      casterId: enemy.id,
      startedAt: 1000,
      expiresAt: 4000,
    });
    expect(isEnemyBasicAttackRequired(nextState, enemy.id)).toBe(true);
  });

  it("keeps the locked snapshot while exposing the current target at resolution", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const resolutions: Array<{
      cast: EnemyAbilityCastState;
      casterPosition: { x: number; y: number };
      targetPosition: { x: number; y: number };
    }> = [];
    const definitions: EnemyAbilityRegistry = {
      ready: createAbility("ready", {
        resolve: (context) => {
          resolutions.push({
            cast: context.cast,
            casterPosition: context.caster.position,
            targetPosition: context.target.position,
          });
          return context.state;
        },
      }),
    };
    const { state, enemy, leader } = createEngagedState();
    let nextState = updateEnemyAbilitySystem(state, 1000, definitions);
    nextState = updateEntity(nextState, {
      ...(nextState.entities[enemy.id] as Enemy),
      position: { x: 1, y: 1 },
    });
    nextState = updateEntity(nextState, {
      ...leader,
      position: { x: 3, y: 2 },
    });

    nextState = updateEnemyAbilitySystem(nextState, 1499, definitions);
    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]?.phase).toBe("casting");

    nextState = updateEnemyAbilitySystem(nextState, 1500, definitions);
    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]?.phase).toBe("windup");

    nextState = updateEnemyAbilitySystem(nextState, 1750, definitions);
    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeUndefined();
    expect((nextState.entities[enemy.id] as Enemy).lastAttackAt).toBe(1750);
    expect(resolutions).toEqual([
      {
        cast: expect.objectContaining({
          origin: { x: 0, y: 0 },
          targetPosition: { x: 2, y: 0 },
          direction: { x: 1, y: 0 },
        }),
        casterPosition: { x: 1, y: 1 },
        targetPosition: { x: 3, y: 2 },
      },
    ]);

    updateEnemyAbilitySystem(nextState, 1800, definitions);
    expect(resolutions).toHaveLength(1);
  });

  it.each(["taunted", "incapacitated", "silenced"] as const)(
    "interrupts an active cast when the caster becomes %s without refunding it",
    (statusType) => {
      setAbilityIds("ember_imp", ["ready"]);
      const definitions = { ready: createAbility("ready") };
      const { state, enemy } = createEngagedState();
      let nextState = updateEnemyAbilitySystem(state, 1000, definitions);
      nextState = applyStatusEffect(nextState, {
        type: statusType,
        targetId: enemy.id,
        durationMs: 5000,
      }, 1100);
      nextState = updateEnemyAbilitySystem(nextState, 1100, definitions);

      expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeUndefined();
      expect(
        nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]?.ready?.expiresAt,
      ).toBe(4000);
      expect(isEnemyBasicAttackRequired(nextState, enemy.id)).toBe(true);
      expect((nextState.entities[enemy.id] as Enemy).lastAttackAt).toBe(1100);
    },
  );

  it("interrupts for bind and fake death but not immobilization", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const definitions = { ready: createAbility("ready") };
    const { state, enemy } = createEngagedState();
    let nextState = updateEnemyAbilitySystem(state, 1000, definitions);
    nextState = applyStatusEffect(nextState, {
      type: "immobilized",
      targetId: enemy.id,
      durationMs: 5000,
    }, 1050);
    nextState = updateEnemyAbilitySystem(nextState, 1100, definitions);
    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeDefined();

    nextState = {
      ...nextState,
      skillBindsByEnemyId: {
        [enemy.id]: {
          sourceId: "leader",
          targetId: enemy.id,
          expiresAt: 3000,
        },
      },
    };
    nextState = updateEnemyAbilitySystem(nextState, 1200, definitions);
    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeUndefined();

    const second = createEngagedState();
    let fakeDeathState = updateEnemyAbilitySystem(second.state, 1000, definitions);
    fakeDeathState = applyStatusEffect(fakeDeathState, {
      type: "fakeDeath",
      targetId: second.leader.id,
      durationMs: 5000,
    }, 1050);
    fakeDeathState = updateEnemyAbilitySystem(fakeDeathState, 1100, definitions);
    expect(fakeDeathState.enemyAbilityCastsByEnemyId?.[second.enemy.id]).toBeUndefined();
  });

  it("cancels casts for dead or missing targets and dead or removed casters", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const definitions = { ready: createAbility("ready") };

    const deadTarget = createEngagedState();
    let deadTargetState = updateEnemyAbilitySystem(
      deadTarget.state,
      1000,
      definitions,
    );
    deadTargetState = updateEntity(deadTargetState, {
      ...deadTarget.leader,
      state: "dead",
      health: 0,
    });
    deadTargetState = updateEnemyAbilitySystem(deadTargetState, 1100, definitions);
    expect(
      deadTargetState.enemyAbilityCastsByEnemyId?.[deadTarget.enemy.id],
    ).toBeUndefined();
    expect(isEnemyBasicAttackRequired(deadTargetState, deadTarget.enemy.id)).toBe(true);

    const missingTarget = createEngagedState();
    let missingTargetState = updateEnemyAbilitySystem(
      missingTarget.state,
      1000,
      definitions,
    );
    const entitiesWithoutTarget = { ...missingTargetState.entities };
    delete entitiesWithoutTarget[missingTarget.leader.id];
    missingTargetState = updateEnemyAbilitySystem({
      ...missingTargetState,
      entities: entitiesWithoutTarget,
    }, 1100, definitions);
    expect(
      missingTargetState.enemyAbilityCastsByEnemyId?.[missingTarget.enemy.id],
    ).toBeUndefined();
    expect(isEnemyBasicAttackRequired(missingTargetState, missingTarget.enemy.id)).toBe(true);

    const deadCaster = createEngagedState();
    let deadCasterState = updateEnemyAbilitySystem(
      deadCaster.state,
      1000,
      definitions,
    );
    deadCasterState = updateEntity(deadCasterState, {
      ...deadCaster.enemy,
      state: "dead",
      health: 0,
    });
    deadCasterState = updateEnemyAbilitySystem(deadCasterState, 1100, definitions);
    expect(
      deadCasterState.enemyAbilityCastsByEnemyId?.[deadCaster.enemy.id],
    ).toBeUndefined();
    expect(isEnemyBasicAttackRequired(deadCasterState, deadCaster.enemy.id)).toBe(true);

    const removedCaster = createEngagedState();
    let removedCasterState = updateEnemyAbilitySystem(
      removedCaster.state,
      1000,
      definitions,
    );
    const entitiesWithoutCaster = { ...removedCasterState.entities };
    delete entitiesWithoutCaster[removedCaster.enemy.id];
    removedCasterState = updateEnemyAbilitySystem({
      ...removedCasterState,
      entities: entitiesWithoutCaster,
    }, 1100, definitions);
    expect(
      removedCasterState.enemyAbilityCooldownsByEnemyId?.[removedCaster.enemy.id],
    ).toBeUndefined();
    expect(
      removedCasterState.enemyAbilityBasicAttackRequiredByEnemyId?.[
        removedCaster.enemy.id
      ],
    ).toBeUndefined();
  });

  it("allows disarmed enemies to cast but rejects fake-death targets", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const definitions = { ready: createAbility("ready") };
    const disarmed = createEngagedState();
    const disarmedState = applyStatusEffect(disarmed.state, {
      type: "disarmed",
      targetId: disarmed.enemy.id,
      durationMs: 5000,
    }, 900);

    expect(
      updateEnemyAbilitySystem(disarmedState, 1000, definitions)
        .enemyAbilityCastsByEnemyId?.[disarmed.enemy.id],
    ).toBeDefined();

    const fakeDeath = createEngagedState();
    const fakeDeathState = applyStatusEffect(fakeDeath.state, {
      type: "fakeDeath",
      targetId: fakeDeath.leader.id,
      durationMs: 5000,
    }, 900);
    expect(
      updateEnemyAbilitySystem(fakeDeathState, 1000, definitions)
        .enemyAbilityCastsByEnemyId?.[fakeDeath.enemy.id],
    ).toBeUndefined();
  });

  it("does not start over an existing AoE channel or basic-attack windup", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const definitions = { ready: createAbility("ready") };
    const first = createEngagedState();
    const aoeState = {
      ...first.state,
      enemyAoeChannelsByCasterId: {
        [first.enemy.id]: {} as never,
      },
    };

    expect(
      updateEnemyAbilitySystem(aoeState, 1000, definitions)
        .enemyAbilityCastsByEnemyId?.[first.enemy.id],
    ).toBeUndefined();

    const second = createEngagedState();
    const windupState = updateEntity(second.state, {
      ...second.enemy,
      attackWindupStartedAt: 900,
      attackWindupDurationMs: 500,
      attackWindupTargetId: second.leader.id,
    });

    expect(
      updateEnemyAbilitySystem(windupState, 1000, definitions)
        .enemyAbilityCastsByEnemyId?.[second.enemy.id],
    ).toBeUndefined();
  });

  it("requires a committed melee basic attack before another ability", () => {
    setAbilityIds("tin_crawler", ["ready"]);
    const definitions = { ready: createAbility("ready", { castDurationMs: 0, windupDurationMs: 0 }) };
    const { state, enemy, leader } = createEngagedState("tin_crawler", { x: 1, y: 0 });
    let nextState = updateEnemyAbilitySystem(state, 1000, definitions);
    nextState = updateEnemyAbilitySystem(nextState, 1001, definitions);
    nextState = applyStatusEffect(nextState, {
      type: "forcedEvasion",
      targetId: leader.id,
      durationMs: 5000,
    }, 1001);

    nextState = updateAttackSystem(nextState, new Set(), 2001);
    expect(isEnemyBasicAttackRequired(nextState, enemy.id)).toBe(true);

    nextState = updateAttackSystem(nextState, new Set(), 2501);
    expect(isEnemyBasicAttackRequired(nextState, enemy.id)).toBe(false);
    expect((nextState.entities[leader.id] as typeof leader).health).toBe(leader.health);

    nextState = updateEnemyAbilitySystem(nextState, 4001, definitions);
    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]?.abilityId).toBe("ready");
  });

  it("clears the gate when a ranged basic projectile launches", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const definitions = { ready: createAbility("ready", { castDurationMs: 0, windupDurationMs: 0 }) };
    const { state, enemy } = createEngagedState();
    let nextState = updateEnemyAbilitySystem(state, 1000, definitions);
    nextState = updateEnemyAbilitySystem(nextState, 1001, definitions);

    nextState = updateAttackSystem(nextState, new Set(), 2001);
    expect(isEnemyBasicAttackRequired(nextState, enemy.id)).toBe(true);

    nextState = updateAttackSystem(nextState, new Set(), 2501);
    expect(isEnemyBasicAttackRequired(nextState, enemy.id)).toBe(false);
    expect(nextState.combatProjectiles).toHaveLength(1);
  });

  it("keeps interrupted cooldowns ticking through crowd control", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const definitions = { ready: createAbility("ready") };
    const { state, enemy } = createEngagedState();
    let nextState = updateEnemyAbilitySystem(state, 1000, definitions);
    nextState = applyStatusEffect(nextState, {
      type: "silenced",
      targetId: enemy.id,
      durationMs: 10000,
    }, 1100);
    nextState = updateEnemyAbilitySystem(nextState, 1100, definitions);
    nextState = updateEnemyAbilitySystem(nextState, 3999, definitions);
    expect(
      nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]?.ready,
    ).toBeDefined();

    nextState = updateEnemyAbilitySystem(nextState, 4000, definitions);
    expect(nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]).toBeUndefined();
  });

  it("clears per-enemy runtime on respawn-style cleanup", () => {
    const { state, enemy } = createEngagedState();
    const runtimeState = withEnemyAbilityRuntime(state, enemy.id);
    const nextState = clearEnemyAbilityRuntimeForEnemy(runtimeState, enemy.id);

    expect(nextState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeUndefined();
    expect(nextState.enemyAbilityCooldownsByEnemyId?.[enemy.id]).toBeUndefined();
    expect(
      nextState.enemyAbilityBasicAttackRequiredByEnemyId?.[enemy.id],
    ).toBeUndefined();
  });

  it("clears runtime on map transition and prunes removed enemies", () => {
    const { state, enemy } = createEngagedState();
    const runtimeState = withEnemyAbilityRuntime(state, enemy.id);
    const transitionedState = clearMapTransitionRuntimeState(runtimeState);

    expect(transitionedState.enemyAbilityCastsByEnemyId).toEqual({});
    expect(transitionedState.enemyAbilityCooldownsByEnemyId).toEqual({});
    expect(transitionedState.enemyAbilityBasicAttackRequiredByEnemyId).toEqual({});

    const entities = { ...runtimeState.entities };
    delete entities[enemy.id];
    const prunedState = pruneMissingEntityRuntimeState({
      ...runtimeState,
      entities,
    });
    expect(prunedState.enemyAbilityCastsByEnemyId?.[enemy.id]).toBeUndefined();
    expect(prunedState.enemyAbilityCooldownsByEnemyId?.[enemy.id]).toBeUndefined();
    expect(
      prunedState.enemyAbilityBasicAttackRequiredByEnemyId?.[enemy.id],
    ).toBeUndefined();
  });

  it("clears active casts while preserving only valid cooldowns and gates for saves", () => {
    setAbilityIds("ember_imp", ["ready"]);
    const definitions = { ready: createAbility("ready") };
    const { state, enemy } = createEngagedState();
    const runtimeState = withEnemyAbilityRuntime(state, enemy.id);
    const sanitized = sanitizeEnemyAbilityRuntimeForSave(
      {
        ...runtimeState,
        enemyAbilityCooldownsByEnemyId: {
          [enemy.id]: {
            ready: {
              abilityId: "ready",
              casterId: enemy.id,
              startedAt: 1000,
              expiresAt: 4000,
            },
            expired: {
              abilityId: "expired",
              casterId: enemy.id,
              startedAt: 1000,
              expiresAt: 1500,
            },
          },
          missing: {
            ready: {
              abilityId: "ready",
              casterId: "missing",
              startedAt: 1000,
              expiresAt: 4000,
            },
          },
        },
      },
      state.entities,
      2000,
      definitions,
    );

    expect(sanitized.enemyAbilityCastsByEnemyId).toEqual({});
    expect(sanitized.enemyAbilityCooldownsByEnemyId).toEqual({
      [enemy.id]: {
        ready: {
          abilityId: "ready",
          casterId: enemy.id,
          startedAt: 1000,
          expiresAt: 4000,
        },
      },
    });
    expect(sanitized.enemyAbilityBasicAttackRequiredByEnemyId).toEqual({
      [enemy.id]: true,
    });

    const sanitizedGameState = sanitizeGameStateForSave(
      runtimeState,
      2000,
      definitions,
    );
    expect(sanitizedGameState.enemyAbilityCastsByEnemyId).toEqual({});
    expect(sanitizedGameState.enemyAbilityCooldownsByEnemyId).toEqual({
      [enemy.id]: runtimeState.enemyAbilityCooldownsByEnemyId?.[enemy.id],
    });
    expect(sanitizedGameState.enemyAbilityBasicAttackRequiredByEnemyId).toEqual({
      [enemy.id]: true,
    });
  });
});

function createAbility(
  id: string,
  overrides: Partial<EnemyAbilityDefinition> = {},
): EnemyAbilityDefinition {
  return {
    id,
    range: 3,
    cooldownMs: 3000,
    castDurationMs: 500,
    windupDurationMs: 250,
    resolve: ({ state }: EnemyAbilityResolutionContext) => state,
    ...overrides,
  };
}

function setAbilityIds(enemyTypeId: EnemyTypeId, abilityIds: string[]): void {
  ENEMY_TYPES[enemyTypeId].abilityIds = abilityIds;
}

function createEngagedState(
  enemyTypeId: EnemyTypeId = "ember_imp",
  leaderPosition = { x: 2, y: 0 },
): { state: GameState; enemy: Enemy; leader: ReturnType<typeof createCompanion> } {
  const leader = createCompanion("leader", leaderPosition, "Leader", "fighter");
  const enemy = {
    ...createEnemy("enemy", { x: 0, y: 0 }, "aggressive", {
      enemyTypeId,
      attackCooldownMs: 1000,
    }),
    state: "attack" as const,
    currentTargetId: leader.id,
    lastAttackAt: 0,
  };
  const state = createState([leader, enemy]);

  return { state, enemy, leader };
}

function createState(entities: GameEntity[]): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId: "leader",
    }),
  );
}

function withEnemyAbilityRuntime(state: GameState, enemyId: string): GameState {
  return {
    ...state,
    enemyAbilityCastsByEnemyId: {
      [enemyId]: {
        id: `${enemyId}:ready:1000`,
        abilityId: "ready",
        casterId: enemyId,
        targetId: "leader",
        phase: "casting",
        startedAt: 1000,
        castEndsAt: 1500,
        windupEndsAt: 1750,
        origin: { x: 0, y: 0 },
        targetPosition: { x: 2, y: 0 },
        direction: { x: 1, y: 0 },
      },
    },
    enemyAbilityCooldownsByEnemyId: {
      [enemyId]: {
        ready: {
          abilityId: "ready",
          casterId: enemyId,
          startedAt: 1000,
          expiresAt: 4000,
        },
      },
    },
    enemyAbilityBasicAttackRequiredByEnemyId: {
      [enemyId]: true,
    },
  };
}
