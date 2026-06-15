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
    });

    const kick = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.kick,
    );
    const guardUp = getScaledSkillDefinitionForCompanion(
      companion,
      SKILL_DEFINITIONS.guard_up,
    );

    expect(kick.effect.type).toBe("lungeDamage");
    if (kick.effect.type === "lungeDamage") {
      expect(kick.effect.powerMultiplier).toBeCloseTo(1.1);
    }
    expect(guardUp.effect).toEqual(SKILL_DEFINITIONS.guard_up.effect);
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
      "sweeping_strike",
    ]);

    const enabledState = setCompanionLegacySkillEnabled(
      state,
      companion.id,
      "kick",
      true,
    );
    const enabledCompanion = enabledState.entities[companion.id] as Companion;

    expect(getActiveSkillsForCompanion(enabledCompanion).map((skill) => skill.id)).toEqual([
      "sweeping_strike",
      "kick",
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
    expect(groups[0].skills.map((skill) => skill.id)).toEqual(["mark_target"]);
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
      "mark_target",
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
