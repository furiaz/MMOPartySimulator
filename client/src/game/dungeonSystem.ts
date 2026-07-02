import {
  SLIMEWARD_BOSS_ID,
  SLIMEWARD_CAMP_ID,
  SLIMEWARD_CAMP_TO_FLOOR_ONE_TELEPORTER_ID,
  SLIMEWARD_CHEST_ID,
  SLIMEWARD_CHEST_POSITION,
  SLIMEWARD_EXIT_POSITION,
  SLIMEWARD_FLOOR_ONE_ID,
  SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID,
  SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
  SLIMEWARD_FLOOR_TWO_ID,
  debugMapDefinitions,
  slimewardFloorOneEnemyStartData,
  slimewardFloorTwoEnemyStartData,
} from "./debugMap";
import { createEnemy, createNpc } from "./entities";
import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import { addItemToInventoryState } from "./inventory";
import { getPartyLeader } from "./partySystem";
import { recordDungeonChestCollectedForQuests } from "./questSystem";
import { setTeleportWorking } from "./teleportState";
import {
  addEntity,
  isPositionAvailable,
  moveEntityTowardPositionIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import { isPositionInsideSubzone } from "./subzoneSystem";
import type { SimulationTiming } from "./simulationTiming";
import type {
  AzureMassPhaseThreshold,
  Companion,
  DebugMapId,
  DungeonChestRuntimeState,
  Enemy,
  EnemyTypeId,
  EnemyVariant,
  GameEntity,
  InventorySlot,
  ItemId,
  NpcEntity,
  Position,
  ZoneSubzone,
} from "./types";

const CHEST_INTERACTION_RANGE = 3;
const CHEST_AUTO_CONTINUE_DELAY_MS = 10_000;
const AZURE_MASS_BOSS_ROOM_ID = "f2-boss-room";
const AZURE_MASS_BOSS_PACK_ID = "f2-boss-pack";
const AZURE_MASS_FLEE_DURATION_MS = 5_000;
const AZURE_MASS_FLEE_SPEED_MULTIPLIER = 2;
const AZURE_MASS_SPAWN_CLEARANCE = 1.5;
const AZURE_MASS_PHASE_THRESHOLDS: AzureMassPhaseThreshold[] = [75, 50, 25];

type AzureMassWaveEnemy = {
  enemyTypeId: EnemyTypeId;
  variant?: EnemyVariant;
};

const AZURE_MASS_PHASE_WAVES: Record<AzureMassPhaseThreshold, AzureMassWaveEnemy[]> = {
  75: [
    { enemyTypeId: "slimeward_heavy_slime", variant: "superior" },
    { enemyTypeId: "slimeward_pale_ooze" },
    { enemyTypeId: "slimeward_spitter_slime" },
  ],
  50: [
    { enemyTypeId: "slimeward_pale_ooze", variant: "superior" },
    { enemyTypeId: "slimeward_heavy_slime" },
    { enemyTypeId: "slimeward_spitter_slime" },
    { enemyTypeId: "slimeward_pale_ooze" },
  ],
  25: [
    { enemyTypeId: "slimeward_spitter_slime", variant: "superior" },
    { enemyTypeId: "slimeward_heavy_slime" },
    { enemyTypeId: "slimeward_pale_ooze" },
    { enemyTypeId: "slimeward_spitter_slime" },
    { enemyTypeId: "slimeward_pale_ooze" },
  ],
};

export function isSlimewardMapId(
  mapId: DebugMapId | undefined,
): mapId is typeof SLIMEWARD_CAMP_ID | typeof SLIMEWARD_FLOOR_ONE_ID | typeof SLIMEWARD_FLOOR_TWO_ID {
  return (
    mapId === SLIMEWARD_CAMP_ID ||
    mapId === SLIMEWARD_FLOOR_ONE_ID ||
    mapId === SLIMEWARD_FLOOR_TWO_ID
  );
}

export function isSlimewardDungeonFloorMapId(
  mapId: DebugMapId | undefined,
): mapId is typeof SLIMEWARD_FLOOR_ONE_ID | typeof SLIMEWARD_FLOOR_TWO_ID {
  return mapId === SLIMEWARD_FLOOR_ONE_ID || mapId === SLIMEWARD_FLOOR_TWO_ID;
}

export function isSlimewardDungeonChestUiOpen(state: GameState): boolean {
  return Boolean(state.slimewardDungeon?.chest?.isUiOpen);
}

export function clearSlimewardDungeonRuntime(state: GameState): GameState {
  return setTeleportWorking(
    {
      ...state,
      slimewardDungeon: { chest: null },
    },
    SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
    false,
  );
}

export function shouldResetSlimewardDungeonOnTeleport(
  teleportId: string,
): boolean {
  return teleportId === SLIMEWARD_CAMP_TO_FLOOR_ONE_TELEPORTER_ID;
}

export function updateSlimewardDungeonSystem(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  if (state.currentMapId !== SLIMEWARD_FLOOR_TWO_ID) {
    return state;
  }

  let nextState = updateAzureMassPhaseSystem(state, nowMs);
  nextState = ensureBossChestState(nextState);
  nextState = ensureBossChestEntity(nextState);

  const chest = nextState.slimewardDungeon?.chest;
  if (
    !chest ||
    chest.status === "hidden" ||
    chest.isUiOpen ||
    chest.pendingLoot.length === 0
  ) {
    return nextState;
  }

  const leader = getPartyLeader(nextState);
  if (!leader || getDistance(leader.position, chest.position) > CHEST_INTERACTION_RANGE) {
    return nextState;
  }

  return openSlimewardDungeonChest(nextState, nowMs);
}

export function openSlimewardDungeonChest(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const currentChest = state.slimewardDungeon?.chest;
  if (!currentChest || currentChest.status === "hidden") {
    return state;
  }

  const rolledLoot =
    currentChest.rolledLoot.length > 0
      ? currentChest.rolledLoot
      : rollSlimewardChestLoot();
  const pendingLoot =
    currentChest.pendingLoot.length > 0
      ? currentChest.pendingLoot
      : rolledLoot;
  const collectionResult = collectChestLoot(state, pendingLoot);
  const collectedLoot = mergeInventorySlots([
    ...currentChest.collectedLoot,
    ...collectionResult.collectedLoot,
  ]);
  const isFullyCollected = collectionResult.pendingLoot.length === 0;
  const hasCollectedLoot = collectedLoot.length > 0;
  const inventoryFull = collectionResult.pendingLoot.length > 0;

  let nextState: GameState = {
    ...collectionResult.state,
    autoModeEnabled: inventoryFull ? false : collectionResult.state.autoModeEnabled,
    slimewardDungeon: {
      ...currentSlimewardRuntime(collectionResult.state),
      chest: {
        ...currentChest,
        status: isFullyCollected ? "collected" : "opened",
        rolledLoot,
        collectedLoot,
        pendingLoot: collectionResult.pendingLoot,
        isUiOpen: true,
        openedAtMs: currentChest.openedAtMs ?? nowMs,
        autoContinueAtMs:
          !inventoryFull && collectionResult.state.autoModeEnabled
            ? nowMs + CHEST_AUTO_CONTINUE_DELAY_MS
            : undefined,
        inventoryFull,
      },
    },
  };

  if (hasCollectedLoot) {
    nextState = setTeleportWorking(
      nextState,
      SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
      true,
    );
  }

  if (isFullyCollected) {
    nextState = recordDungeonChestCollectedForQuests(
      nextState,
      SLIMEWARD_CHEST_ID,
      state.currentMapId,
    );
  }

  return ensureBossChestEntity(nextState);
}

export function closeSlimewardDungeonChestUi(state: GameState): GameState {
  const chest = state.slimewardDungeon?.chest;

  if (!chest) {
    return state;
  }

  return {
    ...state,
    slimewardDungeon: {
      ...currentSlimewardRuntime(state),
      chest: {
        ...chest,
        isUiOpen: false,
        autoContinueAtMs: undefined,
      },
    },
  };
}

export const continueSlimewardDungeonChest = closeSlimewardDungeonChestUi;

export function createSlimewardChestNpc(
  chest: DungeonChestRuntimeState,
): NpcEntity {
  return createNpc(
    SLIMEWARD_CHEST_ID,
    chest.position,
    "Dungeon Chest",
    chest.status === "collected" || chest.status === "opened"
      ? "dungeon_chest_open"
      : "dungeon_chest_closed",
  );
}

export function getSlimewardDungeonPoiTarget(state: GameState) {
  if (state.currentMapId === SLIMEWARD_FLOOR_ONE_ID) {
    const enemy = getNextDungeonEnemy(state, slimewardFloorOneEnemyStartData);
    if (enemy) {
      return {
        poiId: enemy.id,
        category: "combat" as const,
        mapId: SLIMEWARD_FLOOR_ONE_ID,
        position: enemy.position,
        targetEntityId: enemy.id,
        reason: "Dungeon waypoint enemy pack",
      };
    }

    const floorTwoTeleportPosition = getMapTeleportPosition(
      state,
      SLIMEWARD_FLOOR_ONE_ID,
      SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID,
    );

    if (!floorTwoTeleportPosition) {
      return null;
    }

    return {
      poiId: SLIMEWARD_FLOOR_ONE_TO_FLOOR_TWO_TELEPORTER_ID,
      category: "teleport" as const,
      mapId: SLIMEWARD_FLOOR_ONE_ID,
      position: floorTwoTeleportPosition,
      reason: "Dungeon floor clear",
    };
  }

  if (state.currentMapId !== SLIMEWARD_FLOOR_TWO_ID) {
    return null;
  }

  const enemy = getNextDungeonEnemy(state, slimewardFloorTwoEnemyStartData);
  if (enemy) {
    return {
      poiId: enemy.id,
      category: "combat" as const,
      mapId: SLIMEWARD_FLOOR_TWO_ID,
      position: enemy.position,
      targetEntityId: enemy.id,
      reason: "Dungeon waypoint enemy pack",
    };
  }

  const chest = state.slimewardDungeon?.chest;
  if (chest && chest.status !== "hidden" && chest.pendingLoot.length > 0) {
    return {
      poiId: SLIMEWARD_CHEST_ID,
      category: "event" as const,
      mapId: SLIMEWARD_FLOOR_TWO_ID,
      position: chest.position,
      targetEntityId: SLIMEWARD_CHEST_ID,
      reason: "Dungeon chest before exit",
    };
  }

  if (chest && chest.collectedLoot.length > 0 && chest.pendingLoot.length === 0) {
    return {
      poiId: SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
      category: "teleport" as const,
      mapId: SLIMEWARD_FLOOR_TWO_ID,
      position: SLIMEWARD_EXIT_POSITION,
      reason: "Dungeon chest collected",
    };
  }

  return null;
}

export function updateAzureMassPhaseSystem(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  if (state.currentMapId !== SLIMEWARD_FLOOR_TWO_ID) {
    return state;
  }

  const boss = getLivingAzureMass(state);
  if (!boss) {
    return state;
  }

  const triggeredThresholds =
    state.slimewardDungeon?.azureMass?.triggeredPhaseThresholds ?? [];
  const newlyCrossedThresholds = AZURE_MASS_PHASE_THRESHOLDS.filter(
    (threshold) =>
      !triggeredThresholds.includes(threshold) &&
      boss.health / boss.maxHealth <= threshold / 100,
  );

  if (newlyCrossedThresholds.length === 0) {
    return state;
  }

  let nextState = state;
  const nextTriggeredThresholds = [
    ...triggeredThresholds,
    ...newlyCrossedThresholds,
  ];

  nextState = setAzureMassRuntime(nextState, {
    triggeredPhaseThresholds: nextTriggeredThresholds,
    fleeUntilMs: nowMs + AZURE_MASS_FLEE_DURATION_MS,
  });

  for (const threshold of newlyCrossedThresholds) {
    nextState = spawnAzureMassPhaseWave(nextState, boss, threshold);
  }

  return nextState;
}

export function updateAzureMassFleeBehavior(
  state: GameState,
  timing: SimulationTiming,
  movedEntityIds: Set<string>,
): GameState {
  if (!isAzureMassFleeActive(state, timing.nowMs)) {
    return state;
  }

  const boss = getLivingAzureMass(state);
  const nearestCompanion = boss ? getNearestLivingCompanion(state, boss.position) : null;
  const bossRoom = getAzureMassBossRoom(state);

  if (!boss || !nearestCompanion || !bossRoom) {
    return state;
  }

  const fleeTarget = getAzureMassFleeTargetPosition(
    state,
    boss,
    nearestCompanion,
    bossRoom,
  );
  const fleeingBoss = clearAzureMassAttackRuntime(boss);
  let nextState = updateEntity(state, fleeingBoss);

  nextState = moveEntityTowardPositionIfUnoccupied(
    nextState,
    fleeingBoss,
    fleeTarget,
    {
      allowPartyPassThrough: false,
      pathProfile: "other",
      pathTargetKey: `azure-mass-flee:${getPositionKey(fleeTarget)}`,
      pathTargetPosition: fleeTarget,
      speedMultiplier: AZURE_MASS_FLEE_SPEED_MULTIPLIER,
    },
  );

  const movedBoss = nextState.entities[boss.id];
  if (!movedBoss || movedBoss.kind !== "enemy") {
    return nextState;
  }

  if (!isPositionInsideSubzone(movedBoss.position, bossRoom)) {
    return updateEntity(nextState, {
      ...movedBoss,
      position: boss.position,
    });
  }

  if (getDistance(boss.position, movedBoss.position) > 0.001) {
    movedEntityIds.add(boss.id);
  }

  return nextState;
}

function ensureBossChestState(state: GameState): GameState {
  const chest = state.slimewardDungeon?.chest;
  if (chest) {
    return state;
  }

  const boss = state.entities[SLIMEWARD_BOSS_ID];
  if (!isDeadBoss(boss)) {
    return state;
  }

  return {
    ...state,
    slimewardDungeon: {
      ...currentSlimewardRuntime(state),
      chest: {
        status: "available",
        position: SLIMEWARD_CHEST_POSITION,
        exitTeleportId: SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
        rolledLoot: [],
        collectedLoot: [],
        pendingLoot: rollSlimewardChestLoot(),
      },
    },
  };
}

function ensureBossChestEntity(state: GameState): GameState {
  const chest = state.slimewardDungeon?.chest;
  if (!chest || chest.status === "hidden" || state.currentMapId !== SLIMEWARD_FLOOR_TWO_ID) {
    return state;
  }

  return updateEntity(state, createSlimewardChestNpc(chest));
}

function getNextDungeonEnemy(
  state: GameState,
  orderedEnemyStarts: { id: string }[],
): Enemy | null {
  for (const enemyStart of orderedEnemyStarts) {
    const entity = state.entities[enemyStart.id];

    if (entity?.kind === "enemy" && entity.state !== "dead" && entity.health > 0) {
      return entity;
    }
  }

  return getLivingAzureMassPhaseEnemy(state);
}

function getMapTeleportPosition(
  state: GameState,
  mapId: DebugMapId,
  teleportId: string,
): Position | null {
  const currentMapTeleport =
    state.currentMapId === mapId
      ? state.map?.teleports.find((teleport) => teleport.id === teleportId)
      : undefined;
  const authoredTeleport = debugMapDefinitions[mapId].teleports.find(
    (teleport) => teleport.id === teleportId,
  );

  return currentMapTeleport?.position ?? authoredTeleport?.position ?? null;
}

function isDeadBoss(entity: GameEntity | undefined): entity is Enemy {
  return Boolean(
    entity?.kind === "enemy" &&
      entity.id === SLIMEWARD_BOSS_ID &&
      (entity.state === "dead" || entity.health <= 0),
  );
}

function spawnAzureMassPhaseWave(
  state: GameState,
  boss: Enemy,
  threshold: AzureMassPhaseThreshold,
): GameState {
  let nextState = state;
  const acceptedPositions: Position[] = [];
  const wave = AZURE_MASS_PHASE_WAVES[threshold];

  for (const [index, waveEnemy] of wave.entries()) {
    const enemyId = getAzureMassPhaseEnemyId(threshold, index);
    if (nextState.entities[enemyId]) {
      const existingPosition = nextState.entities[enemyId].position;
      acceptedPositions.push(existingPosition);
      continue;
    }

    const position = findAzureMassWaveSpawnPosition(
      nextState,
      boss,
      acceptedPositions,
    );

    if (!position) {
      continue;
    }

    acceptedPositions.push(position);
    nextState = addEntity(
      nextState,
      createEnemy(enemyId, position, "aggressive", {
        enemyTypeId: waveEnemy.enemyTypeId,
        variant: waveEnemy.variant,
        subzoneId: AZURE_MASS_BOSS_ROOM_ID,
        encounterAreaId: AZURE_MASS_BOSS_PACK_ID,
      }),
    );
  }

  return nextState;
}

function findAzureMassWaveSpawnPosition(
  state: GameState,
  boss: Enemy,
  acceptedPositions: Position[],
): Position | null {
  const bossRoom = getAzureMassBossRoom(state);
  if (!bossRoom) {
    return null;
  }

  return getAzureMassSpawnCandidates(boss.position, bossRoom).find(
    (position) =>
      isValidAzureMassSpawnPosition(state, boss, bossRoom, position, acceptedPositions),
  ) ?? null;
}

function getAzureMassSpawnCandidates(
  center: Position,
  bossRoom: ZoneSubzone,
): Position[] {
  const radii = [5, 7, 9, 11, 13];
  const angles = [
    0,
    Math.PI / 4,
    Math.PI / 2,
    (3 * Math.PI) / 4,
    Math.PI,
    (5 * Math.PI) / 4,
    (3 * Math.PI) / 2,
    (7 * Math.PI) / 4,
    Math.PI / 8,
    (3 * Math.PI) / 8,
    (5 * Math.PI) / 8,
    (7 * Math.PI) / 8,
    (9 * Math.PI) / 8,
    (11 * Math.PI) / 8,
    (13 * Math.PI) / 8,
    (15 * Math.PI) / 8,
  ];
  const candidates: Position[] = [];

  for (const radius of radii) {
    for (const angle of angles) {
      candidates.push(
        clampPositionToSubzone(
          {
            x: Math.round(center.x + Math.cos(angle) * radius),
            y: Math.round(center.y + Math.sin(angle) * radius),
          },
          bossRoom,
        ),
      );
    }
  }

  return dedupePositions(candidates);
}

function isValidAzureMassSpawnPosition(
  state: GameState,
  boss: Enemy,
  bossRoom: ZoneSubzone,
  position: Position,
  acceptedPositions: Position[],
): boolean {
  const bossClearance =
    getEnemyCombatBodyRadius(boss) + AZURE_MASS_SPAWN_CLEARANCE;

  return (
    isPositionInsideSubzone(position, bossRoom) &&
    getDistance(position, boss.position) >= bossClearance &&
    acceptedPositions.every(
      (acceptedPosition) =>
        getDistance(position, acceptedPosition) >= AZURE_MASS_SPAWN_CLEARANCE,
    ) &&
    isPositionAvailable(state, position, {
      blockedPositions: acceptedPositions,
    })
  );
}

function getAzureMassFleeTargetPosition(
  state: GameState,
  boss: Enemy,
  companion: Companion,
  bossRoom: ZoneSubzone,
): Position {
  const preferredDirection = getDirectionAwayFrom(boss.position, companion.position);
  const preferredPosition = clampPositionToSubzone(
    {
      x: Math.round(boss.position.x + preferredDirection.x * 10),
      y: Math.round(boss.position.y + preferredDirection.y * 10),
    },
    bossRoom,
  );
  const candidates = [
    preferredPosition,
    ...getAzureMassFleeCandidates(boss.position, bossRoom),
  ].filter((position) =>
    isPositionAvailable(state, position, {
      ignoredEntityId: boss.id,
    }),
  );

  if (candidates.length === 0) {
    return boss.position;
  }

  return candidates.sort(
    (a, b) =>
      getFleePositionScore(b, boss, companion, preferredDirection) -
      getFleePositionScore(a, boss, companion, preferredDirection),
  )[0];
}

function getAzureMassFleeCandidates(
  center: Position,
  bossRoom: ZoneSubzone,
): Position[] {
  const candidates: Position[] = [];

  for (let y = bossRoom.bounds.y + 1; y < bossRoom.bounds.y + bossRoom.bounds.height - 1; y += 2) {
    for (let x = bossRoom.bounds.x + 1; x < bossRoom.bounds.x + bossRoom.bounds.width - 1; x += 2) {
      const position = { x, y };
      if (getDistance(position, center) <= 12) {
        candidates.push(position);
      }
    }
  }

  return candidates;
}

function getFleePositionScore(
  position: Position,
  boss: Enemy,
  companion: Companion,
  preferredDirection: Position,
): number {
  const fromBoss = {
    x: position.x - boss.position.x,
    y: position.y - boss.position.y,
  };
  const fromBossLength = Math.hypot(fromBoss.x, fromBoss.y) || 1;
  const alignment =
    (fromBoss.x / fromBossLength) * preferredDirection.x +
    (fromBoss.y / fromBossLength) * preferredDirection.y;

  return (
    getDistance(position, companion.position) * 4 +
    alignment * 3 -
    getDistance(position, boss.position) * 0.1
  );
}

function getDirectionAwayFrom(from: Position, awayFrom: Position): Position {
  const x = from.x - awayFrom.x;
  const y = from.y - awayFrom.y;
  const length = Math.hypot(x, y);

  if (length <= 0.001) {
    return { x: 1, y: 0 };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

function clearAzureMassAttackRuntime(boss: Enemy): Enemy {
  return {
    ...boss,
    state: "idle",
    currentTargetId: null,
    attackWindupStartedAt: undefined,
    attackWindupDurationMs: undefined,
    attackWindupTargetId: null,
    roamTargetPosition: null,
    roamMoveUntil: undefined,
    nextRoamAt: undefined,
  };
}

function isAzureMassFleeActive(state: GameState, nowMs: number): boolean {
  return (state.slimewardDungeon?.azureMass?.fleeUntilMs ?? 0) > nowMs;
}

function getLivingAzureMass(state: GameState): Enemy | null {
  const boss = state.entities[SLIMEWARD_BOSS_ID];

  return boss?.kind === "enemy" &&
    boss.enemyTypeId === "azure_mass" &&
    boss.state !== "dead" &&
    boss.health > 0
    ? boss
    : null;
}

function getLivingAzureMassPhaseEnemy(state: GameState): Enemy | null {
  return (
    Object.values(state.entities).find(
      (entity): entity is Enemy =>
        entity.kind === "enemy" &&
        entity.state !== "dead" &&
        entity.health > 0 &&
        entity.subzoneId === AZURE_MASS_BOSS_ROOM_ID &&
        entity.encounterAreaId === AZURE_MASS_BOSS_PACK_ID &&
        entity.id.startsWith("slimeward-azure-mass-phase-"),
    ) ?? null
  );
}

function getNearestLivingCompanion(
  state: GameState,
  position: Position,
): Companion | null {
  let nearestCompanion: Companion | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "companion" || entity.state === "dead" || entity.health <= 0) {
      continue;
    }

    const distance = getDistance(position, entity.position);
    if (distance < nearestDistance) {
      nearestCompanion = entity;
      nearestDistance = distance;
    }
  }

  return nearestCompanion;
}

function getAzureMassBossRoom(state: GameState): ZoneSubzone | null {
  return (
    state.map?.subzones?.find((subzone) => subzone.id === AZURE_MASS_BOSS_ROOM_ID) ??
    null
  );
}

function setAzureMassRuntime(
  state: GameState,
  azureMass: NonNullable<GameState["slimewardDungeon"]>["azureMass"],
): GameState {
  return {
    ...state,
    slimewardDungeon: {
      ...currentSlimewardRuntime(state),
      azureMass,
    },
  };
}

function currentSlimewardRuntime(
  state: GameState,
): NonNullable<GameState["slimewardDungeon"]> {
  return state.slimewardDungeon ?? { chest: null };
}

function getAzureMassPhaseEnemyId(
  threshold: AzureMassPhaseThreshold,
  index: number,
): string {
  return `slimeward-azure-mass-phase-${threshold}-${index}`;
}

function clampPositionToSubzone(position: Position, subzone: ZoneSubzone): Position {
  return {
    x: clamp(
      position.x,
      subzone.bounds.x + 1,
      subzone.bounds.x + subzone.bounds.width - 2,
    ),
    y: clamp(
      position.y,
      subzone.bounds.y + 1,
      subzone.bounds.y + subzone.bounds.height - 2,
    ),
  };
}

function dedupePositions(positions: Position[]): Position[] {
  const seenPositions = new Set<string>();
  const dedupedPositions: Position[] = [];

  for (const position of positions) {
    const key = getPositionKey(position);
    if (seenPositions.has(key)) {
      continue;
    }

    seenPositions.add(key);
    dedupedPositions.push(position);
  }

  return dedupedPositions;
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rollSlimewardChestLoot(): InventorySlot[] {
  return [
    { itemId: "slime_gel_t1", quantity: 8 },
    { itemId: "slime_core_t1", quantity: 2 },
    { itemId: "minor_recovery_flask", quantity: 1 },
  ];
}

function collectChestLoot(
  state: GameState,
  loot: InventorySlot[],
): { state: GameState; collectedLoot: InventorySlot[]; pendingLoot: InventorySlot[] } {
  let nextState = state;
  const collectedLoot: InventorySlot[] = [];
  const pendingLoot: InventorySlot[] = [];

  for (const slot of loot) {
    const result = addItemToInventoryState(
      nextState,
      slot.itemId,
      slot.quantity,
      "chest",
    );
    nextState = result.state;

    if (result.result.addedQuantity > 0) {
      collectedLoot.push({
        itemId: slot.itemId,
        quantity: result.result.addedQuantity,
      });
    }

    if (result.result.overflowQuantity > 0) {
      pendingLoot.push({
        itemId: slot.itemId,
        quantity: result.result.overflowQuantity,
      });
    }
  }

  return {
    state: nextState,
    collectedLoot: mergeInventorySlots(collectedLoot),
    pendingLoot: mergeInventorySlots(pendingLoot),
  };
}

function mergeInventorySlots(slots: InventorySlot[]): InventorySlot[] {
  const quantitiesByItemId = new Map<ItemId, number>();

  for (const slot of slots) {
    quantitiesByItemId.set(
      slot.itemId,
      (quantitiesByItemId.get(slot.itemId) ?? 0) + slot.quantity,
    );
  }

  return Array.from(quantitiesByItemId.entries()).map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }));
}

function getDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
