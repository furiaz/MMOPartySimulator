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
  advanceSimulationTime,
  clearExpiredCombatFeedback,
  clearExpiredSkillRuntimeState,
  clearFrameMovementPlanning,
  updateEntity,
  type GameState,
} from "./state";
import {
  createSimulationTiming,
  type SimulationTiming,
} from "./simulationTiming";

export function updateGame(
  state: GameState,
  timingInput?: Partial<SimulationTiming>,
): GameState {
  const timing = getUpdateTiming(state, timingInput);
  let nextState = clearExpiredSkillRuntimeState(
    clearExpiredCombatFeedback(
      clearFrameMovementPlanning(advanceSimulationTime(state, timing)),
      timing.nowMs,
    ),
    timing.nowMs,
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
      clearExpiredCombatFeedback(nextState, timing.nowMs),
      timing,
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
    nextState = updateSkillSystem(nextState, timing.nowMs);
  }

  if (shouldMovePartyTowardPoi) {
    nextState = updatePartyFormationSystem(nextState, movedEntityIds);
  }

  if (nextState.autoModeEnabled) {
    nextState = reserveExploringPartyMemberNextTile(nextState);
  }

  nextState = updateDefendSystem(nextState, movedEntityIds, timing);
  if (nextState.autoModeEnabled) {
    nextState = updateExplorationSystem(nextState, movedEntityIds);
  }
  nextState = updateFollowSystem(nextState, movedEntityIds);
  nextState = updateEnemyAISystem(nextState, timing);
  nextState = updateAttackSystem(nextState, movedEntityIds, timing.nowMs);
  nextState = updateDropSystem(nextState, timing.nowMs);
  nextState = updateGatherSystem(nextState, movedEntityIds, timing.nowMs);
  nextState = updateSkillShieldBlockPositions(nextState);
  nextState = idleAutonomousPartyMembersWithoutPoi(nextState);

  return recordDebugTelemetryTick(
    state,
    clearExpiredCombatFeedback(nextState, timing.nowMs),
    timing,
  );
}

function getUpdateTiming(
  state: GameState,
  timingInput: Partial<SimulationTiming> = {},
): SimulationTiming {
  const nowMs = timingInput.nowMs ?? Date.now();
  const deltaMs =
    timingInput.deltaMs ??
    (state.simulationDeltaMs && state.simulationDeltaMs > 0
      ? state.simulationDeltaMs
      : undefined);
  const frameNumber =
    timingInput.frameNumber ?? (state.simulationFrame ?? state.simulationTick ?? 0) + 1;

  return createSimulationTiming(nowMs, deltaMs, frameNumber);
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
