import { describe, expect, it } from "vitest";
import {
  closeSlimewardDungeonChestUi,
  debugResetSlimewardDungeon,
  sanitizeGameStateForSave,
  updateGame,
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
import { ENEMY_MOVEMENT_SPEED_PER_SECOND, createCompanion, createEnemy } from "./entities";
import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import { createEmptyPartyInventory } from "./inventory";
import { isNavigationCellWalkable } from "./navigation";
import { createInitialQuestStates } from "./questSystem";
import { isPositionInsideSubzone } from "./subzoneSystem";
import { isTeleportWorking } from "./teleportState";
import { createTestGameState } from "./testState";
import { GAME_LOOP_TICK_MS } from "./simulationTiming";
import type { AzureMassPhaseThreshold, Enemy, GameEntity, GameMap, Position } from "./types";

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

  it.each([
    {
      threshold: 75 as const,
      healthPercent: 75,
      previousThresholds: [],
      expectedCount: 3,
      superiorTypeId: "slimeward_heavy_slime",
    },
    {
      threshold: 50 as const,
      healthPercent: 50,
      previousThresholds: [75],
      expectedCount: 4,
      superiorTypeId: "slimeward_pale_ooze",
    },
    {
      threshold: 25 as const,
      healthPercent: 25,
      previousThresholds: [75, 50],
      expectedCount: 5,
      superiorTypeId: "slimeward_spitter_slime",
    },
  ])(
    "triggers the Azure Mass $threshold% slime wave with one Superior",
    ({
      threshold,
      healthPercent,
      previousThresholds,
      expectedCount,
      superiorTypeId,
    }) => {
      const state = createFloorTwoBossPhaseState({
        healthPercent,
        triggeredPhaseThresholds: previousThresholds as AzureMassPhaseThreshold[],
      });
      const nextState = updateSlimewardDungeonSystem(state, 1_000);
      const waveEnemies = getAzureMassPhaseEnemies(nextState, threshold);
      const superiorEnemies = waveEnemies.filter(
        (enemy) => enemy.variant === "superior",
      );

      expect(waveEnemies).toHaveLength(expectedCount);
      expect(superiorEnemies).toHaveLength(1);
      expect(superiorEnemies[0].enemyTypeId).toBe(superiorTypeId);
      expect(
        nextState.slimewardDungeon?.azureMass?.triggeredPhaseThresholds,
      ).toEqual([...previousThresholds, threshold]);
      expect(nextState.slimewardDungeon?.azureMass?.fleeUntilMs).toBe(6_000);
    },
  );

  it("triggers every newly crossed Azure Mass phase in one update", () => {
    const state = createFloorTwoBossPhaseState({ healthPercent: 20 });
    const nextState = updateSlimewardDungeonSystem(state, 1_000);
    const phaseEnemies = getAzureMassPhaseEnemies(nextState);

    expect(phaseEnemies).toHaveLength(12);
    expect(
      nextState.slimewardDungeon?.azureMass?.triggeredPhaseThresholds,
    ).toEqual([75, 50, 25]);
    expect(
      phaseEnemies.filter((enemy) => enemy.variant === "superior"),
    ).toHaveLength(3);
  });

  it("does not retrigger Azure Mass phases after they fire once", () => {
    const state = createFloorTwoBossPhaseState({ healthPercent: 20 });
    const triggeredState = updateSlimewardDungeonSystem(state, 1_000);
    const nextState = updateSlimewardDungeonSystem(triggeredState, 2_000);

    expect(getAzureMassPhaseEnemies(nextState)).toHaveLength(12);
    expect(
      nextState.slimewardDungeon?.azureMass?.triggeredPhaseThresholds,
    ).toEqual([75, 50, 25]);
  });

  it("places Azure Mass phase slimes in valid non-overlapping boss-room positions", () => {
    const state = createFloorTwoBossPhaseState({ healthPercent: 20 });
    const nextState = updateSlimewardDungeonSystem(state, 1_000);
    const boss = nextState.entities[SLIMEWARD_BOSS_ID];
    const bossRoom = nextState.map?.subzones?.find(
      (subzone) => subzone.id === "f2-boss-room",
    );
    const phaseEnemies = getAzureMassPhaseEnemies(nextState);

    expect(boss?.kind).toBe("enemy");
    expect(bossRoom).toBeDefined();
    expect(phaseEnemies).toHaveLength(12);

    if (!boss || boss.kind !== "enemy" || !bossRoom) {
      throw new Error("Expected Azure Mass and boss room in test state.");
    }

    for (const enemy of phaseEnemies) {
      expect(isPositionInsideSubzone(enemy.position, bossRoom)).toBe(true);
      expect(isNavigationCellWalkable(nextState.map!, enemy.position)).toBe(true);
      expect(getDistance(enemy.position, boss.position)).toBeGreaterThanOrEqual(
        getEnemyCombatBodyRadius(boss) + 1.5,
      );
      expect(
        ["slimeward_heavy_slime", "slimeward_pale_ooze", "slimeward_spitter_slime"],
      ).toContain(enemy.enemyTypeId);
    }

    for (let index = 0; index < phaseEnemies.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < phaseEnemies.length; otherIndex += 1) {
        expect(
          getDistance(
            phaseEnemies[index].position,
            phaseEnemies[otherIndex].position,
          ),
        ).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it("makes Azure Mass flee living companions at 200% base enemy speed for five seconds", () => {
    const state = createFloorTwoBossPhaseState({
      bossPosition: { x: 132, y: 22 },
      companionPosition: { x: 124, y: 22 },
      healthPercent: 75,
    });
    const phaseState = updateSlimewardDungeonSystem(state, 1_000);
    const nextState = updateGame(phaseState, {
      nowMs: 1_100,
      deltaMs: 1_000,
    });
    const boss = state.entities[SLIMEWARD_BOSS_ID];
    const movedBoss = nextState.entities[SLIMEWARD_BOSS_ID];
    const bossRoom = nextState.map?.subzones?.find(
      (subzone) => subzone.id === "f2-boss-room",
    );

    expect(phaseState.slimewardDungeon?.azureMass?.fleeUntilMs).toBe(6_000);
    expect(boss.kind).toBe("enemy");
    expect(movedBoss?.kind).toBe("enemy");
    expect(bossRoom).toBeDefined();

    if (boss.kind !== "enemy" || movedBoss?.kind !== "enemy" || !bossRoom) {
      throw new Error("Expected Azure Mass and boss room in flee test state.");
    }

    expect(movedBoss.position.x).toBeGreaterThan(boss.position.x);
    expect(getDistance(boss.position, movedBoss.position)).toBeCloseTo(
      ENEMY_MOVEMENT_SPEED_PER_SECOND * 2 * (GAME_LOOP_TICK_MS / 1_000),
      2,
    );
    expect(isPositionInsideSubzone(movedBoss.position, bossRoom)).toBe(true);
    expect(movedBoss.state).toBe("idle");
    expect(movedBoss.currentTargetId).toBeNull();
  });

  it("preserves Azure Mass triggered phases but clears active flee timing on save", () => {
    const state = createFloorTwoBossPhaseState({
      healthPercent: 75,
      triggeredPhaseThresholds: [75],
    });
    const activeFleeState = {
      ...state,
      slimewardDungeon: {
        chest: null,
        azureMass: {
          triggeredPhaseThresholds: [75 as const],
          fleeUntilMs: 6_000,
        },
      },
    };
    const sanitizedState = sanitizeGameStateForSave(activeFleeState);

    expect(
      sanitizedState.slimewardDungeon?.azureMass?.triggeredPhaseThresholds,
    ).toEqual([75]);
    expect(sanitizedState.slimewardDungeon?.azureMass?.fleeUntilMs).toBeUndefined();
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

function createFloorTwoBossPhaseState({
  bossPosition = { x: 132, y: 22 },
  companionPosition = { x: 124, y: 22 },
  healthPercent,
  triggeredPhaseThresholds = [],
}: {
  bossPosition?: Position;
  companionPosition?: Position;
  healthPercent: number;
  triggeredPhaseThresholds?: AzureMassPhaseThreshold[];
}) {
  const companion = createCompanion(
    "test-companion-1",
    companionPosition,
    "test-companion-1",
    "fighter",
    0,
  );
  const boss = createEnemy(SLIMEWARD_BOSS_ID, bossPosition, undefined, {
    enemyTypeId: "azure_mass",
    subzoneId: "f2-boss-room",
    encounterAreaId: "f2-boss-pack",
  });
  const damagedBoss: Enemy = {
    ...boss,
    health: Math.max(1, Math.floor(boss.maxHealth * (healthPercent / 100))),
  };

  return createTestGameState({
    currentMapId: SLIMEWARD_FLOOR_TWO_ID,
    map: createDebugMap(SLIMEWARD_FLOOR_TWO_ID),
    partyLeaderId: companion.id,
    entities: {
      [companion.id]: companion,
      [damagedBoss.id]: damagedBoss,
    },
    slimewardDungeon: {
      chest: null,
      azureMass:
        triggeredPhaseThresholds.length > 0
          ? { triggeredPhaseThresholds }
          : undefined,
    },
  });
}

function getAzureMassPhaseEnemies(
  state: ReturnType<typeof createTestGameState>,
  threshold?: AzureMassPhaseThreshold,
): Enemy[] {
  const idPrefix =
    threshold === undefined
      ? "slimeward-azure-mass-phase-"
      : `slimeward-azure-mass-phase-${threshold}-`;

  return Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        entity.kind === "enemy" &&
        entity.id.startsWith(idPrefix) &&
        entity.state !== "dead" &&
        entity.health > 0,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
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

function getDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
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
