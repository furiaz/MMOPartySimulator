import { isTargetDummyEnemy } from "./entityGuards";
import {
  HUB_MAP_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import { getQuickExchangeItems } from "./merchant";
import {
  getNavigationGrid,
  getNavigationNeighborPositions,
  getNavigationPositionKey,
  toNavigationNode,
} from "./navigation";
import { getPartyLeader } from "./partySystem";
import {
  getPoiSearchScope,
  type GameState,
  type PoiSearchScope,
} from "./state";
import {
  QUEST_DEFINITIONS,
  QUEST_GIVER_POI_ID,
  getActiveQuest,
  getIncompleteObjectives,
  getQuestTargetMapId,
  isMerchantUnlockedForQuests,
  matchesObjectiveSubzoneAtPosition,
} from "./questSystem";
import { isTeleportWorking } from "./teleportState";
import { getSubzoneAtPosition, isPositionInsideSubzone } from "./subzoneSystem";
import { QUEST_REPAIR_RANGE } from "./questGuideSystem";
import { getNextWorldTravelTeleport } from "./worldTravelRouting";
import {
  getCurrentPartyGatherResourceTargetId,
  type GathererResourceReservations,
} from "./gathererResourceReservation";
import type { PointOfInterest, PoiMapType } from "./poiTypes";
import type {
  DebugMapId,
  Position,
  ResourceEntity,
  ResourceType,
  ZoneSubzone,
  ZoneSubzonePassage,
} from "./types";
import type {
  GlobalPoiIntent,
  LocalPoiTarget,
  PoiConsideration,
  QuestId,
  QuestObjectiveDefinition,
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
const FALLBACK_POI_PATH_DISTANCE_TIERS = [35, 70, 120] as const;
const FALLBACK_POI_WHOLE_MAP_REEVALUATE_INTERVAL_MS = 4000;

export type PoiTargetOption = {
  poi: PointOfInterest;
  priority: number;
  reason: string;
  scoreBase?: number;
  nearbyResourceBonus?: number;
  questId?: QuestId;
  objectiveId?: string;
};

export type ScoredPoiTarget = {
  localTarget: LocalPoiTarget;
  priority: number;
  score: number;
  pathDistance: number;
};

export type PoiSelectionResult = {
  localTarget: LocalPoiTarget | null;
  consideredTargets: PoiConsideration[];
  skippedReasons: Record<string, string>;
};

type PoiDistanceMapOptions = {
  maxDistance?: number;
};

type ScorePoiTargetsOptions = {
  recordUnreachable?: (option: PoiTargetOption) => boolean;
};

export function selectPoiTarget(
  state: GameState,
  globalPoiIntent: GlobalPoiIntent,
  gathererReservations: GathererResourceReservations,
): PoiSelectionResult {
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

export function getMapType(mapId: DebugMapId | undefined): PoiMapType {
  return mapId === HUB_MAP_ID ? "hub" : "wild";
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
    state,
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

  return options.filter(
    (option) =>
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

  return candidates.filter(
    (poi) =>
      poi.category === "teleport" ||
      isPositionInsideSubzone(poi.position, leaderSubzone),
  );
}

function getWildFallbackOptions(
  state: GameState,
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
      .filter(
        (poi) =>
          poi.category === "combat" &&
          !isCompletedActiveQuestDefeatEnemyPoi(state, poi),
      )
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

function isCompletedActiveQuestDefeatEnemyPoi(
  state: GameState,
  poi: PointOfInterest,
): boolean {
  if (poi.category !== "combat" || !poi.targetEntityId || !state.currentMapId) {
    return false;
  }

  const activeQuest = getActiveQuest(state);

  if (
    !activeQuest ||
    activeQuest.status !== "active" ||
    getIncompleteObjectives(state, activeQuest.questId).length === 0
  ) {
    return false;
  }

  const entity = state.entities[poi.targetEntityId];

  if (entity?.kind !== "enemy") {
    return false;
  }

  return QUEST_DEFINITIONS[activeQuest.questId].objectives.some(
    (objective) =>
      objective.type === "defeat_enemy_count" &&
      Boolean(activeQuest.objectiveProgress[objective.id]?.completed) &&
      objective.enemyMapId === state.currentMapId &&
      (!objective.enemyArchetypeId ||
        entity.archetypeId === objective.enemyArchetypeId) &&
      (!objective.targetSubzoneId ||
        entity.subzoneId === objective.targetSubzoneId),
  );
}

function isQuestCombatPoi(
  state: GameState,
  poi: PointOfInterest,
  objective: QuestObjectiveDefinition,
): boolean {
  if (poi.category !== "combat" || !poi.targetEntityId) {
    return false;
  }

  const entity = state.entities[poi.targetEntityId];

  return (
    entity?.kind === "enemy" &&
    entity.state !== "dead" &&
    (!objective.enemyArchetypeId ||
      entity.archetypeId === objective.enemyArchetypeId) &&
    (!objective.targetSubzoneId ||
      entity.subzoneId === objective.targetSubzoneId)
  );
}

function isQuestElitePoi(
  state: GameState,
  poi: PointOfInterest,
  objective: QuestObjectiveDefinition,
): boolean {
  if (poi.category !== "combat" || !poi.targetEntityId) {
    return false;
  }

  const entity = state.entities[poi.targetEntityId];

  return (
    entity?.kind === "enemy" &&
    entity.state !== "dead" &&
    entity.questSpawn?.isElite === true &&
    entity.questSpawn.objectiveId === objective.id
  );
}

function getHubMerchantOptions(
  state: GameState,
  candidates: PointOfInterest[],
): PoiTargetOption[] {
  if (
    getQuickExchangeItems(state).length === 0 ||
    !isMerchantUnlockedForQuests(state)
  ) {
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
            reason:
              quest.status === "ready_to_turn_in"
                ? "return to quest giver"
                : "accept available quest",
            questId,
            objectiveId: globalPoiIntent.objectiveId,
          },
        ]
      : [];
  }

  return getTargetableQuestObjectives(state, questId).flatMap((objective) =>
    getQuestObjectiveTargetOptions(
      state,
      questId,
      objective,
      candidates,
      gathererReservations,
    ),
  );
}

function getTargetableQuestObjectives(
  state: GameState,
  questId: QuestId,
): QuestObjectiveDefinition[] {
  const incompleteObjectives = getIncompleteObjectives(state, questId);

  return QUEST_DEFINITIONS[questId].objectiveFlow === "sequential"
    ? incompleteObjectives.slice(0, 1)
    : incompleteObjectives;
}

function getQuestObjectiveTargetOptions(
  state: GameState,
  questId: QuestId,
  objective: QuestObjectiveDefinition,
  candidates: PointOfInterest[],
  gathererReservations: GathererResourceReservations,
): PoiTargetOption[] {
  if (objective.type === "guide_npc_to_poi") {
    return [
      {
        poi: createGuideObjectivePoi(state, questId, objective),
        priority: 8,
        reason: "active quest guide objective",
        questId,
        objectiveId: objective.id,
      },
    ];
  }

  const subzoneRoutePoi = getQuestSubzoneRoutePoi(state, questId, objective);

  if (subzoneRoutePoi) {
    return [
      {
        poi: subzoneRoutePoi,
        priority: 10,
        reason: "route to quest subzone",
        questId,
        objectiveId: objective.id,
      },
    ];
  }

  if (
    objective.type === "defeat_enemy_count" ||
    objective.type === "collect_enemy_quest_drop_count"
  ) {
    return candidates
      .filter((poi) => isQuestCombatPoi(state, poi, objective))
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
          getResourceTypeFromPoi(state, poi) === objective.resourceType &&
          matchesObjectiveSubzoneAtPosition(state, objective, poi.position),
      )
      .map((poi) => ({
        poi,
        priority: 10,
        reason: `active quest gather ${objective.resourceType}`,
        questId,
        objectiveId: objective.id,
      }));
  }

  if (objective.type === "inspect_poi") {
    return [
      {
        poi: createObjectivePositionPoi(
          state,
          questId,
          objective,
          objective.targetPoiId ?? `${questId}-${objective.id}-inspect`,
        ),
        priority: 10,
        reason: "active quest inspect objective",
        questId,
        objectiveId: objective.id,
      },
    ];
  }

  if (
    objective.type === "repair_poi" ||
    objective.type === "defend_area" ||
    objective.type === "rescue_npc" ||
    objective.type === "unlock_route"
  ) {
    return [
      {
        poi: createObjectivePositionPoi(
          state,
          questId,
          objective,
          objective.targetPoiId ?? `${questId}-${objective.id}-objective`,
        ),
        priority: 10,
        reason: `active quest ${objective.type} objective`,
        questId,
        objectiveId: objective.id,
      },
    ];
  }

  if (objective.type === "defeat_elite") {
    const eliteOptions = candidates
      .filter((poi) => isQuestElitePoi(state, poi, objective))
      .map((poi) => ({
        poi,
        priority: 10,
        reason: "active quest elite objective",
        questId,
        objectiveId: objective.id,
      }));

    return eliteOptions.length > 0
      ? eliteOptions
      : [
          {
            poi: createObjectivePositionPoi(
              state,
              questId,
              objective,
              objective.targetPoiId ?? `${questId}-${objective.id}-elite`,
            ),
            priority: 10,
            reason: "active quest elite spawn objective",
            questId,
            objectiveId: objective.id,
          },
        ];
  }

  if (objective.type === "reach_poi") {
    return [
      {
        poi: createObjectivePositionPoi(
          state,
          questId,
          objective,
          objective.targetPoiId ?? `${questId}-${objective.id}-reach`,
        ),
        priority: 10,
        reason: "active quest reach objective",
        questId,
        objectiveId: objective.id,
      },
    ];
  }

  return [];
}

function getQuestSubzoneRoutePoi(
  state: GameState,
  questId: QuestId,
  objective: QuestObjectiveDefinition,
): PointOfInterest | null {
  if (!objective.targetSubzoneId || !state.currentMapId || !state.map?.subzones) {
    return null;
  }

  const leader = getPartyLeader(state);
  const currentSubzone = getSubzoneAtPosition(state.map, leader?.position);
  const targetSubzone = state.map.subzones.find(
    (subzone) => subzone.id === objective.targetSubzoneId,
  );

  if (
    !leader ||
    !currentSubzone ||
    !targetSubzone ||
    currentSubzone.id === targetSubzone.id
  ) {
    return null;
  }

  const routeStep = findNextSubzoneRouteStep(
    state.map.subzones,
    currentSubzone.id,
    targetSubzone.id,
  );

  if (!routeStep) {
    return null;
  }

  const routePosition = getSubzoneRoutePosition(routeStep.passage, routeStep.nextSubzone);

  return {
    id: `route-${currentSubzone.id}-to-${targetSubzone.id}-${routeStep.passage.id}`,
    category: "exploration",
    mapId: state.currentMapId,
    displayName: `Route to ${targetSubzone.displayName}`,
    position: routePosition,
    linkedQuestId: questId,
    linkedObjectiveId: objective.id,
  };
}

function findNextSubzoneRouteStep(
  subzones: ZoneSubzone[],
  startSubzoneId: string,
  targetSubzoneId: string,
): { nextSubzone: ZoneSubzone; passage: ZoneSubzonePassage } | null {
  const subzoneById = new Map(subzones.map((subzone) => [subzone.id, subzone]));
  const visited = new Set<string>([startSubzoneId]);
  const queue: Array<{
    subzoneId: string;
    firstStep: { nextSubzone: ZoneSubzone; passage: ZoneSubzonePassage } | null;
  }> = [{ subzoneId: startSubzoneId, firstStep: null }];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (!current) {
      continue;
    }

    const currentSubzone = subzoneById.get(current.subzoneId);

    if (!currentSubzone) {
      continue;
    }

    for (const passage of currentSubzone.passages) {
      const nextSubzoneId = getConnectedSubzoneId(passage, current.subzoneId);
      const nextSubzone = nextSubzoneId ? subzoneById.get(nextSubzoneId) : undefined;

      if (!nextSubzone || visited.has(nextSubzone.id)) {
        continue;
      }

      const firstStep = current.firstStep ?? {
        nextSubzone,
        passage,
      };

      if (nextSubzone.id === targetSubzoneId) {
        return firstStep;
      }

      visited.add(nextSubzone.id);
      queue.push({
        subzoneId: nextSubzone.id,
        firstStep,
      });
    }
  }

  return null;
}

function getConnectedSubzoneId(
  passage: ZoneSubzonePassage,
  subzoneId: string,
): string | null {
  if (passage.fromSubzoneId === subzoneId) {
    return passage.toSubzoneId;
  }

  if (passage.toSubzoneId === subzoneId) {
    return passage.fromSubzoneId;
  }

  return null;
}

function getSubzoneRoutePosition(
  passage: ZoneSubzonePassage,
  nextSubzone: ZoneSubzone,
): Position {
  if (isPositionInsideSubzone(passage.position, nextSubzone)) {
    return passage.position;
  }

  const candidates = [
    passage.position,
    ...getNavigationNeighborPositions(passage.position),
  ];

  return (
    candidates.find((position) => isPositionInsideSubzone(position, nextSubzone)) ??
    passage.position
  );
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
    ? scoredTargets.find(
        (target) => target.localTarget.poiId === state.localPoiTarget?.poiId,
      )
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
    interactionRange: target.localTarget.interactionRange,
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
    displayName: isTeleportWorking(state, teleport.id)
      ? teleport.id
      : `${teleport.id} (Broken)`,
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
        !isTargetDummyEnemy(entity) &&
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
  const teleport = getNextWorldTravelTeleport(
    state,
    state.currentMapId,
    targetMapId,
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

function createIdlePoi(mapId: DebugMapId): PointOfInterest {
  return {
    id: "hub-idle-city-point",
    category: "idle",
    mapId,
    displayName: "City Square",
    position: IDLE_CITY_POINT,
  };
}

function createObjectivePositionPoi(
  state: GameState,
  questId: QuestId,
  objective: QuestObjectiveDefinition,
  poiId: string,
): PointOfInterest {
  const mapId = state.currentMapId ?? objective.targetMapId ?? MAP_ONE_ID;

  return {
    id: poiId,
    category: "exploration",
    mapId,
    displayName: QUEST_DEFINITIONS[questId].displayName,
    position: objective.targetPosition ?? getMapExplorationTarget(mapId),
    interactionRange: getObjectivePoiInteractionRange(objective),
    linkedQuestId: questId,
    linkedObjectiveId: objective.id,
  };
}

function getObjectivePoiInteractionRange(
  objective: QuestObjectiveDefinition,
): number | undefined {
  if (objective.type === "repair_poi" || objective.type === "defend_area") {
    return QUEST_REPAIR_RANGE;
  }

  return undefined;
}

function createGuideObjectivePoi(
  state: GameState,
  questId: QuestId,
  objective: QuestObjectiveDefinition,
): PointOfInterest {
  const guide =
    objective.guideNpcId ? state.entities[objective.guideNpcId] : undefined;
  const isGuideFollowing =
    guide?.kind === "npc" &&
    guide.npcRole === "quest_guide" &&
    guide.state === "follow";

  return {
    id: objective.guideNpcId ?? `${questId}-${objective.id}-guide-start`,
    category: "npc",
    mapId: state.currentMapId ?? objective.targetMapId ?? MAP_ONE_ID,
    displayName: isGuideFollowing ? "Guard Surveyor" : "Surveyor",
    position:
      guide?.kind === "npc"
        ? guide.position
        : objective.guideStartPosition ??
          objective.targetPosition ??
          getMapExplorationTarget(MAP_ONE_ID),
    interactionRange: DEFAULT_POI_INTERACTION_RANGE,
    targetEntityId: guide?.kind === "npc" ? guide.id : undefined,
    linkedQuestId: questId,
    linkedObjectiveId: objective.id,
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
    interactionRange: poi.interactionRange,
    targetEntityId: poi.targetEntityId,
    questId: details.questId ?? poi.linkedQuestId,
    objectiveId: details.objectiveId ?? poi.linkedObjectiveId,
    reason: details.reason,
  };
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

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
