import { isAutonomousEntity, moveEntityToward } from "./entities";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { AutonomousEntity, GameEntity } from "./types";

export function updateAttackSystem(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isAttackingAutonomousEntity(entity)) {
      continue;
    }

    if (!entity.currentTargetId) {
      continue;
    }

    const target = getEntityById(nextState, entity.currentTargetId);

    if (!target) {
      continue;
    }

    nextState = updateEntity(nextState, moveEntityToward(entity, target));
  }

  return nextState;
}

function isAttackingAutonomousEntity(
  entity: GameEntity,
): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "attack";
}
