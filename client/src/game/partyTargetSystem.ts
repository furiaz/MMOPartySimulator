import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getPartyMembers, isPartyMember } from "./partySystem";
import { isActivePartyThreat } from "./partyThreatSystem";
import { getGridDistance } from "./positionUtils";
import { getEntityById, updateEntity, type GameState } from "./state";
import {
  getPartyExecutionIntent,
  setPartyExecutionIntent,
} from "./partyIntentState";
import type { Enemy, Position } from "./types";

const DEFAULT_SUPPRESSION_TIME_MS = 0;

export function getPartyCombatTarget(state: GameState): Enemy | null {
  const executionIntent = getPartyExecutionIntent(state);

  if (executionIntent?.type !== "attack" || !executionIntent.targetId) {
    return null;
  }

  const target = getEntityById(state, executionIntent.targetId);

  return isLivingEnemy(target) &&
    !isEnemySuppressedForAutonomousTargeting(state, target.id)
    ? target
    : null;
}

export function getPartyMovementTargetPosition(
  state: GameState,
): Position | null {
  const executionIntent = getPartyExecutionIntent(state);

  if (!executionIntent) {
    return null;
  }

  const target = executionIntent.targetId
    ? getEntityById(state, executionIntent.targetId)
    : undefined;

  if (
    executionIntent.type === "attack" &&
    target?.kind === "enemy" &&
    isEnemySuppressedForAutonomousTargeting(state, target.id)
  ) {
    return null;
  }

  if (target && target.state !== "dead") {
    return target.position;
  }

  return executionIntent.targetPosition;
}

export function suppressAutonomousEnemyTarget(
  state: GameState,
  enemyId: string,
  durationMs: number,
  reason: string,
): GameState {
  const nowMs = getAutonomousTargetSuppressionTime(state);

  return {
    ...state,
    autonomousTargetSuppressionsByEnemyId: {
      ...state.autonomousTargetSuppressionsByEnemyId,
      [enemyId]: {
        enemyId,
        expiresAtMs: nowMs + durationMs,
        reason,
      },
    },
  };
}

export function isEnemySuppressedForAutonomousTargeting(
  state: GameState,
  enemyId: string,
): boolean {
  const suppression = state.autonomousTargetSuppressionsByEnemyId?.[enemyId];

  return Boolean(
    suppression &&
      suppression.expiresAtMs > getAutonomousTargetSuppressionTime(state),
  );
}

export function clearEnemyFromPartyTargeting(
  state: GameState,
  enemyId: string,
): GameState {
  const executionIntent = getPartyExecutionIntent(state);
  let nextState =
    executionIntent?.type === "attack" && executionIntent.targetId === enemyId
      ? setPartyExecutionIntent(state, null)
      : state;

  for (const member of getPartyMembers(nextState)) {
    if (
      member.commandPriority === "direct" ||
      member.currentTargetId !== enemyId
    ) {
      continue;
    }

    const currentMember = getEntityById(nextState, member.id);
    if (!isPartyMember(currentMember)) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...currentMember,
      state: "follow",
      currentTargetId:
        currentMember.id === nextState.partyLeaderId
          ? null
          : nextState.partyLeaderId,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

export function clearExpiredAutonomousTargetSuppressions(
  state: GameState,
): GameState {
  const suppressions = state.autonomousTargetSuppressionsByEnemyId;

  if (!suppressions) {
    return state;
  }

  const nowMs = getAutonomousTargetSuppressionTime(state);
  const activeEntries = Object.entries(suppressions).filter(
    ([, suppression]) => suppression.expiresAtMs > nowMs,
  );

  if (activeEntries.length === Object.keys(suppressions).length) {
    return state;
  }

  return {
    ...state,
    autonomousTargetSuppressionsByEnemyId:
      activeEntries.length > 0 ? Object.fromEntries(activeEntries) : undefined,
  };
}

export function getActivePartyThreatTargetInArea(
  state: GameState,
  center: Position,
  range: number,
): Enemy | null {
  return (
    Object.values(state.entities)
      .filter((entity): entity is Enemy => isActivePartyThreat(state, entity))
      .filter((enemy) => getGridDistance(enemy.position, center) <= range)
      .filter((enemy) => {
        const target = enemy.currentTargetId
          ? getEntityById(state, enemy.currentTargetId)
          : undefined;

        return (
          isLivingCompanion(target) &&
          getPartyMembers(state).some((member) => member.id === target.id) &&
          getGridDistance(target.position, center) <= range
        );
      })
      .sort(
        (first, second) =>
          getGridDistance(first.position, center) -
            getGridDistance(second.position, center) ||
          first.id.localeCompare(second.id),
      )[0] ?? null
  );
}

function getAutonomousTargetSuppressionTime(state: GameState): number {
  return state.simulationTimeMs ?? DEFAULT_SUPPRESSION_TIME_MS;
}
