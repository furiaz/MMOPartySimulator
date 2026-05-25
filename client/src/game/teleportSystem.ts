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
  isRouteTeleportUnlockedForQuests,
  recordMapReachedForQuests,
} from "./questSystem";
import { createActiveQuestGuideNpc } from "./questGuideSystem";
import {
  companionIds,
  createDebugMap,
  debugMapDefinitions,
  hubNpcStartData,
  HUB_MAP_ID,
  mapOneEnemyStartData,
  mapOneResourceStartData,
  mapThreeEnemyStartData,
  mapThreeResourceStartData,
  mapFourEnemyStartData,
  mapFourResourceStartData,
  mapTwoEnemyStartData,
  mapTwoResourceStartData,
  targetDummyId,
  targetDummyPosition,
} from "./debugMap";
import { hasDeadPartyMembers } from "./partySystem";
import {
  getPartyExecutionIntent,
  moveEntityTowardPositionIfUnoccupied,
  setPartyExecutionIntent,
  updateEntity,
  type GameState,
} from "./state";
import type {
  ActiveTeleport,
  Companion,
  DebugMapId,
  DebugTeleportPoint,
  GameEntity,
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

  if (!isRouteTeleportUnlockedForQuests(state, teleport.id)) {
    return appendTeleportSkippedEvent(state, "teleport_route_locked", teleport.id);
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

  return teleport && isRouteTeleportUnlockedForQuests(state, teleport.id)
    ? setTeleportMoveIntent(state, teleport, triggeredBy)
    : state;
}

export function updateTeleportSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
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
    return completeTeleport(activatedState);
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
      isRouteTeleportUnlockedForQuests(state, teleport.id),
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

function completeTeleport(state: GameState): GameState {
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
  const hubDepartureFoodWarning =
    previousMapId === HUB_MAP_ID && teleport.targetMapId !== HUB_MAP_ID
      ? addHubDepartureFoodWarningIfNeeded(state, Date.now()).hubDepartureFoodWarning
      : state.hubDepartureFoodWarning;
  const positionsBeforeTransition = getEntityPositions(state.entities);
  const entities = getMapEntities(state, teleport.targetMapId);
  const targetMap = createDebugMap(teleport.targetMapId);
  let nextState: GameState = {
    ...state,
    entities,
    currentMapId: teleport.targetMapId,
    map: targetMap,
    hubDepartureFoodWarning,
    activeTeleport: null,
    partyIntent: null,
    leaderIntent: null,
    interruptedPoiTarget: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
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
  nextState = recordMapReachedForQuests(nextState, teleport.targetMapId);

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
  mapId: DebugMapId,
): Record<string, GameEntity> {
  const entities = getPreservedCompanions(state);

  if (mapId === HUB_MAP_ID) {
    for (const npc of hubNpcStartData) {
      entities[npc.id] = createNpc(
        npc.id,
        npc.position,
        npc.displayName,
        npc.npcRole,
      );
    }
    entities[targetDummyId] = createTargetDummy(targetDummyId, targetDummyPosition);

    return entities;
  }

  const enemyStartDataByMapId: Record<DebugMapId, typeof mapOneEnemyStartData> = {
    hub: [],
    "map-1": mapOneEnemyStartData,
    "map-2": mapTwoEnemyStartData,
    "map-3": mapThreeEnemyStartData,
    "map-4": mapFourEnemyStartData,
  };
  const resourceStartDataByMapId: Record<DebugMapId, typeof mapOneResourceStartData> = {
    hub: [],
    "map-1": mapOneResourceStartData,
    "map-2": mapTwoResourceStartData,
    "map-3": mapThreeResourceStartData,
    "map-4": mapFourResourceStartData,
  };
  const enemyStartData = enemyStartDataByMapId[mapId];
  const resourceStartData = resourceStartDataByMapId[mapId];

  for (const enemyStart of enemyStartData) {
    entities[enemyStart.id] = createEnemy(enemyStart.id, enemyStart.position, undefined, {
      enemyTypeId: enemyStart.enemyTypeId,
      subzoneId: enemyStart.subzoneId,
      encounterAreaId: enemyStart.encounterAreaId,
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

  return entities;
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
