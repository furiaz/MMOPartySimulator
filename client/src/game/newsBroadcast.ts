import type { GameState } from "./state";
import { getItemDefinition, getItemDisplayName } from "./items";
import type { ItemId, NewsBroadcastEvent } from "./types";

export const NEWS_BROADCAST_DURATION_MS = 3000;

export type ImportantItemAcquisitionVerb =
  | "Unlocked"
  | "Obtained"
  | "Delivered";

export type ImportantItemAcquisitionEntry = {
  verb: ImportantItemAcquisitionVerb;
  itemId?: ItemId;
  displayName?: string;
  quantity?: number;
  stackable?: boolean;
};

export type ImportantItemAcquisitionBroadcast = {
  title?: string;
  entries?: ImportantItemAcquisitionEntry[];
  messages?: string[];
};

export function queueNewsBroadcast(
  state: GameState,
  text: string,
  nowMs = Date.now(),
  options: { title?: string; details?: string[] } = {},
): GameState {
  const event: NewsBroadcastEvent = {
    id: `${nowMs}-news-${state.newsBroadcasts?.length ?? 0}`,
    text,
    ...(options.title ? { title: options.title } : {}),
    ...(options.details ? { details: options.details } : {}),
    createdAt: nowMs,
    expiresAt: nowMs + NEWS_BROADCAST_DURATION_MS,
  };

  return {
    ...state,
    newsBroadcasts: [...(state.newsBroadcasts ?? []), event],
  };
}

export function queueUnlockNewsBroadcast(
  state: GameState,
  displayName: string,
  nowMs = Date.now(),
): GameState {
  const details = [`Unlocked: ${displayName}`];

  return queueNewsBroadcast(state, details[0], nowMs, {
    title: "Unlock Acquired",
    details,
  });
}

export function formatImportantItemAcquisitionLine(
  entry: ImportantItemAcquisitionEntry,
): string {
  const quantity = Math.max(1, Math.floor(entry.quantity ?? 1));
  const itemDefinition = entry.itemId
    ? getItemDefinition(entry.itemId)
    : undefined;
  const displayName =
    entry.displayName ??
    (itemDefinition ? getItemDisplayName(itemDefinition) : "Unknown Item");
  const stackable = entry.stackable ?? itemDefinition?.stackable ?? true;
  const itemText =
    quantity > 1 || stackable ? `${displayName} x${quantity}` : displayName;

  return `${entry.verb}: ${itemText}`;
}

export function queueImportantItemAcquisitionBroadcast(
  state: GameState,
  broadcast: ImportantItemAcquisitionBroadcast,
  nowMs = Date.now(),
): GameState {
  const details = [
    ...(broadcast.entries ?? []).map(formatImportantItemAcquisitionLine),
    ...(broadcast.messages ?? []),
  ];

  if (details.length === 0) {
    return state;
  }

  return queueNewsBroadcast(state, details.join(" | "), nowMs, {
    title: broadcast.title ?? "Items Received",
    details,
  });
}

export function updateNewsBroadcasts(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const broadcasts = state.newsBroadcasts ?? [];

  if (broadcasts.length === 0) {
    return state;
  }

  const activeBroadcasts = broadcasts.filter(
    (broadcast) => broadcast.expiresAt > nowMs,
  );

  return activeBroadcasts.length === broadcasts.length
    ? state
    : {
        ...state,
        newsBroadcasts: activeBroadcasts,
      };
}

export function restartNewsBroadcastDisplayDuration(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const broadcasts = state.newsBroadcasts ?? [];

  if (broadcasts.length === 0) {
    return state;
  }

  return {
    ...state,
    newsBroadcasts: broadcasts.map((broadcast) => ({
      ...broadcast,
      createdAt: nowMs,
      expiresAt: nowMs + NEWS_BROADCAST_DURATION_MS,
    })),
  };
}
