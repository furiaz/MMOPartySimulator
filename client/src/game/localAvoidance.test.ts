import { afterEach, describe, expect, it, vi } from "vitest";
import * as authority from "./movementAuthority";
import { createCompanion, createEnemy, createNpc, createResource, getMovementStepDistance } from "./entities";
import { createNormalMovementRequest, getMovementPositionCommit, getNormalMovementResult, getSpecializedMovementOwner } from "./movementAuthority";
import { holdEntityMovement, isCombatPositionAvailable, moveEntityToPositionIfUnoccupied, moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { planLocalAvoidance } from "./localAvoidance";
import { getRecoveryBodyKey, updateOverlapRecoverySystem } from "./overlapRecovery";
import { clearFrameMovementPlanning } from "./movementState";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { startForcedMovement, updateForcedMovements } from "./forcedMovement";
import { issueCompanionDirectCommand, updateDirectCompanionCommandSystem } from "./directCompanionCommands";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { areEntitiesOverlapping, getEntityOverlapDepth } from "./spatialGeometry";
import { isSpecializedMovementPathAvailable } from "./specializedMovementGeometry";
import { createTestGameState } from "./testState";
import { sanitizeGameStateForSave } from "./saveGame";
import { updateEntity, type GameState } from "./state";
import { updateGame } from "./updateGame";
import { updateEnemyAISystem } from "./enemyAISystem";
import { updateFollowSystem } from "./followSystem";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { BARRACK_DEFINITIONS, createBarrackEntity } from "./barrackDefinitions";
import { planStructureRebuildClearance } from "./structureRebuildClearance";
import type { GameEntity, Position } from "./types";

afterEach(() => vi.restoreAllMocks());

function fixture(others: GameEntity[] = []) {
  const actor = createCompanion("actor", { x: 5, y: 5 }, "actor", "fighter");
  return { actor, state: createTestGameState({ entities: Object.fromEntries([actor, ...others].map(entity => [entity.id, entity])),
    partyLeaderId: actor.id, simulationTimeMs: 1000,
    map: { columns: 30, rows: 30, walls: [], teleports: [], healingFountains: [], displayName: "Avoidance", debugName: "avoidance" } }) };
}
function frame(state: GameState): GameState {
  return clearFrameMovementPlanning({ ...state, simulationFrame: (state.simulationFrame ?? 0) + 1, simulationTimeMs: (state.simulationTimeMs ?? 0) + 100 });
}
function steer(state: GameState, preferred: Position = { x: 5.8, y: 5 }, canUse: (position: Position) => boolean = () => true) {
  return planLocalAvoidance(state, state.entities.actor, createNormalMovementRequest(state, state.entities.actor, { x: 15, y: 5 }),
    preferred, 0.8, { canUse, ignoresBody: () => false, canTransit: () => false });
}
function publications() {
  const events: { id: string; frame: number; source: string }[] = [];
  const normal = authority.commitNormalMovementPosition, specialized = authority.commitSpecializedMovementPosition;
  vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((state, actor) => {
    const next = normal(state, actor);
    if (next.entities[actor.id].position !== state.entities[actor.id].position) events.push({ id: actor.id, frame: state.simulationFrame ?? 0, source: "normal" });
    return next;
  });
  vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((state, id, position, source, transactionId) => {
    const next = specialized(state, id, position, source, transactionId);
    if (next.outcome === "moved") events.push({ id, frame: state.simulationFrame ?? 0, source });
    return next;
  });
  return events;
}

describe("pre-commit local avoidance", () => {
  it.each([false, true])("only formation walking steers a terrain-constrained preferred step without nearby bodies (%s)", formation => {
    const { actor, state } = fixture();
    const destination = { x: 15, y: 5 }, preferred = { x: 5.8, y: 5 };
    const request = createNormalMovementRequest(state, actor, destination, formation ? {
      travelFormationGoal: { position: destination, expectedPosition: destination, mode: "normal", settled: false },
    } : {});
    const result = planLocalAvoidance(state, actor, request, preferred, 0.8, {
      canUse: position => position.y < 4.9, ignoresBody: () => false, canTransit: () => false,
    });
    if (formation) {
      expect(result.position).not.toBeNull();
      expect(result.position!.y).toBeLessThan(4.9);
      expect(result.crowded).toBe(true);
    } else expect(result).toEqual({ position: preferred, crowded: false });
    expect(state.reservedPositionsByEntityId).toBeUndefined();
  });
  it("accumulates every nearby body with deterministic neighbor/candidate ties", () => {
    const first = createEnemy("first", { x: 7, y: 5 }, "passive", { combatBodyRadius: 0.7 });
    const second = createEnemy("second", { x: 5.8, y: 7.2 }, "passive", { combatBodyRadius: 0.7 });
    const a = steer(fixture([first, second]).state), b = steer(fixture([second, first]).state);
    expect(a).toEqual(b);
    expect(a.crowded).toBe(true);
    expect(a.position).not.toBeNull();
    const { actor } = fixture();
    for (const other of [first, second]) expect(areEntitiesOverlapping(actor, other, a.position!)).toBe(false);
    expect(Math.hypot(a.position!.x - actor.position.x, a.position!.y - actor.position.y)).toBeLessThanOrEqual(0.801);
  });

  it("uses stable ID directions for coincident actors and holds when there is no safe progress", () => {
    const { state } = fixture([createEnemy("enemy", { x: 5, y: 5 })]);
    expect(steer(state)).toEqual(steer({ ...state, entities: Object.fromEntries(Object.entries(state.entities).reverse()) }));
    expect(steer(state, { x: 5.8, y: 5 }, () => false)).toMatchObject({ crowded: true, position: null });
  });

  it("keeps a working passing side and expires hysteresis after an interruption", () => {
    const { state } = fixture([createEnemy("enemy", { x: 7, y: 5 })]);
    const first = steer(state);
    expect(first.memory).toBeDefined();
    const remembered = { ...state, localAvoidanceByEntityId: { actor: first.memory! } };
    expect(steer(remembered).memory?.side).toBe(first.memory?.side);
    expect(clearFrameMovementPlanning({ ...remembered, simulationTimeMs: 2000 }).localAvoidanceByEntityId).toEqual({});
  });

  it("does not exceed the short-step budget or tunnel through hard geometry", () => {
    const { actor, state } = fixture([createEnemy("enemy", { x: 6.6, y: 5 })]);
    const next = moveEntityToPositionIfUnoccupied(state, actor, { x: 5.1, y: 5 });
    expect(Math.hypot(next.entities.actor.position.x - actor.position.x, next.entities.actor.position.y - actor.position.y)).toBeLessThanOrEqual(0.101);
    const walls = { ...state, map: { ...state.map!, walls: [{ x: 6, y: 4 }] } };
    const result = steer(walls);
    if (result.position) expect(isSpecializedMovementPathAvailable(walls, actor, actor.position, result.position)).toBe(true);
  });

  it.each(["attack", "gather", "follow", "resurrection"] as const)("keeps an explicit %s hold fixed without consuming physical movement", source => {
    const { actor, state } = fixture([createEnemy("enemy", { x: 7, y: 5 })]);
    const next = holdEntityMovement(state, actor, source, "intentional hold");
    expect(next.entities.actor.position).toEqual(actor.position);
    expect(getNormalMovementResult(next, actor.id)?.outcome).toBe("held");
    expect(getMovementPositionCommit(next, actor.id)).toBeUndefined();
    expect(next.failedMoveByEntityId?.actor).toBeUndefined();
  });

  it("crowd waits retain the player order, discard speculative bookkeeping, and resume when space opens", () => {
    const blockers = Array.from({ length: 8 }, (_, index) => createEnemy(`blocker-${index}`, {
      x: 5 + Math.cos(index * Math.PI / 4) * 0.9, y: 5 + Math.sin(index * Math.PI / 4) * 0.9,
    }, "passive", { combatBodyRadius: 0.7 }));
    const { actor, state: initial } = fixture(blockers);
    const state = { ...initial, directCompanionCommandsById: { actor: { type: "move" as const, companionId: actor.id, targetPosition: { x: 10, y: 5 }, issuedAt: 1000 } } };
    const command = state.directCompanionCommandsById!.actor;
    const waiting = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 }, { source: "direct" });
    expect(getNormalMovementResult(waiting, actor.id)).toMatchObject({ outcome: "held", reason: "crowd_wait", positionCommitCount: 0 });
    expect(waiting.directCompanionCommandsById?.actor).toBe(command);
    expect(waiting.failedMoveByEntityId?.actor).toBeUndefined();
    expect(waiting.movementFailureMsByEntityId?.actor).toBeUndefined();
    expect(waiting.reservedPositionsByEntityId?.actor).toBeUndefined();
    expect(waiting.followTrailsByEntityId).toBe(state.followTrailsByEntityId);
    expect(waiting.attackSlotCacheByEntityId).toBe(state.attackSlotCacheByEntityId);
    expect(moveEntityTowardPositionIfUnoccupied(waiting, actor, { x: 5, y: 10 }, { source: "direct" })).toBe(waiting);
    const resumed = moveEntityTowardPositionIfUnoccupied(frame({ ...waiting, entities: { actor } }), actor, { x: 10, y: 5 }, { source: "direct" });
    expect(resumed.entities.actor.position.x).toBeGreaterThan(actor.position.x);
  });

  it("finds a legal detour and settles for 30 updates without a late correction", () => {
    const events = publications();
    const obstacle = createEnemy("obstacle", { x: 8, y: 5 }, "passive", { combatBodyRadius: 0.7 });
    let { state } = fixture([obstacle]);
    for (let index = 0; index < 60; index++) {
      state = frame(state);
      const actor = state.entities.actor;
      state = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 13, y: 5 });
      expect(Math.hypot(state.entities.actor.position.x - actor.position.x, state.entities.actor.position.y - actor.position.y))
        .toBeLessThanOrEqual(getMovementStepDistance(actor, 100) + 0.001);
      expect(events.filter(event => event.id === actor.id && event.frame === state.simulationFrame)).toHaveLength(getMovementPositionCommit(state, actor.id) ? 1 : 0);
      expect(state.entities.obstacle.position).toEqual(obstacle.position);
    }
    expect(state.entities.actor.position).toEqual({ x: 13, y: 5 });
    const settled = state.entities.actor.position;
    for (let index = 0; index < 30; index++) {
      state = frame(state);
      state = moveEntityTowardPositionIfUnoccupied(state, state.entities.actor, { x: 13, y: 5 });
      expect(state.entities.actor.position).toEqual(settled);
      expect(getMovementPositionCommit(state, "actor")).toBeUndefined();
    }
  });

  it("keeps bounded path-query work independent of the number of nearby influences", () => {
    const others = Array.from({ length: 20 }, (_, index) => createEnemy(`enemy-${index}`, { x: 10 + index * 0.05, y: 5 }));
    const { actor, state } = fixture(others);
    consumeGamePerformanceMetrics();
    moveEntityTowardPositionIfUnoccupied(state, actor, { x: 15, y: 5 });
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBeLessThanOrEqual(2);
  });

  it("keeps a pending specialized landing reserved even when party pass-through is enabled", () => {
    const friend = createCompanion("friend", { x: 10, y: 5 }, "actor");
    const { actor, state } = fixture([friend]);
    const forced = startForcedMovement(state, friend.id, "missing", { x: -1, y: 0 }, 4, 1000, 1000);
    expect(forced.forcedMovementsByEntityId?.friend).toBeDefined();
    const next = moveEntityToPositionIfUnoccupied(forced, actor, { x: 5.8, y: 5 }, { allowPartyPassThrough: true });
    expect(next.entities.actor.position).not.toEqual({ x: 5.8, y: 5 });
    expect(next.entities.friend.position).toEqual(friend.position);
    expect(forced.forcedMovementsByEntityId?.friend).toEqual(next.forcedMovementsByEntityId?.friend);
  });

  it("allows party transit but never settles a new mover onto an occupied destination", () => {
    const friend = createCompanion("friend", { x: 7, y: 5 }, "actor");
    let { state } = fixture([friend]);
    for (let index = 0; index < 30; index++) {
      state = frame(state);
      state = moveEntityTowardPositionIfUnoccupied(state, state.entities.actor, { x: 7, y: 5 }, { allowPartyPassThrough: true });
      expect(state.entities.actor.position).not.toEqual(friend.position);
      expect(state.entities.friend.position).toEqual(friend.position);
    }
    expect(getNormalMovementResult(state, "actor")?.outcome).toBe("held");
    expect(state.failedMoveByEntityId?.actor).toBeUndefined();
  });

  it("preserves own movement of large enemies and guide NPCs without passively displacing them", () => {
    const boss = createEnemy("boss", { x: 15, y: 15 }, "passive", { combatBodyRadius: 2 });
    const guide = createNpc("guide", { x: 20, y: 20 }, "Guide", "quest_guide");
    let { state } = fixture([boss, guide]);
    state = moveEntityTowardPositionIfUnoccupied(state, boss, { x: 18, y: 15 }, { source: "enemyHome" });
    state = moveEntityTowardPositionIfUnoccupied(state, guide, { x: 23, y: 20 }, { source: "questGuide" });
    expect(state.entities.boss.position.x).toBeGreaterThan(boss.position.x);
    expect(state.entities.guide.position.x).toBeGreaterThan(guide.position.x);
  });

  it("steers an authored Goblin Scout around a companion without replacing quest pressure with aggro", () => {
    const events = publications();
    const companion = createCompanion("companion", { x: 6.55, y: 5 }, "companion");
    const enemy = createEnemy("enemy", { x: 5, y: 5 }, "aggressive", {
      enemyTypeId: "goblin_scout",
      questSpawn: { questId: "hold_the_field_cache", objectiveId: "defend_old_grove_cache",
        targetPosition: { x: 15, y: 5 }, suppressNormalDrops: true },
    });
    let state: GameState = { ...fixture().state, entities: { companion, enemy }, partyLeaderId: companion.id };
    expect(areEntitiesOverlapping(enemy, companion)).toBe(false);
    for (let index = 0; index < 60; index++) {
      const pressureActive = Math.max(Math.abs(state.entities.enemy.position.x - 15), Math.abs(state.entities.enemy.position.y - 5)) > 1;
      state = updateEnemyAISystem(updateOverlapRecoverySystem(frame(state)));
      if (pressureActive) expect(state.entities.enemy).toMatchObject({ currentTargetId: null });
      expect(state.entities.companion.position).toEqual(companion.position);
      expect(areEntitiesOverlapping(state.entities.enemy, companion)).toBe(false);
      expect(events.filter(event => event.id === enemy.id && event.frame === state.simulationFrame).length).toBeLessThanOrEqual(1);
    }
    expect(state.entities.enemy.position.x).toBeGreaterThan(9);
    expect(state.failedMoveByEntityId?.enemy).toBeUndefined();
  });

  it.each(["large enemy", "NPC"])("lets a %s detour on its own request without passively yielding", kind => {
    const events = publications();
    const mover = kind === "large enemy"
      ? createEnemy("mover", { x: 5, y: 5 }, "passive", { combatBodyRadius: 2 })
      : createNpc("mover", { x: 5, y: 5 }, "Guide", "quest_guide");
    const blocker = createCompanion("blocker", { x: kind === "large enemy" ? 8 : 6.9, y: 5 }, "blocker");
    let state: GameState = { ...fixture().state, entities: { mover, blocker }, partyLeaderId: blocker.id };
    state = updateOverlapRecoverySystem(state);
    expect(state.entities.mover.position).toEqual(mover.position);
    expect(areEntitiesOverlapping(mover, blocker)).toBe(false);
    for (let index = 0; index < 90; index++) {
      state = updateOverlapRecoverySystem(frame(state));
      state = moveEntityTowardPositionIfUnoccupied(state, state.entities.mover, { x: 15, y: 5 },
        { source: kind === "large enemy" ? "enemyHome" : "questGuide" });
      expect(areEntitiesOverlapping(state.entities.mover, blocker)).toBe(false);
      expect(state.entities.blocker.position).toEqual(blocker.position);
      expect(events.filter(event => event.id === mover.id && event.frame === state.simulationFrame).length).toBeLessThanOrEqual(1);
    }
    expect(state.entities.mover.position.x).toBeGreaterThan(blocker.position.x + 2);
    expect(events.filter(event => event.source === "overlapRecovery")).toHaveLength(0);
  });

  it.each([
    { position: { x: 5.3, y: 3.2 }, reverse: false },
    { position: { x: 5.3, y: 3.2 }, reverse: true },
    { position: { x: 5.3, y: 3.5 }, reverse: false },
    { position: { x: 5.6, y: 2.3 }, reverse: true },
    { position: { x: 7.7, y: 7.4 }, reverse: false },
    { position: { x: 8, y: 7.7 }, reverse: true },
  ])("does not turn follow transit into a permanent overlap in the game loop (%j)", ({ position, reverse }) => {
    const events = publications();
    const leader = { ...createCompanion("leader", { x: 5, y: 5 }, "leader", "fighter"), partyOrder: 0 };
    const follower = { ...createCompanion("follower", position, "leader", "fighter"),
      state: "follow" as const, currentTargetId: "leader", followTargetId: "leader" };
    let state: GameState = { ...fixture().state, entities: reverse ? { follower, leader } : { leader, follower }, partyLeaderId: leader.id };
    expect(areEntitiesOverlapping(follower, leader)).toBe(false);
    let settled: Position | undefined;
    for (let index = 0; index < 60; index++) {
      state = updateGame(state, { nowMs: 1100 + index * 100, deltaMs: 100, frameNumber: index + 1 });
      expect(areEntitiesOverlapping(state.entities.follower, state.entities.leader)).toBe(false);
      expect(state.entities.leader.position).toEqual(leader.position);
      expect(events.filter(event => event.id === follower.id && event.frame === index + 1).length).toBeLessThanOrEqual(1);
      if (index === 29) settled = state.entities.follower.position;
      if (index >= 30) expect(state.entities.follower.position).toEqual(settled);
    }
    if (Math.max(Math.abs(position.x - 5), Math.abs(position.y - 5)) > 1.5)
      expect(events.some(event => event.id === follower.id && event.source === "normal")).toBe(true);
    expect(events.some(event => event.source === "overlapRecovery")).toBe(false);
  });

  it.each(["follow", "partyTravel"] as const)("checks %s's actual stopping region, not only its soft destination", source => {
    const leader = { ...createCompanion("leader", { x: 5, y: 5 }, "leader", "fighter"), partyOrder: 0 };
    const follower = { ...createCompanion("follower", { x: 5.3, y: 3.2 }, "leader", "fighter"),
      state: "follow" as const, currentTargetId: "leader", followTargetId: "leader" };
    let state: GameState = { ...fixture().state, entities: { leader, follower }, partyLeaderId: leader.id,
      leaderIntent: source === "partyTravel" ? { type: "move" as const, targetId: null, targetPosition: { x: 20, y: 5 } } : null };
    // Hold the leader fixed while exercising each real follower producer.
    for (let index = 0; index < 60; index++) {
      state = frame(state);
      state = source === "follow" ? updateFollowSystem(state) : updatePartyFormationSystem(state, new Set([leader.id]));
      expect(areEntitiesOverlapping(state.entities.follower, state.entities.leader)).toBe(false);
      expect(state.entities.leader.position).toEqual(leader.position);
    }
    expect(Math.max(Math.abs(state.entities.follower.position.x - 5), Math.abs(state.entities.follower.position.y - 5))).toBeLessThanOrEqual(1.5);
    expect(getNormalMovementResult(state, follower.id)?.outcome).toBe("held");
  });

  it.each(["follow", "partyTravel"] as const)("does not accept %s settled holds that violate shared party spacing", source => {
    const leader = createCompanion("leader", { x: 5, y: 5 }, "leader", "fighter", 0);
    const follower = createCompanion("follower", { x: 5, y: 5.8 }, "leader", "fighter");
    const state = { ...fixture().state, entities: { leader, follower }, partyLeaderId: leader.id,
      leaderIntent: source === "partyTravel" ? { type: "move" as const, targetId: null, targetPosition: { x: 20, y: 5 } } : null };
    expect(areEntitiesOverlapping(follower, leader)).toBe(true);
    const next = source === "follow" ? updateFollowSystem(state) : updatePartyFormationSystem(state, new Set([leader.id]));
    expect(getNormalMovementResult(next, follower.id)?.request.mode).toBe("walk");
    expect(getNormalMovementResult(next, follower.id)?.reason).not.toContain("settled");
    expect(next.entities.leader.position).toEqual(leader.position);
  });

  it("keeps a valid soft follow placement stationary without consuming a position commit", () => {
    const leader = createCompanion("leader", { x: 5, y: 5 }, "leader", "fighter", 0);
    const follower = createCompanion("follower", { x: 4.1, y: 5.45 }, "leader", "fighter");
    let state: GameState = { ...fixture().state, entities: { leader, follower }, partyLeaderId: leader.id };
    expect(areEntitiesOverlapping(follower, leader)).toBe(false);
    for (let index = 0; index < 60; index++) {
      state = updateFollowSystem(frame(state));
      expect(state.entities.follower.position).toEqual(follower.position);
      expect(getMovementPositionCommit(state, follower.id)).toBeUndefined();
      expect(getNormalMovementResult(state, follower.id)?.request.reason).toBe("follow settled");
    }
  });

  it.each([false, true])("converges through opposing party transit with actor order reversed=%s", reverse => {
    const events = publications();
    const friend = createCompanion("friend", { x: 9, y: 5 }, "actor");
    let { state } = fixture([friend]);
    for (let index = 0; index < 60; index++) {
      state = frame(state);
      for (const id of reverse ? ["friend", "actor"] : ["actor", "friend"]) {
        state = moveEntityTowardPositionIfUnoccupied(state, state.entities[id], { x: id === "actor" ? 9 : 5, y: 5 }, { allowPartyPassThrough: true });
        expect(events.filter(event => event.id === id && event.frame === state.simulationFrame).length).toBeLessThanOrEqual(1);
      }
      if (index >= 30) {
        expect(state.entities.actor.position).toEqual({ x: 9, y: 5 });
        expect(state.entities.friend.position).toEqual({ x: 5, y: 5 });
      }
    }
  });
});

describe("exceptional recovery lifecycle", () => {
  it("does not enroll normal transit contacts or contacts when unrelated resources respawn", () => {
    const { state } = fixture([createCompanion("friend", { x: 7, y: 5 }, "actor")]);
    let next = updateOverlapRecoverySystem(state);
    next = authority.commitNormalMovementPosition(next, { ...next.entities.actor, position: { x: 7, y: 5 } });
    next = frame(next);
    const position = next.entities.actor.position;
    next = updateOverlapRecoverySystem({ ...next, entities: { ...next.entities, far: createResource("far", { x: 20, y: 20 }) } });
    expect(next.entities.actor.position).toEqual(position);
    expect(next.overlapRecoveryByEntityId?.actor.pending).toBe(false);
    expect(next.overlapRecoveryByEntityId?.friend.pending).toBe(false);
  });

  it.each(["placement", "growth"])("enrolls invalid %s, keeps intent, and never adds a second position publication", change => {
    const events = publications();
    const enemy = createEnemy("enemy", { x: 8, y: 5 }, "passive", { combatBodyRadius: 0.7 });
    const initial = fixture([enemy]).state;
    let state = updateOverlapRecoverySystem(initial);
    state = change === "placement" ? { ...state, entities: { ...state.entities, actor: { ...state.entities.actor, position: { x: 7, y: 5 } } } }
      : { ...state, entities: { ...state.entities, enemy: { ...enemy, combatSizeMultiplier: 3 } } };
    const intent = { type: "move" as const, companionId: "actor", targetPosition: { x: 12, y: 5 }, issuedAt: 0 };
    state = { ...state, directCompanionCommandsById: { actor: intent } };
    for (let index = 0; index < 60; index++) {
      state = frame(state);
      state = updateOverlapRecoverySystem(state);
      state = moveEntityTowardPositionIfUnoccupied(state, state.entities.actor, { x: 12, y: 5 }, { source: "direct" });
      expect(events.filter(event => event.id === "actor" && event.frame === state.simulationFrame).length).toBeLessThanOrEqual(1);
      expect(state.directCompanionCommandsById?.actor).toBe(intent);
    }
    expect(areEntitiesOverlapping(state.entities.actor, state.entities.enemy)).toBe(false);
    expect(state.overlapRecoveryByEntityId?.actor.pending).toBe(false);
  });

  it("does not interfere with a forced trajectory and resumes the latest individual order afterward", () => {
    const events = publications();
    let { state } = fixture([createEnemy("enemy", { x: 20, y: 20 })]);
    state = updateOverlapRecoverySystem(state);
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "actor", targetPosition: { x: 10, y: 5 } }, 1000).state;
    state = startForcedMovement(state, "actor", "enemy", { x: -1, y: 0 }, 2, 250, 1000);
    for (let index = 0; index < 40; index++) {
      state = frame(state);
      state = updateOverlapRecoverySystem(state);
      state = updateForcedMovements(state, new Set(), state.simulationTimeMs!);
      state = updateDirectCompanionCommandSystem(state, new Set(), state.simulationTimeMs!);
      expect(events.filter(event => event.id === "actor" && event.frame === state.simulationFrame).length).toBeLessThanOrEqual(1);
    }
    expect(events.some(event => event.source === "overlapRecovery")).toBe(false);
    expect(state.entities.actor.position.x).toBeGreaterThan(9.7);
    expect(state.forcedMovementsByEntityId?.actor).toBeUndefined();
    expect(getSpecializedMovementOwner(state, "actor")).toBeUndefined();
  });

  it("recovers a new follower without displacing the leader, a large enemy, or an NPC", () => {
    const leader = createCompanion("leader", { x: 8, y: 8 }, "leader");
    const follower = createCompanion("follower", leader.position, "leader");
    const boss = createEnemy("boss", { x: 15, y: 15 }, "passive", { combatBodyRadius: 2 });
    const npc = createNpc("npc", { x: 20, y: 20 }, "NPC", "quest_giver");
    let state = fixture([leader, follower, boss, npc]).state;
    state = { ...state, partyLeaderId: leader.id };
    for (let index = 0; index < 60; index++) state = updateOverlapRecoverySystem(frame(state));
    expect(state.entities.leader.position).toEqual(leader.position);
    expect(state.entities.boss.position).toEqual(boss.position);
    expect(state.entities.npc.position).toEqual(npc.position);
    expect(areEntitiesOverlapping(state.entities.follower, leader)).toBe(false);
  });

  it("produces the same multi-update recovery with reversed entity insertion order", () => {
    const others = [createEnemy("a", { x: 6, y: 5 }, "passive", { combatBodyRadius: 0.7 }),
      createEnemy("b", { x: 5, y: 6 }, "passive", { combatBodyRadius: 0.7 })];
    let left = fixture(others).state, right = { ...left, entities: Object.fromEntries(Object.entries(left.entities).reverse()) };
    for (let index = 0; index < 60; index++) {
      left = updateOverlapRecoverySystem(frame(left)); right = updateOverlapRecoverySystem(frame(right));
      expect(right.entities.actor.position).toEqual(left.entities.actor.position);
    }
    expect(areEntitiesOverlapping(left.entities.actor, left.entities.a)).toBe(false);
    expect(areEntitiesOverlapping(left.entities.actor, left.entities.b)).toBe(false);
  });

  it("cleans transient memory on map change, save restoration, defeat and removal", () => {
    const { actor, state } = fixture();
    state.localAvoidanceByEntityId = { actor: { requestKey: "direct", destination: { x: 10, y: 5 }, direction: { x: 1, y: 0 }, side: 1, lastActiveAtMs: 1000 } };
    state.overlapRecoveryByEntityId = { actor: { bodyKey: getRecoveryBodyKey(actor), position: actor.position, pending: true } };
    for (const next of [clearMapTransitionRuntimeState(state), sanitizeGameStateForSave(state, 1000),
      updateEntity(state, { ...actor, state: "dead", health: 0 }), pruneMissingEntityRuntimeState({ ...state, entities: {} })]) {
      expect(next.localAvoidanceByEntityId?.actor).toBeUndefined();
      expect(next.overlapRecoveryByEntityId?.actor).toBeUndefined();
    }
  });

  it("does not publish late separation after the normal movement commit in the real game loop", () => {
    const events = publications();
    const { actor, state } = fixture();
    let next = issueCompanionDirectCommand(state, { type: "move", companionId: actor.id, targetPosition: { x: 12, y: 5 } }, 1000).state;
    for (let index = 0; index < 40; index++) {
      next = updateGame(next, { nowMs: 1100 + index * 100, deltaMs: 100, frameNumber: index + 1 });
      expect(events.filter(event => event.id === actor.id && event.frame === index + 1).length).toBeLessThanOrEqual(1);
    }
    expect(events.some(event => event.source === "normal")).toBe(true);
    expect(next.entities.actor.position.x).toBeGreaterThan(11.7);
    expect(isCombatPositionAvailable(next, next.entities.actor, next.entities.actor.position)).toBe(true);
  });

  it("keeps hard recovery swept and monotonic at a wall/resource/structure corner", () => {
    const structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "structure", position: { x: 7, y: 7 },
      footprint: { minX: 6.5, maxX: 7.5, minY: 6.5, maxY: 7.5 } };
    const resource = createResource("resource", { x: 6, y: 6 });
    const enemy = createEnemy("enemy", { x: 5.6, y: 5 }, "passive", { combatBodyRadius: 0.7 });
    let { state } = fixture([structure, resource, enemy]);
    state = { ...state, map: { ...state.map!, walls: [{ x: 6, y: 4 }] } };
    let depth = getEntityOverlapDepth(state.entities.actor, enemy);
    for (let index = 0; index < 60; index++) {
      const before = state.entities.actor.position;
      state = updateOverlapRecoverySystem(frame(state));
      const position = state.entities.actor.position;
      expect(getEntityOverlapDepth(state.entities.actor, enemy)).toBeLessThanOrEqual(depth + 0.001);
      depth = getEntityOverlapDepth(state.entities.actor, enemy);
      expect(Math.hypot(position.x - before.x, position.y - before.y)).toBeLessThanOrEqual(0.121);
    }
    expect(isCombatPositionAvailable(state, state.entities.actor, state.entities.actor.position)).toBe(true);
    expect(state.entities.structure.position).toEqual(structure.position);
  });

  it("respects minimum movement radius and encounter edges without changing the actual body", () => {
    const enemy = { ...createEnemy("enemy", { x: 5, y: 5 }, "passive"), minimumMovementBodyRadius: 2,
      movementBounds: { minX: 2, maxX: 12, minY: 2, maxY: 12 } };
    const { state } = fixture([enemy]);
    const before = getRecoveryBodyKey(enemy);
    const next = updateOverlapRecoverySystem(state);
    expect(getRecoveryBodyKey(next.entities.enemy)).toBe(before);
    const position = next.entities.enemy.position;
    expect(position.x - 2.05).toBeGreaterThanOrEqual(2);
    expect(position.y - 2.05).toBeGreaterThanOrEqual(2);
    expect(position.x + 2.05).toBeLessThanOrEqual(12);
    expect(position.y + 2.05).toBeLessThanOrEqual(12);
  });

  it("defers a rebuild when required clearance has pending exclusive recovery", () => {
    const { actor, state } = fixture();
    const pending = { ...state, overlapRecoveryByEntityId: { actor: { position: actor.position, bodyKey: getRecoveryBodyKey(actor), pending: true } } };
    expect(planStructureRebuildClearance(pending, "structure", { minX: 4, maxX: 6, minY: 4, maxY: 6 })).toBeNull();
    expect(pending.entities.actor.position).toEqual(actor.position);
  });
});
