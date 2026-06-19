import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { MAP_ONE_ID } from "./debugMap";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import {
  SHIELD_SHOCKWAVE_CHANNEL_MS,
  updateCompanionAoeChannelSystem,
} from "./companionAoeChannelSystem";
import {
  resolveSkillEffect,
  updateSkillShieldBlockPositions,
  type SkillUse,
} from "./skillEffectResolution";
import { updateRuneSkillRuntime } from "./skillRuntime";
import { SKILL_DEFINITIONS } from "./skills";
import { addEntity, updateEntity, type GameState } from "./state";
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

  it("applies Hunter control, fake death, and forced evasion statuses", () => {
    const hunter = createSkillCompanion("hunter", "fighter", { x: 0, y: 0 }, "hunter");
    const enemy = {
      ...createSkillEnemy("enemy", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: hunter.id,
    };
    const pinningResult = resolveSkillEffect(
      createSkillState([hunter, enemy]),
      hunter,
      createSkillUse("pinning_shot", enemy),
      1000,
    );

    expect(Object.values(pinningResult.state.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "immobilized",
        targetId: enemy.id,
        expiresAt: 4000,
      }),
    );

    const fakeDeathResult = resolveSkillEffect(
      createSkillState([hunter, enemy]),
      hunter,
      createSkillUse("fake_death", hunter),
      1000,
    );

    expect(fakeDeathResult.state.entities.enemy).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
    expect(Object.values(fakeDeathResult.state.statusEffectsById ?? {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "fakeDeath", targetId: hunter.id }),
        expect.objectContaining({ type: "incapacitated", targetId: hunter.id }),
        expect.objectContaining({
          type: "nextAttackDamageBonus",
          targetId: hunter.id,
          damageMultiplierBonus: 0.3,
        }),
      ]),
    );

    const evasionResult = resolveSkillEffect(
      createSkillState([hunter, enemy]),
      hunter,
      createSkillUse("evasive_instinct", hunter),
      1000,
    );

    expect(Object.values(evasionResult.state.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "forcedEvasion",
        targetId: hunter.id,
        expiresAt: 11000,
      }),
    );
  });

  it("applies Poison Coating from landed companion damage", () => {
    const hunter = createSkillCompanion("hunter", "fighter", { x: 0, y: 0 }, "hunter");
    const ally = createSkillCompanion("ally", "fighter", { x: 0, y: 1 }, "blade");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { maxHealth: 200 });
    const coatedState = resolveSkillEffect(
      createSkillState([hunter, ally, enemy]),
      hunter,
      createSkillUse("poison_coating", hunter),
      1000,
    ).state;

    expect(
      coatedState.skillPartyClassBuffsByCompanionId?.ally?.hunter,
    ).toMatchObject({
      sourceId: hunter.id,
      sourceClassId: "hunter",
      poisonCoating: expect.objectContaining({
        sourceKey: "poison_coating",
        poisonDurationMs: 4000,
      }),
      primaryStatBonusPercentByStat: { dexterity: 5 },
    });

    const damagedState = resolveAndApplyCombatDamage(coatedState, ally, enemy, {
      damageType: "physical",
      powerMultiplier: 1,
      allowEvasion: false,
      allowPassiveBlock: false,
      now: 1500,
    }).state;

    expect(Object.values(damagedState.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "poison",
        targetId: enemy.id,
        sourceId: hunter.id,
        sourceKey: "poison_coating",
        tickIntervalMs: 2000,
      }),
    );
  });

  it("moves and attacks with Skirmish Shot only when a dash position exists", () => {
    const hunter = createSkillCompanion("hunter", "fighter", { x: 1, y: 1 }, "hunter");
    const enemy = createSkillEnemy("enemy", { x: 4, y: 1 }, { maxHealth: 200 });
    const result = resolveSkillEffect(
      createSkillState([hunter, enemy], {
        map: createSkillMap([], 10),
      }),
      hunter,
      createSkillUse("skirmish_shot", enemy),
      1000,
    );

    expect(result.shouldConsumeCooldown).toBe(true);
    expect((result.state.entities.hunter as Companion).position.x).toBeGreaterThan(
      hunter.position.x,
    );
    expect((result.state.entities.enemy as Enemy).health).toBeLessThan(enemy.health);

    const blocked = resolveSkillEffect(
      createSkillState([hunter, enemy], {
        map: createSkillMap(
          [
            { x: 2, y: 1 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 1, y: 0 },
            { x: 1, y: 2 },
          ],
          10,
        ),
      }),
      hunter,
      createSkillUse("skirmish_shot", enemy),
      1000,
    );

    expect(blocked.shouldConsumeCooldown).toBe(false);
    expect(blocked.state.entities.hunter.position).toEqual(hunter.position);
  });

  it("hits enemies near the selected target with Arrow Burst", () => {
    const hunter = createSkillCompanion("hunter", "fighter", { x: 0, y: 0 }, "hunter");
    const primary = createSkillEnemy("primary", { x: 4, y: 0 }, { maxHealth: 200 });
    const nearby = createSkillEnemy("nearby", { x: 5, y: 1 }, { maxHealth: 200 });
    const far = createSkillEnemy("far", { x: 8, y: 0 }, { maxHealth: 200 });
    const result = resolveSkillEffect(
      createSkillState([hunter, primary, nearby, far]),
      hunter,
      createSkillUse("arrow_burst", primary),
      1000,
    );

    expect((result.state.entities.primary as Enemy).health).toBeLessThan(
      primary.health,
    );
    expect((result.state.entities.nearby as Enemy).health).toBeLessThan(
      nearby.health,
    );
    expect((result.state.entities.far as Enemy).health).toBe(far.health);
  });

  it("applies Mana Shield as a non-expiring absorb pool and skips recast while active", () => {
    const elementalist = {
      ...createSkillCompanion(
        "elementalist",
        "fighter",
        { x: 0, y: 0 },
        "elementalist",
      ),
      health: 100,
      maxHealth: 100,
    };
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { attack: 30 });
    const shieldResult = resolveSkillEffect(
      createSkillState([elementalist, enemy]),
      elementalist,
      createSkillUse("mana_shield", elementalist),
      1000,
    );

    expect(shieldResult.shouldConsumeCooldown).toBe(true);
    expect(
      shieldResult.state.skillManaShieldsByCompanionId?.elementalist,
    ).toMatchObject({
      ownerId: elementalist.id,
      remainingAbsorb: 15,
      maxAbsorb: 15,
    });

    const recastResult = resolveSkillEffect(
      shieldResult.state,
      shieldResult.state.entities.elementalist as Companion,
      createSkillUse(
        "mana_shield",
        shieldResult.state.entities.elementalist as Companion,
      ),
      2000,
    );

    expect(recastResult.shouldConsumeCooldown).toBe(false);

    const hitResult = resolveAndApplyCombatDamage(
      shieldResult.state,
      enemy,
      shieldResult.state.entities.elementalist as Companion,
      {
        damageType: "magic",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );

    expect(hitResult.finalDamage).toBeGreaterThan(0);
    expect(
      hitResult.state.skillManaShieldsByCompanionId?.elementalist,
    ).toBeUndefined();
  });

  it("applies Frost Armor to one ally with defense and mitigation", () => {
    const elementalist = createSkillCompanion(
      "elementalist",
      "support",
      { x: 0, y: 0 },
      "elementalist",
    );
    const ally = createSkillCompanion("ally", "defender", { x: 1, y: 0 }, "aegis");
    const enemy = createSkillEnemy("enemy", { x: 2, y: 0 }, { attack: 30 });
    const armorState = resolveSkillEffect(
      createSkillState([elementalist, ally, enemy]),
      elementalist,
      createSkillUse("frost_armor", ally),
      1000,
    ).state;

    expect(armorState.skillFrostArmorsByCompanionId?.ally).toMatchObject({
      targetId: ally.id,
      sourceId: elementalist.id,
      defenseBonusPercent: 10,
      mitigationPercent: 10,
      expiresAt: 21000,
    });

    const armoredHit = resolveAndApplyCombatDamage(
      armorState,
      enemy,
      armorState.entities.ally as Companion,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );
    const normalHit = resolveAndApplyCombatDamage(
      createSkillState([elementalist, ally, enemy]),
      enemy,
      ally,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );

    expect(armoredHit.finalDamage).toBeLessThan(normalHit.finalDamage);
  });

  it("applies Overcharge and Arcane Conduit runtime buffs", () => {
    const elementalist = createSkillCompanion(
      "elementalist",
      "fighter",
      { x: 0, y: 0 },
      "elementalist",
    );
    const ally = createSkillCompanion("ally", "fighter", { x: 1, y: 0 }, "blade");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 1 });
    const overchargeState = resolveSkillEffect(
      createSkillState([elementalist, ally, enemy]),
      elementalist,
      createSkillUse("overcharge", elementalist),
      1000,
    ).state;

    expect(
      overchargeState.skillOverchargesByCompanionId?.elementalist,
    ).toMatchObject({
      companionId: elementalist.id,
      skillPowerBonusPercent: 10,
      cooldownPenaltyPercent: 20,
      expiresAt: 61000,
    });

    const conduitState = resolveSkillEffect(
      overchargeState,
      overchargeState.entities.elementalist as Companion,
      createSkillUse(
        "arcane_conduit",
        overchargeState.entities.elementalist as Companion,
      ),
      2000,
    ).state;

    expect(
      conduitState.skillPartyClassBuffsByCompanionId?.ally?.elementalist,
    ).toMatchObject({
      sourceClassId: "elementalist",
      magicDamageBonusPercent: 5.5,
      primaryStatBonusPercentByStat: { intelligence: 5.5 },
    });
  });

  it("moves with Flame Step and applies burning", () => {
    const elementalist = createSkillCompanion(
      "elementalist",
      "fighter",
      { x: 1, y: 1 },
      "elementalist",
    );
    const enemy = createSkillEnemy("enemy", { x: 4, y: 1 }, { maxHealth: 100 });
    const result = resolveSkillEffect(
      createSkillState([elementalist, enemy], {
        map: createSkillMap([], 8),
      }),
      elementalist,
      createSkillUse("flame_step", enemy),
      1000,
    );

    expect(result.shouldConsumeCooldown).toBe(true);
    expect(
      (result.state.entities.elementalist as Companion).position.x,
    ).toBeGreaterThan(elementalist.position.x);
    expect(Object.values(result.state.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "burning",
        targetId: enemy.id,
        sourceKey: "flame_step",
        tickIntervalMs: 2000,
      }),
    );
  });

  it("hits enemies near the selected target with FireBurst and applies burning", () => {
    const elementalist = createSkillCompanion(
      "elementalist",
      "fighter",
      { x: 0, y: 0 },
      "elementalist",
    );
    const primary = createSkillEnemy("primary", { x: 4, y: 0 }, { maxHealth: 100 });
    const nearby = createSkillEnemy("nearby", { x: 5, y: 1 }, { maxHealth: 100 });
    const far = createSkillEnemy("far", { x: 8, y: 0 }, { maxHealth: 100 });
    const result = resolveSkillEffect(
      createSkillState([elementalist, primary, nearby, far]),
      elementalist,
      createSkillUse("fire_burst", primary),
      1000,
    );

    expect((result.state.entities.primary as Enemy).health).toBeLessThan(
      primary.health,
    );
    expect((result.state.entities.nearby as Enemy).health).toBeLessThan(
      nearby.health,
    );
    expect((result.state.entities.far as Enemy).health).toBe(far.health);
    expect(Object.values(result.state.statusEffectsById ?? {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "burning",
          targetId: primary.id,
          sourceKey: "fire_burst",
        }),
        expect.objectContaining({
          type: "burning",
          targetId: nearby.id,
          sourceKey: "fire_burst",
        }),
      ]),
    );
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

  it("applies Hold Fast as a self-only defensive stance", () => {
    const caster = {
      ...createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis"),
      health: 10,
      maxHealth: 100,
    };
    const ally = {
      ...createSkillCompanion("ally", "defender", { x: 1, y: 0 }, "aegis"),
      health: 10,
      maxHealth: 100,
    };
    const healed = resolveSkillEffect(
      createSkillState([caster, ally]),
      caster,
      createSkillUse("hold_fast", caster),
      1000,
    );
    const skipped = resolveSkillEffect(
      createSkillState([caster, ally]),
      caster,
      createSkillUse("hold_fast", ally),
      1000,
    );

    expect(healed.shouldConsumeCooldown).toBe(true);
    expect(healed.state.entities.aegis).toMatchObject({ health: 10 });
    expect(healed.state.skillAbsorbShieldsByCompanionId?.aegis).toMatchObject({
      remainingAbsorb: 10,
      maxAbsorb: 10,
      expiresAt: 6000,
    });
    expect(healed.state.statusEffectsById?.["aegis-defenseBuff-hold_fast"]).toMatchObject({
      type: "defenseBuff",
      defenseBonusPercent: 25,
      expiresAt: 11000,
    });
    expect(healed.state.statusEffectsById?.["aegis-immobilized-hold_fast"]).toMatchObject({
      type: "immobilized",
      expiresAt: 6000,
    });
    expect(skipped.shouldConsumeCooldown).toBe(false);
    expect(skipped.state.entities.ally).toMatchObject({ health: 10 });
  });

  it("taunts up to two nearest enemies with Shield Challenge", () => {
    const caster = createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis");
    const nearest = createSkillEnemy("nearest", { x: 1, y: 0 });
    const tiedTargetingCaster = {
      ...createSkillEnemy("tied-caster", { x: 2, y: 0 }),
      state: "attack" as const,
      currentTargetId: caster.id,
    };
    const tiedOther = createSkillEnemy("tied-other", { x: 0, y: 2 });
    const far = createSkillEnemy("far", { x: 3, y: 0 });
    const result = resolveSkillEffect(
      createSkillState([caster, nearest, tiedTargetingCaster, tiedOther, far]),
      caster,
      createSkillUse("shield_challenge", nearest),
      1000,
    );

    expect(result.shouldConsumeCooldown).toBe(true);
    expect(result.state.entities.nearest).toMatchObject({
      state: "attack",
      currentTargetId: caster.id,
    });
    expect(result.state.entities["tied-other"]).toMatchObject({
      state: "attack",
      currentTargetId: caster.id,
    });
    expect(result.state.entities.far).toMatchObject({
      currentTargetId: null,
    });
  });

  it("applies Guard Wall as an all-damage absorb pool after landed hits", () => {
    const caster = {
      ...createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis"),
      maxHealth: 100,
      health: 100,
    };
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { attack: 20 });
    const shieldState = resolveSkillEffect(
      createSkillState([caster, enemy]),
      caster,
      createSkillUse("guard_wall", caster),
      1000,
    ).state;

    expect(shieldState.skillAbsorbShieldsByCompanionId?.aegis).toMatchObject({
      ownerId: caster.id,
      remainingAbsorb: 15,
      maxAbsorb: 15,
      expiresAt: 11000,
    });

    const firstHit = resolveAndApplyCombatDamage(
      shieldState,
      enemy,
      shieldState.entities.aegis as Companion,
      {
        damageType: "magic",
        powerMultiplier: 0.5,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );

    expect(firstHit.finalDamage).toBe(0);
    expect(
      firstHit.state.skillAbsorbShieldsByCompanionId?.aegis?.remainingAbsorb,
    ).toBeLessThan(15);

    const secondHit = resolveAndApplyCombatDamage(
      firstHit.state,
      enemy,
      firstHit.state.entities.aegis as Companion,
      {
        damageType: "physical",
        powerMultiplier: 2,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 3000,
        rng: () => 1,
      },
    );

    expect(secondHit.finalDamage).toBeGreaterThan(0);
    expect(secondHit.state.skillAbsorbShieldsByCompanionId?.aegis).toBeUndefined();
  });

  it("does not consume Guard Wall on evaded hits", () => {
    const caster = {
      ...createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis"),
      maxHealth: 100,
      health: 100,
      allocatedStats: {
        ...createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis")
          .allocatedStats,
        dexterity: 200,
      },
    };
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { attack: 20 });
    const shieldState = resolveSkillEffect(
      createSkillState([caster, enemy]),
      caster,
      createSkillUse("guard_wall", caster),
      1000,
    ).state;
    const evadedHit = resolveAndApplyCombatDamage(
      shieldState,
      enemy,
      shieldState.entities.aegis as Companion,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: true,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 0,
      },
    );

    expect(evadedHit.evaded).toBe(true);
    expect(
      evadedHit.state.skillAbsorbShieldsByCompanionId?.aegis?.remainingAbsorb,
    ).toBe(15);
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
    expect(pressState.skillPartyClassBuffsByCompanionId?.blade?.blade).toMatchObject({
      sourceClassId: "blade",
      physicalDamageBonusPercent: 5,
      primaryStatBonusPercentByStat: { strength: 5 },
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

    expect(bladeHit.rawDamage).toBeCloseTo(allyHit.rawDamage + 1.05);
  });

  it("refreshes same-class party buffs instead of stacking by caster", () => {
    const firstBlade = createSkillCompanion(
      "first-blade",
      "fighter",
      { x: 0, y: 0 },
      "blade",
    );
    const secondBlade = createSkillCompanion(
      "second-blade",
      "fighter",
      { x: 1, y: 0 },
      "blade",
    );
    const ally = createSkillCompanion("ally", "fighter", { x: 2, y: 0 }, "beast");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 1 });
    const firstState = resolveSkillEffect(
      createSkillState([firstBlade, secondBlade, ally, enemy]),
      firstBlade,
      createSkillUse("press_the_opening", firstBlade),
      1000,
    ).state;
    const refreshedState = resolveSkillEffect(
      firstState,
      firstState.entities["second-blade"] as Companion,
      createSkillUse(
        "press_the_opening",
        firstState.entities["second-blade"] as Companion,
      ),
      59000,
    ).state;

    expect(
      Object.keys(refreshedState.skillPartyClassBuffsByCompanionId?.ally ?? {}),
    ).toEqual(["blade"]);
    expect(refreshedState.skillPartyClassBuffsByCompanionId?.ally?.blade).toMatchObject({
      sourceId: "second-blade",
      sourceClassId: "blade",
      expiresAt: 119000,
    });
  });

  it("stacks Iron Stance and Shield Formation mitigation for landed damage", () => {
    const aegis = createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis");
    const ally = createSkillCompanion("ally", "fighter", { x: 1, y: 0 }, "aegis");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 1 }, { attack: 30 });
    const ironState = resolveSkillEffect(
      createSkillState([aegis, ally, enemy]),
      aegis,
      createSkillUse("iron_stance", aegis),
      1000,
    ).state;
    const formationState = resolveSkillEffect(
      ironState,
      ironState.entities.aegis as Companion,
      createSkillUse("shield_formation", ironState.entities.aegis as Companion),
      1000,
    ).state;

    expect(formationState.skillSelfMitigationBuffsByCompanionId?.aegis).toMatchObject({
      mitigationPercent: 10,
      expiresAt: 61000,
    });
    expect(
      formationState.skillPartyClassBuffsByCompanionId?.aegis?.aegis,
    ).toMatchObject({
      sourceClassId: "aegis",
      mitigationPercent: 8,
      primaryStatBonusPercentByStat: { constitution: 5 },
      expiresAt: 61000,
    });

    const aegisHit = resolveAndApplyCombatDamage(
      formationState,
      formationState.entities.enemy as Enemy,
      formationState.entities.aegis as Companion,
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
      formationState,
      formationState.entities.enemy as Enemy,
      formationState.entities.ally as Companion,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 2000,
        rng: () => 1,
      },
    );

    expect(aegisHit.finalDamage).toBeLessThan(allyHit.finalDamage);
    expect(allyHit.finalDamage).toBeLessThan(allyHit.rawDamage);
  });

  it("channels Shield Shockwave before applying damage, taunt, and bind in radius", () => {
    const caster = createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis");
    const near = createSkillEnemy("near", { x: 1, y: 0 }, { maxHealth: 100 });
    const edge = createSkillEnemy("edge", { x: 0, y: 2 }, { maxHealth: 100 });
    const far = createSkillEnemy("far", { x: 3, y: 0 }, { maxHealth: 100 });
    const started = resolveSkillEffect(
      createSkillState([caster, near, edge, far]),
      caster,
      createSkillUse("shield_shockwave", caster),
      1000,
    );

    expect(started.shouldConsumeCooldown).toBe(true);
    expect(started.state.companionAoeChannelsByCasterId?.aegis).toMatchObject({
      abilityId: "shield_shockwave",
      casterId: caster.id,
      visualIntent: "partyOffensive",
      shape: {
        type: "circle",
        center: caster.position,
        radius: 2,
      },
      channelEndsAt: 1000 + SHIELD_SHOCKWAVE_CHANNEL_MS,
    });
    expect((started.state.entities.near as Enemy).health).toBe(near.health);

    const beforeImpact = updateCompanionAoeChannelSystem(
      started.state,
      1000 + SHIELD_SHOCKWAVE_CHANNEL_MS - 1,
    );

    expect((beforeImpact.entities.near as Enemy).health).toBe(near.health);

    const afterImpact = updateCompanionAoeChannelSystem(
      beforeImpact,
      1000 + SHIELD_SHOCKWAVE_CHANNEL_MS,
    );

    expect((afterImpact.entities.near as Enemy).health).toBeLessThan(near.health);
    expect((afterImpact.entities.edge as Enemy).health).toBeLessThan(edge.health);
    expect((afterImpact.entities.far as Enemy).health).toBe(far.health);
    expect(afterImpact.entities.near).toMatchObject({
      state: "attack",
      currentTargetId: caster.id,
    });
    expect(afterImpact.skillBindsByEnemyId?.near).toMatchObject({
      sourceId: caster.id,
      targetId: near.id,
      expiresAt: 1000 + SHIELD_SHOCKWAVE_CHANNEL_MS + 1000,
    });
    expect(afterImpact.companionAoeChannelsByCasterId?.aegis).toBeUndefined();
  });

  it("uses Shield Shockwave's locked channel center even if the caster moves", () => {
    const caster = createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis");
    const originalAreaEnemy = createSkillEnemy("original-area", { x: 1, y: 0 }, { maxHealth: 100 });
    const movedAreaEnemy = createSkillEnemy("moved-area", { x: 10, y: 0 }, { maxHealth: 100 });
    const started = resolveSkillEffect(
      createSkillState([caster, originalAreaEnemy, movedAreaEnemy]),
      caster,
      createSkillUse("shield_shockwave", caster),
      1000,
    ).state;
    const movedState = updateEntity(started, {
      ...(started.entities.aegis as Companion),
      position: { x: 10, y: 0 },
    });

    const afterImpact = updateCompanionAoeChannelSystem(
      movedState,
      1000 + SHIELD_SHOCKWAVE_CHANNEL_MS,
    );

    expect((afterImpact.entities["original-area"] as Enemy).health).toBeLessThan(
      originalAreaEnemy.health,
    );
    expect((afterImpact.entities["moved-area"] as Enemy).health).toBe(
      movedAreaEnemy.health,
    );
  });

  it("cancels Shield Shockwave without impact when the caster is no longer living", () => {
    const caster = createSkillCompanion("aegis", "defender", { x: 0, y: 0 }, "aegis");
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { maxHealth: 100 });
    const started = resolveSkillEffect(
      createSkillState([caster, enemy]),
      caster,
      createSkillUse("shield_shockwave", caster),
      1000,
    ).state;
    const deadCasterState = updateEntity(started, {
      ...(started.entities.aegis as Companion),
      health: 0,
      state: "dead",
    });

    const afterImpact = updateCompanionAoeChannelSystem(
      deadCasterState,
      1000 + SHIELD_SHOCKWAVE_CHANNEL_MS,
    );

    expect((afterImpact.entities.enemy as Enemy).health).toBe(enemy.health);
    expect(afterImpact.companionAoeChannelsByCasterId?.aegis).toBeUndefined();
  });

  it("applies taunt, pinning, bind, buff, gather, and shield effects", () => {
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
    const pinnedEnemy = createSkillEnemy("pinned-enemy", { x: 1, y: 0 });
    const pinnedState = resolveSkillEffect(
      createSkillState([hunter, pinnedEnemy]),
      hunter,
      createSkillUse("pinning_shot", pinnedEnemy),
      1000,
    ).state;

    expect(Object.values(pinnedState.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "immobilized",
        sourceId: hunter.id,
        targetId: pinnedEnemy.id,
      }),
    );

    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    const boundEnemy = createSkillEnemy("bound-enemy", { x: 1, y: 0 });
    const boundState = resolveSkillEffect(
      createSkillState([runecaster, boundEnemy]),
      runecaster,
      createSkillUse("binding_rune", boundEnemy),
      1000,
    ).state;

    expect(Object.values(boundState.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "immobilized",
        sourceId: runecaster.id,
        sourceKey: "binding_rune",
        targetId: boundEnemy.id,
      }),
    );

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
      movementSpeedBonusPercent: 20,
    });
    expect((selfBuffState.entities.beast as Companion).health).toBe(beast.health);

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

  it("applies Runecaster barriers to physical and magic hits", () => {
    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    const ally = createSkillCompanion("ally", "defender", { x: 1, y: 0 });
    const enemy = createSkillEnemy("enemy", { x: 2, y: 0 }, { attack: 20 });
    const barrierState = resolveSkillEffect(
      createSkillState([runecaster, ally, enemy]),
      runecaster,
      createSkillUse("warding_glyph", ally),
      1000,
    ).state;

    expect(barrierState.skillShieldBlocksById?.["ally-warding_glyph"]).toMatchObject({
      ownerId: ally.id,
      remainingBlocks: 2,
      blockedDamageTypes: ["physical", "magic"],
    });

    const magicBlockedState = resolveAndApplyCombatDamage(
      barrierState,
      enemy,
      ally,
      {
        damageType: "magic",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 1100,
        label: "Test Spell",
      },
    ).state;

    expect((magicBlockedState.entities.ally as Companion).health).toBe(ally.health);
    expect(
      magicBlockedState.skillShieldBlocksById?.["ally-warding_glyph"]
        ?.remainingBlocks,
    ).toBe(1);
  });

  it("heals when Sanctuary Veil barrier is consumed", () => {
    const lightbearer = createSkillCompanion(
      "lightbearer",
      "support",
      { x: 0, y: 0 },
      "lightbearer",
    );
    const ally = {
      ...createSkillCompanion("ally", "defender", { x: 1, y: 0 }),
      health: 50,
      maxHealth: 100,
    };
    const enemy = createSkillEnemy("enemy", { x: 2, y: 0 }, { attack: 20 });
    const barrierState = resolveSkillEffect(
      createSkillState([lightbearer, ally, enemy]),
      lightbearer,
      createSkillUse("sanctuary_veil", ally),
      1000,
    ).state;

    expect(barrierState.skillShieldBlocksById?.["ally-sanctuary_veil"]).toMatchObject({
      ownerId: ally.id,
      remainingBlocks: 1,
      healPercentMaxHealthOnConsume: 5,
      blockedDamageTypes: ["physical", "magic"],
    });

    const blockedState = resolveAndApplyCombatDamage(
      barrierState,
      enemy,
      ally,
      {
        damageType: "magic",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 1100,
        label: "Test Spell",
      },
    ).state;

    expect((blockedState.entities.ally as Companion).health).toBe(55);
    expect(
      blockedState.skillShieldBlocksById?.["ally-sanctuary_veil"],
    ).toBeUndefined();
  });

  it("records Rewind Rune damage and heals on ticks", () => {
    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    const ally = {
      ...createSkillCompanion("ally", "defender", { x: 1, y: 0 }),
      health: 30,
      maxHealth: 100,
    };
    const enemy = createSkillEnemy("enemy", { x: 2, y: 0 }, { attack: 20 });
    const runeState = resolveSkillEffect(
      createSkillState([runecaster, ally, enemy]),
      runecaster,
      createSkillUse("rewind_rune", ally),
      1000,
    ).state;
    const damagedState = resolveAndApplyCombatDamage(
      runeState,
      enemy,
      ally,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 1100,
        label: "Test Hit",
      },
    ).state;

    expect(
      damagedState.skillRewindRunesByCompanionId?.ally?.recordedDamage ?? 0,
    ).toBeGreaterThan(0);

    const tickedState = updateRuneSkillRuntime(damagedState, 2000);

    expect((tickedState.entities.ally as Companion).health).toBeGreaterThan(
      (damagedState.entities.ally as Companion).health,
    );
    expect(tickedState.skillRewindRunesByCompanionId?.ally?.recordedDamage).toBe(0);
  });

  it("records Rewind Rune damage that was blocked by a barrier", () => {
    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    const ally = createSkillCompanion("ally", "defender", { x: 1, y: 0 });
    const enemy = createSkillEnemy("enemy", { x: 2, y: 0 }, { attack: 20 });
    let state = createSkillState([runecaster, ally, enemy]);

    state = resolveSkillEffect(
      state,
      runecaster,
      createSkillUse("rewind_rune", ally),
      1000,
    ).state;
    state = resolveSkillEffect(
      state,
      runecaster,
      createSkillUse("warding_glyph", ally),
      1000,
    ).state;

    const blockedState = resolveAndApplyCombatDamage(
      state,
      enemy,
      ally,
      {
        damageType: "magic",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 1100,
        label: "Test Spell",
      },
    ).state;

    expect((blockedState.entities.ally as Companion).health).toBe(ally.health);
    expect(
      blockedState.skillRewindRunesByCompanionId?.ally?.recordedDamage ?? 0,
    ).toBeGreaterThan(0);
  });

  it("uses Runic Focus to duplicate the next valid non-party skill", () => {
    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    const firstEnemy = createSkillEnemy("first-enemy", { x: 1, y: 0 }, { maxHealth: 50 });
    const secondEnemy = createSkillEnemy("second-enemy", { x: 2, y: 0 }, { maxHealth: 50 });
    const focusedState = resolveSkillEffect(
      createSkillState([runecaster, firstEnemy, secondEnemy]),
      runecaster,
      createSkillUse("runic_focus", runecaster),
      1000,
    ).state;

    expect(focusedState.skillRunicFocusByCompanionId?.runecaster).toMatchObject({
      companionId: runecaster.id,
    });

    const lancedState = resolveSkillEffect(
      focusedState,
      runecaster,
      createSkillUse("rune_lance", firstEnemy),
      1100,
    ).state;

    expect((lancedState.entities["first-enemy"] as Enemy).health).toBeLessThan(
      firstEnemy.health,
    );
    expect((lancedState.entities["second-enemy"] as Enemy).health).toBeLessThan(
      secondEnemy.health,
    );
    expect(lancedState.skillRunicFocusByCompanionId?.runecaster).toBeUndefined();
  });

  it("does not consume Runic Focus with party, self, or gather buffs", () => {
    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    let state = resolveSkillEffect(
      createSkillState([runecaster]),
      runecaster,
      createSkillUse("runic_focus", runecaster),
      1000,
    ).state;

    state = resolveSkillEffect(
      state,
      runecaster,
      createSkillUse("edge_focus", runecaster),
      1050,
    ).state;
    state = resolveSkillEffect(
      state,
      runecaster,
      createSkillUse("leyline_matrix", runecaster),
      1100,
    ).state;
    state = resolveSkillEffect(
      state,
      runecaster,
      createSkillUse("stone_sigil_rhythm", runecaster),
      1200,
    ).state;

    expect(state.skillRunicFocusByCompanionId?.runecaster).toBeDefined();
  });

  it("uses Rune Step mobility preference and traps enemies near the placement point", () => {
    const runecaster = createSkillCompanion("runecaster", "support", { x: 0, y: 0 }, "runecaster");
    const enemy = createSkillEnemy("enemy", { x: 3, y: 0 });
    const result = resolveSkillEffect(
      createSkillState([runecaster, enemy], {
        map: createSkillMap([], 8),
      }),
      runecaster,
      createSkillUse("rune_step", enemy),
      1000,
    );
    const movedRunecaster = result.state.entities.runecaster as Companion;

    expect(result.shouldConsumeCooldown).toBe(true);
    expect(movedRunecaster.position.x).toBeGreaterThan(runecaster.position.x);
    expect(Object.values(result.state.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "immobilized",
        sourceId: runecaster.id,
        sourceKey: "rune_step",
        targetId: enemy.id,
      }),
    );
  });

  it("applies Beast lifesteal from final physical damage only", () => {
    const beast = {
      ...createSkillCompanion("beast", "fighter", { x: 0, y: 0 }, "beast"),
      health: 5,
      maxHealth: 30,
    };
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 }, { maxHealth: 100 });
    const buffState = resolveSkillEffect(
      createSkillState([beast, enemy]),
      beast,
      createSkillUse("blood_feast", beast),
      1000,
    ).state;

    expect(buffState.skillLifestealBuffsByCompanionId?.beast).toMatchObject({
      companionId: beast.id,
      lifestealPercent: 10,
      expiresAt: 9000,
    });

    const physicalState = resolveAndApplyCombatDamage(
      buffState,
      beast,
      enemy,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 1100,
        label: "Test Hit",
      },
    ).state;

    expect((physicalState.entities.beast as Companion).health).toBeGreaterThan(
      beast.health,
    );

    const magicState = resolveAndApplyCombatDamage(
      buffState,
      beast,
      enemy,
      {
        damageType: "magic",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 1100,
        label: "Test Spell",
      },
    ).state;

    expect((magicState.entities.beast as Companion).health).toBe(beast.health);
  });

  it("moves and damages with Pounce without consuming when blocked", () => {
    const beast = createSkillCompanion("beast", "fighter", { x: 1, y: 1 }, "beast");
    const enemy = createSkillEnemy("enemy", { x: 4, y: 1 }, { maxHealth: 50 });
    const result = resolveSkillEffect(
      createSkillState([beast, enemy], {
        map: createSkillMap([], 8),
      }),
      beast,
      createSkillUse("pounce", enemy),
      1000,
    );
    const movedBeast = result.state.entities.beast as Companion;

    expect(result.shouldConsumeCooldown).toBe(true);
    expect(movedBeast.position.x).toBeGreaterThan(beast.position.x);
    expect((result.state.entities.enemy as Enemy).health).toBeLessThan(enemy.health);
    expect(result.state.skillVisualEvents?.at(-1)).toMatchObject({
      skillId: "pounce",
      type: "slash",
    });

    const blockedResult = resolveSkillEffect(
      createSkillState([beast, enemy], {
        map: createSkillMap(
          [
            { x: 2, y: 1 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 1, y: 0 },
            { x: 1, y: 2 },
          ],
          8,
        ),
      }),
      beast,
      createSkillUse("pounce", enemy),
      1000,
    );

    expect(blockedResult.shouldConsumeCooldown).toBe(false);
    expect(blockedResult.state.entities.beast.position).toEqual(beast.position);
  });

  it("channels Maul Sweep damage and disarm", () => {
    const beast = createSkillCompanion("beast", "fighter", { x: 0, y: 0 }, "beast");
    const nearby = createSkillEnemy("nearby", { x: 1, y: 0 }, { maxHealth: 50 });
    const far = createSkillEnemy("far", { x: 4, y: 0 }, { maxHealth: 50 });
    const channelState = resolveSkillEffect(
      createSkillState([beast, nearby, far]),
      beast,
      createSkillUse("maul_sweep", beast),
      1000,
    ).state;

    expect(channelState.companionAoeChannelsByCasterId?.beast).toMatchObject({
      abilityId: "maul_sweep",
      casterId: beast.id,
      disarmDurationMs: 1500,
    });

    const afterImpact = updateCompanionAoeChannelSystem(
      channelState,
      1000 + SHIELD_SHOCKWAVE_CHANNEL_MS,
    );

    expect((afterImpact.entities.nearby as Enemy).health).toBeLessThan(
      nearby.health,
    );
    expect((afterImpact.entities.far as Enemy).health).toBe(far.health);
    expect(Object.values(afterImpact.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "disarmed",
        targetId: nearby.id,
        sourceKey: "maul_sweep",
      }),
    );
    expect(afterImpact.companionAoeChannelsByCasterId?.beast).toBeUndefined();
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
      penitent.health - Math.ceil(penitent.health * 0.05),
    );
  });

  it("applies Penitent control, sacrifice, sustain, party support, and mobility effects", () => {
    const penitent = {
      ...createSkillCompanion("penitent", "support", { x: 1, y: 1 }, "penitent"),
      health: 100,
      maxHealth: 100,
    };
    const enemy = createSkillEnemy("enemy", { x: 3, y: 1 }, { maxHealth: 100 });
    const ally = {
      ...createSkillCompanion("ally", "defender", { x: 1, y: 2 }),
      health: 40,
      maxHealth: 100,
    };
    let state = createSkillState([penitent, enemy, ally]);

    state = resolveSkillEffect(
      state,
      penitent,
      createSkillUse("whip_prison", enemy),
      1000,
    ).state;

    expect(Object.values(state.statusEffectsById ?? {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "immobilized",
          targetId: penitent.id,
          sourceKey: "whip_prison",
        }),
        expect.objectContaining({
          type: "disarmed",
          targetId: enemy.id,
          sourceKey: "whip_prison",
        }),
        expect.objectContaining({
          type: "cursed",
          targetId: enemy.id,
          sourceKey: "whip_prison",
        }),
        expect.objectContaining({
          type: "bleed",
          targetId: enemy.id,
          sourceKey: "whip_prison",
          tickIntervalMs: 1000,
        }),
      ]),
    );

    const lashState = resolveSkillEffect(
      createSkillState([penitent, enemy]),
      penitent,
      createSkillUse("flagellant_lash", enemy),
      1100,
    ).state;

    expect((lashState.entities.penitent as Companion).health).toBe(
      penitent.health - 3,
    );
    expect((lashState.entities.enemy as Enemy).health).toBeLessThan(enemy.health);
    expect(lashState.statusEffectsById?.["enemy-bleed-flagellant_lash"]).toMatchObject({
      tickIntervalMs: 1000,
      sourceId: penitent.id,
    });

    const veilState = resolveSkillEffect(
      createSkillState([penitent, ally]),
      penitent,
      createSkillUse("martyrs_veil", ally),
      1200,
    ).state;

    expect((veilState.entities.penitent as Companion).health).toBe(
      penitent.health - 3,
    );
    expect(veilState.skillShieldBlocksById?.["ally-martyrs_veil"]).toMatchObject({
      ownerId: ally.id,
      remainingBlocks: 2,
      blockedDamageTypes: ["physical", "magic"],
    });

    const giftState = resolveSkillEffect(
      createSkillState([penitent, ally]),
      penitent,
      createSkillUse("penitents_gift", ally),
      1300,
    ).state;

    expect((giftState.entities.penitent as Companion).health).toBe(
      penitent.health - 5,
    );
    expect((giftState.entities.ally as Companion).health).toBe(55);

    const hopeState = resolveSkillEffect(
      createSkillState([{ ...penitent, health: 50 }, enemy]),
      { ...penitent, health: 50 },
      createSkillUse("eternal_hope", penitent),
      1400,
    ).state;

    expect((hopeState.entities.penitent as Companion).health).toBe(45);
    expect(hopeState.skillSelfMitigationBuffsByCompanionId?.penitent).toMatchObject({
      mitigationPercent: 20,
      expiresAt: 16400,
    });
    expect(hopeState.skillHealOverTimesByCompanionId?.penitent).toMatchObject({
      healAmountPerTick: 2,
      nextTickAt: 4400,
    });

    const hopeTickState = updateRuneSkillRuntime(hopeState, 4400);
    expect((hopeTickState.entities.penitent as Companion).health).toBe(47);

    const benedictionState = resolveSkillEffect(
      createSkillState([penitent, ally]),
      penitent,
      createSkillUse("burdened_benediction", penitent),
      1500,
    ).state;

    expect(
      benedictionState.skillPartyClassBuffsByCompanionId?.ally?.penitent,
    ).toMatchObject({
      sourceClassId: "penitent",
      primaryStatBonusPercentByStat: { wisdom: 5, constitution: 5 },
    });

    const stepEnemy = createSkillEnemy("step-enemy", { x: 4, y: 1 });
    const offensiveStepState = resolveSkillEffect(
      createSkillState([penitent, stepEnemy]),
      penitent,
      createSkillUse("atonement_step", stepEnemy),
      1600,
    ).state;

    expect((offensiveStepState.entities.penitent as Companion).position).not.toEqual(
      penitent.position,
    );
    expect(offensiveStepState.statusEffectsById?.["step-enemy-disarmed-atonement_step"]).toMatchObject({
      targetId: stepEnemy.id,
    });

    const defensivePenitent = {
      ...penitent,
      skillBehavior: {
        ...penitent.skillBehavior,
        mobilitySkillUseMode: "defensive" as const,
      },
    };
    const woundedAlly = { ...ally, position: { x: 1, y: 2 }, health: 40 };
    const defensiveEnemy = createSkillEnemy("defensive-enemy", { x: 0, y: 1 });
    const defensiveStepState = resolveSkillEffect(
      createSkillState([defensivePenitent, woundedAlly, defensiveEnemy]),
      defensivePenitent,
      createSkillUse("atonement_step", defensiveEnemy),
      1700,
    ).state;

    expect((defensiveStepState.entities.ally as Companion).health).toBeGreaterThan(
      woundedAlly.health,
    );
  });

  it("applies Lightbearer curse, HoT, party healing bonus, and area healing", () => {
    const lightbearer = createSkillCompanion(
      "lightbearer",
      "support",
      { x: 0, y: 0 },
      "lightbearer",
    );
    const enemy = createSkillEnemy("enemy", { x: 1, y: 0 });
    const ally = {
      ...createSkillCompanion("ally", "fighter", { x: 1, y: 0 }),
      health: 40,
      maxHealth: 100,
    };
    const nearby = {
      ...createSkillCompanion("nearby", "defender", { x: 3, y: 0 }),
      health: 45,
      maxHealth: 100,
    };
    const far = {
      ...createSkillCompanion("far", "fighter", { x: 7, y: 0 }),
      health: 40,
      maxHealth: 100,
    };
    let state = createSkillState([lightbearer, enemy, ally, nearby, far]);

    state = resolveSkillEffect(
      state,
      lightbearer,
      createSkillUse("blinding_ray", enemy),
      1000,
    ).state;

    expect(Object.values(state.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "cursed",
        targetId: enemy.id,
        expiresAt: 4000,
      }),
    );

    state = resolveSkillEffect(
      state,
      lightbearer,
      createSkillUse("guiding_light", ally),
      1100,
    ).state;

    expect(state.skillHealOverTimesByCompanionId?.ally).toMatchObject({
      targetId: ally.id,
      healPercentMaxHealth: 1,
      nextTickAt: 3100,
    });

    const tickedState = updateRuneSkillRuntime(state, 3100);
    expect((tickedState.entities.ally as Companion).health).toBe(41);

    const noBuffHealState = resolveSkillEffect(
      createSkillState([lightbearer, ally]),
      lightbearer,
      createSkillUse("light_mend", ally),
      1200,
    ).state;
    const buffState = resolveSkillEffect(
      createSkillState([lightbearer, ally]),
      lightbearer,
      createSkillUse("radiant_benediction", lightbearer),
      1200,
    ).state;
    const buffedHealState = resolveSkillEffect(
      buffState,
      lightbearer,
      createSkillUse("light_mend", ally),
      1300,
    ).state;

    expect((buffedHealState.entities.ally as Companion).health).toBeGreaterThan(
      (noBuffHealState.entities.ally as Companion).health,
    );
    expect(
      buffedHealState.skillPartyClassBuffsByCompanionId?.ally?.lightbearer
        ?.healingReceivedBonusPercent,
    ).toBe(5);

    const areaState = resolveSkillEffect(
      createSkillState([lightbearer, ally, nearby, far]),
      lightbearer,
      createSkillUse("circle_of_renewal", ally),
      1400,
    ).state;

    expect((areaState.entities.ally as Companion).health).toBeGreaterThan(
      ally.health,
    );
    expect((areaState.entities.nearby as Companion).health).toBeGreaterThan(
      nearby.health,
    );
    expect((areaState.entities.far as Companion).health).toBe(far.health);
  });

  it("disarms enemies at Dawn Step arrival or departure", () => {
    const lightbearer = createSkillCompanion(
      "lightbearer",
      "support",
      { x: 1, y: 0 },
      "lightbearer",
    );
    const enemy = createSkillEnemy("enemy", { x: 4, y: 0 });
    const offensiveState = resolveSkillEffect(
      createSkillState([lightbearer, enemy]),
      lightbearer,
      createSkillUse("dawn_step", enemy),
      1000,
    ).state;

    expect(offensiveState.entities.lightbearer.position).not.toEqual(
      lightbearer.position,
    );
    expect(Object.values(offensiveState.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "disarmed",
        targetId: enemy.id,
        sourceKey: "dawn_step",
      }),
    );

    const defensiveLightbearer = {
      ...lightbearer,
      skillBehavior: {
        ...lightbearer.skillBehavior,
        mobilitySkillUseMode: "defensive" as const,
        defensiveMobilityUseHpThresholdPercent: 80,
      },
      health: Math.floor(lightbearer.maxHealth * 0.5),
    };
    const defensiveEnemy = createSkillEnemy("defensive-enemy", { x: 2, y: 0 });
    const defensiveState = resolveSkillEffect(
      createSkillState([defensiveLightbearer, defensiveEnemy]),
      defensiveLightbearer,
      createSkillUse("dawn_step", defensiveEnemy),
      1000,
    ).state;

    expect(Object.values(defensiveState.statusEffectsById ?? {})).toContainEqual(
      expect.objectContaining({
        type: "disarmed",
        targetId: defensiveEnemy.id,
        sourceKey: "dawn_step",
      }),
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
