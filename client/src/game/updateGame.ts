import { updateAttackSystem } from "./attackSystem";
import { updateFollowSystem } from "./followSystem";
import type { GameState } from "./state";

export function updateGame(state: GameState): GameState {
  let nextState = state;

  nextState = updateFollowSystem(nextState);
  nextState = updateAttackSystem(nextState);

  return nextState;
}
