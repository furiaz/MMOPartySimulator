import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createResource } from "./entities";
import { createDebugMap } from "./debugMap";
import { assignFormationSlots, reconcileFormationAssignments } from "./formationAssignments";
import { issuePartyOrder } from "./commands";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { clearFrameMovementPlanning } from "./movementState";
import { bakeNavigationGrid } from "./navigation";
import { beginNormalMovementPhase, getNormalMovementResult } from "./movementAuthority";
import * as authority from "./movementAuthority";
import { endNormalMovementPhase, moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { isSpecializedMovementPathAvailable, isSpecializedMovementPositionAvailable } from "./specializedMovementGeometry";
import { doCollisionBodiesOverlap } from "./spatialGeometry";
import { createTestGameState } from "./testState";
import { getTravelFormationExpectedPosition, moveTravelFormationMember, prepareTravelFormation, updateTravelFormationCohesion } from "./travelFormation";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { getFormationDiagnostics } from "./formationDiagnostics";
import { createSavedGame } from "./saveGame";
import { updateGame } from "./updateGame";
import type { GameState } from "./state";
import type { Companion, FormationPresetId, Position } from "./types";

afterEach(() => vi.restoreAllMocks());

function clock(state: GameState, delta = 100): GameState {
  return clearFrameMovementPlanning({ ...state, simulationFrame: (state.simulationFrame ?? 0) + 1,
    simulationTimeMs: (state.simulationTimeMs ?? 0) + delta, simulationDeltaMs: delta });
}

function corridor(preset: FormationPresetId = "arrow", leaderIndex = 0): GameState {
  const leaderId = `m${leaderIndex}`;
  const members = Array.from({ length: 5 }, (_, i) => createCompanion(`m${i}`, { x: 29.5, y: 30 + i * 3 }, leaderId,
    i === leaderIndex ? "defender" : "fighter", i));
  members[leaderIndex].position = { x: 29.5, y: 30 };
  let behind = 1;
  for (const member of members) if (member.id !== leaderId) member.position = { x: 29.5, y: 30 + behind++ * 3 };
  const map = { columns: 60, rows: 60, walls: Array.from({ length: 48 }, (_, i) => [{ x: 28, y: 8 + i }, { x: 31, y: 8 + i }]).flat(),
    teleports: [], healingFountains: [], debugName: "recovery", displayName: "Recovery" };
  return createTestGameState({ partyLeaderId: leaderId, currentMapId: "hub", simulationTimeMs: 1000,
    entities: Object.fromEntries(members.map(member => [member.id, member])),
    selectedFormationPreset: preset, formationAssignments: assignFormationSlots(members, leaderId, preset), map: { ...map, navigationGrid: bakeNavigationGrid(map) } });
}

/** Reduced terrain and coordinates from the Nightmire recording; no external recording dependency. */
function recordedObstacle(): GameState {
  const coordinates: Position[] = [{ x: 63.0888, y: 23 }, { x: 71.3680596, y: 25.2463764 },
    { x: 68.0541696, y: 22.3987568 }, { x: 65.8018926, y: 22.0625012 }, { x: 69.5565586, y: 22.0408118 }];
  const roles = ["defender", "fighter", "support", "defender", "fighter"] as const;
  const classes = ["aegis", "hunter", "lightbearer", "beast", "runecaster"] as const;
  const members = coordinates.map((point, i) => createCompanion(`m${i}`, point, "m0", roles[i], i, classes[i]));
  const map = { columns: 90, rows: 50, walls: Array.from({ length: 11 }, (_, y) => Array.from({ length: 12 }, (_, x) => ({ x: 59 + x, y: 25 + y }))).flat(),
    teleports: [], healingFountains: [], debugName: "recorded-obstacle", displayName: "Recorded obstacle" };
  const state = createTestGameState({ partyLeaderId: "m0", currentMapId: "hub", simulationTimeMs: 1000,
    entities: Object.fromEntries(members.map(member => [member.id, member])),
    formationAssignments: assignFormationSlots(members, "m0"), map: { ...map, navigationGrid: bakeNavigationGrid(map) } });
  const assignments = state.formationAssignments!;
  assignments.slotsByEntityId = { m0: "arrow:front:0", m1: "arrow:middle:-0.5", m2: "arrow:rear:-0.5", m3: "arrow:middle:0.5", m4: "arrow:rear:0.5" };
  assignments.travel = { leaderId: "m0", facing: { x: -1, y: 0 }, lateralScale: 0.75, trailing: false,
    trail: [{ x: 72, y: 23 }, coordinates[0]], trailOrder: ["m1", "m3", "m2", "m4"], lastLeaderPosition: coordinates[0],
    cohesion: "wait", goalsByEntityId: {} };
  return state;
}

function recoveryRequest(state: GameState, candidates: Position[], key = "recovery-test"): GameState {
  const actor = state.entities.member, anchorPosition = { x: 27, y: 17.25 };
  return moveEntityTowardPositionIfUnoccupied(state, actor, candidates[0], {
    source: "follow", pathProfile: "follow", pathTargetKey: key, pathTargetPosition: anchorPosition,
    allowPartyPassThrough: true, acceptableRadius: 0.35,
    travelFormationGoal: { position: candidates[0], expectedPosition: anchorPosition, mode: "trailing", settled: false,
      recovery: { reason: "blocked_slot", anchorPosition, candidates, resolved: false } },
    isPositionAllowed: position => isSpecializedMovementPathAvailable(state, actor, actor.position, position),
    rejectedPositionOutcome: "held",
  });
}

function dividedMap(): GameState {
  const members = [createCompanion("leader", { x: 27, y: 10 }, "leader", "defender", 0),
    createCompanion("member", { x: 12, y: 15 }, "leader", "fighter", 1)];
  const map = { columns: 40, rows: 30, walls: Array.from({ length: 30 }, (_, y) => ({ x: 20, y })),
    teleports: [], healingFountains: [], debugName: "divided", displayName: "Divided" };
  return prepareTravelFormation(createTestGameState({ partyLeaderId: "leader", currentMapId: "hub", simulationTimeMs: 1000,
    entities: Object.fromEntries(members.map(member => [member.id, member])), formationAssignments: assignFormationSlots(members, "leader"),
    map: { ...map, navigationGrid: bakeNavigationGrid(map) } }));
}

describe("travel formation obstacle recovery", () => {
  it("routes the recorded Hunter around the obstacle while the original blocker remains stationary", () => {
    let state = recordedObstacle();
    const origin = state.entities.m1.position, blocker = state.entities.m3.position;
    const slots = state.formationAssignments!.slotsByEntityId;
    let startedAt: number | undefined;
    for (let i = 0; i < 50; i++) {
      state = moveTravelFormationMember(clock(state), state.entities.m1 as Companion);
      if (state.entities.m1.position !== origin) startedAt ??= i * 100;
      expect(state.entities.m3.position).toBe(blocker);
      expect(isSpecializedMovementPositionAvailable(state, state.entities.m1, state.entities.m1.position)).toBe(true);
      expect(getNormalMovementResult(state, "m1")?.positionCommitCount).toBeLessThanOrEqual(1);
    }
    expect(startedAt).toBeLessThanOrEqual(500);
    const goal = state.formationAssignments!.travel!.goalsByEntityId.m1;
    expect(Math.hypot(state.entities.m1.position.x - goal.position.x, state.entities.m1.position.y - goal.position.y)).toBeLessThanOrEqual(0.6);
    expect(state.entities.m1.position.x).toBeLessThan(69);
    expect(state.formationAssignments!.slotsByEntityId).toBe(slots);
    const diagnostics = getFormationDiagnostics(state).members.find(member => member.entityId === "m1")!;
    expect(diagnostics.acceptedPosition).toEqual(goal.position);
    expect(diagnostics.recoveryReason).toBeDefined();
  });

  it.each(["arrow", "balanced", "side-by-side"] as const)("recovers five followers' short history and resumes ordinary %s travel", preset => {
    let state = prepareTravelFormation(corridor(preset));
    expect(state.formationAssignments!.travel!.trail).toHaveLength(1);
    const starts = Object.fromEntries(Object.entries(state.entities).map(([id, member]) => [id, member.position.y]));
    const slots = state.formationAssignments!.slotsByEntityId;
    state = issuePartyOrder(state, { type: "move", targetPosition: { x: 29.5, y: 12 } });
    const publications = new Set<string>();
    const commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((snapshot, actor) => {
      const next = commit(snapshot, actor);
      if (next.entities[actor.id].position !== snapshot.entities[actor.id].position) {
        const key = `${snapshot.simulationFrame}:${actor.id}`;
        expect(publications.has(key)).toBe(false); publications.add(key);
      }
      return next;
    });
    for (let i = 0; i < 60; i++) {
      state = updateGame(state, { nowMs: (state.simulationTimeMs ?? 0) + 100, deltaMs: 100, frameNumber: i + 1 });
      for (const actor of Object.values(state.entities)) expect(isSpecializedMovementPositionAvailable(state, actor, actor.position)).toBe(true);
    }
    expect(state.entities.m0.position.y).toBeLessThan(25);
    for (const actor of Object.values(state.entities)) expect(actor.position.y).toBeLessThan(starts[actor.id]);
    expect(state.formationAssignments!.slotsByEntityId).toBe(slots);
  });

  it("uses distinct provisional anchors with a rear-slot leader without inventing trail history", () => {
    let state = prepareTravelFormation(corridor("arrow", 4));
    const trail = state.formationAssignments!.travel!.trail;
    for (let i = 0; i < 20; i++) {
      state = clock(state);
      for (const id of ["m0", "m1", "m2", "m3"]) state = moveTravelFormationMember(state, state.entities[id] as Companion);
    }
    const anchors = ["m0", "m1", "m2", "m3"].map(id => getTravelFormationExpectedPosition(state, state.entities[id] as Companion)!);
    expect(new Set(anchors.map(point => `${point.x},${point.y}`)).size).toBe(4);
    expect(state.formationAssignments!.travel!.trail).toEqual(trail);
    expect(updateTravelFormationCohesion(state)?.canMoveLeader).toBe(true);
    for (const [id, goal] of Object.entries(state.formationAssignments!.travel!.goalsByEntityId)) {
      expect(goal.recovery?.candidates.length ?? 0).toBeLessThanOrEqual(32);
      for (const other of Object.values(state.entities)) if (other.id !== id) {
        expect(doCollisionBodiesOverlap(state.entities[id], state.entities[id].position, other, other.position, 0.05)).toBe(false);
      }
    }
  });

  it("does not search or publish recovery for a losing formation request", () => {
    let state = beginNormalMovementPhase(recordedObstacle()); consumeGamePerformanceMetrics();
    state = moveTravelFormationMember(state, state.entities.m1 as Companion);
    state = moveEntityTowardPositionIfUnoccupied(state, state.entities.m1, { x: 73, y: 23 }, { source: "compatibility" });
    state = endNormalMovementPhase(state);
    expect(getNormalMovementResult(state, "m1")?.request.source).toBe("compatibility");
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("publishes the reachable continuous endpoint rather than an unreachable preferred candidate", () => {
    const selected = { x: 16.25, y: 15.25 };
    let state = dividedMap();
    state.map = { ...state.map!, walls: [...state.map!.walls, ...Array.from({ length: 5 }, (_, y) => ({ x: 14, y: 13 + y }))] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    consumeGamePerformanceMetrics();
    state = recoveryRequest(state, [{ x: 27, y: 17.25 }, selected]);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    const result = getNormalMovementResult(state, "member")!;
    expect(result.request.destination).toEqual(selected);
    expect(result.request.travelFormationGoal).toMatchObject({ position: selected, recovery: { resolved: true } });
    expect(state.movementPathsByEntityId?.member.resolvedGoalPosition).toEqual(selected);
    expect(state.formationAssignments!.travel!.goalsByEntityId.member.position).toEqual(selected);
  });

  it("shares one search budget across failed multi-goal requests, replacements and large deltas", () => {
    const candidates = [{ x: 27, y: 17.25 }, { x: 28.5, y: 18.5 }];
    consumeGamePerformanceMetrics();
    let state = recoveryRequest(dividedMap(), candidates);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    const origin = state.entities.member.position;
    expect(getNormalMovementResult(state, "member")).toMatchObject({ outcome: "held", positionCommitCount: 0 });
    expect(state.formationAssignments!.travel!.goalsByEntityId.member.settled).toBe(false);
    for (let i = 0; i < 24; i++) {
      state = recoveryRequest(clock(state, 20), [...candidates].reverse(), `replacement-${i}`);
      expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
      expect(state.entities.member.position).toEqual(origin);
    }
    state = recoveryRequest(clock(state, 20), candidates);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    state = recoveryRequest(clock(state, 3500), candidates);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    expect(state.entities.member.position).toEqual(origin);
    state.map = { ...state.map!, walls: [] }; state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = recoveryRequest(clock(state, 20), candidates);
    expect(state.entities.member.position).not.toEqual(origin);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it.each(["terrain", "resources"] as const)("refreshes an accepted recovery route blocked mid-travel by %s", blocker => {
    const destination = { x: 20.125, y: 15.25 };
    let state = dividedMap();
    state.entities.leader = { ...state.entities.leader, position: { x: destination.x, y: destination.y - 2.5 } };
    state.map = { ...state.map!, walls: [11, 19].flatMap(y => Array.from({ length: 8 }, (_, i) => ({ x: 10 + i, y }))) };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state.formationAssignments!.travel = undefined;
    state = prepareTravelFormation(state);
    const barrier = Array.from({ length: 9 }, (_, i) => ({ x: 17, y: 11 + i }));
    if (blocker === "resources") {
      for (const [i, position] of barrier.entries()) state.entities[`resource-${i}`] = createResource(`resource-${i}`, position, { quantity: 0 });
    }
    const slots = state.formationAssignments!.slotsByEntityId;
    const key = "formation:leader:arrow:rear:0:recovery";
    // A previous formation search spent this window; the now-clear direct route needs no search.
    state.formationPathSearchesByEntityId = { member: { lastQueryAtMs: 1000, failed: true } };
    const actor = state.entities.member;
    state = moveEntityTowardPositionIfUnoccupied(state, actor, destination, {
      source: "follow", pathProfile: "follow", pathTargetKey: key, pathTargetPosition: destination,
      allowPartyPassThrough: true, acceptableRadius: 0.35,
      travelFormationGoal: { position: destination, expectedPosition: destination, mode: "trailing", settled: false,
        recovery: { reason: "path_failed", anchorPosition: destination, candidates: [destination], resolved: false } },
      isPositionAllowed: position => isSpecializedMovementPathAvailable(state, actor, actor.position, position),
      rejectedPositionOutcome: "held",
    });
    expect(state.movementPathsByEntityId?.member.waypoints).toEqual([destination]);
    expect(state.formationAssignments!.travel!.goalsByEntityId.member.recovery?.resolved).toBe(true);
    if (blocker === "terrain") {
      state.map = { ...state.map!, walls: [...state.map!.walls, ...barrier] };
      state.map.navigationGrid = bakeNavigationGrid(state.map);
    } else {
      for (const [i, position] of barrier.entries()) state.entities[`resource-${i}`] = createResource(`resource-${i}`, position);
    }
    consumeGamePerformanceMetrics();
    const queryTimes = [1000];
    let detoured = false;
    for (let i = 0; i < 150; i++) {
      const previous = state.entities.member.position;
      state = moveTravelFormationMember(clock(state), state.entities.member as Companion);
      const queries = consumeGamePerformanceMetrics().navigationPathQueries;
      expect(queries).toBeLessThanOrEqual(1);
      if (queries) {
        expect(state.simulationTimeMs! - queryTimes.at(-1)!).toBeGreaterThanOrEqual(500);
        queryTimes.push(state.simulationTimeMs!);
        expect(state.movementPathsByEntityId?.member.resolvedGoalPosition).toEqual(destination);
      }
      detoured ||= state.entities.member.position.x < 9;
      expect(isSpecializedMovementPathAvailable(state, state.entities.member, previous, state.entities.member.position)).toBe(true);
      expect(getNormalMovementResult(state, "member")?.positionCommitCount).toBeLessThanOrEqual(1);
    }
    expect(queryTimes[1]).toBe(1500);
    expect(detoured).toBe(true);
    expect(state.formationAssignments!.slotsByEntityId).toBe(slots);
    expect(state.formationAssignments!.travel!.goalsByEntityId.member).toMatchObject({ position: destination, settled: true });
    expect(state.formationAssignments!.travel!.goalsByEntityId.member.recovery).toBeUndefined();
    expect(Math.hypot(state.entities.member.position.x - destination.x, state.entities.member.position.y - destination.y)).toBeLessThanOrEqual(0.6);
  });

  it("waits for sustained passage clearance and then recovers the selected shape", () => {
    let state = corridor();
    for (let i = 0; i < 20; i++) {
      state = clock(state);
      for (const id of ["m1", "m2", "m3", "m4"]) state = moveTravelFormationMember(state, state.entities[id] as Companion);
    }
    state.map = { ...state.map!, walls: [] }; state.map.navigationGrid = bakeNavigationGrid(state.map);
    for (let i = 0; i < 5; i++) {
      state = clock(state);
      for (const id of ["m1", "m2", "m3", "m4"]) state = moveTravelFormationMember(state, state.entities[id] as Companion);
      expect(state.formationAssignments!.travel!.trailing).toBe(true);
    }
    for (let i = 0; i < 50; i++) {
      state = clock(state);
      for (const id of ["m1", "m2", "m3", "m4"]) state = moveTravelFormationMember(state, state.entities[id] as Companion);
    }
    expect(state.formationAssignments!.travel!.trailing).toBe(false);
    expect(state.formationAssignments!.travel!.lateralScale).toBe(1);
    for (const goal of Object.values(state.formationAssignments!.travel!.goalsByEntityId)) expect(goal.recovery).toBeUndefined();
  });

  it("rejoins around the hub passage corner after the leader stops beyond it", () => {
    const members = Array.from({ length: 5 }, (_, i) => createCompanion(`m${i}`,
      { x: 12 + (i ? (i % 2 ? -1.25 : 1.25) : 0), y: 51 + Math.ceil(i / 2) * 2.5 }, "m0", i ? "fighter" : "defender", i));
    let state = createTestGameState({ partyLeaderId: "m0", currentMapId: "hub", simulationTimeMs: 1000,
      entities: Object.fromEntries(members.map(member => [member.id, member])),
      formationAssignments: assignFormationSlots(members, "m0"), map: createDebugMap("hub") });
    state = issuePartyOrder(state, { type: "move", targetPosition: { x: 39, y: 36 } });
    for (let i = 0; i < 150; i++) state = updateGame(state,
      { nowMs: (state.simulationTimeMs ?? 0) + 100, deltaMs: 100, frameNumber: i + 1 });
    for (const member of Object.values(state.entities)) expect(member.position.x).toBeGreaterThan(32);
    for (const [id, goal] of Object.entries(state.formationAssignments!.travel!.goalsByEntityId)) {
      expect(goal.recovery).toBeUndefined();
      expect(Math.hypot(state.entities[id].position.x - goal.position.x, state.entities[id].position.y - goal.position.y)).toBeLessThanOrEqual(0.6);
    }
  });

  it("drops recovery on command replacement, formation changes, leader changes and map/save cleanup", () => {
    let state = recordedObstacle();
    state = moveTravelFormationMember(state, state.entities.m1 as Companion);
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1.recovery).toBeDefined();
    const direct = issueCompanionDirectCommand(state, { type: "move", companionId: "m1", targetPosition: { x: 74, y: 23 } }, 1100).state;
    expect(direct.formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
    const dead = clock({ ...state, entities: { ...state.entities, m1: { ...state.entities.m1 as Companion, state: "dead", health: 0 } } });
    expect(dead.formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
    const { m1: removed, ...entities } = state.entities; void removed;
    expect(reconcileFormationAssignments({ ...state, entities }).formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
    state = reconcileFormationAssignments({ ...state, selectedFormationPreset: "balanced" });
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1?.recovery).toBeUndefined();
    state = prepareTravelFormation(clock(reconcileFormationAssignments({ ...state, partyLeaderId: "m4" })));
    expect(state.formationAssignments!.travel!.goalsByEntityId).toEqual({});
    expect(clearMapTransitionRuntimeState(state).formationAssignments).toBeUndefined();
    expect(createSavedGame(state, 2000).state.formationAssignments).toBeUndefined();
  });
});
