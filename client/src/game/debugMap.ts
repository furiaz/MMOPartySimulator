import type { GameMap } from "./types";
import { bakeNavigationGrid } from "./navigation";

const DEBUG_MAP_COLUMNS = 36;
const DEBUG_MAP_ROWS = 27;
const DEBUG_MAP_WALLS = dedupeWalls([
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

export function createDebugMap(): GameMap {
  const map = {
    columns: DEBUG_MAP_COLUMNS,
    rows: DEBUG_MAP_ROWS,
    walls: DEBUG_MAP_WALLS,
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
