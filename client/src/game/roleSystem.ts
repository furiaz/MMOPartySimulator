import { isWithinFollowLeash } from "./followSystem";
import { updateEntity, type GameState } from "./state";
import { findEnemyTarget, findResourceTarget } from "./targetSelection";
import type { Companion, GameEntity, Player, Position, ResourceEntity } from "./types";

export const GATHERER_RESOURCE_SEARCH_PATH_DISTANCE = 30;
const GATHERER_COMBAT_ASSIST_RADIUS = 8;
const FIGHTER_ENEMY_SEARCH_RADIUS = 8;

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

  return Boolean(followTarget && isWithinFollowLeash(state, entity, followTarget));
}

function getRoleTarget(
  state: GameState,
  companion: Companion,
): { state: "attack" | "gather" | "follow"; targetId: string } | null {
  if (companion.role === "fighter") {
    const followTarget = state.entities[companion.followTargetId];

    if (!followTarget) {
      return null;
    }

    const enemy = findEnemyTarget(state, followTarget, {
      maxDistance: FIGHTER_ENEMY_SEARCH_RADIUS,
    });

    return enemy
      ? { state: "attack", targetId: enemy.id }
      : { state: "follow", targetId: companion.followTargetId };
  }

  if (companion.role === "gatherer") {
    const resource = findGathererTarget(state, companion);

    if (resource) {
      return { state: "gather", targetId: resource.id };
    }

    const enemy = findEnemyTarget(state, companion, {
      maxDistance: GATHERER_COMBAT_ASSIST_RADIUS,
      includeEngagedOutsideRange: true,
    });

    return enemy ? { state: "attack", targetId: enemy.id } : null;
  }

  return null;
}

function findGathererTarget(
  state: GameState,
  companion: Companion,
): ResourceEntity | undefined {
  return findResourceTarget(
    state,
    companion,
    getGathererWorkOrigin(state, companion),
    { maxDistance: GATHERER_RESOURCE_SEARCH_PATH_DISTANCE },
  );
}

export function getGathererWorkOrigin(
  state: GameState,
  companion: Companion,
): Position {
  return (
    Object.values(state.entities).find(isPlayer)?.position ??
    state.entities[companion.followTargetId]?.position ??
    companion.position
  );
}

function isPlayer(entity: GameEntity): entity is Player {
  return entity.kind === "player";
}
