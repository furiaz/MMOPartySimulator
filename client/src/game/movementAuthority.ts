import { getPartyExecutionIntent } from "./partyIntentState";
import { getPartyLeader } from "./partySystem";
import type { GameState } from "./state";
import type { GameEntity, Position } from "./types";
import type { MovementOptions, NormalMovementOutcome, NormalMovementRequest, NormalMovementSource } from "./movementTypes";

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
  return Boolean(leader && leader.state !== "dead" && leader.commandPriority !== "direct" &&
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
    combatSlot: options.combatSlot,
    allowPartyPassThrough: options.allowPartyPassThrough, speedMultiplier: options.speedMultiplier };
}

export function getNormalMovementResult(state: GameState, entityId: string) {
  const result = state.normalMovementResultsByEntityId?.[entityId];
  return result && result.frameNumber === (state.simulationFrame ?? state.simulationTick ?? 0) &&
    result.timeMs === (state.simulationTimeMs ?? 0) ? result : undefined;
}

export function getMovementRequestRejection(state: GameState, request: NormalMovementRequest): NormalMovementOutcome | undefined {
  const actor = state.entities[request.entityId];
  if (!Number.isFinite(request.destination.x) || !Number.isFinite(request.destination.y) ||
    !Number.isFinite(request.acceptableRadius) || request.acceptableRadius < 0) return "invalid";
  if (!actor || actor.state === "dead" || ("health" in actor && actor.health <= 0)) return "invalid";
  if (getNormalMovementResult(state, actor.id) || state.externalMovementOwnersByEntityId?.[actor.id] ||
    state.forcedMovementsByEntityId?.[actor.id] || state.enemyDashesByEnemyId?.[actor.id]) return "deferred";
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
  from: Position, to = from, reason: string = outcome,
): GameState {
  return { ...state, normalMovementResultsByEntityId: { ...state.normalMovementResultsByEntityId,
    [request.entityId]: { request, outcome, reason, from, to, positionCommitCount: outcome === "moved" ? 1 : 0,
      frameNumber: state.simulationFrame ?? state.simulationTick ?? 0, timeMs: state.simulationTimeMs ?? 0 } } };
}

/** Frame-scoped handoff for #734; transaction timing remains owned by specialized producers. */
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
  const previous = state.entities[entity.id];
  const changed = previous && (previous.position.x !== entity.position.x || previous.position.y !== entity.position.y);
  const trail = state.followTrailsByEntityId[entity.id] ?? [];
  return { ...state, entities: { ...state.entities, [entity.id]: entity },
    followTrailsByEntityId: changed ? { ...state.followTrailsByEntityId,
      [entity.id]: [previous.position, ...trail.filter(position => position.x !== previous.position.x || position.y !== previous.position.y)].slice(0, 12),
    } : state.followTrailsByEntityId };
}
