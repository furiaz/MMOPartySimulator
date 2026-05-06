import {
  getBoundedPathDistance,
  isActiveResourcePosition,
  isWallPosition,
  previewMoveTowardPosition,
  type GameState,
} from "./state";
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
  maxPathDistance?: number;
  leader?: GameEntity;
  leaderSafeDistance?: number;
  leaderMaxPathDistance?: number;
  preferredSlotIndex?: number;
  allowPartyPassThrough?: boolean;
};

export function chooseAttackSlot(
  state: GameState,
  attacker: CombatEntity,
  targetPosition: Position,
  attackRange: number,
  options: AttackSlotOptions = {},
): Position | null {
  return (
    getSortedCombatPositions(
      state,
      getAttackSlotPositions(targetPosition, attackRange),
      attacker,
      targetPosition,
      options,
      options.preferredSlotIndex,
    ).find((position) =>
      isReachableCombatPosition(state, attacker, position, options),
    ) ?? null
  );
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

function getSortedCombatPositions(
  state: GameState,
  positions: Position[],
  attacker: CombatEntity,
  targetPosition: Position,
  options: AttackSlotOptions,
  preferredSlotIndex = 0,
): Position[] {
  return [...positions]
    .map((position, index) => ({
      position,
      index,
      pathDistance: getAttackSlotPathDistance(state, attacker, position, options),
    }))
    .sort(
      (a, b) =>
        a.pathDistance - b.pathDistance ||
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

function getAttackSlotPathDistance(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
  options: AttackSlotOptions,
): number {
  if (isSamePosition(attacker.position, position)) {
    return 0;
  }

  const maxDistance = options.maxPathDistance ?? Number.POSITIVE_INFINITY;
  const pathDistance = getBoundedPathDistance(state, attacker, position, maxDistance);

  return pathDistance ?? Number.POSITIVE_INFINITY;
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
): boolean {
  return (
    isCombatPositionAvailable(state, attacker, position) &&
    isWithinAttackerPathLimit(state, attacker, position, options) &&
    isLeaderSafeAttackSlot(state, position, options) &&
    (isSamePosition(attacker.position, position) ||
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
): boolean {
  return (
    options.maxPathDistance === undefined ||
    getBoundedPathDistance(state, attacker, position, options.maxPathDistance) !==
      null
  );
}

function isLeaderSafeAttackSlot(
  state: GameState,
  position: Position,
  options: AttackSlotOptions,
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
    getBoundedPathDistance(
      state,
      options.leader,
      position,
      options.leaderMaxPathDistance,
    ) !== null
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
      entityId !== attacker.id && isSamePosition(reservedPosition, position),
  );
}

function isOccupiedByOtherEntity(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return Object.values(state.entities).some(
    (entity: GameEntity) =>
      entity.id !== attacker.id && isSamePosition(entity.position, position),
  );
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getManhattanDistance(from: Position, to: Position): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}
