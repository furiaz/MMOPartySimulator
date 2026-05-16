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
  mapOneEnemyStartData,
  mapOneSubzoneNameLabels,
  mapOneResourceStartData,
  mapOneSubzones,
  mapTwoEnemyStartPositions,
  mapTwoEnemyStartData,
  mapTwoSubzoneNameLabels,
  mapTwoResourceStartData,
  mapTwoSubzones,
} from "./debugMap";
import { ENEMY_ARCHETYPES } from "./enemyArchetypes";
import { getNavigationDistance, isNavigationCellWalkable } from "./navigation";
import type { DebugMapId, GameMap, Position, ZoneSubzone } from "./types";

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
    expect(mapOneEnemyStartPositions).toHaveLength(40);
    expect(mapTwoEnemyStartPositions).toHaveLength(40);
    expect(mapOneResourceStartData).toHaveLength(16);
    expect(mapTwoResourceStartData).toHaveLength(16);

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

  it("defines six authored subzones for each wilderness map", () => {
    expect(mapOneSubzones).toHaveLength(6);
    expect(mapTwoSubzones).toHaveLength(6);
    expect(createDebugMap(MAP_ONE_ID).subzones).toBe(mapOneSubzones);
    expect(createDebugMap(MAP_TWO_ID).subzones).toBe(mapTwoSubzones);
  });

  it("keeps authored subzones, passages, encounter areas, and resource locations valid", () => {
    assertSubzones(MAP_ONE_ID, mapOneSubzones);
    assertSubzones(MAP_TWO_ID, mapTwoSubzones);
  });

  it("keeps wilderness enemies inside their authored subzones", () => {
    assertEnemyStartData(MAP_ONE_ID, mapOneSubzones, mapOneEnemyStartData);
    assertEnemyStartData(MAP_TWO_ID, mapTwoSubzones, mapTwoEnemyStartData);
  });

  it("doubles authored wilderness enemy density and adds one resource per subzone", () => {
    assertSubzoneContentDensity(mapOneSubzones, mapOneEnemyStartData);
    assertSubzoneContentDensity(mapTwoSubzones, mapTwoEnemyStartData);
  });

  it("makes current prototype wilderness monsters aggressive", () => {
    for (const enemy of [...mapOneEnemyStartData, ...mapTwoEnemyStartData]) {
      expect(ENEMY_ARCHETYPES[enemy.archetypeId].temperament).toBe("aggressive");
    }
  });

  it("places subzone name labels near reachable entrances and exits", () => {
    assertSubzoneNameLabels(MAP_ONE_ID, mapOneSubzones, mapOneSubzoneNameLabels);
    assertSubzoneNameLabels(MAP_TWO_ID, mapTwoSubzones, mapTwoSubzoneNameLabels);
    expect(createDebugMap(MAP_ONE_ID).subzoneNameLabels).toBe(mapOneSubzoneNameLabels);
    expect(createDebugMap(MAP_TWO_ID).subzoneNameLabels).toBe(mapTwoSubzoneNameLabels);
  });

  it("starts map one in the weakest subzone and ramps toward harder areas", () => {
    const mapOneDefinition = debugMapDefinitions[MAP_ONE_ID];
    const hubEntry = mapOneDefinition.teleports.find(
      (teleport) => teleport.targetMapId === HUB_MAP_ID,
    );
    const shoreFringe = getSubzone(mapOneSubzones, "north-west");

    expect(hubEntry).toBeDefined();
    expect(hubEntry && isInsideSubzone(shoreFringe, hubEntry.position)).toBe(true);
    for (const arrivalPosition of debugMapDefinitions[HUB_MAP_ID].teleports[0].arrivalPositions) {
      expect(isInsideSubzone(shoreFringe, arrivalPosition)).toBe(true);
    }
    expect(shoreFringe.enemyArchetypeIds).toEqual(["slime"]);
    expect(
      mapOneEnemyStartData
        .filter((enemy) => enemy.subzoneId === shoreFringe.id)
        .map((enemy) => enemy.archetypeId),
    ).toEqual(["slime", "slime", "slime", "slime", "slime", "slime"]);
    expect(getSubzone(mapOneSubzones, "north-center").levelRange.min).toBeGreaterThanOrEqual(
      shoreFringe.levelRange.max,
    );
    expect(getSubzone(mapOneSubzones, "south-west").levelRange.min).toBeGreaterThan(
      shoreFringe.levelRange.max,
    );
    expect(getSubzone(mapOneSubzones, "south-center").levelRange.min).toBeGreaterThanOrEqual(3);
    expect(getSubzone(mapOneSubzones, "south-east").levelRange.min).toBeGreaterThanOrEqual(4);
    expect(getSubzone(mapOneSubzones, "north-east").levelRange.min).toBeGreaterThanOrEqual(5);
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

function assertSubzoneContentDensity(
  subzones: ZoneSubzone[],
  enemies: Array<{ subzoneId: string }>,
) {
  for (const subzone of subzones) {
    expect(enemies.filter((enemy) => enemy.subzoneId === subzone.id)).toHaveLength(
      subzone.displayName === "Orc Approach"
        ? 10
        : subzone.displayName === "Old Grove" ||
            subzone.displayName === "Wolf Causeway"
        ? 8
        : 6,
    );
    expect(subzone.resourceLocations.length).toBe(
      [
        "Shore Fringe",
        "Scout Rise",
        "Broken Thicket",
        "Shaman Watch",
      ].includes(subzone.displayName)
        ? 2
        : 3,
    );
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

function assertSubzones(mapId: DebugMapId, subzones: ZoneSubzone[]) {
  const map = createDebugMap(mapId);

  for (const subzone of subzones) {
    assertBoundsInsideMap(map, subzone);
    expect(subzone.encounterAreas.length).toBeGreaterThan(0);

    for (const passage of subzone.passages) {
      assertOpenReachablePosition(map, passage.position);
      if (isNearMapEdge(map, passage.position)) {
        throw new Error(`${passage.id} is too close to ${mapId} edge`);
      }
      if (isWallAdjacent(map, passage.position)) {
        throw new Error(`${passage.id} is wall-adjacent`);
      }
    }

    for (const encounterArea of subzone.encounterAreas) {
      expect(encounterArea.subzoneId).toBe(subzone.id);
      expect(isInsideSubzone(subzone, encounterArea.center)).toBe(true);
      assertOpenReachablePosition(map, encounterArea.center);
      if (isWallAdjacent(map, encounterArea.center)) {
        throw new Error(`${encounterArea.id} is wall-adjacent`);
      }
    }

    for (const resourceLocation of subzone.resourceLocations) {
      expect(resourceLocation.subzoneId).toBe(subzone.id);
      expect(isInsideSubzone(subzone, resourceLocation.position)).toBe(true);
      assertOpenReachablePosition(map, resourceLocation.position);
      if (isWallAdjacent(map, resourceLocation.position)) {
        throw new Error(`${resourceLocation.id} is wall-adjacent`);
      }
      const hasTravelDistance = subzone.encounterAreas.some(
        (encounterArea) =>
          getDistance(resourceLocation.position, encounterArea.center) >=
          encounterArea.radius + 2,
      );
      if (!hasTravelDistance) {
        throw new Error(`${resourceLocation.id} is too close to ${subzone.id} encounter area`);
      }
    }
  }
}

function assertEnemyStartData(
  mapId: DebugMapId,
  subzones: ZoneSubzone[],
  enemies: Array<{
    id: string;
    position: Position;
    subzoneId: string;
    encounterAreaId: string;
  }>,
) {
  const map = createDebugMap(mapId);

  for (const enemy of enemies) {
    const subzone = subzones.find((candidate) => candidate.id === enemy.subzoneId);
    const encounterArea = subzone?.encounterAreas.find(
      (candidate) => candidate.id === enemy.encounterAreaId,
    );

    expect(subzone).toBeDefined();
    expect(encounterArea).toBeDefined();
    expect(subzone && isInsideSubzone(subzone, enemy.position)).toBe(true);
    expect(
      encounterArea &&
        getDistance(enemy.position, encounterArea.center) <= encounterArea.radius,
    ).toBe(true);
    assertOpenReachablePosition(map, enemy.position);
    if (isWallAdjacent(map, enemy.position)) {
      throw new Error(`${enemy.id} is wall-adjacent`);
    }
  }
}

function assertSubzoneNameLabels(
  mapId: DebugMapId,
  subzones: ZoneSubzone[],
  labels: Array<{ id: string; subzoneId: string; text: string; position: Position }>,
) {
  const map = createDebugMap(mapId);

  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    const subzone = getSubzone(subzones, label.subzoneId);

    expect(label.text).toBe(subzone.displayName);
    expect(isInsideSubzone(subzone, label.position)).toBe(true);
    assertOpenReachablePosition(map, label.position);
    if (isWallAdjacent(map, label.position)) {
      throw new Error(`${label.id} is wall-adjacent`);
    }
  }
}

function assertBoundsInsideMap(map: GameMap, subzone: ZoneSubzone) {
  expect(subzone.bounds.x).toBeGreaterThanOrEqual(1);
  expect(subzone.bounds.y).toBeGreaterThanOrEqual(1);
  expect(subzone.bounds.x + subzone.bounds.width).toBeLessThanOrEqual(map.columns - 1);
  expect(subzone.bounds.y + subzone.bounds.height).toBeLessThanOrEqual(map.rows - 1);
}

function getSubzone(subzones: ZoneSubzone[], subzoneId: string): ZoneSubzone {
  const subzone = subzones.find((candidate) => candidate.id === subzoneId);
  if (!subzone) {
    throw new Error(`Missing subzone ${subzoneId}`);
  }

  return subzone;
}

function isInsideSubzone(subzone: ZoneSubzone, position: Position): boolean {
  return (
    position.x >= subzone.bounds.x &&
    position.x < subzone.bounds.x + subzone.bounds.width &&
    position.y >= subzone.bounds.y &&
    position.y < subzone.bounds.y + subzone.bounds.height
  );
}

function isNearMapEdge(map: GameMap, position: Position): boolean {
  return (
    position.x <= 3 ||
    position.y <= 3 ||
    position.x >= map.columns - 4 ||
    position.y >= map.rows - 4
  );
}

function getDistance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
