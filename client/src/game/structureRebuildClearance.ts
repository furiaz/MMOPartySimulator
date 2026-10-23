import { getEnemyMovementBodyRadius, isEnemyMovementPositionAllowed } from "./enemyMovementBounds";
import { getCollisionBody as body, getEntityCollisionShape } from "./spatialGeometry";
import type { GameState } from "./state";
import type { AoeBounds, GameEntity, Position } from "./types";

const CLEARANCE = 0.05;
const PERIMETER_STEP = 0.25;
const SWEEP_STEP = 0.1;

function isSolid(entity: GameEntity) {
  return entity.state !== "dead" && !(entity.kind === "resource" && (entity.isDepleted || entity.quantity <= 0));
}
export function doesEntityOverlapFootprint(entity: GameEntity, bounds: AoeBounds, position = entity.position): boolean {
  if (!isSolid(entity)) return false;
  if (entity.kind === "structure") return entity.health > 0 && entity.footprint.minX < bounds.maxX && entity.footprint.maxX > bounds.minX &&
    entity.footprint.minY < bounds.maxY && entity.footprint.maxY > bounds.minY;
  const a = body(entity, position);
  const dx = Math.max(bounds.minX - a.x, a.x - bounds.maxX, 0);
  const dy = Math.max(bounds.minY - a.bottom, a.top - bounds.maxY, 0);
  return dx * dx + dy * dy <= (a.radius + CLEARANCE) ** 2;
}
function bodiesOverlap(first: GameEntity, position: Position, second: GameEntity, otherPosition = second.position) {
  if (second.kind === "structure") return doesEntityOverlapFootprint(first, second.footprint, position);
  const a = body(first, position), b = body(second, otherPosition);
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
  return (a.x - b.x) ** 2 + dy ** 2 < (a.radius + b.radius + CLEARANCE) ** 2;
}
function reservations(state: GameState): Array<{ entity: GameEntity; position: Position }> {
  const points: Array<[string, Position]> = [
    ...Object.entries(state.reservedPositionsByEntityId ?? {}), ...Object.entries(state.moveIntentsByEntityId ?? {}),
    ...Object.values(state.enemyAbilityCastsByEnemyId ?? {}).filter(cast => cast.dashPlan).map(cast => [cast.casterId, cast.dashPlan!.destination] as [string, Position]),
    ...Object.values(state.enemyDashesByEnemyId ?? {}).map(dash => [dash.casterId, dash.destination] as [string, Position]),
    ...Object.values(state.forcedMovementsByEntityId ?? {}).map(move => [move.targetId, { x: move.origin.x + move.direction.x * move.distance,
      y: move.origin.y + move.direction.y * move.distance }] as [string, Position]),
  ];
  return points
    .flatMap(([id, position]) => state.entities[id] && isSolid(state.entities[id]) ? [{ entity: state.entities[id], position }] : []);
}
function motionCrossesFootprint(state: GameState, bounds: AoeBounds): boolean {
  const motions = [
    ...Object.values(state.enemyAbilityCastsByEnemyId ?? {}).filter(cast => cast.dashPlan).map(cast => ({ id: cast.casterId, from: cast.origin, to: cast.dashPlan!.destination })),
    ...Object.values(state.enemyDashesByEnemyId ?? {}).map(dash => ({ id: dash.casterId, from: state.entities[dash.casterId]?.position ?? dash.origin, to: dash.destination })),
    ...Object.values(state.forcedMovementsByEntityId ?? {}).map(move => ({ id: move.targetId, from: state.entities[move.targetId]?.position ?? move.origin,
      to: { x: move.origin.x + move.direction.x * move.distance, y: move.origin.y + move.direction.y * move.distance } })),
  ];
  return motions.some(motion => {
    const entity = state.entities[motion.id];
    if (!entity || !isSolid(entity)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(motion.to.x - motion.from.x, motion.to.y - motion.from.y) / SWEEP_STEP));
    for (let index = 0; index <= steps; index++) {
      if (doesEntityOverlapFootprint(entity, bounds, { x: motion.from.x + (motion.to.x - motion.from.x) * index / steps,
        y: motion.from.y + (motion.to.y - motion.from.y) * index / steps })) return true;
    }
    return false;
  });
}
export function isStructureFootprintOccupied(state: GameState, structureId: string, bounds: AoeBounds): boolean {
  return Object.values(state.entities).some(entity => entity.id !== structureId && doesEntityOverlapFootprint(entity, bounds)) ||
    reservations(state).some(item => item.entity.id !== structureId && doesEntityOverlapFootprint(item.entity, bounds, item.position)) ||
    motionCrossesFootprint(state, bounds);
}
function terrainClear(state: GameState, actor: GameEntity, position: Position): boolean {
  if (!state.map || (actor.kind === "enemy" && !isEnemyMovementPositionAllowed(state, actor, position))) return false;
  const a = body(actor, position), r = a.radius + CLEARANCE;
  if (a.x - r < -0.5 || a.x + r > state.map.columns - 0.5 || a.top - r < -0.5 || a.bottom + r > state.map.rows - 0.5) return false;
  for (const wall of [...state.map.walls, ...(state.map.collisionWalls ?? [])]) {
    const dx = Math.max(Math.abs(a.x - wall.x) - 0.5, 0), dy = Math.max(wall.y - 0.5 - a.bottom, a.top - wall.y - 0.5, 0);
    if (dx * dx + dy * dy < r * r) return false;
  }
  return !Object.values(state.entities).some(entity => entity.id !== actor.id && isSolid(entity) &&
    (entity.kind === "resource" || entity.kind === "structure") && bodiesOverlap(actor, position, entity));
}
function perimeterCandidates(actor: GameEntity, bounds: AoeBounds): Position[] {
  const a = body(actor), shape = getEntityCollisionShape(actor);
  const topOffset = shape.kind === "verticalCapsule" ? -shape.height * shape.anchorY : -a.radius;
  const bottomOffset = shape.kind === "verticalCapsule" ? shape.height * (1 - shape.anchorY) : a.radius;
  const left = bounds.minX - a.radius - CLEARANCE - 0.001, right = bounds.maxX + a.radius + CLEARANCE + 0.001;
  const top = bounds.minY - bottomOffset - CLEARANCE - 0.001, bottom = bounds.maxY - topOffset + CLEARANCE + 0.001;
  const points = new Map<string, Position>();
  const add = (x: number, y: number) => points.set(`${x.toFixed(5)},${y.toFixed(5)}`, { x, y });
  add(left, Math.max(top, Math.min(actor.position.y, bottom))); add(right, Math.max(top, Math.min(actor.position.y, bottom)));
  add(Math.max(left, Math.min(actor.position.x, right)), top); add(Math.max(left, Math.min(actor.position.x, right)), bottom);
  for (let x = left; x <= right; x += PERIMETER_STEP) { add(x, top); add(x, bottom); }
  for (let y = top; y <= bottom; y += PERIMETER_STEP) { add(left, y); add(right, y); }
  return [...points.values()].sort((a, b) =>
    Math.hypot(a.x - actor.position.x, a.y - actor.position.y) - Math.hypot(b.x - actor.position.x, b.y - actor.position.y) || a.x - b.x || a.y - b.y);
}
/** Pure, bounded and all-or-nothing. Separation never invokes combat knockback. */
export function planStructureRebuildClearance(state: GameState, structureId: string, bounds: AoeBounds): Map<string, Position> | null {
  if (motionCrossesFootprint(state, bounds)) return null;
  const blockers = Object.values(state.entities).filter(entity => entity.id !== structureId && doesEntityOverlapFootprint(entity, bounds)).sort((a, b) => a.id.localeCompare(b.id));
  if (blockers.some(entity => entity.kind !== "companion" && entity.kind !== "enemy")) return null;
  const blockerIds = new Set(blockers.map(entity => entity.id)), reserved = reservations(state);
  if (reserved.some(item => !blockerIds.has(item.entity.id) && item.entity.id !== structureId && doesEntityOverlapFootprint(item.entity, bounds, item.position))) return null;
  const corrections = new Map<string, Position>(), entities = { ...state.entities };
  for (const actor of blockers) {
    const scratch = { ...state, entities };
    // A bounded growing enemy needs space for its reserved maximum body after the wall returns.
    const clearanceBody = actor.kind === "enemy" && actor.minimumMovementBodyRadius
      ? { ...actor, combatBodyRadius: getEnemyMovementBodyRadius(actor), combatSizeMultiplier: 1 } : actor;
    const destination = perimeterCandidates(clearanceBody, bounds).find(candidate => {
      if (doesEntityOverlapFootprint(clearanceBody, bounds, candidate) || !terrainClear(scratch, actor, candidate)) return false;
      if (Object.values(entities).some(other => other.id !== actor.id && isSolid(other) && bodiesOverlap(actor, candidate, other))) return false;
      if (reserved.some(item => item.entity.id !== actor.id && !corrections.has(item.entity.id) && bodiesOverlap(actor, candidate, item.entity, item.position))) return false;
      const steps = Math.max(1, Math.ceil(Math.hypot(candidate.x - actor.position.x, candidate.y - actor.position.y) / SWEEP_STEP));
      for (let index = 0; index <= steps; index++) {
        if (!terrainClear(scratch, actor, { x: actor.position.x + (candidate.x - actor.position.x) * index / steps,
          y: actor.position.y + (candidate.y - actor.position.y) * index / steps })) return false;
      }
      return true;
    });
    if (!destination) return null;
    corrections.set(actor.id, destination);
    entities[actor.id] = { ...actor, position: destination };
  }
  return corrections;
}
