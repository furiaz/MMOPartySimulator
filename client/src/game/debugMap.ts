import type { DebugMapId, GameMap, Position, ResourceType } from "./types";
import { bakeNavigationGrid } from "./navigation";

export const DEBUG_MAP_COLUMNS = 36;
export const DEBUG_MAP_ROWS = 27;
export const TELEPORTER_ID = "map-1-to-map-2";
export const TELEPORTER_RANGE = 10;
export const MAP_ONE_ID: DebugMapId = "map-1";
export const MAP_TWO_ID: DebugMapId = "map-2";

export const companionIds = [
  "test-companion-1",
  "test-companion-2",
  "test-companion-3",
  "test-companion-4",
];

export const enemyIds = [
  "test-enemy",
  "test-enemy-2",
  "test-enemy-3",
  "test-enemy-4",
  "test-enemy-5",
  "test-enemy-6",
  "test-enemy-7",
  "test-enemy-8",
  "test-enemy-9",
  "test-enemy-10",
  "test-enemy-11",
  "test-enemy-12",
  "test-enemy-13",
  "test-enemy-14",
];

export const resourceIds = [
  "test-resource-wood",
  "test-resource-ore",
  "test-resource-herb",
  "test-resource-wood-2",
  "test-resource-ore-2",
  "test-resource-herb-2",
  "test-resource-wood-3",
  "test-resource-ore-3",
  "test-resource-herb-3",
  "test-resource-wood-4",
];

export const companionStartPositions: Position[] = [
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 3, y: 3 },
  { x: 4, y: 2 },
];

export const mapTwoCompanionStartPositions: Position[] = [
  { x: 4, y: 23 },
  { x: 5, y: 23 },
  { x: 5, y: 22 },
  { x: 6, y: 23 },
];

export const teleporterPosition: Position = { x: 18, y: 13 };

export const mapOneEnemyStartPositions: Position[] = [
  { x: 30, y: 2 },
  { x: 22, y: 5 },
  { x: 32, y: 11 },
  { x: 14, y: 10 },
  { x: 2, y: 15 },
  { x: 24, y: 13 },
  { x: 31, y: 16 },
  { x: 5, y: 20 },
  { x: 17, y: 20 },
  { x: 29, y: 22 },
  { x: 11, y: 24 },
  { x: 20, y: 25 },
  { x: 33, y: 5 },
  { x: 4, y: 7 },
];

export const mapTwoEnemyStartPositions: Position[] = [
  { x: 31, y: 24 },
  { x: 18, y: 22 },
  { x: 28, y: 16 },
  { x: 10, y: 18 },
  { x: 3, y: 11 },
  { x: 15, y: 12 },
  { x: 27, y: 8 },
  { x: 7, y: 5 },
  { x: 20, y: 4 },
  { x: 33, y: 6 },
  { x: 12, y: 24 },
  { x: 24, y: 20 },
  { x: 30, y: 12 },
  { x: 5, y: 17 },
];

export const mapOneResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 2, y: 5 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 15, y: 2 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 17, y: 5 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 6, y: 13 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 30, y: 10 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 25, y: 15 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 9, y: 22 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 16, y: 24 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 32, y: 24 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 22, y: 12 }, resourceType: "wood" },
];

export const mapTwoResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 8, y: 24 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 14, y: 21 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 22, y: 23 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 3, y: 18 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 25, y: 18 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 31, y: 14 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 6, y: 8 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 18, y: 7 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 30, y: 4 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 12, y: 13 }, resourceType: "wood" },
];

export type ResourceStartData = {
  id: string;
  position: Position;
  resourceType: ResourceType;
};

const MAP_ONE_WALLS = dedupeWalls([
  ...createVerticalWall(12, 0, DEBUG_MAP_ROWS - 1, [
    [5, 7],
    [12, 15],
    [20, 21],
  ]),
  ...createVerticalWall(24, 0, DEBUG_MAP_ROWS - 1, [
    [5, 7],
    [12, 15],
    [20, 21],
  ]),
  ...createHorizontalWall(9, 0, DEBUG_MAP_COLUMNS - 1, [
    [5, 8],
    [15, 20],
    [27, 30],
  ]),
  ...createHorizontalWall(18, 0, DEBUG_MAP_COLUMNS - 1, [
    [5, 8],
    [15, 20],
    [27, 30],
  ]),
]);

const MAP_TWO_WALLS = dedupeWalls([
  ...createVerticalWall(9, 2, DEBUG_MAP_ROWS - 3, [
    [7, 10],
    [18, 20],
  ]),
  ...createVerticalWall(19, 0, DEBUG_MAP_ROWS - 4, [
    [4, 6],
    [13, 16],
  ]),
  ...createVerticalWall(29, 3, DEBUG_MAP_ROWS - 1, [
    [10, 13],
    [21, 23],
  ]),
  ...createHorizontalWall(6, 3, DEBUG_MAP_COLUMNS - 4, [
    [6, 8],
    [16, 21],
    [28, 31],
  ]),
  ...createHorizontalWall(15, 0, DEBUG_MAP_COLUMNS - 6, [
    [3, 6],
    [13, 17],
    [25, 28],
  ]),
  ...createHorizontalWall(22, 6, DEBUG_MAP_COLUMNS - 1, [
    [11, 14],
    [21, 24],
    [31, 33],
  ]),
]);

export function createDebugMap(mapId: DebugMapId = MAP_ONE_ID): GameMap {
  const map = {
    id: mapId,
    columns: DEBUG_MAP_COLUMNS,
    rows: DEBUG_MAP_ROWS,
    walls: mapId === MAP_TWO_ID ? MAP_TWO_WALLS : MAP_ONE_WALLS,
  };

  return {
    ...map,
    navigationGrid: bakeNavigationGrid(map),
  };
}

function createVerticalWall(
  x: number,
  startY: number,
  endY: number,
  openings: [number, number][],
) {
  const walls = [];

  for (let y = startY; y <= endY; y += 1) {
    if (isInOpening(y, openings)) {
      continue;
    }

    walls.push({ x, y });
  }

  return walls;
}

function createHorizontalWall(
  y: number,
  startX: number,
  endX: number,
  openings: [number, number][],
) {
  const walls = [];

  for (let x = startX; x <= endX; x += 1) {
    if (isInOpening(x, openings)) {
      continue;
    }

    walls.push({ x, y });
  }

  return walls;
}

function isInOpening(value: number, openings: [number, number][]): boolean {
  return openings.some(([start, end]) => value >= start && value <= end);
}

function dedupeWalls(walls: { x: number; y: number }[]) {
  const seenWalls = new Set<string>();

  return walls.filter((wall) => {
    const key = `${wall.x},${wall.y}`;

    if (seenWalls.has(key)) {
      return false;
    }

    seenWalls.add(key);
    return true;
  });
}
