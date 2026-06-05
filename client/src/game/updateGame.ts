import { updateAttackSystem } from "./attackSystem";
import { createAttackSlotPathDistanceCache } from "./attackSlots";
import {
  clearExpiredHubDepartureFoodWarning,
  clearExpiredConsumableBuffs,
  updateConsumableBehaviorSystem,
  updateConsumableSystem,
  updateFlaskRechargeFromEnemyKills,
} from "./consumables";
import { updateDefendSystem } from "./defendSystem";
import { updateEnemyAISystem } from "./enemyAISystem";
import { updateEnemyAoeChannelSystem } from "./enemyAoeChannelSystem";
import { updateEnemyRespawnSystem } from "./enemyRespawnSystem";
import { updateEntitySeparationSystem } from "./entitySeparationSystem";
import {
  isSlimewardDungeonChestUiOpen,
  updateSlimewardDungeonSystem,
} from "./dungeonSystem";
import { updateDropSystem } from "./dropSystem";
import { updateDirectCompanionCommandSystem } from "./directCompanionCommands";
import {
  reserveExploringPartyMemberNextTile,
  updateExplorationSystem,
} from "./explorationSystem";
import { updateFollowSystem } from "./followSystem";
import { updateGatherSystem } from "./gatherSystem";
import { updateHealingFountainSystem } from "./healingFountainSystem";
import {
  syncPartyDerivedMaxHealth,
  updatePassiveHealthRegen,
  updateTargetDummyHealthRegen,
} from "./healthSystem";
import { updatePartyFormationSystem } from "./partyFormationSystem";
import {
  updatePartyIntentRecoverySystem,
  updatePartyIntentSelfDefenseSystem,
} from "./partyIntentSystem";
import { restoreInterruptedPoiTarget } from "./poiResumeSystem";
import { updatePoiSystem } from "./poiSystem";
import { updateQuestGuideSystem } from "./questGuideSystem";
import { createResourceWorkContext } from "./gathererResourceReservation";
import { updateResurrectionSystem } from "./resurrectionSystem";
import { getPartyMembers } from "./partySystem";
import { updateRoleSystem } from "./roleSystem";
import { updateRoleBonusAssignments } from "./roleBonus";
import {
  updateCombatSkillSystem,
  updateSkillShieldBlockPositions,
  updateSkillSystem,
} from "./skillSystem";
import {
  isMapTeleportPoiActive,
  updateTeleportSystem,
} from "./teleportSystem";
import { recordDebugTelemetryTick } from "./debugTelemetry";
import { debugApplyCompanionInfiniteHealth } from "./debugTools";
import { updateWorldWipeRecovery } from "./worldWipeRecovery";
import {
  advanceSimulationTime,
  clearExpiredCombatFeedback,
  clearExpiredSkillRuntimeState,
  clearFrameMovementPlanning,
  updateEntity,
  type GameState,
} from "./state";
import { getPartyExecutionIntent } from "./partyIntentState";
import {
  createSimulationTiming,
  type SimulationTiming,
} from "./simulationTiming";

export function updateGame(
  state: GameState,
  timingInput?: Partial<SimulationTiming>,
): GameState {
  const timing = getUpdateTiming(state, timingInput);

  if (isSlimewardDungeonChestUiOpen(state)) {
    return recordDebugTelemetryTick(state, state, timing);
  }

  let nextState = clearExpiredSkillRuntimeState(
    clearExpiredCombatFeedback(
      clearFrameMovementPlanning(advanceSimulationTime(state, timing)),
      timing.nowMs,
    ),
    timing.nowMs,
  );
  nextState = clearExpiredConsumableBuffs(nextState, timing.nowMs);
  nextState = clearExpiredHubDepartureFoodWarning(nextState, timing.nowMs);
  nextState = updateRoleBonusAssignments(nextState, timing.nowMs);
  const movedEntityIds = new Set<string>();
  const attackSlotPathDistanceCache = createAttackSlotPathDistanceCache();
  const mapIdBeforeTeleport = nextState.currentMapId;
  const wasTeleportActive = Boolean(nextState.activeTeleport);

  nextState = syncPartyDerivedMaxHealth(nextState);
  nextState = debugApplyCompanionInfiniteHealth(nextState);
  nextState = updateConsumableBehaviorSystem(nextState, timing.nowMs);
  nextState = updateConsumableSystem(nextState, timing.nowMs);
  nextState = syncPartyDerivedMaxHealth(nextState);
  nextState = debugApplyCompanionInfiniteHealth(nextState);

  const mapIdBeforeWipeRecovery = nextState.currentMapId;
  nextState = updateWorldWipeRecovery(nextState, timing.nowMs);

  if (
    nextState.worldWipeRecovery?.status === "pending_choice" ||
    mapIdBeforeWipeRecovery !== nextState.currentMapId
  ) {
    return recordDebugTelemetryTick(
      state,
      clearExpiredCombatFeedback(nextState, timing.nowMs),
      timing,
    );
  }

  nextState = updatePartyIntentRecoverySystem(nextState);

  nextState = updateResurrectionSystem(
    nextState,
    movedEntityIds,
    timing.nowMs,
    timing.deltaMs,
  );

  nextState = updatePartyIntentRecoverySystem(nextState);

  nextState = updateTeleportSystem(nextState, movedEntityIds, timing.nowMs);

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

  nextState = updateDirectCompanionCommandSystem(
    nextState,
    movedEntityIds,
    timing.nowMs,
  );

  let resourceWorkContext = createResourceWorkContext(nextState);

  nextState = updatePoiSystem(nextState, resourceWorkContext);
  nextState = updateHealingFountainSystem(nextState);
  resourceWorkContext = createResourceWorkContext(nextState);

  const shouldMovePartyTowardPoi =
    Boolean(getPartyExecutionIntent(nextState)) ||
    nextState.autoModeEnabled ||
    isMapTeleportPoiActive(nextState);

  if (nextState.autoModeEnabled) {
    nextState = updateRoleSystem(nextState, resourceWorkContext);
    nextState = updateSkillSystem(nextState, timing.nowMs);
  }

  if (shouldMovePartyTowardPoi) {
    nextState = updatePartyFormationSystem(nextState, movedEntityIds);
  }

  if (nextState.autoModeEnabled) {
    nextState = reserveExploringPartyMemberNextTile(nextState);
  }

  nextState = updateDefendSystem(
    nextState,
    movedEntityIds,
    timing,
    attackSlotPathDistanceCache,
  );
  if (nextState.autoModeEnabled) {
    nextState = updateExplorationSystem(nextState, movedEntityIds);
  }
  nextState = updateFollowSystem(nextState, movedEntityIds);
  nextState = updateQuestGuideSystem(nextState, movedEntityIds, timing);
  nextState = updateEnemyAISystem(nextState, timing, movedEntityIds);
  nextState = updateEnemyAoeChannelSystem(nextState, timing.nowMs);
  nextState = updatePartyIntentSelfDefenseSystem(nextState);
  nextState = updateCombatSkillSystem(nextState, timing.nowMs);
  nextState = updateAttackSystem(
    nextState,
    movedEntityIds,
    timing.nowMs,
    attackSlotPathDistanceCache,
  );
  nextState = updateFlaskRechargeFromEnemyKills(nextState, timing.nowMs);
  nextState = restoreInterruptedPoiTarget(nextState);
  nextState = updatePassiveHealthRegen(nextState, timing.nowMs);
  nextState = updateTargetDummyHealthRegen(nextState, timing.nowMs);
  nextState = updateDropSystem(nextState, timing.nowMs);
  nextState = updateSlimewardDungeonSystem(nextState, timing.nowMs);
  nextState = updateEnemyRespawnSystem(nextState, timing.nowMs);
  nextState = updateGatherSystem(
    nextState,
    movedEntityIds,
    timing.nowMs,
  );
  nextState = updateEntitySeparationSystem(nextState, movedEntityIds);
  nextState = updateSkillShieldBlockPositions(nextState);
  nextState = idleAutonomousPartyMembersWithoutPoi(nextState);
  nextState = debugApplyCompanionInfiniteHealth(nextState);

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
  if (getPartyExecutionIntent(state) || state.activeTeleport) {
    return state;
  }

  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    if (
      nextState.resurrectionChannelsByHelperId?.[member.id] ||
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
