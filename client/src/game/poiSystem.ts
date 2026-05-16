import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import { getQuickExchangeItems, quickExchangeParts } from "./merchant";
import {
  getNavigationNeighborPositions,
  getNavigationPositionKey,
  isNavigationCellWalkable,
  toNavigationNode,
} from "./navigation";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  getEntityById,
  isActiveResourcePosition,
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
import type {
  GlobalPoiIntent,
  LocalPoiTarget,
  PoiConsideration,
  QuestId,
} from "./questTypes";

const QUEST_GIVER_INTERACTION_RANGE = 2;
const DEFAULT_POI_INTERACTION_RANGE = 1.5;
const POI_SWITCH_DISTANCE_THRESHOLD = 3;
const MAX_CONSIDERED_POIS = 5;
const FALLBACK_POI_PRIORITY = 50;
const FALLBACK_ENEMY_SCORE_BASE = 40;
const FALLBACK_RESOURCE_SCORE_BASE = 55;
const FALLBACK_DISTANCE_SCORE_MULTIPLIER = 1;
const NEARBY_RESOURCE_PATH_DISTANCE = 3;
const NEARBY_RESOURCE_SCORE_BONUS = -12;
const IDLE_CITY_POINT: Position = { x: 22, y: 16 };
const WILD_POI_REEVALUATE_INTERVAL_MS = 500;

type PoiTargetOption = {
  poi: PointOfInterest;
  priority: number;
  reason: string;
  scoreBase?: number;
  nearbyResourceBonus?: number;
  questId?: QuestId;
  objectiveId?: string;
};

type ScoredPoiTarget = {
  localTarget: LocalPoiTarget;
  priority: number;
  score: number;
  pathDistance: number;
};

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

  if (canReuseWildPoiSelection(state, leader)) {
    return applyLocalTargetToLeaderIntent(state, state.localPoiTarget);
  }

  const interactionState = clearReachedWorldTravelTarget(
    updateReachedPoiInteractions(state),
  );
  const globalPoiIntent = getGlobalPoiIntent(interactionState);
  const selection = selectLocalPoiTarget(interactionState, globalPoiIntent);
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
    nextState = applyLocalTargetToLeaderIntent(nextState, selection.localTarget);
  } else if (globalPoiIntent.type === "idle") {
    nextState = setLeaderIntent(nextState, null);
  }

  return recordSkippedPois(nextState, selection.skippedReasons);
}

function canReuseWildPoiSelection(
  state: GameState,
  leader: { position: Position },
): state is GameState & { localPoiTarget: LocalPoiTarget } {
  if (state.currentMapId === HUB_MAP_ID || !state.localPoiTarget) {
    return false;
  }

  const evaluatedAtMs = state.lastPoiDecision?.evaluatedAtMs;
  const nowMs = state.simulationTimeMs ?? 0;

  if (
    evaluatedAtMs === undefined ||
    nowMs - evaluatedAtMs >= WILD_POI_REEVALUATE_INTERVAL_MS
  ) {
    return false;
  }

  if (!isLocalPoiTargetStillValid(state, state.localPoiTarget)) {
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
    DEFAULT_POI_INTERACTION_RANGE
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
    return entity.kind === "resource" && !entity.isDepleted;
  }

  return true;
}

export function getMapType(mapId: DebugMapId | undefined): PoiMapType {
  return mapId === HUB_MAP_ID ? "hub" : "wild";
}

function clearReachedWorldTravelTarget(state: GameState): GameState {
  if (
    !state.worldTravelTargetMapId ||
    state.worldTravelTargetMapId !== state.currentMapId
  ) {
    return state;
  }

  return {
    ...state,
    worldTravelTargetMapId: null,
  };
}

function updateReachedPoiInteractions(state: GameState): GameState {
  if (state.currentMapId !== HUB_MAP_ID) {
    return state;
  }

  const leader = getPartyLeader(state);
  const merchant = Object.values(state.entities).find(
    (entity) => entity.kind === "npc" && entity.npcRole === "merchant",
  );

  if (
    leader &&
    merchant &&
    getDistance(leader.position, merchant.position) <= DEFAULT_POI_INTERACTION_RANGE &&
    getQuickExchangeItems(state).length > 0
  ) {
    return quickExchangeParts(state, merchant.id).state;
  }

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

function selectLocalPoiTarget(
  state: GameState,
  globalPoiIntent: GlobalPoiIntent,
): {
  localTarget: LocalPoiTarget | null;
  consideredTargets: PoiConsideration[];
  skippedReasons: Record<string, string>;
} {
  const skippedReasons: Record<string, string> = {};
  const candidates = buildPoiCandidates(state);
  const options = getPoiTargetOptions(state, globalPoiIntent, candidates);
  const distanceMap = createPoiDistanceMap(state, options);
  const scoredTargets = scorePoiTargets(state, options, distanceMap, skippedReasons);
  const selectedTarget = selectStablePoiTarget(state, scoredTargets);
  const consideredTargets = getPoiConsiderations(scoredTargets, selectedTarget);

  return {
    localTarget: selectedTarget?.localTarget ?? null,
    consideredTargets,
    skippedReasons,
  };
}

function getPoiTargetOptions(
  state: GameState,
  globalPoiIntent: GlobalPoiIntent,
  candidates: PointOfInterest[],
): PoiTargetOption[] {
  const mapType = getMapType(state.currentMapId);
  const stayInMap = Boolean(state.poiPreferences?.stayInMap);

  if (globalPoiIntent.type === "travel_to_map" && globalPoiIntent.targetMapId) {
    const teleportPoi = getTeleportPoiTowardMap(state, globalPoiIntent.targetMapId);

    return teleportPoi
      ? [
          {
            poi: teleportPoi,
            priority: 5,
            reason: `world route toward ${globalPoiIntent.targetMapId}`,
          },
        ]
      : [];
  }

  const questOptions = getQuestTargetOptions(
    state,
    globalPoiIntent,
    candidates,
    mapType,
    stayInMap,
  );

  if (mapType === "hub") {
    return [
      ...getHubMerchantOptions(state, candidates),
      ...questOptions,
      {
        poi: createIdlePoi(state.currentMapId ?? HUB_MAP_ID),
        priority: 100,
        reason: "hub idle city point",
      },
    ];
  }

  if (globalPoiIntent.type !== "idle" && questOptions.length > 0) {
    return questOptions;
  }

  if (globalPoiIntent.type !== "idle" && !stayInMap) {
    return [];
  }

  return getWildFallbackOptions(candidates);
}

function getWildFallbackOptions(candidates: PointOfInterest[]): PoiTargetOption[] {
  return [
    ...candidates
      .filter((poi) => poi.category === "combat")
      .map((poi) => ({
        poi,
        priority: FALLBACK_POI_PRIORITY,
        scoreBase: FALLBACK_ENEMY_SCORE_BASE,
        reason: "wild enemy fallback",
      })),
    ...candidates
      .filter((poi) => poi.category === "resource")
      .map((poi) => ({
        poi,
        priority: FALLBACK_POI_PRIORITY,
        scoreBase: FALLBACK_RESOURCE_SCORE_BASE,
        nearbyResourceBonus: NEARBY_RESOURCE_SCORE_BONUS,
        reason: "wild resource fallback",
      })),
  ];
}

function getHubMerchantOptions(
  state: GameState,
  candidates: PointOfInterest[],
): PoiTargetOption[] {
  if (getQuickExchangeItems(state).length === 0) {
    return [];
  }

  const merchantPoi = candidates.find((poi) => {
    const entity = poi.targetEntityId ? state.entities[poi.targetEntityId] : undefined;
    return entity?.kind === "npc" && entity.npcRole === "merchant";
  });

  return merchantPoi
    ? [
        {
          poi: merchantPoi,
          priority: 10,
          reason: "merchant quick exchange",
        },
      ]
    : [];
}

function getQuestTargetOptions(
  state: GameState,
  globalPoiIntent: GlobalPoiIntent,
  candidates: PointOfInterest[],
  mapType: PoiMapType,
  stayInMap: boolean,
): PoiTargetOption[] {
  if (!globalPoiIntent.questId || !state.currentMapId) {
    return [];
  }

  const questId = globalPoiIntent.questId;
  const quest = state.quests[questId];
  const targetMapId =
    globalPoiIntent.type === "get_new_quest"
      ? HUB_MAP_ID
      : getQuestTargetMapId(state, questId);

  if (targetMapId !== state.currentMapId) {
    if (stayInMap) {
      return [];
    }

    const teleportPoi = getTeleportPoiTowardMap(state, targetMapId);

    return teleportPoi
      ? [
          {
            poi: teleportPoi,
            priority: mapType === "hub" ? 40 : 30,
            reason: `route toward ${targetMapId}`,
            questId,
            objectiveId: globalPoiIntent.objectiveId,
          },
        ]
      : [];
  }

  if (quest.status === "ready_to_turn_in" || globalPoiIntent.type === "get_new_quest") {
    const questGiverPoi = candidates.find((poi) => poi.id === QUEST_GIVER_POI_ID);
    return questGiverPoi
      ? [
          {
            poi: questGiverPoi,
            priority: quest.status === "ready_to_turn_in" ? 20 : 30,
            reason: quest.status === "ready_to_turn_in"
              ? "return to quest giver"
              : "accept available quest",
            questId,
            objectiveId: globalPoiIntent.objectiveId,
          },
        ]
      : [];
  }

  const objective = getFirstIncompleteObjective(state, questId);

  if (!objective) {
    return [];
  }

  if (objective.type === "defeat_enemy_count") {
    return candidates
      .filter((poi) => poi.category === "combat")
      .map((poi) => ({
        poi,
        priority: 10,
        reason: "active quest combat objective",
        questId,
        objectiveId: objective.id,
      }));
  }

  if (objective.type === "gather_item_count") {
    return candidates
      .filter(
        (poi) =>
          poi.category === "resource" &&
          getResourceTypeFromPoi(state, poi) === objective.resourceType,
      )
      .map((poi) => ({
        poi,
        priority: 10,
        reason: `active quest gather ${objective.resourceType}`,
        questId,
        objectiveId: objective.id,
      }));
  }

  if (objective.type === "reach_poi") {
    return [
      {
        poi: createExplorationPoi(state, questId, objective.id),
        priority: 10,
        reason: "active quest reach objective",
        questId,
        objectiveId: objective.id,
      },
    ];
  }

  return [];
}

function scorePoiTargets(
  state: GameState,
  options: PoiTargetOption[],
  distanceMap: Record<string, number> | null,
  skippedReasons: Record<string, string>,
): ScoredPoiTarget[] {
  return options
    .map((option) => {
      const pathDistance = getPoiPathDistance(state, option.poi, distanceMap);

      if (pathDistance === null) {
        skippedReasons[option.poi.id] = "unreachable";
        return null;
      }

      return {
        localTarget: toLocalTarget(option.poi, {
          questId: option.questId,
          objectiveId: option.objectiveId,
          reason: option.reason,
        }),
        priority: option.priority,
        score: getPoiScore(option, pathDistance),
        pathDistance,
      };
    })
    .filter((target): target is ScoredPoiTarget => Boolean(target))
    .sort((first, second) =>
      first.priority - second.priority ||
      first.score - second.score ||
      first.pathDistance - second.pathDistance ||
      first.localTarget.poiId.localeCompare(second.localTarget.poiId),
    );
}

function selectStablePoiTarget(
  state: GameState,
  scoredTargets: ScoredPoiTarget[],
): ScoredPoiTarget | null {
  const bestTarget = scoredTargets[0];

  if (!bestTarget) {
    return null;
  }

  const currentTarget = state.localPoiTarget
    ? scoredTargets.find((target) => target.localTarget.poiId === state.localPoiTarget?.poiId)
    : undefined;

  if (
    currentTarget &&
    currentTarget.priority === bestTarget.priority &&
    bestTarget.score >= currentTarget.score - POI_SWITCH_DISTANCE_THRESHOLD
  ) {
    return currentTarget;
  }

  return bestTarget;
}

function getPoiConsiderations(
  scoredTargets: ScoredPoiTarget[],
  selectedTarget: ScoredPoiTarget | null,
): PoiConsideration[] {
  const visibleTargets = scoredTargets.slice(0, MAX_CONSIDERED_POIS);

  if (
    selectedTarget &&
    !visibleTargets.some(
      (target) => target.localTarget.poiId === selectedTarget.localTarget.poiId,
    )
  ) {
    visibleTargets.splice(
      Math.max(0, MAX_CONSIDERED_POIS - 1),
      1,
      selectedTarget,
    );
  }

  return visibleTargets.map((target) =>
    toPoiConsideration(target, target.localTarget.poiId === selectedTarget?.localTarget.poiId),
  );
}

function toPoiConsideration(
  target: ScoredPoiTarget,
  isSelected: boolean,
): PoiConsideration {
  return {
    poiId: target.localTarget.poiId,
    category: target.localTarget.category,
    mapId: target.localTarget.mapId,
    position: target.localTarget.position,
    reason: target.localTarget.reason,
    priority: target.priority,
    score: target.score,
    pathDistance: target.pathDistance,
    targetEntityId: target.localTarget.targetEntityId,
    questId: target.localTarget.questId,
    objectiveId: target.localTarget.objectiveId,
    isSelected,
  };
}

function getPoiScore(option: PoiTargetOption, pathDistance: number): number {
  if (option.scoreBase === undefined) {
    return pathDistance;
  }

  const nearbyResourceBonus =
    option.nearbyResourceBonus !== undefined &&
    pathDistance <= NEARBY_RESOURCE_PATH_DISTANCE
      ? option.nearbyResourceBonus
      : 0;

  return (
    option.scoreBase +
    pathDistance * FALLBACK_DISTANCE_SCORE_MULTIPLIER +
    nearbyResourceBonus
  );
}

function createPoiDistanceMap(
  state: GameState,
  options: PoiTargetOption[],
): Record<string, number> | null {
  const leader = getPartyLeader(state);

  if (!leader || !state.map) {
    return null;
  }

  const start = toNavigationNode(leader.position);

  if (!isNavigationCellWalkable(state.map, start)) {
    return {};
  }

  const targetKeys = new Set(
    options
      .filter((option) => option.poi.mapId === state.currentMapId)
      .map((option) => getNavigationPositionKey(option.poi.position)),
  );
  const startKey = getNavigationPositionKey(start);
  const distanceByKey: Record<string, number> = {
    [startKey]: 0,
  };

  if (targetKeys.size === 0) {
    return distanceByKey;
  }

  const remainingTargetKeys = new Set(targetKeys);
  remainingTargetKeys.delete(startKey);

  if (remainingTargetKeys.size === 0) {
    return distanceByKey;
  }

  const queue: Position[] = [start];
  const queued = new Set<string>([startKey]);
  const visited = new Set<string>();
  let queueIndex = 0;

  while (queueIndex < queue.length && remainingTargetKeys.size > 0) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (!current) {
      continue;
    }

    const currentKey = getNavigationPositionKey(current);

    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);

    for (const neighbor of getNavigationNeighborPositions(current)) {
      const neighborKey = getNavigationPositionKey(neighbor);

      if (
        visited.has(neighborKey) ||
        !isNavigationCellWalkable(state.map, neighbor) ||
        (!targetKeys.has(neighborKey) && isActiveResourcePosition(state, neighbor))
      ) {
        continue;
      }

      const nextDistance =
        (distanceByKey[currentKey] ?? 0) + 1;

      if (
        distanceByKey[neighborKey] !== undefined &&
        nextDistance >= distanceByKey[neighborKey]
      ) {
        continue;
      }

      distanceByKey[neighborKey] = nextDistance;
      remainingTargetKeys.delete(neighborKey);

      if (!queued.has(neighborKey)) {
        queued.add(neighborKey);
        queue.push(neighbor);
      }
    }
  }

  return distanceByKey;
}

function getPoiPathDistance(
  state: GameState,
  poi: PointOfInterest,
  distanceMap: Record<string, number> | null,
): number | null {
  const leader = getPartyLeader(state);

  if (!leader || poi.mapId !== state.currentMapId) {
    return null;
  }

  if (!state.map) {
    return getDistance(leader.position, poi.position);
  }

  return distanceMap?.[getNavigationPositionKey(poi.position)] ?? null;
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

function getTeleportPoiTowardMap(
  state: GameState,
  targetMapId: DebugMapId,
): PointOfInterest | null {
  const teleport = getNextTeleportTowardMap(
    state.currentMapId,
    targetMapId,
    state.map?.teleports ?? [],
  );

  return teleport
    ? {
        id: teleport.id,
        category: "teleport",
        mapId: teleport.sourceMapId,
        displayName: teleport.id,
        position: teleport.position,
        interactionRange: teleport.range,
        targetEntityId: teleport.id,
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
