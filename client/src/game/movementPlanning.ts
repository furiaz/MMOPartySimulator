import {
  getMovementStepDistance,
  isCombatEntity,
  moveEntityTo,
  moveEntityToward,
} from "./entities";
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
import {
  recordMovementFailure,
  recordNavigationPathQuery,
  recordPathDistanceQuery,
  type NavigationPathMetricBucket,
} from "./performanceMetrics";
import {
  getEuclideanDistance,
  getGridDistance,
  getManhattanDistance,
} from "./positionUtils";
import { GAME_LOOP_TICK_MS } from "./simulationTiming";
import { isMovementBlockedByStatus } from "./statusEffects";
import type { GameState } from "./state";
import type {
  DebugNavigationBlocker,
  GameEntity,
  Position,
} from "./types";
import type {
  EntityCollisionShape,
  FindAvailablePositionOptions,
  MovementFailureDetail,
  MovementOptions,
  MovementPath,
  MovementPathProfile,
  MoveResolution,
  NavigationBlockerLookup,
  WalkablePositionOptions,
} from "./movementTypes";

const AVAILABLE_TILE_SEARCH_RADIUS = 8;
const POSITION_EPSILON = 0.001;
export const ENTITY_COLLISION_DISTANCE = 0.7;
export const COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER = 0.8;
export const COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER = 1.6;
export const COMPANION_COLLISION_CAPSULE_ANCHOR_Y = 0.3;
const RESOURCE_COLLISION_DISTANCE = 0.7;
const PATH_WAYPOINT_REACHED_DISTANCE = 0.1;
const COMBAT_PATH_REFRESH_MS = 500;
const FOLLOW_PATH_REFRESH_MS = 500;
const MOVEMENT_PATH_BLOCKED_REFRESH_COUNT = 2;
const MEANINGFUL_TARGET_MOVE_DISTANCE = 1;
const FOLLOW_TRAIL_LENGTH = 12;

export function getEntityCollisionShape(
  entity: GameEntity,
): EntityCollisionShape {
  if (entity.kind === "companion") {
    return {
      kind: "verticalCapsule",
      radius:
        ENTITY_COLLISION_DISTANCE *
        COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER,
      height:
        ENTITY_COLLISION_DISTANCE *
        2 *
        COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER,
      anchorY: COMPANION_COLLISION_CAPSULE_ANCHOR_Y,
    };
  }

  return {
    kind: "circle",
    radius: ENTITY_COLLISION_DISTANCE,
  };
}

export function isPositionInsideEntityCollisionShape(
  entity: GameEntity,
  position: Position,
): boolean {
  return isPositionInsideCollisionShape(
    position,
    entity.position,
    getEntityCollisionShape(entity),
  );
}

export function moveEntityTowardIfUnoccupied<T extends GameEntity>(
  state: GameState,
  entity: T,
  target: GameEntity,
  options: MovementOptions = {},
): GameState {
  if (isMovementBlockedByStatus(state, entity.id)) {
    return markMoveFailed(state, entity.id, undefined, "blocked");
  }

  const pathState = prepareMovementPath(state, entity, target, options);
  const moveResolution = getNextMoveResolution(
    pathState,
    entity,
    target,
    options,
    { allowFreshPath: true },
  );
  let nextStateWithIntent = recordMoveIntent(pathState, entity.id, moveResolution?.position);

  if (moveResolution?.movementPath) {
    nextStateWithIntent = setMovementPath(
      nextStateWithIntent,
      entity.id,
      moveResolution.movementPath,
    );
  }

  if (!moveResolution || isSamePosition(moveResolution.position, entity.position)) {
    recordMovementFailure();
    return markMoveFailed(
      markCompatibleMovementPathBlocked(nextStateWithIntent, entity, target, options),
      entity.id,
      getMovementFailureDetail(
        nextStateWithIntent,
        entity,
        target,
        options,
        moveResolution?.position,
      ),
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
      recordMovementFailure();
      return markMoveFailed(
        markCompatibleMovementPathBlocked(decisionState, entity, target, options),
        entity.id,
        getMovementFailureDetail(
          nextStateWithIntent,
          entity,
          target,
          options,
          moveResolution.position,
        ),
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
    recordMovementFailure();
    return markMoveFailed(
      markCompatibleMovementPathBlocked(nextStateWithIntent, entity, target, options),
      entity.id,
      getMovementFailureDetail(
        nextStateWithIntent,
        entity,
        target,
        options,
        moveResolution.position,
      ),
      "blocked",
    );
  }

  let decisionState = markMovementDecision(
    nextStateWithIntent,
    entity.id,
    moveResolution.reason,
  );

  if (moveResolution.reason === "path") {
    decisionState = resetCompatibleMovementPathBlockedCount(
      decisionState,
      entity,
      target,
      options,
    );
  }

  const reservedState = reservePositionForFrame(
    decisionState,
    entity.id,
    moveResolution.position,
    options,
  );

  if (reservedState === decisionState) {
    recordMovementFailure();
    return markMoveFailed(
      markCompatibleMovementPathBlocked(decisionState, entity, target, options),
      entity.id,
      getMovementFailureDetail(
        decisionState,
        entity,
        target,
        options,
        moveResolution.position,
      ),
      "blocked",
    );
  }

  return markMoveSucceeded(
    updateMovementEntity(
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

export const reservePositionForTick = reservePositionForFrame;

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

  recordPathDistanceQuery();
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

export function isEntitySeparationPositionAvailable(
  state: GameState,
  movingEntityId: string,
  sourceEntityId: string,
  position: Position,
): boolean {
  return (
    isNavigationPositionWalkable(state, position) &&
    !isActiveResourcePosition(state, position, movingEntityId) &&
    !isReservedPosition(state, position, movingEntityId) &&
    !isPositionOccupiedBySeparationBlocker(
      state,
      position,
      movingEntityId,
      sourceEntityId,
    )
  );
}

export function isPositionAvailable(
  state: GameState,
  position: Position,
  options: FindAvailablePositionOptions = {},
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isPositionBlocked(position, options.blockedPositions ?? []) &&
    !isActiveResourcePosition(state, position, options.ignoredEntityId) &&
    !isPositionOccupiedByEntity(state, position, options.ignoredEntityId)
  );
}

function getNextMoveResolution(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
  planningOptions: { allowFreshPath?: boolean } = {},
): MoveResolution | null {
  const cachedPath = getCompatibleMovementPath(state, entity, target, options);

  if (cachedPath && pruneReachedWaypoints(cachedPath.waypoints, entity.position).length > 0) {
    return getPathMoveResolution(state, entity, target, options);
  }

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

  if (planningOptions.allowFreshPath && !isFreshPathBackoffActive(state, entity.id)) {
    const freshPathResolution = getFreshPathMoveResolution(
      state,
      entity,
      target,
      options,
    );

    if (freshPathResolution) {
      return freshPathResolution;
    }
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

function prepareMovementPath(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): GameState {
  if (!state.map) {
    return clearMovementPath(state, entity.id);
  }

  const targetKey = getMovementPathTargetKey(state, entity, target, options);
  const currentPath = getCompatibleMovementPath(state, entity, target, options);

  if (!currentPath) {
    return clearMovementPath(state, entity.id);
  }

  const currentWaypoints =
    pruneReachedWaypoints(currentPath.waypoints, entity.position);

  if (currentWaypoints.length > 0) {
    const prunedPath = {
      ...currentPath,
      targetKey,
      waypoints: currentWaypoints,
    };

    if (shouldRefreshMovementPath(state, prunedPath, options)) {
      const refreshedPath = getFreshMovementPath(state, entity, target, options);

      if (refreshedPath && refreshedPath.waypoints.length > 0) {
        return setMovementPath(state, entity.id, refreshedPath);
      }
    }

    return setMovementPath(state, entity.id, {
      ...prunedPath,
    });
  }

  return clearMovementPath(state, entity.id);
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
  const cachedPath = getCompatibleMovementPath(state, entity, target, options);
  const waypoints =
    cachedPath?.targetKey === targetKey
      ? pruneReachedWaypoints(cachedPath.waypoints, entity.position)
      : [];
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

function getFreshPathMoveResolution(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): MoveResolution | null {
  const movementPath = getFreshMovementPath(state, entity, target, options);
  const waypoint = movementPath?.waypoints[0];

  if (!movementPath || !waypoint) {
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

  return {
    movementPath,
    position: movedEntity.position,
    reason: "path",
  };
}

function getFreshMovementPath(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): MovementPath | null {
  if (!state.map) {
    return null;
  }

  if (isFreshPathBackoffActive(state, entity.id)) {
    return null;
  }

  const goals = getPathGoals(state, entity, target, options);

  if (goals.length === 0) {
    return null;
  }

  const blockerLookup = createNavigationBlockerLookup(state, entity.id, options);

  recordNavigationPathQuery(getNavigationPathMetricBucket(options.pathProfile));
  const waypoints = findNavigationPath(state.map, entity.position, goals, {
    isBlocked: (position) =>
      isNavigationPositionBlocked(
        state,
        position,
        entity.id,
        options,
        blockerLookup,
      ),
  });

  if (waypoints.length === 0) {
    return null;
  }

  return {
    blockedCount: 0,
    lastRequestedAtMs: state.simulationTimeMs ?? 0,
    profile: getMovementPathProfile(options),
    targetKey: getMovementPathTargetKey(state, entity, target, options),
    targetPosition: getMovementPathTargetPosition(target, options),
    waypoints,
  };
}

function getMovementPathTargetKey(
  _state: GameState,
  _entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): string {
  return [
    getMovementPathProfile(options),
    target.id,
    options.pathTargetKey ?? getNavigationPositionKey(target.position),
    options.allowPartyPassThrough ? "party-pass" : "solid-party",
  ].join(":");
}

function getMovementPathProfile(options: MovementOptions): MovementPathProfile {
  return options.pathProfile ?? "other";
}

function getMovementPathTargetPosition(
  target: GameEntity,
  options: MovementOptions,
): Position {
  return options.pathTargetPosition ?? target.position;
}

function getCompatibleMovementPath(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): MovementPath | null {
  const path = state.movementPathsByEntityId?.[entity.id];

  if (!path || path.targetKey !== getMovementPathTargetKey(state, entity, target, options)) {
    return null;
  }

  return path;
}

function shouldRefreshMovementPath(
  state: GameState,
  path: MovementPath,
  options: MovementOptions,
): boolean {
  if ((path.blockedCount ?? 0) >= MOVEMENT_PATH_BLOCKED_REFRESH_COUNT) {
    return true;
  }

  const profile = getMovementPathProfile(options);
  const elapsedMs = (state.simulationTimeMs ?? 0) - (path.lastRequestedAtMs ?? 0);

  if (profile === "chase" || profile === "combatSlot") {
    return (
      hasMovementPathTargetMoved(path, options) ||
      elapsedMs >= COMBAT_PATH_REFRESH_MS
    );
  }

  if (profile === "follow") {
    return (
      hasMovementPathTargetMoved(path, options) &&
      elapsedMs >= FOLLOW_PATH_REFRESH_MS
    );
  }

  return false;
}

function hasMovementPathTargetMoved(
  path: MovementPath,
  options: MovementOptions,
): boolean {
  if (!path.targetPosition || !options.pathTargetPosition) {
    return false;
  }

  return getGridDistance(path.targetPosition, options.pathTargetPosition) >=
    MEANINGFUL_TARGET_MOVE_DISTANCE;
}

function markCompatibleMovementPathBlocked(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): GameState {
  const path = getCompatibleMovementPath(state, entity, target, options);

  if (!path || pruneReachedWaypoints(path.waypoints, entity.position).length === 0) {
    return state;
  }

  return setMovementPath(state, entity.id, {
    ...path,
    blockedCount: (path.blockedCount ?? 0) + 1,
  });
}

function resetCompatibleMovementPathBlockedCount(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): GameState {
  const path = getCompatibleMovementPath(state, entity, target, options);

  if (!path || !path.blockedCount) {
    return state;
  }

  return setMovementPath(state, entity.id, {
    ...path,
    blockedCount: 0,
  });
}

function getNavigationPathMetricBucket(
  profile: MovementPathProfile | undefined,
): NavigationPathMetricBucket {
  switch (profile) {
    case "roam":
      return "roam";
    case "home":
      return "home";
    case "gather":
      return "gather";
    case "chase":
    case "combatSlot":
      return "combat";
    case "follow":
      return "follow";
    case "poi":
    case "teleport":
    case "resurrection":
    case "explore":
      return "poi";
    default:
      return "other";
  }
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

function isFreshPathBackoffActive(state: GameState, entityId: string): boolean {
  const retryAtMs = state.movementPathRetryAtMsByEntityId?.[entityId];

  return retryAtMs !== undefined && retryAtMs > (state.simulationTimeMs ?? 0);
}

function isMoveDestinationAvailable(
  state: GameState,
  entity: GameEntity,
  position: Position,
  options: MovementOptions = {},
): boolean {
  return isWalkablePosition(state, position, entity.id, options);
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
    usesCompanionDebugSpeed(entity) && state.debugOptions?.superSpeedEnabled ? 5 : 1;
  const skillSpeedMultiplier =
    entity.kind === "companion"
      ? 1 +
        (state.skillSelfBuffsByCompanionId?.[entity.id]?.movementSpeedBonusPercent ??
          0) /
          100
      : 1;

  return (state.simulationDeltaMs ?? GAME_LOOP_TICK_MS) *
    (options.speedMultiplier ?? 1) *
    skillSpeedMultiplier *
    debugSpeedMultiplier;
}

function usesCompanionDebugSpeed(entity: GameEntity): boolean {
  return (
    entity.kind === "companion" ||
    (entity.kind === "npc" && entity.npcRole === "quest_guide")
  );
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
      !canPassThroughBlockingEntity(movingEntity, entity, options)
    ) {
      addEntityCollisionPositionKeys(lookup.blockingEntityKeys, entity);
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
  addCollisionShapePositionKeys(keys, position, {
    kind: "circle",
    radius: collisionDistance,
  });
}

function addEntityCollisionPositionKeys(
  keys: Set<string>,
  entity: GameEntity,
): void {
  addCollisionShapePositionKeys(
    keys,
    entity.position,
    getEntityCollisionShape(entity),
  );
}

function addCollisionShapePositionKeys(
  keys: Set<string>,
  position: Position,
  shape: EntityCollisionShape,
): void {
  const bounds = getCollisionShapeBounds(position, shape);

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const candidate = { x, y };

      if (isPositionInsideCollisionShape(candidate, position, shape)) {
        keys.add(getNavigationPositionKey(candidate));
      }
    }
  }
}

function getCollisionShapeBounds(
  position: Position,
  shape: EntityCollisionShape,
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const top =
    shape.kind === "verticalCapsule"
      ? position.y - shape.height * shape.anchorY
      : position.y - shape.radius;
  const bottom =
    shape.kind === "verticalCapsule"
      ? top + shape.height
      : position.y + shape.radius;

  return {
    minX: Math.floor(position.x - shape.radius),
    maxX: Math.ceil(position.x + shape.radius),
    minY: Math.floor(top),
    maxY: Math.ceil(bottom),
  };
}

function isPositionInsideCollisionShape(
  position: Position,
  origin: Position,
  shape: EntityCollisionShape,
): boolean {
  if (shape.kind === "circle") {
    return getEuclideanDistance(position, origin) < shape.radius;
  }

  const top = origin.y - shape.height * shape.anchorY;
  const bottom = top + shape.height;
  const segmentStartY = top + shape.radius;
  const segmentEndY = bottom - shape.radius;
  const closestY = Math.min(
    Math.max(position.y, segmentStartY),
    segmentEndY,
  );

  return (
    getEuclideanDistance(position, { x: origin.x, y: closestY }) < shape.radius
  );
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

function isPositionOccupiedByEntity(
  state: GameState,
  position: Position,
  ignoredEntityId?: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      isPositionInsideEntityCollisionShape(entity, position),
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
      !canPassThroughBlockingEntity(movingEntity, entity, options) &&
      isPositionInsideEntityCollisionShape(entity, position),
  );
}

function isPositionOccupiedBySeparationBlocker(
  state: GameState,
  position: Position,
  movingEntityId: string,
  sourceEntityId: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== movingEntityId &&
      entity.id !== sourceEntityId &&
      entity.kind !== "resource" &&
      entity.state !== "dead" &&
      isPositionInsideEntityCollisionShape(entity, position),
  );
}

function canPassThroughBlockingEntity(
  movingEntity: GameEntity | undefined,
  occupyingEntity: GameEntity,
  options: WalkablePositionOptions,
): boolean {
  return (
    canPassThroughStaticNpcForPartyMovement(movingEntity, occupyingEntity) ||
    canPassThroughPartyEntity(movingEntity, occupyingEntity, options)
  );
}

function canPassThroughStaticNpcForPartyMovement(
  movingEntity: GameEntity | undefined,
  occupyingEntity: GameEntity,
): boolean {
  return Boolean(
    movingEntity?.kind === "companion" &&
      occupyingEntity.kind === "npc" &&
      isStaticPassiveNpcRole(occupyingEntity.npcRole),
  );
}

function isStaticPassiveNpcRole(npcRole: string): boolean {
  return (
    npcRole === "quest_giver" ||
    npcRole === "class_mentor" ||
    npcRole === "merchant" ||
    npcRole === "smith" ||
    npcRole === "dog" ||
    npcRole === "test_blade"
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

function isPartyEntity(entity: GameEntity): boolean {
  return (
    entity.kind === "companion" ||
    (entity.kind === "npc" && entity.npcRole === "quest_guide")
  );
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
  entityId: string,
  intendedPosition: Position | null | undefined,
): GameState {
  if (!intendedPosition) {
    return state;
  }

  return {
    ...state,
    moveIntentsByEntityId: {
      ...(state.moveIntentsByEntityId ?? {}),
      [entityId]: intendedPosition,
    },
  };
}

function getIntendedMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): Position | null {
  const moveResolution = getNextMoveResolution(state, entity, target, options, {
    allowFreshPath: false,
  });

  return moveResolution?.position ?? null;
}

function getMovementFailureDetail(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
  intendedPosition?: Position | null,
): MovementFailureDetail {
  const blocker = intendedPosition
    ? getNavigationCellBlocker(state, intendedPosition, entity.id, options)
    : undefined;
  const pathFailureDetail = getPathFailureDetail(state, entity, target, options);

  return {
    ...createMovementFailureDetail(entity, target, intendedPosition, blocker),
    ...pathFailureDetail,
  };
}

function getNavigationCellBlocker(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
  options: WalkablePositionOptions,
): { id?: string; kind: Exclude<DebugNavigationBlocker, "none"> } | undefined {
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
      !canPassThroughBlockingEntity(
        state.entities[ignoredEntityId],
        candidate,
        options,
      ) &&
      isPositionInsideEntityCollisionShape(candidate, position),
  );

  return entity ? { id: entity.id, kind: entity.kind } : { kind: "unknown" };
}

function getPathFailureDetail(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions,
): Partial<MovementFailureDetail> {
  if (!state.map) {
    return {};
  }

  const startCell = toNavigationNode(entity.position);
  const requestedTargetCell = toNavigationNode(target.position);
  const startCellWalkable = isNavigationCellWalkable(state.map, startCell);
  const targetCellWalkable = isNavigationCellWalkable(state.map, requestedTargetCell);
  const targetCellBlockedBy = getNavigationCellBlocker(
    state,
    requestedTargetCell,
    entity.id,
    options,
  );
  const targetCellBlocked = Boolean(
    targetCellBlockedBy && targetCellBlockedBy.kind !== "unknown",
  );
  const resolvedGoalCells = getPathGoals(state, entity, target, options)
    .map(toNavigationNode);
  const deepDetail = state.debugOptions?.deepNavigationTelemetryEnabled
    ? getDeepPathFailureDetail(
        state,
        entity,
        requestedTargetCell,
        startCell,
        options,
      )
    : {};
  const freshPathAttempted = Boolean(
    startCellWalkable &&
      targetCellWalkable &&
      resolvedGoalCells.length > 0 &&
      !isFreshPathBackoffActive(state, entity.id),
  );

  return {
    pathFailureReason: getPathFailureReason({
      startCellWalkable,
      targetCellWalkable,
      targetCellBlocked,
      hasResolvedGoals: resolvedGoalCells.length > 0,
      isPathBackoffActive: isFreshPathBackoffActive(state, entity.id),
      freshPathAttempted,
    }),
    requestedTargetCell,
    resolvedGoalCells,
    targetCellWalkable,
    targetCellBlockedBy,
    startCellWalkable,
    freshPathAttempted,
    ...deepDetail,
  };
}

function getDeepPathFailureDetail(
  state: GameState,
  entity: GameEntity,
  requestedTargetCell: Position,
  startCell: Position,
  options: MovementOptions,
): Pick<MovementFailureDetail, "nearbyReachableCellCount" | "nearbyBlockedCellSummary"> {
  if (!state.map) {
    return {};
  }

  const nearbyBlockedCellSummary: Partial<Record<DebugNavigationBlocker, number>> = {};
  const blockerLookup = createNavigationBlockerLookup(state, entity.id, options);
  const maxPathDistance = state.map.columns * state.map.rows * 2;
  let nearbyReachableCellCount = 0;

  for (const nearbyCell of getNavigationNeighborPositions(requestedTargetCell)) {
    const blocker = getNavigationCellBlocker(
      state,
      nearbyCell,
      entity.id,
      options,
    );

    if (blocker && blocker.kind !== "unknown") {
      nearbyBlockedCellSummary[blocker.kind] =
        (nearbyBlockedCellSummary[blocker.kind] ?? 0) + 1;
      continue;
    }

    if (
      isNavigationCellWalkable(state.map, nearbyCell) &&
      getNavigationDistance(state.map, startCell, nearbyCell, maxPathDistance, {
        isBlocked: (candidate) =>
          isNavigationPositionBlocked(
            state,
            candidate,
            entity.id,
            options,
            blockerLookup,
          ),
      }) !== null
    ) {
      nearbyReachableCellCount += 1;
    }
  }

  return {
    nearbyReachableCellCount,
    nearbyBlockedCellSummary,
  };
}

function getPathFailureReason({
  startCellWalkable,
  targetCellWalkable,
  targetCellBlocked,
  hasResolvedGoals,
  isPathBackoffActive,
  freshPathAttempted,
}: {
  startCellWalkable: boolean;
  targetCellWalkable: boolean;
  targetCellBlocked: boolean;
  hasResolvedGoals: boolean;
  isPathBackoffActive: boolean;
  freshPathAttempted: boolean;
}) {
  if (!startCellWalkable) {
    return "start_unwalkable";
  }

  if (!targetCellWalkable) {
    return "target_unwalkable";
  }

  if (isPathBackoffActive) {
    return "path_backoff";
  }

  if (!hasResolvedGoals) {
    return "no_goals";
  }

  if (targetCellBlocked) {
    return "target_blocked";
  }

  return freshPathAttempted ? "unreachable" : "unknown";
}

function swapEntityPositions(
  state: GameState,
  firstEntityId: string,
  secondEntityId: string,
): GameState {
  const firstEntity = state.entities[firstEntityId];
  const secondEntity = state.entities[secondEntityId];

  if (!firstEntity || !secondEntity) {
    recordMovementFailure();
    return markMoveFailed(state, firstEntityId);
  }

  let nextState = updateMovementEntity(
    state,
    moveEntityTo(firstEntity, secondEntity.position),
  );
  nextState = updateMovementEntity(
    nextState,
    moveEntityTo(secondEntity, firstEntity.position),
  );
  nextState = markMoveSucceeded(nextState, firstEntity.id, firstEntity.position);
  nextState = markMoveSucceeded(nextState, secondEntity.id, secondEntity.position);

  return nextState;
}

function updateMovementEntity(state: GameState, entity: GameEntity): GameState {
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
