import type {
  DebugMapId,
  DebugTeleportPoint,
  GameMap,
  HealingFountain,
  LootTier,
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
  "test-enemy-15",
  "test-enemy-16",
  "test-enemy-17",
  "test-enemy-18",
  "test-enemy-19",
  "test-enemy-20",
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
  { x: 10, y: 8 },
  { x: 16, y: 12 },
  { x: 28, y: 7 },
  { x: 34, y: 13 },
  { x: 49, y: 9 },
  { x: 66, y: 11 },
  { x: 73, y: 15 },
  { x: 12, y: 24 },
  { x: 25, y: 22 },
  { x: 35, y: 28 },
  { x: 48, y: 24 },
  { x: 62, y: 27 },
  { x: 71, y: 30 },
  { x: 13, y: 39 },
  { x: 27, y: 42 },
  { x: 39, y: 38 },
  { x: 50, y: 42 },
  { x: 61, y: 37 },
  { x: 70, y: 42 },
  { x: 73, y: 36 },
];

export const mapTwoEnemyStartPositions: Position[] = [
  { x: 9, y: 8 },
  { x: 18, y: 10 },
  { x: 28, y: 7 },
  { x: 44, y: 11 },
  { x: 59, y: 8 },
  { x: 72, y: 12 },
  { x: 12, y: 21 },
  { x: 25, y: 25 },
  { x: 40, y: 22 },
  { x: 55, y: 19 },
  { x: 69, y: 24 },
  { x: 10, y: 35 },
  { x: 21, y: 40 },
  { x: 33, y: 36 },
  { x: 45, y: 41 },
  { x: 57, y: 34 },
  { x: 65, y: 39 },
  { x: 72, y: 34 },
  { x: 51, y: 28 },
  { x: 30, y: 29 },
];

export const mapOneResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 7, y: 12 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 23, y: 8 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 30, y: 16 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 47, y: 11 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 70, y: 16 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 16, y: 27 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 41, y: 31 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 53, y: 25 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 72, y: 32 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 51, y: 41 }, resourceType: "wood" },
];

export const mapTwoResourceStartData: ResourceStartData[] = [
  { id: resourceIds[0], position: { x: 7, y: 14 }, resourceType: "wood", tier: 2 },
  { id: resourceIds[1], position: { x: 22, y: 12 }, resourceType: "ore", tier: 2 },
  { id: resourceIds[2], position: { x: 40, y: 13 }, resourceType: "herb", tier: 2 },
  { id: resourceIds[3], position: { x: 63, y: 13 }, resourceType: "wood", tier: 2 },
  { id: resourceIds[4], position: { x: 16, y: 26 }, resourceType: "ore", tier: 2 },
  { id: resourceIds[5], position: { x: 38, y: 29 }, resourceType: "herb", tier: 2 },
  { id: resourceIds[6], position: { x: 57, y: 24 }, resourceType: "wood", tier: 2 },
  { id: resourceIds[7], position: { x: 73, y: 28 }, resourceType: "ore", tier: 2 },
  { id: resourceIds[8], position: { x: 13, y: 42 }, resourceType: "herb", tier: 2 },
  { id: resourceIds[9], position: { x: 50, y: 41 }, resourceType: "wood", tier: 2 },
];

export type ResourceStartData = {
  id: string;
  position: Position;
  resourceType: ResourceType;
  tier?: LootTier;
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
  ...createVerticalWall(18, 5, WILDERNESS_MAP_ROWS - 6, [
    [9, 14],
    [23, 28],
    [38, 43],
  ]),
  ...createVerticalWall(36, 4, WILDERNESS_MAP_ROWS - 7, [
    [7, 13],
    [24, 30],
    [37, 42],
  ]),
  ...createVerticalWall(55, 6, WILDERNESS_MAP_ROWS - 7, [
    [8, 13],
    [23, 29],
    [36, 41],
  ]),
  ...createHorizontalWall(17, 6, WILDERNESS_MAP_COLUMNS - 7, [
    [10, 16],
    [27, 34],
    [47, 53],
    [65, 74],
  ]),
  ...createHorizontalWall(33, 7, WILDERNESS_MAP_COLUMNS - 8, [
    [10, 16],
    [25, 32],
    [45, 52],
    [63, 72],
  ]),
  ...createVerticalWall(67, 18, 32, [
    [22, 26],
  ]),
  ...createHorizontalWall(25, 19, 35, [
    [25, 31],
  ]),
]);

const MAP_TWO_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, WILDERNESS_MAP_ROWS),
  ...createVerticalWall(15, 5, WILDERNESS_MAP_ROWS - 6, [
    [8, 13],
    [22, 27],
    [38, 43],
  ]),
  ...createVerticalWall(32, 5, WILDERNESS_MAP_ROWS - 7, [
    [7, 12],
    [23, 29],
    [36, 41],
  ]),
  ...createVerticalWall(50, 4, WILDERNESS_MAP_ROWS - 7, [
    [9, 14],
    [22, 28],
    [37, 42],
  ]),
  ...createVerticalWall(66, 6, WILDERNESS_MAP_ROWS - 8, [
    [10, 15],
    [24, 30],
    [36, 40],
  ]),
  ...createHorizontalWall(16, 6, WILDERNESS_MAP_COLUMNS - 7, [
    [8, 13],
    [24, 30],
    [42, 48],
    [60, 72],
  ]),
  ...createHorizontalWall(31, 7, WILDERNESS_MAP_COLUMNS - 8, [
    [9, 14],
    [24, 31],
    [43, 49],
    [61, 71],
  ]),
  ...createHorizontalWall(24, 51, 65, [
    [55, 61],
  ]),
  ...createVerticalWall(41, 17, 30, [
    [20, 25],
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
