import { updateAttackSystem } from "./attackSystem";
import { updateEnemyAISystem } from "./enemyAISystem";
import { updateFollowSystem } from "./followSystem";
import { updateGatherSystem } from "./gatherSystem";
import { updateRoleSystem } from "./roleSystem";
import type { GameState } from "./state";

export function updateGame(state: GameState): GameState {
  let nextState = state;
  const movedEntityIds = new Set<string>();

  nextState = updateRoleSystem(nextState);
  nextState = updateFollowSystem(nextState, movedEntityIds);
  nextState = updateEnemyAISystem(nextState);
  nextState = updateAttackSystem(nextState, movedEntityIds);
  nextState = updateGatherSystem(nextState, movedEntityIds);

  return nextState;
}
