import { afterEach, describe, expect, it, vi } from "vitest";
import * as slots from "./attackSlots";
import { createCompanion, createEnemy } from "./entities";
import { clearDirectCommandPlanning } from "./directCommandState";
import { createNormalMovementRequest } from "./movementAuthority";
import { clearFrameMovementPlanning } from "./movementState";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { createTestGameState } from "./testState";
import { applyTargetCommitment, canReacquireCombatTarget, clearTargetCommitmentsForTarget, getSustainedBlockerTarget, observeTargetApproach,
  pruneTargetCommitmentState, selectTargetCommitment } from "./targetCommitment";
import type { NormalMovementResult } from "./movementTypes";
import type { Companion, GameMap } from "./types";
import type { GameState } from "./state";
import { bakeNavigationGrid } from "./navigation";

const map: GameMap = { columns: 30, rows: 25, walls: [], teleports: [], healingFountains: [], displayName: "Commitment", debugName: "commitment" };
map.navigationGrid = bakeNavigationGrid(map);
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const actor: Companion = { ...createCompanion("actor", { x: 5, y: 5 }, "actor", "fighter"), state: "attack", currentTargetId: "target" };
  const target = createEnemy("target", { x: 12, y: 5 }, "passive", { maxHealth: 10000 });
  const blocker = createEnemy("blocker", { x: 6.5, y: 5 }, "passive", { maxHealth: 10000 });
  const ally = createCompanion("ally", { x: 5, y: 6 }, actor.id, "support");
  const state = createTestGameState({ map, entities: { actor, target, blocker, ally }, partyLeaderId: actor.id, autoModeEnabled: true,
    leaderIntent: { type: "attack", targetId: target.id, targetPosition: target.position, source: "ai" } });
  return { actor, target, blocker, ally, state };
}
function wait(state: GameState, frame: number, blockers = ["blocker"], outcome: NormalMovementResult["outcome"] = "held"): GameState {
  state = clearFrameMovementPlanning({ ...state, simulationFrame: frame, simulationTimeMs: frame * 100, simulationDeltaMs: 100 });
  const actor = state.entities.actor as Companion;
  const request = createNormalMovementRequest(state, actor, state.entities.target.position, { source: "attack", pathTargetKey: "target" });
  return observeTargetApproach(state, { request, outcome, reason: "crowd_wait", from: actor.position, to: actor.position,
    frameNumber: frame, timeMs: frame * 100, positionCommitCount: 0, blockingEnemyIds: blockers });
}

describe("automatic target commitment", () => {
  it("retains a passive hunting target despite stale blockers or closer enemies", () => {
    const { actor, target, state } = fixture();
    state.movementFailuresByEntityId = { actor: { blockerId: "blocker", blockerKind: "enemy" } };
    expect(selectTargetCommitment(state, actor)).toMatchObject({ kind: "retain", target });
    expect(state.targetApproachesByEntityId).toBeUndefined();
  });

  it.each([35, 36])("uses the inclusive 35%% critical-ally boundary (%i HP)", health => {
    const { actor, state, ally, blocker } = fixture();
    state.entities.ally = { ...ally, maxHealth: 100, health };
    state.entities.blocker = { ...blocker, state: "attack", currentTargetId: ally.id };
    expect(selectTargetCommitment(state, actor)).toMatchObject(health === 35
      ? { kind: "switch", reason: "critical_ally", priority: 2, local: true, target: { id: blocker.id } }
      : { kind: "retain", target: { id: "target" } });
  });

  it("keeps equal personal attackers stable and permits a higher emergency", () => {
    const { actor, state, target, blocker, ally } = fixture();
    state.entities.target = { ...target, state: "attack", currentTargetId: actor.id };
    state.entities.blocker = { ...blocker, state: "attack", currentTargetId: actor.id };
    expect(selectTargetCommitment(state, actor).target?.id).toBe(target.id);
    state.entities.blocker = { ...blocker, state: "attack", currentTargetId: ally.id };
    state.entities.ally = { ...ally, health: 1 };
    const next = applyTargetCommitment(state, actor, selectTargetCommitment(state, actor));
    next.entities.ally = ally;
    expect(selectTargetCommitment(next, next.entities.actor as Companion)).toMatchObject({ kind: "retain", priority: 2, target: { id: blocker.id } });
    expect(next.leaderIntent).toEqual(state.leaderIntent);
  });

  it.each(["defender", "fighter", "support", "gatherer"] as const)("protects a critical %s ally with the same threshold", role => {
    const { state, actor, ally, blocker } = fixture();
    state.entities.ally = { ...ally, role, maxHealth: 100, health: 35 };
    state.entities.blocker = { ...blocker, state: "attack", currentTargetId: ally.id };
    expect(selectTargetCommitment(state, actor)).toMatchObject({ kind: "switch", reason: "critical_ally", target: { id: blocker.id } });
  });

  it("does not interrupt a floor command or a player party order", () => {
    const { actor, state, blocker } = fixture();
    state.entities.blocker = { ...blocker, state: "attack", currentTargetId: actor.id };
    state.directCompanionCommandsById = { actor: { type: "move", companionId: actor.id, targetPosition: { x: 15, y: 5 }, issuedAt: 0 } };
    expect(selectTargetCommitment(state, actor)).toMatchObject({ reason: "player_focus", target: { id: "target" } });
    state.directCompanionCommandsById = {};
    state.leaderIntent = { ...state.leaderIntent!, source: "player" };
    expect(selectTargetCommitment(state, actor)).toMatchObject({ reason: "player_focus", target: { id: "target" } });
  });

  it("requires sustained evidence and two spaced checks, then responds locally", () => {
    let { state } = fixture();
    const probe = vi.spyOn(slots, "probeAttackEngagement").mockImplementation((world, _actor, target) =>
      ({ reachable: target.id === "blocker" || !world.entities.blocker }));
    for (let frame = 1; frame <= 12; frame++) {
      state = wait(state, frame);
      expect(selectTargetCommitment(state, state.entities.actor as Companion).target?.id).toBe("target");
    }
    state = wait(state, 13);
    expect(state.targetApproachesByEntityId?.actor).toMatchObject({ noProgressMs: 1300, failedChecks: 2, blockerMs: 1300, hardUnreachable: false });
    expect(selectTargetCommitment(state, state.entities.actor as Companion)).toMatchObject({ kind: "switch", reason: "sustained_obstruction", local: true });
    const calls = probe.mock.calls.length;
    for (let index = 0; index < 30; index++) getSustainedBlockerTarget(state, state.entities.actor as Companion);
    expect(probe).toHaveBeenCalledTimes(calls);
    const next = applyTargetCommitment(state, state.entities.actor as Companion, selectTargetCommitment(state, state.entities.actor as Companion));
    expect(next.leaderIntent).toEqual(state.leaderIntent);
    expect(canReacquireCombatTarget(next, next.entities.actor as Companion, next.entities.target as ReturnType<typeof createEnemy>)).toBe(false);
  });

  it("cannot combine alternating blockers into continuous evidence across 40 updates", () => {
    const { state: initial, blocker } = fixture();
    let state = initial;
    state.entities.second = { ...blocker, id: "second" };
    vi.spyOn(slots, "probeAttackEngagement").mockImplementation(world => ({ reachable: !world.entities.blocker }));
    for (let frame = 1; frame <= 40; frame++) {
      state = wait(state, frame, [frame % 2 ? "blocker" : "second"]);
      expect(selectTargetCommitment(state, state.entities.actor as Companion).target?.id).toBe("target");
      expect(state.targetApproachesByEntityId?.actor.blockerMs).toBe(100);
    }
  });

  it("pauses on an intentional hold and never advances twice for one result", () => {
    let { state } = fixture();
    state = wait(state, 1);
    state = wait(state, 2);
    const before = state.targetApproachesByEntityId?.actor.noProgressMs;
    const actor = state.entities.actor as Companion;
    const request = createNormalMovementRequest(state, actor, state.entities.target.position, { source: "attack" }, "hold");
    const result: NormalMovementResult = { request, outcome: "held", reason: "hold", from: actor.position, to: actor.position,
      positionCommitCount: 0, frameNumber: 3, timeMs: 300 };
    state = observeTargetApproach({ ...state, simulationFrame: 3, simulationTimeMs: 300 }, result);
    expect(state.targetApproachesByEntityId?.actor.noProgressMs).toBe(before);
    expect(observeTargetApproach(state, result)).toBe(state);
  });

  it("treats no-map checks as unknown and releases only confirmed hard unreachability", () => {
    let { state } = fixture();
    state.map = undefined;
    for (let frame = 1; frame <= 30; frame++) state = wait(state, frame);
    expect(state.targetApproachesByEntityId?.actor.failedChecks).toBe(0);
    state = fixture().state;
    vi.spyOn(slots, "probeAttackEngagement").mockReturnValue({ reachable: false });
    for (let frame = 1; frame <= 13; frame++) state = wait(state, frame, []);
    expect(selectTargetCommitment(state, state.entities.actor as Companion)).toMatchObject({ kind: "release", reason: "unreachable_engagement" });
  });

  it("invalidates failed checks after body growth and reacquires only after changed, reachable evidence", () => {
    let { state } = fixture();
    state.entities.target = { ...state.entities.target, combatBodyRadius: 1.25 } as ReturnType<typeof createEnemy>;
    const probe = vi.spyOn(slots, "probeAttackEngagement").mockReturnValue({ reachable: false });
    for (let frame = 1; frame <= 10; frame++) state = wait(state, frame, []);
    expect(state.targetApproachesByEntityId?.actor.failedChecks).toBe(1);
    state.entities.target = { ...state.entities.target, combatSizeMultiplier: 1.5 } as ReturnType<typeof createEnemy>;
    state = wait(state, 13, []);
    expect(state.targetApproachesByEntityId?.actor.failedChecks).toBe(1);
    state = wait(state, 16, []);
    state = applyTargetCommitment(state, state.entities.actor as Companion, selectTargetCommitment(state, state.entities.actor as Companion));
    const actor = state.entities.actor as Companion, target = state.entities.target as ReturnType<typeof createEnemy>;
    expect(canReacquireCombatTarget(state, actor, target)).toBe(false);
    probe.mockReturnValue({ reachable: true, position: { x: 10, y: 5 } });
    state.entities.blocker = { ...state.entities.blocker, state: "dead", health: 0 } as ReturnType<typeof createEnemy>;
    state = pruneTargetCommitmentState({ ...state, simulationTimeMs: 1900 });
    expect(canReacquireCombatTarget(state, actor, target)).toBe(true);
    const count = probe.mock.calls.length;
    pruneTargetCommitmentState(state);
    for (let index = 0; index < 10; index++) canReacquireCombatTarget(state, actor, target);
    expect(probe).toHaveBeenCalledTimes(count);
  });

  it("does not credit external displacement or count suspended time as approach progress", () => {
    let { state } = fixture();
    state = wait(state, 1);
    const actor = { ...state.entities.actor, position: { x: 8, y: 5 } } as Companion;
    state = { ...state, simulationFrame: 2, simulationTimeMs: 200, entities: { ...state.entities, actor } };
    const request = createNormalMovementRequest(state, actor, state.entities.target.position, { source: "attack" });
    const result: NormalMovementResult = { request, outcome: "held", reason: "crowd_wait", from: actor.position, to: actor.position,
      frameNumber: 2, timeMs: 200, positionCommitCount: 0 };
    state = observeTargetApproach(state, result);
    expect(state.targetApproachesByEntityId?.actor.noProgressMs).toBe(200);
    state = { ...state, simulationFrame: 3, simulationTimeMs: 300,
      externalMovementOwnersByEntityId: { actor: { source: "forced", positionCommitted: true } } };
    state = observeTargetApproach(state, { ...result, frameNumber: 3, timeMs: 300 });
    expect(state.targetApproachesByEntityId?.actor.noProgressMs).toBe(200);
  });

  it("retains independent rejections and bounds changed-condition probes across targets", () => {
    const { state: initial, blocker } = fixture();
    let state = initial;
    const second = createEnemy("second", { x: 15, y: 7 }, "passive");
    state.entities.second = second;
    const probe = vi.spyOn(slots, "probeAttackEngagement").mockReturnValue({ reachable: false });
    for (let frame = 1; frame <= 13; frame++) state = wait(state, frame, []);
    state = applyTargetCommitment(state, state.entities.actor as Companion, selectTargetCommitment(state, state.entities.actor as Companion));
    state = applyTargetCommitment(state, state.entities.actor as Companion,
      selectTargetCommitment(state, state.entities.actor as Companion, { preferredTarget: second }));
    for (let frame = 14; frame <= 26; frame++) state = wait(state, frame, []);
    state = applyTargetCommitment(state, state.entities.actor as Companion, selectTargetCommitment(state, state.entities.actor as Companion));
    const actor = state.entities.actor as Companion;
    expect(Object.keys(state.rejectedCombatTargetsByEntityId?.actor ?? {}).sort()).toEqual(["second", "target"]);
    expect(canReacquireCombatTarget(state, actor, state.entities.target as ReturnType<typeof createEnemy>)).toBe(false);
    expect(canReacquireCombatTarget(state, actor, second)).toBe(false);
    state.entities.blocker = { ...blocker, position: { x: 7, y: 5 } };
    probe.mockReturnValue({ reachable: true, position: { x: 10, y: 5 } });
    const calls = probe.mock.calls.length;
    state = pruneTargetCommitmentState({ ...state, simulationTimeMs: 3000 });
    expect(probe).toHaveBeenCalledTimes(calls + 1);
    state = pruneTargetCommitmentState(state);
    expect(probe).toHaveBeenCalledTimes(calls + 1);
    expect(Object.values(state.rejectedCombatTargetsByEntityId!.actor).filter(entry => entry.reachable)).toHaveLength(1);
    const checked = Object.values(state.rejectedCombatTargetsByEntityId!.actor).find(entry => entry.reachable)!;
    let cleaned = clearTargetCommitmentsForTarget(state, checked.targetId);
    cleaned = pruneTargetCommitmentState({ ...cleaned, simulationTimeMs: 3100 });
    expect(probe).toHaveBeenCalledTimes(calls + 1);
    expect(cleaned.targetEngagementProbeAtMsByEntityId?.actor).toBe(3000);
    state = pruneTargetCommitmentState({ ...state, simulationTimeMs: 3250 });
    expect(Object.values(state.rejectedCombatTargetsByEntityId!.actor).every(entry => entry.reachable)).toBe(true);
    expect(Object.keys(clearTargetCommitmentsForTarget(state, second.id).rejectedCombatTargetsByEntityId!.actor)).toEqual(["target"]);
    expect(clearDirectCommandPlanning(state, actor.id).rejectedCombatTargetsByEntityId?.actor).toBeUndefined();
  });

  it("pauses rejection probes during displacement and resumes with fresh evidence afterward", () => {
    const { state: initial, actor, target } = fixture();
    let state = applyTargetCommitment(initial, actor, { kind: "release", target: null, reason: "unreachable_engagement", priority: 0, local: false });
    state.entities.blocker = { ...state.entities.blocker, state: "dead", health: 0 } as ReturnType<typeof createEnemy>;
    const probe = vi.spyOn(slots, "probeAttackEngagement").mockReturnValue({ reachable: true, position: { x: 10, y: 5 } });
    state.externalMovementOwnersByEntityId = { actor: { source: "forced", positionCommitted: false } };
    state = pruneTargetCommitmentState({ ...state, simulationTimeMs: 1000 });
    expect(probe).not.toHaveBeenCalled();
    expect(canReacquireCombatTarget(state, state.entities.actor as Companion, target)).toBe(false);
    state.externalMovementOwnersByEntityId = {};
    state = pruneTargetCommitmentState(state);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(canReacquireCombatTarget(state, state.entities.actor as Companion, target)).toBe(true);
    expect(clearMapTransitionRuntimeState(state).targetEngagementProbeAtMsByEntityId).toEqual({});
    delete state.entities.actor;
    expect(pruneTargetCommitmentState(state).targetEngagementProbeAtMsByEntityId).toEqual({});
  });

  it("preserves committed results, reservations, and budget during a target switch", () => {
    const { state, actor, blocker } = fixture();
    state.entities.blocker = { ...blocker, state: "attack", currentTargetId: actor.id };
    state.movementPositionCommitsByEntityId = { actor: { source: "attack", transactionId: "walk", from: actor.position, to: actor.position, frameNumber: 0, timeMs: 0 } };
    state.reservedPositionsByEntityId = { actor: actor.position };
    const next = applyTargetCommitment(state, actor, selectTargetCommitment(state, actor));
    expect(next.movementPositionCommitsByEntityId).toBe(state.movementPositionCommitsByEntityId);
    expect(next.reservedPositionsByEntityId).toBe(state.reservedPositionsByEntityId);
    expect(next.entities.actor.position).toEqual(actor.position);
  });

  it("releases a local chase outside the role leash but permits an in-range defensive attack", () => {
    const { state: initial, actor, blocker } = fixture();
    let state = initial;
    state.entities.blocker = { ...blocker, state: "attack", currentTargetId: actor.id };
    state = applyTargetCommitment(state, actor, selectTargetCommitment(state, actor));
    state.partyLeaderId = "ally";
    state.entities.actor = { ...state.entities.actor, position: { x: 20, y: 5 } } as Companion;
    state.entities.blocker = { ...state.entities.blocker, position: { x: 23, y: 5 } } as ReturnType<typeof createEnemy>;
    expect(selectTargetCommitment(state, state.entities.actor as Companion)).toMatchObject({ kind: "release", reason: "leash_failure" });
    state.entities.blocker = { ...state.entities.blocker, position: { x: 21.5, y: 5 } } as ReturnType<typeof createEnemy>;
    expect(selectTargetCommitment(state, state.entities.actor as Companion)).toMatchObject({ kind: "retain", target: { id: blocker.id } });
  });

  it("clears observations on replacement and transition and prunes missing actors", () => {
    let { state } = fixture();
    state = wait(state, 1);
    expect(clearDirectCommandPlanning(state, "actor").targetApproachesByEntityId?.actor).toBeUndefined();
    expect(clearMapTransitionRuntimeState(state).targetApproachesByEntityId).toEqual({});
    delete state.entities.actor;
    expect(pruneTargetCommitmentState(state).targetApproachesByEntityId).toEqual({});
  });

  it("releases missing, suppressed, and unavailable encounter targets for explicit reasons", () => {
    const { state, actor, target } = fixture();
    delete state.entities.target;
    expect(selectTargetCommitment(state, actor)).toMatchObject({ kind: "release", reason: "target_removed" });
    state.entities.target = target;
    state.autonomousTargetSuppressionsByEnemyId = { target: { enemyId: target.id, expiresAtMs: 1000, reason: "phase" } };
    expect(selectTargetCommitment(state, actor)).toMatchObject({ kind: "release", reason: "scripted_suppression" });
    state.autonomousTargetSuppressionsByEnemyId = {};
    state.entities.target = { ...target, enemyTypeId: "orc_warmaster" };
    state.warmasterLifecycle = { phase: "defeated", sequence: 1, recharge: 0, rescued: false };
    expect(selectTargetCommitment(state, actor)).toMatchObject({ kind: "release", reason: "encounter_invalidated" });
  });
});
