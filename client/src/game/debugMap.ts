import type {
  DebugMapId,
  DebugTeleportPoint,
  GameMap,
  Position,
  ResourceType,
} from "./types";
import { bakeNavigationGrid } from "./navigation";

export const DEBUG_MAP_COLUMNS = 50;
export const DEBUG_MAP_ROWS = 26;
export const TELEPORTER_ID = "map-1-to-map-2";
export const TELEPORTER_RANGE = 10;
export const HUB_MAP_ID: DebugMapId = "hub";
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

export const npcIds = [
  "hub-quest-giver",
  "hub-merchant",
  "hub-smith",
  "hub-dog",
  "hub-test-blade",
  "hub-test-hunter",
];

export const companionStartPositions: Position[] = [
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 3, y: 4 },
  { x: 4, y: 4 },
];

export const hubCompanionStartPositions: Position[] = [
  { x: 7, y: 20 },
  { x: 8, y: 20 },
  { x: 7, y: 21 },
  { x: 8, y: 21 },
];

export const mapTwoCompanionStartPositions: Position[] = [
  { x: 3, y: 22 },
  { x: 4, y: 22 },
  { x: 3, y: 21 },
  { x: 4, y: 21 },
];

export const teleporterPosition: Position = { x: 46, y: 22 };
export const hubTeleporterPosition: Position = { x: 22, y: 20 };
export const mapOneHubTeleporterPosition: Position = { x: 3, y: 22 };
export const mapTwoReturnTeleporterPosition: Position = { x: 3, y: 22 };

const hubArrivalPositions: Position[] = [
  { x: 22, y: 21 },
  { x: 23, y: 21 },
  { x: 21, y: 21 },
  { x: 22, y: 22 },
];

const mapOneHubArrivalPositions: Position[] = [
  { x: 3, y: 21 },
  { x: 4, y: 21 },
  { x: 3, y: 22 },
  { x: 4, y: 22 },
];

const mapOneMapTwoArrivalPositions: Position[] = [
  { x: 46, y: 21 },
  { x: 47, y: 21 },
  { x: 45, y: 21 },
  { x: 47, y: 22 },
];

export const hubNpcStartData = [
  {
    id: npcIds[0],
    position: { x: 22, y: 13 },
    displayName: "Quest Giver",
    npcRole: "quest_giver",
  },
  {
    id: npcIds[1],
    position: { x: 18, y: 15 },
    displayName: "Merchant",
    npcRole: "merchant",
  },
  {
    id: npcIds[2],
    position: { x: 26, y: 15 },
    displayName: "Smith",
    npcRole: "smith",
  },
  {
    id: npcIds[3],
    position: { x: 20, y: 17 },
    displayName: "Dog",
    npcRole: "dog",
  },
  {
    id: npcIds[4],
    position: { x: 30, y: 13 },
    displayName: "Test Blade",
    npcRole: "test_blade",
  },
  {
    id: npcIds[5],
    position: { x: 30, y: 17 },
    displayName: "Test Hunter",
    npcRole: "test_hunter",
  },
] as const;

export const mapOneEnemyStartPositions: Position[] = [
  { x: 5, y: 4 },
  { x: 10, y: 6 },
  { x: 22, y: 5 },
  { x: 28, y: 7 },
  { x: 39, y: 5 },
  { x: 45, y: 6 },
  { x: 6, y: 15 },
  { x: 20, y: 14 },
  { x: 27, y: 15 },
  { x: 38, y: 14 },
  { x: 45, y: 15 },
  { x: 5, y: 22 },
  { x: 18, y: 23 },
  { x: 29, y: 23 },
];

export const mapTwoEnemyStartPositions: Position[] = [
  { x: 5, y: 5 },
  { x: 16, y: 4 },
  { x: 31, y: 5 },
  { x: 45, y: 5 },
  { x: 5, y: 13 },
  { x: 18, y: 13 },
  { x: 32, y: 13 },
  { x: 45, y: 13 },
  { x: 6, y: 20 },
  { x: 17, y: 20 },
  { x: 28, y: 20 },
  { x: 43, y: 20 },
  { x: 46, y: 23 },
  { x: 33, y: 11 },
];

export const mapOneResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 4, y: 6 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 11, y: 4 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 23, y: 7 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 40, y: 7 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 46, y: 4 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 5, y: 17 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 21, y: 16 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 29, y: 14 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 38, y: 16 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 44, y: 22 }, resourceType: "wood" },
];

export const mapTwoResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 4, y: 4 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 15, y: 6 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 30, y: 6 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 45, y: 4 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 4, y: 15 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 18, y: 15 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 32, y: 15 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 45, y: 15 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 5, y: 20 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 34, y: 20 }, resourceType: "wood" },
];

export type ResourceStartData = {
  id: string;
  position: Position;
  resourceType: ResourceType;
};

const HUB_WALLS = dedupeWalls([
  ...createPerimeterWalls(DEBUG_MAP_COLUMNS, DEBUG_MAP_ROWS),
  ...createHorizontalWall(6, 12, 35, [
    [21, 24],
  ]),
  ...createHorizontalWall(19, 12, 35, [
    [20, 24],
  ]),
  ...createVerticalWall(12, 6, 19, [
    [11, 14],
  ]),
  ...createVerticalWall(35, 6, 19, [
    [11, 14],
  ]),
  ...createHorizontalWall(22, 2, 12, [
    [5, 9],
  ]),
  ...createVerticalWall(13, 19, 23, [
    [20, 22],
  ]),
]);

const MAP_ONE_WALLS = dedupeWalls([
  ...createPerimeterWalls(DEBUG_MAP_COLUMNS, DEBUG_MAP_ROWS),
  ...createVerticalWall(14, 4, DEBUG_MAP_ROWS - 5, [
    [7, 9],
    [15, 17],
  ]),
  ...createVerticalWall(32, 4, DEBUG_MAP_ROWS - 5, [
    [6, 8],
    [14, 16],
  ]),
  ...createHorizontalWall(11, 5, DEBUG_MAP_COLUMNS - 5, [
    [8, 12],
    [25, 29],
    [40, 44],
  ]),
  ...createHorizontalWall(19, 5, DEBUG_MAP_COLUMNS - 5, [
    [6, 10],
    [22, 26],
    [37, 41],
  ]),
]);

const MAP_TWO_WALLS = dedupeWalls([
  ...createPerimeterWalls(DEBUG_MAP_COLUMNS, DEBUG_MAP_ROWS),
  ...createVerticalWall(10, 4, DEBUG_MAP_ROWS - 4, [
    [7, 9],
    [17, 19],
  ]),
  ...createVerticalWall(25, 3, DEBUG_MAP_ROWS - 4, [
    [5, 7],
    [14, 16],
  ]),
  ...createVerticalWall(39, 4, DEBUG_MAP_ROWS - 4, [
    [10, 12],
    [18, 20],
  ]),
  ...createHorizontalWall(8, 4, DEBUG_MAP_COLUMNS - 4, [
    [6, 11],
    [22, 27],
    [37, 42],
  ]),
  ...createHorizontalWall(17, 4, DEBUG_MAP_COLUMNS - 4, [
    [7, 11],
    [23, 27],
    [38, 42],
  ]),
  ...createHorizontalWall(22, 5, DEBUG_MAP_COLUMNS - 6, [
    [14, 18],
    [30, 34],
  ]),
]);

export const debugMapDefinitions: Record<
  DebugMapId,
  {
    id: DebugMapId;
    displayName: string;
    debugName: string;
    walls: Position[];
    teleports: DebugTeleportPoint[];
  }
> = {
  [HUB_MAP_ID]: {
    id: HUB_MAP_ID,
    displayName: "Harbor Union Bastion",
    debugName: "hub",
    walls: HUB_WALLS,
    teleports: [
      {
        id: "hub-to-map-1",
        position: hubTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: HUB_MAP_ID,
        targetMapId: MAP_ONE_ID,
        arrivalPositions: mapOneHubArrivalPositions,
      },
    ],
  },
  [MAP_ONE_ID]: {
    id: MAP_ONE_ID,
    displayName: "First Wild Map",
    debugName: "map-1",
    walls: MAP_ONE_WALLS,
    teleports: [
      {
        id: "map-1-to-hub",
        position: mapOneHubTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_ONE_ID,
        targetMapId: HUB_MAP_ID,
        arrivalPositions: hubArrivalPositions,
      },
      {
        id: TELEPORTER_ID,
        position: teleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_ONE_ID,
        targetMapId: MAP_TWO_ID,
        arrivalPositions: mapTwoCompanionStartPositions,
        autoSelectAfterEnemiesCleared: true,
      },
    ],
  },
  [MAP_TWO_ID]: {
    id: MAP_TWO_ID,
    displayName: "Second Wild Map",
    debugName: "map-2",
    walls: MAP_TWO_WALLS,
    teleports: [
      {
        id: "map-2-to-map-1",
        position: mapTwoReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_TWO_ID,
        targetMapId: MAP_ONE_ID,
        arrivalPositions: mapOneMapTwoArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
      },
    ],
  },
};

export function createDebugMap(mapId: DebugMapId = HUB_MAP_ID): GameMap {
  const definition = debugMapDefinitions[mapId];
  const map = {
    id: definition.id,
    displayName: definition.displayName,
    debugName: definition.debugName,
    columns: DEBUG_MAP_COLUMNS,
    rows: DEBUG_MAP_ROWS,
    walls: definition.walls,
    teleports: definition.teleports,
  };

  return {
    ...map,
    navigationGrid: bakeNavigationGrid(map),
  };
}

export function getDebugMapDefinition(mapId: DebugMapId) {
  return debugMapDefinitions[mapId];
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

function createPerimeterWalls(columns: number, rows: number) {
  return [
    ...createHorizontalWall(0, 0, columns - 1, []),
    ...createHorizontalWall(rows - 1, 0, columns - 1, []),
    ...createVerticalWall(0, 1, rows - 2, []),
    ...createVerticalWall(columns - 1, 1, rows - 2, []),
  ];
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
