import { isCombatEntity, moveEntityToward } from "./entities";
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

  if (isPositionOccupiedByLivingEntity(state, movedEntity.position, entity.id)) {
    return state;
  }

  return updateEntity(state, movedEntity);
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
