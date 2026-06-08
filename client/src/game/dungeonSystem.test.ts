import { describe, expect, it } from "vitest";
import {
  closeSlimewardDungeonChestUi,
  debugResetSlimewardDungeon,
  updateEnemyRespawnSystem,
  updateSlimewardDungeonSystem,
} from "./index";
import { getSlimewardDungeonPoiTarget } from "./dungeonSystem";
import {
  HUB_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
  SLIMEWARD_BOSS_ID,
  SLIMEWARD_CHEST_POSITION,
  SLIMEWARD_CAMP_ID,
  SLIMEWARD_EXIT_POSITION,
  SLIMEWARD_FLOOR_ONE_ID,
  SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID,
  SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
  SLIMEWARD_FLOOR_TWO_ID,
  createDebugMap,
  debugMapDefinitions,
  slimewardFloorOneEnemyStartData,
  slimewardFloorOneSubzones,
  slimewardFloorTwoEnemyStartData,
  slimewardFloorTwoSubzones,
} from "./debugMap";
import { createCompanion, createEnemy } from "./entities";
import { createEmptyPartyInventory } from "./inventory";
import { isNavigationCellWalkable } from "./navigation";
import { createInitialQuestStates } from "./questSystem";
import { isTeleportWorking } from "./teleportState";
import { createTestGameState } from "./testState";
import type { Enemy, GameEntity, GameMap, Position } from "./types";

describe("Slimeward dungeon prototype", () => {
  it("registers the camp and two floor maps with debug access", () => {
    expect(debugMapDefinitions[SLIMEWARD_CAMP_ID].displayName).toBe("Slimeward Camp");
    expect(debugMapDefinitions[SLIMEWARD_FLOOR_ONE_ID].subzones).toHaveLength(5);
    expect(debugMapDefinitions[SLIMEWARD_FLOOR_TWO_ID].subzones).toHaveLength(5);
    expect(
      debugMapDefinitions.hub.teleports.some(
        (teleport) => teleport.id === HUB_TO_SLIMEWARD_CAMP_TELEPORTER_ID,
      ),
    ).toBe(true);
  });

  it("authors forced dungeon Superiors and never marks The Azure Mass superior", () => {
    expect(
      slimewardFloorOneEnemyStartData.filter((enemy) => enemy.variant === "superior"),
    ).toHaveLength(1);
    expect(
      slimewardFloorTwoEnemyStartData.filter((enemy) => enemy.variant === "superior"),
    ).toHaveLength(3);
    expect(
      slimewardFloorTwoEnemyStartData.find((enemy) => enemy.id === SLIMEWARD_BOSS_ID)
        ?.variant,
    ).toBeUndefined();
  });

  it("limits Heavy Slime stomp casters to one per dungeon room", () => {
    for (const enemies of [slimewardFloorOneEnemyStartData, slimewardFloorTwoEnemyStartData]) {
      const heavyCountsByRoom = new Map<string, number>();

      for (const enemy of enemies) {
        if (enemy.enemyTypeId !== "slimeward_heavy_slime") {
          continue;
        }

        heavyCountsByRoom.set(
          enemy.subzoneId,
          (heavyCountsByRoom.get(enemy.subzoneId) ?? 0) + 1,
        );
      }

      for (const count of heavyCountsByRoom.values()) {
        expect(count).toBeLessThanOrEqual(1);
      }
    }

    expect(countRoomEnemies(slimewardFloorOneEnemyStartData, "f1-room-4", "slimeward_heavy_slime")).toBe(1);
    expect(countRoomEnemies(slimewardFloorOneEnemyStartData, "f1-room-5", "slimeward_heavy_slime")).toBe(1);
    expect(countRoomEnemies(slimewardFloorTwoEnemyStartData, "f2-room-2", "slimeward_heavy_slime")).toBe(1);
    expect(countRoomEnemies(slimewardFloorTwoEnemyStartData, "f2-room-3", "slimeward_heavy_slime")).toBe(1);
    expect(countRoomEnemies(slimewardFloorTwoEnemyStartData, "f2-room-4", "slimeward_heavy_slime")).toBe(1);
  });

  it("keeps Slimeward floor art aligned to full 128px blocks with wall collisions outside", () => {
    for (const mapId of [SLIMEWARD_CAMP_ID, SLIMEWARD_FLOOR_ONE_ID, SLIMEWARD_FLOOR_TWO_ID]) {
      const map = createDebugMap(mapId);

      expect(map.visualTheme).toBe("slimeward-cave");
      assertCompleteFloorBlocks(map, 4);
      assertWallsOutsideFloorCells(map);
    }
  });

  it("keeps dungeon passages at least two characters tall", () => {
    const floorOne = createDebugMap(SLIMEWARD_FLOOR_ONE_ID);
    const floorTwo = createDebugMap(SLIMEWARD_FLOOR_TWO_ID);

    for (const passage of [
      { x: 20, y: 12 },
      { x: 48, y: 12 },
      { x: 76, y: 12 },
      { x: 104, y: 12 },
    ]) {
      assertWalkableRect(floorOne, passage, 8, 16);
    }

    for (const passage of [
      { x: 24, y: 12 },
      { x: 52, y: 12 },
      { x: 80, y: 12 },
      { x: 108, y: 12 },
    ]) {
      assertWalkableRect(floorTwo, passage, 8, 16);
    }
  });

  it("redraws dungeon regular rooms with larger safe interiors", () => {
    expect(slimewardFloorOneSubzones.map((subzone) => subzone.bounds)).toEqual([
      { x: 4, y: 8, width: 16, height: 24 },
      { x: 28, y: 8, width: 20, height: 24 },
      { x: 56, y: 4, width: 20, height: 28 },
      { x: 84, y: 8, width: 20, height: 24 },
      { x: 112, y: 4, width: 20, height: 32 },
    ]);
    expect(slimewardFloorTwoSubzones.map((subzone) => subzone.bounds)).toEqual([
      { x: 4, y: 8, width: 20, height: 24 },
      { x: 32, y: 8, width: 20, height: 24 },
      { x: 60, y: 8, width: 20, height: 24 },
      { x: 88, y: 8, width: 20, height: 24 },
      { x: 116, y: 4, width: 32, height: 36 },
    ]);
  });

  it("keeps redrawn dungeon authored placements on open interior floor", () => {
    assertDungeonAuthoredPlacements(
      createDebugMap(SLIMEWARD_FLOOR_ONE_ID),
      slimewardFloorOneEnemyStartData.map((enemy) => enemy.position),
    );
    assertDungeonAuthoredPlacements(
      createDebugMap(SLIMEWARD_FLOOR_TWO_ID),
      [
        ...slimewardFloorTwoEnemyStartData.map((enemy) => enemy.position),
        SLIMEWARD_CHEST_POSITION,
        SLIMEWARD_EXIT_POSITION,
      ],
    );
  });

  it("targets the real Floor 1 exit teleporter after Floor 1 is clear", () => {
    const floorOne = createDebugMap(SLIMEWARD_FLOOR_ONE_ID);
    const exitTeleport = floorOne.teleports.find(
      (teleport) => teleport.id === SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID,
    );
    const state = createTestGameState({
      currentMapId: SLIMEWARD_FLOOR_ONE_ID,
      map: floorOne,
      entities: {},
    });

    expect(exitTeleport).toBeDefined();
    expect(getSlimewardDungeonPoiTarget(state)).toMatchObject({
      poiId: SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID,
      category: "teleport",
      position: exitTeleport?.position,
      reason: "Dungeon floor clear",
    });
  });

  it("does not respawn dungeon floor enemies", () => {
    const deadEnemy = createEnemy(
      "slimeward-f1-r2-1",
      { x: 25, y: 16 },
      undefined,
      {
        enemyTypeId: "slimeward_heavy_slime",
        subzoneId: "f1-room-2",
        encounterAreaId: "f1-room-2-pack",
      },
    );
    const state = createTestGameState({
      currentMapId: SLIMEWARD_FLOOR_ONE_ID,
      map: createDebugMap(SLIMEWARD_FLOOR_ONE_ID),
      entities: {
        [deadEnemy.id]: {
          ...deadEnemy,
          state: "dead",
          health: 0,
          defeatedAtMs: 0,
        },
      },
    });

    const nextState = updateEnemyRespawnSystem(state, 60_000);
    expect(nextState.entities[deadEnemy.id]).toMatchObject({
      state: "dead",
      health: 0,
    });
  });

  it("spawns and collects the boss chest before enabling the exit", () => {
    const state = createFloorTwoBossDeadState();
    const withChest = updateSlimewardDungeonSystem(state, 1_000);

    expect(withChest.slimewardDungeon?.chest?.status).toBe("collected");
    expect(withChest.slimewardDungeon?.chest?.collectedLoot.length).toBeGreaterThan(0);
    expect(isTeleportWorking(withChest, SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID)).toBe(true);
  });

  it("completes the Azure Trial chest objective when boss chest loot is fully collected", () => {
    const state = {
      ...createFloorTwoBossDeadState(),
      quests: createAzureTrialChestQuestStates(),
    };
    const withChest = updateSlimewardDungeonSystem(state, 1_000);

    expect(
      withChest.quests.azure_trial.objectiveProgress.collect_slimeward_boss_chest,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(withChest.quests.azure_trial.status).toBe("ready_to_turn_in");
  });

  it("keeps a fully collected chest closed after Continue", () => {
    const state = createFloorTwoBossDeadState();
    const withChest = updateSlimewardDungeonSystem(state, 1_000);
    const closedChest = closeSlimewardDungeonChestUi(withChest);
    const nextState = updateSlimewardDungeonSystem(closedChest, 1_100);

    expect(nextState.slimewardDungeon?.chest?.status).toBe("collected");
    expect(nextState.slimewardDungeon?.chest?.pendingLoot).toEqual([]);
    expect(nextState.slimewardDungeon?.chest?.isUiOpen).toBe(false);
  });

  it("stops Auto Mode and keeps the exit closed when the chest cannot collect loot", () => {
    const state = {
      ...createFloorTwoBossDeadState(),
      autoModeEnabled: true,
      inventory: createEmptyPartyInventory(0),
    };
    const withChest = updateSlimewardDungeonSystem(state, 1_000);

    expect(withChest.autoModeEnabled).toBe(false);
    expect(withChest.slimewardDungeon?.chest?.inventoryFull).toBe(true);
    expect(withChest.slimewardDungeon?.chest?.autoContinueAtMs).toBeUndefined();
    expect(isTeleportWorking(withChest, SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID)).toBe(false);
  });

  it("does not complete the Azure Trial chest objective when boss chest loot is pending", () => {
    const state = {
      ...createFloorTwoBossDeadState(),
      inventory: createEmptyPartyInventory(0),
      quests: createAzureTrialChestQuestStates(),
    };
    const withChest = updateSlimewardDungeonSystem(state, 1_000);

    expect(
      withChest.quests.azure_trial.objectiveProgress.collect_slimeward_boss_chest,
    ).toMatchObject({
      currentCount: 0,
      completed: false,
    });
    expect(withChest.quests.azure_trial.status).toBe("active");
  });

  it("resets runtime and returns an in-dungeon party to Slimeward Camp", () => {
    const state = updateSlimewardDungeonSystem(createFloorTwoBossDeadState(), 1_000);
    const resetState = debugResetSlimewardDungeon(state);

    expect(resetState.currentMapId).toBe(SLIMEWARD_CAMP_ID);
    expect(resetState.slimewardDungeon?.chest).toBeNull();
    expect(isTeleportWorking(resetState, SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID)).toBe(false);
  });
});

function createFloorTwoBossDeadState() {
  const companion = createCompanion(
    "test-companion-1",
    SLIMEWARD_CHEST_POSITION,
    "test-companion-1",
    "fighter",
    0,
  );
  const boss = createEnemy(SLIMEWARD_BOSS_ID, { x: 100, y: 20 }, undefined, {
    enemyTypeId: "azure_mass",
    subzoneId: "f2-boss-room",
    encounterAreaId: "f2-boss-pack",
  });
  const deadBoss: Enemy = {
    ...boss,
    state: "dead",
    health: 0,
  };
  const entities: Record<string, GameEntity> = {
    [companion.id]: companion,
    [deadBoss.id]: deadBoss,
  };

  return createTestGameState({
    currentMapId: SLIMEWARD_FLOOR_TWO_ID,
    map: createDebugMap(SLIMEWARD_FLOOR_TWO_ID),
    partyLeaderId: companion.id,
    entities,
  });
}

function createAzureTrialChestQuestStates() {
  const quests = createInitialQuestStates();
  quests.azure_trial = {
    ...quests.azure_trial,
    status: "active",
    objectiveProgress: {
      ...quests.azure_trial.objectiveProgress,
      enter_slimeward_floor_one: {
        objectiveId: "enter_slimeward_floor_one",
        currentCount: 1,
        completed: true,
      },
      defeat_azure_mass: {
        objectiveId: "defeat_azure_mass",
        currentCount: 1,
        completed: true,
      },
    },
  };

  return quests;
}

function assertCompleteFloorBlocks(map: GameMap, blockSize: number) {
  const floorKeys = new Set((map.floorCells ?? []).map(getPositionKey));

  for (const floorCell of map.floorCells ?? []) {
    const blockOrigin = {
      x: Math.floor(floorCell.x / blockSize) * blockSize,
      y: Math.floor(floorCell.y / blockSize) * blockSize,
    };

    for (let y = blockOrigin.y; y < blockOrigin.y + blockSize; y += 1) {
      for (let x = blockOrigin.x; x < blockOrigin.x + blockSize; x += 1) {
        expect(floorKeys.has(getPositionKey({ x, y }))).toBe(true);
      }
    }
  }
}

function assertWallsOutsideFloorCells(map: GameMap) {
  const floorKeys = new Set((map.floorCells ?? []).map(getPositionKey));
  const wallKeys = new Set(map.walls.map(getPositionKey));

  for (let y = 0; y < map.rows; y += 1) {
    for (let x = 0; x < map.columns; x += 1) {
      const position = { x, y };
      const key = getPositionKey(position);
      const isFloor = floorKeys.has(key);

      expect(wallKeys.has(key)).toBe(!isFloor);
      expect(isNavigationCellWalkable(map, position)).toBe(isFloor);
    }
  }
}

function assertWalkableRect(
  map: GameMap,
  origin: Position,
  width: number,
  height: number,
) {
  for (let y = origin.y; y < origin.y + height; y += 1) {
    for (let x = origin.x; x < origin.x + width; x += 1) {
      expect(isNavigationCellWalkable(map, { x, y })).toBe(true);
    }
  }
}

function assertDungeonAuthoredPlacements(map: GameMap, extraPositions: Position[]) {
  const positions = [
    ...extraPositions,
    ...(map.waypoints ?? []).map((waypoint) => waypoint.position),
    ...map.teleports.flatMap((teleport) => [
      teleport.position,
      ...teleport.arrivalPositions,
    ]),
    ...(map.visualObjects ?? []).map((visualObject) => visualObject.position),
    ...(map.subzones ?? []).flatMap((subzone) => [
      ...subzone.passages.map((passage) => passage.position),
      ...subzone.encounterAreas.map((encounterArea) => encounterArea.center),
    ]),
  ];

  for (const position of positions) {
    expect(isNavigationCellWalkable(map, position)).toBe(true);
    expect(isWallAdjacent(map, position)).toBe(false);
  }
}

function isWallAdjacent(map: GameMap, position: Position): boolean {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ].some((neighbor) =>
    map.walls.some((wall) => wall.x === neighbor.x && wall.y === neighbor.y),
  );
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function countRoomEnemies(
  enemies: typeof slimewardFloorOneEnemyStartData,
  subzoneId: string,
  enemyTypeId: string,
): number {
  return enemies.filter(
    (enemy) =>
      enemy.subzoneId === subzoneId && enemy.enemyTypeId === enemyTypeId,
  ).length;
}
