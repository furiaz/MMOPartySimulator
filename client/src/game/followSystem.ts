import {
  getFollowTrailPosition,
  getEntityById,
  isActiveResourcePosition,
  isWallPosition,
  moveEntityTowardIfUnoccupied,
  moveEntityTowardPositionIfUnoccupied,
  type GameState,
} from "./state";
import { isAutonomousEntity } from "./entities";
import type { AutonomousEntity, Companion, GameEntity, Player, Position } from "./types";

export const FOLLOW_LEASH_RADIUS = 2;
const DOUBLE_SPEED_DISTANCE = 10;
const FOLLOW_TRAIL_SPACING = 1;

export function updateFollowSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isFollowingAutonomousEntity(entity)) {
      continue;
    }

    if (!entity.currentTargetId) {
      continue;
    }

    const target = getEntityById(nextState, entity.currentTargetId);

    if (!target) {
      continue;
    }

    if (movedEntityIds.has(entity.id)) {
      continue;
    }

    const trailPosition = getTrailFollowPosition(nextState, entity);

    if (trailPosition) {
      if (
        trailPosition.x === entity.position.x &&
        trailPosition.y === entity.position.y
      ) {
        continue;
      }

      nextState = moveFollowingEntityTowardPosition(
        nextState,
        entity,
        trailPosition,
      );
      movedEntityIds.add(entity.id);
      continue;
    }

    if (isWithinFollowLeash(nextState, entity, target)) {
      continue;
    }

    nextState = moveFollowingEntityTowardTarget(nextState, entity, target);
    movedEntityIds.add(entity.id);
  }

  return nextState;
}

function isFollowingAutonomousEntity(
  entity: GameEntity,
): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "follow";
}

function moveFollowingEntityTowardPosition(
  state: GameState,
  entity: AutonomousEntity,
  targetPosition: Position,
): GameState {
  let nextState = state;
  const stepCount = getFollowStepCountToPosition(state, entity, targetPosition);

  for (let step = 0; step < stepCount; step += 1) {
    const currentEntity = getEntityById(nextState, entity.id);

    if (!currentEntity || !isFollowingAutonomousEntity(currentEntity)) {
      break;
    }

    if (
      currentEntity.position.x === targetPosition.x &&
      currentEntity.position.y === targetPosition.y
    ) {
      break;
    }

    const previousPosition = currentEntity.position;

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      currentEntity,
      targetPosition,
    );

    const movedEntity = getEntityById(nextState, entity.id);

    if (
      !movedEntity ||
      (movedEntity.position.x === previousPosition.x &&
        movedEntity.position.y === previousPosition.y)
    ) {
      break;
    }
  }

  return nextState;
}

function moveFollowingEntityTowardTarget(
  state: GameState,
  entity: AutonomousEntity,
  target: GameEntity,
): GameState {
  let nextState = state;
  const stepCount = getFollowStepCount(state, entity, target);

  for (let step = 0; step < stepCount; step += 1) {
    const currentEntity = getEntityById(nextState, entity.id);

    if (!currentEntity || !isFollowingAutonomousEntity(currentEntity)) {
      break;
    }

    if (isWithinFollowLeash(nextState, currentEntity, target)) {
      break;
    }

    const previousPosition = currentEntity.position;

    nextState = moveEntityTowardIfUnoccupied(nextState, currentEntity, target);

    const movedEntity = getEntityById(nextState, entity.id);

    if (
      !movedEntity ||
      (movedEntity.position.x === previousPosition.x &&
        movedEntity.position.y === previousPosition.y)
    ) {
      break;
    }
  }

  return nextState;
}

function getTrailFollowPosition(
  state: GameState,
  entity: AutonomousEntity,
): Position | null {
  if (entity.kind !== "companion") {
    return null;
  }

  const trailLeader = getTrailLeader(state, entity);

  if (!trailLeader) {
    return null;
  }

  return getFollowTrailPosition(
    state,
    trailLeader.id,
    FOLLOW_TRAIL_SPACING - 1,
  );
}

function getTrailLeader(
  state: GameState,
  companion: Companion,
): Player | Companion | null {
  if (companion.commandPriority === "direct") {
    return null;
  }

  const companionsInLine = Object.values(state.entities).filter(
    (entity): entity is Companion =>
      entity.kind === "companion" &&
      entity.state === "follow" &&
      entity.commandPriority !== "direct",
  );
  const companionIndex = companionsInLine.findIndex(
    (entity) => entity.id === companion.id,
  );

  if (companionIndex < 0) {
    return null;
  }

  if (companionIndex === 0) {
    const followTarget = state.entities[companion.followTargetId];
    return followTarget?.kind === "player" ? followTarget : null;
  }

  return companionsInLine[companionIndex - 1] ?? null;
}

function getFollowStepCount(
  state: GameState,
  entity: AutonomousEntity,
  target: GameEntity,
): number {
  if (entity.kind !== "companion") {
    return 1;
  }

  const distance = state.map
    ? getReachableDistance(
        state,
        entity.position,
        target.position,
        DOUBLE_SPEED_DISTANCE,
      )
    : getGridDistance(entity.position, target.position);

  return distance === null || distance >= DOUBLE_SPEED_DISTANCE ? 2 : 1;
}

function getFollowStepCountToPosition(
  state: GameState,
  entity: AutonomousEntity,
  targetPosition: Position,
): number {
  if (entity.kind !== "companion") {
    return 1;
  }

  const distance = state.map
    ? getReachableDistance(
        state,
        entity.position,
        targetPosition,
        DOUBLE_SPEED_DISTANCE,
      )
    : getGridDistance(entity.position, targetPosition);

  return distance === null || distance >= DOUBLE_SPEED_DISTANCE ? 2 : 1;
}

export function isWithinFollowLeash(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): boolean {
  if (state.map) {
    return (
      getReachableDistance(
        state,
        entity.position,
        target.position,
        FOLLOW_LEASH_RADIUS,
      ) !== null
    );
  }

  const xDistance = Math.abs(target.position.x - entity.position.x);
  const yDistance = Math.abs(target.position.y - entity.position.y);

  return (
    xDistance <= FOLLOW_LEASH_RADIUS &&
    yDistance <= FOLLOW_LEASH_RADIUS
  );
}

function getReachableDistance(
  state: GameState,
  start: Position,
  target: Position,
  maxDistance: number,
): number | null {
  const startKey = getPositionKey(start);
  const targetKey = getPositionKey(target);
  const visited = new Set<string>([startKey]);
  const queue: { position: Position; distance: number }[] = [
    { position: start, distance: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (getPositionKey(current.position) === targetKey) {
      return current.distance;
    }

    if (current.distance >= maxDistance) {
      continue;
    }

    for (const neighbor of getNeighborPositions(current.position)) {
      const key = getPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isInMapBounds(state, neighbor) ||
        isWallPosition(state, neighbor) ||
        isActiveResourcePosition(state, neighbor)
      ) {
        continue;
      }

      visited.add(key);
      queue.push({
        position: neighbor,
        distance: current.distance + 1,
      });
    }
  }

  return null;
}

function getNeighborPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function isInMapBounds(state: GameState, position: Position): boolean {
  return Boolean(
    state.map &&
      position.x >= 0 &&
      position.x < state.map.columns &&
      position.y >= 0 &&
      position.y < state.map.rows,
  );
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}
