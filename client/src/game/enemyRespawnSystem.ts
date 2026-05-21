import { updateEntity, type GameState } from "./state";
import type { Enemy } from "./types";

export const ENEMY_RESPAWN_DELAY_MS = 10_000;

export function updateEnemyRespawnSystem(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  if (!state.currentMapId || state.currentMapId === "hub") {
    return state;
  }

  let nextState = state;

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "enemy" || entity.state !== "dead") {
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

    nextState = respawnEnemy(nextState, entity);
  }

  return nextState;
}

function respawnEnemy(state: GameState, enemy: Enemy): GameState {
  let nextState = updateEntity(state, {
    ...enemy,
    position: enemy.homePosition,
    state: "idle",
    health: enemy.maxHealth,
    currentTargetId: null,
    attackWindupStartedAt: undefined,
    attackWindupDurationMs: undefined,
    attackWindupTargetId: null,
    defeatedAtMs: undefined,
    roamTargetPosition: null,
    roamMoveUntil: undefined,
    targetDecisionReason: undefined,
  });

  nextState = clearEnemyRuntimeState(nextState, enemy.id);

  return nextState;
}

function clearEnemyRuntimeState(state: GameState, enemyId: string): GameState {
  const skillMarksByEnemyId = { ...(state.skillMarksByEnemyId ?? {}) };
  const skillBindsByEnemyId = { ...(state.skillBindsByEnemyId ?? {}) };
  delete skillMarksByEnemyId[enemyId];
  delete skillBindsByEnemyId[enemyId];

  return {
    ...state,
    skillMarksByEnemyId,
    skillBindsByEnemyId,
  };
}
