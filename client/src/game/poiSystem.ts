import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import { getPartyLeader, getPartyMembers, isGathererBusy } from "./partySystem";
import {
  getEntityById,
  setLeaderIntent,
  updateEntity,
  type GameState,
} from "./state";
import {
  QUEST_DEFINITIONS,
  QUEST_GIVER_POI_ID,
  getActiveQuest,
  getAvailableQuest,
  getFirstIncompleteObjective,
  getQuestTargetMapId,
  hasQuestGiverWork,
  updateQuestGiverInteraction,
} from "./questSystem";
import type { PointOfInterest, PoiCategory, PoiMapType } from "./poiTypes";
import type {
  DebugMapId,
  DebugTeleportPoint,
  Position,
  ResourceEntity,
  ResourceType,
} from "./types";
import type { GlobalPoiIntent, LocalPoiTarget, QuestId } from "./questTypes";

const QUEST_GIVER_INTERACTION_RANGE = 2;
const DEFAULT_POI_INTERACTION_RANGE = 1.5;
const THREAT_DISTANCE = 5;
const IDLE_CITY_POINT: Position = { x: 22, y: 16 };

export function updatePoiSystem(state: GameState): GameState {
  if (!state.autoModeEnabled || state.activeTeleport) {
    return clearPoiSelection(state);
  }

  if (state.leaderIntent?.source === "player") {
    return clearPoiSelection(state);
  }

  const leader = getPartyLeader(state);

  if (!leader || leader.commandPriority === "direct") {
    return clearPoiSelection(state);
  }

  if (getPartyMembers(state).some((member) => member.commandPriority === "direct")) {
    return clearPoiSelection(state);
  }

  const interactionState = updateReachedPoiInteractions(state);
  const globalPoiIntent = getGlobalPoiIntent(interactionState);
  const selection = selectLocalPoiTarget(interactionState, globalPoiIntent);
  let nextState: GameState = {
    ...interactionState,
    globalPoiIntent,
    localPoiTarget: selection.localTarget,
    lastPoiDecision: {
      selectedPoiId: selection.localTarget?.poiId,
      selectedCategory: selection.localTarget?.category,
      selectedMapId: selection.localTarget?.mapId,
      selectedPosition: selection.localTarget?.position,
      selectedReason: selection.localTarget?.reason,
      skippedReasons: selection.skippedReasons,
    },
  };

  if (selection.localTarget) {
    nextState = recordPoiSelected(nextState, selection.localTarget);
    nextState = applyLocalTargetToLeaderIntent(nextState, selection.localTarget);
  } else if (globalPoiIntent.type === "idle") {
    nextState = setLeaderIntent(nextState, null);
  }

  return recordSkippedPois(nextState, selection.skippedReasons);
}

export function getMapType(mapId: DebugMapId | undefined): PoiMapType {
  return mapId === HUB_MAP_ID ? "hub" : "wild";
}

function updateReachedPoiInteractions(state: GameState): GameState {
  if (state.currentMapId !== HUB_MAP_ID) {
    return state;
  }

  const leader = getPartyLeader(state);
  const questGiver = Object.values(state.entities).find(
    (entity) => entity.kind === "npc" && entity.npcRole === "quest_giver",
  );

  if (
    !leader ||
    !questGiver ||
    getDistance(leader.position, questGiver.position) > QUEST_GIVER_INTERACTION_RANGE ||
    !hasQuestGiverWork(state)
  ) {
    return state;
  }

  return updateQuestGiverInteraction(state);
}

function getGlobalPoiIntent(state: GameState): GlobalPoiIntent {
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

function selectLocalPoiTarget(
  state: GameState,
  globalPoiIntent: GlobalPoiIntent,
): {
  localTarget: LocalPoiTarget | null;
  skippedReasons: Record<string, string>;
} {
  const skippedReasons: Record<string, string> = {};
  const candidates = buildPoiCandidates(state);
  const questTarget = getQuestLocalTarget(state, globalPoiIntent, candidates);

  if (questTarget) {
    return { localTarget: questTarget, skippedReasons };
  }

  if (globalPoiIntent.questId) {
    skippedReasons[globalPoiIntent.questId] = "quest target not on current map";
  }

  const mapType = getMapType(state.currentMapId);

  if (mapType === "hub") {
    return {
      localTarget: getHubFallbackTarget(state, candidates),
      skippedReasons,
    };
  }

  return {
    localTarget: getWildFallbackTarget(state, candidates, skippedReasons),
    skippedReasons,
  };
}

function getQuestLocalTarget(
  state: GameState,
  globalPoiIntent: GlobalPoiIntent,
  candidates: PointOfInterest[],
): LocalPoiTarget | null {
  if (!globalPoiIntent.questId || !state.currentMapId) {
    return null;
  }

  const questId = globalPoiIntent.questId;
  const quest = state.quests[questId];
  const targetMapId =
    globalPoiIntent.type === "get_new_quest"
      ? HUB_MAP_ID
      : getQuestTargetMapId(state, questId);

  if (targetMapId !== state.currentMapId) {
    return getTeleportTargetTowardMap(state, targetMapId, questId, globalPoiIntent.objectiveId);
  }

  if (quest.status === "ready_to_turn_in" || globalPoiIntent.type === "get_new_quest") {
    const questGiverPoi = candidates.find((poi) => poi.id === QUEST_GIVER_POI_ID);
    return questGiverPoi
      ? toLocalTarget(questGiverPoi, {
          questId,
          objectiveId: globalPoiIntent.objectiveId,
          reason: quest.status === "ready_to_turn_in"
            ? "return to quest giver"
            : "accept available quest",
        })
      : null;
  }

  const objective = getFirstIncompleteObjective(state, questId);

  if (!objective) {
    return null;
  }

  if (objective.type === "defeat_enemy_count") {
    const enemyPoi = candidates.find((poi) => poi.category === "combat");
    return enemyPoi
      ? toLocalTarget(enemyPoi, {
          questId,
          objectiveId: objective.id,
          reason: "active quest combat objective",
        })
      : null;
  }

  if (objective.type === "gather_item_count") {
    const resourcePoi = candidates.find(
      (poi) =>
        poi.category === "resource" &&
        getResourceTypeFromPoi(state, poi) === objective.resourceType,
    );
    return resourcePoi
      ? toLocalTarget(resourcePoi, {
          questId,
          objectiveId: objective.id,
          reason: `active quest gather ${objective.resourceType}`,
        })
      : null;
  }

  if (objective.type === "reach_poi") {
    return toLocalTarget(createExplorationPoi(state, questId, objective.id), {
      questId,
      objectiveId: objective.id,
      reason: "active quest reach objective",
    });
  }

  return null;
}

function getHubFallbackTarget(
  state: GameState,
  candidates: PointOfInterest[],
): LocalPoiTarget | null {
  const questGiverPoi = candidates.find((poi) => poi.id === QUEST_GIVER_POI_ID);

  if (questGiverPoi && hasQuestGiverWork(state)) {
    return toLocalTarget(questGiverPoi, { reason: "hub quest giver priority" });
  }

  return toLocalTarget(createIdlePoi(state.currentMapId ?? HUB_MAP_ID), {
    reason: "hub idle city point",
  });
}

function getWildFallbackTarget(
  state: GameState,
  candidates: PointOfInterest[],
  skippedReasons: Record<string, string>,
): LocalPoiTarget | null {
  const leader = getPartyLeader(state);
  const nearbyThreat = leader
    ? candidates.find(
        (poi) =>
          poi.category === "combat" &&
          getDistance(leader.position, poi.position) <= THREAT_DISTANCE,
      )
    : null;

  if (nearbyThreat) {
    return toLocalTarget(nearbyThreat, { reason: "nearby threatening enemy" });
  }

  const resource = candidates.find((poi) => poi.category === "resource");

  if (resource && hasIdleGatherer(state)) {
    return toLocalTarget(resource, { reason: "nearby resource fallback" });
  }

  if (resource) {
    skippedReasons[resource.id] = "no idle gatherer available";
  }

  return null;
}

function buildPoiCandidates(state: GameState): PointOfInterest[] {
  if (!state.currentMapId) {
    return [];
  }

  return [
    ...getNpcPois(state),
    ...getTeleportPois(state),
    ...getEnemyPois(state),
    ...getResourcePois(state),
  ];
}

function getNpcPois(state: GameState): PointOfInterest[] {
  return Object.values(state.entities)
    .filter((entity) => entity.kind === "npc")
    .map((npc) => ({
      id: npc.id,
      category: npc.npcRole === "quest_giver" ? "quest" : "npc",
      mapId: state.currentMapId ?? HUB_MAP_ID,
      displayName: npc.displayName,
      position: npc.position,
      interactionRange:
        npc.npcRole === "quest_giver"
          ? QUEST_GIVER_INTERACTION_RANGE
          : DEFAULT_POI_INTERACTION_RANGE,
      targetEntityId: npc.id,
    }));
}

function getTeleportPois(state: GameState): PointOfInterest[] {
  return (state.map?.teleports ?? []).map((teleport) => ({
    id: teleport.id,
    category: "teleport",
    mapId: teleport.sourceMapId,
    displayName: teleport.id,
    position: teleport.position,
    interactionRange: teleport.range,
    targetEntityId: teleport.id,
  }));
}

function getEnemyPois(state: GameState): PointOfInterest[] {
  return Object.values(state.entities)
    .filter(
      (entity) =>
        entity.kind === "enemy" &&
        entity.state !== "dead" &&
        entity.health > 0,
    )
    .map((enemy) => ({
      id: enemy.id,
      category: "combat",
      mapId: state.currentMapId ?? MAP_ONE_ID,
      displayName: `Enemy ${enemy.id}`,
      position: enemy.position,
      targetEntityId: enemy.id,
    }));
}

function getResourcePois(state: GameState): PointOfInterest[] {
  return Object.values(state.entities)
    .filter(
      (entity): entity is ResourceEntity =>
        entity.kind === "resource" &&
        !entity.isDepleted &&
        entity.quantity > 0,
    )
    .map((resource) => ({
      id: resource.id,
      category: "resource",
      mapId: state.currentMapId ?? MAP_ONE_ID,
      displayName: resource.resourceType,
      position: resource.position,
      targetEntityId: resource.id,
    }));
}

function getTeleportTargetTowardMap(
  state: GameState,
  targetMapId: DebugMapId,
  questId?: QuestId,
  objectiveId?: string,
): LocalPoiTarget | null {
  const teleport = getNextTeleportTowardMap(state.currentMapId, targetMapId, state.map?.teleports ?? []);

  return teleport
    ? {
        poiId: teleport.id,
        category: "teleport",
        mapId: teleport.sourceMapId,
        position: teleport.position,
        targetEntityId: teleport.id,
        questId,
        objectiveId,
        reason: `route toward ${targetMapId}`,
      }
    : null;
}

function getNextTeleportTowardMap(
  currentMapId: DebugMapId | undefined,
  targetMapId: DebugMapId,
  teleports: DebugTeleportPoint[],
): DebugTeleportPoint | null {
  const nextMapId = getNextMapRouteStep(currentMapId, targetMapId);

  return (
    teleports.find((teleport) => teleport.targetMapId === nextMapId) ??
    null
  );
}

function getNextMapRouteStep(
  currentMapId: DebugMapId | undefined,
  targetMapId: DebugMapId,
): DebugMapId | null {
  if (!currentMapId || currentMapId === targetMapId) {
    return null;
  }

  if (currentMapId === HUB_MAP_ID && targetMapId !== HUB_MAP_ID) {
    return MAP_ONE_ID;
  }

  if (currentMapId === MAP_ONE_ID) {
    return targetMapId === HUB_MAP_ID ? HUB_MAP_ID : MAP_TWO_ID;
  }

  if (currentMapId === MAP_TWO_ID) {
    return MAP_ONE_ID;
  }

  return null;
}

function createIdlePoi(mapId: DebugMapId): PointOfInterest {
  return {
    id: "hub-idle-city-point",
    category: "idle",
    mapId,
    displayName: "City Square",
    position: IDLE_CITY_POINT,
  };
}

function createExplorationPoi(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
): PointOfInterest {
  const mapId = state.currentMapId ?? MAP_ONE_ID;

  return {
    id: `${questId}-${objectiveId}-exploration`,
    category: "exploration",
    mapId,
    displayName: QUEST_DEFINITIONS[questId].displayName,
    position: getMapExplorationTarget(mapId),
    linkedQuestId: questId,
    linkedObjectiveId: objectiveId,
  };
}

function getMapExplorationTarget(mapId: DebugMapId): Position {
  if (mapId === MAP_TWO_ID) {
    return { x: 6, y: 21 };
  }

  return { x: 46, y: 22 };
}

function toLocalTarget(
  poi: PointOfInterest,
  details: {
    questId?: QuestId;
    objectiveId?: string;
    reason: string;
  },
): LocalPoiTarget {
  return {
    poiId: poi.id,
    category: poi.category,
    mapId: poi.mapId,
    position: poi.position,
    targetEntityId: poi.targetEntityId,
    questId: details.questId ?? poi.linkedQuestId,
    objectiveId: details.objectiveId ?? poi.linkedObjectiveId,
    reason: details.reason,
  };
}

function applyLocalTargetToLeaderIntent(
  state: GameState,
  localTarget: LocalPoiTarget,
): GameState {
  const leader = getPartyLeader(state);
  const targetEntity = localTarget.targetEntityId
    ? getEntityById(state, localTarget.targetEntityId)
    : undefined;
  const leaderIntent = {
    type: getLeaderIntentType(localTarget.category),
    targetId:
      localTarget.category === "combat" || localTarget.category === "resource"
        ? localTarget.targetEntityId ?? null
        : null,
    targetPosition: targetEntity?.position ?? localTarget.position,
    source: "ai" as const,
  };
  const nextState = setLeaderIntent(state, leaderIntent);

  if (!leader) {
    return nextState;
  }

  const currentLeader = getEntityById(nextState, leader.id);

  if (currentLeader?.kind !== "companion") {
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

function getLeaderIntentType(category: PoiCategory): "attack" | "move" | "gather" | "explore" {
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

function hasIdleGatherer(state: GameState): boolean {
  return getPartyMembers(state).some(
    (member) =>
      member.role === "gatherer" &&
      member.commandPriority === "autonomous" &&
      !isGathererBusy(state, member),
  );
}

function getResourceTypeFromPoi(
  state: GameState,
  poi: PointOfInterest,
): ResourceType | null {
  const entity = poi.targetEntityId ? state.entities[poi.targetEntityId] : undefined;

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
  if (!state.globalPoiIntent && !state.localPoiTarget && !state.lastPoiDecision) {
    return state;
  }

  return {
    ...state,
    globalPoiIntent: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
  };
}

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
