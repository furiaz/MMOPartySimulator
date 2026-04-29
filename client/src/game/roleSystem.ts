import { isCombatEntity, isResourceEntity } from "./entities";
import { isWithinFollowLeash } from "./followSystem";
import { updateEntity, type GameState } from "./state";
import type { Companion, GameEntity } from "./types";

export function updateRoleSystem(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!canUseRoleBehavior(nextState, entity)) {
      continue;
    }

    const roleTarget = getRoleTarget(nextState, entity);

    if (!roleTarget) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...entity,
      state: roleTarget.state,
      currentTargetId: roleTarget.targetId,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function canUseRoleBehavior(
  state: GameState,
  entity: GameEntity,
): entity is Companion {
  if (
    entity.kind !== "companion" ||
    entity.commandPriority === "direct" ||
    (entity.state !== "idle" && entity.state !== "follow")
  ) {
    return false;
  }

  if (entity.state === "idle") {
    return true;
  }

  const followTarget = state.entities[entity.followTargetId];

  return Boolean(followTarget && isWithinFollowLeash(entity, followTarget));
}

function getRoleTarget(
  state: GameState,
  companion: Companion,
): { state: "attack" | "gather"; targetId: string } | null {
  if (companion.role === "fighter") {
    const enemy = findNearestEntity(
      companion,
      Object.values(state.entities).filter(
        (entity) =>
          entity.kind === "enemy" &&
          isCombatEntity(entity) &&
          entity.state !== "dead",
      ),
    );

    return enemy ? { state: "attack", targetId: enemy.id } : null;
  }

  if (companion.role === "gatherer") {
    const resource = findNearestEntity(
      companion,
      Object.values(state.entities).filter(
        (entity) => isResourceEntity(entity) && !entity.isDepleted,
      ),
    );

    return resource ? { state: "gather", targetId: resource.id } : null;
  }

  return null;
}

function findNearestEntity<T extends GameEntity>(
  companion: Companion,
  candidates: T[],
): T | undefined {
  return candidates.reduce<T | undefined>((nearestEntity, candidate) => {
    if (!nearestEntity) {
      return candidate;
    }

    return getDistance(companion, candidate) <
      getDistance(companion, nearestEntity)
      ? candidate
      : nearestEntity;
  }, undefined);
}

function getDistance(a: GameEntity, b: GameEntity): number {
  return (
    Math.abs(a.position.x - b.position.x) +
    Math.abs(a.position.y - b.position.y)
  );
}
