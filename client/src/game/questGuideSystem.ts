import { createEnemy, createNpc } from "./entities";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  completeQuestObjective,
  getActiveQuest,
  getFirstIncompleteObjective,
  recordQuestPoiReachedForQuests,
  recordQuestRepairProgress,
} from "./questSystem";
import {
  addEntity,
  updateEntity,
  type GameState,
} from "./state";
import { pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { isPositionInsideSubzone } from "./subzoneSystem";
import type { NpcEntity, Position } from "./types";
import type { QuestId, QuestObjectiveDefinition } from "./questTypes";
import type { SimulationTiming } from "./simulationTiming";

export const QUEST_GUIDE_NPC_ID = "map-1-route-worker";
export const QUEST_GUIDE_START_POSITION: Position = { x: 110, y: 29 };
export const QUEST_GUIDE_TARGET_POI_ID = "lower-shore-route-blockage";
export const QUEST_GUIDE_TARGET_POSITION: Position = { x: 153, y: 29 };
export const QUEST_GUIDE_ESCORT_RANGE = 7;
export const QUEST_GUIDE_MOVE_SPEED_MULTIPLIER = 0.7;
export const QUEST_GUIDE_OBJECTIVE_ID = "escort_lower_shore_worker";

const QUEST_GUIDE_CONTACT_RANGE = 1.5;
const QUEST_GUIDE_COMPLETION_RANGE = 1.5;
export const QUEST_REPAIR_RANGE = 2;
const QUEST_RESCUE_SAFE_RANGE = 8;
const QUEST_DEFENSE_DEFAULT_RADIUS = 14;

type ActiveObjectiveContext = {
  questId: QuestId;
  objective: QuestObjectiveDefinition;
};

export function createQuestGuideNpc(): NpcEntity {
  return createNpc(
    QUEST_GUIDE_NPC_ID,
    QUEST_GUIDE_START_POSITION,
    "Route Worker",
    "quest_guide",
  );
}

export function createActiveQuestGuideNpc(
  state: GameState,
  mapId: string,
): NpcEntity | null {
  const context = getActiveObjectiveContext(state);

  if (
    !context ||
    !isQuestNpcObjective(context.objective) ||
    context.objective.targetMapId !== mapId
  ) {
    return null;
  }

  return createNpc(
    getQuestNpcId(context.objective),
    context.objective.guideStartPosition ??
      context.objective.targetPosition ??
      getObjectiveTargetPosition(context.objective),
    context.objective.npcDisplayName ?? "Guide",
    "quest_guide",
  );
}

export function shouldSpawnQuestGuide(state: GameState, mapId: string): boolean {
  const context = getActiveObjectiveContext(state);

  return Boolean(
    context &&
      isQuestNpcObjective(context.objective) &&
      context.objective.targetMapId === mapId,
  );
}

export function getActiveQuestGuide(state: GameState): NpcEntity | null {
  const context = getActiveObjectiveContext(state);

  if (!context || !isQuestNpcObjective(context.objective)) {
    return null;
  }

  const guide = state.entities[getQuestNpcId(context.objective)];

  return guide?.kind === "npc" && guide.npcRole === "quest_guide"
    ? guide
    : null;
}

export function updateQuestGuideSystem(
  state: GameState,
  movedEntityIds: Set<string>,
  timing?: SimulationTiming,
): GameState {
  const context = getActiveObjectiveContext(state);

  if (!context || context.objective.targetMapId !== state.currentMapId) {
    return state;
  }

  let nextState = state;

  if (context.objective.type === "guide_npc_to_poi") {
    nextState = updateEscortObjective(nextState, context, movedEntityIds);
  } else if (context.objective.type === "rescue_npc") {
    nextState = updateRescueObjective(nextState, context);
  } else if (context.objective.type === "repair_poi") {
    nextState = updateRepairObjective(nextState, context, timing?.deltaMs ?? 0);
  } else if (context.objective.type === "defend_area") {
    nextState = updateDefenseObjective(nextState, context, timing?.deltaMs ?? 0);
  } else if (context.objective.type === "defeat_elite") {
    nextState = ensureEliteSpawned(nextState, context);
  } else if (context.objective.type === "unlock_route") {
    nextState = completeQuestObjective(nextState, context.questId, context.objective.id);
  }

  return nextState;
}

export function isQuestGuideObjectiveRelevant(state: GameState): boolean {
  const context = getActiveObjectiveContext(state);

  return Boolean(context && isQuestNpcObjective(context.objective));
}

function updateEscortObjective(
  state: GameState,
  context: ActiveObjectiveContext,
  movedEntityIds: Set<string>,
): GameState {
  const leader = getPartyLeader(state);

  if (!leader) {
    return state;
  }

  let nextState = ensureQuestNpc(state, context.objective);
  let guide = getActiveQuestGuide(nextState);

  if (!guide) {
    return nextState;
  }

  const targetPosition = getObjectiveTargetPosition(context.objective);

  if (isAtPosition(guide.position, targetPosition)) {
    return recordQuestPoiReachedForQuests(
      nextState,
      context.objective.targetPoiId ?? context.objective.id,
      nextState.currentMapId,
    );
  }

  if (
    guide.state !== "follow" &&
    getDistance(leader.position, guide.position) <= QUEST_GUIDE_CONTACT_RANGE
  ) {
    guide = {
      ...guide,
      state: "follow",
    };
    nextState = updateEntity(nextState, guide);
  }

  if (
    guide.state !== "follow" ||
    hasNearbyLivingEnemies(nextState, guide.position, QUEST_GUIDE_ESCORT_RANGE) ||
    !isAnyCompanionWithinEscortRange(nextState, guide.position)
  ) {
    return nextState;
  }

  nextState = moveEntityTowardPositionIfUnoccupied(nextState, guide, targetPosition, {
    allowPartyPassThrough: true,
    pathProfile: "poi",
    pathTargetKey: `quest-guide:${context.questId}:${context.objective.id}`,
    pathTargetPosition: targetPosition,
    speedMultiplier: QUEST_GUIDE_MOVE_SPEED_MULTIPLIER,
  });
  movedEntityIds.add(guide.id);

  const movedGuide = nextState.entities[guide.id];

  return movedGuide?.kind === "npc" && isAtPosition(movedGuide.position, targetPosition)
    ? recordQuestPoiReachedForQuests(
        nextState,
        context.objective.targetPoiId ?? context.objective.id,
        nextState.currentMapId,
      )
    : nextState;
}

function updateRescueObjective(
  state: GameState,
  context: ActiveObjectiveContext,
): GameState {
  const nextState = ensureQuestNpc(state, context.objective);
  const guide = getActiveQuestGuide(nextState);
  const leader = getPartyLeader(nextState);

  if (!guide || !leader) {
    return nextState;
  }

  if (hasNearbyLivingEnemies(nextState, guide.position, QUEST_RESCUE_SAFE_RANGE)) {
    return nextState;
  }

  return getDistance(leader.position, guide.position) <= QUEST_REPAIR_RANGE
    ? recordQuestPoiReachedForQuests(
        nextState,
        context.objective.targetPoiId ?? context.objective.id,
        nextState.currentMapId,
      )
    : nextState;
}

function updateRepairObjective(
  state: GameState,
  context: ActiveObjectiveContext,
  deltaMs: number,
): GameState {
  const targetPosition = getObjectiveTargetPosition(context.objective);
  const actor = getRepairActor(state, targetPosition);

  if (!actor || isEntityTargetedByEnemy(state, actor.id)) {
    return state;
  }

  const previousProgress =
    state.quests[context.questId].runtime?.repairProgressMsByObjectiveId?.[
      context.objective.id
    ] ?? 0;

  return recordQuestRepairProgress(
    state,
    context.questId,
    context.objective.id,
    previousProgress + deltaMs,
  );
}

function updateDefenseObjective(
  state: GameState,
  context: ActiveObjectiveContext,
  deltaMs: number,
): GameState {
  const targetPosition = getObjectiveTargetPosition(context.objective);
  const hasStarted = Boolean(
    state.quests[context.questId].runtime?.defenseStartedObjectiveIds?.[
      context.objective.id
    ],
  );

  if (!hasStarted && !getRepairActor(state, targetPosition)) {
    return state;
  }

  let nextState = startDefenseObjective(state, context);
  nextState = spawnDefenseWaves(nextState, context);
  nextState = updateRepairObjective(nextState, context, deltaMs);

  if (
    nextState.quests[context.questId].objectiveProgress[context.objective.id]
      ?.completed
  ) {
    nextState = cleanupQuestSpawnedEnemies(nextState, context);
  }

  return nextState;
}

function startDefenseObjective(
  state: GameState,
  context: ActiveObjectiveContext,
): GameState {
  const quest = state.quests[context.questId];

  if (quest.runtime?.defenseStartedObjectiveIds?.[context.objective.id]) {
    return state;
  }

  const despawnedEnemyIds = Object.values(state.entities)
    .filter(
      (entity) =>
        entity.kind === "enemy" &&
        entity.state !== "dead" &&
        !entity.questSpawn &&
        entity.subzoneId === context.objective.targetSubzoneId,
    )
    .map((enemy) => enemy.id);
  let nextState = removeEntities(state, despawnedEnemyIds);

  nextState = {
    ...nextState,
    quests: {
      ...nextState.quests,
      [context.questId]: {
        ...nextState.quests[context.questId],
        runtime: {
          ...nextState.quests[context.questId].runtime,
          defenseStartedObjectiveIds: {
            ...nextState.quests[context.questId].runtime?.defenseStartedObjectiveIds,
            [context.objective.id]: true,
          },
          despawnedSubzoneEnemyIdsByObjectiveId: {
            ...nextState.quests[context.questId].runtime
              ?.despawnedSubzoneEnemyIdsByObjectiveId,
            [context.objective.id]: despawnedEnemyIds,
          },
        },
      },
    },
  };

  return nextState;
}

function spawnDefenseWaves(
  state: GameState,
  context: ActiveObjectiveContext,
): GameState {
  const durationMs = context.objective.repairDurationMs ?? 1;
  const progressMs =
    state.quests[context.questId].runtime?.repairProgressMsByObjectiveId?.[
      context.objective.id
    ] ?? 0;
  const progressPercent = Math.floor((progressMs / durationMs) * 100);
  let nextState = state;

  for (const wavePercent of context.objective.waveProgressPercents ?? [0]) {
    if (progressPercent < wavePercent) {
      continue;
    }

    const waveKey = `${context.objective.id}:${wavePercent}`;
    const spawnedWaves =
      nextState.quests[context.questId].runtime?.defenseSpawnedWaveKeys ?? {};

    if (spawnedWaves[waveKey]) {
      continue;
    }

    nextState = spawnQuestEnemyWave(nextState, context, wavePercent);
    nextState = {
      ...nextState,
      quests: {
        ...nextState.quests,
        [context.questId]: {
          ...nextState.quests[context.questId],
          runtime: {
            ...nextState.quests[context.questId].runtime,
            defenseSpawnedWaveKeys: {
              ...nextState.quests[context.questId].runtime?.defenseSpawnedWaveKeys,
              [waveKey]: true,
            },
          },
        },
      },
    };
  }

  return nextState;
}

function spawnQuestEnemyWave(
  state: GameState,
  context: ActiveObjectiveContext,
  wavePercent: number,
): GameState {
  let nextState = state;
  const targetPosition = getObjectiveTargetPosition(context.objective);
  const spawnPositions = getQuestEnemySpawnPositions(
    nextState,
    context.objective,
    targetPosition,
  );
  let spawnIndex = 0;

  for (const enemyDefinition of context.objective.questSpawnEnemies ?? []) {
    for (let count = 0; count < (enemyDefinition.count ?? 1); count += 1) {
      const spawnPosition = spawnPositions[spawnIndex % spawnPositions.length] ??
        targetPosition;
      const enemyId = `quest-${context.questId}-${context.objective.id}-${wavePercent}-${spawnIndex}`;
      const enemy = createEnemy(enemyId, spawnPosition, "aggressive", {
        enemyTypeId: enemyDefinition.enemyTypeId,
        archetypeId: enemyDefinition.enemyArchetypeId,
        level: enemyDefinition.level,
        subzoneId: context.objective.targetSubzoneId,
        questSpawn: {
          questId: context.questId,
          objectiveId: context.objective.id,
          targetPosition,
          suppressNormalDrops: true,
        },
      });

      nextState = addEntity(nextState, enemy);
      nextState = appendQuestSpawnedEnemy(nextState, context, enemy.id);
      spawnIndex += 1;
    }
  }

  return nextState;
}

function ensureEliteSpawned(
  state: GameState,
  context: ActiveObjectiveContext,
): GameState {
  const spawnedIds =
    state.quests[context.questId].runtime?.questSpawnedEnemyIdsByObjectiveId?.[
      context.objective.id
    ] ?? [];

  if (
    spawnedIds.some((id) => {
      const entity = state.entities[id];
      return entity?.kind === "enemy" && entity.state !== "dead";
    })
  ) {
    return state;
  }

  const eliteDefinition = context.objective.eliteEnemy;

  if (!eliteDefinition) {
    return state;
  }

  const targetPosition =
    context.objective.eliteSpawnPosition ?? getObjectiveTargetPosition(context.objective);
  const enemyId = `quest-${context.questId}-${context.objective.id}-elite`;
  const elite = createEnemy(enemyId, targetPosition, "aggressive", {
    enemyTypeId: eliteDefinition.enemyTypeId,
    archetypeId: eliteDefinition.enemyArchetypeId,
    level: eliteDefinition.level,
    maxHealth: undefined,
    subzoneId: context.objective.targetSubzoneId,
    questSpawn: {
      questId: context.questId,
      objectiveId: context.objective.id,
      targetPosition,
      isElite: true,
      suppressNormalDrops: true,
    },
  });

  return appendQuestSpawnedEnemy(addEntity(state, elite), context, elite.id);
}

function cleanupQuestSpawnedEnemies(
  state: GameState,
  context: ActiveObjectiveContext,
): GameState {
  const enemyIds =
    state.quests[context.questId].runtime?.questSpawnedEnemyIdsByObjectiveId?.[
      context.objective.id
    ] ?? [];

  return removeEntities(
    state,
    enemyIds.filter((id) => {
      const entity = state.entities[id];
      return entity?.kind === "enemy" && entity.state !== "dead";
    }),
  );
}

function appendQuestSpawnedEnemy(
  state: GameState,
  context: ActiveObjectiveContext,
  enemyId: string,
): GameState {
  const currentIds =
    state.quests[context.questId].runtime?.questSpawnedEnemyIdsByObjectiveId?.[
      context.objective.id
    ] ?? [];

  return {
    ...state,
    quests: {
      ...state.quests,
      [context.questId]: {
        ...state.quests[context.questId],
        runtime: {
          ...state.quests[context.questId].runtime,
          questSpawnedEnemyIdsByObjectiveId: {
            ...state.quests[context.questId].runtime?.questSpawnedEnemyIdsByObjectiveId,
            [context.objective.id]: [...currentIds, enemyId],
          },
        },
      },
    },
  };
}

function ensureQuestNpc(
  state: GameState,
  objective: QuestObjectiveDefinition,
): GameState {
  const npcId = getQuestNpcId(objective);
  const existing = state.entities[npcId];

  if (existing?.kind === "npc") {
    return state;
  }

  return addEntity(
    state,
    createNpc(
      npcId,
      objective.guideStartPosition ?? getObjectiveTargetPosition(objective),
      objective.npcDisplayName ?? "Surveyor",
      "quest_guide",
    ),
  );
}

function getActiveObjectiveContext(state: GameState): ActiveObjectiveContext | null {
  const activeQuest = getActiveQuest(state);

  if (!activeQuest || activeQuest.status !== "active") {
    return null;
  }

  const objective = getFirstIncompleteObjective(state, activeQuest.questId);

  return objective
    ? {
        questId: activeQuest.questId,
        objective,
      }
    : null;
}

function isQuestNpcObjective(objective: QuestObjectiveDefinition): boolean {
  return objective.type === "guide_npc_to_poi" || objective.type === "rescue_npc";
}

function getQuestNpcId(objective: QuestObjectiveDefinition): string {
  return objective.guideNpcId ?? `${objective.id}-npc`;
}

function getObjectiveTargetPosition(objective: QuestObjectiveDefinition): Position {
  return (
    objective.guideTargetPosition ??
    objective.targetPosition ??
    objective.eliteSpawnPosition ??
    { x: 1, y: 1 }
  );
}

function getRepairActor(
  state: GameState,
  targetPosition: Position,
): { id: string; position: Position } | null {
  const candidates = [
    ...Object.values(state.entities).filter(
      (entity): entity is NpcEntity =>
        entity.kind === "npc" &&
        entity.npcRole === "quest_guide" &&
        getDistance(entity.position, targetPosition) <= QUEST_REPAIR_RANGE,
    ),
    ...getPartyMembers(state).filter(
      (member) =>
        member.state !== "dead" &&
        getDistance(member.position, targetPosition) <= QUEST_REPAIR_RANGE,
    ),
  ];

  return candidates.sort(
    (first, second) =>
      getDistance(first.position, targetPosition) -
      getDistance(second.position, targetPosition),
  )[0] ?? null;
}

function hasNearbyLivingEnemies(
  state: GameState,
  position: Position,
  range: number,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "enemy" &&
      entity.state !== "dead" &&
      getDistance(entity.position, position) <= range,
  );
}

function isEntityTargetedByEnemy(state: GameState, entityId: string): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "enemy" &&
      entity.state !== "dead" &&
      entity.currentTargetId === entityId,
  );
}

function isAnyCompanionWithinEscortRange(
  state: GameState,
  position: Position,
): boolean {
  return getPartyMembers(state).some(
    (member) =>
      member.state !== "dead" &&
      getDistance(member.position, position) <= QUEST_GUIDE_ESCORT_RANGE,
  );
}

function getQuestEnemySpawnPositions(
  state: GameState,
  objective: QuestObjectiveDefinition,
  targetPosition: Position,
): Position[] {
  const subzone = state.map?.subzones?.find(
    (candidate) => candidate.id === objective.targetSubzoneId,
  );
  const radius = objective.defenseRadius ?? QUEST_DEFENSE_DEFAULT_RADIUS;
  const candidates = [
    { x: targetPosition.x - radius, y: targetPosition.y - radius * 0.8 },
    { x: targetPosition.x - radius, y: targetPosition.y + radius * 0.8 },
    { x: targetPosition.x + radius, y: targetPosition.y - radius * 0.8 },
    { x: targetPosition.x + radius, y: targetPosition.y + radius * 0.8 },
  ].map((position) => ({
    x: Math.round(position.x),
    y: Math.round(position.y),
  }));

  if (!subzone) {
    return candidates;
  }

  return candidates.map((position) => {
    const clamped = {
      x: Math.min(
        subzone.bounds.x + subzone.bounds.width - 2,
        Math.max(subzone.bounds.x + 1, position.x),
      ),
      y: Math.min(
        subzone.bounds.y + subzone.bounds.height - 2,
        Math.max(subzone.bounds.y + 1, position.y),
      ),
    };

    return isPositionInsideSubzone(clamped, subzone) ? clamped : targetPosition;
  });
}

function removeEntities(state: GameState, entityIds: string[]): GameState {
  if (entityIds.length === 0) {
    return state;
  }

  const entities = { ...state.entities };
  const followTrailsByEntityId = { ...state.followTrailsByEntityId };

  for (const entityId of entityIds) {
    delete entities[entityId];
    delete followTrailsByEntityId[entityId];
  }

  return pruneMissingEntityRuntimeState({
    ...state,
    entities,
    followTrailsByEntityId,
  });
}

function isAtPosition(position: Position, target: Position): boolean {
  return getDistance(position, target) <= QUEST_GUIDE_COMPLETION_RANGE;
}

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
