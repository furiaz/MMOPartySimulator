import { probeAttackEngagement, type AttackEngagementProbe } from "./attackSlots";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getCompanionAttackRange } from "./companionCombat";
import { isTargetDummyEnemy } from "./entityGuards";
import { clearDirectCommandPlanning, hasDirectCompanionAuthority, isDirectGatherPersonalThreat } from "./directCommandState";
import { getPartyExecutionIntent } from "./partyIntentState";
import { getBoundedPathDistance } from "./movementPlanning";
import { getEuclideanDistance, getGridDistance } from "./positionUtils";
import { getActiveQuestGuide, QUEST_GUIDE_ENEMY_PAUSE_RANGE } from "./questGuideSystem";
import { getEntityCollisionShape, isWithinAttackReach, SPATIAL_EPSILON } from "./spatialGeometry";
import { updateEntity, type GameState } from "./state";
import { isMovementBlockedByStatus } from "./statusEffects";
import { isWarmasterAvailable } from "./warmasterLifecycleState";
import { ROLE_TUNING } from "./roleProfiles";
import { getSpecializedMovementReservations } from "./specializedMovementGeometry";
import type { NormalMovementResult } from "./movementTypes";
import type { Companion, Enemy, GameEntity, Position } from "./types";

export const TARGET_OBSTRUCTION_MS = 1000;
export const TARGET_PROBE_INTERVAL_MS = 250;
export const TARGET_PROGRESS_DISTANCE = 0.1;
export const CRITICAL_ALLY_HEALTH_RATIO = 0.35;

export type CompanionTargetReason = "acquired" | "shared_target" | "player_focus" | "personal_attacker" |
  "critical_ally" | "sustained_obstruction" | "unreachable_engagement" | "target_died" |
  "target_removed" | "scripted_suppression" | "leash_failure" | "response_ended" | "command_replaced" | "actor_defeated" | "encounter_invalidated";

export type TargetCommitment = { targetId: string; reason: CompanionTargetReason; priority: number; local: boolean };
export type TargetCommitmentDecision = {
  kind: "retain" | "acquire" | "switch" | "release" | "none";
  target: Enemy | null;
  reason: CompanionTargetReason;
  priority: number;
  local: boolean;
};
export type TargetApproachObservation = {
  key: string;
  targetId?: string;
  frame: number;
  timeMs: number;
  waypoint: Position;
  bestDistance: number;
  progressCredit?: number;
  position?: Position;
  noProgressMs: number;
  blockerId?: string;
  blockerMs: number;
  failedChecks: number;
  lastProbeAtMs?: number;
  hardUnreachable?: boolean;
  blockerReachable?: boolean;
  probeKey?: string;
  blockerKey?: string;
  engagementPosition?: Position;
};
export type RejectedCombatTarget = { targetId: string; worldKey: string; checkedWorldKey?: string; lastProbeAtMs: number; reachable: boolean };
export type CompanionTargetTransition = {
  entityId: string; previousTargetId: string | null; targetId: string | null;
  reason: CompanionTargetReason; frame: number; timeMs: number;
};

export function isAutomaticCombatTarget(state: GameState, target: GameEntity | undefined): target is Enemy {
  return isRetainableCombatEnemy(state, target) && !isTargetDummyEnemy(target);
}

export function isRetainableCombatEnemy(state: GameState, target: GameEntity | undefined): target is Enemy {
  return target?.kind === "enemy" && target.state !== "dead" && target.health > 0 && !isAutonomousTargetSuppressed(state, target.id) &&
    (target.enemyTypeId !== "orc_warmaster" || isWarmasterAvailable(state));
}

function isAutonomousTargetSuppressed(state: GameState, id: string): boolean {
  return (state.autonomousTargetSuppressionsByEnemyId?.[id]?.expiresAtMs ?? 0) > (state.simulationTimeMs ?? 0);
}

function isAggressor(state: GameState, target: Enemy): boolean {
  const victim = target.currentTargetId ? state.entities[target.currentTargetId] : undefined;
  return target.state === "attack" && victim?.kind === "companion" && victim.state !== "dead" && victim.health > 0;
}

function emergencyPriority(state: GameState, actor: Companion, enemy: Enemy, damage?: { attackerId: string; victimId: string }): number {
  const victim = state.entities[damage?.attackerId === enemy.id ? damage.victimId : enemy.currentTargetId ?? ""];
  if ((!isAggressor(state, enemy) && damage?.attackerId !== enemy.id) || victim?.kind !== "companion" || victim.health <= 0) return 0;
  return victim.health / victim.maxHealth <= CRITICAL_ALLY_HEALTH_RATIO ? 2 : victim.id === actor.id ? 1 : 0;
}

function canRespond(state: GameState, actor: Companion, enemy: Enemy, range: number): boolean {
  if (state.resurrectionChannelsByHelperId?.[actor.id] || getGridDistance(actor.position, enemy.position) > range) return false;
  if (!isWithinLocalResponseLeash(state, actor, enemy)) return false;
  const guide = getActiveQuestGuide(state);
  if (guide && getGridDistance(enemy.position, guide.position) > QUEST_GUIDE_ENEMY_PAUSE_RANGE) return false;
  if (actor.state === "gather" && enemy.currentTargetId !== actor.id) return false;
  if (actor.role === "defender") {
    const leader = state.entities[state.partyLeaderId];
    if (leader && getGridDistance(actor.position, leader.position) > 8) return false;
  }
  return true;
}

function isWithinLocalResponseLeash(state: GameState, actor: Companion, enemy: Enemy): boolean {
  const leader = state.entities[state.partyLeaderId];
  // Defender's existing anchor/front-line predicate remains the authority.
  return !leader || actor.id === leader.id || actor.role === "defender" ||
    getGridDistance(actor.position, leader.position) <= ROLE_TUNING[actor.role].leashDistance ||
    isWithinAttackReach(actor, enemy, getCompanionAttackRange(actor));
}

/** Authority and validity precede scoring. Repeated reads never advance timing. */
export function selectTargetCommitment(
  state: GameState, actor: Companion,
  options: { preferredTarget?: Enemy | null; range?: number; isEligible?: (enemy: Enemy) => boolean; allowEmergency?: boolean;
    allowPlayerInteractionDefense?: boolean; allowOrdinaryThreat?: boolean; damage?: { attackerId: string; victimId: string } } = {},
): TargetCommitmentDecision {
  const rawCurrent = actor.currentTargetId ? state.entities[actor.currentTargetId] : undefined;
  const intent = getPartyExecutionIntent(state);
  const shared = intent?.type === "attack" && intent.source !== "player" && intent.targetId ? state.entities[intent.targetId] : undefined;
  const inherited = (actor.state === "follow" || actor.state === "idle") && isRetainableCombatEnemy(state, shared) &&
    canReacquireCombatTarget(state, actor, shared) ? shared : null;
  const retained = isRetainableCombatEnemy(state, rawCurrent) && (actor.state === "attack" || actor.state === "defend") ? rawCurrent : inherited;
  const memory = state.targetCommitmentsByEntityId?.[actor.id];
  const current = retained && (options.isEligible?.(retained) ?? true) &&
    (!memory?.local || memory.targetId !== retained.id || isWithinLocalResponseLeash(state, actor, retained)) ? retained : null;
  const decision = (target: Enemy | null, reason: CompanionTargetReason, priority = 0, local = false): TargetCommitmentDecision => ({
    kind: target ? target.id === current?.id ? "retain" : current ? "switch" : "acquire" : current || rawCurrent?.kind === "enemy" ||
      (!rawCurrent && actor.currentTargetId && (actor.state === "attack" || actor.state === "defend")) ? "release" : "none",
    target, reason, priority, local,
  });
  const command = state.directCompanionCommandsById?.[actor.id];
  if (hasDirectCompanionAuthority(state, actor) && command?.type !== "gather")
    return decision(current, "player_focus", 3);
  const interactionDefense = isPlayerInteractionDefense(state, actor);
  if (intent?.source === "player" && !command && !options.allowPlayerInteractionDefense && !interactionDefense) return decision(current, "player_focus", 3);
  if (command?.type === "gather" && current && !isDirectGatherPersonalThreat(state, actor.id, current))
    return decision(null, "response_ended");

  const range = options.range ?? (actor.role === "defender" ? 6 : 3);
  const currentPriority = current && isAggressor(state, current)
    ? Math.max(emergencyPriority(state, actor, current), memory?.targetId === current.id ? memory.priority : 0) : 0;
  const candidates = options.allowEmergency === false ? [] : Object.values(state.entities)
    .filter((enemy): enemy is Enemy => isAutomaticCombatTarget(state, enemy) && (isAggressor(state, enemy) || options.damage?.attackerId === enemy.id))
    .filter(enemy => canRespond(state, actor, enemy, range) && (options.isEligible?.(enemy) ?? true) &&
      (!command || isDirectGatherPersonalThreat(state, actor.id, enemy)) &&
      (intent?.source !== "player" || enemy.currentTargetId === actor.id || options.damage?.victimId === actor.id))
    .sort((a, b) => emergencyPriority(state, actor, b, options.damage) - emergencyPriority(state, actor, a, options.damage) ||
      getGridDistance(actor.position, a.position) - getGridDistance(actor.position, b.position) || a.id.localeCompare(b.id));
  const emergency = candidates[0];
  if (emergency && emergencyPriority(state, actor, emergency, options.damage) > 0 &&
    (!current || emergencyPriority(state, actor, emergency, options.damage) > currentPriority)) {
    const priority = emergencyPriority(state, actor, emergency, options.damage);
    return decision(emergency, priority === 2 ? "critical_ally" : priority === 1 ? "personal_attacker" : "acquired", priority, true);
  }
  if (current) {
    const observation = state.targetApproachesByEntityId?.[actor.id];
    if (!isApproachSuspended(state, actor.id) && observation?.targetId === current.id && observation.failedChecks >= 2 && observation.hardUnreachable &&
      observation.position && getEuclideanDistance(actor.position, observation.position) <= SPATIAL_EPSILON &&
      observation.probeKey === getProbeKey(state, actor, current, current.position))
      return decision(null, "unreachable_engagement");
    const blocker = getSustainedBlockerTarget(state, actor);
    if (blocker && blocker.id !== current.id && !command && currentPriority === 0)
      return decision(blocker, "sustained_obstruction", 0, true);
    if (memory?.targetId === current.id && memory.local && memory.priority > 0 && !isAggressor(state, current))
      return decision(null, "response_ended");
    return decision(current, memory?.targetId === current.id ? memory.reason : "acquired", currentPriority,
      memory?.targetId === current.id && memory.local);
  }
  if (command) return decision(null, "response_ended");
  const preferred = options.preferredTarget;
  if (preferred && isAutomaticCombatTarget(state, preferred) && (options.isEligible?.(preferred) ?? true) &&
    canReacquireCombatTarget(state, actor, preferred)) return decision(preferred,
      actor.currentTargetId && actor.state === "attack" && !current ? getTargetReleaseReason(state, actor.currentTargetId) : "shared_target");
  const blocker = getSustainedBlockerTarget(state, actor);
  if (blocker && canRespond(state, actor, blocker, range)) return decision(blocker, "sustained_obstruction", 0, true);
  const ordinaryThreat = candidates.find(enemy => canReacquireCombatTarget(state, actor, enemy));
  if (ordinaryThreat && options.allowOrdinaryThreat !== false) return decision(ordinaryThreat, "acquired", 0, true);
  return decision(null, actor.currentTargetId && (rawCurrent?.kind === "enemy" || !rawCurrent)
    ? getTargetReleaseReason(state, actor.currentTargetId) : "acquired");
}

/** Only an accepted change discards speculative planning, never a committed frame result. */
export function applyTargetCommitment(state: GameState, actor: Companion, decision: TargetCommitmentDecision, attackState: "attack" | "defend" = "attack"): GameState {
  if (decision.kind === "none") return state;
  const previous = state.targetCommitmentsByEntityId?.[actor.id];
  if (decision.kind === "retain") {
    if (previous && previous.targetId === decision.target?.id && previous.priority >= decision.priority) return state;
    return { ...state, targetCommitmentsByEntityId: { ...state.targetCommitmentsByEntityId,
      [actor.id]: { targetId: decision.target!.id, reason: decision.reason, priority: decision.priority, local: decision.local } } };
  }
  const rejections = { ...state.rejectedCombatTargetsByEntityId?.[actor.id] };
  const rejection = decision.reason === "sustained_obstruction" || decision.reason === "unreachable_engagement"
    ? actor.currentTargetId && isAutomaticCombatTarget(state, state.entities[actor.currentTargetId])
      ? { targetId: actor.currentTargetId, worldKey: getReacquisitionKey(state, actor, state.entities[actor.currentTargetId]),
        lastProbeAtMs: state.simulationTimeMs ?? 0, reachable: false } : undefined
    : undefined;
  if (rejection) rejections[rejection.targetId] = rejection;
  let next = clearDirectCommandPlanning(state, actor.id);
  const commitments = { ...next.targetCommitmentsByEntityId };
  delete commitments[actor.id];
  if (decision.target) commitments[actor.id] = { targetId: decision.target.id, reason: decision.reason,
    priority: decision.priority, local: decision.local };
  next = { ...next, targetCommitmentsByEntityId: commitments,
    targetEngagementProbeAtMsByEntityId: state.targetEngagementProbeAtMsByEntityId,
    rejectedCombatTargetsByEntityId: { ...next.rejectedCombatTargetsByEntityId, ...(Object.keys(rejections).length ? { [actor.id]: rejections } : {}) },
    companionTargetDecisionByEntityId: { ...next.companionTargetDecisionByEntityId, [actor.id]: {
      entityId: actor.id, previousTargetId: actor.currentTargetId, targetId: decision.target?.id ?? null, reason: decision.reason,
      frame: state.simulationFrame ?? state.simulationTick, timeMs: state.simulationTimeMs ?? 0 } } };
  return updateEntity(next, { ...actor, state: decision.target ? attackState : "follow",
    currentTargetId: decision.target?.id ?? (actor.id === state.partyLeaderId ? null : state.partyLeaderId),
    commandPriority: hasDirectCompanionAuthority(state, actor) ? "direct" : "autonomous" });
}

export function hasLocalTargetCommitment(state: GameState, actor: GameEntity): boolean {
  if (actor.kind !== "companion" || hasDirectCompanionAuthority(state, actor) ||
    (getPartyExecutionIntent(state)?.source === "player" && !isPlayerInteractionDefense(state, actor))) return false;
  const memory = state.targetCommitmentsByEntityId?.[actor.id];
  return Boolean(memory?.local && memory.targetId === actor.currentTargetId && isAutomaticCombatTarget(state, state.entities[memory.targetId]));
}

/** Existing gathering/NPC interaction exception; ordinary floor orders still win. */
export function isPlayerInteractionIntent(state: GameState): boolean {
  const intent = getPartyExecutionIntent(state);
  if (intent?.source !== "player") return false;
  if (intent.type === "gather") return true;
  return intent.type === "move" && Boolean(intent.targetPosition && Object.values(state.entities).some(entity =>
    entity.kind === "npc" && getGridDistance(entity.position, intent.targetPosition!) <=
      (entity.npcRole === "quest_giver" || entity.npcRole === "class_mentor" ? 4 : 3)));
}

export function isPlayerInteractionDefense(state: GameState, actor: GameEntity): boolean {
  if (actor.kind !== "companion" || !isPlayerInteractionIntent(state) || hasDirectCompanionAuthority(state, actor)) return false;
  const memory = state.targetCommitmentsByEntityId?.[actor.id];
  const enemy = actor.currentTargetId ? state.entities[actor.currentTargetId] : undefined;
  return Boolean(memory?.local && memory.priority > 0 && enemy?.kind === "enemy" && isRetainableCombatEnemy(state, enemy) &&
    enemy.state === "attack" && enemy.currentTargetId === actor.id);
}

export function hasRetainedAutomaticTarget(state: GameState, actor: GameEntity): boolean {
  return actor.kind === "companion" && (actor.state === "attack" || actor.state === "defend") &&
    !hasDirectCompanionAuthority(state, actor) && selectTargetCommitment(state, actor, { allowEmergency: false }).kind === "retain";
}

export function isPrivateResponseTarget(state: GameState, enemyId: string): boolean {
  if (getPartyExecutionIntent(state)?.targetId === enemyId) return false;
  return Object.values(state.entities).some(actor => hasLocalTargetCommitment(state, actor) &&
    actor.kind === "companion" && actor.currentTargetId === enemyId);
}

function probeEngagement(state: GameState, actor: Companion, target: GameEntity | undefined, destination: Position): AttackEngagementProbe {
  if (!state.map) return { reachable: null }; // No map cannot establish hard unreachability.
  const maxPathDistance = state.map.columns * state.map.rows * 2;
  if (target?.kind === "enemy") return probeAttackEngagement(state, actor, target,
    actor.role === "defender" ? 1 : getCompanionAttackRange(actor));
  return { reachable: getBoundedPathDistance(state, actor, destination, maxPathDistance) !== null };
}

function withoutTemporaryBodies(state: GameState, actor: Companion, targetId?: string): GameState {
  return { ...state, entities: Object.fromEntries(Object.entries(state.entities).filter(([id, entity]) =>
    id === actor.id || id === targetId || (entity.kind !== "companion" && entity.kind !== "enemy"))),
    reservedPositionsByEntityId: {}, moveIntentsByEntityId: {}, forcedMovementsByEntityId: {}, enemyDashesByEnemyId: {},
    externalMovementOwnersByEntityId: {}, attackSlotCacheByEntityId: {} };
}

function getProbeKey(state: GameState, actor: Companion, target: GameEntity | undefined, destination: Position): string {
  return JSON.stringify([state.currentMapId, getEntityCollisionShape(actor), actor.role === "defender" ? 1 : getCompanionAttackRange(actor), target?.position ?? destination,
    target && getEntityCollisionShape(target), state.map?.walls, state.map?.collisionWalls, getObstacleGeometry(state, actor.id, target?.id, false)]);
}

function getObstacleGeometry(state: GameState, actorId: string, targetId: string | undefined, includeBodies: boolean) {
  const point = (position: Position) => [Math.round(position.x * 10), Math.round(position.y * 10)];
  return Object.values(state.entities).filter(entity => entity.id !== actorId && entity.id !== targetId && entity.state !== "dead" &&
    (!("health" in entity) || entity.health > 0) && (includeBodies || (entity.kind !== "companion" && entity.kind !== "enemy")) &&
    (entity.kind !== "resource" || (!entity.isDepleted && entity.quantity > 0)))
    .sort((a, b) => a.id.localeCompare(b.id)).map(entity => [entity.id, point(entity.position),
      entity.kind === "structure" ? entity.footprint : getEntityCollisionShape(entity)]);
}

function isApproachSuspended(state: GameState, actorId: string): boolean {
  if (isMovementBlockedByStatus(state, actorId) || state.forcedMovementsByEntityId?.[actorId] || state.externalMovementOwnersByEntityId?.[actorId]) return true;
  const result = state.normalMovementResultsByEntityId?.[actorId];
  return Boolean(result && result.frameNumber === (state.simulationFrame ?? state.simulationTick) && result.timeMs === (state.simulationTimeMs ?? 0) &&
    (result.request.mode === "hold" || result.outcome === "deferred" || result.reason === "constraint" ||
      (result.outcome === "held" && result.reason !== "crowd_wait")));
}

function getLastEngagementProbeAt(state: GameState, actorId: string): number {
  return Math.max(state.targetEngagementProbeAtMsByEntityId?.[actorId] ?? -Infinity,
    state.targetApproachesByEntityId?.[actorId]?.lastProbeAtMs ?? -Infinity,
    ...Object.values(state.rejectedCombatTargetsByEntityId?.[actorId] ?? {}).map(entry => entry.lastProbeAtMs));
}

export function getMovementApproachProgress(state: GameState, result: NormalMovementResult,
  last: Pick<TargetApproachObservation, "waypoint" | "position" | "bestDistance" | "progressCredit"> | undefined) {
  const waypoints = state.movementPathsByEntityId?.[result.request.entityId]?.waypoints ?? [];
  const nextWaypoint = (position: Position) => waypoints.find(point => getEuclideanDistance(position, point) > TARGET_PROGRESS_DISTANCE) ?? result.request.destination;
  const waypoint = last?.waypoint ?? nextWaypoint(result.from);
  const fromDistance = getEuclideanDistance(result.from, waypoint), distance = getEuclideanDistance(result.to, waypoint);
  // Movement between observations may belong to a dash, recovery or rebuild.
  const displaced = Boolean(last?.position && getEuclideanDistance(last.position, result.from) > SPATIAL_EPSILON);
  const baseline = displaced ? fromDistance : last?.bestDistance ?? fromDistance;
  const credit = displaced ? 0 : last?.progressCredit ?? 0;
  const improvement = result.outcome === "moved" ? Math.max(0, baseline - distance) : 0;
  const progressed = improvement + credit >= TARGET_PROGRESS_DISTANCE - SPATIAL_EPSILON;
  const reached = result.outcome === "moved" && distance <= TARGET_PROGRESS_DISTANCE;
  const next = reached ? nextWaypoint(result.to) : waypoint;
  return { progressed, displaced, waypoint: next, bestDistance: reached ? getEuclideanDistance(result.to, next) : progressed ? distance : baseline,
    progressCredit: progressed ? 0 : reached ? credit + improvement : credit };
}

/** Called for the winning result. Inner/outer finishes are idempotent. */
export function observeTargetApproach(state: GameState, result: NormalMovementResult): GameState {
  const actor = state.entities[result.request.entityId];
  if (actor?.kind !== "companion" || hasDirectCompanionAuthority(state, actor) || getPartyExecutionIntent(state)?.source === "player") return state;
  const previous = state.targetApproachesByEntityId?.[actor.id];
  if (previous?.frame === result.frameNumber && previous.timeMs === result.timeMs) return state;
  if (!["attack", "defend", "partyTravel", "explore", "follow"].includes(result.request.source)) return state;
  const current = actor.currentTargetId ? state.entities[actor.currentTargetId] : undefined;
  const intent = getPartyExecutionIntent(state);
  const targetId = result.request.combatSlot?.targetId ?? (current?.kind === "enemy" ? current.id :
    result.request.source === "partyTravel" && intent?.type === "attack" ? intent.targetId ?? undefined : undefined);
  const target = targetId ? state.entities[targetId] : undefined;
  const key = targetId ?? `${result.request.source}:${result.request.pathTargetKey ?? JSON.stringify(result.request.destination)}`;
  const last = previous?.key === key ? previous : undefined;
  const { progressed, displaced, ...progress } = getMovementApproachProgress(state, result, last);
  const paused = isApproachSuspended(state, actor.id) || result.request.mode === "hold" ||
    (result.outcome === "held" && result.reason !== "crowd_wait") || result.outcome === "deferred" || result.reason === "constraint";
  const settled = target && isWithinAttackReach(actor, target, actor.role === "defender" ? 1 : getCompanionAttackRange(actor));
  const delta = paused || settled ? 0 : Math.max(0, state.simulationDeltaMs ?? 100);
  const blockers = result.blockingEnemyIds ?? [];
  const blockerId = last?.blockerId && blockers.includes(last.blockerId) ? last.blockerId : blockers[0];
  let observation: TargetApproachObservation = { key, targetId, frame: result.frameNumber, timeMs: result.timeMs,
    ...progress, position: result.to,
    noProgressMs: progressed || settled ? 0 : (last?.noProgressMs ?? 0) + delta,
    blockerId, blockerMs: progressed || settled || !blockerId ? 0 : (last?.blockerId === blockerId ? last.blockerMs : 0) + delta,
    failedChecks: progressed || settled || displaced ? 0 : last?.failedChecks ?? 0,
    lastProbeAtMs: last?.lastProbeAtMs, hardUnreachable: progressed || settled || displaced ? false : last?.hardUnreachable,
    blockerReachable: !progressed && blockerId === last?.blockerId ? last?.blockerReachable : false,
    probeKey: last?.probeKey, blockerKey: last?.blockerKey, engagementPosition: last?.engagementPosition };
  if (!paused && observation.noProgressMs >= TARGET_OBSTRUCTION_MS &&
    result.timeMs - getLastEngagementProbeAt(state, actor.id) >= TARGET_PROBE_INTERVAL_MS) {
    const dynamic = probeEngagement(state, actor, target, result.request.destination);
    const hard = dynamic.reachable === false ? probeEngagement(withoutTemporaryBodies(state, actor, targetId), actor, target, result.request.destination) : dynamic;
    const blocker = blockerId ? state.entities[blockerId] : undefined;
    const probeKey = getProbeKey(state, actor, target, target?.position ?? result.request.destination);
    observation = { ...observation, lastProbeAtMs: result.timeMs,
      failedChecks: dynamic.reachable === false && hard.reachable !== null ? (last?.probeKey === probeKey ? observation.failedChecks : 0) + 1 : 0,
      hardUnreachable: hard.reachable === false, blockerReachable: dynamic.reachable === false && isAutomaticCombatTarget(state, blocker) &&
        probeEngagement(state, actor, blocker, blocker.position).reachable === true,
      engagementPosition: dynamic.position,
      probeKey, blockerKey: blocker && getProbeKey(state, actor, blocker, blocker.position) };
  }
  return { ...state, targetApproachesByEntityId: { ...state.targetApproachesByEntityId, [actor.id]: observation },
    targetEngagementProbeAtMsByEntityId: observation.lastProbeAtMs === result.timeMs
      ? { ...state.targetEngagementProbeAtMsByEntityId, [actor.id]: result.timeMs } : state.targetEngagementProbeAtMsByEntityId };
}

export function getSustainedBlockerTarget(state: GameState, actor: Companion): Enemy | null {
  const observation = state.targetApproachesByEntityId?.[actor.id];
  const blocker = observation?.blockerId ? state.entities[observation.blockerId] : undefined;
  if (!observation || observation.noProgressMs < TARGET_OBSTRUCTION_MS || observation.blockerMs < TARGET_OBSTRUCTION_MS ||
    observation.failedChecks < 2 || !observation.blockerReachable || observation.frame !== (state.simulationFrame ?? state.simulationTick) ||
    observation.timeMs !== (state.simulationTimeMs ?? 0) || !isAutomaticCombatTarget(state, blocker) ||
    observation.blockerKey !== getProbeKey(state, actor, blocker, blocker.position)) return null;
  // Cached failed probes do not authorize a response after the actor is suspended.
  if (isApproachSuspended(state, actor.id)) return null;
  return canReacquireCombatTarget(state, actor, blocker) ? blocker : null;
}

function getReacquisitionKey(state: GameState, actor: Companion, target: GameEntity): string {
  const point = (position: Position) => [Math.round(position.x * 10), Math.round(position.y * 10)];
  return JSON.stringify([state.currentMapId, point(actor.position), point(target.position), getEntityCollisionShape(actor), getEntityCollisionShape(target),
    state.map?.walls, state.map?.collisionWalls,
    getObstacleGeometry(state, actor.id, target.id, true), getSpecializedMovementReservations(state)
      .filter(entry => entry.entity.id !== actor.id)
      .sort((a, b) => a.entity.id.localeCompare(b.entity.id) || a.position.x - b.position.x || a.position.y - b.position.y)
      .map(entry => [entry.entity.id, point(entry.position), entry.specialized])]);
}

export function canReacquireCombatTarget(state: GameState, actor: Companion, target: Enemy): boolean {
  const rejected = state.rejectedCombatTargetsByEntityId?.[actor.id]?.[target.id];
  if (!rejected) return true;
  return rejected.reachable && rejected.checkedWorldKey === getReacquisitionKey(state, actor, target);
}

export function getTargetReleaseReason(state: GameState, id: string): CompanionTargetReason {
  const target = state.entities[id];
  return !target ? "target_removed" : target.state === "dead" || ("health" in target && target.health <= 0) ? "target_died" :
    isAutonomousTargetSuppressed(state, id) ? "scripted_suppression" : target.kind === "enemy" &&
      target.enemyTypeId === "orc_warmaster" && !isWarmasterAvailable(state) ? "encounter_invalidated" : "leash_failure";
}

/** Lifecycle cleanup removes evidence, without changing commands or publishing movement. */
export function clearTargetCommitmentsForTarget(state: GameState, targetId: string): GameState {
  return { ...state,
    targetCommitmentsByEntityId: Object.fromEntries(Object.entries(state.targetCommitmentsByEntityId ?? {}).filter(([, entry]) => entry.targetId !== targetId)),
    targetApproachesByEntityId: Object.fromEntries(Object.entries(state.targetApproachesByEntityId ?? {}).filter(([, entry]) => entry.targetId !== targetId && entry.blockerId !== targetId)),
    rejectedCombatTargetsByEntityId: Object.fromEntries(Object.entries(state.rejectedCombatTargetsByEntityId ?? {}).flatMap(([id, entries]) => {
      const remaining = Object.fromEntries(Object.entries(entries).filter(([key]) => key !== targetId));
      return Object.keys(remaining).length ? [[id, remaining]] : [];
    })),
  };
}

/** Capture each real transition, including changes made by command/lifecycle systems. */
export function recordCompanionTargetTransition(state: GameState, before: GameEntity | undefined, actor: GameEntity): GameState {
  if (actor.kind !== "companion") return state;
  const combatId = (entity: GameEntity | undefined): string | null => {
    if (entity?.kind !== "companion" || entity.state === "dead" || entity.health <= 0) return null;
    const id = entity.currentTargetId;
    const target = id ? state.entities[id] : undefined;
    return id && (target?.kind === "enemy" || target?.kind === "structure" || state.targetCommitmentsByEntityId?.[actor.id]?.targetId === id ||
      (!target && (entity.state === "attack" || entity.state === "defend"))) ? id : null;
  };
  const previousTargetId = combatId(before), targetId = combatId(actor);
  if (previousTargetId === targetId) return state;
  const accepted = state.companionTargetDecisionByEntityId?.[actor.id];
  const reason = actor.state === "dead" || actor.health <= 0 ? "actor_defeated" :
    accepted?.targetId === targetId && accepted.frame === (state.simulationFrame ?? state.simulationTick) &&
      accepted.timeMs === (state.simulationTimeMs ?? 0) ? accepted.reason :
    hasDirectCompanionAuthority(state, actor) || getPartyExecutionIntent(state)?.source === "player" ? "player_focus" :
      !targetId && previousTargetId ? getTargetReleaseReason(state, previousTargetId) : "shared_target";
  const transition: CompanionTargetTransition = { entityId: actor.id, previousTargetId, targetId, reason,
    frame: state.simulationFrame ?? state.simulationTick, timeMs: state.simulationTimeMs ?? 0 };
  const commitments = { ...state.targetCommitmentsByEntityId };
  if (commitments[actor.id]?.targetId !== targetId) delete commitments[actor.id];
  return appendDebugTelemetryEvent({ ...state, targetCommitmentsByEntityId: commitments,
    companionTargetDecisionByEntityId: { ...state.companionTargetDecisionByEntityId, [actor.id]: transition },
    companionTargetTransitions: [...state.companionTargetTransitions ?? [], transition] }, {
    type: !targetId ? "target_released" : previousTargetId ? "target_changed" : "target_acquired",
    entityId: actor.id, targetId, previousTargetId, targetDecisionReason: reason,
  });
}

export function pruneTargetCommitmentState(state: GameState): GameState {
  const living = (id: string) => state.entities[id]?.kind === "companion" && state.entities[id].state !== "dead";
  const commitments = Object.fromEntries(Object.entries(state.targetCommitmentsByEntityId ?? {}).filter(([id, memory]) =>
    living(id) && memory.targetId === (state.entities[id] as Companion).currentTargetId && isRetainableCombatEnemy(state, state.entities[memory.targetId])));
  const rejections: NonNullable<GameState["rejectedCombatTargetsByEntityId"]> = {};
  const probeTimes = Object.fromEntries(Object.entries(state.targetEngagementProbeAtMsByEntityId ?? {}).filter(([id]) => living(id)));
  for (const [id, entries] of Object.entries(state.rejectedCombatTargetsByEntityId ?? {})) {
    if (!living(id)) continue;
    const remaining = Object.fromEntries(Object.entries(entries).filter(([, rejected]) => isAutomaticCombatTarget(state, state.entities[rejected.targetId])));
    if (!Object.keys(remaining).length) continue;
    rejections[id] = remaining;
    if (isApproachSuspended(state, id) || (state.simulationTimeMs ?? 0) - getLastEngagementProbeAt(state, id) < TARGET_PROBE_INTERVAL_MS) continue;
    const actor = state.entities[id] as Companion;
    // One changed target per actor/probe window, in stable oldest-check order.
    for (const rejected of Object.values(remaining).sort((a, b) => a.lastProbeAtMs - b.lastProbeAtMs || a.targetId.localeCompare(b.targetId))) {
      const target = state.entities[rejected.targetId], key = getReacquisitionKey(state, actor, target);
      if (key === rejected.worldKey || key === rejected.checkedWorldKey) continue;
      remaining[rejected.targetId] = { ...rejected, checkedWorldKey: key, lastProbeAtMs: state.simulationTimeMs ?? 0,
        reachable: probeEngagement(state, actor, target, target.position).reachable === true };
      probeTimes[id] = state.simulationTimeMs ?? 0;
      break;
    }
  }
  return { ...state, targetCommitmentsByEntityId: commitments,
    targetEngagementProbeAtMsByEntityId: probeTimes,
    companionTargetDecisionByEntityId: Object.fromEntries(Object.entries(state.companionTargetDecisionByEntityId ?? {}).filter(([id]) => living(id))),
    targetApproachesByEntityId: Object.fromEntries(Object.entries(state.targetApproachesByEntityId ?? {}).filter(([id, observation]) =>
      living(id) && (!observation.targetId || isRetainableCombatEnemy(state, state.entities[observation.targetId])))),
    rejectedCombatTargetsByEntityId: rejections };
}
