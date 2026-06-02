import { describe, expect, it } from "vitest";
import {
  DEBUG_MAP_COLUMNS,
  DEBUG_MAP_ROWS,
  HUB_MAP_ID,
  MAP_FOUR_ID,
  MAP_ONE_ROWS,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
  MAP_TWO_ROWS,
  WILDERNESS_MAP_COLUMNS,
  WILDERNESS_MAP_ROWS,
  aoeTargetDummyPosition,
  createDebugMap,
  createDebugMapForQuestState,
  debugMapDefinitions,
  hubCompanionStartPositions,
  hubHealingFountains,
  hubNpcStartData,
  mapFourEnemyStartPositions,
  mapFourEnemyStartData,
  mapFourSubzoneNameLabels,
  mapFourResourceStartData,
  mapFourSubzones,
  mapOneEnemyStartPositions,
  mapOneEnemyStartData,
  mapOneSubzoneNameLabels,
  mapOneResourceStartData,
  mapOneSubzones,
  SECURE_LANDING_PASSAGE_GATE_ID,
  SECURE_LANDING_PASSAGE_GATE_POSITION,
  mapThreeEnemyStartPositions,
  mapThreeEnemyStartData,
  mapThreeSubzoneNameLabels,
  mapThreeResourceStartData,
  mapThreeSubzones,
  mapTwoEnemyStartPositions,
  mapTwoEnemyStartData,
  mapTwoSubzoneNameLabels,
  mapTwoResourceStartData,
  mapTwoSubzones,
  targetDummyPosition,
} from "./debugMap";
import { ENEMY_TYPES } from "./enemyArchetypes";
import { getNavigationDistance, isNavigationCellWalkable } from "./navigation";
import { QUEST_DEFINITIONS } from "./questSystem";
import type { DebugMapId, GameMap, Position, ZoneSubzone } from "./types";

const wildernessMaps = [
  {
    mapId: MAP_ONE_ID,
    subzones: mapOneSubzones,
    enemies: mapOneEnemyStartData,
    enemyPositions: mapOneEnemyStartPositions,
    resources: mapOneResourceStartData,
    labels: mapOneSubzoneNameLabels,
  },
  {
    mapId: MAP_TWO_ID,
    subzones: mapTwoSubzones,
    enemies: mapTwoEnemyStartData,
    enemyPositions: mapTwoEnemyStartPositions,
    resources: mapTwoResourceStartData,
    labels: mapTwoSubzoneNameLabels,
  },
  {
    mapId: MAP_THREE_ID,
    subzones: mapThreeSubzones,
    enemies: mapThreeEnemyStartData,
    enemyPositions: mapThreeEnemyStartPositions,
    resources: mapThreeResourceStartData,
    labels: mapThreeSubzoneNameLabels,
  },
  {
    mapId: MAP_FOUR_ID,
    subzones: mapFourSubzones,
    enemies: mapFourEnemyStartData,
    enemyPositions: mapFourEnemyStartPositions,
    resources: mapFourResourceStartData,
    labels: mapFourSubzoneNameLabels,
  },
] as const;

const secureLandingCompleteQuestStates = {
  clear_the_shore: { status: "completed" },
};

describe("debug maps", () => {
  it("remakes the hub as a larger port base while preserving wilderness map sizes", () => {
    expect(createDebugMap(HUB_MAP_ID)).toMatchObject({
      columns: DEBUG_MAP_COLUMNS,
      rows: DEBUG_MAP_ROWS,
    });
    expect(createDebugMap(MAP_ONE_ID)).toMatchObject({
      columns: WILDERNESS_MAP_COLUMNS,
      rows: MAP_ONE_ROWS,
    });
    expect(createDebugMap(MAP_TWO_ID)).toMatchObject({
      columns: WILDERNESS_MAP_COLUMNS,
      rows: MAP_TWO_ROWS,
    });
    expect(createDebugMap(MAP_THREE_ID)).toMatchObject({
      columns: WILDERNESS_MAP_COLUMNS,
      rows: WILDERNESS_MAP_ROWS,
    });
    expect(createDebugMap(MAP_FOUR_ID)).toMatchObject({
      columns: WILDERNESS_MAP_COLUMNS,
      rows: WILDERNESS_MAP_ROWS,
    });
  });

  it("places the remade hub dock, base, NPCs, fountain, and teleport on reachable floor", () => {
    const hub = createDebugMap(HUB_MAP_ID);
    const hubTeleport = debugMapDefinitions[HUB_MAP_ID].teleports[0];

    expect(hub.columns).toBe(110);
    expect(hub.rows).toBe(60);
    expect(hubTeleport.position).toMatchObject({ x: 102, y: 30 });
    expect(hub.visualObjects?.map((visualObject) => visualObject.visualId)).toEqual([
      "hub_dock_shore_connector",
      "hub_house",
      "hub_cabin",
      "hub_tent",
    ]);
    expect(
      hub.visualObjects?.find(
        (visualObject) => visualObject.visualId === "hub_dock_shore_connector",
      )?.position,
    ).toEqual({ x: 13, y: 59 });
    expect(hub.walls).toContainEqual({ x: 30, y: 12 });
    expect(hub.walls).toContainEqual({ x: 80, y: 47 });
    expect(isNavigationCellWalkable(hub, { x: 80, y: 31 })).toBe(true);
    expect(isNavigationCellWalkable(hub, { x: 55, y: 47 })).toBe(true);

    assertMapPlacements(HUB_MAP_ID, [
      ...hubCompanionStartPositions,
      ...hubNpcStartData.map((npc) => npc.position),
      ...hubHealingFountains.map((fountain) => fountain.position),
      targetDummyPosition,
      aoeTargetDummyPosition,
      hubTeleport.position,
      ...hubTeleport.arrivalPositions,
    ]);
  });

  it("keeps wilderness enemies and resources on reachable open floor", () => {
    for (const wildernessMap of wildernessMaps) {
      if (wildernessMap.mapId === MAP_ONE_ID) {
        expect(wildernessMap.enemyPositions).toHaveLength(48);
        expect(wildernessMap.resources).toHaveLength(9);
      } else if (wildernessMap.mapId === MAP_TWO_ID) {
        expect(wildernessMap.enemyPositions).toHaveLength(48);
        expect(wildernessMap.resources).toHaveLength(8);
      } else {
        expect(wildernessMap.enemyPositions.length).toBeGreaterThanOrEqual(18);
        expect(wildernessMap.enemyPositions.length).toBeLessThanOrEqual(22);
        expect(wildernessMap.resources).toHaveLength(8);
      }
      assertMapPlacements(wildernessMap.mapId, [
        ...wildernessMap.enemyPositions,
        ...wildernessMap.resources.map((resource) => resource.position),
      ]);
    }
  });

  it("keeps wilderness teleports and arrivals on reachable open floor", () => {
    for (const definition of Object.values(debugMapDefinitions)) {
      const sourceMap = createReachabilityValidationMap(definition.id);

      for (const teleport of definition.teleports) {
        assertOpenReachablePosition(sourceMap, teleport.position);

        const targetMap = createReachabilityValidationMap(teleport.targetMapId);
        for (const arrivalPosition of teleport.arrivalPositions) {
          assertOpenReachablePosition(targetMap, arrivalPosition);
        }
      }
    }
  });

  it("does not stack wilderness enemies and resources on each other", () => {
    for (const wildernessMap of wildernessMaps) {
      expect(getDuplicatePositions([
        ...wildernessMap.enemyPositions,
        ...wildernessMap.resources.map((resource) => resource.position),
      ])).toEqual([]);
    }
  });

  it("defines the authored subzone layout for each wilderness map", () => {
    for (const wildernessMap of wildernessMaps) {
      expect(wildernessMap.subzones).toHaveLength(
        3,
      );
      expect(createDebugMap(wildernessMap.mapId).subzones).toBe(wildernessMap.subzones);
    }
    expect(createDebugMap(MAP_ONE_ID).subzones).toBe(mapOneSubzones);
    expect(createDebugMap(MAP_TWO_ID).subzones).toBe(mapTwoSubzones);
  });

  it("adds interior blockers to each map one subzone", () => {
    const mapOne = createDebugMap(MAP_ONE_ID);

    for (const subzone of mapOneSubzones) {
      const interiorWallCount = mapOne.walls.filter((wall) =>
        isInsideSubzone(subzone, wall),
      ).length;

      expect(interiorWallCount).toBeGreaterThan(0);
    }
  });

  it("quest-gates the Shore Fringe to Mossy Glade passage for Secure the Landing", () => {
    const closedMap = createDebugMap(MAP_ONE_ID);
    const openMap = createDebugMapForQuestState(
      MAP_ONE_ID,
      secureLandingCompleteQuestStates,
    );
    const closedGate = closedMap.visualObjects?.find(
      (visualObject) => visualObject.id === SECURE_LANDING_PASSAGE_GATE_ID,
    );
    const openGate = openMap.visualObjects?.find(
      (visualObject) => visualObject.id === SECURE_LANDING_PASSAGE_GATE_ID,
    );

    expect(closedGate).toMatchObject({
      visualId: "passage_gate_closed",
      position: SECURE_LANDING_PASSAGE_GATE_POSITION,
    });
    expect(openGate).toMatchObject({
      visualId: "passage_gate_open",
      position: SECURE_LANDING_PASSAGE_GATE_POSITION,
    });
    expect(isNavigationCellWalkable(closedMap, SECURE_LANDING_PASSAGE_GATE_POSITION)).toBe(false);
    expect(isNavigationCellWalkable(openMap, SECURE_LANDING_PASSAGE_GATE_POSITION)).toBe(true);
    expect(getNavigationDistance(closedMap, { x: 50, y: 29 }, { x: 54, y: 29 }, 80)).toBeNull();
    expect(getNavigationDistance(openMap, { x: 50, y: 29 }, { x: 54, y: 29 }, 80)).not.toBeNull();
  });

  it("keeps authored subzones, passages, encounter areas, and resource locations valid", () => {
    for (const wildernessMap of wildernessMaps) {
      assertSubzones(wildernessMap.mapId, wildernessMap.subzones);
    }
  });

  it("keeps wilderness enemies inside their authored subzones", () => {
    for (const wildernessMap of wildernessMaps) {
      assertEnemyStartData(
        wildernessMap.mapId,
        wildernessMap.subzones,
        wildernessMap.enemies,
      );
    }
  });

  it("keeps authored wilderness density bounded per map", () => {
    for (const wildernessMap of wildernessMaps) {
      assertSubzoneContentDensity(wildernessMap.subzones, wildernessMap.enemies);
    }
  });

  it("keeps Map 1 starter slimes passive and other wilderness monsters aggressive", () => {
    for (const wildernessMap of wildernessMaps) {
      for (const enemy of wildernessMap.enemies) {
        const expectedTemperament =
          enemy.enemyTypeId === "slime" ? "passive" : "aggressive";

        expect(ENEMY_TYPES[enemy.enemyTypeId].temperament).toBe(
          expectedTemperament,
        );
      }
    }
  });

  it("places subzone name labels near reachable entrances and exits", () => {
    for (const wildernessMap of wildernessMaps) {
      assertSubzoneNameLabels(
        wildernessMap.mapId,
        wildernessMap.subzones,
        wildernessMap.labels,
      );
      expect(createDebugMap(wildernessMap.mapId).subzoneNameLabels).toBe(wildernessMap.labels);
    }
  });

  it("keeps map one quest inspection and guide points reachable inside their subzones", () => {
    const secureLandingInspectObjective =
      QUEST_DEFINITIONS.clear_the_shore.objectives.find(
        (objective) => objective.id === "inspect_shore_fringe_marker",
      );

    expect(secureLandingInspectObjective?.targetPosition).toEqual({ x: 50, y: 29 });

    const questPoints = [
      {
        subzoneId: "shore-fringe",
        position: secureLandingInspectObjective?.targetPosition,
      },
      {
        subzoneId: "lower-shore",
        position:
          QUEST_DEFINITIONS.break_lower_shore_blockage.objectives.find(
            (objective) => objective.id === "escort_lower_shore_worker",
          )?.guideStartPosition,
      },
      {
        subzoneId: "lower-shore",
        position:
          QUEST_DEFINITIONS.break_lower_shore_blockage.objectives.find(
            (objective) => objective.id === "escort_lower_shore_worker",
          )?.targetPosition,
      },
      {
        subzoneId: "lower-shore",
        position:
          QUEST_DEFINITIONS.break_lower_shore_blockage.objectives.find(
            (objective) => objective.id === "inspect_lower_shore_wreckage",
          )?.targetPosition,
      },
    ];
    const map = createReachabilityValidationMap(MAP_ONE_ID);

    for (const questPoint of questPoints) {
      expect(questPoint.position).toBeDefined();
      const position = questPoint.position as Position;
      const subzone = getSubzone(mapOneSubzones, questPoint.subzoneId);

      expect(isInsideSubzone(subzone, position)).toBe(true);
      assertOpenReachablePosition(map, position);
      if (isWallAdjacent(map, position)) {
        throw new Error(`${questPoint.subzoneId} quest point is wall-adjacent`);
      }
    }
  });

  it("lays out map one as three taller subzones with tuned enemy density", () => {
    const mapOneDefinition = debugMapDefinitions[MAP_ONE_ID];
    const hubEntry = mapOneDefinition.teleports.find(
      (teleport) => teleport.targetMapId === HUB_MAP_ID,
    );
    const forwardEntry = mapOneDefinition.teleports.find(
      (teleport) => teleport.targetMapId === MAP_TWO_ID,
    );
    const shoreFringe = getSubzone(mapOneSubzones, "shore-fringe");
    const mossyGlade = getSubzone(mapOneSubzones, "mossy-glade");
    const lowerShore = getSubzone(mapOneSubzones, "lower-shore");

    expect(hubEntry).toBeDefined();
    expect(forwardEntry).toBeDefined();
    expect(mapOneDefinition.rows).toBe(MAP_ONE_ROWS);
    expect(MAP_ONE_ROWS).toBe(Math.round(WILDERNESS_MAP_ROWS * 1.9));
    expect(hubEntry && isInsideSubzone(shoreFringe, hubEntry.position)).toBe(true);
    expect(forwardEntry && isInsideSubzone(lowerShore, forwardEntry.position)).toBe(true);
    for (const arrivalPosition of debugMapDefinitions[HUB_MAP_ID].teleports[0].arrivalPositions) {
      expect(isInsideSubzone(shoreFringe, arrivalPosition)).toBe(true);
    }
    for (const arrivalPosition of debugMapDefinitions[MAP_TWO_ID].teleports[0].arrivalPositions) {
      expect(isInsideSubzone(lowerShore, arrivalPosition)).toBe(true);
    }

    const expectedSubzoneEnemyTypes = new Map([
      ["shore-fringe", "slime"],
      ["mossy-glade", "cave_bat"],
      ["lower-shore", "forest_spider"],
    ]);

    for (const subzone of mapOneSubzones) {
      const expectedEnemyType = expectedSubzoneEnemyTypes.get(subzone.id);

      expect(subzone.enemyTypeIds).toEqual([expectedEnemyType]);
      const subzoneEnemies = mapOneEnemyStartData.filter(
        (enemy) => enemy.subzoneId === subzone.id,
      );

      expect(subzoneEnemies).toHaveLength(16);
      expect(subzoneEnemies.map((enemy) => enemy.enemyTypeId)).toEqual(
        Array.from({ length: 16 }, () => expectedEnemyType),
      );
    }

    expect(shoreFringe.bounds.height).toBe(55);
    expect(mossyGlade.bounds.height).toBe(55);
    expect(lowerShore.bounds.height).toBe(55);

    expect(getSubzone(mapTwoSubzones, "south-center").levelRange.min).toBeGreaterThanOrEqual(3);
    expect(getSubzone(mapTwoSubzones, "south-east").levelRange.min).toBeGreaterThanOrEqual(4);
    expect(getSubzone(mapTwoSubzones, "north-east").levelRange.min).toBeGreaterThanOrEqual(5);
  });

  it("lays out map two with full-height subzone barriers and tuned enemy density", () => {
    const mapTwoDefinition = debugMapDefinitions[MAP_TWO_ID];
    const mapTwo = createDebugMap(MAP_TWO_ID);
    const returnEntry = mapTwoDefinition.teleports.find(
      (teleport) => teleport.targetMapId === MAP_ONE_ID,
    );
    const forwardEntry = mapTwoDefinition.teleports.find(
      (teleport) => teleport.targetMapId === MAP_THREE_ID,
    );
    const scoutRise = getSubzone(mapTwoSubzones, "south-center");
    const wolfCauseway = getSubzone(mapTwoSubzones, "north-east");

    expect(mapTwoDefinition.rows).toBe(MAP_TWO_ROWS);
    expect(MAP_TWO_ROWS).toBe(MAP_ONE_ROWS);
    expect(returnEntry && isInsideSubzone(scoutRise, returnEntry.position)).toBe(true);
    expect(forwardEntry && isInsideSubzone(wolfCauseway, forwardEntry.position)).toBe(true);
    expect(mapTwoSubzones.map((subzone) => subzone.bounds)).toEqual([
      { x: 1, y: 1, width: 51, height: 55 },
      { x: 53, y: 1, width: 52, height: 55 },
      { x: 106, y: 1, width: 53, height: 55 },
    ]);

    for (const dividerX of [52, 105]) {
      expect(mapTwo.walls).toContainEqual({ x: dividerX, y: 0 });
      expect(mapTwo.walls).toContainEqual({ x: dividerX, y: MAP_TWO_ROWS - 1 });
      expect(isNavigationCellWalkable(mapTwo, { x: dividerX, y: 29 })).toBe(true);
    }

    const expectedSubzoneEnemyTypes = new Map([
      ["south-center", ["forest_spider", "goblin_scout"]],
      ["south-east", ["goblin_scout", "bog_imp"]],
      ["north-east", ["bog_imp", "wolf", "goblin_thrower"]],
    ]);

    for (const subzone of mapTwoSubzones) {
      const expectedEnemyTypes = expectedSubzoneEnemyTypes.get(subzone.id);
      const subzoneEnemies = mapTwoEnemyStartData.filter(
        (enemy) => enemy.subzoneId === subzone.id,
      );

      expect(subzone.enemyTypeIds).toEqual(expectedEnemyTypes);
      expect(subzoneEnemies).toHaveLength(16);
      expect(
        subzoneEnemies.every((enemy) =>
          expectedEnemyTypes?.includes(enemy.enemyTypeId),
        ),
      ).toBe(true);
    }
  });

  it("keeps one map one enemy near each resource node", () => {
    const maxResourceGuardDistance = 12;

    for (const resource of mapOneResourceStartData) {
      const nearbyEnemy = mapOneEnemyStartData
        .filter((enemy) => enemy.subzoneId === resource.subzoneId)
        .some((enemy) => getDistance(enemy.position, resource.position) <= maxResourceGuardDistance);

      expect(nearbyEnemy).toBe(true);
    }
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
  const map = createReachabilityValidationMap(mapId);

  for (const position of positions) {
    assertOpenReachablePosition(map, position);
    if (isWallAdjacent(map, position)) {
      throw new Error(
        `${map.id ?? map.debugName} placement ${position.x},${position.y} is wall-adjacent`,
      );
    }
  }
}

function createReachabilityValidationMap(mapId: DebugMapId): GameMap {
  return createDebugMapForQuestState(mapId, secureLandingCompleteQuestStates);
}

function assertSubzoneContentDensity(
  subzones: ZoneSubzone[],
  enemies: Array<{ subzoneId: string }>,
) {
  for (const subzone of subzones) {
    const enemyCount = enemies.filter((enemy) => enemy.subzoneId === subzone.id).length;
    expect(enemyCount).toBeGreaterThanOrEqual(4);
    expect(enemyCount).toBeLessThanOrEqual(24);
    expect(subzone.resourceLocations.length).toBeGreaterThanOrEqual(2);
    expect(subzone.resourceLocations.length).toBeLessThanOrEqual(3);
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
  const map = createReachabilityValidationMap(mapId);

  for (const subzone of subzones) {
    assertBoundsInsideMap(map, subzone);
    expect(subzone.encounterAreas.length).toBeGreaterThan(0);

    for (const passage of subzone.passages) {
      expect(subzones.some((candidate) => candidate.id === passage.fromSubzoneId)).toBe(true);
      expect(subzones.some((candidate) => candidate.id === passage.toSubzoneId)).toBe(true);
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
  const map = createReachabilityValidationMap(mapId);

  for (const enemy of enemies) {
    const subzone = subzones.find((candidate) => candidate.id === enemy.subzoneId);
    const encounterArea = subzone?.encounterAreas.find(
      (candidate) => candidate.id === enemy.encounterAreaId,
    );

    expect(subzone).toBeDefined();
    expect(encounterArea).toBeDefined();
    expect(subzone && isInsideSubzone(subzone, enemy.position)).toBe(true);
    if (
      encounterArea &&
      getDistance(enemy.position, encounterArea.center) > encounterArea.radius
    ) {
      throw new Error(`${enemy.id} is outside ${enemy.encounterAreaId}`);
    }
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
  const map = createReachabilityValidationMap(mapId);

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
