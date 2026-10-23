import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebugMap } from "./debugMap";
import { createCompanion, createEnemy, damageEntity } from "./entities";
import { addEntity, updateEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { advancePatronPower, resetWarmasterAttempt, updateWarmasterSystem } from "./warmasterSystem";
import { WARMASTER_ABILITY_IDS, WARMASTER_ARENA, type WarmasterAttempt } from "./warmasterState";
import { ENEMY_TYPES, getEnemyCombatBodyRadius } from "./enemyArchetypes";
import { ENEMY_ABILITY_DEFINITIONS } from "./enemyAbilities";
import { updateEnemyAbilitySystem, recordEnemyBasicAttackCommitted } from "./enemyAbilitySystem";
import { updateEnemyDashSystem } from "./enemyDashSystem";
import { applyStatusEffect, updateStatusEffects } from "./statusEffects";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { sanitizeGameStateForSave } from "./saveGame";
import { isWalkablePosition } from "./movementPlanning";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { updateEnemyAISystem } from "./enemyAISystem";
import { updateEnemyRespawnSystem } from "./enemyRespawnSystem";
import type { Companion, Enemy, EnemyTypeId } from "./types";
afterEach(() => vi.restoreAllMocks());
function setup() {
  const boss = {
    ...createEnemy("boss", { x: 101, y: 27 }, "aggressive", {
      enemyTypeId: "orc_warmaster",
      combatBodyRadius: 1.25,
      encounterBand: "boss"
    }),
    state: "attack" as const,
    currentTargetId: "leader",
    lastAttackAt: 0
  };
  const leader = {
    ...createCompanion("leader", { x: 99, y: 27 }, "leader", "fighter"),
    health: 1000,
    maxHealth: 1000
  };
  return updateWarmasterSystem([boss, leader].reduce(addEntity, createTestGameState({
    currentMapId: "map-7",
    map: createDebugMap("map-7"),
    partyLeaderId: "leader"
  })), 0);
}
function feed(state: GameState, count: number, now = 1000): GameState {
  for (let index = 0;index < count;index++) {
    const enemy = createEnemy(`feed-${index}-${now}`, { x: 95, y: 25 }, "aggressive", { enemyTypeId: "orc" });
    state = addEntity(state, enemy);
    state = updateEntity(state, damageEntity(enemy, enemy.maxHealth), now);
  }
  return state;
}
describe("Warmaster encounter", () => {
  it("uses the agreed priority, timing, stats and Boss band", () => {
    expect(ENEMY_TYPES.orc_warmaster.abilityIds).toEqual(WARMASTER_ABILITY_IDS);
    expect(WARMASTER_ABILITY_IDS.map(id => {
      const ability = ENEMY_ABILITY_DEFINITIONS[id]!;
      return [ability.castDurationMs, ability.windupDurationMs, ability.cooldownMs];
    })).toEqual([[1500, 500, 20000], [1200, 300, 12000], [600, 200, 8000], [900, 200, 10000]]);
    const state = setup();
    expect(state.entities.boss).toMatchObject({
      health: 1500,
      attack: 20,
      level: 20,
      encounterBand: "boss",
      combatSizeMultiplier: 1,
      movementBounds: WARMASTER_ARENA
    });
  });
  it.each<EnemyTypeId>(["orc", "orc_raider", "orc_shieldbearer"])("credits one real %s death, including Superior and Barrack ownership", enemyTypeId => {
    const enemy = { ...createEnemy("orc", { x: 94, y: 25 }, "aggressive", { enemyTypeId, variant: "superior" }), barrackSpawn: { barrackId: "map-7-arena-barrack-west", sequence: 1 } };
    let state = addEntity(setup(), enemy);
    state = updateEntity(state, damageEntity(enemy, enemy.maxHealth), 1000);
    state = updateEntity(state, state.entities.orc, 1100);
    expect(state.warmasterAttempt?.transfers).toHaveLength(1);
    expect(updateWarmasterSystem(state, 1999).warmasterAttempt?.power).toBe(0);
    state = updateWarmasterSystem(state, 2000);
    expect(state.warmasterAttempt?.power).toBe(1);
    expect(updateWarmasterSystem(state, 200000).warmasterAttempt?.power).toBe(1);
  });
  it("does not credit outside deaths, wrong types, despawns or repeated dead records", () => {
    let state = setup();
    for (const [id, enemyTypeId, position] of [
      ["outside", "orc", { x: 70, y: 25 }],
      ["bat", "night_bat", { x: 94, y: 25 }],
    ] as const) {
      const enemy = createEnemy(id, position, "aggressive", { enemyTypeId });
      state = addEntity(state, enemy);
      state = updateEntity(state, damageEntity(enemy, enemy.maxHealth), 1000);
    }
    expect(state.warmasterAttempt?.transfers).toEqual([]);
  });
  it("credits a respawned enemy ID on its next genuine death", () => {
    let state = feed(setup(), 1);
    const enemy = state.entities["feed-0-1000"] as Enemy;
    state = updateEntity(state, {
      ...enemy,
      health: enemy.maxHealth,
      state: "idle"
    }, 1200);
    state = updateEntity(state, enemy, 1300);
    expect(state.warmasterAttempt?.transfers).toHaveLength(2);
  });
  it("captures normal combat and DoT deaths through the same seam", () => {
    let state = setup();
    const enemy = createEnemy("orc", { x: 94, y: 25 }, "aggressive", { enemyTypeId: "orc", maxHealth: 1 });
    state = addEntity(state, enemy);
    state = resolveAndApplyCombatDamage(state, state.entities.leader as Companion, enemy, {
      damageType: "physical",
      powerMultiplier: 100,
      allowEvasion: false,
      allowPassiveBlock: false,
      now: 1000,
      rng: () => 0.99
    }).state;
    expect(state.warmasterAttempt?.transfers[0].arrivesAt).toBe(2000);
    const poisoned = createEnemy("poisoned", { x: 94, y: 25 }, "aggressive", { enemyTypeId: "orc", maxHealth: 1 });
    state = addEntity(state, poisoned);
    state = applyStatusEffect(state, {
      type: "poison",
      targetId: poisoned.id,
      sourceId: "leader",
      sourceKey: "test",
      durationMs: 3000,
      tickDamage: 100,
      tickIntervalMs: 1000
    }, 1000);
    state = updateStatusEffects(state, 2000);
    expect(state.warmasterAttempt?.transfers.map(transfer => transfer.arrivesAt)).toEqual([2000, 3000]);
  });
  it("caps power, never compounds stats or body size and never decays", () => {
    let state = updateWarmasterSystem(feed(setup(), 12), 2000);
    expect(state.warmasterAttempt?.power).toBe(10);
    expect(state.entities.boss).toMatchObject({
      maxHealth: 1500,
      attack: 20,
      defense: 12,
      combatSizeMultiplier: 1.5
    });
    expect(getEnemyCombatBodyRadius(state.entities.boss as Enemy)).toBe(1.875);
    state = updateWarmasterSystem(state, 2001);
    expect(getEnemyCombatBodyRadius(state.entities.boss as Enemy)).toBe(1.875);
    expect(updateWarmasterSystem(state, 16999).warmasterAttempt?.power).toBe(10);
    state = updateWarmasterSystem(state, 17000);
    expect(state.warmasterAttempt?.power).toBe(10);
    state = updateWarmasterSystem(feed(state, 1, 17500), 18500);
    expect(updateWarmasterSystem(state, 200000).warmasterAttempt?.power).toBe(10);
  });
  it("consumes due arrivals once across long gaps without decay or banking overflow", () => {
    const attempt: WarmasterAttempt = {
      id: "a",
      bossId: "b",
      power: 10,
      transfers: [{
        id: "t",
        bossId: "b",
        attemptId: "a",
        origin: { x: 0, y: 0 },
        startedAt: 14000,
        arrivesAt: 15000
      }],
      transferSequence: 1
    };
    expect(advancePatronPower(attempt, 15000)).toMatchObject({
      power: 10,
      transfers: []
    });
    const consumed = advancePatronPower(attempt, 200000);
    expect(consumed).toMatchObject({ power: 10, transfers: [] });
    expect(advancePatronPower(consumed, 400000).power).toBe(10);
    const empty = {
      ...attempt,
      power: 0,
    };
    expect(advancePatronPower(empty, 15000).power).toBe(1);
  });
  it.each([[0, "orc_warmaster_kick"], [4, "orc_warmaster_kick"], [5, "orc_warmaster_patron_cleave"], [9, "orc_warmaster_patron_cleave"], [10, "orc_warmaster_patron_burst"]])("selects the first available attack at %s power", (power, abilityId) => {
    let state = setup();
    state = { ...state, warmasterAttempt: { ...state.warmasterAttempt!, power: power as number } };
    state = updateEnemyAbilitySystem(state, 3000);
    expect(state.enemyAbilityCastsByEnemyId?.boss.abilityId).toBe(abilityId);
  });
  it("casts Dash at distance and retains shared movement, cooldown and attack gating", () => {
    let state = setup();
    state = updateEntity(state, { ...state.entities.leader, position: { x: 97, y: 27 } });
    state = updateEnemyAbilitySystem(state, 3000);
    expect(state.enemyAbilityCastsByEnemyId?.boss).toMatchObject({
      abilityId: "orc_warmaster_rending_dash",
      castEndsAt: 3900,
      windupEndsAt: 4100,
      dashPlan: { distance: 7.5, durationMs: 350 }
    });
    state = updateEnemyAbilitySystem(state, 4100);
    state = updateEnemyDashSystem(state, new Set(), 4450, () => 0.99);
    expect(state.enemyDashesByEnemyId?.boss).toBeUndefined();
    expect(state.enemyAbilityBasicAttackRequiredByEnemyId?.boss).toBe(true);
    expect((state.entities.boss as Enemy).lastAttackAt).toBe(4450);
    expect(state.enemyAbilityCooldownsByEnemyId?.boss.orc_warmaster_rending_dash.expiresAt).toBe(13000);
    expect(recordEnemyBasicAttackCommitted(state, "boss").enemyAbilityBasicAttackRequiredByEnemyId?.boss).toBeUndefined();
  });
  it("keeps started geometry and resolution locked when the caster moves", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup();
    state = { ...state, warmasterAttempt: { ...state.warmasterAttempt!, power: 10 } };
    state = updateEnemyAbilitySystem(state, 3000);
    const area = state.enemyAbilityCastsByEnemyId?.boss.area;
    state = updateEntity(state, { ...state.entities.boss, position: { x: 98, y: 30 } });
    state = updateEnemyAbilitySystem(state, 4999);
    expect(state.enemyAbilityCastsByEnemyId?.boss.area).toBe(area);
    state = updateEnemyAbilitySystem(state, 5000);
    expect((state.entities.leader as Companion).health).toBeLessThan(1000);
    const health = (state.entities.leader as Companion).health;
    expect((updateEnemyAbilitySystem(state, 5001).entities.leader as Companion).health).toBe(health);
  });
  it("Kick only pushes a surviving non-evading target still in reach", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = updateEnemyAbilitySystem(setup(), 3000);
    state = updateEnemyAbilitySystem(state, 3800);
    expect(state.forcedMovementsByEntityId?.leader).toMatchObject({
      distance: 4,
      startedAt: 3800,
      endsAt: 4050,
      direction: { x: -1, y: 0 }
    });
    state = updateEnemyAbilitySystem(setup(), 3000);
    state = updateEntity(state, { ...state.entities.leader, position: { x: 94, y: 27 } });
    expect(updateEnemyAbilitySystem(state, 3800).forcedMovementsByEntityId?.leader).toBeUndefined();
    state = updateEnemyAbilitySystem(setup(), 3000);
    state = applyStatusEffect(state, {
      type: "forcedEvasion",
      targetId: "leader",
      durationMs: 1000
    }, 3000);
    expect(updateEnemyAbilitySystem(state, 3800).forcedMovementsByEntityId?.leader).toBeUndefined();
  });
  it("Kick still pushes through a physical shield without dealing HP damage", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup();
    state = { ...state, skillShieldBlocksById: { shield: {
      id: "shield", ownerId: "leader", position: state.entities.leader.position,
      rotationRadians: 0, expiresAt: 5000, remainingBlocks: 1, blockedDamageTypes: ["physical"],
    } } };
    state = updateEnemyAbilitySystem(state, 3000);
    state = updateEnemyAbilitySystem(state, 3800);
    expect((state.entities.leader as Companion).health).toBe(1000);
    expect(state.forcedMovementsByEntityId?.leader).toBeDefined();
  });
  it("rejects a Burst outside the real circle even when normal selection range includes body radius", () => {
    let state = setup();
    state = { ...state, warmasterAttempt: { ...state.warmasterAttempt!, power: 10 } };
    state = updateEntity(state, { ...state.entities.leader, position: { x: 96.99, y: 27 } });
    state = updateEnemyAbilitySystem(state, 3000);
    expect(state.enemyAbilityCastsByEnemyId?.boss.abilityId).toBe("orc_warmaster_patron_cleave");
    expect(state.enemyAbilityCooldownsByEnemyId?.boss.orc_warmaster_patron_burst).toBeUndefined();
  });
  it("uses locked cone geometry and skips companions that dodge sideways or fake death", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup();
    state = { ...state, warmasterAttempt: { ...state.warmasterAttempt!, power: 5 } };
    const boundary = { ...createCompanion("boundary", { x: 95, y: 27 }, "leader"), health: 1000, maxHealth: 1000 };
    state = addEntity(state, boundary);
    state = updateEnemyAbilitySystem(state, 3000);
    state = updateEntity(state, { ...state.entities.leader, position: { x: 101, y: 30 } });
    state = updateEnemyAbilitySystem(state, 4500);
    expect((state.entities.leader as Companion).health).toBe(1000);
    expect((state.entities.boundary as Companion).health).toBeLessThan(1000);
    expect(state.combatFeedbackEvents.filter(event => event.entityId === "boss" && event.text === "Patron Cleave")).toHaveLength(1);
  });
  it.each(["incapacitated", "silenced", "taunted"] as const)("interrupts a pending cast on %s without refunding its cooldown", type => {
    let state = updateEnemyAbilitySystem(setup(), 3000);
    state = applyStatusEffect(state, { type, targetId: "boss", durationMs: 1000, sourceId: "leader" }, 3100);
    state = updateEnemyAbilitySystem(state, 3800);
    expect(state.enemyAbilityCastsByEnemyId?.boss).toBeUndefined();
    expect(state.enemyAbilityCooldownsByEnemyId?.boss.orc_warmaster_kick.expiresAt).toBe(11000);
    expect(state.enemyAbilityBasicAttackRequiredByEnemyId?.boss).toBe(true);
  });
  it("clears the Boss's control effects on reset without damaging or repairing other entities", () => {
    let state = setup();
    state = applyStatusEffect(state, { type: "poison", targetId: "boss", sourceKey: "test", durationMs: 10000, tickDamage: 5 }, 1000);
    state = applyStatusEffect(state, { type: "incapacitated", targetId: "leader", durationMs: 10000 }, 1000);
    state = resetWarmasterAttempt(state, 2000);
    expect(Object.values(state.statusEffectsById ?? {}).some(status => status.targetId === "boss")).toBe(false);
    expect(Object.values(state.statusEffectsById ?? {}).some(status => status.targetId === "leader")).toBe(true);
  });
  it("resets at the exact retreat boundary and permits returning before it", () => {
    let state = feed(setup(), 1);
    state = updateEntity(state, { ...state.entities.leader, position: { x: 75, y: 50 } });
    state = updateWarmasterSystem(state, 2000);
    expect(updateWarmasterSystem(state, 4999).warmasterAttempt).toBeDefined();
    const returned = updateWarmasterSystem(updateEntity(state, { ...state.entities.leader, position: { x: 90, y: 45 } }), 4999);
    expect(returned.warmasterAttempt?.emptySince).toBeUndefined();
    expect(updateWarmasterSystem(state, 5000).warmasterAttempt).toBeUndefined();
    expect(updateWarmasterSystem(state, 5000).entities.boss).toMatchObject({
      health: 1500,
      combatSizeMultiplier: 1,
      position: { x: 101, y: 27 }
    });
  });
  it("cleans death, wipe, map transition and explicit reset without changing Barracks", () => {
    let state = feed(setup(), 2);
    const barracks = {
      "test-barrack": {
        health: 0,
        spawnSequence: 7,
        rebuildAtMs: 120000,
        preparationMs: 0
      }
    } as GameState["barracksById"];
    state = { ...state, barracksById: barracks };
    expect(resetWarmasterAttempt(state, 3000).barracksById).toBe(barracks);
    const dead = updateEntity(state, damageEntity(state.entities.boss as Enemy, 10000), 2000);
    expect(updateWarmasterSystem(dead, 3000).warmasterAttempt).toBeUndefined();
    const wiped = updateEntity(state, damageEntity(state.entities.leader as Companion, 10000), 2000);
    expect(updateWarmasterSystem(wiped, 3000).warmasterAttempt).toBeUndefined();
    expect(clearMapTransitionRuntimeState(state).warmasterAttempt).toBeUndefined();
  });
  it("restores a fresh living attempt but never revives a dead Boss", () => {
    const state = updateWarmasterSystem(feed(setup(), 8), 2000);
    const injured = updateEntity(state, damageEntity(state.entities.boss as Enemy, 100), 2500);
    const restored = sanitizeGameStateForSave(injured, 3000);
    expect(restored.warmasterAttempt).toBeUndefined();
    expect(restored.entities.boss).toMatchObject({ health: 1500, maxHealth: 1500, combatSizeMultiplier: 1 });
    expect(restored.enemyAbilityCooldownsByEnemyId?.boss).toBeUndefined();
    const dead = updateEntity(state, damageEntity(state.entities.boss as Enemy, 10000), 2500);
    expect(sanitizeGameStateForSave(dead, 3000).entities.boss).toMatchObject({ health: 0, state: "dead" });
  });
  it("updates legacy Boss health, starts legacy encounters ready and excludes generic respawn", () => {
    const state = setup();
    const legacy = { ...state, entities: { ...state.entities, boss: { ...state.entities.boss, health: 140, maxHealth: 240 } } };
    expect(sanitizeGameStateForSave(legacy, 1000).entities.boss).toMatchObject({ health: 1500, maxHealth: 1500 });
    const dead = { ...legacy, entities: { ...legacy.entities, boss: { ...legacy.entities.boss, health: 0, state: "dead" as const, defeatedAtMs: 0 } } };
    expect(sanitizeGameStateForSave(dead, 1000).entities.boss).toMatchObject({ health: 1500, maxHealth: 1500, state: "idle" });
    expect(updateEnemyRespawnSystem(dead, 30000, () => 1).entities.boss).toMatchObject({ health: 0, state: "dead" });
  });
  it("reserves maximum-growth terrain clearance and cannot move outside the arena", () => {
    const state = setup();
    expect(isWalkablePosition(state, { x: 81, y: 27 }, "boss")).toBe(false);
    expect(isWalkablePosition(state, { x: 100, y: 45 }, "boss")).toBe(true);
    expect(isWalkablePosition(state, { x: 87, y: 53 }, "boss")).toBe(false);
  });
  it("retains an engaged target throughout the arena, not only within the old home leash", () => {
    let state = setup();
    state = updateEntity(state, { ...state.entities.leader, position: { x: 90, y: 45 } });
    const next = updateEnemyAISystem(state, { nowMs: 3000, deltaMs: 100, deltaSeconds: 0.1, frameNumber: 1 });
    expect((next.entities.boss as Enemy).currentTargetId).toBe("leader");
  });
});
