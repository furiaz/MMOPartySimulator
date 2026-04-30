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
      getAttackSlotPositions(targetPosition, attackRange),
      attacker,
      targetPosition,
    ).find((position) =>
      isReachableCombatPosition(state, attacker, position, options),
    ) ??
    getSortedCombatPositions(
      getNearbyCombatPositions(targetPosition, attackRange),
      attacker,
      targetPosition,
    ).find((position) =>
      isReachableCombatPosition(state, attacker, position, options),
    ) ??
    null
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

function getNearbyCombatPositions(
  targetPosition: Position,
  attackRange: number,
): Position[] {
  const positions: Position[] = [];

  for (let radius = attackRange + 1; radius <= attackRange + 3; radius += 1) {
    for (
      let y = targetPosition.y - radius;
      y <= targetPosition.y + radius;
      y += 1
    ) {
      for (
        let x = targetPosition.x - radius;
        x <= targetPosition.x + radius;
        x += 1
      ) {
        if (
          Math.max(
            Math.abs(targetPosition.x - x),
            Math.abs(targetPosition.y - y),
          ) !== radius
        ) {
          continue;
        }

        positions.push({ x, y });
      }
    }
  }

  return positions;
}

function getSortedCombatPositions(
  positions: Position[],
  attacker: CombatEntity,
  targetPosition: Position,
): Position[] {
  return [...positions].sort(
    (a, b) =>
      getGridDistance(a, targetPosition) - getGridDistance(b, targetPosition) ||
      getManhattanDistance(a, targetPosition) -
        getManhattanDistance(b, targetPosition) ||
      getGridDistance(a, attacker.position) -
        getGridDistance(b, attacker.position) ||
      getManhattanDistance(a, attacker.position) -
        getManhattanDistance(b, attacker.position) ||
      a.y - b.y ||
      a.x - b.x,
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
      previewMoveTowardPosition(state, attacker, position) !== null)
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
