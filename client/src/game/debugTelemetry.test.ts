import { describe, expect, it } from "vitest";

import {
  recordKeyboardShortcutTelemetry,
  startDebugTelemetryRecording,
} from "./debugTelemetry";
import { createTestGameState } from "./testState";

describe("keyboard shortcut debug telemetry", () => {
  it("records applied shortcut details while recording is active", () => {
    const state = startDebugTelemetryRecording(createTestGameState());
    const nextState = recordKeyboardShortcutTelemetry(state, {
      keyboardShortcutId: "escape",
      result: "dismissed",
      dismissedUiTargets: ["game_menu", "npc_interaction"],
    });

    expect(nextState.debugTelemetry?.events).toEqual([
      expect.objectContaining({
        tick: 0,
        type: "keyboard_shortcut_used",
        entityId: "__ui__",
        keyboardShortcutId: "escape",
        result: "dismissed",
        dismissedUiTargets: ["game_menu", "npc_interaction"],
      }),
    ]);
  });

  it("does not record shortcut events while recording is off", () => {
    const state = createTestGameState();

    expect(
      recordKeyboardShortcutTelemetry(state, {
        keyboardShortcutId: "inventory_toggle",
        result: "opened:inventory",
      }),
    ).toBe(state);
  });
});
