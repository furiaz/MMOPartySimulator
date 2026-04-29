import { isCombatEntity, moveEntityTo, moveEntityToward } from "./entities";
import type { GameEntity, Position } from "./types";

export type GameState = {
  entities: Record<string, GameEntity>;
};

export function addEntity(state: GameState, entity: GameEntity): GameState {
  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
  };
}

export function updateEntity(state: GameState, entity: GameEntity): GameState {
  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
  };
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
): GameState {
  const movedEntity = moveEntityToward(entity, target);

  if (isSamePosition(movedEntity.position, entity.position)) {
    return state;
  }

  if (!isPositionOccupiedByLivingEntity(state, movedEntity.position, entity.id)) {
    return updateEntity(state, movedEntity);
  }

  const alternativePosition = findAlternativeMovePosition(state, entity, target);

  if (!alternativePosition) {
    return state;
  }

  return updateEntity(state, moveEntityTo(entity, alternativePosition));
}

function findAlternativeMovePosition(
  state: GameState,
  entity: GameEntity,
  target: GameEntity,
): Position | null {
  const candidates = getAlternativeMoveCandidates(entity.position, target.position);

  return (
    candidates.find(
      (position) =>
        !isPositionOccupiedByLivingEntity(state, position, entity.id),
    ) ?? null
  );
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

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function isPositionOccupiedByLivingEntity(
  state: GameState,
  position: Position,
  ignoredEntityId: string,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== ignoredEntityId &&
      isCombatEntity(entity) &&
      entity.state !== "dead" &&
      entity.position.x === position.x &&
      entity.position.y === position.y,
  );
}
