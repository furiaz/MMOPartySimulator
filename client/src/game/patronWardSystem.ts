import { issuePartyOrder } from "./commands";
import {
  MAP_SEVEN_ID,
  MAP_SIX_ID,
  createDebugMapForQuestState,
} from "./debugMap";
import { createEnemy } from "./entities";
import { pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { getPartyExecutionIntent } from "./partyIntentState";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  NIGHTMIRE_BARRIER_CENTER,
  NIGHTMIRE_BARRIER_RADIUS,
  NIGHTMIRE_ROUTE_TELEPORT_ID,
  PATRON_BARRIER_FADE_DURATION_MS,
  PATRON_FINALE_HOLD_DURATION_MS,
  PATRON_WARD_ARENA_RADIUS,
  PATRON_WARD_DEFINITIONS,
  PATRON_WARD_FADE_DURATION_MS,
  PATRON_WARD_INTERACTION_RANGE,
  PATRON_WARD_QUEST_ID,
  PATRON_WARD_RETREAT_RESET_DELAY_MS,
  PATRON_WARD_WAVE_DELAY_MS,
  PATRON_WARMASTER_FADE_DURATION_MS,
  PATRON_WARMASTER_SPEECH,
  areAllPatronWardsCompleted,
  getPatronWardDefinition,
  getPatronWardQuest,
  isNightmireRouteOpen,
  sanitizePersistentPatronWardRuntime,
} from "./patronWardState";
import { completeQuestObjective } from "./questProgressionHooks";
import {
  beginQuestAmbientEnemySuppression,
  clearQuestAmbientEnemySuppressionGroup,
  releaseQuestAmbientEnemySuppression,
} from "./questAmbientEnemySuppressionSystem";
import { NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID } from "./questSystem";
import {
  addEnemy,
  type GameState,
} from "./state";
import { setTeleportWorking } from "./teleportState";
import type { Enemy, Position } from "./types";
import type {
  PatronWardId,
  PatronWardRuntimeState,
  QuestState,
} from "./questTypes";

export type PatronWardPresentationEntry = {
  id: PatronWardId;
  label: string | null;
  position: Position;
  propFadeStartedAtMs?: number;
  completed: boolean;
  isInteractable: boolean;
  visualObjectId: string;
};

export type PatronWardPresentationState = {
  barrier: {
    center: Position;
    radius: number;
    finaleStartedAtMs?: number;
  } | null;
  warmaster: {
    position: Position;
    finaleStartedAtMs?: number;
    speech: string | null;
  } | null;
  wards: PatronWardPresentationEntry[];
};

const DEFENDER_SPAWN_OFFSETS: readonly Position[] = [
  { x: -5, y: -3 },
  { x: -7, y: 0 },
  { x: -5, y: 3 },
  { x: -8, y: -3 },
  { x: -8, y: 3 },
];

export function requestPatronWardActivation(
  state: GameState,
  wardId: PatronWardId,
): GameState {
  const quest = getPatronWardQuest(state.quests);
  const ward = getPatronWardDefinition(wardId);
  const progress = quest?.objectiveProgress[ward.objectiveId];
  const runtime = quest?.runtime?.patronWards;
  const leader = getPartyLeader(state);

  if (
    state.currentMapId !== MAP_SIX_ID ||
    quest?.status !== "active" ||
    !leader ||
    leader.state === "dead" ||
    leader.health <= 0 ||
    runtime?.activeWardId ||
    runtime?.pendingActivationWardId ||
    !progress ||
    progress.completed ||
    progress.currentCount < 100
  ) {
    return state;
  }

  const orderedState = issuePartyOrder(state, {
    type: "move",
    targetPosition: { ...ward.position },
  });

  if (orderedState === state) {
    return state;
  }

  return updatePatronWardRuntime(orderedState, {
    ...runtime,
    pendingActivationWardId: wardId,
  });
}

export function updatePatronWardSystem(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const quest = getPatronWardQuest(state.quests);

  if (!quest) {
    return state;
  }

  if (state.currentMapId !== MAP_SIX_ID) {
    return hasTransientPatronWardRuntime(quest.runtime?.patronWards)
      ? preparePatronWardStateForMapExit(state)
      : state;
  }

  let nextState = state;
  const runtime = quest.runtime?.patronWards;

  if (runtime?.finaleStartedAtMs !== undefined) {
    const unlockAtMs =
      runtime.finaleStartedAtMs +
      PATRON_FINALE_HOLD_DURATION_MS +
      PATRON_BARRIER_FADE_DURATION_MS;

    if (nowMs >= unlockAtMs) {
      nextState = unlockNightmireRoute(nextState);
    }
  }

  const activeRuntime = getPatronWardQuest(nextState.quests)?.runtime?.patronWards;

  if (activeRuntime?.activeWardId) {
    return updateActiveWardDefense(nextState, activeRuntime, nowMs);
  }

  if (activeRuntime?.pendingActivationWardId) {
    return updatePendingWardActivation(nextState, activeRuntime);
  }

  return nextState;
}

export function preparePatronWardStateForMapExit(state: GameState): GameState {
  const quest = getPatronWardQuest(state.quests);

  if (!quest) {
    return state;
  }

  const runtime = quest.runtime?.patronWards;
  const routeEarned = areAllPatronWardsCompleted(quest);
  const persistentRuntime = sanitizePersistentPatronWardRuntime(
    runtime,
    routeEarned,
    runtime?.legacyRoutePreserved === true,
  );
  const withoutDefenders = removePatronWardDefenders(state);
  const withoutSuppression = clearQuestAmbientEnemySuppressionGroup(
    withoutDefenders,
    PATRON_WARD_QUEST_ID,
    NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID,
    false,
  );
  let nextState = updatePatronWardRuntime(
    withoutSuppression,
    persistentRuntime,
  );

  nextState = setTeleportWorking(
    nextState,
    NIGHTMIRE_ROUTE_TELEPORT_ID,
    persistentRuntime?.routeUnlocked === true,
  );

  return nextState;
}

export function restorePatronWardStateFromSave(
  state: GameState,
  preserveLegacyRoute: boolean,
): GameState {
  const quest = getPatronWardQuest(state.quests);

  if (!quest) {
    return state;
  }

  let nextState = removePatronWardDefenders(state);
  nextState = clearQuestAmbientEnemySuppressionGroup(
    nextState,
    PATRON_WARD_QUEST_ID,
    NIGHTMIRE_WARD_SUPPRESSION_GROUP_ID,
    true,
  );

  const persistentRuntime = sanitizePersistentPatronWardRuntime(
    quest.runtime?.patronWards,
    areAllPatronWardsCompleted(quest),
    preserveLegacyRoute,
  );
  nextState = updatePatronWardRuntime(nextState, persistentRuntime);

  nextState = setTeleportWorking(
    nextState,
    NIGHTMIRE_ROUTE_TELEPORT_ID,
    persistentRuntime?.routeUnlocked === true,
  );

  if (nextState.currentMapId === MAP_SIX_ID) {
    nextState = {
      ...nextState,
      map: createDebugMapForQuestState(MAP_SIX_ID, nextState.quests),
    };
  }

  return pruneMissingEntityRuntimeState(nextState);
}

export function getPatronWardPresentationState(
  state: GameState,
): PatronWardPresentationState | null {
  if (state.currentMapId !== MAP_SIX_ID) {
    return null;
  }

  const quest = getPatronWardQuest(state.quests);

  if (!quest) {
    return null;
  }

  const runtime = quest.runtime?.patronWards;
  const routeOpen = isNightmireRouteOpen(state.quests);
  const showScene = !routeOpen && runtime?.legacyRoutePreserved !== true;

  return {
    barrier: routeOpen
      ? null
      : {
          center: NIGHTMIRE_BARRIER_CENTER,
          radius: NIGHTMIRE_BARRIER_RADIUS,
          finaleStartedAtMs: runtime?.finaleStartedAtMs,
        },
    warmaster: showScene
      ? {
          position: NIGHTMIRE_BARRIER_CENTER,
          finaleStartedAtMs: runtime?.finaleStartedAtMs,
          speech:
            runtime?.finaleStartedAtMs !== undefined
              ? PATRON_WARMASTER_SPEECH
              : null,
        }
      : null,
    wards: PATRON_WARD_DEFINITIONS.map((ward) => {
      const progress = quest.objectiveProgress[ward.objectiveId];

      return {
        id: ward.id,
        label: getWardLabel(quest, runtime, ward.id),
        position: ward.position,
        propFadeStartedAtMs:
          runtime?.wardFadeStartedAtMsByWardId?.[ward.id],
        completed: progress?.completed === true,
        isInteractable:
          quest.status === "active" &&
          progress?.completed !== true &&
          (progress?.currentCount ?? 0) >= 100 &&
          !runtime?.activeWardId &&
          !runtime?.pendingActivationWardId,
        visualObjectId: ward.visualObjectId,
      };
    }),
  };
}

function updatePendingWardActivation(
  state: GameState,
  runtime: PatronWardRuntimeState,
): GameState {
  const wardId = runtime.pendingActivationWardId;

  if (!wardId) {
    return state;
  }

  const quest = getPatronWardQuest(state.quests);
  const ward = getPatronWardDefinition(wardId);
  const progress = quest?.objectiveProgress[ward.objectiveId];
  const leader = getPartyLeader(state);
  const executionIntent = getPartyExecutionIntent(state);
  const intentPosition =
    executionIntent?.type === "move" ? executionIntent.targetPosition : undefined;
  const stillApproaching =
    intentPosition && getDistance(intentPosition, ward.position) <= 0.01;

  if (
    quest?.status !== "active" ||
    !progress ||
    progress.completed ||
    progress.currentCount < 100 ||
    !leader ||
    leader.state === "dead" ||
    leader.health <= 0 ||
    !stillApproaching
  ) {
    return updatePatronWardRuntime(state, {
      ...runtime,
      pendingActivationWardId: undefined,
    });
  }

  if (getDistance(leader.position, ward.position) > PATRON_WARD_INTERACTION_RANGE) {
    return state;
  }

  return startWardDefense(state, wardId);
}

function startWardDefense(
  state: GameState,
  wardId: PatronWardId,
): GameState {
  const ward = getPatronWardDefinition(wardId);
  let nextState = beginQuestAmbientEnemySuppression(
    state,
    PATRON_WARD_QUEST_ID,
    ward.objectiveId,
  );
  nextState = updatePatronWardRuntime(nextState, {
    ...getPatronWardQuest(nextState.quests)?.runtime?.patronWards,
    pendingActivationWardId: undefined,
    activeWardId: wardId,
    activeWaveIndex: 0,
    trackedDefenderIds: [],
    nextWaveAtMs: undefined,
    retreatStartedAtMs: undefined,
  });

  return spawnWardWave(nextState, wardId, 0);
}

function updateActiveWardDefense(
  state: GameState,
  runtime: PatronWardRuntimeState,
  nowMs: number,
): GameState {
  const wardId = runtime.activeWardId;

  if (!wardId) {
    return state;
  }

  const trackedIds = runtime.trackedDefenderIds ?? [];
  const hasUnexpectedMissingDefender = trackedIds.some(
    (enemyId) => state.entities[enemyId]?.kind !== "enemy",
  );

  if (hasUnexpectedMissingDefender) {
    return resetActiveWardDefense(state, false, nowMs);
  }

  const livingPartyMembers = getPartyMembers(state).filter(
    (member) => member.state !== "dead" && member.health > 0,
  );

  if (livingPartyMembers.length === 0) {
    return resetActiveWardDefense(state, false, nowMs);
  }

  const ward = getPatronWardDefinition(wardId);
  const hasNearbyLivingCompanion = livingPartyMembers.some(
    (member) =>
      getDistance(member.position, ward.position) <= PATRON_WARD_ARENA_RADIUS,
  );

  if (!hasNearbyLivingCompanion) {
    if (runtime.retreatStartedAtMs === undefined) {
      return updatePatronWardRuntime(state, {
        ...runtime,
        retreatStartedAtMs: nowMs,
      });
    }

    if (
      nowMs - runtime.retreatStartedAtMs >=
      PATRON_WARD_RETREAT_RESET_DELAY_MS
    ) {
      return resetActiveWardDefense(state, false, nowMs);
    }
  } else if (runtime.retreatStartedAtMs !== undefined) {
    state = updatePatronWardRuntime(state, {
      ...runtime,
      retreatStartedAtMs: undefined,
    });
    runtime = getPatronWardQuest(state.quests)?.runtime?.patronWards ?? runtime;
  }

  const defenders = trackedIds.map((enemyId) => state.entities[enemyId]);
  const waveDefeated =
    defenders.length > 0 &&
    defenders.every(
      (entity) =>
        entity?.kind === "enemy" &&
        (entity.state === "dead" || entity.health <= 0),
    );

  if (!waveDefeated) {
    return state;
  }

  const waveIndex = runtime.activeWaveIndex ?? 0;
  const isFinalWave = waveIndex >= ward.waveCounts.length - 1;

  if (isFinalWave) {
    return completeWardDefense(state, wardId, nowMs);
  }

  if (runtime.nextWaveAtMs === undefined) {
    return updatePatronWardRuntime(state, {
      ...runtime,
      nextWaveAtMs: nowMs + PATRON_WARD_WAVE_DELAY_MS,
    });
  }

  if (nowMs < runtime.nextWaveAtMs) {
    return state;
  }

  const withoutPreviousWave = removeEntities(state, trackedIds);

  return spawnWardWave(withoutPreviousWave, wardId, waveIndex + 1);
}

function spawnWardWave(
  state: GameState,
  wardId: PatronWardId,
  waveIndex: number,
): GameState {
  const ward = getPatronWardDefinition(wardId);
  const count = ward.waveCounts[waveIndex] ?? 0;
  let nextState = state;
  const defenderIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const offset = DEFENDER_SPAWN_OFFSETS[index % DEFENDER_SPAWN_OFFSETS.length];
    const intendedPosition = {
      x: ward.position.x + offset.x,
      y: ward.position.y + offset.y,
    };
    const enemyId = `patron-ward-${wardId}-wave-${waveIndex}-${index}`;
    const enemy = createEnemy(enemyId, intendedPosition, "aggressive", {
      enemyTypeId: ward.enemyTypeId,
      subzoneId: "nightmire-canopy",
      encounterAreaId: `patron-${wardId}`,
      questSpawn: {
        questId: PATRON_WARD_QUEST_ID,
        objectiveId: ward.objectiveId,
        targetPosition: ward.position,
        patronAura: true,
      },
    });

    nextState = addEnemy(nextState, enemy);
    defenderIds.push(enemyId);
  }

  return updatePatronWardRuntime(nextState, {
    ...getPatronWardQuest(nextState.quests)?.runtime?.patronWards,
    activeWardId: wardId,
    activeWaveIndex: waveIndex,
    trackedDefenderIds: defenderIds,
    nextWaveAtMs: undefined,
    retreatStartedAtMs: undefined,
  });
}

function completeWardDefense(
  state: GameState,
  wardId: PatronWardId,
  nowMs: number,
): GameState {
  const ward = getPatronWardDefinition(wardId);
  const runtime = getPatronWardQuest(state.quests)?.runtime?.patronWards;
  let nextState = removeEntities(state, runtime?.trackedDefenderIds ?? []);
  nextState = completeQuestObjective(
    nextState,
    PATRON_WARD_QUEST_ID,
    ward.objectiveId,
  );

  const nextQuest = getPatronWardQuest(nextState.quests);
  const allWardsCompleted = areAllPatronWardsCompleted(nextQuest);
  const shouldPlayFinale =
    allWardsCompleted &&
    runtime?.legacyRoutePreserved !== true &&
    runtime?.routeUnlocked !== true;
  nextState = updatePatronWardRuntime(nextState, {
    ...nextQuest?.runtime?.patronWards,
    activeWardId: undefined,
    activeWaveIndex: undefined,
    trackedDefenderIds: undefined,
    nextWaveAtMs: undefined,
    retreatStartedAtMs: undefined,
    wardFadeStartedAtMsByWardId: {
      ...nextQuest?.runtime?.patronWards?.wardFadeStartedAtMsByWardId,
      [wardId]: nowMs,
    },
    finaleStartedAtMs: shouldPlayFinale ? nowMs : undefined,
  });
  nextState = releaseQuestAmbientEnemySuppression(
    nextState,
    PATRON_WARD_QUEST_ID,
    ward.objectiveId,
    nowMs,
  );

  return allWardsCompleted && !shouldPlayFinale
    ? unlockNightmireRoute(nextState)
    : nextState;
}

function resetActiveWardDefense(
  state: GameState,
  unlockCompletedRoute: boolean,
  nowMs: number,
): GameState {
  const quest = getPatronWardQuest(state.quests);
  const runtime = quest?.runtime?.patronWards;
  const defenderIds = Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        entity.kind === "enemy" && entity.questSpawn?.patronAura === true,
    )
    .map((enemy) => enemy.id);
  let nextState = removeEntities(state, defenderIds);
  const persistentRuntime = sanitizePersistentPatronWardRuntime(
    runtime,
    unlockCompletedRoute && areAllPatronWardsCompleted(quest),
    runtime?.legacyRoutePreserved === true,
  );
  nextState = updatePatronWardRuntime(nextState, persistentRuntime);

  if (state.currentMapId === MAP_SIX_ID && runtime?.activeWardId) {
    nextState = releaseQuestAmbientEnemySuppression(
      nextState,
      PATRON_WARD_QUEST_ID,
      getPatronWardDefinition(runtime.activeWardId).objectiveId,
      nowMs,
    );
  }

  return nextState;
}

function unlockNightmireRoute(state: GameState): GameState {
  const quest = getPatronWardQuest(state.quests);
  const runtime = quest?.runtime?.patronWards;
  let nextState = updatePatronWardRuntime(state, {
    ...runtime,
    finaleStartedAtMs: undefined,
    routeUnlocked: true,
  });
  nextState = setTeleportWorking(
    nextState,
    NIGHTMIRE_ROUTE_TELEPORT_ID,
    true,
  );

  if (nextState.currentMapId === MAP_SIX_ID) {
    nextState = {
      ...nextState,
      map: createDebugMapForQuestState(MAP_SIX_ID, nextState.quests),
    };
  }

  return nextState;
}

function removePatronWardDefenders(state: GameState): GameState {
  return removeEntities(
    state,
    Object.values(state.entities)
      .filter(
        (entity): entity is Enemy =>
          entity.kind === "enemy" && entity.questSpawn?.patronAura === true,
      )
      .map((enemy) => enemy.id),
  );
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

function updatePatronWardRuntime(
  state: GameState,
  runtime: PatronWardRuntimeState | undefined,
): GameState {
  const quest = getPatronWardQuest(state.quests);

  if (!quest) {
    return state;
  }

  return {
    ...state,
    quests: {
      ...state.quests,
      [PATRON_WARD_QUEST_ID]: {
        ...quest,
        runtime: {
          ...quest.runtime,
          patronWards: runtime,
        },
      },
    },
  };
}

function getWardLabel(
  quest: QuestState,
  runtime: PatronWardRuntimeState | undefined,
  wardId: PatronWardId,
): string | null {
  if (quest.status !== "active") {
    return null;
  }

  const ward = getPatronWardDefinition(wardId);
  const progress = quest.objectiveProgress[ward.objectiveId];

  if (!progress || progress.completed) {
    return null;
  }

  if (runtime?.activeWardId === wardId) {
    return `${ward.displayName} — Wave ${(runtime.activeWaveIndex ?? 0) + 1}/${ward.waveCounts.length}`;
  }

  if (runtime?.activeWardId) {
    return `${ward.displayName} — Blocked`;
  }

  if (runtime?.pendingActivationWardId === wardId) {
    return `${ward.displayName} — Approaching`;
  }

  if (runtime?.pendingActivationWardId) {
    return `${ward.displayName} — Blocked`;
  }

  if (progress.currentCount >= 100) {
    return `${ward.displayName} — Ready`;
  }

  return `${ward.displayName} — ${progress.currentCount}/100`;
}

function hasTransientPatronWardRuntime(
  runtime: PatronWardRuntimeState | undefined,
): boolean {
  return Boolean(
    runtime?.pendingActivationWardId ||
      runtime?.activeWardId ||
      runtime?.trackedDefenderIds?.length ||
      runtime?.finaleStartedAtMs !== undefined ||
      Object.keys(runtime?.wardFadeStartedAtMsByWardId ?? {}).length > 0,
  );
}

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function isLegacyNightmireRouteSave(
  state: Pick<GameState, "currentMapId" | "worldDiscovery">,
): boolean {
  const visitedMapIds = Array.isArray(state.worldDiscovery?.visitedMapIds)
    ? state.worldDiscovery.visitedMapIds
    : [];

  return (
    state.currentMapId === MAP_SEVEN_ID ||
    visitedMapIds.includes(MAP_SEVEN_ID)
  );
}

export function getPatronWardFadeOpacity(
  startedAtMs: number | undefined,
  currentTime: number,
): number {
  if (startedAtMs === undefined) {
    return 0;
  }

  return Math.max(
    0,
    1 - (currentTime - startedAtMs) / PATRON_WARD_FADE_DURATION_MS,
  );
}

export function getPatronFinaleOpacity(
  finaleStartedAtMs: number | undefined,
  currentTime: number,
  fadeDurationMs: number,
): number {
  if (finaleStartedAtMs === undefined) {
    return 1;
  }

  const fadeStartedAtMs =
    finaleStartedAtMs + PATRON_FINALE_HOLD_DURATION_MS;

  if (currentTime <= fadeStartedAtMs) {
    return 1;
  }

  return Math.max(0, 1 - (currentTime - fadeStartedAtMs) / fadeDurationMs);
}

export function isPatronWarmasterSpeechVisible(
  finaleStartedAtMs: number | undefined,
  currentTime: number,
): boolean {
  return (
    finaleStartedAtMs !== undefined &&
    currentTime < finaleStartedAtMs + PATRON_FINALE_HOLD_DURATION_MS
  );
}

export const PATRON_WARMASTER_SCENE_FADE_DURATION_MS =
  PATRON_WARMASTER_FADE_DURATION_MS;
