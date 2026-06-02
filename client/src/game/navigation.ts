import type { GameMap, NavigationGrid, Position } from "./types";

const WALL_ADJACENT_MOVEMENT_COST = 1.75;
const NORMAL_MOVEMENT_COST = 1;

type NavigationSearchOptions = {
  isBlocked?: (position: Position) => boolean;
};

export function bakeNavigationGrid(map: GameMap): NavigationGrid {
  const wallKeys = new Set(
    [...map.walls, ...(map.collisionWalls ?? [])].map(getNavigationPositionKey),
  );
  const cellsByKey: NavigationGrid["cellsByKey"] = {};

  for (let y = 0; y < map.rows; y += 1) {
    for (let x = 0; x < map.columns; x += 1) {
      const position = { x, y };
      const key = getNavigationPositionKey(position);
      const walkable = !wallKeys.has(key);
      const wallAdjacent =
        walkable &&
        getNavigationNeighborPositions(position).some((neighbor) =>
          wallKeys.has(getNavigationPositionKey(neighbor)),
        );

      cellsByKey[key] = {
        position,
        walkable,
        wallAdjacent,
        movementCost: wallAdjacent
          ? WALL_ADJACENT_MOVEMENT_COST
          : NORMAL_MOVEMENT_COST,
      };
    }
  }

  return {
    columns: map.columns,
    rows: map.rows,
    cellsByKey,
  };
}

export function getNavigationGrid(map: GameMap): NavigationGrid {
  return map.navigationGrid ?? bakeNavigationGrid(map);
}

export function findNavigationPath(
  map: GameMap,
  start: Position,
  goals: Position[],
  options: NavigationSearchOptions = {},
): Position[] {
  const grid = getNavigationGrid(map);
  const startNode = toNavigationNode(start);
  const goalNodes = goals
    .map(toNavigationNode)
    .filter((goal) => isNavigationCellWalkable(map, goal));
  const goalKeys = new Set(goalNodes.map(getNavigationPositionKey));

  if (
    goalKeys.size === 0 ||
    goalKeys.has(getNavigationPositionKey(startNode))
  ) {
    return [];
  }

  const openNodes: Position[] = [startNode];
  const cameFromByKey = new Map<string, string>();
  const nodeByKey = new Map<string, Position>([
    [getNavigationPositionKey(startNode), startNode],
  ]);
  const gScoreByKey = new Map<string, number>([
    [getNavigationPositionKey(startNode), 0],
  ]);
  const fScoreByKey = new Map<string, number>([
    [getNavigationPositionKey(startNode), getHeuristicDistance(startNode, goalNodes)],
  ]);

  while (openNodes.length > 0) {
    const current = takeLowestScoreNode(openNodes, fScoreByKey);
    const currentKey = getNavigationPositionKey(current);

    if (goalKeys.has(currentKey)) {
      return reconstructPath(cameFromByKey, nodeByKey, currentKey);
    }

    for (const neighbor of getNavigationNeighborPositions(current)) {
      const neighborKey = getNavigationPositionKey(neighbor);

      if (
        !isNavigationCellWalkable(map, neighbor) ||
        (!goalKeys.has(neighborKey) && options.isBlocked?.(neighbor))
      ) {
        continue;
      }

      const movementCost =
        grid.cellsByKey[neighborKey]?.movementCost ?? NORMAL_MOVEMENT_COST;
      const nextScore = (gScoreByKey.get(currentKey) ?? 0) + movementCost;
      const previousScore = gScoreByKey.get(neighborKey);

      if (previousScore !== undefined && nextScore >= previousScore) {
        continue;
      }

      cameFromByKey.set(neighborKey, currentKey);
      nodeByKey.set(neighborKey, neighbor);
      gScoreByKey.set(neighborKey, nextScore);
      fScoreByKey.set(
        neighborKey,
        nextScore + getHeuristicDistance(neighbor, goalNodes),
      );

      if (!openNodes.some((node) => getNavigationPositionKey(node) === neighborKey)) {
        openNodes.push(neighbor);
      }
    }
  }

  return [];
}

export function getNavigationDistance(
  map: GameMap,
  start: Position,
  target: Position,
  maxDistance: number,
  options: NavigationSearchOptions = {},
): number | null {
  const grid = getNavigationGrid(map);
  const startNode = toNavigationNode(start);
  const targetNode = toNavigationNode(target);
  const startKey = getNavigationPositionKey(startNode);
  const targetKey = getNavigationPositionKey(targetNode);

  if (!isNavigationCellWalkable(map, startNode) || !isNavigationCellWalkable(map, targetNode)) {
    return null;
  }

  if (startKey === targetKey) {
    return 0;
  }

  const visited = new Set<string>();
  const bestDistanceByKey = new Map<string, number>([[startKey, 0]]);
  const queue = new NavigationPriorityQueue();
  queue.push({ position: startNode, distance: 0 });

  while (queue.length > 0) {
    const current = queue.pop();

    if (!current) {
      continue;
    }

    const currentKey = getNavigationPositionKey(current.position);

    if (visited.has(currentKey) || current.distance > maxDistance) {
      continue;
    }

    if (currentKey === targetKey) {
      return current.distance;
    }

    visited.add(currentKey);

    for (const neighbor of getNavigationNeighborPositions(current.position)) {
      const neighborKey = getNavigationPositionKey(neighbor);

      if (
        visited.has(neighborKey) ||
        !isNavigationCellWalkable(map, neighbor) ||
        (neighborKey !== targetKey && options.isBlocked?.(neighbor))
      ) {
        continue;
      }

      const movementCost =
        grid.cellsByKey[neighborKey]?.movementCost ?? NORMAL_MOVEMENT_COST;
      const nextDistance = current.distance + movementCost;
      const bestDistance = bestDistanceByKey.get(neighborKey);

      if (bestDistance !== undefined && nextDistance >= bestDistance) {
        continue;
      }

      bestDistanceByKey.set(neighborKey, nextDistance);
      queue.push({ position: neighbor, distance: nextDistance });
    }
  }

  return null;
}

type NavigationQueueNode = {
  position: Position;
  distance: number;
};

class NavigationPriorityQueue {
  private readonly nodes: NavigationQueueNode[] = [];

  get length(): number {
    return this.nodes.length;
  }

  push(node: NavigationQueueNode): void {
    this.nodes.push(node);
    this.bubbleUp(this.nodes.length - 1);
  }

  pop(): NavigationQueueNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();

    if (!first || !last) {
      return first;
    }

    if (this.nodes.length > 0) {
      this.nodes[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  private bubbleUp(index: number): void {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);

      if (this.nodes[parentIndex].distance <= this.nodes[currentIndex].distance) {
        return;
      }

      this.swap(parentIndex, currentIndex);
      currentIndex = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (
        this.nodes[leftIndex] &&
        this.nodes[leftIndex].distance < this.nodes[smallestIndex].distance
      ) {
        smallestIndex = leftIndex;
      }

      if (
        this.nodes[rightIndex] &&
        this.nodes[rightIndex].distance < this.nodes[smallestIndex].distance
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) {
        return;
      }

      this.swap(currentIndex, smallestIndex);
      currentIndex = smallestIndex;
    }
  }

  private swap(firstIndex: number, secondIndex: number): void {
    const first = this.nodes[firstIndex];
    this.nodes[firstIndex] = this.nodes[secondIndex];
    this.nodes[secondIndex] = first;
  }
}

export function findNearestReachableNavigationPosition(
  map: GameMap,
  start: Position,
  isCandidate: (position: Position) => boolean,
  options: NavigationSearchOptions = {},
): Position | null {
  const startNode = toNavigationNode(start);
  const visited = new Set<string>([getNavigationPositionKey(startNode)]);
  const queue: Position[] = [startNode];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (isCandidate(current)) {
      return current;
    }

    for (const neighbor of getNavigationNeighborPositions(current)) {
      const key = getNavigationPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isNavigationCellWalkable(map, neighbor) ||
        options.isBlocked?.(neighbor)
      ) {
        continue;
      }

      visited.add(key);
      queue.push(neighbor);
    }
  }

  return null;
}

export function isNavigationCellWalkable(
  map: GameMap,
  position: Position,
): boolean {
  const node = toNavigationNode(position);
  const grid = getNavigationGrid(map);

  return Boolean(grid.cellsByKey[getNavigationPositionKey(node)]?.walkable);
}

export function toNavigationNode(position: Position): Position {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
  };
}

export function getNavigationNeighborPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

export function getNavigationPositionKey(position: Position): string {
  const node = toNavigationNode(position);

  return `${node.x},${node.y}`;
}

function takeLowestScoreNode(
  nodes: Position[],
  fScoreByKey: Map<string, number>,
): Position {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < nodes.length; index += 1) {
    const score =
      fScoreByKey.get(getNavigationPositionKey(nodes[index])) ??
      Number.POSITIVE_INFINITY;

    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  const [node] = nodes.splice(bestIndex, 1);
  return node;
}

function reconstructPath(
  cameFromByKey: Map<string, string>,
  nodeByKey: Map<string, Position>,
  currentKey: string,
): Position[] {
  const path: Position[] = [];
  let key = currentKey;

  while (cameFromByKey.has(key)) {
    const node = nodeByKey.get(key);

    if (!node) {
      break;
    }

    path.unshift(node);
    key = cameFromByKey.get(key) ?? key;
  }

  return path;
}

function getHeuristicDistance(position: Position, goals: Position[]): number {
  return Math.min(
    ...goals.map((goal) =>
      Math.abs(goal.x - position.x) + Math.abs(goal.y - position.y),
    ),
  );
}
