import { afterEach, describe, expect, it, vi } from "vitest";
import * as authority from "./movementAuthority";
import * as followSystem from "./followSystem";
import { createCompanion, createEnemy } from "./entities";
import { beginNormalMovementPhase, claimExternalMovement, createNormalMovementRequest, getNormalMovementResult, releaseExternalMovement, selectNormalMovementRequest } from "./movementAuthority";
import { endNormalMovementPhase, holdEntityMovement, moveEntityToPositionIfUnoccupied, moveEntityTowardPositionIfUnoccupied, resolveNormalMovement, resolveNormalMovementRequests } from "./movementPlanning";
import { clearFrameMovementPlanning } from "./movementState";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { createTestGameState } from "./testState";
import { updateAttackSystem } from "./attackSystem";
import { updateGatherSystem } from "./gatherSystem";
import { createResource } from "./entities";
import { sanitizeGameStateForSave } from "./saveGame";
import { recordDebugTelemetryTick, startDebugTelemetryRecording } from "./debugTelemetry";
import { issuePartyOrder } from "./commands";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { triggerMapTeleport } from "./teleportSystem";
import { updateGame } from "./updateGame";
import type { MovementOptions } from "./movementTypes";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const actor = createCompanion("actor", { x: 5, y: 5 }, "actor", "fighter");
  const state = createTestGameState({ entities: { actor }, partyLeaderId: actor.id, simulationTimeMs: 100,
    map: { columns: 20, rows: 20, walls: [], teleports: [], healingFountains: [], displayName: "Movement authority", debugName: "movement-authority" } });
  return { actor, state };
}

describe("normal movement authority", () => {
  it("preclaims a direct move even when a lower source runs first, without planning the loser", () => {
    const { actor, state } = fixture();
    state.directCompanionCommandsById = { actor: { type: "move", companionId: actor.id, targetPosition: { x: 10, y: 5 }, issuedAt: 0 } };
    const follow = createNormalMovementRequest(state, actor, { x: 5, y: 10 }, { source: "follow" });
    const direct = createNormalMovementRequest(state, actor, { x: 10, y: 5 }, { source: "direct" });
    for (const requests of [[follow, direct], [direct, follow]]) expect(selectNormalMovementRequest(state, requests)).toEqual(direct);
    consumeGamePerformanceMetrics();
    expect(resolveNormalMovement(state, follow)).toEqual({ state, outcome: "deferred" });
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(state.moveIntentsByEntityId?.actor).toBeUndefined();
    const moved = resolveNormalMovement(state, direct);
    expect(moved.outcome).toBe("moved");
    expect(moved.state.entities.actor.position.x).toBeGreaterThan(actor.position.x);
  });

  it("uses stable source and destination ties, not submission order", () => {
    const { actor, state } = fixture();
    const a = createNormalMovementRequest(state, actor, { x: 9, y: 5 }, { source: "follow" });
    const b = createNormalMovementRequest(state, actor, { x: 5, y: 9 }, { source: "follow" });
    expect(selectNormalMovementRequest(state, [a, b])).toEqual(selectNormalMovementRequest(state, [b, a]));
    expect(resolveNormalMovementRequests(state, actor.id, [a, b]).state.entities.actor.position)
      .toEqual(resolveNormalMovementRequests(state, actor.id, [b, a]).state.entities.actor.position);
  });

  it.each(["priority", "destination tie"])("arbitrates %s through the production adapters before planning", tie => {
    const { actor, state } = fixture();
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const requests: { position: { x: number; y: number }; options: MovementOptions }[] = [
      { position: { x: 5, y: 10 }, options: { source: "follow" } },
      { position: { x: 10, y: 5 }, options: { source: tie === "priority" ? "compatibility" : "follow" } },
    ];
    const results = [requests, [...requests].reverse()].map(order => {
      let pending = beginNormalMovementPhase(state);
      for (const { position, options } of order)
        pending = moveEntityTowardPositionIfUnoccupied(pending, actor, position, options);
      expect(pending.entities.actor.position).toEqual(actor.position);
      expect(getNormalMovementResult(pending, actor.id)).toBeUndefined();
      return endNormalMovementPhase(pending);
    });
    expect(results[0].entities.actor.position).toEqual(results[1].entities.actor.position);
    expect(getNormalMovementResult(results[0], actor.id)?.request.source).toBe(tie === "priority" ? "compatibility" : "follow");
    expect(getNormalMovementResult(results[0], actor.id)?.request.destination).toEqual(tie === "priority" ? requests[1].position : requests[0].position);
    expect(commits).toHaveBeenCalledTimes(2);
  });

  it("keeps a queued winner's guard and never plans a losing or duplicate request", () => {
    const { actor, state } = fixture();
    const loserGuard = vi.fn(() => true);
    const winnerGuard = vi.fn(() => false);
    const options: MovementOptions = { source: "compatibility", isPositionAllowed: winnerGuard };
    let pending = beginNormalMovementPhase(state);
    pending = moveEntityTowardPositionIfUnoccupied(pending, actor, { x: 5, y: 10 }, { source: "follow", isPositionAllowed: loserGuard });
    pending = moveEntityTowardPositionIfUnoccupied(pending, actor, { x: 10, y: 5 }, options);
    expect(moveEntityTowardPositionIfUnoccupied(pending, actor, { x: 10, y: 5 }, options)).toBe(pending);
    expect(loserGuard).not.toHaveBeenCalled();
    expect(winnerGuard).not.toHaveBeenCalled();
    const next = endNormalMovementPhase(pending);
    expect(winnerGuard).toHaveBeenCalledOnce();
    expect(loserGuard).not.toHaveBeenCalled();
    expect(getNormalMovementResult(next, actor.id)).toMatchObject({ outcome: "blocked", request: { source: "compatibility" } });
    expect(next.movementFailureMsByEntityId?.actor).toBe(100);
    expect(next.reservedPositionsByEntityId?.actor).toBeUndefined();
    expect(next.followTrailsByEntityId).toEqual(state.followTrailsByEntityId);
    expect(moveEntityTowardPositionIfUnoccupied(next, actor, { x: 5, y: 10 }, { source: "follow" })).toBe(next);
  });

  it("selects the same higher-priority request regardless of producer order inside updateGame", () => {
    const { actor, state } = fixture();
    const leader = createCompanion("leader", { x: 12, y: 5 }, "leader", "fighter");
    const follower = { ...actor, state: "follow" as const, followTargetId: leader.id, currentTargetId: leader.id };
    const initial = { ...state, entities: { leader, actor: follower }, partyLeaderId: leader.id };
    const originalFollow = followSystem.updateFollowSystem;
    const producer = vi.spyOn(followSystem, "updateFollowSystem");
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const results = ["before", "after"].map(order => {
      producer.mockImplementation((current, movedIds) => {
        const requestOther = (pending: typeof current) => moveEntityTowardPositionIfUnoccupied(
          pending, pending.entities.actor, { x: 5, y: 12 }, { source: "compatibility" },
        );
        return order === "before" ? originalFollow(requestOther(current), movedIds)
          : requestOther(originalFollow(current, movedIds));
      });
      return updateGame(initial, { nowMs: 200, deltaMs: 100, deltaSeconds: 0.1, frameNumber: 1 });
    });
    for (const result of results) {
      expect(getNormalMovementResult(result, actor.id)?.request.source).toBe("compatibility");
      expect(result.entities.actor.position.y).toBeGreaterThan(actor.position.y);
      expect(result.normalMovementPhase).toBeUndefined();
      expect(result.followTrailsByEntityId.actor).toEqual([actor.position]);
    }
    expect(results[0].entities.actor.position).toEqual(results[1].entities.actor.position);
    expect(commits).toHaveBeenCalledTimes(2);
  });

  it("selects a higher-priority queued hold without counting physical movement", () => {
    const { actor, state } = fixture();
    const pending = moveEntityTowardPositionIfUnoccupied(beginNormalMovementPhase(state), actor, { x: 10, y: 5 }, { source: "follow" });
    const next = endNormalMovementPhase(holdEntityMovement(pending, actor, "compatibility", "intentional hold"));
    expect(getNormalMovementResult(next, actor.id)).toMatchObject({ outcome: "held", positionCommitCount: 0 });
    expect(next.failedMoveByEntityId?.actor).toBeUndefined();
    expect(next.entities.actor.position).toEqual(actor.position);
  });

  it("clears queued producer context on frame reset, transition, save, and removal", () => {
    const { actor, state } = fixture();
    const pending = moveEntityTowardPositionIfUnoccupied(beginNormalMovementPhase(state), actor, { x: 10, y: 5 }, {
      isPositionAllowed: () => true,
    });
    expect(clearFrameMovementPlanning(pending).normalMovementPhase).toBeUndefined();
    expect(clearMapTransitionRuntimeState(pending).normalMovementPhase).toBeUndefined();
    expect(sanitizeGameStateForSave(pending, 100).normalMovementPhase).toBeUndefined();
    expect(pruneMissingEntityRuntimeState({ ...pending, entities: {} }).normalMovementPhase?.submissions).toEqual([]);
  });

  it.each(["move", "attack", "gather"] as const)("preserves teleport approach with an existing direct %s command", type => {
    const { actor, state } = fixture();
    const target = type === "gather" ? createResource("target", { x: 10, y: 8 }) : createEnemy("target", { x: 10, y: 8 });
    state.entities.target = target;
    const command = issueCompanionDirectCommand(state, type === "move"
      ? { type, companionId: actor.id, targetPosition: { x: 5, y: 10 } }
      : { type, companionId: actor.id, targetId: target.id }, 0);
    expect(command.code).toBe("success");
    const teleport = { id: "review-teleport", position: { x: 15, y: 5 }, range: 1,
      sourceMapId: "map-1" as const, targetMapId: "hub" as const, arrivalPositions: [{ x: 5, y: 5 }] };
    let next = triggerMapTeleport({ ...command.state, currentMapId: "map-1", map: { ...state.map!, teleports: [teleport] } }, "player", teleport.id);
    for (let frame = 1; frame <= 5; frame++) {
      next = updateGame(next, { nowMs: frame * 100, deltaMs: 100, deltaSeconds: 0.1, frameNumber: frame });
      expect(getNormalMovementResult(next, actor.id)?.request.source).toBe("teleport");
    }
    expect(next.entities.actor.position.x).toBeGreaterThan(actor.position.x);
    expect(next.activeTeleport?.id).toBe(teleport.id);
    expect(next.directCompanionCommandsById?.actor?.type).toBe(type);
  });

  it("keeps followers moving when a party move is temporarily overridden by a leader drag", () => {
    const { state } = fixture();
    const leader = createCompanion("leader", { x: 12, y: 8 }, "leader", "fighter");
    const follower = createCompanion("follower", { x: 5, y: 8 }, leader.id, "fighter");
    const partyMove = issuePartyOrder({ ...state, entities: { leader, follower }, partyLeaderId: leader.id }, {
      type: "move", targetPosition: { x: 18, y: 8 },
    });
    const direct = issueCompanionDirectCommand(partyMove, { type: "move", companionId: leader.id, targetPosition: { x: 12, y: 18 } }, 0);
    expect(direct.code).toBe("success");
    let next = direct.state;
    for (let frame = 1; frame <= 5; frame++) {
      next = updateGame(next, { nowMs: frame * 100, deltaMs: 100, deltaSeconds: 0.1, frameNumber: frame });
      expect(getNormalMovementResult(next, follower.id)?.request.source).toBe("follow");
    }
    expect(next.entities.leader.position.y).toBeGreaterThan(leader.position.y);
    expect(next.entities.follower.position.x).toBeGreaterThan(follower.position.x);
    expect(next.leaderIntent).toEqual(partyMove.leaderIntent);
    expect(next.directCompanionCommandsById?.leader?.type).toBe("move");
    expect(next.normalMovementPhase).toBeUndefined();
  });

  it("holds explicitly without a failure, trail, reservation, or physical move", () => {
    const { actor, state } = fixture();
    const held = holdEntityMovement(state, actor, "attack", "legal engagement");
    expect(getNormalMovementResult(held, actor.id)).toMatchObject({ outcome: "held", positionCommitCount: 0 });
    expect(held.failedMoveByEntityId?.actor).toBeUndefined();
    expect(held.reservedPositionsByEntityId?.actor).toBeUndefined();
    expect(held.followTrailsByEntityId).toEqual(state.followTrailsByEntityId);
    expect(moveEntityTowardPositionIfUnoccupied(held, actor, { x: 9, y: 5 }, { source: "follow" })).toBe(held);
  });

  it("a blocked winner retains authority and advances failure time only once", () => {
    const { actor, state } = fixture();
    const request = createNormalMovementRequest(state, actor, { x: 9, y: 5 }, { source: "direct" });
    const first = resolveNormalMovement(state, request, { isPositionAllowed: () => false });
    expect(first.outcome).toBe("blocked");
    expect(getNormalMovementResult(first.state, actor.id)?.positionCommitCount).toBe(0);
    const retry = resolveNormalMovement(first.state, request);
    expect(retry.outcome).toBe("deferred");
    expect(retry.state).toBe(first.state);
    expect(retry.state.movementFailureMsByEntityId?.actor).toBe(100);
    expect(retry.state.reservedPositionsByEntityId?.actor).toBeUndefined();
  });

  it("commits once including a later fixed combat step, and resets on the next frame", () => {
    const { actor, state } = fixture();
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const moved = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 });
    const twice = moveEntityToPositionIfUnoccupied(moved, moved.entities.actor, { x: 6, y: 5 }, { source: "attack" });
    expect(twice).toBe(moved);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(getNormalMovementResult(twice, actor.id)?.positionCommitCount).toBe(1);
    expect(twice.followTrailsByEntityId.actor).toEqual([actor.position]);
    const nextFrame = clearFrameMovementPlanning({ ...twice, simulationTimeMs: 200 });
    const next = moveEntityTowardPositionIfUnoccupied(nextFrame, nextFrame.entities.actor, { x: 10, y: 5 });
    expect(next.entities.actor.position.x).toBeGreaterThan(moved.entities.actor.position.x);
    expect(getNormalMovementResult(next, actor.id)?.positionCommitCount).toBe(1);
    expect(commits).toHaveBeenCalledTimes(2);
  });

  it("rejects a candidate before committing position, paths, reservations, or trails", () => {
    const { actor, state } = fixture();
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const next = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 }, {
      source: "enemyHome", isPositionAllowed: () => false, rejectedPositionOutcome: "held",
    });
    expect(getNormalMovementResult(next, actor.id)).toMatchObject({ outcome: "held", reason: "constraint", positionCommitCount: 0 });
    expect(next.entities).toBe(state.entities);
    expect(next.followTrailsByEntityId).toBe(state.followTrailsByEntityId);
    expect(next.movementPathsByEntityId).toBe(state.movementPathsByEntityId);
    expect(next.reservedPositionsByEntityId).toBe(state.reservedPositionsByEntityId);
    expect(next.failedMoveByEntityId?.actor).toBeUndefined();
    expect(commits).not.toHaveBeenCalled();
  });

  it("exposes exclusive external handoff without allowing release to cause double movement", () => {
    const { actor, state } = fixture();
    const owned = claimExternalMovement(state, actor.id, "test transaction");
    expect(moveEntityTowardPositionIfUnoccupied(owned, actor, { x: 10, y: 5 })).toBe(owned);
    const released = releaseExternalMovement(owned, actor.id);
    expect(moveEntityTowardPositionIfUnoccupied(released, actor, { x: 10, y: 5 }).entities.actor.position).not.toEqual(actor.position);
    const committed = claimExternalMovement(state, actor.id, "test transaction", true);
    expect(releaseExternalMovement(committed, actor.id)).toBe(committed);
    const upgraded = claimExternalMovement(owned, actor.id, "test transaction", true);
    expect(releaseExternalMovement(upgraded, actor.id)).toBe(upgraded);
  });

  it("releases transient records on transition, defeat/removal, and frame reset", () => {
    const { actor, state } = fixture();
    const moved = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 });
    expect(clearMapTransitionRuntimeState(moved).normalMovementResultsByEntityId).toEqual({});
    expect(clearFrameMovementPlanning(moved).normalMovementResultsByEntityId).toEqual({});
    expect(pruneMissingEntityRuntimeState({ ...moved, entities: {} }).normalMovementResultsByEntityId).toEqual({});
  });

  it("rejects a dead actor without claiming normal movement", () => {
    const { state } = fixture();
    const dead = { ...createEnemy("dead", { x: 8, y: 5 }), health: 0, state: "dead" as const };
    state.entities.dead = dead;
    expect(resolveNormalMovement(state, createNormalMovementRequest(state, dead, { x: 9, y: 5 }))).toEqual({ state, outcome: "invalid" });
  });

  it("preclaims explicit party movement against a stale automatic gathering request", () => {
    const { actor, state } = fixture();
    state.entities.actor = { ...actor, state: "gather", currentTargetId: "resource" };
    state.leaderIntent = { type: "move", source: "player", targetId: null, targetPosition: { x: 10, y: 5 } };
    const lost = moveEntityTowardPositionIfUnoccupied(state, state.entities.actor, { x: 5, y: 10 }, { source: "gather" });
    expect(lost).toBe(state);
    const next = moveEntityTowardPositionIfUnoccupied(state, state.entities.actor, { x: 10, y: 5 }, { source: "partyTravel" });
    expect(getNormalMovementResult(next, actor.id)?.request.priority).toBe(80);
    expect(next.entities.actor.position.x).toBeGreaterThan(actor.position.x);
  });

  it.each(["held", "direct", "external"])("does not swap a partner with %s authority", owner => {
    const { actor, state } = fixture();
    const friend = createCompanion("friend", { x: 5.8, y: 5 }, actor.id);
    state.map = undefined;
    state.entities.friend = friend;
    state.moveIntentsByEntityId = { friend: actor.position };
    let owned = state;
    if (owner === "held") owned = holdEntityMovement(state, friend, "follow", "hold");
    if (owner === "external") owned = claimExternalMovement(state, friend.id, "test transaction");
    if (owner === "direct") state.directCompanionCommandsById = {
      friend: { type: "move", companionId: friend.id, targetPosition: { x: 15, y: 5 }, issuedAt: 0 },
    };
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const next = moveEntityTowardPositionIfUnoccupied(owned, actor, { x: 10, y: 5 });
    expect(commits).not.toHaveBeenCalled();
    expect(next.entities.actor.position).toEqual(actor.position);
    expect(next.entities.friend.position).toEqual(friend.position);
    expect(next.reservedPositionsByEntityId).toEqual(state.reservedPositionsByEntityId);
  });

  it("commits a swap atomically and consumes both actors exactly once", () => {
    const { actor, state } = fixture();
    const friend = createCompanion("friend", { x: 5.8, y: 5 }, actor.id);
    state.map = undefined;
    state.entities.friend = friend;
    state.moveIntentsByEntityId = { friend: actor.position };
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const swapped = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 });
    expect(commits.mock.calls.map(([, entity]) => entity.id).sort()).toEqual(["actor", "friend"]);
    expect(swapped.entities.actor.position).toEqual(friend.position);
    expect(swapped.entities.friend.position).toEqual(actor.position);
    expect(getNormalMovementResult(swapped, actor.id)?.positionCommitCount).toBe(1);
    expect(getNormalMovementResult(swapped, friend.id)?.positionCommitCount).toBe(1);
    expect(swapped.reservedPositionsByEntityId).toMatchObject({ actor: friend.position, friend: actor.position });
    expect(moveEntityTowardPositionIfUnoccupied(swapped, swapped.entities.friend, { x: 3, y: 5 })).toBe(swapped);
    expect(commits).toHaveBeenCalledTimes(2);
  });

  it("does not swap a partner whose higher-priority request is still pending", () => {
    const { actor, state } = fixture();
    const friend = createCompanion("friend", { x: 5.8, y: 5 }, actor.id);
    state.map = undefined;
    state.entities.friend = friend;
    state.moveIntentsByEntityId = { friend: actor.position };
    let pending = beginNormalMovementPhase(state);
    pending = moveEntityTowardPositionIfUnoccupied(pending, actor, { x: 10, y: 5 }, { source: "follow" });
    pending = holdEntityMovement(pending, friend, "compatibility", "partner hold");
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const next = endNormalMovementPhase(pending);
    expect(next.entities.actor.position).toEqual(actor.position);
    expect(next.entities.friend.position).toEqual(friend.position);
    expect(getNormalMovementResult(next, friend.id)).toMatchObject({ outcome: "held", request: { source: "compatibility" } });
    expect(commits).not.toHaveBeenCalled();
  });

  it("reports both swap participants as physically moved at the phase boundary", () => {
    const { actor, state } = fixture();
    const friend = createCompanion("friend", { x: 5.8, y: 5 }, actor.id);
    state.map = undefined;
    state.entities.friend = friend;
    state.moveIntentsByEntityId = { friend: actor.position };
    const movedIds = new Set<string>();
    const next = endNormalMovementPhase(moveEntityTowardPositionIfUnoccupied(
      beginNormalMovementPhase(state), actor, { x: 10, y: 5 },
    ), movedIds);
    expect([...movedIds].sort()).toEqual([actor.id, friend.id].sort());
    expect(next.entities.actor.position).toEqual(friend.position);
    expect(next.entities.friend.position).toEqual(actor.position);
  });

  it("retains the existing same-update attack after a short final step", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { actor, state } = fixture();
    const target = createEnemy("target", { x: 6.72, y: 5 }, "passive", { combatBodyRadius: 0.7, maxHealth: 1000, isTargetDummy: true });
    state.entities = { actor: { ...actor, state: "attack", currentTargetId: target.id, lastAttackAt: -2000 }, target };
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const next = updateAttackSystem(state, new Set(), 1000);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(getNormalMovementResult(next, actor.id)?.request.mode).toBe("step");
    expect((next.entities.target as typeof target).health).toBeLessThan(target.health);
  });

  it("does not gather immediately after walking into interaction range", () => {
    const { actor, state } = fixture();
    const resource = createResource("resource", { x: 7.1, y: 5 });
    state.entities = { actor: { ...actor, state: "gather", currentTargetId: resource.id }, resource };
    const next = updateGatherSystem(state, new Set(), 1000);
    expect(getNormalMovementResult(next, actor.id)?.outcome).toBe("moved");
    expect((next.entities.resource as typeof resource).durability).toBe(resource.durability);
    const later = updateGatherSystem(clearFrameMovementPlanning({ ...next, simulationTimeMs: 200 }), new Set(), 1100);
    expect((later.entities.resource as typeof resource).durability).toBeLessThan(resource.durability);
  });

  it("does not add a combat final step after an earlier committed approach even without the legacy moved set", () => {
    const { actor, state } = fixture();
    const target = createEnemy("target", { x: 7.52, y: 5 }, "passive", { combatBodyRadius: 0.7, maxHealth: 1000, isTargetDummy: true });
    state.entities = { actor: { ...actor, state: "attack", currentTargetId: target.id, lastAttackAt: -2000 }, target };
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    const approached = moveEntityTowardPositionIfUnoccupied(state, state.entities.actor, target.position, { source: "attack" });
    const next = updateAttackSystem(approached, new Set(), 1000);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(next.entities.actor.position).toEqual(approached.entities.actor.position);
    expect((next.entities.target as typeof target).health).toBe(target.health);
  });

  it("does not remember a losing combat slot or disturb the winning reservation", () => {
    const { actor, state } = fixture();
    const target = createEnemy("target", { x: 10, y: 5 }, "passive", { combatBodyRadius: 0.7 });
    state.entities.target = target;
    const held = holdEntityMovement(state, actor, "direct", "player hold");
    const next = moveEntityTowardPositionIfUnoccupied(held, actor, { x: 8.3, y: 5 }, {
      source: "attack", combatSlot: { targetId: target.id, attackReach: 1, position: { x: 8.3, y: 5 } },
    });
    expect(next).toBe(held);
    expect(next.attackSlotCacheByEntityId?.actor).toBeUndefined();
    expect(next.reservedPositionsByEntityId).toBe(held.reservedPositionsByEntityId);
  });

  it("preclaims an active flee before an enemy roam or chase producer runs", () => {
    const { state } = fixture();
    const enemy = createEnemy("enemy", { x: 8, y: 8 }, "passive", { enemyTypeId: "azure_mass" });
    state.entities.enemy = enemy;
    state.slimewardDungeon = { chest: null, azureMass: { triggeredPhaseThresholds: [75], fleeUntilMs: 1000 } };
    expect(moveEntityTowardPositionIfUnoccupied(state, enemy, { x: 10, y: 8 }, { source: "enemyRoam" })).toBe(state);
    const next = moveEntityTowardPositionIfUnoccupied(state, enemy, { x: 10, y: 8 }, { source: "enemyFlee" });
    expect(getNormalMovementResult(next, enemy.id)?.request.source).toBe("enemyFlee");
  });

  it("publishes at most once per actor across 30 successive updates", () => {
    const { actor, state } = fixture();
    let next = state;
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    for (let frame = 1; frame <= 30; frame++) {
      next = clearFrameMovementPlanning({ ...next, simulationTimeMs: frame * 100, simulationFrame: frame });
      const before = commits.mock.calls.length;
      next = moveEntityTowardPositionIfUnoccupied(next, next.entities.actor, { x: 15, y: 5 });
      next = moveEntityTowardPositionIfUnoccupied(next, next.entities.actor, { x: 5, y: 15 }, { source: "follow" });
      expect(commits.mock.calls.length - before).toBeLessThanOrEqual(1);
      expect(getNormalMovementResult(next, actor.id)).toBeDefined();
    }
  });

  it("does not serialize ownership and exposes the winner in debug telemetry", () => {
    const { actor, state } = fixture();
    const recording = startDebugTelemetryRecording(state);
    const moved = moveEntityTowardPositionIfUnoccupied(recording, actor, { x: 10, y: 5 }, { source: "direct" });
    const saved = sanitizeGameStateForSave(moved, 100);
    expect(saved.normalMovementResultsByEntityId).toEqual({});
    expect(saved.externalMovementOwnersByEntityId).toEqual({});
    const recorded = recordDebugTelemetryTick(recording, moved);
    expect(recorded.debugTelemetry?.ticks.at(-1)?.entities.find(entity => entity.entityId === actor.id))
      .toMatchObject({ movementOwner: "direct", normalMovementOutcome: "moved", normalMovementCommitCount: 1 });
  });
});
