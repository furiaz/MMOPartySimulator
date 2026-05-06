import { createEnemy, createResource, moveEntityTo } from "./entities";
import {
  companionIds,
  createDebugMap,
  enemyIds,
  mapTwoCompanionStartPositions,
  mapTwoEnemyStartPositions,
  mapTwoResourceStartData,
  MAP_ONE_ID,
  MAP_TWO_ID,
  resourceIds,
  teleporterPosition,
  TELEPORTER_ID,
  TELEPORTER_RANGE,
} from "./debugMap";
import {
  moveEntityTowardPositionIfUnoccupied,
  setLeaderIntent,
  updateEntity,
  type GameState,
} from "./state";
import type { Companion, GameEntity, Position } from "./types";

export function triggerMapTeleport(
  state: GameState,
  triggeredBy: "ai" | "player",
): GameState {
  if (state.currentMapId !== MAP_ONE_ID || state.activeTeleport) {
    return state;
  }

  return {
    ...setTeleportMoveIntent(state),
    activeTeleport: {
      id: TELEPORTER_ID,
      position: teleporterPosition,
      range: TELEPORTER_RANGE,
      targetMapId: MAP_TWO_ID,
      triggeredBy,
    },
  };
}

export function setMapTeleportPoi(state: GameState): GameState {
  if (state.currentMapId !== MAP_ONE_ID || state.activeTeleport) {
    return state;
  }

  return setTeleportMoveIntent(state);
}

export function updateTeleportSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  const activatedState = getActivatedTeleportState(state);

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
  return isTeleportPoiActive(state);
}

function shouldAutoTriggerTeleport(state: GameState): boolean {
  return (
    state.autoModeEnabled &&
    state.currentMapId === MAP_ONE_ID &&
    !state.activeTeleport &&
    getLivingEnemies(state).length === 0
  );
}

function getActivatedTeleportState(state: GameState): GameState {
  if (shouldAutoTriggerTeleport(state)) {
    return triggerMapTeleport(state, "ai");
  }

  if (shouldPartyMemberTriggerTeleport(state)) {
    return triggerMapTeleport(state, "player");
  }

  return state;
}

function shouldPartyMemberTriggerTeleport(state: GameState): boolean {
  return (
    state.currentMapId === MAP_ONE_ID &&
    !state.activeTeleport &&
    isTeleportPoiActive(state) &&
    getLivingPartyMembers(state).some(
      (partyMember) => getDistance(partyMember.position, teleporterPosition) <= 1,
    )
  );
}

function isTeleportPoiActive(state: GameState): boolean {
  return Boolean(
    state.leaderIntent?.type === "move" &&
      state.leaderIntent.targetId === null &&
      state.leaderIntent.targetPosition &&
      getDistance(state.leaderIntent.targetPosition, teleporterPosition) <= 0.001,
  );
}

function movePartyToTeleport(
  state: GameState,
  movedEntityIds: Set<string>,
): GameState {
  let nextState = setTeleportMoveIntent(state);
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
      { allowPartyPassThrough: true },
    );

    if (didEntityMove(movedState, readyMember)) {
      movedEntityIds.add(readyMember.id);
    }

    nextState = movedState;
  }

  return nextState;
}

function completeTeleport(state: GameState): GameState {
  const entities = getMapTwoEntities(state);
  let nextState: GameState = {
    ...state,
    entities,
    currentMapId: MAP_TWO_ID,
    map: createDebugMap(MAP_TWO_ID),
    activeTeleport: null,
    leaderIntent: null,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    failedMoveByEntityId: {},
    movementFailuresByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
    movementPathsByEntityId: {},
    movementDecisionsByEntityId: {},
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
      mapTwoCompanionStartPositions[companionIds.indexOf(companionId)] ??
      mapTwoCompanionStartPositions[0];

    nextState = updateEntity(nextState, {
      ...moveEntityTo(companion, position),
      state: "follow",
      currentTargetId:
        companion.id === nextState.partyLeaderId ? null : nextState.partyLeaderId,
      commandPriority: "autonomous",
    });
  }

  const leader = nextState.entities[nextState.partyLeaderId];

  return {
    ...nextState,
    exploredTiles: leader
      ? { [`${Math.round(leader.position.x)},${Math.round(leader.position.y)}`]: true }
      : {},
  };
}

function getMapTwoEntities(state: GameState): Record<string, GameEntity> {
  const entities: Record<string, GameEntity> = {};

  for (const companionId of companionIds) {
    const companion = state.entities[companionId];

    if (companion?.kind === "companion") {
      entities[companion.id] = companion;
    }
  }

  for (const enemyId of enemyIds) {
    const position =
      mapTwoEnemyStartPositions[enemyIds.indexOf(enemyId)] ??
      mapTwoEnemyStartPositions[0];
    entities[enemyId] = createEnemy(enemyId, position, "aggressive");
  }

  for (const resourceId of resourceIds) {
    const resource =
      mapTwoResourceStartData.find((entry) => entry.id === resourceId) ??
      mapTwoResourceStartData[0];
    entities[resourceId] = createResource(resourceId, resource.position, {
      resourceType: resource.resourceType,
    });
  }

  return entities;
}

function setTeleportMoveIntent(state: GameState): GameState {
  return setLeaderIntent(state, {
    type: "move",
    targetId: null,
    targetPosition: teleporterPosition,
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
