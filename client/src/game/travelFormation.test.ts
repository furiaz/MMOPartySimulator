import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { assignFormationSlots, reconcileFormationAssignments } from "./formationAssignments";
import { transformFormationSlots } from "./formationTemplates";
import * as authority from "./movementAuthority";
import * as movement from "./movementPlanning";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { issuePartyOrder } from "./commands";
import { recordDebugTelemetryTick, startDebugTelemetryRecording } from "./debugTelemetry";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { clearFrameMovementPlanning } from "./movementState";
import { createSavedGame } from "./saveGame";
import { updateFollowSystem } from "./followSystem";
import { updateDefendSystem } from "./defendSystem";
import { isSpecializedMovementPositionAvailable } from "./specializedMovementGeometry";
import { doCollisionBodiesOverlap } from "./spatialGeometry";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import { isTravelFormationMember, moveTravelFormationMember, prepareTravelFormation, rotateTravelFacing, sampleTravelTrail, updateTravelFormationCohesion, usesTravelFormation } from "./travelFormation";
import type { GameState } from "./state";
import type { Companion, FormationPresetId, PartyMemberRole } from "./types";

afterEach(() => vi.restoreAllMocks());
const presets: FormationPresetId[] = ["arrow", "balanced", "side-by-side"];
function party(size = 5, leaderIndex = 0, preset: FormationPresetId = "arrow"): GameState {
  const roles: PartyMemberRole[] = ["defender", "fighter", "fighter", "support", "gatherer"];
  const members = roles.slice(0, size).map((role, i) => createCompanion(`m${i}`, { x: 30 + i * 2, y: 30 }, `m${leaderIndex}`, role, i));
  return createTestGameState({ partyLeaderId: `m${leaderIndex}`, currentMapId: "hub",
    map: { columns: 60, rows: 60, walls: [], teleports: [], healingFountains: [], debugName: "formation", displayName: "Formation" },
    entities: Object.fromEntries(members.map(member => [member.id, member])),
    formationAssignments: assignFormationSlots(members, `m${leaderIndex}`, preset), simulationTimeMs: 1000 });
}
function frame(state: GameState): GameState {
  return { ...state, simulationTimeMs: (state.simulationTimeMs ?? 0) + 100, simulationFrame: (state.simulationFrame ?? 0) + 1 };
}
function step(state: GameState): GameState {
  return updateGame(state, { nowMs: (state.simulationTimeMs ?? 0) + 100, deltaMs: 100, frameNumber: (state.simulationFrame ?? 0) + 1 });
}
function atSlots(state: GameState, facing = { x: 0, y: -1 }): GameState {
  const positions = transformFormationSlots(state.formationAssignments!, state.entities[state.partyLeaderId] as Companion, facing);
  return { ...state, entities: Object.fromEntries(Object.entries(state.entities).map(([id, actor]) => [id, { ...actor, position: positions[id] }])) };
}

describe("adaptive travel geometry", () => {
  it.each(presets)("holds all sizes and leader depths at their %s slots", preset => {
    for (let size = 1; size <= 5; size++) for (let leader = 0; leader < size; leader++) {
      let state = prepareTravelFormation(atSlots(party(size, leader, preset)));
      const points = Object.fromEntries(Object.entries(state.entities).map(([id, actor]) => [id, actor.position]));
      for (let i = 0; i < 30; i++) state = updateFollowSystem(frame(state));
      expect(Object.fromEntries(Object.entries(state.entities).map(([id, actor]) => [id, actor.position]))).toEqual(points);
      expect(state.formationAssignments!.travel!.lateralScale).toBe(1);
    }
  });

  it("uses shortest arcs, clockwise reversals, and a deterministic angular speed cap", () => {
    const first = rotateTravelFacing({ x: 0, y: -1 }, { x: 0, y: 1 }, 0.1);
    expect(first.x).toBeCloseTo(Math.sin(Math.PI / 5));
    expect(first.y).toBeCloseTo(-Math.cos(Math.PI / 5));
    expect(rotateTravelFacing(first, { x: 0, y: 0 }, 1)).toBe(first);
    const diagonal = rotateTravelFacing({ x: 0, y: -1 }, { x: 1, y: -1 }, 1);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2);
    expect(diagonal.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it("samples actual committed walking once, never extrapolates, and bounds the distance trail", () => {
    let state = prepareTravelFormation(party(2));
    for (let i = 0; i < 200; i++) {
      state = frame(state);
      const actor = state.entities.m0;
      const destination = { x: actor.position.x + 0.2, y: actor.position.y };
      const request = authority.createNormalMovementRequest(state, actor, destination, { source: "follow" });
      state = authority.commitNormalMovementPosition(state, { ...actor, position: destination });
      state = authority.finishNormalMovement(state, request, "moved", actor.position, destination);
      state = prepareTravelFormation(state);
      expect(prepareTravelFormation(state)).toBe(state);
      expect(state.formationAssignments!.travel!.lastLeaderPosition).toEqual(state.entities.m0.position);
    }
    const runtime = state.formationAssignments!.travel!;
    expect(runtime.trail.length).toBeLessThanOrEqual(256);
    expect(sampleTravelTrail(runtime.trail, 32.01)).toBeUndefined();
    expect(sampleTravelTrail(runtime.trail, 2.5)!.x).toBeCloseTo(state.entities.m0.position.x - 2.5);
    expect(state.followTrailsByEntityId?.m0.length ?? 0).toBeLessThanOrEqual(12);
  });

  it("breaks history across displacement and leader changes while retaining facing", () => {
    let state = prepareTravelFormation(party(3));
    const oldFacing = state.formationAssignments!.travel!.facing;
    state = prepareTravelFormation(frame({ ...state, entities: { ...state.entities, m0: { ...state.entities.m0, position: { x: 60, y: 60 } } } }));
    expect(state.formationAssignments!.travel!.trail).toEqual([{ x: 60, y: 60 }]);
    state = reconcileFormationAssignments({ ...state, partyLeaderId: "m2" });
    state = prepareTravelFormation(frame(state));
    expect(state.formationAssignments!.travel!.trail).toEqual([state.entities.m2.position]);
    expect(state.formationAssignments!.travel!.facing).toEqual(oldFacing);
  });

  it("compresses for hard geometry, keeps row spacing, and restores width gradually", () => {
    let state = atSlots(party(3));
    // Two parallel walls leave a 2.9-unit corridor: pairs need lateral compression.
    state = { ...state, map: { ...state.map!, walls: Array.from({ length: 15 }, (_, i) => [{ x: 28, y: 24 + i }, { x: 32, y: 24 + i }]).flat() } };
    state = prepareTravelFormation(state);
    expect(state.formationAssignments!.travel!.lateralScale).toBeLessThan(1);
    const narrow = state.formationAssignments!.travel!.lateralScale;
    state = { ...state, map: { ...state.map!, walls: [] } };
    for (let i = 0; i < 5; i++) state = prepareTravelFormation(frame(state));
    expect(state.formationAssignments!.travel!.lateralScale).toBe(narrow);
    state = prepareTravelFormation(frame(state));
    expect(state.formationAssignments!.travel!.lateralScale).toBeCloseTo(narrow + 0.05);
    for (let i = 0; i < 100; i++) state = prepareTravelFormation(frame(state));
    expect(state.formationAssignments!.travel!.lateralScale).toBe(1);
  });

  it("does not compress for a passing enemy or change ownership during departures", () => {
    let state = atSlots(party());
    const ownership = state.formationAssignments!.slotsByEntityId;
    state = { ...state, entities: { ...state.entities, enemy: createEnemy("enemy", state.entities.m2.position, "passive") } };
    state = prepareTravelFormation(state);
    expect(state.formationAssignments!.travel!.lateralScale).toBe(1);
    expect(state.formationAssignments!.travel!.trailing).toBe(false);
    const queue = state.formationAssignments!.travel!.trailOrder;
    state = { ...state, entities: { ...state.entities, m2: { ...(state.entities.m2 as Companion), state: "dead", health: 0 } } };
    state = prepareTravelFormation(frame(state));
    expect(state.formationAssignments!.slotsByEntityId).toBe(ownership);
    expect(state.formationAssignments!.travel!.trailOrder).toEqual(queue);
  });

  it("uses distinct arclength targets through a narrow passage and recovers over 100 updates", () => {
    let state = party(3);
    state = { ...state, map: { ...state.map!, walls: Array.from({ length: 30 }, (_, i) => [{ x: 28, y: 15 + i }, { x: 31, y: 15 + i }]).flat() },
      entities: { ...state.entities,
        m0: { ...state.entities.m0, position: { x: 29.5, y: 30 } },
        m1: { ...state.entities.m1, position: { x: 29.5, y: 33 } },
        m2: { ...state.entities.m2, position: { x: 29.5, y: 36 } },
      } };
    state = prepareTravelFormation(state);
    expect(state.formationAssignments!.travel!.trailing).toBe(true);
    const runtime = state.formationAssignments!.travel!;
    state = { ...state, formationAssignments: { ...state.formationAssignments!, travel: { ...runtime, trail: [{ x: 29.5, y: 42 }, { x: 29.5, y: 30 }] } } };
    for (let i = 0; i < 100; i++) {
      state = updateFollowSystem(frame(state));
      const goals = state.formationAssignments!.travel!.goalsByEntityId;
      expect(Math.hypot(goals.m1.position.x - goals.m2.position.x, goals.m1.position.y - goals.m2.position.y)).toBeGreaterThan(2.3);
      expect(goals.m1.expectedPosition).toEqual({ x: 29.5, y: 32.5 });
      expect(goals.m2.expectedPosition).toEqual({ x: 29.5, y: 35 });
    }
    state = { ...state, map: { ...state.map!, walls: [] } };
    for (let i = 0; i < 100; i++) state = updateFollowSystem(frame(state));
    expect(state.formationAssignments!.travel!.trailing).toBe(false);
    expect(state.formationAssignments!.travel!.lateralScale).toBe(1);
  });

  it.each([false, true])("assigns distinct short-history fallbacks before phase resolution (reverse order: %s)", reverse => {
    let state = party();
    const members = Object.entries(state.entities).map(([id, actor], i) => [id,
      { ...actor, position: i ? { x: 14 + i * 3, y: 20 } : { x: 30, y: 30 } }] as const);
    state = { ...state, entities: Object.fromEntries(reverse ? members.reverse() : members),
      map: { ...state.map!, walls: Array.from({ length: 60 }, (_, x) => [{ x, y: 32.5 }, { x, y: 34.5 }]).flat() } };
    state = prepareTravelFormation(state);
    expect(state.formationAssignments!.travel!.trailing).toBe(true);
    state = updateFollowSystem(authority.beginNormalMovementPhase(state));
    const requests = state.normalMovementPhase!.submissions.map(submission => submission.request);
    expect(requests).toHaveLength(4);
    for (let i = 0; i < requests.length; i++) for (let j = i + 1; j < requests.length; j++) {
      expect(doCollisionBodiesOverlap(state.entities[requests[i].entityId], requests[i].destination,
        state.entities[requests[j].entityId], requests[j].destination, 0.05)).toBe(false);
    }
    expect(state.formationAssignments!.travel!.goalsByEntityId).toEqual({});
    expect(state.reservedPositionsByEntityId ?? {}).toEqual({});
    state = movement.endNormalMovementPhase(state);
    expect(state.formationAssignments!.travel!.trail).toHaveLength(1);
  });

  it("follows committed leader walking around a narrow corner for 100 updates", () => {
    let state = party(3);
    const open = (x: number, y: number) => (x >= 14 && x <= 16 && y >= 11 && y <= 32) || (x >= 4 && x <= 16 && y >= 11 && y <= 14);
    const walls = Array.from({ length: 40 }, (_, y) => Array.from({ length: 40 }, (_, x) => ({ x, y }))).flat().filter(p => !open(p.x, p.y));
    state = { ...state, map: { ...state.map!, columns: 40, rows: 40, walls }, entities: { ...state.entities,
      m0: { ...state.entities.m0, position: { x: 15, y: 22 } },
      m1: { ...state.entities.m1, position: { x: 15, y: 25 } },
      m2: { ...state.entities.m2, position: { x: 15, y: 28 } },
    } };
    for (let i = 0; i < 200; i++) {
      state = clearFrameMovementPlanning(frame(state));
      const leader = state.entities.m0;
      if (i < 100) {
        const position = i < 50 ? { x: 15, y: 22 - (i + 1) * 0.19 } : { x: 15 - (i - 49) * 0.16, y: 12.5 };
        expect(isSpecializedMovementPositionAvailable(state, leader, position)).toBe(true);
        const request = authority.createNormalMovementRequest(state, leader, position, { source: "partyTravel" });
        state = authority.commitNormalMovementPosition(state, { ...leader, position });
        state = authority.finishNormalMovement(state, request, "moved", leader.position, position);
      }
      state = movement.endNormalMovementPhase(updateFollowSystem(authority.beginNormalMovementPhase(state)));
      for (const id of ["m1", "m2"]) expect(isSpecializedMovementPositionAvailable(state, state.entities[id], state.entities[id].position)).toBe(true);
    }
    for (const id of ["m1", "m2"]) {
      expect(state.entities[id].position.x).toBeLessThan(12);
      expect(state.entities[id].position.y).toBeLessThan(14);
      const goal = state.formationAssignments!.travel!.goalsByEntityId[id];
      expect(Math.hypot(state.entities[id].position.x - goal.position.x, state.entities[id].position.y - goal.position.y)).toBeLessThan(0.6);
      if (goal.mode !== "held" && goal.mode !== "trailing") {
        expect(Math.hypot(goal.position.x - goal.expectedPosition.x, goal.position.y - goal.expectedPosition.y)).toBeLessThanOrEqual(1.251);
      }
    }
    expect(state.formationAssignments!.travel!.trail.some(p => p.x === 15 && p.y === 12.5)).toBe(true);
  }, 15000);
});

describe("travel movement integration", () => {
  it.each(["hold", "approach"])("preserves a Defender's combat %s against later following", mode => {
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader", "support", 0);
    const defender = { ...createCompanion("defender", { x: 12.5, y: 10 }, "leader", "defender", 1), state: "defend" as const };
    const enemy = { ...createEnemy("enemy", { x: mode === "hold" ? 14.1 : 15.1, y: 10 }, "aggressive"), state: "attack" as const, currentTargetId: leader.id };
    let state = reconcileFormationAssignments(createTestGameState({ ...party(2), entities: { leader, defender, enemy }, partyLeaderId: leader.id, formationAssignments: undefined }));
    state = updateDefendSystem(authority.beginNormalMovementPhase(state));
    const expected = movement.endNormalMovementPhase(state);
    state = movement.endNormalMovementPhase(updateFollowSystem(state));
    expect(authority.getNormalMovementResult(state, defender.id)?.request.reason).toBe(authority.getNormalMovementResult(expected, defender.id)?.request.reason);
    expect(state.entities.defender.position).toEqual(expected.entities.defender.position);
    expect(state.formationAssignments?.travel?.goalsByEntityId.defender).toBeUndefined();
  });

  it("keeps an engaged Defender in range during a direct leader move in the game loop", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const leader = createCompanion("leader", { x: 10, y: 10 }, "leader", "support", 0);
    const defender = { ...createCompanion("defender", { x: 12.5, y: 10 }, "leader", "defender", 1), state: "defend" as const, lastAttackAt: 900 };
    const enemy = { ...createEnemy("enemy", { x: 14.1, y: 10 }, "aggressive"), state: "attack" as const, currentTargetId: leader.id };
    let state = createTestGameState({ ...party(2), autoModeEnabled: true, entities: { leader, defender, enemy }, partyLeaderId: leader.id, formationAssignments: undefined });
    state = issueCompanionDirectCommand(state, { type: "move", companionId: leader.id, targetPosition: { x: 10, y: 15 } }, 1000).state;
    state = step(state);
    expect(state.entities.leader.position.y).toBeGreaterThan(leader.position.y);
    expect(state.entities.defender.position).toEqual(defender.position);
    expect(authority.getNormalMovementResult(state, defender.id)?.request.reason).toBe("legal Defender engagement");
  });

  it("retains a queued combat hold after its target dies in the same update", () => {
    let state = party(2, 1);
    const defender = { ...(state.entities.m0 as Companion), state: "defend" as const, currentTargetId: null };
    state = { ...state, entities: { ...state.entities, m0: defender } };
    state = movement.holdEntityMovement(authority.beginNormalMovementPhase(state), defender, "defend", "legal Defender engagement");
    state = movement.endNormalMovementPhase(updateFollowSystem(state));
    expect(authority.getNormalMovementResult(state, defender.id)?.request.reason).toBe("legal Defender engagement");
    expect(state.entities.m0.position).toEqual(defender.position);
    expect(state.formationAssignments?.travel?.goalsByEntityId.m0).toBeUndefined();
  });

  it("settles an idle party with Auto Combat off, then holds for 30 updates without position publications", () => {
    let state = party(3);
    for (let i = 0; i < 100; i++) state = step(state);
    const positions = Object.fromEntries(Object.entries(state.entities).map(([id, actor]) => [id, actor.position]));
    const publication = vi.spyOn(authority, "commitNormalMovementPosition");
    for (let i = 0; i < 30; i++) state = step(state);
    expect(Object.fromEntries(Object.entries(state.entities).map(([id, actor]) => [id, actor.position]))).toEqual(positions);
    expect(publication).not.toHaveBeenCalled();
    expect(state.autoModeEnabled).toBe(false);
    for (const goal of Object.values(state.formationAssignments!.travel!.goalsByEntityId)) expect(goal.settled).toBe(true);
  });

  it("measures cohesion against slots and retains slowdown/wait hysteresis", () => {
    let state = atSlots(party(5, 3));
    expect(updateTravelFormationCohesion(state)!.leaderSpeedMultiplier).toBe(1);
    const expected = state.entities.m0.position;
    const setError = (error: number) => { state = { ...state, entities: { ...state.entities, m0: { ...state.entities.m0, position: { x: expected.x + error, y: expected.y } } } }; };
    setError(4.1);
    let result = updateTravelFormationCohesion(state)!; state = result.state;
    expect(result.leaderSpeedMultiplier).toBe(0.45);
    setError(3.5); result = updateTravelFormationCohesion(state)!; state = result.state;
    expect(result.leaderSpeedMultiplier).toBe(0.45);
    setError(7.1); result = updateTravelFormationCohesion(state)!; state = result.state;
    expect(result.canMoveLeader).toBe(false);
    setError(5.5); result = updateTravelFormationCohesion(state)!; state = result.state;
    expect(result.canMoveLeader).toBe(false);
    setError(2.9);
    expect(updateTravelFormationCohesion(state)!.leaderSpeedMultiplier).toBe(1);
  });

  it("never delays a direct leader command and cannot overwrite another movement result", () => {
    let state = party(3);
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m0", targetPosition: { x: 40, y: 30 } }, 1000).state;
    expect(updateTravelFormationCohesion(state)).toBeUndefined();
    state = step(state);
    expect(state.entities.m0.position.x).toBeGreaterThan(30);
    const actor = state.entities.m1 as Companion;
    const before = state;
    expect(moveTravelFormationMember(state, actor)).toBe(before);
    expect(state.movementPositionCommitsByEntityId?.m1).toBe(before.movementPositionCommitsByEntityId?.m1);
  });

  it("maintains front slots with a rear leader while ordinary travel cruises for 100 updates", () => {
    let state = atSlots(party(5, 3));
    state = issuePartyOrder(state, { type: "move", targetPosition: { x: 50, y: 30 } });
    const publications: string[] = [];
    const commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((current, actor) => {
      const next = commit(current, actor);
      if (next.entities[actor.id].position !== current.entities[actor.id].position) publications.push(`${current.simulationFrame}:${actor.id}`);
      return next;
    });
    const start = state.entities.m3.position;
    for (let i = 0; i < 100; i++) state = step(state);
    expect(state.entities.m3.position.x).toBeGreaterThan(start.x + 12);
    expect(new Set(publications).size).toBe(publications.length);
    for (const [id, goal] of Object.entries(state.formationAssignments!.travel!.goalsByEntityId)) {
      expect(Math.hypot(state.entities[id].position.x - goal.expectedPosition.x, state.entities[id].position.y - goal.expectedPosition.y)).toBeLessThan(4);
    }
  }, 30000);

  it("does not create candidate path queries or goal bookkeeping for a losing request", () => {
    let state = party(3);
    state = authority.beginNormalMovementPhase(state);
    const actor = state.entities.m1 as Companion;
    state = moveTravelFormationMember(state, actor);
    state = movement.moveEntityTowardPositionIfUnoccupied(state, actor, { x: 40, y: 34 }, { source: "compatibility" });
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
    state = movement.endNormalMovementPhase(state);
    expect(authority.getNormalMovementResult(state, actor.id)!.request.source).toBe("compatibility");
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
  });

  it("consumes both swap budgets without assigning the requester's goal to its partner", () => {
    let state = prepareTravelFormation(party(2));
    const actor = state.entities.m0;
    state = { ...state, map: undefined, entities: { ...state.entities, m1: { ...state.entities.m1, position: { x: 30.8, y: 30 } } },
      moveIntentsByEntityId: { m1: actor.position } };
    const goal = { position: { x: 40, y: 30 }, expectedPosition: { x: 40, y: 30 }, mode: "normal" as const, settled: false };
    state = movement.moveEntityTowardPositionIfUnoccupied(state, actor, goal.position, { travelFormationGoal: goal });
    expect(authority.getNormalMovementResult(state, "m0")!.positionCommitCount).toBe(1);
    expect(authority.getNormalMovementResult(state, "m1")!.positionCommitCount).toBe(1);
    expect(state.formationAssignments!.travel!.goalsByEntityId.m0).toEqual(goal);
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
    expect(movement.moveEntityTowardPositionIfUnoccupied(state, state.entities.m1, { x: 25, y: 30 })).toBe(state);
  });

  it("keeps a substitute while blocked and returns to the nominal region after sustained clearance", () => {
    let state = atSlots(party(3));
    const nominal = state.entities.m1.position;
    state = { ...state, map: { ...state.map!, collisionWalls: [{ x: nominal.x, y: nominal.y }] } };
    state = updateFollowSystem(state);
    const substitute = state.formationAssignments!.travel!.goalsByEntityId.m1.position;
    expect(substitute).not.toEqual(nominal);
    for (let i = 0; i < 30; i++) {
      state = updateFollowSystem(frame(state));
      expect(state.formationAssignments!.travel!.goalsByEntityId.m1.position).toEqual(substitute);
    }
    state = { ...state, map: { ...state.map!, collisionWalls: [] } };
    for (let i = 0; i < 5; i++) state = updateFollowSystem(frame(state));
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1.position).toEqual(substitute);
    for (let i = 0; i < 10; i++) state = updateFollowSystem(frame(state));
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1.position).toEqual(nominal);
  });

  it("keeps expected cohesion distinct from a safe hold and excludes genuine temporary departures", () => {
    let state = atSlots(party(3));
    const expected = state.entities.m1.position;
    state = { ...state, entities: { ...state.entities, m1: { ...state.entities.m1, position: { x: expected.x + 10, y: expected.y } } },
      map: { ...state.map!, collisionWalls: Array.from({ length: 9 }, (_, i) => ({ x: expected.x + i % 3 - 1, y: expected.y + Math.floor(i / 3) - 1 })) } };
    state = updateFollowSystem(state);
    const result = updateTravelFormationCohesion(state)!;
    expect(result.canMoveLeader).toBe(false);
    const companion = state.entities.m1 as Companion;
    state = { ...state, entities: { ...state.entities, m1: { ...companion, state: "gather" } } };
    expect(updateTravelFormationCohesion(state)!.canMoveLeader).toBe(true);
  });

  it("regroups during route calm but yields to emergency combat and individual authority", () => {
    const state = party(3);
    expect(usesTravelFormation({ ...state, worldTravelTargetMapId: "map-1" })).toBe(true);
    expect(usesTravelFormation({ ...state, worldTravelTargetMapId: "map-1", autoRoute: { pauseReason: "calm", resumeAfterMs: 3000 } })).toBe(true);
    expect(usesTravelFormation({ ...state, worldTravelTargetMapId: "map-1", autoRoute: { pauseReason: "emergency" } })).toBe(false);
    const direct = issueCompanionDirectCommand(state, { type: "move", companionId: "m1", targetPosition: { x: 40, y: 35 } }, 1000).state;
    expect(isTravelFormationMember(direct, direct.entities.m1 as Companion)).toBe(false);
    expect(moveTravelFormationMember(direct, direct.entities.m1 as Companion)).toBe(direct);
  });

  it("clears nested goals on command replacement and removes runtime from saves and map cleanup", () => {
    let state = prepareTravelFormation(party(3));
    state = moveTravelFormationMember(state, state.entities.m1 as Companion);
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1).toBeDefined();
    const trail = state.formationAssignments!.travel!.trail;
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m1", targetPosition: { x: 40, y: 35 } }, 1000).state;
    expect(state.formationAssignments!.travel!.goalsByEntityId.m1).toBeUndefined();
    expect(state.formationAssignments!.travel!.proposedGoalsByEntityId?.m1).toBeUndefined();
    expect(state.formationAssignments!.travel!.trail).toBe(trail);
    expect(clearMapTransitionRuntimeState(state).formationAssignments).toBeUndefined();
    expect(JSON.parse(JSON.stringify(createSavedGame(state, 1000))).state).not.toHaveProperty("formationAssignments");
  });

  it("exports the selected travel goal and mode through existing formation telemetry", () => {
    const state = startDebugTelemetryRecording(atSlots(party(2)));
    const next = updateFollowSystem(state);
    const recorded = recordDebugTelemetryTick(state, next);
    expect(recorded.debugTelemetry!.ticks.at(-1)!.entities.find(actor => actor.entityId === "m1"))
      .toMatchObject({ formationSlotReason: "formation normal", formationSlot: state.entities.m1.position, normalMovementOutcome: "held" });
  });
});
