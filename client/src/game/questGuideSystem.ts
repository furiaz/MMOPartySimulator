import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { createEnemy, createNpc } from "./entities";
import { isSuperiorEnemy, rollEnemyVariantForSpawn } from "./enemyVariants";
import { clearEnemyAbilityRuntimeForEnemy } from "./enemyAbilitySystem";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  QUEST_DEFINITIONS,
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
import {
  mapFiveEnemyStartData,
  mapFourEnemyStartData,
  mapOneEnemyStartData,
  mapSevenEnemyStartData,
  mapSixEnemyStartData,
  mapThreeEnemyStartData,
  mapTwoEnemyStartData,
  slimewardFloorOneEnemyStartData,
  slimewardFloorTwoEnemyStartData,
} from "./debugMap";
import type { DebugMapId, Enemy, NpcEntity, Position } from "./types";
import type { QuestId, QuestObjectiveDefinition } from "./questTypes";
import type { EnemyStartData } from "./debugMap";
import type { SimulationTiming } from "./simulationTiming";

export const QUEST_GUIDE_NPC_ID = "map-1-route-worker";
export const QUEST_GUIDE_START_POSITION: Position = { x: 110, y: 29 };
export const QUEST_GUIDE_TARGET_POI_ID = "lower-shore-route-blockage";
export const QUEST_GUIDE_TARGET_POSITION: Position = { x: 153, y: 29 };
export const QUEST_GUIDE_COMPANION_ESCORT_RANGE = 5;
export const QUEST_GUIDE_ENEMY_PAUSE_RANGE = 3;
export const QUEST_GUIDE_MOVE_SPEED_MULTIPLIER = 1;
export const QUEST_GUIDE_OBJECTIVE_ID = "escort_lower_shore_worker";

const QUEST_GUIDE_COMPLETION_RANGE = 1.5;
export const QUEST_REPAIR_RANGE = 2;
const QUEST_RESCUE_SAFE_RANGE = 8;
const QUEST_RESCUE_COMPLETION_RANGE = 5;
const QUEST_DEFENSE_DEFAULT_RADIUS = 14;
export const QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS = 3_000;

const ENEMY_START_DATA_BY_MAP_ID: Record<DebugMapId, EnemyStartData[]> = {
  hub: [],
  "hub-2": [],
  "map-1": mapOneEnemyStartData,
  "map-2": mapTwoEnemyStartData,
  "map-3": mapThreeEnemyStartData,
  "map-4": mapFourEnemyStartData,
  "map-5": mapFiveEnemyStartData,
  "map-6": mapSixEnemyStartData,
  "map-7": mapSevenEnemyStartData,
  "slimeward-camp": [],
  "slimeward-floor-1": slimewardFloorOneEnemyStartData,
  "slimeward-floor-2": slimewardFloorTwoEnemyStartData,
};

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
  random = Math.random,
): GameState {
  let nextState = restoreDueDefenseSubzoneEnemies(
    state,
    timing?.nowMs ?? Date.now(),
    random,
  );
  const context = getActiveObjectiveContext(nextState);

  if (!context || context.objective.targetMapId !== nextState.currentMapId) {
    return nextState;
  }

  if (context.objective.type === "guide_npc_to_poi") {
    nextState = updateEscortObjective(nextState, context, movedEntityIds);
  } else if (context.objective.type === "rescue_npc") {
    nextState = updateRescueObjective(nextState, context);
  } else if (context.objective.type === "repair_poi") {
    nextState = updateRepairObjective(nextState, context, timing?.deltaMs ?? 0);
  } else if (context.objective.type === "defend_area") {
    nextState = updateDefenseObjective(
      nextState,
      context,
      timing?.deltaMs ?? 0,
      timing?.nowMs ?? Date.now(),
    );
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

export function getActiveQuestGuideObjectiveId(state: GameState): string | null {
  const context = getActiveObjectiveContext(state);

  return context?.objective.type === "guide_npc_to_poi"
    ? context.objective.id
    : null;
}

export function isActiveRepairOrDefenseObjectiveRelevant(state: GameState): boolean {
  const context = getActiveObjectiveContext(state);

  return Boolean(
    context &&
      context.objective.targetMapId === state.currentMapId &&
      state.localPoiTarget?.objectiveId === context.objective.id &&
      (context.objective.type === "repair_poi" ||
        context.objective.type === "defend_area"),
  );
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
    isAnyCompanionWithinEscortRange(nextState, guide.position)
  ) {
    guide = {
      ...guide,
      state: "follow",
    };
    nextState = updateEntity(nextState, guide);
  }

  if (
    guide.state !== "follow" ||
    hasEscortGuideThreat(nextState, guide) ||
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

  return getDistance(leader.position, guide.position) <= QUEST_RESCUE_COMPLETION_RANGE
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
  nowMs: number,
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
  nextState = suppressDefenseSubzoneEnemies(nextState, context);
  nextState = spawnDefenseWaves(nextState, context);
  const wasCompleted = Boolean(
    nextState.quests[context.questId].objectiveProgress[context.objective.id]
      ?.completed,
  );
  nextState = updateRepairObjective(nextState, context, deltaMs);

  if (
    nextState.quests[context.questId].objectiveProgress[context.objective.id]
      ?.completed
  ) {
    nextState = cleanupQuestSpawnedEnemies(nextState, context);
    if (!wasCompleted) {
      nextState = scheduleDefenseSubzoneEnemyRestore(nextState, context, nowMs);
    }
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

  return {
    ...state,
    quests: {
      ...state.quests,
      [context.questId]: {
        ...state.quests[context.questId],
        runtime: {
          ...state.quests[context.questId].runtime,
          defenseStartedObjectiveIds: {
            ...state.quests[context.questId].runtime?.defenseStartedObjectiveIds,
            [context.objective.id]: true,
          },
        },
      },
    },
  };
}

function suppressDefenseSubzoneEnemies(
  state: GameState,
  context: ActiveObjectiveContext,
): GameState {
  if (!context.objective.targetSubzoneId) {
    return state;
  }

  const existingSuppressedEnemies =
    state.quests[context.questId].runtime?.suppressedSubzoneEnemiesByObjectiveId?.[
      context.objective.id
    ] ?? [];
  const existingSuppressedEnemyIds = new Set(
    existingSuppressedEnemies.map((enemy) => enemy.id),
  );
  const enemiesToSuppress = Object.values(state.entities).filter(
    (entity): entity is Enemy =>
      entity.kind === "enemy" &&
      !entity.questSpawn &&
      entity.subzoneId === context.objective.targetSubzoneId,
  );

  if (enemiesToSuppress.length === 0) {
    return state;
  }

  const newSuppressedEnemies = enemiesToSuppress.filter(
    (enemy) => !existingSuppressedEnemyIds.has(enemy.id),
  );
  const suppressedEnemyIds = [
    ...new Set([
      ...(state.quests[context.questId].runtime
        ?.despawnedSubzoneEnemyIdsByObjectiveId?.[context.objective.id] ?? []),
      ...enemiesToSuppress.map((enemy) => enemy.id),
    ]),
  ];
  const nextState = removeEntities(
    state,
    enemiesToSuppress.map((enemy) => enemy.id),
  );

  return {
    ...nextState,
    quests: {
      ...nextState.quests,
      [context.questId]: {
        ...nextState.quests[context.questId],
        runtime: {
          ...nextState.quests[context.questId].runtime,
          despawnedSubzoneEnemyIdsByObjectiveId: {
            ...nextState.quests[context.questId].runtime
              ?.despawnedSubzoneEnemyIdsByObjectiveId,
            [context.objective.id]: suppressedEnemyIds,
          },
          suppressedSubzoneEnemiesByObjectiveId: {
            ...nextState.quests[context.questId].runtime
              ?.suppressedSubzoneEnemiesByObjectiveId,
            [context.objective.id]: [
              ...existingSuppressedEnemies,
              ...newSuppressedEnemies,
            ],
          },
        },
      },
    },
  };
}

function scheduleDefenseSubzoneEnemyRestore(
  state: GameState,
  context: ActiveObjectiveContext,
  nowMs: number,
): GameState {
  return {
    ...state,
    quests: {
      ...state.quests,
      [context.questId]: {
        ...state.quests[context.questId],
        runtime: {
          ...state.quests[context.questId].runtime,
          suppressedSubzoneEnemyRestoreAtMsByObjectiveId: {
            ...state.quests[context.questId].runtime
              ?.suppressedSubzoneEnemyRestoreAtMsByObjectiveId,
            [context.objective.id]:
              nowMs + QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS,
          },
        },
      },
    },
  };
}

function restoreDueDefenseSubzoneEnemies(
  state: GameState,
  nowMs: number,
  random: () => number,
): GameState {
  let nextState = state;

  for (const questId of Object.keys(nextState.quests) as QuestId[]) {
    const quest = nextState.quests[questId];
    const restoreAtByObjectiveId =
      quest.runtime?.suppressedSubzoneEnemyRestoreAtMsByObjectiveId ?? {};

    for (const objective of QUEST_DEFINITIONS[questId].objectives) {
      if (
        objective.type !== "defend_area" ||
        objective.targetMapId !== nextState.currentMapId ||
        !quest.objectiveProgress[objective.id]?.completed
      ) {
        continue;
      }

      const restoreAtMs = restoreAtByObjectiveId[objective.id];
      const hasSuppressedEnemies = Boolean(
        quest.runtime?.suppressedSubzoneEnemiesByObjectiveId?.[objective.id]
          ?.length ||
          quest.runtime?.despawnedSubzoneEnemyIdsByObjectiveId?.[objective.id]
            ?.length,
      );

      if (restoreAtMs === undefined) {
        if (hasSuppressedEnemies) {
          nextState = scheduleDefenseSubzoneEnemyRestore(
            nextState,
            { questId, objective },
            nowMs,
          );
        }
        continue;
      }

      if (nowMs < restoreAtMs) {
        continue;
      }

      nextState = restoreDefenseSubzoneEnemies(
        nextState,
        { questId, objective },
        random,
      );
      nextState = clearDefenseSubzoneEnemyRestoreRuntime(
        nextState,
        questId,
        objective.id,
      );
    }
  }

  return nextState;
}

function restoreDefenseSubzoneEnemies(
  state: GameState,
  context: ActiveObjectiveContext,
  random: () => number,
): GameState {
  const suppressedEnemies =
    state.quests[context.questId].runtime?.suppressedSubzoneEnemiesByObjectiveId?.[
      context.objective.id
    ] ?? [];
  const legacySuppressedEnemyIds =
    state.quests[context.questId].runtime?.despawnedSubzoneEnemyIdsByObjectiveId?.[
      context.objective.id
    ] ?? [];
  const enemiesToRestoreById = new Map<string, Enemy>();

  for (const enemy of suppressedEnemies) {
    enemiesToRestoreById.set(enemy.id, enemy);
  }

  for (const enemyId of legacySuppressedEnemyIds) {
    if (enemiesToRestoreById.has(enemyId)) {
      continue;
    }

    const enemy = createEnemyFromStartData(
      context.objective.targetMapId,
      enemyId,
    );
    if (enemy) {
      enemiesToRestoreById.set(enemy.id, enemy);
    }
  }

  let nextState = state;

  for (const enemy of enemiesToRestoreById.values()) {
    if (nextState.entities[enemy.id]) {
      continue;
    }

    const restoredEnemy = restoreSuppressedEnemy(
      nextState,
      enemy,
      random,
    );
    nextState = addEntity(nextState, restoredEnemy);
    nextState = clearEnemyRuntimeState(nextState, restoredEnemy.id);

    if (isSuperiorEnemy(restoredEnemy)) {
      nextState = appendDebugTelemetryEvent(nextState, {
        type: "superior_enemy_spawned",
        entityId: restoredEnemy.id,
        currentMapId: nextState.currentMapId,
        currentMapDisplayName: nextState.map?.displayName,
        currentMapDebugName: nextState.map?.debugName,
        enemyTypeId: restoredEnemy.enemyTypeId,
        enemyArchetypeId: restoredEnemy.archetypeId,
        enemyVariant: restoredEnemy.variant,
        enemyPosition: restoredEnemy.position,
        enemyLevel: restoredEnemy.level,
        reason: "respawn",
      });
    }
  }

  return nextState;
}

function restoreSuppressedEnemy(
  state: GameState,
  enemy: Enemy,
  random: () => number,
): Enemy {
  const variant = rollEnemyVariantForSpawn({
    currentMapId: state.currentMapId,
    map: state.map,
    position: enemy.homePosition,
    subzoneId: enemy.subzoneId,
    existingEntities: state.entities,
    random,
  });
  const restoredEnemy = createEnemy(
    enemy.id,
    enemy.homePosition,
    enemy.aggressionMode,
    {
      archetypeId: enemy.archetypeId,
      enemyTypeId: enemy.enemyTypeId,
      level: enemy.level,
      xpReward: enemy.xpReward,
      attackCooldownMs: enemy.attackCooldownMs,
      attackRange: enemy.attackRange,
      combatBodyRadius: enemy.combatBodyRadius,
      subzoneId: enemy.subzoneId,
      encounterAreaId: enemy.encounterAreaId,
      variant,
    },
  );

  return {
    ...restoredEnemy,
    debugSpawn: enemy.debugSpawn,
    roamTargetPosition: null,
    nextRoamAt: enemy.nextRoamAt,
  };
}

function createEnemyFromStartData(
  mapId: DebugMapId | undefined,
  enemyId: string,
): Enemy | null {
  if (!mapId) {
    return null;
  }

  const enemyStart = ENEMY_START_DATA_BY_MAP_ID[mapId].find(
    (candidate) => candidate.id === enemyId,
  );

  if (!enemyStart) {
    return null;
  }

  return createEnemy(enemyStart.id, enemyStart.position, undefined, {
    enemyTypeId: enemyStart.enemyTypeId,
    subzoneId: enemyStart.subzoneId,
    encounterAreaId: enemyStart.encounterAreaId,
    variant: enemyStart.variant,
    combatBodyRadius: enemyStart.combatBodyRadius,
    maxHealth: enemyStart.enemyTypeId === "azure_mass" ? 900 : undefined,
    xpReward: enemyStart.enemyTypeId === "azure_mass" ? 160 : undefined,
  });
}

function clearDefenseSubzoneEnemyRestoreRuntime(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
): GameState {
  const quest = state.quests[questId];
  const despawnedSubzoneEnemyIdsByObjectiveId = {
    ...(quest.runtime?.despawnedSubzoneEnemyIdsByObjectiveId ?? {}),
  };
  const suppressedSubzoneEnemiesByObjectiveId = {
    ...(quest.runtime?.suppressedSubzoneEnemiesByObjectiveId ?? {}),
  };
  const suppressedSubzoneEnemyRestoreAtMsByObjectiveId = {
    ...(quest.runtime?.suppressedSubzoneEnemyRestoreAtMsByObjectiveId ?? {}),
  };

  delete despawnedSubzoneEnemyIdsByObjectiveId[objectiveId];
  delete suppressedSubzoneEnemiesByObjectiveId[objectiveId];
  delete suppressedSubzoneEnemyRestoreAtMsByObjectiveId[objectiveId];

  return {
    ...state,
    quests: {
      ...state.quests,
      [questId]: {
        ...quest,
        runtime: {
          ...quest.runtime,
          despawnedSubzoneEnemyIdsByObjectiveId,
          suppressedSubzoneEnemiesByObjectiveId,
          suppressedSubzoneEnemyRestoreAtMsByObjectiveId,
        },
      },
    },
  };
}

function clearEnemyRuntimeState(state: GameState, enemyId: string): GameState {
  const skillMarksByEnemyId = { ...(state.skillMarksByEnemyId ?? {}) };
  const skillBindsByEnemyId = { ...(state.skillBindsByEnemyId ?? {}) };
  delete skillMarksByEnemyId[enemyId];
  delete skillBindsByEnemyId[enemyId];

  return clearEnemyAbilityRuntimeForEnemy({
    ...state,
    skillMarksByEnemyId,
    skillBindsByEnemyId,
  }, enemyId);
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

function hasEscortGuideThreat(state: GameState, guide: NpcEntity): boolean {
  const livingPartyMemberIds = new Set(
    getPartyMembers(state)
      .filter((member) => member.state !== "dead")
      .map((member) => member.id),
  );

  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "enemy" &&
      entity.state !== "dead" &&
      (getDistance(entity.position, guide.position) <=
        QUEST_GUIDE_ENEMY_PAUSE_RANGE ||
        entity.currentTargetId === guide.id ||
        (entity.currentTargetId !== null &&
          livingPartyMemberIds.has(entity.currentTargetId))),
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
      getDistance(member.position, position) <=
        QUEST_GUIDE_COMPANION_ESCORT_RANGE,
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
