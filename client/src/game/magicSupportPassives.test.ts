import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  absorbWithOverflowingGrace,
  applyOverflowingGraceFromDirectHeal,
  getActiveRunicInscriptionCount,
  getArcaneCrescendoDamageBonusPercent,
  getArcaneCrescendoSpellThreshold,
  getCrimsonAuthorityDurationMs,
  getOverflowingGraceRankValues,
  getStableOverchargeReductionPointsForRank,
  prepareMagicSupportSkill,
  recordSuccessfulMagicSupportSkill,
  updateMagicSupportPassiveRuntime,
} from "./magicSupportPassives";
import { resolveSkillEffect } from "./skillEffectResolution";
import { applySkillPowerBonusesToSkillDefinition } from "./skillOvercharge";
import { SKILL_DEFINITIONS } from "./skills";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type {
  ActiveSkillDefinition,
  Companion,
  GameEntity,
  SkillId,
} from "./types";

describe("magic and support first-class passives", () => {
  it.each([
    [1, 10],
    [5, 10],
    [6, 9],
    [10, 9],
    [11, 8],
    [15, 8],
    [21, 6],
    [50, 6],
  ])("uses the Arcane Crescendo threshold at rank %i", (rank, threshold) => {
    expect(getArcaneCrescendoSpellThreshold(rank)).toBe(threshold);
  });

  it.each([
    [1, 4],
    [5, 20],
    [10, 40],
    [15, 60],
  ])("scales Arcane Crescendo damage at rank %i", (rank, damageBonus) => {
    expect(getArcaneCrescendoDamageBonusPercent(rank)).toBe(damageBonus);
  });

  it("keeps bespoke future-rank values for Stable Overcharge and Overflowing Grace", () => {
    expect(getStableOverchargeReductionPointsForRank(5)).toBe(5);
    expect(getStableOverchargeReductionPointsForRank(15)).toBe(10);
    expect(getOverflowingGraceRankValues(5)).toEqual({
      conversionPercent: 25,
      barrierCapPercentMaxHealth: 5,
    });
    expect(getOverflowingGraceRankValues(15)).toEqual({
      conversionPercent: 75,
      barrierCapPercentMaxHealth: 15,
    });
  });

  it("subtracts Stable Overcharge points from the snapshotted cooldown penalty", () => {
    const caster = withRanks(
      createCompanion(
        "elementalist",
        { x: 0, y: 0 },
        "leader",
        "fighter",
        1,
        "elementalist",
      ),
      { overcharge: 5, stable_overcharge: 5 },
    );
    const result = resolveSkillEffect(
      createState([caster]),
      caster,
      {
        skill: activeSkill("overcharge"),
        target: caster,
        score: 1,
        selectionPriority: 1,
      },
      1_000,
    );

    expect(result.state.skillOverchargesByCompanionId?.[caster.id]).toMatchObject({
      skillPowerBonusPercent: 20,
      cooldownPenaltyPercent: 23,
    });
  });

  it("charges Arcane Crescendo on the threshold spell and consumes it on the next offensive AoE", () => {
    const caster = withRanks(
      createCompanion("elementalist", { x: 0, y: 0 }, "leader", "fighter", 1, "elementalist"),
      { arcane_crescendo: 1 },
    );
    const enemy = createEnemy("enemy", { x: 1, y: 0 }, "aggressive");
    const state = createState([caster, enemy], {
      arcaneCrescendoByCompanionId: {
        [caster.id]: {
          companionId: caster.id,
          offensiveSpellCount: 9,
          charged: false,
        },
      },
    });
    const charged = recordSuccessfulMagicSupportSkill(
      state,
      state,
      caster,
      activeSkill("elemental_bolt"),
      enemy.id,
      1_000,
      false,
    );
    expect(charged.arcaneCrescendoByCompanionId?.[caster.id]).toEqual({
      companionId: caster.id,
      offensiveSpellCount: 10,
      charged: true,
    });

    const prepared = prepareMagicSupportSkill(
      charged,
      caster,
      activeSkill("fire_burst"),
      enemy.id,
      1_100,
      false,
    );
    expect(prepared.additionalPowerBonusPercent).toBe(4);
    const withOvercharge = {
      ...charged,
      skillOverchargesByCompanionId: {
        [caster.id]: {
          companionId: caster.id,
          skillPowerBonusPercent: 10,
          cooldownPenaltyPercent: 20,
          expiresAt: 5_000,
        },
      },
    };
    const boosted = applySkillPowerBonusesToSkillDefinition(
      withOvercharge,
      caster,
      prepared.skill,
      { now: 1_100, additionalBonusPercent: prepared.additionalPowerBonusPercent },
    );
    if (boosted.effect.type === "fireBurst") {
      expect(boosted.effect.powerMultiplier).toBeCloseTo(1.15 * 1.14);
    }
    const consumed = recordSuccessfulMagicSupportSkill(
      charged,
      charged,
      caster,
      activeSkill("fire_burst"),
      enemy.id,
      1_100,
      false,
    );
    expect(consumed.arcaneCrescendoByCompanionId?.[caster.id]).toEqual({
      companionId: caster.id,
      offensiveSpellCount: 0,
      charged: false,
    });
  });

  it("does not count or trigger Arcane Crescendo on duplicated resolutions", () => {
    const caster = withRanks(
      createCompanion("elementalist", { x: 0, y: 0 }, "leader", "fighter", 1, "elementalist"),
      { arcane_crescendo: 1 },
    );
    const state = createState([caster], {
      arcaneCrescendoByCompanionId: {
        [caster.id]: {
          companionId: caster.id,
          offensiveSpellCount: 4,
          charged: false,
        },
      },
    });
    const nextState = recordSuccessfulMagicSupportSkill(
      state,
      state,
      caster,
      activeSkill("elemental_bolt"),
      "enemy",
      1_000,
      true,
    );
    expect(nextState.arcaneCrescendoByCompanionId).toEqual(
      state.arcaneCrescendoByCompanionId,
    );
  });

  it("uses primary rune-word changes for Word Resonance without advancing duplicates", () => {
    const caster = withRanks(
      createCompanion("runecaster", { x: 0, y: 0 }, "leader", "fighter", 1, "runecaster"),
      { word_resonance: 1 },
    );
    const state = createState([caster], {
      wordResonanceByCompanionId: {
        [caster.id]: {
          companionId: caster.id,
          previousPrimaryRuneWordId: "qqen",
        },
      },
    });
    const prepared = prepareMagicSupportSkill(
      state,
      caster,
      activeSkill("rune_lance"),
      "enemy",
      1_000,
      false,
    );
    expect(prepared.skill.effect.type).toBe("damage");
    if (prepared.skill.effect.type === "damage") {
      expect(prepared.skill.effect.powerMultiplier).toBeCloseTo(1.428);
    }

    const duplicate = prepareMagicSupportSkill(
      state,
      caster,
      activeSkill("rune_lance"),
      "enemy",
      1_000,
      true,
    );
    if (duplicate.skill.effect.type === "damage") {
      expect(duplicate.skill.effect.powerMultiplier).toBe(1.4);
    }
    const unchanged = recordSuccessfulMagicSupportSkill(
      state,
      state,
      caster,
      activeSkill("rune_lance"),
      "enemy",
      1_000,
      true,
    );
    expect(unchanged.wordResonanceByCompanionId).toEqual(
      state.wordResonanceByCompanionId,
    );
  });

  it("counts source-owned rune effects once each and caps Living Inscription at two", () => {
    const caster = withRanks(
      createCompanion("runecaster", { x: 0, y: 0 }, "leader", "fighter", 1, "runecaster"),
      { living_inscription: 1, word_resonance: 1 },
    );
    const state = createState([caster], {
      statusEffectsById: {
        binding: {
          id: "binding",
          type: "immobilized",
          targetId: "enemy-a",
          sourceId: caster.id,
          sourceKey: "binding_rune",
          appliedAt: 0,
          expiresAt: 5_000,
        },
        runeStep: {
          id: "rune-step",
          type: "immobilized",
          targetId: "enemy-b",
          sourceId: caster.id,
          sourceKey: "rune_step",
          appliedAt: 0,
          expiresAt: 5_000,
        },
      },
      skillRewindRunesByCompanionId: {
        ally: {
          id: "ally-rewind",
          targetId: "ally",
          sourceId: caster.id,
          sourceSkillId: "rewind_rune",
          healPercentRecordedDamage: 35,
          tickIntervalMs: 1_000,
          nextTickAt: 2_000,
          expiresAt: 5_000,
          recordedDamage: 0,
        },
      },
      wordResonanceByCompanionId: {
        [caster.id]: {
          companionId: caster.id,
          previousPrimaryRuneWordId: "qqen",
        },
      },
    });
    expect(getActiveRunicInscriptionCount(state, caster, 1_000)).toBe(2);
    const prepared = prepareMagicSupportSkill(
      state,
      caster,
      activeSkill("rune_lance"),
      "enemy",
      1_000,
      false,
    );
    if (prepared.skill.effect.type === "damage") {
      expect(prepared.skill.effect.powerMultiplier).toBeCloseTo(1.456);
    }
  });

  it("merges Overflowing Grace barriers to the rank cap and absorbs damage", () => {
    const caster = withRanks(
      createCompanion("lightbearer", { x: 0, y: 0 }, "leader", "support", 1, "lightbearer"),
      { overflowing_grace: 5 },
    );
    const target = {
      ...createCompanion("target", { x: 1, y: 0 }, "fighter"),
      maxHealth: 100,
      health: 95,
    };
    let state = createState([caster, target]);
    state = applyOverflowingGraceFromDirectHeal(state, caster, target, 16, 1_000);
    expect(state.overflowingGraceBarriersByCompanionId?.target).toMatchObject({
      remainingAbsorb: 4,
      maxAbsorb: 5,
      expiresAt: 9_000,
    });
    state = applyOverflowingGraceFromDirectHeal(state, caster, target, 16, 2_000);
    expect(state.overflowingGraceBarriersByCompanionId?.target).toMatchObject({
      remainingAbsorb: 5,
      expiresAt: 10_000,
    });

    const absorbed = absorbWithOverflowingGrace(state, target, 3, 2_500);
    expect(absorbed).toMatchObject({ remainingDamage: 0, absorbedDamage: 3 });
    expect(
      absorbed.state.overflowingGraceBarriersByCompanionId?.target.remainingAbsorb,
    ).toBe(2);
  });

  it("creates Overflowing Grace from actual direct-heal overhealing", () => {
    const caster = withRanks(
      createCompanion("lightbearer", { x: 0, y: 0 }, "leader", "support", 1, "lightbearer"),
      { overflowing_grace: 5 },
    );
    const targetBase = createCompanion("target", { x: 1, y: 0 }, "fighter");
    const target = { ...targetBase, health: targetBase.maxHealth - 1 };
    const result = resolveSkillEffect(
      createState([caster, target]),
      caster,
      {
        skill: activeSkill("light_mend"),
        target,
        score: 1,
        selectionPriority: 1,
      },
      1_000,
    );

    expect(result.shouldConsumeCooldown).toBe(true);
    expect(
      result.state.overflowingGraceBarriersByCompanionId?.[target.id]
        ?.remainingAbsorb,
    ).toBeGreaterThan(0);
  });

  it("boosts Many Beacons only when a remembered direct-heal target changes", () => {
    const caster = withRanks(
      createCompanion("lightbearer", { x: 0, y: 0 }, "leader", "support", 1, "lightbearer"),
      { many_beacons: 1 },
    );
    const state = createState([caster], {
      manyBeaconsByCompanionId: {
        [caster.id]: {
          companionId: caster.id,
          previousTargetId: "ally-a",
          expiresAt: 5_000,
        },
      },
    });
    expect(
      prepareMagicSupportSkill(
        state,
        caster,
        activeSkill("light_mend"),
        "ally-b",
        1_000,
        false,
      ).additionalPowerBonusPercent,
    ).toBe(2);
    expect(
      prepareMagicSupportSkill(
        state,
        caster,
        activeSkill("light_mend"),
        "ally-a",
        1_000,
        false,
      ).additionalPowerBonusPercent,
    ).toBe(0);
  });

  it("snapshots Crimson Authority durations while the Penitent is at half health", () => {
    const caster = withRanks(
      {
        ...createCompanion("penitent", { x: 0, y: 0 }, "leader", "fighter", 1, "penitent"),
        health: 50,
        maxHealth: 100,
      },
      { crimson_authority: 1 },
    );
    expect(
      getCrimsonAuthorityDurationMs(
        caster,
        activeSkill("whip_prison"),
        3_000,
      ),
    ).toBe(3_090);
  });

  it("checks Crimson Authority after a self-sacrifice crosses the half-health line", () => {
    const caster = withRanks(
      {
        ...createCompanion("penitent", { x: 0, y: 0 }, "leader", "fighter", 1, "penitent"),
        health: 52,
        maxHealth: 100,
      },
      { crimson_authority: 1 },
    );
    const enemy = createEnemy("enemy", { x: 1, y: 0 }, "aggressive", {
      defense: 0,
      evasion: 0,
      maxHealth: 1_000,
    });
    const result = resolveSkillEffect(
      createState([caster, enemy]),
      caster,
      {
        skill: activeSkill("flagellant_lash"),
        target: enemy,
        score: 1,
        selectionPriority: 1,
      },
      1_000,
    );
    const bleed = Object.values(result.state.statusEffectsById ?? {}).find(
      (status) => status.type === "bleed" && status.sourceKey === "flagellant_lash",
    );

    expect((result.state.entities[caster.id] as Companion).health).toBe(50);
    expect(bleed?.expiresAt).toBe(5_120);
  });

  it("grants, refreshes, and consumes Cruel Mercy only on qualifying skills", () => {
    const caster = withRanks(
      createCompanion("penitent", { x: 0, y: 0 }, "leader", "support", 1, "penitent"),
      { cruel_mercy: 1 },
    );
    const ally = { ...createCompanion("ally", { x: 1, y: 0 }, "fighter"), health: 50 };
    const beforeHeal = createState([caster, ally]);
    const afterHeal = {
      ...beforeHeal,
      entities: { ...beforeHeal.entities, ally: { ...ally, health: 60 } },
    };
    const charged = recordSuccessfulMagicSupportSkill(
      beforeHeal,
      afterHeal,
      caster,
      activeSkill("penitents_gift"),
      ally.id,
      1_000,
      false,
    );
    expect(charged.cruelMercyByCompanionId?.[caster.id]?.expiresAt).toBe(11_000);
    expect(
      prepareMagicSupportSkill(
        charged,
        caster,
        activeSkill("flagellant_lash"),
        "enemy",
        2_000,
        false,
      ).additionalPowerBonusPercent,
    ).toBe(3);
    const consumed = recordSuccessfulMagicSupportSkill(
      charged,
      charged,
      caster,
      activeSkill("flagellant_lash"),
      "enemy",
      2_000,
      false,
    );
    expect(consumed.cruelMercyByCompanionId?.[caster.id]).toBeUndefined();
  });

  it("cleans expired and dead-companion passive runtime state", () => {
    const dead = {
      ...createCompanion("dead", { x: 0, y: 0 }, "leader"),
      health: 0,
      state: "dead" as const,
    };
    const state = createState([dead], {
      cruelMercyByCompanionId: {
        dead: { companionId: "dead", expiresAt: 5_000 },
      },
      manyBeaconsByCompanionId: {
        dead: { companionId: "dead", previousTargetId: "ally", expiresAt: 5_000 },
      },
    });
    const cleaned = updateMagicSupportPassiveRuntime(state, 1_000);
    expect(cleaned.cruelMercyByCompanionId).toEqual({});
    expect(cleaned.manyBeaconsByCompanionId).toEqual({});
  });
});

function createState(
  entities: GameEntity[],
  overrides: Partial<GameState> = {},
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({ partyLeaderId: entities[0]?.id ?? "", ...overrides }),
  );
}

function withRanks(
  companion: Companion,
  ranksBySkillId: Partial<Record<SkillId, number>>,
): Companion {
  return {
    ...companion,
    skillProgression: {
      ...(companion.skillProgression ?? {
        ranksBySkillId: {},
        legacyEnabledSkillIds: [],
      }),
      ranksBySkillId: {
        ...(companion.skillProgression?.ranksBySkillId ?? {}),
        ...ranksBySkillId,
      },
    },
  };
}

function activeSkill(skillId: SkillId): ActiveSkillDefinition {
  const skill = SKILL_DEFINITIONS[skillId];
  if (skill.type !== "active") {
    throw new Error(`${skillId} is not an active skill`);
  }
  return skill;
}
