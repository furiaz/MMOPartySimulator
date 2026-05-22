import {
  getBoundedPathDistance,
  isActiveResourcePosition,
  isWallPosition,
  previewMoveTowardPosition,
  type GameState,
} from "./state";
import { recordAttackSlotCheck } from "./performanceMetrics";
import {
  arePositionsEqual,
  getGridDistance,
  getManhattanDistance,
} from "./positionUtils";
import type { CombatEntity, GameEntity, Position } from "./types";

const ATTACK_SLOT_DIRECTIONS: Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];

type AttackSlotOptions = {
  attackSlotReuseMs?: number;
  maxPathDistance?: number;
  leader?: GameEntity;
  leaderSafeDistance?: number;
  leaderMaxPathDistance?: number;
  preferredSlotIndex?: number;
  allowPartyPassThrough?: boolean;
  nowMs?: number;
  pathDistanceCache?: AttackSlotPathDistanceCache;
  targetId?: string;
};

export type AttackSlotPathDistanceCache = Map<string, number>;

const DEFAULT_ATTACK_SLOT_REUSE_MS = 250;

export function createAttackSlotPathDistanceCache(): AttackSlotPathDistanceCache {
  return new Map<string, number>();
}

export function chooseAttackSlot(
  state: GameState,
  attacker: CombatEntity,
  targetPosition: Position,
  attackRange: number,
  options: AttackSlotOptions = {},
): Position | null {
  recordAttackSlotCheck();
  const cachedAttackSlot = getReusableCachedAttackSlot(
    state,
    attacker,
    targetPosition,
    attackRange,
    options,
  );

  if (cachedAttackSlot) {
    return cachedAttackSlot;
  }

  const pathDistanceCache =
    options.pathDistanceCache ?? createAttackSlotPathDistanceCache();
  const rankedPositions = getRankedCombatPositions(
    getAttackSlotPositions(targetPosition, attackRange),
    attacker,
    targetPosition,
    options.preferredSlotIndex,
  ).filter((position) =>
    isCheaplyReachableCombatPosition(state, attacker, position, options),
  );

  for (const position of rankedPositions) {
    if (
      isReachableCombatPosition(
        state,
        attacker,
        position,
        options,
        pathDistanceCache,
      )
    ) {
      return position;
    }
  }

  return null;
}

export function getAttackSlotPathDistanceCacheKey(
  state: GameState,
  entity: GameEntity,
  position: Position,
  maxDistance: number,
  options: Pick<AttackSlotOptions, "allowPartyPassThrough"> = {},
): string {
  return [
    getAttackSlotMapCacheKey(state),
    entity.id,
    `${entity.position.x},${entity.position.y}`,
    `${position.x},${position.y}`,
    maxDistance,
    options.allowPartyPassThrough ? "party-pass" : "solid-party",
  ].join(":");
}

export function rememberAttackSlot(
  state: GameState,
  attacker: GameEntity,
  targetPosition: Position,
  attackRange: number,
  attackSlot: Position,
  options: Pick<
    AttackSlotOptions,
    "allowPartyPassThrough" | "nowMs" | "targetId"
  > = {},
): GameState {
  return {
    ...state,
    attackSlotCacheByEntityId: {
      ...(state.attackSlotCacheByEntityId ?? {}),
      [attacker.id]: {
        attackRange,
        attackSlot,
        createdAtMs: options.nowMs ?? state.simulationTimeMs ?? 0,
        mapKey: getAttackSlotMapCacheKey(state),
        targetId: options.targetId,
        targetPosition,
        usesPartyPassThrough: Boolean(options.allowPartyPassThrough),
      },
    },
  };
}

function getAttackSlotMapCacheKey(state: GameState): string {
  return state.map?.id ?? state.map?.debugName ?? "no-map";
}

function getAttackSlotPositions(
  targetPosition: Position,
  attackRange: number,
): Position[] {
  return ATTACK_SLOT_DIRECTIONS.map((direction) => ({
    x: targetPosition.x + direction.x * attackRange,
    y: targetPosition.y + direction.y * attackRange,
  }));
}

function getReusableCachedAttackSlot(
  state: GameState,
  attacker: CombatEntity,
  targetPosition: Position,
  attackRange: number,
  options: AttackSlotOptions,
): Position | null {
  const cachedSlot = state.attackSlotCacheByEntityId?.[attacker.id];

  if (!cachedSlot) {
    return null;
  }

  const nowMs = options.nowMs ?? state.simulationTimeMs ?? 0;
  const reuseMs = options.attackSlotReuseMs ?? DEFAULT_ATTACK_SLOT_REUSE_MS;

  if (
    nowMs - cachedSlot.createdAtMs > reuseMs ||
    cachedSlot.mapKey !== getAttackSlotMapCacheKey(state) ||
    cachedSlot.targetId !== options.targetId ||
    cachedSlot.attackRange !== attackRange ||
    cachedSlot.usesPartyPassThrough !== Boolean(options.allowPartyPassThrough) ||
    !arePositionsEqual(cachedSlot.targetPosition, targetPosition) ||
    (state.movementFailureMsByEntityId?.[attacker.id] ?? 0) >= reuseMs
  ) {
    return null;
  }

  return isCheaplyReachableCombatPosition(
    state,
    attacker,
    cachedSlot.attackSlot,
    options,
  )
    ? cachedSlot.attackSlot
    : null;
}

function getRankedCombatPositions(
  positions: Position[],
  attacker: CombatEntity,
  targetPosition: Position,
  preferredSlotIndex = 0,
): Position[] {
  return [...positions]
    .map((position, index) => ({
      position,
      index,
    }))
    .sort(
      (a, b) =>
        getGridDistance(a.position, targetPosition) -
          getGridDistance(b.position, targetPosition) ||
        getManhattanDistance(a.position, targetPosition) -
          getManhattanDistance(b.position, targetPosition) ||
        getGridDistance(a.position, attacker.position) -
          getGridDistance(b.position, attacker.position) ||
        getManhattanDistance(a.position, attacker.position) -
          getManhattanDistance(b.position, attacker.position) ||
        getSlotPreferenceDistance(a.index, preferredSlotIndex, positions.length) -
          getSlotPreferenceDistance(b.index, preferredSlotIndex, positions.length) ||
        a.position.y - b.position.y ||
        a.position.x - b.position.x,
    )
    .map(({ position }) => position);
}

function isCheaplyReachableCombatPosition(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
  options: AttackSlotOptions,
): boolean {
  return (
    isCombatPositionAvailable(state, attacker, position) &&
    (arePositionsEqual(attacker.position, position) ||
      previewMoveTowardPosition(state, attacker, position, {
        allowPartyPassThrough: options.allowPartyPassThrough,
      }) !== null)
  );
}

function getAttackSlotPathDistance(
  state: GameState,
  entity: GameEntity,
  position: Position,
  options: AttackSlotOptions,
  pathDistanceCache: AttackSlotPathDistanceCache,
): number {
  if (arePositionsEqual(entity.position, position)) {
    return 0;
  }

  const maxDistance = options.maxPathDistance ?? Number.POSITIVE_INFINITY;
  const cacheKey = getAttackSlotPathDistanceCacheKey(
    state,
    entity,
    position,
    maxDistance,
    options,
  );
  const cachedDistance = pathDistanceCache.get(cacheKey);

  if (cachedDistance !== undefined) {
    return cachedDistance;
  }

  const pathDistance = getBoundedPathDistance(state, entity, position, maxDistance);
  const resolvedDistance = pathDistance ?? Number.POSITIVE_INFINITY;

  pathDistanceCache.set(cacheKey, resolvedDistance);

  return resolvedDistance;
}

function getSlotPreferenceDistance(
  index: number,
  preferredSlotIndex: number,
  slotCount: number,
): number {
  const normalizedPreference =
    ((preferredSlotIndex % slotCount) + slotCount) % slotCount;

  return Math.min(
    Math.abs(index - normalizedPreference),
    slotCount - Math.abs(index - normalizedPreference),
  );
}

function isReachableCombatPosition(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
  options: AttackSlotOptions,
  pathDistanceCache: AttackSlotPathDistanceCache,
): boolean {
  return (
    isCombatPositionAvailable(state, attacker, position) &&
    isWithinAttackerPathLimit(state, attacker, position, options, pathDistanceCache) &&
    isLeaderSafeAttackSlot(state, position, options, pathDistanceCache) &&
    (arePositionsEqual(attacker.position, position) ||
      previewMoveTowardPosition(state, attacker, position, {
        allowPartyPassThrough: options.allowPartyPassThrough,
      }) !== null)
  );
}

function isWithinAttackerPathLimit(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
  options: AttackSlotOptions,
  pathDistanceCache: AttackSlotPathDistanceCache,
): boolean {
  return (
    options.maxPathDistance === undefined ||
    getAttackSlotPathDistance(state, attacker, position, options, pathDistanceCache) !==
      Number.POSITIVE_INFINITY
  );
}

function isLeaderSafeAttackSlot(
  state: GameState,
  position: Position,
  options: AttackSlotOptions,
  pathDistanceCache: AttackSlotPathDistanceCache,
): boolean {
  if (!options.leader) {
    return true;
  }

  if (
    options.leaderSafeDistance !== undefined &&
    getGridDistance(options.leader.position, position) <=
      options.leaderSafeDistance
  ) {
    return true;
  }

  return (
    options.leaderMaxPathDistance !== undefined &&
    getAttackSlotPathDistance(
      state,
      options.leader,
      position,
      {
        ...options,
        maxPathDistance: options.leaderMaxPathDistance,
      },
      pathDistanceCache,
    ) !== Number.POSITIVE_INFINITY
  );
}

function isCombatPositionAvailable(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isActiveResourcePosition(state, position, attacker.id) &&
    !isReservedByOtherEntity(state, attacker, position) &&
    !isOccupiedByOtherEntity(state, attacker, position)
  );
}

function isInMapBounds(state: GameState, position: Position): boolean {
  return (
    !state.map ||
    (position.x >= 0 &&
      position.x < state.map.columns &&
      position.y >= 0 &&
      position.y < state.map.rows)
  );
}

function isReservedByOtherEntity(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return Object.entries(state.reservedPositionsByEntityId ?? {}).some(
    ([entityId, reservedPosition]) =>
      entityId !== attacker.id && arePositionsEqual(reservedPosition, position),
  );
}

function isOccupiedByOtherEntity(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return Object.values(state.entities).some(
    (entity: GameEntity) =>
      entity.id !== attacker.id && arePositionsEqual(entity.position, position),
  );
}
