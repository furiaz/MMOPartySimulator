import { updateAttackSystem } from "./attackSystem";
import { updateDefendSystem } from "./defendSystem";
import { updateEnemyAISystem } from "./enemyAISystem";
import { updateDropSystem } from "./dropSystem";
import {
  reserveExploringPartyMemberNextTile,
  updateExplorationSystem,
} from "./explorationSystem";
import { updateFollowSystem } from "./followSystem";
import { updateGatherSystem } from "./gatherSystem";
import { updateHealingFountainSystem } from "./healingFountainSystem";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import { updatePoiSystem } from "./poiSystem";
import { getPartyMembers } from "./partySystem";
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
  updateEntity,
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

  nextState = updatePoiSystem(nextState);
  nextState = updateHealingFountainSystem(nextState);

  const shouldMovePartyTowardPoi =
    Boolean(nextState.leaderIntent) ||
    nextState.autoModeEnabled ||
    isMapTeleportPoiActive(nextState);

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
  nextState = updateDropSystem(nextState);
  nextState = updateGatherSystem(nextState, movedEntityIds);
  nextState = updateSkillShieldBlockPositions(nextState);
  nextState = idleAutonomousPartyMembersWithoutPoi(nextState);

  return recordDebugTelemetryTick(
    state,
    clearExpiredCombatFeedback(nextState),
  );
}

function idleAutonomousPartyMembersWithoutPoi(state: GameState): GameState {
  if (state.leaderIntent || state.activeTeleport) {
    return state;
  }

  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    if (
      member.commandPriority === "direct" ||
      member.state === "idle" ||
      member.state === "dead"
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: "idle",
      currentTargetId: null,
      defendPosition: null,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}
