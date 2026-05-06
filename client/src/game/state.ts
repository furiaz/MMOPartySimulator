import { isCombatEntity, moveEntityTo, moveEntityToward } from "./entities";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import type {
  CombatFeedbackEvent,
  CombatFeedbackType,
  DebugTelemetryState,
  Companion,
  GameMap,
  GameEntity,
  Enemy,
  Player,
  LeaderIntent,
  PartyFormationState,
  PartyMemberRole,
  Position,
  ResourceInventory,
  ResourceType,
} from "./types";

const AVAILABLE_TILE_SEARCH_RADIUS = 8;
const COMBAT_FEEDBACK_DURATION_MS = 900;
const POSITION_EPSILON = 0.001;
const ENTITY_COLLISION_DISTANCE = 0.7;
const RESOURCE_COLLISION_DISTANCE = 0.7;

type FindAvailablePositionOptions = {
  blockedPositions?: Position[];
  ignoredEntityId?: string;
};

type WalkablePositionOptions = {
  allowPartyPassThrough?: boolean;
};

type MovementOptions = WalkablePositionOptions;

export type GameState = {
  entities: Record<string, GameEntity>;
  inventory: ResourceInventory;
  map?: GameMap;
  autoModeEnabled: boolean;
  simulationTick: number;
  partyLeaderId: string;
  leaderIntent: LeaderIntent | null;
  exploredTiles: Record<string, true>;
  followTrailsByEntityId: Record<string, Position[]>;
  lastPositionsByEntityId?: Record<string, Position>;
  failedMoveByEntityId?: Record<string, true>;
  moveIntentsByEntityId?: Record<string, Position>;
  reservedPositionsByEntityId?: Record<string, Position>;
  defenderWaitTicksByLeaderId?: Record<string, number>;
  defenderBlockedTicksByEntityId?: Record<string, number>;
  partyFormation?: PartyFormationState;
  combatFeedbackEvents: CombatFeedbackEvent[];
  debugTelemetry?: DebugTelemetryState;
};

export function createEmptyResourceInventory(): ResourceInventory {
  return {
    wood: 0,
    ore: 0,
    herb: 0,
  };
}

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
  return addEntity(state, {
    ...enemy,
    position: findClosestAvailablePosition(state, enemy.position),
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

export function addResourceToInventory(
  state: GameState,
  resourceType: ResourceType,
  amount: number,
): GameState {
  return {
    ...state,
    inventory: {
      ...state.inventory,
      [resourceType]: state.inventory[resourceType] + amount,
    },
  };
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

  if (entity?.kind !== "player" && entity?.kind !== "companion") {
    return state;
  }

  return {
    ...state,
    partyLeaderId: entity.id,
  };
}

export function advanceSimulationTick(state: GameState): GameState {
  return {
    ...state,
    simulationTick: state.simulationTick + 1,
  };
}

export function setPartyMemberRole(
  state: GameState,
  entityId: string,
  role: PartyMemberRole,
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "player" && partyMember?.kind !== "companion") {
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

export function setPartyOrder(
  state: GameState,
  entityId: string,
  partyOrder: number,
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "player" && partyMember?.kind !== "companion") {
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
  const nextStateWithIntent = recordMoveIntent(state, entity, target, options);
  const moveResolution = getNextMoveResolution(
    nextStateWithIntent,
    entity,
    target,
    options,
  );

  if (!moveResolution || isSamePosition(moveResolution.position, entity.position)) {
    return markMoveFailed(nextStateWithIntent, entity.id);
  }

  if (moveResolution.swapWithEntityId) {
    const reservedState = reserveSwapPositionsForTick(
      nextStateWithIntent,
      entity.id,
      moveResolution.swapWithEntityId,
    );

    if (reservedState === nextStateWithIntent) {
      return markMoveFailed(nextStateWithIntent, entity.id);
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
    return markMoveFailed(nextStateWithIntent, entity.id);
  }

  const reservedState = reservePositionForTick(
    nextStateWithIntent,
    entity.id,
    moveResolution.position,
    options,
  );

  if (reservedState === nextStateWithIntent) {
    return markMoveFailed(nextStateWithIntent, entity.id);
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
  const target: GameEntity = {
    id: "__position_target__",
    kind: "resource",
    position,
    state: "idle",
    resourceType: "wood",
    durability: 1,
    maxDurability: 1,
    quantity: 1,
    maxGatherers: 1,
    isDepleted: false,
  };

  return moveEntityTowardIfUnoccupied(state, entity, target, options);
}

export function clearTickMovementPlanning(state: GameState): GameState {
  return {
    ...state,
    failedMoveByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
  };
}

export function reservePositionForTick(
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
): Position | null {
  const target: GameEntity = {
    id: "__position_target__",
    kind: "resource",
    position,
    state: "idle",
    resourceType: "wood",
    durability: 1,
    maxDurability: 1,
    quantity: 1,
    maxGatherers: 1,
    isDepleted: false,
  };

  return getIntendedMovePosition(state, entity, target);
}

export function getBoundedPathDistance(
  state: GameState,
  entity: GameEntity,
  position: Position,
  maxDistance: number,
): number | null {
  if (isSamePosition(entity.position, position)) {
    return 0;
  }

  if (!state.map) {
    const directDistance = getGridDistance(entity.position, position);

    return directDistance <= maxDistance ? directDistance : null;
  }

  const startKey = getPositionKey(entity.position);
  const targetKey = getPositionKey(position);
  const visited = new Set<string>([startKey]);
  const queue: { position: Position; distance: number }[] = [
    { position: entity.position, distance: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || current.distance >= maxDistance) {
      continue;
    }

    for (const neighbor of getNeighborPositions(current.position)) {
      const key = getPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isWalkablePosition(state, neighbor, entity.id, {
          allowPartyPassThrough: true,
        })
      ) {
        continue;
      }

      const distance = current.distance + 1;

      if (key === targetKey) {
        return distance;
      }

      visited.add(key);
      queue.push({ position: neighbor, distance });
    }
  }

  return null;
}

export function isWallPosition(state: GameState, position: Position): boolean {
  return Boolean(
    state.map?.walls.some((wall) => isSamePosition(wall, position)),
  );
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
): { position: Position; swapWithEntityId?: string } | null {
  const movedEntity = moveEntityToward(entity, target);

  if (isSamePosition(movedEntity.position, entity.position)) {
    return null;
  }

  if (isWalkablePosition(state, movedEntity.position, entity.id, options)) {
    return { position: movedEntity.position };
  }

  const pathPosition = findNextPathPosition(state, entity, target, options);

  if (
    pathPosition &&
    isMoveDestinationAvailable(state, entity, pathPosition, options)
  ) {
    return { position: pathPosition };
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
    };
  }

  const leaderSwapWithEntity = getLeaderSwapCandidate(
    state,
    entity,
    movedEntity.position,
  );

  if (leaderSwapWithEntity) {
    return {
      position: movedEntity.position,
      swapWithEntityId: leaderSwapWithEntity.id,
    };
  }

  return findAlternativeMovePosition(state, entity, target, options);
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

  const goals = getPathGoals(state, entity, target, options);
  const goalKeys = new Set(goals.map(getPositionKey));

  if (goalKeys.size === 0) {
    return null;
  }

  const startKey = getPositionKey(entity.position);
  const visited = new Set<string>([startKey]);
  const queue: { position: Position; firstStep: Position | null }[] = [
    { position: entity.position, firstStep: null },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (
      goalKeys.has(getPositionKey(current.position)) &&
      (!current.firstStep ||
        isMoveDestinationAvailable(state, entity, current.firstStep, options))
    ) {
      return current.firstStep;
    }

    for (const neighbor of getNeighborPositions(current.position)) {
      const key = getPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isWalkablePosition(state, neighbor, entity.id, {
          allowPartyPassThrough: true,
        })
      ) {
        continue;
      }

      visited.add(key);
      queue.push({
        position: neighbor,
        firstStep: current.firstStep ?? neighbor,
      });
    }
  }

  return null;
}

function getPathGoals(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): Position[] {
  if (isWalkablePosition(state, target.position, entity.id, options)) {
    return [target.position];
  }

  return getNeighborPositions(target.position).filter((position) =>
    isWalkablePosition(state, position, entity.id, options),
  );
}

function findAlternativeMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
  options: MovementOptions = {},
): { position: Position } | null {
  if (state.failedMoveByEntityId?.[entity.id]) {
    return null;
  }

  const candidates = getAlternativeMoveCandidates(entity.position, target.position);
  const previousPosition = state.lastPositionsByEntityId?.[entity.id];
  const validCandidates = candidates.filter((position) =>
    isWalkablePosition(state, position, entity.id, options),
  );
  const preferredCandidate = validCandidates.find(
    (position) => !previousPosition || !isSamePosition(position, previousPosition),
  );

  return preferredCandidate
    ? { position: preferredCandidate }
    : validCandidates[0]
      ? { position: validCandidates[0] }
      : null;
}

function getAlternativeMoveCandidates(
  current: Position,
  target: Position,
): Position[] {
  const xStep = Math.sign(target.x - current.x);
  const yStep = Math.sign(target.y - current.y);
  const candidates: Position[] = [];

  addCloserSideStepCandidates(candidates, current, xStep, yStep);

  if (xStep !== 0) {
    candidates.push({ x: current.x + xStep, y: current.y });
  }

  if (yStep !== 0) {
    candidates.push({ x: current.x, y: current.y + yStep });
  }

  return dedupePositions(candidates).filter(
    (position) =>
      !isSamePosition(position, current) &&
      isCloserToTarget(position, current, target),
  );
}

function addCloserSideStepCandidates(
  candidates: Position[],
  current: Position,
  xStep: number,
  yStep: number,
): void {
  if (xStep !== 0 && yStep !== 0) {
    candidates.push(
      { x: current.x + xStep, y: current.y - yStep },
      { x: current.x - xStep, y: current.y + yStep },
    );
    return;
  }

  if (xStep !== 0) {
    candidates.push(
      { x: current.x + xStep, y: current.y + 1 },
      { x: current.x + xStep, y: current.y - 1 },
    );
    return;
  }

  if (yStep !== 0) {
    candidates.push(
      { x: current.x + 1, y: current.y + yStep },
      { x: current.x - 1, y: current.y + yStep },
    );
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

function isCloserToTarget(
  position: Position,
  current: Position,
  target: Position,
): boolean {
  return (
    getGridDistance(position, target) < getGridDistance(current, target) ||
    getManhattanDistance(position, target) < getManhattanDistance(current, target)
  );
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getManhattanDistance(from: Position, to: Position): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

function getNeighborPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function isWalkablePosition(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
  options: WalkablePositionOptions = {},
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isActiveResourcePosition(state, position, ignoredEntityId) &&
    !isReservedPosition(state, position, ignoredEntityId) &&
    !isPositionOccupiedByBlockingEntity(
      state,
      position,
      ignoredEntityId,
      options,
    )
  );
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

function isPartyEntity(entity: GameEntity): entity is Player | Companion {
  return entity.kind === "player" || entity.kind === "companion";
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

function getLeaderSwapCandidate(
  state: GameState,
  entity: GameEntity,
  targetPosition: Position,
): Companion | undefined {
  if (entity.kind !== "player") {
    return undefined;
  }

  const companion = Object.values(state.entities).find(
    (candidate): candidate is Companion =>
      candidate.kind === "companion" &&
      candidate.followTargetId === entity.id &&
      isSamePosition(candidate.position, targetPosition),
  );

  if (!companion || !canLeaderSwapWithCompanion(state, entity, companion)) {
    return undefined;
  }

  return companion;
}

function canLeaderSwapWithCompanion(
  state: GameState,
  leader: Player,
  companion: Companion,
): boolean {
  return (
    companion.state !== "gather" &&
    companion.commandPriority !== "direct" &&
    getGridDistance(leader.position, companion.position) === 1 &&
    isLeaderSwapDestinationValid(state, companion.position, leader.id, companion.id) &&
    isLeaderSwapDestinationValid(state, leader.position, companion.id, leader.id)
  );
}

function isLeaderSwapDestinationValid(
  state: GameState,
  position: Position,
  movingEntityId: string,
  occupyingEntityId: string,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isActiveResourcePosition(state, position, movingEntityId) &&
    !isReservedPosition(state, position, movingEntityId) &&
    !isPositionOccupiedByEntityOtherThan(state, position, [
      movingEntityId,
      occupyingEntityId,
    ])
  );
}

function reserveSwapPositionsForTick(
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

function isPositionOccupiedByEntityOtherThan(
  state: GameState,
  position: Position,
  ignoredEntityIds: string[],
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      !ignoredEntityIds.includes(entity.id) &&
      getEuclideanDistance(entity.position, position) < ENTITY_COLLISION_DISTANCE,
  );
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

function markMoveSucceeded(
  state: GameState,
  entityId: string,
  previousPosition: Position,
): GameState {
  const failedMoveByEntityId = { ...(state.failedMoveByEntityId ?? {}) };
  delete failedMoveByEntityId[entityId];

  return {
    ...state,
    lastPositionsByEntityId: {
      ...(state.lastPositionsByEntityId ?? {}),
      [entityId]: previousPosition,
    },
    failedMoveByEntityId,
  };
}

function markMoveFailed(state: GameState, entityId: string): GameState {
  return {
    ...state,
    failedMoveByEntityId: {
      ...(state.failedMoveByEntityId ?? {}),
      [entityId]: true,
    },
  };
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
