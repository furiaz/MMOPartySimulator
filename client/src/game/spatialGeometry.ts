import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import type { EntityCollisionShape } from "./movementTypes";
import { getEuclideanDistance } from "./positionUtils";
import type { AoeBounds, GameEntity, Position } from "./types";

export const SPATIAL_EPSILON = 0.001;
export const ENTITY_COLLISION_DISTANCE = 0.7;
export const COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER = 0.8;
export const COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER = 1.6;
export const COMPANION_COLLISION_CAPSULE_ANCHOR_Y = 0.3;
const COMPANION_ENEMY_SEPARATION_GRACE = 0.35;

/** Current physical size, never the radius reserved for future enemy growth. */
export function getCombatBodyRadius(entity: GameEntity): number {
  return entity.kind === "enemy"
    ? getEnemyCombatBodyRadius(entity) || ENTITY_COLLISION_DISTANCE
    : 0;
}

export function getEntityCollisionShape(entity: GameEntity): EntityCollisionShape {
  if (entity.kind === "companion") {
    return {
      kind: "verticalCapsule",
      radius: ENTITY_COLLISION_DISTANCE * COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER,
      height: ENTITY_COLLISION_DISTANCE * 2 * COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER,
      anchorY: COMPANION_COLLISION_CAPSULE_ANCHOR_Y,
    };
  }
  return { kind: "circle", radius: entity.kind === "enemy" ? getCombatBodyRadius(entity) : ENTITY_COLLISION_DISTANCE };
}

export function getCollisionBody(entity: GameEntity, position = entity.position) {
  const shape = getEntityCollisionShape(entity);
  return {
    x: position.x,
    top: shape.kind === "verticalCapsule" ? position.y - shape.height * shape.anchorY + shape.radius : position.y,
    bottom: shape.kind === "verticalCapsule" ? position.y + shape.height * (1 - shape.anchorY) - shape.radius : position.y,
    radius: shape.radius,
  };
}

export function isPositionInsideCollisionShape(position: Position, origin: Position, shape: EntityCollisionShape): boolean {
  const top = shape.kind === "verticalCapsule" ? origin.y - shape.height * shape.anchorY + shape.radius : origin.y;
  const bottom = shape.kind === "verticalCapsule" ? origin.y + shape.height * (1 - shape.anchorY) - shape.radius : origin.y;
  return Math.hypot(position.x - origin.x, position.y - Math.max(top, Math.min(position.y, bottom))) < shape.radius;
}

export function isPositionInsideEntityCollisionShape(entity: GameEntity, position: Position, origin = entity.position): boolean {
  if (entity.kind === "structure") {
    const bounds = entity.footprint;
    return position.x > bounds.minX && position.x < bounds.maxX && position.y > bounds.minY && position.y < bounds.maxY;
  }
  return isPositionInsideCollisionShape(position, origin, getEntityCollisionShape(entity));
}

/** Full-body hard-obstacle clearance; separate from soft living-body spacing. */
export function doesCollisionBodyOverlapBounds(entity: GameEntity, position: Position, bounds: AoeBounds, clearance = 0): boolean {
  return doesBodyOverlapBounds(getCollisionBody(entity, position), bounds, clearance);
}

export function doesBodyOverlapBounds(body: ReturnType<typeof getCollisionBody>, bounds: AoeBounds, clearance = 0): boolean {
  const dx = Math.max(bounds.minX - body.x, body.x - bounds.maxX, 0);
  const dy = Math.max(bounds.minY - body.bottom, body.top - bounds.maxY, 0);
  return Math.hypot(dx, dy) < body.radius + clearance - SPATIAL_EPSILON;
}

export function doCollisionBodiesOverlap(first: GameEntity, position: Position, second: GameEntity, otherPosition = second.position, clearance = 0): boolean {
  if (second.kind === "structure") return doesCollisionBodyOverlapBounds(first, position, second.footprint, clearance);
  const a = getCollisionBody(first, position), b = getCollisionBody(second, otherPosition);
  return Math.hypot(a.x - b.x, Math.max(a.top - b.bottom, b.top - a.bottom, 0)) < a.radius + b.radius + clearance - SPATIAL_EPSILON;
}

function getSeparationRadius(entity: GameEntity): number {
  const shape = getEntityCollisionShape(entity);
  return shape.kind === "verticalCapsule" ? Math.max(shape.radius, shape.height / 2) : shape.radius;
}

function getSeparationDistance(first: GameEntity, second: GameEntity): number {
  const sameParty = first.kind === "companion" && second.kind === "companion";
  const companionEnemy = (first.kind === "companion" && second.kind === "enemy") || (first.kind === "enemy" && second.kind === "companion");
  return sameParty ? ENTITY_COLLISION_DISTANCE : Math.max(0,
    getSeparationRadius(first) + getSeparationRadius(second) - (companionEnemy ? COMPANION_ENEMY_SEPARATION_GRACE : 0));
}

/** Preserve soft spacing: party pairs do not sum their capsule radii. */
export function areEntitiesOverlapping(first: GameEntity, second: GameEntity, position = first.position, otherPosition = second.position): boolean {
  return isPositionInsideEntityCollisionShape(first, otherPosition, position) ||
    isPositionInsideEntityCollisionShape(second, position, otherPosition) ||
    getEuclideanDistance(position, otherPosition) < getSeparationDistance(first, second) - SPATIAL_EPSILON;
}

/** Living-body penetration under the same soft overlap rule, for incremental recovery. */
export function getEntityOverlapDepth(first: GameEntity, second: GameEntity, position = first.position): number {
  const a = getCollisionBody(first, position), b = getCollisionBody(second);
  const depthInside = (point: Position, body: typeof a) => body.radius -
    Math.hypot(point.x - body.x, point.y - Math.max(body.top, Math.min(point.y, body.bottom)));
  return Math.max(0,
    depthInside(second.position, a),
    depthInside(position, b),
    getSeparationDistance(first, second) - SPATIAL_EPSILON - getEuclideanDistance(position, second.position));
}

export function getCombatTargetPosition(from: Position, target: GameEntity): Position {
  if (target.kind !== "structure") return target.position;
  return {
    x: Math.max(target.attackBounds.minX, Math.min(from.x, target.attackBounds.maxX)),
    y: Math.max(target.attackBounds.minY, Math.min(from.y, target.attackBounds.maxY)),
  };
}

export function getEffectiveAttackRange(attacker: GameEntity, target: GameEntity, attackReach: number): number {
  return attackReach + getCombatBodyRadius(attacker) + getCombatBodyRadius(target);
}

export function isWithinAttackReach(attacker: GameEntity, target: GameEntity, attackReach: number, position = attacker.position): boolean {
  return getEuclideanDistance(position, getCombatTargetPosition(position, target)) <=
    getEffectiveAttackRange(attacker, target, attackReach) + SPATIAL_EPSILON;
}
