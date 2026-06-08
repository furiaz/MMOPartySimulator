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
import { createNpc } from "./entities";
import { addItemToInventoryState } from "./inventory";
import { getPartyLeader } from "./partySystem";
import { recordDungeonChestCollectedForQuests } from "./questSystem";
import { setTeleportWorking } from "./teleportState";
import { updateEntity, type GameState } from "./state";
import type {
  DebugMapId,
  DungeonChestRuntimeState,
  Enemy,
  GameEntity,
  InventorySlot,
  ItemId,
  NpcEntity,
  Position,
} from "./types";

const CHEST_INTERACTION_RANGE = 3;
const CHEST_AUTO_CONTINUE_DELAY_MS = 10_000;

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

  let nextState = ensureBossChestState(state);
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

  return null;
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
