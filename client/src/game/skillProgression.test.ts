import { describe, expect, it } from "vitest";
import { addEntity, setPartyMemberClass } from "./state";
import { addItemToInventoryState, countInventoryItem } from "./inventory";
import { createCompanion } from "./entities";
import { sanitizeGameStateForSave } from "./saveGame";
import {
  getActiveSkillsForCompanion,
  getCompanionSkillRank,
  getLearnedSkillGroupsForCompanion,
  getScaledSkillDefinitionForCompanion,
  getSkillMaxRank,
  getSkillRankMultiplier,
  readSkillBook,
  setCompanionLegacySkillEnabled,
} from "./skillProgression";
import { SKILL_DEFINITIONS } from "./skills";
import { createTestGameState } from "./testState";
import type { Companion, SkillId } from "./types";

const BLADE_SKILL_IDS: SkillId[] = [
  "duelist_challenge",
  "second_wind",
  "blade_parry",
  "edge_focus",
  "press_the_opening",
  "woodcutter_rhythm",
  "flash_step",
  "sweeping_strike",
];

const AEGIS_SKILL_IDS: SkillId[] = [
  "shield_challenge",
  "hold_fast",
  "guard_wall",
  "iron_stance",
  "shield_formation",
  "stonebreaker_rhythm",
  "shield_rush",
  "shield_shockwave",
];

const HUNTER_SKILL_IDS: SkillId[] = [
  "pinning_shot",
  "fake_death",
  "evasive_instinct",
  "hunters_focus",
  "poison_coating",
  "herbalist_rhythm",
  "skirmish_shot",
  "arrow_burst",
];

const BEAST_SKILL_IDS: SkillId[] = [
  "threatening_roar",
  "blood_feast",
  "rugged_hide",
  "feral_surge",
  "pack_frenzy",
  "stoneclaw_rhythm",
  "pounce",
  "maul_sweep",
];

describe("skill progression", () => {
  it("uses beginner and class rank caps", () => {
    expect(getSkillMaxRank(SKILL_DEFINITIONS.kick)).toBe(3);
    expect(getSkillMaxRank(SKILL_DEFINITIONS.sweeping_strike)).toBe(5);
  });

  it("uses small 5 percent rank multipliers after rank 1", () => {
    expect(getSkillRankMultiplier(1)).toBe(1);
    expect(getSkillRankMultiplier(3)).toBeCloseTo(1.1);
    expect(getSkillRankMultiplier(5)).toBeCloseTo(1.2);
  });

  it("scales supported values and leaves unsupported values unchanged", () => {
    const companion = withSkillRanks(createCompanion("companion", { x: 0, y: 0 }, "companion"), {
      kick: 3,
      guard_up: 3,
      second_wind: 5,
      blade_parry: 5,
      press_the_opening: 5,
      woodcutter_rhythm: 5,
      hold_fast: 5,
      guard_wall: 5,
      iron_stance: 5,
      shield_formation: 5,
      stonebreaker_rhythm: 5,
      shield_shockwave: 5,
      pinning_shot: 5,
      fake_death: 5,
      poison_coating: 5,
      skirmish_shot: 5,
      arrow_burst: 5,
      blood_feast: 5,
      rugged_hide: 5,
      feral_surge: 5,
      pack_frenzy: 5,
      stoneclaw_rhythm: 5,
      pounce: 5,
      maul_sweep: 5,
    });

    const kick = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.kick,
    );
    const guardUp = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.guard_up,
    );
    const secondWind = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.second_wind,
    );
    const bladeParry = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.blade_parry,
    );
    const pressTheOpening = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.press_the_opening,
    );
    const woodcutterRhythm = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.woodcutter_rhythm,
    );
    const holdFast = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.hold_fast,
    );
    const guardWall = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.guard_wall,
    );
    const ironStance = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.iron_stance,
    );
    const shieldFormation = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.shield_formation,
    );
    const stonebreakerRhythm = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.stonebreaker_rhythm,
    );
    const shieldShockwave = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.shield_shockwave,
    );
    const pinningShot = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.pinning_shot,
    );
    const fakeDeath = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.fake_death,
    );
    const poisonCoating = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.poison_coating,
    );
    const skirmishShot = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.skirmish_shot,
    );
    const arrowBurst = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.arrow_burst,
    );
    const bloodFeast = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.blood_feast,
    );
    const ruggedHide = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.rugged_hide,
    );
    const feralSurge = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.feral_surge,
    );
    const packFrenzy = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.pack_frenzy,
    );
    const stoneclawRhythm = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.stoneclaw_rhythm,
    );
    const pounce = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.pounce,
    );
    const maulSweep = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.maul_sweep,
    );

    expect(kick.effect.type).toBe("lungeDamage");
    if (kick.effect.type === "lungeDamage") {
      expect(kick.effect.powerMultiplier).toBeCloseTo(1.1);
    }
    expect(guardUp.effect).toEqual(SKILL_DEFINITIONS.guard_up.effect);
    expect(secondWind.effect.type).toBe("selfPercentHeal");
    if (secondWind.effect.type === "selfPercentHeal") {
      expect(secondWind.effect.healPercent).toBeCloseTo(24);
    }
    expect(bladeParry.effect.type).toBe("damageMitigation");
    if (bladeParry.effect.type === "damageMitigation") {
      expect(bladeParry.effect.mitigationPercent).toBeCloseTo(60);
    }
    expect(pressTheOpening.effect.type).toBe("partyBuff");
    if (pressTheOpening.effect.type === "partyBuff") {
      expect(pressTheOpening.effect.bonusDamage).toBeCloseTo(1.2);
    }
    expect(woodcutterRhythm.effect.type).toBe("gatherBuff");
    if (woodcutterRhythm.effect.type === "gatherBuff") {
      expect(woodcutterRhythm.effect.bonusGatherSpeed).toBeCloseTo(2.4);
    }
    expect(holdFast.effect.type).toBe("holdFast");
    if (holdFast.effect.type === "holdFast") {
      expect(holdFast.effect.defenseBonusPercent).toBeCloseTo(30);
      expect(holdFast.effect.absorbPercentMaxHealth).toBeCloseTo(12);
      expect(holdFast.effect.immobilizeDurationMs).toBe(4000);
    }
    expect(guardWall.effect.type).toBe("absorbShield");
    if (guardWall.effect.type === "absorbShield") {
      expect(guardWall.effect.absorbPercentMaxHealth).toBeCloseTo(18);
    }
    expect(ironStance.effect.type).toBe("selfMitigationBuff");
    if (ironStance.effect.type === "selfMitigationBuff") {
      expect(ironStance.effect.mitigationPercent).toBeCloseTo(12);
    }
    expect(shieldFormation.effect.type).toBe("partyMitigationBuff");
    if (shieldFormation.effect.type === "partyMitigationBuff") {
      expect(shieldFormation.effect.mitigationPercent).toBeCloseTo(9.6);
    }
    expect(stonebreakerRhythm.effect.type).toBe("gatherBuff");
    if (stonebreakerRhythm.effect.type === "gatherBuff") {
      expect(stonebreakerRhythm.effect.bonusGatherSpeed).toBeCloseTo(2.4);
    }
    expect(shieldShockwave.effect.type).toBe("shockwave");
    if (shieldShockwave.effect.type === "shockwave") {
      expect(shieldShockwave.effect.powerMultiplier).toBeCloseTo(0.6);
    }
    expect(pinningShot.effect.type).toBe("pinningShot");
    if (pinningShot.effect.type === "pinningShot") {
      expect(pinningShot.effect.durationMs).toBe(3500);
    }
    expect(fakeDeath.effect.type).toBe("fakeDeath");
    if (fakeDeath.effect.type === "fakeDeath") {
      expect(fakeDeath.effect.nextAttackDamageMultiplierBonus).toBeCloseTo(0.36);
    }
    expect(poisonCoating.effect.type).toBe("partyPoisonCoating");
    if (poisonCoating.effect.type === "partyPoisonCoating") {
      expect(poisonCoating.effect.poisonDamageAttackPowerPercent).toBeCloseTo(24);
    }
    expect(skirmishShot.effect.type).toBe("skirmishShot");
    if (skirmishShot.effect.type === "skirmishShot") {
      expect(skirmishShot.effect.powerMultiplier).toBeCloseTo(1.2);
    }
    expect(arrowBurst.effect.type).toBe("arrowBurst");
    if (arrowBurst.effect.type === "arrowBurst") {
      expect(arrowBurst.effect.powerMultiplier).toBeCloseTo(1.32);
    }
    expect(bloodFeast.effect.type).toBe("lifestealBuff");
    if (bloodFeast.effect.type === "lifestealBuff") {
      expect(bloodFeast.effect.durationMs).toBe(10000);
      expect(bloodFeast.effect.lifestealPercent).toBeCloseTo(12);
    }
    expect(ruggedHide.effect.type).toBe("selfMitigationBuff");
    if (ruggedHide.effect.type === "selfMitigationBuff") {
      expect(ruggedHide.effect.mitigationPercent).toBeCloseTo(24);
    }
    expect(feralSurge.effect.type).toBe("selfBuff");
    if (feralSurge.effect.type === "selfBuff") {
      expect(feralSurge.effect.bonusDamage).toBeCloseTo(1.2);
      expect(feralSurge.effect.movementSpeedBonusPercent).toBeCloseTo(24);
    }
    expect(packFrenzy.effect.type).toBe("partyBuff");
    if (packFrenzy.effect.type === "partyBuff") {
      expect(packFrenzy.effect.bonusDamage).toBeCloseTo(1.2);
    }
    expect(stoneclawRhythm.effect.type).toBe("gatherBuff");
    if (stoneclawRhythm.effect.type === "gatherBuff") {
      expect(stoneclawRhythm.effect.bonusGatherSpeed).toBeCloseTo(2.4);
      expect(stoneclawRhythm.effect.resourceType).toBe("ore");
    }
    expect(pounce.effect.type).toBe("pounce");
    if (pounce.effect.type === "pounce") {
      expect(pounce.effect.powerMultiplier).toBeCloseTo(1.2);
    }
    expect(maulSweep.effect.type).toBe("maulSweep");
    if (maulSweep.effect.type === "maulSweep") {
      expect(maulSweep.effect.powerMultiplier).toBeCloseTo(1.08);
    }
  });

  it("reads a skill book, consumes one item, and increments rank", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "companion");
    let state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );
    state = addItemToInventoryState(state, "first_aid_skill_book", 2, "debug").state;

    const result = readSkillBook(state, companion.id, "first_aid_skill_book");
    const nextCompanion = result.state.entities[companion.id] as Companion;

    expect(result.result).toMatchObject({
      status: "success",
      skillId: "first_aid",
      previousRank: 1,
      newRank: 2,
      maxRank: 3,
    });
    expect(countInventoryItem(result.state.inventory, "first_aid_skill_book")).toBe(1);
    expect(getCompanionSkillRank(nextCompanion, "first_aid")).toBe(2);
  });

  it("reads new Blade skill books for eligible Blade companions", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "fighter",
      1,
      "blade",
    );
    let state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );
    state = addItemToInventoryState(
      state,
      "flash_step_skill_book",
      1,
      "debug",
    ).state;

    const result = readSkillBook(state, companion.id, "flash_step_skill_book");
    const nextCompanion = result.state.entities[companion.id] as Companion;

    expect(result.result).toMatchObject({
      status: "success",
      skillId: "flash_step",
      previousRank: 1,
      newRank: 2,
      maxRank: 5,
    });
    expect(getCompanionSkillRank(nextCompanion, "flash_step")).toBe(2);
  });

  it("reads new Aegis skill books for eligible Aegis companions", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "defender",
      1,
      "aegis",
    );
    let state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );
    state = addItemToInventoryState(
      state,
      "shield_rush_skill_book",
      1,
      "debug",
    ).state;

    const result = readSkillBook(state, companion.id, "shield_rush_skill_book");
    const nextCompanion = result.state.entities[companion.id] as Companion;

    expect(result.result).toMatchObject({
      status: "success",
      skillId: "shield_rush",
      previousRank: 1,
      newRank: 2,
      maxRank: 5,
    });
    expect(getCompanionSkillRank(nextCompanion, "shield_rush")).toBe(2);
  });

  it("reads new Hunter skill books for eligible Hunter companions", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "fighter",
      1,
      "hunter",
    );
    let state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );
    state = addItemToInventoryState(
      state,
      "arrow_burst_skill_book",
      1,
      "debug",
    ).state;

    const result = readSkillBook(state, companion.id, "arrow_burst_skill_book");
    const nextCompanion = result.state.entities[companion.id] as Companion;

    expect(result.result).toMatchObject({
      status: "success",
      skillId: "arrow_burst",
      previousRank: 1,
      newRank: 2,
      maxRank: 5,
    });
    expect(getCompanionSkillRank(nextCompanion, "arrow_burst")).toBe(2);
  });

  it("reads new Beast skill books for eligible Beast companions", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "fighter",
      1,
      "beast",
    );
    let state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );
    state = addItemToInventoryState(
      state,
      "maul_sweep_skill_book",
      1,
      "debug",
    ).state;

    const result = readSkillBook(state, companion.id, "maul_sweep_skill_book");
    const nextCompanion = result.state.entities[companion.id] as Companion;

    expect(result.result).toMatchObject({
      status: "success",
      skillId: "maul_sweep",
      previousRank: 1,
      newRank: 2,
      maxRank: 5,
    });
    expect(getCompanionSkillRank(nextCompanion, "maul_sweep")).toBe(2);
  });

  it("fails book reads without consuming when maxed, unavailable, or missing", () => {
    const companion = withSkillRanks(
      createCompanion("companion", { x: 0, y: 0 }, "companion"),
      { first_aid: 3 },
    );
    let state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );
    state = addItemToInventoryState(state, "first_aid_skill_book", 1, "debug").state;
    state = addItemToInventoryState(state, "sweeping_strike_skill_book", 1, "debug").state;

    const maxed = readSkillBook(state, companion.id, "first_aid_skill_book");
    const unavailable = readSkillBook(
      state,
      companion.id,
      "sweeping_strike_skill_book",
    );
    const missing = readSkillBook(state, companion.id, "kick_skill_book");

    expect(maxed.result).toMatchObject({
      status: "failed",
      reason: "skill_maxed",
    });
    expect(unavailable.result).toMatchObject({
      status: "failed",
      reason: "skill_unavailable",
    });
    expect(missing.result).toMatchObject({
      status: "failed",
      reason: "book_not_in_inventory",
    });
    expect(countInventoryItem(maxed.state.inventory, "first_aid_skill_book")).toBe(1);
    expect(countInventoryItem(unavailable.state.inventory, "sweeping_strike_skill_book")).toBe(1);
    expect(countInventoryItem(missing.state.inventory, "kick_skill_book")).toBe(0);
  });

  it("keeps old skills out of the active pool until maxed and legacy-enabled", () => {
    const companion = withSkillRanks(
      createCompanion("companion", { x: 0, y: 0 }, "companion", "fighter", 1, "blade"),
      { kick: 3 },
    );
    const state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );

    expect(getActiveSkillsForCompanion(companion).map((skill) => skill.id)).toEqual([
      ...BLADE_SKILL_IDS,
    ]);

    const enabledState = setCompanionLegacySkillEnabled(
      state,
      companion.id,
      "kick",
      true,
    );
    const enabledCompanion = enabledState.entities[companion.id] as Companion;

    expect(getActiveSkillsForCompanion(enabledCompanion).map((skill) => skill.id)).toEqual([
      ...BLADE_SKILL_IDS,
      "kick",
    ]);
  });

  it("keeps Aegis current-class skills ordered in the active pool", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "defender",
      1,
      "aegis",
    );

    expect(getActiveSkillsForCompanion(companion).map((skill) => skill.id)).toEqual([
      ...AEGIS_SKILL_IDS,
    ]);
  });

  it("groups learned skills by current class lineage, then Beginner", () => {
    const companion = withSkillRanks(
      createCompanion("companion", { x: 0, y: 0 }, "companion", "fighter", 1, "hunter"),
      {
        kick: 3,
        first_aid: 2,
        sweeping_strike: 4,
      },
    );

    const groups = getLearnedSkillGroupsForCompanion(companion);

    expect(groups.map((group) => group.classId)).toEqual([
      "hunter",
      "beginner",
    ]);
    expect(groups[0].skills.map((skill) => skill.id)).toEqual(HUNTER_SKILL_IDS);
    expect(groups[1].skills.map((skill) => skill.id)).toEqual([
      "kick",
      "first_aid",
    ]);
  });

  it("drops skills outside the current class line after a class reset", () => {
    const blade = withSkillRanks(
      createCompanion("companion", { x: 0, y: 0 }, "companion", "fighter", 1, "blade"),
      {
        kick: 3,
        sweeping_strike: 5,
      },
    );
    let state = addEntity(
      createTestGameState({ partyLeaderId: blade.id }),
      blade,
    );

    state = setPartyMemberClass(state, blade.id, "beginner");
    state = setPartyMemberClass(state, blade.id, "hunter");

    const hunter = state.entities[blade.id] as Companion;

    expect(hunter.skillProgression?.ranksBySkillId).not.toHaveProperty(
      "sweeping_strike",
    );
    expect(getLearnedSkillGroupsForCompanion(hunter).map((group) => group.classId)).toEqual([
      "hunter",
      "beginner",
    ]);
    expect(getActiveSkillsForCompanion(hunter).map((skill) => skill.id)).toEqual([
      ...HUNTER_SKILL_IDS,
    ]);
  });

  it("keeps Beast current-class skills ordered in the active pool", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "fighter",
      1,
      "beast",
    );

    expect(getActiveSkillsForCompanion(companion).map((skill) => skill.id)).toEqual([
      ...BEAST_SKILL_IDS,
    ]);
  });

  it("sanitizes missing fields and invalid skill ids for saves", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "companion"),
      skillProgression: undefined,
    } as Companion;
    const invalidCompanion = {
      ...createCompanion("invalid", { x: 0, y: 0 }, "companion", "fighter", 1, "blade"),
      skillProgression: {
        ranksBySkillId: {
          kick: 4,
          not_a_skill: 99,
        } as Partial<Record<SkillId, number>>,
        legacyEnabledSkillIds: ["kick", "not_a_skill"] as SkillId[],
      },
    };
    const state = addEntity(
      addEntity(createTestGameState({ partyLeaderId: companion.id }), companion),
      invalidCompanion,
    );

    const saved = sanitizeGameStateForSave(state);
    const savedCompanion = saved.entities[companion.id] as Companion;
    const savedInvalidCompanion = saved.entities[invalidCompanion.id] as Companion;

    expect(savedCompanion.skillProgression?.ranksBySkillId.first_aid).toBe(1);
    expect(savedInvalidCompanion.skillProgression?.ranksBySkillId.kick).toBe(3);
    expect(savedInvalidCompanion.skillProgression?.ranksBySkillId).not.toHaveProperty(
      "not_a_skill",
    );
    expect(savedInvalidCompanion.skillProgression?.legacyEnabledSkillIds).toEqual([
      "kick",
    ]);
  });
});

function withSkillRanks(
  companion: Companion,
  ranksBySkillId: Partial<Record<SkillId, number>>,
): Companion {
  return {
    ...companion,
    skillProgression: {
      ranksBySkillId: {
        ...(companion.skillProgression?.ranksBySkillId ?? {}),
        ...ranksBySkillId,
      },
      legacyEnabledSkillIds: companion.skillProgression?.legacyEnabledSkillIds ?? [],
    },
  };
}
