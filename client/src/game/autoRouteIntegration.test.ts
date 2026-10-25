import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { BARRACK_DEFINITIONS, createBarrackEntity } from "./barrackDefinitions";
import { startForcedMovement } from "./forcedMovement";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createTestGameState } from "./testState";
import { beginAutoRouteCalmPeriod, canStartAutoRouteRally, clearAutoRoute, getAutoRouteEmergency,
  hasAutoRouteResumeCohesion, isAutoRoutePaused, startAutoRoute, updateAutoRouteExecution, updateAutoRouteRuntime } from "./autoRouteSystem";
import { updatePartyIntentRecoverySystem, updatePartyIntentSelfDefenseSystem } from "./partyIntentSystem";
import { restoreInterruptedPoiTarget } from "./poiResumeSystem";
import { getPartyExecutionIntent, setPartyExecutionIntent } from "./partyIntentState";
import { assignFormationSlots } from "./formationAssignments";
import { getTravelFormationExpectedPosition, prepareTravelFormation, usesTravelFormation } from "./travelFormation";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { issuePartyOrder } from "./commands";
import { finishDirectCompanionCommand } from "./directCommandState";
import { applyStatusEffect } from "./statusEffects";
import { hubTeleporterPosition, createDebugMap } from "./debugMap";
import { triggerMapTeleport, updateTeleportSystem } from "./teleportSystem";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { updateGame } from "./updateGame";
import * as authority from "./movementAuthority";
import type { GameState } from "./state";
import type { NormalMovementResult } from "./movementTypes";
import type { Companion, Position } from "./types";

afterEach(() => vi.restoreAllMocks());

function party(size = 2): GameState {
  const members = Array.from({ length: size }, (_, i) => createCompanion(`m${i}`, { x: 40 + i * 3, y: 30 }, "m0", i ? "support" : "fighter", i));
  return createTestGameState({ currentMapId: "hub", partyLeaderId: "m0", worldTravelTargetMapId: "map-1",
    worldDiscovery: { visitedMapIds: ["map-1", "map-2"], visitedSubzonesByMapId: {} },
    entities: Object.fromEntries(members.map(member => [member.id, member])),
    formationAssignments: assignFormationSlots(members, "m0", "arrow"),
    map: { columns: 125, rows: 80, walls: [], teleports: createDebugMap("hub").teleports, healingFountains: [], displayName: "Route", debugName: "route" },
    simulationTimeMs: 1000 });
}
function clock(state: GameState, delta = 100): GameState {
  return { ...state, simulationFrame: (state.simulationFrame ?? 0) + 1, simulationTimeMs: (state.simulationTimeMs ?? 0) + delta, simulationDeltaMs: delta };
}
function step(state: GameState, delta = 100): GameState {
  return updateGame(state, { nowMs: (state.simulationTimeMs ?? 0) + delta, deltaMs: delta, frameNumber: (state.simulationFrame ?? 0) + 1 });
}
function blocked(state: GameState, enemyId = "blocker", destination: Position = { x: 80, y: 30 }): GameState {
  const actor = state.entities.m0;
  const result: NormalMovementResult = { request: { entityId: actor.id, source: "partyTravel", mode: "walk", reason: "route",
    pathTargetKey: "route:hub-to-map-1", destination, acceptableRadius: 0, priority: 40 }, outcome: "held", reason: "crowd_wait",
    blockingEnemyIds: [enemyId], from: actor.position, to: actor.position, positionCommitCount: 0,
    frameNumber: state.simulationFrame ?? 0, timeMs: state.simulationTimeMs ?? 0 };
  return { ...state, normalMovementResultsByEntityId: { m0: result } };
}
function withEnemy(state: GameState): GameState {
  return { ...state, entities: { ...state.entities, blocker: createEnemy("blocker", { x: 42, y: 30 }, "passive") } };
}

describe("Auto Route execution authority", () => {
  it.each(["map-1", "map-2"] as const)("preserves calm when selecting %s and only resumes after the original deadline", destination => {
    let state = beginAutoRouteCalmPeriod({ ...party(), teleportStatesById: { "map-1-to-map-2": { isWorking: true } } });
    const deadline = state.autoRoute!.resumeAfterMs!;
    const selected = startAutoRoute(state, destination);
    expect(selected.status).toBe("success");
    expect(selected.state.autoRoute?.resumeAfterMs).toBe(deadline);
    const position = selected.state.entities.m0.position;
    state = step(selected.state);
    expect(state.entities.m0.position).toEqual(position);
    expect(state.worldTravelTargetMapId).toBe(destination);
    expect(isAutoRoutePaused(state)).toBe(true);
    state = updateAutoRouteExecution({ ...state, simulationTimeMs: deadline - 1 });
    expect(isAutoRoutePaused(state)).toBe(true);
    state = updateAutoRouteExecution({ ...state, simulationTimeMs: deadline });
    expect(isAutoRoutePaused(state)).toBe(false);
    state = step(state);
    expect(state.entities.m0.position.x).toBeGreaterThan(position.x);
  });

  it("preserves the cohesion wait on replacement after calm has elapsed", () => {
    let state = beginAutoRouteCalmPeriod({ ...party(), teleportStatesById: { "map-1-to-map-2": { isWorking: true } } });
    const deadline = state.autoRoute!.resumeAfterMs!;
    state = { ...state, simulationTimeMs: deadline, entities: { ...state.entities, m1: { ...state.entities.m1, position: { x: 10, y: 30 } } } };
    state = updateAutoRouteExecution(state);
    expect(state.autoRoute?.pauseReason).toBe("cohesion");
    state = startAutoRoute(state, "map-2").state;
    expect(state.autoRoute?.resumeAfterMs).toBe(deadline);
    expect(state.autoRoute?.pauseReason).toBe("cohesion");
    const position = state.entities.m0.position;
    state = step(state);
    expect(state.entities.m0.position).toEqual(position);
    const goal = getTravelFormationExpectedPosition(state, state.entities.m1 as Companion)!;
    state = updateAutoRouteExecution({ ...state, entities: { ...state.entities, m1: { ...state.entities.m1, position: goal } } });
    expect(isAutoRoutePaused(state)).toBe(false);
    expect(state.worldTravelTargetMapId).toBe("map-2");
  });

  it("retains control and interruption cooldown while dropping obsolete replacement evidence", () => {
    let state = blocked(withEnemy(party()));
    state = updateAutoRouteExecution(state, true);
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0).toBeDefined();
    state = { ...state, autoRoute: { ...state.autoRoute, interruptCooldownUntilMs: 9000 } };
    state = startAutoRoute(state, "map-1").state;
    expect(state.autoRoute?.interruptCooldownUntilMs).toBe(9000);
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0).toBeUndefined();
    state = applyStatusEffect(state, { type: "immobilized", targetId: "m0", sourceId: "missing", durationMs: 1000 }, 1000);
    const entities = { ...state.entities };
    delete entities.blocker;
    state = updateAutoRouteExecution({ ...state, entities });
    state = startAutoRoute(state, "map-1").state;
    expect(state.autoRoute?.pauseReason).toBe("emergency");
    expect(state.autoRoute?.emergencyTargetId).toBeUndefined();
    expect(state.autoRoute?.interruptCooldownUntilMs).toBe(9000);
  });

  it("keeps an expired calm deadline paused until formation cohesion is restored", () => {
    let state = party();
    state.entities.m1 = { ...state.entities.m1, position: { x: 15, y: 30 } };
    state = beginAutoRouteCalmPeriod(state);
    const deadline = state.autoRoute!.resumeAfterMs!;
    state = updateAutoRouteExecution({ ...state, simulationTimeMs: deadline - 1 });
    expect(isAutoRoutePaused(state)).toBe(true);
    state = updateAutoRouteExecution({ ...state, simulationTimeMs: deadline });
    expect(state.autoRoute?.pauseReason).toBe("cohesion");
    expect(isAutoRoutePaused(state)).toBe(true);
    expect(usesTravelFormation(state)).toBe(true);
    const slot = getTravelFormationExpectedPosition(state, state.entities.m1 as Companion)!;
    state = { ...state, entities: { ...state.entities, m1: { ...state.entities.m1, position: slot } } };
    state = updateAutoRouteExecution(state);
    expect(isAutoRoutePaused(state)).toBe(false);
    expect(state.autoRoute?.interruptCooldownUntilMs).toBe(deadline + 1500);
  });

  it("does not extend calm on duplicate checks or restart it while waiting for cohesion", () => {
    let state = beginAutoRouteCalmPeriod(party());
    const deadline = state.autoRoute!.resumeAfterMs;
    state = beginAutoRouteCalmPeriod(clock(state));
    expect(state.autoRoute?.resumeAfterMs).toBe(deadline);
    state = { ...state, entities: { ...state.entities, m1: { ...state.entities.m1, position: { x: 5, y: 5 } } }, simulationTimeMs: deadline! + 5000 };
    for (let i = 0; i < 5; i++) state = updateAutoRouteExecution(clock(state));
    expect(state.autoRoute?.resumeAfterMs).toBe(deadline);
    expect(state.autoRoute?.pauseReason).toBe("cohesion");
  });

  it("restarts calm after renewed control, without inventing a combat target", () => {
    let state = beginAutoRouteCalmPeriod(party());
    state = applyStatusEffect(clock(state), { type: "immobilized", targetId: "m0", sourceId: "missing", durationMs: 1000 }, 1100);
    state = updateAutoRouteExecution(state);
    expect(state.autoRoute).toMatchObject({ pauseReason: "emergency", emergencyTargetId: undefined, resumeAfterMs: undefined });
    expect(getPartyExecutionIntent(state)).toBeNull();
    state = updateAutoRouteExecution({ ...state, statusEffectsById: {}, simulationTimeMs: 2100 });
    expect(state.autoRoute?.resumeAfterMs).toBe(3600);
  });

  it.each([49, 50, 51])("uses a strict below-50-percent boundary (%s HP)", health => {
    let state = withEnemy(party());
    state = { ...state, entities: { ...state.entities, m0: { ...state.entities.m0 as Companion, health, maxHealth: 100 } }, autoRoute: { interruptCooldownUntilMs: 10000 } };
    expect(getAutoRouteEmergency(state).active).toBe(health < 50);
  });

  it("keeps actual blocker evidence idempotent and requires the full obstruction window", () => {
    let state = withEnemy(party());
    for (let i = 0; i < 9; i++) state = updateAutoRouteExecution(blocked(clock(state)), true);
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0.blockedMs).toBe(900);
    const same = updateAutoRouteExecution(state, true);
    expect(same.autoRoute?.bodyBlocksByEntityId?.m0.blockedMs).toBe(900);
    expect(getAutoRouteEmergency(same).active).toBe(false);
    state = updatePartyIntentSelfDefenseSystem(blocked(clock(same)));
    expect(state.worldTravelTargetMapId).toBe("map-1");
    expect(getPartyExecutionIntent(state)).toMatchObject({ type: "attack", targetId: "blocker" });
    expect(state.failedMoveByEntityId?.m0).not.toBe(true);
  });

  it("ignores stale failures, proximity, and alternating blocker IDs for 100 updates", () => {
    let state = withEnemy(party());
    state.entities.other = createEnemy("other", { x: 42, y: 31 }, "passive");
    state = { ...state, movementFailureMsByEntityId: { m0: 9000 }, movementFailuresByEntityId: { m0: { blockerId: "blocker", blockerKind: "enemy" } } };
    expect(getAutoRouteEmergency(state).active).toBe(false);
    for (let i = 0; i < 100; i++) {
      state = updateAutoRouteExecution(blocked(clock(state), i % 2 ? "other" : "blocker"), true);
      expect(getAutoRouteEmergency(state).active).toBe(false);
    }
  });

  it("credits cumulative route progress, not oscillation or external displacement", () => {
    let state = withEnemy(party());
    for (let i = 0; i < 7; i++) state = updateAutoRouteExecution(blocked(clock(state)), true);
    for (let i = 0; i < 3; i++) {
      state = blocked(clock(state));
      const result = state.normalMovementResultsByEntityId!.m0;
      const to = { x: result.from.x + 0.04, y: result.from.y };
      state = { ...state, entities: { ...state.entities, m0: { ...state.entities.m0, position: to } },
        normalMovementResultsByEntityId: { m0: { ...result, outcome: "moved", to, positionCommitCount: 1 } } };
      state = updateAutoRouteExecution(state, true);
    }
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0.blockedMs).toBe(0);
    state = { ...state, entities: { ...state.entities, m0: { ...state.entities.m0, position: { x: 60, y: 30 } } } };
    state = updateAutoRouteExecution(blocked(clock(state)), true);
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0.blockedMs).toBe(0);
  });

  it("does not let crowd waits or completed holds manufacture path failures", () => {
    let state = withEnemy(party());
    state = blocked(state);
    state.normalMovementResultsByEntityId!.m0.request.mode = "hold";
    state = updateAutoRouteExecution(state, true);
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0).toBeUndefined();
    expect(state.movementFailureMsByEntityId).toBeUndefined();
  });

  it("cannot reuse body-block evidence after a paused or stale-result update", () => {
    let state: GameState = { ...withEnemy(party()), autoRoute: { interruptCooldownUntilMs: 5000 } };
    for (let i = 0; i < 10; i++) state = updateAutoRouteExecution(blocked(clock(state)), true);
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0.blockedMs).toBe(1000);
    state = updateAutoRouteExecution(clock(state, 5000), true);
    expect(getAutoRouteEmergency(state).active).toBe(false);
    state = blocked(clock(state));
    state = authority.acquireSpecializedMovement(state, "m0", "skill", "transaction").state;
    expect(getAutoRouteEmergency(updateAutoRouteExecution(state, true)).active).toBe(false);
  });

  it("does not count lateral oscillation as route progress", () => {
    let state: GameState = { ...withEnemy(party()), autoRoute: { interruptCooldownUntilMs: 10000 } };
    for (let i = 0; i < 12; i++) {
      state = blocked(clock(state));
      const result = state.normalMovementResultsByEntityId!.m0;
      const to = { x: result.from.x, y: i % 2 ? 30 : 30.3 };
      state = { ...state, entities: { ...state.entities, m0: { ...state.entities.m0, position: to } },
        normalMovementResultsByEntityId: { m0: { ...result, outcome: "moved", to } } };
      state = updateAutoRouteExecution(state, true);
    }
    expect(state.autoRoute?.bodyBlocksByEntityId?.m0.blockedMs).toBe(1200);
  });

  it("records pause/resume transitions once despite repeated phase-local evaluations", () => {
    let state = startDebugTelemetryRecording(withEnemy(party()));
    state.entities.m0 = { ...state.entities.m0 as Companion, health: 5 };
    for (let i = 0; i < 5; i++) state = updateAutoRouteExecution(state);
    expect(state.debugTelemetry!.events.filter(event => event.type === "auto_route_paused")).toHaveLength(1);
    state = { ...state, entities: { ...state.entities, m0: { ...state.entities.m0 as Companion, health: 18 }, blocker: { ...state.entities.blocker, state: "dead" } } };
    state = updateAutoRouteExecution(clock(state));
    state = clock(state, 1500);
    for (let i = 0; i < 5; i++) state = updateAutoRouteExecution(state);
    expect(state.debugTelemetry!.events.filter(event => event.type === "auto_route_resumed")).toHaveLength(1);
  });

  it("preserves finalized movement and individual commands across accepted/rejected destination changes", () => {
    let state = party();
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m1", targetPosition: { x: 50, y: 30 } }, 1000).state;
    state = blocked(state);
    state = { ...state, movementPositionCommitsByEntityId: { m0: { source: "normal", transactionId: "normal", from: { x: 39, y: 30 }, to: state.entities.m0.position, frameNumber: 0, timeMs: 1000 } },
      reservedPositionsByEntityId: { m0: state.entities.m0.position } };
    const rejected = startAutoRoute(state, "map-7");
    expect(rejected.state).toBe(state);
    const changed = startAutoRoute(state, "map-2");
    expect(changed.status).toBe("failed"); // Its forward gate is still closed.
    const selected = startAutoRoute(state, "map-1").state;
    expect(selected.directCompanionCommandsById).toBe(state.directCompanionCommandsById);
    expect(selected.movementPositionCommitsByEntityId).toBe(state.movementPositionCommitsByEntityId);
    expect(selected.normalMovementResultsByEntityId).toBe(state.normalMovementResultsByEntityId);
    expect(selected.reservedPositionsByEntityId).toBe(state.reservedPositionsByEntityId);
  });

  it("discards interrupted route steps and resolves the latest destination after calm", () => {
    let state = beginAutoRouteCalmPeriod(party());
    state = { ...state, simulationTimeMs: 3000, interruptedPoiTarget: { mapId: "hub", interruptedByEnemyId: "old",
      leaderIntent: { type: "move", source: "ai", targetId: null, targetPosition: { x: 2, y: 2 } }, globalPoiIntent: null,
      localPoiTarget: null, worldTravelTargetMapId: "map-7" } };
    state = restoreInterruptedPoiTarget(state);
    expect(state.worldTravelTargetMapId).toBe("map-1");
    expect(getPartyExecutionIntent(state)?.targetPosition).not.toEqual({ x: 2, y: 2 });
    state = step(state);
    expect(state.localPoiTarget?.poiId).toBe("hub-to-map-1");
  });
});

describe("Auto Route formation and teleport integration", () => {
  it("passes a transient enemy crowd without dropping the route or starting combat", () => {
    let state = party();
    state.entities.blocker = createEnemy("blocker", { x: 43, y: 25 }, "passive");
    for (let i = 0; i < 30; i++) {
      state = { ...state, entities: { ...state.entities, blocker: { ...state.entities.blocker, position: { x: 43, y: 25 + i * 0.5 } } } };
      state = step(state);
      expect(state.worldTravelTargetMapId).toBe("map-1");
      expect(state.autoRoute?.pauseReason).not.toBe("emergency");
      expect(getPartyExecutionIntent(state)?.type).not.toBe("attack");
    }
    expect(state.entities.m0.position.x).toBeGreaterThan(50);
  }, 20000);

  it.each([false, true])("travels and regroups for 100 updates with Auto Combat %s and one position publication per frame", autoModeEnabled => {
    const publications: string[] = [];
    const commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((current, actor) => {
      const before = current.entities[actor.id].position;
      const next = commit(current, actor);
      if (next.entities[actor.id].position !== before) publications.push(`${current.simulationFrame}:${actor.id}`);
      return next;
    });
    let state = { ...party(3), autoModeEnabled };
    state = { ...state, map: { ...state.map!, teleports: [] } };
    const start = state.entities.m0.position.x;
    for (let i = 0; i < 100; i++) {
      if (i === 35) state = beginAutoRouteCalmPeriod(state);
      state = step(state);
      expect(state.worldTravelTargetMapId).toBe("map-1");
      for (const [id, result] of Object.entries(state.normalMovementResultsByEntityId ?? {})) {
        expect(result.positionCommitCount).toBeLessThanOrEqual(1);
        if (result.outcome === "moved") expect(state.movementPositionCommitsByEntityId?.[id]).toBeDefined();
      }
    }
    expect(state.entities.m0.position.x).toBeGreaterThan(start + 8);
    expect(state.formationAssignments?.travel?.trail.length).toBeGreaterThan(1);
    expect(state.autoRoute?.pauseReason).toBeUndefined();
    expect(publications.length).toBeGreaterThan(100);
    expect(new Set(publications).size).toBe(publications.length);
  }, 30000);

  it("uses formation-relative Euclidean cohesion and excludes temporary departures", () => {
    let state = prepareTravelFormation(party());
    const goal = getTravelFormationExpectedPosition(state, state.entities.m1 as Companion)!;
    state = { ...state, entities: { ...state.entities, m1: { ...state.entities.m1, position: { x: goal.x + 4.3, y: goal.y + 4.3 } } } };
    expect(hasAutoRouteResumeCohesion(state)).toBe(false);
    state = { ...state, directCommandGraceUntilByCompanionId: { m1: 9000 } };
    expect(hasAutoRouteResumeCohesion(state)).toBe(true);
  });

  it.each([false, true])("waits before automatic rally for individual commands, regardless of trigger label (Auto Combat %s)", autoModeEnabled => {
    let state = party();
    state = { ...state, autoModeEnabled, entities: { ...state.entities, m0: { ...state.entities.m0, position: hubTeleporterPosition } } };
    state = setPartyExecutionIntent(state, { type: "move", targetId: null, targetPosition: hubTeleporterPosition, source: "ai" });
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m1", targetPosition: { x: 50, y: 30 } }, 1000).state;
    expect(canStartAutoRouteRally(state, "hub-to-map-1")).toBe(false);
    expect(triggerMapTeleport(state, "player", "hub-to-map-1").activeTeleport).toBeUndefined();
    expect(updateTeleportSystem(state).activeTeleport).toBeUndefined();
    state = finishDirectCompanionCommand(state, state.directCompanionCommandsById!.m1, 1000, "direct_command_completed", "test");
    expect(state.directCommandGraceUntilByCompanionId?.m1).toBeGreaterThan(1000);
    expect(canStartAutoRouteRally(state, "hub-to-map-1")).toBe(true);
    expect(updateTeleportSystem(state).activeTeleport?.id).toBe("hub-to-map-1");
  });

  it("retains already-active rally priority and preserves the destination on an intermediate map", () => {
    let state = party();
    state = { ...state, worldTravelTargetMapId: "map-2", teleportStatesById: { "map-1-to-map-2": { isWorking: true } },
      entities: { ...state.entities, m0: { ...state.entities.m0, position: hubTeleporterPosition }, m1: { ...state.entities.m1, position: { x: 100, y: 30 } } } };
    state = triggerMapTeleport(state, "ai", "hub-to-map-1");
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m1", targetPosition: { x: 95, y: 30 } }, 1000).state;
    state = updateTeleportSystem(state);
    expect(state.currentMapId).toBe("map-1");
    expect(state.worldTravelTargetMapId).toBe("map-2");
    expect(state.formationAssignments).toBeUndefined();
    expect(state.directCompanionCommandsById).toEqual({});
  });

  it("holds a selected route through gate closure and reopens it without a combat calm delay", () => {
    let state = party();
    state = { ...state, teleportStatesById: { "hub-to-map-1": { isWorking: false } } };
    state = updateAutoRouteExecution(state);
    expect(state.autoRoute?.pauseReason).toBe("gate");
    expect(state.worldTravelTargetMapId).toBe("map-1");
    expect(updateTeleportSystem(state).activeTeleport).toBeUndefined();
    state = updateAutoRouteExecution({ ...state, teleportStatesById: { "hub-to-map-1": { isWorking: true } } });
    expect(isAutoRoutePaused(state)).toBe(false);
    expect(state.autoRoute?.resumeAfterMs).toBeUndefined();
  });

  it("revalidates a route gate that closes after rally begins", () => {
    let state = party(1);
    state.entities.m0 = { ...state.entities.m0, position: hubTeleporterPosition };
    state = triggerMapTeleport(state, "ai", "hub-to-map-1");
    state = updateTeleportSystem({ ...state, teleportStatesById: { "hub-to-map-1": { isWorking: false } } });
    expect(state.currentMapId).toBe("hub");
    expect(state.worldTravelTargetMapId).toBe("map-1");
    expect(state.activeTeleport?.id).toBe("hub-to-map-1");
    state = updateTeleportSystem({ ...state, teleportStatesById: { "hub-to-map-1": { isWorking: true } } });
    expect(state.currentMapId).toBe("map-1");
  });

  it("stops an active route rally without canceling individual commands or displacement", () => {
    let state = party();
    state.entities.m0 = { ...state.entities.m0, position: hubTeleporterPosition };
    state = triggerMapTeleport(state, "ai", "hub-to-map-1");
    state = startForcedMovement(state, "m1", "missing-source", { x: 0, y: 1 }, 2, 300, 1000);
    const motion = state.forcedMovementsByEntityId!.m1;
    state = clearAutoRoute(state);
    expect(state.activeTeleport).toBeNull();
    expect(state.worldTravelTargetMapId).toBeNull();
    expect(state.forcedMovementsByEntityId?.m1).toBe(motion);
    expect(updateTeleportSystem(state).currentMapId).toBe("hub");
  });

  it("finishes a committed rally before following a replacement destination in another direction", () => {
    const teleport = createDebugMap("map-2").teleports.find(point => point.targetMapId === "map-1")!;
    let state: GameState = { ...party(1), currentMapId: "map-2", worldTravelTargetMapId: "hub", map: createDebugMap("map-2"),
      worldDiscovery: { visitedMapIds: ["map-1", "map-2", "map-3"], visitedSubzonesByMapId: {} },
      teleportStatesById: { "map-1-to-map-2": { isWorking: true }, "map-2-to-map-3": { isWorking: true } } };
    state.entities.m0 = { ...state.entities.m0, position: teleport.position };
    state = triggerMapTeleport(state, "ai", teleport.id);
    expect(state.activeTeleport).toBeDefined();
    const changed = startAutoRoute(state, "map-3");
    expect(changed.status).toBe("success");
    state = updateTeleportSystem(changed.state);
    expect(state.currentMapId).toBe("map-1");
    expect(state.worldTravelTargetMapId).toBe("map-3");
  });

  it("respects the Patron route lock and an active Warmaster encounter", () => {
    let state = { ...party(), currentMapId: "map-6" as const, worldTravelTargetMapId: "map-7" as const, map: createDebugMap("map-6") };
    expect(startAutoRoute(state, "map-7").status).toBe("failed");
    expect(updateAutoRouteExecution(state).autoRoute?.pauseReason).toBe("gate");
    state = { ...state, teleportStatesById: { "map-6-to-map-7": { isWorking: true } } };
    expect(isAutoRoutePaused(state)).toBe(false);
    const encounter = { ...party(), currentMapId: "map-7" as const, worldTravelTargetMapId: "map-6" as const,
      warmasterLifecycle: { phase: "active" as const, sequence: 1, recharge: 0, rescued: false } };
    expect(updateAutoRouteExecution(encounter).autoRoute?.pauseReason).toBe("gate");
    expect(canStartAutoRouteRally(encounter, "map-7-to-map-6")).toBe(false);
  });

  it("preserves the immediate reward UI pause and a pending arrival-enable cancellation", () => {
    const paused = { ...party(), warmasterInteraction: { departure: { kind: "walk" as const } },
      autoRoute: { autoCombatEnableAtMs: 1000 } };
    const next = step(paused);
    expect(next.simulationTimeMs).toBe(paused.simulationTimeMs);
    expect(next.entities).toBe(paused.entities);
    expect(next.autoModeEnabled).toBe(false);
  });

  it.each(["m0", "m1"])("preserves %s floor, enemy, structure and resource intent during displacement", companionId => {
    const structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "structure", position: { x: 47, y: 32 },
      footprint: { minX: 46.5, maxX: 47.5, minY: 31.5, maxY: 32.5 }, attackBounds: { minX: 46, maxX: 48, minY: 31, maxY: 33 } };
    for (const type of ["move", "enemy", "structure", "gather"] as const) {
      let state = party();
      state = { ...state, entities: { ...state.entities, enemy: createEnemy("enemy", { x: 48, y: 34 }, "passive"),
        resource: createResource("resource", { x: 46, y: 35 }), structure } };
      const input = type === "move" ? { type: "move" as const, companionId, targetPosition: { x: 45, y: 36 } }
        : { type: type === "gather" ? "gather" as const : "attack" as const, companionId, targetId: type === "gather" ? "resource" : type };
      const issued = issueCompanionDirectCommand(state, input, 1000);
      expect(issued.code).toBe("success");
      state = startForcedMovement(issued.state, companionId, "missing-source", { x: 0, y: 1 }, 2, 300, 1000);
      const command = state.directCompanionCommandsById![companionId];
      state = step(state);
      expect(state.directCompanionCommandsById?.[companionId]).toBe(command);
      expect(state.worldTravelTargetMapId).toBe("map-1");
      expect(state.normalMovementResultsByEntityId?.[companionId]?.outcome).not.toBe("moved");
    }
  }, 30000);

  it("resumes the latest leader drag and route after knockback without a second publication", () => {
    const publications: string[] = [];
    const normal = authority.commitNormalMovementPosition, specialized = authority.commitSpecializedMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((current, actor) => {
      const next = normal(current, actor);
      if (next.entities[actor.id].position !== current.entities[actor.id].position) publications.push(`${current.simulationFrame}:${actor.id}`);
      return next;
    });
    vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((current, id, position, source, transaction) => {
      const result = specialized(current, id, position, source, transaction);
      if (result.outcome === "moved") publications.push(`${current.simulationFrame}:${id}`);
      return result;
    });
    let state = party();
    state = { ...state, map: { ...state.map!, teleports: [] } };
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m0", targetPosition: { x: 45, y: 30 } }, 1000).state;
    state = startForcedMovement(state, "m0", "missing-source", { x: 0, y: 1 }, 2, 300, 1000);
    state = step(state);
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m0", targetPosition: { x: 46, y: 33 } }, 1100).state;
    for (let i = 0; i < 100; i++) state = step(state);
    expect(state.worldTravelTargetMapId).toBe("map-1");
    expect(state.directCompanionCommandsById?.m0).toBeUndefined();
    expect(state.forcedMovementsByEntityId?.m0).toBeUndefined();
    expect(state.entities.m0.position.x).toBeGreaterThan(50);
    expect(new Set(publications).size).toBe(publications.length);
  }, 30000);

  it("clears route-owned execution on stop and world orders without deleting individual intent", () => {
    let state = party();
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "m1", targetPosition: { x: 50, y: 30 } }, 1000).state;
    const command = state.directCompanionCommandsById!.m1;
    expect(clearAutoRoute(state).directCompanionCommandsById!.m1).toBe(command);
    const clicked = issuePartyOrder(clearAutoRoute(state), { type: "move", targetPosition: { x: 45, y: 30 } });
    expect(clicked.worldTravelTargetMapId).toBeNull();
    expect(getPartyExecutionIntent(clicked)?.targetPosition).toEqual({ x: 45, y: 30 });
    expect(clicked.directCompanionCommandsById!.m1).toBe(command);
  });

  it("keeps Travel stop final through resurrection and 100 subsequent updates", () => {
    let state = party();
    state.entities.m1 = { ...state.entities.m1 as Companion, health: 0, state: "dead" };
    state = updatePartyIntentRecoverySystem(setPartyExecutionIntent(state, {
      type: "move", source: "ai", targetId: null, targetPosition: hubTeleporterPosition,
    }));
    state = step(state);
    const recovery = state.partyIntent!.recoveryIntent;
    const channels = state.resurrectionChannelsByHelperId;
    expect(state.partyIntent?.queuedIntent?.worldTravelTargetMapId).toBe("map-1");
    expect(channels?.m0).toBeDefined();
    state = clearAutoRoute(state);
    expect(state.partyIntent?.recoveryIntent).toBe(recovery);
    expect(state.resurrectionChannelsByHelperId).toBe(channels);
    expect(state.partyIntent?.queuedIntent?.worldTravelTargetMapId).toBeFalsy();
    for (let i = 0; i < 100; i++) {
      state = step(state);
      expect(state.worldTravelTargetMapId).toBeNull();
      expect(state.activeTeleport).toBeFalsy();
    }
    expect(state.entities.m1.state).not.toBe("dead");
    expect((state.entities.m1 as Companion).health).toBeGreaterThan(0);
    expect(state.partyIntent?.recoveryIntent).toBeFalsy();
    expect(getPartyExecutionIntent(state)).toBeNull();
  }, 30000);

  it("does not discard an unrelated recovery snapshot when stopping a route", () => {
    let state = party();
    state.entities.m1 = { ...state.entities.m1 as Companion, health: 0, state: "dead" };
    state = updatePartyIntentRecoverySystem(state);
    const queued = { executionIntent: { type: "move" as const, source: "player" as const, targetId: null,
      targetPosition: { x: 45, y: 35 } }, globalPoiIntent: null, localPoiTarget: null, worldTravelTargetMapId: null };
    state = { ...state, partyIntent: { ...state.partyIntent!, queuedIntent: queued } };
    expect(clearAutoRoute(state).partyIntent?.queuedIntent).toBe(queued);
  });

  it("cleans transient observations on removal, transition and save while retaining serialized destination", () => {
    let state = updateAutoRouteExecution(blocked(withEnemy(party())), true);
    const entities = { ...state.entities };
    delete entities.blocker;
    expect(pruneMissingEntityRuntimeState({ ...state, entities }).autoRoute?.bodyBlocksByEntityId).toEqual({});
    expect(clearMapTransitionRuntimeState(state).autoRoute).toBeUndefined();
    const saved = createSavedGame(state, 1000);
    expect(saved.state.autoRoute).toBeUndefined();
    expect(saved.state.worldTravelTargetMapId).toBe("map-1");
    const restored = restoreGameStateFromSave(saved);
    expect(restored.ok).toBe(true);
    state = updateAutoRouteRuntime({ ...state, currentMapId: "map-1", autoCombatOnArrivalEnabled: true });
    const deadline = state.autoRoute?.autoCombatEnableAtMs;
    expect(updateAutoRouteRuntime(state).autoRoute?.autoCombatEnableAtMs).toBe(deadline);
  });
});
