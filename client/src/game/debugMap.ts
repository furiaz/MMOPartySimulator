import type {
  DebugMapId,
  DebugTeleportPoint,
  EnemyArchetypeId,
  GameMap,
  HealingFountain,
  LootTier,
  Position,
  ResourceType,
  ZoneSubzone,
  ZoneSubzoneNameLabel,
  ZoneSubzonePassage,
} from "./types";
import { bakeNavigationGrid } from "./navigation";

export const DEBUG_MAP_COLUMNS = 50;
export const DEBUG_MAP_ROWS = 30;
export const WILDERNESS_MAP_COLUMNS = 160;
export const WILDERNESS_MAP_ROWS = 30;
export const TELEPORTER_ID = "map-1-to-map-2";
export const MAP_TWO_TO_MAP_THREE_TELEPORTER_ID = "map-2-to-map-3";
export const MAP_THREE_TO_MAP_FOUR_TELEPORTER_ID = "map-3-to-map-4";
export const TELEPORTER_RANGE = 10;
export const HUB_MAP_ID: DebugMapId = "hub";
export const MAP_ONE_ID: DebugMapId = "map-1";
export const MAP_TWO_ID: DebugMapId = "map-2";
export const MAP_THREE_ID: DebugMapId = "map-3";
export const MAP_FOUR_ID: DebugMapId = "map-4";

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
  "test-enemy-21",
  "test-enemy-22",
  "test-enemy-23",
  "test-enemy-24",
  "test-enemy-25",
  "test-enemy-26",
  "test-enemy-27",
  "test-enemy-28",
  "test-enemy-29",
  "test-enemy-30",
  "test-enemy-31",
  "test-enemy-32",
  "test-enemy-33",
  "test-enemy-34",
  "test-enemy-35",
  "test-enemy-36",
  "test-enemy-37",
  "test-enemy-38",
  "test-enemy-39",
  "test-enemy-40",
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
  "test-resource-ore-4",
  "test-resource-herb-4",
  "test-resource-wood-5",
  "test-resource-ore-5",
  "test-resource-herb-5",
  "test-resource-wood-6",
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
  { x: 28, y: 14 },
  { x: 29, y: 14 },
  { x: 28, y: 15 },
  { x: 29, y: 15 },
];

export const teleporterPosition: Position = { x: 154, y: 12 };
export const mapTwoForwardTeleporterPosition: Position = { x: 154, y: 12 };
export const mapThreeForwardTeleporterPosition: Position = { x: 154, y: 12 };
export const hubTeleporterPosition: Position = { x: 22, y: 20 };
export const mapOneHubTeleporterPosition: Position = { x: 5, y: 12 };
export const mapTwoReturnTeleporterPosition: Position = { x: 5, y: 12 };
export const mapThreeReturnTeleporterPosition: Position = { x: 5, y: 12 };
export const mapFourReturnTeleporterPosition: Position = { x: 5, y: 12 };
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
  { x: 5, y: 14 },
  { x: 6, y: 14 },
  { x: 5, y: 15 },
  { x: 6, y: 15 },
];

const mapOneMapTwoArrivalPositions: Position[] = [
  { x: 28, y: 14 },
  { x: 29, y: 14 },
  { x: 28, y: 15 },
  { x: 29, y: 15 },
];

const mapTwoMapOneArrivalPositions: Position[] = [
  { x: 154, y: 14 },
  { x: 153, y: 14 },
  { x: 154, y: 15 },
  { x: 153, y: 15 },
];

const mapTwoMapThreeArrivalPositions: Position[] = [
  { x: 7, y: 12 },
  { x: 8, y: 12 },
  { x: 7, y: 13 },
  { x: 8, y: 13 },
];

const mapThreeMapTwoArrivalPositions: Position[] = [
  { x: 154, y: 14 },
  { x: 153, y: 14 },
  { x: 154, y: 15 },
  { x: 153, y: 15 },
];

const mapThreeMapFourArrivalPositions: Position[] = [
  { x: 8, y: 12 },
  { x: 9, y: 12 },
  { x: 8, y: 13 },
  { x: 9, y: 13 },
];

const mapFourMapThreeArrivalPositions: Position[] = [
  { x: 154, y: 12 },
  { x: 153, y: 12 },
  { x: 154, y: 13 },
  { x: 153, y: 13 },
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

const MAP_ONE_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "north-west-to-north-center",
    fromSubzoneId: "north-west",
    toSubzoneId: "north-center",
    position: { x: 52, y: 12 },
  },
  {
    id: "north-west-to-south-west",
    fromSubzoneId: "north-west",
    toSubzoneId: "south-west",
    position: { x: 26, y: 24 },
  },
];

const MAP_TWO_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "south-center-to-south-east",
    fromSubzoneId: "south-center",
    toSubzoneId: "south-east",
    position: { x: 105, y: 36 },
  },
  {
    id: "south-east-to-north-east",
    fromSubzoneId: "south-east",
    toSubzoneId: "north-east",
    position: { x: 132, y: 24 },
  },
];

const MAP_THREE_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "south-west-to-north-west",
    fromSubzoneId: "south-west",
    toSubzoneId: "north-west",
    position: { x: 26, y: 24 },
  },
  {
    id: "south-west-to-south-center",
    fromSubzoneId: "south-west",
    toSubzoneId: "south-center",
    position: { x: 52, y: 36 },
  },
];

const MAP_FOUR_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "north-center-to-north-east",
    fromSubzoneId: "north-center",
    toSubzoneId: "north-east",
    position: { x: 105, y: 12 },
  },
  {
    id: "south-east-to-north-east",
    fromSubzoneId: "south-east",
    toSubzoneId: "north-east",
    position: { x: 132, y: 24 },
  },
];

const MAP_ONE_COMPACT_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "north-west-to-north-center",
    fromSubzoneId: "north-west",
    toSubzoneId: "north-center",
    position: { x: 52, y: 12 },
  },
  {
    id: "north-center-to-south-west",
    fromSubzoneId: "north-center",
    toSubzoneId: "south-west",
    position: { x: 105, y: 12 },
  },
];

const MAP_TWO_COMPACT_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "south-center-to-south-east",
    fromSubzoneId: "south-center",
    toSubzoneId: "south-east",
    position: { x: 52, y: 12 },
  },
  {
    id: "south-east-to-north-east",
    fromSubzoneId: "south-east",
    toSubzoneId: "north-east",
    position: { x: 105, y: 12 },
  },
];

const MAP_THREE_COMPACT_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "south-west-to-north-west",
    fromSubzoneId: "south-west",
    toSubzoneId: "north-west",
    position: { x: 52, y: 12 },
  },
  {
    id: "north-west-to-south-center",
    fromSubzoneId: "north-west",
    toSubzoneId: "south-center",
    position: { x: 105, y: 12 },
  },
];

const MAP_FOUR_COMPACT_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "north-center-to-north-east",
    fromSubzoneId: "north-center",
    toSubzoneId: "north-east",
    position: { x: 52, y: 12 },
  },
  {
    id: "north-east-to-south-east",
    fromSubzoneId: "north-east",
    toSubzoneId: "south-east",
    position: { x: 105, y: 12 },
  },
];

const mapOneSourceSubzones: ZoneSubzone[] = [
  {
    id: "north-west",
    displayName: "Shore Fringe",
    bounds: { x: 1, y: 1, width: 51, height: 23 },
    levelRange: { min: 1, max: 1 },
    enemyArchetypeIds: ["slime"],
    encounterAreas: [{ id: "shore-fringe-den", subzoneId: "north-west", center: { x: 26, y: 13 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[0], subzoneId: "north-west", position: { x: 47, y: 21 }, resourceType: "wood" },
      { id: resourceIds[10], subzoneId: "north-west", position: { x: 8, y: 20 }, resourceType: "herb" },
    ],
    passages: getPassagesForSubzone("north-west", MAP_ONE_PASSAGES),
  },
  {
    id: "north-center",
    displayName: "Mossy Glade",
    bounds: { x: 53, y: 1, width: 52, height: 23 },
    levelRange: { min: 1, max: 2 },
    enemyArchetypeIds: ["slime", "cave_bat"],
    encounterAreas: [{ id: "mossy-glade-nest", subzoneId: "north-center", center: { x: 81, y: 16 }, radius: 18, leashRadius: 20 }],
    resourceLocations: [
      { id: resourceIds[1], subzoneId: "north-center", position: { x: 56, y: 20 }, resourceType: "ore" },
      { id: resourceIds[2], subzoneId: "north-center", position: { x: 102, y: 20 }, resourceType: "herb" },
      { id: resourceIds[11], subzoneId: "north-center", position: { x: 58, y: 4 }, resourceType: "wood" },
    ],
    passages: getPassagesForSubzone("north-center", MAP_ONE_PASSAGES),
  },
  {
    id: "south-west",
    displayName: "Lower Shore",
    bounds: { x: 1, y: 25, width: 51, height: 22 },
    levelRange: { min: 2, max: 3 },
    enemyArchetypeIds: ["cave_bat", "forest_spider"],
    encounterAreas: [{ id: "lower-shore-roost", subzoneId: "south-west", center: { x: 27, y: 38 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[4], subzoneId: "south-west", position: { x: 8, y: 43 }, resourceType: "ore" },
      { id: resourceIds[5], subzoneId: "south-west", position: { x: 48, y: 43 }, resourceType: "herb" },
      { id: resourceIds[12], subzoneId: "south-west", position: { x: 7, y: 28 }, resourceType: "wood" },
    ],
    passages: getPassagesForSubzone("south-west", MAP_ONE_PASSAGES),
  },
];

const mapTwoSourceSubzones: ZoneSubzone[] = [
  {
    id: "south-center",
    displayName: "Scout Rise",
    bounds: { x: 53, y: 25, width: 52, height: 22 },
    levelRange: { min: 3, max: 4 },
    enemyArchetypeIds: ["forest_spider", "goblin_scout"],
    encounterAreas: [{ id: "scout-rise-camp", subzoneId: "south-center", center: { x: 80, y: 36 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[3], subzoneId: "south-center", position: { x: 56, y: 43 }, resourceType: "wood" },
      { id: resourceIds[13], subzoneId: "south-center", position: { x: 102, y: 28 }, resourceType: "ore" },
    ],
    passages: getPassagesForSubzone("south-center", MAP_TWO_PASSAGES),
  },
  {
    id: "south-east",
    displayName: "Old Grove",
    bounds: { x: 106, y: 25, width: 53, height: 22 },
    levelRange: { min: 4, max: 5 },
    enemyArchetypeIds: ["goblin_scout", "bog_imp"],
    encounterAreas: [{ id: "old-grove-ring", subzoneId: "south-east", center: { x: 133, y: 37 }, radius: 19, leashRadius: 21 }],
    resourceLocations: [
      { id: resourceIds[6], subzoneId: "south-east", position: { x: 109, y: 43 }, resourceType: "wood" },
      { id: resourceIds[7], subzoneId: "south-east", position: { x: 155, y: 43 }, resourceType: "ore" },
      { id: resourceIds[14], subzoneId: "south-east", position: { x: 154, y: 28 }, resourceType: "herb" },
    ],
    passages: getPassagesForSubzone("south-east", MAP_TWO_PASSAGES),
  },
  {
    id: "north-east",
    displayName: "Wolf Causeway",
    bounds: { x: 106, y: 1, width: 53, height: 23 },
    levelRange: { min: 5, max: 7 },
    enemyArchetypeIds: ["bog_imp", "wolf", "goblin_thrower"],
    encounterAreas: [{ id: "wolf-causeway-pack", subzoneId: "north-east", center: { x: 135, y: 13 }, radius: 20, leashRadius: 22 }],
    resourceLocations: [
      { id: resourceIds[8], subzoneId: "north-east", position: { x: 109, y: 20 }, resourceType: "herb" },
      { id: resourceIds[9], subzoneId: "north-east", position: { x: 156, y: 21 }, resourceType: "wood" },
      { id: resourceIds[15], subzoneId: "north-east", position: { x: 109, y: 4 }, resourceType: "ore" },
    ],
    passages: getPassagesForSubzone("north-east", MAP_TWO_PASSAGES),
  },
];

const mapThreeSourceSubzones: ZoneSubzone[] = [
  {
    id: "south-west",
    displayName: "Broken Thicket",
    bounds: { x: 1, y: 25, width: 51, height: 22 },
    levelRange: { min: 8, max: 9 },
    enemyArchetypeIds: ["stone_crawler", "mossling"],
    encounterAreas: [{ id: "broken-thicket-nest", subzoneId: "south-west", center: { x: 27, y: 36 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[0], subzoneId: "south-west", position: { x: 48, y: 43 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[10], subzoneId: "south-west", position: { x: 7, y: 28 }, resourceType: "herb", tier: 2 },
    ],
    passages: getPassagesForSubzone("south-west", MAP_THREE_PASSAGES),
  },
  {
    id: "north-west",
    displayName: "Crawler Shelf",
    bounds: { x: 1, y: 1, width: 51, height: 23 },
    levelRange: { min: 8, max: 10 },
    enemyArchetypeIds: ["stone_crawler", "goblin_shaman"],
    encounterAreas: [{ id: "crawler-shelf", subzoneId: "north-west", center: { x: 27, y: 11 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[1], subzoneId: "north-west", position: { x: 6, y: 20 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[2], subzoneId: "north-west", position: { x: 49, y: 20 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[11], subzoneId: "north-west", position: { x: 49, y: 4 }, resourceType: "wood", tier: 2 },
    ],
    passages: getPassagesForSubzone("north-west", MAP_THREE_PASSAGES),
  },
  {
    id: "south-center",
    displayName: "Imp Fen",
    bounds: { x: 53, y: 25, width: 52, height: 22 },
    levelRange: { min: 9, max: 10 },
    enemyArchetypeIds: ["mossling", "goblin_shaman"],
    encounterAreas: [{ id: "imp-fen-circle", subzoneId: "south-center", center: { x: 80, y: 36 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[4], subzoneId: "south-center", position: { x: 56, y: 43 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[5], subzoneId: "south-center", position: { x: 102, y: 43 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[12], subzoneId: "south-center", position: { x: 102, y: 28 }, resourceType: "wood", tier: 2 },
    ],
    passages: getPassagesForSubzone("south-center", MAP_THREE_PASSAGES),
  },
];

const mapFourSourceSubzones: ZoneSubzone[] = [
  {
    id: "north-center",
    displayName: "Shaman Watch",
    bounds: { x: 53, y: 1, width: 52, height: 23 },
    levelRange: { min: 10, max: 11 },
    enemyArchetypeIds: ["goblin_shaman", "ash_wisp"],
    encounterAreas: [{ id: "shaman-watch", subzoneId: "north-center", center: { x: 80, y: 11 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[3], subzoneId: "north-center", position: { x: 102, y: 20 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[13], subzoneId: "north-center", position: { x: 58, y: 4 }, resourceType: "ore", tier: 2 },
    ],
    passages: getPassagesForSubzone("north-center", MAP_FOUR_PASSAGES),
  },
  {
    id: "north-east",
    displayName: "Ash Hollow",
    bounds: { x: 106, y: 1, width: 53, height: 23 },
    levelRange: { min: 10, max: 11 },
    enemyArchetypeIds: ["goblin_shaman", "ash_wisp"],
    encounterAreas: [{ id: "ash-hollow", subzoneId: "north-east", center: { x: 133, y: 12 }, radius: 19, leashRadius: 21 }],
    resourceLocations: [
      { id: resourceIds[6], subzoneId: "north-east", position: { x: 109, y: 20 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[7], subzoneId: "north-east", position: { x: 154, y: 21 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[14], subzoneId: "north-east", position: { x: 109, y: 4 }, resourceType: "herb", tier: 2 },
    ],
    passages: getPassagesForSubzone("north-east", MAP_FOUR_PASSAGES),
  },
  {
    id: "south-east",
    displayName: "Orc Approach",
    bounds: { x: 106, y: 25, width: 53, height: 22 },
    levelRange: { min: 11, max: 12 },
    enemyArchetypeIds: ["ash_wisp", "orc"],
    encounterAreas: [{ id: "orc-approach-camp", subzoneId: "south-east", center: { x: 133, y: 37 }, radius: 20, leashRadius: 22 }],
    resourceLocations: [
      { id: resourceIds[8], subzoneId: "south-east", position: { x: 109, y: 43 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[9], subzoneId: "south-east", position: { x: 156, y: 43 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[15], subzoneId: "south-east", position: { x: 154, y: 28 }, resourceType: "ore", tier: 2 },
    ],
    passages: getPassagesForSubzone("south-east", MAP_FOUR_PASSAGES),
  },
];

const MAP_ONE_COMPACT_OFFSETS: Record<string, Position> = {
  "south-west": { x: 105, y: -24 },
};

const MAP_TWO_COMPACT_OFFSETS: Record<string, Position> = {
  "south-center": { x: -52, y: -24 },
  "south-east": { x: -52, y: -24 },
};

const MAP_THREE_COMPACT_OFFSETS: Record<string, Position> = {
  "south-west": { x: 0, y: -24 },
  "north-west": { x: 53, y: 0 },
  "south-center": { x: 53, y: -24 },
};

const MAP_FOUR_COMPACT_OFFSETS: Record<string, Position> = {
  "north-center": { x: -52, y: 0 },
  "north-east": { x: -52, y: 0 },
  "south-east": { x: 0, y: -24 },
};

export const mapOneSubzones: ZoneSubzone[] = compactSubzones(
  mapOneSourceSubzones,
  MAP_ONE_COMPACT_OFFSETS,
  MAP_ONE_COMPACT_PASSAGES,
);

export const mapTwoSubzones: ZoneSubzone[] = compactSubzones(
  mapTwoSourceSubzones,
  MAP_TWO_COMPACT_OFFSETS,
  MAP_TWO_COMPACT_PASSAGES,
);

export const mapThreeSubzones: ZoneSubzone[] = compactSubzones(
  mapThreeSourceSubzones,
  MAP_THREE_COMPACT_OFFSETS,
  MAP_THREE_COMPACT_PASSAGES,
);

export const mapFourSubzones: ZoneSubzone[] = compactSubzones(
  mapFourSourceSubzones,
  MAP_FOUR_COMPACT_OFFSETS,
  MAP_FOUR_COMPACT_PASSAGES,
);

const mapOneSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-1-shore-fringe-entry-label", subzoneId: "north-west", text: "Shore Fringe", position: { x: 8, y: 14 } },
  { id: "map-1-shore-fringe-mossy-label", subzoneId: "north-west", text: "Shore Fringe", position: { x: 47, y: 12 } },
  { id: "map-1-mossy-glade-shore-label", subzoneId: "north-center", text: "Mossy Glade", position: { x: 57, y: 12 } },
  { id: "map-1-shore-fringe-lower-label", subzoneId: "north-west", text: "Shore Fringe", position: { x: 26, y: 21 } },
  { id: "map-1-lower-shore-shore-label", subzoneId: "south-west", text: "Lower Shore", position: { x: 26, y: 27 } },
];

const mapTwoSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-2-scout-rise-entry-label", subzoneId: "south-center", text: "Scout Rise", position: { x: 80, y: 39 } },
  { id: "map-2-scout-rise-old-label", subzoneId: "south-center", text: "Scout Rise", position: { x: 100, y: 36 } },
  { id: "map-2-old-grove-scout-label", subzoneId: "south-east", text: "Old Grove", position: { x: 110, y: 36 } },
  { id: "map-2-old-grove-wolf-label", subzoneId: "south-east", text: "Old Grove", position: { x: 132, y: 27 } },
  { id: "map-2-wolf-causeway-old-label", subzoneId: "north-east", text: "Wolf Causeway", position: { x: 132, y: 21 } },
  { id: "map-2-wolf-causeway-exit-label", subzoneId: "north-east", text: "Wolf Causeway", position: { x: 151, y: 12 } },
];

const mapThreeSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-2-broken-thicket-entry-label", subzoneId: "south-west", text: "Broken Thicket", position: { x: 8, y: 36 } },
  { id: "map-2-broken-thicket-crawler-label", subzoneId: "south-west", text: "Broken Thicket", position: { x: 26, y: 27 } },
  { id: "map-2-crawler-shelf-broken-label", subzoneId: "north-west", text: "Crawler Shelf", position: { x: 26, y: 21 } },
  { id: "map-2-broken-thicket-imp-label", subzoneId: "south-west", text: "Broken Thicket", position: { x: 47, y: 36 } },
  { id: "map-2-imp-fen-broken-label", subzoneId: "south-center", text: "Imp Fen", position: { x: 57, y: 36 } },
  { id: "map-3-imp-fen-exit-label", subzoneId: "south-center", text: "Imp Fen", position: { x: 100, y: 36 } },
];

const mapFourSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-4-shaman-watch-entry-label", subzoneId: "north-center", text: "Shaman Watch", position: { x: 60, y: 12 } },
  { id: "map-4-shaman-watch-ash-label", subzoneId: "north-center", text: "Shaman Watch", position: { x: 100, y: 12 } },
  { id: "map-4-ash-hollow-shaman-label", subzoneId: "north-east", text: "Ash Hollow", position: { x: 110, y: 12 } },
  { id: "map-4-orc-approach-ash-label", subzoneId: "south-east", text: "Orc Approach", position: { x: 132, y: 27 } },
  { id: "map-4-ash-hollow-orc-label", subzoneId: "north-east", text: "Ash Hollow", position: { x: 132, y: 21 } },
];

export const mapOneSubzoneNameLabels: ZoneSubzoneNameLabel[] = compactSubzoneNameLabels(
  mapOneSourceSubzoneNameLabels,
  MAP_ONE_COMPACT_OFFSETS,
);

export const mapTwoSubzoneNameLabels: ZoneSubzoneNameLabel[] = compactSubzoneNameLabels(
  mapTwoSourceSubzoneNameLabels,
  MAP_TWO_COMPACT_OFFSETS,
);

export const mapThreeSubzoneNameLabels: ZoneSubzoneNameLabel[] = compactSubzoneNameLabels(
  mapThreeSourceSubzoneNameLabels,
  MAP_THREE_COMPACT_OFFSETS,
);

export const mapFourSubzoneNameLabels: ZoneSubzoneNameLabel[] = compactSubzoneNameLabels(
  mapFourSourceSubzoneNameLabels,
  MAP_FOUR_COMPACT_OFFSETS,
);

const mapOneProgressionEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[0], position: { x: 10, y: 9 }, archetypeId: "slime", subzoneId: "north-west", encounterAreaId: "shore-fringe-den" },
  { id: enemyIds[1], position: { x: 20, y: 14 }, archetypeId: "slime", subzoneId: "north-west", encounterAreaId: "shore-fringe-den" },
  { id: enemyIds[2], position: { x: 33, y: 8 }, archetypeId: "slime", subzoneId: "north-west", encounterAreaId: "shore-fringe-den" },
  { id: enemyIds[3], position: { x: 16, y: 19 }, archetypeId: "slime", subzoneId: "north-west", encounterAreaId: "shore-fringe-den" },
  { id: enemyIds[4], position: { x: 29, y: 16 }, archetypeId: "slime", subzoneId: "north-west", encounterAreaId: "shore-fringe-den" },
  { id: enemyIds[5], position: { x: 43, y: 13 }, archetypeId: "slime", subzoneId: "north-west", encounterAreaId: "shore-fringe-den" },
  { id: enemyIds[6], position: { x: 65, y: 10 }, archetypeId: "slime", subzoneId: "north-center", encounterAreaId: "mossy-glade-nest" },
  { id: enemyIds[7], position: { x: 73, y: 16 }, archetypeId: "cave_bat", subzoneId: "north-center", encounterAreaId: "mossy-glade-nest" },
  { id: enemyIds[8], position: { x: 88, y: 12 }, archetypeId: "slime", subzoneId: "north-center", encounterAreaId: "mossy-glade-nest" },
  { id: enemyIds[9], position: { x: 67, y: 20 }, archetypeId: "slime", subzoneId: "north-center", encounterAreaId: "mossy-glade-nest" },
  { id: enemyIds[10], position: { x: 95, y: 8 }, archetypeId: "cave_bat", subzoneId: "north-center", encounterAreaId: "mossy-glade-nest" },
  { id: enemyIds[11], position: { x: 98, y: 17 }, archetypeId: "slime", subzoneId: "north-center", encounterAreaId: "mossy-glade-nest" },
  { id: enemyIds[12], position: { x: 11, y: 34 }, archetypeId: "cave_bat", subzoneId: "south-west", encounterAreaId: "lower-shore-roost" },
  { id: enemyIds[13], position: { x: 22, y: 42 }, archetypeId: "forest_spider", subzoneId: "south-west", encounterAreaId: "lower-shore-roost" },
  { id: enemyIds[14], position: { x: 34, y: 33 }, archetypeId: "cave_bat", subzoneId: "south-west", encounterAreaId: "lower-shore-roost" },
  { id: enemyIds[15], position: { x: 14, y: 44 }, archetypeId: "cave_bat", subzoneId: "south-west", encounterAreaId: "lower-shore-roost" },
  { id: enemyIds[16], position: { x: 38, y: 32 }, archetypeId: "forest_spider", subzoneId: "south-west", encounterAreaId: "lower-shore-roost" },
  { id: enemyIds[17], position: { x: 43, y: 43 }, archetypeId: "cave_bat", subzoneId: "south-west", encounterAreaId: "lower-shore-roost" },
  { id: enemyIds[18], position: { x: 64, y: 32 }, archetypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-camp" },
  { id: enemyIds[19], position: { x: 80, y: 39 }, archetypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-camp" },
  { id: enemyIds[20], position: { x: 96, y: 32 }, archetypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-camp" },
  { id: enemyIds[21], position: { x: 68, y: 40 }, archetypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-camp" },
  { id: enemyIds[22], position: { x: 84, y: 31 }, archetypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-camp" },
  { id: enemyIds[23], position: { x: 96, y: 40 }, archetypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-camp" },
  { id: enemyIds[24], position: { x: 116, y: 32 }, archetypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[25], position: { x: 133, y: 38 }, archetypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[26], position: { x: 151, y: 33 }, archetypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[27], position: { x: 124, y: 43 }, archetypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[28], position: { x: 118, y: 41 }, archetypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[29], position: { x: 127, y: 31 }, archetypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[30], position: { x: 141, y: 32 }, archetypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[31], position: { x: 150, y: 40 }, archetypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-ring" },
  { id: enemyIds[32], position: { x: 116, y: 9 }, archetypeId: "bog_imp", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
  { id: enemyIds[33], position: { x: 133, y: 14 }, archetypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
  { id: enemyIds[34], position: { x: 150, y: 9 }, archetypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
  { id: enemyIds[35], position: { x: 142, y: 20 }, archetypeId: "goblin_thrower", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
  { id: enemyIds[36], position: { x: 118, y: 17 }, archetypeId: "bog_imp", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
  { id: enemyIds[37], position: { x: 126, y: 6 }, archetypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
  { id: enemyIds[38], position: { x: 144, y: 7 }, archetypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
  { id: enemyIds[39], position: { x: 154, y: 16 }, archetypeId: "goblin_thrower", subzoneId: "north-east", encounterAreaId: "wolf-causeway-pack" },
];

export const mapOneEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapOneSubzones,
  compactEnemyStartData(mapOneProgressionEnemyStartData, MAP_ONE_COMPACT_OFFSETS),
);

export const mapTwoEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapTwoSubzones,
  compactEnemyStartData(mapOneProgressionEnemyStartData, MAP_TWO_COMPACT_OFFSETS),
);

const mapTwoProgressionEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[0], position: { x: 12, y: 34 }, archetypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-nest" },
  { id: enemyIds[1], position: { x: 27, y: 39 }, archetypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-nest" },
  { id: enemyIds[2], position: { x: 43, y: 33 }, archetypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-nest" },
  { id: enemyIds[3], position: { x: 17, y: 41 }, archetypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-nest" },
  { id: enemyIds[4], position: { x: 34, y: 31 }, archetypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-nest" },
  { id: enemyIds[5], position: { x: 43, y: 39 }, archetypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-nest" },
  { id: enemyIds[6], position: { x: 12, y: 8 }, archetypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf" },
  { id: enemyIds[7], position: { x: 28, y: 13 }, archetypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf" },
  { id: enemyIds[8], position: { x: 43, y: 8 }, archetypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf" },
  { id: enemyIds[9], position: { x: 16, y: 17 }, archetypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf" },
  { id: enemyIds[10], position: { x: 31, y: 6 }, archetypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf" },
  { id: enemyIds[11], position: { x: 43, y: 14 }, archetypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf" },
  { id: enemyIds[12], position: { x: 64, y: 33 }, archetypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-circle" },
  { id: enemyIds[13], position: { x: 80, y: 39 }, archetypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-circle" },
  { id: enemyIds[14], position: { x: 96, y: 33 }, archetypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-circle" },
  { id: enemyIds[15], position: { x: 68, y: 40 }, archetypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-circle" },
  { id: enemyIds[16], position: { x: 84, y: 31 }, archetypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-circle" },
  { id: enemyIds[17], position: { x: 96, y: 40 }, archetypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-circle" },
  { id: enemyIds[18], position: { x: 64, y: 8 }, archetypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[19], position: { x: 80, y: 13 }, archetypeId: "ash_wisp", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[20], position: { x: 96, y: 8 }, archetypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[21], position: { x: 67, y: 17 }, archetypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[22], position: { x: 84, y: 6 }, archetypeId: "ash_wisp", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[23], position: { x: 95, y: 14 }, archetypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[24], position: { x: 116, y: 8 }, archetypeId: "goblin_shaman", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[25], position: { x: 133, y: 14 }, archetypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[26], position: { x: 151, y: 9 }, archetypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[27], position: { x: 118, y: 16 }, archetypeId: "goblin_shaman", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[28], position: { x: 127, y: 6 }, archetypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[29], position: { x: 149, y: 15 }, archetypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[30], position: { x: 116, y: 33 }, archetypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[31], position: { x: 132, y: 39 }, archetypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[32], position: { x: 150, y: 33 }, archetypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[33], position: { x: 124, y: 43 }, archetypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[34], position: { x: 142, y: 43 }, archetypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[35], position: { x: 116, y: 40 }, archetypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[36], position: { x: 124, y: 31 }, archetypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[37], position: { x: 134, y: 33 }, archetypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[38], position: { x: 143, y: 36 }, archetypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[39], position: { x: 151, y: 40 }, archetypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
];

export const mapThreeEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapThreeSubzones,
  compactEnemyStartData(mapTwoProgressionEnemyStartData, MAP_THREE_COMPACT_OFFSETS),
);

export const mapFourEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapFourSubzones,
  compactEnemyStartData(mapTwoProgressionEnemyStartData, MAP_FOUR_COMPACT_OFFSETS),
);

export const mapOneEnemyStartPositions: Position[] = mapOneEnemyStartData.map(
  (enemy) => enemy.position,
);

export const mapTwoEnemyStartPositions: Position[] = mapTwoEnemyStartData.map(
  (enemy) => enemy.position,
);

export const mapThreeEnemyStartPositions: Position[] = mapThreeEnemyStartData.map(
  (enemy) => enemy.position,
);

export const mapFourEnemyStartPositions: Position[] = mapFourEnemyStartData.map(
  (enemy) => enemy.position,
);

export const mapOneResourceStartData: ResourceStartData[] =
  createResourceStartData(mapOneSubzones);

export const mapTwoResourceStartData: ResourceStartData[] =
  createResourceStartData(mapTwoSubzones);

export const mapThreeResourceStartData: ResourceStartData[] =
  createResourceStartData(mapThreeSubzones);

export const mapFourResourceStartData: ResourceStartData[] =
  createResourceStartData(mapFourSubzones);

export type ResourceStartData = {
  id: string;
  position: Position;
  resourceType: ResourceType;
  tier?: LootTier;
  subzoneId?: string;
};

export type EnemyStartData = {
  id: string;
  position: Position;
  archetypeId: EnemyArchetypeId;
  subzoneId: string;
  encounterAreaId: string;
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
  ...createVerticalWall(52, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
  ...createVerticalWall(105, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
  ...createHorizontalWall(5, 18, 30, []),
  ...createVerticalWall(24, 5, 11, []),
  ...createHorizontalWall(15, 30, 42, []),
  ...createVerticalWall(41, 15, 20, []),
  ...createHorizontalWall(6, 60, 73, []),
  ...createVerticalWall(73, 6, 12, []),
  ...createHorizontalWall(14, 82, 96, []),
  ...createVerticalWall(90, 14, 21, []),
  ...createHorizontalWall(6, 114, 130, []),
  ...createVerticalWall(130, 6, 13, []),
  ...createHorizontalWall(17, 112, 124, []),
  ...createVerticalWall(144, 11, 19, []),
  ...createHorizontalWall(22, 134, 149, []),
]);

const MAP_TWO_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, WILDERNESS_MAP_ROWS),
  ...createVerticalWall(52, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
  ...createVerticalWall(105, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
]);

const MAP_FOUR_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, WILDERNESS_MAP_ROWS),
  ...createVerticalWall(52, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
  ...createVerticalWall(105, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
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
    subzones?: ZoneSubzone[];
    subzoneNameLabels?: ZoneSubzoneNameLabel[];
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
    subzones: mapOneSubzones,
    subzoneNameLabels: mapOneSubzoneNameLabels,
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
        arrivalPositions: mapOneMapTwoArrivalPositions,
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
    subzones: mapTwoSubzones,
    subzoneNameLabels: mapTwoSubzoneNameLabels,
    teleports: [
      {
        id: "map-2-to-map-1",
        position: mapTwoReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_TWO_ID,
        targetMapId: MAP_ONE_ID,
        arrivalPositions: mapTwoMapOneArrivalPositions,
      },
      {
        id: MAP_TWO_TO_MAP_THREE_TELEPORTER_ID,
        position: mapTwoForwardTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_TWO_ID,
        targetMapId: MAP_THREE_ID,
        arrivalPositions: mapTwoMapThreeArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
      },
    ],
  },
  [MAP_THREE_ID]: {
    id: MAP_THREE_ID,
    displayName: "Third Wild Map",
    debugName: "map-3",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: WILDERNESS_MAP_ROWS,
    walls: MAP_TWO_WALLS,
    healingFountains: [],
    subzones: mapThreeSubzones,
    subzoneNameLabels: mapThreeSubzoneNameLabels,
    teleports: [
      {
        id: "map-3-to-map-2",
        position: mapThreeReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_THREE_ID,
        targetMapId: MAP_TWO_ID,
        arrivalPositions: mapThreeMapTwoArrivalPositions,
      },
      {
        id: MAP_THREE_TO_MAP_FOUR_TELEPORTER_ID,
        position: mapThreeForwardTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_THREE_ID,
        targetMapId: MAP_FOUR_ID,
        arrivalPositions: mapThreeMapFourArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
      },
    ],
  },
  [MAP_FOUR_ID]: {
    id: MAP_FOUR_ID,
    displayName: "Fourth Wild Map",
    debugName: "map-4",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: WILDERNESS_MAP_ROWS,
    walls: MAP_FOUR_WALLS,
    healingFountains: [],
    subzones: mapFourSubzones,
    subzoneNameLabels: mapFourSubzoneNameLabels,
    teleports: [
      {
        id: "map-4-to-map-3",
        position: mapFourReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_FOUR_ID,
        targetMapId: MAP_THREE_ID,
        arrivalPositions: mapFourMapThreeArrivalPositions,
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
    subzones: definition.subzones,
    subzoneNameLabels: definition.subzoneNameLabels,
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

function compactSubzones(
  subzones: ZoneSubzone[],
  offsetsBySubzoneId: Record<string, Position>,
  passages: ZoneSubzonePassage[],
): ZoneSubzone[] {
  return subzones.map((subzone) => {
    const offset = getCompactOffset(subzone.id, offsetsBySubzoneId);

    return {
      ...subzone,
      bounds: {
        ...subzone.bounds,
        x: subzone.bounds.x + offset.x,
        y: subzone.bounds.y + offset.y,
      },
      encounterAreas: subzone.encounterAreas.map((encounterArea) => ({
        ...encounterArea,
        center: offsetPosition(encounterArea.center, offset),
      })),
      resourceLocations: subzone.resourceLocations.map((resourceLocation) => ({
        ...resourceLocation,
        position: offsetPosition(resourceLocation.position, offset),
      })),
      passages: getPassagesForSubzone(subzone.id, passages),
    };
  });
}

function compactSubzoneNameLabels(
  labels: ZoneSubzoneNameLabel[],
  offsetsBySubzoneId: Record<string, Position>,
): ZoneSubzoneNameLabel[] {
  return labels.map((label) => ({
    ...label,
    position: offsetPosition(
      label.position,
      getCompactOffset(label.subzoneId, offsetsBySubzoneId),
    ),
  }));
}

function compactEnemyStartData(
  enemies: EnemyStartData[],
  offsetsBySubzoneId: Record<string, Position>,
): EnemyStartData[] {
  return enemies.map((enemy) => ({
    ...enemy,
    position: offsetPosition(
      enemy.position,
      getCompactOffset(enemy.subzoneId, offsetsBySubzoneId),
    ),
  }));
}

function getCompactOffset(
  subzoneId: string,
  offsetsBySubzoneId: Record<string, Position>,
): Position {
  return offsetsBySubzoneId[subzoneId] ?? { x: 0, y: 0 };
}

function offsetPosition(position: Position, offset: Position): Position {
  return {
    x: position.x + offset.x,
    y: position.y + offset.y,
  };
}

function getPassagesForSubzone(
  subzoneId: string,
  passages: ZoneSubzonePassage[],
): ZoneSubzonePassage[] {
  return passages.filter(
    (passage) =>
      passage.fromSubzoneId === subzoneId || passage.toSubzoneId === subzoneId,
  );
}

function createResourceStartData(subzones: ZoneSubzone[]): ResourceStartData[] {
  return subzones.flatMap((subzone) =>
    subzone.resourceLocations.map((resource) => ({
      id: resource.id,
      position: resource.position,
      resourceType: resource.resourceType,
      tier: resource.tier,
      subzoneId: resource.subzoneId,
    })),
  );
}

function createEnemyStartData(
  subzones: ZoneSubzone[],
  enemies: EnemyStartData[],
): EnemyStartData[] {
  const encounterAreaIds = new Set(
    subzones.flatMap((subzone) =>
      subzone.encounterAreas.map((encounterArea) => encounterArea.id),
    ),
  );

  return enemies.filter((enemy) => encounterAreaIds.has(enemy.encounterAreaId));
}
