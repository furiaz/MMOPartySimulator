import { getCollisionBody as segment } from "./spatialGeometry";
import { updateEntity, type GameState } from "./state";
import type { GameEntity, Position } from "./types";
import { applyStatusEffect } from "./statusEffects";
import { cancelEnemyAbilityCast } from "./enemyAbilitySystem";
import { cancelEnemyDash } from "./enemyDashSystem";
import { isEnemyMovementPositionAllowed } from "./enemyMovementBounds";
export type ForcedMovement = {
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
const CLEARANCE = 0.05;
/** Full circle/capsule clearance; living bodies may be crossed, never terrain. */
export function isForcedMovementPositionAvailable(state: GameState, entity: GameEntity, position: Position, landing = false): boolean {
  if (entity.kind === "enemy" && !isEnemyMovementPositionAllowed(state, entity, position)) return false;
  const body = segment(entity, position);
  const radius = body.radius + CLEARANCE;
  if (state.map) {
    if (body.x - radius < -0.5 || body.x + radius > state.map.columns - 0.5 || body.top - radius < -0.5 || body.bottom + radius > state.map.rows - 0.5)
      return false;
    for (const wall of [...state.map.walls, ...(state.map.collisionWalls ?? [])]) {
      const dx = Math.max(0, Math.abs(body.x - wall.x) - 0.5);
      const dy = Math.max(0, wall.y - 0.5 - body.bottom, body.top - wall.y - 0.5);
      if (Math.hypot(dx, dy) < radius)
        return false;
    }
  }
  for (const other of Object.values(state.entities)) {
    if (other.id === entity.id || other.state === "dead" || other.kind === "structure")
      continue;
    if (other.kind === "resource" ? other.isDepleted || other.quantity <= 0 : !landing)
      continue;
    const blocker = segment(other, other.position);
    const dy = Math.max(0, body.top - blocker.bottom, blocker.top - body.bottom);
    if (Math.hypot(body.x - blocker.x, dy) < radius + blocker.radius)
      return false;
  }
  if (landing && Object.entries(state.reservedPositionsByEntityId ?? {}).some(([id, reserved]) => id !== entity.id && Math.hypot(reserved.x - position.x, reserved.y - position.y) < radius + 0.7))
    return false;
  if (landing) {
    for (const movement of Object.values(state.forcedMovementsByEntityId ?? {})) {
      const owner = state.entities[movement.targetId];
      if (!owner || owner.id === entity.id || owner.state === "dead") continue;
      const reservedBody = segment(owner, along(movement.origin, movement.direction, movement.distance));
      const dy = Math.max(0, body.top - reservedBody.bottom, reservedBody.top - body.bottom);
      if (Math.hypot(body.x - reservedBody.x, dy) < radius + reservedBody.radius) return false;
    }
    const destinations = [
      ...Object.values(state.enemyAbilityCastsByEnemyId ?? {}).filter(cast => cast.dashPlan).map(cast => ({ id: cast.casterId, position: cast.dashPlan!.destination })),
      ...Object.values(state.enemyDashesByEnemyId ?? {}).map(dash => ({ id: dash.casterId, position: dash.destination })),
    ];
    for (const destination of destinations) {
      const owner = state.entities[destination.id];
      if (!owner || owner.id === entity.id || owner.state === "dead")
        continue;
      const reservedBody = segment(owner, destination.position);
      const dy = Math.max(0, body.top - reservedBody.bottom, reservedBody.top - body.bottom);
      if (Math.hypot(body.x - reservedBody.x, dy) < radius + reservedBody.radius)
        return false;
    }
  }
  return true;
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
    state = cancelEnemyDash(state, targetId, "incapacitated", now);
    // Hand motion off at the impact position, while retaining normal action cancellation.
    state = updateEntity(state, { ...state.entities[targetId], position: { ...target.position } });
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
  return next;
}
export function cancelForcedMovement(state: GameState, targetId: string): GameState {
  const movement = state.forcedMovementsByEntityId?.[targetId];
  if (!movement)
    return state;
  const movements = { ...state.forcedMovementsByEntityId };
  delete movements[targetId];
  const target = state.entities[targetId];
  const next = { ...state, forcedMovementsByEntityId: movements };
  return target && target.state !== "dead" ? updateEntity(next, { ...target, position: { ...movement.lastSafePosition } }) : next;
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
    const target = next.entities[movement.targetId];
    if (!target || target.state === "dead" || !("health" in target) || target.health <= 0) {
      next = cancelForcedMovement(next, movement.targetId);
      continue;
    }
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
    next = updateEntity(next, { ...target, position: safe || (progress < 1 && !blocked) ? position : movement.lastSafePosition });
    movedEntityIds.add(target.id);
    const movements = { ...next.forcedMovementsByEntityId };
    if (progress === 1 || blocked)
      delete movements[target.id];
    else
      movements[target.id] = { ...movement, lastSafePosition: safe ? position : movement.lastSafePosition };
    next = { ...next, forcedMovementsByEntityId: movements };
    if (progress === 1 || blocked)
      next = applyMovementCompletionStatus(next, movement, blocked ? now : movement.endsAt, now);
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
