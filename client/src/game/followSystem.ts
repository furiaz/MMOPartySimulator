import {
  getEntityById,
  moveEntityTowardIfUnoccupied,
  type GameState,
} from "./state";
import { isAutonomousEntity } from "./entities";
import type { AutonomousEntity, GameEntity } from "./types";

export const FOLLOW_LEASH_RADIUS = 3;

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

    if (isWithinFollowLeash(entity, target)) {
      continue;
    }

    nextState = moveEntityTowardIfUnoccupied(nextState, entity, target);
    movedEntityIds.add(entity.id);
  }

  return nextState;
}

function isFollowingAutonomousEntity(
  entity: GameEntity,
): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "follow";
}

export function isWithinFollowLeash(
  entity: GameEntity,
  target: GameEntity,
): boolean {
  const xDistance = Math.abs(target.position.x - entity.position.x);
  const yDistance = Math.abs(target.position.y - entity.position.y);

  return (
    xDistance <= FOLLOW_LEASH_RADIUS &&
    yDistance <= FOLLOW_LEASH_RADIUS
  );
}
