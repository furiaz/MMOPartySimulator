import { getEntityById, updateEntity, type GameState } from "./state";
import { isAutonomousEntity, updateAutonomousEntityFollow } from "./entities";
import type { AutonomousEntity, GameEntity } from "./types";

export function updateFollowSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isFollowingAutonomousEntity(entity)) {
      continue;
    }

    if (!entity.currentTargetId) {
      continue;
    }

    const target = getEntityById(nextState, entity.currentTargetId);

    if (!target) {
      continue;
    }

    if (movedEntityIds.has(entity.id)) {
      continue;
    }

    nextState = updateEntity(
      nextState,
      updateAutonomousEntityFollow(entity, target),
    );
    movedEntityIds.add(entity.id);
  }

  return nextState;
}

function isFollowingAutonomousEntity(
  entity: GameEntity,
): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "follow";
}
