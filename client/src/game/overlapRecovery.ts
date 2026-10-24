import { canBePassivelyDisplaced, isCrowdActor, stableSeparationDirection } from "./localAvoidance";
import { commitSpecializedMovementPosition, getMovementPositionCommit, getSpecializedMovementOwner } from "./movementAuthority";
import { getEnemyMovementBodyRadius } from "./enemyMovementBounds";
import { getSpecializedMovementReservations } from "./specializedMovementGeometry";
import { areEntitiesOverlapping, getCollisionBody, getEntityCollisionShape, getEntityOverlapDepth, SPATIAL_EPSILON } from "./spatialGeometry";
import { isMovementBlockedByStatus } from "./statusEffects";
import { isWarmasterRewardUiOpen } from "./warmasterLifecycleState";
import { getActiveQuestGuide } from "./questGuideSystem";
import { isPositionInActiveResurrectionArea } from "./resurrectionSystem";
import type { GameState } from "./state";
import type { AoeBounds, GameEntity, Position } from "./types";

const RECOVERY_SPEED = 1.2;
const MAX_RECOVERY_STEP = 0.12;
const CLEARANCE = 0.05;

export function getRecoveryBodyKey(actor: GameEntity): string {
  return JSON.stringify([getEntityCollisionShape(actor), actor.kind === "enemy" ? [actor.minimumMovementBodyRadius, actor.movementBounds] : null]);
}

function isHardObstacle(actor: GameEntity): boolean {
  return actor.state !== "dead" && (actor.kind === "structure" ? actor.health > 0 :
    actor.kind === "resource" && !actor.isDepleted && actor.quantity > 0);
}

/** Penetrations are keyed, so improvement cannot hide a newly introduced overlap. */
function getPenetrations(state: GameState, actor: GameEntity, position: Position): Map<string, number> {
  const result = new Map<string, number>();
  const add = (key: string, depth: number) => { if (depth > SPATIAL_EPSILON) result.set(key, depth); };
  const body = getCollisionBody(actor, position);
  const radius = Math.max(body.radius, actor.kind === "enemy" ? getEnemyMovementBodyRadius(actor) : 0) + CLEARANCE;
  const boundsDepth = (bounds: AoeBounds) => {
    const dx = Math.max(bounds.minX - body.x, body.x - bounds.maxX, 0);
    const dy = Math.max(bounds.minY - body.bottom, body.top - bounds.maxY, 0);
    // Inside a rectangle, include distance to the nearest exit. Otherwise a
    // small correction inside a wide footprint would appear not to improve.
    const interior = dx === 0 && dy === 0 ? Math.max(0, Math.min(body.x - bounds.minX, bounds.maxX - body.x,
      body.bottom - bounds.minY, bounds.maxY - body.top)) : 0;
    return radius - Math.hypot(dx, dy) + interior;
  };
  const addEnclosure = (key: string, bounds: AoeBounds) => {
    add(`${key}:left`, bounds.minX - (body.x - radius)); add(`${key}:right`, body.x + radius - bounds.maxX);
    add(`${key}:top`, bounds.minY - (body.top - radius)); add(`${key}:bottom`, body.bottom + radius - bounds.maxY);
  };
  if (state.map) {
    addEnclosure("map", { minX: -0.5, maxX: state.map.columns - 0.5, minY: -0.5, maxY: state.map.rows - 0.5 });
    for (const wall of [...state.map.walls, ...(state.map.collisionWalls ?? [])])
      add(`wall:${wall.x}:${wall.y}`, boundsDepth({ minX: wall.x - 0.5, maxX: wall.x + 0.5, minY: wall.y - 0.5, maxY: wall.y + 0.5 }));
  }
  if (actor.kind === "enemy" && actor.movementBounds) addEnclosure("encounter", actor.movementBounds);
  for (const other of Object.values(state.entities).sort((a, b) => a.id.localeCompare(b.id))) {
    if (other.id === actor.id) continue;
    if (isHardObstacle(other)) {
      if (other.kind === "structure") add(other.id, boundsDepth(other.footprint));
      else {
        const obstacle = getCollisionBody(other);
        add(other.id, radius + obstacle.radius - Math.hypot(body.x - obstacle.x, Math.max(body.top - obstacle.bottom, obstacle.top - body.bottom, 0)));
      }
    } else if (isCrowdActor(other)) {
      // Active escort rally/holds deliberately share the guide's space through
      // the existing party-transit contract. They are not invalid placements.
      if (other.kind === "npc" && other.npcRole === "quest_guide" && actor.kind === "companion" &&
        actor.commandPriority !== "direct" && actor.state !== "attack" && actor.state !== "gather" &&
        !state.resurrectionChannelsByHelperId?.[actor.id] && getActiveQuestGuide(state)?.id === other.id) continue;
      add(other.id, getEntityOverlapDepth(actor, other, position));
    }
  }
  return result;
}

function total(penetrations: Map<string, number>): number { return [...penetrations.values()].reduce((sum, value) => sum + value, 0); }

function needsRecovery(state: GameState, actor: GameEntity, penetrations: Map<string, number>): boolean {
  // Leadership removes peer pressure, not the follower's collision envelope.
  return [...penetrations.keys()].some(key => actor.id !== state.partyLeaderId || state.entities[key]?.kind !== "companion");
}

function geometryKey(state: GameState): string {
  return JSON.stringify([state.currentMapId, state.map?.walls, state.map?.collisionWalls,
    Object.values(state.entities).filter(isHardObstacle).sort((a, b) => a.id.localeCompare(b.id))
      .map(actor => [actor.id, actor.position, actor.kind === "structure" ? actor.footprint : null])]);
}

/** Observe lifecycle changes before normal locomotion, not every ordinary contact. */
export function updateOverlapRecoverySystem(state: GameState, movedEntityIds = new Set<string>()): GameState {
  if (isWarmasterRewardUiOpen(state)) return state;
  const actors = Object.values(state.entities).filter(isCrowdActor).sort((a, b) => a.id.localeCompare(b.id));
  const previous = state.overlapRecoveryByEntityId ?? {};
  const changed = new Set(actors.filter(actor => {
    const entry = previous[actor.id];
    return !entry || entry.bodyKey !== getRecoveryBodyKey(actor) ||
      Math.hypot(entry.position.x - actor.position.x, entry.position.y - actor.position.y) > SPATIAL_EPSILON;
  }).map(actor => actor.id));
  const worldKey = geometryKey(state);
  const worldChanged = state.overlapRecoveryGeometryKey !== worldKey;
  const observations: NonNullable<GameState["overlapRecoveryByEntityId"]> = {};
  for (const actor of actors) {
    const sourceChanged = changed.has(actor.id) || actors.some(other => changed.has(other.id) &&
      other.id !== actor.id && areEntitiesOverlapping(actor, other));
    const depths = canBePassivelyDisplaced(actor) && (previous[actor.id]?.pending || sourceChanged || worldChanged)
      ? getPenetrations(state, actor, actor.position) : new Map<string, number>();
    const hardChange = worldChanged && [...depths.keys()].some(key => !state.entities[key] || isHardObstacle(state.entities[key]));
    const pending = canBePassivelyDisplaced(actor) && (previous[actor.id]?.pending || sourceChanged || hardChange) && needsRecovery(state, actor, depths);
    observations[actor.id] = { position: { ...actor.position }, bodyKey: getRecoveryBodyKey(actor), pending: Boolean(pending) };
  }
  let next: GameState = { ...state, overlapRecoveryByEntityId: observations, overlapRecoveryGeometryKey: worldKey };
  // Stable order plus live reservations makes simultaneous recoveries reproducible.
  for (const original of actors) {
    const actor = next.entities[original.id];
    if (!next.overlapRecoveryByEntityId?.[actor.id]?.pending || movedEntityIds.has(actor.id) ||
      getMovementPositionCommit(next, actor.id) || isMovementBlockedByStatus(next, actor.id)) continue;
    const owner = getSpecializedMovementOwner(next, actor.id);
    if (owner && owner.source !== "overlapRecovery") continue;
    if (actors.some(other => other.id !== actor.id && areEntitiesOverlapping(actor, other) &&
      (movedEntityIds.has(other.id) || getMovementPositionCommit(next, other.id) || next.moveIntentsByEntityId?.[other.id]))) continue;
    const start = getPenetrations(next, actor, actor.position);
    if (!needsRecovery(next, actor, start)) {
      next = { ...next, overlapRecoveryByEntityId: { ...next.overlapRecoveryByEntityId,
        [actor.id]: { ...next.overlapRecoveryByEntityId![actor.id], pending: false } } };
      continue;
    }
    const step = Math.min(MAX_RECOVERY_STEP, RECOVERY_SPEED * Math.max(0, next.simulationDeltaMs ?? 100) / 1000);
    let influence = { x: 0, y: 0 };
    for (const originalOther of actors) {
      const other = next.entities[originalOther.id];
      if (actor.id === next.partyLeaderId && other.kind === "companion") continue;
      const depth = start.get(other.id) ?? 0;
      if (!depth) continue;
      const dx = actor.position.x - other.position.x, dy = actor.position.y - other.position.y, length = Math.hypot(dx, dy);
      const direction = length > SPATIAL_EPSILON ? { x: dx / length, y: dy / length } : stableSeparationDirection(actor.id, other.id);
      influence = { x: influence.x + direction.x * depth, y: influence.y + direction.y * depth };
    }
    const angle = Math.hypot(influence.x, influence.y) > SPATIAL_EPSILON ? Math.atan2(influence.y, influence.x) :
      Math.atan2(stableSeparationDirection(actor.id, "recovery").y, stableSeparationDirection(actor.id, "recovery").x);
    const reservations = getSpecializedMovementReservations(next);
    const reservedDepth = (other: GameEntity, origin: Position, position: Position) => {
      const a = getCollisionBody(actor, position), b = getCollisionBody(other, origin);
      return Math.max(0, a.radius + b.radius + CLEARANCE - Math.hypot(a.x - b.x, Math.max(a.top - b.bottom, b.top - a.bottom, 0)));
    };
    const candidates = Array.from({ length: 17 }, (_, index) => {
      const a = index === 0 ? angle : (index - 1) * Math.PI / 8;
      return { x: actor.position.x + Math.cos(a) * step, y: actor.position.y + Math.sin(a) * step };
    }).filter(position => {
      if (next.resurrectionChannelsByHelperId?.[actor.id] && isPositionInActiveResurrectionArea(next, actor.position) &&
        !isPositionInActiveResurrectionArea(next, position)) return false;
      // Validate intermediate samples too; no tunneling through a new obstacle.
      for (const fraction of [0.5, 1]) {
        const sample = { x: actor.position.x + (position.x - actor.position.x) * fraction,
          y: actor.position.y + (position.y - actor.position.y) * fraction };
        const depths = getPenetrations(next, actor, sample);
        if ([...depths].some(([key, depth]) => depth > (start.get(key) ?? 0) + SPATIAL_EPSILON)) return false;
        if (reservations.some(item => {
          if (item.entity.id === actor.id) return false;
          if (item.specialized) return reservedDepth(item.entity, item.position, sample) > reservedDepth(item.entity, item.position, actor.position) + SPATIAL_EPSILON;
          const reservedActor = { ...item.entity, position: item.position };
          return getEntityOverlapDepth(actor, reservedActor, sample) > getEntityOverlapDepth(actor, reservedActor) + SPATIAL_EPSILON;
        })) return false;
        if (Object.entries(next.reservedPositionsByEntityId ?? {}).some(([id, point]) => id !== actor.id && !next.entities[id] &&
          Math.hypot(point.x - sample.x, point.y - sample.y) <= SPATIAL_EPSILON)) return false;
      }
      return total(getPenetrations(next, actor, position)) < total(start) - SPATIAL_EPSILON;
    }).sort((a, b) => total(getPenetrations(next, actor, a)) - total(getPenetrations(next, actor, b)));
    if (!candidates[0]) continue;
    const result = commitSpecializedMovementPosition(next, actor.id, candidates[0], "overlapRecovery", `recovery:${actor.id}`);
    next = result.state;
    if (isWarmasterRewardUiOpen(next)) return next;
    if (result.outcome === "moved") {
      movedEntityIds.add(actor.id);
      next = { ...next, movementDecisionsByEntityId: { ...next.movementDecisionsByEntityId, [actor.id]: "overlap_recovery" },
        overlapRecoveryByEntityId: { ...next.overlapRecoveryByEntityId,
          [actor.id]: { position: { ...candidates[0] }, bodyKey: getRecoveryBodyKey(actor),
            pending: needsRecovery(next, next.entities[actor.id], getPenetrations(next, next.entities[actor.id], candidates[0])) } } };
    }
  }
  return next;
}
