import { describe, expect, it } from "vitest";
import { getSkillRoleScore } from "./skillRolePreferences";
import { SKILL_DEFINITIONS, getSkillsForClass } from "./skills";

describe("skill role preferences", () => {
  it("caps positive tag matches so tag-heavy skills do not inflate forever", () => {
    expect(
      getSkillRoleScore("fighter", [
        "Offensive",
        "Damage",
        "Single Target",
        "Multi Target",
        "AoE",
      ]),
    ).toBe(6);
  });

  it("counts avoid tags strongly and without a positive cap", () => {
    expect(
      getSkillRoleScore("fighter", [
        "Offensive",
        "Damage",
        "Taunt",
        "Aggro",
      ]),
    ).toBe(-6);
  });

  it("makes Throw Rock less desirable than Kick for Fighters", () => {
    expect(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.throw_rock.tags),
    ).toBeLessThan(getSkillRoleScore("fighter", SKILL_DEFINITIONS.kick.tags));
  });

  it("makes Throw Rock desirable for Defenders", () => {
    expect(getSkillRoleScore("defender", SKILL_DEFINITIONS.throw_rock.tags)).toBeGreaterThan(0);
  });

  it("lets Support value HP-cost healing when healing and safety tags are present", () => {
    expect(
      getSkillRoleScore("support", SKILL_DEFINITIONS.penitents_gift.tags),
    ).toBeGreaterThan(0);
  });

  it("lets Fighters value self-healing without valuing normal ally healing", () => {
    expect(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.second_wind.tags),
    ).toBeGreaterThan(0);
    expect(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.first_aid.tags),
    ).toBeLessThanOrEqual(0);
  });

  it("makes every role value self and party buffs", () => {
    for (const role of ["fighter", "defender", "support", "gatherer", "none"] as const) {
      expect(getSkillRoleScore(role, ["Self Buff"])).toBeGreaterThan(0);
      expect(getSkillRoleScore(role, ["Party Buff"])).toBeGreaterThan(0);
    }
  });

  it("makes every role value maintenance skills", () => {
    for (const role of ["fighter", "defender", "support", "gatherer", "none"] as const) {
      expect(
        getSkillRoleScore(role, SKILL_DEFINITIONS.mana_shield.tags),
      ).toBeGreaterThan(0);
      expect(getSkillRoleScore(role, ["Maintenance"])).toBeGreaterThan(0);
    }
  });

  it("scores Barrier like Shield for protective roles", () => {
    expect(getSkillRoleScore("defender", ["Barrier"])).toBe(
      getSkillRoleScore("defender", ["Shield"]),
    );
    expect(getSkillRoleScore("support", ["Barrier"])).toBe(
      getSkillRoleScore("support", ["Shield"]),
    );
    expect(getSkillRoleScore("fighter", ["Barrier"])).toBe(
      getSkillRoleScore("fighter", ["Shield"]),
    );
  });

  it("makes Aegis control and mitigation most desirable for Defenders", () => {
    const defenderShockwaveScore = getSkillRoleScore(
      "defender",
      SKILL_DEFINITIONS.shield_shockwave.tags,
    );

    expect(defenderShockwaveScore).toBeGreaterThan(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.shield_shockwave.tags),
    );
    expect(defenderShockwaveScore).toBeGreaterThan(
      getSkillRoleScore("support", SKILL_DEFINITIONS.shield_shockwave.tags),
    );
    expect(
      getSkillRoleScore("defender", SKILL_DEFINITIONS.guard_wall.tags),
    ).toBeGreaterThan(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.guard_wall.tags),
    );
  });

  it("keeps Beast aggression strongest for Fighters and Defenders", () => {
    expect(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.maul_sweep.tags),
    ).toBeGreaterThan(
      getSkillRoleScore("support", SKILL_DEFINITIONS.maul_sweep.tags),
    );
    expect(
      getSkillRoleScore("defender", SKILL_DEFINITIONS.threatening_roar.tags),
    ).toBeGreaterThan(
      getSkillRoleScore("support", SKILL_DEFINITIONS.threatening_roar.tags),
    );
    expect(
      getSkillRoleScore("gatherer", SKILL_DEFINITIONS.stoneclaw_rhythm.tags),
    ).toBeGreaterThan(0);
  });

  it("keeps Penitent strongest for Support while preserving offensive and gathering tools", () => {
    expect(
      getSkillRoleScore("support", SKILL_DEFINITIONS.penitents_gift.tags),
    ).toBeGreaterThan(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.penitents_gift.tags),
    );
    expect(
      getSkillRoleScore("fighter", SKILL_DEFINITIONS.flagellant_lash.tags),
    ).toBeGreaterThan(0);
    expect(
      getSkillRoleScore("gatherer", SKILL_DEFINITIONS.woodcutting_penance.tags),
    ).toBeGreaterThan(0);
  });

  it("keeps Beginner skills scoped to Beginner class lookup", () => {
    expect(getSkillsForClass("beginner").map((skill) => skill.id)).toEqual([
      "throw_rock",
      "kick",
      "guard_up",
      "first_aid",
      "deep_breath",
      "rally_call",
      "field_hands",
      "quick_step",
    ]);
    expect(getSkillsForClass("blade").map((skill) => skill.id)).toEqual([
      "duelist_challenge",
      "second_wind",
      "blade_parry",
      "edge_focus",
      "press_the_opening",
      "woodcutter_rhythm",
      "flash_step",
      "sweeping_strike",
    ]);
    expect(getSkillsForClass("aegis").map((skill) => skill.id)).toEqual([
      "shield_challenge",
      "hold_fast",
      "guard_wall",
      "iron_stance",
      "shield_formation",
      "stonebreaker_rhythm",
      "shield_rush",
      "shield_shockwave",
    ]);
    expect(getSkillsForClass("hunter").map((skill) => skill.id)).toEqual([
      "pinning_shot",
      "fake_death",
      "evasive_instinct",
      "hunters_focus",
      "poison_coating",
      "herbalist_rhythm",
      "skirmish_shot",
      "arrow_burst",
    ]);
    expect(getSkillsForClass("beast").map((skill) => skill.id)).toEqual([
      "threatening_roar",
      "blood_feast",
      "rugged_hide",
      "feral_surge",
      "pack_frenzy",
      "stoneclaw_rhythm",
      "pounce",
      "maul_sweep",
    ]);
    expect(getSkillsForClass("elementalist").map((skill) => skill.id)).toEqual([
      "elemental_bolt",
      "mana_shield",
      "frost_armor",
      "overcharge",
      "arcane_conduit",
      "emberwood_rhythm",
      "flame_step",
      "fire_burst",
    ]);
    expect(getSkillsForClass("runecaster").map((skill) => skill.id)).toEqual([
      "binding_rune",
      "rune_lance",
      "warding_glyph",
      "rewind_rune",
      "runic_focus",
      "leyline_matrix",
      "stone_sigil_rhythm",
      "rune_step",
    ]);
    expect(getSkillsForClass("lightbearer").map((skill) => skill.id)).toEqual([
      "blinding_ray",
      "light_mend",
      "sanctuary_veil",
      "guiding_light",
      "radiant_benediction",
      "herbalist_hymn",
      "dawn_step",
      "circle_of_renewal",
    ]);
    expect(getSkillsForClass("penitent").map((skill) => skill.id)).toEqual([
      "whip_prison",
      "flagellant_lash",
      "martyrs_veil",
      "penitents_gift",
      "eternal_hope",
      "burdened_benediction",
      "woodcutting_penance",
      "atonement_step",
    ]);
  });
});
