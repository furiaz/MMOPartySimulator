import { canFollowDirectLeader, hasDirectCompanionAuthority } from "./directCommandState";
import { getPartyExecutionIntent } from "./partyIntentState";
import { getPartyLeader } from "./partySystem";
import type { GameState } from "./state";
import type { GameEntity, Position } from "./types";
import type { MovementOptions, NormalMovementOutcome, NormalMovementRequest, NormalMovementSource } from "./movementTypes";
import type { ExternalMovementOwner, MovementAuthorityResult } from "./movementTypes";
import { guardWarmasterWalkingDeparture, isWarmasterRewardUiOpen } from "./warmasterLifecycleState";
import { isPlayerInteractionDefense, observeTargetApproach } from "./targetCommitment";

// Explicit source ties, independent of producer submission/iteration order.
const SOURCE_ORDER: NormalMovementSource[] = [
  "direct", "resurrection", "teleport", "partyTravel", "defend", "attack", "gather",
  "follow", "questGuide", "enemyFlee", "enemyHome", "enemyQuest", "enemyRoam", "explore", "compatibility",
];

function requiredSource(state: GameState, actor: GameEntity): NormalMovementSource | undefined {
  if (actor.kind === "companion") {
    // Active teleport execution suspends direct commands; their producer does not
    // run again until the transition finishes (and clears map-local commands).
    if (state.activeTeleport && !state.resurrectionChannelsByHelperId?.[actor.id]) return "teleport";
    const command = state.directCompanionCommandsById?.[actor.id];
    if (command) return command.type === "move" ? "direct"
      : command.type === "attack" || actor.state === "attack" ? "attack" : "gather";
    if (state.resurrectionChannelsByHelperId?.[actor.id]) return actor.state === "attack" ? "attack" : "resurrection";
    if (state.activeTeleport) return "teleport";
    if (canFollowDirectLeader(state, actor)) return "follow";
    if (isPlayerInteractionDefense(state, actor)) return "attack";
    const intent = getPartyExecutionIntent(state);
    if (intent?.source === "player" && actor.commandPriority !== "direct") {
      if (intent.type === "attack" && actor.state === "attack" && actor.currentTargetId === intent.targetId) return "attack";
      if (intent.type === "gather" && actor.state === "gather" && actor.currentTargetId === intent.targetId &&
        !(actor.id === state.partyLeaderId && state.partyFormation?.phase === "traveling")) return "gather";
      if (canProducePartyTravel(state)) return "partyTravel";
    }
    if (actor.state === "attack") return "attack";
    if (actor.state === "defend" && state.partyFormation?.phase !== "traveling") return "defend";
    if (canProducePartyTravel(state) && state.partyFormation?.phase === "traveling" && getPartyExecutionIntent(state) &&
      (actor.id === state.partyLeaderId || actor.state === "follow")) return "partyTravel";
    if (actor.state === "gather") return "gather";
  }
  if (actor.kind === "enemy" && (state.slimewardDungeon?.azureMass?.fleeUntilMs ?? 0) >
    (state.simulationTimeMs ?? 0) && actor.enemyTypeId === "azure_mass") return "enemyFlee";
  if (actor.kind === "enemy" && actor.state === "attack" && actor.currentTargetId) return "attack";
  return undefined;
}

function canProducePartyTravel(state: GameState): boolean {
  const leader = getPartyLeader(state);
  return Boolean(leader && leader.state !== "dead" && !hasDirectCompanionAuthority(state, leader) &&
    !state.resurrectionChannelsByHelperId?.[leader.id]);
}

/** Collect competing producers until the next existing movement consumer. */
export function beginNormalMovementPhase(state: GameState): GameState {
  return state.normalMovementPhase ? state : { ...state, normalMovementPhase: { submissions: [] } };
}

export function createNormalMovementRequest(
  state: GameState, actor: GameEntity, destination: Position, options: MovementOptions = {},
  mode: NormalMovementRequest["mode"] = "walk",
): NormalMovementRequest {
  const source = options.source ?? requiredSource(state, actor) ?? "compatibility";
  const priority = actor.kind === "companion" && (state.directCompanionCommandsById?.[actor.id] || actor.commandPriority === "direct") ? 100
    : actor.kind === "companion" && getPartyExecutionIntent(state)?.source === "player" ? 80
    : source === "resurrection" || source === "teleport" || source === "enemyFlee" ? 70
    : source === "follow" || source === "explore" ? 20 : 40;
  return { entityId: actor.id, source, priority, reason: options.sourceReason ?? source, mode,
    destination: { ...destination }, acceptableRadius: options.acceptableRadius ?? 0,
    pathProfile: options.pathProfile, pathTargetKey: options.pathTargetKey, pathTargetPosition: options.pathTargetPosition,
    combatSlot: options.combatSlot, travelFormationGoal: options.travelFormationGoal, combatFormationGoal: options.combatFormationGoal,
    ...(options.isFormationStaging || options.combatFormationGoal ? { isFormationStaging: true } : {}),
    allowPartyPassThrough: options.allowPartyPassThrough, speedMultiplier: options.speedMultiplier };
}

export function getNormalMovementResult(state: GameState, entityId: string) {
  const result = state.normalMovementResultsByEntityId?.[entityId];
  return result && result.frameNumber === (state.simulationFrame ?? state.simulationTick ?? 0) &&
    result.timeMs === (state.simulationTimeMs ?? 0) ? result : undefined;
}

export function getMovementRequestRejection(state: GameState, request: NormalMovementRequest): NormalMovementOutcome | undefined {
  if (isWarmasterRewardUiOpen(state)) return "deferred";
  const actor = state.entities[request.entityId];
  if (!Number.isFinite(request.destination.x) || !Number.isFinite(request.destination.y) ||
    !Number.isFinite(request.acceptableRadius) || request.acceptableRadius < 0) return "invalid";
  if (!actor || actor.state === "dead" || ("health" in actor && actor.health <= 0)) return "invalid";
  if (getNormalMovementResult(state, actor.id) || getMovementPositionCommit(state, actor.id) ||
    getSpecializedMovementOwner(state, actor.id)) return "deferred";
  const required = requiredSource(state, actor);
  return required && required !== request.source ? "deferred" : undefined;
}

/** Select before planning: a later eligible owner cannot lose to an early lower source. */
export function selectNormalMovementRequest(state: GameState, requests: NormalMovementRequest[]): NormalMovementRequest | undefined {
  return requests.filter(request => !getMovementRequestRejection(state, request)).sort((a, b) =>
    b.priority - a.priority || SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) ||
    a.entityId.localeCompare(b.entityId) || a.reason.localeCompare(b.reason) ||
    a.destination.x - b.destination.x || a.destination.y - b.destination.y ||
    JSON.stringify(a).localeCompare(JSON.stringify(b)))[0];
}

export function finishNormalMovement(
  state: GameState, request: NormalMovementRequest, outcome: NormalMovementOutcome,
  from: Position, to = from, reason: string = outcome, blockingEnemyIds?: string[],
): GameState {
  const result = { request, outcome, reason, from, to, blockingEnemyIds: blockingEnemyIds ?? getNormalMovementResult(state, request.entityId)?.blockingEnemyIds,
    positionCommitCount: outcome === "moved" ? 1 : 0,
    frameNumber: state.simulationFrame ?? state.simulationTick ?? 0, timeMs: state.simulationTimeMs ?? 0 };
  if (request.travelFormationGoal && state.formationAssignments?.travel) {
    const assignments = state.formationAssignments, travel = assignments.travel!;
    state = { ...state, formationAssignments: { ...assignments, travel: { ...travel,
      goalsByEntityId: { ...travel.goalsByEntityId, [request.entityId]: request.travelFormationGoal },
    } } };
  }
  if (request.combatFormationGoal && state.formationAssignments?.combat) {
    const assignments = state.formationAssignments, combat = assignments.combat!;
    state = { ...state, formationAssignments: { ...assignments, combat: { ...combat,
      goalsByEntityId: { ...combat.goalsByEntityId, [request.entityId]: request.combatFormationGoal },
    } } };
  }
  return observeTargetApproach({ ...state, normalMovementResultsByEntityId: { ...state.normalMovementResultsByEntityId,
    [request.entityId]: result } }, result);
}

export function getMovementPositionCommit(state: GameState, entityId: string) {
  const commit = state.movementPositionCommitsByEntityId?.[entityId];
  return commit && commit.frameNumber === (state.simulationFrame ?? state.simulationTick ?? 0) &&
    commit.timeMs === (state.simulationTimeMs ?? 0) ? commit : undefined;
}

/** Runtime remains with its producer; even pre-phase consumers see its ownership. */
export function getSpecializedMovementOwner(state: GameState, entityId: string): ExternalMovementOwner | undefined {
  const actor = state.entities[entityId];
  if (!actor || actor.state === "dead" || ("health" in actor && actor.health <= 0)) return undefined;
  const forced = state.forcedMovementsByEntityId?.[entityId];
  if (forced) return { source: "forcedMovement", transactionId: `forced:${entityId}:${forced.startedAt}`, positionCommitted: false };
  const dash = state.enemyDashesByEnemyId?.[entityId];
  if (dash) return { source: "enemyDash", transactionId: dash.id, positionCommitted: false };
  if (state.warmasterResetPending === entityId)
    return { source: "encounterReset", transactionId: `reset:${entityId}`, positionCommitted: false };
  if (state.overlapRecoveryByEntityId?.[entityId]?.pending)
    return { source: "overlapRecovery", transactionId: `recovery:${entityId}`, positionCommitted: false };
  const frameOwner = state.externalMovementOwnersByEntityId?.[entityId];
  return frameOwner?.released ? undefined : frameOwner;
}

export function acquireSpecializedMovement(state: GameState, entityId: string, source: string, transactionId: string): MovementAuthorityResult {
  const actor = state.entities[entityId];
  if (!actor || actor.state === "dead" || ("health" in actor && actor.health <= 0)) return { state, outcome: "invalid" };
  const owner = getSpecializedMovementOwner(state, entityId);
  if (getMovementPositionCommit(state, entityId) || getNormalMovementResult(state, entityId)?.outcome === "moved" || owner?.positionCommitted ||
    (owner && (owner.source !== source || (owner.transactionId ?? owner.source) !== transactionId)))
    return { state, outcome: "deferred" };
  return { state: { ...state, externalMovementOwnersByEntityId: { ...state.externalMovementOwnersByEntityId,
    [entityId]: { source, transactionId, positionCommitted: false } } }, outcome: "acquired" };
}

/** Change the active transaction without refunding this update's position budget. */
export function handoffSpecializedMovement(state: GameState, entityId: string, source: string, transactionId: string): MovementAuthorityResult {
  const actor = state.entities[entityId];
  if (!actor || actor.state === "dead" || ("health" in actor && actor.health <= 0)) return { state, outcome: "invalid" };
  return { state: { ...state, externalMovementOwnersByEntityId: { ...state.externalMovementOwnersByEntityId,
    [entityId]: { source, transactionId, positionCommitted: Boolean(getMovementPositionCommit(state, entityId)) } } }, outcome: "acquired" };
}

export function releaseSpecializedMovement(state: GameState, entityId: string, transactionId: string): MovementAuthorityResult {
  const owner = state.externalMovementOwnersByEntityId?.[entityId];
  if ((owner && owner.transactionId !== transactionId) || state.forcedMovementsByEntityId?.[entityId] ||
    state.enemyDashesByEnemyId?.[entityId] || state.warmasterResetPending === entityId) return { state, outcome: "deferred" };
  if (!owner) return { state, outcome: "released" };
  const owners = { ...state.externalMovementOwnersByEntityId };
  if (owner.positionCommitted) owners[entityId] = { ...owner, released: true };
  else delete owners[entityId];
  return { state: { ...state, externalMovementOwnersByEntityId: owners }, outcome: "released" };
}

/** Compatibility handoff; callers must still use the guarded position publisher. */
export function claimExternalMovement(state: GameState, entityId: string, source: string, positionCommitted = false): GameState {
  if (!state.entities[entityId] || state.entities[entityId].state === "dead") return state;
  const currentOwner = state.externalMovementOwnersByEntityId?.[entityId];
  if (getNormalMovementResult(state, entityId) || (currentOwner &&
    (currentOwner.source !== source || currentOwner.positionCommitted || !positionCommitted))) return state;
  return { ...state, externalMovementOwnersByEntityId: { ...state.externalMovementOwnersByEntityId,
    [entityId]: { source, positionCommitted } } };
}

export function releaseExternalMovement(state: GameState, entityId: string): GameState {
  const owner = state.externalMovementOwnersByEntityId?.[entityId];
  // Releasing a transaction must not permit a second position commit in this frame.
  if (!owner || owner.positionCommitted) return state;
  const owners = { ...state.externalMovementOwnersByEntityId };
  delete owners[entityId];
  return { ...state, externalMovementOwnersByEntityId: owners };
}

/** The sole normal-locomotion position publication point (also used for both swap legs). */
export function commitNormalMovementPosition(state: GameState, entity: GameEntity): GameState {
  if (getMovementPositionCommit(state, entity.id) || getSpecializedMovementOwner(state, entity.id)) return state;
  return publishMovementPosition(state, entity.id, entity.position, "normal", "normal");
}

/** Specialized producers validate their own sweep/landing before calling this boundary. */
export function commitSpecializedMovementPosition(
  state: GameState, entityId: string, position: Position, source: string, transactionId: string,
): MovementAuthorityResult {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return { state, outcome: "invalid" };
  const acquisition = acquireSpecializedMovement(state, entityId, source, transactionId);
  if (acquisition.outcome !== "acquired") return acquisition;
  const actor = state.entities[entityId];
  if (actor.position.x === position.x && actor.position.y === position.y) return { state: acquisition.state, outcome: "held" };
  if (isWarmasterRewardUiOpen(state)) return { state, outcome: "deferred" };
  const guarded = guardWarmasterWalkingDeparture(acquisition.state, actor, position);
  if (guarded && isWarmasterRewardUiOpen(guarded)) return { state: guarded, outcome: "deferred" };
  const next = publishMovementPosition(guarded ?? acquisition.state, entityId, position, source, transactionId);
  return { state: { ...next, externalMovementOwnersByEntityId: { ...next.externalMovementOwnersByEntityId,
    [entityId]: { source, transactionId, positionCommitted: true } } }, outcome: "moved" };
}

/** Only this function publishes locomotion coordinates and the shared commit evidence. */
function publishMovementPosition(state: GameState, entityId: string, position: Position, source: string, transactionId: string): GameState {
  const entity = state.entities[entityId];
  if (!entity || getMovementPositionCommit(state, entityId)) return state;
  const previous = state.entities[entity.id];
  const changed = previous.position.x !== position.x || previous.position.y !== position.y;
  if (!changed) return state;
  const trail = state.followTrailsByEntityId[entity.id] ?? [];
  const withoutActor = <T,>(record: Record<string, T> | undefined) => Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => id !== entityId));
  return { ...state, entities: { ...state.entities, [entity.id]: { ...entity, position: { ...position } } },
    overlapRecoveryByEntityId: state.overlapRecoveryByEntityId?.[entityId] ? { ...state.overlapRecoveryByEntityId,
      [entityId]: { ...state.overlapRecoveryByEntityId[entityId], position: { ...position } } } : state.overlapRecoveryByEntityId,
    movementPositionCommitsByEntityId: { ...state.movementPositionCommitsByEntityId,
      [entityId]: { source, transactionId, from: { ...previous.position }, to: { ...position },
        frameNumber: state.simulationFrame ?? state.simulationTick ?? 0, timeMs: state.simulationTimeMs ?? 0 } },
    lastPositionsByEntityId: { ...state.lastPositionsByEntityId, [entityId]: previous.position },
    reservedPositionsByEntityId: { ...state.reservedPositionsByEntityId, [entityId]: { ...position } },
    ...(source === "normal" ? {} : {
      localAvoidanceByEntityId: withoutActor(state.localAvoidanceByEntityId),
      movementPathsByEntityId: withoutActor(state.movementPathsByEntityId),
      attackSlotCacheByEntityId: withoutActor(state.attackSlotCacheByEntityId),
      movementPathRetryAtMsByEntityId: withoutActor(state.movementPathRetryAtMsByEntityId),
      movementFailureMsByEntityId: withoutActor(state.movementFailureMsByEntityId),
      failedMoveByEntityId: withoutActor(state.failedMoveByEntityId),
      movementFailuresByEntityId: withoutActor(state.movementFailuresByEntityId),
      moveIntentsByEntityId: { ...state.moveIntentsByEntityId, [entityId]: { ...position } },
      movementDecisionsByEntityId: withoutActor(state.movementDecisionsByEntityId),
    }),
    followTrailsByEntityId: changed ? { ...state.followTrailsByEntityId,
      [entity.id]: [previous.position, ...trail.filter(position => position.x !== previous.position.x || position.y !== previous.position.y)].slice(0, 12),
    } : state.followTrailsByEntityId };
}
