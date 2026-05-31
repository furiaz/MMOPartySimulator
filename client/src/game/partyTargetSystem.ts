import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import { isActivePartyThreat } from "./partyThreatSystem";
import { getGridDistance } from "./positionUtils";
import { getEntityById, type GameState } from "./state";
import { getPartyExecutionIntent } from "./partyIntentState";
import type { Enemy, Position } from "./types";

export function getPartyCombatTarget(state: GameState): Enemy | null {
  const executionIntent = getPartyExecutionIntent(state);

  if (executionIntent?.type !== "attack" || !executionIntent.targetId) {
    return null;
  }

  const target = getEntityById(state, executionIntent.targetId);

  return isLivingEnemy(target) ? target : null;
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

  if (target && target.state !== "dead") {
    return target.position;
  }

  return executionIntent.targetPosition;
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
