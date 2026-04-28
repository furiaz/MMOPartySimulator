import type { GameEntity } from "./types";

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
