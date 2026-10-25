import { describe, expect, it } from "vitest";
import { FORMATION_CHOICES, getFormationSelectionOptions, getSelectedFormationPreset, selectFormationPreset } from "./formationSelection";
import { createInitialGameState } from "./createInitialGameState";
import { createTestGameState } from "./testState";
import { createSavedGame, restoreGameStateFromSave, SAVE_VERSION } from "./saveGame";
import { reconcileFormationAssignments } from "./formationAssignments";

describe("formation selection and persistence", () => {
  it("defaults to Arrow and treats invalid and duplicate requests as identity operations", () => {
    const state = createTestGameState();
    expect(getSelectedFormationPreset(state)).toBe("arrow");
    expect(createInitialGameState().selectedFormationPreset).toBe("arrow");
    for (const preset of ["arrow", "other", undefined, null, {}, 1]) expect(selectFormationPreset(state, preset)).toBe(state);
  });

  it.each(FORMATION_CHOICES)("stores $id without moving, reconciling, or rewriting other state", ({ id }) => {
    const state = createInitialGameState();
    const next = selectFormationPreset(state, id);
    expect(getSelectedFormationPreset(next)).toBe(id);
    expect({ ...next, selectedFormationPreset: state.selectedFormationPreset }).toEqual(state);
    expect(next.entities).toBe(state.entities);
    expect(next.formationAssignments).toBe(state.formationAssignments);
    expect(selectFormationPreset(next, id)).toBe(next);
    expect(reconcileFormationAssignments(next).formationAssignments?.preset).toBe(id);
  });

  it.each(FORMATION_CHOICES)("round-trips $id while discarding runtime", ({ id }) => {
    let state = reconcileFormationAssignments(createInitialGameState());
    state = selectFormationPreset(state, id);
    const save = createSavedGame(state, 1000);
    expect(save.state.selectedFormationPreset).toBe(id);
    expect(save.state.formationAssignments).toBeUndefined();
    expect(SAVE_VERSION).toBe(3);
    const restored = restoreGameStateFromSave(JSON.parse(JSON.stringify(save)));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.selectedFormationPreset).toBe(id);
    expect(restored.state.formationAssignments).toBeUndefined();
    expect(reconcileFormationAssignments(restored.state).formationAssignments?.preset).toBe(id);
  });

  it.each([undefined, null, "unknown", {}, [], 12])("defaults malformed saved preference %s without rejecting the save", value => {
    const save = JSON.parse(JSON.stringify(createSavedGame(createInitialGameState(), 1000)));
    save.state.selectedFormationPreset = value;
    save.state.formationAssignments = { preset: "side-by-side", transition: { elapsedMs: 500 } };
    const restored = restoreGameStateFromSave(save);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.state.selectedFormationPreset).toBe("arrow");
      expect(restored.state.formationAssignments).toBeUndefined();
    }
  });

  it("adapts previews to all sizes, without inventing unsupported layouts", () => {
    for (let count = 1; count <= 5; count++) for (const option of getFormationSelectionOptions(count)) expect(option.slots).toHaveLength(count);
    for (const count of [0, 6]) expect(getFormationSelectionOptions(count).every(option => option.slots.length === 0)).toBe(true);
  });
});
