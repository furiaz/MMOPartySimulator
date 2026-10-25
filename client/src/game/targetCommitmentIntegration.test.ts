import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authority from "./movementAuthority";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { issuePartyOrder } from "./commands";
import { updateGame } from "./updateGame";
import { updatePartyIntentSelfDefenseSystem } from "./partyIntentSystem";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { updateRoleSystem } from "./roleSystem";
import { updateAttackSystem } from "./attackSystem";
import { getPartyExecutionIntent } from "./partyIntentState";
import { protectPartyMember } from "./partyProtectionSystem";
import { createTestGameState } from "./testState";
import { recordDebugTelemetryTick, startDebugTelemetryRecording } from "./debugTelemetry";
import { applyTargetCommitment, canReacquireCombatTarget, observeTargetApproach, pruneTargetCommitmentState, selectTargetCommitment } from "./targetCommitment";
import { chooseAttackSlot, probeAttackEngagement } from "./attackSlots";
import { isCombatPositionAvailable } from "./movementPlanning";
import { isWithinAttackReach } from "./spatialGeometry";
import { clearFrameMovementPlanning } from "./movementState";
import { updateEntity } from "./state";
import { applyStatusEffect } from "./statusEffects";
import { suppressAutonomousEnemyTarget } from "./partyTargetSystem";
import { sanitizeGameStateForSave } from "./saveGame";
import type { Companion, Enemy, GameMap } from "./types";
import type { GameState } from "./state";
import type { NormalMovementResult } from "./movementTypes";
import { bakeNavigationGrid } from "./navigation";

const map: GameMap = { columns: 35, rows: 30, walls: [], teleports: [], healingFountains: [], displayName: "Commitment integration", debugName: "commitment-integration" };
map.navigationGrid = bakeNavigationGrid(map);
beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.99));
afterEach(() => vi.restoreAllMocks());
function fixture(autoModeEnabled = false): GameState {
  const leader: Companion = { ...createCompanion("leader", { x: 6, y: 8 }, "leader", "fighter", 0), state: "attack", currentTargetId: "hunt" };
  const follower: Companion = { ...createCompanion("follower", { x: 6, y: 10 }, "leader", "fighter", 1), state: "attack", currentTargetId: "hunt" };
  const hunt = { ...createEnemy("hunt", { x: 15, y: 8 }, "passive", { maxHealth: 100000 }), nextRoamAt: Infinity };
  const attacker = { ...createEnemy("attacker", { x: 7.4, y: 10 }, "aggressive", { maxHealth: 100000 }), state: "attack" as const,
    currentTargetId: follower.id, nextRoamAt: Infinity };
  return createTestGameState({ map, entities: { leader, follower, hunt, attacker }, partyLeaderId: leader.id, autoModeEnabled,
    leaderIntent: { type: "attack", targetId: hunt.id, targetPosition: hunt.position, source: "ai" } });
}
function advance(state: GameState, frame: number): GameState {
  return updateGame(state, { nowMs: frame * 100, deltaMs: 100, deltaSeconds: 0.1, frameNumber: frame });
}

function corridorFixture(lowerWall: number, upperWall: number, y: number): GameState {
  const corridor = { ...map, columns: 22, rows: 18, walls: [
    ...Array.from({ length: 22 }, (_, x) => ({ x, y: lowerWall })),
    ...Array.from({ length: 22 }, (_, x) => ({ x, y: upperWall })),
  ] };
  corridor.navigationGrid = bakeNavigationGrid(corridor);
  const actor: Companion = { ...createCompanion("actor", { x: 5, y }, "actor", "fighter"), state: "attack", currentTargetId: "target" };
  const target = { ...createEnemy("target", { x: 15, y }, "passive", { maxHealth: 100000 }), nextRoamAt: Infinity };
  return createTestGameState({ map: corridor, entities: { actor, target }, partyLeaderId: actor.id,
    leaderIntent: { type: "attack", targetId: target.id, targetPosition: target.position, source: "ai" } });
}

describe("target commitment consumer integration", () => {
  it("consumes late Fighter approach evidence and responds to a sustained blocker within the real game loop", () => {
    let state = corridorFixture(5, 10, 7.5);
    const actor = { ...state.entities.actor, followTargetId: "leader", health: 100000, maxHealth: 100000 } as Companion;
    const leader = { ...createCompanion("leader", { x: 13, y: 7.5 }, "leader", "fighter"), state: "attack" as const,
      currentTargetId: "target", health: 100000, maxHealth: 100000 };
    const blocker = { ...createEnemy("blocker", { x: 8, y: 7.5 }, "passive", { maxHealth: 100000 }), combatBodyRadius: 1.8, nextRoamAt: Infinity };
    state = startDebugTelemetryRecording({ ...state, entities: { ...state.entities, actor, leader, blocker }, partyLeaderId: leader.id });
    const publications = new Map<string, number>(), commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((world, entity) => {
      const next = commit(world, entity);
      if (next.entities[entity.id].position !== world.entities[entity.id].position) {
        const key = `${world.simulationFrame}:${entity.id}`;
        publications.set(key, (publications.get(key) ?? 0) + 1);
      }
      return next;
    });
    let switchFrame = 0;
    for (let frame = 1; frame <= 45; frame++) {
      state = advance(state, frame);
      if ((state.entities.actor as Companion).currentTargetId === blocker.id && !switchFrame) switchFrame = frame;
      expect(getPartyExecutionIntent(state)?.targetId).toBe("target");
      expect(state.normalMovementResultsByEntityId?.actor?.positionCommitCount ?? 0).toBeLessThanOrEqual(1);
    }
    expect(switchFrame).toBeGreaterThanOrEqual(13);
    expect(switchFrame).toBeLessThanOrEqual(20);
    expect(publications.size).toBeGreaterThan(0);
    expect(Math.max(...publications.values())).toBe(1);
    expect(state.debugTelemetry!.events.filter(event => event.entityId === actor.id && event.type === "target_changed" &&
      event.targetDecisionReason === "sustained_obstruction")).toHaveLength(1);
  });

  it("finds and uses a continuous corridor engagement missed by the eight ordinary slots", () => {
    let state = corridorFixture(6, 10, 8);
    const actor = state.entities.actor as Companion, target = state.entities.target as Enemy;
    expect(chooseAttackSlot(state, actor, target, 1, { allowPartyPassThrough: true })).toBeNull();
    const probe = probeAttackEngagement(state, actor, target, 1);
    expect(probe.reachable).toBe(true);
    expect(probe.position).toBeDefined();
    expect(isCombatPositionAvailable(state, actor, probe.position!, { allowPartyPassThrough: true })).toBe(true);
    expect(isWithinAttackReach(actor, target, 1, probe.position)).toBe(true);
    for (let frame = 1; frame <= 60; frame++) {
      state = advance(state, frame);
      expect((state.entities.actor as Companion).currentTargetId).toBe(target.id);
      expect(state.rejectedCombatTargetsByEntityId?.actor?.target).toBeUndefined();
    }
    expect(isWithinAttackReach(state.entities.actor, state.entities.target, 1)).toBe(true);
  });

  it("keeps incomplete engagement searches unknown instead of reporting hard unreachability", () => {
    const state = corridorFixture(6, 9, 7.5);
    expect(probeAttackEngagement(state, state.entities.actor as Companion, state.entities.target, 1)).toMatchObject({ reachable: null });
  });

  it("rechecks a rejected target after resources cease blocking the route", () => {
    let state = corridorFixture(0, 17, 8);
    for (let y = 1; y < 17; y++) state.entities[`r${y}`] = createResource(`r${y}`, { x: 10, y });
    for (let frame = 1; frame <= 40; frame++) state = advance(state, frame);
    expect(state.rejectedCombatTargetsByEntityId?.actor?.target?.targetId).toBe("target");
    for (const entity of Object.values(state.entities)) if (entity.kind === "resource")
      state.entities[entity.id] = { ...entity, quantity: 0, durability: 0, isDepleted: true };
    state = pruneTargetCommitmentState({ ...state, simulationTimeMs: 5000 });
    expect(canReacquireCombatTarget(state, state.entities.actor as Companion, state.entities.target as Enemy)).toBe(true);
  });

  it("keeps role and party assignment from bypassing rejection while allowing a new explicit player focus", () => {
    let state = fixture(true);
    delete state.entities.attacker;
    state.entities.hunt = { ...state.entities.hunt, position: { x: 8, y: 8 } } as Enemy;
    state = applyTargetCommitment(state, state.entities.follower as Companion,
      { kind: "release", target: null, reason: "unreachable_engagement", priority: 0, local: false });
    state = updateRoleSystem(state);
    expect((state.entities.follower as Companion).currentTargetId).not.toBe("hunt");
    state = updatePartyFormationSystem(state);
    expect((state.entities.follower as Companion).currentTargetId).not.toBe("hunt");
    state = issuePartyOrder(state, { type: "attack", targetId: "hunt" });
    state = updatePartyFormationSystem(state);
    expect((state.entities.follower as Companion).currentTargetId).toBe("hunt");
  });

  it.each([false, true])("keeps a follower's defense local through 35 real updates (Auto Combat=%s)", auto => {
    let state = fixture(auto);
    const originalIntent = getPartyExecutionIntent(state);
    for (let frame = 1; frame <= 35; frame++) {
      state = advance(state, frame);
      expect(getPartyExecutionIntent(state)?.targetId).toBe(originalIntent?.targetId);
      expect((state.entities.follower as Companion).currentTargetId).toBe("attacker");
      expect((state.entities.leader as Companion).currentTargetId).not.toBe("attacker");
    }
  });

  it("does not let role, formation, attack assistance, or repeated damage replace local defense", () => {
    let state = fixture(true);
    state = updatePartyIntentSelfDefenseSystem(state);
    expect((state.entities.follower as Companion).currentTargetId).toBe("attacker");
    state = updateRoleSystem(state);
    state = updatePartyFormationSystem(state);
    state = updateAttackSystem(state, new Set(), 100);
    state = protectPartyMember(state, state.entities.follower as Companion, state.entities.attacker as Enemy);
    expect((state.entities.follower as Companion).currentTargetId).toBe("attacker");
    expect(getPartyExecutionIntent(state)?.targetId).toBe("hunt");
  });

  it("resumes the latest hunting objective after a local attacker dies", () => {
    let state = fixture(true);
    for (let frame = 1; frame <= 15; frame++) state = advance(state, frame);
    state = updateEntity(state, { ...state.entities.attacker, state: "dead", health: 0 } as Enemy, 1500);
    for (let frame = 16; frame <= 55; frame++) state = advance(state, frame);
    expect(getPartyExecutionIntent(state)?.targetId).toBe("hunt");
    expect((state.entities.follower as Companion).currentTargetId).toBe("hunt");
    expect(state.targetCommitmentsByEntityId?.follower?.local ?? false).toBe(false);
  });

  it("releases a genuinely unreachable engagement behind a solid wall without reacquiring it", () => {
    let state = fixture();
    const walls = Array.from({ length: 30 }, (_, y) => ({ x: 11, y }));
    const blockedMap = { ...map, walls };
    blockedMap.navigationGrid = bakeNavigationGrid(blockedMap);
    state = { ...state, map: blockedMap, entities: { leader: state.entities.leader, hunt: state.entities.hunt } };
    for (let frame = 1; frame <= 35; frame++) state = advance(state, frame);
    expect((state.entities.leader as Companion).currentTargetId, JSON.stringify({ approach: state.targetApproachesByEntityId?.leader,
      movement: state.normalMovementResultsByEntityId?.leader, position: state.entities.leader.position, intent: getPartyExecutionIntent(state) })).not.toBe("hunt");
    expect(getPartyExecutionIntent(state)?.targetId).not.toBe("hunt");
    expect(state.rejectedCombatTargetsByEntityId?.leader?.hunt?.targetId).toBe("hunt");
  });

  it("counts actual position publications across repeated local retargeting and crowded hunting", () => {
    let state = fixture();
    const publications = new Map<string, number>();
    const normal = authority.commitNormalMovementPosition;
    const specialized = authority.commitSpecializedMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((world, actor) => {
      const next = normal(world, actor);
      if (next.entities[actor.id].position !== world.entities[actor.id].position) {
        const key = `${world.simulationFrame}:${actor.id}`;
        publications.set(key, (publications.get(key) ?? 0) + 1);
      }
      return next;
    });
    vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((world, id, position, source, transaction) => {
      const next = specialized(world, id, position, source, transaction);
      if (next.outcome === "moved") {
        const key = `${world.simulationFrame}:${id}`;
        publications.set(key, (publications.get(key) ?? 0) + 1);
      }
      return next;
    });
    for (let frame = 1; frame <= 40; frame++) state = advance(state, frame);
    expect(publications.size).toBeGreaterThan(10);
    expect(Math.max(...publications.values())).toBe(1);
    expect(getPartyExecutionIntent(state)?.targetId).toBe("hunt");
  });

  it("obeys individual replacement and explicit party focus over a local response", () => {
    let state = updatePartyIntentSelfDefenseSystem(fixture());
    const issued = issueCompanionDirectCommand(state, { type: "attack", companionId: "follower", targetId: "hunt" }, 100);
    expect(issued.code).toBe("success");
    state = advance(issued.state, 2);
    expect((state.entities.follower as Companion).currentTargetId).toBe("hunt");
    state = issuePartyOrder(state, { type: "move", targetPosition: { x: 22, y: 8 } });
    for (let frame = 3; frame <= 15; frame++) state = advance(state, frame);
    expect(state.directCompanionCommandsById?.follower?.type).toBe("attack");
    expect((state.entities.follower as Companion).currentTargetId).toBe("hunt");
    expect(getPartyExecutionIntent(state)).toMatchObject({ type: "move", source: "player" });
  });

  it("lets a direct collector personally defend and resume its reserved resource", () => {
    let state = fixture();
    const resource = createResource("resource", { x: 10, y: 11 });
    state.entities.resource = resource;
    const issued = issueCompanionDirectCommand(state, { type: "gather", companionId: "follower", targetId: resource.id }, 0);
    expect(issued.code).toBe("success");
    state = advance(issued.state, 1);
    expect(state.directCompanionCommandsById?.follower).toMatchObject({ type: "gather", targetId: resource.id });
    expect((state.entities.follower as Companion).currentTargetId).toBe("attacker");
    state = updateEntity(state, { ...state.entities.attacker, state: "dead", health: 0 } as Enemy, 150);
    state = advance(state, 2);
    expect(state.directCompanionCommandsById?.follower).toMatchObject({ type: "gather", targetId: resource.id });
    expect((state.entities.follower as Companion).currentTargetId).toBe(resource.id);
  });

  it.each(["gather", "npc"] as const)("keeps a player %s interaction and its local defense through 30 updates", interaction => {
    let state = fixture();
    const resource = { ...createResource("resource", { x: 8, y: 11 }), quantity: 10000 };
    const merchant = createNpc("merchant", { x: 12, y: 14 }, "Merchant", "merchant");
    state.entities = { ...state.entities, resource, merchant };
    const defendingId = interaction === "npc" ? "leader" : "follower";
    if (interaction === "npc") state.entities.attacker = { ...state.entities.attacker, currentTargetId: defendingId,
      position: { x: 6, y: 9.7 } } as Enemy;
    state = issuePartyOrder(state, interaction === "gather" ? { type: "gather", targetId: resource.id }
      : { type: "move", targetPosition: { x: 10, y: 14 } });
    expect(getPartyExecutionIntent(state)?.source).toBe("player");
    state = protectPartyMember(state, state.entities[defendingId] as Companion, state.entities.attacker as Enemy);
    const intent = getPartyExecutionIntent(state);
    for (let frame = 1; frame <= 30; frame++) {
      state = advance(state, frame);
      expect(getPartyExecutionIntent(state)).toMatchObject(intent!);
      expect((state.entities[defendingId] as Companion).currentTargetId).toBe("attacker");
    }
    state = updateEntity(state, { ...state.entities.attacker, state: "dead", health: 0 } as Enemy, 3000);
    for (let frame = 31; frame <= 35; frame++) state = advance(state, frame);
    expect((state.entities[defendingId] as Companion).currentTargetId).not.toBe("attacker");
    if (interaction === "gather") expect((state.entities.follower as Companion).currentTargetId).toBe(resource.id);
  });

  it("records each switch and release once, including repeated telemetry reads", () => {
    const original = startDebugTelemetryRecording(fixture());
    let state = updatePartyIntentSelfDefenseSystem(original);
    state = recordDebugTelemetryTick(original, state, { nowMs: 100, deltaMs: 100, deltaSeconds: 0.1, frameNumber: 1 });
    const changes = state.debugTelemetry!.events.filter(event => event.entityId === "follower" && event.type === "target_changed");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ targetId: "attacker", targetDecisionReason: "personal_attacker" });
    const previous = state;
    state = clearFrameMovementPlanning({ ...state, simulationFrame: 2, simulationTimeMs: 200 });
    state = updateEntity(state, { ...state.entities.attacker, state: "dead", health: 0 } as Enemy, 200);
    state = applyTargetCommitment(state, state.entities.follower as Companion, selectTargetCommitment(state, state.entities.follower as Companion));
    state = recordDebugTelemetryTick(previous, state, { nowMs: 200, deltaMs: 100, deltaSeconds: 0.1, frameNumber: 2 });
    expect(state.debugTelemetry!.events.filter(event => event.entityId === "follower" && event.type === "target_released")).toHaveLength(1);
  });

  it("counts a real detour as progress and ignores sub-threshold oscillation", () => {
    let state = fixture();
    state.movementPathsByEntityId = { leader: { targetKey: "hunt", profile: "chase", waypoints: [{ x: 6, y: 13 }, { x: 15, y: 8 }] } };
    for (let frame = 1; frame <= 20; frame++) {
      const from = { x: 6, y: 8 + (frame - 1) * 0.15 }, to = { x: 6, y: 8 + frame * 0.15 };
      state = { ...state, simulationFrame: frame, simulationTimeMs: frame * 100 };
      const request = authority.createNormalMovementRequest(state, state.entities.leader, state.entities.hunt.position, { source: "attack" });
      const result: NormalMovementResult = { request, outcome: "moved", reason: "path", from, to, positionCommitCount: 1, frameNumber: frame, timeMs: frame * 100 };
      state = observeTargetApproach(state, result);
      expect(state.targetApproachesByEntityId?.leader.noProgressMs).toBe(0);
    }
    state = fixture();
    for (let frame = 1; frame <= 30; frame++) {
      const from = { x: 6 + (frame % 2 ? 0 : 0.02), y: 8 }, to = { x: 6 + (frame % 2 ? 0.02 : 0), y: 8 };
      state = { ...state, simulationFrame: frame, simulationTimeMs: frame * 100 };
      const request = authority.createNormalMovementRequest(state, state.entities.leader, state.entities.hunt.position, { source: "attack" });
      state = observeTargetApproach(state, { request, outcome: "moved", reason: "avoidance", from, to,
        positionCommitCount: 1, frameNumber: frame, timeMs: frame * 100 });
    }
    expect(state.targetApproachesByEntityId?.leader.noProgressMs).toBe(3000);
  });

  it("pauses observations during control, preserves direct suppression exceptions, and sanitizes runtime", () => {
    let state = fixture();
    const command = issueCompanionDirectCommand(state, { type: "attack", companionId: "follower", targetId: "hunt" }, 0);
    expect(command.code).toBe("success");
    state = suppressAutonomousEnemyTarget(command.state, "hunt", 1000, "phase");
    state = applyStatusEffect(state, { type: "immobilized", sourceId: "attacker", targetId: "leader", durationMs: 2000 }, 0);
    state = advance(state, 1);
    expect(state.directCompanionCommandsById?.follower).toMatchObject({ type: "attack", targetId: "hunt" });
    expect(state.targetApproachesByEntityId?.leader?.noProgressMs ?? 0).toBe(0);
    const restored = sanitizeGameStateForSave(state);
    expect(restored.targetCommitmentsByEntityId).toEqual({});
    expect(restored.targetApproachesByEntityId).toEqual({});
    expect(restored.rejectedCombatTargetsByEntityId).toEqual({});
  });
});
