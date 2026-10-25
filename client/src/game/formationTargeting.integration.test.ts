import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { assignFormationSlots } from "./formationAssignments";
import { getFormationTemplate, transformFormationSlots } from "./formationTemplates";
import { getAssignedFormationSlot } from "./formationTargeting";
import { applyTargetCommitment, canReacquireCombatTarget, pruneTargetCommitmentState, selectTargetCommitment } from "./targetCommitment";
import { setPartyExecutionIntent, getPartyExecutionIntent } from "./partyIntentState";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { updateRoleSystem } from "./roleSystem";
import { updatePartyIntentSelfDefenseSystem } from "./partyIntentSystem";
import { protectPartyMember } from "./partyProtectionSystem";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { issuePartyOrder } from "./commands";
import { updateAttackSystem } from "./attackSystem";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import * as movement from "./movementPlanning";
import * as authority from "./movementAuthority";
import { suppressAutonomousEnemyTarget } from "./partyTargetSystem";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { clearFrameMovementPlanning } from "./movementState";
import { sanitizeGameStateForSave, SAVE_VERSION } from "./saveGame";
import { bakeNavigationGrid } from "./navigation";
import { getSkillTarget } from "./skillTargeting";
import { SKILL_DEFINITIONS } from "./skills";
import { BARRACK_DEFINITIONS, createBarrackEntity } from "./barrackDefinitions";
import type { Companion, Enemy, GameMap } from "./types";
import type { GameState } from "./state";

afterEach(() => vi.restoreAllMocks());

function fixture(defender = false): GameState {
  const members = [createCompanion("leader", { x: 30, y: 30 }, "leader", "fighter", 0, "hunter"),
    createCompanion("left", { x: 30, y: 30 }, "leader", defender ? "defender" : "fighter", 1),
    createCompanion("right", { x: 30, y: 30 }, "leader", "fighter", 2),
    createCompanion("rear", { x: 30, y: 30 }, "leader", "support", 3),
    createCompanion("other", { x: 30, y: 30 }, "leader", "none", 4)];
  const assignments = assignFormationSlots(members, "leader")!;
  const positions = transformFormationSlots(assignments, members[0], { x: 0, y: -1 });
  const hunt = createEnemy("hunt", { x: 30, y: 27 }, "passive", { maxHealth: 100000, attack: 0 });
  const enemy = (id: string, x: number) => ({ ...createEnemy(id, { x, y: 29 }, "aggressive", { maxHealth: 100000, attack: 0 }),
    state: "attack" as const, currentTargetId: "rear", nextRoamAt: Infinity });
  const map: GameMap = { columns: 70, rows: 70, walls: [], teleports: [], healingFountains: [], displayName: "Lanes", debugName: "lanes" };
  map.navigationGrid = bakeNavigationGrid(map);
  return setPartyExecutionIntent(createTestGameState({ currentMapId: "hub", partyLeaderId: "leader", formationAssignments: assignments,
    map,
    simulationFrame: 1, simulationTimeMs: 1000, simulationDeltaMs: 100,
    entities: { ...Object.fromEntries(members.map(actor => [actor.id, { ...actor, position: positions[actor.id],
      ...(actor.id === "leader" ? { state: "attack", currentTargetId: hunt.id } : {}) }])),
    hunt, west: enemy("west", 27), east: enemy("east", 33) } }),
  { type: "attack", source: "ai", targetId: hunt.id, targetPosition: hunt.position });
}
function actor(state: GameState, id = "left"): Companion { return state.entities[id] as Companion; }
function idleAtCenter(state: GameState, id = "left"): GameState {
  return { ...state, entities: { ...state.entities, [id]: { ...actor(state, id), position: actor(state, "leader").position,
    state: "idle", currentTargetId: null } } };
}
function defenderFixture(): GameState {
  const state = fixture(true);
  state.entities.left = { ...actor(state), state: "defend", currentTargetId: "hunt" };
  state.entities.west = { ...state.entities.west as Enemy, position: { x: actor(state, "rear").position.x + 0.5, y: actor(state, "rear").position.y } };
  delete state.entities.east;
  return state;
}

describe("formation target commitment", () => {
  it("selects each assigned side from equally distant threats without navigation or mutations", () => {
    let state = idleAtCenter(idleAtCenter(fixture(), "right"));
    const path = vi.spyOn(movement, "getBoundedPathDistance"), before = JSON.stringify(state);
    expect(getAssignedFormationSlot(state, "left")?.lane).toBe("left");
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "acquire", target: { id: "west" }, reason: "formation_lane" });
    expect(selectTargetCommitment(state, actor(state, "right"))).toMatchObject({ target: { id: "east" } });
    expect(JSON.stringify(state)).toBe(before);
    expect(path).not.toHaveBeenCalled();
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    expect(state.targetCommitmentsByEntityId?.left.formationScore?.assignedLane).toBe("left");
    expect(getPartyExecutionIntent(state)?.targetId).toBe("hunt");
  });

  it("uses cross-lane fallback and single-target focus without discovering passive bystanders", () => {
    const state = idleAtCenter(fixture());
    delete state.entities.west;
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("east");
    delete state.entities.east;
    state.entities.bystander = createEnemy("bystander", { x: 29, y: 29 }, "passive");
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("hunt");
    state.entities.other = { ...actor(state, "other"), state: "attack", currentTargetId: "hunt" };
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("hunt");
  });

  it("applies soft accepted claims, excluding dead/resource actors but counting direct and displaced commitments", () => {
    let state = idleAtCenter(fixture());
    const west = state.entities.west as Enemy;
    delete state.entities.east;
    state.entities.west2 = { ...west, id: "west2" };
    state.entities.other = { ...actor(state, "other"), state: "attack", currentTargetId: "west", commandPriority: "direct" };
    state = authority.acquireSpecializedMovement(state, "other", "forced", "test").state;
    const choice = selectTargetCommitment(state, actor(state));
    expect(choice.target?.id).toBe("west2");
    state.entities.other = { ...actor(state, "other"), health: 0, state: "dead" };
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("west");
    state.entities.other = { ...actor(state, "right"), id: "other", state: "gather", currentTargetId: "west" };
    expect(selectTargetCommitment(state, actor(state)).formationScore?.claimCount).toBe(0);
  });

  it.each([false, true])("preserves acquisition results with reversed entity insertion=%s", reverse => {
    let state = idleAtCenter(idleAtCenter(fixture(), "right"));
    state.entities.east = { ...state.entities.west, id: "east" };
    if (reverse) state = { ...state, entities: Object.fromEntries(Object.entries(state.entities).reverse()) };
    state = updatePartyIntentSelfDefenseSystem(state);
    expect(actor(state).currentTargetId).toBe("east");
    expect(actor(state, "right").currentTargetId).toBe("west");
  });

  it("retains commitments through 35 facing, claim, and specialized-movement changes", () => {
    let state = idleAtCenter(fixture());
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    const ownership = state.formationAssignments!.slotsByEntityId;
    for (let frame = 2; frame <= 36; frame++) {
      state = { ...state, simulationFrame: frame, simulationTimeMs: frame * 100,
        formationAssignments: { ...state.formationAssignments!, combat: { leaderId: "leader", mode: "combat",
          facing: { x: Math.sin(frame), y: Math.cos(frame) }, spacing: 3, lateralScale: 1.2, goalsByEntityId: {} } } };
      state.entities.east = { ...state.entities.east, position: { x: 29, y: 30 } };
      state.entities.other = { ...actor(state, "other"), state: "attack", currentTargetId: "west" };
      state = authority.acquireSpecializedMovement(state, "left", "forced", "test").state;
      expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "retain", target: { id: "west" } });
      expect(state.formationAssignments!.slotsByEntityId).toBe(ownership);
    }
  });

  it("keeps individual floor/focus commands and explicit party focus ahead of lanes", () => {
    let state = fixture();
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "left", targetPosition: { x: 25, y: 31 } }, 1000).state;
    const floor = state.directCompanionCommandsById!.left;
    state = updatePartyFormationSystem(state);
    expect(state.directCompanionCommandsById!.left).toBe(floor);
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "left", targetId: "east" }, 1001).state;
    state = issuePartyOrder(state, { type: "attack", targetId: "west" });
    state = updatePartyFormationSystem(state);
    expect(actor(state).currentTargetId).toBe("east");
    expect(actor(state, "right").currentTargetId).toBe("west");
  });

  it("excludes suppressed and out-of-range threats and prefers known engagement over unknown", () => {
    let state = idleAtCenter(fixture());
    state = suppressAutonomousEnemyTarget(state, "west", 10000, "test");
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("east");
    state.entities.east = { ...state.entities.east, position: { x: 50, y: 50 } };
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("hunt");
    state.autonomousTargetSuppressionsByEnemyId = {};
    state.entities.west = { ...state.entities.west, position: { x: 27, y: 29 } };
    state.entities.east = { ...state.entities.east, position: { x: 31.68, y: 30 } };
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("east");
  });

  it("releases death/removal and acquires the next eligible lane target", () => {
    let state = idleAtCenter(fixture());
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    state.entities.west = { ...state.entities.west as Enemy, health: 0, state: "dead" };
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    expect(actor(state).currentTargetId).toBe("east");
    delete state.entities.east;
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("hunt");
  });

  it("finishes an empty attack without leaving an actor stuck in attack state", () => {
    let state = fixture();
    state = setPartyExecutionIntent(state, null);
    state.entities = { leader: { ...actor(state, "leader"), state: "idle", currentTargetId: null },
      left: { ...actor(state), state: "attack", currentTargetId: null } };
    state = updateAttackSystem(state, new Set(), 1100);
    expect(actor(state)).toMatchObject({ state: "follow", currentTargetId: "leader" });
  });

  it("preserves an individual structure focus against automatic and party lane assignments", () => {
    let state = fixture();
    state.entities.structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "structure", position: { x: 34, y: 28 },
      footprint: { minX: 33.5, maxX: 34.5, minY: 27.5, maxY: 28.5 }, attackBounds: { minX: 33, maxX: 35, minY: 27, maxY: 29 } };
    state = issueCompanionDirectCommand(state, { type: "attack", companionId: "left", targetId: "structure" }, 1000).state;
    const command = state.directCompanionCommandsById?.left;
    expect(command?.type).toBe("attack");
    state = updatePartyIntentSelfDefenseSystem(updatePartyFormationSystem(state));
    expect(actor(state).currentTargetId).toBe("structure");
    expect(state.directCompanionCommandsById?.left).toBe(command);
  });

  it("keeps area-skill targeting independent from the base lane commitment", () => {
    let state = idleAtCenter(fixture());
    state.entities.left = { ...actor(state), classId: "hunter" };
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    expect(actor(state).currentTargetId).toBe("west");
    state.entities.clusterA = createEnemy("clusterA", { x: 32.7, y: 28.7 }, "passive");
    state.entities.clusterB = createEnemy("clusterB", { x: 33.2, y: 29.2 }, "passive");
    expect(getSkillTarget(state, actor(state), SKILL_DEFINITIONS.arrow_burst)?.position.x).toBeGreaterThan(30);
    expect(actor(state).currentTargetId).toBe("west");
    expect(selectTargetCommitment(state, actor(state)).kind).toBe("retain");
  });

  it("records acquisition once despite repeated consumer evaluations", () => {
    let state = startDebugTelemetryRecording(idleAtCenter(fixture()));
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    for (let i = 0; i < 30; i++) state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    const events = state.debugTelemetry!.events.filter(event => event.entityId === "left" && event.type === "target_acquired");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ targetDecisionReason: "formation_lane", targetFormationScore: { assignedLane: "left", lane: "left" } });
  });

  it("does not grant another position publication when a target changes after movement", () => {
    let state = idleAtCenter(fixture());
    const publications: string[] = [], commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((world, entity) => {
      const next = commit(world, entity);
      if (next.entities[entity.id].position !== world.entities[entity.id].position) publications.push(entity.id);
      return next;
    });
    state = movement.moveEntityTowardPositionIfUnoccupied(state, actor(state), { x: 29, y: 30 }, { source: "follow" });
    const result = state.normalMovementResultsByEntityId?.left;
    const reserved = state.reservedPositionsByEntityId?.left;
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    state = movement.moveEntityTowardPositionIfUnoccupied(state, actor(state), state.entities.west.position, { source: "attack" });
    expect(publications).toEqual(["left"]);
    expect(state.normalMovementResultsByEntityId?.left).toBe(result);
    expect(state.reservedPositionsByEntityId?.left).toBe(reserved);
  });
});

describe("Defender rear protection", () => {
  it("interrupts ordinary combat for a healthy rear ally and preserves shared focus", () => {
    const state = defenderFixture();
    const decision = selectTargetCommitment(state, actor(state));
    expect(decision).toMatchObject({ kind: "switch", target: { id: "west" }, reason: "rear_protection", priority: 0.5, local: true });
    const next = applyTargetCommitment(state, actor(state), decision, "defend");
    expect(getPartyExecutionIntent(next)).toBe(getPartyExecutionIntent(state));
  });

  it("publishes a rear response through the real game loop without changing party focus", () => {
    const state = updateGame(defenderFixture(), { nowMs: 1100, frameNumber: 2, deltaMs: 100, deltaSeconds: 0.1 });
    expect(actor(state).currentTargetId).toBe("west");
    expect(state.targetCommitmentsByEntityId?.left.reason).toBe("rear_protection");
    expect(getPartyExecutionIntent(state)?.targetId).toBe("hunt");
  });

  it("orders critical at exactly 35%, personal, rear, then ordinary", () => {
    const state = defenderFixture();
    state.entities.personal = { ...state.entities.west as Enemy, id: "personal", currentTargetId: "left" };
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ target: { id: "personal" }, reason: "personal_attacker" });
    state.entities.right = { ...actor(state, "right"), health: 35, maxHealth: 100 };
    state.entities.critical = { ...state.entities.personal as Enemy, id: "critical", currentTargetId: "right" };
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ target: { id: "critical" }, reason: "critical_ally" });
  });

  it("retains an equal-priority response and resumes the latest objective after aggression ends", () => {
    let state = defenderFixture();
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)), "defend");
    state.entities.closer = { ...state.entities.west as Enemy, id: "closer", position: actor(state).position };
    state.entities.rear = { ...actor(state, "rear"), health: 1 };
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)), "defend");
    state.entities.rear = { ...actor(state, "rear"), health: actor(state, "rear").maxHealth };
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "retain", target: { id: "west" } });
    delete state.entities.closer;
    state.entities.west = { ...state.entities.west as Enemy, state: "idle", currentTargetId: null };
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)), "defend");
    expect(actor(state).currentTargetId).not.toBe("west");
    expect(selectTargetCommitment(state, actor(state)).target?.id).toBe("hunt");
  });

  it("requires actual aggression or current damage, not rear proximity or stale blockers", () => {
    const state = defenderFixture();
    state.entities.west = { ...state.entities.west as Enemy, state: "idle", currentTargetId: null };
    state.movementFailuresByEntityId = { left: { blockerId: "west", blockerKind: "enemy" } };
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "retain", target: { id: "hunt" } });
    state.entities.left = { ...actor(state), position: { x: actor(state, "rear").position.x + 1.25, y: actor(state, "rear").position.y } };
    const damaged = protectPartyMember(state, actor(state, "rear"), state.entities.west as Enemy);
    expect(actor(damaged).currentTargetId).toBe("west");
    expect(damaged.entities.west).toBe(state.entities.west);
  });

  it.each(["fighter", "neutral", "leash", "route"] as const)("does not add rear interruption for %s", condition => {
    const state = defenderFixture();
    if (condition === "fighter") state.entities.left = { ...actor(state), role: "fighter" };
    if (condition === "neutral") state.formationAssignments = assignFormationSlots(Object.values(state.entities).filter((entity): entity is Companion =>
      entity.kind === "companion"), "leader", "side-by-side");
    if (condition === "leash") state.entities.left = { ...actor(state), position: { x: 50, y: 50 } };
    if (condition === "route") state.worldTravelTargetMapId = "map-2";
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "retain", target: { id: "hunt" } });
  });
});

describe("formation targeting loop and lifecycle", () => {
  it("keeps distant hunting followers in travel without acquiring and losing shared focus every frame", () => {
    let state = startDebugTelemetryRecording(fixture());
    delete state.entities.west;
    delete state.entities.east;
    state.entities.hunt = { ...state.entities.hunt, position: { x: 60, y: 30 } };
    state = setPartyExecutionIntent(state, { type: "attack", source: "ai", targetId: "hunt", targetPosition: state.entities.hunt.position });
    for (let frame = 2; frame <= 16; frame++) {
      state = updateGame(state, { nowMs: 1000 + (frame - 1) * 100, frameNumber: frame, deltaMs: 100, deltaSeconds: 0.1 });
      expect(actor(state).currentTargetId).toBe("leader");
      expect(actor(state).state).toBe("follow");
    }
    expect(state.debugTelemetry!.events.filter(event => event.entityId === "left" && event.targetDecisionReason === "formation_lane")).toHaveLength(0);
  });

  it("keeps real multi-enemy combat stable and returns to travel across 100 updates", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = startDebugTelemetryRecording(fixture());
    const commits = new Map<string, number>(), commit = authority.commitNormalMovementPosition;
    vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((world, entity) => {
      const next = commit(world, entity);
      if (next.entities[entity.id].position !== world.entities[entity.id].position) {
        const key = `${world.simulationFrame}:${entity.id}`;
        commits.set(key, (commits.get(key) ?? 0) + 1);
      }
      return next;
    });
    const ownership = state.formationAssignments!.slotsByEntityId;
    for (let frame = 2; frame <= 101; frame++) {
      if (frame === 55) {
        for (const [id, entity] of Object.entries(state.entities)) if (entity.kind === "enemy") state.entities[id] = { ...entity, state: "dead", health: 0 };
        state = setPartyExecutionIntent(state, { type: "move", source: "player", targetId: null, targetPosition: { x: 40, y: 30 } });
      }
      state = updateGame(state, { frameNumber: frame, nowMs: 1000 + (frame - 1) * 100, deltaMs: 100, deltaSeconds: 0.1 });
      expect(state.formationAssignments!.slotsByEntityId).toEqual(ownership);
      expect(Math.max(0, ...Object.values(state.normalMovementResultsByEntityId ?? {}).map(result => result.positionCommitCount))).toBeLessThanOrEqual(1);
    }
    expect(commits.size).toBeGreaterThan(0);
    expect(Math.max(...commits.values())).toBe(1);
    expect(state.formationAssignments?.combat?.mode).not.toBe("combat");
    expect(state.debugTelemetry!.events.some(event => event.targetDecisionReason === "formation_lane")).toBe(true);
    expect(state.debugTelemetry!.events.filter(event => event.targetDecisionReason === "formation_lane").every(event => event.targetFormationScore)).toBe(true);
  }, 60000);

  it("keeps derived lane and claim data transient with unchanged save version", () => {
    let state = idleAtCenter(fixture());
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)));
    const saved = sanitizeGameStateForSave(state);
    expect(saved.formationAssignments).toBeUndefined();
    expect(saved.targetCommitmentsByEntityId).toEqual({});
    expect(SAVE_VERSION).toBe(3);
    state = clearMapTransitionRuntimeState(state);
    expect(state.formationAssignments).toBeUndefined();
    expect(state.targetCommitmentsByEntityId).toEqual({});
  });

  it("preserves a newly selected lane target across role and party-assignment consumers", () => {
    let state = idleAtCenter(fixture());
    state = updateRoleSystem(state);
    const targetId = actor(state).currentTargetId;
    expect(targetId).toBe("west");
    for (let i = 0; i < 30; i++) state = updatePartyFormationSystem(updateRoleSystem(state));
    expect(actor(state).currentTargetId).toBe(targetId);
    expect(getFormationTemplate(state.formationAssignments!.preset, 5)?.slots).toHaveLength(5);
  });
});

describe("formation targeting review regressions", () => {
  it.each(["rear_protection", "personal_attacker", "critical_ally"] as const)("keeps a confirmed-unreachable %s rejected until a fresh successful probe", reason => {
    let state = defenderFixture();
    state.map = { ...state.map!, walls: Array.from({ length: 70 }, (_, y) => ({ x: 33, y })) };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state.entities.west = { ...state.entities.west, position: { x: 36, y: 29 } };
    if (reason === "personal_attacker") state.entities.west = { ...state.entities.west as Enemy, currentTargetId: "left" };
    if (reason === "critical_ally") state.entities.rear = { ...actor(state, "rear"), health: 35, maxHealth: 100 };
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state)), "defend");
    expect(actor(state).currentTargetId).toBe("west");
    for (let frame = 2; frame <= 14; frame++) {
      state = clearFrameMovementPlanning({ ...state, simulationFrame: frame, simulationTimeMs: 1000 + (frame - 1) * 100 });
      const defender = actor(state), request = authority.createNormalMovementRequest(state, defender, state.entities.west.position,
        { source: "defend", pathTargetKey: "west" });
      state = authority.finishNormalMovement(state, request, "blocked", defender.position, defender.position, "blocked");
    }
    expect(state.targetApproachesByEntityId?.left).toMatchObject({ noProgressMs: 1300, failedChecks: 2, hardUnreachable: true });
    const released = selectTargetCommitment(state, actor(state));
    expect(released).toMatchObject({ kind: "release", reason: "unreachable_engagement" });
    state = applyTargetCommitment(state, actor(state), released, "defend");
    expect(canReacquireCombatTarget(state, actor(state), state.entities.west as Enemy)).toBe(false);
    expect(selectTargetCommitment(state, actor(state)).target?.id).not.toBe("west");
    for (let frame = 15; frame <= 44; frame++) {
      state = pruneTargetCommitmentState(clearFrameMovementPlanning({ ...state, simulationFrame: frame, simulationTimeMs: 1000 + (frame - 1) * 100 }));
      const decision = selectTargetCommitment(state, actor(state));
      expect(decision.target?.id).not.toBe("west");
      state = applyTargetCommitment(state, actor(state), decision, "defend");
    }
    state.map = { ...state.map!, walls: [] };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = pruneTargetCommitmentState(clearFrameMovementPlanning({ ...state, simulationFrame: 45, simulationTimeMs: 5500 }));
    expect(canReacquireCombatTarget(state, actor(state), state.entities.west as Enemy)).toBe(true);
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ target: { id: "west" }, reason });
  });

  function damageResponse(): GameState {
    const state = startDebugTelemetryRecording(defenderFixture());
    state.entities.west = { ...state.entities.west as Enemy, state: "idle", currentTargetId: null };
    state.entities.left = { ...actor(state), position: { x: actor(state, "rear").position.x + 1.25, y: actor(state, "rear").position.y } };
    return protectPartyMember(state, actor(state, "rear"), state.entities.west as Enemy);
  }

  it.each([false, true])("retains current damage across consumers, then expires or follows new aggression=%s", continues => {
    let state = damageResponse();
    expect(actor(state).currentTargetId).toBe("west");
    const source = state.entities.west;
    for (let i = 0; i < 3; i++) {
      const decision = selectTargetCommitment(state, actor(state));
      expect(decision).toMatchObject({ kind: "retain", target: { id: "west" }, priority: 0.5 });
      expect(applyTargetCommitment(state, actor(state), decision, "defend")).toBe(state);
      state = updatePartyIntentSelfDefenseSystem(state);
      expect(actor(state).currentTargetId).toBe("west");
    }
    expect(state.entities.west).toBe(source);
    expect(state.debugTelemetry!.events.filter(event => event.entityId === "left" && event.type === "target_changed")).toHaveLength(1);
    if (continues) state.entities.west = { ...state.entities.west as Enemy, state: "attack", currentTargetId: "rear" };
    state = clearFrameMovementPlanning({ ...state, simulationFrame: 2, simulationTimeMs: 1100 });
    expect(selectTargetCommitment(state, actor(state)).kind).toBe(continues ? "retain" : "release");
    expect(sanitizeGameStateForSave(state).targetCommitmentsByEntityId).toEqual({});
  });

  it("keeps equal rear threats from stealing a current damage response but permits a higher emergency", () => {
    const state = damageResponse();
    state.entities.equal = { ...state.entities.west as Enemy, id: "equal", state: "attack", currentTargetId: "rear", position: actor(state).position };
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "retain", target: { id: "west" } });
    state.entities.personal = { ...state.entities.equal as Enemy, id: "personal", currentTargetId: "left" };
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "switch", target: { id: "personal" }, reason: "personal_attacker" });
  });

  it("refreshes same-target damage evidence without duplicating the target transition", () => {
    let state = damageResponse();
    state = clearFrameMovementPlanning({ ...state, simulationFrame: 2, simulationTimeMs: 1100 });
    state = applyTargetCommitment(state, actor(state), selectTargetCommitment(state, actor(state), {
      damage: { attackerId: "west", victimId: "rear" },
    }), "defend");
    expect(selectTargetCommitment(state, actor(state))).toMatchObject({ kind: "retain", target: { id: "west" } });
    expect(state.debugTelemetry!.events.filter(event => event.entityId === "left" && event.type === "target_changed")).toHaveLength(1);
  });

  it.each([false, true])("resolves mid-phase kill acquisitions in party order with direct killer=%s", direct => {
    const outcomes: { b: string | null; c: string | null }[] = [];
    for (const reverse of [false, true]) {
      const killer = createCompanion("killer", { x: 30, y: 28.3 }, "killer", "defender", 0);
      const b: Companion = { ...createCompanion("b", { x: 28.3, y: 30 }, "killer", "fighter", 1, "hunter"), state: "attack", currentTargetId: "a" };
      const c: Companion = { ...createCompanion("c", { x: 29, y: 31.4 }, "killer", "fighter", 3, "hunter"), state: "attack", currentTargetId: "a" };
      const victim = createCompanion("victim", { x: 35, y: 33 }, "killer", "fighter", 2);
      const other = createCompanion("other", { x: 40, y: 40 }, "killer", "none", 4);
      const a = createEnemy("a", { x: 30, y: 30 }, "passive", { maxHealth: 1, defense: 0, evasion: 0 });
      const threat = (id: string, x: number, y: number): Enemy => ({ ...createEnemy(id, { x, y }, "aggressive", { maxHealth: 10000, attack: 0, defense: 0, evasion: 0 }),
        state: "attack", currentTargetId: "victim" });
      const entities = { killer: { ...killer, state: "attack" as const, currentTargetId: "a" }, b, victim, c, other,
        a, d: threat("d", 26, 30), e: threat("e", 27, 32) };
      let state = setPartyExecutionIntent(createTestGameState({ partyLeaderId: "killer", formationAssignments: assignFormationSlots([killer, b, victim, c, other], "killer"),
        map: fixture().map, simulationFrame: 1, simulationTimeMs: 5000, simulationDeltaMs: 100,
        entities: reverse ? Object.fromEntries(Object.entries(entities).reverse()) : entities }),
      { type: "attack", source: "ai", targetId: "a", targetPosition: a.position });
      if (direct) state = issueCompanionDirectCommand(state, { type: "attack", companionId: "killer", targetId: "a" }, 5000).state;
      vi.spyOn(Math, "random").mockReturnValue(0.1);
      state = updateAttackSystem(state, new Set(), 5000);
      expect((state.entities.a as Enemy).health).toBe(0);
      expect(state.companionTargetTransitions!.filter(transition => transition.reason === "formation_lane" &&
        (transition.entityId === "b" || transition.entityId === "c")).map(transition => transition.entityId)).toEqual(["b", "c"]);
      outcomes.push({ b: actor(state, "b").currentTargetId, c: actor(state, "c").currentTargetId });
    }
    expect(outcomes[0]).toEqual(direct ? { b: "d", c: "e" } : { b: "d", c: "d" });
    expect(outcomes[1]).toEqual(outcomes[0]);
  });
});
