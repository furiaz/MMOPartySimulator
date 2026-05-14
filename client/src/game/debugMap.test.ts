import { describe, expect, it } from "vitest";
import {
  DEBUG_MAP_COLUMNS,
  DEBUG_MAP_ROWS,
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  WILDERNESS_MAP_COLUMNS,
  WILDERNESS_MAP_ROWS,
  createDebugMap,
  debugMapDefinitions,
  mapOneEnemyStartPositions,
  mapOneResourceStartData,
  mapTwoEnemyStartPositions,
  mapTwoResourceStartData,
} from "./debugMap";
import { getNavigationDistance, isNavigationCellWalkable } from "./navigation";
import type { DebugMapId, GameMap, Position } from "./types";

describe("debug maps", () => {
  it("keeps the hub compact and expands wilderness maps", () => {
    expect(createDebugMap(HUB_MAP_ID)).toMatchObject({
      columns: DEBUG_MAP_COLUMNS,
      rows: DEBUG_MAP_ROWS,
    });
    expect(createDebugMap(MAP_ONE_ID)).toMatchObject({
      columns: WILDERNESS_MAP_COLUMNS,
      rows: WILDERNESS_MAP_ROWS,
    });
    expect(createDebugMap(MAP_TWO_ID)).toMatchObject({
      columns: WILDERNESS_MAP_COLUMNS,
      rows: WILDERNESS_MAP_ROWS,
    });
  });

  it("keeps wilderness enemies and resources on reachable open floor", () => {
    expect(mapOneEnemyStartPositions).toHaveLength(20);
    expect(mapTwoEnemyStartPositions).toHaveLength(20);

    assertMapPlacements(MAP_ONE_ID, [
      ...mapOneEnemyStartPositions,
      ...mapOneResourceStartData.map((resource) => resource.position),
    ]);
    assertMapPlacements(MAP_TWO_ID, [
      ...mapTwoEnemyStartPositions,
      ...mapTwoResourceStartData.map((resource) => resource.position),
    ]);
  });

  it("keeps wilderness teleports and arrivals on reachable open floor", () => {
    for (const definition of Object.values(debugMapDefinitions)) {
      const sourceMap = createDebugMap(definition.id);

      for (const teleport of definition.teleports) {
        assertOpenReachablePosition(sourceMap, teleport.position);

        const targetMap = createDebugMap(teleport.targetMapId);
        for (const arrivalPosition of teleport.arrivalPositions) {
          assertOpenReachablePosition(targetMap, arrivalPosition);
        }
      }
    }
  });

  it("does not stack wilderness enemies and resources on each other", () => {
    expect(getDuplicatePositions([
      ...mapOneEnemyStartPositions,
      ...mapOneResourceStartData.map((resource) => resource.position),
    ])).toEqual([]);
    expect(getDuplicatePositions([
      ...mapTwoEnemyStartPositions,
      ...mapTwoResourceStartData.map((resource) => resource.position),
    ])).toEqual([]);
  });

  it("bakes navigation grids for all debug maps", () => {
    for (const definition of Object.values(debugMapDefinitions)) {
      const map = createDebugMap(definition.id);

      expect(map.navigationGrid).toMatchObject({
        columns: map.columns,
        rows: map.rows,
      });
      expect(Object.keys(map.navigationGrid?.cellsByKey ?? {})).toHaveLength(
        map.columns * map.rows,
      );
    }
  });
});

function assertMapPlacements(mapId: DebugMapId, positions: Position[]) {
  const map = createDebugMap(mapId);

  for (const position of positions) {
    assertOpenReachablePosition(map, position);
    if (isWallAdjacent(map, position)) {
      throw new Error(
        `${map.id ?? map.debugName} placement ${position.x},${position.y} is wall-adjacent`,
      );
    }
  }
}

function assertOpenReachablePosition(map: GameMap, position: Position) {
  if (!isInMapBounds(map, position)) {
    throw new Error(`${map.id ?? map.debugName} placement ${position.x},${position.y} is out of bounds`);
  }

  if (!isNavigationCellWalkable(map, position)) {
    throw new Error(`${map.id ?? map.debugName} placement ${position.x},${position.y} is not walkable`);
  }

  if (getNavigationDistance(map, getReachabilityAnchor(map), position, 200) === null) {
    throw new Error(`${map.id ?? map.debugName} placement ${position.x},${position.y} is not reachable`);
  }
}

function getReachabilityAnchor(map: GameMap): Position {
  return map.teleports[0]?.position ?? { x: 1, y: 1 };
}

function isInMapBounds(map: GameMap, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x < map.columns &&
    position.y >= 0 &&
    position.y < map.rows
  );
}

function isWallAdjacent(map: GameMap, position: Position): boolean {
  return getNeighborPositions(position).some((neighbor) =>
    map.walls.some((wall) => wall.x === neighbor.x && wall.y === neighbor.y),
  );
}

function getNeighborPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function getDuplicatePositions(positions: Position[]): string[] {
  const seenPositions = new Set<string>();
  const duplicates = new Set<string>();

  for (const position of positions) {
    const key = `${position.x},${position.y}`;

    if (seenPositions.has(key)) {
      duplicates.add(key);
      continue;
    }

    seenPositions.add(key);
  }

  return [...duplicates];
}
