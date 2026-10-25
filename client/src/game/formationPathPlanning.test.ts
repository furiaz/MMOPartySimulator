import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { assignFormationSlots } from "./formationAssignments";
import { createTestGameState } from "./testState";
import { bakeNavigationGrid } from "./navigation";
import { updateGame } from "./updateGame";
import { clearFrameMovementPlanning } from "./movementState";
import { endNormalMovementPhase, moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { beginNormalMovementPhase, getNormalMovementResult } from "./movementAuthority";
import { isSpecializedMovementPathAvailable } from "./specializedMovementGeometry";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { createSavedGame, restoreGameStateFromSave } from "./saveGame";
import * as authority from "./movementAuthority";
import type { GameState } from "./state";
import type { Position } from "./types";

afterEach(() => vi.restoreAllMocks());

function fixture(): GameState {
  const members = [createCompanion("leader", { x: 35, y: 30 }, "leader", "support", 0),
    { ...createCompanion("member", { x: 30.88, y: 30 }, "leader", "fighter", 1), state: "follow" as const, currentTargetId: "leader" }];
  const state = createTestGameState({ partyLeaderId: "leader", selectedFormationPreset: "balanced", currentMapId: "hub",
    simulationFrame: 1, simulationTimeMs: 1000, simulationDeltaMs: 20,
    formationAssignments: assignFormationSlots(members, "leader", "balanced"),
    entities: Object.fromEntries(members.map(member => [member.id, member])),
    map: { columns: 70, rows: 70, walls: Array.from({ length: 70 }, (_, y) => ({ x: 32, y })), teleports: [], healingFountains: [], displayName: "Formation", debugName: "formation" } });
  state.map!.navigationGrid = bakeNavigationGrid(state.map!);
  return state;
}

function frame(state: GameState, timeMs: number): GameState {
  return clearFrameMovementPlanning({ ...state, simulationFrame: (state.simulationFrame ?? 0) + 1,
    simulationDeltaMs: 20, simulationTimeMs: timeMs });
}

function request(state: GameState, destination: Position = { x: 37.5, y: 30 }, key = "formation:leader:balanced:neutral:0.5:shape") {
  const actor = state.entities.member;
  return moveEntityTowardPositionIfUnoccupied(state, actor, destination, { source: "follow", pathProfile: "follow",
    allowPartyPassThrough: true, pathTargetKey: key, pathTargetPosition: destination,
    travelFormationGoal: { position: destination, expectedPosition: destination, mode: "normal", settled: false },
    isSettlingPosition: () => true,
    isPositionAllowed: position => isSpecializedMovementPathAvailable(state, actor, actor.position, position), rejectedPositionOutcome: "held" });
}

describe("bounded formation path planning", () => {
  it("holds behind a hard wall for 50 updates, then resumes without a second position publication", () => {
    let state = fixture();
    const origin = state.entities.member.position, publications = new Map<string, number>();
    const commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((snapshot, actor) => {
      const next = commit(snapshot, actor);
      if (next.entities[actor.id].position !== snapshot.entities[actor.id].position) {
        const key = `${snapshot.simulationFrame}:${actor.id}`;
        publications.set(key, (publications.get(key) ?? 0) + 1);
      }
      return next;
    });
    consumeGamePerformanceMetrics();
    for (let index = 0; index < 50; index++) {
      state = updateGame(state, { frameNumber: index + 2, nowMs: 1020 + index * 20, deltaMs: 20 });
      expect(state.entities.member.position).toEqual(origin);
      expect(getNormalMovementResult(state, "member")).toMatchObject({ outcome: "held", reason: "constraint", positionCommitCount: 0 });
      expect(state.failedMoveByEntityId?.member).toBeUndefined();
      expect(state.targetApproachesByEntityId?.member).toMatchObject({ noProgressMs: 0, failedChecks: 0, blockerMs: 0 });
      expect(state.targetApproachesByEntityId?.member?.hardUnreachable).toBeUndefined();
    }
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(2);
    state.map = { ...state.map!, walls: [] }; state.map.navigationGrid = bakeNavigationGrid(state.map);
    for (let index = 0; index < 200; index++) state = updateGame(state,
      { frameNumber: index + 52, nowMs: 2020 + index * 20, deltaMs: 20 });
    expect(state.entities.member.position.x).toBeGreaterThan(36);
    expect(Math.max(...publications.values())).toBe(1);
  });

  it("shares exact retry deadlines across changed requests and large deltas", () => {
    let state = fixture(); consumeGamePerformanceMetrics();
    state = request(state);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    expect(state.formationPathSearchesByEntityId?.member).toMatchObject({ lastQueryAtMs: 1000, failed: true });
    state = request(frame(state, 1499), { x: 37.6, y: 30 }, "replacement");
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(state.formationPathSearchesByEntityId?.member).toMatchObject({ lastQueryAtMs: 1000, failed: false });
    state = request(frame(state, 1500), { x: 37.7, y: 30 }, "replacement");
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    expect(request(state)).toBe(state);
    state = request({ ...frame(state, 5000), simulationDeltaMs: 3500 });
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    expect(state.formationPathSearchesByEntityId?.member?.lastQueryAtMs).toBe(5000);
  });

  it("does not erase search timing after steering succeeds or a path refresh is requested", () => {
    let state = fixture();
    state.map = { ...state.map!, walls: [28, 29, 30, 31, 32].map(y => ({ x: 32, y })) };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    consumeGamePerformanceMetrics(); state = request(state);
    expect(getNormalMovementResult(state, "member")?.outcome).toBe("moved");
    expect(state.formationPathSearchesByEntityId?.member).toMatchObject({ lastQueryAtMs: 1000, failed: false });
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    state = request(frame(state, 1100), { x: 37.5, y: 30.1 }, "changed-slot");
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    state = request(frame(state, 1500), { x: 37.5, y: 30.2 }, "changed-slot");
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBeLessThanOrEqual(1);
    expect(state.formationPathSearchesByEntityId?.member?.lastQueryAtMs).toBe(1500);
  });

  it("permits newly legal direct progress before retry expiry", () => {
    let state = request(fixture()); consumeGamePerformanceMetrics();
    state.map = { ...state.map!, walls: [] }; state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = request(frame(state, 1100));
    expect(getNormalMovementResult(state, "member")?.outcome).toBe("moved");
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(state.formationPathSearchesByEntityId?.member?.lastQueryAtMs).toBe(1000);
  });

  it("shares the same query interval with cached-path refreshes", () => {
    let state = fixture();
    state.map = { ...state.map!, walls: [28, 29, 30, 31, 32].map(y => ({ x: 32, y })) };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = request(state);
    expect(state.movementPathsByEntityId?.member).toBeDefined();
    state.movementPathsByEntityId!.member = { ...state.movementPathsByEntityId!.member, lastRequestedAtMs: 0, targetPosition: { x: 37.5, y: 28 } };
    consumeGamePerformanceMetrics();
    state = request(frame(state, 1100));
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(getNormalMovementResult(state, "member")?.outcome).toBe("moved");
    state = request(frame(state, 1500));
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(1);
    expect(state.formationPathSearchesByEntityId?.member?.lastQueryAtMs).toBe(1500);
  });

  it("preserves genuine crowd-blocker evidence", () => {
    let state = fixture(); state.map = { ...state.map!, walls: [] }; state.map.navigationGrid = bakeNavigationGrid(state.map);
    state.entities.enemy = { ...createEnemy("enemy", { x: 31.6, y: 30 }, "aggressive"), state: "attack", currentTargetId: "member" };
    state = request(state);
    expect(getNormalMovementResult(state, "member")?.blockingEnemyIds).toContain("enemy");
  });

  it("does not spend a query or change retry metadata for losing requests", () => {
    let state = beginNormalMovementPhase(fixture()); consumeGamePerformanceMetrics();
    state = request(state);
    state = moveEntityTowardPositionIfUnoccupied(state, state.entities.member, { x: 29, y: 30 }, { source: "compatibility" });
    state = endNormalMovementPhase(state);
    expect(getNormalMovementResult(state, "member")?.request.source).toBe("compatibility");
    expect(state.formationPathSearchesByEntityId?.member).toBeUndefined();
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("invalidates replaced command context while retaining the spent query budget", () => {
    let state = request(fixture()); const previous = state.formationPathSearchesByEntityId!.member;
    const finalized = state.normalMovementResultsByEntityId;
    const result = issueCompanionDirectCommand(state, { type: "move", companionId: "member", targetPosition: { x: 29, y: 30 } }, 1100);
    expect(result.code).toBe("success"); state = result.state;
    expect(state.formationPathSearchesByEntityId?.member).toEqual({ lastQueryAtMs: previous.lastQueryAtMs, failed: false, requestKey: undefined });
    expect(state.normalMovementResultsByEntityId).toBe(finalized);
    const position = state.entities.member.position;
    state = updateGame(state, { frameNumber: 2, nowMs: 1120, deltaMs: 20 });
    expect(getNormalMovementResult(state, "member")?.request.source).toBe("direct");
    expect(state.entities.member.position).not.toEqual(position);
    expect(state.formationPathSearchesByEntityId?.member?.lastQueryAtMs).toBe(previous.lastQueryAtMs);
  });

  it("discards search runtime on removal, defeat, map cleanup, and save/restore", () => {
    const state = request(fixture());
    const entities = { ...state.entities }; delete entities.member;
    expect(pruneMissingEntityRuntimeState({ ...state, entities }).formationPathSearchesByEntityId?.member).toBeUndefined();
    expect(clearFrameMovementPlanning({ ...state, entities: { ...state.entities, member: { ...state.entities.member, state: "dead" } } }).formationPathSearchesByEntityId?.member).toBeUndefined();
    expect(clearMapTransitionRuntimeState(state).formationPathSearchesByEntityId).toBeUndefined();
    const save = createSavedGame(state, 2000);
    expect(save.state.formationPathSearchesByEntityId).toBeUndefined();
    const forged = JSON.parse(JSON.stringify(save)); forged.state.formationPathSearchesByEntityId = { member: "malformed" };
    const restored = restoreGameStateFromSave(forged);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state.formationPathSearchesByEntityId).toBeUndefined();
  });
});
