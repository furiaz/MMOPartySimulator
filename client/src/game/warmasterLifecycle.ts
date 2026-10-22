import { BARRACK_DEFINITIONS, createBarrackEntity, getBarrackMaxHealth } from "./barrackDefinitions";
import { isBarrackFootprintOccupied, doesEntityOverlapFootprint } from "./barracks";
import { refreshStructureCollision } from "./combatStructures";
import { MAP_SEVEN_ARENA_GATE_COLLISION_CELLS } from "./debugMap";
import { createEnemy, createNpc } from "./entities";
import { clearEnemyAbilityRuntimeForEnemy } from "./enemyAbilitySystem";
import { clearForcedMovements } from "./forcedMovement";
import { addItemToInventoryState } from "./inventory";
import { ITEM_DEFINITIONS } from "./items";
import { bakeNavigationGrid } from "./navigation";
import { ORC_WARCAMP_ARENA, ORC_WARCAMP_BOSS_POSITION, ORC_WARCAMP_CAGE_POSITION, ORC_WARCAMP_CHEST_POSITION, ORC_WARCAMP_ENCOUNTER_ID } from "./orcWarcampLayout";
import { clearEnemyFromPartyTargeting } from "./partyTargetSystem";
import { setPartyExecutionIntent, stopPartyAutoCombat } from "./partyIntentState";
import { reconcileStateDerivedQuestObjectivesForQuests } from "./questProgressionHooks";
import { clearStatusEffectsForEntity } from "./statusEffects";
import { resetWarmasterAttempt } from "./warmasterSystem";
import { addCurrencyToWalletState } from "./wallet";
import { createWarmasterLifecycle, hasPendingWarmasterChest, isWarmasterAvailable, WARMASTER_CAPTIVE_ID, WARMASTER_CHEST_ID, WARMASTER_CHEST_RANGE, WARMASTER_RECHARGE_KILLS } from "./warmasterLifecycleState";
import type { WarmasterChest, WarmasterLifecycle } from "./warmasterLifecycleState";
import { isInsideWarmasterArena, isWarmaster } from "./warmasterState";
import type { GameState } from "./state";
import type { InventorySlot } from "./types";

const arenaBarracks = BARRACK_DEFINITIONS.filter(definition => definition.activation?.encounterId === ORC_WARCAMP_ENCOUNTER_ID);
export function getFrozenWarmasterEncounterIds(state: GameState): ReadonlySet<string> {
  return new Set(isWarmasterAvailable(state) ? [] : [ORC_WARCAMP_ENCOUNTER_ID]);
}
export function isWarmasterGateClosed(state: GameState): boolean {
  return state.warmasterLifecycle?.phase === "recharging" || state.warmasterLifecycle?.phase === "reset_pending";
}
function mergeLoot(slots: InventorySlot[]): InventorySlot[] {
  const quantities = new Map<InventorySlot["itemId"], number>();
  for (const slot of slots) quantities.set(slot.itemId, (quantities.get(slot.itemId) ?? 0) + slot.quantity);
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function sanitizeWarmasterLifecycle(value: WarmasterLifecycle | undefined): WarmasterLifecycle {
  if (!value || typeof value !== "object") return createWarmasterLifecycle();
  const integer = (number: unknown, fallback = 0) => typeof number === "number" && Number.isSafeInteger(number) && number >= 0 && number < Number.MAX_SAFE_INTEGER ? number : fallback;
  const sequence = Math.max(1, integer(value.sequence, 1));
  const slots = (input: InventorySlot[] | undefined): InventorySlot[] => Array.isArray(input) ? input.filter(slot => slot && Object.hasOwn(ITEM_DEFINITIONS, slot.itemId) && integer(slot.quantity) > 0).map(slot => ({ itemId: slot.itemId, quantity: Math.min(999, integer(slot.quantity)) })) : [];
  const phase = ["ready", "active", "defeated", "recharging", "reset_pending"].includes(value.phase) ? value.phase : "ready";
  // A prior sequence can only be rearmed after its chest has been fully claimed.
  let chestCollectedOnce = value.chestCollectedOnce === true ||
    (sequence > 1 && phase === value.phase && value.rescued === true);
  let chest: WarmasterChest | undefined;
  if (value.chest && typeof value.chest === "object" && value.chest.sequence === sequence && Array.isArray(value.chest.rolledLoot) && Array.isArray(value.chest.collectedLoot) && Array.isArray(value.chest.pendingLoot) && !["ready", "active"].includes(phase)) {
    // The original roll is the authority; sanitize pending/collected amounts against it.
    const rolledLoot = mergeLoot(slots(value.chest.rolledLoot));
    const savedCollected = new Map(mergeLoot(slots(value.chest.collectedLoot)).map(slot => [slot.itemId, slot.quantity]));
    const savedPending = new Map(mergeLoot(slots(value.chest.pendingLoot)).map(slot => [slot.itemId, slot.quantity]));
    const pendingLoot = rolledLoot.map(slot => ({ ...slot, quantity: Math.min(Math.max(0, slot.quantity - (savedCollected.get(slot.itemId) ?? 0)), savedPending.get(slot.itemId) ?? 0) })).filter(slot => slot.quantity > 0);
    const pending = new Map(pendingLoot.map(slot => [slot.itemId, slot.quantity]));
    const collectedLoot = rolledLoot.map(slot => ({ ...slot, quantity: slot.quantity - (pending.get(slot.itemId) ?? 0) })).filter(slot => slot.quantity > 0);
    chest = { sequence, rolledLoot, collectedLoot, pendingLoot, crownsClaimed: value.chest.crownsClaimed !== false };
    // Do not turn a repaired/malformed ledger into evidence of a historical claim.
    chestCollectedOnce ||= value.chest.crownsClaimed === true && value.chest.pendingLoot.length === 0 &&
      slots(value.chest.rolledLoot).length === value.chest.rolledLoot.length &&
      slots(value.chest.collectedLoot).length === value.chest.collectedLoot.length &&
      savedCollected.size === rolledLoot.length &&
      rolledLoot.every(slot => savedCollected.get(slot.itemId) === slot.quantity);
  }
  return { phase: phase === "active" ? "ready" : phase, sequence, recharge: ["ready", "active"].includes(phase) ? 0 : Math.min(WARMASTER_RECHARGE_KILLS, integer(value.recharge)), rescued: value.rescued === true,
    ...(chestCollectedOnce ? { chestCollectedOnce: true } : {}), ...(chest ? { chest } : {}) };
}

/** Reconstruct only this encounter. Called before navigation on restore and map entry. */
export function reconcileWarmasterLifecycle(state: GameState): GameState {
  const legacy = !state.warmasterLifecycle;
  let next = legacy ? { ...state, warmasterLifecycle: createWarmasterLifecycle() } : state;
  if (next.currentMapId !== "map-7") return next;
  if (legacy) {
    const entities = { ...next.entities };
    for (const entity of Object.values(entities)) if (isWarmaster(entity) && (entity.health <= 0 || entity.state === "dead")) entities[entity.id] = { ...entity, health: entity.maxHealth, state: "idle", defeatedAtMs: undefined };
    next = { ...next, entities };
  }
  if (!isWarmasterAvailable(next)) next = clearDefeatedArena(next);
  if (isWarmasterGateClosed(next) && (hasPendingWarmasterChest(next) || !canCloseGate(next))) next = { ...next, warmasterLifecycle: { ...next.warmasterLifecycle!, phase: "defeated" } };
  return updateWarmasterProps(updateGateCollision(next));
}

function clearDefeatedArena(state: GameState): GameState {
  let next = state;
  const removed = new Set<string>();
  for (const entity of Object.values(state.entities)) {
    const ownedByArena = entity.kind === "enemy" && arenaBarracks.some(definition => definition.id === entity.barrackSpawn?.barrackId);
    if (entity.kind !== "enemy" || entity.enemyTypeId === "orc_warmaster" || (!ownedByArena && !isInsideWarmasterArena(entity.position) && !isInsideWarmasterArena(entity.homePosition))) continue;
    next = clearStatusEffectsForEntity(clearEnemyAbilityRuntimeForEnemy(clearEnemyFromPartyTargeting(next, entity.id), entity.id), entity.id);
    const entities = { ...next.entities };
    delete entities[entity.id];
    removed.add(entity.id);
    next = { ...next, entities, combatProjectiles: (next.combatProjectiles ?? []).filter(projectile => projectile.sourceId !== entity.id && projectile.targetId !== entity.id) };
  }
  // Keep a genuinely defeated Boss for ordinary XP/drop processing, but reject a
  // newly reconstructed living spawn while the durable encounter is unavailable.
  let changed = false;
  for (const entity of Object.values(next.entities)) if (isWarmaster(entity)) {
    if (next.enemyAbilityCastsByEnemyId?.[entity.id] || next.enemyDashesByEnemyId?.[entity.id]) next = clearEnemyAbilityRuntimeForEnemy(next, entity.id);
    if (Object.values(next.forcedMovementsByEntityId ?? {}).some(movement => movement.sourceId === entity.id)) next = clearForcedMovements(next, entity.id);
    if (entity.health > 0 && entity.state !== "dead") {
      const entities = { ...next.entities };
      delete entities[entity.id];
      next = { ...next, entities };
      changed = true;
    }
  }
  if (removed.size) next = { ...next, directCompanionCommandsById: Object.fromEntries(Object.entries(next.directCompanionCommandsById ?? {}).filter(([, command]) => !("targetId" in command && command.targetId && removed.has(command.targetId)))) };
  return changed || next.warmasterAttempt || removed.size ? { ...next, warmasterAttempt: undefined } : next;
}

function partyOverlaps(state: GameState, bounds = ORC_WARCAMP_ARENA): boolean {
  return Object.values(state.entities).some(entity => {
    if (entity.kind !== "companion") return false;
    const solid = { ...entity, state: "idle" as const };
    const forced = state.forcedMovementsByEntityId?.[entity.id];
    const landing = forced ? { x: forced.origin.x + forced.direction.x * forced.distance, y: forced.origin.y + forced.direction.y * forced.distance } : undefined;
    const positions = [entity.position, state.reservedPositionsByEntityId?.[entity.id], state.moveIntentsByEntityId?.[entity.id], landing];
    return positions.some(position => position && doesEntityOverlapFootprint(solid, bounds, position));
  });
}
function canCloseGate(state: GameState): boolean {
  return !partyOverlaps(state) && !MAP_SEVEN_ARENA_GATE_COLLISION_CELLS.some(cell => partyOverlaps(state, { minX: cell.x - 0.5, maxX: cell.x + 0.5, minY: cell.y - 0.5, maxY: cell.y + 0.5 }));
}
function updateGateCollision(state: GameState): GameState {
  if (state.currentMapId !== "map-7" || !state.map) return state;
  const keys = new Set(MAP_SEVEN_ARENA_GATE_COLLISION_CELLS.map(cell => `${cell.x},${cell.y}`));
  const walls = state.map.collisionWalls ?? [];
  const closed = isWarmasterGateClosed(state);
  const existing = walls.filter(cell => keys.has(`${cell.x},${cell.y}`)).length;
  if ((closed && existing === keys.size) || (!closed && existing === 0)) return state;
  const map = { ...state.map, collisionWalls: [...walls.filter(cell => !keys.has(`${cell.x},${cell.y}`)), ...(closed ? MAP_SEVEN_ARENA_GATE_COLLISION_CELLS : [])] };
  map.navigationGrid = bakeNavigationGrid(map);
  return { ...state, map, movementPathsByEntityId: {}, attackSlotCacheByEntityId: {}, enemyTargetReachabilityCacheByEnemyId: {}, movementPathRetryAtMsByEntityId: {} };
}
function updateWarmasterProps(state: GameState): GameState {
  if (state.currentMapId !== "map-7") return state;
  const chest = state.warmasterLifecycle?.chest;
  const entities = { ...state.entities };
  if (chest) entities[WARMASTER_CHEST_ID] = createNpc(WARMASTER_CHEST_ID, ORC_WARCAMP_CHEST_POSITION, "Warmaster's Chest", hasPendingWarmasterChest(state) ? "dungeon_chest_closed" : "dungeon_chest_open");
  else delete entities[WARMASTER_CHEST_ID];
  const speechAt = state.warmasterInteraction?.rescueSpeechStartedAt;
  if (!state.warmasterLifecycle?.rescued || speechAt !== undefined) entities[WARMASTER_CAPTIVE_ID] = createNpc(WARMASTER_CAPTIVE_ID, ORC_WARCAMP_CAGE_POSITION, "Captive", "quest_guide");
  else delete entities[WARMASTER_CAPTIVE_ID];
  const same = [WARMASTER_CHEST_ID, WARMASTER_CAPTIVE_ID].every(id => JSON.stringify(entities[id]) === JSON.stringify(state.entities[id]));
  return same ? state : { ...state, entities };
}

export function updateWarmasterLifecycle(state: GameState, now: number): GameState {
  let next = reconcileWarmasterLifecycle(state);
  if (next.currentMapId !== "map-7") return next;
  let lifecycle = next.warmasterLifecycle!;
  if (isWarmasterAvailable(next)) {
    const phase = next.warmasterAttempt ? "active" : "ready";
    return phase === lifecycle.phase ? next : { ...next, warmasterLifecycle: { ...lifecycle, phase } };
  }
  if (next.warmasterInteraction?.rescueSpeechStartedAt !== undefined && now >= next.warmasterInteraction.rescueSpeechStartedAt + 5000) next = { ...next, warmasterInteraction: { ...next.warmasterInteraction, rescueSpeechStartedAt: undefined } };
  if (!hasPendingWarmasterChest(next) && canCloseGate(next)) {
    lifecycle = { ...lifecycle, phase: lifecycle.recharge >= WARMASTER_RECHARGE_KILLS ? "reset_pending" : "recharging" };
    next = updateGateCollision({ ...next, warmasterLifecycle: lifecycle });
    if (lifecycle.phase === "reset_pending" && arenaBarracks.every(definition => !isBarrackFootprintOccupied(next, definition))) {
      const entities = { ...next.entities };
      const barracksById = { ...next.barracksById };
      for (const definition of arenaBarracks) {
        barracksById[definition.id] = { health: getBarrackMaxHealth(), maxHealth: getBarrackMaxHealth(), spawnSequence: barracksById[definition.id]?.spawnSequence ?? 0, preparationMs: 0 };
        entities[definition.id] = createBarrackEntity(definition);
      }
      const oldBoss = Object.values(entities).find(isWarmaster);
      const id = oldBoss?.id ?? "zone-7-orc-warmaster-01";
      entities[id] = createEnemy(id, ORC_WARCAMP_BOSS_POSITION, "aggressive", { enemyTypeId: "orc_warmaster", combatBodyRadius: 1.25, encounterBand: "boss", subzoneId: "orc-warcamp", encounterAreaId: ORC_WARCAMP_ENCOUNTER_ID });
      delete entities[WARMASTER_CHEST_ID];
      next = refreshStructureCollision({ ...next, entities, barracksById, warmasterAttempt: undefined, warmasterInteraction: undefined, warmasterLifecycle: { ...lifecycle, phase: "ready", sequence: lifecycle.sequence + 1, recharge: 0, chest: undefined } });
      next = clearEnemyAbilityRuntimeForEnemy(clearStatusEffectsForEntity(next, id), id);
      next = resetWarmasterAttempt(next, now);
    }
  }
  next = updateWarmasterProps(updateGateCollision(next));
  if (next.warmasterInteraction?.chestRequested && isLeaderNearChest(next)) next = claimWarmasterChest(next);
  return next;
}

function isLeaderNearChest(state: GameState): boolean {
  const leader = state.entities[state.partyLeaderId];
  return Boolean(state.currentMapId === "map-7" && leader?.kind === "companion" && leader.health > 0 && leader.state !== "dead" && Math.hypot(leader.position.x - ORC_WARCAMP_CHEST_POSITION.x, leader.position.y - ORC_WARCAMP_CHEST_POSITION.y) <= WARMASTER_CHEST_RANGE);
}
export function requestWarmasterChest(state: GameState): GameState {
  if (state.currentMapId !== "map-7" || !state.warmasterLifecycle?.chest) return state;
  const next = stopPartyAutoCombat({ ...state, activeTeleport: null, worldTravelTargetMapId: null, autoRoute: undefined, warmasterInteraction: { ...state.warmasterInteraction, chestRequested: true as const } });
  return isLeaderNearChest(next) ? claimWarmasterChest(next) : setPartyExecutionIntent(next, { type: "move", targetId: null, targetPosition: ORC_WARCAMP_CHEST_POSITION, source: "player" });
}
export function claimWarmasterChest(state: GameState): GameState {
  const chest = state.warmasterLifecycle?.chest;
  if (!chest || !isLeaderNearChest(state)) return state;
  let next = chest.crownsClaimed ? state : addCurrencyToWalletState(state, "crowns", 500, "chest").state;
  const pendingLoot: InventorySlot[] = [];
  const collectedLoot = [...chest.collectedLoot];
  for (const slot of chest.pendingLoot) {
    const result = addItemToInventoryState(next, slot.itemId, slot.quantity, "chest");
    next = result.state;
    if (result.result.addedQuantity) collectedLoot.push({ ...slot, quantity: result.result.addedQuantity });
    if (result.result.overflowQuantity) pendingLoot.push({ ...slot, quantity: result.result.overflowQuantity });
  }
  return reconcileStateDerivedQuestObjectivesForQuests(updateWarmasterProps({ ...stopPartyAutoCombat(next),
    warmasterLifecycle: { ...next.warmasterLifecycle!, ...(pendingLoot.length === 0 ? { chestCollectedOnce: true } : {}),
      chest: { ...chest, crownsClaimed: true, pendingLoot, collectedLoot: mergeLoot(collectedLoot) } },
    warmasterInteraction: { ...next.warmasterInteraction, chestRequested: undefined, chestOpen: true } }), "encounter_chest_claim");
}

export function closeWarmasterChest(state: GameState): GameState {
  return state.warmasterInteraction?.chestOpen ? { ...state, warmasterInteraction: { ...state.warmasterInteraction, chestOpen: undefined } } : state;
}

export function answerWarmasterDeparture(state: GameState, leave: boolean): GameState {
  if (!state.warmasterInteraction?.departure) return state;
  const next = { ...state, warmasterInteraction: { ...state.warmasterInteraction, departure: undefined, departureAcknowledged: leave ? true as const : undefined } };
  if (leave) return next;
  return setPartyExecutionIntent({ ...next, activeTeleport: null, worldTravelTargetMapId: null, autoRoute: undefined, directCompanionCommandsById: {} }, { type: "move", source: "player", targetId: null, targetPosition: ORC_WARCAMP_CHEST_POSITION });
}
