import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { MAP_ONE_ID } from "./debugMap";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import {
  resolveSkillEffect,
  updateSkillShieldBlockPositions,
  type SkillUse,
} from "./skillEffectResolution";
import { SKILL_DEFINITIONS } from "./skills";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type {
  ClassId,
  Companion,
  Enemy,
  GameEntity,
  GameMap,
  Position,
  SkillDefinition,
} from "./types";

describe("skill effect resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies damage skills and enemy aggro side effects", () => {
    const caster = createSkillCompanion("caster", "fighter", { x: 0, y: 0 }, "elementalist");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { maxHealth: 200 });
    const result = resolveSkillEffect(
      createSkillState([caster, enemy]),
      caster,
      createSkillUse("elemental_bolt", enemy),
      1000,
    );
    const damagedEnemy = result.state.entities.enemy as Enemy;

    expect(result.shouldConsumeCooldown).toBe(true);
    expect(result.appliedTargetId).toBe(enemy.id);
    expect(damagedEnemy.health).toBeLessThan(enemy.health);
    expect(damagedEnemy).toMatchObject({
      state: "attack",
      currentTargetId: caster.id,
    });
    expect(result.state.skillVisualEvents?.at(-1)).toMatchObject({
      type: "projectile",
      skillId: "elemental_bolt",
    });
  });

  it("routes lethal skill damage through XP and drop side effects", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const caster = createSkillCompanion("caster", "fighter", { x: 0, y: 0 }, "elementalist");
    const enemy = createSkillEnemy("wolf", { x: 1, y: 0 }, {
      enemyTypeId: "wolf",
      maxHealth: 1,
      xpReward: 5,
    });
    const result = resolveSkillEffect(
      createSkillState([caster, enemy]),
      caster,
      createSkillUse("elemental_bolt", enemy),
      1000,
    );
    const updatedCaster = result.state.entities.caster as Companion;

    expect(result.state.entities.wolf).toMatchObject({
      state: "dead",
      health: 0,
    });
    expect(updatedCaster.characterXp).toBeGreaterThan(caster.characterXp);
    expect(result.state.dropVisualEvents?.length ?? 0).toBeGreaterThan(0);
  });

  it("moves lunge skills only to valid clear positions and emits a slash visual", () => {
    const caster = createSkillCompanion("caster", "fighter", { x: 1, y: 1 });
    const enemy = createSkillEnemy("enemy", { x: 6, y: 1 }, { maxHealth: 20 });
    const result = resolveSkillEffect(
      createSkillState([caster, enemy], {
        map: createSkillMap([], 10),
      }),
      caster,
      createSkillUse("kick", enemy),
      1000,
    );
    const lungedCaster = result.state.entities.caster as Companion;

    expect(result.shouldConsumeCooldown).toBe(true);
    expect(lungedCaster.position.x).toBeGreaterThan(caster.position.x);
    expect(lungedCaster.position.x).toBeLessThan(enemy.position.x);
    expect(result.state.skillVisualEvents?.at(-1)).toMatchObject({
      type: "slash",
      skillId: "kick",
    });
  });

  it("applies sweeping damage to the main target and nearby splash targets", () => {
    const caster = createSkillCompanion("blade", "fighter", { x: 0, y: 0 }, "blade");
    const primary = createSkillEnemy("primary", { x: 1, y: 0 }, { maxHealth: 20 });
    const splash = createSkillEnemy("splash", { x: 1, y: 1 }, { maxHealth: 20 });
    const far = createSkillEnemy("far", { x: 4, y: 4 }, { maxHealth: 20 });
    const result = resolveSkillEffect(
      createSkillState([caster, primary, splash, far]),
      caster,
      createSkillUse("sweeping_strike", primary),
      1000,
    );

    expect((result.state.entities.primary as Enemy).health).toBeLessThan(
      primary.health,
    );
    expect((result.state.entities.splash as Enemy).health).toBeLessThan(
      splash.health,
    );
    expect((result.state.entities.far as Enemy).health).toBe(far.health);
  });

  it("applies Second Wind as a self-only percent heal", () => {
    const caster = {
      ...createSkillCompanion("blade", "fighter", { x: 0, y: 0 }, "blade"),
      health: 10,
      maxHealth: 100,
    };
    const ally = {
      ...createSkillCompanion("ally", "fighter", { x: 1, y: 0 }, "blade"),
      health: 10,
      maxHealth: 100,
    };
    const healed = resolveSkillEffect(
      createSkillState([caster, ally]),
      caster,
      createSkillUse("second_wind", caster),
      1000,
    );
    const skipped = resolveSkillEffect(
      createSkillState([caster, ally]),
      caster,
      createSkillUse("second_wind", ally),
      1000,
    );

    expect(healed.shouldConsumeCooldown).toBe(true);
    expect(healed.state.entities.blade).toMatchObject({ health: 30 });
    expect(skipped.shouldConsumeCooldown).toBe(false);
    expect(skipped.state.entities.ally).toMatchObject({ health: 10 });
  });

  it("applies Blade Parry mitigation procs to landed physical damage", () => {
    const caster = createSkillCompanion("blade", "defender", { x: 0, y: 0 }, "blade");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { attack: 20 });
    const parryState = resolveSkillEffect(
      createSkillState([caster, enemy]),
      caster,
      createSkillUse("blade_parry", caster),
      1000,
    ).state;

    expect(parryState.skillDamageMitigationsByCompanionId?.blade).toMatchObject({
      remainingProcs: 2,
      mitigationPercent: 50,
      expiresAt: 11000,
    });

    const firstHit = resolveAndApplyCombatDamage(
      parryState,
      enemy,
      parryState.entities.blade as Companion,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );

    expect(firstHit.finalDamage).toBeLessThan(firstHit.rawDamage);
    expect(
      firstHit.state.skillDamageMitigationsByCompanionId?.blade?.remainingProcs,
    ).toBe(1);
  });

  it("does not consume Blade Parry on magic damage", () => {
    const caster = createSkillCompanion("blade", "defender", { x: 0, y: 0 }, "blade");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { attack: 20 });
    const parryState = resolveSkillEffect(
      createSkillState([caster, enemy]),
      caster,
      createSkillUse("blade_parry", caster),
      1000,
    ).state;

    const magicHit = resolveAndApplyCombatDamage(
      parryState,
      enemy,
      parryState.entities.blade as Companion,
      {
        damageType: "magic",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );

    expect(magicHit.state.skillDamageMitigationsByCompanionId?.blade?.remainingProcs).toBe(2);
  });

  it("stacks Edge Focus and Press the Opening damage bonuses", () => {
    const blade = createSkillCompanion("blade", "fighter", { x: 0, y: 0 }, "blade");
    const ally = createSkillCompanion("ally", "fighter", { x: 1, y: 0 }, "blade");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 1 }, { maxHealth: 100 });
    const edgeState = resolveSkillEffect(
      createSkillState([blade, ally, enemy]),
      blade,
      createSkillUse("edge_focus", blade),
      1000,
    ).state;
    const pressState = resolveSkillEffect(
      edgeState,
      edgeState.entities.blade as Companion,
      createSkillUse("press_the_opening", edgeState.entities.blade as Companion),
      1000,
    ).state;

    expect(pressState.skillSelfBuffsByCompanionId?.blade).toMatchObject({
      bonusDamage: 1,
      expiresAt: 61000,
    });
    expect(pressState.skillPartyBuffsBySourceId?.blade).toMatchObject({
      bonusDamage: 1,
      expiresAt: 61000,
    });

    const bladeHit = resolveAndApplyCombatDamage(
      pressState,
      pressState.entities.blade as Companion,
      pressState.entities.enemy as Enemy,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );
    const allyHit = resolveAndApplyCombatDamage(
      pressState,
      pressState.entities.ally as Companion,
      pressState.entities.enemy as Enemy,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );

    expect(bladeHit.rawDamage).toBe(allyHit.rawDamage + 1);
  });

  it("applies taunt, mark, bind, buff, gather, and shield effects", () => {
    const taunter = createSkillCompanion("taunter", "defender", { x: 0, y: 0 });
    const tauntEnemy = createSkillEnemy("taunt-enemy", { x: 1, y: 0 });
    const taunted = resolveSkillEffect(
      createSkillState([taunter, tauntEnemy]),
      taunter,
      createSkillUse("throw_rock", tauntEnemy),
      1000,
    ).state.entities["taunt-enemy"] as Enemy;

    expect(taunted).toMatchObject({
      state: "attack",
      currentTargetId: taunter.id,
    });

    const hunter = createSkillCompanion("hunter", "fighter", { x: 0, y: 0 }, "hunter");
    const markedEnemy = createSkillEnemy("marked-enemy", { x: 1, y: 0 });
    const markedState = resolveSkillEffect(
      createSkillState([hunter, markedEnemy]),
      hunter,
      createSkillUse("mark_target", markedEnemy),
      1000,
    ).state;

    expect(markedState.skillMarksByEnemyId?.["marked-enemy"]).toMatchObject({
      sourceId: hunter.id,
      targetId: markedEnemy.id,
    });

    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    const boundEnemy = createSkillEnemy("bound-enemy", { x: 1, y: 0 });
    const boundState = resolveSkillEffect(
      createSkillState([runecaster, boundEnemy]),
      runecaster,
      createSkillUse("binding_rune", boundEnemy),
      1000,
    ).state;

    expect(boundState.skillBindsByEnemyId?.["bound-enemy"]).toMatchObject({
      sourceId: runecaster.id,
      targetId: boundEnemy.id,
    });

    const beast = createSkillCompanion("beast", "fighter", { x: 0, y: 0 }, "beast");
    const selfBuffState = resolveSkillEffect(
      createSkillState([beast]),
      beast,
      createSkillUse("feral_surge", beast),
      1000,
    ).state;

    expect(selfBuffState.skillSelfBuffsByCompanionId?.beast).toMatchObject({
      companionId: beast.id,
      bonusDamage: 1,
    });
    expect((selfBuffState.entities.beast as Companion).health).toBe(
      beast.health - 1,
    );

    const support = createSkillCompanion("support", "support", { x: 0, y: 0 });
    const ally = createSkillCompanion("ally", "fighter", { x: 1, y: 0 });
    const allyBuffState = resolveSkillEffect(
      createSkillState([support, ally]),
      support,
      createSkillUse("rally_call", ally),
      1000,
    ).state;

    expect(allyBuffState.skillSelfBuffsByCompanionId?.ally).toMatchObject({
      companionId: ally.id,
      bonusDamage: 1,
    });

    const collector = createSkillCompanion("collector", "gatherer", { x: 0, y: 0 });
    const gatherBuffState = resolveSkillEffect(
      createSkillState([collector]),
      collector,
      createSkillUse("field_hands", collector),
      1000,
    ).state;

    expect(gatherBuffState.skillGatherBuffsByCompanionId?.collector).toMatchObject({
      companionId: collector.id,
      bonusGatherSpeed: 1,
    });

    const defender = createSkillCompanion("defender", "defender", { x: 2, y: 2 });
    const shieldState = resolveSkillEffect(
      createSkillState([defender]),
      defender,
      createSkillUse("guard_up", defender),
      1000,
    ).state;

    expect(shieldState.skillShieldBlocksById?.["defender-guard_up"]).toMatchObject({
      ownerId: defender.id,
      remainingBlocks: 1,
    });
  });

  it("applies heal and self-cost heal effects with healing telemetry", () => {
    const healer = createSkillCompanion("healer", "support", { x: 0, y: 0 }, "lightbearer");
    const ally = {
      ...createSkillCompanion("ally", "fighter", { x: 1, y: 0 }),
      health: 5,
    };
    const healResult = resolveSkillEffect(
      startDebugTelemetryRecording(createSkillState([healer, ally])),
      healer,
      createSkillUse("light_mend", ally),
      1000,
    );

    expect((healResult.state.entities.ally as Companion).health).toBeGreaterThan(
      ally.health,
    );
    expect(
      healResult.state.debugTelemetry?.events.some(
        (event) => event.type === "healing_resolved",
      ),
    ).toBe(true);

    const penitent = createSkillCompanion(
      "penitent",
      "support",
      { x: 0, y: 0 },
      "penitent",
    );
    const target = {
      ...createSkillCompanion("target", "fighter", { x: 1, y: 0 }),
      health: 5,
    };
    const selfCostState = resolveSkillEffect(
      createSkillState([penitent, target]),
      penitent,
      createSkillUse("penitents_gift", target),
      1000,
    ).state;

    expect((selfCostState.entities.target as Companion).health).toBeGreaterThan(
      target.health,
    );
    expect((selfCostState.entities.penitent as Companion).health).toBe(
      penitent.health - 1,
    );
  });

  it("returns no cooldown consumption when quick step cannot dash", () => {
    const baseSupport = createSkillCompanion("support", "support", { x: 3, y: 3 });
    const support = {
      ...baseSupport,
      skillBehavior: {
        ...baseSupport.skillBehavior,
        mobilitySkillUseMode: "defensive" as const,
      },
    };
    const enemy = {
      ...createSkillEnemy("enemy", { x: 9, y: 3 }),
      state: "attack" as const,
      currentTargetId: support.id,
    };
    const result = resolveSkillEffect(
      createSkillState([support, enemy], {
        map: createSkillMap(
          [
            { x: 2, y: 3 },
            { x: 2, y: 2 },
            { x: 2, y: 4 },
            { x: 3, y: 2 },
            { x: 3, y: 4 },
          ],
          12,
        ),
      }),
      support,
      createSkillUse("quick_step", enemy),
      1000,
    );

    expect(result.shouldConsumeCooldown).toBe(false);
    expect(result.state.entities.support.position).toEqual(support.position);
  });

  it("updates shield block placement from the latest owner position and target", () => {
    const defender = createSkillCompanion("defender", "defender", { x: 2, y: 2 });
    const enemy = createSkillEnemy("enemy", { x: 4, y: 2 });
    const state = createSkillState([defender, enemy], {
      skillShieldBlocksById: {
        "defender-guard_up": {
          id: "defender-guard_up",
          ownerId: defender.id,
          position: { x: 2, y: 1 },
          rotationRadians: 0,
          expiresAt: 5000,
          remainingBlocks: 1,
        },
      },
    });
    const nextState = updateSkillShieldBlockPositions(state);

    expect(nextState.skillShieldBlocksById?.["defender-guard_up"].position.x).toBe(
      3,
    );
    expect(nextState.skillShieldBlocksById?.["defender-guard_up"].position.y).toBe(
      2,
    );
  });
});

function createSkillUse(
  skillId: SkillDefinition["id"],
  target?: SkillUse["target"],
): SkillUse {
  return {
    skill: SKILL_DEFINITIONS[skillId],
    target,
    score: 1,
    selectionPriority: 0,
  };
}

function createSkillCompanion(
  id: string,
  role: Companion["role"],
  position: Position,
  classId: ClassId = "beginner",
): Companion {
  return {
    ...createCompanion(id, position, "leader", role, 1, classId),
    state: "idle",
    currentTargetId: null,
  };
}

function createSkillEnemy(
  id: string,
  position: Position,
  options: Parameters<typeof createEnemy>[3] = {},
): Enemy {
  return createEnemy(id, position, "aggressive", {
    defense: 0,
    magicDefense: 0,
    evasion: 0,
    ...options,
  });
}

function createSkillState(
  entities: GameEntity[],
  overrides: Partial<GameState> = {},
): GameState {
  const firstCompanion = entities.find(
    (entity): entity is Companion => entity.kind === "companion",
  );

  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createSkillMap(),
      partyLeaderId: firstCompanion?.id ?? "",
      ...overrides,
    }),
  );
}

function createSkillMap(walls: Position[] = [], columns = 8): GameMap {
  return {
    displayName: "Skill Effect Test Map",
    debugName: "skill-effect-test-map",
    columns,
    rows: 8,
    walls,
    teleports: [],
    healingFountains: [],
  };
}
