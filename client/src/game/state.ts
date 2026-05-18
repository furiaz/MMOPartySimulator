import {
  getMovementStepDistance,
  isCombatEntity,
  moveEntityTo,
  moveEntityToward,
} from "./entities";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  findNavigationPath,
  getNavigationDistance,
  getNavigationNeighborPositions,
  getNavigationPositionKey,
  isNavigationCellWalkable,
  toNavigationNode,
} from "./navigation";
import {
  createMovementFailureDetail,
  getFailedMovementReason,
  markMoveFailed,
  markMovementDecision,
  markMoveSucceeded,
} from "./movementState";
import type {
  CombatFeedbackEvent,
  CombatFeedbackType,
  ClassId,
  DebugNavigationReason,
  DebugTelemetryState,
  ActiveTeleport,
  Companion,
  DebugMapId,
  GameMap,
  GameEntity,
  Enemy,
  LeaderIntent,
  PartyInventory,
  PartyWallet,
  PartyFormationState,
  PartyMemberRole,
  Position,
  DropVisualEvent,
  SkillBindState,
  SkillCooldownState,
  SkillGatherBuffState,
  SkillMarkState,
  ResurrectionChannelState,
  ResurrectionProgressState,
  SkillSelfBuffState,
  SkillShieldBlockState,
  SkillVisualEvent,
  WorldWipeRecoveryState,
} from "./types";
import type {
  GlobalPoiIntent,
  LocalPoiTarget,
  PoiDecisionState,
  QuestId,
  QuestState,
} from "./questTypes";
import {
  GAME_LOOP_TICK_MS,
  type SimulationTiming,
} from "./simulationTiming";

const AVAILABLE_TILE_SEARCH_RADIUS = 8;
const COMBAT_FEEDBACK_DURATION_MS = 900;
const POSITION_EPSILON = 0.001;
export const ENTITY_COLLISION_DISTANCE = 0.7;
const RESOURCE_COLLISION_DISTANCE = 0.7;
const PATH_WAYPOINT_REACHED_DISTANCE = 0.1;
const PARTY_LEADER_HANDOFF_MS = 800;

type FindAvailablePositionOptions = {
  blockedPositions?: Position[];
  ignoredEntityId?: string;
};

type WalkablePositionOptions = {
  allowPartyPassThrough?: boolean;
};

type MovementOptions = WalkablePositionOptions & {
  speedMultiplier?: number;
};

type NavigationBlockerLookup = {
  resourceKeys: Set<string>;
  reservedKeys: Set<string>;
  blockingEntityKeys: Set<string>;
};

export type DebugOptions = {
  superSpeedEnabled: boolean;
  superExpEnabled: boolean;
  deepNavigationTelemetryEnabled?: boolean;
};

export type PoiSearchScope = "free_travel" | "zone_only" | "subzone_only";

export type PoiPreferences = {
  stayInMap: boolean;
  searchScope?: PoiSearchScope;
};

type MovementPath = {
  targetKey: string;
  waypoints: Position[];
};

type MoveResolution = {
  position: Position;
  swapWithEntityId?: string;
  reason: DebugNavigationReason;
};

export type MovementFailureDetail = {
  targetId?: string | null;
  targetDistance?: number;
  intendedPosition?: Position | null;
  blockerId?: string;
  blockerKind?: GameEntity["kind"] | "wall" | "bounds" | "reserved" | "unknown";
};

export type InterruptedPoiTarget = {
  interruptedByEnemyId: string;
  mapId?: DebugMapId;
  leaderIntent: LeaderIntent | null;
  globalPoiIntent: GlobalPoiIntent | null;
  localPoiTarget: LocalPoiTarget | null;
  lastPoiDecision?: PoiDecisionState;
};

export { clearFrameMovementPlanning, clearTickMovementPlanning } from "./movementState";

export type GameState = {
  entities: Record<string, GameEntity>;
  inventory: PartyInventory;
  wallet: PartyWallet;
  currentMapId?: DebugMapId;
  map?: GameMap;
  activeTeleport?: ActiveTeleport | null;
  autoModeEnabled: boolean;
  worldTravelTargetMapId: DebugMapId | null;
  poiPreferences: PoiPreferences;
  simulationTick: number;
  simulationFrame?: number;
  simulationTimeMs?: number;
  simulationDeltaMs?: number;
  partyLeaderId: string;
  leaderHandoffTicks?: number;
  leaderHandoffRemainingMs?: number;
  leaderIntent: LeaderIntent | null;
  interruptedPoiTarget?: InterruptedPoiTarget | null;
  quests: Record<QuestId, QuestState>;
  globalPoiIntent: GlobalPoiIntent | null;
  localPoiTarget: LocalPoiTarget | null;
  lastPoiDecision?: PoiDecisionState;
  exploredTiles: Record<string, true>;
  followTrailsByEntityId: Record<string, Position[]>;
  lastPositionsByEntityId?: Record<string, Position>;
  failedMoveByEntityId?: Record<string, true>;
  movementFailureMsByEntityId?: Record<string, number>;
  movementFailuresByEntityId?: Record<string, MovementFailureDetail>;
  moveIntentsByEntityId?: Record<string, Position>;
  reservedPositionsByEntityId?: Record<string, Position>;
  movementPathsByEntityId?: Record<string, MovementPath>;
  movementDecisionsByEntityId?: Record<string, DebugNavigationReason>;
  defenderWaitTicksByLeaderId?: Record<string, number>;
  defenderBlockedTicksByEntityId?: Record<string, number>;
  defenderWaitMsByLeaderId?: Record<string, number>;
  defenderBlockedMsByEntityId?: Record<string, number>;
  partyFormation?: PartyFormationState;
  combatFeedbackEvents: CombatFeedbackEvent[];
  skillMarksByEnemyId?: Record<string, SkillMarkState>;
  skillSelfBuffsByCompanionId?: Record<string, SkillSelfBuffState>;
  skillGatherBuffsByCompanionId?: Record<string, SkillGatherBuffState>;
  skillBindsByEnemyId?: Record<string, SkillBindState>;
  skillShieldBlocksById?: Record<string, SkillShieldBlockState>;
  skillCooldownsByCompanionId?: Record<string, SkillCooldownState>;
  skillVisualEvents?: SkillVisualEvent[];
  dropVisualEvents?: DropVisualEvent[];
  resurrectionProgressByCompanionId?: Record<string, ResurrectionProgressState>;
  resurrectionChannelsByHelperId?: Record<string, ResurrectionChannelState>;
  worldWipeRecovery?: WorldWipeRecoveryState;
  lastHealthRegenAtByCompanionId?: Record<string, number>;
  debugTelemetry?: DebugTelemetryState;
  debugOptions?: DebugOptions;
};

export function addEntity(state: GameState, entity: GameEntity): GameState {
  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
    followTrailsByEntityId: state.followTrailsByEntityId[entity.id]
      ? state.followTrailsByEntityId
      : {
          ...state.followTrailsByEntityId,
          [entity.id]: [],
        },
  };
}

export function addEnemy(state: GameState, enemy: Enemy): GameState {
  const position = findClosestAvailablePosition(state, enemy.position);

  return addEntity(state, {
    ...enemy,
    position,
    homePosition: position,
  });
}

export function updateEntity(state: GameState, entity: GameEntity): GameState {
  const previousEntity = state.entities[entity.id];

  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
    followTrailsByEntityId:
      previousEntity &&
      !isSamePosition(previousEntity.position, entity.position)
        ? {
            ...state.followTrailsByEntityId,
            [entity.id]: getUpdatedFollowTrail(
              state.followTrailsByEntityId[entity.id] ?? [],
              previousEntity.position,
            ),
          }
        : state.followTrailsByEntityId,
  };
}

export function addCombatFeedback(
  state: GameState,
  event: {
    type: CombatFeedbackType;
    entityId: string;
    text: string;
    now: number;
  },
): GameState {
  return {
    ...state,
    combatFeedbackEvents: [
      ...state.combatFeedbackEvents,
      {
        id: `${event.now}-${event.type}-${event.entityId}-${state.combatFeedbackEvents.length}`,
        type: event.type,
        entityId: event.entityId,
        text: event.text,
        createdAt: event.now,
        expiresAt: event.now + COMBAT_FEEDBACK_DURATION_MS,
      },
    ],
  };
}

export function clearExpiredCombatFeedback(
  state: GameState,
  now = Date.now(),
): GameState {
  const combatFeedbackEvents = state.combatFeedbackEvents.filter(
    (event) => event.expiresAt > now,
  );

  if (combatFeedbackEvents.length === state.combatFeedbackEvents.length) {
    return state;
  }

  return {
    ...state,
    combatFeedbackEvents,
  };
}

export function addSkillVisualEvent(
  state: GameState,
  event: Omit<SkillVisualEvent, "id" | "createdAt" | "expiresAt"> & {
    now: number;
    durationMs: number;
  },
): GameState {
  return {
    ...state,
    skillVisualEvents: [
      ...(state.skillVisualEvents ?? []),
      {
        id: `${event.now}-${event.type}-${event.sourceId}-${state.skillVisualEvents?.length ?? 0}`,
        type: event.type,
        skillId: event.skillId,
        sourceId: event.sourceId,
        targetId: event.targetId,
        position: event.position,
        createdAt: event.now,
        expiresAt: event.now + event.durationMs,
      },
    ],
  };
}

export function clearExpiredSkillRuntimeState(
  state: GameState,
  now = Date.now(),
): GameState {
  const skillMarksByEnemyId = filterExpiredRecord(
    state.skillMarksByEnemyId,
    now,
  );
  const skillSelfBuffsByCompanionId = filterExpiredRecord(
    state.skillSelfBuffsByCompanionId,
    now,
  );
  const skillGatherBuffsByCompanionId = filterExpiredRecord(
    state.skillGatherBuffsByCompanionId,
    now,
  );
  const skillBindsByEnemyId = filterExpiredRecord(
    state.skillBindsByEnemyId,
    now,
  );
  const skillShieldBlocksById = filterExpiredRecord(
    state.skillShieldBlocksById,
    now,
  );
  const skillCooldownsByCompanionId = filterExpiredRecord(
    state.skillCooldownsByCompanionId,
    now,
  );
  const skillVisualEvents = (state.skillVisualEvents ?? []).filter(
    (event) => event.expiresAt > now,
  );

  return {
    ...state,
    skillMarksByEnemyId,
    skillSelfBuffsByCompanionId,
    skillGatherBuffsByCompanionId,
    skillBindsByEnemyId,
    skillShieldBlocksById,
    skillCooldownsByCompanionId,
    skillVisualEvents,
  };
}

function filterExpiredRecord<T extends { expiresAt: number }>(
  record: Record<string, T> | undefined,
  now: number,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record ?? {}).filter(([, value]) => value.expiresAt > now),
  );
}

export function getFollowTrailPosition(
  state: GameState,
  entityId: string,
  trailIndex: number,
): Position | null {
  const trail = state.followTrailsByEntityId[entityId];

  if (!trail || trailIndex < 0) {
    return null;
  }

  return trail[trailIndex] ?? null;
}

export function setAutoModeEnabled(
  state: GameState,
  autoModeEnabled: boolean,
): GameState {
  return {
    ...state,
    autoModeEnabled,
  };
}

export function setWorldTravelTargetMapId(
  state: GameState,
  worldTravelTargetMapId: DebugMapId | null,
): GameState {
  return {
    ...state,
    worldTravelTargetMapId,
  };
}

export function setStayInMapEnabled(
  state: GameState,
  stayInMap: boolean,
): GameState {
  return setPoiSearchScope(state, stayInMap ? "subzone_only" : "free_travel");
}

export function getPoiSearchScope(state: GameState): PoiSearchScope {
  return (
    state.poiPreferences.searchScope ??
    (state.poiPreferences.stayInMap ? "subzone_only" : "free_travel")
  );
}

export function setPoiSearchScope(
  state: GameState,
  searchScope: PoiSearchScope,
): GameState {
  return {
    ...state,
    poiPreferences: {
      ...state.poiPreferences,
      searchScope,
      stayInMap: searchScope === "subzone_only",
    },
  };
}

export function setLeaderIntent(
  state: GameState,
  leaderIntent: LeaderIntent | null,
): GameState {
  return {
    ...state,
    leaderIntent,
  };
}

export function setCompanionRole(
  state: GameState,
  companionId: string,
  role: PartyMemberRole,
): GameState {
  return setPartyMemberRole(state, companionId, role);
}

export function setPartyLeader(
  state: GameState,
  entityId: string,
): GameState {
  const entity = state.entities[entityId];

  if (entity?.kind !== "companion") {
    return state;
  }

  return {
    ...state,
    partyLeaderId: entity.id,
    leaderHandoffRemainingMs:
      state.partyLeaderId === entity.id
        ? state.leaderHandoffRemainingMs
        : PARTY_LEADER_HANDOFF_MS,
  };
}

export function advanceSimulationTick(state: GameState): GameState {
  return {
    ...state,
    simulationTick: state.simulationTick + 1,
  };
}

export function advanceSimulationTime(
  state: GameState,
  timing: SimulationTiming,
): GameState {
  const nextFrame = (state.simulationFrame ?? state.simulationTick ?? 0) + 1;

  return {
    ...state,
    simulationTick: nextFrame,
    simulationFrame: nextFrame,
    simulationTimeMs: (state.simulationTimeMs ?? 0) + timing.deltaMs,
    simulationDeltaMs: timing.deltaMs,
  };
}

export function setPartyMemberRole(
  state: GameState,
  entityId: string,
  role: PartyMemberRole,
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "companion") {
    return state;
  }

  const nextState = updateEntity(state, {
    ...partyMember,
    role,
  });

  if (partyMember.role === role) {
    return nextState;
  }

  return appendDebugTelemetryEvent(nextState, {
    type: "role_changed",
    entityId: partyMember.id,
    previousRole: partyMember.role,
    nextRole: role,
  });
}

export function setPartyMemberClass(
  state: GameState,
  entityId: string,
  classId: ClassId,
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "companion") {
    return state;
  }

  const nextState = updateEntity(state, {
    ...partyMember,
    classId,
  });

  if (partyMember.classId === classId) {
    return nextState;
  }

  return appendDebugTelemetryEvent(nextState, {
    type: "class_changed",
    entityId: partyMember.id,
    previousClassId: partyMember.classId,
    nextClassId: classId,
  });
}

export function setPartyOrder(
  state: GameState,
  entityId: string,
  partyOrder: number,
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...partyMember,
    partyOrder,
  });
}

export function setCompanionDefendPosition(
  state: GameState,
  companionId: string,
  defendPosition: Position | null,
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...companion,
    defendPosition,
  });
}

export function getEntityById(
  state: GameState,
  entityId: string,
): GameEntity | undefined {
  return state.entities[entityId];
}

export function moveEntityTowardIfUnoccupied<T extends GameEntity>(
  state: GameState,
  entity: T,
  target: GameEntity,
  options: MovementOptions = {},
): GameState {
  const pathState = updateMovementPath(state, entity, target, options);
  const nextStateWithIntent = recordMoveIntent(pathState, entity, target, options);
  const moveResolution = getNextMoveResolution(
    nextStateWithIntent,
    entity,
    target,
    options,
  );

  if (!moveResolution || isSamePosition(moveResolution.position, entity.position)) {
    return markMoveFailed(
      clearMovementPath(nextStateWithIntent, entity.id),
      entity.id,
      getMovementFailureDetail(nextStateWithIntent, entity, target, moveResolution?.position),
      getFailedMovementReason(nextStateWithIntent, entity.id),
    );
  }

  if (moveResolution.swapWithEntityId) {
    const decisionState = markMovementDecision(
      nextStateWithIntent,
      entity.id,
      moveResolution.reason,
    );
    const reservedState = reserveSwapPositionsForFrame(
      decisionState,
      entity.id,
      moveResolution.swapWithEntityId,
    );

    if (reservedState === decisionState) {
      return markMoveFailed(
        clearMovementPath(decisionState, entity.id),
        entity.id,
        getMovementFailureDetail(nextStateWithIntent, entity, target, moveResolution.position),
        "blocked",
      );
    }

    return swapEntityPositions(
      reservedState,
      entity.id,
      moveResolution.swapWithEntityId,
    );
  }

  if (
    !isMoveDestinationAvailable(
      nextStateWithIntent,
      entity,
      moveResolution.position,
      options,
    )
  ) {
    return markMoveFailed(
      clearMovementPath(nextStateWithIntent, entity.id),
      entity.id,
      getMovementFailureDetail(nextStateWithIntent, entity, target, moveResolution.position),
      "blocked",
    );
  }

  const decisionState = markMovementDecision(
    nextStateWithIntent,
    entity.id,
    moveResolution.reason,
  );
  const reservedState = reservePositionForFrame(
    decisionState,
    entity.id,
    moveResolution.position,
    options,
  );

  if (reservedState === decisionState) {
    return markMoveFailed(
      clearMovementPath(decisionState, entity.id),
      entity.id,
      getMovementFailureDetail(decisionState, entity, target, moveResolution.position),
      "blocked",
    );
  }

  return markMoveSucceeded(
    updateEntity(
      reservedState,
      moveEntityTo(entity, moveResolution.position),
    ),
    entity.id,
    entity.position,
  );
}

export function moveEntityTowardPositionIfUnoccupied<T extends GameEntity>(
  state: GameState,
  entity: T,
  position: Position,
  options: MovementOptions = {},
): GameState {
  return moveEntityTowardIfUnoccupied(
    state,
    entity,
    createPositionTarget(position),
    options,
  );
}

function createPositionTarget(position: Position): GameEntity {
  return {
    id: "__position_target__",
    kind: "resource",
    position,
    state: "idle",
    resourceType: "wood",
    tier: 1,
    durability: 1,
    maxDurability: 1,
    quantity: 1,
    maxGatherers: 1,
    isDepleted: false,
  };
}

export function reservePositionForFrame(
  state: GameState,
  entityId: string,
  position: Position,
  options: MovementOptions = {},
): GameState {
  const entity = state.entities[entityId];

  if (
    !entity ||
    !isMoveDestinationAvailable(state, entity, position, options)
  ) {
    return state;
  }

  return {
    ...state,
    reservedPositionsByEntityId: {
      ...(state.reservedPositionsByEntityId ?? {}),
      [entityId]: position,
    },
  };
}

export function previewMoveTowardPosition(
  state: GameState,
  entity: GameEntity,
  position: Position,
  options: MovementOptions = {},
): Position | null {
  return getIntendedMovePosition(state, entity, createPositionTarget(position), options);
}

export function getBoundedPathDistance(
  state: GameState,
  entity: GameEntity,
  position: Position,
  maxDistance: number,
): number | null {
  return getBoundedNavigationDistance(
    state,
    entity.position,
    position,
    maxDistance,
    entity.id,
    {
      allowPartyPassThrough: true,
    },
  );
}

export function getBoundedNavigationDistance(
  state: GameState,
  start: Position,
  position: Position,
  maxDistance: number,
  ignoredEntityId?: string,
  options: MovementOptions = {},
): number | null {
  if (!state.map) {
    if (isSamePosition(start, position)) {
      return 0;
    }

    const directDistance = getGridDistance(start, position);

    return directDistance <= maxDistance ? directDistance : null;
  }

  const blockerLookup = createNavigationBlockerLookup(
    state,
    ignoredEntityId,
    options,
  );

  return getNavigationDistance(state.map, start, position, maxDistance, {
    isBlocked: (candidate) =>
      ignoredEntityId
        ? isNavigationPositionBlocked(
            state,
            candidate,
            ignoredEntityId,
            options,
            blockerLookup,
          )
        : isNavigationPositionBlockedByResources(state, candidate, blockerLookup),
  });
}

export function isWallPosition(state: GameState, position: Position): boolean {
  return Boolean(state.map && !isNavigationCellWalkable(state.map, position));
}

export function isActiveResourcePosition(
  state: GameState,
  position: Position,
  ignoredEntityId?: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      entity.kind === "resource" &&
      !entity.isDepleted &&
      entity.quantity > 0 &&
      getEuclideanDistance(entity.position, position) < RESOURCE_COLLISION_DISTANCE,
  );
}

export function findClosestAvailablePosition(
  state: GameState,
  intendedPosition: Position,
  options: FindAvailablePositionOptions = {},
): Position {
  if (isPositionAvailable(state, intendedPosition, options)) {
    return intendedPosition;
  }

  for (let radius = 1; radius <= AVAILABLE_TILE_SEARCH_RADIUS; radius += 1) {
    const position = getPositionRing(intendedPosition, radius).find(
      (candidate) => isPositionAvailable(state, candidate, options),
    );

    if (position) {
      return position;
    }
  }

  return intendedPosition;
}

function getNextMoveResolution(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): MoveResolution | null {
  const pathMoveResolution = getPathMoveResolution(state, entity, target, options);

  if (pathMoveResolution) {
    return pathMoveResolution;
  }

  const movedEntity = moveEntityToward(
    entity,
    target,
    getMovementDeltaMs(state, entity, options),
  );

  if (isSamePosition(movedEntity.position, entity.position)) {
    return null;
  }

  if (isMoveDestinationAvailable(state, entity, movedEntity.position, options)) {
    return { position: movedEntity.position, reason: "direct_step" };
  }

  const pathPosition = findNextPathPosition(state, entity, target, options);

  if (
    pathPosition &&
    isMoveDestinationAvailable(state, entity, pathPosition, options)
  ) {
    return { position: pathPosition, reason: "path" };
  }

  const swapWithEntity = getSwapCandidate(
    state,
    entity,
    movedEntity.position,
  );

  if (swapWithEntity) {
    return {
      position: movedEntity.position,
      swapWithEntityId: swapWithEntity.id,
      reason: "swap",
    };
  }

  return findAlternativeMovePosition(state, entity, target, options);
}

function updateMovementPath(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): GameState {
  if (!state.map) {
    return clearMovementPath(state, entity.id);
  }

  const targetKey = getMovementPathTargetKey(state, entity, target, options);
  const currentPath = state.movementPathsByEntityId?.[entity.id];
  const currentWaypoints =
    currentPath?.targetKey === targetKey
      ? pruneReachedWaypoints(currentPath.waypoints, entity.position)
      : [];

  if (currentWaypoints.length > 0) {
    return setMovementPath(state, entity.id, {
      targetKey,
      waypoints: currentWaypoints,
    });
  }

  const waypoints = getFreshPathWaypoints(state, entity, target, options);

  if (waypoints.length === 0) {
    return clearMovementPath(state, entity.id);
  }

  return setMovementPath(state, entity.id, {
    targetKey,
    waypoints,
  });
}

function getPathMoveResolution(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): MoveResolution | null {
  if (!state.map) {
    return null;
  }

  const targetKey = getMovementPathTargetKey(state, entity, target, options);
  const cachedPath = state.movementPathsByEntityId?.[entity.id];
  const waypoints =
    cachedPath?.targetKey === targetKey
      ? pruneReachedWaypoints(cachedPath.waypoints, entity.position)
      : getFreshPathWaypoints(state, entity, target, options);
  const waypoint = waypoints[0];

  if (!waypoint) {
    return null;
  }

  const movedEntity = moveEntityToward(
    entity,
    createPositionTarget(waypoint),
    getMovementDeltaMs(state, entity, options),
  );

  if (
    isSamePosition(movedEntity.position, entity.position) ||
    !isMoveDestinationAvailable(state, entity, movedEntity.position, options)
  ) {
    return null;
  }

  return { position: movedEntity.position, reason: "path" };
}

function getFreshPathWaypoints(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): Position[] {
  if (!state.map) {
    return [];
  }

  const goals = getPathGoals(state, entity, target, options);

  if (goals.length === 0) {
    return [];
  }

  const blockerLookup = createNavigationBlockerLookup(state, entity.id, options);

  return findNavigationPath(state.map, entity.position, goals, {
    isBlocked: (position) =>
      isNavigationPositionBlocked(
        state,
        position,
        entity.id,
        options,
        blockerLookup,
      ),
  });
}

function getMovementPathTargetKey(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): string {
  const goals = getPathGoals(state, entity, target, options)
    .map(getNavigationPositionKey)
    .sort()
    .join("|");

  return [
    target.id,
    getNavigationPositionKey(target.position),
    options.allowPartyPassThrough ? "party-pass" : "solid-party",
    goals,
  ].join(":");
}

function pruneReachedWaypoints(
  waypoints: Position[],
  position: Position,
): Position[] {
  let firstUnreachedIndex = 0;

  while (
    firstUnreachedIndex < waypoints.length &&
    getEuclideanDistance(position, waypoints[firstUnreachedIndex]) <=
      PATH_WAYPOINT_REACHED_DISTANCE
  ) {
    firstUnreachedIndex += 1;
  }

  return waypoints.slice(firstUnreachedIndex);
}

function setMovementPath(
  state: GameState,
  entityId: string,
  movementPath: MovementPath,
): GameState {
  return {
    ...state,
    movementPathsByEntityId: {
      ...(state.movementPathsByEntityId ?? {}),
      [entityId]: movementPath,
    },
  };
}

export const reservePositionForTick = reservePositionForFrame;

function clearMovementPath(state: GameState, entityId: string): GameState {
  if (!state.movementPathsByEntityId?.[entityId]) {
    return state;
  }

  const movementPathsByEntityId = { ...state.movementPathsByEntityId };
  delete movementPathsByEntityId[entityId];

  return {
    ...state,
    movementPathsByEntityId,
  };
}

function isMoveDestinationAvailable(
  state: GameState,
  entity: GameEntity,
  position: Position,
  options: MovementOptions = {},
): boolean {
  return isWalkablePosition(state, position, entity.id, options);
}

function findNextPathPosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): Position | null {
  if (!state.map) {
    return null;
  }

  const blockerLookup = createNavigationBlockerLookup(state, entity.id, options);

  return (
    findNavigationPath(state.map, entity.position, getPathGoals(state, entity, target, options), {
      isBlocked: (position) =>
        isNavigationPositionBlocked(
          state,
          position,
          entity.id,
          options,
          blockerLookup,
        ),
    })[0] ?? null
  );
}

function getPathGoals(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): Position[] {
  if (isMoveDestinationAvailable(state, entity, target.position, options)) {
    return [target.position];
  }

  return getNavigationNeighborPositions(toNavigationNode(target.position)).filter((position) =>
    isMoveDestinationAvailable(state, entity, position, options),
  );
}

function findAlternativeMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): MoveResolution | null {
  if (state.failedMoveByEntityId?.[entity.id]) {
    return null;
  }

  const candidates = getAlternativeMoveCandidates(
    state,
    entity,
    target.position,
    options,
  );
  const previousPosition = state.lastPositionsByEntityId?.[entity.id];
  const validCandidates = candidates
    .filter((position) =>
      isMoveDestinationAvailable(state, entity, position, options),
    )
    .sort(
      (a, b) =>
        getManhattanDistance(a, target.position) -
          getManhattanDistance(b, target.position) ||
        getEuclideanDistance(a, target.position) -
          getEuclideanDistance(b, target.position),
    );
  const preferredCandidate = validCandidates.find(
    (position) => !previousPosition || !isSamePosition(position, previousPosition),
  );

  return preferredCandidate
    ? { position: preferredCandidate, reason: "fallback" }
    : validCandidates[0]
      ? { position: validCandidates[0], reason: "fallback" }
      : null;
}

function getAlternativeMoveCandidates(
  state: GameState,
  entity: GameEntity,
  target: Position,
  options: MovementOptions = {},
): Position[] {
  const current = entity.position;
  const xStep = Math.sign(target.x - current.x);
  const yStep = Math.sign(target.y - current.y);
  const candidates: Position[] = [];
  const stepDistance = getMovementStepDistance(
    entity,
    getMovementDeltaMs(state, entity, options),
  );

  addAlternativeStepCandidates(
    candidates,
    current,
    xStep,
    yStep,
    stepDistance,
  );

  return dedupePositions(candidates).filter(
    (position) => !isSamePosition(position, current),
  );
}

function getMovementDeltaMs(
  state: GameState,
  entity: GameEntity,
  options: MovementOptions = {},
): number {
  const debugSpeedMultiplier =
    entity.kind === "companion" && state.debugOptions?.superSpeedEnabled ? 5 : 1;

  return (state.simulationDeltaMs ?? GAME_LOOP_TICK_MS) *
    (options.speedMultiplier ?? 1) *
    debugSpeedMultiplier;
}

function addAlternativeStepCandidates(
  candidates: Position[],
  current: Position,
  xStep: number,
  yStep: number,
  stepDistance: number,
): void {
  const directions = [
    { x: xStep, y: yStep },
    { x: xStep, y: 0 },
    { x: 0, y: yStep },
    { x: yStep, y: -xStep },
    { x: -yStep, y: xStep },
    { x: xStep + yStep, y: yStep - xStep },
    { x: xStep - yStep, y: yStep + xStep },
    { x: -xStep, y: -yStep },
  ];

  for (const direction of directions) {
    const length = Math.hypot(direction.x, direction.y);

    if (length === 0) {
      continue;
    }

    candidates.push({
      x: current.x + (direction.x / length) * stepDistance,
      y: current.y + (direction.y / length) * stepDistance,
    });
  }
}

function dedupePositions(positions: Position[]): Position[] {
  const seenPositions = new Set<string>();

  return positions.filter((position) => {
    const key = `${position.x},${position.y}`;

    if (seenPositions.has(key)) {
      return false;
    }

    seenPositions.add(key);
    return true;
  });
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getManhattanDistance(from: Position, to: Position): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

export function isWalkablePosition(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
  options: WalkablePositionOptions = {},
): boolean {
  return (
    isNavigationPositionWalkable(state, position) &&
    !isNavigationPositionBlocked(state, position, ignoredEntityId, options)
  );
}

function isNavigationPositionWalkable(
  state: GameState,
  position: Position,
): boolean {
  return state.map
    ? isNavigationCellWalkable(state.map, position)
    : isInMapBounds(state, position);
}

function createNavigationBlockerLookup(
  state: GameState,
  ignoredEntityId: string | undefined,
  options: WalkablePositionOptions,
): NavigationBlockerLookup {
  const lookup: NavigationBlockerLookup = {
    resourceKeys: new Set<string>(),
    reservedKeys: new Set<string>(),
    blockingEntityKeys: new Set<string>(),
  };
  const movingEntity = ignoredEntityId ? state.entities[ignoredEntityId] : undefined;

  for (const entity of Object.values(state.entities)) {
    if (entity.id === ignoredEntityId) {
      continue;
    }

    if (entity.kind === "resource") {
      if (!entity.isDepleted && entity.quantity > 0) {
        addCollisionPositionKeys(lookup.resourceKeys, entity.position, RESOURCE_COLLISION_DISTANCE);
      }
      continue;
    }

    if (
      entity.state !== "dead" &&
      !canPassThroughPartyEntity(movingEntity, entity, options)
    ) {
      addCollisionPositionKeys(
        lookup.blockingEntityKeys,
        entity.position,
        ENTITY_COLLISION_DISTANCE,
      );
    }
  }

  for (const [entityId, reservedPosition] of Object.entries(
    state.reservedPositionsByEntityId ?? {},
  )) {
    if (entityId !== ignoredEntityId) {
      addCollisionPositionKeys(
        lookup.reservedKeys,
        reservedPosition,
        POSITION_EPSILON,
      );
    }
  }

  return lookup;
}

function addCollisionPositionKeys(
  keys: Set<string>,
  position: Position,
  collisionDistance: number,
): void {
  const center = toNavigationNode(position);

  for (let y = center.y - 1; y <= center.y + 1; y += 1) {
    for (let x = center.x - 1; x <= center.x + 1; x += 1) {
      const candidate = { x, y };

      if (getEuclideanDistance(candidate, position) < collisionDistance) {
        keys.add(getNavigationPositionKey(candidate));
      }
    }
  }
}

function isNavigationPositionBlocked(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
  options: WalkablePositionOptions,
  lookup?: NavigationBlockerLookup,
): boolean {
  if (lookup) {
    const key = getNavigationPositionKey(position);

    return (
      lookup.resourceKeys.has(key) ||
      lookup.reservedKeys.has(key) ||
      lookup.blockingEntityKeys.has(key)
    );
  }

  return (
    isActiveResourcePosition(state, position, ignoredEntityId) ||
    isReservedPosition(state, position, ignoredEntityId) ||
    isPositionOccupiedByBlockingEntity(
      state,
      position,
      ignoredEntityId,
      options,
    )
  );
}

function isNavigationPositionBlockedByResources(
  state: GameState,
  position: Position,
  lookup?: NavigationBlockerLookup,
): boolean {
  if (lookup) {
    return lookup.resourceKeys.has(getNavigationPositionKey(position));
  }

  return isActiveResourcePosition(state, position);
}

function isReservedPosition(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
): boolean {
  return Object.entries(state.reservedPositionsByEntityId ?? {}).some(
    ([entityId, reservedPosition]) =>
      entityId !== ignoredEntityId && isSamePosition(position, reservedPosition),
  );
}

function isInMapBounds(state: GameState, position: Position): boolean {
  if (!state.map) {
    return true;
  }

  return (
    position.x >= 0 &&
    position.x < state.map.columns &&
    position.y >= 0 &&
    position.y < state.map.rows
  );
}

function isSamePosition(a: Position, b: Position): boolean {
  return getEuclideanDistance(a, b) <= POSITION_EPSILON;
}

function getPositionRing(center: Position, radius: number): Position[] {
  const positions: Position[] = [];

  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const position = { x, y };

      if (getManhattanDistance(center, position) !== radius) {
        continue;
      }

      positions.push(position);
    }
  }

  return positions;
}

function isPositionAvailable(
  state: GameState,
  position: Position,
  options: FindAvailablePositionOptions,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isPositionBlocked(position, options.blockedPositions ?? []) &&
    !isActiveResourcePosition(state, position, options.ignoredEntityId) &&
    !isPositionOccupiedByEntity(state, position, options.ignoredEntityId)
  );
}

function isPositionOccupiedByEntity(
  state: GameState,
  position: Position,
  ignoredEntityId?: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      getEuclideanDistance(entity.position, position) < ENTITY_COLLISION_DISTANCE,
  );
}

function isPositionBlocked(
  position: Position,
  blockedPositions: Position[],
): boolean {
  return blockedPositions.some((blockedPosition) =>
    isSamePosition(position, blockedPosition),
  );
}

function isPositionOccupiedByBlockingEntity(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
  options: WalkablePositionOptions,
): boolean {
  const movingEntity = state.entities[ignoredEntityId];

  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      entity.kind !== "resource" &&
      entity.state !== "dead" &&
      !canPassThroughPartyEntity(movingEntity, entity, options) &&
      getEuclideanDistance(entity.position, position) < ENTITY_COLLISION_DISTANCE,
  );
}

function canPassThroughPartyEntity(
  movingEntity: GameEntity | undefined,
  occupyingEntity: GameEntity,
  options: WalkablePositionOptions,
): boolean {
  return Boolean(
    options.allowPartyPassThrough &&
      movingEntity &&
      isPartyEntity(movingEntity) &&
      isPartyEntity(occupyingEntity),
  );
}

function isPartyEntity(entity: GameEntity): entity is Companion {
  return entity.kind === "companion";
}

function getSwapCandidate(
  state: GameState,
  entity: GameEntity,
  targetPosition: Position,
): GameEntity | undefined {
  const occupyingEntity = Object.values(state.entities).find(
    (candidate) =>
      candidate.id !== entity.id &&
      isCombatEntity(candidate) &&
      candidate.state !== "dead" &&
      isSamePosition(candidate.position, targetPosition),
  );

  if (!occupyingEntity) {
    return undefined;
  }

  if (!isPartyEntity(entity) || !isPartyEntity(occupyingEntity)) {
    return undefined;
  }

  const occupyingIntent = state.moveIntentsByEntityId?.[occupyingEntity.id];

  return occupyingIntent && isSamePosition(occupyingIntent, entity.position)
    ? occupyingEntity
    : undefined;
}

function reserveSwapPositionsForFrame(
  state: GameState,
  firstEntityId: string,
  secondEntityId: string,
): GameState {
  const firstEntity = state.entities[firstEntityId];
  const secondEntity = state.entities[secondEntityId];

  if (
    !firstEntity ||
    !secondEntity ||
    isReservedPosition(state, secondEntity.position, firstEntityId) ||
    isReservedPosition(state, firstEntity.position, secondEntityId)
  ) {
    return state;
  }

  return {
    ...state,
    reservedPositionsByEntityId: {
      ...(state.reservedPositionsByEntityId ?? {}),
      [firstEntityId]: secondEntity.position,
      [secondEntityId]: firstEntity.position,
    },
  };
}

function recordMoveIntent(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): GameState {
  const intendedPosition = getIntendedMovePosition(state, entity, target, options);

  if (!intendedPosition) {
    return state;
  }

  return {
    ...state,
    moveIntentsByEntityId: {
      ...(state.moveIntentsByEntityId ?? {}),
      [entity.id]: intendedPosition,
    },
  };
}

function getIntendedMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): Position | null {
  const moveResolution = getNextMoveResolution(state, entity, target, options);

  return moveResolution?.position ?? null;
}

function getMovementFailureDetail(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  intendedPosition?: Position | null,
): MovementFailureDetail {
  const blocker = intendedPosition
    ? getPositionBlocker(state, intendedPosition, entity.id)
    : undefined;

  return createMovementFailureDetail(entity, target, intendedPosition, blocker);
}

function getPositionBlocker(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
): { id?: string; kind: MovementFailureDetail["blockerKind"] } | undefined {
  if (!isInMapBounds(state, position)) {
    return { kind: "bounds" };
  }

  if (isWallPosition(state, position)) {
    return { kind: "wall" };
  }

  const reservedEntityId = Object.entries(state.reservedPositionsByEntityId ?? {})
    .find(([entityId, reservedPosition]) =>
      entityId !== ignoredEntityId && isSamePosition(position, reservedPosition),
    )?.[0];

  if (reservedEntityId) {
    return { id: reservedEntityId, kind: "reserved" };
  }

  const resource = Object.values(state.entities).find(
    (entity) =>
      entity.id !== ignoredEntityId &&
      entity.kind === "resource" &&
      !entity.isDepleted &&
      entity.quantity > 0 &&
      getEuclideanDistance(entity.position, position) < RESOURCE_COLLISION_DISTANCE,
  );

  if (resource) {
    return { id: resource.id, kind: resource.kind };
  }

  const entity = Object.values(state.entities).find(
    (candidate) =>
      candidate.id !== ignoredEntityId &&
      candidate.kind !== "resource" &&
      candidate.state !== "dead" &&
      getEuclideanDistance(candidate.position, position) < ENTITY_COLLISION_DISTANCE,
  );

  return entity ? { id: entity.id, kind: entity.kind } : { kind: "unknown" };
}

function swapEntityPositions(
  state: GameState,
  firstEntityId: string,
  secondEntityId: string,
): GameState {
  const firstEntity = state.entities[firstEntityId];
  const secondEntity = state.entities[secondEntityId];

  if (!firstEntity || !secondEntity) {
    return markMoveFailed(state, firstEntityId);
  }

  let nextState = updateEntity(
    state,
    moveEntityTo(firstEntity, secondEntity.position),
  );
  nextState = updateEntity(
    nextState,
    moveEntityTo(secondEntity, firstEntity.position),
  );
  nextState = markMoveSucceeded(nextState, firstEntity.id, firstEntity.position);
  nextState = markMoveSucceeded(nextState, secondEntity.id, secondEntity.position);

  return nextState;
}

const FOLLOW_TRAIL_LENGTH = 12;

function getUpdatedFollowTrail(
  trail: Position[],
  position: Position,
): Position[] {
  const nextTrail = [
    position,
    ...trail.filter((trailPosition) => !isSamePosition(trailPosition, position)),
  ];

  return nextTrail.slice(0, FOLLOW_TRAIL_LENGTH);
}

function getEuclideanDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
