import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import { getSpecializedMovementReservations, isSpecializedMovementPathAvailable } from "./specializedMovementGeometry";
import { areEntitiesOverlapping, doCollisionBodiesOverlap, getCollisionBody, getEntityOverlapDepth, SPATIAL_EPSILON } from "./spatialGeometry";
import type { GameState } from "./state";
import type { GameEntity, Position } from "./types";
import type { LocalAvoidanceMemory, NormalMovementRequest } from "./movementTypes";

const INFLUENCE_MARGIN = 0.3;
const MEMORY_EXPIRY_MS = 750;
const SWEEP_STEP = 0.1;

export function isCrowdActor(entity: GameEntity): boolean {
  return entity.state !== "dead" && (entity.kind === "companion" || entity.kind === "enemy" || entity.kind === "npc");
}

/** Passive recovery eligibility is separate from steering an actor's own request. */
export function canBePassivelyDisplaced(entity: GameEntity): boolean {
  return entity.kind === "companion" || (entity.kind === "enemy" && getEnemyCombatBodyRadius(entity) <= 0);
}

export function stableSeparationDirection(actorId: string, otherId: string): Position {
  const [first, second] = [actorId, otherId].sort();
  const hash = [...`${first}:${second}`].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const angle = hash % 8 * Math.PI / 4;
  const sign = actorId === first ? 1 : -1;
  return { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
}

function unit(vector: Position): Position {
  const length = Math.hypot(vector.x, vector.y);
  return length > SPATIAL_EPSILON ? { x: vector.x / length, y: vector.y / length } : { x: 0, y: 0 };
}

function distance(a: Position, b: Position): number { return Math.hypot(a.x - b.x, a.y - b.y); }

export type LocalAvoidanceResult = {
  blockingEnemyIds?: string[];
  position: Position | null;
  crowded: boolean;
  memory?: LocalAvoidanceMemory;
};

/** Pure candidate selection: never writes a peer, path, reservation or failure. */
export function planLocalAvoidance(
  state: GameState, actor: GameEntity, request: NormalMovementRequest, preferred: Position,
  stepDistance: number,
  options: {
    canUse: (position: Position) => boolean;
    ignoresBody: (other: GameEntity) => boolean;
    canTransit: (other: GameEntity) => boolean;
    isSettlingPosition?: (position: Position) => boolean;
  },
): LocalAvoidanceResult {
  const body = getCollisionBody(actor);
  const neighbors = Object.values(state.entities).filter(other => {
    if (other.id === actor.id || !isCrowdActor(other) || options.ignoresBody(other)) return false;
    const otherBody = getCollisionBody(other);
    return distance(actor.position, other.position) <= stepDistance + body.radius + otherBody.radius +
      Math.abs(body.bottom - actor.position.y) + Math.abs(otherBody.bottom - other.position.y) + 1;
  }).sort((a, b) => a.id.localeCompare(b.id));
  const reservations = getSpecializedMovementReservations(state).filter(item => item.entity.id !== actor.id);
  // Ordinary reservations retain scoped party transit; specialized landings do not.
  const reserved = reservations.filter(item => item.specialized || !options.canTransit(item.entity));
  const reservationOverlaps = (position: Position, item: typeof reserved[number]) => item.specialized
    ? doCollisionBodiesOverlap(actor, position, item.entity, item.position, 0.05)
    : areEntitiesOverlapping(actor, item.entity, position, item.position);
  if (neighbors.length === 0 && reservations.length === 0) return { position: preferred, crowded: false };

  const settling = distance(actor.position, request.destination) <= stepDistance + Math.max(0.25, request.acceptableRadius) + SPATIAL_EPSILON;
  const needsStandingClearance = (position: Position) => settling || Boolean(options.isSettlingPosition?.(position));
  const standingPartyReservations = reservations.filter(item => !item.specialized && options.canTransit(item.entity) &&
    actor.kind === "companion" && item.entity.kind === "companion");
  const occupiedGoal = neighbors.some(other => areEntitiesOverlapping(actor, other, request.destination));
  const startsOverlapped = neighbors.some(other => areEntitiesOverlapping(actor, other));
  const bodyClear = (position: Position, endpoint = false) => neighbors.every(other => {
    if (options.canTransit(other)) {
      if (!endpoint || !needsStandingClearance(position)) return true;
      // Following deliberately shares escort-guide space, but must not finish
      // a scoped party transit inside another companion's soft body.
      if (options.isSettlingPosition && other.kind !== "companion") return true;
      return !areEntitiesOverlapping(actor, other, position);
    }
    const depth = getEntityOverlapDepth(actor, other, position);
    return !areEntitiesOverlapping(actor, other, position) || (areEntitiesOverlapping(actor, other) &&
      depth < getEntityOverlapDepth(actor, other) - SPATIAL_EPSILON);
  });
  const candidateClear = (position: Position, steered: boolean) => {
    if (!bodyClear(position, true) || (needsStandingClearance(position) &&
      standingPartyReservations.some(item => reservationOverlaps(position, item)))) return false;
    // An occupied destination is not an obstacle to orbit forever. Approach a
    // stable legal substitute, then wait for the requested space to clear.
    if (occupiedGoal && !startsOverlapped && distance(position, request.destination) >= distance(actor.position, request.destination) - 0.01) return false;
    const steps = Math.max(1, Math.ceil(distance(actor.position, position) / SWEEP_STEP));
    for (let index = 1; index <= steps; index++) {
      const sample = { x: actor.position.x + (position.x - actor.position.x) * index / steps,
        y: actor.position.y + (position.y - actor.position.y) * index / steps };
      if (!bodyClear(sample) || reserved.some(item => reservationOverlaps(sample, item))) return false;
    }
    // Original traversal keeps its existing navigation contract. Newly steered
    // steps additionally require swept full-body hard clearance.
    return (!steered || isSpecializedMovementPathAvailable(state, actor, actor.position, position)) && options.canUse(position);
  };

  const forward = unit({ x: preferred.x - actor.position.x, y: preferred.y - actor.position.y });
  const lookAhead = { x: preferred.x + forward.x * INFLUENCE_MARGIN, y: preferred.y + forward.y * INFLUENCE_MARGIN };
  let pressure = { x: 0, y: 0 };
  for (const other of neighbors) {
    if (actor.id === state.partyLeaderId && other.kind === "companion") continue;
    if (!areEntitiesOverlapping(actor, other, lookAhead) && !areEntitiesOverlapping(actor, other, preferred)) continue;
    const direction = distance(actor.position, other.position) > SPATIAL_EPSILON
      ? unit({ x: actor.position.x - other.position.x, y: actor.position.y - other.position.y })
      : stableSeparationDirection(actor.id, other.id);
    const weight = Math.max(0.05, getEntityOverlapDepth(actor, other, lookAhead));
    pressure = { x: pressure.x + direction.x * weight, y: pressure.y + direction.y * weight };
  }
  const physicallyBlocked = !bodyClear(preferred, true) || reserved.some(item => reservationOverlaps(preferred, item)) ||
    (needsStandingClearance(preferred) && standingPartyReservations.some(item => reservationOverlaps(preferred, item)));
  if (!physicallyBlocked && Math.hypot(pressure.x, pressure.y) < 0.03) return { position: preferred, crowded: false };
  const preferredClear = candidateClear(preferred, false);
  // Enemies/NPCs keep a clear requested route without anticipatory yielding,
  // but can steer around blockers just like companions. This never moves peers.
  if (preferredClear && (actor.kind !== "companion" || Math.hypot(pressure.x, pressure.y) < 0.03))
    return { position: preferred, crowded: false };

  const now = state.simulationTimeMs ?? 0;
  const requestKey = `${request.source}:${request.pathTargetKey ?? ""}`;
  const previous = state.localAvoidanceByEntityId?.[actor.id];
  const remembered = previous?.requestKey === requestKey && distance(previous.destination, request.destination) <= 1 &&
    now - previous.lastActiveAtMs <= MEMORY_EXPIRY_MS ? previous : undefined;
  const side = remembered?.side ?? (actor.id.localeCompare(neighbors[0]?.id ?? actor.id) <= 0 ? 1 : -1);
  pressure = unit(pressure);
  const desired = unit({ x: forward.x + pressure.x * 0.55, y: forward.y + pressure.y * 0.55 });
  const alpha = 1 - Math.exp(-Math.max(0, state.simulationDeltaMs ?? 100) / 160);
  const smoothed = remembered ? unit({ x: remembered.direction.x + (desired.x - remembered.direction.x) * alpha,
    y: remembered.direction.y + (desired.y - remembered.direction.y) * alpha }) : desired;
  const length = Math.min(stepDistance, distance(actor.position, preferred));
  const candidate = (direction: Position) => ({ x: actor.position.x + direction.x * length, y: actor.position.y + direction.y * length });
  const candidates = [candidate(smoothed), preferred];
  for (const angle of [0.4, 0.8, 1.2, Math.PI / 2, -0.4, -0.8, -1.2, -Math.PI / 2]) {
    const a = angle * side;
    candidates.push(candidate({ x: forward.x * Math.cos(a) - forward.y * Math.sin(a),
      y: forward.x * Math.sin(a) + forward.y * Math.cos(a) }));
  }
  // Stable candidate order is the tie breaker. Do not reverse a working detour
  // merely because a new neighbor became a little closer this update.
  const available = (position: Position) => candidateClear(position, distance(position, preferred) > SPATIAL_EPSILON);
  const keepsSide = (position: Position) => {
    const direction = unit({ x: position.x - actor.position.x, y: position.y - actor.position.y });
    return forward.x * direction.x + forward.y * direction.y >= -SPATIAL_EPSILON &&
      (!remembered || (forward.x * direction.y - forward.y * direction.x) * side >= -0.05);
  };
  const selected = candidates.find(position => keepsSide(position) && available(position)) ?? candidates.find(available);
  const blockingEnemyIds = neighbors.filter(other => other.kind === "enemy" &&
    (areEntitiesOverlapping(actor, other, preferred) || areEntitiesOverlapping(actor, other, lookAhead))).map(other => other.id);
  if (!selected) return { position: null, crowded: true, memory: remembered, blockingEnemyIds };
  const direction = unit({ x: selected.x - actor.position.x, y: selected.y - actor.position.y });
  const cross = forward.x * direction.y - forward.y * direction.x;
  return { position: selected, crowded: true, blockingEnemyIds, memory: { requestKey, destination: { ...request.destination }, direction,
    side: Math.abs(cross) > 0.05 ? Math.sign(cross) : side, lastActiveAtMs: now } };
}
