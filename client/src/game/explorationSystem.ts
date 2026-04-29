import { isAutonomousEntity } from "./entities";
import {
  isActiveResourcePosition,
  isWallPosition,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
  reservePositionForTick,
  setLeaderIntent,
  updateEntity,
  type GameState,
} from "./state";
import { findEnemyTarget } from "./targetSelection";
import type { Player, Position } from "./types";

const AUTO_ENEMY_TARGET_RADIUS = 48;

export function updateExplorationSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  if (!state.autoModeEnabled || !state.map) {
    return state;
  }

  let nextState = markAutonomousEntityTilesExplored(state);
  const explorer = getExploringPlayer(nextState);

  if (!explorer || movedEntityIds.has(explorer.id)) {
    return nextState;
  }

  const enemyTarget = findEnemyTarget(nextState, explorer, {
    maxDistance: AUTO_ENEMY_TARGET_RADIUS,
  });

  if (enemyTarget) {
    return setLeaderIntent(
      updateEntity(nextState, {
        ...explorer,
        state: "attack",
        currentTargetId: enemyTarget.id,
        commandPriority: "autonomous",
      }),
      {
        type: "attack",
        targetId: enemyTarget.id,
        targetPosition: enemyTarget.position,
      },
    );
  }

  const targetPosition = findNearestUnexploredReachablePosition(
    nextState,
    explorer.position,
  );

  if (!targetPosition) {
    return setLeaderIntent(nextState, null);
  }

  nextState = setLeaderIntent(nextState, {
    type: "explore",
    targetId: null,
    targetPosition,
  });
  nextState = moveEntityTowardPositionIfUnoccupied(
    nextState,
    explorer,
    targetPosition,
  );
  movedEntityIds.add(explorer.id);

  return markAutonomousEntityTilesExplored(nextState);
}

export function reserveExploringPlayerNextTile(state: GameState): GameState {
  if (!state.autoModeEnabled || !state.map) {
    return state;
  }

  const explorer = getExploringPlayer(state);

  if (!explorer) {
    return state;
  }

  const targetPosition = findNearestUnexploredReachablePosition(
    state,
    explorer.position,
  );

  if (!targetPosition) {
    return state;
  }

  const nextTile = previewMoveTowardPosition(state, explorer, targetPosition);

  return nextTile
    ? reservePositionForTick(state, explorer.id, nextTile)
    : state;
}

function markAutonomousEntityTilesExplored(state: GameState): GameState {
  let exploredTiles = state.exploredTiles;

  for (const entity of Object.values(state.entities)) {
    if (!isAutonomousEntity(entity) || entity.state === "dead") {
      continue;
    }

    const key = getPositionKey(entity.position);

    if (exploredTiles[key]) {
      continue;
    }

    exploredTiles = {
      ...exploredTiles,
      [key]: true,
    };
  }

  return exploredTiles === state.exploredTiles
    ? state
    : {
        ...state,
        exploredTiles,
      };
}

function getExploringPlayer(state: GameState): Player | undefined {
  return Object.values(state.entities).find(
    (entity): entity is Player =>
      entity.kind === "player" &&
      entity.commandPriority === "autonomous" &&
      (entity.state === "idle" || entity.state === "follow"),
  );
}

function findNearestUnexploredReachablePosition(
  state: GameState,
  start: Position,
): Position | null {
  const visited = new Set<string>([getPositionKey(start)]);
  const queue: Position[] = [start];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (
      !state.exploredTiles[getPositionKey(current)] &&
      !isActiveResourcePosition(state, current)
    ) {
      return current;
    }

    for (const neighbor of getNeighborPositions(current)) {
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
      queue.push(neighbor);
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
