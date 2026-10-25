import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseAttackSlot, rememberAttackSlot } from "./attackSlots";
import { updateAttackSystem } from "./attackSystem";
import { BARRACK_DEFINITIONS, createBarrackEntity } from "./barrackDefinitions";
import { getCombatFormationPositions, getCombatFormationPreference, getCombatFormationTarget, isCombatFormationMember, moveCombatFormationMember, prepareCombatFormation } from "./combatFormation";
import { issuePartyOrder } from "./commands";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { updateAutoRouteExecution } from "./autoRouteSystem";
import { createCompanion, createEnemy, createResource } from "./entities";
import { assignFormationSlots, reconcileFormationAssignments } from "./formationAssignments";
import { transformFormationSlots } from "./formationTemplates";
import { updateFollowSystem } from "./followSystem";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { finishDirectCompanionCommand } from "./directCommandState";
import { startForcedMovement } from "./forcedMovement";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { moveEntityTowardPositionIfUnoccupied, flushNormalMovementPhase, isCombatPositionAvailable } from "./movementPlanning";
import * as authority from "./movementAuthority";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { getPartyExecutionIntent, setPartyExecutionIntent } from "./partyIntentState";
import { updatePartyIntentSelfDefenseSystem } from "./partyIntentSystem";
import { clearEnemyFromPartyTargeting } from "./partyTargetSystem";
import { createSavedGame, restoreGameStateFromSave, SAVE_VERSION } from "./saveGame";
import { doCollisionBodiesOverlap } from "./spatialGeometry";
import { applyStatusEffect } from "./statusEffects";
import { createTestGameState } from "./testState";
import { getTravelFormationExpectedPosition, prepareTravelFormation } from "./travelFormation";
import { updateGame } from "./updateGame";
import type { GameState } from "./state";
import type { Companion, Enemy } from "./types";

afterEach(() => vi.restoreAllMocks());
function party(): GameState {
  const members = [createCompanion("leader", { x: 40, y: 30 }, "leader", "fighter", 0),
    createCompanion("support", { x: 38.75, y: 32.5 }, "leader", "support", 1),
    createCompanion("idle", { x: 41.25, y: 32.5 }, "leader", "none", 2)];
  const assignments = assignFormationSlots(members, "leader")!;
  const points = transformFormationSlots(assignments, members[0], { x: 0, y: -1 });
  return createTestGameState({ currentMapId: "hub", partyLeaderId: "leader", formationAssignments: assignments,
    entities: { ...Object.fromEntries(members.map(actor => [actor.id, { ...actor, position: points[actor.id] }])),
      target: createEnemy("target", { x: 40, y: 27 }, "passive", { maxHealth: 10000, attack: 0, evasion: 0 }) },
    map: { columns: 100, rows: 80, walls: [], teleports: [], healingFountains: [], debugName: "combat-staging", displayName: "Combat staging" },
    simulationTimeMs: 1000 });
}
function localCombat(state = party()): GameState {
  return { ...state, entities: { ...state.entities, leader: { ...state.entities.leader as Companion, state: "attack", currentTargetId: "target" } } };
}
function clock(state: GameState, delta = 100): GameState {
  return { ...state, simulationFrame: (state.simulationFrame ?? 0) + 1, simulationTimeMs: (state.simulationTimeMs ?? 0) + delta, simulationDeltaMs: delta,
    normalMovementResultsByEntityId: {}, movementPositionCommitsByEntityId: {}, reservedPositionsByEntityId: {}, moveIntentsByEntityId: {} };
}
function step(state: GameState, delta = 100): GameState {
  return updateGame(state, { nowMs: (state.simulationTimeMs ?? 0) + delta, deltaMs: delta, frameNumber: (state.simulationFrame ?? 0) + 1 });
}
function expanded(state: GameState): GameState {
  for (let i = 0; i < 25; i++) state = prepareCombatFormation(clock(state));
  return state;
}
function countPublications() {
  const publications: string[] = [], normal = authority.commitNormalMovementPosition, specialized = authority.commitSpecializedMovementPosition;
  vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((state, actor) => {
    const next = normal(state, actor);
    if (next.entities[actor.id].position !== state.entities[actor.id].position) publications.push(`${state.simulationFrame}:${actor.id}`);
    return next;
  });
  vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((state, id, position, source, transaction) => {
    const result = specialized(state, id, position, source, transaction);
    if (result.outcome === "moved") publications.push(`${state.simulationFrame}:${id}`);
    return result;
  });
  return publications;
}

describe("combat formation movement integration", () => {
  it("inherits travel's consumed geometry update when new aggression starts combat later in the frame", () => {
    const leader = createCompanion("leader", { x: 30, y: 30 }, "leader", "fighter", 0, "hunter");
    const follower = createCompanion("follower", { x: 28.75, y: 32.5 }, "leader", "support", 1);
    let state = setPartyExecutionIntent(createTestGameState({ partyLeaderId: leader.id,
      formationAssignments: assignFormationSlots([leader, follower], leader.id), entities: { leader, follower },
      map: { columns: 70, rows: 70, walls: [], teleports: [], healingFountains: [], displayName: "Late combat", debugName: "late-combat" },
      simulationTimeMs: 1000, simulationFrame: 1, simulationDeltaMs: 100 }),
    { type: "move", source: "ai", targetId: null, targetPosition: { x: 40, y: 30 } });
    const publications = countPublications();
    state = moveEntityTowardPositionIfUnoccupied(state, leader, { x: 40, y: 30 }, { source: "partyTravel" });
    state = prepareTravelFormation(state);
    const travel = state.formationAssignments!.travel!;
    expect(Math.atan2(travel.facing.y, travel.facing.x)).toBeCloseTo(-Math.PI / 2 + Math.PI / 5);
    expect(state.formationAssignments!.combat).toBeUndefined();

    state.entities.enemy = { ...createEnemy("enemy", { x: state.entities.leader.position.x + 2.5, y: 30 }, "aggressive"),
      state: "attack", currentTargetId: leader.id };
    state = updatePartyIntentSelfDefenseSystem(state);
    state = prepareCombatFormation(state);
    const combat = state.formationAssignments!.combat!;
    expect((state.entities.leader as Companion).currentTargetId).toBe("enemy");
    expect(combat.referenceTargetId).toBe("enemy");
    expect(combat.facing).toEqual(travel.facing);
    expect(combat.spacing).toBeCloseTo(2.5 * (travel.rowScale ?? 1));
    expect(combat.lateralScale).toBe(travel.lateralScale);
    expect(combat.proposedGoalsByEntityId?.follower).toBeDefined();
    expect(prepareCombatFormation(state).formationAssignments!.combat!.facing).toEqual(combat.facing);
    expect(publications).toEqual(["1:leader"]);

    state = prepareCombatFormation(clock(state));
    expect(Math.atan2(state.formationAssignments!.combat!.facing.y, state.formationAssignments!.combat!.facing.x))
      .toBeCloseTo(-Math.PI / 2 + 2 * Math.PI / 5);
    expect(publications).toEqual(["1:leader"]);
  });

  it("reports accepted combat staging through existing movement telemetry", () => {
    const state = step(startDebugTelemetryRecording(localCombat()));
    const actor = state.debugTelemetry!.ticks.at(-1)!.entities.find(entity => entity.entityId === "support")!;
    expect(actor.formationSlotReason).toMatch(/^combat formation /);
    expect(actor.formationSlot).toEqual(state.formationAssignments!.combat!.goalsByEntityId.support.position);
    expect(actor.movementPositionCommitCount).toBeLessThanOrEqual(1);
  });
  it("settles available members for 30 updates without legacy follow pulling them toward the leader", () => {
    let state = expanded(localCombat());
    const points = getCombatFormationPositions(state);
    state.entities.support = { ...state.entities.support, position: points.support };
    state.entities.idle = { ...state.entities.idle, position: points.idle };
    const positions = [state.entities.support.position, state.entities.idle.position];
    const publications = countPublications();
    for (let i = 0; i < 30; i++) state = updateFollowSystem(clock(state));
    expect(state.entities.support.position).toEqual(positions[0]);
    expect(state.entities.idle.position).toEqual(positions[1]);
    expect(publications).toEqual([]);
    expect(state.normalMovementResultsByEntityId?.support.outcome).toBe("held");
    expect(state.formationAssignments!.combat!.goalsByEntityId.support.settled).toBe(true);
    expect(state.targetApproachesByEntityId?.support).toBeUndefined();
  });

  it("publishes staging goals only for accepted requests and cannot move twice in an update", () => {
    let state = expanded(localCombat());
    const actor = { ...state.entities.support as Companion, position: { x: 34, y: 33 } };
    state = { ...state, entities: { ...state.entities, support: actor } };
    const publications = countPublications();
    state = moveCombatFormationMember(state, actor);
    expect(state.formationAssignments!.combat!.goalsByEntityId.support).toBeDefined();
    const accepted = state, result = state.normalMovementResultsByEntityId?.support;
    state = moveCombatFormationMember(state, state.entities.support as Companion);
    expect(state).toBe(accepted);
    expect(state.normalMovementResultsByEntityId?.support).toBe(result);
    expect(publications).toEqual([`${state.simulationFrame}:support`]);
    expect(state.targetApproachesByEntityId?.support).toBeUndefined();
  });

  it("leaves pending and consumed command movement authoritative without losing-request bookkeeping", () => {
    let state = expanded(localCombat());
    const commandResult = issueCompanionDirectCommand(state, { type: "move", companionId: "support", targetPosition: { x: 45, y: 35 } }, state.simulationTimeMs);
    expect(commandResult.code).toBe("success");
    state = commandResult.state;
    const unchanged = state;
    expect(moveCombatFormationMember(state, state.entities.support as Companion)).toBe(unchanged);
    expect(getCombatFormationPreference(state, state.entities.support as Companion)).toBeUndefined();
    state = authority.beginNormalMovementPhase(state);
    state = moveEntityTowardPositionIfUnoccupied(state, state.entities.support, { x: 45, y: 35 }, { source: "direct" });
    expect(moveCombatFormationMember(state, state.entities.support as Companion)).toBe(state);
    state = flushNormalMovementPhase(state);
    expect(state.normalMovementResultsByEntityId?.support.request.source).toBe("direct");
    const latest = issueCompanionDirectCommand(state, { type: "move", companionId: "support", targetPosition: { x: 36, y: 35 } }, state.simulationTimeMs).state;
    expect(latest.movementPositionCommitsByEntityId?.support).toBe(state.movementPositionCommitsByEntityId?.support);
    expect(latest.formationAssignments!.combat!.goalsByEntityId.support).toBeUndefined();
  });

  it("retains current and cached legal engagement positions despite a rotated opposite preference", () => {
    let state = localCombat();
    const attacker = { ...state.entities.support as Companion, classId: "hunter" as const, state: "attack" as const, currentTargetId: "target", position: { x: 38, y: 30 } };
    state.entities.support = attacker;
    const target = state.entities.target;
    expect(chooseAttackSlot(state, attacker, target, 5, { preferredFormationPosition: { x: 40, y: 20 } })).toEqual(attacker.position);
    const distant = { ...attacker, position: { x: 34, y: 34 } };
    state.entities.support = distant;
    state = rememberAttackSlot(state, distant, target, 5, attacker.position, { nowMs: state.simulationTimeMs, allowPartyPassThrough: true });
    expect(chooseAttackSlot(state, distant, target, 5, { nowMs: state.simulationTimeMs, allowPartyPassThrough: true,
      preferredFormationPosition: { x: 40, y: 20 } })).toEqual(attacker.position);
  });

  it("uses formation preference for equal-distance new positions and falls back when it is blocked", () => {
    const state = party(), actor = state.entities.support as Companion;
    const target = { ...state.entities.target as Enemy, position: { x: 40, y: 30 } };
    const attacker = { ...actor, position: target.position };
    const preferred = chooseAttackSlot({ ...state, entities: { support: attacker, target } }, attacker, target, 1,
      { preferredFormationPosition: { x: 40, y: 40 }, allowPartyPassThrough: true });
    expect(preferred!.y).toBeGreaterThan(30);
    const blocked = { ...state, entities: { support: attacker, target }, map: { ...state.map!, walls: [{ x: 40, y: 32 }, { x: 40, y: 31 }] } };
    const fallback = chooseAttackSlot(blocked, attacker, target, 1, { preferredFormationPosition: { x: 40, y: 40 }, allowPartyPassThrough: true });
    expect(fallback).not.toBeNull();
    expect(isCombatPositionAvailable(blocked, attacker, fallback!, { allowPartyPassThrough: true })).toBe(true);
  });

  it("leaves attacking melee/ranged companions in their action system instead of chasing staging", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = expanded(localCombat());
    const support = { ...state.entities.support as Companion, classId: "lightbearer" as const, state: "attack" as const,
      position: { x: 38, y: 30 }, currentTargetId: "target" };
    state.entities.support = support;
    const positions = state.entities.support.position;
    for (let i = 0; i < 30; i++) {
      state = clock(state);
      state = updateFollowSystem(state);
      state = updateAttackSystem(state, new Set(), state.simulationTimeMs);
      expect(state.entities.support.position).toEqual(positions);
    }
    expect((state.entities.support as Companion).lastAttackAt).toBeGreaterThan(1000);
    expect(isCombatFormationMember(state, state.entities.support as Companion)).toBe(false);
  });

  it("does not expand/reassign for a passing living crowd and retains legal substitutes", () => {
    let state = expanded(localCombat());
    const desired = getCombatFormationPositions(state).support;
    const crowd = createEnemy("crowd", { x: desired.x + 0.5, y: desired.y }, "passive");
    state.entities.support = { ...state.entities.support, position: { x: 34, y: 34 } };
    state = prepareCombatFormation(clock({ ...state, entities: { ...state.entities, crowd } }));
    expect(state.formationAssignments!.combat!.spacing).toBe(3);
    const goal = state.formationAssignments!.combat!.proposedGoalsByEntityId!.support;
    expect(goal.mode).toBe("substitute");
    expect(doCollisionBodiesOverlap(state.entities.support, goal.position, crowd)).toBe(false);
    state = moveCombatFormationMember(state, state.entities.support as Companion);
    const accepted = state.formationAssignments!.combat!.goalsByEntityId.support.position;
    state = prepareCombatFormation(clock(state));
    expect(state.formationAssignments!.combat!.proposedGoalsByEntityId!.support.position).toEqual(accepted);
  });

  it("holds when no legal standing candidate exists without producing target or path failure evidence", () => {
    let state = expanded(localCombat());
    const expected = getCombatFormationPositions(state).support;
    const walls = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({ x: Math.round(expected.x) + x - 3, y: Math.round(expected.y) + y - 3 }))).flat();
    state.entities.support = { ...state.entities.support, position: { x: 30, y: 30 } };
    state = prepareCombatFormation(clock({ ...state, map: { ...state.map!, walls } }));
    consumeGamePerformanceMetrics();
    state = moveCombatFormationMember(state, state.entities.support as Companion);
    expect(state.normalMovementResultsByEntityId?.support.outcome).toBe("held");
    expect(state.movementFailureMsByEntityId?.support).toBeUndefined();
    expect(state.targetApproachesByEntityId?.support).toBeUndefined();
    expect(consumeGamePerformanceMetrics().pathDistanceQueries).toBe(0);
  });

  it("validates full bodies, resources, structures, and normal/specialized landing reservations", () => {
    let state = expanded(localCombat());
    const point = getCombatFormationPositions(state).support;
    const resource = createResource("ore", point);
    state.entities.ore = resource;
    state = prepareCombatFormation(clock(state));
    const goal = state.formationAssignments!.combat!.proposedGoalsByEntityId!.support;
    expect(goal.position).not.toEqual(point);
    expect(doCollisionBodiesOverlap(state.entities.support, goal.position, resource)).toBe(false);
    const large = { ...createEnemy("large", { x: 60, y: 60 }, "passive"), combatBodyRadius: 2, combatSizeMultiplier: 2, minimumMovementBodyRadius: 3 };
    state.entities.large = large;
    state = clock(state);
    state = prepareCombatFormation({ ...state, reservedPositionsByEntityId: { large: point }, moveIntentsByEntityId: { large: point } });
    const after = state.formationAssignments!.combat!.proposedGoalsByEntityId!.support;
    expect(after.mode === "held" || !doCollisionBodiesOverlap(state.entities.support, after.position, large, point, 0.05)).toBe(true);
  });

  it("uses only explicit structure focus and its attack bounds for orientation", () => {
    const state = party(), definition = BARRACK_DEFINITIONS[0];
    const structure = { ...createBarrackEntity(definition), position: { x: 90, y: 60 },
      footprint: { minX: 44, maxX: 45, minY: 30, maxY: 31 }, attackBounds: { minX: 41, maxX: 46, minY: 28, maxY: 32 } };
    state.entities[structure.id] = structure;
    expect(getCombatFormationTarget(state)).toBeUndefined();
    const focused = setPartyExecutionIntent(state, { type: "attack", source: "player", targetId: structure.id, targetPosition: structure.position });
    expect(getCombatFormationTarget(focused)?.id).toBe(structure.id);
    const oriented = expanded(focused);
    expect(oriented.formationAssignments!.combat!.facing.x).toBeCloseTo(1);
    expect(oriented.formationAssignments!.combat!.facing.y).toBeCloseTo(0);
  });

  it("suspends for statuses, channels, resurrection, and displacement without losing ownership", () => {
    const state = expanded(localCombat()), ownership = state.formationAssignments!.slotsByEntityId;
    const controlled = applyStatusEffect(state, { type: "immobilized", sourceId: "target", targetId: "support", durationMs: 2000 }, state.simulationTimeMs!);
    expect(moveCombatFormationMember(controlled, controlled.entities.support as Companion)).toBe(controlled);
    const displaced = startForcedMovement(state, "support", "target", { x: 1, y: 0 }, 2, 500, state.simulationTimeMs!);
    expect(moveCombatFormationMember(displaced, displaced.entities.support as Companion)).toBe(displaced);
    expect(displaced.formationAssignments!.slotsByEntityId).toBe(ownership);
  });

  it("keeps death holes after combat, prunes removed goals, and excludes transient runtime from saves", () => {
    let state = expanded(localCombat());
    state = moveCombatFormationMember(state, state.entities.support as Companion);
    const ownership = state.formationAssignments!.slotsByEntityId;
    state.entities.support = { ...state.entities.support as Companion, health: 0, state: "dead" };
    state.entities.target = { ...state.entities.target as Enemy, health: 0, state: "dead" };
    state = pruneMissingEntityRuntimeState(state);
    state = prepareTravelFormation(state);
    expect(state.formationAssignments!.slotsByEntityId).toBe(ownership);
    expect(state.formationAssignments!.members).toHaveLength(3);
    expect(state.formationAssignments!.combat?.goalsByEntityId.support).toBeUndefined();
    const saved = createSavedGame(state, state.simulationTimeMs!);
    expect(saved.saveVersion).toBe(SAVE_VERSION);
    expect(saved.state.formationAssignments).toBeUndefined();
    const restored = restoreGameStateFromSave(saved);
    expect(restored.ok).toBe(true);
    expect(clearMapTransitionRuntimeState(state).formationAssignments).toBeUndefined();
    state.entities.support = { ...state.entities.support as Companion, health: 10, state: "follow" };
    expect(reconcileFormationAssignments(state).formationAssignments!.slotsByEntityId).toBe(ownership);
  });

  it("keeps party assignments through enemy-only cleanup and honors complete structural edits", () => {
    let state = expanded(localCombat());
    const ownership = state.formationAssignments!.slotsByEntityId;
    state = prepareCombatFormation(clearEnemyFromPartyTargeting(state, "target"));
    expect(state.formationAssignments!.slotsByEntityId).toBe(ownership);
    expect(state.formationAssignments!.combat?.referenceTargetId).toBeUndefined();
    state.entities.support = { ...state.entities.support as Companion, role: "fighter" };
    state = reconcileFormationAssignments(state);
    expect(state.formationAssignments!.members.find(member => member.id === "support")!.role).toBe("fighter");
  });

  it("handles 100 real updates through approach, displacement, death of the target, and travel recovery", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = localCombat();
    const publications = countPublications();
    const ownership = state.formationAssignments!.slotsByEntityId;
    for (let i = 0; i < 100; i++) {
      if (i === 20) state = startForcedMovement(state, "support", "target", { x: -1, y: 0 }, 2, 300, state.simulationTimeMs!);
      if (i === 55) state.entities.target = { ...state.entities.target as Enemy, health: 0, state: "dead" };
      state = step(state);
    }
    expect(new Set(publications).size).toBe(publications.length);
    expect(publications.length).toBeGreaterThan(0);
    expect(state.formationAssignments!.slotsByEntityId).toBe(ownership);
    expect(state.formationAssignments!.combat).toBeUndefined();
    expect(state.forcedMovementsByEntityId?.support).toBeUndefined();
    expect(getCombatFormationTarget(state)).toBeUndefined();
    const actor = state.entities.support as Companion, expected = getTravelFormationExpectedPosition(state, actor)!;
    expect(Math.hypot(actor.position.x - expected.x, actor.position.y - expected.y)).toBeLessThan(0.6);
    expect(getPartyExecutionIntent(state)).toBeNull();
  }, 30000);

  it("preserves party floor orders and individual command replacement/completion through combat", () => {
    let state = expanded(localCombat());
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "support", targetId: "target" }, state.simulationTimeMs).state;
    const command = state.directCompanionCommandsById!.support;
    state = issuePartyOrder(state, { type: "move", targetPosition: { x: 55, y: 30 } });
    expect(state.directCompanionCommandsById!.support).toBe(command);
    expect(getCombatFormationTarget(state)).toBeUndefined();
    state = finishDirectCompanionCommand(state, command, state.simulationTimeMs!, "direct_command_completed", "test");
    expect(state.directCompanionCommandsById?.support).toBeUndefined();
    expect(state.directCommandGraceUntilByCompanionId?.support).toBeGreaterThan(state.simulationTimeMs!);
  }, 30000);

  it("counts both swap publications once and excludes the partner from approach evidence", () => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const partner = createCompanion("partner", { x: 5.8, y: 5 }, "actor");
    let state = createTestGameState({ partyLeaderId: actor.id, entities: { actor, partner },
      simulationFrame: 1, simulationTimeMs: 100, moveIntentsByEntityId: { partner: actor.position } });
    const publications = countPublications();
    state = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 }, { source: "follow", isFormationStaging: true });
    expect(state.entities.actor.position).toEqual(partner.position);
    expect(state.entities.partner.position).toEqual(actor.position);
    expect(publications.sort()).toEqual(["1:actor", "1:partner"]);
    expect(state.normalMovementResultsByEntityId?.partner.request.isFormationStaging).toBe(true);
    expect(state.targetApproachesByEntityId?.partner).toBeUndefined();
    const consumed = state;
    expect(moveEntityTowardPositionIfUnoccupied(state, state.entities.partner, { x: 3, y: 5 }, { source: "follow" })).toBe(consumed);
  });

  it("does not turn combat-staging crowd waits into route body blocking", () => {
    let state = localCombat();
    state = { ...state, worldTravelTargetMapId: "map-1", worldDiscovery: { visitedMapIds: ["map-1"], visitedSubzonesByMapId: {} } };
    for (let i = 0; i < 20; i++) {
      state = clock(state);
      state.normalMovementResultsByEntityId = { support: { request: { entityId: "support", source: "follow", reason: "combat formation substitute",
        priority: 20, mode: "walk", destination: { x: 37, y: 33 }, acceptableRadius: 0.35, isFormationStaging: true },
      from: state.entities.support.position, to: state.entities.support.position, outcome: "held", reason: "crowd_wait", blockingEnemyIds: ["target"],
      positionCommitCount: 0, frameNumber: state.simulationFrame!, timeMs: state.simulationTimeMs! } };
      state = updateAutoRouteExecution(state, true);
    }
    expect(state.autoRoute?.bodyBlocksByEntityId?.support).toBeUndefined();
    expect(state.autoRoute?.emergencyTargetId).toBeUndefined();
    expect(state.worldTravelTargetMapId).toBe("map-1");
  });

  it("retains geometry through a same-update leader commit and threat invalidation without double blending", () => {
    let state = expanded(localCombat());
    const runtime = state.formationAssignments!.combat!, original = getCombatFormationPositions(state).support;
    const movedLeader = { ...state.entities.leader, position: { x: 40.2, y: 30 } };
    state = prepareCombatFormation({ ...state, entities: { ...state.entities, leader: movedLeader } });
    expect(state.formationAssignments!.combat!.facing).toEqual(runtime.facing);
    expect(state.formationAssignments!.combat!.spacing).toBe(runtime.spacing);
    expect(getCombatFormationPositions(state).support.x - original.x).toBeCloseTo(0.2);
    state.entities.target = { ...state.entities.target as Enemy, health: 0, state: "dead" };
    state = prepareTravelFormation(state);
    expect(state.formationAssignments!.travel!.rowScale).toBeCloseTo(1.2);
    expect(state.formationAssignments!.travel!.facing).toEqual(runtime.facing);
  });

  it("keeps a ranged leader's active engagement as combat context beyond the approach threshold", () => {
    let state = localCombat();
    state.entities.leader = { ...state.entities.leader as Companion, classId: "hunter" };
    state.entities.target = { ...state.entities.target, position: { x: 40, y: 25 } };
    state = prepareCombatFormation(state);
    expect(getCombatFormationTarget(state)?.id).toBe("target");
    expect(state.formationAssignments!.combat?.mode).toBe("combat");
  });

  it("keeps direct-leader following and active rally separate from combat staging", () => {
    let state = localCombat();
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "leader", targetPosition: { x: 44, y: 30 } }, state.simulationTimeMs).state;
    expect(getCombatFormationTarget(state)).toBeUndefined();
    expect(isCombatFormationMember(state, state.entities.support as Companion)).toBe(false);
    state = { ...state, activeTeleport: { id: "rally", range: 3, position: { x: 40, y: 30 }, sourceMapId: "hub", targetMapId: "map-1", triggeredBy: "ai" } };
    expect(prepareCombatFormation(state)).toBe(state);
    expect(moveCombatFormationMember(state, state.entities.support as Companion)).toBe(state);
  });
});
