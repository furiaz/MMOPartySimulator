import { getEnemyMovementBodyRadius, isEnemyMovementPositionAllowed, isInsideEnemyMovementBounds } from "./enemyMovementBounds";
import { doCollisionBodiesOverlap, doesBodyOverlapBounds, getCollisionBody } from "./spatialGeometry";
import type { GameState } from "./state";
import type { GameEntity, Position } from "./types";

const CLEARANCE = 0.05;
const SWEEP_SAMPLE_DISTANCE = 0.1;

/** Corrections may cross living bodies, but must not skip new hard obstacles. */
export function isSpecializedMovementPathAvailable(state: GameState, actor: GameEntity, from: Position, to: Position): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (!Number.isFinite(distance)) return false;
  const steps = Math.max(1, Math.ceil(distance / SWEEP_SAMPLE_DISTANCE));
  for (let step = 0; step <= steps; step++) {
    if (!isSpecializedMovementPositionAvailable(state, actor, {
      x: from.x + (to.x - from.x) * step / steps,
      y: from.y + (to.y - from.y) * step / steps,
    })) return false;
  }
  return true;
}

/** Shared endpoints, not permanent blockers along the entire swept corridor. */
export function getSpecializedMovementReservations(state: GameState): Array<{ entity: GameEntity; position: Position }> {
  const points: Array<[string, Position]> = [
    ...Object.entries(state.reservedPositionsByEntityId ?? {}),
    ...Object.entries(state.moveIntentsByEntityId ?? {}),
    ...Object.values(state.enemyAbilityCastsByEnemyId ?? {}).flatMap(cast => cast.dashPlan ? [[cast.casterId, cast.dashPlan.destination] as [string, Position]] : []),
    ...Object.values(state.enemyDashesByEnemyId ?? {}).map(dash => [dash.casterId, dash.pendingFinalization ? dash.lastSafePosition : dash.destination] as [string, Position]),
    ...Object.values(state.forcedMovementsByEntityId ?? {}).map(move => [move.targetId, move.pendingFinalization ? move.lastSafePosition : {
      x: move.origin.x + move.direction.x * move.distance, y: move.origin.y + move.direction.y * move.distance,
    }] as [string, Position]),
  ];
  return points.flatMap(([id, position]) => {
    const entity = state.entities[id];
    return entity && entity.state !== "dead" ? [{ entity, position }] : [];
  });
}

/** Full bodies against hard terrain; living-body traversal remains source-specific. */
export function isSpecializedMovementPositionAvailable(
  state: GameState, actor: GameEntity, position: Position,
  options: { landing?: boolean; ignoredEntityIds?: string[] } = {},
): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  if (actor.kind === "enemy" && !isEnemyMovementPositionAllowed(state, actor, position)) return false;
  const body = getCollisionBody(actor, position);
  const terrainBody = actor.kind === "enemy" ? { ...body, radius: Math.max(body.radius, getEnemyMovementBodyRadius(actor)) } : body;
  const radius = terrainBody.radius + CLEARANCE;
  if (actor.kind === "enemy" && !isInsideEnemyMovementBounds(actor, position, radius)) return false;
  if (state.map) {
    if (body.x - radius < -0.5 || body.x + radius > state.map.columns - 0.5 ||
      body.top - radius < -0.5 || body.bottom + radius > state.map.rows - 0.5) return false;
    if ([...state.map.walls, ...(state.map.collisionWalls ?? [])].some(wall => doesBodyOverlapBounds(terrainBody,
      { minX: wall.x - 0.5, maxX: wall.x + 0.5, minY: wall.y - 0.5, maxY: wall.y + 0.5 }, CLEARANCE))) return false;
  }
  const ignored = new Set([actor.id, ...(options.ignoredEntityIds ?? [])]);
  for (const other of Object.values(state.entities)) {
    if (ignored.has(other.id) || other.state === "dead") continue;
    if (other.kind === "resource" && (other.isDepleted || other.quantity <= 0)) continue;
    if (other.kind === "structure" && other.health <= 0) continue;
    if (other.kind !== "resource" && other.kind !== "structure" && !options.landing) continue;
    if (other.kind === "structure") {
      if (doesBodyOverlapBounds(terrainBody, other.footprint, CLEARANCE)) return false;
    } else if (other.kind === "resource") {
      const obstacle = getCollisionBody(other);
      if (Math.hypot(terrainBody.x - obstacle.x, Math.max(terrainBody.top - obstacle.bottom, obstacle.top - terrainBody.bottom, 0)) < radius + obstacle.radius) return false;
    } else if (doCollisionBodiesOverlap(actor, position, other, other.position, CLEARANCE)) return false;
  }
  return !options.landing || !getSpecializedMovementReservations(state).some(reserved =>
    !ignored.has(reserved.entity.id) && doCollisionBodiesOverlap(actor, position, reserved.entity, reserved.position, CLEARANCE));
}
