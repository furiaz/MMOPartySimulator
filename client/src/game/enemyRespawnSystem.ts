import { createEnemy } from "./entities";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isSlimewardDungeonFloorMapId } from "./dungeonSystem";
import { clearEnemyAbilityRuntimeForEnemy } from "./enemyAbilitySystem";
import { isSuperiorEnemy, rollEnemyVariantForSpawn } from "./enemyVariants";
import {
  QUEST_DEFINITIONS,
  QUEST_ORDER,
} from "./questSystem";
import { updateEntity, type GameState } from "./state";
import type { Enemy } from "./types";

export const ENEMY_RESPAWN_DELAY_MS = 30_000;

export function updateEnemyRespawnSystem(
  state: GameState,
  nowMs = Date.now(),
  random = Math.random,
): GameState {
  if (
    !state.currentMapId ||
    state.currentMapId === "hub" ||
    isSlimewardDungeonFloorMapId(state.currentMapId)
  ) {
    return state;
  }

  let nextState = state;

  for (const entity of Object.values(nextState.entities)) {
    if (
      entity.kind !== "enemy" ||
      entity.state !== "dead" ||
      entity.questSpawn ||
      isEnemySuppressedByDefenseObjective(nextState, entity, nowMs)
    ) {
      continue;
    }

    if (entity.defeatedAtMs === undefined) {
      nextState = updateEntity(nextState, {
        ...entity,
        defeatedAtMs: nowMs,
      });
      continue;
    }

    if (nowMs - entity.defeatedAtMs < ENEMY_RESPAWN_DELAY_MS) {
      continue;
    }

    nextState = respawnEnemy(nextState, entity, random);
  }

  return nextState;
}

function isEnemySuppressedByDefenseObjective(
  state: GameState,
  enemy: Enemy,
  nowMs: number,
): boolean {
  if (!enemy.subzoneId) {
    return false;
  }

  for (const questId of QUEST_ORDER) {
    const quest = state.quests[questId];

    for (const objective of QUEST_DEFINITIONS[questId].objectives) {
      if (
        objective.type !== "defend_area" ||
        objective.targetMapId !== state.currentMapId ||
        objective.targetSubzoneId !== enemy.subzoneId
      ) {
        continue;
      }

      const runtime = quest.runtime;
      const hasStarted = Boolean(
        runtime?.defenseStartedObjectiveIds?.[objective.id],
      );
      const isCompleted = Boolean(
        quest.objectiveProgress[objective.id]?.completed,
      );
      const restoreAtMs =
        runtime?.suppressedSubzoneEnemyRestoreAtMsByObjectiveId?.[objective.id];
      const isWithinRestoreDelay =
        restoreAtMs !== undefined && nowMs < restoreAtMs;

      if (hasStarted && (!isCompleted || isWithinRestoreDelay)) {
        return true;
      }
    }
  }

  return false;
}

function respawnEnemy(
  state: GameState,
  enemy: Enemy,
  random: () => number,
): GameState {
  const variant = rollEnemyVariantForSpawn({
    currentMapId: state.currentMapId,
    map: state.map,
    position: enemy.homePosition,
    subzoneId: enemy.subzoneId,
    existingEntities: state.entities,
    random,
  });
  const respawnedEnemy = createEnemy(
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
  let nextState = updateEntity(state, {
    ...respawnedEnemy,
    roamTargetPosition: null,
    nextRoamAt: enemy.nextRoamAt,
  });

  nextState = clearEnemyRuntimeState(nextState, enemy.id);

  return isSuperiorEnemy(respawnedEnemy)
    ? appendDebugTelemetryEvent(nextState, {
        type: "superior_enemy_spawned",
        entityId: respawnedEnemy.id,
        currentMapId: nextState.currentMapId,
        currentMapDisplayName: nextState.map?.displayName,
        currentMapDebugName: nextState.map?.debugName,
        enemyTypeId: respawnedEnemy.enemyTypeId,
        enemyArchetypeId: respawnedEnemy.archetypeId,
        enemyVariant: respawnedEnemy.variant,
        enemyPosition: respawnedEnemy.position,
        enemyLevel: respawnedEnemy.level,
        reason: "respawn",
      })
    : nextState;
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
