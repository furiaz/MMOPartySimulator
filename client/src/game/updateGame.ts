import { updateAttackSystem } from "./attackSystem";
import { createAttackSlotPathDistanceCache } from "./attackSlots";
import { updateAutoRouteRuntime } from "./autoRouteSystem";
import { updateCompanionAoeChannelSystem } from "./companionAoeChannelSystem";
import { updateCombatProjectileSystem } from "./combatProjectileSystem";
import {
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
  updateAzureMassFleeBehavior,
  updateSlimewardDungeonSystem,
} from "./dungeonSystem";
import { updateDropSystem } from "./dropSystem";
import { updateDirectCompanionCommandSystem } from "./directCompanionCommands";
import { updateFollowSystem } from "./followSystem";
import { updateGatherSystem } from "./gatherSystem";
import { updateResourceRespawnSystem } from "./resourceRespawnSystem";
import { updateHealingFountainSystem } from "./healingFountainSystem";
import { updateNewsBroadcasts } from "./newsBroadcast";
import { settleFarmState } from "./farm";
import { settleLivestockState } from "./livestock";
import { processInnKitchenAutoCook } from "./innKitchen";
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
import {
  getPartyMembers,
  isPartyMemberBusyGatheringResource,
} from "./partySystem";
import { updateRoleSystem } from "./roleSystem";
import { updateRoleBonusAssignments } from "./roleBonus";
import {
  updateCombatSkillSystem,
  updateSkillShieldBlockPositions,
  updateSkillSystem,
} from "./skillSystem";
import { updateStatusEffects } from "./statusEffects";
import { updateRuneSkillRuntime } from "./skillRuntime";
import { updateMartialPassiveRuntime } from "./martialPassives";
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
import { clearExpiredAutonomousTargetSuppressions } from "./partyTargetSystem";
import {
  createSimulationTiming,
  type SimulationTiming,
} from "./simulationTiming";
import { recordCurrentWorldDiscovery } from "./worldDiscovery";

export function updateGame(
  state: GameState,
  timingInput?: Partial<SimulationTiming>,
): GameState {
  const timing = getUpdateTiming(state, timingInput);

  if (isSlimewardDungeonChestUiOpen(state)) {
    return recordDebugTelemetryTick(state, state, timing);
  }

  let nextState = clearExpiredCombatFeedback(
    clearFrameMovementPlanning(advanceSimulationTime(state, timing)),
    timing.nowMs,
  );
  nextState = updateAutoRouteRuntime(nextState);
  nextState = updateNewsBroadcasts(nextState, timing.nowMs);
  nextState = clearExpiredAutonomousTargetSuppressions(nextState);
  nextState = updateStatusEffects(nextState, timing.nowMs);
  nextState = updateRuneSkillRuntime(nextState, timing.nowMs);
  nextState = clearExpiredSkillRuntimeState(nextState, timing.nowMs);
  nextState = updateMartialPassiveRuntime(nextState, timing.nowMs);
  nextState = clearExpiredConsumableBuffs(nextState, timing.nowMs);
  nextState = updateRoleBonusAssignments(nextState, timing.nowMs);
  const movedEntityIds = new Set<string>();
  const attackSlotPathDistanceCache = createAttackSlotPathDistanceCache();
  const mapIdBeforeTeleport = nextState.currentMapId;
  const wasTeleportActive = Boolean(nextState.activeTeleport);

  nextState = syncPartyDerivedMaxHealth(nextState);
  nextState = debugApplyCompanionInfiniteHealth(nextState);
  nextState = updateConsumableBehaviorSystem(nextState, timing.nowMs);
  nextState = updateConsumableSystem(nextState, timing.nowMs);
  nextState = settleFarmState(nextState, timing.nowMs);
  nextState = settleLivestockState(nextState, timing.nowMs);
  nextState = processInnKitchenAutoCook(nextState, timing.nowMs).state;
  nextState = syncPartyDerivedMaxHealth(nextState);
  nextState = debugApplyCompanionInfiniteHealth(nextState);

  const mapIdBeforeWipeRecovery = nextState.currentMapId;
  nextState = updateWorldWipeRecovery(nextState, timing.nowMs);
  nextState = updateMartialPassiveRuntime(
    nextState,
    timing.nowMs,
    movedEntityIds,
  );

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
  nextState = updateMartialPassiveRuntime(
    nextState,
    timing.nowMs,
    movedEntityIds,
  );

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

  nextState = updateDefendSystem(
    nextState,
    movedEntityIds,
    timing,
    attackSlotPathDistanceCache,
  );
  nextState = updateFollowSystem(nextState, movedEntityIds);
  nextState = updateQuestGuideSystem(nextState, movedEntityIds, timing);
  nextState = updateEnemyAISystem(nextState, timing, movedEntityIds);
  nextState = updateAzureMassFleeBehavior(nextState, timing, movedEntityIds);
  nextState = updateMartialPassiveRuntime(
    nextState,
    timing.nowMs,
    movedEntityIds,
  );
  nextState = updateEnemyAoeChannelSystem(nextState, timing.nowMs);
  nextState = updateCompanionAoeChannelSystem(nextState, timing.nowMs);
  nextState = updatePartyIntentSelfDefenseSystem(nextState);
  nextState = updateCombatSkillSystem(nextState, timing.nowMs);
  nextState = updateMartialPassiveRuntime(
    nextState,
    timing.nowMs,
    movedEntityIds,
  );
  nextState = updateAttackSystem(
    nextState,
    movedEntityIds,
    timing.nowMs,
    attackSlotPathDistanceCache,
  );
  nextState = updateCombatProjectileSystem(
    nextState,
    timing.nowMs,
    timing.deltaMs,
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
  nextState = updateResourceRespawnSystem(nextState, timing.nowMs);
  nextState = updateEntitySeparationSystem(nextState, movedEntityIds);
  nextState = updateMartialPassiveRuntime(
    nextState,
    timing.nowMs,
    movedEntityIds,
  );
  nextState = updateSkillShieldBlockPositions(nextState);
  nextState = idleAutonomousPartyMembersWithoutPoi(nextState);
  nextState = debugApplyCompanionInfiniteHealth(nextState);

  nextState = recordCurrentWorldDiscovery(nextState);

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
      member.state === "dead" ||
      isPartyMemberBusyGatheringResource(nextState, member) ||
      (member.role === "gatherer" &&
        (member.state === "attack" || member.state === "follow"))
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
