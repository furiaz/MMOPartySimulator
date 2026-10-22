import { describe, expect, it, vi, afterEach } from "vitest";
import { createDebugMap, MAP_SEVEN_ARENA_GATE_COLLISION_CELLS } from "./debugMap";
import { createCompanion, createEnemy, damageEntity } from "./entities";
import { addEntity, updateEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { createWarmasterLifecycle, guardWarmasterWalkingDeparture, hasPendingWarmasterChest, requestWarmasterDeparture, rollWarmasterChest, WARMASTER_CHEST_ID } from "./warmasterLifecycleState";
import { claimWarmasterChest, closeWarmasterChest, getFrozenWarmasterEncounterIds, isWarmasterGateClosed, reconcileWarmasterLifecycle, requestWarmasterChest, sanitizeWarmasterLifecycle, updateWarmasterLifecycle } from "./warmasterLifecycle";
import { BARRACK_DEFINITIONS, getBarrackMaxHealth } from "./barrackDefinitions";
import { initializeBarracks, updateBarracks } from "./barracks";
import { updateWarmasterSystem } from "./warmasterSystem";
import { isInsideWarmasterArena } from "./warmasterState";
import { updateEnemyRespawnSystem } from "./enemyRespawnSystem";
import { ITEM_DEFINITIONS } from "./items";
import { SKILL_DEFINITIONS } from "./skills";
import { sanitizeGameStateForSave, createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { resolveWarmasterDeparture, teleportWorldTravelDestination, triggerMapTeleport } from "./teleportSystem";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { ORC_WARCAMP_CHEST_POSITION, ORC_WARCAMP_GATE_POSITION } from "./orcWarcampLayout";
import { moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import type { Companion, Enemy, EnemyTypeId, Position } from "./types";
afterEach(() => vi.restoreAllMocks());
function setup(position: Position = { x: 95, y: 44 }): GameState {
  const leader = createCompanion("leader", position, "leader", "fighter");
  const boss = createEnemy("boss", { x: 95, y: 32 }, "aggressive", { enemyTypeId: "orc_warmaster", combatBodyRadius: 1.25, encounterBand: "boss" });
  return updateWarmasterSystem(updateWarmasterLifecycle(initializeBarracks(createTestGameState({ currentMapId: "map-7", map: createDebugMap("map-7"), partyLeaderId: "leader", entities: { leader, boss } })), 0), 0);
}
function victory(state = setup()): GameState {
  const boss = state.entities.boss as Enemy;
  return updateWarmasterLifecycle(updateEntity(state, damageEntity(boss, boss.maxHealth), 1000), 1000);
}
function killOrc(state: GameState, id: string, type: EnemyTypeId = "orc", variant?: "superior"): GameState {
  const enemy = createEnemy(id, { x: 25, y: 20 }, "aggressive", { enemyTypeId: type, variant });
  return updateEntity(addEntity(state, enemy), damageEntity(enemy, enemy.maxHealth), 2000);
}
function claim(state: GameState): GameState {
  return claimWarmasterChest({ ...state, entities: { ...state.entities, leader: { ...state.entities.leader, position: ORC_WARCAMP_CHEST_POSITION } } });
}
function outside(state: GameState): GameState {
  return { ...state, warmasterInteraction: undefined, entities: { ...state.entities, leader: { ...state.entities.leader, position: { x: 25, y: 20 } } } };
}
describe("Warmaster lifecycle", () => {
  it("starts ready, activates without charge, and leaves failed attempts available", () => {
    const state = setup();
    expect(state.warmasterLifecycle).toMatchObject({ phase: "ready", recharge: 0, sequence: 1 });
    expect(updateWarmasterLifecycle(state, 1).warmasterLifecycle?.phase).toBe("active");
    const empty = outside(state);
    const reset = updateWarmasterSystem(updateWarmasterSystem(empty, 1000), 4000);
    expect(updateWarmasterLifecycle(reset, 4000).warmasterLifecycle?.phase).toBe("ready");
    expect((reset.entities.boss as Enemy).health).toBe(1500);
  });
  it("creates exactly one chest/rescue on a genuine victory, not repeated dead updates", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = victory();
    expect(state.warmasterLifecycle).toMatchObject({ phase: "defeated", sequence: 1, recharge: 0, rescued: true });
    expect(state.warmasterLifecycle?.chest?.rolledLoot.reduce((sum, slot) => sum + slot.quantity, 0)).toBe(6);
    const repeated = updateWarmasterLifecycle(updateEntity(state, { ...state.entities.boss }, 2000), 2000);
    expect(repeated.warmasterLifecycle?.chest).toEqual(state.warmasterLifecycle?.chest);
    expect(repeated.warmasterInteraction?.rescueSpeechStartedAt).toBe(1000);
    expect(repeated.entities[WARMASTER_CHEST_ID]).toBeDefined();
  });
  it.each<EnemyTypeId>(["orc", "orc_raider", "orc_shieldbearer"])("counts %s and Superior deaths once after victory", type => {
    let state = killOrc(victory(), "orc", type, "superior");
    expect(state.warmasterLifecycle?.recharge).toBe(1);
    state = updateEntity(state, { ...state.entities.orc }, 2200);
    expect(state.warmasterLifecycle?.recharge).toBe(1);
    state = killOrc(state, "orc", type);
    expect(state.warmasterLifecycle?.recharge).toBe(2);
  });
  it("counts Barrack deaths, rejects wrong types/maps/pre-clear, and caps at 60", () => {
    expect(killOrc(setup(), "early").warmasterLifecycle?.recharge).toBe(0);
    let state = victory();
    const enemy = { ...createEnemy("owned", { x: 75, y: 25 }, "aggressive", { enemyTypeId: "orc" }), barrackSpawn: { barrackId: "map-7-route-barrack", sequence: 1 } };
    state = updateEntity(addEntity(state, enemy), damageEntity(enemy, enemy.maxHealth), 2000);
    expect(state.warmasterLifecycle?.recharge).toBe(1);
    expect(killOrc(state, "wrong", "night_bat").warmasterLifecycle?.recharge).toBe(1);
    expect(killOrc({ ...state, currentMapId: "map-6" }, "wrong-map").warmasterLifecycle?.recharge).toBe(1);
    for (let index = 0; index < 70; index++) state = killOrc(state, "farmed");
    expect(state.warmasterLifecycle?.recharge).toBe(60);
  });
  it("removes only arena enemies without death rewards and retains the dead Boss", () => {
    let state = setup();
    state = addEntity(state, createEnemy("arena", { x: 95, y: 35 }, "aggressive", { enemyTypeId: "orc" }));
    state = addEntity(state, createEnemy("field", { x: 25, y: 20 }, "aggressive", { enemyTypeId: "orc" }));
    state = victory(state);
    expect(state.entities.arena).toBeUndefined();
    expect(state.entities.field).toBeDefined();
    expect((state.entities.boss as Enemy).health).toBe(0);
    expect(state.warmasterLifecycle?.recharge).toBe(0);
    expect((updateEnemyRespawnSystem(state, 100000).entities.boss as Enemy).health).toBe(0);
  });
  it("freezes overdue arena Barracks but not the route building", () => {
    let state = victory();
    state = { ...state, barracksById: Object.fromEntries(BARRACK_DEFINITIONS.map(definition => [definition.id, { ...state.barracksById![definition.id], health: 0, respawnAtMs: 0 }])) };
    state = updateBarracks(state, 200000, 100, () => 0, { frozenEncounterIds: getFrozenWarmasterEncounterIds(state) });
    for (const definition of BARRACK_DEFINITIONS) expect(state.barracksById![definition.id].health).toBe(definition.activation ? 0 : getBarrackMaxHealth());
  });
  it("keeps loot access even at 60; closes at 59 after collection and rearms at 60", () => {
    let state = victory();
    state = { ...state, warmasterLifecycle: { ...state.warmasterLifecycle!, recharge: 60 } };
    expect(isWarmasterGateClosed(updateWarmasterLifecycle(outside(state), 2000))).toBe(false);
    state = outside(claim(state));
    state = { ...state, warmasterLifecycle: { ...state.warmasterLifecycle!, recharge: 59 } };
    state = updateWarmasterLifecycle(state, 3000);
    expect(state.warmasterLifecycle?.phase).toBe("recharging");
    expect(MAP_SEVEN_ARENA_GATE_COLLISION_CELLS.every(cell => state.map!.collisionWalls!.some(wall => cell.x === wall.x && cell.y === wall.y))).toBe(true);
    const sequence = state.barracksById![BARRACK_DEFINITIONS[1].id].spawnSequence;
    state = updateWarmasterLifecycle(killOrc(state, "last"), 4000);
    expect(state.warmasterLifecycle).toMatchObject({ phase: "ready", sequence: 2, recharge: 0, rescued: true });
    expect(state.warmasterLifecycle?.chest).toBeUndefined();
    expect((state.entities.boss as Enemy).health).toBe(1500);
    expect(state.barracksById![BARRACK_DEFINITIONS[1].id]).toMatchObject({ health: 1248, preparationMs: 0, spawnSequence: sequence });
    expect(isWarmasterGateClosed(state)).toBe(false);
  });
  it.each(["living", "dead", "reservation", "gate"])("defers rebuilding for %s companion occupancy", mode => {
    let state = outside(claim(victory()));
    state = { ...state, warmasterLifecycle: { ...state.warmasterLifecycle!, recharge: 60 } };
    if (mode === "reservation") state = { ...state, reservedPositionsByEntityId: { leader: { x: 95, y: 32 } } };
    else state = { ...state, entities: { ...state.entities, leader: { ...state.entities.leader, position: mode === "gate" ? ORC_WARCAMP_GATE_POSITION : { x: 95, y: 32 }, ...(mode === "dead" ? { health: 0, state: "dead" as const } : {}) } } };
    expect(updateWarmasterLifecycle(state, 3000).warmasterLifecycle?.sequence).toBe(1);
  });
});
describe("Warmaster rewards and exit", () => {
  it.each([[0.5, 0.5, 15], [0.95, 0.05, 20], [0.5, 0.05, "both"], [0.95, 0.5, "neither"]] as const)("rolls equipment independently (%s/%s)", (low, high, outcome) => {
    // Each successful equipment check consumes a separate item-selection roll.
    const values = [low, ...(low < 0.9 ? [0] : []), high, ...(high < 0.1 ? [0] : [])];
    const chest = rollWarmasterChest(1, () => values.length ? values.shift()! : 0);
    const equipment = chest.rolledLoot.filter(slot => ITEM_DEFINITIONS[slot.itemId].category === "equipment");
    expect(equipment.map(slot => ITEM_DEFINITIONS[slot.itemId].levelRequirement)).toEqual(outcome === "both" ? [15, 20] : outcome === "neither" ? [] : [outcome]);
    const books = chest.rolledLoot.filter(slot => ITEM_DEFINITIONS[slot.itemId].category === "skill_book");
    expect(books).toHaveLength(5);
    expect(new Set(books.map(slot => slot.itemId)).size).toBe(1);
    expect(books.every(slot => SKILL_DEFINITIONS[ITEM_DEFINITIONS[slot.itemId].skillBookSkillId!].classId !== "beginner")).toBe(true);
  });
  it("uses five independent book draws rather than one book multiplied by five", () => {
    const values = [0.99, 0.99, 0, 0.2, 0.4, 0.6, 0.8];
    const chest = rollWarmasterChest(1, () => values.shift()!);
    expect(new Set(chest.rolledLoot.map(slot => slot.itemId)).size).toBe(5);
  });
  it("requires manual approach, grants Crowns once, retains full-inventory loot across reload", () => {
    let state = victory();
    expect(claimWarmasterChest(state)).toBe(state);
    state = requestWarmasterChest(state);
    expect(state.warmasterInteraction?.chestRequested).toBe(true);
    expect(state.leaderIntent?.targetPosition).toEqual(ORC_WARCAMP_CHEST_POSITION);
    state = claim({ ...state, inventory: { ...state.inventory, capacity: 0 } });
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(500);
    expect(hasPendingWarmasterChest(state)).toBe(true);
    state = claim(sanitizeGameStateForSave(state, 2000));
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(500);
    const rolled = state.warmasterLifecycle!.chest!.rolledLoot;
    state = claim({ ...state, inventory: { ...state.inventory, capacity: 50 } });
    state = claim(state);
    expect(state.warmasterLifecycle!.chest!.rolledLoot).toEqual(rolled);
    expect(hasPendingWarmasterChest(state)).toBe(false);
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(500);
  });
  it("preserves partial collection without duplicating collected items", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let state = claim({ ...victory(), inventory: { capacity: 1, slots: [] } });
    expect(state.warmasterLifecycle?.chest?.collectedLoot).toHaveLength(1);
    const restored = sanitizeGameStateForSave(state, 2000);
    state = claim({ ...restored, inventory: { ...restored.inventory, capacity: 50 } });
    expect(state.warmasterLifecycle!.chest!.collectedLoot.reduce((sum, slot) => sum + slot.quantity, 0)).toBe(7);
    expect(state.inventory.slots.reduce((sum, slot) => sum + slot.quantity, 0)).toBe(7);
  });
  it("closing the overlay preserves partial rewards and does not auto-claim again", () => {
    const state = claim({ ...victory(), inventory: { capacity: 0, slots: [] } });
    const closed = closeWarmasterChest(state);
    expect(closed.warmasterInteraction?.chestOpen).toBeUndefined();
    expect(closed.warmasterLifecycle).toBe(state.warmasterLifecycle);
    expect(closed.wallet).toBe(state.wallet);
    expect(closeWarmasterChest(closed)).toBe(closed);
  });
  it("guards walking, supports both choices, suppresses duplicate warnings and resets on re-entry", () => {
    let state = victory(setup({ x: 87, y: 51.4 }));
    const leader = state.entities.leader as Companion;
    state = guardWarmasterWalkingDeparture(state, leader, { x: 87, y: 51.6 })!;
    expect(state.warmasterInteraction?.departure?.kind).toBe("walk");
    const returned = resolveWarmasterDeparture(state, false);
    expect(returned.leaderIntent?.targetPosition).toEqual(ORC_WARCAMP_CHEST_POSITION);
    state = resolveWarmasterDeparture(state, true);
    expect(requestWarmasterDeparture(state, { kind: "teleport", targetMapId: "hub" })).toBe(state);
    const reentered = guardWarmasterWalkingDeparture(state, { ...leader, position: { x: 87, y: 53 } }, { x: 87, y: 51 });
    expect(reentered?.warmasterInteraction?.departureAcknowledged).toBeUndefined();
  });
  it("the production movement helper stops the leader before crossing", () => {
    const state = victory(setup({ x: 87, y: 51.49 }));
    const moved = moveEntityTowardPositionIfUnoccupied(state, state.entities.leader, { x: 87, y: 54 });
    expect(moved.warmasterInteraction?.departure?.kind).toBe("walk");
    expect(moved.entities.leader.position).toEqual(state.entities.leader.position);
  });
  it("guards unlocked direct teleport and can resume it while preserving loot", () => {
    const state = { ...victory(), keyItemsById: { teleport_echo_harbor_union_bastion: 1 } };
    const blocked = teleportWorldTravelDestination(state, "hub");
    expect(blocked.result).toMatchObject({ status: "failed", reason: "unclaimed_chest" });
    const traveled = resolveWarmasterDeparture(blocked.state, true);
    expect(traveled.currentMapId).toBe("hub");
    expect(hasPendingWarmasterChest(traveled)).toBe(true);
  });
  it("guards physical teleport initiation", () => {
    const state = victory();
    const teleport = state.map!.teleports![0];
    const blocked = triggerMapTeleport(state, "player", teleport.id);
    expect(blocked.warmasterInteraction?.departure?.kind).toBe("route");
    expect(blocked.activeTeleport).toBeFalsy();
    expect(resolveWarmasterDeparture(blocked, true).activeTeleport?.id).toBe(teleport.id);
  });
});
describe("Warmaster reconstruction", () => {
  it("preserves pending loot and removes reconstructed arena enemies without credit", () => {
    let state = victory();
    state = addEntity(state, createEnemy("fresh", { x: 95, y: 32 }, "aggressive", { enemyTypeId: "orc_warmaster" }));
    state = addEntity(state, createEnemy("ambient", { x: 94, y: 36 }, "aggressive", { enemyTypeId: "orc" }));
    state = pruneMissingEntityRuntimeState(state);
    expect(state.entities.fresh).toBeUndefined();
    expect(state.entities.ambient).toBeUndefined();
    expect(state.warmasterLifecycle?.recharge).toBe(0);
    expect(state.warmasterLifecycle?.chest).toBeDefined();
  });
  it("persists rewards/rescue through actual save serialization and restoration without replay", () => {
    const saved = JSON.parse(JSON.stringify(createSavedGame(victory(), 1500)));
    const restored = restoreGameStateFromSave(saved);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.warmasterLifecycle?.chest?.sequence).toBe(1);
    expect(restored.state.warmasterLifecycle?.rescued).toBe(true);
    expect(restored.state.warmasterInteraction).toBeUndefined();
    expect((restored.state.entities.boss as Enemy).health).toBe(0);
  });
  it("resets active saves without granting chest or losing availability", () => {
    const state = updateWarmasterLifecycle(setup(), 0);
    expect(state.warmasterLifecycle?.phase).toBe("active");
    const restored = sanitizeGameStateForSave(state, 1000);
    expect(restored.warmasterLifecycle).toMatchObject({ phase: "ready", sequence: 1 });
    expect(restored.warmasterLifecycle?.chest).toBeUndefined();
    expect((restored.entities.boss as Enemy).health).toBe(1500);
    expect(clearMapTransitionRuntimeState(state).warmasterInteraction).toBeUndefined();
  });
  it("makes an old dead Boss available without retroactive rewards/rescue", () => {
    const state = setup();
    const boss = state.entities.boss as Enemy;
    const legacy = { ...state, warmasterLifecycle: undefined, entities: { ...state.entities, boss: damageEntity(boss, boss.maxHealth) } };
    const restored = reconcileWarmasterLifecycle(legacy);
    expect((restored.entities.boss as Enemy).health).toBe(1500);
    expect(restored.warmasterLifecycle).toEqual(createWarmasterLifecycle());
  });
  it("sanitizes malformed state and does not manufacture rewards", () => {
    expect(sanitizeWarmasterLifecycle(undefined)).toEqual(createWarmasterLifecycle());
    expect(sanitizeWarmasterLifecycle({ phase: "recharging", sequence: 1, recharge: 1000, rescued: false })).toEqual({ phase: "recharging", sequence: 1, recharge: 60, rescued: false });
    const value = { ...createWarmasterLifecycle(), phase: "defeated" as const, chest: { sequence: 2, rolledLoot: [], collectedLoot: [], pendingLoot: [], crownsClaimed: false } };
    expect(sanitizeWarmasterLifecycle(value).chest).toBeUndefined();
  });
  it("does not recreate missing pending loot or replay malformed currency claims", () => {
    const chest = { sequence: 1, rolledLoot: [{ itemId: "bastion_helm" as const, quantity: 1 }], collectedLoot: [], pendingLoot: [], crownsClaimed: undefined };
    const sanitized = sanitizeWarmasterLifecycle({ ...createWarmasterLifecycle(), phase: "defeated", chest } as unknown as NonNullable<GameState["warmasterLifecycle"]>);
    expect(sanitized.chest).toMatchObject({ pendingLoot: [], collectedLoot: [{ itemId: "bastion_helm", quantity: 1 }], crownsClaimed: true });
  });
  it("opens a restored closed gate if a companion or pending chest would be trapped", () => {
    const state = victory();
    const closed = { ...state, warmasterLifecycle: { ...state.warmasterLifecycle!, phase: "recharging" as const } };
    expect(isWarmasterGateClosed(reconcileWarmasterLifecycle(closed))).toBe(false);
    const collected = claim(state);
    expect(isWarmasterGateClosed(reconcileWarmasterLifecycle({ ...collected, warmasterLifecycle: { ...collected.warmasterLifecycle!, phase: "recharging" } }))).toBe(false);
  });
  it("clears recharge before another fight and does not replay rescue on the second clear", () => {
    let state = outside(claim(victory()));
    state = updateWarmasterLifecycle({ ...state, warmasterLifecycle: { ...state.warmasterLifecycle!, recharge: 60 } }, 3000);
    expect(killOrc(state, "early").warmasterLifecycle?.recharge).toBe(0);
    state = victory(state);
    expect(state.warmasterLifecycle?.chest?.sequence).toBe(2);
    expect(state.warmasterInteraction?.rescueSpeechStartedAt).toBeUndefined();
    expect(Object.values(state.entities).filter(entity => entity.kind === "enemy" && isInsideWarmasterArena(entity.position))).toHaveLength(1);
  });
});
