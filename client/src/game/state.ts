import { isCombatEntity, moveEntityTo, moveEntityToward } from "./entities";
import type {
  GameMap,
  GameEntity,
  Enemy,
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
  exploredTiles: Record<string, true>;
  followTrailsByEntityId: Record<string, Position[]>;
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
  const nextPosition = getNextMovePosition(state, entity, target);

  if (!nextPosition || isSamePosition(nextPosition, entity.position)) {
    return state;
  }

  return updateEntity(state, moveEntityTo(entity, nextPosition));
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

function getNextMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): Position | null {
  const pathPosition = findNextPathPosition(state, entity, target);

  if (pathPosition) {
    return pathPosition;
  }

  const movedEntity = moveEntityToward(entity, target);

  if (isSamePosition(movedEntity.position, entity.position)) {
    return null;
  }

  if (isWalkablePosition(state, movedEntity.position, entity.id)) {
    return movedEntity.position;
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
): Position | null {
  const candidates = getAlternativeMoveCandidates(entity.position, target.position);

  return (
    candidates.find(
      (position) =>
        isWalkablePosition(state, position, entity.id),
    ) ?? null
  );
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
    !isPositionOccupiedByLivingEntity(state, position, ignoredEntityId)
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
