import { describe, expect, it, vi, afterEach } from "vitest";
import { BARRACK_DEFINITIONS, getBarrackMaxHealth, rollBarrackEnemy } from "./barrackDefinitions";
import { initializeBarracks, restoreBarracks, updateBarracks } from "./barracks";
import { createCompanion, createEnemy } from "./entities";
import { createTestGameState } from "./testState";
import { createDebugMap } from "./debugMap";
import { updateEntity, type GameState } from "./state";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { updateAttackSystem } from "./attackSystem";
import { resolveBasicAttackImpact } from "./combatBasicAttackResolution";
import { issuePartyOrder } from "./commands";
import { applyStatusEffect, updateStatusEffects } from "./statusEffects";
import { updateEnemyRespawnSystem } from "./enemyRespawnSystem";
import { getCombatTargetPosition, hasStructureLineOfSight } from "./combatStructures";
import { launchCombatProjectile, updateCombatProjectileSystem } from "./combatProjectileSystem";
import { sanitizeGameStateForSave } from "./saveGame";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { isWallPosition } from "./movementPlanning";
import { bakeNavigationGrid, findNavigationPath } from "./navigation";
import * as navigation from "./navigation";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { getSkillTarget, findEnemyTarget } from "./skillTargeting";
import { SKILL_DEFINITIONS } from "./skills";
import { resolveSkillEffect } from "./skillEffectResolution";
import { startMaulSweepChannel, updateCompanionAoeChannelSystem } from "./companionAoeChannelSystem";
import { updateRoleSystem } from "./roleSystem";
import type { CombatStructure, Companion, Enemy } from "./types";

const definition = BARRACK_DEFINITIONS[0];
const id = definition.id;
function setup(position = { x: 75, y: 21 }): GameState {
  const companion = { ...createCompanion("leader", position, "leader"), state: "idle" as const };
  return initializeBarracks(createTestGameState({ currentMapId: "map-7", map: createDebugMap("map-7"),
    partyLeaderId: companion.id, entities: { [companion.id]: companion } }));
}
function structure(state: GameState) { return state.entities[id] as CombatStructure; }
function tick(state: GameState, count = 90, start = 0) {
  for (let i = 1; i <= count; i++) state = updateBarracks(state, start + i * 100, 100, () => 0);
  return state;
}
function reinforcements(state: GameState): Enemy[] {
  return Object.values(state.entities).filter((e): e is Enemy => e.kind === "enemy" && e.barrackSpawn?.barrackId === id);
}
function destroy(state: GameState, now = 1_000) {
  return updateEntity(state, { ...structure(state), health: 0, state: "dead" }, now);
}

describe("Orc Barracks", () => {
  afterEach(() => vi.restoreAllMocks());
  it("creates three independent structures with derived 624 HP and zero combat stats", () => {
    const state = setup();
    expect(getBarrackMaxHealth()).toBe(624);
    expect(Object.values(state.entities).filter(e => e.kind === "structure")).toHaveLength(3);
    expect(structure(state)).toMatchObject({ maxHealth: 624, attack: 0, defense: 0, magicDefense: 0, evasion: 0 });
    expect(initializeBarracks(state)).toBe(state);
  });
  it.each([[0,"orc"], [0.79999,"orc"], [0.8,"orc_raider"], [0.89999,"orc_raider"], [0.9,"orc_shieldbearer"], [0.99999,"orc_shieldbearer"]] as const)("weights boundary %s", (roll, type) => {
    expect(rollBarrackEnemy(() => roll)).toBe(type);
  });
  it("waits nine seconds, uses ordinary type stats and never rolls a Superior", () => {
    let state = tick(setup(), 89);
    expect(reinforcements(state)).toHaveLength(0);
    state = tick(state, 1, 8_900);
    expect(reinforcements(state)).toHaveLength(1);
    const enemy = reinforcements(state)[0];
    expect(enemy).toMatchObject({ enemyTypeId: "orc", level: 18, variant: undefined, health: 208, barrackSpawn: { barrackId: id, sequence: 1 } });
    expect(state.barracksById?.[id].preparationMs).toBe(0);
  });
  it("pauses out of range and for dead companions without losing progress", () => {
    let state = tick(setup(), 40);
    const leader = state.entities.leader as Companion;
    state = updateEntity(state, { ...leader, position: { x: 20, y: 20 } });
    state = tick(state, 100);
    expect(state.barracksById?.[id].preparationMs).toBe(4_000);
    state = updateEntity(state, { ...leader, health: 0, state: "dead" });
    state = tick(state, 100);
    expect(state.barracksById?.[id].preparationMs).toBe(4_000);
    state = updateEntity(state, leader);
    expect(reinforcements(tick(state, 50))).toHaveLength(1);
  });
  it("does not activate through the existing route wall or perform spawn-path searches while hidden", () => {
    let state = setup({ x: 68, y: 26 });
    state.barracksById![id].preparationMs = 9_000;
    const search = vi.spyOn(navigation, "findNavigationPath");
    state = tick(state, 100);
    expect(reinforcements(state)).toHaveLength(0);
    expect(state.barracksById?.[id]).toMatchObject({ preparationMs: 9_000, wasInRange: false });
    expect(state.barracksById?.[id].tutorialSeen).toBeUndefined();
    expect(state.barracksById?.[id].speech).toBeUndefined();
    expect(search).not.toHaveBeenCalled();
  });
  it.each(BARRACK_DEFINITIONS)("requires visibility before $id can prepare", barrackDefinition => {
    let state = setup({ x: barrackDefinition.position.x, y: barrackDefinition.position.y - 6 });
    const wall = { x: barrackDefinition.position.x, y: barrackDefinition.attackBounds.minY - 1 };
    state.map = { ...state.map!, walls: [...state.map!.walls, wall] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = tick(state, 20);
    expect(state.barracksById?.[barrackDefinition.id].preparationMs).toBe(0);
    state.map = { ...state.map!, walls: state.map!.walls.filter(p => p.x !== wall.x || p.y !== wall.y) };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = tick(state, 20);
    expect(state.barracksById?.[barrackDefinition.id].preparationMs).toBe(2_000);
  });
  it("pauses behind a collision obstacle and resumes the same preparation progress", () => {
    let state = tick(setup({ x: 75, y: 20 }), 40);
    const walls = state.map!.collisionWalls ?? [];
    state.map = { ...state.map!, collisionWalls: [...walls, { x: 75, y: 21 }] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = tick(state, 100, 4_000);
    expect(state.barracksById?.[id].preparationMs).toBe(4_000);
    expect(reinforcements(state)).toHaveLength(0);
    state.map = { ...state.map!, collisionWalls: walls };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = tick(state, 49, 14_000);
    expect(state.barracksById?.[id].preparationMs).toBe(8_900);
    expect(reinforcements(state)).toHaveLength(0);
    expect(reinforcements(tick(state, 1, 18_900))).toHaveLength(1);
  });
  it("uses a visible companion rather than a hidden leader for activation and spawn reachability", () => {
    let state = setup({ x: 68, y: 26 });
    const visible = createCompanion("visible", { x: 75, y: 20 }, "leader", "fighter", 2);
    state.entities.visible = visible;
    state.barracksById![id].preparationMs = 8_900;
    const search = vi.spyOn(navigation, "findNavigationPath");
    state = updateBarracks(state, 9_000, 100, () => 0);
    expect(reinforcements(state)).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][2]).toEqual([visible.position]);
    state.entities.visible = { ...visible, health: 0, state: "dead" };
    state = tick(state, 10, 9_000);
    expect(state.barracksById?.[id].preparationMs).toBe(0);
  });
  it("does not let companion or enemy bodies occlude production visibility", () => {
    let state = setup({ x: 75, y: 19 });
    const blocker = createCompanion("body", { x: 75, y: 20.5 }, "leader", "fighter", 2);
    state.entities.body = { ...blocker, health: 0, state: "dead" };
    state.entities.enemyBody = createEnemy("enemyBody", { x: 75, y: 21 }, "passive", { enemyTypeId: "orc" });
    state = tick(state, 10);
    expect(state.barracksById?.[id].preparationMs).toBe(1_000);
  });
  it("retains a finished pending roll while visibility is lost and resumes without rerolling", () => {
    let state = setup({ x: 68, y: 26 });
    state.barracksById![id] = { ...state.barracksById![id], preparationMs: 9_000, pendingEnemyTypeId: "orc_raider", wasInRange: true };
    const random = vi.fn(() => 0.99);
    state = updateBarracks(state, 10_000, 100, random);
    expect(state.barracksById?.[id]).toMatchObject({ preparationMs: 9_000, pendingEnemyTypeId: "orc_raider" });
    expect(random).not.toHaveBeenCalled();
    state.entities.leader = { ...state.entities.leader, position: { x: 75, y: 20 } };
    state = updateBarracks(state, 10_100, 100, random);
    expect(reinforcements(state)).toHaveLength(1);
    expect(reinforcements(state)[0].enemyTypeId).toBe("orc_raider");
    expect(state.barracksById?.[id].preparationMs).toBe(0);
  });
  it.each([[10, 100], [10.001, 0]])("retains the exact ten-unit activation boundary at distance %s", (distance, expected) => {
    const state = updateBarracks(setup({ x: 75, y: 26 - distance }), 100, 100, () => 0);
    expect(state.barracksById?.[id].preparationMs).toBe(expected);
  });
  it("retains a completed roll at blocked spawn positions and does not catch up", () => {
    let state = setup();
    for (const [i, p] of definition.spawnCandidates.entries()) state.entities[`blocker${i}`] = createEnemy(`blocker${i}`, p);
    const random = vi.fn(() => 0.85);
    state.barracksById![id].wasInRange = true;
    state.barracksById![id].preparationMs = 8_900;
    state = updateBarracks(state, 9_000, 100, random);
    state = updateBarracks(state, 99_000, 90_000, random);
    expect(random).toHaveBeenCalledTimes(1);
    expect(state.barracksById?.[id].pendingEnemyTypeId).toBe("orc_raider");
    for (const i of definition.spawnCandidates.keys()) delete state.entities[`blocker${i}`];
    state = updateBarracks(state, 99_100, 100, random);
    expect(reinforcements(state)).toHaveLength(1);
    expect(reinforcements(state)[0].enemyTypeId).toBe("orc_raider");
    expect(state.barracksById?.[id].preparationMs).toBe(0);
  });
  it("enforces five living owned enemies, excludes dead ones and independent respawn", () => {
    let state = setup();
    for (let sequence = 1; sequence <= 5; sequence++) {
      const enemyId = `${id}-orc-${sequence}`;
      state.entities[enemyId] = { ...createEnemy(enemyId, { x: 10 + sequence, y: 10 }, "aggressive", { enemyTypeId: "orc" }), barrackSpawn: { barrackId: id, sequence } };
    }
    state.barracksById![id].spawnSequence = 5;
    state = tick(state);
    expect(state.barracksById?.[id].preparationMs).toBe(0);
    const enemy = reinforcements(state)[0];
    state.entities[enemy.id] = { ...enemy, health: 0, state: "dead", defeatedAtMs: 0 };
    state = tick(state);
    expect(reinforcements(state).filter(e => e.health > 0)).toHaveLength(5);
    expect(state.entities[`${id}-orc-6`]).toBeDefined();
    expect(updateEnemyRespawnSystem(state, 999_000).entities[enemy.id].state).toBe("dead");
  });
  it("allows attacks at the footprint edge, never requires reaching its center", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup({ x: 75, y: 24.1 });
    state = issuePartyOrder(state, { type: "attack", targetId: id });
    expect(state.entities.leader.state).toBe("attack");
    state = updateAttackSystem(state, new Set(), 10_000);
    expect(structure(state).health).toBeLessThan(624);
    expect(getCombatTargetPosition({ x: 70, y: 26 }, structure(state))).toEqual({ x: 73, y: 26 });
  });
  it("takes physical and magic damage but destruction has no enemy rewards", () => {
    let state = setup();
    const before = state.inventory;
    state = resolveAndApplyCombatDamage(state, state.entities.leader as Companion, structure(state), {
      damageType: "magic", powerMultiplier: 1_000, now: 2_000, label: "test", allowEvasion: false, allowPassiveBlock: false }).state;
    expect(structure(state).health).toBe(0);
    expect(state.inventory).toEqual(before);
    expect(state.barracksById?.[id].respawnAtMs).toBe(122_000);
  });
  it("accepts DoTs but rejects crowd control and aura buffs", () => {
    let state = setup();
    for (const type of ["immobilized", "taunted", "silenced", "disarmed"] as const) {
      expect(applyStatusEffect(state, { type, targetId: id, durationMs: 1_000, sourceId: "leader" }, 0)).toBe(state);
    }
    state = applyStatusEffect(state, { type: "burning", targetId: id, durationMs: 2_000, tickIntervalMs: 1_000, tickDamage: 1_000, sourceId: "leader", sourceKey: "test" }, 0);
    state = updateStatusEffects(state, 1_000);
    expect(structure(state).health).toBe(0);
    expect(state.barracksById?.[id].respawnAtMs).toBe(121_000);
  });
  it("projectiles impact the attack bounds and respect unrelated walls", () => {
    let state = setup({ x: 75, y: 22 });
    const profile = { damageType: "physical" as const, powerMultiplier: 1, visualProfileId: "hunter_arrow" as const, speed: 12, impactRadius: 0.3 };
    state = launchCombatProjectile(state, state.entities.leader as Companion, structure(state), profile, 0);
    state = updateCombatProjectileSystem(state, 1_000, 1_000);
    expect(structure(state).health).toBeLessThan(624);
    state.map = { ...state.map!, walls: [...state.map!.walls, { x: 75, y: 21 }], navigationGrid: undefined };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    expect(hasStructureLineOfSight(state, { x: 75, y: 20 }, structure(state))).toBe(false);
  });
  it("destroys once, clears commands and collision, retains existing reinforcements", () => {
    let state = tick(setup());
    state = issuePartyOrder(state, { type: "attack", targetId: id });
    expect(isWallPosition(state, { x: 75, y: 26 })).toBe(true);
    state = destroy(state);
    expect(isWallPosition(state, { x: 75, y: 26 })).toBe(false);
    expect((state.entities.leader as Companion).currentTargetId).toBeNull();
    expect(state.leaderIntent?.targetId).not.toBe(id);
    expect(reinforcements(state)).toHaveLength(1);
    expect(destroy(state, 5_000).barracksById?.[id].respawnAtMs).toBe(121_000);
  });
  it("rebuilds at 120 seconds, defers occupied footprints and preserves monotonic sequence", () => {
    let state = destroy(tick(setup()));
    state = updateBarracks(state, 120_999, 100);
    expect(structure(state).health).toBe(0);
    const leader = state.entities.leader as Companion;
    state.entities.leader = { ...leader, position: { x: 75, y: 26 } };
    state = updateBarracks(state, 121_000, 100);
    expect(structure(state).health).toBe(0);
    state.entities.leader = leader;
    state = updateBarracks(state, 121_100, 100);
    expect(structure(state).health).toBe(624);
    expect(state.barracksById?.[id].spawnSequence).toBe(1);
    expect(state.barracksById?.[id].preparationMs).toBeLessThanOrEqual(100);
  });
  it("serializes durable runtime, clears speech and restores reinforcements without duplication", () => {
    let state = tick(setup());
    state = updateEntity(state, { ...structure(state), health: 100 }, 10_000);
    state = sanitizeGameStateForSave(state, 10_000);
    expect(structure(state).health).toBe(100);
    expect(reinforcements(state)).toHaveLength(1);
    expect(state.barracksById?.[id].speech).toBeUndefined();
    expect(state.barracksById?.[id].tutorialSeen).toBe(true);
    state = updateBarracks(state, 10_100, 100);
    expect(state.barracksById?.[id].speech).toBeUndefined();
  });
  it("sanitizes malformed records, orphaned ownership and missing legacy state", () => {
    let state = setup();
    state.barracksById = { unknown: { health: 1, preparationMs: 0, spawnSequence: 0 }, [id]: { health: -4, preparationMs: Infinity, spawnSequence: -1 } };
    const orphan = { ...createEnemy("orphan", { x: 5, y: 5 }), barrackSpawn: { barrackId: "unknown", sequence: 1 } };
    state.entities.orphan = orphan;
    state = restoreBarracks(state, 500);
    expect(state.barracksById?.unknown).toBeUndefined();
    expect(state.barracksById?.[id]).toMatchObject({ health: 0, preparationMs: 0, spawnSequence: 0, respawnAtMs: 120_500 });
    expect(state.entities.orphan).toBeUndefined();
    expect(structure(restoreBarracks({ ...setup(), barracksById: undefined }, 0)).health).toBe(624);
  });
  it("preserves durable state across map cleanup and restores collision on reconstruction", () => {
    let state = destroy(setup());
    state = clearMapTransitionRuntimeState(state);
    state = pruneMissingEntityRuntimeState({ ...state, entities: { leader: state.entities.leader }, map: createDebugMap("map-7") });
    expect(structure(state).health).toBe(0);
    expect(isWallPosition(state, { x: 75, y: 26 })).toBe(false);
    expect(state.barracksById?.[id].respawnAtMs).toBe(121_000);
  });
  it("keeps the route passable around a living, destroyed or rebuilt Barrack", () => {
    let state = setup();
    expect(findNavigationPath(state.map!, { x: 75, y: 20 }, [{ x: 75, y: 32 }]).length).toBeGreaterThan(0);
    expect(findNavigationPath(state.map!, { x: 75, y: 32 }, [{ x: 75, y: 20 }]).length).toBeGreaterThan(0);
    expect(isWallPosition(state, { x: 75, y: 26 })).toBe(true);
    for (const x of [70, 71, 72, 78, 79]) {
      for (const y of [25, 26]) expect(isWallPosition(state, { x, y })).toBe(false);
    }
    for (const x of [69, 80]) expect(isWallPosition(state, { x, y: 26 })).toBe(true);
    state = destroy(state);
    expect(findNavigationPath(state.map!, { x: 75, y: 20 }, [{ x: 75, y: 32 }]).length).toBeGreaterThan(0);
    expect(findNavigationPath(state.map!, { x: 20, y: 20 }, [{ x: 6, y: 29 }]).length).toBeGreaterThan(0);
    state = updateBarracks(state, 121_000, 100);
    expect(isWallPosition(state, { x: 75, y: 26 })).toBe(true);
    expect(findNavigationPath(state.map!, { x: 75, y: 20 }, [{ x: 75, y: 32 }]).length).toBeGreaterThan(0);
  });
  it("replaces obsolete choke walls with the open route when restoring existing saves", () => {
    const state = setup();
    const obsoleteWalls = [70, 71, 72, 78, 79].flatMap(x => [25, 26].map(y => ({ x, y })));
    state.map = { ...state.map!, walls: [...state.map!.walls, ...obsoleteWalls] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    expect(findNavigationPath(state.map, { x: 75, y: 20 }, [{ x: 75, y: 32 }])).toHaveLength(0);
    const restored = sanitizeGameStateForSave(state, 1_000);
    expect(findNavigationPath(restored.map!, { x: 75, y: 20 }, [{ x: 75, y: 32 }]).length).toBeGreaterThan(0);
    expect(isWallPosition(restored, { x: 75, y: 26 })).toBe(true);
    expect(structure(restored).health).toBe(624);
  });
  it("allows direct companion orders while autonomous enemy discovery ignores structures", () => {
    let state = setup({ x: 75, y: 24.1 });
    state.autoModeEnabled = true;
    const caster = state.entities.leader as Companion;
    expect(findEnemyTarget(state, caster, 20)).toBeUndefined();
    const result = issueCompanionDirectCommand(state, { type: "attack", companionId: "leader", targetId: id }, 0);
    expect(result.code).toBe("success");
    state = result.state;
    expect((state.entities.leader as Companion).currentTargetId).toBe(id);
    expect(updateRoleSystem(state).entities.leader.state).toBe("attack");
  });
  it("routes an ordered damaging skill through normal damage without enabling control", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = issuePartyOrder(setup({ x: 75, y: 24.1 }), { type: "attack", targetId: id });
    const caster = state.entities.leader as Companion;
    const skill = SKILL_DEFINITIONS.follow_through;
    expect(getSkillTarget(state, caster, skill)?.id).toBe(id);
    state = resolveSkillEffect(state, caster, { skill, target: structure(state), score: 1, selectionPriority: 1 }, 1000).state;
    expect(structure(state).health).toBeLessThan(624);
    expect(structure(state).state).toBe("idle");
    expect(getSkillTarget(state, caster, SKILL_DEFINITIONS.pinning_shot)).toBeUndefined();
  });
  it("incidental AoE damages a footprint with its center outside, once, without CC", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup({ x: 71.5, y: 25.5 });
    const caster = state.entities.leader as Companion;
    state = startMaulSweepChannel(state, caster, SKILL_DEFINITIONS.maul_sweep, 0);
    state = updateCompanionAoeChannelSystem(state, 200);
    expect(structure(state).health).toBeLessThan(624);
    expect(Object.values(state.statusEffectsById ?? {}).filter(status => status.targetId === id)).toHaveLength(0);
    expect(updateCompanionAoeChannelSystem(state, 300).entities[id]).toEqual(state.entities[id]);
  });
  it("defers rebuilding for a reserved movement destination", () => {
    let state = destroy(setup());
    state.reservedPositionsByEntityId = { leader: { x: 75, y: 26 } };
    state = updateBarracks(state, 121_000, 100);
    expect(structure(state).health).toBe(0);
    state.reservedPositionsByEntityId = {};
    expect(structure(updateBarracks(state, 121_100, 100)).health).toBe(624);
  });
  it.each([20, 33])("can produce reachable reinforcements for a party at y=%s", y => {
    const state = tick(setup({ x: 75, y }));
    expect(reinforcements(state)).toHaveLength(1);
    expect(findNavigationPath(state.map!, reinforcements(state)[0].position, [state.entities.leader.position]).length).toBeGreaterThan(0);
  });
  it.each(["north", "south"])("spawns around occupied %s-side candidates without exhaustive failed searches", side => {
    let state = setup({ x: 73, y: side === "north" ? 20 : 32 });
    for (let i = 1; i < 5; i++) {
      const companion = createCompanion(`member-${i}`, { x: 73 + i, y: side === "north" ? 20 : 32 }, "leader", "fighter", i + 1);
      state.entities[companion.id] = companion;
    }
    const blocked = side === "north" ? definition.spawnCandidates.slice(0, 2) : definition.spawnCandidates.slice(2);
    blocked.forEach((position, index) => {
      state.entities[`blocker-${index}`] = createEnemy(`blocker-${index}`, position, "passive", { enemyTypeId: "orc" });
    });
    state.barracksById![id].preparationMs = 9_000;
    const search = vi.spyOn(navigation, "findNavigationPath");
    state = updateBarracks(state, 10_000, 100, () => 0);
    expect(reinforcements(state)).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(state.barracksById?.[id].preparationMs).toBe(0);
  });
  it("basic-attack destruction grants no XP, drops, wallet or quest progress", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup({ x: 75, y: 23.7 });
    const before = { inventory: state.inventory, wallet: state.wallet, quests: state.quests };
    state = resolveBasicAttackImpact(state, state.entities.leader as Companion, structure(state), 1000, { powerMultiplier: 10000 }).state;
    expect(structure(state).state).toBe("dead");
    expect((state.entities.leader as Companion).characterLevel).toBe(1);
    expect(state.inventory).toEqual(before.inventory);
    expect(state.wallet).toEqual(before.wallet);
    expect(state.quests).toEqual(before.quests);
  });
  it("owned reinforcements retain ordinary enemy XP rewards", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = tick(setup());
    const enemy = reinforcements(state)[0];
    state = resolveBasicAttackImpact(state, state.entities.leader as Companion, enemy, 10000, { powerMultiplier: 10000 }).state;
    expect(state.entities[enemy.id].state).toBe("dead");
    expect((state.entities.leader as Companion).lastCharacterXpGained).toBeGreaterThan(0);
  });
});
