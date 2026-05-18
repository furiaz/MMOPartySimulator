import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  debugMapDefinitions,
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_FOUR_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import { getQuickExchangeItems, quickExchangeParts } from "./merchant";
import {
  getNavigationGrid,
  getNavigationNeighborPositions,
  getNavigationPositionKey,
  toNavigationNode,
} from "./navigation";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  getEntityById,
  getPoiSearchScope,
  setLeaderIntent,
  updateEntity,
  type GameState,
  type PoiSearchScope,
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
import { getSubzoneAtPosition, isPositionInsideSubzone } from "./subzoneSystem";
import {
  createGathererResourceReservations,
  getCurrentPartyGatherResourceTargetId,
  type GathererResourceReservations,
  type ResourceWorkContext,
} from "./gathererResourceReservation";
import type { PointOfInterest, PoiCategory, PoiMapType } from "./poiTypes";
import type {
  DebugMapId,
  DebugTeleportPoint,
  Position,
  ResourceEntity,
  ResourceType,
  ZoneSubzone,
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
const WILD_POI_REEVALUATE_INTERVAL_MS = 4000;
const QUEST_RESOURCE_POI_COMMITMENT_MS = 4000;
const FALLBACK_POI_PATH_DISTANCE_TIERS = [35, 70, 120] as const;
const FALLBACK_POI_WHOLE_MAP_REEVALUATE_INTERVAL_MS = 4000;

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

type PoiDistanceMapOptions = {
  maxDistance?: number;
};

type ScorePoiTargetsOptions = {
  recordUnreachable?: (option: PoiTargetOption) => boolean;
};

export function updatePoiSystem(
  state: GameState,
  resourceWorkContext?: ResourceWorkContext,
): GameState {
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

  const gathererReservations = createGathererResourceReservations(
    state,
    resourceWorkContext,
  );

  if (canReuseWildPoiSelection(state, leader, gathererReservations)) {
    return applyLocalTargetToLeaderIntent(state, state.localPoiTarget);
  }

  const interactionState = clearReachedWorldTravelTarget(
    updateReachedPoiInteractions(state),
  );
  const globalPoiIntent = getGlobalPoiIntent(interactionState);
  const selection = selectLocalPoiTarget(
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
    nextState = applyLocalTargetToLeaderIntent(nextState, selection.localTarget);
  } else if (
    nextState.leaderIntent?.type === "gather" &&
    nextState.leaderIntent.source !== "player" &&
    !getCurrentPartyGatherResourceTargetId(nextState)
  ) {
    nextState = setLeaderIntent(nextState, null);
  } else if (globalPoiIntent.type === "idle") {
    nextState = setLeaderIntent(nextState, null);
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
    return entity.kind === "resource" && !entity.isDepleted && entity.quantity > 0;
  }

  return true;
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

  const objective = getFirstIncompleteObjective(state, target.questId);

  if (
    !objective ||
    objective.id !== target.objectiveId ||
    objective.type !== "gather_item_count"
  ) {
    return false;
  }

  return getResourceTypeFromLocalTarget(state, target) === objective.resourceType;
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
  gathererReservations: GathererResourceReservations,
): {
  localTarget: LocalPoiTarget | null;
  consideredTargets: PoiConsideration[];
  skippedReasons: Record<string, string>;
} {
  const skippedReasons: Record<string, string> = {};
  const candidates = buildPoiCandidates(state, gathererReservations);
  const options = getPoiTargetOptions(
    state,
    globalPoiIntent,
    candidates,
    gathererReservations,
  );
  const scoredTargets = selectScoredPoiTargets(state, options, skippedReasons);
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
  gathererReservations: GathererResourceReservations,
): PoiTargetOption[] {
  const mapType = getMapType(state.currentMapId);
  const searchScope = getPoiSearchScope(state);
  const leader = getPartyLeader(state);
  const leaderSubzone = getLeaderSubzoneRestriction(state);
  const isGathererLeader = leader?.role === "gatherer";

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
    searchScope,
    gathererReservations,
  );
  const subzoneQuestOptions = filterPoiOptionsToLeaderSubzone(
    questOptions,
    leaderSubzone,
  );

  if (mapType === "hub") {
    return [
      ...getHubMerchantOptions(state, candidates),
      ...subzoneQuestOptions,
      {
        poi: createIdlePoi(state.currentMapId ?? HUB_MAP_ID),
        priority: 100,
        reason: "hub idle city point",
      },
    ];
  }

  if (globalPoiIntent.type !== "idle" && subzoneQuestOptions.length > 0) {
    return subzoneQuestOptions;
  }

  if (globalPoiIntent.type !== "idle" && searchScope === "free_travel") {
    return [];
  }

  return getWildFallbackOptions(
    filterPoisToLeaderSubzone(candidates, leaderSubzone),
    isGathererLeader,
  );
}

function getLeaderSubzoneRestriction(state: GameState): ZoneSubzone | null {
  if (getPoiSearchScope(state) !== "subzone_only") {
    return null;
  }

  const leader = getPartyLeader(state);

  return getSubzoneAtPosition(state.map, leader?.position);
}

function filterPoiOptionsToLeaderSubzone(
  options: PoiTargetOption[],
  leaderSubzone: ZoneSubzone | null,
): PoiTargetOption[] {
  if (!leaderSubzone) {
    return options;
  }

  return options.filter((option) =>
    option.poi.category === "teleport" ||
    isPositionInsideSubzone(option.poi.position, leaderSubzone),
  );
}

function filterPoisToLeaderSubzone(
  candidates: PointOfInterest[],
  leaderSubzone: ZoneSubzone | null,
): PointOfInterest[] {
  if (!leaderSubzone) {
    return candidates;
  }

  return candidates.filter((poi) =>
    poi.category === "teleport" ||
    isPositionInsideSubzone(poi.position, leaderSubzone),
  );
}

function getWildFallbackOptions(
  candidates: PointOfInterest[],
  prioritizeResources = false,
): PoiTargetOption[] {
  const combatPriority = prioritizeResources
    ? FALLBACK_POI_PRIORITY + 1
    : FALLBACK_POI_PRIORITY;
  const resourcePriority = prioritizeResources
    ? FALLBACK_POI_PRIORITY - 1
    : FALLBACK_POI_PRIORITY;

  return [
    ...candidates
      .filter((poi) => poi.category === "combat")
      .map((poi) => ({
        poi,
        priority: combatPriority,
        scoreBase: FALLBACK_ENEMY_SCORE_BASE,
        reason: "wild enemy fallback",
      })),
    ...candidates
      .filter((poi) => poi.category === "resource")
      .map((poi) => ({
        poi,
        priority: resourcePriority,
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
  searchScope: PoiSearchScope,
  gathererReservations: GathererResourceReservations,
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
    if (searchScope !== "free_travel") {
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
    return getQuestResourcePois(state, gathererReservations)
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

function selectScoredPoiTargets(
  state: GameState,
  options: PoiTargetOption[],
  skippedReasons: Record<string, string>,
): ScoredPoiTarget[] {
  if (options.length === 0) {
    return [];
  }

  if (options.every(isWildFallbackOption)) {
    return selectProgressiveFallbackTargets(state, options, skippedReasons);
  }

  const distanceMap = createPoiDistanceMap(state, options);
  return scorePoiTargets(state, options, distanceMap, skippedReasons);
}

function selectProgressiveFallbackTargets(
  state: GameState,
  options: PoiTargetOption[],
  skippedReasons: Record<string, string>,
): ScoredPoiTarget[] {
  const widestBoundedTier =
    FALLBACK_POI_PATH_DISTANCE_TIERS[
      FALLBACK_POI_PATH_DISTANCE_TIERS.length - 1
    ] ?? 0;
  const boundedDistanceMap = createPoiDistanceMap(state, options, {
    maxDistance: widestBoundedTier,
  });
  const boundedSkippedReasons: Record<string, string> = {};
  const boundedTargets = scorePoiTargets(
    state,
    options,
    boundedDistanceMap,
    boundedSkippedReasons,
    {
      recordUnreachable: (option) =>
        getPoiMinimumDistance(state, option.poi) <= widestBoundedTier,
    },
  );

  for (const tier of FALLBACK_POI_PATH_DISTANCE_TIERS) {
    const tierTargets = boundedTargets.filter(
      (target) => target.pathDistance <= tier,
    );

    if (tierTargets.length > 0) {
      Object.assign(skippedReasons, boundedSkippedReasons);
      return tierTargets;
    }
  }

  if (!canRunWholeMapFallback(state)) {
    return [];
  }

  const distanceMap = createPoiDistanceMap(state, options);
  return scorePoiTargets(state, options, distanceMap, skippedReasons);
}

function isWildFallbackOption(option: PoiTargetOption): boolean {
  return (
    option.reason === "wild enemy fallback" ||
    option.reason === "wild resource fallback"
  );
}

function canRunWholeMapFallback(state: GameState): boolean {
  const evaluatedAtMs = state.lastPoiDecision?.evaluatedAtMs;

  if (evaluatedAtMs === undefined) {
    return true;
  }

  if (
    state.localPoiTarget &&
    !isLocalPoiTargetStillValid(state, state.localPoiTarget)
  ) {
    return true;
  }

  return (
    (state.simulationTimeMs ?? 0) - evaluatedAtMs >=
    FALLBACK_POI_WHOLE_MAP_REEVALUATE_INTERVAL_MS
  );
}

function scorePoiTargets(
  state: GameState,
  options: PoiTargetOption[],
  distanceMap: Record<string, number> | null,
  skippedReasons: Record<string, string>,
  scoreOptions: ScorePoiTargetsOptions = {},
): ScoredPoiTarget[] {
  return options
    .map((option) => {
      const pathDistance = getPoiPathDistance(state, option.poi, distanceMap);

      if (pathDistance === null) {
        if (scoreOptions.recordUnreachable?.(option) ?? true) {
          skippedReasons[option.poi.id] = "unreachable";
        }
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

function getPoiMinimumDistance(state: GameState, poi: PointOfInterest): number {
  const leader = getPartyLeader(state);

  return leader ? getDistance(leader.position, poi.position) : Number.POSITIVE_INFINITY;
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
  distanceOptions: PoiDistanceMapOptions = {},
): Record<string, number> | null {
  const leader = getPartyLeader(state);

  if (!leader || !state.map) {
    return null;
  }

  const start = toNavigationNode(leader.position);
  const navigationGrid = getNavigationGrid(state.map);

  if (!isNavigationGridCellWalkable(navigationGrid, start)) {
    return {};
  }

  const targetKeys = new Set(
    options
      .filter((option) => option.poi.mapId === state.currentMapId)
      .map((option) => getNavigationPositionKey(option.poi.position)),
  );
  const resourceBlockerKeys = createActiveResourceBlockerKeys(state);
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

    const currentDistance = distanceByKey[currentKey] ?? 0;

    if (
      distanceOptions.maxDistance !== undefined &&
      currentDistance >= distanceOptions.maxDistance
    ) {
      continue;
    }

    for (const neighbor of getNavigationNeighborPositions(current)) {
      const neighborKey = getNavigationPositionKey(neighbor);
      const nextDistance = currentDistance + 1;

      if (
        visited.has(neighborKey) ||
        (distanceOptions.maxDistance !== undefined &&
          nextDistance > distanceOptions.maxDistance) ||
        !isNavigationGridCellWalkable(navigationGrid, neighbor) ||
        (!targetKeys.has(neighborKey) && resourceBlockerKeys.has(neighborKey))
      ) {
        continue;
      }

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

function isNavigationGridCellWalkable(
  navigationGrid: ReturnType<typeof getNavigationGrid>,
  position: Position,
): boolean {
  return Boolean(
    navigationGrid.cellsByKey[getNavigationPositionKey(position)]?.walkable,
  );
}

function createActiveResourceBlockerKeys(state: GameState): Set<string> {
  return new Set(
    Object.values(state.entities)
      .filter(
        (entity): entity is ResourceEntity =>
          entity.kind === "resource" &&
          !entity.isDepleted &&
          entity.quantity > 0,
      )
      .map((resource) =>
        getNavigationPositionKey(toNavigationNode(resource.position)),
      ),
  );
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

function buildPoiCandidates(
  state: GameState,
  gathererReservations: GathererResourceReservations,
): PointOfInterest[] {
  if (!state.currentMapId) {
    return [];
  }

  return [
    ...getNpcPois(state),
    ...getTeleportPois(state),
    ...getEnemyPois(state),
    ...getResourcePois(state, gathererReservations),
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

function getResourcePois(
  state: GameState,
  gathererReservations: GathererResourceReservations,
): PointOfInterest[] {
  const partyGatherResourceTargetId = getCurrentPartyGatherResourceTargetId(state);

  return getAllResourcePois(state).filter(
    (resourcePoi) =>
      !resourcePoi.targetEntityId ||
      resourcePoi.targetEntityId === partyGatherResourceTargetId ||
      !gathererReservations.resourceIds.has(resourcePoi.targetEntityId),
  );
}

function getQuestResourcePois(
  state: GameState,
  gathererReservations: GathererResourceReservations,
): PointOfInterest[] {
  return getResourcePois(state, gathererReservations);
}

function getAllResourcePois(state: GameState): PointOfInterest[] {
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

  const visited = new Set<DebugMapId>([currentMapId]);
  const queue: Array<{ mapId: DebugMapId; firstStep: DebugMapId | null }> = [
    { mapId: currentMapId, firstStep: null },
  ];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (!current) {
      continue;
    }

    for (const teleport of debugMapDefinitions[current.mapId].teleports) {
      if (visited.has(teleport.targetMapId)) {
        continue;
      }

      const firstStep = current.firstStep ?? teleport.targetMapId;

      if (teleport.targetMapId === targetMapId) {
        return firstStep;
      }

      visited.add(teleport.targetMapId);
      queue.push({ mapId: teleport.targetMapId, firstStep });
    }
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
  if (mapId === MAP_FOUR_ID) {
    return { x: 132, y: 36 };
  }

  if (mapId === MAP_THREE_ID) {
    return { x: 80, y: 36 };
  }

  if (mapId === MAP_TWO_ID) {
    return { x: 134, y: 13 };
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
