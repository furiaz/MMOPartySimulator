import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { autoDepositByRoutingMode } from "./bank";
import {
  completeAutoRouteArrival,
  isAutoRoutePaused,
} from "./autoRouteSystem";
import { getSlimewardDungeonPoiTarget } from "./dungeonSystem";
import { HUB_MAP_ID } from "./debugMap";
import {
  isInteractionPoiTarget,
  isInteractionStandPositionUsable,
  isInteractionTargetReached,
  resolveInteractionStandPosition,
} from "./interactionApproach";
import {
  getPartyLeader,
  getPartyMembers,
  hasDeadPartyMembers,
} from "./partySystem";
import {
  getCommittedPartyThreatTarget,
  getPartyMembersRespondingToActiveThreat,
  isPartyMemberRespondingToActiveThreat,
} from "./partyThreatSystem";
import {
  getEntityById,
  addCombatFeedback,
  updateEntity,
  type GameState,
} from "./state";
import {
  selectAutoCombatPoiTarget,
  selectPoiTarget,
  selectQuestGuidePoiTarget,
} from "./poiTargetSelection";
import {
  getPartyExecutionIntent,
  setPartyExecutionIntent,
  setPartyIntent,
} from "./partyIntentState";
import {
  QUEST_DEFINITIONS,
  QUEST_ORDER,
  completeQuestObjective,
  getActiveQuest,
  getAvailableQuest,
  getFirstIncompleteObjective,
  getIncompleteObjectives,
  getQuestGiverAvailableQuests,
  getQuestGiverReadyQuests,
  hasQuestGiverWork,
  matchesObjectiveSubzoneAtPosition,
  updateQuestGiverInteraction,
} from "./questSystem";
import {
  createGathererResourceReservations,
  getCurrentPartyGatherResourceTargetId,
  type GathererResourceReservations,
  type ResourceWorkContext,
} from "./gathererResourceReservation";
import type { PoiCategory } from "./poiTypes";
import type {
  Enemy,
  GameEntity,
  Position,
  ResourceType,
} from "./types";
import type {
  GlobalPoiIntent,
  LocalPoiTarget,
  QuestObjectiveDefinition,
  QuestId,
} from "./questTypes";

export { getMapType } from "./poiTargetSelection";

const QUEST_GIVER_INTERACTION_RANGE = 4;
const DEFAULT_POI_INTERACTION_RANGE = 3;
const QUEST_MARKER_PROXIMITY_RANGE = 1.5;
const WILD_POI_REEVALUATE_INTERVAL_MS = 4000;
const QUEST_RESOURCE_POI_COMMITMENT_MS = 4000;
const POI_THREAT_PRESERVATION_DISTANCE = 3;

export function updatePoiSystem(
  state: GameState,
  resourceWorkContext?: ResourceWorkContext,
): GameState {
  const markerInteractionState =
    state.activeTeleport || isAutoRoutePaused(state)
      ? state
      : updateReachedQuestMarkerInteractions(state);

  if (
    (!markerInteractionState.autoModeEnabled &&
      !markerInteractionState.worldTravelTargetMapId) ||
    markerInteractionState.activeTeleport ||
    isAutoRoutePaused(markerInteractionState)
  ) {
    return clearPoiSelection(markerInteractionState);
  }

  if (getPartyExecutionIntent(markerInteractionState)?.source === "player") {
    return clearPoiSelection(markerInteractionState);
  }

  if (hasDeadPartyMembers(markerInteractionState)) {
    return clearAiPoiSelectionForResurrection(markerInteractionState);
  }

  const leader = getPartyLeader(markerInteractionState);

  if (!leader || leader.commandPriority === "direct") {
    return clearPoiSelection(markerInteractionState);
  }

  const dungeonPoiTarget = getSlimewardDungeonPoiTarget(markerInteractionState);
  if (markerInteractionState.autoModeEnabled && dungeonPoiTarget) {
    const nextState: GameState = {
      ...markerInteractionState,
      globalPoiIntent: { type: "idle", reason: "Dungeon waypoint route" },
      localPoiTarget: dungeonPoiTarget,
      lastPoiDecision: {
        evaluatedAtMs: markerInteractionState.simulationTimeMs ?? 0,
        selectedPoiId: dungeonPoiTarget.poiId,
        selectedCategory: dungeonPoiTarget.category,
        selectedMapId: dungeonPoiTarget.mapId,
        selectedPosition: dungeonPoiTarget.position,
        selectedReason: dungeonPoiTarget.reason,
        consideredTargets: [],
        skippedReasons: {},
      },
    };

    return applyLocalTargetToPartyIntent(nextState, dungeonPoiTarget);
  }

  const interactionState = clearReachedWorldTravelTarget(
    updateReachedPoiInteractions(markerInteractionState),
  );

  const interactionLeader = getPartyLeader(interactionState);
  const gathererReservations = createGathererResourceReservations(
    interactionState,
    resourceWorkContext,
  );

  if (
    interactionLeader &&
    canReusePoiSelection(interactionState, interactionLeader, gathererReservations)
  ) {
    const localPoiTarget = refreshLocalPoiTarget(
      interactionState,
      interactionState.localPoiTarget,
    );
    return applyLocalTargetToPartyIntent(
      {
        ...interactionState,
        localPoiTarget,
      },
      localPoiTarget,
    );
  }

  if (interactionState.autoModeEnabled && !interactionState.worldTravelTargetMapId) {
    const guideSelection = selectQuestGuidePoiTarget(interactionState);

    if (guideSelection.localTarget) {
      const guideState = {
        ...interactionState,
        globalPoiIntent: { type: "idle" as const, reason: "Auto Combat escort follow" },
        localPoiTarget: guideSelection.localTarget,
        lastPoiDecision: {
          evaluatedAtMs: interactionState.simulationTimeMs ?? 0,
          selectedPoiId: guideSelection.localTarget.poiId,
          selectedCategory: guideSelection.localTarget.category,
          selectedMapId: guideSelection.localTarget.mapId,
          selectedPosition: guideSelection.localTarget.position,
          selectedReason: guideSelection.localTarget.reason,
          consideredTargets: guideSelection.consideredTargets,
          skippedReasons: guideSelection.skippedReasons,
        },
      };

      return applyLocalTargetToPartyIntent(guideState, guideSelection.localTarget);
    }

    const autoCombatSelection = selectAutoCombatPoiTarget(
      interactionState,
      gathererReservations,
    );
    const autoCombatLastPoiDecision = {
      evaluatedAtMs: interactionState.simulationTimeMs ?? 0,
      selectedPoiId: autoCombatSelection.localTarget?.poiId,
      selectedCategory: autoCombatSelection.localTarget?.category,
      selectedMapId: autoCombatSelection.localTarget?.mapId,
      selectedPosition: autoCombatSelection.localTarget?.position,
      selectedReason: autoCombatSelection.localTarget?.reason,
      consideredTargets: autoCombatSelection.consideredTargets,
      skippedReasons: autoCombatSelection.skippedReasons,
    };
    let autoCombatState: GameState = {
      ...interactionState,
      globalPoiIntent: { type: "idle", reason: "Auto Combat local target" },
      localPoiTarget: autoCombatSelection.localTarget,
      lastPoiDecision: autoCombatLastPoiDecision,
    };

    if (autoCombatSelection.localTarget) {
      autoCombatState = recordPoiSelected(
        autoCombatState,
        autoCombatSelection.localTarget,
      );
      autoCombatState = applyLocalTargetToPartyIntent(
        autoCombatState,
        autoCombatSelection.localTarget,
      );
    } else if (
      getPartyExecutionIntent(autoCombatState)?.source !== "player"
    ) {
      autoCombatState = setPartyIntent(autoCombatState, null);
      autoCombatState = {
        ...autoCombatState,
        globalPoiIntent: { type: "idle", reason: "Auto Combat local target" },
        localPoiTarget: null,
        lastPoiDecision: autoCombatLastPoiDecision,
      };
    }

    return recordSkippedPois(
      autoCombatState,
      autoCombatSelection.skippedReasons,
    );
  }

  const globalPoiIntent = getGlobalPoiIntent(interactionState);
  const selection = selectPoiTarget(
    interactionState,
    globalPoiIntent,
    gathererReservations,
  );
  let nextState: GameState = {
    ...interactionState,
    globalPoiIntent,
    localPoiTarget: selection.localTarget,
    lastPoiDecision: {
      evaluatedAtMs: interactionState.simulationTimeMs ?? 0,
      selectedPoiId: selection.localTarget?.poiId,
      selectedCategory: selection.localTarget?.category,
      selectedMapId: selection.localTarget?.mapId,
      selectedPosition: selection.localTarget?.position,
      selectedReason: selection.localTarget?.reason,
      consideredTargets: selection.consideredTargets,
      skippedReasons: selection.skippedReasons,
    },
  };

  if (selection.localTarget) {
    nextState = recordPoiSelected(nextState, selection.localTarget);
    nextState = applyLocalTargetToPartyIntent(nextState, selection.localTarget);
  } else if (
    getPartyExecutionIntent(nextState)?.type === "gather" &&
    getPartyExecutionIntent(nextState)?.source !== "player" &&
    !getCurrentPartyGatherResourceTargetId(nextState)
  ) {
    nextState = setPartyExecutionIntent(nextState, null);
  } else if (globalPoiIntent.type === "idle") {
    nextState = setPartyExecutionIntent(nextState, null);
  }

  return recordSkippedPois(nextState, selection.skippedReasons);
}

function canReusePoiSelection(
  state: GameState,
  leader: GameEntity,
  gathererReservations: GathererResourceReservations,
): state is GameState & { localPoiTarget: LocalPoiTarget } {
  if (!state.localPoiTarget) {
    return false;
  }

  if (state.currentMapId === HUB_MAP_ID) {
    return canReuseHubInteractionPoiSelection(state, state.localPoiTarget, leader);
  }

  const evaluatedAtMs = state.lastPoiDecision?.evaluatedAtMs;
  const nowMs = state.simulationTimeMs ?? 0;

  if (evaluatedAtMs === undefined) {
    return false;
  }

  if (!isLocalPoiTargetStillValid(state, state.localPoiTarget)) {
    return false;
  }

  if (!isQuestLinkedPoiStillRelevant(state, state.localPoiTarget)) {
    return false;
  }

  if (
    isQuestResourcePoi(state.localPoiTarget) &&
    !isActiveQuestResourcePoiStillRelevant(state, state.localPoiTarget)
  ) {
    return false;
  }

  if (
    nowMs - evaluatedAtMs >=
    getWildPoiReevaluateIntervalMs(state, state.localPoiTarget)
  ) {
    return false;
  }

  if (
    isReservedGathererResourcePoi(
      state,
      state.localPoiTarget,
      gathererReservations,
    )
  ) {
    return false;
  }

  if (
    state.localPoiTarget.category === "combat" ||
    state.localPoiTarget.category === "resource"
  ) {
    return true;
  }

  return (
    getDistance(leader.position, state.localPoiTarget.position) >
    getLocalTargetInteractionRange(state.localPoiTarget)
  );
}

function canReuseHubInteractionPoiSelection(
  state: GameState,
  target: LocalPoiTarget,
  leader: GameEntity,
): boolean {
  return (
    isInteractionPoiTarget(target) &&
    isLocalPoiTargetStillValid(state, target) &&
    isQuestLinkedPoiStillRelevant(state, target) &&
    !isInteractionTargetReached(state, leader, target)
  );
}

function isLocalPoiTargetStillValid(
  state: GameState,
  target: LocalPoiTarget,
): boolean {
  if (target.mapId !== state.currentMapId) {
    return false;
  }

  if (!target.targetEntityId) {
    return true;
  }

  const entity = state.entities[target.targetEntityId];

  if (!entity) {
    return false;
  }

  if (target.category === "combat") {
    return entity.kind === "enemy" && entity.state !== "dead";
  }

  if (target.category === "resource") {
    return entity.kind === "resource" && !entity.isDepleted && entity.quantity > 0;
  }

  return true;
}

function refreshLocalPoiTarget(
  state: GameState,
  target: LocalPoiTarget,
): LocalPoiTarget {
  if (!target.targetEntityId) {
    return target;
  }

  const entity = state.entities[target.targetEntityId];

  return entity
    ? {
        ...target,
        position: entity.position,
      }
    : target;
}

function isReservedGathererResourcePoi(
  state: GameState,
  target: LocalPoiTarget,
  gathererReservations: GathererResourceReservations,
): boolean {
  if (target.targetEntityId === getCurrentPartyGatherResourceTargetId(state)) {
    return false;
  }

  return (
    target.category === "resource" &&
    Boolean(
      target.targetEntityId &&
        gathererReservations.resourceIds.has(target.targetEntityId),
    )
  );
}

function getWildPoiReevaluateIntervalMs(
  state: GameState,
  target: LocalPoiTarget,
): number {
  return isActiveQuestResourcePoiStillRelevant(state, target)
    ? QUEST_RESOURCE_POI_COMMITMENT_MS
    : WILD_POI_REEVALUATE_INTERVAL_MS;
}

function isQuestResourcePoi(target: LocalPoiTarget): boolean {
  return (
    target.category === "resource" &&
    Boolean(target.questId && target.objectiveId)
  );
}

function isQuestLinkedPoiStillRelevant(
  state: GameState,
  target: LocalPoiTarget,
): boolean {
  if (!target.questId || !target.objectiveId) {
    return true;
  }

  const activeQuest = getActiveQuest(state);

  if (
    activeQuest?.questId !== target.questId ||
    activeQuest.status !== "active"
  ) {
    return false;
  }

  return getIncompleteObjectives(state, target.questId).some(
    (objective) => objective.id === target.objectiveId,
  );
}

function isActiveQuestResourcePoiStillRelevant(
  state: GameState,
  target: LocalPoiTarget,
): boolean {
  if (!isQuestResourcePoi(target) || !target.questId || !target.objectiveId) {
    return false;
  }

  const activeQuest = getActiveQuest(state);

  if (!activeQuest || activeQuest.questId !== target.questId) {
    return false;
  }

  const objective = getIncompleteObjectives(state, target.questId).find(
    (incompleteObjective) => incompleteObjective.id === target.objectiveId,
  );

  if (
    !objective ||
    objective.id !== target.objectiveId ||
    objective.type !== "gather_item_count"
  ) {
    return false;
  }

  return (
    getResourceTypeFromLocalTarget(state, target) === objective.resourceType &&
    matchesObjectiveSubzoneAtPosition(state, objective, target.position)
  );
}

function clearReachedWorldTravelTarget(state: GameState): GameState {
  if (
    !state.worldTravelTargetMapId ||
    state.worldTravelTargetMapId !== state.currentMapId
  ) {
    return state;
  }

  return completeAutoRouteArrival(state);
}

function updateReachedPoiInteractions(state: GameState): GameState {
  const nextState = updateReachedQuestInspectInteraction(state);

  if (nextState.currentMapId !== HUB_MAP_ID) {
    return nextState;
  }

  const leader = getPartyLeader(nextState);
  const questSource = Object.values(nextState.entities).find(
    (entity) =>
      entity.kind === "npc" &&
      (entity.npcRole === "quest_giver" || entity.npcRole === "class_mentor") &&
      getQuestSourceHasWork(nextState, entity.id),
  );

  if (
    !leader ||
    !questSource ||
    !isReachedHubInteraction(
      nextState,
      leader,
      questSource,
      QUEST_GIVER_INTERACTION_RANGE,
    ) ||
    !hasQuestGiverWork(nextState)
  ) {
    return nextState;
  }

  return applyAutoDepositFeedback(
    updateQuestGiverInteraction(nextState, questSource.id),
  );
}

function isReachedHubInteraction(
  state: GameState,
  leader: GameEntity,
  targetEntity: GameEntity,
  fallbackRange: number,
): boolean {
  const localTarget = state.localPoiTarget;

  if (
    localTarget?.targetEntityId === targetEntity.id &&
    isInteractionTargetReached(state, leader, localTarget)
  ) {
    return true;
  }

  return getDistance(leader.position, targetEntity.position) <= fallbackRange;
}

function getQuestSourceHasWork(state: GameState, questGiverPoiId: string): boolean {
  return (
    getQuestGiverReadyQuests(state, questGiverPoiId).length > 0 ||
    getQuestGiverAvailableQuests(state, questGiverPoiId).length > 0
  );
}

function updateReachedQuestInspectInteraction(state: GameState): GameState {
  const leader = getPartyLeader(state);
  const target = state.localPoiTarget;

  if (
    !leader ||
    !target?.questId ||
    !target.objectiveId ||
    target.mapId !== state.currentMapId ||
    getDistance(leader.position, target.position) > getLocalTargetInteractionRange(target)
  ) {
    return state;
  }

  const objective = getQuestObjective(target.questId, target.objectiveId);

  if (
    !objective ||
    (objective.type !== "inspect_poi" && objective.type !== "reach_poi") ||
    !objective.targetPoiId
  ) {
    return state;
  }

  return completeQuestObjective(state, target.questId, target.objectiveId);
}

function updateReachedQuestMarkerInteractions(state: GameState): GameState {
  if (!state.currentMapId) {
    return state;
  }

  let nextState = state;

  for (const questId of QUEST_ORDER) {
    if (nextState.quests[questId]?.status !== "active") {
      continue;
    }

    for (const objective of getTargetableQuestMarkerObjectives(nextState, questId)) {
      if (
        nextState.quests[questId]?.status !== "active" ||
        nextState.quests[questId].objectiveProgress[objective.id]?.completed ||
        !isQuestMarkerProximityObjective(objective) ||
        objective.targetMapId !== nextState.currentMapId ||
        !isAnyPartyMemberWithinQuestMarkerRange(nextState, objective.targetPosition)
      ) {
        continue;
      }

      nextState = completeQuestObjective(nextState, questId, objective.id);
    }
  }

  return nextState;
}

function getTargetableQuestMarkerObjectives(
  state: GameState,
  questId: QuestId,
): QuestObjectiveDefinition[] {
  const incompleteObjectives = getIncompleteObjectives(state, questId);

  return QUEST_DEFINITIONS[questId].objectiveFlow === "sequential"
    ? incompleteObjectives.slice(0, 1)
    : incompleteObjectives;
}

function isQuestMarkerProximityObjective(
  objective: QuestObjectiveDefinition,
): objective is QuestObjectiveDefinition & {
  targetPoiId: string;
  targetPosition: Position;
} {
  return (
    (objective.type === "inspect_poi" || objective.type === "reach_poi") &&
    Boolean(objective.targetPoiId) &&
    Boolean(objective.targetPosition)
  );
}

function isAnyPartyMemberWithinQuestMarkerRange(
  state: GameState,
  position: Position,
): boolean {
  return getPartyMembers(state).some(
    (member) =>
      member.state !== "dead" &&
      getDistance(member.position, position) <= QUEST_MARKER_PROXIMITY_RANGE,
  );
}

function getGlobalPoiIntent(state: GameState): GlobalPoiIntent {
  if (
    state.worldTravelTargetMapId &&
    state.worldTravelTargetMapId !== state.currentMapId
  ) {
    return {
      type: "travel_to_map",
      targetMapId: state.worldTravelTargetMapId,
      reason: `world route toward ${state.worldTravelTargetMapId}`,
    };
  }

  const activeQuest = getActiveQuest(state);

  if (activeQuest) {
    const objective = getFirstIncompleteObjective(state, activeQuest.questId);

    return {
      type: "complete_current_quest",
      questId: activeQuest.questId,
      objectiveId: objective?.id,
      reason:
        activeQuest.status === "ready_to_turn_in"
          ? "quest ready to turn in"
          : "active quest objective",
    };
  }

  const availableQuest = getAvailableQuest(state);

  if (availableQuest) {
    return {
      type: "get_new_quest",
      questId: availableQuest.questId,
      reason: "new quest available",
    };
  }

  return {
    type: "idle",
    reason: "no active or available quest",
  };
}

function getQuestObjective(
  questId: QuestId,
  objectiveId: string,
): QuestObjectiveDefinition | null {
  return (
    QUEST_DEFINITIONS[questId].objectives.find(
      (objective) => objective.id === objectiveId,
    ) ?? null
  );
}

function applyLocalTargetToPartyIntent(
  state: GameState,
  localTarget: LocalPoiTarget,
): GameState {
  const leader = getPartyLeader(state);
  const activeThreatTarget = getPreservedPartyThreatTarget(state, localTarget);

  if (activeThreatTarget) {
    return applyActivePartyThreatToPartyIntent(state, activeThreatTarget);
  }

  const targetEntity = localTarget.targetEntityId
    ? getEntityById(state, localTarget.targetEntityId)
    : undefined;
  const baseTargetPosition = targetEntity?.position ?? localTarget.position;
  const movementTarget = leader
    ? getLocalTargetMovementTarget(
        state,
        leader,
        localTarget,
        baseTargetPosition,
      )
    : { localTarget, position: baseTargetPosition };
  const resolvedLocalTarget = movementTarget.localTarget;
  const executionIntent = {
    type: getPoiExecutionIntentType(resolvedLocalTarget.category),
    targetId:
      resolvedLocalTarget.category === "combat" ||
      resolvedLocalTarget.category === "resource"
        ? resolvedLocalTarget.targetEntityId ?? null
        : null,
    targetPosition: movementTarget.position,
    source: "ai" as const,
  };
  const nextState = setPartyIntent(state, {
    mode: executionIntent.type === "attack" ? "engage" : "travel",
    source: "ai",
    executionIntent,
    globalPoiIntent: state.globalPoiIntent,
    localPoiTarget: resolvedLocalTarget,
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    lastPoiDecision: state.lastPoiDecision,
    queuedIntent: state.partyIntent?.queuedIntent ?? null,
    recoveryIntent: state.partyIntent?.recoveryIntent ?? null,
  });

  if (!leader) {
    return nextState;
  }

  const currentLeader = getEntityById(nextState, leader.id);

  if (currentLeader?.kind !== "companion") {
    return nextState;
  }

  if (isPartyMemberRespondingToActiveThreat(nextState, currentLeader)) {
    return nextState;
  }

  return updateEntity(nextState, {
    ...currentLeader,
    state: resolvedLocalTarget.category === "combat" ? "attack" : "follow",
    currentTargetId:
      resolvedLocalTarget.category === "combat"
        ? resolvedLocalTarget.targetEntityId ?? null
        : null,
    commandPriority: "autonomous",
  });
}

function applyAutoDepositFeedback(state: GameState): GameState {
  const leader = getPartyLeader(state);
  const deposit = autoDepositByRoutingMode(state);

  if (!leader || deposit.state === state || hasRecentBankFeedback(deposit.state)) {
    return deposit.state;
  }

  if (
    deposit.movedQuantity <= 0 &&
    deposit.message !== "Bank is full!"
  ) {
    return deposit.state;
  }

  return addCombatFeedback(deposit.state, {
    type: "gather",
    entityId: leader.id,
    feedbackKind: "bank_auto_deposit",
    text: deposit.message,
    now: deposit.state.simulationTimeMs ?? Date.now(),
    durationMs: 1800,
  });
}

function hasRecentBankFeedback(state: GameState): boolean {
  const nowMs = state.simulationTimeMs ?? Date.now();

  return state.combatFeedbackEvents.some(
    (event) =>
      event.feedbackKind === "bank_auto_deposit" && event.expiresAt > nowMs,
  );
}

function getPreservedPartyThreatTarget(
  state: GameState,
  localTarget: LocalPoiTarget,
): Enemy | null {
  if (!shouldPreserveActiveThreatForPoi(state, localTarget)) {
    return null;
  }

  const currentTarget = getCurrentExecutionEnemyTarget(state);

  if (currentTarget) {
    return getCommittedPartyThreatTarget(state, {
      currentTarget,
      range: POI_THREAT_PRESERVATION_DISTANCE,
    });
  }

  const respondingTarget = getRespondingPartyThreatTarget(state);

  if (respondingTarget) {
    return getCommittedPartyThreatTarget(state, {
      currentTarget: respondingTarget,
      range: POI_THREAT_PRESERVATION_DISTANCE,
    });
  }

  if (localTarget.category === "resource") {
    return null;
  }

  return getCommittedPartyThreatTarget(state, {
    range: POI_THREAT_PRESERVATION_DISTANCE,
  });
}

function shouldPreserveActiveThreatForPoi(
  state: GameState,
  localTarget: LocalPoiTarget,
): boolean {
  if (localTarget.category === "resource") {
    return true;
  }

  if (!localTarget.questId || !localTarget.objectiveId) {
    return false;
  }

  const activeQuest = getActiveQuest(state);

  if (
    activeQuest?.questId !== localTarget.questId ||
    activeQuest.status !== "active"
  ) {
    return false;
  }

  const objective = getQuestObjective(localTarget.questId, localTarget.objectiveId);

  return objective?.type === "repair_poi" || objective?.type === "defend_area";
}

function getCurrentExecutionEnemyTarget(state: GameState): Enemy | null {
  const executionIntent = getPartyExecutionIntent(state);
  const target = executionIntent?.targetId
    ? getEntityById(state, executionIntent.targetId)
    : undefined;

  return target?.kind === "enemy" && target.state !== "dead" && target.health > 0
    ? target
    : null;
}

function getRespondingPartyThreatTarget(state: GameState): Enemy | null {
  const responder = getPartyMembersRespondingToActiveThreat(state)[0];
  const target = responder?.currentTargetId
    ? getEntityById(state, responder.currentTargetId)
    : undefined;

  return target?.kind === "enemy" && target.state !== "dead" && target.health > 0
    ? target
    : null;
}

function getLocalTargetMovementTarget(
  state: GameState,
  leader: GameEntity,
  localTarget: LocalPoiTarget,
  targetPosition: Position,
): { localTarget: LocalPoiTarget; position: Position } {
  const interactionRange = localTarget.interactionRange;

  if (!isInteractionPoiTarget(localTarget) || interactionRange === undefined) {
    return { localTarget, position: targetPosition };
  }

  if (
    localTarget.interactionStandActorId === leader.id &&
    localTarget.interactionStandPosition &&
    localTarget.interactionStandTargetPosition &&
    arePositionsEqual(localTarget.interactionStandTargetPosition, targetPosition) &&
    isInteractionStandPositionUsable(
      state,
      leader,
      targetPosition,
      localTarget.interactionStandPosition,
      interactionRange,
    )
  ) {
    return {
      localTarget,
      position: localTarget.interactionStandPosition,
    };
  }

  const interactionStandPosition = resolveInteractionStandPosition(
    state,
    leader,
    targetPosition,
    interactionRange,
  );

  if (!interactionStandPosition) {
    return { localTarget, position: targetPosition };
  }

  const resolvedLocalTarget = {
    ...localTarget,
    interactionStandActorId: leader.id,
    interactionStandPosition,
    interactionStandTargetPosition: targetPosition,
  };

  return {
    localTarget: resolvedLocalTarget,
    position: interactionStandPosition,
  };
}

function applyActivePartyThreatToPartyIntent(
  state: GameState,
  activeThreatTarget: Enemy,
): GameState {
  const executionIntent = {
    type: "attack",
    targetId: activeThreatTarget.id,
    targetPosition: activeThreatTarget.position,
    source: "ai",
  } as const;
  const nextState = setPartyIntent(state, {
    mode: "engage",
    source: "ai",
    executionIntent,
    globalPoiIntent: state.globalPoiIntent,
    localPoiTarget: state.localPoiTarget,
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    lastPoiDecision: state.lastPoiDecision,
    queuedIntent: state.partyIntent?.queuedIntent ?? null,
    recoveryIntent: state.partyIntent?.recoveryIntent ?? null,
  });
  const leader = getPartyLeader(nextState);

  if (!leader || isPartyMemberRespondingToActiveThreat(nextState, leader)) {
    return nextState;
  }

  const currentLeader = getEntityById(nextState, leader.id);

  if (currentLeader?.kind !== "companion") {
    return nextState;
  }

  return updateEntity(nextState, {
    ...currentLeader,
    state: "attack",
    currentTargetId: activeThreatTarget.id,
    commandPriority: "autonomous",
  });
}

function getPoiExecutionIntentType(
  category: PoiCategory,
): "attack" | "move" | "gather" | "explore" {
  if (category === "combat") {
    return "attack";
  }

  if (category === "resource") {
    return "gather";
  }

  if (category === "exploration") {
    return "explore";
  }

  return "move";
}

function getLocalTargetInteractionRange(target: LocalPoiTarget): number {
  return target.interactionRange ?? DEFAULT_POI_INTERACTION_RANGE;
}

function getResourceTypeFromLocalTarget(
  state: GameState,
  target: LocalPoiTarget,
): ResourceType | null {
  const entity = target.targetEntityId
    ? state.entities[target.targetEntityId]
    : undefined;

  if (!entity || entity.kind !== "resource") {
    return null;
  }

  return entity.resourceType;
}

function recordPoiSelected(
  state: GameState,
  localTarget: LocalPoiTarget,
): GameState {
  if (state.localPoiTarget?.poiId === localTarget.poiId) {
    return state;
  }

  let nextState = appendDebugTelemetryEvent(state, {
    type: "poi_selected",
    entityId: "party",
    localPoiId: localTarget.poiId,
    poiCategory: localTarget.category,
    poiMapId: localTarget.mapId,
    poiPosition: localTarget.position,
    poiPriorityReason: localTarget.reason,
    questId: localTarget.questId,
    objectiveId: localTarget.objectiveId,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
  });

  if (localTarget.category === "teleport" && localTarget.questId) {
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "quest_intent_teleport",
      entityId: "party",
      localPoiId: localTarget.poiId,
      poiCategory: localTarget.category,
      poiMapId: localTarget.mapId,
      poiPosition: localTarget.position,
      poiPriorityReason: localTarget.reason,
      questId: localTarget.questId,
      objectiveId: localTarget.objectiveId,
      currentMapId: state.currentMapId,
      currentMapDisplayName: state.map?.displayName,
      currentMapDebugName: state.map?.debugName,
    });
  }

  return nextState;
}

function recordSkippedPois(
  state: GameState,
  skippedReasons: Record<string, string>,
): GameState {
  let nextState = state;

  for (const [poiId, reason] of Object.entries(skippedReasons)) {
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "poi_skipped",
      entityId: "party",
      localPoiId: poiId,
      poiSkipReason: reason,
      currentMapId: nextState.currentMapId,
      currentMapDisplayName: nextState.map?.displayName,
      currentMapDebugName: nextState.map?.debugName,
    });
  }

  return nextState;
}

function clearPoiSelection(state: GameState): GameState {
  if (
    !state.globalPoiIntent &&
    !state.localPoiTarget &&
    !state.lastPoiDecision &&
    !state.partyIntent?.globalPoiIntent &&
    !state.partyIntent?.localPoiTarget &&
    !state.partyIntent?.lastPoiDecision
  ) {
    return state;
  }

  return {
    ...state,
    partyIntent: state.partyIntent
      ? {
          ...state.partyIntent,
          globalPoiIntent: null,
          localPoiTarget: null,
          lastPoiDecision: undefined,
        }
      : null,
    globalPoiIntent: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
  };
}

function clearAiPoiSelectionForResurrection(state: GameState): GameState {
  const clearedState = clearPoiSelection(state);

  if (clearedState.leaderIntent?.source === "player") {
    return clearedState;
  }

  return setPartyExecutionIntent(clearedState, null);
}

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function arePositionsEqual(first: Position, second: Position): boolean {
  return first.x === second.x && first.y === second.y;
}
