import { afterEach, describe, expect, it, vi } from "vitest";
import * as authority from "./movementAuthority";
import { beginNormalMovementPhase, commitSpecializedMovementPosition, getMovementPositionCommit, getSpecializedMovementOwner, releaseExternalMovement } from "./movementAuthority";
import { createCompanion, createEnemy, createResource } from "./entities";
import { createTestGameState } from "./testState";
import { clearFrameMovementPlanning } from "./movementState";
import { flushNormalMovementPhase, holdEntityMovement, moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { resolveSkillEffect } from "./skillEffectResolution";
import { SKILL_DEFINITIONS } from "./skills";
import { cancelForcedMovement, startForcedMovement, updateForcedMovements } from "./forcedMovement";
import { cancelEnemyDash, cleanupEnemyDashRuntime, updateEnemyDashSystem } from "./enemyDashSystem";
import { updateEnemyAbilitySystem } from "./enemyAbilitySystem";
import { issueCompanionDirectCommand, updateDirectCompanionCommandSystem } from "./directCompanionCommands";
import { updateOverlapRecoverySystem } from "./overlapRecovery";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { clearMapTransitionRuntimeState, pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { sanitizeGameStateForSave } from "./saveGame";
import { isSpecializedMovementPositionAvailable } from "./specializedMovementGeometry";
import { planStructureRebuildClearance } from "./structureRebuildClearance";
import { createBarrackEntity, BARRACK_DEFINITIONS } from "./barrackDefinitions";
import { resetWarmasterAttempt } from "./warmasterSystem";
import { WARMASTER_ARENA } from "./warmasterState";
import { updateGame } from "./updateGame";
import { setPartyExecutionIntent } from "./partyIntentState";
import { updateSkillSystem } from "./skillSystem";
import { updateEntity } from "./state";
import { ORC_WARCAMP_ARENA } from "./orcWarcampLayout";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { resolveAoePattern } from "./aoePatterns";
import { createDebugMap } from "./debugMap";
import { setMapTeleportPoi, triggerMapTeleport } from "./teleportSystem";
import type { GameState } from "./state";
import type { Companion, EnemyDashState, EnemyTypeId, Position, SkillId } from "./types";

afterEach(() => vi.restoreAllMocks());

function pendingDash(id: string, origin: Position, lastSafePosition: Position, destination: Position): EnemyDashState {
  const direction = { x: 1, y: 0 };
  return { id: `dash:${id}`, abilityId: "night_bat_rending_dash", casterId: id, origin, direction, destination,
    distance: 5, area: resolveAoePattern({ type: "rectangle", rows: 4, columns: 2 }, { origin, direction }),
    startedAt: 1000, endsAt: 1250, lastUpdatedAt: 1160, lastProgressDistance: 3.2,
    lastSafePosition, powerMultiplier: 1, hitTargetIds: [], pendingFinalization: true };
}

function fixture(skillId: SkillId = "flash_step") {
  const actor = { ...createCompanion("actor", { x: 5, y: 5 }, "actor", "fighter", 1, SKILL_DEFINITIONS[skillId].classId), health: 100, maxHealth: 100 };
  const enemy = createEnemy("enemy", { x: 8.5, y: 5 }, "passive", { maxHealth: 1000, evasion: 0, combatBodyRadius: 0.7 });
  return { actor, enemy, state: createTestGameState({ entities: { actor, enemy }, partyLeaderId: actor.id, simulationTimeMs: 1000,
    map: { columns: 30, rows: 30, walls: [], teleports: [], healingFountains: [], debugName: "specialized", displayName: "Specialized" } }) };
}

function nextFrame(state: GameState, now = (state.simulationTimeMs ?? 0) + 100): GameState {
  return { ...clearFrameMovementPlanning(state), simulationFrame: (state.simulationFrame ?? 0) + 1, simulationTimeMs: now };
}

/** Observe the actual publication adapters, independently of the stored commit count. */
function observePublications() {
  const events: Array<{ id: string; frame: number }> = [];
  const normal = authority.commitNormalMovementPosition;
  const specialized = authority.commitSpecializedMovementPosition;
  vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((state, actor) => {
    const next = normal(state, actor);
    if (next.entities[actor.id].position !== state.entities[actor.id].position) events.push({ id: actor.id, frame: state.simulationFrame ?? 0 });
    return next;
  });
  vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((state, id, position, source, transactionId) => {
    const result = specialized(state, id, position, source, transactionId);
    if (result.outcome === "moved") events.push({ id, frame: state.simulationFrame ?? 0 });
    return result;
  });
  return events;
}

function useSkill(state: GameState, skillId: SkillId) {
  return resolveSkillEffect(state, state.entities.actor as Companion,
    { skill: SKILL_DEFINITIONS[skillId], target: state.entities.enemy as ReturnType<typeof createEnemy>, score: 1, selectionPriority: 0 }, state.simulationTimeMs ?? 1000);
}

describe("Issue #734 review regressions", () => {
  it.each(["active", "activating"])("finishes knockback and resumes an %s teleport rally without double movement", mode => {
    const events = observePublications();
    const map = createDebugMap("map-1");
    const teleport = map.teleports.find(point => point.id === "map-1-to-hub")!;
    const leader = createCompanion("leader", teleport.position, "leader", "fighter", 0);
    const actor = createCompanion("actor", { x: 2, y: 13 }, "leader", "fighter", 1);
    let next = createTestGameState({ currentMapId: "map-1", map, entities: { leader, actor }, partyLeaderId: leader.id, simulationTimeMs: 1000 });
    next = startForcedMovement(next, actor.id, "missing-source", { x: 1, y: 0 }, 2, 250, 1000);
    expect(next.forcedMovementsByEntityId?.actor).toBeDefined();
    next = mode === "active" ? triggerMapTeleport(next, "player", teleport.id) : setMapTeleportPoi(next, teleport.id);
    for (let frame = 1; frame <= 100; frame++) {
      next = updateGame(next, { nowMs: 1000 + frame * 100, deltaMs: 100, frameNumber: frame });
      expect(events.filter(event => event.id === actor.id && event.frame === frame).length).toBeLessThanOrEqual(1);
      if (frame === 3) expect(next.forcedMovementsByEntityId?.actor).toBeUndefined();
    }
    expect(next.currentMapId).toBe("hub");
    expect(next.activeTeleport).toBeNull();
  });

  it("does not let an abandoned dash endpoint block another pending recovery", () => {
    const first = createEnemy("first", { x: 8.2, y: 5 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 });
    const second = createEnemy("second", { x: 15, y: 5 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 });
    const blocker = createCompanion("blocker", { x: 5, y: 5 }, "blocker");
    const state = createTestGameState({ entities: { first, second, blocker }, enemyDashesByEnemyId: {
      first: pendingDash(first.id, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 }),
      second: pendingDash(second.id, { x: 10, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 }),
    } });
    expect(isSpecializedMovementPositionAvailable(state, second, { x: 10, y: 5 }, { landing: true })).toBe(true);
    const next = cancelEnemyDash(state, second.id, "incapacitated", 1200);
    expect(next.entities.second.position).toEqual({ x: 10, y: 5 });
    expect(next.enemyDashesByEnemyId?.second).toBeUndefined();
    expect(next.enemyDashesByEnemyId?.first.pendingFinalization).toBe(true);
  });

  it("finishes displacement while an AI teleport waits for resurrection", () => {
    const actor = createCompanion("actor", { x: 2, y: 13 }, "actor");
    const dead = { ...createCompanion("dead", { x: 2, y: 15 }, "actor"), state: "dead" as const, health: 0 };
    let next = createTestGameState({ currentMapId: "map-1", map: createDebugMap("map-1"), entities: { actor, dead }, partyLeaderId: actor.id, simulationTimeMs: 1000 });
    next = startForcedMovement(next, actor.id, "missing-source", { x: 1, y: 0 }, 2, 250, 1000);
    next = triggerMapTeleport(next, "ai", "map-1-to-hub");
    for (let frame = 1; frame <= 3; frame++) next = updateGame(next, { nowMs: 1000 + frame * 100, deltaMs: 100, frameNumber: frame });
    expect(next.forcedMovementsByEntityId?.actor).toBeUndefined();
    expect(getSpecializedMovementOwner(next, actor.id)).toBeUndefined();
    expect(next.currentMapId).toBe("map-1");
    expect(next.entities.dead.state).toBe("dead");
  });

  for (const kind of ["forced", "dash"] as const) {
    it.each(["resource", "wall", "structure"])(`holds ${kind} cancellation behind a new %s and recovers only after it clears`, obstacle => {
      const events = observePublications();
      const actor = kind === "forced" ? createCompanion("actor", { x: 8.2, y: 5 }, "actor")
        : createEnemy("actor", { x: 8.2, y: 5 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 });
      let next = createTestGameState({ entities: { actor }, simulationTimeMs: 1160,
        map: { columns: 30, rows: 30, walls: [], teleports: [], healingFountains: [], debugName: "recovery", displayName: "Recovery" },
        ...(kind === "forced" ? { forcedMovementsByEntityId: { actor: { targetId: actor.id, sourceId: "missing-source", origin: { x: 5, y: 5 },
          direction: { x: 1, y: 0 }, distance: 5, startedAt: 1000, endsAt: 1250, lastSafePosition: { x: 5, y: 5 },
          completionStatus: { type: "taunted", durationMs: 3000, sourceKey: "canceled" } } } }
          : { enemyDashesByEnemyId: { actor: pendingDash(actor.id, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 }) } }) });
      if (obstacle === "resource") next.entities.obstacle = createResource("obstacle", { x: 6.6, y: 5 });
      if (obstacle === "wall") next.map = { ...next.map!, walls: [{ x: 6.6, y: 5 }] };
      if (obstacle === "structure") next.entities.obstacle = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "obstacle",
        position: { x: 6.6, y: 5 }, footprint: { minX: 6.2, maxX: 7, minY: 4, maxY: 6 } };
      expect(isSpecializedMovementPositionAvailable(next, actor, { x: 5, y: 5 }, { landing: true })).toBe(true);
      for (let frame = 1; frame <= 30; frame++) {
        next = nextFrame(next);
        next = kind === "forced" ? cancelForcedMovement(next, actor.id) : cancelEnemyDash(next, actor.id, "incapacitated", next.simulationTimeMs);
        expect(next.entities.actor.position).toEqual(actor.position);
        expect(getSpecializedMovementOwner(next, actor.id)).toBeDefined();
      }
      expect(events).toEqual([]);
      const entities = { ...next.entities };
      delete entities.obstacle;
      next = nextFrame({ ...next, entities, map: { ...next.map!, walls: [] } });
      next = kind === "forced" ? updateForcedMovements(next, new Set(), next.simulationTimeMs!) : updateEnemyDashSystem(next, new Set(), next.simulationTimeMs);
      expect(next.entities.actor.position).toEqual({ x: 5, y: 5 });
      expect(getSpecializedMovementOwner(next, actor.id)).toBeUndefined();
      expect(events).toHaveLength(1);
      expect(next.statusEffectsById).toBeUndefined();
    });

    it(`does not tunnel backward on natural ${kind} completion when a new obstacle blocks the fallback`, () => {
      const actor = kind === "forced" ? createCompanion("actor", { x: 8.2, y: 5 }, "actor")
        : createEnemy("actor", { x: 8.2, y: 5 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 });
      const state = createTestGameState({ simulationTimeMs: 1250, entities: { actor,
        landingBlocker: createCompanion("landingBlocker", { x: 9.2, y: 5 }, "landingBlocker"),
        resource: createResource("resource", { x: kind === "forced" ? 6.8 : 6.6, y: 5 }) },
        ...(kind === "forced" ? { forcedMovementsByEntityId: { actor: { targetId: actor.id, sourceId: "source", origin: { x: 5, y: 5 },
          direction: { x: 1, y: 0 }, distance: 5, startedAt: 1000, endsAt: 1250, lastSafePosition: { x: 5, y: 5 } } } }
          : { enemyDashesByEnemyId: { actor: { ...pendingDash(actor.id, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 }), pendingFinalization: undefined } } }) });
      const next = kind === "forced" ? updateForcedMovements(state, new Set(), 1250) : updateEnemyDashSystem(state, new Set(), 1250, () => 0.99);
      expect(next.entities.actor.position).toEqual(actor.position);
      expect(getMovementPositionCommit(next, actor.id)).toBeUndefined();
      expect(kind === "forced" ? next.forcedMovementsByEntityId?.actor.pendingFinalization : next.enemyDashesByEnemyId?.actor.pendingFinalization).toBe(true);
    });

    it.each(["occupied", "terrain", "bothOccupied"])(`revalidates a ${kind} save landing when %s without changing live state`, obstruction => {
      const actor = kind === "forced" ? createCompanion("actor", { x: 28, y: 20 }, "actor")
        : createEnemy("actor", { x: 28, y: 20 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 });
      const lastSafePosition = obstruction === "terrain" ? { x: 22, y: 20 } : { x: 24, y: 20 };
      const state = createTestGameState({ currentMapId: "map-1", map: createDebugMap("map-1"), entities: { actor }, partyLeaderId: actor.id,
        ...(kind === "forced" ? { forcedMovementsByEntityId: { actor: { targetId: actor.id, sourceId: "source", origin: { x: 24, y: 20 },
          direction: { x: 1, y: 0 }, distance: 5, startedAt: 1000, endsAt: 1250, lastSafePosition } } }
          : { enemyDashesByEnemyId: { actor: pendingDash(actor.id, { x: 24, y: 20 }, lastSafePosition, { x: 29, y: 20 }) } }) });
      if (obstruction !== "terrain") state.entities.blocker = createCompanion("blocker", lastSafePosition, "blocker");
      if (obstruction === "bothOccupied") state.entities.crossing = createCompanion("crossing", actor.position, "crossing");
      const restored = sanitizeGameStateForSave(state, 1200);
      expect(restored.entities.actor.position).not.toEqual(lastSafePosition);
      expect(isSpecializedMovementPositionAvailable(restored, restored.entities.actor, restored.entities.actor.position, { landing: true })).toBe(true);
      expect(restored.forcedMovementsByEntityId).toEqual({});
      expect(restored.enemyDashesByEnemyId).toEqual({});
      expect(restored.externalMovementOwnersByEntityId).toEqual({});
      expect(restored.movementPositionCommitsByEntityId).toEqual({});
      expect(state.entities.actor).toBe(actor);
      expect(state.entities.actor.position).toEqual({ x: 28, y: 20 });
    });
  }

  it("assigns distinct legal save landings when multiple motions remembered the same point", () => {
    const first = createEnemy("first", { x: 28, y: 20 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 });
    const second = createEnemy("second", { x: 32, y: 20 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 });
    const state = createTestGameState({ currentMapId: "map-1", entities: { first, second }, enemyDashesByEnemyId: {
      first: pendingDash(first.id, { x: 24, y: 20 }, { x: 24, y: 20 }, { x: 29, y: 20 }),
      second: pendingDash(second.id, { x: 24, y: 20 }, { x: 24, y: 20 }, { x: 34, y: 20 }),
    } });
    const restored = sanitizeGameStateForSave(state, 1200);
    for (const actor of [restored.entities.first, restored.entities.second])
      expect(isSpecializedMovementPositionAvailable(restored, actor, actor.position, { landing: true })).toBe(true);
    expect(restored.entities.first.position).not.toEqual(restored.entities.second.position);
  });

  it("uses full reserved-growth clearance when choosing a restored landing", () => {
    const actor = { ...createEnemy("actor", { x: 28, y: 20 }, "aggressive", { enemyTypeId: "night_bat", combatBodyRadius: 0.7 }), minimumMovementBodyRadius: 2 };
    const state = createTestGameState({ currentMapId: "map-1", entities: { actor }, enemyDashesByEnemyId: {
      actor: pendingDash(actor.id, { x: 24, y: 20 }, { x: 24, y: 20 }, { x: 29, y: 20 }) } });
    const restored = sanitizeGameStateForSave(state, 1200);
    expect(restored.entities.actor.position).not.toEqual({ x: 24, y: 20 });
    expect(isSpecializedMovementPositionAvailable(restored, restored.entities.actor, restored.entities.actor.position, { landing: true })).toBe(true);
  });
});

describe("specialized movement authority", () => {
  it("normal movement consumes the same budget as specialized movement, without rolling it back", () => {
    const events = observePublications();
    const { state, actor } = fixture();
    const walked = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 });
    const result = commitSpecializedMovementPosition(walked, actor.id, { x: 7, y: 5 }, "skill", "skill-1");
    expect(result).toEqual({ state: walked, outcome: "deferred" });
    expect(events).toEqual([{ id: actor.id, frame: 0 }]);
  });

  it.each(["hold", "blocked"])("allows specialized handoff after a normal %s without permitting another normal request", outcome => {
    const { state, actor } = fixture();
    const held = outcome === "hold" ? holdEntityMovement(state, actor, "attack", "in range")
      : moveEntityTowardPositionIfUnoccupied(state, actor, { x: 10, y: 5 }, { isPositionAllowed: () => false });
    expect(moveEntityTowardPositionIfUnoccupied(held, actor, { x: 5, y: 10 })).toBe(held);
    const result = commitSpecializedMovementPosition(held, actor.id, { x: 7, y: 5 }, "skill", "skill-1");
    expect(result.outcome).toBe("moved");
    expect(getMovementPositionCommit(result.state, actor.id)?.from).toEqual(actor.position);
  });

  it("drops queued normal work without planning it after specialized movement wins", () => {
    const { actor, state } = fixture();
    const pending = moveEntityTowardPositionIfUnoccupied(beginNormalMovementPhase(state), actor, { x: 5, y: 15 });
    const moved = commitSpecializedMovementPosition(pending, actor.id, { x: 7, y: 5 }, "skill", "skill-1").state;
    const next = flushNormalMovementPhase(moved);
    expect(next.entities.actor.position).toEqual({ x: 7, y: 5 });
    expect(next.movementPathsByEntityId?.actor).toBeUndefined();
    expect(next.failedMoveByEntityId?.actor).toBeUndefined();
    expect(next.followTrailsByEntityId.actor).toEqual([actor.position]);
    expect(next.lastPositionsByEntityId?.actor).toEqual(actor.position);
    expect(next.reservedPositionsByEntityId?.actor).toEqual({ x: 7, y: 5 });
  });

  it("release and duplicate calls do not refund position, while the next frame does", () => {
    const { state, actor } = fixture();
    const first = commitSpecializedMovementPosition(state, actor.id, { x: 7, y: 5 }, "skill", "skill-1").state;
    const released = releaseExternalMovement(first, actor.id);
    expect(commitSpecializedMovementPosition(released, actor.id, { x: 5, y: 5 }, "skill", "skill-1").outcome).toBe("deferred");
    expect(moveEntityTowardPositionIfUnoccupied(released, released.entities.actor, { x: 5, y: 10 })).toBe(released);
    const fresh = nextFrame(released);
    expect(moveEntityTowardPositionIfUnoccupied(fresh, fresh.entities.actor, { x: 5, y: 10 }).entities.actor.position).not.toEqual({ x: 7, y: 5 });
  });

  const mobility: SkillId[] = ["kick", "flash_step", "shield_rush", "skirmish_shot", "pounce", "flame_step", "rune_step", "dawn_step", "atonement_step"];
  it.each(mobility)("publishes %s once and blocks a later ordinary move", skillId => {
    const events = observePublications();
    const { state } = fixture(skillId);
    const result = useSkill(state, skillId);
    expect(result.shouldConsumeCooldown).toBe(true);
    expect(events).toEqual([{ id: "actor", frame: 0 }]);
    expect(getMovementPositionCommit(result.state, "actor")?.source).toBe("companionSkill");
    expect(moveEntityTowardPositionIfUnoccupied(result.state, result.state.entities.actor, { x: 5, y: 10 })).toBe(result.state);
    expect(isSpecializedMovementPositionAvailable(result.state, result.state.entities.actor, result.state.entities.actor.position, { landing: true })).toBe(true);
  });

  it.each(mobility)("defers all of %s without any skill effects or costs after walking", skillId => {
    const { actor, state } = fixture(skillId);
    const walked = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 5, y: 10 });
    const result = useSkill(walked, skillId);
    expect(result.shouldConsumeCooldown).toBe(false);
    expect(result.state).toBe(walked);
    const retried = useSkill(nextFrame(walked), skillId);
    expect(retried.shouldConsumeCooldown).toBe(true);
  });

  it.each(mobility)("does not spend %s cooldown or global cooldown through the real skill system when deferred", skillId => {
    const { state, actor } = fixture(skillId);
    const active: Companion = { ...actor, role: skillId === "atonement_step" ? "support" : actor.role, state: "attack", currentTargetId: "enemy",
      skillProgression: { ranksBySkillId: { [skillId]: 1 }, legacyEnabledSkillIds: [] } };
    state.entities.actor = active;
    state.skillCooldownsByCompanionId = { actor: Object.fromEntries(Object.values(SKILL_DEFINITIONS)
      .filter(skill => skill.type === "active" && skill.id !== skillId)
      .map(skill => [skill.id, { companionId: "actor", skillId: skill.id, expiresAt: 100000 }])) };
    const walked = moveEntityTowardPositionIfUnoccupied(state, active, { x: 5, y: 10 });
    const deferred = updateSkillSystem(walked, 1000);
    expect(deferred.skillCooldownsByCompanionId?.actor?.[skillId]).toBeUndefined();
    expect(deferred.globalCooldownsByCompanionId?.actor).toBeUndefined();
    expect((deferred.entities.actor as Companion).health).toBe(100);
    expect((deferred.entities.enemy as ReturnType<typeof createEnemy>).health).toBe(1000);
    const retried = updateSkillSystem(nextFrame(walked), 1100);
    expect(retried.skillCooldownsByCompanionId?.actor?.[skillId]).toBeDefined();
    expect(retried.globalCooldownsByCompanionId?.actor).toBeDefined();
  });

  it("keeps pending safe-position recovery exclusive until a valid point is available", () => {
    const { state } = fixture();
    let next = updateForcedMovements(startForcedMovement(state, "actor", "enemy", { x: -1, y: 0 }, 2, 250, 1000), new Set(), 1125);
    // No safe point on the traveled portion of the locked line remains available.
    next = { ...next, entities: { ...next.entities, obstacle: createResource("obstacle", { x: 4.5, y: 5 }) } };
    next = cancelForcedMovement(next, "actor");
    expect(next.forcedMovementsByEntityId?.actor.pendingFinalization).toBe(true);
    const held = updateForcedMovements(nextFrame(next), new Set(), 1225);
    expect(getSpecializedMovementOwner(held, "actor")?.source).toBe("forcedMovement");
    expect(getMovementPositionCommit(held, "actor")).toBeUndefined();
    const entities = { ...held.entities };
    delete entities.obstacle;
    const recovered = updateForcedMovements(nextFrame({ ...held, entities }), new Set(), 1325);
    expect(recovered.forcedMovementsByEntityId?.actor).toBeUndefined();
  });

  it("records a deferred skill as skipped, not successfully used", () => {
    const { state, actor } = fixture("kick");
    const active: Companion = { ...actor, state: "attack", currentTargetId: "enemy" };
    state.entities.actor = active;
    state.skillCooldownsByCompanionId = { actor: Object.fromEntries(Object.values(SKILL_DEFINITIONS)
      .filter(skill => skill.type === "active" && skill.id !== "kick")
      .map(skill => [skill.id, { companionId: "actor", skillId: skill.id, expiresAt: 100000 }])) };
    const walked = moveEntityTowardPositionIfUnoccupied(startDebugTelemetryRecording(state), active, { x: 5, y: 10 });
    const next = updateSkillSystem(walked, 1000);
    expect(next.debugTelemetry?.events.some(event => event.type === "skill_skipped" && event.skillId === "kick" && event.reason === "movement_authority")).toBe(true);
    expect(next.debugTelemetry?.events.some(event => event.type === "skill_used" && event.skillId === "kick")).toBe(false);
  });

  it("actor defeat clears its motion without canceling movement merely sourced by it", () => {
    const { state } = fixture();
    let next = startForcedMovement(state, "actor", "enemy", { x: -1, y: 0 }, 2, 250, 1000);
    next = updateEntity(next, { ...next.entities.enemy as ReturnType<typeof createEnemy>, health: 0, state: "dead" }, 1100);
    expect(next.forcedMovementsByEntityId?.actor).toBeDefined();
    next = updateEntity(next, { ...next.entities.actor as Companion, health: 0, state: "dead" }, 1100);
    expect(next.forcedMovementsByEntityId?.actor).toBeUndefined();
    expect(next.externalMovementOwnersByEntityId?.actor).toBeUndefined();
  });

  it("opens departure confirmation before an instant mobility effect or cost", () => {
    const { state, actor } = fixture("atonement_step");
    const position = { x: ORC_WARCAMP_ARENA.maxX - 1, y: (ORC_WARCAMP_ARENA.minY + ORC_WARCAMP_ARENA.maxY) / 2 };
    state.currentMapId = "map-7";
    state.map = undefined;
    state.entities.actor = { ...actor, position };
    state.entities.enemy = { ...state.entities.enemy, position: { x: position.x + 3.5, y: position.y } };
    state.warmasterLifecycle = { phase: "defeated", sequence: 1, recharge: 0, rescued: true,
      chest: { sequence: 1, rolledLoot: [], pendingLoot: [], collectedLoot: [], crownsClaimed: false } };
    const result = useSkill(state, "atonement_step");
    expect(result.shouldConsumeCooldown).toBe(false);
    expect(result.state.warmasterInteraction?.departure).toEqual({ kind: "walk" });
    expect(result.state.entities.actor.position).toEqual(position);
    expect((result.state.entities.actor as Companion).health).toBe(100);
    expect(result.state.statusEffectsById).toBeUndefined();
    expect(getMovementPositionCommit(result.state, "actor")).toBeUndefined();
  });

  it("stops forced movement at a departure guard without repeatedly requesting the same exit", () => {
    const { state, actor } = fixture();
    const position = { x: ORC_WARCAMP_ARENA.maxX - 1, y: (ORC_WARCAMP_ARENA.minY + ORC_WARCAMP_ARENA.maxY) / 2 };
    state.currentMapId = "map-7";
    state.map = undefined;
    state.entities = { actor: { ...actor, position } };
    state.warmasterLifecycle = { phase: "defeated", sequence: 1, recharge: 0, rescued: true,
      chest: { sequence: 1, rolledLoot: [], pendingLoot: [], collectedLoot: [], crownsClaimed: false } };
    const forced = startForcedMovement(state, "actor", "missing-source", { x: 1, y: 0 }, 4, 250, 1000);
    const next = updateForcedMovements(forced, new Set(), 1250);
    expect(next.warmasterInteraction?.departure).toBeDefined();
    expect(next.entities.actor.position).toEqual(position);
    expect(next.forcedMovementsByEntityId?.actor).toBeUndefined();
  });

  it("applies full fallback body clearance at enemy encounter bounds", () => {
    const { state } = fixture();
    const enemy = { ...createEnemy("bounded", { x: 10, y: 10 }, "passive"), movementBounds: { minX: 0, maxX: 20, minY: 0, maxY: 20 } };
    expect(isSpecializedMovementPositionAvailable(state, enemy, { x: 0.5, y: 10 })).toBe(false);
  });

  it("failed mobility preparation publishes nothing and leaves no ownership or costs", () => {
    const events = observePublications();
    const { state } = fixture("rune_step");
    state.map = { ...state.map!, walls: [{ x: 5, y: 5 }] };
    const result = useSkill(state, "rune_step");
    expect(result.shouldConsumeCooldown).toBe(false);
    expect(result.state).toBe(state);
    expect(events).toEqual([]);
    expect(getSpecializedMovementOwner(result.state, "actor")).toBeUndefined();
  });

  it("timed motion registered after walking waits without changing its deadline", () => {
    const events = observePublications();
    const { actor, state } = fixture();
    const walked = moveEntityTowardPositionIfUnoccupied(state, actor, { x: 5, y: 10 });
    const forced = startForcedMovement(walked, actor.id, "enemy", { x: -1, y: 0 }, 2, 250, 1000);
    const deferred = updateForcedMovements(forced, new Set(), 1100);
    expect(deferred.entities.actor.position).toEqual(walked.entities.actor.position);
    expect(deferred.forcedMovementsByEntityId?.actor.endsAt).toBe(1250);
    const next = updateForcedMovements(nextFrame(deferred, 1125), new Set(), 1125);
    expect(next.entities.actor.position.x).toBeCloseTo(4);
    expect(events).toHaveLength(2);
    expect(events.map(event => event.frame)).toEqual([0, 1]);
  });

  it("an active transaction excludes normal movement and separation even before it takes a step", () => {
    const { state, actor } = fixture();
    const forced = startForcedMovement(state, actor.id, "enemy", { x: -1, y: 0 }, 2, 250, 1000);
    const overlapping = { ...forced, entities: { ...forced.entities, friend: createCompanion("friend", actor.position, "friend") } };
    expect(moveEntityTowardPositionIfUnoccupied(overlapping, actor, { x: 5, y: 10 })).toBe(overlapping);
    const next = updateOverlapRecoverySystem(overlapping, new Set());
    expect(next.entities.actor.position).toEqual(actor.position);
    expect(getMovementPositionCommit(next, actor.id)).toBeUndefined();
  });

  it("cancels knockback effects now but defers a second safe-position correction", () => {
    const events = observePublications();
    const { state, actor } = fixture();
    const crossing = createCompanion("crossing", { x: 6.4, y: 5 }, "crossing");
    state.entities.enemy = { ...state.entities.enemy, position: { x: 20, y: 20 } };
    let next = startForcedMovement({ ...state, entities: { ...state.entities, crossing } }, actor.id, "enemy", { x: 1, y: 0 }, 4, 250, 1000,
      { type: "taunted", durationMs: 3000, sourceKey: "completion" });
    next = updateForcedMovements(next, new Set(), 1062.5);
    expect(next.forcedMovementsByEntityId?.actor.lastSafePosition).toEqual(actor.position);
    next = cancelForcedMovement(next, actor.id);
    expect(next.forcedMovementsByEntityId?.actor).toMatchObject({ pendingFinalization: true, completionStatus: undefined });
    expect(events).toHaveLength(1);
    next = updateForcedMovements(nextFrame(next, 1100), new Set(), 1100);
    expect(next.entities.actor.position).toEqual(actor.position);
    expect(next.forcedMovementsByEntityId?.actor).toBeUndefined();
    expect(next.statusEffectsById).toBeUndefined();
    expect(events.map(event => event.frame)).toEqual([0, 1]);
  });

  it.each(["move", "enemy", "structure"])("preserves and replaces individual %s intent during displacement", kind => {
    const { state } = fixture();
    const building = createBarrackEntity(BARRACK_DEFINITIONS[0]);
    const structure = { ...building, id: "structure", position: { x: 12, y: 12 }, footprint: { minX: 11, maxX: 13, minY: 11, maxY: 13 }, attackBounds: { minX: 10.5, maxX: 13.5, minY: 10.5, maxY: 13.5 } };
    const initial = setPartyExecutionIntent({ ...state, entities: { ...state.entities, structure } },
      { type: "move", targetPosition: { x: 20, y: 20 }, targetId: null, source: "player" });
    let next = issueCompanionDirectCommand(initial, { type: "move", companionId: "actor", targetPosition: { x: 4, y: 10 } }, 900).state;
    next = startForcedMovement(next, "actor", "enemy", { x: -1, y: 0 }, 2, 250, 1000);
    const input = kind === "move" ? { type: "move" as const, companionId: "actor", targetPosition: { x: 4, y: 12 } }
      : { type: "attack" as const, companionId: "actor", targetId: kind };
    const replacement = issueCompanionDirectCommand(next, input, 1050);
    expect(replacement.code).toBe("success");
    next = updateDirectCompanionCommandSystem(replacement.state, new Set(), 1100);
    expect(next.forcedMovementsByEntityId?.actor).toBeDefined();
    const command = next.directCompanionCommandsById?.actor;
    next = updateForcedMovements(next, new Set(), 1250);
    next = updateDirectCompanionCommandSystem(nextFrame(next, 1300), new Set(), 1300);
    expect(next.directCompanionCommandsById?.actor).toBe(command);
    expect(next.partyIntent).toEqual(initial.partyIntent);
    if (kind !== "move") expect((next.entities.actor as Companion).currentTargetId).toBe(kind);
  });

  it("preserves a temporarily displaced companion's existing formation assignment", () => {
    const { state } = fixture();
    state.partyFormation = { phase: "traveling", targetId: null, approachPoint: { x: 10, y: 5 }, direction: { x: 1, y: 0 },
      slotsByEntityId: { actor: { x: 5, y: 7 } }, slotReasonsByEntityId: {}, skippedTargetIds: [] };
    const forced = startForcedMovement(state, "actor", "enemy", { x: -1, y: 0 }, 2, 250, 1000);
    const next = updatePartyFormationSystem(forced, new Set());
    expect(next.partyFormation?.slotsByEntityId.actor).toEqual({ x: 5, y: 7 });
  });

  it("releases transient ownership on transition, removal, and restoration without resuming motion", () => {
    const { state } = fixture();
    const forced = updateForcedMovements(startForcedMovement(state, "actor", "enemy", { x: -1, y: 0 }, 2, 250, 1000), new Set(), 1125);
    for (const next of [clearMapTransitionRuntimeState(forced), sanitizeGameStateForSave(forced, 1125), pruneMissingEntityRuntimeState({ ...forced, entities: {} })]) {
      expect(next.movementPositionCommitsByEntityId).toEqual({});
      expect(next.externalMovementOwnersByEntityId).toEqual({});
      expect(next.forcedMovementsByEntityId).toEqual({});
    }
  });

  it("rebuild clearance defers atomically after an actor has moved or owns specialized movement", () => {
    const { state } = fixture();
    const footprint = { minX: 4, maxX: 6, minY: 4, maxY: 6 };
    const moved = commitSpecializedMovementPosition(state, "actor", { x: 5.1, y: 5 }, "skill", "skill").state;
    expect(planStructureRebuildClearance(moved, "building", footprint)).toBeNull();
    const forced = startForcedMovement(state, "actor", "enemy", { x: -1, y: 0 }, 2, 250, 1000);
    expect(planStructureRebuildClearance(forced, "building", footprint)).toBeNull();
  });

  it("uses full bodies for structures and resources and honors other reserved landings", () => {
    const { state, actor } = fixture();
    const structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "structure", position: { x: 12, y: 5 },
      footprint: { minX: 11, maxX: 13, minY: 4, maxY: 6 }, attackBounds: { minX: 9, maxX: 15, minY: 2, maxY: 8 } };
    state.entities.structure = structure;
    expect(isSpecializedMovementPositionAvailable(state, actor, { x: 10.6, y: 5 })).toBe(false);
    expect(isSpecializedMovementPositionAvailable(state, actor, { x: 9.5, y: 5 })).toBe(true);
    state.entities.resource = createResource("resource", { x: 5, y: 8 });
    expect(isSpecializedMovementPositionAvailable(state, actor, { x: 5, y: 6.5 })).toBe(false);
    state.reservedPositionsByEntityId = { enemy: { x: 3, y: 5 } };
    expect(isSpecializedMovementPositionAvailable(state, actor, { x: 3, y: 5 }, { landing: true })).toBe(false);
  });

  it("honors minimum movement radius without changing actual combat size", () => {
    const { state } = fixture();
    const growing = { ...createEnemy("growing", { x: 10, y: 10 }, "passive", { combatBodyRadius: 1 }), minimumMovementBodyRadius: 2,
      movementBounds: { minX: 0, maxX: 20, minY: 0, maxY: 20 } };
    expect(isSpecializedMovementPositionAvailable(state, growing, { x: 1.5, y: 10 })).toBe(false);
    expect(growing.combatBodyRadius).toBe(1);
  });

  it("defers encounter-reset placement when its actor already moved", () => {
    const boss = createEnemy("boss", { x: 101, y: 27 }, "aggressive", { enemyTypeId: "orc_warmaster", combatBodyRadius: 1.25 });
    const state = createTestGameState({ currentMapId: "map-7", entities: { boss }, simulationTimeMs: 1000,
      map: { columns: 150, rows: 90, walls: [], teleports: [], healingFountains: [], debugName: "arena", displayName: "Arena" } });
    const moved = commitSpecializedMovementPosition(state, boss.id, { x: 102, y: 27 }, "enemyDash", "dash").state;
    const pending = resetWarmasterAttempt(moved, 1000);
    expect(pending.entities.boss.position).toEqual({ x: 102, y: 27 });
    expect(pending.warmasterResetPending).toBe(boss.id);
    const next = resetWarmasterAttempt(nextFrame(pending), 1100);
    expect(next.entities.boss.position).toEqual(boss.homePosition);
    expect(next.warmasterResetPending).toBeUndefined();
    expect(WARMASTER_ARENA.minX).toBeLessThan(next.entities.boss.position.x);
  });

  it("remains stable over thirty real updates after knockback and resumes a direct move", () => {
    const events = observePublications();
    const { state } = fixture();
    let next = issueCompanionDirectCommand({ ...state, entities: { actor: state.entities.actor } }, { type: "move", companionId: "actor", targetPosition: { x: 6, y: 10 } }, 900).state;
    next = startForcedMovement(next, "actor", "missing-source", { x: -1, y: 0 }, 2, 250, 1000);
    for (let frame = 1; frame <= 45; frame++) {
      next = updateGame(next, { nowMs: 1000 + frame * 100, deltaMs: 100, frameNumber: frame });
      expect(events.filter(event => event.id === "actor" && event.frame === frame).length).toBeLessThanOrEqual(1);
    }
    expect(next.forcedMovementsByEntityId?.actor).toBeUndefined();
    expect(next.directCompanionCommandsById?.actor).toBeUndefined();
    expect(Math.hypot(next.entities.actor.position.x - 6, next.entities.actor.position.y - 10)).toBeLessThan(0.4);
  });
});

describe("dash handoff and interruption", () => {
  function dashFixture(type: EnemyTypeId = "night_bat") {
    const enemy = { ...createEnemy("dasher", { x: 5, y: 5 }, "aggressive", { enemyTypeId: type, attackCooldownMs: 1000 }), state: "attack" as const, currentTargetId: "actor", lastAttackAt: 0 };
    const actor = { ...createCompanion("actor", { x: 8, y: 5 }, "actor"), health: 10000, maxHealth: 10000 };
    let state = createTestGameState({ entities: { dasher: enemy, actor }, partyLeaderId: actor.id, simulationTimeMs: 1000,
      warmasterAttempt: type === "orc_warmaster" ? { id: "attempt", bossId: enemy.id, power: 0, transfers: [], transferSequence: 0 } : undefined });
    state = updateEnemyAbilitySystem(state, 1000);
    const cast = state.enemyAbilityCastsByEnemyId?.dasher;
    expect(cast?.dashPlan).toBeDefined();
    state = updateEnemyAbilitySystem(state, cast!.windupEndsAt);
    return { state, startedAt: cast!.windupEndsAt };
  }

  it.each<EnemyTypeId>(["night_bat", "orc_raider", "orc_warmaster"])("preserves %s dash exclusivity and completion", type => {
    const events = observePublications();
    const { state, startedAt } = dashFixture(type);
    const end = state.enemyDashesByEnemyId!.dasher.endsAt;
    let next = updateEnemyDashSystem(nextFrame(state, (startedAt + end) / 2), new Set(), (startedAt + end) / 2, () => 0.99);
    const duplicate = updateEnemyDashSystem(next, new Set(), end, () => 0.99);
    expect(duplicate.entities.dasher.position).toEqual(next.entities.dasher.position);
    next = updateEnemyDashSystem(nextFrame(duplicate, end), new Set(), end, () => 0.99);
    expect(next.enemyDashesByEnemyId?.dasher).toBeUndefined();
    expect(events.filter(event => event.id === "dasher").map(event => event.frame)).toEqual([1, 2]);
  });

  it("does not restore and rewrite the impact position when knockback replaces a dash", () => {
    const events = observePublications();
    const { state, startedAt } = dashFixture();
    let next = updateEnemyDashSystem(nextFrame(state, startedAt + 100), new Set(), startedAt + 100, () => 0.99);
    const impact = next.entities.dasher.position;
    next = startForcedMovement(next, "dasher", "actor", { x: 0, y: 1 }, 4, 250, startedAt + 100);
    expect(next.entities.dasher.position).toEqual(impact);
    expect(next.forcedMovementsByEntityId?.dasher.origin).toEqual(impact);
    expect(next.enemyDashesByEnemyId?.dasher).toBeUndefined();
    expect(events.filter(event => event.id === "dasher")).toHaveLength(1);
    next = updateForcedMovements(next, new Set(), startedAt + 200);
    expect(next.entities.dasher.position).toEqual(impact);
  });

  it("defers cancellation restoration without continuing dash damage", () => {
    const events = observePublications();
    const { state, startedAt } = dashFixture();
    let next = updateEnemyDashSystem(nextFrame(state, startedAt + 125), new Set(), startedAt + 125, () => 0.99);
    const health = (next.entities.actor as Companion).health;
    next = cancelEnemyDash(next, "dasher", "incapacitated", startedAt + 125);
    expect(next.enemyDashesByEnemyId?.dasher.pendingFinalization).toBe(true);
    expect(events.filter(event => event.id === "dasher")).toHaveLength(1);
    next = updateEnemyDashSystem(nextFrame(next, startedAt + 150), new Set(), startedAt + 150, () => 0.99);
    expect(next.enemyDashesByEnemyId?.dasher).toBeUndefined();
    expect(next.entities.dasher.position).toEqual({ x: 5, y: 5 });
    expect((next.entities.actor as Companion).health).toBe(health);
    expect(events.filter(event => event.id === "dasher").map(event => event.frame)).toEqual([1, 2]);
    expect(cleanupEnemyDashRuntime(next)).toBe(next);
  });
});
