import { updateEntity, type GameState } from "./state";
import type { GameEntity, Position } from "./types";
import { applyStatusEffect } from "./statusEffects";
import { cancelEnemyAbilityCast } from "./enemyAbilitySystem";
import { cancelEnemyDash } from "./enemyDashSystem";
import { isSpecializedMovementPathAvailable, isSpecializedMovementPositionAvailable } from "./specializedMovementGeometry";
import { commitSpecializedMovementPosition, handoffSpecializedMovement, releaseSpecializedMovement, getMovementPositionCommit } from "./movementAuthority";
import { isWarmasterRewardUiOpen } from "./warmasterLifecycleState";
export type ForcedMovement = {
  pendingFinalization?: true;
  targetId: string;
  sourceId: string;
  origin: Position;
  direction: Position;
  distance: number;
  startedAt: number;
  endsAt: number;
  lastSafePosition: Position;
  completionStatus?: { type: "taunted"; durationMs: number; sourceKey: string };
};
const SAMPLE_DISTANCE = 0.1;
/** Full circle/capsule clearance; living bodies may be crossed, never terrain. */
export function isForcedMovementPositionAvailable(state: GameState, entity: GameEntity, position: Position, landing = false): boolean {
  return isSpecializedMovementPositionAvailable(state, entity, position, { landing });
}
function along(origin: Position, direction: Position, distance: number): Position {
  return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance };
}
export function startForcedMovement(state: GameState, targetId: string, sourceId: string, direction: Position, maximumDistance: number, durationMs: number, now: number, completionStatus?: ForcedMovement["completionStatus"]): GameState {
  const target = state.entities[targetId];
  const length = Math.hypot(direction.x, direction.y);
  if (!target || (target.kind !== "companion" && target.kind !== "enemy") || target.health <= 0 || !Number.isFinite(length) || !length || !Number.isFinite(maximumDistance) || maximumDistance <= 0 || !Number.isFinite(durationMs) || durationMs <= 0)
    return state;
  const unit = { x: direction.x / length, y: direction.y / length };
  let distance = 0;
  for (let step = 1;step <= Math.ceil(maximumDistance / SAMPLE_DISTANCE);step++) {
    const candidate = Math.min(maximumDistance, step * SAMPLE_DISTANCE);
    if (!isForcedMovementPositionAvailable(state, target, along(target.position, unit, candidate)))
      break;
    distance = candidate;
  }
  while (distance > 0 && !isForcedMovementPositionAvailable(state, target, along(target.position, unit, distance), true))
    distance = Math.max(0, distance - SAMPLE_DISTANCE);
  if (distance < 0.001)
    return applyMovementCompletionStatus(state, { targetId, sourceId, completionStatus }, now, now);
  const movement: ForcedMovement = {
    targetId,
    sourceId,
    origin: { ...target.position },
    direction: unit,
    distance,
    startedAt: now,
    endsAt: now + durationMs * distance / maximumDistance,
    lastSafePosition: { ...target.position },
    completionStatus,
  };
  if (target.kind === "enemy") {
    state = cancelEnemyAbilityCast(state, targetId, "incapacitated", now);
    state = cancelEnemyDash(state, targetId, "incapacitated", now, { handoff: true });
  }
  const next = {
    ...state,
    forcedMovementsByEntityId: { ...state.forcedMovementsByEntityId, [targetId]: movement },
    companionAoeChannelsByCasterId: { ...state.companionAoeChannelsByCasterId },
    enemyAbilityCastsByEnemyId: { ...state.enemyAbilityCastsByEnemyId },
    enemyDashesByEnemyId: { ...state.enemyDashesByEnemyId },
    enemyAoeChannelsByCasterId: { ...state.enemyAoeChannelsByCasterId },
    consumableUsesByCompanionId: { ...state.consumableUsesByCompanionId },
    resurrectionChannelsByHelperId: { ...state.resurrectionChannelsByHelperId }
  };
  delete next.companionAoeChannelsByCasterId[targetId];
  delete next.enemyAbilityCastsByEnemyId[targetId];
  delete next.enemyDashesByEnemyId[targetId];
  delete next.enemyAoeChannelsByCasterId[targetId];
  delete next.consumableUsesByCompanionId[targetId];
  delete next.resurrectionChannelsByHelperId[targetId];
  return handoffSpecializedMovement(next, targetId, "forcedMovement", `forced:${targetId}:${now}`).state;
}
export function cancelForcedMovement(state: GameState, targetId: string, options: { handoff?: boolean } = {}): GameState {
  const movement = state.forcedMovementsByEntityId?.[targetId];
  if (!movement)
    return state;
  if (options.handoff) return removeForcedMovement(state, targetId);
  const target = state.entities[targetId];
  if (!target || target.state === "dead" || !("health" in target) || target.health <= 0) return removeForcedMovement(state, targetId);
  const canceled = { ...movement, pendingFinalization: true as const, completionStatus: undefined };
  let next: GameState = { ...state, forcedMovementsByEntityId: { ...state.forcedMovementsByEntityId, [targetId]: canceled } };
  let distance = Math.max(0, (movement.lastSafePosition.x - movement.origin.x) * movement.direction.x +
    (movement.lastSafePosition.y - movement.origin.y) * movement.direction.y);
  while (!isForcedMovementPositionAvailable(next, target, along(movement.origin, movement.direction, distance), true)) {
    if (distance <= 0) return next;
    distance = Math.max(0, distance - SAMPLE_DISTANCE);
  }
  const position = along(movement.origin, movement.direction, distance);
  if (target.position.x === position.x && target.position.y === position.y) return removeForcedMovement(next, targetId);
  if (!isSpecializedMovementPathAvailable(next, target, target.position, position)) return next;
  const result = commitSpecializedMovementPosition(next, targetId, position, "forcedMovement", `forced:${targetId}:${movement.startedAt}`);
  next = result.state;
  return result.outcome === "moved" || result.outcome === "held" ? removeForcedMovement(next, targetId) : next;
}

function removeForcedMovement(state: GameState, targetId: string): GameState {
  const movement = state.forcedMovementsByEntityId?.[targetId];
  const movements = { ...state.forcedMovementsByEntityId };
  delete movements[targetId];
  return releaseSpecializedMovement({ ...state, forcedMovementsByEntityId: movements }, targetId, `forced:${targetId}:${movement?.startedAt}`).state;
}
export function clearForcedMovements(state: GameState, sourceId?: string): GameState {
  for (const movement of Object.values(state.forcedMovementsByEntityId ?? {})) {
    if (!sourceId || movement.sourceId === sourceId)
      state = cancelForcedMovement(state, movement.targetId);
  }
  return state;
}
export function updateForcedMovements(state: GameState, movedEntityIds: Set<string>, now: number): GameState {
  let next = state;
  for (const movement of Object.values(state.forcedMovementsByEntityId ?? {})) {
    if (isWarmasterRewardUiOpen(next)) break;
    const target = next.entities[movement.targetId];
    if (!target || target.state === "dead" || !("health" in target) || target.health <= 0) {
      next = cancelForcedMovement(next, movement.targetId);
      continue;
    }
    if (movement.pendingFinalization) {
      next = cancelForcedMovement(next, movement.targetId);
      if (getMovementPositionCommit(next, movement.targetId)?.source === "forcedMovement") movedEntityIds.add(movement.targetId);
      continue;
    }
    if (getMovementPositionCommit(next, target.id)) continue;
    const progress = Math.max(0, Math.min(1, (now - movement.startedAt) / Math.max(1, movement.endsAt - movement.startedAt)));
    let distance = movement.distance * progress;
    // Sweep the intervening path even when simulation advances by a large delta.
    const previousDistance = Math.max(0, (target.position.x - movement.origin.x) * movement.direction.x + (target.position.y - movement.origin.y) * movement.direction.y);
    let blocked = false;
    const sweepSteps = Math.ceil((distance - previousDistance) / SAMPLE_DISTANCE);
    for (let step = 1;step <= sweepSteps;step++) {
      const d = Math.min(distance, previousDistance + step * SAMPLE_DISTANCE);
      if (!isForcedMovementPositionAvailable(next, target, along(movement.origin, movement.direction, d))) {
        distance = Math.max(previousDistance, d - SAMPLE_DISTANCE);
        blocked = true;
        break;
      }
    }
    if (progress === 1 || blocked) {
      while (distance > 0 && !isForcedMovementPositionAvailable(next, target, along(movement.origin, movement.direction, distance), true))
        distance = Math.max(0, distance - SAMPLE_DISTANCE);
    }
    const position = along(movement.origin, movement.direction, distance);
    const safe = isForcedMovementPositionAvailable(next, target, position, true);
    const destination = safe || (progress < 1 && !blocked) ? position : movement.lastSafePosition;
    if ((progress === 1 || blocked) && !isForcedMovementPositionAvailable(next, target, destination, true)) {
      next = cancelForcedMovement(next, target.id);
      continue;
    }
    if (distance < previousDistance && !isSpecializedMovementPathAvailable(next, target, target.position, destination)) {
      next = cancelForcedMovement(next, target.id);
      continue;
    }
    const result = commitSpecializedMovementPosition(next, target.id, destination, "forcedMovement", `forced:${target.id}:${movement.startedAt}`);
    next = result.state;
    if (isWarmasterRewardUiOpen(next)) return cancelForcedMovement(next, target.id);
    if (result.outcome !== "moved" && result.outcome !== "held") continue;
    if (result.outcome === "moved") movedEntityIds.add(target.id);
    const movements = { ...next.forcedMovementsByEntityId };
    if (progress === 1 || blocked)
      delete movements[target.id];
    else
      movements[target.id] = { ...movement, lastSafePosition: safe ? position : movement.lastSafePosition };
    next = { ...next, forcedMovementsByEntityId: movements };
    if (progress === 1 || blocked) {
      next = releaseSpecializedMovement(next, target.id, `forced:${target.id}:${movement.startedAt}`).state;
      next = applyMovementCompletionStatus(next, movement, blocked ? now : movement.endsAt, now);
    }
  }
  return next;
}

function applyMovementCompletionStatus(state: GameState, movement: Pick<ForcedMovement, "sourceId" | "targetId" | "completionStatus">, finishedAt: number, now: number): GameState {
  const status = movement.completionStatus;
  const source = state.entities[movement.sourceId];
  const target = state.entities[movement.targetId];
  if (!status || !source || source.state === "dead" || !("health" in source) || source.health <= 0 ||
      !target || target.state === "dead" || status.durationMs + finishedAt <= now) return state;
  let next = applyStatusEffect(state, { ...status, targetId: movement.targetId, sourceId: movement.sourceId }, finishedAt);
  if (target.kind === "enemy") next = updateEntity(next, { ...target, state: "attack", currentTargetId: source.id });
  return next;
}
