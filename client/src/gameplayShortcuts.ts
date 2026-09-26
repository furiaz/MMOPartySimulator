import type { DebugDismissibleUiTarget } from "./game";
import type { GuidePopupId } from "./guidePopupDefinitions";
import type { GameMenuTab } from "./gameMenuTypes";

export const MAIN_MENU_SHORTCUT_ORDER: readonly GameMenuTab[] = [
  "party",
  "partyManagement",
  "inventory",
  "atlas",
  "world",
  "options",
];

export type GameplayShortcutAction =
  | { type: "dismiss_ui"; shortcutId: "escape" }
  | { type: "cycle_main_menu"; shortcutId: "main_menu_cycle" }
  | { type: "toggle_simulation"; shortcutId: "pause_toggle" }
  | { type: "toggle_auto_combat"; shortcutId: "auto_combat_toggle" }
  | { type: "toggle_atlas"; shortcutId: "atlas_toggle" }
  | { type: "toggle_inventory"; shortcutId: "inventory_toggle" }
  | { type: "use_flask"; shortcutId: "flask_use" }
  | { type: "toggle_world_travel"; shortcutId: "world_travel_toggle" }
  | { type: "toggle_debug_tools"; shortcutId: "debug_tools_toggle" };

export type GameplayShortcutResolution = {
  action: GameplayShortcutAction;
  shouldExecute: boolean;
};

export type GameplayShortcutEventLike = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  shiftKey?: boolean;
  target?: unknown;
};

type ShortcutTargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
};

export function isGameplayShortcutEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const shortcutTarget = target as ShortcutTargetLike;
  const tagName = shortcutTarget.tagName?.toLowerCase();

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    shortcutTarget.isContentEditable
  ) {
    return true;
  }

  return Boolean(
    shortcutTarget.closest?.(
      'input, textarea, select, [contenteditable="true"]',
    ),
  );
}

export function resolveGameplayShortcut(
  event: GameplayShortcutEventLike,
  options: {
    enabled: boolean;
    blockingOverlayActive: boolean;
  },
): GameplayShortcutResolution | null {
  if (
    !options.enabled ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    isGameplayShortcutEditableTarget(event.target)
  ) {
    return null;
  }

  const normalizedKey = event.key.toLowerCase();
  let action: GameplayShortcutAction | null = null;

  if (event.shiftKey) {
    if (normalizedKey === "d") {
      action = {
        type: "toggle_debug_tools",
        shortcutId: "debug_tools_toggle",
      };
    }
  } else if (event.key === "Escape") {
    action = { type: "dismiss_ui", shortcutId: "escape" };
  } else if (event.key === "Tab") {
    action = {
      type: "cycle_main_menu",
      shortcutId: "main_menu_cycle",
    };
  } else if (
    event.key === " " ||
    event.key === "Space" ||
    event.key === "Spacebar"
  ) {
    action = { type: "toggle_simulation", shortcutId: "pause_toggle" };
  } else if (normalizedKey === "a") {
    action = {
      type: "toggle_auto_combat",
      shortcutId: "auto_combat_toggle",
    };
  } else if (normalizedKey === "j") {
    action = { type: "toggle_atlas", shortcutId: "atlas_toggle" };
  } else if (normalizedKey === "i") {
    action = { type: "toggle_inventory", shortcutId: "inventory_toggle" };
  } else if (event.key === "1") {
    action = { type: "use_flask", shortcutId: "flask_use" };
  } else if (normalizedKey === "m") {
    action = {
      type: "toggle_world_travel",
      shortcutId: "world_travel_toggle",
    };
  }

  if (!action) {
    return null;
  }

  return {
    action,
    shouldExecute:
      !event.repeat &&
      (!options.blockingOverlayActive || action.type === "dismiss_ui"),
  };
}

export type MainMenuShortcutTransition = {
  activeTab: GameMenuTab;
  isOpen: boolean;
  result: "opened" | "cycled" | "switched" | "closed";
};

export function getCycledMainMenuTransition(
  isOpen: boolean,
  activeTab: GameMenuTab | null,
): MainMenuShortcutTransition {
  if (!isOpen) {
    return { activeTab: "party", isOpen: true, result: "opened" };
  }

  const activeIndex = activeTab
    ? MAIN_MENU_SHORTCUT_ORDER.indexOf(activeTab)
    : -1;
  const nextIndex = (activeIndex + 1) % MAIN_MENU_SHORTCUT_ORDER.length;

  return {
    activeTab: MAIN_MENU_SHORTCUT_ORDER[nextIndex]!,
    isOpen: true,
    result: "cycled",
  };
}

export function getDirectMainMenuTransition(
  isOpen: boolean,
  activeTab: GameMenuTab | null,
  targetTab: GameMenuTab,
): MainMenuShortcutTransition {
  if (isOpen && activeTab === targetTab) {
    return { activeTab: targetTab, isOpen: false, result: "closed" };
  }

  return {
    activeTab: targetTab,
    isOpen: true,
    result: isOpen ? "switched" : "opened",
  };
}

export function getDismissibleUiTargets(state: {
  gameMenuOpen: boolean;
  debugToolsOpen: boolean;
  npcInteractionOpen: boolean;
  guidePopupOpen: boolean;
  queuedGuidePopups: boolean;
  dungeonChestOpen: boolean;
  offlineSummaryOpen: boolean;
  secondaryPartySummaryOpen: boolean;
}): DebugDismissibleUiTarget[] {
  const targets: DebugDismissibleUiTarget[] = [];

  if (state.gameMenuOpen) targets.push("game_menu");
  if (state.debugToolsOpen) targets.push("debug_tools");
  if (state.npcInteractionOpen) targets.push("npc_interaction");
  if (state.guidePopupOpen) targets.push("guide_popup");
  if (state.queuedGuidePopups) targets.push("queued_guide_popups");
  if (state.dungeonChestOpen) targets.push("dungeon_chest");
  if (state.offlineSummaryOpen) targets.push("offline_summary");
  if (state.secondaryPartySummaryOpen) {
    targets.push("secondary_party_summary");
  }

  return targets;
}

export function getMenuShortcutTelemetryResult(
  transition: MainMenuShortcutTransition,
): string {
  return `${transition.result}:${transition.activeTab}`;
}

export function getGuideSequenceDismissal(
  activeGuidePopupId: GuidePopupId | null,
  queuedGuidePopupIds: readonly GuidePopupId[],
  includeQueuedGuidePopups: boolean,
  shouldResumeAfterGuideSequence: boolean,
): {
  dismissedGuidePopupIds: GuidePopupId[];
  remainingQueuedGuidePopupIds: GuidePopupId[];
  shouldFinishSequence: boolean;
  shouldResumeSimulation: boolean;
} {
  const dismissedGuidePopupIds = activeGuidePopupId
    ? [activeGuidePopupId]
    : [];
  const remainingQueuedGuidePopupIds = includeQueuedGuidePopups
    ? []
    : [...queuedGuidePopupIds];

  if (includeQueuedGuidePopups) {
    for (const guidePopupId of queuedGuidePopupIds) {
      if (!dismissedGuidePopupIds.includes(guidePopupId)) {
        dismissedGuidePopupIds.push(guidePopupId);
      }
    }
  }

  const shouldFinishSequence =
    dismissedGuidePopupIds.length > 0 &&
    remainingQueuedGuidePopupIds.length === 0;

  return {
    dismissedGuidePopupIds,
    remainingQueuedGuidePopupIds,
    shouldFinishSequence,
    shouldResumeSimulation:
      shouldFinishSequence && shouldResumeAfterGuideSequence,
  };
}
