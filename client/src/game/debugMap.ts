import type {
  DebugMapId,
  DebugTeleportPoint,
  GameMap,
  HealingFountain,
  Position,
  ResourceType,
} from "./types";
import { bakeNavigationGrid } from "./navigation";

export const DEBUG_MAP_COLUMNS = 50;
export const DEBUG_MAP_ROWS = 26;
export const WILDERNESS_MAP_COLUMNS = 80;
export const WILDERNESS_MAP_ROWS = 48;
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
  { x: 5, y: 41 },
  { x: 6, y: 41 },
  { x: 5, y: 40 },
  { x: 6, y: 40 },
];

export const teleporterPosition: Position = { x: 75, y: 41 };
export const hubTeleporterPosition: Position = { x: 22, y: 20 };
export const mapOneHubTeleporterPosition: Position = { x: 5, y: 41 };
export const mapTwoReturnTeleporterPosition: Position = { x: 5, y: 41 };
export const HUB_HEALING_FOUNTAIN_RANGE = 5;
export const hubHealingFountains: HealingFountain[] = [
  {
    id: "hub-healing-fountain",
    position: { x: 22, y: 16 },
    range: HUB_HEALING_FOUNTAIN_RANGE,
  },
];

const hubArrivalPositions: Position[] = [
  { x: 22, y: 21 },
  { x: 23, y: 21 },
  { x: 21, y: 21 },
  { x: 22, y: 22 },
];

const mapOneHubArrivalPositions: Position[] = [
  { x: 5, y: 40 },
  { x: 6, y: 40 },
  { x: 5, y: 41 },
  { x: 6, y: 41 },
];

const mapOneMapTwoArrivalPositions: Position[] = [
  { x: 75, y: 40 },
  { x: 74, y: 40 },
  { x: 75, y: 41 },
  { x: 74, y: 41 },
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
  { x: 9, y: 8 },
  { x: 15, y: 13 },
  { x: 29, y: 9 },
  { x: 34, y: 19 },
  { x: 50, y: 8 },
  { x: 70, y: 12 },
  { x: 11, y: 25 },
  { x: 27, y: 31 },
  { x: 45, y: 27 },
  { x: 57, y: 37 },
  { x: 68, y: 28 },
  { x: 14, y: 38 },
  { x: 37, y: 42 },
  { x: 64, y: 42 },
];

export const mapTwoEnemyStartPositions: Position[] = [
  { x: 10, y: 9 },
  { x: 24, y: 7 },
  { x: 45, y: 9 },
  { x: 72, y: 8 },
  { x: 13, y: 20 },
  { x: 31, y: 23 },
  { x: 55, y: 20 },
  { x: 70, y: 24 },
  { x: 9, y: 35 },
  { x: 25, y: 39 },
  { x: 43, y: 34 },
  { x: 61, y: 39 },
  { x: 72, y: 37 },
  { x: 55, y: 29 },
];

export const mapOneResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 7, y: 12 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 18, y: 8 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 30, y: 16 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 47, y: 11 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 70, y: 16 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 16, y: 27 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 36, y: 31 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 53, y: 25 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 72, y: 32 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 51, y: 41 }, resourceType: "wood" },
];

export const mapTwoResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 7, y: 14 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 22, y: 12 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 39, y: 15 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 63, y: 13 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 16, y: 26 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 38, y: 29 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 57, y: 24 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 72, y: 30 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 13, y: 42 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 50, y: 41 }, resourceType: "wood" },
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
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, WILDERNESS_MAP_ROWS),
  ...createVerticalWall(20, 5, WILDERNESS_MAP_ROWS - 6, [
    [10, 14],
    [25, 29],
    [38, 42],
  ]),
  ...createVerticalWall(40, 5, WILDERNESS_MAP_ROWS - 6, [
    [8, 12],
    [26, 30],
    [39, 43],
  ]),
  ...createVerticalWall(60, 6, WILDERNESS_MAP_ROWS - 7, [
    [11, 15],
    [27, 31],
    [38, 42],
  ]),
  ...createHorizontalWall(18, 5, WILDERNESS_MAP_COLUMNS - 6, [
    [12, 17],
    [31, 36],
    [50, 55],
    [68, 73],
  ]),
  ...createHorizontalWall(34, 6, WILDERNESS_MAP_COLUMNS - 7, [
    [9, 14],
    [28, 33],
    [47, 52],
    [65, 70],
  ]),
]);

const MAP_TWO_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, WILDERNESS_MAP_ROWS),
  ...createVerticalWall(16, 5, WILDERNESS_MAP_ROWS - 6, [
    [11, 15],
    [24, 28],
    [38, 42],
  ]),
  ...createVerticalWall(34, 4, WILDERNESS_MAP_ROWS - 7, [
    [8, 12],
    [22, 26],
    [35, 39],
  ]),
  ...createVerticalWall(52, 5, WILDERNESS_MAP_ROWS - 6, [
    [10, 14],
    [23, 27],
    [37, 41],
  ]),
  ...createVerticalWall(68, 6, WILDERNESS_MAP_ROWS - 8, [
    [12, 16],
    [26, 30],
  ]),
  ...createHorizontalWall(17, 5, WILDERNESS_MAP_COLUMNS - 6, [
    [8, 13],
    [25, 30],
    [43, 48],
    [61, 66],
  ]),
  ...createHorizontalWall(32, 6, WILDERNESS_MAP_COLUMNS - 7, [
    [10, 15],
    [28, 33],
    [46, 51],
    [62, 67],
  ]),
]);

export const debugMapDefinitions: Record<
  DebugMapId,
  {
    id: DebugMapId;
    displayName: string;
    debugName: string;
    columns: number;
    rows: number;
    walls: Position[];
    teleports: DebugTeleportPoint[];
    healingFountains: HealingFountain[];
  }
> = {
  [HUB_MAP_ID]: {
    id: HUB_MAP_ID,
    displayName: "Harbor Union Bastion",
    debugName: "hub",
    columns: DEBUG_MAP_COLUMNS,
    rows: DEBUG_MAP_ROWS,
    walls: HUB_WALLS,
    healingFountains: hubHealingFountains,
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
    columns: WILDERNESS_MAP_COLUMNS,
    rows: WILDERNESS_MAP_ROWS,
    walls: MAP_ONE_WALLS,
    healingFountains: [],
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
    columns: WILDERNESS_MAP_COLUMNS,
    rows: WILDERNESS_MAP_ROWS,
    walls: MAP_TWO_WALLS,
    healingFountains: [],
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
    columns: definition.columns,
    rows: definition.rows,
    walls: definition.walls,
    teleports: definition.teleports,
    healingFountains: definition.healingFountains,
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
