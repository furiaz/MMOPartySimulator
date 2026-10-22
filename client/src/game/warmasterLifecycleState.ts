import { ITEM_DEFINITIONS } from "./items";
import { SKILL_DEFINITIONS } from "./skills";
import type { GameState } from "./state";
import type { DebugMapId, GameEntity, InventorySlot, Position } from "./types";
import { ORC_WARCAMP_ARENA } from "./orcWarcampLayout";
import { stopPartyAutoCombat } from "./partyIntentState";

export const WARMASTER_RECHARGE_KILLS = 60;
export const WARMASTER_CHEST_ID = "map-7-warmaster-chest";
export const WARMASTER_CAPTIVE_ID = "map-7-warmaster-captive";
export const WARMASTER_CHEST_RANGE = 3;
export type WarmasterChest = {
  sequence: number;
  rolledLoot: InventorySlot[];
  pendingLoot: InventorySlot[];
  collectedLoot: InventorySlot[];
  crownsClaimed: boolean;
};
export type WarmasterLifecycle = {
  phase: "ready" | "active" | "defeated" | "recharging" | "reset_pending";
  sequence: number;
  recharge: number;
  rescued: boolean;
  chestCollectedOnce?: boolean;
  chest?: WarmasterChest;
};
export type WarmasterInteraction = {
  chestRequested?: true;
  chestOpen?: true;
  rescueSpeechStartedAt?: number;
  departureAcknowledged?: true;
  departure?: { kind: "walk" } | { kind: "teleport"; targetMapId: DebugMapId } | { kind: "route"; teleportId: string };
};
export function createWarmasterLifecycle(): WarmasterLifecycle {
  return { phase: "ready", sequence: 1, recharge: 0, rescued: false };
}
export function isWarmasterAvailable(state: Pick<GameState, "warmasterLifecycle">): boolean {
  return !state.warmasterLifecycle || ["ready", "active"].includes(state.warmasterLifecycle.phase);
}
export function hasPendingWarmasterChest(state: Pick<GameState, "warmasterLifecycle">): boolean {
  const chest = state.warmasterLifecycle?.chest;
  return Boolean(chest && (!chest.crownsClaimed || chest.pendingLoot.length));
}
export function isWarmasterRewardUiOpen(state: Pick<GameState, "warmasterInteraction">): boolean {
  return Boolean(state.warmasterInteraction?.chestOpen || state.warmasterInteraction?.departure);
}
export function requestWarmasterDeparture(state: GameState, departure: WarmasterInteraction["departure"]): GameState {
  if (state.currentMapId !== "map-7" || !hasPendingWarmasterChest(state) || state.warmasterInteraction?.departureAcknowledged) return state;
  return { ...state, warmasterInteraction: { ...state.warmasterInteraction, departure } };
}
/** Shared movement guard, independent of map reconstruction and presentation. */
export function guardWarmasterWalkingDeparture(state: GameState, entity: GameEntity, destination: Position): GameState | null {
  if (entity.id !== state.partyLeaderId || state.currentMapId !== "map-7" || !hasPendingWarmasterChest(state)) return null;
  const inside = (position: Position) => position.x >= ORC_WARCAMP_ARENA.minX && position.x <= ORC_WARCAMP_ARENA.maxX && position.y >= ORC_WARCAMP_ARENA.minY && position.y <= ORC_WARCAMP_ARENA.maxY;
  if (inside(entity.position) && !inside(destination) && !state.warmasterInteraction?.departureAcknowledged) return requestWarmasterDeparture(state, { kind: "walk" });
  if (!inside(entity.position) && inside(destination) && state.warmasterInteraction?.departureAcknowledged) return { ...state, warmasterInteraction: { ...state.warmasterInteraction, departureAcknowledged: undefined } };
  return null;
}
export function rollWarmasterChest(sequence: number, random = Math.random): WarmasterChest {
  const loot: InventorySlot[] = [];
  for (const [level, chance] of [[15, 0.9], [20, 0.1]]) {
    if (random() >= chance) continue;
    const pool = Object.values(ITEM_DEFINITIONS).filter(item => item.category === "equipment" && item.levelRequirement === level);
    const item = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    if (item) loot.push({ itemId: item.id, quantity: 1 });
  }
  const books = Object.values(ITEM_DEFINITIONS).filter(item => item.category === "skill_book" && item.skillBookSkillId && SKILL_DEFINITIONS[item.skillBookSkillId] && SKILL_DEFINITIONS[item.skillBookSkillId].classId !== "beginner");
  for (let index = 0; index < 5; index++) {
    const item = books[Math.min(books.length - 1, Math.floor(random() * books.length))];
    if (item) loot.push({ itemId: item.id, quantity: 1 });
  }
  return { sequence, rolledLoot: loot, pendingLoot: loot.map(slot => ({ ...slot })), collectedLoot: [], crownsClaimed: false };
}

/** Physical deaths only: neither despawns nor Superior quest multipliers enter this seam. */
export function recordWarmasterLifecycleDeath(state: GameState, previous: GameEntity | undefined, entity: GameEntity, now: number): GameState {
  if (state.currentMapId !== "map-7" || previous?.kind !== "enemy" || previous.health <= 0 || previous.state === "dead" || entity.kind !== "enemy" || (entity.health > 0 && entity.state !== "dead")) return state;
  const lifecycle = state.warmasterLifecycle ?? createWarmasterLifecycle();
  if (entity.enemyTypeId === "orc_warmaster" && isWarmasterAvailable(state)) {
    return stopPartyAutoCombat({ ...state, warmasterLifecycle: { ...lifecycle, phase: "defeated", recharge: 0, rescued: true, chest: rollWarmasterChest(lifecycle.sequence) },
      warmasterInteraction: { ...state.warmasterInteraction, ...(!lifecycle.rescued ? { rescueSpeechStartedAt: now } : {}), departureAcknowledged: undefined } });
  }
  if (isWarmasterAvailable(state) || lifecycle.recharge >= WARMASTER_RECHARGE_KILLS || !["orc", "orc_raider", "orc_shieldbearer"].includes(entity.enemyTypeId ?? "")) return state;
  return { ...state, warmasterLifecycle: { ...lifecycle, recharge: Math.min(WARMASTER_RECHARGE_KILLS, lifecycle.recharge + 1) } };
}
