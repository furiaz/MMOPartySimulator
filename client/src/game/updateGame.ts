import { updateAttackSystem } from "./attackSystem";
import { updateEnemyAISystem } from "./enemyAISystem";
import { updateFollowSystem } from "./followSystem";
import type { GameState } from "./state";

export function updateGame(state: GameState): GameState {
  let nextState = state;

  nextState = updateFollowSystem(nextState);
  nextState = updateEnemyAISystem(nextState);
  nextState = updateAttackSystem(nextState);

  return nextState;
}
