import { afterEach, describe, expect, it, vi } from "vitest";
import { getCombatFormationPositions, getCombatFormationTarget, isCombatFormationMember, moveCombatFormationMember, prepareCombatFormation } from "./combatFormation";
import { createCompanion, createEnemy } from "./entities";
import { assignFormationSlots } from "./formationAssignments";
import { transformFormationSlots } from "./formationTemplates";
import { acquireSpecializedMovement } from "./movementAuthority";
import { isCombatPositionAvailable } from "./movementPlanning";
import { setPartyExecutionIntent } from "./partyIntentState";
import { doCollisionBodiesOverlap } from "./spatialGeometry";
import { createTestGameState } from "./testState";
import { getTravelFormationExpectedPosition, prepareTravelFormation } from "./travelFormation";
import type { GameState } from "./state";
import type { Companion, Enemy, FormationPresetId, PartyMemberRole } from "./types";

afterEach(() => vi.restoreAllMocks());

function party(size = 3, preset: FormationPresetId = "arrow", leaderIndex = 0): GameState {
  const roles: PartyMemberRole[] = ["defender", "fighter", "support", "gatherer", "none"];
  const leaderId = `m${leaderIndex}`;
  const members = Array.from({ length: size }, (_, i) => createCompanion(`m${i}`, { x: 40.25, y: 30.5 }, leaderId, roles[i], i));
  const assignments = assignFormationSlots(members, leaderId, preset)!;
  const points = transformFormationSlots(assignments, members[leaderIndex], { x: 0, y: -1 });
  const target = createEnemy("target", { x: 40.25, y: 27.5 }, "passive", { maxHealth: 10000 });
  return setPartyExecutionIntent(createTestGameState({ currentMapId: "hub", partyLeaderId: leaderId, formationAssignments: assignments,
    map: { columns: 100, rows: 80, walls: [], teleports: [], healingFountains: [], displayName: "Combat formation", debugName: "combat-formation" },
    entities: { ...Object.fromEntries(members.map(member => [member.id, { ...member, position: points[member.id], state: "follow" }])), [target.id]: target },
    simulationTimeMs: 1000 }), { type: "attack", source: "ai", targetId: target.id, targetPosition: target.position });
}
function clock(state: GameState, delta = 100): GameState {
  return { ...state, simulationFrame: (state.simulationFrame ?? 0) + 1, simulationTimeMs: (state.simulationTimeMs ?? 0) + delta, simulationDeltaMs: delta };
}
function expanded(state: GameState): GameState {
  for (let i = 0; i < 25; i++) state = prepareCombatFormation(clock(state));
  return state;
}

describe("combat formation geometry and context", () => {
  it.each(["arrow", "balanced", "side-by-side"] as const)("expands %s rows and columns for every size and leader depth without publishing movement", preset => {
    for (let size = 1; size <= 5; size++) for (let leaderIndex = 0; leaderIndex < size; leaderIndex++) {
      const original = party(size, preset, leaderIndex), state = expanded(original);
      const runtime = state.formationAssignments!.combat!;
      expect(runtime.spacing).toBeCloseTo(3);
      expect(runtime.lateralScale).toBeCloseTo(1.2);
      expect(getCombatFormationPositions(state)).toEqual(transformFormationSlots(original.formationAssignments!, original.entities[original.partyLeaderId] as Companion,
        runtime.facing, original.entities[original.partyLeaderId].position, 1.2, 1.2));
      expect(state.entities).toBe(original.entities);
      expect(state.partyIntent).toBe(original.partyIntent);
      expect(state.formationAssignments!.slotsByEntityId).toBe(original.formationAssignments!.slotsByEntityId);
      expect(state.formationAssignments!.spacing).toBe(2.5);
      expect(state.movementPositionCommitsByEntityId).toBeUndefined();
    }
  });

  it("caps rotation, uses the clockwise reversal tie, and advances only once across late context changes", () => {
    let state = party();
    state.entities.target = { ...state.entities.target, position: { x: 40.25, y: 33.5 } };
    state = prepareCombatFormation(state);
    const runtime = state.formationAssignments!.combat!;
    expect(Math.atan2(runtime.facing.y, runtime.facing.x)).toBeCloseTo(-Math.PI / 2 + Math.PI / 5);
    const once = { ...runtime };
    state = prepareCombatFormation(state);
    expect(state.formationAssignments!.combat!.facing).toEqual(once.facing);
    expect(state.formationAssignments!.combat!.spacing).toBe(once.spacing);
    state.entities.target = { ...state.entities.target, position: { x: 43.25, y: 30.5 } };
    state = prepareCombatFormation(state);
    expect(state.formationAssignments!.combat!.facing).toEqual(once.facing);
  });

  it("retains a local orientation reference across opposing commitments and insertion order", () => {
    let state = setPartyExecutionIntent(party(), null);
    state.entities.m0 = { ...state.entities.m0 as Companion, state: "attack", currentTargetId: "target" };
    state = prepareCombatFormation(state);
    const other = createEnemy("other", { x: 40.25, y: 33.5 }, "aggressive");
    state = { ...state, entities: { other, ...state.entities, m2: { ...state.entities.m2 as Companion, state: "attack", currentTargetId: other.id } } };
    expect(getCombatFormationTarget(state)?.id).toBe("target");
    state.entities.target = { ...state.entities.target as Enemy, health: 0, state: "dead" };
    expect(getCombatFormationTarget(state)?.id).toBe("other");
    expect(state.partyIntent?.executionIntent).toBeFalsy();
  });

  it("does not acquire nearby enemies or promote an individually commanded or remote fight", () => {
    const state = setPartyExecutionIntent(party(), null);
    expect(getCombatFormationTarget(state)).toBeUndefined();
    state.entities.m2 = { ...state.entities.m2 as Companion, state: "attack", currentTargetId: "target", commandPriority: "direct" };
    expect(getCombatFormationTarget(state)).toBeUndefined();
    state.entities.m2 = { ...state.entities.m2 as Companion, position: { x: 70, y: 70 }, commandPriority: "autonomous" };
    expect(getCombatFormationTarget(state)).toBeUndefined();
  });

  it("preserves distant hunting travel and player floor movement under attack", () => {
    let state = party();
    state.entities.target = { ...state.entities.target, position: { x: 70, y: 30 } };
    expect(getCombatFormationTarget(state)).toBeUndefined();
    state = setPartyExecutionIntent(state, { type: "move", source: "player", targetId: null, targetPosition: { x: 70, y: 30 } });
    state.entities.m0 = { ...state.entities.m0 as Companion, state: "attack", currentTargetId: "target" };
    expect(getCombatFormationTarget(state)).toBeUndefined();
  });

  it("freezes facing through reference displacement and rejects a suppressed reference", () => {
    let state = prepareCombatFormation(party());
    const facing = state.formationAssignments!.combat!.facing;
    state = acquireSpecializedMovement(clock(state), "target", "forced", "test").state;
    state.entities.target = { ...state.entities.target, position: { x: 43.25, y: 30.5 } };
    state = prepareCombatFormation(state);
    expect(state.formationAssignments!.combat!.facing).toEqual(facing);
    state = { ...state, autonomousTargetSuppressionsByEnemyId: { target: { enemyId: "target", reason: "test", expiresAtMs: 10000 } } };
    expect(getCombatFormationTarget(state)).toBeUndefined();
  });

  it("keeps missing/dead leader assignments but produces no combat geometry", () => {
    const state = expanded(party()), ownership = state.formationAssignments;
    state.entities.m0 = { ...state.entities.m0 as Companion, health: 0, state: "dead" };
    expect(getCombatFormationPositions(state)).toEqual({});
    expect(getCombatFormationTarget(state)).toBeUndefined();
    expect(prepareCombatFormation(state).formationAssignments).toBe(ownership);
  });

  it("hands expanded facing and both spacing axes to stationary travel without snapping", () => {
    let state = expanded(party());
    const combatPoints = getCombatFormationPositions(state);
    state.entities.target = { ...state.entities.target as Enemy, health: 0, state: "dead" };
    state = setPartyExecutionIntent(state, null);
    state = prepareTravelFormation(state);
    const goal = getTravelFormationExpectedPosition(state, state.entities.m2 as Companion)!;
    expect(Math.hypot(goal.x - combatPoints.m2.x, goal.y - combatPoints.m2.y)).toBeLessThan(0.2);
    const before = state.formationAssignments!.travel!.rowScale;
    state = prepareTravelFormation(state);
    expect(state.formationAssignments!.travel!.rowScale).toBe(before);
    for (let i = 0; i < 20; i++) state = prepareTravelFormation(clock(state));
    expect(state.formationAssignments!.travel!.rowScale).toBe(1);
    expect(state.formationAssignments!.combat).toBeUndefined();
  });

  it("reserves combatants' and temporary departures' slots and only stages available companions", () => {
    let state = party();
    const ownership = state.formationAssignments!.slotsByEntityId;
    state.entities.m1 = { ...state.entities.m1 as Companion, state: "attack", currentTargetId: "target" };
    expect(isCombatFormationMember(state, state.entities.m1 as Companion)).toBe(false);
    expect(isCombatFormationMember(state, state.entities.m2 as Companion)).toBe(true);
    state.entities.m2 = { ...state.entities.m2 as Companion, state: "gather" };
    state = expanded(state);
    expect(state.formationAssignments!.slotsByEntityId).toBe(ownership);
    expect(moveCombatFormationMember(state, state.entities.m1 as Companion)).toBe(state);
  });

  it("reduces expansion to fit narrow hard bounds, then re-expands only after sustained clearance", () => {
    let state = party(5, "side-by-side", 2);
    for (let i = 0; i < 5; i++) state.entities[`m${i}`] = { ...state.entities[`m${i}`], position: { x: 0.5 + i * 1.75, y: 15 } };
    state.entities.target = { ...state.entities.target, position: { x: 4, y: 12 } };
    state.map = { ...state.map!, columns: 9, rows: 30 };
    state = expanded(state);
    expect(state.formationAssignments!.combat!.spacing).toBe(2.5);
    const ownership = state.formationAssignments!.slotsByEntityId;
    state.map = { ...state.map!, columns: 50 };
    for (const [id, actor] of Object.entries(state.entities)) state.entities[id] = { ...actor, position: { x: actor.position.x + 20, y: actor.position.y } };
    for (let i = 0; i < 5; i++) {
      state = prepareCombatFormation(clock(state));
      expect(state.formationAssignments!.combat!.spacing).toBe(2.5);
    }
    state = prepareCombatFormation(clock(state));
    expect(state.formationAssignments!.combat!.spacing).toBeCloseTo(2.55);
    expect(state.formationAssignments!.slotsByEntityId).toBe(ownership);
  });

  it.each([true, false])("checks alternate hard-fit positions against the leader when leader-first is %s", leaderFirst => {
    const leader: Companion = { ...createCompanion("leader", { x: 30, y: 30 }, "leader", "support", leaderFirst ? 0 : 1, "hunter"),
      state: "attack", currentTargetId: "target" };
    const front = createCompanion("front", { x: 28.75, y: 27 }, "leader", "defender", leaderFirst ? 1 : 0);
    const target = createEnemy("target", { x: 30, y: 25 }, "passive", { maxHealth: 10000 });
    let state = setPartyExecutionIntent(createTestGameState({ partyLeaderId: leader.id,
      formationAssignments: assignFormationSlots([front, leader], leader.id), entities: { front, leader, target },
      map: { columns: 70, rows: 70, walls: [{ x: 30, y: 27 }, { x: 31, y: 27 }], teleports: [], healingFountains: [], displayName: "Leader fit", debugName: "leader-fit" },
      simulationTimeMs: 1000, simulationFrame: 1, simulationDeltaMs: 100 }),
    { type: "attack", source: "ai", targetId: target.id, targetPosition: target.position });
    const assignments = state.formationAssignments!;
    expect(isCombatPositionAvailable(state, front, front.position, { allowPartyPassThrough: true })).toBe(true);
    expect(doCollisionBodiesOverlap(front, front.position, leader, leader.position, 0.05)).toBe(false);
    for (let i = 0; i < 30; i++) state = prepareCombatFormation(clock(state));
    const runtime = state.formationAssignments!.combat!;
    expect(runtime.spacing).toBeCloseTo(3);
    expect(runtime.lateralScale).toBeCloseTo(1.2);
    expect(runtime.proposedGoalsByEntityId?.front.mode).toBe("substitute");
    expect(runtime.proposedGoalsByEntityId?.front.position).toEqual(front.position);
    expect(state.formationAssignments!.slotsByEntityId).toBe(assignments.slotsByEntityId);
    expect(state.movementPositionCommitsByEntityId).toBeUndefined();
  });

  it("resumes combat from partially recovered travel geometry rather than stale combat geometry", () => {
    let state = expanded(party());
    const target = state.entities.target as Enemy;
    state.entities.target = { ...target, health: 0, state: "dead" };
    state = setPartyExecutionIntent(state, null);
    for (let i = 0; i < 5; i++) state = prepareTravelFormation(clock(state));
    const travel = state.formationAssignments!.travel!;
    expect(travel.rowScale).toBeLessThan(1.2);
    state.entities.target = target;
    state = setPartyExecutionIntent(state, { type: "attack", source: "ai", targetId: target.id, targetPosition: target.position });
    state = prepareCombatFormation(state);
    expect(state.formationAssignments!.combat!.spacing).toBeCloseTo(travel.rowScale! * 2.5);
    expect(state.formationAssignments!.combat!.facing).toEqual(travel.facing);
  });
});
