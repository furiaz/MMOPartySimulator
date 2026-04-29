import { updateAttackSystem } from "./attackSystem";
import { updateDefendSystem } from "./defendSystem";
import { updateEnemyAISystem } from "./enemyAISystem";
import {
  reserveExploringPlayerNextTile,
  updateExplorationSystem,
} from "./explorationSystem";
import { updateFollowSystem } from "./followSystem";
import { updateGatherSystem } from "./gatherSystem";
import { updateRoleSystem } from "./roleSystem";
import {
  clearExpiredCombatFeedback,
  clearTickMovementPlanning,
  type GameState,
} from "./state";

export function updateGame(state: GameState): GameState {
  let nextState = clearExpiredCombatFeedback(clearTickMovementPlanning(state));
  const movedEntityIds = new Set<string>();

  if (nextState.autoModeEnabled) {
    nextState = updateRoleSystem(nextState);
    nextState = reserveExploringPlayerNextTile(nextState);
  }

  nextState = updateDefendSystem(nextState, movedEntityIds);
  if (nextState.autoModeEnabled) {
    nextState = updateExplorationSystem(nextState, movedEntityIds);
  }
  nextState = updateFollowSystem(nextState, movedEntityIds);
  nextState = updateEnemyAISystem(nextState);
  nextState = updateAttackSystem(nextState, movedEntityIds);
  nextState = updateGatherSystem(nextState, movedEntityIds);

  return clearExpiredCombatFeedback(nextState);
}
