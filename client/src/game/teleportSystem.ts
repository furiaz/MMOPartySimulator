import {
  createEnemy,
  createNpc,
  createResource,
  createTargetDummy,
  moveEntityTo,
} from "./entities";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { addHubDepartureFoodWarningIfNeeded } from "./consumables";
import {
  clearSlimewardDungeonRuntime,
  createSlimewardChestNpc,
  shouldResetSlimewardDungeonOnTeleport,
} from "./dungeonSystem";
import { rollEnemyVariantForSpawn, isSuperiorEnemy } from "./enemyVariants";
import { recordMapReachedForQuests } from "./questSystem";
import { createActiveQuestGuideNpc } from "./questGuideSystem";
import { isTeleportWorking } from "./teleportState";
import {
  companionIds,
  aoeTargetDummyId,
  aoeTargetDummyPosition,
  createDebugMap,
  debugMapDefinitions,
  hubNpcStartData,
  HUB_MAP_ID,
  SLIMEWARD_CAMP_ID,
  SLIMEWARD_CHEST_ID,
  SLIMEWARD_FLOOR_TWO_ID,
  mapOneEnemyStartData,
  mapOneResourceStartData,
  mapThreeEnemyStartData,
  mapThreeResourceStartData,
  mapFourEnemyStartData,
  mapFourResourceStartData,
  mapTwoEnemyStartData,
  mapTwoResourceStartData,
  slimewardCampNpcStartData,
  slimewardFloorOneEnemyStartData,
  slimewardFloorTwoEnemyStartData,
  targetDummyId,
  targetDummyPosition,
} from "./debugMap";
import { hasDeadPartyMembers } from "./partySystem";
import {
  clearMapTransitionRuntimeState,
  pruneMissingEntityRuntimeState,
} from "./mapRuntimeCleanup";
import {
  updateEntity,
  type GameState,
} from "./state";
import { moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import {
  getPartyExecutionIntent,
  setPartyExecutionIntent,
} from "./partyIntentState";
import type {
  ActiveTeleport,
  Companion,
  DebugMapId,
  DebugTeleportPoint,
  GameEntity,
  GameMap,
  Position,
} from "./types";

export function triggerMapTeleport(
  state: GameState,
  triggeredBy: "ai" | "player",
  teleportId?: string,
): GameState {
  if (state.activeTeleport) {
    return appendTeleportSkippedEvent(state, "active_teleport_exists", teleportId);
  }

  const teleport = getTeleportForCurrentMap(state, teleportId);

  if (!teleport) {
    return appendTeleportSkippedEvent(state, "teleport_not_found", teleportId);
  }

  if (!isTeleportWorking(state, teleport.id)) {
    return appendTeleportSkippedEvent(state, "teleport_not_working", teleport.id);
  }

  const nextState = setTeleportMoveIntent(state, teleport, triggeredBy);

  return appendDebugTelemetryEvent(
    {
      ...nextState,
      activeTeleport: {
        id: teleport.id,
        position: teleport.position,
        range: teleport.range,
        sourceMapId: teleport.sourceMapId,
        targetMapId: teleport.targetMapId,
        triggeredBy,
      },
    },
    {
      type: "teleport_started",
      entityId: "party",
      activeTeleportId: teleport.id,
      activeTeleportSourceMapId: teleport.sourceMapId,
      activeTeleportTargetMapId: teleport.targetMapId,
      teleportTriggerSource: triggeredBy,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
    },
  );
}

export function setMapTeleportPoi(
  state: GameState,
  teleportId?: string,
  triggeredBy: "ai" | "player" = "player",
): GameState {
  if (state.activeTeleport) {
    return state;
  }

  const teleport = getTeleportForCurrentMap(state, teleportId);

  return teleport && isTeleportWorking(state, teleport.id)
    ? setTeleportMoveIntent(state, teleport, triggeredBy)
    : state;
}

export function updateTeleportSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
  nowMs = Date.now(),
): GameState {
  if (isAiTeleportPausedForResurrection(state)) {
    return state;
  }

  const autoTeleport = getAutoTeleport(state);
  const poiState = autoTeleport ? setMapTeleportPoi(state, autoTeleport.id, "ai") : state;
  const activatedState = getActivatedTeleportState(poiState);

  if (!activatedState.activeTeleport) {
    return activatedState;
  }

  if (isPartyWithinTeleportRange(activatedState)) {
    return completeTeleport(activatedState, nowMs);
  }

  return movePartyToTeleport(activatedState, movedEntityIds);
}

export function isTeleportRallyActive(state: GameState): boolean {
  return Boolean(state.activeTeleport);
}

export function isMapTeleportPoiActive(state: GameState): boolean {
  return Boolean(getTeleportPoi(state));
}

function getAutoTeleport(state: GameState): DebugTeleportPoint | null {
  if (
    !state.autoModeEnabled ||
    state.activeTeleport ||
    getTeleportPoi(state) ||
    hasDeadPartyMembers(state)
  ) {
    return null;
  }

  if (state.globalPoiIntent && state.globalPoiIntent.type !== "idle") {
    return null;
  }

  if (getLivingEnemies(state).length > 0) {
    return null;
  }

  return getCurrentTeleports(state).find(
    (teleport) =>
      teleport.autoSelectAfterEnemiesCleared &&
      isTeleportWorking(state, teleport.id),
  ) ?? null;
}

function getActivatedTeleportState(state: GameState): GameState {
  const teleport = getTeleportPoi(state);

  if (teleport && hasDeadPartyMembers(state) && isAiTeleportIntent(state)) {
    return state;
  }

  if (teleport && shouldPartyMemberTriggerTeleport(state, teleport)) {
    return triggerMapTeleport(state, getTeleportTriggerSource(state), teleport.id);
  }

  return state;
}

function shouldPartyMemberTriggerTeleport(
  state: GameState,
  teleport: DebugTeleportPoint,
): boolean {
  return getLivingPartyMembers(state).some(
    (partyMember) => getDistance(partyMember.position, teleport.position) <= 2,
  );
}

function getTeleportTriggerSource(state: GameState): "ai" | "player" {
  return getPartyExecutionIntent(state)?.source !== "player" &&
    state.autoModeEnabled &&
    getLivingEnemies(state).length === 0
    ? "ai"
    : "player";
}

function isAiTeleportIntent(state: GameState): boolean {
  return (
    getPartyExecutionIntent(state)?.source !== "player" &&
    state.autoModeEnabled &&
    getLivingEnemies(state).length === 0
  );
}

function isAiTeleportPausedForResurrection(state: GameState): boolean {
  return (
    hasDeadPartyMembers(state) &&
    Boolean(state.activeTeleport && state.activeTeleport.triggeredBy === "ai")
  );
}

function getTeleportPoi(state: GameState): DebugTeleportPoint | null {
  const executionIntent = getPartyExecutionIntent(state);

  if (
    executionIntent?.type !== "move" ||
    executionIntent.targetId !== null ||
    !executionIntent.targetPosition
  ) {
    return null;
  }

  return getCurrentTeleports(state).find(
    (teleport) =>
      isTeleportWorking(state, teleport.id) &&
      getDistance(executionIntent.targetPosition ?? teleport.position, teleport.position) <=
      0.001,
  ) ?? null;
}

function movePartyToTeleport(
  state: GameState,
  movedEntityIds: Set<string>,
): GameState {
  let nextState = state.activeTeleport
    ? setTeleportMoveIntent(state, state.activeTeleport)
    : state;
  const teleport = nextState.activeTeleport;

  if (!teleport) {
    return nextState;
  }

  for (const partyMember of getLivingPartyMembers(nextState)) {
    const currentMember = nextState.entities[partyMember.id];

    if (!currentMember || currentMember.kind !== "companion") {
      continue;
    }

    const readyMember: Companion = {
      ...currentMember,
      state: "follow",
      currentTargetId: null,
      commandPriority: "autonomous",
    };

    nextState = updateEntity(nextState, readyMember);

    if (
      movedEntityIds.has(readyMember.id) ||
      getDistance(readyMember.position, teleport.position) <= teleport.range
    ) {
      continue;
    }

    const movedState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      readyMember,
      teleport.position,
      {
        allowPartyPassThrough: true,
        pathProfile: "teleport",
        pathTargetKey: `teleport:${teleport.id}`,
        pathTargetPosition: teleport.position,
      },
    );

    if (didEntityMove(movedState, readyMember)) {
      movedEntityIds.add(readyMember.id);
    }

    nextState = movedState;
  }

  return nextState;
}

function completeTeleport(state: GameState, nowMs: number): GameState {
  const teleport = state.activeTeleport;

  if (!teleport) {
    return appendTeleportSkippedEvent(state, "no_active_teleport");
  }

  const teleportDefinition = getTeleportById(teleport.sourceMapId, teleport.id);

  if (!teleportDefinition) {
    return appendTeleportSkippedEvent(state, "teleport_definition_missing", teleport.id);
  }

  const previousMapId = state.currentMapId;
  const previousMap = state.map;
  const sourceState = shouldResetSlimewardDungeonOnTeleport(teleport.id)
    ? clearSlimewardDungeonRuntime(state)
    : state;
  const hubDepartureFoodWarning =
    previousMapId === HUB_MAP_ID && teleport.targetMapId !== HUB_MAP_ID
      ? addHubDepartureFoodWarningIfNeeded(sourceState, nowMs).hubDepartureFoodWarning
      : sourceState.hubDepartureFoodWarning;
  const positionsBeforeTransition = getEntityPositions(sourceState.entities);
  const targetMap = createDebugMap(teleport.targetMapId);
  const entities = getMapEntities(sourceState, targetMap);
  let nextState: GameState = {
    ...clearMapTransitionRuntimeState(sourceState),
    entities,
    currentMapId: teleport.targetMapId,
    map: targetMap,
    hubDepartureFoodWarning,
    partyIntent: null,
    leaderIntent: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
  };

  for (const companionId of companionIds) {
    const companion = nextState.entities[companionId];

    if (companion?.kind !== "companion") {
      continue;
    }

    const position =
      teleportDefinition.arrivalPositions[companionIds.indexOf(companionId)] ??
      teleportDefinition.arrivalPositions[0];

    nextState = updateEntity(nextState, {
      ...moveEntityTo(companion, position),
      state: "follow",
      currentTargetId:
        companion.id === nextState.partyLeaderId ? null : nextState.partyLeaderId,
      commandPriority: "autonomous",
    });
  }

  const leader = nextState.entities[nextState.partyLeaderId];
  const positionsAfterTransition = getEntityPositions(nextState.entities);

  nextState = {
    ...nextState,
    exploredTiles: leader
      ? { [`${Math.round(leader.position.x)},${Math.round(leader.position.y)}`]: true }
      : {},
  };
  nextState = pruneMissingEntityRuntimeState(nextState);
  nextState = recordMapReachedForQuests(nextState, teleport.targetMapId);
  nextState = appendSuperiorEnemySpawnEvents(nextState, "map_spawn");

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "teleport_completed",
    entityId: "party",
    previousMapId,
    nextMapId: teleport.targetMapId,
    previousMapDisplayName: previousMap?.displayName,
    nextMapDisplayName: targetMap.displayName,
    activeTeleportId: teleport.id,
    activeTeleportSourceMapId: teleport.sourceMapId,
    activeTeleportTargetMapId: teleport.targetMapId,
    teleportTriggerSource: teleport.triggeredBy,
    positionsBeforeTransition,
    positionsAfterTransition,
  });

  return appendDebugTelemetryEvent(nextState, {
    type: "map_transition",
    entityId: "party",
    previousMapId,
    nextMapId: teleport.targetMapId,
    previousMapDisplayName: previousMap?.displayName,
    nextMapDisplayName: targetMap.displayName,
    activeTeleportId: teleport.id,
    activeTeleportSourceMapId: teleport.sourceMapId,
    activeTeleportTargetMapId: teleport.targetMapId,
    teleportTriggerSource: teleport.triggeredBy,
    positionsBeforeTransition,
    positionsAfterTransition,
  });
}

function getMapEntities(
  state: GameState,
  map: GameMap,
): Record<string, GameEntity> {
  const entities = getPreservedCompanions(state);
  const mapId = map.id ?? HUB_MAP_ID;

  if (mapId === HUB_MAP_ID || mapId === SLIMEWARD_CAMP_ID) {
    const npcStartData =
      mapId === HUB_MAP_ID ? hubNpcStartData : slimewardCampNpcStartData;

    for (const npc of npcStartData) {
      entities[npc.id] = createNpc(
        npc.id,
        npc.position,
        npc.displayName,
        npc.npcRole,
      );
    }

    if (mapId === SLIMEWARD_CAMP_ID) {
      return entities;
    }

    entities[targetDummyId] = createTargetDummy(targetDummyId, targetDummyPosition);
    entities[aoeTargetDummyId] = createTargetDummy(
      aoeTargetDummyId,
      aoeTargetDummyPosition,
    );

    return entities;
  }

  const enemyStartDataByMapId: Record<DebugMapId, typeof mapOneEnemyStartData> = {
    hub: [],
    "map-1": mapOneEnemyStartData,
    "map-2": mapTwoEnemyStartData,
    "map-3": mapThreeEnemyStartData,
    "map-4": mapFourEnemyStartData,
    "slimeward-camp": [],
    "slimeward-floor-1": slimewardFloorOneEnemyStartData,
    "slimeward-floor-2": slimewardFloorTwoEnemyStartData,
  };
  const resourceStartDataByMapId: Record<DebugMapId, typeof mapOneResourceStartData> = {
    hub: [],
    "map-1": mapOneResourceStartData,
    "map-2": mapTwoResourceStartData,
    "map-3": mapThreeResourceStartData,
    "map-4": mapFourResourceStartData,
    "slimeward-camp": [],
    "slimeward-floor-1": [],
    "slimeward-floor-2": [],
  };
  const enemyStartData = enemyStartDataByMapId[mapId];
  const resourceStartData = resourceStartDataByMapId[mapId];

  for (const enemyStart of enemyStartData) {
    const variant =
      enemyStart.variant ??
      rollEnemyVariantForSpawn({
        currentMapId: mapId,
        map,
        position: enemyStart.position,
        subzoneId: enemyStart.subzoneId,
        existingEntities: entities,
      });

    entities[enemyStart.id] = createEnemy(enemyStart.id, enemyStart.position, undefined, {
      enemyTypeId: enemyStart.enemyTypeId,
      subzoneId: enemyStart.subzoneId,
      encounterAreaId: enemyStart.encounterAreaId,
      variant,
      maxHealth: enemyStart.enemyTypeId === "azure_mass" ? 900 : undefined,
      xpReward: enemyStart.enemyTypeId === "azure_mass" ? 160 : undefined,
    });
  }

  for (const resource of resourceStartData) {
    entities[resource.id] = createResource(resource.id, resource.position, {
      resourceType: resource.resourceType,
      tier: resource.tier,
    });
  }

  const guide = createActiveQuestGuideNpc(state, mapId);
  if (guide) {
    entities[guide.id] = guide;
  }

  const chest = state.slimewardDungeon?.chest;
  if (mapId === SLIMEWARD_FLOOR_TWO_ID && chest && chest.status !== "hidden") {
    entities[SLIMEWARD_CHEST_ID] = createSlimewardChestNpc(chest);
  }

  return entities;
}

function appendSuperiorEnemySpawnEvents(
  state: GameState,
  source: "map_spawn" | "respawn",
): GameState {
  let nextState = state;

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "enemy" || !isSuperiorEnemy(entity)) {
      continue;
    }

    nextState = appendDebugTelemetryEvent(nextState, {
      type: "superior_enemy_spawned",
      entityId: entity.id,
      currentMapId: nextState.currentMapId,
      currentMapDisplayName: nextState.map?.displayName,
      currentMapDebugName: nextState.map?.debugName,
      enemyTypeId: entity.enemyTypeId,
      enemyArchetypeId: entity.archetypeId,
      enemyVariant: entity.variant,
      enemyPosition: entity.position,
      enemyLevel: entity.level,
      reason: source,
    });
  }

  return nextState;
}

function getPreservedCompanions(state: GameState): Record<string, GameEntity> {
  const entities: Record<string, GameEntity> = {};

  for (const companionId of companionIds) {
    const companion = state.entities[companionId];

    if (companion?.kind === "companion") {
      entities[companion.id] = companion;
    }
  }

  return entities;
}

function setTeleportMoveIntent(
  state: GameState,
  teleport: Pick<ActiveTeleport, "position"> | DebugTeleportPoint,
  source: "ai" | "player" = "ai",
): GameState {
  return setPartyExecutionIntent(state, {
    type: "move",
    targetId: null,
    targetPosition: teleport.position,
    source,
  });
}

function getTeleportForCurrentMap(
  state: GameState,
  teleportId?: string,
): DebugTeleportPoint | null {
  const teleports = getCurrentTeleports(state);

  if (teleportId) {
    return teleports.find((teleport) => teleport.id === teleportId) ?? null;
  }

  return teleports[0] ?? null;
}

function getCurrentTeleports(state: GameState): DebugTeleportPoint[] {
  if (state.map?.teleports) {
    return state.map.teleports;
  }

  return state.currentMapId ? debugMapDefinitions[state.currentMapId].teleports : [];
}

function getTeleportById(
  mapId: DebugMapId,
  teleportId: string,
): DebugTeleportPoint | null {
  return debugMapDefinitions[mapId].teleports.find(
    (teleport) => teleport.id === teleportId,
  ) ?? null;
}

function appendTeleportSkippedEvent(
  state: GameState,
  reason: string,
  teleportId?: string,
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: "teleport_skipped",
    entityId: "party",
    activeTeleportId: teleportId ?? state.activeTeleport?.id ?? null,
    activeTeleportSourceMapId: state.activeTeleport?.sourceMapId,
    activeTeleportTargetMapId: state.activeTeleport?.targetMapId,
    teleportTriggerSource: state.activeTeleport?.triggeredBy,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
    reason,
  });
}

function isPartyWithinTeleportRange(state: GameState): boolean {
  const teleport = state.activeTeleport;

  if (!teleport) {
    return false;
  }

  const partyMembers = getLivingPartyMembers(state);

  return (
    partyMembers.length > 0 &&
    partyMembers.every(
      (partyMember) =>
        getDistance(partyMember.position, teleport.position) <= teleport.range,
    )
  );
}

function getLivingPartyMembers(state: GameState): Companion[] {
  return Object.values(state.entities).filter(
    (entity): entity is Companion =>
      entity.kind === "companion" &&
      entity.state !== "dead" &&
      entity.health > 0,
  );
}

function getLivingEnemies(state: GameState): GameEntity[] {
  return Object.values(state.entities).filter(
    (entity) =>
      entity.kind === "enemy" &&
      entity.state !== "dead" &&
      entity.health > 0,
  );
}

function getEntityPositions(
  entities: Record<string, GameEntity>,
): Record<string, Position> {
  return Object.fromEntries(
    Object.values(entities).map((entity) => [
      entity.id,
      { ...entity.position },
    ]),
  );
}

function didEntityMove(state: GameState, entity: GameEntity): boolean {
  const currentEntity = state.entities[entity.id];

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

function getDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
