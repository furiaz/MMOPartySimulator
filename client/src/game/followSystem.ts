import { getEntityById, updateEntity, type GameState } from "./state";
import { updateCompanionFollow } from "./entities";
import type { Companion, GameEntity } from "./types";

export function updateFollowSystem(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isFollowingCompanion(entity)) {
      continue;
    }

    const target = getEntityById(nextState, entity.followTargetId);

    if (!target) {
      continue;
    }

    nextState = updateEntity(
      nextState,
      updateCompanionFollow(entity, target),
    );
  }

  return nextState;
}

function isFollowingCompanion(entity: GameEntity): entity is Companion {
  return entity.kind === "companion" && entity.state === "follow";
}
