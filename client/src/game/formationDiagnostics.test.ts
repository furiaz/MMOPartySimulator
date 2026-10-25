import { describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "./createInitialGameState";
import { reconcileFormationAssignments } from "./formationAssignments";
import { getFormationDiagnostics } from "./formationDiagnostics";
import { selectFormationPreset } from "./formationSelection";
import { startDebugTelemetryRecording, recordDebugTelemetryTick } from "./debugTelemetry";
import { finishNormalMovement, createNormalMovementRequest } from "./movementAuthority";
import * as movement from "./movementPlanning";
import type { Companion } from "./types";
import { getTravelFormationExpectedPosition, prepareTravelFormation } from "./travelFormation";
import type { GameState } from "./state";

describe("read-only formation diagnostics", () => {
  it("reports pending/applied choice, local slots, and no stale accepted goals", () => {
    let state = reconcileFormationAssignments(createInitialGameState());
    state = selectFormationPreset(state, "balanced");
    const before = JSON.stringify(state), query = vi.spyOn(movement, "getBoundedPathDistance");
    let diagnostic = getFormationDiagnostics(state);
    expect(diagnostic).toMatchObject({ selectedPreset: "balanced", appliedPreset: "arrow", transitionProgress: 1 });
    expect(diagnostic.members.every(member => member.slotId && !member.acceptedPosition)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(query).not.toHaveBeenCalled(); query.mockRestore();
    state = reconcileFormationAssignments(state);
    const member = Object.values(state.entities).find((actor): actor is Companion => actor.kind === "companion" && actor.id !== state.partyLeaderId)!;
    const expectedPosition = getTravelFormationExpectedPosition(state, member)!;
    const goal = { position: { ...expectedPosition, x: expectedPosition.x + 0.4 }, expectedPosition, mode: "substitute" as const, settled: false };
    const request = createNormalMovementRequest(state, member, goal.position, { source: "follow", travelFormationGoal: goal });
    state = finishNormalMovement(state, request, "held", member.position);
    diagnostic = getFormationDiagnostics(state);
    expect(diagnostic.members.find(actor => actor.entityId === member.id)).toMatchObject({ acceptedPosition: goal.position, expectedPosition: goal.expectedPosition, mode: "substitute" });
    const stale = getFormationDiagnostics({ ...state, simulationFrame: (state.simulationFrame ?? 0) + 1 });
    expect(stale.members.every(actor => actor.acceptedPosition === undefined)).toBe(true);
  });

  it("keeps local assignments visible without inventing a living leader and exports one snapshot per tick", () => {
    let state = reconcileFormationAssignments(createInitialGameState());
    const leader = state.entities[state.partyLeaderId] as Companion;
    state = { ...state, entities: { ...state.entities, [leader.id]: { ...leader, health: 0, state: "dead" } } };
    const diagnostic = getFormationDiagnostics(state);
    expect(diagnostic.members.every(member => member.slotId && !member.expectedPosition)).toBe(true);
    expect(diagnostic.members.find(member => member.entityId === leader.id)?.departureReasons).toEqual(["dead"]);
    state = startDebugTelemetryRecording(state);
    state = recordDebugTelemetryTick(state, state);
    expect(state.debugTelemetry?.ticks.at(-1)?.formationDiagnostics).toEqual(diagnostic);
  });

  it.each(["leader-death", "leader-removal", "rally", "member-death", "direct-command"])("drops inapplicable same-frame goals after %s while retaining the movement owner", change => {
    let state = prepareTravelFormation(reconcileFormationAssignments(createInitialGameState()));
    const member = Object.values(state.entities).find((actor): actor is Companion => actor.kind === "companion" && actor.id !== state.partyLeaderId)!;
    const expectedPosition = getTravelFormationExpectedPosition(state, member)!;
    const goal = { position: expectedPosition, expectedPosition, mode: "normal" as const, settled: true };
    state = finishNormalMovement(state, createNormalMovementRequest(state, member, goal.position, { source: "follow", travelFormationGoal: goal }), "held", member.position);
    if (change === "leader-death") state.entities[state.partyLeaderId] = { ...state.entities[state.partyLeaderId] as Companion, state: "dead", health: 0 };
    if (change === "leader-removal") delete state.entities[state.partyLeaderId];
    if (change === "rally") state.activeTeleport = { id: "rally", position: member.position, range: 3,
      sourceMapId: "hub", targetMapId: "map-1", triggeredBy: "ai" } as GameState["activeTeleport"];
    if (change === "member-death") state.entities[member.id] = { ...member, state: "dead", health: 0 };
    if (change === "direct-command") state.directCompanionCommandsById = { [member.id]: { type: "move", companionId: member.id, targetPosition: { x: 16, y: 54 }, issuedAt: 1000 } };
    const before = JSON.stringify(state), diagnostic = getFormationDiagnostics(state).members.find(actor => actor.entityId === member.id)!;
    expect(diagnostic.expectedPosition).toBeUndefined();
    expect(diagnostic.acceptedPosition).toBeUndefined();
    expect(["unavailable", "departed"]).toContain(diagnostic.mode);
    expect(diagnostic.slotId).toBeDefined();
    expect(diagnostic.movementOwner).toBe("follow");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("reads the active trailing target without preparing geometry or issuing queries", () => {
    const state = prepareTravelFormation(reconcileFormationAssignments(createInitialGameState()));
    const leader = state.entities[state.partyLeaderId] as Companion;
    const member = Object.values(state.entities).find((actor): actor is Companion => actor.kind === "companion" && actor.id !== leader.id)!;
    state.formationAssignments!.travel = { ...state.formationAssignments!.travel!, trailing: true,
      trail: [{ x: leader.position.x - 10, y: leader.position.y }, leader.position], trailOrder: [member.id] };
    const before = JSON.stringify(state), query = vi.spyOn(movement, "getBoundedPathDistance");
    const expected = getTravelFormationExpectedPosition(state, member);
    const diagnostic = getFormationDiagnostics(state).members.find(actor => actor.entityId === member.id)!;
    expect(diagnostic.expectedPosition).toEqual(expected);
    expect(diagnostic.expectedPosition?.x).toBeCloseTo(leader.position.x - 2.5);
    expect(diagnostic.acceptedPosition).toBeUndefined();
    expect(JSON.stringify(state)).toBe(before);
    expect(query).not.toHaveBeenCalled(); query.mockRestore();
  });
});
