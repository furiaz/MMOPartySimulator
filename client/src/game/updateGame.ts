import { updateAttackSystem } from "./attackSystem";
import { updateDefendSystem } from "./defendSystem";
import { updateEnemyAISystem } from "./enemyAISystem";
import {
  reserveExploringPartyMemberNextTile,
  updateExplorationSystem,
} from "./explorationSystem";
import { updateFollowSystem } from "./followSystem";
import { updateGatherSystem } from "./gatherSystem";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { updateRoleSystem } from "./roleSystem";
import {
  updateSkillShieldBlockPositions,
  updateSkillSystem,
} from "./skillSystem";
import {
  isMapTeleportPoiActive,
  updateTeleportSystem,
} from "./teleportSystem";
import { recordDebugTelemetryTick } from "./debugTelemetry";
import {
  advanceSimulationTick,
  clearExpiredCombatFeedback,
  clearExpiredSkillRuntimeState,
  clearTickMovementPlanning,
  type GameState,
} from "./state";

export function updateGame(state: GameState): GameState {
  let nextState = clearExpiredSkillRuntimeState(
    clearExpiredCombatFeedback(
      clearTickMovementPlanning(advanceSimulationTick(state)),
    ),
  );
  const movedEntityIds = new Set<string>();
  const mapIdBeforeTeleport = nextState.currentMapId;
  const wasTeleportActive = Boolean(nextState.activeTeleport);

  nextState = updateTeleportSystem(nextState, movedEntityIds);

  if (
    wasTeleportActive ||
    nextState.activeTeleport ||
    mapIdBeforeTeleport !== nextState.currentMapId
  ) {
    return recordDebugTelemetryTick(
      state,
      clearExpiredCombatFeedback(nextState),
    );
  }

  const shouldMovePartyTowardPoi =
    nextState.autoModeEnabled || isMapTeleportPoiActive(nextState);

  if (nextState.autoModeEnabled) {
    nextState = updateRoleSystem(nextState);
    nextState = updateSkillSystem(nextState);
  }

  if (shouldMovePartyTowardPoi) {
    nextState = updatePartyFormationSystem(nextState, movedEntityIds);
  }

  if (nextState.autoModeEnabled) {
    nextState = reserveExploringPartyMemberNextTile(nextState);
  }

  nextState = updateDefendSystem(nextState, movedEntityIds);
  if (nextState.autoModeEnabled) {
    nextState = updateExplorationSystem(nextState, movedEntityIds);
  }
  nextState = updateFollowSystem(nextState, movedEntityIds);
  nextState = updateEnemyAISystem(nextState);
  nextState = updateAttackSystem(nextState, movedEntityIds);
  nextState = updateGatherSystem(nextState, movedEntityIds);
  nextState = updateSkillShieldBlockPositions(nextState);

  return recordDebugTelemetryTick(
    state,
    clearExpiredCombatFeedback(nextState),
  );
}
