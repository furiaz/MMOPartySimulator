import { afterEach, describe, expect, it, vi } from "vitest";
import { BARRACK_DEFINITIONS } from "./barrackDefinitions";
import { initializeBarracks, restoreBarracks } from "./barracks";
import { createCompanion } from "./entities";
import { createDebugMap } from "./debugMap";
import {
  getCombatTargetPosition,
  getStructureApproachPosition,
  hasStructureLineOfSight,
  isHostileTargetInRadius,
} from "./combatStructures";
import { updateAttackSystem } from "./attackSystem";
import { bakeNavigationGrid } from "./navigation";
import { isWallPosition, isWalkablePosition } from "./movementPlanning";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { getPartyExecutionIntentReachability } from "./partyOrderReachability";
import { setPartyExecutionIntent } from "./partyIntentState";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { startMaulSweepChannel, updateCompanionAoeChannelSystem } from "./companionAoeChannelSystem";
import { launchCombatProjectile, updateCombatProjectileSystem } from "./combatProjectileSystem";
import { SKILL_DEFINITIONS } from "./skills";
import { createTestGameState } from "./testState";
import type { CombatStructure, Companion, Position } from "./types";

const routeId = BARRACK_DEFINITIONS[0].id;
function setup(position: Position = { x: 75, y: 21 }) {
  const leader = { ...createCompanion("leader", position, "leader"), state: "idle" as const };
  return initializeBarracks(createTestGameState({
    currentMapId: "map-7", map: createDebugMap("map-7"), partyLeaderId: leader.id,
    entities: { leader },
  }));
}

describe("structure attackable bounds and approach cost", () => {
  afterEach(() => vi.restoreAllMocks());

  it("matches the full displayed building without enlarging ground collision", () => {
    const state = setup();
    for (const definition of BARRACK_DEFINITIONS) {
      const visual = state.map!.visualObjects!.find(object => object.id === definition.id)!;
      const target = state.entities[definition.id] as CombatStructure;
      expect(target.attackBounds).toEqual({
        minX: visual.position.x + 0.5 - visual.widthCells / 2,
        maxX: visual.position.x + 0.5 + visual.widthCells / 2,
        minY: visual.position.y + 1 - visual.heightCells,
        maxY: visual.position.y + 1,
      });
      expect(target.footprint).toEqual(definition.footprint);
    }
    expect(isWallPosition(state, { x: 75, y: 22 })).toBe(false);
    expect(isWallPosition(state, { x: 75, y: 26 })).toBe(true);
  });

  it.each([{ x: 74, y: 21 }, { x: 77, y: 21 }, { x: 75, y: 23.5 }, { x: 75, y: 28 }])(
    "keeps an existing broad-edge firing position without any path searches: %j", position => {
      const state = setup(position);
      const leader = state.entities.leader;
      const target = state.entities[routeId] as CombatStructure;
      consumeGamePerformanceMetrics();
      expect(getStructureApproachPosition(state, leader, target)).toEqual(position);
      expect(getPartyExecutionIntentReachability(state, leader, {
        type: "attack", source: "player", targetId: routeId, targetPosition: target.position,
      }).reason).toBe("valid");
      expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
    },
  );

  it("does one reachable-goal search when approaching, not one search per perimeter point", () => {
    const state = setup({ x: 75, y: 17 });
    const target = state.entities[routeId] as CombatStructure;
    consumeGamePerformanceMetrics();
    const result = getPartyExecutionIntentReachability(state, state.entities.leader, {
      type: "attack", source: "player", targetId: routeId, targetPosition: target.position,
    });
    expect(result.reason).toBe("valid");
    expect(result.targetPosition).toEqual({ x: 75, y: 21 });
    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(1);
  });

  it("retains a ranged companion's full attack range from the displayed edge", () => {
    const state = setup({ x: 75, y: 17 });
    state.entities.leader = { ...state.entities.leader as Companion, classId: "hunter" };
    consumeGamePerformanceMetrics();
    expect(getStructureApproachPosition(state, state.entities.leader, state.entities[routeId] as CombatStructure))
      .toEqual({ x: 75, y: 17 });
    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });

  it.each(BARRACK_DEFINITIONS.slice(1))("allows broad-edge attacks against $id", definition => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const state = setup({ x: definition.attackBounds.minX, y: definition.attackBounds.minY - 1 });
    state.entities.leader = { ...state.entities.leader as Companion, state: "attack", currentTargetId: definition.id };
    const next = updateAttackSystem(state, new Set(), 10_000);
    expect((next.entities[definition.id] as CombatStructure).health).toBeLessThan(624);
    expect(next.entities.leader.position).toEqual(state.entities.leader.position);
  });

  it("does not rerun navigation on successive party formation ticks beside the Barrack", () => {
    let state = setup({ x: 75, y: 23.5 });
    state = setPartyExecutionIntent(state, {
      type: "attack", source: "player", targetId: routeId, targetPosition: state.entities[routeId].position,
    });
    consumeGamePerformanceMetrics();
    for (let frame = 0; frame < 60; frame++) state = updatePartyFormationSystem(state);
    expect((state.entities.leader as Companion).currentTargetId).toBe(routeId);
    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });

  it("lets five companions attack across the wide edge without converging on one point", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const state = setup();
    const positions = [73, 74, 75, 76, 77].map(x => ({ x, y: 21 }));
    state.entities = Object.fromEntries(Object.entries(state.entities).filter(([, entity]) => entity.kind !== "companion"));
    positions.forEach((position, index) => {
      const companion = createCompanion(`member-${index}`, position, "member-0", "fighter", index + 1);
      state.entities[companion.id] = { ...companion, state: "attack", currentTargetId: routeId };
    });
    state.partyLeaderId = "member-0";
    const next = updateAttackSystem(state, new Set(), 10_000);
    for (const [index, position] of positions.entries()) {
      expect(next.entities[`member-${index}`].position).toEqual(position);
      expect((next.entities[`member-${index}`] as Companion).lastAttackAt).toBe(10_000);
    }
    expect((next.entities[routeId] as CombatStructure).health).toBeLessThan(624);
  });

  it("uses roof-area bounds for range, projectiles and incidental AoEs", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup({ x: 75, y: 20.5 });
    const target = state.entities[routeId] as CombatStructure;
    const caster = state.entities.leader as Companion;
    expect(getCombatTargetPosition(caster.position, target)).toEqual({ x: 75, y: 22 });
    expect(isHostileTargetInRadius(target, caster.position, 1.5)).toBe(true);
    expect(isHostileTargetInRadius(target, caster.position, 1.49)).toBe(false);
    state = launchCombatProjectile(state, caster, target, {
      damageType: "physical", powerMultiplier: 1, visualProfileId: "hunter_arrow", speed: 12, impactRadius: 0.3,
    }, 0);
    state = updateCombatProjectileSystem(state, 100, 100);
    expect(state.combatProjectiles).toHaveLength(0);
    expect((state.entities[routeId] as CombatStructure).health).toBeLessThan(624);
    const beforeAoe = (state.entities[routeId] as CombatStructure).health;
    state = startMaulSweepChannel(state, state.entities.leader as Companion, SKILL_DEFINITIONS.maul_sweep, 200);
    state = updateCompanionAoeChannelSystem(state, 400);
    expect((state.entities[routeId] as CombatStructure).health).toBeLessThan(beforeAoe);
  });

  it("still blocks attacks behind unrelated walls and searches the reachable side", () => {
    const state = setup({ x: 75, y: 20 });
    state.map = { ...state.map!, walls: [...state.map!.walls, { x: 75, y: 21 }] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    const target = state.entities[routeId] as CombatStructure;
    expect(hasStructureLineOfSight(state, state.entities.leader.position, target)).toBe(false);
    const approach = getStructureApproachPosition(state, state.entities.leader, target)!;
    expect(approach).not.toBeNull();
    expect(isWalkablePosition(state, approach, "leader", { allowPartyPassThrough: true })).toBe(true);
    expect(hasStructureLineOfSight(state, approach, target)).toBe(true);
    expect(approach.x).not.toBe(75);
  });

  it("does not deal melee or projectile damage through an unrelated wall", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup({ x: 75, y: 21 });
    state.map = { ...state.map!, walls: [...state.map!.walls, { x: 75, y: 21 }] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state.entities.leader = { ...state.entities.leader as Companion, state: "attack", currentTargetId: routeId };
    state = updateAttackSystem(state, new Set(["leader"]), 10_000);
    expect((state.entities[routeId] as CombatStructure).health).toBe(624);
    state = launchCombatProjectile(state, state.entities.leader as Companion, state.entities[routeId] as CombatStructure, {
      damageType: "physical", powerMultiplier: 1, visualProfileId: "hunter_arrow", speed: 12, impactRadius: 0.3,
    }, 10_000);
    state = updateCombatProjectileSystem(state, 11_000, 1_000);
    expect((state.entities[routeId] as CombatStructure).health).toBe(624);
    expect(state.combatProjectiles).toHaveLength(0);
  });

  it("recomputes approach validity after a wall is added, rather than trusting stale reachability", () => {
    const state = setup({ x: 75, y: 21 });
    const target = state.entities[routeId] as CombatStructure;
    expect(getStructureApproachPosition(state, state.entities.leader, target)).toEqual({ x: 75, y: 21 });
    const b = target.attackBounds;
    // Enclose all cells in attack range, leaving the party outside.
    const walls: Position[] = [];
    for (let x = b.minX - 2; x <= b.maxX + 2; x++) {
      walls.push({ x, y: b.minY - 2 }, { x, y: b.maxY + 2 });
    }
    for (let y = b.minY - 2; y <= b.maxY + 2; y++) {
      walls.push({ x: b.minX - 2, y }, { x: b.maxX + 2, y });
    }
    state.entities.leader = { ...state.entities.leader, position: { x: 75, y: 18 } };
    state.map = { ...state.map!, walls: [...state.map!.walls, ...walls] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    expect(getStructureApproachPosition(state, state.entities.leader, target)).toBeNull();
  });

  it("recreates attack bounds for saves from before the follow-up", () => {
    const state = setup();
    Reflect.deleteProperty(state.entities[routeId], "attackBounds");
    const restored = restoreBarracks(state, 100);
    expect((restored.entities[routeId] as CombatStructure).attackBounds).toEqual(BARRACK_DEFINITIONS[0].attackBounds);
  });
});
