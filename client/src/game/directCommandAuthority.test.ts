import { describe, expect, it, vi, afterEach } from "vitest";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { resolveBasicAttackImpact } from "./combatBasicAttackResolution";
import { getActiveSkillsForCompanion } from "./skillProgression";
import { issueCompanionDirectCommand, updateDirectCompanionCommandSystem } from "./directCompanionCommands";
import { issuePartyOrder } from "./commands";
import { updatePartyIntentSelfDefenseSystem } from "./partyIntentSystem";
import { updateRoleSystem } from "./roleSystem";
import { updateFollowSystem } from "./followSystem";
import * as followSystem from "./followSystem";
import { updateAttackSystem } from "./attackSystem";
import { beginNormalMovementPhase, getMovementPositionCommit, getNormalMovementResult } from "./movementAuthority";
import * as authority from "./movementAuthority";
import { endNormalMovementPhase, moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { clearFrameMovementPlanning } from "./movementState";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import { updatePoiSystem } from "./poiSystem";
import { updateTeleportSystem } from "./teleportSystem";
import { updateGatherSystem } from "./gatherSystem";
import { updateStructureRuntime } from "./combatStructures";
import { BARRACK_DEFINITIONS, createBarrackEntity } from "./barrackDefinitions";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { startForcedMovement, updateForcedMovements } from "./forcedMovement";
import { finishDirectCompanionCommand } from "./directCommandState";
import { getPartyExecutionIntentReachability } from "./partyOrderReachability";
import { bakeNavigationGrid } from "./navigation";
import { restoreInterruptedPoiTarget, captureInterruptedPoiTarget } from "./poiResumeSystem";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { areEntitiesOverlapping } from "./spatialGeometry";
import { sanitizeGameStateForSave } from "./saveGame";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import type { GameState } from "./state";
import type { Enemy } from "./types";

afterEach(() => vi.restoreAllMocks());

function fixture(): GameState {
  const leader = createCompanion("leader", { x: 5, y: 5 }, "leader", "fighter", 0);
  const actor = createCompanion("actor", { x: 7, y: 5 }, "leader", "fighter");
  const target = createEnemy("target", { x: 12, y: 5 });
  const threat = { ...createEnemy("threat", { x: 7, y: 7 }, "aggressive"), state: "attack" as const, currentTargetId: actor.id };
  const map = { columns: 40, rows: 40, walls: [], teleports: [], healingFountains: [], displayName: "Direct", debugName: "direct" };
  return createTestGameState({ entities: { leader, actor, target, threat }, partyLeaderId: leader.id, simulationTimeMs: 1000,
    map: { ...map, navigationGrid: bakeNavigationGrid(map) } });
}

describe.each(["gather", "npc"] as const)("damage during party %s interaction", interaction => {
  it.each(["move", "enemy", "structure"] as const)("preserves an individual %s order after an actual hit", type => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const resource = createResource("resource", { x: 12, y: 10 });
    const npc = createNpc("merchant", { x: 15, y: 15 }, "Merchant", "merchant");
    const structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "structure", position: { x: 12, y: 5 },
      footprint: { minX: 11.5, maxX: 12.5, minY: 4.5, maxY: 5.5 }, attackBounds: { minX: 11, maxX: 13, minY: 4, maxY: 6 } };
    let state = fixture();
    state = { ...state, entities: { ...state.entities, resource, merchant: npc, structure } };
    const issued = issueCompanionDirectCommand(state, type === "move"
      ? { type: "move", companionId: "actor", targetPosition: { x: 16, y: 5 } }
      : { type: "attack", companionId: "actor", targetId: type === "enemy" ? "target" : structure.id }, 1000);
    expect(issued.code).toBe("success");
    state = issuePartyOrder(issued.state, interaction === "gather"
      ? { type: "gather", targetId: resource.id }
      : { type: "move", targetPosition: { x: 14, y: 15 } });
    const before = state.entities.actor as ReturnType<typeof createCompanion>;
    const command = state.directCompanionCommandsById!.actor;
    const intent = state.leaderIntent;
    const next = resolveBasicAttackImpact(state, state.entities.threat as Enemy,
      before as ReturnType<typeof createCompanion>, 1100).state;

    expect(next.entities.actor).toMatchObject({ state: before.state,
      currentTargetId: before.currentTargetId, commandPriority: "direct" });
    expect((next.entities.actor as ReturnType<typeof createCompanion>).health).toBeLessThan(
      (before as ReturnType<typeof createCompanion>).health);
    expect(next.directCompanionCommandsById!.actor).toBe(command);
    expect(next.leaderIntent).toBe(intent);
    expect(next.interruptedPoiTarget).toBe(state.interruptedPoiTarget);
  });
});

describe("direct command damage and assistance boundaries", () => {
  it("does not recruit a nearby stored floor order when its priority flag drifted", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const original = fixture();
    let state: GameState = { ...original, entities: { ...original.entities,
      actor: { ...original.entities.actor, position: { x: 6.4, y: 5 } },
      threat: { ...original.entities.threat, position: { x: 5, y: 6.6 }, currentTargetId: "leader" } as Enemy,
    } };
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "actor", targetPosition: { x: 16, y: 5 } }, 1000).state;
    state = { ...state, entities: { ...state.entities,
      actor: { ...state.entities.actor, commandPriority: "autonomous" } as ReturnType<typeof createCompanion>,
    } };
    const next = resolveBasicAttackImpact(state, state.entities.threat as Enemy,
      state.entities.leader as ReturnType<typeof createCompanion>, 1100).state;
    expect(next.entities.actor).toBe(state.entities.actor);
    expect(next.directCompanionCommandsById!.actor).toBe(state.directCompanionCommandsById!.actor);
  });

  it.each([false, true])("keeps personal defense direct and resumes its resource (player interaction: %s)", playerInteraction => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const resource = createResource("resource", { x: 10, y: 10 });
    let state = fixture();
    state = { ...state, entities: { ...state.entities, resource } };
    state = issueCompanionDirectCommand(state, { type: "gather", companionId: "actor", targetId: resource.id }, 1000).state;
    if (playerInteraction) state = issuePartyOrder(state, { type: "gather", targetId: resource.id });
    const command = state.directCompanionCommandsById!.actor;
    state = resolveBasicAttackImpact(state, state.entities.threat as Enemy,
      state.entities.actor as ReturnType<typeof createCompanion>, 1100).state;
    expect(state.entities.actor).toMatchObject({ state: "attack", currentTargetId: "threat", commandPriority: "direct" });
    expect(state.directCompanionCommandsById!.actor).toBe(command);
    state = { ...state, entities: { ...state.entities, threat: { ...state.entities.threat, state: "dead", health: 0 } as Enemy } };
    state = updateDirectCompanionCommandSystem(state, new Set(), 1200);
    expect(state.entities.actor).toMatchObject({ state: "gather", currentTargetId: resource.id, commandPriority: "direct" });
    expect(state.directCompanionCommandsById!.actor).toBe(command);
  });

  it.each([false, true])("never copies private leader focus after its own target dies (Auto Combat: %s)", auto => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const original = fixture();
    const target = createEnemy("private", { x: 9, y: 5 });
    let state: GameState = { ...original, autoModeEnabled: auto, entities: {
      leader: original.entities.leader,
      actor: { ...original.entities.actor, position: { x: 7.4, y: 5 }, state: "attack", currentTargetId: "dead" } as ReturnType<typeof createCompanion>,
      private: target, dead: { ...createEnemy("dead", { x: 7.4, y: 7 }), state: "dead", health: 0 },
    }, globalCooldownsByCompanionId: { leader: {
      companionId: "leader", source: "basic_attack", startedAt: 1000, expiresAt: 100000,
    } }, skillCooldownsByCompanionId: { actor: Object.fromEntries(
      getActiveSkillsForCompanion(original.entities.actor as ReturnType<typeof createCompanion>)
        .map(skill => [skill.id, { companionId: "actor", skillId: skill.id, expiresAt: 100000 }]),
    ) } };
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "leader", targetId: target.id }, 1000).state;
    const command = state.directCompanionCommandsById!.leader;
    // Isolate basic assistance from independent skill acquisition, and keep the
    // leader from creating a legitimate shared threat by hitting first.
    for (let index = 0; index < 30; index++) {
      state = updateGame(state, { nowMs: 1100 + index * 100, deltaMs: 100, frameNumber: index + 1 });
      expect(state.entities.actor).not.toMatchObject({ currentTargetId: target.id });
      expect((state.entities.actor as ReturnType<typeof createCompanion>).lastAttackAt).toBe(0);
      expect((state.entities.private as Enemy).health).toBe(target.health);
      expect(state.directCompanionCommandsById!.leader).toBe(command);
    }
  });

  it.each(["party focus", "active threat"] as const)("allows assistance independently authorized by %s", authorization => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const original = fixture();
    const target = { ...createEnemy("private", { x: 9, y: 5 }),
      ...(authorization === "active threat" ? { state: "attack" as const, currentTargetId: "leader" } : {}) };
    let state: GameState = { ...original, entities: { leader: original.entities.leader,
      actor: { ...original.entities.actor, position: { x: 7.4, y: 5 }, state: "attack", currentTargetId: "dead" } as ReturnType<typeof createCompanion>,
      private: target, dead: { ...createEnemy("dead", { x: 7.4, y: 7 }), state: "dead", health: 0 },
    }, leaderIntent: authorization === "party focus"
      ? { type: "attack", source: "player", targetId: target.id, targetPosition: target.position } : null };
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "leader", targetId: target.id }, 1000).state;
    state = updateAttackSystem(state, new Set(), 1100);
    expect(state.entities.actor).toMatchObject({ currentTargetId: target.id, lastAttackAt: 1100 });
    expect((state.entities.private as Enemy).health).toBeLessThan(target.health);
  });

  it("does not turn a private structure focus into an assistance target", () => {
    const original = fixture();
    const structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "private", position: { x: 12, y: 5 },
      footprint: { minX: 11.5, maxX: 12.5, minY: 4.5, maxY: 5.5 }, attackBounds: { minX: 11, maxX: 13, minY: 4, maxY: 6 } };
    let state: GameState = { ...original, entities: { leader: original.entities.leader, private: structure,
      actor: { ...original.entities.actor, position: { x: 10.2, y: 5 }, state: "attack", currentTargetId: "dead" } as ReturnType<typeof createCompanion>,
      dead: { ...createEnemy("dead", { x: 10.2, y: 7 }), state: "dead", health: 0 },
    } };
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "leader", targetId: structure.id }, 1000).state;
    expect(state.directCompanionCommandsById?.leader).toBeDefined();
    state = updateAttackSystem(state, new Set(), 1100);
    expect(state.entities.actor).toMatchObject({ state: "follow", currentTargetId: "leader", lastAttackAt: 0 });
    expect(state.entities.private).toBe(structure);
    expect(getMovementPositionCommit(state, "actor")).toBeUndefined();
  });
});

describe("direct command behavioral authority", () => {
  it("a movement-only direct order cannot attack from a stale attack state", () => {
    let state = issueCompanionDirectCommand(fixture(), { type: "move", companionId: "actor", targetPosition: { x: 15, y: 5 } }, 1000).state;
    state = { ...state, entities: { ...state.entities, actor: { ...state.entities.actor, state: "attack", currentTargetId: "threat" } as ReturnType<typeof createCompanion> } };
    const next = updateAttackSystem(state, new Set(), 4000);
    expect(next.entities.threat).toMatchObject({ health: (state.entities.threat as Enemy).health });
    expect(getMovementPositionCommit(next, "actor")).toBeUndefined();
  });

  it.each(["move", "attack", "gather"] as const)("party orders do not overwrite individual %s state, even if the flag drifted", type => {
    const resource = createResource("resource", { x: 10, y: 10 });
    let state = fixture();
    state = { ...state, entities: { ...state.entities, resource } };
    state = issueCompanionDirectCommand(state, type === "move"
      ? { type, companionId: "actor", targetPosition: { x: 15, y: 5 } }
      : { type, companionId: "actor", targetId: type === "attack" ? "target" : resource.id }, 1000).state;
    const command = state.directCompanionCommandsById!.actor;
    state = { ...state, entities: { ...state.entities, actor: { ...state.entities.actor, commandPriority: "autonomous" } as ReturnType<typeof createCompanion> } };
    const actor = state.entities.actor;
    const next = issuePartyOrder(state, { type: "move", targetPosition: { x: 20, y: 15 } });
    expect(next.directCompanionCommandsById!.actor).toBe(command);
    expect(next.entities.actor).toBe(actor);
    expect(next.leaderIntent).toMatchObject({ type: "move", targetPosition: { x: 20, y: 15 } });
  });

  it.each(["move", "attack"] as const)("personal aggression cannot interrupt a direct %s command", type => {
    let state = issueCompanionDirectCommand(fixture(), type === "move"
      ? { type, companionId: "actor", targetPosition: { x: 15, y: 5 } }
      : { type, companionId: "actor", targetId: "target" }, 1000).state;
    const actor = state.entities.actor;
    state = { ...state, autoModeEnabled: true, leaderIntent: { type: "move", source: "ai", targetId: null, targetPosition: { x: 20, y: 5 } } };
    state = updatePartyIntentSelfDefenseSystem(state);
    expect(state.entities.actor).toEqual(actor);
  });

  it("ignores blocker evidence for direct gathering, but retains the resource through personal self-defense", () => {
    const resource = createResource("resource", { x: 10, y: 10 });
    let state = fixture();
    state = { ...state, entities: { ...state.entities, resource, threat: { ...state.entities.threat, state: "idle", currentTargetId: null } as ReturnType<typeof createEnemy> } };
    state = issueCompanionDirectCommand(state, { type: "gather", companionId: "actor", targetId: resource.id }, 1000).state;
    const command = state.directCompanionCommandsById!.actor;
    state = updateDirectCompanionCommandSystem({ ...state, movementFailuresByEntityId: { actor: { blockerId: "threat" } } });
    expect(state.entities.actor.state).toBe("gather");
    state = { ...state, entities: { ...state.entities, threat: { ...state.entities.threat, state: "attack", currentTargetId: "actor" } as ReturnType<typeof createEnemy> } };
    state = updateDirectCompanionCommandSystem(state);
    expect(state.entities.actor).toMatchObject({ state: "attack", currentTargetId: "threat", commandPriority: "direct" });
    expect(state.directCompanionCommandsById!.actor).toBe(command);
    state = { ...state, entities: { ...state.entities, threat: { ...state.entities.threat, state: "dead", health: 0 } as Enemy } };
    state = updateDirectCompanionCommandSystem(state);
    expect(state.entities.actor).toMatchObject({ state: "gather", currentTargetId: resource.id, commandPriority: "direct" });
  });

  it("role and follow producers honor stored authority when a mutable flag is stale", () => {
    let state = issueCompanionDirectCommand(fixture(), { type: "move", companionId: "actor", targetPosition: { x: 15, y: 5 } }, 1000).state;
    state = { ...state, entities: { ...state.entities, actor: { ...state.entities.actor, commandPriority: "autonomous" } as ReturnType<typeof createCompanion> } };
    state = { ...state, leaderIntent: { type: "attack", source: "ai", targetId: "threat", targetPosition: { x: 7, y: 7 } },
      entities: { ...state.entities, actor: { ...state.entities.actor, position: { x: 6, y: 5 } } } };
    const actor = state.entities.actor;
    expect(updateRoleSystem(state).entities.actor).toBe(actor);
    expect(updateFollowSystem(state).entities.actor.position).toEqual(actor.position);
  });

  it("attack fallback never substitutes another companion's target for an active focus", () => {
    let state = issueCompanionDirectCommand(fixture(), { type: "attack", companionId: "actor", targetId: "target" }, 1000).state;
    state = { ...state, entities: { ...state.entities, target: { ...state.entities.target, state: "dead", health: 0 } as Enemy,
      leader: { ...state.entities.leader, state: "attack", currentTargetId: "threat" } as ReturnType<typeof createCompanion> } };
    const next = updateAttackSystem(state, new Set(), 1100);
    expect(next.entities.actor).not.toMatchObject({ currentTargetId: "threat" });
  });
});

describe("direct command replacement and movement budgets", () => {
  it("waits through crowd obstruction for thirty updates and resumes the original destination", () => {
    let state = fixture();
    state = { ...state, entities: { leader: state.entities.leader, actor: state.entities.actor } };
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "actor", targetPosition: { x: 15, y: 5 } }, 1000).state;
    const command = state.directCompanionCommandsById!.actor;
    const blockers = Array.from({ length: 8 }, (_, index) => createEnemy(`blocker-${index}`, {
      x: 7 + Math.cos(index * Math.PI / 4) * 1.8, y: 5 + Math.sin(index * Math.PI / 4) * 1.8,
    }, "passive", { combatBodyRadius: 0.7 }));
    state = { ...state, entities: { ...state.entities, ...Object.fromEntries(blockers.map(actor => [actor.id, actor])) } };
    const start = state.entities.actor.position;
    consumeGamePerformanceMetrics();
    for (let index = 0; index < 30; index++) {
      state = clearFrameMovementPlanning({ ...state, simulationFrame: index + 1, simulationTimeMs: 1100 + index * 100 });
      state = updateDirectCompanionCommandSystem(state, new Set(), state.simulationTimeMs);
      expect(state.directCompanionCommandsById!.actor).toBe(command);
      expect(state.entities.actor.position).toEqual(start);
      expect(getNormalMovementResult(state, "actor")?.reason).toBe("crowd_wait");
      expect(state.movementFailureMsByEntityId?.actor).toBeUndefined();
    }
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBeLessThanOrEqual(60);
    state = { ...state, entities: { leader: state.entities.leader, actor: state.entities.actor } };
    for (let index = 0; index < 60; index++) {
      state = clearFrameMovementPlanning({ ...state, simulationFrame: 31 + index, simulationTimeMs: 4100 + index * 100 });
      state = updateDirectCompanionCommandSystem(state, new Set(), state.simulationTimeMs);
    }
    expect(state.directCompanionCommandsById?.actor).toBeUndefined();
    expect(state.entities.actor.position.x).toBeGreaterThanOrEqual(14.75);
  });

  it("rejects a replacement without discarding the current command, path or actor state", () => {
    let state = issueCompanionDirectCommand(fixture(), { type: "attack", companionId: "actor", targetId: "target" }, 1000).state;
    const actor = state.entities.actor, command = state.directCompanionCommandsById!.actor;
    const path = { targetKey: "existing", waypoints: [{ x: 8, y: 5 }] };
    state = { ...state, movementPathsByEntityId: { actor: path } };
    const next = issueCompanionDirectCommand(state, { type: "move", companionId: "actor", targetPosition: { x: 60, y: 5 } }, 1100);
    expect(next.code).not.toBe("success");
    expect(next.state.entities.actor).toBe(actor);
    expect(next.state.directCompanionCommandsById!.actor).toBe(command);
    expect(next.state.movementPathsByEntityId!.actor).toBe(path);
  });

  it("discards an old pending request before a replacement is resolved", () => {
    let state = issueCompanionDirectCommand(fixture(), { type: "move", companionId: "actor", targetPosition: { x: 15, y: 5 } }, 1000).state;
    state = updateDirectCompanionCommandSystem(beginNormalMovementPhase(state), new Set(), 1000);
    expect(state.normalMovementPhase!.submissions).toHaveLength(1);
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "actor", targetPosition: { x: 7, y: 15 } }, 1000).state;
    expect(state.normalMovementPhase!.submissions).toHaveLength(0);
    state = endNormalMovementPhase(updateDirectCompanionCommandSystem(state, new Set(), 1000));
    expect(getNormalMovementResult(state, "actor")?.request.destination).toEqual({ x: 7, y: 15 });
  });

  it("does not reset a finalized position budget or reservation when replacing an order", () => {
    const commits = vi.spyOn(authority, "commitNormalMovementPosition");
    let state = issueCompanionDirectCommand(fixture(), { type: "move", companionId: "actor", targetPosition: { x: 15, y: 5 } }, 1000).state;
    state = updateDirectCompanionCommandSystem(state, new Set(), 1000);
    const committed = getMovementPositionCommit(state, "actor"), result = getNormalMovementResult(state, "actor");
    const reserved = state.reservedPositionsByEntityId!.actor;
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "actor", targetPosition: { x: 7, y: 15 } }, 1000).state;
    state = updateDirectCompanionCommandSystem(state, new Set(), 1000);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(getMovementPositionCommit(state, "actor")).toBe(committed);
    expect(getNormalMovementResult(state, "actor")).toBe(result);
    expect(state.reservedPositionsByEntityId!.actor).toBe(reserved);
    state = clearFrameMovementPlanning({ ...state, simulationFrame: 1, simulationTimeMs: 1100 });
    state = moveEntityTowardPositionIfUnoccupied(state, state.entities.actor, { x: 7, y: 15 }, { source: "direct" });
    expect(commits).toHaveBeenCalledTimes(2);
    expect(getNormalMovementResult(state, "actor")?.request.destination).toEqual({ x: 7, y: 15 });
  });
});

describe("direct leader reference and lifecycle", () => {
  it("resumes the latest party destination after a leader override, not an older interrupted goal", () => {
    const original = fixture();
    let state: GameState = { ...original, entities: { leader: original.entities.leader, actor: original.entities.actor },
      leaderIntent: { type: "move", source: "player", targetId: null, targetPosition: { x: 5, y: 20 } } };
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "leader", targetPosition: { x: 18, y: 5 } }, 1000).state;
    const command = state.directCompanionCommandsById!.leader;
    for (let index = 0; index < 110; index++) {
      if (index === 5) {
        state = issuePartyOrder(state, { type: "move", targetPosition: { x: 18, y: 18 } });
        expect(state.directCompanionCommandsById!.leader).toBe(command);
      }
      state = updateGame(state, { nowMs: 1100 + index * 100, deltaMs: 100, frameNumber: index + 1 });
      if (index < 5) expect(state.leaderIntent?.targetPosition).toEqual({ x: 5, y: 20 });
    }
    expect(state.directCompanionCommandsById?.leader).toBeUndefined();
    expect(state.entities.leader.position.x).toBeGreaterThan(17);
    expect(state.entities.leader.position.y).toBeGreaterThan(17);
  });

  it.each(["attack", "gather"] as const)("does not share the leader's individual %s target with followers", type => {
    const original = fixture();
    const target = type === "attack" ? createEnemy("individual", { x: 22, y: 5 }) : createResource("individual", { x: 22, y: 10 });
    let state: GameState = { ...original, autoModeEnabled: true,
      entities: { leader: original.entities.leader, actor: original.entities.actor, individual: target } };
    state = issueCompanionDirectCommand(state, { type, companionId: "leader", targetId: target.id }, 1000).state;
    expect(state.directCompanionCommandsById?.leader).toBeDefined();
    const references: GameState["entities"][string]["position"][] = [];
    const originalFollow = followSystem.updateFollowSystem;
    vi.spyOn(followSystem, "updateFollowSystem").mockImplementation((current, moved) => {
      references.push(current.entities.leader.position);
      return originalFollow(current, moved);
    });
    for (let index = 0; index < 8; index++) {
      state = updateGame(state, { nowMs: 1100 + index * 100, deltaMs: 100, frameNumber: index + 1 });
      expect(state.entities.actor).not.toMatchObject({ currentTargetId: target.id });
      expect(state.leaderIntent?.targetId).not.toBe(target.id);
      expect(references.at(-1)).toEqual(state.entities.leader.position);
    }
  });

  it.each([{ auto: false, reverse: false }, { auto: false, reverse: true }, { auto: true, reverse: false }, { auto: true, reverse: true }])(
    "followers track a directly moved leader for repeated real updates (%j)", ({ auto, reverse }) => {
    const original = fixture();
    let state: GameState = { ...original, autoModeEnabled: auto, entities: {
      leader: { ...original.entities.leader, state: "idle", currentTargetId: null } as ReturnType<typeof createCompanion>,
      actor: { ...original.entities.actor, state: "idle", currentTargetId: null } as ReturnType<typeof createCompanion>,
    } };
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "leader", targetPosition: { x: 18, y: 5 } }, 1000).state;
    if (reverse) state = { ...state, entities: Object.fromEntries(Object.entries(state.entities).reverse()) };
    const start = state.entities.actor.position;
    const normal = authority.commitNormalMovementPosition;
    const publications: string[] = [];
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((current, actor) => {
      const next = normal(current, actor);
      if (next.entities[actor.id].position !== current.entities[actor.id].position)
        publications.push(`${current.simulationFrame}:${actor.id}`);
      return next;
    });
    const specialized = authority.commitSpecializedMovementPosition;
    vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((current, id, position, source, transactionId) => {
      const result = specialized(current, id, position, source, transactionId);
      if (result.outcome === "moved") publications.push(`${current.simulationFrame}:${id}`);
      return result;
    });
    let settledPosition: typeof start | undefined;
    for (let index = 0; index < 70; index++) {
      state = updateGame(state, { nowMs: 1100 + index * 100, deltaMs: 100, frameNumber: index + 1 });
      expect(new Set(publications).size).toBe(publications.length);
      expect(state.partyLeaderId).toBe("leader");
      // Scoped transit can overlap temporarily; settled followers must not.
      if (index >= 40) expect(areEntitiesOverlapping(state.entities.leader, state.entities.actor)).toBe(false);
      if (!auto && index === 39) settledPosition = state.entities.actor.position;
      if (!auto && index >= 40) expect(state.entities.actor.position).toEqual(settledPosition);
    }
    expect(state.entities.actor.position.x).toBeGreaterThan(start.x + 5);
    expect(state.entities.leader.position.x).toBeGreaterThan(17);
    expect(state.directCompanionCommandsById?.leader).toBeUndefined();
  });

  it("does not pull combat, resource work, resurrection helpers or other direct members into leader following", () => {
    let state = fixture();
    const resource = createResource("resource", { x: 15, y: 15 });
    const collector = { ...createCompanion("collector", { x: 12, y: 15 }, "leader", "fighter"), state: "gather" as const, currentTargetId: resource.id };
    const helper = createCompanion("helper", { x: 5, y: 12 }, "leader", "support");
    state = { ...state, entities: { ...state.entities, resource, collector, helper,
      actor: { ...state.entities.actor, state: "attack", currentTargetId: "target" } as ReturnType<typeof createCompanion> },
      resurrectionChannelsByHelperId: { helper: { helperId: helper.id, targetId: "dead" } } };
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "leader", targetPosition: { x: 18, y: 5 } }, 1000).state;
    const next = updateFollowSystem(state);
    for (const id of ["actor", "collector", "helper"]) expect(next.entities[id]).toBe(state.entities[id]);
  });

  it("preserves interrupted objectives across individual commands, but not a newer party order", () => {
    let state = fixture();
    state = { ...state, entities: { ...state.entities, threat: { ...state.entities.threat, state: "idle", currentTargetId: null } as Enemy },
      leaderIntent: { type: "move", source: "ai", targetId: null, targetPosition: { x: 15, y: 15 } } };
    state = captureInterruptedPoiTarget(state, state.entities.threat as Enemy);
    const interrupted = state.interruptedPoiTarget;
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "leader", targetPosition: { x: 15, y: 5 } }, 1000).state;
    expect(restoreInterruptedPoiTarget(state).interruptedPoiTarget).toBe(interrupted);
    state = issuePartyOrder(state, { type: "move", targetPosition: { x: 8, y: 15 } });
    expect(restoreInterruptedPoiTarget(state).leaderIntent?.targetPosition).toEqual({ x: 8, y: 15 });
    expect(state.interruptedPoiTarget).toBeNull();
  });

  it("clears commands and grace on map transition and save restoration without new persistence", () => {
    const state = issueCompanionDirectCommand(fixture(), { type: "move", companionId: "actor", targetPosition: { x: 15, y: 5 } }, 1000).state;
    for (const cleared of [clearMapTransitionRuntimeState(state), sanitizeGameStateForSave(state, 1100)]) {
      expect(cleared.directCompanionCommandsById).toEqual({});
      expect(cleared.directCommandGraceUntilByCompanionId).toEqual({});
    }
  });

  it("preserves suspended POI and route state, and does not activate a new teleport", () => {
    const original = fixture();
    const goal = { x: 5, y: 20 };
    let state: GameState = { ...original, autoModeEnabled: true, worldTravelTargetMapId: "map-1",
      leaderIntent: { type: "move", targetId: null, targetPosition: goal, source: "ai" },
      localPoiTarget: { poiId: "saved", category: "teleport", position: goal, mapId: "hub", reason: "Route" },
      map: { ...original.map!, teleports: [{ id: "test-teleport", position: { x: 5, y: 5 }, range: 3, sourceMapId: "hub", targetMapId: "map-1", arrivalPositions: [{ x: 5, y: 5 }] }] },
    };
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "leader", targetPosition: { x: 18, y: 5 } }, 1000).state;
    expect(updatePoiSystem(state)).toBe(state);
    expect(updateTeleportSystem(state)).toBe(state);
    expect(state.worldTravelTargetMapId).toBe("map-1");
    expect(getPartyExecutionIntentReachability(state, state.entities.leader, { type: "move", targetId: null, targetPosition: { x: 10, y: 20 } }).reason).toBe("valid");
    const next = issuePartyOrder(state, { type: "move", targetPosition: { x: 10, y: 20 } });
    expect(next.worldTravelTargetMapId).toBeNull();
    expect(next.directCompanionCommandsById!.leader).toBe(state.directCompanionCommandsById!.leader);
    expect(next.interruptedPoiTarget).toBeNull();
    expect(next.leaderIntent?.targetPosition).toEqual({ x: 10, y: 20 });
  });

  it("completes a destroyed structure focus exactly once with rejoin grace", () => {
    const structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "structure", position: { x: 12, y: 5 },
      footprint: { minX: 11.5, maxX: 12.5, minY: 4.5, maxY: 5.5 }, attackBounds: { minX: 11, maxX: 13, minY: 4, maxY: 6 } };
    let state = fixture();
    state = startDebugTelemetryRecording({ ...state, entities: { ...state.entities, structure } });
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "actor", targetId: structure.id }, 1000).state;
    const command = state.directCompanionCommandsById!.actor;
    expect(command).toBeDefined();
    state = updateStructureRuntime(state, { ...structure, health: 0, state: "dead" }, 1100);
    state = updateDirectCompanionCommandSystem(state, new Set(), 1100);
    state = finishDirectCompanionCommand(state, command, 1100, "direct_command_completed", "target_invalid");
    expect(state.directCompanionCommandsById?.actor).toBeUndefined();
    expect(state.directCommandGraceUntilByCompanionId?.actor).toBe(2600);
    expect(state.debugTelemetry!.events.filter(event => event.type === "direct_command_completed")).toHaveLength(1);
    expect(state.debugTelemetry!.events.filter(event => event.type === "direct_command_grace_started")).toHaveLength(1);
  });

  it("retains a direct resource reservation during self-defense", () => {
    const resource = createResource("resource", { x: 8, y: 9 }, { maxGatherers: 1 });
    const collector = { ...createCompanion("collector", { x: 8, y: 8 }, "leader", "fighter"), state: "gather" as const, currentTargetId: resource.id };
    let state = fixture();
    state = { ...state, entities: { ...state.entities, resource, collector } };
    state = issueCompanionDirectCommand(state, { type: "gather", companionId: "actor", targetId: resource.id }, 1000).state;
    state = updateDirectCompanionCommandSystem(state, new Set(), 1100);
    expect(state.entities.actor.state).toBe("attack");
    const next = updateGatherSystem(state, new Set(), 1100);
    expect(next.entities.collector.state).toBe("follow");
    expect(next.entities.resource).toEqual(resource);
    expect(next.directCompanionCommandsById!.actor).toBe(state.directCompanionCommandsById!.actor);
  });

  it("invalidates a focus during knockback without ending its physical transaction", () => {
    let state = startDebugTelemetryRecording(fixture());
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "actor", targetId: "target" }, 1000).state;
    state = startForcedMovement(state, "actor", "threat", { x: 1, y: 0 }, 3, 500, 1000);
    const motion = state.forcedMovementsByEntityId!.actor;
    state = { ...state, entities: { ...state.entities, target: { ...state.entities.target, state: "dead", health: 0 } as Enemy } };
    state = updateDirectCompanionCommandSystem(state, new Set(), 1100);
    expect(state.directCompanionCommandsById?.actor).toBeUndefined();
    expect(state.forcedMovementsByEntityId!.actor).toBe(motion);
    state = updateForcedMovements(state, new Set(), 1100);
    expect(getMovementPositionCommit(state, "actor")?.source).toBe("forcedMovement");
  });
});
