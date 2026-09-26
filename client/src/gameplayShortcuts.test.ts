import { describe, expect, it } from "vitest";

import {
  getCycledMainMenuTransition,
  getDirectMainMenuTransition,
  getDismissibleUiTargets,
  getGuideSequenceDismissal,
  getMenuShortcutTelemetryResult,
  MAIN_MENU_SHORTCUT_ORDER,
  resolveGameplayShortcut,
} from "./gameplayShortcuts";

const enabledOptions = {
  enabled: true,
  blockingOverlayActive: false,
};

describe("gameplay shortcuts", () => {
  it.each([
    ["Escape", false, "dismiss_ui", "escape"],
    ["Tab", false, "cycle_main_menu", "main_menu_cycle"],
    [" ", false, "toggle_simulation", "pause_toggle"],
    ["a", false, "toggle_auto_combat", "auto_combat_toggle"],
    ["J", false, "toggle_atlas", "atlas_toggle"],
    ["i", false, "toggle_inventory", "inventory_toggle"],
    ["1", false, "use_flask", "flask_use"],
    ["m", false, "toggle_world_travel", "world_travel_toggle"],
    ["D", true, "toggle_debug_tools", "debug_tools_toggle"],
  ])(
    "maps %s with shift=%s to %s",
    (key, shiftKey, actionType, shortcutId) => {
      expect(
        resolveGameplayShortcut({ key, shiftKey }, enabledOptions),
      ).toMatchObject({
        action: { type: actionType, shortcutId },
        shouldExecute: true,
      });
    },
  );

  it("opens Party first and cycles through the main menu order", () => {
    expect(getCycledMainMenuTransition(false, "options")).toEqual({
      activeTab: "party",
      isOpen: true,
      result: "opened",
    });

    for (const [index, activeTab] of MAIN_MENU_SHORTCUT_ORDER.entries()) {
      const nextTab =
        MAIN_MENU_SHORTCUT_ORDER[
          (index + 1) % MAIN_MENU_SHORTCUT_ORDER.length
        ];

      expect(getCycledMainMenuTransition(true, activeTab)).toEqual({
        activeTab: nextTab,
        isOpen: true,
        result: "cycled",
      });
    }
  });

  it("opens, switches, and closes direct menu shortcuts", () => {
    expect(getDirectMainMenuTransition(false, null, "inventory")).toEqual({
      activeTab: "inventory",
      isOpen: true,
      result: "opened",
    });
    expect(getDirectMainMenuTransition(true, "party", "inventory")).toEqual({
      activeTab: "inventory",
      isOpen: true,
      result: "switched",
    });
    expect(getDirectMainMenuTransition(true, "inventory", "inventory")).toEqual(
      {
        activeTab: "inventory",
        isOpen: false,
        result: "closed",
      },
    );
    expect(
      getMenuShortcutTelemetryResult(
        getDirectMainMenuTransition(true, "party", "inventory"),
      ),
    ).toBe("switched:inventory");
  });

  it("ignores shortcuts while disabled or editing", () => {
    expect(
      resolveGameplayShortcut(
        { key: "Tab" },
        { enabled: false, blockingOverlayActive: false },
      ),
    ).toBeNull();
    expect(
      resolveGameplayShortcut(
        { key: "i", target: { tagName: "INPUT" } },
        enabledOptions,
      ),
    ).toBeNull();
    expect(
      resolveGameplayShortcut(
        { key: "m", target: { isContentEditable: true } },
        enabledOptions,
      ),
    ).toBeNull();
    expect(
      resolveGameplayShortcut(
        {
          key: "a",
          target: { closest: () => ({ tagName: "textarea" }) },
        },
        enabledOptions,
      ),
    ).toBeNull();
  });

  it("ignores browser modifier combinations and requires exact Shift+D", () => {
    expect(
      resolveGameplayShortcut({ key: "j", ctrlKey: true }, enabledOptions),
    ).toBeNull();
    expect(
      resolveGameplayShortcut({ key: "i", altKey: true }, enabledOptions),
    ).toBeNull();
    expect(
      resolveGameplayShortcut({ key: "m", metaKey: true }, enabledOptions),
    ).toBeNull();
    expect(
      resolveGameplayShortcut({ key: "Tab", shiftKey: true }, enabledOptions),
    ).toBeNull();
    expect(resolveGameplayShortcut({ key: "d" }, enabledOptions)).toBeNull();
    expect(
      resolveGameplayShortcut(
        { key: "D", shiftKey: true, ctrlKey: true },
        enabledOptions,
      ),
    ).toBeNull();
  });

  it("blocks non-dismissal shortcuts behind overlays", () => {
    const blockingOptions = {
      enabled: true,
      blockingOverlayActive: true,
    };

    expect(resolveGameplayShortcut({ key: "Tab" }, blockingOptions)).toMatchObject({
      action: { type: "cycle_main_menu" },
      shouldExecute: false,
    });
    expect(
      resolveGameplayShortcut({ key: "Escape" }, blockingOptions),
    ).toMatchObject({ action: { type: "dismiss_ui" } });
  });

  it("recognizes repeated shortcuts without executing them again", () => {
    expect(
      resolveGameplayShortcut({ key: "Tab", repeat: true }, enabledOptions),
    ).toMatchObject({
      action: { type: "cycle_main_menu" },
      shouldExecute: false,
    });
  });

  it("returns only currently dismissible UI targets", () => {
    expect(
      getDismissibleUiTargets({
        gameMenuOpen: true,
        debugToolsOpen: true,
        npcInteractionOpen: true,
        guidePopupOpen: true,
        queuedGuidePopups: true,
        dungeonChestOpen: true,
        offlineSummaryOpen: true,
        secondaryPartySummaryOpen: true,
      }),
    ).toEqual([
      "game_menu",
      "debug_tools",
      "npc_interaction",
      "guide_popup",
      "queued_guide_popups",
      "dungeon_chest",
      "offline_summary",
      "secondary_party_summary",
    ]);

    expect(
      getDismissibleUiTargets({
        gameMenuOpen: false,
        debugToolsOpen: false,
        npcInteractionOpen: false,
        guidePopupOpen: false,
        queuedGuidePopups: false,
        dungeonChestOpen: false,
        offlineSummaryOpen: false,
        secondaryPartySummaryOpen: false,
      }),
    ).toEqual([]);
  });

  it("dismisses a full guide sequence and resumes only when it paused play", () => {
    expect(
      getGuideSequenceDismissal(
        "welcome",
        ["first_quest_started", "equipment_setup"],
        true,
        true,
      ),
    ).toEqual({
      dismissedGuidePopupIds: [
        "welcome",
        "first_quest_started",
        "equipment_setup",
      ],
      remainingQueuedGuidePopupIds: [],
      shouldFinishSequence: true,
      shouldResumeSimulation: true,
    });

    expect(
      getGuideSequenceDismissal(
        "welcome",
        ["first_quest_started"],
        false,
        true,
      ),
    ).toEqual({
      dismissedGuidePopupIds: ["welcome"],
      remainingQueuedGuidePopupIds: ["first_quest_started"],
      shouldFinishSequence: false,
      shouldResumeSimulation: false,
    });
  });
});
