import { createCompanion, createNpc, isResourceEntity, moveEntityTo } from "./entities";
import { PROTOTYPE_CONSUMABLE_ITEM_IDS } from "./consumables";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  clearSlimewardDungeonRuntime,
  isSlimewardMapId,
} from "./dungeonSystem";
import { applyEnemyVariantStats, isSuperiorEnemy } from "./enemyVariants";
import {
  SLIMEWARD_CAMP_ID,
  companionIds,
  createDebugMap,
  slimewardCampArrivalPositions,
  slimewardCampNpcStartData,
} from "./debugMap";
import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import { syncCompanionDerivedMaxHealth } from "./stats";
import { getSubzoneAtPosition } from "./subzoneSystem";
import { addItemToInventoryState } from "./inventory";
import {
  getCharacterXpToNextLevel,
  grantCharacterXpToCompanion,
} from "./leveling";
import {
  addCurrencyToWalletState,
  removeCurrencyFromWalletState,
  setCurrencyBalanceForDebug,
} from "./wallet";
import {
  addEntity,
  findClosestAvailablePosition,
  getEntityById,
  isWallPosition,
  updateEntity,
  type GameState,
} from "./state";
import type { Companion, Enemy, GameEntity, Position, ResourceEntity } from "./types";

const DEBUG_ENEMY_HEALTH = 3;
const DEBUG_RESOURCE_DURABILITY = 5;
const DEBUG_RESOURCE_QUANTITY = 3;
const DEBUG_TEST_ITEM_QUANTITY = 1;
const DEBUG_TEST_CROWNS_AMOUNT = 100;
const DEFAULT_DEBUG_OPTIONS = {
  superSpeedEnabled: false,
  superExpEnabled: false,
  companionInfiniteHealthEnabled: false,
};
const DEBUG_PROTOTYPE_EQUIPMENT_ITEM_IDS = [
  "training_sword",
  "iron_sword",
  "guard_mace",
  "claw_gauntlets",
  "thorn_whip",
  "short_bow",
  "apprentice_orb",
  "rune_lantern",
  "holy_mace",
  "wooden_shield",
  "simple_talisman",
  "holy_lantern",
  "sacrificial_dagger",
  "acolyte_hood",
  "scholar_robe",
  "scout_boots",
  "stalker_grips",
  "guard_hauberk",
  "vanguard_gloves",
  "bulwark_cuirass",
  "warplate_gauntlets",
  "plain_charm",
] as const;

export function debugAddCompanion(
  state: GameState,
  companionId: string,
  followTargetId: string,
  position: Position,
): GameState {
  if (getEntityById(state, companionId)) {
    return state;
  }

  const companionCount = Object.values(state.entities).filter(
    (entity) => entity.kind === "companion",
  ).length;

  const partyOrder = companionCount;
  const availablePosition = findClosestAvailablePosition(state, position);

  const nextState = addEntity(
    state,
    createCompanion(
      companionId,
      availablePosition,
      followTargetId,
      "fighter",
      partyOrder,
    ),
  );

  return ensurePartyLeader(nextState);
}

export function debugAddCompanionToParty(
  state: GameState,
  companionIds: string[],
  followTargetId: string,
  positions: Position[],
): GameState {
  const nextCompanionId = companionIds.find((id) => !getEntityById(state, id));

  if (!nextCompanionId) {
    return state;
  }

  const position = positions[companionIds.indexOf(nextCompanionId)] ?? {
    x: 0,
    y: 0,
  };

  return debugAddCompanion(state, nextCompanionId, followTargetId, position);
}

export function debugRemoveCompanion(
  state: GameState,
  companionId: string,
): GameState {
  if (!getEntityById(state, companionId)) {
    return state;
  }

  const companionCount = Object.values(state.entities).filter(
    (entity) => entity.kind === "companion",
  ).length;

  if (companionCount <= 1) {
    return ensurePartyLeader(state);
  }

  const entities = { ...state.entities };
  const followTrailsByEntityId = { ...state.followTrailsByEntityId };
  delete entities[companionId];
  delete followTrailsByEntityId[companionId];

  return {
    ...state,
    entities,
    followTrailsByEntityId,
    partyLeaderId:
      state.partyLeaderId === companionId ? getFallbackLeaderId(entities) : state.partyLeaderId,
  };
}

export function debugRemoveCompanionFromParty(
  state: GameState,
  companionIds: string[],
): GameState {
  const companionId = companionIds
    .slice()
    .reverse()
    .find((id) => getEntityById(state, id));

  if (!companionId) {
    return state;
  }

  return debugRemoveCompanion(state, companionId);
}

export function debugToggleSuperSpeed(state: GameState): GameState {
  const debugOptions = state.debugOptions ?? DEFAULT_DEBUG_OPTIONS;

  return {
    ...state,
    debugOptions: {
      ...debugOptions,
      superSpeedEnabled: !debugOptions.superSpeedEnabled,
    },
  };
}

export function debugToggleSuperExp(state: GameState): GameState {
  const debugOptions = state.debugOptions ?? DEFAULT_DEBUG_OPTIONS;

  return {
    ...state,
    debugOptions: {
      ...debugOptions,
      superExpEnabled: !debugOptions.superExpEnabled,
    },
  };
}

export function debugToggleCompanionInfiniteHealth(state: GameState): GameState {
  const debugOptions = state.debugOptions ?? DEFAULT_DEBUG_OPTIONS;

  const nextState = {
    ...state,
    debugOptions: {
      ...debugOptions,
      companionInfiniteHealthEnabled: !debugOptions.companionInfiniteHealthEnabled,
    },
  };

  return nextState.debugOptions.companionInfiniteHealthEnabled
    ? debugApplyCompanionInfiniteHealth(nextState)
    : nextState;
}

export function debugLevelUpAllCompanions(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    const xpToNextLevel = getCharacterXpToNextLevel(entity.characterLevel);

    if (xpToNextLevel === null) {
      continue;
    }

    const xpNeeded = Math.max(1, xpToNextLevel - entity.characterXp);

    nextState = updateEntity(
      nextState,
      grantCharacterXpToCompanion(entity, xpNeeded),
    );
  }

  return nextState;
}

export function debugApplyCompanionInfiniteHealth(state: GameState): GameState {
  if (!state.debugOptions?.companionInfiniteHealthEnabled) {
    return state;
  }

  return debugRestorePartyHealth(state);
}

export function debugRandomizeLocations(
  state: GameState,
  maxX: number,
  maxY: number,
): GameState {
  let nextState = state;
  const usedPositions = new Set<string>();

  for (const entity of Object.values(state.entities)) {
    const position = getRandomOpenPosition(nextState, maxX, maxY, usedPositions);
    usedPositions.add(getPositionKey(position));

    nextState = updateEntity(
      nextState,
      moveEntityTo(entity, position),
    );
  }

  return nextState;
}

export function debugResurrectEnemy(
  state: GameState,
  enemyId: string,
): GameState {
  const entity = getEntityById(state, enemyId);

  if (entity?.kind !== "enemy") {
    return state;
  }

  const enemy: Enemy = {
    ...entity,
    state: "idle",
    health: entity.maxHealth || DEBUG_ENEMY_HEALTH,
    maxHealth: entity.maxHealth || DEBUG_ENEMY_HEALTH,
    currentTargetId: null,
    lastAttackAt: 0,
    attackWindupStartedAt: undefined,
    attackWindupDurationMs: undefined,
    attackWindupTargetId: null,
  };

  return updateEntity(state, enemy);
}

export function debugRestorePartyHealth(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    nextState = updateEntity(nextState, restorePartyMember(entity));
  }

  return nextState;
}

export function debugKillOneCompanion(state: GameState): GameState {
  const companion = Object.values(state.entities)
    .filter(
      (entity): entity is Companion =>
        entity.kind === "companion" &&
        entity.state !== "dead" &&
        entity.health > 0,
    )
    .sort((first, second) => first.partyOrder - second.partyOrder)[0];

  if (!companion) {
    return state;
  }

  return updateEntity(state, {
    ...companion,
    state: "dead",
    health: 0,
    currentTargetId: null,
    defendPosition: null,
    commandPriority: "autonomous",
  });
}

export function debugForceSuperiorEnemyInCurrentSubzone(
  state: GameState,
): GameState {
  if (!state.currentMapId || state.currentMapId === "hub") {
    return state;
  }

  const leader = getPartyLeader(state);
  const subzoneId = getSubzoneAtPosition(state.map, leader?.position)?.id;

  if (!leader || !subzoneId || hasLivingSuperiorInSubzone(state, subzoneId)) {
    return state;
  }

  const target = Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        entity.kind === "enemy" &&
        entity.state !== "dead" &&
        entity.health > 0 &&
        entity.subzoneId === subzoneId &&
        !entity.isTargetDummy &&
        entity.enemyTypeId !== "azure_mass" &&
        !entity.questSpawn &&
        !isSuperiorEnemy(entity),
    )
    .sort(
      (first, second) =>
        getEuclideanDistance(first.position, leader.position) -
        getEuclideanDistance(second.position, leader.position),
    )[0];

  if (!target) {
    return state;
  }

  const superiorEnemy = applyEnemyVariantStats({
    ...target,
    variant: "superior",
    scalingOverrides: target.scalingOverrides.includes("superior")
      ? target.scalingOverrides
      : [...target.scalingOverrides, "superior"],
  });
  const nextState = updateEntity(state, superiorEnemy);

  return appendDebugTelemetryEvent(nextState, {
    type: "superior_enemy_spawned",
    entityId: superiorEnemy.id,
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
    enemyTypeId: superiorEnemy.enemyTypeId,
    enemyArchetypeId: superiorEnemy.archetypeId,
    enemyVariant: superiorEnemy.variant,
    enemyPosition: superiorEnemy.position,
    enemyLevel: superiorEnemy.level,
    reason: "debug_force",
  });
}

export function debugAddTestWoodToInventory(state: GameState): GameState {
  return addItemToInventoryState(
    state,
    "softwood",
    DEBUG_TEST_ITEM_QUANTITY,
    "debug",
  ).state;
}

export function debugAddTestCrowns(state: GameState): GameState {
  return addCurrencyToWalletState(
    state,
    "crowns",
    DEBUG_TEST_CROWNS_AMOUNT,
    "debug",
  ).state;
}

export function debugRemoveTestCrowns(state: GameState): GameState {
  return removeCurrencyFromWalletState(
    state,
    "crowns",
    DEBUG_TEST_CROWNS_AMOUNT,
    "debug",
  ).state;
}

export function debugResetCrowns(state: GameState): GameState {
  return setCurrencyBalanceForDebug(state, "crowns", 0).state;
}

export function debugAddPrototypeEquipmentToInventory(state: GameState): GameState {
  return DEBUG_PROTOTYPE_EQUIPMENT_ITEM_IDS.reduce(
    (nextState, itemId) =>
      addItemToInventoryState(
        nextState,
        itemId,
        DEBUG_TEST_ITEM_QUANTITY,
        "debug",
      ).state,
    state,
  );
}

export function debugAddPrototypeConsumablesToInventory(state: GameState): GameState {
  return PROTOTYPE_CONSUMABLE_ITEM_IDS.reduce(
    (nextState, itemId) =>
      addItemToInventoryState(
        nextState,
        itemId,
        itemId.endsWith("_rations") ? 5 : 1,
        "debug",
      ).state,
    state,
  );
}

export function debugResetSlimewardDungeon(state: GameState): GameState {
  const clearedState = clearSlimewardDungeonRuntime(state);

  if (!isSlimewardMapId(clearedState.currentMapId)) {
    return clearedState;
  }

  const map = createDebugMap(SLIMEWARD_CAMP_ID);
  let entities: Record<string, GameEntity> = {};

  for (const companionId of companionIds) {
    const companion = clearedState.entities[companionId];

    if (companion?.kind !== "companion") {
      continue;
    }

    const position =
      slimewardCampArrivalPositions[companionIds.indexOf(companionId)] ??
      slimewardCampArrivalPositions[0];
    entities[companion.id] = {
      ...moveEntityTo(companion, position),
      state: "follow",
      currentTargetId:
        companion.id === clearedState.partyLeaderId
          ? null
          : clearedState.partyLeaderId,
      commandPriority: "autonomous",
    };
  }

  for (const npc of slimewardCampNpcStartData) {
    entities[npc.id] = createNpc(npc.id, npc.position, npc.displayName, npc.npcRole);
  }

  return {
    ...clearedState,
    currentMapId: SLIMEWARD_CAMP_ID,
    map,
    entities,
    activeTeleport: null,
    leaderIntent: null,
    partyIntent: null,
    localPoiTarget: null,
    globalPoiIntent: null,
    worldTravelTargetMapId: null,
    lastPoiDecision: undefined,
    directCompanionCommandsById: {},
    directCommandGraceUntilByCompanionId: {},
    interruptedPoiTarget: null,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    failedMoveByEntityId: {},
    movementFailuresByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
    movementPathsByEntityId: {},
    movementDecisionsByEntityId: {},
    lastPositionsByEntityId: {},
    defenderWaitTicksByLeaderId: {},
    defenderBlockedTicksByEntityId: {},
    defenderWaitMsByLeaderId: {},
    defenderBlockedMsByEntityId: {},
    skillVisualEvents: [],
    enemyAoeChannelsByCasterId: {},
    enemyAoeCooldownsByCasterId: {},
    dropVisualEvents: [],
    resurrectionProgressByCompanionId: {},
    resurrectionChannelsByHelperId: {},
    partyFormation: {
      phase: "idle",
      targetId: null,
      approachPoint: null,
      direction: { x: 0, y: 0 },
      slotsByEntityId: {},
      slotReasonsByEntityId: {},
      skippedTargetIds: [],
    },
  };
}

export function debugRefreshResources(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isResourceEntity(entity)) {
      continue;
    }

    nextState = moveEntitiesOffResourcePosition(nextState, entity);
    nextState = updateEntity(nextState, resetResource(entity));
  }

  return nextState;
}

function moveEntitiesOffResourcePosition(
  state: GameState,
  resource: ResourceEntity,
): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (
      entity.id === resource.id ||
      entity.kind === "resource" ||
      !isSamePosition(entity.position, resource.position)
    ) {
      continue;
    }

    nextState = updateEntity(
      nextState,
      moveEntityTo(
        entity,
        findClosestAvailablePosition(nextState, entity.position, {
          blockedPositions: [resource.position],
          ignoredEntityId: entity.id,
        }),
      ),
    );
  }

  return nextState;
}

function resetResource(resource: ResourceEntity): ResourceEntity {
  return {
    ...resource,
    state: "idle",
    durability: DEBUG_RESOURCE_DURABILITY,
    maxDurability: DEBUG_RESOURCE_DURABILITY,
    quantity: DEBUG_RESOURCE_QUANTITY,
    isDepleted: false,
  };
}

function restorePartyMember(entity: Companion): Companion {
  const syncedEntity = syncCompanionDerivedMaxHealth(entity);

  return {
    ...syncedEntity,
    health: syncedEntity.maxHealth,
    state: syncedEntity.state === "dead" ? "idle" : syncedEntity.state,
  };
}

function getFallbackLeaderId(entities: Record<string, GameEntity>): string {
  return (
    Object.values(entities).find(
      (entity) => entity.kind === "companion",
    )?.id ?? ""
  );
}

function ensurePartyLeader(state: GameState): GameState {
  const leader = getEntityById(state, state.partyLeaderId);

  if (leader?.kind === "companion") {
    return state;
  }

  return {
    ...state,
    partyLeaderId: getFallbackLeaderId(state.entities),
  };
}

function hasLivingSuperiorInSubzone(
  state: GameState,
  subzoneId: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "enemy" &&
      entity.state !== "dead" &&
      entity.health > 0 &&
      entity.subzoneId === subzoneId &&
      isSuperiorEnemy(entity),
  );
}

function getRandomOpenPosition(
  state: GameState,
  maxX: number,
  maxY: number,
  usedPositions: Set<string>,
): Position {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const position = {
      x: Math.random() * maxX,
      y: Math.random() * maxY,
    };

    if (
      isWallPosition(state, position) ||
      usedPositions.has(getPositionKey(position))
    ) {
      continue;
    }

    return position;
  }

  return { x: 0, y: 0 };
}

function getPositionKey(position: Position): string {
  return `${Math.round(position.x)},${Math.round(position.y)}`;
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}
