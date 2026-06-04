import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getSlimewardDungeonPoiTarget } from "./dungeonSystem";
import { HUB_MAP_ID } from "./debugMap";
import { getQuickExchangeItems, quickExchangeParts } from "./merchant";
import { resolveInteractionStandPosition } from "./interactionApproach";
import {
  getPartyLeader,
  hasDeadPartyMembers,
} from "./partySystem";
import {
  getPartyMembersRespondingToActiveThreat,
  isPartyMemberRespondingToActiveThreat,
} from "./partyThreatSystem";
import {
  getEntityById,
  updateEntity,
  type GameState,
} from "./state";
import { selectPoiTarget } from "./poiTargetSelection";
import {
  getPartyExecutionIntent,
  setPartyExecutionIntent,
  setPartyIntent,
  setWorldTravelTargetMapId,
} from "./partyIntentState";
import {
  QUEST_DEFINITIONS,
  getActiveQuest,
  getAvailableQuest,
  getFirstIncompleteObjective,
  getIncompleteObjectives,
  hasQuestGiverWork,
  isMerchantUnlockedForQuests,
  matchesObjectiveSubzoneAtPosition,
  recordMerchantLockedForQuest,
  recordQuestPoiReachedForQuests,
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

const QUEST_GIVER_INTERACTION_RANGE = 2;
const DEFAULT_POI_INTERACTION_RANGE = 1.5;
const WILD_POI_REEVALUATE_INTERVAL_MS = 4000;
const QUEST_RESOURCE_POI_COMMITMENT_MS = 4000;

export function updatePoiSystem(
  state: GameState,
  resourceWorkContext?: ResourceWorkContext,
): GameState {
  if (!state.autoModeEnabled || state.activeTeleport) {
    return clearPoiSelection(state);
  }

  if (getPartyExecutionIntent(state)?.source === "player") {
    return clearPoiSelection(state);
  }

  if (hasDeadPartyMembers(state)) {
    return clearAiPoiSelectionForResurrection(state);
  }

  const leader = getPartyLeader(state);

  if (!leader || leader.commandPriority === "direct") {
    return clearPoiSelection(state);
  }

  const dungeonPoiTarget = getSlimewardDungeonPoiTarget(state);
  if (dungeonPoiTarget) {
    const nextState: GameState = {
      ...state,
      globalPoiIntent: { type: "idle", reason: "Dungeon waypoint route" },
      localPoiTarget: dungeonPoiTarget,
      lastPoiDecision: {
        evaluatedAtMs: state.simulationTimeMs ?? 0,
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

  const gathererReservations = createGathererResourceReservations(
    state,
    resourceWorkContext,
  );

  if (canReuseWildPoiSelection(state, leader, gathererReservations)) {
    const localPoiTarget = refreshLocalPoiTarget(state, state.localPoiTarget);
    return applyLocalTargetToPartyIntent(
      {
        ...state,
        localPoiTarget,
      },
      localPoiTarget,
    );
  }

  let interactionState = clearReachedWorldTravelTarget(
    updateReachedPoiInteractions(state),
  );
  interactionState = recordLockedMerchantPoiIfNeeded(interactionState);
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

function canReuseWildPoiSelection(
  state: GameState,
  leader: { position: Position },
  gathererReservations: GathererResourceReservations,
): state is GameState & { localPoiTarget: LocalPoiTarget } {
  if (state.currentMapId === HUB_MAP_ID || !state.localPoiTarget) {
    return false;
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

  return setWorldTravelTargetMapId(state, null);
}

function updateReachedPoiInteractions(state: GameState): GameState {
  const nextState = updateReachedQuestInspectInteraction(state);

  if (nextState.currentMapId !== HUB_MAP_ID) {
    return nextState;
  }

  const leader = getPartyLeader(nextState);
  const merchant = Object.values(nextState.entities).find(
    (entity) => entity.kind === "npc" && entity.npcRole === "merchant",
  );

  if (
    leader &&
    merchant &&
    getDistance(leader.position, merchant.position) <= DEFAULT_POI_INTERACTION_RANGE &&
    getQuickExchangeItems(nextState).length > 0
  ) {
    return quickExchangeParts(nextState, merchant.id).state;
  }

  const questGiver = Object.values(nextState.entities).find(
    (entity) => entity.kind === "npc" && entity.npcRole === "quest_giver",
  );

  if (
    !leader ||
    !questGiver ||
    getDistance(leader.position, questGiver.position) > QUEST_GIVER_INTERACTION_RANGE ||
    !hasQuestGiverWork(nextState)
  ) {
    return nextState;
  }

  return updateQuestGiverInteraction(nextState);
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

  return recordQuestPoiReachedForQuests(
    state,
    objective.targetPoiId,
    state.currentMapId,
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

function recordLockedMerchantPoiIfNeeded(state: GameState): GameState {
  if (
    state.currentMapId !== HUB_MAP_ID ||
    isMerchantUnlockedForQuests(state) ||
    getQuickExchangeItems(state).length === 0
  ) {
    return state;
  }

  const merchant = Object.values(state.entities).find(
    (entity) => entity.kind === "npc" && entity.npcRole === "merchant",
  );

  return merchant
    ? recordMerchantLockedForQuest(state, merchant.id, "merchant_poi_locked")
    : state;
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
  const activeThreatResponder = getPartyMembersRespondingToActiveThreat(state)[0];
  const activeThreatTarget = activeThreatResponder?.currentTargetId
    ? getEntityById(state, activeThreatResponder.currentTargetId)
    : undefined;

  if (localTarget.category === "resource" && activeThreatTarget?.kind === "enemy") {
    return applyActivePartyThreatToPartyIntent(state, activeThreatTarget);
  }

  const targetEntity = localTarget.targetEntityId
    ? getEntityById(state, localTarget.targetEntityId)
    : undefined;
  const baseTargetPosition = targetEntity?.position ?? localTarget.position;
  const targetPosition = leader
    ? getLocalTargetMovementPosition(
        state,
        leader,
        localTarget,
        baseTargetPosition,
      )
    : baseTargetPosition;
  const executionIntent = {
    type: getPoiExecutionIntentType(localTarget.category),
    targetId:
      localTarget.category === "combat" || localTarget.category === "resource"
        ? localTarget.targetEntityId ?? null
        : null,
    targetPosition,
    source: "ai" as const,
  };
  const nextState = setPartyIntent(state, {
    mode: executionIntent.type === "attack" ? "engage" : "travel",
    source: "ai",
    executionIntent,
    globalPoiIntent: state.globalPoiIntent,
    localPoiTarget: localTarget,
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
    state: localTarget.category === "combat" ? "attack" : "follow",
    currentTargetId:
      localTarget.category === "combat"
        ? localTarget.targetEntityId ?? null
        : null,
    commandPriority: "autonomous",
  });
}

function getLocalTargetMovementPosition(
  state: GameState,
  leader: GameEntity,
  localTarget: LocalPoiTarget,
  targetPosition: Position,
): Position {
  if (
    localTarget.category === "combat" ||
    localTarget.category === "resource" ||
    localTarget.category === "teleport" ||
    !localTarget.interactionRange
  ) {
    return targetPosition;
  }

  return (
    resolveInteractionStandPosition(
      state,
      leader,
      targetPosition,
      localTarget.interactionRange,
    ) ?? targetPosition
  );
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
