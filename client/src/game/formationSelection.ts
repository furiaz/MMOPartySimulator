import { getFormationTemplate } from "./formationTemplates";
import type { GameState } from "./state";
import type { FormationPresetId } from "./types";

export const FORMATION_CHOICES = [
  { id: "arrow", label: "Arrow" },
  { id: "balanced", label: "Balanced" },
  { id: "side-by-side", label: "Side-by-side" },
] as const;

export function normalizeFormationPreset(value: unknown): FormationPresetId {
  return FORMATION_CHOICES.some(choice => choice.id === value) ? value as FormationPresetId : "arrow";
}

export function getSelectedFormationPreset(state: Pick<GameState, "selectedFormationPreset">): FormationPresetId {
  return normalizeFormationPreset(state.selectedFormationPreset);
}

/** Configuration only; the next simulation boundary observes the complete edit. */
export function selectFormationPreset(state: GameState, preset: unknown): GameState {
  if (!FORMATION_CHOICES.some(choice => choice.id === preset) || getSelectedFormationPreset(state) === preset) return state;
  return { ...state, selectedFormationPreset: preset as FormationPresetId };
}

export function getFormationSelectionOptions(memberCount: number) {
  return FORMATION_CHOICES.map(choice => ({ ...choice, slots: getFormationTemplate(choice.id, memberCount)?.slots ?? [] }));
}

export type FormationSelectionOption = ReturnType<typeof getFormationSelectionOptions>[number];
