import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { assignFormationSlots, reconcileFormationAssignments } from "./formationAssignments";
import { FORMATION_CHOICES, selectFormationPreset } from "./formationSelection";
import { getEffectiveFormationOffsets, transformFormationSlots } from "./formationTemplates";
import { advanceFormationTransition } from "./formationTransition";
import { getFormationTargetScore } from "./formationTargeting";
import { prepareTravelFormation } from "./travelFormation";
import { moveTravelFormationMember } from "./travelFormation";
import { prepareCombatFormation } from "./combatFormation";
import { createTestGameState } from "./testState";
import { createSavedGame } from "./saveGame";
import { updateGame } from "./updateGame";
import * as movement from "./movementPlanning";
import * as authority from "./movementAuthority";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { debugTeleportToHub, debugTeleportToSlimewardCamp, debugResetSlimewardDungeon } from "./debugTools";
import { SLIMEWARD_FLOOR_ONE_ID } from "./debugMap";
import { bakeNavigationGrid } from "./navigation";
import { setPartyLeader, setPartyMemberRole, setPartyOrder } from "./state";
import type { GameState } from "./state";
import type { Companion, FormationPresetId } from "./types";

afterEach(() => vi.restoreAllMocks());

function fixture(preset: FormationPresetId = "arrow", count = 5, leaderIndex = 0): GameState {
  const leaderId = `m${leaderIndex}`;
  const roles = ["defender", "fighter", "support", "gatherer", "none"] as const;
  const members = Array.from({ length: count }, (_, i) => createCompanion(`m${i}`, { x: 30, y: 30 }, leaderId, roles[i], i));
  const assignments = assignFormationSlots(members, leaderId, preset)!;
  const positions = transformFormationSlots(assignments, members[leaderIndex], { x: 0, y: -1 });
  const state = createTestGameState({ currentMapId: "hub", partyLeaderId: leaderId, selectedFormationPreset: preset, formationAssignments: assignments,
    simulationFrame: 1, simulationTimeMs: 1000, simulationDeltaMs: 100,
    map: { columns: 70, rows: 70, walls: [], teleports: [], healingFountains: [], debugName: "formations", displayName: "Formations" },
    entities: Object.fromEntries(members.map(member => [member.id, { ...member, position: positions[member.id] }])) });
  state.map!.navigationGrid = bakeNavigationGrid(state.map!);
  return state;
}

function advance(state: GameState, deltaMs: number): GameState {
  return advanceFormationTransition({ ...state, simulationFrame: (state.simulationFrame ?? 0) + 1,
    simulationTimeMs: (state.simulationTimeMs ?? 0) + deltaMs, simulationDeltaMs: deltaMs });
}
const switchTo = (state: GameState, preset: FormationPresetId) => reconcileFormationAssignments(selectFormationPreset(state, preset));
const positions = (state: GameState) => transformFormationSlots(state.formationAssignments!, state.entities[state.partyLeaderId] as Companion, { x: 0, y: -1 });

describe("formation preset geometry transitions", () => {
  it("blends every directed pair, size, and leader slot while keeping the leader anchored", () => {
    for (const from of FORMATION_CHOICES) for (const to of FORMATION_CHOICES) {
      if (from.id === to.id) continue;
      for (let count = 1; count <= 5; count++) for (let leader = 0; leader < count; leader++) {
        const original = fixture(from.id, count, leader), before = positions(original);
        let state = switchTo(original, to.id);
        expect(positions(state)).toEqual(before);
        const destination = { ...state.formationAssignments!, transition: undefined };
        const startOffsets = getEffectiveFormationOffsets(state.formationAssignments!), endOffsets = getEffectiveFormationOffsets(destination);
        state = advance(state, 250);
        const offsets = getEffectiveFormationOffsets(state.formationAssignments!);
        for (const id of Object.keys(offsets)) {
          expect(offsets[id].side).toBeCloseTo(startOffsets[id].side * 0.75 + endOffsets[id].side * 0.25);
          expect(offsets[id].forward).toBeCloseTo(startOffsets[id].forward * 0.75 + endOffsets[id].forward * 0.25);
        }
        for (const facing of [{ x: 1, y: 0 }, { x: -3, y: 4 }, { x: 0, y: 0 }]) {
          const actor = state.entities[state.partyLeaderId] as Companion;
          expect(transformFormationSlots(state.formationAssignments!, actor, facing)[actor.id]).toEqual(actor.position);
        }
        state = advance(state, 750);
        expect(state.formationAssignments?.transition).toBeUndefined();
        expect(getEffectiveFormationOffsets(state.formationAssignments!)).toEqual(endOffsets);
      }
    }
  });

  it("replaces from current geometry and observes only the last pre-boundary choice", () => {
    const original = fixture();
    expect(reconcileFormationAssignments(selectFormationPreset(selectFormationPreset(original, "balanced"), "arrow")).formationAssignments).toBe(original.formationAssignments);
    const partial = advance(switchTo(original, "balanced"), 400), before = positions(partial);
    let next = switchTo(partial, "side-by-side");
    expect(positions(next)).toEqual(before);
    expect(next.formationAssignments?.transition?.elapsedMs).toBe(0);
    expect(advanceFormationTransition(next)).toBe(next); // Same frame was already advanced.
    next = advance(next, 999);
    expect(next.formationAssignments?.transition?.elapsedMs).toBe(999);
    expect(advance(next, 1).formationAssignments?.transition).toBeUndefined();
  });

  it("does not advance on reads, duplicate calls, zero delta, or unavailable anchors", () => {
    let state = advance(switchTo(fixture(), "side-by-side"), 0);
    expect(state.formationAssignments?.transition?.elapsedMs).toBe(0);
    state = advance(state, 100);
    const elapsed = state.formationAssignments?.transition?.elapsedMs;
    expect(advanceFormationTransition(state)).toBe(state);
    for (let i = 0; i < 10; i++) {
      positions(state); getEffectiveFormationOffsets(state.formationAssignments!); reconcileFormationAssignments(state);
      prepareCombatFormation(state); prepareTravelFormation(state);
    }
    expect(state.formationAssignments?.transition?.elapsedMs).toBe(elapsed);
    const dead = { ...state, entities: { ...state.entities, m0: { ...state.entities.m0 as Companion, health: 0, state: "dead" as const } } };
    expect(advance(dead, 1000).formationAssignments?.transition?.elapsedMs).toBe(elapsed);
    expect(positions(dead)).toEqual({});
    expect(advance(state, 100000).formationAssignments?.transition).toBeUndefined();
  });

  it("freezes during rally and reward pauses without letting task departures freeze the party", () => {
    const state = switchTo(fixture(), "balanced");
    const rally = { ...state, activeTeleport: { id: "test", position: { x: 30, y: 30 }, range: 3,
      sourceMapId: "hub", targetMapId: "map-1", triggeredBy: "ai" } as NonNullable<GameState["activeTeleport"]> };
    expect(advance(rally, 1000).formationAssignments?.transition?.elapsedMs).toBe(0);
    const paused = { ...state, slimewardDungeon: { chest: { isUiOpen: true } } as GameState["slimewardDungeon"] };
    expect(updateGame(paused).formationAssignments?.transition?.elapsedMs).toBe(0);
    const actor = state.entities.m1 as Companion;
    state.entities.m1 = { ...actor, state: "gather", currentTargetId: "resource" };
    expect(advance(state, 100).formationAssignments?.transition?.elapsedMs).toBe(100);
  });

  it("retargets structural edits, prunes removal, and keeps death holes during a blend", () => {
    let state = advance(switchTo(fixture(), "balanced"), 300);
    const before = getEffectiveFormationOffsets(state.formationAssignments!);
    state = reconcileFormationAssignments(setPartyMemberRole(state, "m1", "support"));
    expect(getEffectiveFormationOffsets(state.formationAssignments!)).toEqual(before);
    state = reconcileFormationAssignments(setPartyLeader(state, "m2"));
    expect(positions(state).m2).toEqual(state.entities.m2.position);
    const order = reconcileFormationAssignments(setPartyOrder(setPartyOrder(state, "m1", 2), "m2", 1));
    expect(order.formationAssignments?.members.find(member => member.id === "m1")?.partyOrder).toBe(2);
    state = { ...order, entities: { ...order.entities, m3: { ...order.entities.m3 as Companion, state: "dead", health: 0 } } };
    expect(reconcileFormationAssignments(state).formationAssignments?.members).toHaveLength(5);
    const entities = { ...state.entities }; delete entities.m4;
    state = reconcileFormationAssignments({ ...state, entities });
    expect(state.formationAssignments?.transition?.fromOffsetsByEntityId.m4).toBeUndefined();
    expect(state.formationAssignments?.members).toHaveLength(4);
  });

  it("shares blended center projection with targeting without searches or mutations", () => {
    const state = advance(switchTo(fixture("arrow", 5, 2), "side-by-side"), 250);
    const offsets = getEffectiveFormationOffsets(state.formationAssignments!), leader = state.entities.m2 as Companion;
    const center = { x: leader.position.x - offsets.m2.side, y: leader.position.y - 4 };
    const target = createEnemy("center", center, "passive");
    const path = vi.spyOn(movement, "getBoundedPathDistance"), before = JSON.stringify(state);
    expect(getFormationTargetScore(state, leader, target, 0, false)?.lane).toBe("center");
    expect(JSON.stringify(state)).toBe(before);
    expect(path).not.toHaveBeenCalled();
  });

  it("keeps active passage order and trail history across selection", () => {
    let state = prepareTravelFormation(fixture());
    state.formationAssignments!.travel = { ...state.formationAssignments!.travel!, trailing: true,
      trailOrder: ["m4", "m3", "m2", "m1"], trail: [{ x: 20, y: 30 }, { x: 30, y: 30 }] };
    const trail = state.formationAssignments!.travel.trail;
    state = switchTo(state, "side-by-side");
    state = prepareTravelFormation(state);
    expect(state.formationAssignments?.travel?.trailOrder).toEqual(["m4", "m3", "m2", "m1"]);
    expect(state.formationAssignments?.travel?.trail).toBe(trail);
  });

  it("revalidates a retained substitute for a fresh 500 ms after changing geometry", () => {
    let state = prepareTravelFormation(fixture());
    const expected = state.entities.m3.position, substitute = { ...expected, x: expected.x + 0.5 };
    state.entities.m3 = { ...state.entities.m3, position: substitute };
    state.formationAssignments!.travel!.goalsByEntityId.m3 = {
      position: substitute, expectedPosition: expected, mode: "substitute", settled: true, clearSinceMs: 700,
    };
    state = switchTo(state, "balanced");
    expect(state.formationAssignments!.travel!.goalsByEntityId.m3).toMatchObject({ position: substitute, clearSinceMs: undefined });
    state = moveTravelFormationMember(advance(state, 250), state.entities.m3 as Companion);
    expect(state.formationAssignments!.travel!.goalsByEntityId.m3).toMatchObject({ position: substitute, mode: "substitute", clearSinceMs: 1250 });
    const reconciled = reconcileFormationAssignments(state);
    expect(reconciled.formationAssignments).toBe(state.formationAssignments);
    state = moveTravelFormationMember(advance(state, 499), state.entities.m3 as Companion);
    expect(state.formationAssignments!.travel!.goalsByEntityId.m3.position).toEqual(substitute);
    state = moveTravelFormationMember(advance(state, 1), state.entities.m3 as Companion);
    expect(state.formationAssignments!.travel!.goalsByEntityId.m3.mode).toBe("normal");
  });

  it("never resets committed movement or target evidence on selection and reconciliation", () => {
    let state = fixture();
    const actor = state.entities.m1 as Companion;
    state = movement.moveEntityTowardPositionIfUnoccupied(state, actor, { x: 35, y: 35 }, { source: "follow" });
    const results = state.normalMovementResultsByEntityId, commits = state.movementPositionCommitsByEntityId, reservations = state.reservedPositionsByEntityId;
    const paths = state.movementPathsByEntityId;
    state = { ...state, targetApproachesByEntityId: { m1: { key: "evidence" } as NonNullable<GameState["targetApproachesByEntityId"]>[string] } };
    const evidence = state.targetApproachesByEntityId;
    state = switchTo(state, "balanced");
    expect(state.normalMovementResultsByEntityId).toBe(results);
    expect(state.movementPositionCommitsByEntityId).toBe(commits);
    expect(state.reservedPositionsByEntityId).toBe(reservations);
    expect(state.movementPathsByEntityId).toBe(paths);
    expect(state.targetApproachesByEntityId).toBe(evidence);
    expect(createSavedGame(state, 2000).state.selectedFormationPreset).toBe("balanced");
  });

  it("keeps the preference across normal and debug runtime cleanup", () => {
    for (const clean of [clearMapTransitionRuntimeState, (state: GameState) => debugTeleportToHub(state, "hub"), debugTeleportToSlimewardCamp, debugResetSlimewardDungeon]) {
      const original = { ...switchTo(fixture(), "balanced"), formationPathSearchesByEntityId: {
        m1: { requestKey: "formation", lastQueryAtMs: 1000, failed: true },
      } };
      const next = clean({ ...original, currentMapId: SLIMEWARD_FLOOR_ONE_ID });
      expect(next.selectedFormationPreset).toBe("balanced");
      expect(next.formationAssignments).toBeUndefined();
      expect(Object.keys(next.formationPathSearchesByEntityId ?? {})).toHaveLength(0);
    }
  });

  it("uses one publication budget over 100 switching/travel updates and settles for another 30", () => {
    let state = fixture();
    const counts = new Map<string, number>(), commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((snapshot, actor) => {
      const next = commit(snapshot, actor);
      if (next.entities[actor.id].position !== snapshot.entities[actor.id].position) {
        const key = `${snapshot.simulationFrame}:${actor.id}`; counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return next;
    });
    for (let frame = 2; frame <= 131; frame++) {
      if (frame === 2 || frame === 32 || frame === 62) state = selectFormationPreset(state, FORMATION_CHOICES[(frame - 2) / 30].id);
      state = updateGame(state, { frameNumber: frame, nowMs: 1000 + (frame - 1) * 100, deltaMs: 100 });
      expect(Math.max(0, ...Object.values(state.normalMovementResultsByEntityId ?? {}).map(result => result.positionCommitCount))).toBeLessThanOrEqual(1);
    }
    expect(state.formationAssignments?.preset).toBe("side-by-side");
    expect(state.formationAssignments?.transition).toBeUndefined();
    expect(Math.max(...counts.values())).toBe(1);
  }, 60000);
});
