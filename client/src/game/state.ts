import { isCombatEntity, moveEntityTo, moveEntityToward } from "./entities";
import type {
  GameMap,
  GameEntity,
  Enemy,
  LeaderIntent,
  Position,
  ResourceInventory,
  ResourceType,
  CompanionRole,
} from "./types";

const AVAILABLE_TILE_SEARCH_RADIUS = 8;

type FindAvailablePositionOptions = {
  blockedPositions?: Position[];
  ignoredEntityId?: string;
};

export type GameState = {
  entities: Record<string, GameEntity>;
  inventory: ResourceInventory;
  map?: GameMap;
  autoModeEnabled: boolean;
  leaderIntent: LeaderIntent | null;
  exploredTiles: Record<string, true>;
  followTrailsByEntityId: Record<string, Position[]>;
  lastPositionsByEntityId?: Record<string, Position>;
  failedMoveByEntityId?: Record<string, true>;
  moveIntentsByEntityId?: Record<string, Position>;
  reservedPositionsByEntityId?: Record<string, Position>;
  defenderWaitTicksByLeaderId?: Record<string, number>;
  defenderBlockedTicksByEntityId?: Record<string, number>;
};

export function createEmptyResourceInventory(): ResourceInventory {
  return {
    wood: 0,
    ore: 0,
    herb: 0,
  };
}

export function addEntity(state: GameState, entity: GameEntity): GameState {
  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
    followTrailsByEntityId: state.followTrailsByEntityId[entity.id]
      ? state.followTrailsByEntityId
      : {
          ...state.followTrailsByEntityId,
          [entity.id]: [],
        },
  };
}

export function addEnemy(state: GameState, enemy: Enemy): GameState {
  return addEntity(state, {
    ...enemy,
    position: findClosestAvailablePosition(state, enemy.position),
  });
}

export function updateEntity(state: GameState, entity: GameEntity): GameState {
  const previousEntity = state.entities[entity.id];

  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
    followTrailsByEntityId:
      previousEntity &&
      !isSamePosition(previousEntity.position, entity.position)
        ? {
            ...state.followTrailsByEntityId,
            [entity.id]: getUpdatedFollowTrail(
              state.followTrailsByEntityId[entity.id] ?? [],
              previousEntity.position,
            ),
          }
        : state.followTrailsByEntityId,
  };
}

export function getFollowTrailPosition(
  state: GameState,
  entityId: string,
  trailIndex: number,
): Position | null {
  const trail = state.followTrailsByEntityId[entityId];

  if (!trail || trailIndex < 0) {
    return null;
  }

  return trail[trailIndex] ?? null;
}

export function addResourceToInventory(
  state: GameState,
  resourceType: ResourceType,
  amount: number,
): GameState {
  return {
    ...state,
    inventory: {
      ...state.inventory,
      [resourceType]: state.inventory[resourceType] + amount,
    },
  };
}

export function setAutoModeEnabled(
  state: GameState,
  autoModeEnabled: boolean,
): GameState {
  return {
    ...state,
    autoModeEnabled,
  };
}

export function setLeaderIntent(
  state: GameState,
  leaderIntent: LeaderIntent | null,
): GameState {
  return {
    ...state,
    leaderIntent,
  };
}

export function setCompanionRole(
  state: GameState,
  companionId: string,
  role: CompanionRole,
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...companion,
    role,
  });
}

export function setCompanionDefendPosition(
  state: GameState,
  companionId: string,
  defendPosition: Position | null,
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...companion,
    defendPosition,
  });
}

export function getEntityById(
  state: GameState,
  entityId: string,
): GameEntity | undefined {
  return state.entities[entityId];
}

export function moveEntityTowardIfUnoccupied<T extends GameEntity>(
  state: GameState,
  entity: T,
  target: GameEntity,
): GameState {
  const nextStateWithIntent = recordMoveIntent(state, entity, target);
  const moveResolution = getNextMoveResolution(nextStateWithIntent, entity, target);

  if (!moveResolution || isSamePosition(moveResolution.position, entity.position)) {
    return markMoveFailed(nextStateWithIntent, entity.id);
  }

  if (moveResolution.swapWithEntityId) {
    return swapEntityPositions(
      nextStateWithIntent,
      entity.id,
      moveResolution.swapWithEntityId,
    );
  }

  return markMoveSucceeded(
    updateEntity(
      nextStateWithIntent,
      moveEntityTo(entity, moveResolution.position),
    ),
    entity.id,
    entity.position,
  );
}

export function moveEntityTowardPositionIfUnoccupied<T extends GameEntity>(
  state: GameState,
  entity: T,
  position: Position,
): GameState {
  const target: GameEntity = {
    id: "__position_target__",
    kind: "resource",
    position,
    state: "idle",
    resourceType: "wood",
    durability: 1,
    maxDurability: 1,
    quantity: 1,
    maxGatherers: 1,
    isDepleted: false,
  };

  return moveEntityTowardIfUnoccupied(state, entity, target);
}

export function clearTickMovementPlanning(state: GameState): GameState {
  return {
    ...state,
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
  };
}

export function reservePositionForTick(
  state: GameState,
  entityId: string,
  position: Position,
): GameState {
  return {
    ...state,
    reservedPositionsByEntityId: {
      ...(state.reservedPositionsByEntityId ?? {}),
      [entityId]: position,
    },
  };
}

export function previewMoveTowardPosition(
  state: GameState,
  entity: GameEntity,
  position: Position,
): Position | null {
  const target: GameEntity = {
    id: "__position_target__",
    kind: "resource",
    position,
    state: "idle",
    resourceType: "wood",
    durability: 1,
    maxDurability: 1,
    quantity: 1,
    maxGatherers: 1,
    isDepleted: false,
  };

  return getIntendedMovePosition(state, entity, target);
}

export function isWallPosition(state: GameState, position: Position): boolean {
  return Boolean(
    state.map?.walls.some((wall) => isSamePosition(wall, position)),
  );
}

export function isActiveResourcePosition(
  state: GameState,
  position: Position,
  ignoredEntityId?: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      entity.kind === "resource" &&
      !entity.isDepleted &&
      entity.quantity > 0 &&
      isSamePosition(entity.position, position),
  );
}

export function findClosestAvailablePosition(
  state: GameState,
  intendedPosition: Position,
  options: FindAvailablePositionOptions = {},
): Position {
  if (isPositionAvailable(state, intendedPosition, options)) {
    return intendedPosition;
  }

  for (let radius = 1; radius <= AVAILABLE_TILE_SEARCH_RADIUS; radius += 1) {
    const position = getPositionRing(intendedPosition, radius).find(
      (candidate) => isPositionAvailable(state, candidate, options),
    );

    if (position) {
      return position;
    }
  }

  return intendedPosition;
}

function getNextMoveResolution(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): { position: Position; swapWithEntityId?: string } | null {
  const pathPosition = findNextPathPosition(state, entity, target);

  if (pathPosition) {
    return { position: pathPosition };
  }

  const movedEntity = moveEntityToward(entity, target);

  if (isSamePosition(movedEntity.position, entity.position)) {
    return null;
  }

  if (isWalkablePosition(state, movedEntity.position, entity.id)) {
    return { position: movedEntity.position };
  }

  const swapWithEntity = getSwapCandidate(
    state,
    entity,
    movedEntity.position,
  );

  if (swapWithEntity) {
    return {
      position: movedEntity.position,
      swapWithEntityId: swapWithEntity.id,
    };
  }

  return findAlternativeMovePosition(state, entity, target);
}

function findNextPathPosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): Position | null {
  if (!state.map) {
    return null;
  }

  const goals = getPathGoals(state, entity, target);
  const goalKeys = new Set(goals.map(getPositionKey));

  if (goalKeys.size === 0) {
    return null;
  }

  const startKey = getPositionKey(entity.position);
  const visited = new Set<string>([startKey]);
  const queue: { position: Position; firstStep: Position | null }[] = [
    { position: entity.position, firstStep: null },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (goalKeys.has(getPositionKey(current.position))) {
      return current.firstStep;
    }

    for (const neighbor of getNeighborPositions(current.position)) {
      const key = getPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isWalkablePosition(state, neighbor, entity.id)
      ) {
        continue;
      }

      visited.add(key);
      queue.push({
        position: neighbor,
        firstStep: current.firstStep ?? neighbor,
      });
    }
  }

  return null;
}

function getPathGoals(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): Position[] {
  if (isWalkablePosition(state, target.position, entity.id)) {
    return [target.position];
  }

  return getNeighborPositions(target.position).filter((position) =>
    isWalkablePosition(state, position, entity.id),
  );
}

function findAlternativeMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): { position: Position } | null {
  if (state.failedMoveByEntityId?.[entity.id]) {
    return null;
  }

  const candidates = getAlternativeMoveCandidates(entity.position, target.position);
  const previousPosition = state.lastPositionsByEntityId?.[entity.id];
  const validCandidates = candidates.filter((position) =>
    isWalkablePosition(state, position, entity.id),
  );
  const preferredCandidate = validCandidates.find(
    (position) => !previousPosition || !isSamePosition(position, previousPosition),
  );

  return preferredCandidate
    ? { position: preferredCandidate }
    : validCandidates[0]
      ? { position: validCandidates[0] }
      : null;
}

function getAlternativeMoveCandidates(
  current: Position,
  target: Position,
): Position[] {
  const xStep = Math.sign(target.x - current.x);
  const yStep = Math.sign(target.y - current.y);
  const candidates: Position[] = [];

  addCloserSideStepCandidates(candidates, current, xStep, yStep);

  if (xStep !== 0) {
    candidates.push({ x: current.x + xStep, y: current.y });
  }

  if (yStep !== 0) {
    candidates.push({ x: current.x, y: current.y + yStep });
  }

  return dedupePositions(candidates).filter(
    (position) =>
      !isSamePosition(position, current) &&
      isCloserToTarget(position, current, target),
  );
}

function addCloserSideStepCandidates(
  candidates: Position[],
  current: Position,
  xStep: number,
  yStep: number,
): void {
  if (xStep !== 0 && yStep !== 0) {
    candidates.push(
      { x: current.x + xStep, y: current.y - yStep },
      { x: current.x - xStep, y: current.y + yStep },
    );
    return;
  }

  if (xStep !== 0) {
    candidates.push(
      { x: current.x + xStep, y: current.y + 1 },
      { x: current.x + xStep, y: current.y - 1 },
    );
    return;
  }

  if (yStep !== 0) {
    candidates.push(
      { x: current.x + 1, y: current.y + yStep },
      { x: current.x - 1, y: current.y + yStep },
    );
  }
}

function dedupePositions(positions: Position[]): Position[] {
  const seenPositions = new Set<string>();

  return positions.filter((position) => {
    const key = `${position.x},${position.y}`;

    if (seenPositions.has(key)) {
      return false;
    }

    seenPositions.add(key);
    return true;
  });
}

function isCloserToTarget(
  position: Position,
  current: Position,
  target: Position,
): boolean {
  return (
    getGridDistance(position, target) < getGridDistance(current, target) ||
    getManhattanDistance(position, target) < getManhattanDistance(current, target)
  );
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getManhattanDistance(from: Position, to: Position): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

function getNeighborPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function isWalkablePosition(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isActiveResourcePosition(state, position, ignoredEntityId) &&
    !isReservedPosition(state, position, ignoredEntityId) &&
    !isPositionOccupiedByLivingEntity(state, position, ignoredEntityId)
  );
}

function isReservedPosition(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
): boolean {
  return Object.entries(state.reservedPositionsByEntityId ?? {}).some(
    ([entityId, reservedPosition]) =>
      entityId !== ignoredEntityId && isSamePosition(position, reservedPosition),
  );
}

function isInMapBounds(state: GameState, position: Position): boolean {
  if (!state.map) {
    return true;
  }

  return (
    position.x >= 0 &&
    position.x < state.map.columns &&
    position.y >= 0 &&
    position.y < state.map.rows
  );
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function getPositionRing(center: Position, radius: number): Position[] {
  const positions: Position[] = [];

  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const position = { x, y };

      if (getManhattanDistance(center, position) !== radius) {
        continue;
      }

      positions.push(position);
    }
  }

  return positions;
}

function isPositionAvailable(
  state: GameState,
  position: Position,
  options: FindAvailablePositionOptions,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isPositionBlocked(position, options.blockedPositions ?? []) &&
    !isActiveResourcePosition(state, position, options.ignoredEntityId) &&
    !isPositionOccupiedByEntity(state, position, options.ignoredEntityId)
  );
}

function isPositionOccupiedByEntity(
  state: GameState,
  position: Position,
  ignoredEntityId?: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      isSamePosition(entity.position, position),
  );
}

function isPositionBlocked(
  position: Position,
  blockedPositions: Position[],
): boolean {
  return blockedPositions.some((blockedPosition) =>
    isSamePosition(position, blockedPosition),
  );
}

function isPositionOccupiedByLivingEntity(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      isCombatEntity(entity) &&
      entity.state !== "dead" &&
      entity.position.x === position.x &&
      entity.position.y === position.y,
  );
}

function getSwapCandidate(
  state: GameState,
  entity: GameEntity,
  targetPosition: Position,
): GameEntity | undefined {
  const occupyingEntity = Object.values(state.entities).find(
    (candidate) =>
      candidate.id !== entity.id &&
      isCombatEntity(candidate) &&
      candidate.state !== "dead" &&
      isSamePosition(candidate.position, targetPosition),
  );

  if (!occupyingEntity) {
    return undefined;
  }

  const occupyingIntent = state.moveIntentsByEntityId?.[occupyingEntity.id];

  return occupyingIntent && isSamePosition(occupyingIntent, entity.position)
    ? occupyingEntity
    : undefined;
}

function recordMoveIntent(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): GameState {
  const intendedPosition = getIntendedMovePosition(state, entity, target);

  if (!intendedPosition) {
    return state;
  }

  return {
    ...state,
    moveIntentsByEntityId: {
      ...(state.moveIntentsByEntityId ?? {}),
      [entity.id]: intendedPosition,
    },
  };
}

function getIntendedMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): Position | null {
  const pathPosition = findNextPathPosition(state, entity, target);

  if (pathPosition) {
    return pathPosition;
  }

  const movedEntity = moveEntityToward(entity, target);

  return isSamePosition(movedEntity.position, entity.position)
    ? null
    : movedEntity.position;
}

function markMoveSucceeded(
  state: GameState,
  entityId: string,
  previousPosition: Position,
): GameState {
  const failedMoveByEntityId = { ...(state.failedMoveByEntityId ?? {}) };
  delete failedMoveByEntityId[entityId];

  return {
    ...state,
    lastPositionsByEntityId: {
      ...(state.lastPositionsByEntityId ?? {}),
      [entityId]: previousPosition,
    },
    failedMoveByEntityId,
  };
}

function markMoveFailed(state: GameState, entityId: string): GameState {
  return {
    ...state,
    failedMoveByEntityId: {
      ...(state.failedMoveByEntityId ?? {}),
      [entityId]: true,
    },
  };
}

function swapEntityPositions(
  state: GameState,
  firstEntityId: string,
  secondEntityId: string,
): GameState {
  const firstEntity = state.entities[firstEntityId];
  const secondEntity = state.entities[secondEntityId];

  if (!firstEntity || !secondEntity) {
    return markMoveFailed(state, firstEntityId);
  }

  let nextState = updateEntity(
    state,
    moveEntityTo(firstEntity, secondEntity.position),
  );
  nextState = updateEntity(
    nextState,
    moveEntityTo(secondEntity, firstEntity.position),
  );
  nextState = markMoveSucceeded(nextState, firstEntity.id, firstEntity.position);
  nextState = markMoveSucceeded(nextState, secondEntity.id, secondEntity.position);

  return nextState;
}

const FOLLOW_TRAIL_LENGTH = 12;

function getUpdatedFollowTrail(
  trail: Position[],
  position: Position,
): Position[] {
  const nextTrail = [
    position,
    ...trail.filter((trailPosition) => !isSamePosition(trailPosition, position)),
  ];

  return nextTrail.slice(0, FOLLOW_TRAIL_LENGTH);
}
