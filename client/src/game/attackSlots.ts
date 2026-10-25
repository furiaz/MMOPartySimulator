import {
  getBoundedPathDistance,
  findNearestReachablePosition,
  isCombatPositionAvailable,
  isWallPosition,
  previewMoveTowardPosition,
} from "./movementPlanning";
import type { GameState } from "./state";
import { recordAttackSlotCheck } from "./performanceMetrics";
import {
  arePositionsEqual,
  getEuclideanDistance,
  getGridDistance,
} from "./positionUtils";
import { isCombatPositionSpacedFromParty } from "./partySpacing";
import { getCombatTargetPosition, getEffectiveAttackRange, isWithinAttackReach, SPATIAL_EPSILON } from "./spatialGeometry";
import { hasStructureLineOfSight } from "./combatStructures";
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
  preferredFormationPosition?: Position;
  allowPartyPassThrough?: boolean;
  partySpacingMode?: "off" | "prefer" | "required";
  nowMs?: number;
  pathDistanceCache?: AttackSlotPathDistanceCache;
};

export type AttackSlotPathDistanceCache = Map<string, number>;
export type AttackEngagementProbe = { reachable: boolean | null; position?: Position };
export type AttackSlotPartySpacingMode = NonNullable<
  AttackSlotOptions["partySpacingMode"]
>;

const DEFAULT_ATTACK_SLOT_REUSE_MS = 250;
const TARGET_POSITION_REUSE_DISTANCE = 0.35;

export function createAttackSlotPathDistanceCache(): AttackSlotPathDistanceCache {
  return new Map<string, number>();
}

export function chooseAttackSlot(
  state: GameState,
  attacker: CombatEntity,
  target: GameEntity,
  attackReach: number,
  options: AttackSlotOptions = {},
): Position | null {
  recordAttackSlotCheck();
  const targetPosition = getCombatTargetPosition(attacker.position, target);
  const attackRange = getEffectiveAttackRange(attacker, target, attackReach);
  const partySpacingMode = options.partySpacingMode ?? "off";
  if (isValidCombatPosition(state, attacker, target, attackReach, attacker.position, options) &&
    (partySpacingMode === "off" || isCombatPositionSpacedFromParty(state, attacker, attacker.position))) {
    return attacker.position;
  }
  const cachedAttackSlot = getReusableCachedAttackSlot(
    state,
    attacker,
    target,
    attackReach,
    options,
  );

  if (
    cachedAttackSlot &&
    (partySpacingMode === "off" ||
      isCombatPositionSpacedFromParty(state, attacker, cachedAttackSlot))
  ) {
    return cachedAttackSlot;
  }

  const pathDistanceCache =
    options.pathDistanceCache ?? createAttackSlotPathDistanceCache();
  const rankedPositions = getRankedCombatPositions(
    getAttackSlotPositions(targetPosition, attackRange),
    attacker,
    options.preferredSlotIndex,
    options.preferredFormationPosition,
  ).filter((position) =>
    isValidCombatPosition(state, attacker, target, attackReach, position, options) &&
    isCheaplyReachableCombatPosition(state, attacker, position, options),
  );
  const preferredPositions =
    partySpacingMode === "off"
      ? rankedPositions
      : rankedPositions.filter((position) =>
          isCombatPositionSpacedFromParty(state, attacker, position),
        );

  for (const position of preferredPositions) {
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

  const observation = state.targetApproachesByEntityId?.[attacker.id];
  const observedPosition = observation?.targetId === target.id ? observation.engagementPosition : undefined;
  const observedIsValid = observedPosition && isValidCombatPosition(state, attacker, target, attackReach, observedPosition, options) &&
    isReachableCombatPosition(state, attacker, observedPosition, options, pathDistanceCache);
  if (observedIsValid && (partySpacingMode === "off" || isCombatPositionSpacedFromParty(state, attacker, observedPosition))) return observedPosition;

  if (partySpacingMode === "required") {
    return null;
  }

  if (cachedAttackSlot) {
    return cachedAttackSlot;
  }

  if (partySpacingMode === "prefer") {
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
  }

  if (observedIsValid) return observedPosition;

  return null;
}

/** A failed slot sample is not proof that the continuous engagement area is unreachable. */
export function probeAttackEngagement(
  state: GameState, attacker: CombatEntity, target: GameEntity, attackReach: number,
): AttackEngagementProbe {
  if (!state.map || isWallPosition(state, attacker.position)) return { reachable: null };
  const options = { allowPartyPassThrough: true, maxPathDistance: state.map.columns * state.map.rows * 2 };
  const slot = chooseAttackSlot(state, attacker, target, attackReach, options);
  if (slot) return { reachable: true, position: slot };
  const center = getCombatTargetPosition(attacker.position, target);
  const range = getEffectiveAttackRange(attacker, target, attackReach);
  let reachedEnvelope = false;
  let position: Position | undefined;
  findNearestReachablePosition(state, attacker, node => {
    const distance = getEuclideanDistance(node, center);
    // Include adjacent goal cells: navigation permits a blocked final node.
    // Reaching this conservative envelope makes an unsuccessful sample unknown.
    if (distance > range + 2) return false;
    reachedEnvelope = true;
    if (distance > range + Math.SQRT1_2) return false;
    for (const y of [0, -0.2, 0.2, -0.4, 0.4]) {
      for (const x of [0, -0.2, 0.2, -0.4, 0.4]) {
        const candidate = { x: node.x + x, y: node.y + y };
        if (isValidCombatPosition(state, attacker, target, attackReach, candidate, options)) {
          position = candidate;
          return true;
        }
      }
    }
    return false;
  }, options);
  if (position) return { reachable: true, position };
  return { reachable: reachedEnvelope ? null : false };
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
  target: GameEntity,
  attackReach: number,
  attackSlot: Position,
  options: Pick<
    AttackSlotOptions,
    "allowPartyPassThrough" | "nowMs"
  > = {},
): GameState {
  return {
    ...state,
    attackSlotCacheByEntityId: {
      ...(state.attackSlotCacheByEntityId ?? {}),
      [attacker.id]: {
        attackRange: getEffectiveAttackRange(attacker, target, attackReach),
        attackSlot,
        createdAtMs: options.nowMs ?? state.simulationTimeMs ?? 0,
        mapKey: getAttackSlotMapCacheKey(state),
        targetId: target.id,
        targetPosition: getCombatTargetPosition(attacker.position, target),
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
  return ATTACK_SLOT_DIRECTIONS.map((direction) => {
    const length = Math.hypot(direction.x, direction.y);
    return {
      x: targetPosition.x + direction.x / length * attackRange,
      y: targetPosition.y + direction.y / length * attackRange,
    };
  });
}

function getReusableCachedAttackSlot(
  state: GameState,
  attacker: CombatEntity,
  target: GameEntity,
  attackReach: number,
  options: AttackSlotOptions,
): Position | null {
  const cachedSlot = state.attackSlotCacheByEntityId?.[attacker.id];
  const targetPosition = getCombatTargetPosition(attacker.position, target);
  const attackRange = getEffectiveAttackRange(attacker, target, attackReach);

  if (!cachedSlot) {
    return null;
  }

  const nowMs = options.nowMs ?? state.simulationTimeMs ?? 0;
  const reuseMs = options.attackSlotReuseMs ?? DEFAULT_ATTACK_SLOT_REUSE_MS;

  if (
    nowMs - cachedSlot.createdAtMs > reuseMs ||
    cachedSlot.mapKey !== getAttackSlotMapCacheKey(state) ||
    cachedSlot.targetId !== target.id ||
    cachedSlot.attackRange !== attackRange ||
    cachedSlot.usesPartyPassThrough !== Boolean(options.allowPartyPassThrough) ||
    getEuclideanDistance(cachedSlot.targetPosition, targetPosition) >
      TARGET_POSITION_REUSE_DISTANCE ||
    !isValidCombatPosition(state, attacker, target, attackReach, cachedSlot.attackSlot, options) ||
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
  preferredSlotIndex = 0,
  preferredFormationPosition?: Position,
): Position[] {
  return [...positions]
    .map((position, index) => ({
      position,
      index,
    }))
    .sort(
      (a, b) =>
        compareDistances(getEuclideanDistance(a.position, attacker.position), getEuclideanDistance(b.position, attacker.position)) ||
        (preferredFormationPosition ? compareDistances(getEuclideanDistance(a.position, preferredFormationPosition),
          getEuclideanDistance(b.position, preferredFormationPosition)) : 0) ||
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

function isValidCombatPosition(
  state: GameState,
  attacker: CombatEntity,
  target: GameEntity,
  attackReach: number,
  position: Position,
  options: AttackSlotOptions,
): boolean {
  return (
    isWithinAttackReach(attacker, target, attackReach, position) &&
    isCombatPositionAvailable(state, attacker, position, options) &&
    hasStructureLineOfSight(state, position, target)
  );
}

function compareDistances(a: number, b: number): number {
  return Math.abs(a - b) <= SPATIAL_EPSILON ? 0 : a - b;
}
