import type {
  DebugMapId,
  DebugTeleportPoint,
  EnemyVariant,
  EnemyTypeId,
  GameMap,
  HealingFountain,
  LootTier,
  MapVisualObject,
  Position,
  ResourceType,
  ZoneSubzone,
  ZoneSubzoneNameLabel,
  ZoneSubzonePassage,
} from "./types";
import { bakeNavigationGrid } from "./navigation";

export const DEBUG_MAP_COLUMNS = 110;
export const DEBUG_MAP_ROWS = 60;
export const WILDERNESS_MAP_COLUMNS = 160;
export const WILDERNESS_MAP_ROWS = 30;
export const MAP_ONE_ROWS = 57;
export const MAP_TWO_ROWS = MAP_ONE_ROWS;
export const MAP_THREE_ROWS = MAP_ONE_ROWS;
export const TELEPORTER_ID = "map-1-to-map-2";
export const MAP_TWO_TO_MAP_THREE_TELEPORTER_ID = "map-2-to-map-3";
export const MAP_THREE_TO_HUB_TWO_TELEPORTER_ID = "map-3-to-hub-2";
export const HUB_TWO_TO_MAP_THREE_TELEPORTER_ID = "hub-2-to-map-3";
export const HUB_TWO_TO_MAP_FOUR_TELEPORTER_ID = "hub-2-to-map-4";
export const MAP_FOUR_TO_HUB_TWO_TELEPORTER_ID = "map-4-to-hub-2";
export const MAP_FOUR_TO_MAP_FIVE_TELEPORTER_ID = "map-4-to-map-5";
export const MAP_FIVE_TO_MAP_FOUR_TELEPORTER_ID = "map-5-to-map-4";
export const MAP_FIVE_TO_MAP_SIX_TELEPORTER_ID = "map-5-to-map-6";
export const MAP_SIX_TO_MAP_FIVE_TELEPORTER_ID = "map-6-to-map-5";
export const MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID = "map-6-to-map-7";
export const MAP_SEVEN_TO_MAP_SIX_TELEPORTER_ID = "map-7-to-map-6";
export const HUB_TWO_NORTH_ROUTE_TELEPORTER_ID = "hub-2-north-route";
export const HUB_TWO_EAST_ROUTE_TELEPORTER_ID = "hub-2-east-route";
export const TELEPORTER_RANGE = 10;
export const HUB_MAP_ID: DebugMapId = "hub";
export const HUB_TWO_MAP_ID: DebugMapId = "hub-2";
export const MAP_ONE_ID: DebugMapId = "map-1";
export const MAP_TWO_ID: DebugMapId = "map-2";
export const MAP_THREE_ID: DebugMapId = "map-3";
export const MAP_FOUR_ID: DebugMapId = "map-4";
export const MAP_FIVE_ID: DebugMapId = "map-5";
export const MAP_SIX_ID: DebugMapId = "map-6";
export const MAP_SEVEN_ID: DebugMapId = "map-7";
export const SLIMEWARD_CAMP_ID: DebugMapId = "slimeward-camp";
export const SLIMEWARD_FLOOR_ONE_ID: DebugMapId = "slimeward-floor-1";
export const SLIMEWARD_FLOOR_TWO_ID: DebugMapId = "slimeward-floor-2";
export const MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID =
  "map-3-to-slimeward-camp";
export const HUB_TO_SLIMEWARD_CAMP_TELEPORTER_ID = "hub-to-slimeward-camp";
export const SLIMEWARD_CAMP_TO_MAP_THREE_TELEPORTER_ID =
  "slimeward-camp-to-map-3";
export const SLIMEWARD_CAMP_TO_FLOOR_ONE_TELEPORTER_ID =
  "slimeward-camp-to-floor-1";
export const SLIMEWARD_CAMP_BROKEN_EXIT_TELEPORTER_ID =
  "slimeward-camp-broken-exit";
export const SLIMEWARD_FLOOR_ONE_TO_CAMP_TELEPORTER_ID =
  "slimeward-floor-1-to-camp";
export const SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID =
  "slimeward-floor-1-to-floor-2";
export const SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID =
  "slimeward-floor-2-exit";
export const SLIMEWARD_BOSS_ID = "slimeward-azure-mass";
export const SLIMEWARD_CHEST_ID = "slimeward-boss-chest";
export const SLIMEWARD_CHEST_POSITION: Position = { x: 138, y: 22 };
export const SLIMEWARD_EXIT_POSITION: Position = { x: 144, y: 22 };
export const CLASS_MENTOR_NPC_ID = "hub-class-mentor";

export const companionIds = [
  "test-companion-1",
  "test-companion-2",
  "test-companion-3",
  "test-companion-4",
];

export const enemyIds = Array.from({ length: 72 }, (_, index) =>
  index === 0 ? "test-enemy" : `test-enemy-${index + 1}`,
);

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
  "test-resource-ore-6",
  "test-resource-herb-6",
];

export const npcIds = [
  "hub-quest-giver",
  "hub-merchant",
  "hub-smith",
  "hub-bank-chest",
  "hub-dog",
  "hub-test-blade",
];

export const companionStartPositions: Position[] = [
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 3, y: 4 },
  { x: 4, y: 4 },
];

export const hubCompanionStartPositions: Position[] = [
  { x: 12, y: 51 },
  { x: 13, y: 51 },
  { x: 12, y: 52 },
  { x: 13, y: 52 },
];

export const hubTwoCompanionStartPositions: Position[] = [
  { x: 64, y: 36 },
  { x: 65, y: 36 },
  { x: 64, y: 37 },
  { x: 65, y: 37 },
];

export const mapTwoCompanionStartPositions: Position[] = [
  { x: 28, y: 29 },
  { x: 29, y: 29 },
  { x: 28, y: 30 },
  { x: 29, y: 30 },
];

export const teleporterPosition: Position = { x: 154, y: 29 };
export const mapTwoForwardTeleporterPosition: Position = { x: 154, y: 29 };
export const mapThreeForwardTeleporterPosition: Position = { x: 154, y: 29 };
export const mapThreeSlimewardCampTeleporterPosition: Position = { x: 154, y: 8 };
export const hubTeleporterPosition: Position = { x: 102, y: 30 };
export const hubTwoWestTeleporterPosition: Position = { x: 5, y: 36 };
export const hubTwoSouthTeleporterPosition: Position = { x: 66, y: 66 };
export const hubTwoNorthTeleporterPosition: Position = { x: 66, y: 6 };
export const hubTwoEastTeleporterPosition: Position = { x: 126, y: 36 };
export const mapOneHubTeleporterPosition: Position = { x: 5, y: 29 };
export const mapTwoReturnTeleporterPosition: Position = { x: 5, y: 29 };
export const mapThreeReturnTeleporterPosition: Position = { x: 5, y: 29 };
export const mapFourReturnTeleporterPosition: Position = { x: 5, y: 12 };
export const mapFourForwardTeleporterPosition: Position = { x: 154, y: 12 };
export const mapFiveReturnTeleporterPosition: Position = { x: 5, y: 12 };
export const mapFiveForwardTeleporterPosition: Position = { x: 154, y: 29 };
export const mapSixReturnTeleporterPosition: Position = { x: 5, y: 29 };
export const mapSixForwardTeleporterPosition: Position = { x: 154, y: 16 };
export const mapSevenReturnTeleporterPosition: Position = { x: 5, y: 16 };
export const HUB_HEALING_FOUNTAIN_RANGE = 5;
export const HUB_TWO_HEALING_FOUNTAIN_RANGE = 5;
export const hubHealingFountains: HealingFountain[] = [
  {
    id: "hub-healing-fountain",
    position: { x: 55, y: 32 },
    range: HUB_HEALING_FOUNTAIN_RANGE,
  },
];
export const hubTwoHealingFountains: HealingFountain[] = [
  {
    id: "hub-2-healing-fountain",
    position: { x: 66, y: 35 },
    range: HUB_TWO_HEALING_FOUNTAIN_RANGE,
  },
];
export const targetDummyId = "hub-target-dummy";
export const targetDummyPosition: Position = { x: 77, y: 42 };
export const aoeTargetDummyId = "hub-aoe-target-dummy";
export const aoeTargetDummyPosition: Position = { x: 55, y: 8 };

const hubArrivalPositions: Position[] = [
  { x: 99, y: 30 },
  { x: 100, y: 30 },
  { x: 99, y: 31 },
  { x: 100, y: 31 },
];

const mapOneHubArrivalPositions: Position[] = [
  { x: 7, y: 29 },
  { x: 8, y: 29 },
  { x: 7, y: 30 },
  { x: 8, y: 30 },
];

const mapOneMapTwoArrivalPositions: Position[] = [
  { x: 7, y: 29 },
  { x: 8, y: 29 },
  { x: 7, y: 30 },
  { x: 8, y: 30 },
];

const mapTwoMapOneArrivalPositions: Position[] = [
  { x: 154, y: 31 },
  { x: 153, y: 31 },
  { x: 154, y: 32 },
  { x: 153, y: 32 },
];

const mapTwoMapThreeArrivalPositions: Position[] = [
  { x: 7, y: 29 },
  { x: 8, y: 29 },
  { x: 7, y: 30 },
  { x: 8, y: 30 },
];

const mapThreeMapTwoArrivalPositions: Position[] = [
  { x: 154, y: 29 },
  { x: 153, y: 29 },
  { x: 154, y: 30 },
  { x: 153, y: 30 },
];

const mapThreeHubTwoArrivalPositions: Position[] = [
  { x: 10, y: 36 },
  { x: 11, y: 36 },
  { x: 10, y: 37 },
  { x: 11, y: 37 },
];

const hubTwoMapThreeArrivalPositions: Position[] = [
  { x: 154, y: 29 },
  { x: 153, y: 29 },
  { x: 154, y: 30 },
  { x: 153, y: 30 },
];

const hubTwoMapFourArrivalPositions: Position[] = [
  { x: 8, y: 12 },
  { x: 9, y: 12 },
  { x: 8, y: 13 },
  { x: 9, y: 13 },
];

const mapFourHubTwoArrivalPositions: Position[] = [
  { x: 65, y: 62 },
  { x: 66, y: 62 },
  { x: 65, y: 63 },
  { x: 66, y: 63 },
];

const mapFourMapFiveArrivalPositions: Position[] = [
  { x: 7, y: 12 },
  { x: 8, y: 12 },
  { x: 7, y: 13 },
  { x: 8, y: 13 },
];

const mapFiveMapFourArrivalPositions: Position[] = [
  { x: 154, y: 12 },
  { x: 153, y: 12 },
  { x: 154, y: 13 },
  { x: 153, y: 13 },
];

const mapFiveMapSixArrivalPositions: Position[] = [
  { x: 7, y: 29 },
  { x: 8, y: 29 },
  { x: 7, y: 30 },
  { x: 8, y: 30 },
];

const mapSixMapFiveArrivalPositions: Position[] = [
  { x: 154, y: 29 },
  { x: 153, y: 29 },
  { x: 154, y: 30 },
  { x: 153, y: 30 },
];

const mapSixMapSevenArrivalPositions: Position[] = [
  { x: 7, y: 16 },
  { x: 8, y: 16 },
  { x: 7, y: 17 },
  { x: 8, y: 17 },
];

const mapSevenMapSixArrivalPositions: Position[] = [
  { x: 154, y: 16 },
  { x: 153, y: 16 },
  { x: 154, y: 17 },
  { x: 153, y: 17 },
];

export const slimewardCampArrivalPositions: Position[] = [
  { x: 12, y: 17 },
  { x: 13, y: 17 },
  { x: 12, y: 18 },
  { x: 13, y: 18 },
];

export const slimewardCampDungeonEntranceArrivalPositions: Position[] = [
  { x: 28, y: 17 },
  { x: 29, y: 17 },
  { x: 28, y: 18 },
  { x: 29, y: 18 },
];

export const mapThreeSlimewardArrivalPositions: Position[] = [
  { x: 154, y: 8 },
  { x: 153, y: 8 },
  { x: 154, y: 9 },
  { x: 153, y: 9 },
];

export const slimewardFloorOneArrivalPositions: Position[] = [
  { x: 8, y: 20 },
  { x: 9, y: 20 },
  { x: 8, y: 21 },
  { x: 9, y: 21 },
];

export const slimewardFloorTwoArrivalPositions: Position[] = [
  { x: 8, y: 20 },
  { x: 9, y: 20 },
  { x: 8, y: 21 },
  { x: 9, y: 21 },
];

export const hubNpcStartData = [
  {
    id: npcIds[0],
    position: { x: 43, y: 28 },
    displayName: "Quest Giver",
    npcRole: "quest_giver",
  },
  {
    id: npcIds[1],
    position: { x: 42, y: 45 },
    displayName: "Merchant",
    npcRole: "merchant",
  },
  {
    id: npcIds[2],
    position: { x: 67, y: 28 },
    displayName: "Smith",
    npcRole: "smith",
  },
  {
    id: npcIds[3],
    position: { x: 61, y: 32 },
    displayName: "Bank Chest",
    npcRole: "bank_chest",
  },
  {
    id: npcIds[4],
    position: { x: 58, y: 33 },
    displayName: "Dog",
    npcRole: "dog",
  },
  {
    id: npcIds[5],
    position: { x: 73, y: 42 },
    displayName: "Test Blade",
    npcRole: "test_blade",
  },
  {
    id: "hub-guild-coordinator",
    position: { x: 50, y: 56 },
    displayName: "Guild Coordinator",
    npcRole: "guild_coordinator",
  },
  {
    id: "hub-tavern-keeper",
    position: { x: 61, y: 56 },
    displayName: "Inn Keeper",
    npcRole: "tavern_keeper",
  },
  {
    id: "hub-farmer",
    position: { x: 18, y: 46 },
    displayName: "Farmer",
    npcRole: "farmer",
  },
  {
    id: "hub-livestock-keeper",
    position: { x: 18, y: 27 },
    displayName: "Livestock",
    npcRole: "livestock_keeper",
  },
] as const;

export const classMentorNpcStartData = {
  id: CLASS_MENTOR_NPC_ID,
  position: { x: 65, y: 35 },
  displayName: "Class Mentor",
  npcRole: "class_mentor",
} as const;

export const hubTwoNpcStartData = [
  {
    id: "hub-2-quest-giver",
    position: { x: 56, y: 31 },
    displayName: "Quest Giver",
    npcRole: "quest_giver",
  },
  {
    id: "hub-2-merchant",
    position: { x: 42, y: 48 },
    displayName: "Merchant",
    npcRole: "merchant",
  },
  {
    id: "hub-2-smith",
    position: { x: 90, y: 48 },
    displayName: "Smith",
    npcRole: "smith",
  },
  {
    id: "hub-2-bank-chest",
    position: { x: 72, y: 35 },
    displayName: "Bank Chest",
    npcRole: "bank_chest",
  },
  {
    id: "hub-2-bounty-board",
    position: { x: 66, y: 49 },
    displayName: "Bounty Board",
    npcRole: "bounty_board",
  },
  {
    id: "hub-2-dog-west",
    position: { x: 29, y: 37 },
    displayName: "Bastion Dog",
    npcRole: "dog",
  },
  {
    id: "hub-2-dog-south",
    position: { x: 70, y: 58 },
    displayName: "Gate Dog",
    npcRole: "dog",
  },
  {
    id: "hub-2-guild-coordinator",
    position: { x: 107, y: 60 },
    displayName: "Guild Coordinator",
    npcRole: "guild_coordinator",
  },
  {
    id: "hub-2-tavern-keeper",
    position: { x: 117, y: 60 },
    displayName: "Inn Keeper",
    npcRole: "tavern_keeper",
  },
  {
    id: "hub-2-farmer",
    position: { x: 18, y: 43 },
    displayName: "Farmer",
    npcRole: "farmer",
  },
  {
    id: "hub-2-livestock-keeper",
    position: { x: 119, y: 43 },
    displayName: "Livestock",
    npcRole: "livestock_keeper",
  },
] as const;

export const hubTwoClassMentorNpcStartData = {
  ...classMentorNpcStartData,
  position: { x: 76, y: 31 },
} as const;

export const slimewardCampNpcStartData = [
  {
    id: "slimeward-camp-dog",
    position: { x: 18, y: 19 },
    displayName: "Camp Dog",
    npcRole: "dog",
  },
] as const;

const MAP_ONE_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "shore-fringe-to-mossy-glade",
    fromSubzoneId: "shore-fringe",
    toSubzoneId: "mossy-glade",
    position: { x: 52, y: 29 },
  },
  {
    id: "mossy-glade-to-lower-shore",
    fromSubzoneId: "mossy-glade",
    toSubzoneId: "lower-shore",
    position: { x: 105, y: 29 },
  },
];

const MAP_TWO_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "scout-rise-to-old-grove",
    fromSubzoneId: "south-center",
    toSubzoneId: "south-east",
    position: { x: 52, y: 29 },
  },
  {
    id: "old-grove-to-wolf-causeway",
    fromSubzoneId: "south-east",
    toSubzoneId: "north-east",
    position: { x: 105, y: 29 },
  },
];

const MAP_THREE_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "south-west-to-north-west",
    fromSubzoneId: "south-west",
    toSubzoneId: "north-west",
    position: { x: 52, y: 29 },
  },
  {
    id: "north-west-to-south-center",
    fromSubzoneId: "north-west",
    toSubzoneId: "south-center",
    position: { x: 105, y: 29 },
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

const MAP_FIVE_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "crossing-to-burrows",
    fromSubzoneId: "crossing",
    toSubzoneId: "burrows",
    position: { x: 52, y: 29 },
  },
  {
    id: "burrows-to-thornfield",
    fromSubzoneId: "burrows",
    toSubzoneId: "thornfield",
    position: { x: 105, y: 29 },
  },
];

const MAP_SIX_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "mire-to-canopy",
    fromSubzoneId: "mire",
    toSubzoneId: "canopy",
    position: { x: 52, y: 29 },
  },
  {
    id: "canopy-to-oldroot",
    fromSubzoneId: "canopy",
    toSubzoneId: "oldroot",
    position: { x: 105, y: 29 },
  },
];

const MAP_SEVEN_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "plaza-to-garden",
    fromSubzoneId: "plaza",
    toSubzoneId: "garden",
    position: { x: 80, y: 16 },
  },
];

const MAP_TWO_COMPACT_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "scout-rise-to-old-grove",
    fromSubzoneId: "south-center",
    toSubzoneId: "south-east",
    position: { x: 52, y: 29 },
  },
  {
    id: "old-grove-to-wolf-causeway",
    fromSubzoneId: "south-east",
    toSubzoneId: "north-east",
    position: { x: 105, y: 29 },
  },
];

const MAP_THREE_COMPACT_PASSAGES: ZoneSubzonePassage[] = [
  {
    id: "south-west-to-north-west",
    fromSubzoneId: "south-west",
    toSubzoneId: "north-west",
    position: { x: 52, y: 29 },
  },
  {
    id: "north-west-to-south-center",
    fromSubzoneId: "north-west",
    toSubzoneId: "south-center",
    position: { x: 105, y: 29 },
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

const MAP_FIVE_COMPACT_PASSAGES = MAP_FIVE_PASSAGES;
const MAP_SIX_COMPACT_PASSAGES = MAP_SIX_PASSAGES;

const mapOneSourceSubzones: ZoneSubzone[] = [
  {
    id: "shore-fringe",
    displayName: "Shore",
    bounds: { x: 1, y: 1, width: 51, height: 55 },
    levelRange: { min: 1, max: 1 },
    enemyTypeIds: ["green_slime"],
    encounterAreas: [
      { id: "shore-fringe-north-den", subzoneId: "shore-fringe", center: { x: 27, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "shore-fringe-south-den", subzoneId: "shore-fringe", center: { x: 28, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[0], subzoneId: "shore-fringe", position: { x: 9, y: 8 }, resourceType: "wood" },
      { id: resourceIds[1], subzoneId: "shore-fringe", position: { x: 47, y: 25 }, resourceType: "herb" },
      { id: resourceIds[2], subzoneId: "shore-fringe", position: { x: 10, y: 51 }, resourceType: "ore" },
    ],
    passages: getPassagesForSubzone("shore-fringe", MAP_ONE_PASSAGES),
  },
  {
    id: "mossy-glade",
    displayName: "Glade",
    bounds: { x: 53, y: 1, width: 52, height: 55 },
    levelRange: { min: 2, max: 2 },
    enemyTypeIds: ["cave_bat"],
    encounterAreas: [
      { id: "mossy-glade-north-roost", subzoneId: "mossy-glade", center: { x: 79, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "mossy-glade-south-roost", subzoneId: "mossy-glade", center: { x: 79, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[3], subzoneId: "mossy-glade", position: { x: 58, y: 51 }, resourceType: "ore" },
      { id: resourceIds[4], subzoneId: "mossy-glade", position: { x: 101, y: 8 }, resourceType: "wood" },
      { id: resourceIds[5], subzoneId: "mossy-glade", position: { x: 101, y: 51 }, resourceType: "herb" },
    ],
    passages: getPassagesForSubzone("mossy-glade", MAP_ONE_PASSAGES),
  },
  {
    id: "lower-shore",
    displayName: "Lowbank",
    bounds: { x: 106, y: 1, width: 53, height: 55 },
    levelRange: { min: 3, max: 3 },
    enemyTypeIds: ["forest_spider"],
    encounterAreas: [
      { id: "lower-shore-north-nest", subzoneId: "lower-shore", center: { x: 132, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "lower-shore-south-nest", subzoneId: "lower-shore", center: { x: 132, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[6], subzoneId: "lower-shore", position: { x: 110, y: 8 }, resourceType: "herb" },
      { id: resourceIds[7], subzoneId: "lower-shore", position: { x: 150, y: 51 }, resourceType: "ore" },
      { id: resourceIds[8], subzoneId: "lower-shore", position: { x: 110, y: 51 }, resourceType: "wood" },
    ],
    passages: getPassagesForSubzone("lower-shore", MAP_ONE_PASSAGES),
  },
];

const mapTwoSourceSubzones: ZoneSubzone[] = [
  {
    id: "south-center",
    displayName: "Outskirts",
    bounds: { x: 1, y: 1, width: 51, height: 55 },
    levelRange: { min: 3, max: 4 },
    enemyTypeIds: ["forest_spider", "goblin_scout"],
    encounterAreas: [
      { id: "scout-rise-north-camp", subzoneId: "south-center", center: { x: 27, y: 16 }, radius: 21, leashRadius: 23 },
      { id: "scout-rise-south-camp", subzoneId: "south-center", center: { x: 28, y: 42 }, radius: 21, leashRadius: 23 },
    ],
    resourceLocations: [
      { id: resourceIds[3], subzoneId: "south-center", position: { x: 8, y: 50 }, resourceType: "wood" },
      { id: resourceIds[13], subzoneId: "south-center", position: { x: 47, y: 7 }, resourceType: "ore" },
    ],
    passages: getPassagesForSubzone("south-center", MAP_TWO_PASSAGES),
  },
  {
    id: "south-east",
    displayName: "Thicket",
    bounds: { x: 53, y: 1, width: 52, height: 55 },
    levelRange: { min: 4, max: 5 },
    enemyTypeIds: ["goblin_scout", "bog_imp"],
    encounterAreas: [
      { id: "old-grove-north-ring", subzoneId: "south-east", center: { x: 79, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "old-grove-south-ring", subzoneId: "south-east", center: { x: 80, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[6], subzoneId: "south-east", position: { x: 58, y: 50 }, resourceType: "wood" },
      { id: resourceIds[7], subzoneId: "south-east", position: { x: 100, y: 50 }, resourceType: "ore" },
      { id: resourceIds[14], subzoneId: "south-east", position: { x: 101, y: 7 }, resourceType: "herb" },
    ],
    passages: getPassagesForSubzone("south-east", MAP_TWO_PASSAGES),
  },
  {
    id: "north-east",
    displayName: "Causeway",
    bounds: { x: 106, y: 1, width: 53, height: 55 },
    levelRange: { min: 5, max: 7 },
    enemyTypeIds: ["bog_imp", "wolf", "goblin_thrower"],
    encounterAreas: [
      { id: "wolf-causeway-north-pack", subzoneId: "north-east", center: { x: 132, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "wolf-causeway-south-pack", subzoneId: "north-east", center: { x: 133, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[8], subzoneId: "north-east", position: { x: 110, y: 50 }, resourceType: "herb" },
      { id: resourceIds[9], subzoneId: "north-east", position: { x: 155, y: 50 }, resourceType: "wood" },
      { id: resourceIds[15], subzoneId: "north-east", position: { x: 110, y: 7 }, resourceType: "ore" },
    ],
    passages: getPassagesForSubzone("north-east", MAP_TWO_PASSAGES),
  },
];

const mapThreeSourceSubzones: ZoneSubzone[] = [
  {
    id: "south-west",
    displayName: "Fen",
    bounds: { x: 1, y: 1, width: 51, height: 55 },
    levelRange: { min: 8, max: 9 },
    enemyTypeIds: ["stone_crawler", "mossling"],
    encounterAreas: [
      { id: "broken-thicket-north-nest", subzoneId: "south-west", center: { x: 27, y: 16 }, radius: 21, leashRadius: 23 },
      { id: "broken-thicket-south-nest", subzoneId: "south-west", center: { x: 28, y: 42 }, radius: 21, leashRadius: 23 },
    ],
    resourceLocations: [
      { id: resourceIds[0], subzoneId: "south-west", position: { x: 8, y: 50 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[10], subzoneId: "south-west", position: { x: 47, y: 7 }, resourceType: "herb", tier: 2 },
    ],
    passages: getPassagesForSubzone("south-west", MAP_THREE_PASSAGES),
  },
  {
    id: "north-west",
    displayName: "Shelf",
    bounds: { x: 53, y: 1, width: 52, height: 55 },
    levelRange: { min: 9, max: 10 },
    enemyTypeIds: ["stone_crawler", "goblin_shaman"],
    encounterAreas: [
      { id: "crawler-shelf-north", subzoneId: "north-west", center: { x: 79, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "crawler-shelf-south", subzoneId: "north-west", center: { x: 80, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[1], subzoneId: "north-west", position: { x: 58, y: 50 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[2], subzoneId: "north-west", position: { x: 101, y: 50 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[11], subzoneId: "north-west", position: { x: 101, y: 7 }, resourceType: "wood", tier: 2 },
    ],
    passages: getPassagesForSubzone("north-west", MAP_THREE_PASSAGES),
  },
  {
    id: "south-center",
    displayName: "Depths",
    bounds: { x: 106, y: 1, width: 53, height: 55 },
    levelRange: { min: 10, max: 10 },
    enemyTypeIds: ["mossling", "goblin_shaman"],
    encounterAreas: [
      { id: "imp-fen-north-circle", subzoneId: "south-center", center: { x: 132, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "imp-fen-south-circle", subzoneId: "south-center", center: { x: 133, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[4], subzoneId: "south-center", position: { x: 110, y: 50 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[5], subzoneId: "south-center", position: { x: 155, y: 50 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[12], subzoneId: "south-center", position: { x: 110, y: 7 }, resourceType: "wood", tier: 2 },
    ],
    passages: getPassagesForSubzone("south-center", MAP_THREE_PASSAGES),
  },
];

const mapFourSourceSubzones: ZoneSubzone[] = [
  {
    id: "north-center",
    displayName: "Watch",
    bounds: { x: 53, y: 1, width: 52, height: 23 },
    levelRange: { min: 10, max: 11 },
    enemyTypeIds: ["goblin_shaman", "ash_wisp"],
    encounterAreas: [{ id: "shaman-watch", subzoneId: "north-center", center: { x: 80, y: 11 }, radius: 17, leashRadius: 19 }],
    resourceLocations: [
      { id: resourceIds[3], subzoneId: "north-center", position: { x: 102, y: 20 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[13], subzoneId: "north-center", position: { x: 58, y: 4 }, resourceType: "ore", tier: 2 },
    ],
    passages: getPassagesForSubzone("north-center", MAP_FOUR_PASSAGES),
  },
  {
    id: "north-east",
    displayName: "Hollow",
    bounds: { x: 106, y: 1, width: 53, height: 23 },
    levelRange: { min: 10, max: 11 },
    enemyTypeIds: ["goblin_shaman", "ash_wisp"],
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
    displayName: "Camp",
    bounds: { x: 106, y: 25, width: 53, height: 22 },
    levelRange: { min: 11, max: 12 },
    enemyTypeIds: ["ash_wisp", "orc"],
    encounterAreas: [{ id: "orc-approach-camp", subzoneId: "south-east", center: { x: 133, y: 37 }, radius: 20, leashRadius: 22 }],
    resourceLocations: [
      { id: resourceIds[8], subzoneId: "south-east", position: { x: 109, y: 43 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[9], subzoneId: "south-east", position: { x: 156, y: 43 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[15], subzoneId: "south-east", position: { x: 154, y: 28 }, resourceType: "ore", tier: 2 },
    ],
    passages: getPassagesForSubzone("south-east", MAP_FOUR_PASSAGES),
  },
];

const mapFiveSourceSubzones: ZoneSubzone[] = [
  {
    id: "crossing",
    displayName: "Crossing",
    bounds: { x: 1, y: 1, width: 51, height: 55 },
    levelRange: { min: 13, max: 13 },
    enemyTypeIds: ["ember_imp"],
    encounterAreas: [
      { id: "crossing-north-sparks", subzoneId: "crossing", center: { x: 27, y: 16 }, radius: 21, leashRadius: 23 },
      { id: "crossing-south-sparks", subzoneId: "crossing", center: { x: 28, y: 42 }, radius: 21, leashRadius: 23 },
    ],
    resourceLocations: [
      { id: resourceIds[0], subzoneId: "crossing", position: { x: 8, y: 50 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[1], subzoneId: "crossing", position: { x: 46, y: 7 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[2], subzoneId: "crossing", position: { x: 12, y: 8 }, resourceType: "herb", tier: 2 },
    ],
    passages: getPassagesForSubzone("crossing", MAP_FIVE_PASSAGES),
  },
  {
    id: "burrows",
    displayName: "Burrows",
    bounds: { x: 53, y: 1, width: 52, height: 55 },
    levelRange: { min: 14, max: 14 },
    enemyTypeIds: ["tin_crawler"],
    encounterAreas: [
      { id: "burrows-north-shells", subzoneId: "burrows", center: { x: 79, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "burrows-south-shells", subzoneId: "burrows", center: { x: 80, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[3], subzoneId: "burrows", position: { x: 58, y: 50 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[4], subzoneId: "burrows", position: { x: 100, y: 50 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[5], subzoneId: "burrows", position: { x: 101, y: 7 }, resourceType: "herb", tier: 2 },
    ],
    passages: getPassagesForSubzone("burrows", MAP_FIVE_PASSAGES),
  },
  {
    id: "thornfield",
    displayName: "Thornfield",
    bounds: { x: 106, y: 1, width: 53, height: 55 },
    levelRange: { min: 15, max: 15 },
    enemyTypeIds: ["briar_wolf"],
    encounterAreas: [
      { id: "thornfield-north-pack", subzoneId: "thornfield", center: { x: 132, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "thornfield-south-pack", subzoneId: "thornfield", center: { x: 133, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[6], subzoneId: "thornfield", position: { x: 110, y: 50 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[7], subzoneId: "thornfield", position: { x: 155, y: 50 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[8], subzoneId: "thornfield", position: { x: 110, y: 7 }, resourceType: "ore", tier: 2 },
    ],
    passages: getPassagesForSubzone("thornfield", MAP_FIVE_PASSAGES),
  },
];

const mapSixSourceSubzones: ZoneSubzone[] = [
  {
    id: "mire",
    displayName: "Mire",
    bounds: { x: 1, y: 1, width: 51, height: 55 },
    levelRange: { min: 16, max: 16 },
    enemyTypeIds: ["mire_spider"],
    encounterAreas: [
      { id: "mire-north-webs", subzoneId: "mire", center: { x: 27, y: 16 }, radius: 21, leashRadius: 23 },
      { id: "mire-south-webs", subzoneId: "mire", center: { x: 28, y: 42 }, radius: 21, leashRadius: 23 },
    ],
    resourceLocations: [
      { id: resourceIds[9], subzoneId: "mire", position: { x: 8, y: 50 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[10], subzoneId: "mire", position: { x: 46, y: 7 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[11], subzoneId: "mire", position: { x: 12, y: 8 }, resourceType: "ore", tier: 2 },
    ],
    passages: getPassagesForSubzone("mire", MAP_SIX_PASSAGES),
  },
  {
    id: "canopy",
    displayName: "Canopy",
    bounds: { x: 53, y: 1, width: 52, height: 55 },
    levelRange: { min: 17, max: 17 },
    enemyTypeIds: ["night_bat"],
    encounterAreas: [
      { id: "canopy-north-roost", subzoneId: "canopy", center: { x: 79, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "canopy-south-roost", subzoneId: "canopy", center: { x: 80, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[12], subzoneId: "canopy", position: { x: 58, y: 50 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[13], subzoneId: "canopy", position: { x: 100, y: 50 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[14], subzoneId: "canopy", position: { x: 101, y: 7 }, resourceType: "herb", tier: 2 },
    ],
    passages: getPassagesForSubzone("canopy", MAP_SIX_PASSAGES),
  },
  {
    id: "oldroot",
    displayName: "Oldroot",
    bounds: { x: 106, y: 1, width: 53, height: 55 },
    levelRange: { min: 18, max: 18 },
    enemyTypeIds: ["elder_mossling"],
    encounterAreas: [
      { id: "oldroot-north-ring", subzoneId: "oldroot", center: { x: 132, y: 16 }, radius: 22, leashRadius: 24 },
      { id: "oldroot-south-ring", subzoneId: "oldroot", center: { x: 133, y: 42 }, radius: 22, leashRadius: 24 },
    ],
    resourceLocations: [
      { id: resourceIds[15], subzoneId: "oldroot", position: { x: 110, y: 50 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[16], subzoneId: "oldroot", position: { x: 155, y: 50 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[17], subzoneId: "oldroot", position: { x: 110, y: 7 }, resourceType: "ore", tier: 2 },
    ],
    passages: getPassagesForSubzone("oldroot", MAP_SIX_PASSAGES),
  },
];

export const mapSevenSubzones: ZoneSubzone[] = [
  {
    id: "plaza",
    displayName: "Plaza",
    bounds: { x: 1, y: 1, width: 79, height: 28 },
    levelRange: { min: 19, max: 19 },
    enemyTypeIds: ["cinder_wisp"],
    encounterAreas: [
      { id: "plaza-ember-ring", subzoneId: "plaza", center: { x: 40, y: 16 }, radius: 25, leashRadius: 29 },
    ],
    resourceLocations: [
      { id: resourceIds[0], subzoneId: "plaza", position: { x: 14, y: 8 }, resourceType: "herb", tier: 2 },
      { id: resourceIds[1], subzoneId: "plaza", position: { x: 66, y: 8 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[2], subzoneId: "plaza", position: { x: 75, y: 25 }, resourceType: "wood", tier: 2 },
    ],
    passages: getPassagesForSubzone("plaza", MAP_SEVEN_PASSAGES),
  },
  {
    id: "garden",
    displayName: "Garden",
    bounds: { x: 81, y: 1, width: 78, height: 28 },
    levelRange: { min: 20, max: 20 },
    enemyTypeIds: ["orc_warmaster"],
    encounterAreas: [
      { id: "garden-war-camp", subzoneId: "garden", center: { x: 120, y: 16 }, radius: 25, leashRadius: 29 },
    ],
    resourceLocations: [
      { id: resourceIds[3], subzoneId: "garden", position: { x: 85, y: 26 }, resourceType: "wood", tier: 2 },
      { id: resourceIds[4], subzoneId: "garden", position: { x: 146, y: 8 }, resourceType: "ore", tier: 2 },
      { id: resourceIds[5], subzoneId: "garden", position: { x: 152, y: 26 }, resourceType: "herb", tier: 2 },
    ],
    passages: getPassagesForSubzone("garden", MAP_SEVEN_PASSAGES),
  },
];

const MAP_TWO_COMPACT_OFFSETS: Record<string, Position> = {
};

const MAP_THREE_COMPACT_OFFSETS: Record<string, Position> = {};

const MAP_FOUR_COMPACT_OFFSETS: Record<string, Position> = {
  "north-center": { x: -52, y: 0 },
  "north-east": { x: -52, y: 0 },
  "south-east": { x: 0, y: -24 },
};

const MAP_FIVE_COMPACT_OFFSETS: Record<string, Position> = {};
const MAP_SIX_COMPACT_OFFSETS: Record<string, Position> = {};

export const mapOneSubzones: ZoneSubzone[] = mapOneSourceSubzones;

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

export const mapFiveSubzones: ZoneSubzone[] = compactSubzones(
  mapFiveSourceSubzones,
  MAP_FIVE_COMPACT_OFFSETS,
  MAP_FIVE_COMPACT_PASSAGES,
);

export const mapSixSubzones: ZoneSubzone[] = compactSubzones(
  mapSixSourceSubzones,
  MAP_SIX_COMPACT_OFFSETS,
  MAP_SIX_COMPACT_PASSAGES,
);

const mapOneSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-1-shore-fringe-entry-label", subzoneId: "shore-fringe", text: "Shore", position: { x: 14, y: 29 } },
  { id: "map-1-shore-fringe-glade-label", subzoneId: "shore-fringe", text: "Shore", position: { x: 46, y: 29 } },
  { id: "map-1-mossy-glade-shore-label", subzoneId: "mossy-glade", text: "Glade", position: { x: 58, y: 29 } },
  { id: "map-1-mossy-glade-shore-exit-label", subzoneId: "mossy-glade", text: "Glade", position: { x: 100, y: 29 } },
  { id: "map-1-lower-shore-glade-label", subzoneId: "lower-shore", text: "Lowbank", position: { x: 110, y: 29 } },
  { id: "map-1-lower-shore-exit-label", subzoneId: "lower-shore", text: "Lowbank", position: { x: 145, y: 29 } },
];

const mapTwoSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-2-scout-rise-entry-label", subzoneId: "south-center", text: "Outskirts", position: { x: 10, y: 29 } },
  { id: "map-2-scout-rise-old-label", subzoneId: "south-center", text: "Outskirts", position: { x: 45, y: 29 } },
  { id: "map-2-old-grove-scout-label", subzoneId: "south-east", text: "Thicket", position: { x: 59, y: 29 } },
  { id: "map-2-old-grove-wolf-label", subzoneId: "south-east", text: "Thicket", position: { x: 99, y: 29 } },
  { id: "map-2-wolf-causeway-old-label", subzoneId: "north-east", text: "Causeway", position: { x: 112, y: 29 } },
  { id: "map-2-wolf-causeway-exit-label", subzoneId: "north-east", text: "Causeway", position: { x: 151, y: 29 } },
];

const mapThreeSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-3-broken-thicket-entry-label", subzoneId: "south-west", text: "Fen", position: { x: 10, y: 29 } },
  { id: "map-3-broken-thicket-crawler-label", subzoneId: "south-west", text: "Fen", position: { x: 45, y: 29 } },
  { id: "map-3-crawler-shelf-broken-label", subzoneId: "north-west", text: "Shelf", position: { x: 59, y: 29 } },
  { id: "map-3-crawler-shelf-imp-label", subzoneId: "north-west", text: "Shelf", position: { x: 99, y: 29 } },
  { id: "map-3-imp-fen-crawler-label", subzoneId: "south-center", text: "Depths", position: { x: 112, y: 29 } },
  { id: "map-3-imp-fen-exit-label", subzoneId: "south-center", text: "Depths", position: { x: 151, y: 29 } },
];

const mapFourSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-4-shaman-watch-entry-label", subzoneId: "north-center", text: "Watch", position: { x: 60, y: 12 } },
  { id: "map-4-shaman-watch-ash-label", subzoneId: "north-center", text: "Watch", position: { x: 100, y: 12 } },
  { id: "map-4-ash-hollow-shaman-label", subzoneId: "north-east", text: "Hollow", position: { x: 110, y: 12 } },
  { id: "map-4-orc-approach-ash-label", subzoneId: "south-east", text: "Camp", position: { x: 132, y: 27 } },
  { id: "map-4-ash-hollow-orc-label", subzoneId: "north-east", text: "Hollow", position: { x: 132, y: 21 } },
];

const mapFiveSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-5-crossing-entry-label", subzoneId: "crossing", text: "Crossing", position: { x: 10, y: 29 } },
  { id: "map-5-crossing-burrows-label", subzoneId: "crossing", text: "Crossing", position: { x: 45, y: 29 } },
  { id: "map-5-burrows-crossing-label", subzoneId: "burrows", text: "Burrows", position: { x: 59, y: 29 } },
  { id: "map-5-burrows-thornfield-label", subzoneId: "burrows", text: "Burrows", position: { x: 99, y: 29 } },
  { id: "map-5-thornfield-burrows-label", subzoneId: "thornfield", text: "Thornfield", position: { x: 112, y: 29 } },
  { id: "map-5-thornfield-exit-label", subzoneId: "thornfield", text: "Thornfield", position: { x: 151, y: 29 } },
];

const mapSixSourceSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-6-mire-entry-label", subzoneId: "mire", text: "Mire", position: { x: 10, y: 29 } },
  { id: "map-6-mire-canopy-label", subzoneId: "mire", text: "Mire", position: { x: 45, y: 29 } },
  { id: "map-6-canopy-mire-label", subzoneId: "canopy", text: "Canopy", position: { x: 59, y: 29 } },
  { id: "map-6-canopy-oldroot-label", subzoneId: "canopy", text: "Canopy", position: { x: 99, y: 29 } },
  { id: "map-6-oldroot-canopy-label", subzoneId: "oldroot", text: "Oldroot", position: { x: 112, y: 29 } },
  { id: "map-6-oldroot-exit-label", subzoneId: "oldroot", text: "Oldroot", position: { x: 151, y: 29 } },
];

export const mapSevenSubzoneNameLabels: ZoneSubzoneNameLabel[] = [
  { id: "map-7-plaza-entry-label", subzoneId: "plaza", text: "Plaza", position: { x: 14, y: 16 } },
  { id: "map-7-plaza-garden-label", subzoneId: "plaza", text: "Plaza", position: { x: 66, y: 16 } },
  { id: "map-7-garden-plaza-label", subzoneId: "garden", text: "Garden", position: { x: 94, y: 16 } },
  { id: "map-7-garden-end-label", subzoneId: "garden", text: "Garden", position: { x: 146, y: 16 } },
];

export const mapOneSubzoneNameLabels: ZoneSubzoneNameLabel[] =
  mapOneSourceSubzoneNameLabels;

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

export const mapFiveSubzoneNameLabels: ZoneSubzoneNameLabel[] = compactSubzoneNameLabels(
  mapFiveSourceSubzoneNameLabels,
  MAP_FIVE_COMPACT_OFFSETS,
);

export const mapSixSubzoneNameLabels: ZoneSubzoneNameLabel[] = compactSubzoneNameLabels(
  mapSixSourceSubzoneNameLabels,
  MAP_SIX_COMPACT_OFFSETS,
);

const mapOneStressEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[0], position: { x: 18, y: 13 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[1], position: { x: 29, y: 9 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[2], position: { x: 41, y: 16 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[3], position: { x: 24, y: 24 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[4], position: { x: 14, y: 14 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[5], position: { x: 34, y: 21 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[6], position: { x: 46, y: 10 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[7], position: { x: 12, y: 28 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-north-den" },
  { id: enemyIds[8], position: { x: 19, y: 39 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[9], position: { x: 31, y: 47 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[10], position: { x: 44, y: 40 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[11], position: { x: 23, y: 51 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[12], position: { x: 13, y: 45 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[13], position: { x: 36, y: 38 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[14], position: { x: 46, y: 50 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[15], position: { x: 28, y: 33 }, enemyTypeId: "green_slime", subzoneId: "shore-fringe", encounterAreaId: "shore-fringe-south-den" },
  { id: enemyIds[16], position: { x: 64, y: 14 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[17], position: { x: 76, y: 9 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[18], position: { x: 90, y: 16 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[19], position: { x: 98, y: 23 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[20], position: { x: 70, y: 18 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[21], position: { x: 82, y: 20 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[22], position: { x: 96, y: 9 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[23], position: { x: 58, y: 18 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-north-roost" },
  { id: enemyIds[24], position: { x: 63, y: 38 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[25], position: { x: 76, y: 48 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[26], position: { x: 91, y: 40 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[27], position: { x: 99, y: 49 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[28], position: { x: 62, y: 50 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[29], position: { x: 72, y: 35 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[30], position: { x: 88, y: 52 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[31], position: { x: 100, y: 37 }, enemyTypeId: "cave_bat", subzoneId: "mossy-glade", encounterAreaId: "mossy-glade-south-roost" },
  { id: enemyIds[32], position: { x: 117, y: 14 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[33], position: { x: 128, y: 8 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[34], position: { x: 140, y: 15 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[35], position: { x: 145, y: 23 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[36], position: { x: 112, y: 24 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[37], position: { x: 125, y: 16 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[38], position: { x: 134, y: 24 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[39], position: { x: 153, y: 16 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-north-nest" },
  { id: enemyIds[40], position: { x: 116, y: 39 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
  { id: enemyIds[41], position: { x: 129, y: 48 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
  { id: enemyIds[42], position: { x: 141, y: 40 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
  { id: enemyIds[43], position: { x: 149, y: 49 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
  { id: enemyIds[44], position: { x: 114, y: 51 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
  { id: enemyIds[45], position: { x: 124, y: 35 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
  { id: enemyIds[46], position: { x: 137, y: 52 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
  { id: enemyIds[47], position: { x: 153, y: 39 }, enemyTypeId: "forest_spider", subzoneId: "lower-shore", encounterAreaId: "lower-shore-south-nest" },
];

export const mapOneEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapOneSubzones,
  mapOneStressEnemyStartData,
);

export const mapTwoEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapTwoSubzones,
  [
    { id: enemyIds[0], position: { x: 12, y: 10 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[1], position: { x: 23, y: 8 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[2], position: { x: 36, y: 11 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[3], position: { x: 44, y: 18 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[4], position: { x: 16, y: 20 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[5], position: { x: 28, y: 23 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[6], position: { x: 39, y: 24 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[7], position: { x: 23, y: 15 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-north-camp" },
    { id: enemyIds[8], position: { x: 11, y: 37 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[9], position: { x: 22, y: 47 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[10], position: { x: 35, y: 36 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[11], position: { x: 45, y: 46 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[12], position: { x: 15, y: 51 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[13], position: { x: 29, y: 34 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[14], position: { x: 39, y: 51 }, enemyTypeId: "forest_spider", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[15], position: { x: 28, y: 43 }, enemyTypeId: "goblin_scout", subzoneId: "south-center", encounterAreaId: "scout-rise-south-camp" },
    { id: enemyIds[16], position: { x: 62, y: 10 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[17], position: { x: 74, y: 8 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[18], position: { x: 88, y: 11 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[19], position: { x: 98, y: 18 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[20], position: { x: 70, y: 21 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[21], position: { x: 78, y: 23 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[22], position: { x: 92, y: 24 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[23], position: { x: 80, y: 15 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-north-ring" },
    { id: enemyIds[24], position: { x: 62, y: 37 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[25], position: { x: 75, y: 48 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[26], position: { x: 89, y: 37 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[27], position: { x: 99, y: 47 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[28], position: { x: 64, y: 51 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[29], position: { x: 78, y: 35 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[30], position: { x: 92, y: 52 }, enemyTypeId: "goblin_scout", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[31], position: { x: 83, y: 43 }, enemyTypeId: "bog_imp", subzoneId: "south-east", encounterAreaId: "old-grove-south-ring" },
    { id: enemyIds[32], position: { x: 113, y: 10 }, enemyTypeId: "bog_imp", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[33], position: { x: 125, y: 8 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[34], position: { x: 139, y: 11 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[35], position: { x: 151, y: 18 }, enemyTypeId: "goblin_thrower", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[36], position: { x: 115, y: 22 }, enemyTypeId: "bog_imp", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[37], position: { x: 128, y: 23 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[38], position: { x: 142, y: 24 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[39], position: { x: 132, y: 16 }, enemyTypeId: "goblin_thrower", subzoneId: "north-east", encounterAreaId: "wolf-causeway-north-pack" },
    { id: enemyIds[40], position: { x: 113, y: 37 }, enemyTypeId: "bog_imp", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
    { id: enemyIds[41], position: { x: 126, y: 48 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
    { id: enemyIds[42], position: { x: 140, y: 36 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
    { id: enemyIds[43], position: { x: 152, y: 47 }, enemyTypeId: "goblin_thrower", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
    { id: enemyIds[44], position: { x: 116, y: 51 }, enemyTypeId: "bog_imp", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
    { id: enemyIds[45], position: { x: 132, y: 35 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
    { id: enemyIds[46], position: { x: 144, y: 52 }, enemyTypeId: "wolf", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
    { id: enemyIds[47], position: { x: 133, y: 43 }, enemyTypeId: "goblin_thrower", subzoneId: "north-east", encounterAreaId: "wolf-causeway-south-pack" },
  ],
);

const mapThreeProgressionEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[0], position: { x: 12, y: 10 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[1], position: { x: 23, y: 8 }, enemyTypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[2], position: { x: 36, y: 11 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[3], position: { x: 44, y: 18 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[4], position: { x: 16, y: 20 }, enemyTypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[5], position: { x: 28, y: 23 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[6], position: { x: 39, y: 24 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[7], position: { x: 23, y: 15 }, enemyTypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-north-nest" },
  { id: enemyIds[8], position: { x: 11, y: 37 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[9], position: { x: 22, y: 47 }, enemyTypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[10], position: { x: 35, y: 36 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[11], position: { x: 45, y: 46 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[12], position: { x: 15, y: 51 }, enemyTypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[13], position: { x: 29, y: 34 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[14], position: { x: 39, y: 51 }, enemyTypeId: "stone_crawler", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[15], position: { x: 28, y: 43 }, enemyTypeId: "mossling", subzoneId: "south-west", encounterAreaId: "broken-thicket-south-nest" },
  { id: enemyIds[16], position: { x: 62, y: 10 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[17], position: { x: 74, y: 8 }, enemyTypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[18], position: { x: 88, y: 11 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[19], position: { x: 98, y: 18 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[20], position: { x: 70, y: 21 }, enemyTypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[21], position: { x: 78, y: 23 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[22], position: { x: 92, y: 24 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[23], position: { x: 80, y: 15 }, enemyTypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf-north" },
  { id: enemyIds[24], position: { x: 62, y: 37 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[25], position: { x: 75, y: 48 }, enemyTypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[26], position: { x: 89, y: 37 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[27], position: { x: 99, y: 47 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[28], position: { x: 64, y: 51 }, enemyTypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[29], position: { x: 78, y: 35 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[30], position: { x: 92, y: 52 }, enemyTypeId: "stone_crawler", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[31], position: { x: 83, y: 43 }, enemyTypeId: "goblin_shaman", subzoneId: "north-west", encounterAreaId: "crawler-shelf-south" },
  { id: enemyIds[32], position: { x: 113, y: 10 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[33], position: { x: 125, y: 8 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[34], position: { x: 139, y: 11 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[35], position: { x: 151, y: 18 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[36], position: { x: 115, y: 22 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[37], position: { x: 128, y: 23 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[38], position: { x: 142, y: 24 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[39], position: { x: 132, y: 16 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-north-circle" },
  { id: enemyIds[40], position: { x: 113, y: 37 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
  { id: enemyIds[41], position: { x: 126, y: 48 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
  { id: enemyIds[42], position: { x: 140, y: 36 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
  { id: enemyIds[43], position: { x: 152, y: 47 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
  { id: enemyIds[44], position: { x: 116, y: 51 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
  { id: enemyIds[45], position: { x: 132, y: 35 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
  { id: enemyIds[46], position: { x: 144, y: 52 }, enemyTypeId: "goblin_shaman", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
  { id: enemyIds[47], position: { x: 133, y: 43 }, enemyTypeId: "mossling", subzoneId: "south-center", encounterAreaId: "imp-fen-south-circle" },
];

const mapFourProgressionEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[18], position: { x: 64, y: 8 }, enemyTypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[19], position: { x: 80, y: 13 }, enemyTypeId: "ash_wisp", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[20], position: { x: 96, y: 8 }, enemyTypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[21], position: { x: 67, y: 17 }, enemyTypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[22], position: { x: 84, y: 6 }, enemyTypeId: "ash_wisp", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[23], position: { x: 95, y: 14 }, enemyTypeId: "goblin_shaman", subzoneId: "north-center", encounterAreaId: "shaman-watch" },
  { id: enemyIds[24], position: { x: 116, y: 8 }, enemyTypeId: "goblin_shaman", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[25], position: { x: 133, y: 14 }, enemyTypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[26], position: { x: 151, y: 9 }, enemyTypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[27], position: { x: 118, y: 16 }, enemyTypeId: "goblin_shaman", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[28], position: { x: 127, y: 6 }, enemyTypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[29], position: { x: 149, y: 15 }, enemyTypeId: "ash_wisp", subzoneId: "north-east", encounterAreaId: "ash-hollow" },
  { id: enemyIds[30], position: { x: 116, y: 33 }, enemyTypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[31], position: { x: 132, y: 39 }, enemyTypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[32], position: { x: 150, y: 33 }, enemyTypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[33], position: { x: 124, y: 43 }, enemyTypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[34], position: { x: 142, y: 43 }, enemyTypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[35], position: { x: 116, y: 40 }, enemyTypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[36], position: { x: 124, y: 31 }, enemyTypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[37], position: { x: 134, y: 33 }, enemyTypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[38], position: { x: 143, y: 36 }, enemyTypeId: "ash_wisp", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
  { id: enemyIds[39], position: { x: 151, y: 40 }, enemyTypeId: "orc", subzoneId: "south-east", encounterAreaId: "orc-approach-camp" },
];

const mapFiveProgressionEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[0], position: { x: 14, y: 12 }, enemyTypeId: "ember_imp", subzoneId: "crossing", encounterAreaId: "crossing-north-sparks" },
  { id: enemyIds[1], position: { x: 26, y: 8 }, enemyTypeId: "ember_imp", subzoneId: "crossing", encounterAreaId: "crossing-north-sparks" },
  { id: enemyIds[2], position: { x: 40, y: 16 }, enemyTypeId: "ember_imp", subzoneId: "crossing", encounterAreaId: "crossing-north-sparks" },
  { id: enemyIds[3], position: { x: 18, y: 42 }, enemyTypeId: "ember_imp", subzoneId: "crossing", encounterAreaId: "crossing-south-sparks" },
  { id: enemyIds[4], position: { x: 31, y: 48 }, enemyTypeId: "ember_imp", subzoneId: "crossing", encounterAreaId: "crossing-south-sparks" },
  { id: enemyIds[5], position: { x: 43, y: 39 }, enemyTypeId: "ember_imp", subzoneId: "crossing", encounterAreaId: "crossing-south-sparks" },
  { id: enemyIds[6], position: { x: 64, y: 12 }, enemyTypeId: "tin_crawler", subzoneId: "burrows", encounterAreaId: "burrows-north-shells" },
  { id: enemyIds[7], position: { x: 79, y: 8 }, enemyTypeId: "tin_crawler", subzoneId: "burrows", encounterAreaId: "burrows-north-shells" },
  { id: enemyIds[8], position: { x: 96, y: 16 }, enemyTypeId: "tin_crawler", subzoneId: "burrows", encounterAreaId: "burrows-north-shells" },
  { id: enemyIds[9], position: { x: 66, y: 42 }, enemyTypeId: "tin_crawler", subzoneId: "burrows", encounterAreaId: "burrows-south-shells" },
  { id: enemyIds[10], position: { x: 82, y: 48 }, enemyTypeId: "tin_crawler", subzoneId: "burrows", encounterAreaId: "burrows-south-shells" },
  { id: enemyIds[11], position: { x: 99, y: 39 }, enemyTypeId: "tin_crawler", subzoneId: "burrows", encounterAreaId: "burrows-south-shells" },
  { id: enemyIds[12], position: { x: 116, y: 12 }, enemyTypeId: "briar_wolf", subzoneId: "thornfield", encounterAreaId: "thornfield-north-pack" },
  { id: enemyIds[13], position: { x: 132, y: 8 }, enemyTypeId: "briar_wolf", subzoneId: "thornfield", encounterAreaId: "thornfield-north-pack" },
  { id: enemyIds[14], position: { x: 151, y: 16 }, enemyTypeId: "briar_wolf", subzoneId: "thornfield", encounterAreaId: "thornfield-north-pack" },
  { id: enemyIds[15], position: { x: 117, y: 42 }, enemyTypeId: "briar_wolf", subzoneId: "thornfield", encounterAreaId: "thornfield-south-pack" },
  { id: enemyIds[16], position: { x: 134, y: 48 }, enemyTypeId: "briar_wolf", subzoneId: "thornfield", encounterAreaId: "thornfield-south-pack" },
  { id: enemyIds[17], position: { x: 151, y: 39 }, enemyTypeId: "briar_wolf", subzoneId: "thornfield", encounterAreaId: "thornfield-south-pack" },
];

const mapSixProgressionEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[0], position: { x: 14, y: 12 }, enemyTypeId: "mire_spider", subzoneId: "mire", encounterAreaId: "mire-north-webs" },
  { id: enemyIds[1], position: { x: 26, y: 8 }, enemyTypeId: "mire_spider", subzoneId: "mire", encounterAreaId: "mire-north-webs" },
  { id: enemyIds[2], position: { x: 40, y: 16 }, enemyTypeId: "mire_spider", subzoneId: "mire", encounterAreaId: "mire-north-webs" },
  { id: enemyIds[3], position: { x: 18, y: 42 }, enemyTypeId: "mire_spider", subzoneId: "mire", encounterAreaId: "mire-south-webs" },
  { id: enemyIds[4], position: { x: 31, y: 48 }, enemyTypeId: "mire_spider", subzoneId: "mire", encounterAreaId: "mire-south-webs" },
  { id: enemyIds[5], position: { x: 43, y: 39 }, enemyTypeId: "mire_spider", subzoneId: "mire", encounterAreaId: "mire-south-webs" },
  { id: enemyIds[6], position: { x: 64, y: 12 }, enemyTypeId: "night_bat", subzoneId: "canopy", encounterAreaId: "canopy-north-roost" },
  { id: enemyIds[7], position: { x: 79, y: 8 }, enemyTypeId: "night_bat", subzoneId: "canopy", encounterAreaId: "canopy-north-roost" },
  { id: enemyIds[8], position: { x: 96, y: 16 }, enemyTypeId: "night_bat", subzoneId: "canopy", encounterAreaId: "canopy-north-roost" },
  { id: enemyIds[9], position: { x: 66, y: 42 }, enemyTypeId: "night_bat", subzoneId: "canopy", encounterAreaId: "canopy-south-roost" },
  { id: enemyIds[10], position: { x: 82, y: 48 }, enemyTypeId: "night_bat", subzoneId: "canopy", encounterAreaId: "canopy-south-roost" },
  { id: enemyIds[11], position: { x: 99, y: 39 }, enemyTypeId: "night_bat", subzoneId: "canopy", encounterAreaId: "canopy-south-roost" },
  { id: enemyIds[12], position: { x: 116, y: 12 }, enemyTypeId: "elder_mossling", subzoneId: "oldroot", encounterAreaId: "oldroot-north-ring" },
  { id: enemyIds[13], position: { x: 132, y: 8 }, enemyTypeId: "elder_mossling", subzoneId: "oldroot", encounterAreaId: "oldroot-north-ring" },
  { id: enemyIds[14], position: { x: 151, y: 16 }, enemyTypeId: "elder_mossling", subzoneId: "oldroot", encounterAreaId: "oldroot-north-ring" },
  { id: enemyIds[15], position: { x: 117, y: 42 }, enemyTypeId: "elder_mossling", subzoneId: "oldroot", encounterAreaId: "oldroot-south-ring" },
  { id: enemyIds[16], position: { x: 134, y: 48 }, enemyTypeId: "elder_mossling", subzoneId: "oldroot", encounterAreaId: "oldroot-south-ring" },
  { id: enemyIds[17], position: { x: 151, y: 39 }, enemyTypeId: "elder_mossling", subzoneId: "oldroot", encounterAreaId: "oldroot-south-ring" },
];

const mapSevenProgressionEnemyStartData: EnemyStartData[] = [
  { id: enemyIds[0], position: { x: 16, y: 10 }, enemyTypeId: "cinder_wisp", subzoneId: "plaza", encounterAreaId: "plaza-ember-ring" },
  { id: enemyIds[1], position: { x: 31, y: 8 }, enemyTypeId: "cinder_wisp", subzoneId: "plaza", encounterAreaId: "plaza-ember-ring" },
  { id: enemyIds[2], position: { x: 48, y: 14 }, enemyTypeId: "cinder_wisp", subzoneId: "plaza", encounterAreaId: "plaza-ember-ring" },
  { id: enemyIds[3], position: { x: 58, y: 20 }, enemyTypeId: "cinder_wisp", subzoneId: "plaza", encounterAreaId: "plaza-ember-ring" },
  { id: enemyIds[4], position: { x: 27, y: 24 }, enemyTypeId: "cinder_wisp", subzoneId: "plaza", encounterAreaId: "plaza-ember-ring" },
  { id: enemyIds[5], position: { x: 101, y: 11 }, enemyTypeId: "orc_warmaster", subzoneId: "garden", encounterAreaId: "garden-war-camp", combatBodyRadius: 1.1 },
  { id: enemyIds[6], position: { x: 116, y: 8 }, enemyTypeId: "orc_warmaster", subzoneId: "garden", encounterAreaId: "garden-war-camp", combatBodyRadius: 1.1 },
  { id: enemyIds[7], position: { x: 140, y: 13 }, enemyTypeId: "orc_warmaster", subzoneId: "garden", encounterAreaId: "garden-war-camp", combatBodyRadius: 1.1 },
  { id: enemyIds[8], position: { x: 104, y: 24 }, enemyTypeId: "orc_warmaster", subzoneId: "garden", encounterAreaId: "garden-war-camp", combatBodyRadius: 1.1 },
  { id: enemyIds[9], position: { x: 135, y: 24 }, enemyTypeId: "orc_warmaster", subzoneId: "garden", encounterAreaId: "garden-war-camp", combatBodyRadius: 1.1 },
];

export const mapThreeEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapThreeSubzones,
  mapThreeProgressionEnemyStartData,
);

export const mapFourEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapFourSubzones,
  compactEnemyStartData(mapFourProgressionEnemyStartData, MAP_FOUR_COMPACT_OFFSETS),
);

export const mapFiveEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapFiveSubzones,
  compactEnemyStartData(mapFiveProgressionEnemyStartData, MAP_FIVE_COMPACT_OFFSETS),
);

export const mapSixEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapSixSubzones,
  compactEnemyStartData(mapSixProgressionEnemyStartData, MAP_SIX_COMPACT_OFFSETS),
);

export const mapSevenEnemyStartData: EnemyStartData[] = createEnemyStartData(
  mapSevenSubzones,
  mapSevenProgressionEnemyStartData,
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

export const mapFiveEnemyStartPositions: Position[] = mapFiveEnemyStartData.map(
  (enemy) => enemy.position,
);

export const mapSixEnemyStartPositions: Position[] = mapSixEnemyStartData.map(
  (enemy) => enemy.position,
);

export const mapSevenEnemyStartPositions: Position[] = mapSevenEnemyStartData.map(
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

export const mapFiveResourceStartData: ResourceStartData[] =
  createResourceStartData(mapFiveSubzones);

export const mapSixResourceStartData: ResourceStartData[] =
  createResourceStartData(mapSixSubzones);

export const mapSevenResourceStartData: ResourceStartData[] =
  createResourceStartData(mapSevenSubzones);

const SLIMEWARD_FLOOR_ONE_PASSAGES: ZoneSubzonePassage[] = [
  { id: "f1-room-1-to-room-2", fromSubzoneId: "f1-room-1", toSubzoneId: "f1-room-2", position: { x: 24, y: 20 } },
  { id: "f1-room-2-to-room-3", fromSubzoneId: "f1-room-2", toSubzoneId: "f1-room-3", position: { x: 52, y: 20 } },
  { id: "f1-room-3-to-room-4", fromSubzoneId: "f1-room-3", toSubzoneId: "f1-room-4", position: { x: 80, y: 20 } },
  { id: "f1-room-4-to-room-5", fromSubzoneId: "f1-room-4", toSubzoneId: "f1-room-5", position: { x: 108, y: 20 } },
];

export const slimewardFloorOneSubzones: ZoneSubzone[] = [
  createSlimewardSubzone("f1-room-1", "Slimeward Entry", { x: 4, y: 8, width: 16, height: 24 }, { x: 12, y: 20 }, 8, []),
  createSlimewardSubzone("f1-room-2", "Gelstone Bend", { x: 28, y: 8, width: 20, height: 24 }, { x: 38, y: 20 }, 8, ["slimeward_heavy_slime", "slimeward_pale_ooze"]),
  createSlimewardSubzone("f1-room-3", "Dripping Pocket", { x: 56, y: 4, width: 20, height: 28 }, { x: 66, y: 20 }, 8, ["slimeward_pale_ooze", "slimeward_spitter_slime"]),
  createSlimewardSubzone("f1-room-4", "Slimecut Hall", { x: 84, y: 8, width: 20, height: 24 }, { x: 94, y: 20 }, 9, ["slimeward_heavy_slime", "slimeward_spitter_slime"]),
  createSlimewardSubzone("f1-room-5", "Azure Threshold", { x: 112, y: 4, width: 20, height: 32 }, { x: 122, y: 20 }, 9, ["slimeward_heavy_slime", "slimeward_pale_ooze", "slimeward_spitter_slime"]),
].map((subzone) => ({
  ...subzone,
  passages: getPassagesForSubzone(subzone.id, SLIMEWARD_FLOOR_ONE_PASSAGES),
}));

const SLIMEWARD_FLOOR_TWO_PASSAGES: ZoneSubzonePassage[] = [
  { id: "f2-room-1-to-room-2", fromSubzoneId: "f2-room-1", toSubzoneId: "f2-room-2", position: { x: 28, y: 20 } },
  { id: "f2-room-2-to-room-3", fromSubzoneId: "f2-room-2", toSubzoneId: "f2-room-3", position: { x: 56, y: 20 } },
  { id: "f2-room-3-to-room-4", fromSubzoneId: "f2-room-3", toSubzoneId: "f2-room-4", position: { x: 84, y: 20 } },
  { id: "f2-room-4-to-boss", fromSubzoneId: "f2-room-4", toSubzoneId: "f2-boss-room", position: { x: 112, y: 20 } },
];

export const slimewardFloorTwoSubzones: ZoneSubzone[] = [
  createSlimewardSubzone("f2-room-1", "Lower Landing", { x: 4, y: 8, width: 20, height: 24 }, { x: 14, y: 20 }, 9, []),
  createSlimewardSubzone("f2-room-2", "Azure Runoff", { x: 32, y: 8, width: 20, height: 24 }, { x: 42, y: 20 }, 9, ["slimeward_heavy_slime", "slimeward_pale_ooze"]),
  createSlimewardSubzone("f2-room-3", "Heavy Pool", { x: 60, y: 8, width: 20, height: 24 }, { x: 70, y: 20 }, 9, ["slimeward_heavy_slime", "slimeward_spitter_slime"]),
  createSlimewardSubzone("f2-room-4", "Mass Approach", { x: 88, y: 8, width: 20, height: 24 }, { x: 98, y: 20 }, 9, ["slimeward_heavy_slime", "slimeward_pale_ooze", "slimeward_spitter_slime"]),
  createSlimewardSubzone("f2-boss-room", "Azure Mass Chamber", { x: 116, y: 4, width: 32, height: 36 }, { x: 132, y: 22 }, 9, ["azure_mass"]),
].map((subzone) => ({
  ...subzone,
  passages: getPassagesForSubzone(subzone.id, SLIMEWARD_FLOOR_TWO_PASSAGES),
}));

export const slimewardFloorOneEnemyStartData: EnemyStartData[] = [
  { id: "slimeward-f1-r2-1", position: { x: 34, y: 16 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-2", encounterAreaId: "f1-room-2-pack" },
  { id: "slimeward-f1-r2-2", position: { x: 38, y: 21 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-2", encounterAreaId: "f1-room-2-pack" },
  { id: "slimeward-f1-r2-3", position: { x: 42, y: 16 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-2", encounterAreaId: "f1-room-2-pack" },
  { id: "slimeward-f1-r3-1", position: { x: 62, y: 16 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-3", encounterAreaId: "f1-room-3-pack" },
  { id: "slimeward-f1-r3-2", position: { x: 66, y: 22 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f1-room-3", encounterAreaId: "f1-room-3-pack" },
  { id: "slimeward-f1-r3-3", position: { x: 70, y: 16 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-3", encounterAreaId: "f1-room-3-pack" },
  { id: "slimeward-f1-r3-4", position: { x: 66, y: 12 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f1-room-3", encounterAreaId: "f1-room-3-pack" },
  { id: "slimeward-f1-r4-1", position: { x: 90, y: 16 }, enemyTypeId: "slimeward_heavy_slime", subzoneId: "f1-room-4", encounterAreaId: "f1-room-4-pack" },
  { id: "slimeward-f1-r4-2", position: { x: 94, y: 22 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f1-room-4", encounterAreaId: "f1-room-4-pack" },
  { id: "slimeward-f1-r4-3", position: { x: 98, y: 16 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-4", encounterAreaId: "f1-room-4-pack" },
  { id: "slimeward-f1-r4-4", position: { x: 92, y: 24 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f1-room-4", encounterAreaId: "f1-room-4-pack" },
  { id: "slimeward-f1-r5-1", position: { x: 118, y: 16 }, enemyTypeId: "slimeward_heavy_slime", subzoneId: "f1-room-5", encounterAreaId: "f1-room-5-pack", variant: "superior" },
  { id: "slimeward-f1-r5-2", position: { x: 122, y: 14 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-5", encounterAreaId: "f1-room-5-pack" },
  { id: "slimeward-f1-r5-3", position: { x: 126, y: 22 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f1-room-5", encounterAreaId: "f1-room-5-pack" },
  { id: "slimeward-f1-r5-4", position: { x: 120, y: 26 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f1-room-5", encounterAreaId: "f1-room-5-pack" },
  { id: "slimeward-f1-r5-5", position: { x: 128, y: 16 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f1-room-5", encounterAreaId: "f1-room-5-pack" },
];

export const slimewardFloorTwoEnemyStartData: EnemyStartData[] = [
  { id: "slimeward-f2-r2-1", position: { x: 38, y: 16 }, enemyTypeId: "slimeward_heavy_slime", subzoneId: "f2-room-2", encounterAreaId: "f2-room-2-pack", variant: "superior" },
  { id: "slimeward-f2-r2-2", position: { x: 42, y: 22 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f2-room-2", encounterAreaId: "f2-room-2-pack" },
  { id: "slimeward-f2-r2-3", position: { x: 46, y: 16 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f2-room-2", encounterAreaId: "f2-room-2-pack" },
  { id: "slimeward-f2-r2-4", position: { x: 40, y: 25 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f2-room-2", encounterAreaId: "f2-room-2-pack" },
  { id: "slimeward-f2-r3-1", position: { x: 66, y: 16 }, enemyTypeId: "slimeward_heavy_slime", subzoneId: "f2-room-3", encounterAreaId: "f2-room-3-pack", variant: "superior" },
  { id: "slimeward-f2-r3-2", position: { x: 70, y: 22 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f2-room-3", encounterAreaId: "f2-room-3-pack" },
  { id: "slimeward-f2-r3-3", position: { x: 74, y: 16 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f2-room-3", encounterAreaId: "f2-room-3-pack" },
  { id: "slimeward-f2-r3-4", position: { x: 66, y: 25 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f2-room-3", encounterAreaId: "f2-room-3-pack" },
  { id: "slimeward-f2-r3-5", position: { x: 76, y: 24 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f2-room-3", encounterAreaId: "f2-room-3-pack" },
  { id: "slimeward-f2-r4-1", position: { x: 94, y: 16 }, enemyTypeId: "slimeward_heavy_slime", subzoneId: "f2-room-4", encounterAreaId: "f2-room-4-pack", variant: "superior" },
  { id: "slimeward-f2-r4-2", position: { x: 98, y: 16 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f2-room-4", encounterAreaId: "f2-room-4-pack" },
  { id: "slimeward-f2-r4-3", position: { x: 102, y: 22 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f2-room-4", encounterAreaId: "f2-room-4-pack" },
  { id: "slimeward-f2-r4-4", position: { x: 94, y: 25 }, enemyTypeId: "slimeward_spitter_slime", subzoneId: "f2-room-4", encounterAreaId: "f2-room-4-pack" },
  { id: "slimeward-f2-r4-5", position: { x: 104, y: 25 }, enemyTypeId: "slimeward_pale_ooze", subzoneId: "f2-room-4", encounterAreaId: "f2-room-4-pack" },
  { id: SLIMEWARD_BOSS_ID, position: { x: 132, y: 22 }, enemyTypeId: "azure_mass", subzoneId: "f2-boss-room", encounterAreaId: "f2-boss-pack" },
];

export const slimewardFloorOneEnemyStartPositions: Position[] =
  slimewardFloorOneEnemyStartData.map((enemy) => enemy.position);
export const slimewardFloorTwoEnemyStartPositions: Position[] =
  slimewardFloorTwoEnemyStartData.map((enemy) => enemy.position);

const slimewardCampFloorCells = [
  ...createRectFloorCells(4, 8, 36, 20),
];

const slimewardFloorOneFloorCells = dedupeWalls([
  ...slimewardFloorOneSubzones.flatMap((subzone) =>
    createRectFloorCells(
      subzone.bounds.x,
      subzone.bounds.y,
      subzone.bounds.width,
      subzone.bounds.height,
    ),
  ),
  ...createRectFloorCells(20, 12, 8, 16),
  ...createRectFloorCells(48, 12, 8, 16),
  ...createRectFloorCells(76, 12, 8, 16),
  ...createRectFloorCells(104, 12, 8, 16),
]);

const slimewardFloorTwoFloorCells = dedupeWalls([
  ...slimewardFloorTwoSubzones.flatMap((subzone) =>
    createRectFloorCells(
      subzone.bounds.x,
      subzone.bounds.y,
      subzone.bounds.width,
      subzone.bounds.height,
    ),
  ),
  ...createRectFloorCells(24, 12, 8, 16),
  ...createRectFloorCells(52, 12, 8, 16),
  ...createRectFloorCells(80, 12, 8, 16),
  ...createRectFloorCells(108, 12, 8, 16),
]);

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
  enemyTypeId: EnemyTypeId;
  subzoneId: string;
  encounterAreaId: string;
  variant?: EnemyVariant;
  combatBodyRadius?: number;
};

type DebugMapCreationOptions = {
  secureLandingGateOpen?: boolean;
  oldGrovePassageOpen?: boolean;
};

type DebugMapQuestStates = Partial<
  Record<
    string,
    {
      status?: string;
      objectiveProgress?: Record<string, { completed?: boolean }>;
    }
  >
>;

export function getHubNpcStartDataForQuestState(
  quests: DebugMapQuestStates = {},
) {
  return isHubClassMentorAvailable(quests)
    ? [...hubNpcStartData, classMentorNpcStartData]
    : hubNpcStartData;
}

export function getHubTwoNpcStartDataForQuestState(
  quests: DebugMapQuestStates = {},
) {
  return isHubTwoClassMentorAvailable(quests)
    ? [...hubTwoNpcStartData, hubTwoClassMentorNpcStartData]
    : hubTwoNpcStartData;
}

export const SECURE_LANDING_PASSAGE_GATE_ID = "map-1-shore-fringe-passage-gate";
export const SECURE_LANDING_PASSAGE_GATE_POSITION: Position = { x: 52, y: 29 };
const SECURE_LANDING_PASSAGE_GATE_COLLISION_WALLS = createVerticalWall(52, 24, 34, []);
const SECURE_LANDING_PASSAGE_GATE_VISUAL: MapVisualObject = {
  id: SECURE_LANDING_PASSAGE_GATE_ID,
  visualId: "passage_gate_closed",
  position: SECURE_LANDING_PASSAGE_GATE_POSITION,
  widthCells: 100 / 32,
  heightCells: 525 / 32,
  anchorY: 0.5,
};
export const OLD_GROVE_PASSAGE_BLOCKER_ID = "map-2-old-grove-passage-blocker";
export const OLD_GROVE_PASSAGE_BLOCKER_POSITION: Position = { x: 105, y: 29 };
export const OLD_GROVE_REPAIRED_COLUMN_ID = "map-2-old-grove-repaired-column";
export const OLD_GROVE_REPAIRED_COLUMN_POSITION: Position = { x: 105, y: 24 };
const OLD_GROVE_PASSAGE_BLOCKER_COLLISION_WALLS = createVerticalWall(105, 24, 34, []);
const OLD_GROVE_PASSAGE_BLOCKER_VISUAL: MapVisualObject = {
  id: OLD_GROVE_PASSAGE_BLOCKER_ID,
  visualId: "passage_blocker_collapsed_column",
  position: OLD_GROVE_PASSAGE_BLOCKER_POSITION,
  widthCells: 200 / 32,
  heightCells: 700 / 32,
  anchorY: 0.5,
};
const OLD_GROVE_REPAIRED_COLUMN_VISUAL: MapVisualObject = {
  id: OLD_GROVE_REPAIRED_COLUMN_ID,
  visualId: "passage_blocker_repaired_column",
  position: OLD_GROVE_REPAIRED_COLUMN_POSITION,
  widthCells: 100 / 32,
  heightCells: 350 / 32,
  anchorY: 1,
};

const HUB_VISUAL_OBJECTS: MapVisualObject[] = [
  {
    id: "hub-dock-shore-connector",
    visualId: "hub_dock_shore_connector",
    position: { x: 13, y: 59 },
    widthCells: 8,
    heightCells: 8,
    anchorY: 1,
  },
  {
    id: "hub-house",
    visualId: "hub_house",
    position: { x: 43, y: 26 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-cabin",
    visualId: "hub_cabin",
    position: { x: 67, y: 26 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-tent",
    visualId: "hub_tent",
    position: { x: 42, y: 43 },
    widthCells: 9,
    heightCells: 9,
    anchorY: 1,
  },
  {
    id: "hub-guild-tavern",
    visualId: "guild_tavern_building",
    position: { x: 55, y: 55 },
    widthCells: 18,
    heightCells: 13,
    anchorY: 1,
  },
  {
    id: "hub-farm",
    visualId: "farm_building",
    position: { x: 18, y: 44 },
    widthCells: 14,
    heightCells: 11,
    anchorY: 1,
  },
  {
    id: "hub-livestock",
    visualId: "livestock_building",
    position: { x: 18, y: 25 },
    widthCells: 14,
    heightCells: 11,
    anchorY: 1,
  },
];

const HUB_TWO_VISUAL_OBJECTS: MapVisualObject[] = [
  {
    id: "hub-2-west-inn",
    visualId: "hub_house",
    position: { x: 29, y: 28 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-2-merchant-row",
    visualId: "hub_tent",
    position: { x: 42, y: 41 },
    widthCells: 9,
    heightCells: 9,
    anchorY: 1,
  },
  {
    id: "hub-2-quest-hall",
    visualId: "hub_cabin",
    position: { x: 56, y: 29 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-2-class-hall",
    visualId: "hub_house",
    position: { x: 76, y: 29 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-2-smithy",
    visualId: "hub_cabin",
    position: { x: 90, y: 41 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-2-supply-tent",
    visualId: "hub_tent",
    position: { x: 104, y: 28 },
    widthCells: 9,
    heightCells: 9,
    anchorY: 1,
  },
  {
    id: "hub-2-south-barracks",
    visualId: "hub_house",
    position: { x: 54, y: 58 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-2-east-storehouse",
    visualId: "hub_cabin",
    position: { x: 83, y: 58 },
    widthCells: 10,
    heightCells: 10,
    anchorY: 1,
  },
  {
    id: "hub-2-guild-tavern",
    visualId: "guild_tavern_building",
    position: { x: 112, y: 58 },
    widthCells: 18,
    heightCells: 13,
    anchorY: 1,
  },
  {
    id: "hub-2-farm",
    visualId: "farm_building",
    position: { x: 18, y: 42 },
    widthCells: 14,
    heightCells: 11,
    anchorY: 1,
  },
  {
    id: "hub-2-livestock",
    visualId: "livestock_building",
    position: { x: 119, y: 42 },
    widthCells: 14,
    heightCells: 11,
    anchorY: 1,
  },
];

const HUB_WALLS = dedupeWalls([
  ...createPerimeterWalls(DEBUG_MAP_COLUMNS, DEBUG_MAP_ROWS),
  ...createHorizontalWall(12, 30, 80, []),
  ...createHorizontalWall(47, 30, 80, [[51, 59]]),
  ...createVerticalWall(30, 12, 47, [[34, 39]]),
  ...createVerticalWall(80, 12, 47, [[28, 34]]),
]);

const HUB_TWO_COLUMNS = 132;
const HUB_TWO_ROWS = 72;
const HUB_TWO_WALLS = dedupeWalls([
  ...createPerimeterWalls(HUB_TWO_COLUMNS, HUB_TWO_ROWS),
]);
const HUB_TWO_STRUCTURE_COLLISION_WALLS = dedupeWalls([
  ...createBottomCenteredWallOutline({ x: 29, y: 28 }, 7, 6),
  ...createBottomCenteredWallOutline({ x: 56, y: 29 }, 7, 6),
  ...createBottomCenteredWallOutline({ x: 76, y: 29 }, 7, 6),
  ...createBottomCenteredWallOutline({ x: 104, y: 28 }, 6, 5),
  ...createBottomCenteredWallOutline({ x: 42, y: 41 }, 6, 5),
  ...createBottomCenteredWallOutline({ x: 90, y: 41 }, 7, 6),
  ...createBottomCenteredWallOutline({ x: 54, y: 58 }, 7, 6),
  ...createBottomCenteredWallOutline({ x: 83, y: 58 }, 7, 6),
  ...createBottomCenteredWallOutline({ x: 112, y: 58 }, 10, 7),
  ...createBottomCenteredWallOutline({ x: 18, y: 42 }, 8, 6),
  ...createBottomCenteredWallOutline({ x: 119, y: 42 }, 8, 6),
]);

const MAP_ONE_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, MAP_ONE_ROWS),
  ...createVerticalWall(52, 1, MAP_ONE_ROWS - 2, [[24, 34]]),
  ...createVerticalWall(105, 3, MAP_ONE_ROWS - 4, [[24, 34]]),
  ...createWallBlock(12, 22, 20, 22),
  ...createWallBlock(34, 46, 32, 34),
  ...createWallBlock(59, 72, 22, 24),
  ...createWallBlock(86, 99, 34, 36),
  ...createWallBlock(116, 128, 20, 22),
  ...createWallBlock(137, 150, 34, 36),
]);

const MAP_TWO_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, MAP_TWO_ROWS),
  ...createVerticalWall(52, 0, MAP_TWO_ROWS - 1, [[24, 34]]),
  ...createVerticalWall(105, 0, MAP_TWO_ROWS - 1, [[24, 34]]),
  ...createWallBlock(10, 19, 12, 15),
  ...createWallBlock(31, 43, 39, 42),
  ...createWallBlock(61, 68, 12, 25),
  ...createWallBlock(88, 101, 40, 43),
  ...createWallBlock(114, 126, 13, 16),
  ...createWallBlock(140, 151, 38, 41),
]);

const MAP_THREE_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, MAP_THREE_ROWS),
  ...createVerticalWall(52, 0, MAP_THREE_ROWS - 1, [[24, 34]]),
  ...createVerticalWall(105, 0, MAP_THREE_ROWS - 1, [[24, 34]]),
]);

const MAP_FOUR_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, WILDERNESS_MAP_ROWS),
  ...createVerticalWall(52, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
  ...createVerticalWall(105, 3, WILDERNESS_MAP_ROWS - 4, [[10, 14]]),
]);

const MAP_FIVE_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, MAP_ONE_ROWS),
  ...createVerticalWall(52, 0, MAP_ONE_ROWS - 1, [[24, 34]]),
  ...createVerticalWall(105, 0, MAP_ONE_ROWS - 1, [[24, 34]]),
  ...createWallBlock(18, 30, 21, 24),
  ...createWallBlock(72, 85, 10, 13),
  ...createWallBlock(119, 131, 43, 46),
]);

const MAP_SIX_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, MAP_ONE_ROWS),
  ...createVerticalWall(52, 0, MAP_ONE_ROWS - 1, [[24, 34]]),
  ...createVerticalWall(105, 0, MAP_ONE_ROWS - 1, [[24, 34]]),
  ...createWallBlock(18, 28, 37, 40),
  ...createWallBlock(68, 79, 19, 22),
  ...createWallBlock(130, 143, 35, 38),
]);

const MAP_SEVEN_WALLS = dedupeWalls([
  ...createPerimeterWalls(WILDERNESS_MAP_COLUMNS, WILDERNESS_MAP_ROWS),
  ...createVerticalWall(80, 3, WILDERNESS_MAP_ROWS - 4, [[13, 19]]),
  ...createWallBlock(38, 45, 3, 6),
  ...createWallBlock(62, 70, 22, 25),
  ...createWallBlock(89, 96, 5, 9),
  ...createWallBlock(124, 130, 19, 22),
]);

const SLIMEWARD_CAMP_COLUMNS = 44;
const SLIMEWARD_CAMP_ROWS = 30;
const SLIMEWARD_FLOOR_ONE_COLUMNS = 136;
const SLIMEWARD_FLOOR_ONE_ROWS = 40;
const SLIMEWARD_FLOOR_TWO_COLUMNS = 152;
const SLIMEWARD_FLOOR_TWO_ROWS = 44;
const SLIMEWARD_CAMP_WALLS = createWallsOutsideFloorCells(
  SLIMEWARD_CAMP_COLUMNS,
  SLIMEWARD_CAMP_ROWS,
  slimewardCampFloorCells,
);
const SLIMEWARD_FLOOR_ONE_WALLS = createWallsOutsideFloorCells(
  SLIMEWARD_FLOOR_ONE_COLUMNS,
  SLIMEWARD_FLOOR_ONE_ROWS,
  slimewardFloorOneFloorCells,
);
const SLIMEWARD_FLOOR_TWO_WALLS = createWallsOutsideFloorCells(
  SLIMEWARD_FLOOR_TWO_COLUMNS,
  SLIMEWARD_FLOOR_TWO_ROWS,
  slimewardFloorTwoFloorCells,
);

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
    visualObjects?: MapVisualObject[];
    subzones?: ZoneSubzone[];
    subzoneNameLabels?: ZoneSubzoneNameLabel[];
    floorCells?: Position[];
    visualTheme?: GameMap["visualTheme"];
    waypoints?: GameMap["waypoints"];
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
    visualObjects: HUB_VISUAL_OBJECTS,
    teleports: [
      {
        id: "hub-to-map-1",
        position: hubTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: HUB_MAP_ID,
        targetMapId: MAP_ONE_ID,
        arrivalPositions: mapOneHubArrivalPositions,
      },
      {
        id: HUB_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
        position: { x: hubTeleporterPosition.x, y: hubTeleporterPosition.y - 10 },
        range: TELEPORTER_RANGE,
        sourceMapId: HUB_MAP_ID,
        targetMapId: SLIMEWARD_CAMP_ID,
        arrivalPositions: slimewardCampArrivalPositions,
        visualTheme: "slimeward",
      },
    ],
  },
  [HUB_TWO_MAP_ID]: {
    id: HUB_TWO_MAP_ID,
    displayName: "Forward Bastion",
    debugName: "hub-2",
    columns: HUB_TWO_COLUMNS,
    rows: HUB_TWO_ROWS,
    walls: HUB_TWO_WALLS,
    healingFountains: hubTwoHealingFountains,
    visualObjects: HUB_TWO_VISUAL_OBJECTS,
    teleports: [
      {
        id: HUB_TWO_TO_MAP_THREE_TELEPORTER_ID,
        position: hubTwoWestTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: HUB_TWO_MAP_ID,
        targetMapId: MAP_THREE_ID,
        arrivalPositions: hubTwoMapThreeArrivalPositions,
      },
      {
        id: HUB_TWO_TO_MAP_FOUR_TELEPORTER_ID,
        position: hubTwoSouthTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: HUB_TWO_MAP_ID,
        targetMapId: MAP_FOUR_ID,
        arrivalPositions: hubTwoMapFourArrivalPositions,
      },
      {
        id: HUB_TWO_NORTH_ROUTE_TELEPORTER_ID,
        position: hubTwoNorthTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: HUB_TWO_MAP_ID,
        targetMapId: HUB_TWO_MAP_ID,
        arrivalPositions: mapThreeHubTwoArrivalPositions,
        startsWorking: false,
      },
      {
        id: HUB_TWO_EAST_ROUTE_TELEPORTER_ID,
        position: hubTwoEastTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: HUB_TWO_MAP_ID,
        targetMapId: HUB_TWO_MAP_ID,
        arrivalPositions: mapThreeHubTwoArrivalPositions,
        startsWorking: false,
      },
    ],
  },
  [MAP_ONE_ID]: {
    id: MAP_ONE_ID,
    displayName: "Mosswake Shore",
    debugName: "zone-1",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: MAP_ONE_ROWS,
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
        startsWorking: false,
      },
    ],
  },
  [MAP_TWO_ID]: {
    id: MAP_TWO_ID,
    displayName: "Briarwood Rise",
    debugName: "zone-2",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: MAP_TWO_ROWS,
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
        startsWorking: false,
      },
    ],
  },
  [MAP_THREE_ID]: {
    id: MAP_THREE_ID,
    displayName: "Azurefen Hollow",
    debugName: "zone-3",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: MAP_THREE_ROWS,
    walls: MAP_THREE_WALLS,
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
        id: MAP_THREE_TO_HUB_TWO_TELEPORTER_ID,
        position: mapThreeForwardTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_THREE_ID,
        targetMapId: HUB_TWO_MAP_ID,
        arrivalPositions: mapThreeHubTwoArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
      },
      {
        id: MAP_THREE_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
        position: mapThreeSlimewardCampTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_THREE_ID,
        targetMapId: SLIMEWARD_CAMP_ID,
        arrivalPositions: slimewardCampArrivalPositions,
        startsWorking: false,
        visualTheme: "slimeward",
      },
    ],
  },
  [MAP_FOUR_ID]: {
    id: MAP_FOUR_ID,
    displayName: "Ashwatch Approach",
    debugName: "zone-4",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: WILDERNESS_MAP_ROWS,
    walls: MAP_FOUR_WALLS,
    healingFountains: [],
    subzones: mapFourSubzones,
    subzoneNameLabels: mapFourSubzoneNameLabels,
    teleports: [
      {
        id: MAP_FOUR_TO_HUB_TWO_TELEPORTER_ID,
        position: mapFourReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_FOUR_ID,
        targetMapId: HUB_TWO_MAP_ID,
        arrivalPositions: mapFourHubTwoArrivalPositions,
      },
      {
        id: MAP_FOUR_TO_MAP_FIVE_TELEPORTER_ID,
        position: mapFourForwardTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_FOUR_ID,
        targetMapId: MAP_FIVE_ID,
        arrivalPositions: mapFourMapFiveArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
      },
    ],
  },
  [MAP_FIVE_ID]: {
    id: MAP_FIVE_ID,
    displayName: "Emberbriar Crossing",
    debugName: "zone-5",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: MAP_ONE_ROWS,
    walls: MAP_FIVE_WALLS,
    healingFountains: [],
    subzones: mapFiveSubzones,
    subzoneNameLabels: mapFiveSubzoneNameLabels,
    teleports: [
      {
        id: MAP_FIVE_TO_MAP_FOUR_TELEPORTER_ID,
        position: mapFiveReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_FIVE_ID,
        targetMapId: MAP_FOUR_ID,
        arrivalPositions: mapFiveMapFourArrivalPositions,
      },
      {
        id: MAP_FIVE_TO_MAP_SIX_TELEPORTER_ID,
        position: mapFiveForwardTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_FIVE_ID,
        targetMapId: MAP_SIX_ID,
        arrivalPositions: mapFiveMapSixArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
      },
    ],
  },
  [MAP_SIX_ID]: {
    id: MAP_SIX_ID,
    displayName: "Nightmire Canopy",
    debugName: "zone-6",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: MAP_ONE_ROWS,
    walls: MAP_SIX_WALLS,
    healingFountains: [],
    subzones: mapSixSubzones,
    subzoneNameLabels: mapSixSubzoneNameLabels,
    teleports: [
      {
        id: MAP_SIX_TO_MAP_FIVE_TELEPORTER_ID,
        position: mapSixReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_SIX_ID,
        targetMapId: MAP_FIVE_ID,
        arrivalPositions: mapSixMapFiveArrivalPositions,
      },
      {
        id: MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID,
        position: mapSixForwardTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_SIX_ID,
        targetMapId: MAP_SEVEN_ID,
        arrivalPositions: mapSixMapSevenArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
      },
    ],
  },
  [MAP_SEVEN_ID]: {
    id: MAP_SEVEN_ID,
    displayName: "Twilight of the Fallen",
    debugName: "zone-7",
    columns: WILDERNESS_MAP_COLUMNS,
    rows: WILDERNESS_MAP_ROWS,
    walls: MAP_SEVEN_WALLS,
    healingFountains: [],
    subzones: mapSevenSubzones,
    subzoneNameLabels: mapSevenSubzoneNameLabels,
    teleports: [
      {
        id: MAP_SEVEN_TO_MAP_SIX_TELEPORTER_ID,
        position: mapSevenReturnTeleporterPosition,
        range: TELEPORTER_RANGE,
        sourceMapId: MAP_SEVEN_ID,
        targetMapId: MAP_SIX_ID,
        arrivalPositions: mapSevenMapSixArrivalPositions,
      },
    ],
  },
  [SLIMEWARD_CAMP_ID]: {
    id: SLIMEWARD_CAMP_ID,
    displayName: "Slimeward Camp",
    debugName: "slimeward-camp",
    columns: SLIMEWARD_CAMP_COLUMNS,
    rows: SLIMEWARD_CAMP_ROWS,
    walls: SLIMEWARD_CAMP_WALLS,
    floorCells: slimewardCampFloorCells,
    visualTheme: "slimeward-cave",
    healingFountains: [],
    visualObjects: [
      {
        id: "slimeward-camp-slime-stone",
        visualId: "slime_covered_stone",
        position: { x: 24, y: 22 },
        widthCells: 4,
        heightCells: 4,
        anchorY: 1,
      },
    ],
    teleports: [
      {
        id: SLIMEWARD_CAMP_TO_MAP_THREE_TELEPORTER_ID,
        position: { x: 10, y: 17 },
        range: TELEPORTER_RANGE,
        sourceMapId: SLIMEWARD_CAMP_ID,
        targetMapId: MAP_THREE_ID,
        arrivalPositions: mapThreeSlimewardArrivalPositions,
        visualTheme: "slimeward",
      },
      {
        id: SLIMEWARD_CAMP_TO_FLOOR_ONE_TELEPORTER_ID,
        position: { x: 30, y: 17 },
        range: TELEPORTER_RANGE,
        sourceMapId: SLIMEWARD_CAMP_ID,
        targetMapId: SLIMEWARD_FLOOR_ONE_ID,
        arrivalPositions: slimewardFloorOneArrivalPositions,
        visualTheme: "slimeward",
      },
      {
        id: SLIMEWARD_CAMP_BROKEN_EXIT_TELEPORTER_ID,
        position: { x: 35, y: 17 },
        range: TELEPORTER_RANGE,
        sourceMapId: SLIMEWARD_CAMP_ID,
        targetMapId: SLIMEWARD_CAMP_ID,
        arrivalPositions: slimewardCampArrivalPositions,
        startsWorking: false,
        visualTheme: "slimeward",
      },
    ],
  },
  [SLIMEWARD_FLOOR_ONE_ID]: {
    id: SLIMEWARD_FLOOR_ONE_ID,
    displayName: "Slimeward Floor 1",
    debugName: "slimeward-floor-1",
    columns: SLIMEWARD_FLOOR_ONE_COLUMNS,
    rows: SLIMEWARD_FLOOR_ONE_ROWS,
    walls: SLIMEWARD_FLOOR_ONE_WALLS,
    floorCells: slimewardFloorOneFloorCells,
    visualTheme: "slimeward-cave",
    healingFountains: [],
    subzones: slimewardFloorOneSubzones,
    waypoints: [
      { id: "f1-waypoint-entry", position: { x: 12, y: 20 } },
      { id: "f1-waypoint-room-2", position: { x: 38, y: 20 } },
      { id: "f1-waypoint-room-3", position: { x: 66, y: 20 } },
      { id: "f1-waypoint-room-4", position: { x: 94, y: 20 } },
      { id: "f1-waypoint-room-5", position: { x: 122, y: 20 } },
      { id: "f1-waypoint-floor-2", position: { x: 124, y: 20 } },
    ],
    teleports: [
      {
        id: SLIMEWARD_FLOOR_ONE_TO_CAMP_TELEPORTER_ID,
        position: { x: 8, y: 20 },
        range: TELEPORTER_RANGE,
        sourceMapId: SLIMEWARD_FLOOR_ONE_ID,
        targetMapId: SLIMEWARD_CAMP_ID,
        arrivalPositions: slimewardCampDungeonEntranceArrivalPositions,
        visualTheme: "slimeward",
      },
      {
        id: SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID,
        position: { x: 124, y: 20 },
        range: TELEPORTER_RANGE,
        sourceMapId: SLIMEWARD_FLOOR_ONE_ID,
        targetMapId: SLIMEWARD_FLOOR_TWO_ID,
        arrivalPositions: slimewardFloorTwoArrivalPositions,
        autoSelectAfterEnemiesCleared: true,
        visualTheme: "slimeward",
      },
    ],
  },
  [SLIMEWARD_FLOOR_TWO_ID]: {
    id: SLIMEWARD_FLOOR_TWO_ID,
    displayName: "Slimeward Floor 2",
    debugName: "slimeward-floor-2",
    columns: SLIMEWARD_FLOOR_TWO_COLUMNS,
    rows: SLIMEWARD_FLOOR_TWO_ROWS,
    walls: SLIMEWARD_FLOOR_TWO_WALLS,
    floorCells: slimewardFloorTwoFloorCells,
    visualTheme: "slimeward-cave",
    healingFountains: [],
    subzones: slimewardFloorTwoSubzones,
    visualObjects: [
      {
        id: "slimeward-boss-azure-rocks",
        visualId: "azure_slime_rock_cluster",
        position: { x: 122, y: 34 },
        widthCells: 5,
        heightCells: 5,
        anchorY: 1,
      },
    ],
    waypoints: [
      { id: "f2-waypoint-entry", position: { x: 14, y: 20 } },
      { id: "f2-waypoint-room-2", position: { x: 42, y: 20 } },
      { id: "f2-waypoint-room-3", position: { x: 70, y: 20 } },
      { id: "f2-waypoint-room-4", position: { x: 98, y: 20 } },
      { id: "f2-waypoint-boss", position: { x: 132, y: 22 } },
      { id: "f2-waypoint-chest", position: SLIMEWARD_CHEST_POSITION },
      { id: "f2-waypoint-exit", position: SLIMEWARD_EXIT_POSITION },
    ],
    teleports: [
      {
        id: "slimeward-floor-2-to-floor-1",
        position: { x: 8, y: 20 },
        range: TELEPORTER_RANGE,
        sourceMapId: SLIMEWARD_FLOOR_TWO_ID,
        targetMapId: SLIMEWARD_FLOOR_ONE_ID,
        arrivalPositions: slimewardFloorOneArrivalPositions,
        visualTheme: "slimeward",
      },
      {
        id: SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
        position: SLIMEWARD_EXIT_POSITION,
        range: TELEPORTER_RANGE,
        sourceMapId: SLIMEWARD_FLOOR_TWO_ID,
        targetMapId: SLIMEWARD_CAMP_ID,
        arrivalPositions: slimewardCampDungeonEntranceArrivalPositions,
        startsWorking: false,
        visualTheme: "slimeward",
      },
    ],
  },
};

export function createDebugMap(
  mapId: DebugMapId = HUB_MAP_ID,
  options: DebugMapCreationOptions = {},
): GameMap {
  const definition = debugMapDefinitions[mapId];
  const walls = getDebugMapWalls(definition, options);
  const collisionWalls = getDebugMapCollisionWalls(definition, options);
  const visualObjects = getDebugMapVisualObjects(definition, options);
  const map = {
    id: definition.id,
    displayName: definition.displayName,
    debugName: definition.debugName,
    columns: definition.columns,
    rows: definition.rows,
    walls,
    collisionWalls,
    teleports: definition.teleports,
    healingFountains: definition.healingFountains,
    visualObjects,
    subzones: definition.subzones,
    subzoneNameLabels: definition.subzoneNameLabels,
    floorCells: definition.floorCells,
    visualTheme: definition.visualTheme,
    waypoints: definition.waypoints,
  };

  return {
    ...map,
    navigationGrid: bakeNavigationGrid(map),
  };
}

export function createDebugMapForQuestState(
  mapId: DebugMapId = HUB_MAP_ID,
  quests: DebugMapQuestStates = {},
): GameMap {
  return createDebugMap(mapId, {
    secureLandingGateOpen: isSecureLandingPassageGateOpen(quests),
    oldGrovePassageOpen: isOldGrovePassageOpen(quests),
  });
}

export function isSecureLandingPassageGateOpen(
  quests: DebugMapQuestStates = {},
): boolean {
  return quests.clear_the_shore?.status === "completed";
}

export function isOldGrovePassageOpen(
  quests: DebugMapQuestStates = {},
): boolean {
  return Boolean(
    quests.rescue_the_grove_runner?.objectiveProgress?.repair_old_grove_cache
      ?.completed,
  );
}

export function isClassMentorAvailable(
  quests: DebugMapQuestStates = {},
): boolean {
  return isHubClassMentorAvailable(quests) || isHubTwoClassMentorAvailable(quests);
}

export function isHubClassMentorAvailable(
  quests: DebugMapQuestStates = {},
): boolean {
  const azureTrialStatus = quests.azure_trial?.status;

  return (
    quests.find_slimeward_camp?.status === "completed" &&
    azureTrialStatus !== "ready_to_turn_in" &&
    azureTrialStatus !== "completed"
  );
}

export function isHubTwoClassMentorAvailable(
  quests: DebugMapQuestStates = {},
): boolean {
  const azureTrialStatus = quests.azure_trial?.status;

  return (
    azureTrialStatus === "ready_to_turn_in" ||
    azureTrialStatus === "completed"
  );
}

export function getDebugMapDefinition(mapId: DebugMapId) {
  return debugMapDefinitions[mapId];
}

function getDebugMapWalls(
  definition: (typeof debugMapDefinitions)[DebugMapId],
  _options: DebugMapCreationOptions,
): Position[] {
  return definition.walls;
}

function getDebugMapCollisionWalls(
  definition: (typeof debugMapDefinitions)[DebugMapId],
  options: DebugMapCreationOptions,
): Position[] | undefined {
  if (definition.id === MAP_ONE_ID && !options.secureLandingGateOpen) {
    return SECURE_LANDING_PASSAGE_GATE_COLLISION_WALLS;
  }

  if (definition.id === MAP_TWO_ID && !options.oldGrovePassageOpen) {
    return OLD_GROVE_PASSAGE_BLOCKER_COLLISION_WALLS;
  }

  if (definition.id === HUB_TWO_MAP_ID) {
    return HUB_TWO_STRUCTURE_COLLISION_WALLS;
  }

  if (definition.id !== MAP_ONE_ID && definition.id !== MAP_TWO_ID) {
    return undefined;
  }

  return undefined;
}

function getDebugMapVisualObjects(
  definition: (typeof debugMapDefinitions)[DebugMapId],
  options: DebugMapCreationOptions,
): MapVisualObject[] | undefined {
  if (definition.id === MAP_ONE_ID) {
    return [
      ...(definition.visualObjects ?? []),
      {
        ...SECURE_LANDING_PASSAGE_GATE_VISUAL,
        visualId: options.secureLandingGateOpen
          ? "passage_gate_open"
          : "passage_gate_closed",
      },
    ];
  }

  if (definition.id === MAP_TWO_ID) {
    return [
      ...(definition.visualObjects ?? []),
      options.oldGrovePassageOpen
        ? OLD_GROVE_REPAIRED_COLUMN_VISUAL
        : OLD_GROVE_PASSAGE_BLOCKER_VISUAL,
    ];
  }

  if (!definition.visualObjects) {
    return undefined;
  }

  return definition.visualObjects;
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

function createWallBlock(
  startX: number,
  endX: number,
  startY: number,
  endY: number,
) {
  const walls = [];

  for (let y = startY; y <= endY; y += 1) {
    walls.push(...createHorizontalWall(y, startX, endX, []));
  }

  return walls;
}

function createWallOutline(
  startX: number,
  endX: number,
  startY: number,
  endY: number,
) {
  if (startX === endX || startY === endY) {
    return createWallBlock(startX, endX, startY, endY);
  }

  return dedupeWalls([
    ...createHorizontalWall(startY, startX, endX, []),
    ...createHorizontalWall(endY, startX, endX, []),
    ...createVerticalWall(startX, startY + 1, endY - 1, []),
    ...createVerticalWall(endX, startY + 1, endY - 1, []),
  ]);
}

function createBottomCenteredWallOutline(
  bottomCenter: Position,
  width: number,
  height: number,
) {
  const halfWidth = Math.floor(width / 2);

  return createWallOutline(
    bottomCenter.x - halfWidth,
    bottomCenter.x + width - halfWidth - 1,
    bottomCenter.y - height,
    bottomCenter.y - 1,
  );
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

function createRectFloorCells(
  startX: number,
  startY: number,
  width: number,
  height: number,
): Position[] {
  const floorCells: Position[] = [];

  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      floorCells.push({ x, y });
    }
  }

  return floorCells;
}

function createWallsOutsideFloorCells(
  columns: number,
  rows: number,
  floorCells: Position[],
): Position[] {
  const floorCellKeys = new Set(floorCells.map((cell) => `${cell.x},${cell.y}`));
  const walls: Position[] = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!floorCellKeys.has(`${x},${y}`)) {
        walls.push({ x, y });
      }
    }
  }

  return walls;
}

function createSlimewardSubzone(
  id: string,
  displayName: string,
  bounds: ZoneSubzone["bounds"],
  encounterCenter: Position,
  level: number,
  enemyTypeIds: EnemyTypeId[],
): ZoneSubzone {
  return {
    id,
    displayName,
    bounds,
    levelRange: { min: level, max: level },
    enemyTypeIds,
    encounterAreas: [
      {
        id: id === "f2-boss-room" ? "f2-boss-pack" : `${id}-pack`,
        subzoneId: id,
        center: encounterCenter,
        radius: id === "f2-boss-room" ? 20 : 8,
        leashRadius: id === "f2-boss-room" ? 24 : 10,
      },
    ],
    resourceLocations: [],
    passages: [],
  };
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
