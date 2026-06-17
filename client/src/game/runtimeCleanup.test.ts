import { describe, expect, it } from "vitest";
import { clearFrameMovementPlanning } from "./movementState";
import {
  clearMapTransitionRuntimeState,
  pruneMissingEntityRuntimeState,
} from "./mapRuntimeCleanup";
import { clearExpiredSkillRuntimeState } from "./state";
import { createCompanion, createEnemy } from "./entities";
import { addEntity, updateEntity } from "./state";
import { createTestGameState } from "./testState";
import type { ActiveCombatProjectile, SkillMarkState, SkillVisualEvent } from "./types";

describe("runtime cleanup", () => {
  it("preserves the state reference when movement planning has no frame data", () => {
    const state = createTestGameState({
      movementPathRetryAtMsByEntityId: {
        "companion-1": 1500,
      },
      simulationTimeMs: 1000,
    });

    expect(clearFrameMovementPlanning(state)).toBe(state);
  });

  it("clears only expired movement retry entries when movement planning changes", () => {
    const state = createTestGameState({
      movementPathRetryAtMsByEntityId: {
        "companion-1": 900,
        "companion-2": 1500,
      },
      simulationTimeMs: 1000,
    });

    const nextState = clearFrameMovementPlanning(state);

    expect(nextState).not.toBe(state);
    expect(nextState.movementPathRetryAtMsByEntityId).toEqual({
      "companion-2": 1500,
    });
  });

  it("preserves the state reference when skill runtime data has not expired", () => {
    const activeMark: SkillMarkState = {
      sourceId: "companion-1",
      targetId: "enemy-1",
      bonusDamage: 2,
      expiresAt: 2000,
    };
    const activeVisual: SkillVisualEvent = {
      id: "visual-1",
      type: "slash",
      sourceId: "companion-1",
      targetId: "enemy-1",
      createdAt: 900,
      expiresAt: 2000,
    };
    const state = createTestGameState({
      skillMarksByEnemyId: {
        "enemy-1": activeMark,
      },
      skillVisualEvents: [activeVisual],
    });

    expect(clearExpiredSkillRuntimeState(state, 1000)).toBe(state);
  });

  it("removes expired skill runtime data while keeping active entries", () => {
    const activeMark: SkillMarkState = {
      sourceId: "companion-1",
      targetId: "enemy-1",
      bonusDamage: 2,
      expiresAt: 2000,
    };
    const expiredMark: SkillMarkState = {
      sourceId: "companion-2",
      targetId: "enemy-2",
      bonusDamage: 1,
      expiresAt: 900,
    };
    const activeVisual: SkillVisualEvent = {
      id: "visual-1",
      type: "slash",
      sourceId: "companion-1",
      targetId: "enemy-1",
      createdAt: 900,
      expiresAt: 2000,
    };
    const expiredVisual: SkillVisualEvent = {
      id: "visual-2",
      type: "heal",
      sourceId: "companion-2",
      createdAt: 800,
      expiresAt: 900,
    };
    const state = createTestGameState({
      skillMarksByEnemyId: {
        "enemy-1": activeMark,
        "enemy-2": expiredMark,
      },
      skillLifestealBuffsByCompanionId: {
        "companion-1": {
          companionId: "companion-1",
          lifestealPercent: 10,
          expiresAt: 2000,
        },
        "companion-2": {
          companionId: "companion-2",
          lifestealPercent: 10,
          expiresAt: 900,
        },
      },
      skillVisualEvents: [activeVisual, expiredVisual],
    });

    const nextState = clearExpiredSkillRuntimeState(state, 1000);

    expect(nextState).not.toBe(state);
    expect(nextState.skillMarksByEnemyId).toEqual({
      "enemy-1": activeMark,
    });
    expect(nextState.skillLifestealBuffsByCompanionId).toEqual({
      "companion-1": {
        companionId: "companion-1",
        lifestealPercent: 10,
        expiresAt: 2000,
      },
    });
    expect(nextState.skillVisualEvents).toEqual([activeVisual]);
  });

  it("removes expired nested skill cooldown maps and keeps active entries", () => {
    const state = createTestGameState({
      skillCooldownsByCompanionId: {
        "companion-1": {
          kick: {
            companionId: "companion-1",
            skillId: "kick",
            expiresAt: 2000,
          },
          throw_rock: {
            companionId: "companion-1",
            skillId: "throw_rock",
            expiresAt: 900,
          },
        },
        "companion-2": {
          field_hands: {
            companionId: "companion-2",
            skillId: "field_hands",
            expiresAt: 900,
          },
        },
      },
    });

    const nextState = clearExpiredSkillRuntimeState(state, 1000);

    expect(nextState.skillCooldownsByCompanionId).toEqual({
      "companion-1": {
        kick: {
          companionId: "companion-1",
          skillId: "kick",
          expiresAt: 2000,
        },
      },
    });
  });

  it("keeps skill cooldowns and clears global cooldowns on map transition", () => {
    const projectile: ActiveCombatProjectile = {
      id: "projectile-1",
      sourceId: "enemy-1",
      targetId: "leader",
      position: { x: 1, y: 1 },
      targetFallbackPosition: { x: 2, y: 1 },
      speed: 12,
      impactRadius: 0.3,
      visualProfileId: "goblin_thrower",
      launchedAt: 1000,
      damageType: "physical",
      powerMultiplier: 1,
    };
    const state = createTestGameState({
      combatProjectiles: [projectile],
      skillCooldownsByCompanionId: {
        leader: {
          kick: {
            companionId: "leader",
            skillId: "kick",
            expiresAt: 6000,
          },
        },
      },
      skillLifestealBuffsByCompanionId: {
        leader: {
          companionId: "leader",
          lifestealPercent: 10,
          expiresAt: 6000,
        },
      },
      globalCooldownsByCompanionId: {
        leader: {
          companionId: "leader",
          source: "skill",
          skillId: "kick",
          startedAt: 1000,
          expiresAt: 3000,
        },
      },
      companionAoeChannelsByCasterId: {
        leader: {
          id: "shockwave",
          abilityId: "shield_shockwave",
          casterId: "leader",
          shape: {
            type: "circle",
            center: { x: 1, y: 1 },
            radius: 2,
          },
          visualIntent: "partyOffensive",
          damageType: "physical",
          powerMultiplier: 0.5,
          bindDurationMs: 1000,
          startedAt: 1000,
          channelEndsAt: 1200,
        },
      },
    });

    const nextState = clearMapTransitionRuntimeState(state);

    expect(nextState.skillCooldownsByCompanionId).toEqual(
      state.skillCooldownsByCompanionId,
    );
    expect(nextState.skillLifestealBuffsByCompanionId).toEqual({});
    expect(nextState.globalCooldownsByCompanionId).toEqual({});
    expect(nextState.combatProjectiles).toEqual([]);
    expect(nextState.companionAoeChannelsByCasterId).toEqual({});
  });

  it("preserves the state reference when updating the same entity reference", () => {
    const companion = createCompanion("companion-1", { x: 1, y: 1 }, "Companion");
    const state = addEntity(createTestGameState(), companion);

    expect(updateEntity(state, companion)).toBe(state);
  });

  it("updates follow trails when an entity position changes", () => {
    const companion = createCompanion("companion-1", { x: 1, y: 1 }, "Companion");
    const state = addEntity(createTestGameState(), companion);

    const nextState = updateEntity(state, {
      ...companion,
      position: { x: 2, y: 1 },
    });

    expect(nextState).not.toBe(state);
    expect(nextState.followTrailsByEntityId[companion.id]).toEqual([
      companion.position,
    ]);
  });

  it("prunes retained runtime records for missing entities", () => {
    const companion = createCompanion("companion-1", { x: 1, y: 1 }, "Companion");
    const enemy = createEnemy("enemy-1", { x: 2, y: 1 });
    const state = addEntity(addEntity(createTestGameState(), companion), enemy);
    const nextState = pruneMissingEntityRuntimeState({
      ...state,
      entities: {
        [companion.id]: companion,
      },
      movementPathsByEntityId: {
        [companion.id]: {
          targetKey: "current",
          targetPosition: { x: 2, y: 2 },
          waypoints: [{ x: 1, y: 1 }],
        },
        [enemy.id]: {
          targetKey: "stale",
          targetPosition: { x: 3, y: 3 },
          waypoints: [{ x: 2, y: 1 }],
        },
      },
      skillMarksByEnemyId: {
        [enemy.id]: {
          bonusDamage: 2,
          expiresAt: 2_000,
          sourceId: companion.id,
          targetId: enemy.id,
        },
      },
      skillCooldownsByCompanionId: {
        [companion.id]: {
          kick: {
            companionId: companion.id,
            skillId: "kick",
            expiresAt: 2000,
          },
        },
        [enemy.id]: {
          throw_rock: {
            companionId: enemy.id,
            skillId: "throw_rock",
            expiresAt: 2000,
          },
        },
      },
      skillLifestealBuffsByCompanionId: {
        [companion.id]: {
          companionId: companion.id,
          lifestealPercent: 10,
          expiresAt: 2000,
        },
        [enemy.id]: {
          companionId: enemy.id,
          lifestealPercent: 10,
          expiresAt: 2000,
        },
      },
      globalCooldownsByCompanionId: {
        [companion.id]: {
          companionId: companion.id,
          source: "basic_attack",
          startedAt: 1000,
          expiresAt: 3000,
        },
        [enemy.id]: {
          companionId: enemy.id,
          source: "skill",
          skillId: "throw_rock",
          startedAt: 1000,
          expiresAt: 3000,
        },
      },
      companionAoeChannelsByCasterId: {
        [companion.id]: {
          id: "active-shockwave",
          abilityId: "shield_shockwave",
          casterId: companion.id,
          shape: {
            type: "circle",
            center: companion.position,
            radius: 2,
          },
          visualIntent: "partyOffensive",
          damageType: "physical",
          powerMultiplier: 0.5,
          bindDurationMs: 1000,
          startedAt: 1000,
          channelEndsAt: 1200,
        },
        [enemy.id]: {
          id: "stale-shockwave",
          abilityId: "shield_shockwave",
          casterId: enemy.id,
          shape: {
            type: "circle",
            center: enemy.position,
            radius: 2,
          },
          visualIntent: "partyOffensive",
          damageType: "physical",
          powerMultiplier: 0.5,
          bindDurationMs: 1000,
          startedAt: 1000,
          channelEndsAt: 1200,
        },
      },
      flaskRechargeCountedEnemyDefeats: {
        [enemy.id]: 1_000,
      },
    });

    expect(nextState.movementPathsByEntityId).toEqual({
      [companion.id]: {
        targetKey: "current",
        targetPosition: { x: 2, y: 2 },
        waypoints: [{ x: 1, y: 1 }],
      },
    });
    expect(nextState.skillMarksByEnemyId).toEqual({});
    expect(nextState.skillCooldownsByCompanionId).toEqual({
      [companion.id]: {
        kick: {
          companionId: companion.id,
          skillId: "kick",
          expiresAt: 2000,
        },
      },
    });
    expect(nextState.skillLifestealBuffsByCompanionId).toEqual({
      [companion.id]: {
        companionId: companion.id,
        lifestealPercent: 10,
        expiresAt: 2000,
      },
    });
    expect(nextState.globalCooldownsByCompanionId).toEqual({
      [companion.id]: {
        companionId: companion.id,
        source: "basic_attack",
        startedAt: 1000,
        expiresAt: 3000,
      },
    });
    expect(nextState.companionAoeChannelsByCasterId).toEqual({
      [companion.id]: {
        id: "active-shockwave",
        abilityId: "shield_shockwave",
        casterId: companion.id,
        shape: {
          type: "circle",
          center: companion.position,
          radius: 2,
        },
        visualIntent: "partyOffensive",
        damageType: "physical",
        powerMultiplier: 0.5,
        bindDurationMs: 1000,
        startedAt: 1000,
        channelEndsAt: 1200,
      },
    });
    expect(nextState.flaskRechargeCountedEnemyDefeats).toEqual({});
  });
});
