import { describe, expect, it } from "vitest";
import { updateAttackSystem } from "./attackSystem";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { createCompanion, createEnemy, createResource } from "./entities";
import { updateGatherSystem } from "./gatherSystem";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { sanitizeGameStateForSave } from "./saveGame";
import { updateSkillSystem } from "./skillSystem";
import {
  applyStatusEffect,
  clearStatusEffectsForEntity,
  dropAggroFromTarget,
  isMovementBlockedByStatus,
  removeStatusEffects,
  updateStatusEffects,
} from "./statusEffects";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, GameEntity } from "./types";

describe("status effects", () => {
  it("applies, refreshes, expires, removes, and clears statuses", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "companion");
    let state = createState([companion]);

    state = applyStatusEffect(
      state,
      {
        type: "immobilized",
        targetId: companion.id,
        durationMs: 1_000,
        sourceKey: "root",
      },
      100,
    );

    expect(isMovementBlockedByStatus(state, companion.id)).toBe(true);
    expect(state.statusEffectsById?.["companion-immobilized-root"]?.expiresAt).toBe(
      1_100,
    );

    state = applyStatusEffect(
      state,
      {
        type: "immobilized",
        targetId: companion.id,
        durationMs: 2_000,
        sourceKey: "root",
      },
      200,
    );

    expect(state.statusEffectsById?.["companion-immobilized-root"]?.expiresAt).toBe(
      2_200,
    );
    expect(updateStatusEffects(state, 2_199).statusEffectsById).toHaveProperty(
      "companion-immobilized-root",
    );
    expect(updateStatusEffects(state, 2_200).statusEffectsById).toEqual({});

    state = removeStatusEffects(state, {
      targetId: companion.id,
      type: "immobilized",
    });
    expect(state.statusEffectsById).toEqual({});

    state = applyStatusEffect(
      state,
      {
        type: "cursed",
        targetId: companion.id,
        durationMs: 1_000,
      },
      0,
    );
    expect(clearStatusEffectsForEntity(state, companion.id).statusEffectsById).toEqual(
      {},
    );
  });

  it("blocks movement without blocking basic attacks", () => {
    const attacker = {
      ...createCompanion("attacker", { x: 0, y: 0 }, "attacker"),
      state: "attack" as const,
      currentTargetId: "target",
    };
    const target = createEnemy("target", { x: 0.5, y: 0 }, "passive", {
      maxHealth: 50,
      evasion: 0,
    });
    const state = applyStatusEffect(
      createState([attacker, target], { partyLeaderId: attacker.id }),
      {
        type: "immobilized",
        targetId: attacker.id,
        durationMs: 5_000,
      },
      0,
    );

    const movedState = moveEntityTowardPositionIfUnoccupied(
      state,
      attacker,
      { x: 2, y: 0 },
    );
    const attackedState = updateAttackSystem(state, new Set(), 1_000);

    expect(movedState.entities[attacker.id].position).toEqual(attacker.position);
    expect(attackedState.entities[target.id]).toMatchObject({
      health: expect.any(Number),
    });
    expect((attackedState.entities[target.id] as typeof target).health).toBeLessThan(
      target.health,
    );
  });

  it("blocks attacks, skills, and gathering with the specific action blockers", () => {
    const disarmedAttacker = {
      ...createCompanion("disarmed", { x: 0, y: 0 }, "disarmed"),
      state: "attack" as const,
      currentTargetId: "target",
    };
    const cursedDefender = createCompanion(
      "cursed",
      { x: 0, y: 1 },
      "cursed",
      "defender",
    );
    const incapacitatedCollector = {
      ...createCompanion("collector", { x: 5, y: 5 }, "collector"),
      state: "gather" as const,
      currentTargetId: "wood",
      commandPriority: "direct" as const,
      lastGatherAt: 0,
    };
    const target = createEnemy("target", { x: 0.5, y: 0 }, "passive", {
      maxHealth: 50,
      evasion: 0,
    });
    const skillTarget = createEnemy("skill-target", { x: 1, y: 1 }, "passive");
    const wood = createResource("wood", { x: 5.5, y: 5 });
    let state = createState(
      [disarmedAttacker, cursedDefender, incapacitatedCollector, target, skillTarget, wood],
      { partyLeaderId: disarmedAttacker.id },
    );

    state = applyStatusEffect(
      state,
      { type: "disarmed", targetId: disarmedAttacker.id, durationMs: 5_000 },
      0,
    );
    state = applyStatusEffect(
      state,
      { type: "cursed", targetId: cursedDefender.id, durationMs: 5_000 },
      0,
    );
    state = applyStatusEffect(
      state,
      {
        type: "incapacitated",
        targetId: incapacitatedCollector.id,
        durationMs: 5_000,
      },
      0,
    );

    const attackedState = updateAttackSystem(state, new Set(), 1_000);
    const skillState = updateSkillSystem(state, 1_000);
    const gatheredState = updateGatherSystem(state, new Set(), 1_000);

    expect((attackedState.entities[target.id] as typeof target).health).toBe(
      target.health,
    );
    expect(
      skillState.skillCooldownsByCompanionId?.[cursedDefender.id]?.throw_rock,
    ).toBeUndefined();
    expect(gatheredState.entities[wood.id]).toMatchObject({
      durability: wood.durability,
    });
  });

  it("consumes forced evasion before normal evasion for physical and magic damage", () => {
    const attacker = createEnemy("attacker", { x: 0, y: 0 }, "aggressive", {
      attack: 10,
    });
    const target = createCompanion("target", { x: 1, y: 0 }, "target");
    let state = applyStatusEffect(
      createState([attacker, target]),
      {
        type: "forcedEvasion",
        targetId: target.id,
        durationMs: 5_000,
      },
      0,
    );

    const physical = resolveAndApplyCombatDamage(state, attacker, target, {
      damageType: "physical",
      powerMultiplier: 1,
      allowEvasion: false,
      allowPassiveBlock: false,
      now: 1_000,
    });

    expect(physical.evaded).toBe(true);
    expect(physical.finalDamage).toBe(0);
    expect(physical.state.statusEffectsById).toEqual({});

    state = applyStatusEffect(
      physical.state,
      {
        type: "forcedEvasion",
        targetId: target.id,
        durationMs: 5_000,
      },
      1_000,
    );

    const magic = resolveAndApplyCombatDamage(state, attacker, target, {
      damageType: "magic",
      powerMultiplier: 1,
      allowEvasion: false,
      allowPassiveBlock: false,
      now: 2_000,
    });

    expect(magic.evaded).toBe(true);
    expect(magic.finalDamage).toBe(0);
  });

  it("boosts one outgoing attack and then consumes next attack damage bonus", () => {
    const attacker = createEnemy("attacker", { x: 0, y: 0 }, "aggressive", {
      attack: 10,
    });
    const target = createCompanion("target", { x: 1, y: 0 }, "target");
    const state = applyStatusEffect(
      createState([attacker, target]),
      {
        type: "nextAttackDamageBonus",
        targetId: attacker.id,
        durationMs: 5_000,
        damageMultiplierBonus: 0.5,
      },
      0,
    );

    const firstHit = resolveAndApplyCombatDamage(state, attacker, target, {
      damageType: "physical",
      powerMultiplier: 1,
      allowEvasion: false,
      allowPassiveBlock: false,
      now: 1_000,
    });
    const secondTarget = firstHit.state.entities[target.id] as Companion;
    const secondHit = resolveAndApplyCombatDamage(
      firstHit.state,
      attacker,
      secondTarget,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2_000,
      },
    );

    expect(firstHit.rawDamage).toBe(15);
    expect(firstHit.state.statusEffectsById).toEqual({});
    expect(secondHit.rawDamage).toBe(10);
  });

  it("applies defense buffs to physical defense until they expire", () => {
    const attacker = createEnemy("attacker", { x: 0, y: 0 }, "aggressive", {
      attack: 100,
    });
    const target = {
      ...createCompanion("target", { x: 1, y: 0 }, "target"),
      naturalStats: {
        strength: 1,
        dexterity: 1,
        constitution: 100,
        intelligence: 1,
        wisdom: 1,
      },
    };
    const state = applyStatusEffect(
      createState([attacker, target]),
      {
        type: "defenseBuff",
        targetId: target.id,
        durationMs: 1_000,
        defenseBonusPercent: 25,
      },
      0,
    );

    const buffedHit = resolveAndApplyCombatDamage(state, attacker, target, {
      damageType: "physical",
      powerMultiplier: 1,
      allowEvasion: false,
      allowPassiveBlock: false,
      now: 500,
    });
    const expiredState = updateStatusEffects(state, 1_000);
    const normalHit = resolveAndApplyCombatDamage(expiredState, attacker, target, {
      damageType: "physical",
      powerMultiplier: 1,
      allowEvasion: false,
      allowPassiveBlock: false,
      now: 1_500,
    });

    expect(buffedHit.targetDefense).toBe(62.5);
    expect(buffedHit.finalDamage).toBeLessThan(normalHit.finalDamage);
    expect(expiredState.statusEffectsById).toEqual({});
  });

  it("ticks poison, extends same-source duration, stacks different sources, and clears on death", () => {
    const target = createEnemy("target", { x: 0, y: 0 }, "passive", {
      maxHealth: 50,
    });
    let state = createState([target]);

    state = applyStatusEffect(
      state,
      {
        type: "poison",
        targetId: target.id,
        sourceKey: "hunter-poison",
        tickDamage: 3,
        durationMs: 4_000,
      },
      0,
    );
    state = applyStatusEffect(
      state,
      {
        type: "poison",
        targetId: target.id,
        sourceKey: "hunter-poison",
        tickDamage: 2,
        durationMs: 4_000,
      },
      1_000,
    );
    state = applyStatusEffect(
      state,
      {
        type: "poison",
        targetId: target.id,
        sourceKey: "other-poison",
        tickDamage: 4,
        durationMs: 4_000,
      },
      1_000,
    );

    expect(
      state.statusEffectsById?.["target-poison-hunter-poison"],
    ).toMatchObject({
      tickDamage: 3,
      expiresAt: 8_000,
    });

    const firstTick = updateStatusEffects(state, 3_000);
    expect((firstTick.entities[target.id] as typeof target).health).toBe(43);

    const lethalState = applyStatusEffect(
      firstTick,
      {
        type: "poison",
        targetId: target.id,
        sourceKey: "lethal-poison",
        tickDamage: 50,
        durationMs: 4_000,
      },
      3_000,
    );
    const deadState = updateStatusEffects(lethalState, 5_000);

    expect(deadState.entities[target.id]).toMatchObject({ state: "dead" });
    expect(deadState.statusEffectsById).toEqual({});
  });

  it("drops aggro from a target and falls back to idle when nobody else can be targeted", () => {
    const target = createCompanion("target", { x: 0, y: 0 }, "target");
    const ally = createCompanion("ally", { x: 2, y: 0 }, "target");
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: target.id,
    };
    const retargetedState = dropAggroFromTarget(
      createState([target, ally, enemy]),
      target.id,
    );
    const idleState = dropAggroFromTarget(createState([target, enemy]), target.id);

    expect(retargetedState.entities[enemy.id]).toMatchObject({
      state: "attack",
      currentTargetId: ally.id,
    });
    expect(idleState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("clears statuses during save sanitization, map cleanup, and missing entity pruning", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "companion");
    const statusState = applyStatusEffect(
      createState([companion], { partyLeaderId: companion.id }),
      {
        type: "cursed",
        targetId: companion.id,
        durationMs: 5_000,
      },
      0,
    );

    expect(sanitizeGameStateForSave(statusState).statusEffectsById).toEqual({});
    expect(clearMapTransitionRuntimeState(statusState).statusEffectsById).toEqual({});
    expect(
      pruneMissingEntityRuntimeState({
        ...statusState,
        entities: {},
      }).statusEffectsById,
    ).toEqual({});
  });
});

function createState(
  entities: GameEntity[],
  overrides: Partial<GameState> = {},
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId: "companion",
      statusEffectsById: {},
      ...overrides,
    }),
  );
}
