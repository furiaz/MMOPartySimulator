import { describe, expect, it } from "vitest";
import {
  RUNECASTER_SKILL_IDS,
  RUNECASTER_SKILL_RUNE_SEQUENCES,
  RUNE_WORD_DEFINITIONS,
  getRunecasterRuneValidationErrors,
} from "./runecasterRunes";
import { SKILL_DEFINITIONS } from "./skills";

describe("Runecaster rune-word definitions", () => {
  it("preserves every canonical Tifinagh spelling and transliteration", () => {
    expect(
      Object.fromEntries(
        Object.entries(RUNE_WORD_DEFINITIONS).map(([id, word]) => [
          id,
          [word.glyphs, ...word.transliterations],
        ]),
      ),
    ).toEqual({
      qqen: ["ⵇⵇⵏ", "qqen", "qqn"],
      asqqen: ["ⴰⵙⵇⵇⵏ", "asqqen", "asqqn"],
      tafala: ["ⵜⴰⴼⴰⵍⴰ", "tafala"],
      tazmert: ["ⵜⴰⵣⵎⵎⴰⵔⵜ", "tazmmart", "tazmert"],
      amesten: ["ⴰⵎⵙⵜⵏ", "amesten"],
      afrag: ["ⴰⴼⵔⴰⴳ", "afrag"],
      ughal: ["ⵓⵖⴰⵍ", "uɣal"],
      tudert: ["ⵜⵓⴷⵔⵜ", "tudert"],
      als: ["ⴰⵍⵙ", "als"],
      ammas: ["ⴰⵎⵎⴰⵙ", "ammas"],
      aztta: ["ⴰⵣⵟⵟⴰ", "azṭṭa"],
      abrid: ["ⴰⴱⵔⵉⴷ", "abrid"],
      azru: ["ⴰⵣⵔⵓ", "azru"],
      anya: ["ⴰⵏⵢⴰ", "anya"],
      asurif: ["ⴰⵙⵓⵔⵉⴼ", "asurif"],
    });
  });

  it("gives every current Runecaster active skill a unique ordered pair", () => {
    expect(getRunecasterRuneValidationErrors()).toEqual([]);
    expect(RUNECASTER_SKILL_IDS).toHaveLength(8);

    const orderedPairs = RUNECASTER_SKILL_IDS.map((skillId) => {
      const runeWords = RUNECASTER_SKILL_RUNE_SEQUENCES[skillId];
      return `${runeWords.primary.id}->${runeWords.secondary.id}`;
    });

    expect(new Set(orderedPairs).size).toBe(orderedPairs.length);

    for (const skillId of RUNECASTER_SKILL_IDS) {
      const skill = SKILL_DEFINITIONS[skillId];

      if (skill.type !== "active") {
        throw new Error(`${skillId} should be an active Runecaster skill.`);
      }

      expect(skill.runeWords).toBe(
        RUNECASTER_SKILL_RUNE_SEQUENCES[skillId],
      );
    }
  });

  it("reuses the exact Qqen word and seal identity in both skills", () => {
    expect(RUNECASTER_SKILL_RUNE_SEQUENCES.binding_rune.primary).toBe(
      RUNE_WORD_DEFINITIONS.qqen,
    );
    expect(RUNECASTER_SKILL_RUNE_SEQUENCES.rune_step.secondary).toBe(
      RUNE_WORD_DEFINITIONS.qqen,
    );
    expect(RUNE_WORD_DEFINITIONS.qqen.sealAssetKey).toBe("qqen");
  });
});
