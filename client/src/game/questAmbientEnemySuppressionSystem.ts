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
  type EnemyStartData,
} from "./debugMap";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { clearEnemyAbilityRuntimeForEnemy } from "./enemyAbilitySystem";
import { createEnemy } from "./entities";
import { isSuperiorEnemy, rollEnemyVariantForSpawn } from "./enemyVariants";
import { pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { findClosestAvailablePosition } from "./movementPlanning";
import { QUEST_DEFINITIONS, QUEST_ORDER } from "./questSystem";
import { addEntity, type GameState } from "./state";
import type {
  QuestAmbientEnemySuppressionConfig,
  QuestAmbientEnemySuppressionRuntime,
  QuestId,
  QuestObjectiveDefinition,
  QuestState,
} from "./questTypes";
import type { DebugMapId, Enemy } from "./types";

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

type SuppressionContext = {
  questId: QuestId;
  objective: QuestObjectiveDefinition;
  config: QuestAmbientEnemySuppressionConfig;
  groupId: string;
  targetMapId: DebugMapId;
};

export function beginQuestAmbientEnemySuppression(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
): GameState {
  const context = getSuppressionContext(questId, objectiveId);

  if (!context) {
    return state;
  }

  const current = getSuppressionRuntime(state, context);
  const compatibleCurrent =
    current && isRuntimeCompatibleWithContext(current, context)
      ? current
      : undefined;
  const runtime: QuestAmbientEnemySuppressionRuntime = {
    targetMapId: context.targetMapId,
    ...(context.config.scope === "subzone"
      ? { targetSubzoneId: context.objective.targetSubzoneId }
      : {}),
    scope: context.config.scope,
    restoreDelayMs: context.config.restoreDelayMs,
    variantPolicy: context.config.variantPolicy,
    activeObjectiveIds: [
      ...new Set([
        ...(compatibleCurrent?.activeObjectiveIds ?? []),
        objectiveId,
      ]),
    ],
    enemySnapshots: compatibleCurrent?.enemySnapshots ?? [],
  };
  const nextState = setSuppressionRuntime(state, context, runtime);

  return suppressMatchingAmbientEnemies(nextState, context, runtime);
}

export function releaseQuestAmbientEnemySuppression(
  state: GameState,
  questId: QuestId,
  objectiveId: string,
  nowMs: number,
): GameState {
  const context = getSuppressionContext(questId, objectiveId);

  if (!context) {
    return state;
  }

  const current = getSuppressionRuntime(state, context);

  if (!current) {
    return state;
  }

  if (!current.activeObjectiveIds.includes(objectiveId)) {
    return state;
  }

  const activeObjectiveIds = current.activeObjectiveIds.filter(
    (activeObjectiveId) => activeObjectiveId !== objectiveId,
  );

  return setSuppressionRuntime(state, context, {
    ...current,
    activeObjectiveIds,
    restoreAtMs:
      activeObjectiveIds.length === 0
        ? nowMs + current.restoreDelayMs
        : undefined,
  });
}

export function clearQuestAmbientEnemySuppressionGroup(
  state: GameState,
  questId: QuestId,
  groupId: string,
  restoreEnemies: boolean,
  random = Math.random,
): GameState {
  const runtime =
    state.quests[questId]?.runtime?.ambientEnemySuppressionsByGroupId?.[
      groupId
    ];

  if (!runtime) {
    return state;
  }

  const restoredState = restoreEnemies
    ? restoreSuppressedEnemies(state, runtime, random)
    : state;

  return deleteSuppressionRuntime(restoredState, questId, groupId);
}

export function updateQuestAmbientEnemySuppressionSystem(
  state: GameState,
  nowMs: number,
  random = Math.random,
): GameState {
  let nextState = state;

  for (const questId of QUEST_ORDER) {
    const groupIds = Object.keys(
      nextState.quests[questId]?.runtime
        ?.ambientEnemySuppressionsByGroupId ?? {},
    ).sort();

    for (const groupId of groupIds) {
      let runtime =
        nextState.quests[questId]?.runtime
          ?.ambientEnemySuppressionsByGroupId?.[groupId];

      if (!runtime) {
        continue;
      }

      const context = getSuppressionContextForGroup(questId, groupId);

      if (!context || !isRuntimeCompatibleWithContext(runtime, context)) {
        nextState = clearQuestAmbientEnemySuppressionGroup(
          nextState,
          questId,
          groupId,
          runtime.targetMapId === nextState.currentMapId,
          random,
        );
        continue;
      }

      const quest = nextState.quests[questId];
      const activeObjectiveIds = runtime.activeObjectiveIds.filter(
        (objectiveId) =>
          getSuppressionContext(questId, objectiveId) !== null &&
          !quest.objectiveProgress[objectiveId]?.completed,
      );

      if (activeObjectiveIds.length !== runtime.activeObjectiveIds.length) {
        runtime = {
          ...runtime,
          activeObjectiveIds,
          restoreAtMs:
            activeObjectiveIds.length > 0
              ? undefined
              : nowMs + runtime.restoreDelayMs,
        };
        nextState = setSuppressionRuntime(nextState, context, runtime);
      }

      if (runtime.activeObjectiveIds.length > 0) {
        nextState = suppressMatchingAmbientEnemies(
          nextState,
          context,
          runtime,
        );
        continue;
      }

      if (runtime.restoreAtMs === undefined) {
        nextState = setSuppressionRuntime(nextState, context, {
          ...runtime,
          restoreAtMs: nowMs + runtime.restoreDelayMs,
        });
        continue;
      }

      if (nowMs < runtime.restoreAtMs) {
        continue;
      }

      nextState = clearQuestAmbientEnemySuppressionGroup(
        nextState,
        questId,
        groupId,
        runtime.targetMapId === nextState.currentMapId,
        random,
      );
    }
  }

  return nextState;
}

export function sanitizeQuestAmbientEnemySuppressionsAfterLoad(
  state: GameState,
  nowMs: number,
): GameState {
  let nextState = state;

  for (const questId of QUEST_ORDER) {
    const quest = nextState.quests[questId];
    const legacySnapshots =
      quest.runtime?.suppressedSubzoneEnemiesByObjectiveId ?? {};
    const legacyIds =
      quest.runtime?.despawnedSubzoneEnemyIdsByObjectiveId ?? {};
    const legacyRestoreTimes =
      quest.runtime?.suppressedSubzoneEnemyRestoreAtMsByObjectiveId ?? {};
    const nextGroups: Record<string, QuestAmbientEnemySuppressionRuntime> = {};

    for (const [groupId, value] of Object.entries(
      quest.runtime?.ambientEnemySuppressionsByGroupId ?? {},
    )) {
      const context = getSuppressionContextForGroup(questId, groupId);
      const sanitized = context
        ? sanitizeSuppressionRuntime(value, context, quest)
        : null;

      if (sanitized && context) {
        if (
          sanitized.activeObjectiveIds.length === 0 &&
          sanitized.restoreAtMs === undefined
        ) {
          if (sanitized.targetMapId === nextState.currentMapId) {
            nextState = restoreSuppressedEnemies(
              nextState,
              sanitized,
              Math.random,
            );
          }
        } else {
          nextGroups[context.groupId] = mergeSuppressionRuntime(
            nextGroups[context.groupId],
            sanitized,
          );
        }
      } else {
        const recoverableRuntime = getRecoverableSuppressionRuntime(
          value,
          context,
        );

        if (
          recoverableRuntime &&
          recoverableRuntime.targetMapId === nextState.currentMapId
        ) {
          nextState = restoreSuppressedEnemies(
            nextState,
            recoverableRuntime,
            Math.random,
          );
        }
      }
    }

    for (const objective of QUEST_DEFINITIONS[questId].objectives) {
      const context = getSuppressionContext(questId, objective.id);

      if (!context) {
        continue;
      }

      const snapshots = [
        ...(Array.isArray(legacySnapshots[objective.id])
          ? legacySnapshots[objective.id].filter(isRestorableAmbientEnemy)
          : []),
      ];
      const snapshotIds = new Set(snapshots.map((enemy) => enemy.id));

      for (const enemyId of Array.isArray(legacyIds[objective.id])
        ? legacyIds[objective.id]
        : []) {
        if (typeof enemyId !== "string" || snapshotIds.has(enemyId)) {
          continue;
        }

        const enemy = createEnemyFromStartData(context.targetMapId, enemyId);
        if (enemy) {
          snapshots.push(enemy);
          snapshotIds.add(enemy.id);
        }
      }

      if (snapshots.length === 0) {
        continue;
      }

      const existing = nextGroups[context.groupId];
      const progress = quest.objectiveProgress[objective.id];
      const isActive =
        quest.status === "active" &&
        quest.runtime?.defenseStartedObjectiveIds?.[objective.id] === true &&
        !progress?.completed;
      const legacyRestoreAtMs = legacyRestoreTimes[objective.id];
      nextGroups[context.groupId] = mergeSuppressionRuntime(
        existing,
        createRuntimeFromContext(context, {
          activeObjectiveIds: isActive ? [objective.id] : [],
          enemySnapshots: snapshots,
          restoreAtMs: isActive
            ? undefined
            : Number.isFinite(legacyRestoreAtMs)
              ? legacyRestoreAtMs
              : nowMs + context.config.restoreDelayMs,
        }),
      );
    }

    const runtime = { ...quest.runtime };
    delete runtime.despawnedSubzoneEnemyIdsByObjectiveId;
    delete runtime.suppressedSubzoneEnemiesByObjectiveId;
    delete runtime.suppressedSubzoneEnemyRestoreAtMsByObjectiveId;
    runtime.ambientEnemySuppressionsByGroupId = nextGroups;
    nextState = {
      ...nextState,
      quests: {
        ...nextState.quests,
        [questId]: {
          ...quest,
          runtime,
        },
      },
    };
  }

  return nextState;
}

function suppressMatchingAmbientEnemies(
  state: GameState,
  context: SuppressionContext,
  runtime: QuestAmbientEnemySuppressionRuntime,
): GameState {
  if (state.currentMapId !== runtime.targetMapId) {
    return state;
  }

  const enemies = Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        entity.kind === "enemy" &&
        !entity.isTargetDummy &&
        !entity.questSpawn &&
        (runtime.scope === "map" ||
          entity.subzoneId === runtime.targetSubzoneId),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  if (enemies.length === 0) {
    return state;
  }

  const snapshotsById = new Map(
    runtime.enemySnapshots.map((enemy) => [enemy.id, enemy]),
  );
  for (const enemy of enemies) {
    if (!snapshotsById.has(enemy.id)) {
      snapshotsById.set(enemy.id, enemy);
    }
  }

  const withoutEnemies = removeEntities(
    state,
    enemies.map((enemy) => enemy.id),
  );

  return setSuppressionRuntime(withoutEnemies, context, {
    ...runtime,
    enemySnapshots: [...snapshotsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  });
}

function restoreSuppressedEnemies(
  state: GameState,
  runtime: QuestAmbientEnemySuppressionRuntime,
  random: () => number,
): GameState {
  if (state.currentMapId !== runtime.targetMapId) {
    return state;
  }

  let nextState = state;

  for (const snapshot of [...runtime.enemySnapshots].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (nextState.entities[snapshot.id]) {
      continue;
    }

    const variant =
      runtime.variantPolicy === "preserve"
        ? snapshot.variant
        : rollEnemyVariantForSpawn({
            currentMapId: nextState.currentMapId,
            map: nextState.map,
            position: snapshot.homePosition,
            subzoneId: snapshot.subzoneId,
            existingEntities: nextState.entities,
            random,
          });
    const safePosition = findClosestAvailablePosition(
      nextState,
      snapshot.homePosition,
    );
    const restoredEnemy = createEnemy(
      snapshot.id,
      safePosition,
      snapshot.aggressionMode,
      {
        archetypeId: snapshot.archetypeId,
        enemyTypeId: snapshot.enemyTypeId,
        level: snapshot.level,
        xpReward: snapshot.xpReward,
        attackCooldownMs: snapshot.attackCooldownMs,
        attackRange: snapshot.attackRange,
        combatBodyRadius: snapshot.combatBodyRadius,
        subzoneId: snapshot.subzoneId,
        encounterAreaId: snapshot.encounterAreaId,
        variant,
      },
    );
    const restoredEnemyWithAuthoredState: Enemy = {
      ...restoredEnemy,
      ...(runtime.variantPolicy === "preserve"
        ? {
            health: snapshot.maxHealth,
            maxHealth: snapshot.maxHealth,
            attack: snapshot.attack,
            defense: snapshot.defense,
            magicDefense: snapshot.magicDefense,
            evasion: snapshot.evasion,
            effectiveScalingLevel: snapshot.effectiveScalingLevel,
            scalingBand: snapshot.scalingBand,
            threat: snapshot.threat,
            scalingOverrides: [...snapshot.scalingOverrides],
          }
        : {}),
      homePosition: snapshot.homePosition,
      debugSpawn: snapshot.debugSpawn,
      roamTargetPosition: null,
      nextRoamAt: snapshot.nextRoamAt,
    };
    nextState = addEntity(nextState, restoredEnemyWithAuthoredState);
    nextState = clearEnemyRuntimeState(nextState, restoredEnemy.id);

    if (isSuperiorEnemy(restoredEnemyWithAuthoredState)) {
      nextState = appendDebugTelemetryEvent(nextState, {
        type: "superior_enemy_spawned",
        entityId: restoredEnemyWithAuthoredState.id,
        currentMapId: nextState.currentMapId,
        currentMapDisplayName: nextState.map?.displayName,
        currentMapDebugName: nextState.map?.debugName,
        enemyTypeId: restoredEnemyWithAuthoredState.enemyTypeId,
        enemyArchetypeId: restoredEnemyWithAuthoredState.archetypeId,
        enemyVariant: restoredEnemyWithAuthoredState.variant,
        enemyPosition: restoredEnemyWithAuthoredState.position,
        enemyLevel: restoredEnemyWithAuthoredState.level,
        reason: "respawn",
      });
    }
  }

  return nextState;
}

function getSuppressionContext(
  questId: QuestId,
  objectiveId: string,
): SuppressionContext | null {
  const objective = QUEST_DEFINITIONS[questId].objectives.find(
    (candidate) => candidate.id === objectiveId,
  );
  const config = objective?.ambientEnemySuppression;
  const targetMapId = objective?.targetMapId;

  if (
    !objective ||
    !config ||
    !targetMapId ||
    (config.scope === "subzone" && !objective.targetSubzoneId)
  ) {
    return null;
  }

  return {
    questId,
    objective,
    config,
    groupId: config.groupId ?? objective.id,
    targetMapId,
  };
}

function getSuppressionContextForGroup(
  questId: QuestId,
  groupId: string,
): SuppressionContext | null {
  for (const objective of QUEST_DEFINITIONS[questId].objectives) {
    const context = getSuppressionContext(questId, objective.id);
    if (context && (context.groupId === groupId || objective.id === groupId)) {
      return context;
    }
  }

  return null;
}

function getSuppressionRuntime(
  state: GameState,
  context: SuppressionContext,
): QuestAmbientEnemySuppressionRuntime | undefined {
  return state.quests[context.questId].runtime
    ?.ambientEnemySuppressionsByGroupId?.[context.groupId];
}

function setSuppressionRuntime(
  state: GameState,
  context: SuppressionContext,
  runtime: QuestAmbientEnemySuppressionRuntime,
): GameState {
  const quest = state.quests[context.questId];

  return {
    ...state,
    quests: {
      ...state.quests,
      [context.questId]: {
        ...quest,
        runtime: {
          ...quest.runtime,
          ambientEnemySuppressionsByGroupId: {
            ...quest.runtime?.ambientEnemySuppressionsByGroupId,
            [context.groupId]: runtime,
          },
        },
      },
    },
  };
}

function deleteSuppressionRuntime(
  state: GameState,
  questId: QuestId,
  groupId: string,
): GameState {
  const quest = state.quests[questId];
  const groups = {
    ...(quest.runtime?.ambientEnemySuppressionsByGroupId ?? {}),
  };
  delete groups[groupId];

  return {
    ...state,
    quests: {
      ...state.quests,
      [questId]: {
        ...quest,
        runtime: {
          ...quest.runtime,
          ambientEnemySuppressionsByGroupId: groups,
        },
      },
    },
  };
}

function createRuntimeFromContext(
  context: SuppressionContext,
  runtime: Pick<
    QuestAmbientEnemySuppressionRuntime,
    "activeObjectiveIds" | "enemySnapshots" | "restoreAtMs"
  >,
): QuestAmbientEnemySuppressionRuntime {
  return {
    targetMapId: context.targetMapId,
    ...(context.config.scope === "subzone"
      ? { targetSubzoneId: context.objective.targetSubzoneId }
      : {}),
    scope: context.config.scope,
    restoreDelayMs: context.config.restoreDelayMs,
    variantPolicy: context.config.variantPolicy,
    activeObjectiveIds: runtime.activeObjectiveIds,
    enemySnapshots: runtime.enemySnapshots,
    ...(runtime.restoreAtMs === undefined
      ? {}
      : { restoreAtMs: runtime.restoreAtMs }),
  };
}

function mergeSuppressionRuntime(
  left: QuestAmbientEnemySuppressionRuntime | undefined,
  right: QuestAmbientEnemySuppressionRuntime,
): QuestAmbientEnemySuppressionRuntime {
  if (!left) {
    return right;
  }

  const snapshots = new Map(
    [...left.enemySnapshots, ...right.enemySnapshots].map((enemy) => [
      enemy.id,
      enemy,
    ]),
  );
  const activeObjectiveIds = [
    ...new Set([...left.activeObjectiveIds, ...right.activeObjectiveIds]),
  ];
  const restoreTimes = [left.restoreAtMs, right.restoreAtMs].filter(
    (restoreAtMs): restoreAtMs is number => Number.isFinite(restoreAtMs),
  );

  return {
    ...right,
    activeObjectiveIds,
    enemySnapshots: [...snapshots.values()],
    restoreAtMs:
      activeObjectiveIds.length > 0
        ? undefined
        : restoreTimes.length > 0
          ? Math.min(...restoreTimes)
          : undefined,
  };
}

function sanitizeSuppressionRuntime(
  value: unknown,
  context: SuppressionContext,
  quest: QuestState,
): QuestAmbientEnemySuppressionRuntime | null {
  if (!isSuppressionRuntime(value)) {
    return null;
  }

  if (!isRuntimeCompatibleWithContext(value, context)) {
    return null;
  }

  const validObjectiveIds = new Set(
    QUEST_DEFINITIONS[context.questId].objectives
      .filter(
        (objective) =>
          (objective.ambientEnemySuppression?.groupId ?? objective.id) ===
          context.groupId,
      )
      .map((objective) => objective.id),
  );
  const activeObjectiveIds = [...new Set(value.activeObjectiveIds)].filter(
    (objectiveId) =>
      validObjectiveIds.has(objectiveId) &&
      isSuppressionOwnerActiveAfterLoad(quest, context.questId, objectiveId),
  );
  const enemySnapshots = new Map(
    value.enemySnapshots
      .filter(isRestorableAmbientEnemy)
      .map((enemy) => [enemy.id, enemy]),
  );

  return createRuntimeFromContext(context, {
    activeObjectiveIds,
    enemySnapshots: [...enemySnapshots.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    restoreAtMs:
      activeObjectiveIds.length === 0 && Number.isFinite(value.restoreAtMs)
        ? value.restoreAtMs
        : undefined,
  });
}

function isSuppressionOwnerActiveAfterLoad(
  quest: QuestState,
  questId: QuestId,
  objectiveId: string,
): boolean {
  if (
    quest.status !== "active" ||
    quest.objectiveProgress[objectiveId]?.completed
  ) {
    return false;
  }

  const objective = QUEST_DEFINITIONS[questId].objectives.find(
    (candidate) => candidate.id === objectiveId,
  );

  if (objective?.type === "defend_area") {
    return quest.runtime?.defenseStartedObjectiveIds?.[objectiveId] === true;
  }

  if (objective?.type === "patron_ward") {
    return (
      quest.runtime?.patronWards?.activeWardId === objective.patronWardId
    );
  }

  return objective !== undefined;
}

function isRuntimeCompatibleWithContext(
  runtime: QuestAmbientEnemySuppressionRuntime,
  context: SuppressionContext,
): boolean {
  return (
    runtime.targetMapId === context.targetMapId &&
    runtime.scope === context.config.scope &&
    (runtime.scope !== "subzone" ||
      runtime.targetSubzoneId === context.objective.targetSubzoneId)
  );
}

function isSuppressionRuntime(
  value: unknown,
): value is QuestAmbientEnemySuppressionRuntime {
  if (!value || typeof value !== "object") {
    return false;
  }

  const runtime = value as Partial<QuestAmbientEnemySuppressionRuntime>;
  return (
    typeof runtime.targetMapId === "string" &&
    (runtime.scope === "map" || runtime.scope === "subzone") &&
    typeof runtime.restoreDelayMs === "number" &&
    Number.isFinite(runtime.restoreDelayMs) &&
    (runtime.variantPolicy === "preserve" ||
      runtime.variantPolicy === "reroll") &&
    Array.isArray(runtime.activeObjectiveIds) &&
    Array.isArray(runtime.enemySnapshots)
  );
}

function getRecoverableSuppressionRuntime(
  value: unknown,
  context: SuppressionContext | null,
): QuestAmbientEnemySuppressionRuntime | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const runtime = value as Partial<QuestAmbientEnemySuppressionRuntime>;
  const targetMapId = context?.targetMapId ?? runtime.targetMapId;
  const enemySnapshots = Array.isArray(runtime.enemySnapshots)
    ? runtime.enemySnapshots.filter(isRestorableAmbientEnemy)
    : [];

  if (
    !targetMapId ||
    !(targetMapId in ENEMY_START_DATA_BY_MAP_ID) ||
    enemySnapshots.length === 0
  ) {
    return null;
  }

  return {
    targetMapId,
    scope: context?.config.scope ?? "map",
    ...(context?.config.scope === "subzone"
      ? { targetSubzoneId: context.objective.targetSubzoneId }
      : {}),
    restoreDelayMs: context?.config.restoreDelayMs ?? 0,
    variantPolicy:
      runtime.variantPolicy === "reroll" ? "reroll" : "preserve",
    activeObjectiveIds: [],
    enemySnapshots,
  };
}

function isRestorableAmbientEnemy(value: unknown): value is Enemy {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Enemy).kind === "enemy" &&
      typeof (value as Enemy).id === "string" &&
      typeof (value as Enemy).enemyTypeId === "string" &&
      (value as Enemy).questSpawn === undefined &&
      !(value as Enemy).isTargetDummy,
  );
}

function createEnemyFromStartData(
  mapId: DebugMapId,
  enemyId: string,
): Enemy | null {
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

function clearEnemyRuntimeState(state: GameState, enemyId: string): GameState {
  const skillMarksByEnemyId = { ...(state.skillMarksByEnemyId ?? {}) };
  const skillBindsByEnemyId = { ...(state.skillBindsByEnemyId ?? {}) };
  delete skillMarksByEnemyId[enemyId];
  delete skillBindsByEnemyId[enemyId];

  return clearEnemyAbilityRuntimeForEnemy(
    {
      ...state,
      skillMarksByEnemyId,
      skillBindsByEnemyId,
    },
    enemyId,
  );
}
