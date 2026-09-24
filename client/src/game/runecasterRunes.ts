import type {
  RunecasterRuneSequence,
  RunecasterRuneWordId,
  RunecasterSkillId,
  RuneWordDefinition,
  SkillId,
} from "./types";

export const RUNECASTER_SKILL_IDS = [
  "binding_rune",
  "rune_lance",
  "warding_glyph",
  "rewind_rune",
  "runic_focus",
  "leyline_matrix",
  "stone_sigil_rhythm",
  "rune_step",
] as const satisfies readonly RunecasterSkillId[];

export const RUNE_WORD_DEFINITIONS: Record<
  RunecasterRuneWordId,
  RuneWordDefinition
> = {
  qqen: {
    id: "qqen",
    glyphs: "ⵇⵇⵏ",
    transliterations: ["qqen", "qqn"],
    meaning: "To tie, bind, attach, or restrain.",
    mechanicalConcept: "Bind",
    sealAssetKey: "qqen",
  },
  asqqen: {
    id: "asqqen",
    glyphs: "ⴰⵙⵇⵇⵏ",
    transliterations: ["asqqen", "asqqn"],
    meaning: "A rope, tether, or physical bond.",
    mechanicalConcept: "Tether",
    sealAssetKey: "asqqen",
  },
  tafala: {
    id: "tafala",
    glyphs: "ⵜⴰⴼⴰⵍⴰ",
    transliterations: ["tafala"],
    meaning: "Spear or lance.",
    mechanicalConcept: "Lance",
    sealAssetKey: "tafala",
  },
  tazmert: {
    id: "tazmert",
    glyphs: "ⵜⴰⵣⵎⵎⴰⵔⵜ",
    transliterations: ["tazmmart", "tazmert"],
    meaning: "Power, capacity, strength, or ability.",
    mechanicalConcept: "Power",
    sealAssetKey: "tazmert",
  },
  amesten: {
    id: "amesten",
    glyphs: "ⴰⵎⵙⵜⵏ",
    transliterations: ["amesten"],
    meaning: "Protection or defense.",
    mechanicalConcept: "Protection",
    sealAssetKey: "amesten",
  },
  afrag: {
    id: "afrag",
    glyphs: "ⴰⴼⵔⴰⴳ",
    transliterations: ["afrag"],
    meaning: "A fence, enclosure, barricade, or protective boundary.",
    mechanicalConcept: "Barrier",
    sealAssetKey: "afrag",
  },
  ughal: {
    id: "ughal",
    glyphs: "ⵓⵖⴰⵍ",
    transliterations: ["uɣal"],
    meaning: "Return, go back, or come back.",
    mechanicalConcept: "Return",
    sealAssetKey: "ughal",
  },
  tudert: {
    id: "tudert",
    glyphs: "ⵜⵓⴷⵔⵜ",
    transliterations: ["tudert"],
    meaning: "Life.",
    mechanicalConcept: "Life",
    sealAssetKey: "tudert",
  },
  als: {
    id: "als",
    glyphs: "ⴰⵍⵙ",
    transliterations: ["als"],
    meaning: "Repeat, perform again, redo, or begin again.",
    mechanicalConcept: "Repeat",
    sealAssetKey: "als",
  },
  ammas: {
    id: "ammas",
    glyphs: "ⴰⵎⵎⴰⵙ",
    transliterations: ["ammas"],
    meaning: "Center or middle.",
    mechanicalConcept: "Center",
    sealAssetKey: "ammas",
  },
  aztta: {
    id: "aztta",
    glyphs: "ⴰⵣⵟⵟⴰ",
    transliterations: ["azṭṭa"],
    meaning: "Weaving, loom, web, or network.",
    mechanicalConcept: "Network",
    sealAssetKey: "aztta",
  },
  abrid: {
    id: "abrid",
    glyphs: "ⴰⴱⵔⵉⴷ",
    transliterations: ["abrid"],
    meaning: "Path, way, route, or road.",
    mechanicalConcept: "Path",
    sealAssetKey: "abrid",
  },
  azru: {
    id: "azru",
    glyphs: "ⴰⵣⵔⵓ",
    transliterations: ["azru"],
    meaning: "Rock or stone.",
    mechanicalConcept: "Stone",
    sealAssetKey: "azru",
  },
  anya: {
    id: "anya",
    glyphs: "ⴰⵏⵢⴰ",
    transliterations: ["anya"],
    meaning: "Rhythm, cadence, air, or melody.",
    mechanicalConcept: "Rhythm",
    sealAssetKey: "anya",
  },
  asurif: {
    id: "asurif",
    glyphs: "ⴰⵙⵓⵔⵉⴼ",
    transliterations: ["asurif"],
    meaning: "Step, stride, or stage of movement.",
    mechanicalConcept: "Step",
    sealAssetKey: "asurif",
  },
};

function sequence(
  primaryId: RunecasterRuneWordId,
  secondaryId: RunecasterRuneWordId,
  presentationGuidance: string,
): RunecasterRuneSequence {
  return {
    primary: RUNE_WORD_DEFINITIONS[primaryId],
    secondary: RUNE_WORD_DEFINITIONS[secondaryId],
    presentationGuidance,
  };
}

export const RUNECASTER_SKILL_RUNE_SEQUENCES: Record<
  RunecasterSkillId,
  RunecasterRuneSequence
> = {
  binding_rune: sequence(
    "qqen",
    "asqqen",
    "Place Qqen centrally as the binding command and Asqqen around or behind it as the closing tether.",
  ),
  rune_lance: sequence(
    "tafala",
    "tazmert",
    "Form the forward lance from Tafala and support it with Tazmert as the propelling force.",
  ),
  warding_glyph: sequence(
    "amesten",
    "afrag",
    "Present Amesten and Afrag as the inner protection and outer boundary.",
  ),
  rewind_rune: sequence(
    "ughal",
    "tudert",
    "Present Uɣal as returning motion around Tudert as the life-bearing center.",
  ),
  runic_focus: sequence(
    "als",
    "ammas",
    "Override normal primary emphasis: place Ammas at the center with Als surrounding it as repetition.",
  ),
  leyline_matrix: sequence(
    "aztta",
    "abrid",
    "Emphasize Azṭṭa on the caster as the network and Abrid on connected companions as its paths.",
  ),
  stone_sigil_rhythm: sequence(
    "azru",
    "anya",
    "Keep Azru heavy and stable while Anya supplies a repeated cadence.",
  ),
  rune_step: sequence(
    "asurif",
    "qqen",
    "Carry Asurif with the moving caster and leave Qqen at the destination as the binding trap.",
  ),
};

const runecasterSkillIds = new Set<SkillId>(RUNECASTER_SKILL_IDS);

export function isRunecasterSkillId(skillId: SkillId): skillId is RunecasterSkillId {
  return runecasterSkillIds.has(skillId);
}

export function getRunecasterRuneSequence(
  skillId: SkillId,
): RunecasterRuneSequence | null {
  return isRunecasterSkillId(skillId)
    ? RUNECASTER_SKILL_RUNE_SEQUENCES[skillId]
    : null;
}

export function getRunecasterRuneValidationErrors(): string[] {
  const errors: string[] = [];
  const orderedPairs = new Set<string>();

  for (const [wordId, word] of Object.entries(RUNE_WORD_DEFINITIONS)) {
    if (word.id !== wordId || word.sealAssetKey !== wordId) {
      errors.push(`${wordId} does not preserve one stable word and seal identity.`);
    }
  }

  for (const skillId of RUNECASTER_SKILL_IDS) {
    const runeWords = RUNECASTER_SKILL_RUNE_SEQUENCES[skillId];
    const orderedPair = `${runeWords.primary.id}->${runeWords.secondary.id}`;

    if (orderedPairs.has(orderedPair)) {
      errors.push(`${skillId} duplicates ordered sequence ${orderedPair}.`);
    }

    orderedPairs.add(orderedPair);
  }

  return errors;
}
