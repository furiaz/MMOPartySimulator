import { updateFollowSystem } from "./followSystem";
import type { GameState } from "./state";

export function updateGame(state: GameState): GameState {
  let nextState = state;

  nextState = updateFollowSystem(nextState);

  return nextState;
}
