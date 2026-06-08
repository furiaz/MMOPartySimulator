import {
  createSavedGame,
  restoreGameStateFromSave,
  validateSavedGame,
  type SavedGame,
} from "./game";
import type { GameState } from "./game";

export const LOCAL_SAVE_STORAGE_KEY = "mmo-party-simulator.save.v1";

export type LocalSaveReadResult =
  | { ok: true; save: SavedGame }
  | { ok: false; reason: string };

export type LocalSaveWriteResult =
  | { ok: true; savedAtMs: number }
  | { ok: false; reason: string };

export function readLocalSave(): LocalSaveReadResult {
  try {
    const rawSave = window.localStorage.getItem(LOCAL_SAVE_STORAGE_KEY);

    if (!rawSave) {
      return { ok: false, reason: "No save file found." };
    }

    return parseSavedGameText(rawSave);
  } catch (error) {
    return { ok: false, reason: getStorageErrorMessage(error) };
  }
}

export function writeLocalSave(
  state: GameState,
  savedAtMs = Date.now(),
): LocalSaveWriteResult {
  const save = createSavedGame(state, savedAtMs);

  try {
    window.localStorage.setItem(LOCAL_SAVE_STORAGE_KEY, JSON.stringify(save));

    return { ok: true, savedAtMs };
  } catch (error) {
    return { ok: false, reason: getStorageErrorMessage(error) };
  }
}

export function writeLocalSaveFile(save: SavedGame): LocalSaveWriteResult {
  try {
    window.localStorage.setItem(LOCAL_SAVE_STORAGE_KEY, JSON.stringify(save));

    return { ok: true, savedAtMs: save.savedAtMs };
  } catch (error) {
    return { ok: false, reason: getStorageErrorMessage(error) };
  }
}

export function deleteLocalSave(): LocalSaveWriteResult {
  try {
    window.localStorage.removeItem(LOCAL_SAVE_STORAGE_KEY);

    return { ok: true, savedAtMs: Date.now() };
  } catch (error) {
    return { ok: false, reason: getStorageErrorMessage(error) };
  }
}

export function hasValidLocalSave(): boolean {
  return readLocalSave().ok;
}

export function hasStoredSaveFile(): boolean {
  try {
    return window.localStorage.getItem(LOCAL_SAVE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function parseSavedGameText(text: string): LocalSaveReadResult {
  try {
    const parsedSave = JSON.parse(text);
    const validation = validateSavedGame(parsedSave);

    if (!validation.ok) {
      return validation;
    }

    const restored = restoreGameStateFromSave(validation.save);

    if (!restored.ok) {
      return restored;
    }

    return { ok: true, save: validation.save };
  } catch {
    return { ok: false, reason: "Save file is not valid JSON." };
  }
}

export function downloadSavedGame(save: SavedGame): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `mmo-party-simulator-save-${save.savedAtMs}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function getStorageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Browser storage failed.";
}
