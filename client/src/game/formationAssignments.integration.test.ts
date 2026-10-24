import { afterEach, describe, expect, it, vi } from "vitest";
import * as assignments from "./formationAssignments";
import * as authority from "./movementAuthority";
import { createCompanion, createEnemy, createResource } from "./entities";
import { createDebugMap } from "./debugMap";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { startForcedMovement } from "./forcedMovement";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { moveCompanionToRestingReserve } from "./partySystem";
import { createSavedGame, restoreGameStateFromSave, SAVE_VERSION } from "./saveGame";
import { addEntity, setPartyLeader, setPartyMemberRole, setPartyOrder, updateEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { triggerMapTeleport } from "./teleportSystem";
import { updateGame } from "./updateGame";
import { answerWarmasterDeparture, updateWarmasterLifecycle } from "./warmasterLifecycle";
import { debugResetSlimewardDungeon, debugTeleportToHub, debugTeleportToSlimewardCamp } from "./debugTools";
import { resetWarmasterAttempt } from "./warmasterSystem";
import { updateWorldWipeRecovery } from "./worldWipeRecovery";
import { resolveSkillEffect } from "./skillEffectResolution";
import { SKILL_DEFINITIONS } from "./skills";
import type { Companion, PartyMemberRole } from "./types";

afterEach(() => vi.restoreAllMocks());

function party(roles: PartyMemberRole[] = ["defender", "fighter", "support"]) {
  const members = roles.map((role, i) => createCompanion(`member-${i}`, { x: 10 + i * 2.5, y: 10 }, "member-0", role, i));
  return assignments.reconcileFormationAssignments(createTestGameState({
    currentMapId: "hub", partyLeaderId: members[0].id,
    map: { columns: 40, rows: 40, walls: [], teleports: [], healingFountains: [], debugName: "formation", displayName: "Formation" },
    entities: Object.fromEntries(members.map(member => [member.id, member])), simulationTimeMs: 1000,
  }));
}

function step(state: GameState): GameState {
  return updateGame(state, { nowMs: (state.simulationTimeMs ?? 0) + 100, deltaMs: 100, frameNumber: (state.simulationFrame ?? 0) + 1 });
}

function partyAfterRoleEdits(): GameState {
  const state = party(["defender", "fighter", "fighter", "support", "gatherer"]);
  return assignments.reconcileFormationAssignments(setPartyMemberRole(
    setPartyMemberRole(state, "member-0", "support", 1000), "member-4", "defender", 1000));
}

function observePublications() {
  const events: Array<{ id: string; frame: number }> = [];
  const normal = authority.commitNormalMovementPosition;
  const specialized = authority.commitSpecializedMovementPosition;
  vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((state, actor) => {
    const next = normal(state, actor);
    if (next.entities[actor.id].position !== state.entities[actor.id].position) events.push({ id: actor.id, frame: state.simulationFrame ?? 0 });
    return next;
  });
  vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((state, id, position, source, transaction) => {
    const result = specialized(state, id, position, source, transaction);
    if (result.outcome === "moved") events.push({ id, frame: state.simulationFrame ?? 0 });
    return result;
  });
  return events;
}

describe("formation assignment lifecycle", () => {
  it("initializes idle parties with Auto Combat off and survives legacy formation cleanup for 30 updates", () => {
    let state: GameState = { ...party(), formationAssignments: undefined };
    state = step(state);
    const original = state.formationAssignments;
    expect(original?.members).toHaveLength(3);
    for (let frame = 0; frame < 30; frame++) {
      state = step(state);
      expect(state.formationAssignments).toBe(original);
    }
    expect(state.autoModeEnabled).toBe(false);
  });

  it.each(["move", "attack", "gather"] as const)("preserves slots through a direct %s command, knockback and resumption", type => {
    const events = observePublications();
    let state = party();
    const enemy = createEnemy("enemy", { x: 20, y: 10 }, "passive", { maxHealth: 10000 });
    const resource = createResource("wood", { x: 20, y: 15 });
    state = addEntity(addEntity(state, enemy), resource);
    const input = type === "move" ? { type, companionId: "member-1", targetPosition: { x: 18, y: 14 } }
      : { type, companionId: "member-1", targetId: type === "attack" ? enemy.id : resource.id };
    const issued = issueCompanionDirectCommand(state, input, 1000);
    expect(issued.code).toBe("success");
    const original = issued.state.formationAssignments;
    state = startForcedMovement(issued.state, "member-1", "missing-source", { x: 0, y: 1 }, 2, 400, 1000);
    expect(assignments.getFormationMemberDepartures(state, "member-1")).toContain("specialized");
    expect(assignments.getFormationMemberDepartures(state, "member-1")).toContain("direct");
    for (let frame = 0; frame < 60; frame++) {
      state = step(state);
      expect(state.formationAssignments).toBe(original);
      const publications = events.filter(event => event.id === "member-1" && event.frame === state.simulationFrame);
      expect(publications.length).toBeLessThanOrEqual(1);
    }
    expect(state.forcedMovementsByEntityId?.["member-1"]).toBeUndefined();
    if (type === "move") expect(state.directCompanionCommandsById?.["member-1"]).toBeUndefined();
    else expect(state.directCompanionCommandsById?.["member-1"]?.type).toBe(type);
  });

  it("preserves the reference and every slot during a directly commanded leader override", () => {
    let state = party();
    const original = state.formationAssignments;
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "member-0", targetPosition: { x: 16, y: 14 } }, 1000).state;
    for (let frame = 0; frame < 40; frame++) {
      state = step(state);
      expect(state.formationAssignments).toBe(original);
      const world = assignments.getFormationWorldPositions(state, { x: 1, y: 0 });
      expect(world["member-0"]).toEqual(state.entities["member-0"].position);
    }
  });

  it("keeps ownership through a successful mobility skill and pending safe landing", () => {
    let state = party(["fighter", "fighter"]);
    const original = state.formationAssignments;
    const skill = SKILL_DEFINITIONS.flash_step;
    const actor = { ...(state.entities["member-1"] as Companion), classId: skill.classId };
    const enemy = createEnemy("enemy", { x: 16, y: 10 }, "passive", { maxHealth: 10000 });
    state = addEntity(updateEntity(state, actor), enemy);
    const moved = resolveSkillEffect(state, actor, { skill, target: enemy, score: 1, selectionPriority: 0 }, 1000);
    expect(moved.shouldConsumeCooldown).toBe(true);
    expect(moved.state.entities[actor.id].position).not.toEqual(actor.position);
    expect(assignments.reconcileFormationAssignments(moved.state).formationAssignments).toBe(original);
    const pending = { ...state, forcedMovementsByEntityId: { [actor.id]: {
      targetId: actor.id, sourceId: "missing", origin: actor.position, direction: { x: 1, y: 0 }, distance: 2,
      startedAt: 1000, endsAt: 1200, lastSafePosition: actor.position, pendingFinalization: true as const,
    } } };
    expect(assignments.getFormationMemberDepartures(pending, actor.id)).toContain("specialized");
    expect(assignments.reconcileFormationAssignments(pending).formationAssignments).toBe(original);
    state = moved.state;
    for (let frame = 0; frame < 30; frame++) {
      state = step(state);
      expect(state.formationAssignments).toBe(original);
    }
  });

  it("leaves a dead member's hole through pruning, resurrection participation, and return", () => {
    let state = party(["fighter", "fighter"]);
    const original = state.formationAssignments;
    const dead = { ...(state.entities["member-1"] as Companion), state: "dead" as const, health: 0 };
    state = pruneMissingEntityRuntimeState(updateEntity(state, dead));
    expect(state.formationAssignments).toBe(original);
    expect(assignments.getFormationMemberDepartures(state, dead.id)).toEqual(["dead"]);
    let contributed = false;
    for (let frame = 0; frame < 140; frame++) {
      state = step(state);
      contributed ||= assignments.getFormationMemberDepartures(state, "member-0").includes("resurrection");
      expect(state.formationAssignments).toBe(original);
    }
    expect(contributed).toBe(true);
    expect(state.entities[dead.id].state).not.toBe("dead");
  });

  it("does not substitute a living anchor for a missing, dead, or zero-health leader", () => {
    const state = party();
    const leader = state.entities["member-0"] as Companion;
    for (const modified of [
      { ...state, partyLeaderId: "missing" },
      updateEntity(state, { ...leader, state: "dead", health: 0 }),
      updateEntity(state, { ...leader, health: 0 }),
    ]) {
      const next = assignments.reconcileFormationAssignments(modified);
      expect(Object.keys(next.formationAssignments!.slotsByEntityId)).toHaveLength(3);
      expect(assignments.getFormationWorldPositions(next, { x: 1, y: 0 })).toEqual({});
    }
  });

  it("observes the completed two-setter order swap at the next boundary even during combat", () => {
    let state = party(["fighter", "fighter", "fighter"]);
    const original = state.formationAssignments!;
    const enemy = createEnemy("enemy", { x: 30, y: 10 }, "passive", { maxHealth: 10000 });
    state = { ...addEntity(state, enemy), autoModeEnabled: true };
    for (const member of Object.values(state.entities)) if (member.kind === "companion") {
      state = updateEntity(state, { ...member, state: "attack", currentTargetId: enemy.id });
    }
    const firstSetter = setPartyOrder(state, "member-0", 2);
    expect(firstSetter.formationAssignments).toBe(original);
    state = setPartyOrder(firstSetter, "member-2", 0);
    expect(state.formationAssignments).toBe(original);
    state = step(state);
    expect(state.formationAssignments!.slotsByEntityId["member-2"]).toBe(original.slotsByEntityId["member-0"]);
    expect(state.formationAssignments!.slotsByEntityId["member-0"]).toBe(original.slotsByEntityId["member-2"]);
    const ordered = state.formationAssignments;
    for (let frame = 0; frame < 30; frame++) {
      state = step(state);
      expect(state.formationAssignments).toBe(ordered);
    }
  });

  it("applies role edits before combat ends and retains commands and their movement budget", () => {
    let state = party(["defender", "support"]);
    const enemy = createEnemy("enemy", { x: 18, y: 10 }, "passive", { maxHealth: 10000 });
    state = { ...addEntity(state, enemy), autoModeEnabled: true };
    state = updateEntity(state, { ...(state.entities["member-0"] as Companion), state: "attack", currentTargetId: enemy.id });
    state = issueCompanionDirectCommand(state, { type: "move", companionId: "member-1", targetPosition: { x: 25, y: 15 } }, 1000).state;
    state = step(state);
    state = setPartyMemberRole(setPartyMemberRole(state, "member-0", "support", 1100), "member-1", "defender", 1100);
    const command = state.directCompanionCommandsById;
    const commits = state.movementPositionCommitsByEntityId;
    const next = assignments.reconcileFormationAssignments(state);
    expect(next.directCompanionCommandsById).toBe(command);
    expect(next.movementPositionCommitsByEntityId).toBe(commits);
    expect(next.formationAssignments!.slotsByEntityId["member-1"]).toContain(":front:");
    expect(next.formationAssignments!.slotsByEntityId["member-0"]).toContain(":rear:");
    const led = assignments.reconcileFormationAssignments(setPartyLeader(next, "member-1"));
    expect(led.formationAssignments!.leaderId).toBe("member-1");
    expect(led.formationAssignments!.slotsByEntityId).toEqual(next.formationAssignments!.slotsByEntityId);
  });

  it("reconciles recruitment, reserve transfer, and permanent removal but excludes reserves", () => {
    let state = party();
    const reserve = createCompanion("reserve", { x: 20, y: 20 }, "member-0", "support");
    state = { ...state, restingCompanionsById: { reserve } };
    expect(assignments.reconcileFormationAssignments(state).formationAssignments).toBe(state.formationAssignments);
    state = assignments.reconcileFormationAssignments(addEntity(state, createCompanion("recruit", { x: 20, y: 25 }, "member-0", "fighter", 3)));
    expect(state.formationAssignments!.members).toHaveLength(4);
    state = moveCompanionToRestingReserve(state, "member-2");
    expect(state.formationAssignments!.members).toHaveLength(3);
    expect(state.formationAssignments!.slotsByEntityId["member-2"]).toBeUndefined();
    const entities = { ...state.entities };
    delete entities.recruit;
    state = pruneMissingEntityRuntimeState({ ...state, entities });
    expect(state.formationAssignments!.members).toHaveLength(2);
  });

  it("leaves unsupported debug rosters and all unrelated state intact", () => {
    let state = party();
    for (let i = 3; i < 6; i++) state = addEntity(state, createCompanion(`extra-${i}`, { x: 10 + i * 2.5, y: 15 }, "member-0"));
    const next = assignments.reconcileFormationAssignments(state);
    expect(next.formationAssignments).toBeUndefined();
    expect(next.entities).toBe(state.entities);
    expect(Object.keys(next.entities)).toHaveLength(6);
  });

  it("omits ownership from serialized saves and discards injected transient data on restore", () => {
    const state = { ...party(), currentMapId: "hub" as const, map: createDebugMap("hub") };
    const save = createSavedGame(state, 1000);
    expect(save.saveVersion).toBe(SAVE_VERSION);
    expect(JSON.parse(JSON.stringify(save)).state).not.toHaveProperty("formationAssignments");
    const restored = restoreGameStateFromSave({ ...save, state: { ...save.state, formationAssignments: state.formationAssignments } });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.formationAssignments).toBeUndefined();
    expect(step(restored.state).formationAssignments?.members).toHaveLength(3);
  });

  it("clears on map cleanup and rebuilds after teleport's early return", () => {
    let state = party(["fighter", "support"]);
    const map = createDebugMap("map-1");
    const teleport = map.teleports.find(point => point.id === "map-1-to-hub")!;
    const entities = Object.fromEntries(Object.values(state.entities).map(entity => [entity.id, { ...entity, position: { ...teleport.position } }]));
    state = { ...state, entities, currentMapId: "map-1", map };
    const prior = state.formationAssignments;
    expect(clearMapTransitionRuntimeState(state).formationAssignments).toBeUndefined();
    state = triggerMapTeleport(state, "player", teleport.id);
    for (let frame = 0; frame < 50 && state.currentMapId !== "hub"; frame++) state = step(state);
    expect(state.currentMapId).toBe("hub");
    expect(state.formationAssignments).not.toBe(prior);
    expect(state.formationAssignments?.members).toHaveLength(2);
  });

  it.each(["hub", "hub-2", "slimeward-camp", "dungeon-reset"] as const)("rebuilds assignments after the %s debug transition", mode => {
    const state: GameState = { ...partyAfterRoleEdits(), currentMapId: "slimeward-floor-1", map: createDebugMap("slimeward-floor-1") };
    const prior = state.formationAssignments!;
    const fresh = assignments.assignFormationSlots(prior.members, state.partyLeaderId)!;
    expect(prior.slotsByEntityId).not.toEqual(fresh.slotsByEntityId);
    const transitioned = mode === "hub" || mode === "hub-2" ? debugTeleportToHub(state, mode)
      : mode === "dungeon-reset" ? debugResetSlimewardDungeon(state) : debugTeleportToSlimewardCamp(state);
    expect(transitioned.currentMapId).toBe(mode === "dungeon-reset" ? "slimeward-camp" : mode);
    expect(transitioned.formationAssignments).toBeUndefined();
    expect(assignments.reconcileFormationAssignments(transitioned).formationAssignments!.slotsByEntityId).toEqual(fresh.slotsByEntityId);
  });

  it("does not clear party assignments when dungeon reset leaves an unrelated map intact", () => {
    const state = partyAfterRoleEdits();
    expect(debugResetSlimewardDungeon(state).formationAssignments).toBe(state.formationAssignments);
  });

  it("clears a full wipe's ownership and reconstructs the rescued roster", () => {
    let state = party(["fighter", "support"]);
    state = { ...state, currentMapId: "map-1", map: createDebugMap("map-1"), entities: Object.fromEntries(Object.values(state.entities).map(entity => [entity.id, { ...entity, health: 0, state: "dead" }])) };
    const rescued = updateWorldWipeRecovery(state, 1100);
    expect(rescued.currentMapId).toBe("hub");
    expect(rescued.formationAssignments).toBeUndefined();
    expect(step(rescued).formationAssignments?.members).toHaveLength(2);
    const pending: GameState = { ...state, worldWipeRecovery: { status: "pending_choice", wipeId: "test", sourceMapId: "map-1", choices: [] } };
    expect(step(pending).formationAssignments).toBeUndefined();
  });

  it("retains assignments on enemy-only reset but clears an accepted party departure", () => {
    let state = party();
    const original = state.formationAssignments;
    const boss = createEnemy("boss", { x: 95, y: 32 }, "aggressive", { enemyTypeId: "orc_warmaster" });
    state = { ...addEntity(state, boss), currentMapId: "map-7", map: createDebugMap("map-7") };
    expect(resetWarmasterAttempt(state, 1100).formationAssignments).toBe(original);
    const departing = { ...state, warmasterInteraction: { departure: { kind: "walk" as const } } };
    expect(answerWarmasterDeparture(departing, true).formationAssignments).toBeUndefined();
    expect(answerWarmasterDeparture(departing, false).formationAssignments).toBe(original);
  });

  it("clears a fully claimed encounter's assignments once the whole party leaves without a dialog", () => {
    let state: GameState = { ...partyAfterRoleEdits(), currentMapId: "map-7", map: createDebugMap("map-7"),
      warmasterLifecycle: { phase: "defeated", sequence: 1, recharge: 0, rescued: true, chestCollectedOnce: true,
        chest: { sequence: 1, rolledLoot: [], collectedLoot: [], pendingLoot: [], crownsClaimed: true } } };
    const prior = state.formationAssignments;
    // A single returning/departing member must not count as a whole-party exit.
    const member = state.entities["member-1"] as Companion;
    state = updateEntity(state, { ...member, position: { x: 95, y: 44 } });
    state = updateWarmasterLifecycle(state, 1100);
    expect(state.warmasterLifecycle!.phase).toBe("defeated");
    expect(state.formationAssignments).toBe(prior);
    state = updateEntity(state, { ...member, position: { x: 25, y: 20 } });
    const exited = updateWarmasterLifecycle(state, 1200);
    expect(exited.warmasterInteraction?.departure).toBeUndefined();
    expect(exited.warmasterLifecycle!.phase).toBe("recharging");
    expect(exited.formationAssignments).toBeUndefined();
    state = { ...assignments.reconcileFormationAssignments(exited), simulationTimeMs: 1200 };
    const rebuilt = state.formationAssignments;
    expect(rebuilt).not.toBe(prior);
    for (let frame = 0; frame < 30; frame++) {
      state = step(state);
      expect(state.formationAssignments).toBe(rebuilt);
    }
    state = updateWarmasterLifecycle({ ...state, warmasterLifecycle: { ...state.warmasterLifecycle!, recharge: 60 } }, 5000);
    expect(state.warmasterLifecycle!.phase).toBe("ready");
    expect(state.formationAssignments).toBe(rebuilt);
  });

  it("does not reconcile or advance movement through a blocking reward/departure UI", () => {
    const state = party();
    const edited = setPartyMemberRole(state, "member-0", "support", 1000);
    const paused: GameState = { ...edited, warmasterInteraction: { chestOpen: true } };
    expect(step(paused).formationAssignments).toBe(state.formationAssignments);
    expect(step(paused).simulationFrame).toBe(paused.simulationFrame);
    expect(step(paused).entities).toBe(paused.entities);
  });

  it("produces identical gameplay over 30 updates with assignment reconciliation enabled or bypassed", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    let enabled = party(["fighter", "fighter"]);
    const enemy = createEnemy("enemy", { x: 22, y: 10 }, "passive", { maxHealth: 10000 });
    enabled = issueCompanionDirectCommand(addEntity(enabled, enemy), { type: "attack", companionId: "member-1", targetId: enemy.id }, 1000).state;
    let baseline: GameState = { ...enabled, formationAssignments: undefined };
    for (let frame = 0; frame < 30; frame++) {
      enabled = step(enabled);
      const skip = vi.spyOn(assignments, "reconcileFormationAssignments").mockImplementation(state => state);
      baseline = step(baseline);
      skip.mockRestore();
      expect({ ...enabled, formationAssignments: undefined }).toEqual({ ...baseline, formationAssignments: undefined });
    }
  }, 15000);
});
