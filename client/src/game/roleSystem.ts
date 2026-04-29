import { isCombatEntity } from "./entities";
import { isWithinFollowLeash } from "./followSystem";
import {
  getFollowTrailPosition,
  updateEntity,
  type GameState,
} from "./state";
import { findEnemyTarget, findResourceTarget } from "./targetSelection";
import type {
  Companion,
  Enemy,
  GameEntity,
  Player,
  Position,
  ResourceEntity,
} from "./types";

export const GATHERER_RESOURCE_SEARCH_PATH_DISTANCE = 30;
const GATHERER_COMBAT_ASSIST_RADIUS = 8;
const FIGHTER_ENEMY_SEARCH_RADIUS = 8;
const DEFENDER_ENEMY_SEARCH_RADIUS = 6;
const DEFENDER_ANCHOR_LEASH_DISTANCE = 6;
const DEFENDER_LEADER_LEASH_DISTANCE = 8;
const LEADER_INTENT_DISTANCE = 1;

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
    (entity.state !== "idle" &&
      entity.state !== "follow" &&
      entity.state !== "defend")
  ) {
    return false;
  }

  if (entity.state === "idle" || entity.state === "defend") {
    return true;
  }

  const followTarget = state.entities[entity.followTargetId];

  return Boolean(followTarget && isWithinFollowLeash(state, entity, followTarget));
}

function getRoleTarget(
  state: GameState,
  companion: Companion,
): { state: "attack" | "gather" | "follow" | "defend"; targetId: string | null } | null {
  if (companion.role === "fighter") {
    const followTarget = state.entities[companion.followTargetId];

    if (!followTarget) {
      return null;
    }

    const enemy =
      getLeaderCombatTarget(state, followTarget) ??
      findEnemyTarget(state, followTarget, {
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

  if (companion.role === "defender") {
    return { state: "defend", targetId: null };
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

export function getDefenderAnchorPosition(
  state: GameState,
  companion: Companion,
): Position {
  if (companion.defendPosition) {
    return companion.defendPosition;
  }

  const followTarget = state.entities[companion.followTargetId];

  if (followTarget?.kind === "player") {
    return getLeaderIntentAnchorPosition(state, companion, followTarget);
  }

  return (
    followTarget?.position ??
    companion.position
  );
}

function isPlayer(entity: GameEntity): entity is Player {
  return entity.kind === "player";
}

function getLeaderCombatTarget(
  state: GameState,
  leader: GameEntity,
): Enemy | undefined {
  const target = getLeaderEnemyTarget(state, leader);

  if (!target) {
    return undefined;
  }

  const nearbyLeaderTarget = findEnemyTarget(state, leader, {
    maxDistance: FIGHTER_ENEMY_SEARCH_RADIUS,
  });

  return nearbyLeaderTarget?.id === target.id ? target : undefined;
}

export function getLeaderEnemyTarget(
  state: GameState,
  leader: GameEntity,
): Enemy | undefined {
  if (isCombatEntity(leader) && leader.currentTargetId) {
    const currentTarget = state.entities[leader.currentTargetId];

    if (isValidEnemyTarget(currentTarget)) {
      return currentTarget;
    }
  }

  if (leader.kind !== "player") {
    return undefined;
  }

  const targetId = state.leaderIntent?.targetId;

  if (!targetId) {
    return undefined;
  }

  const target = state.entities[targetId];

  return isValidEnemyTarget(target) ? target : undefined;
}

export function isDefenderAttackTargetRelevant(
  state: GameState,
  defender: Companion,
  target: GameEntity,
): boolean {
  if (
    defender.role !== "defender" ||
    defender.commandPriority === "direct" ||
    !isValidEnemyTarget(target)
  ) {
    return true;
  }

  const leader = state.entities[defender.followTargetId];

  if (!leader) {
    return false;
  }

  const defendPosition = getDefenderAnchorPosition(state, defender);

  if (
    getGridDistance(defender.position, defendPosition) >
      DEFENDER_ANCHOR_LEASH_DISTANCE ||
    getGridDistance(defender.position, leader.position) >
      DEFENDER_LEADER_LEASH_DISTANCE
  ) {
    return false;
  }

  const leaderTarget = getLeaderEnemyTarget(state, leader);

  if (
    leaderTarget?.id === target.id &&
    getGridDistance(defendPosition, target.position) <=
      DEFENDER_ENEMY_SEARCH_RADIUS
  ) {
    return true;
  }

  return isThreateningLeaderFrontArea(state, target, leader, defendPosition);
}

function isValidEnemyTarget(
  entity: GameEntity | undefined,
): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function isThreateningLeaderFrontArea(
  state: GameState,
  enemy: Enemy,
  leader: GameEntity,
  defendPosition: Position,
): boolean {
  if (enemy.state !== "attack" || !enemy.currentTargetId) {
    return false;
  }

  const target = state.entities[enemy.currentTargetId];

  if (!target || !isPartyEntityForLeader(target, leader.id)) {
    return false;
  }

  return (
    getGridDistance(enemy.position, leader.position) <=
      DEFENDER_ENEMY_SEARCH_RADIUS ||
    getGridDistance(enemy.position, defendPosition) <=
      DEFENDER_ENEMY_SEARCH_RADIUS ||
    getGridDistance(target.position, leader.position) <=
      DEFENDER_ENEMY_SEARCH_RADIUS ||
    getGridDistance(target.position, defendPosition) <=
      DEFENDER_ENEMY_SEARCH_RADIUS
  );
}

function isPartyEntityForLeader(entity: GameEntity, leaderId: string): boolean {
  return (
    entity.id === leaderId ||
    (entity.kind === "companion" && entity.followTargetId === leaderId)
  );
}

function getLeaderIntentAnchorPosition(
  state: GameState,
  companion: Companion,
  leader: Player,
): Position {
  const leaderIntent = getLeaderIntentPosition(state, leader);
  const movementDirection = getLeaderMovementDirection(state, leader);
  const targetPosition = getResolvedLeaderIntentTargetPosition(state, leader);
  const defenderOffset = getDefenderSideOffset(
    state,
    companion,
    movementDirection,
    Boolean(targetPosition),
  );

  return {
    x: leaderIntent.x + defenderOffset.x,
    y: leaderIntent.y + defenderOffset.y,
  };
}

export function getLeaderIntentPosition(
  state: GameState,
  leader: Player,
): Position {
  const movementDirection = getLeaderMovementDirection(state, leader);

  return {
    x: leader.position.x + movementDirection.x * LEADER_INTENT_DISTANCE,
    y: leader.position.y + movementDirection.y * LEADER_INTENT_DISTANCE,
  };
}

export function getLeaderMovementDirection(
  state: GameState,
  leader: Player,
): Position {
  const targetPosition = getResolvedLeaderIntentTargetPosition(state, leader);

  if (targetPosition) {
    const xDirection = Math.sign(targetPosition.x - leader.position.x);
    const yDirection = Math.sign(targetPosition.y - leader.position.y);

    if (xDirection !== 0 || yDirection !== 0) {
      return {
        x: xDirection,
        y: yDirection,
      };
    }
  }

  const previousPosition = getFollowTrailPosition(state, leader.id, 0);

  if (!previousPosition) {
    return { x: 0, y: 0 };
  }

  const xDirection = Math.sign(leader.position.x - previousPosition.x);
  const yDirection = Math.sign(leader.position.y - previousPosition.y);

  return {
    x: xDirection,
    y: yDirection,
  };
}

export function getResolvedLeaderIntentTargetPosition(
  state: GameState,
  leader?: Player,
): Position | null {
  const currentTarget = leader?.currentTargetId
    ? state.entities[leader.currentTargetId]
    : undefined;

  if (leader?.state === "attack" && currentTarget && currentTarget.state !== "dead") {
    return currentTarget.position;
  }

  const leaderIntent = state.leaderIntent;

  if (!leaderIntent) {
    return null;
  }

  const target = leaderIntent.targetId
    ? state.entities[leaderIntent.targetId]
    : undefined;

  if (target && target.state !== "dead") {
    return target.position;
  }

  return leaderIntent.targetPosition;
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getDefenderSideOffset(
  state: GameState,
  companion: Companion,
  movementDirection: Position,
  avoidCenter: boolean,
): Position {
  if (movementDirection.x === 0 && movementDirection.y === 0) {
    return { x: 0, y: 0 };
  }

  const defenders = Object.values(state.entities).filter(
    (entity): entity is Companion =>
      entity.kind === "companion" &&
      entity.role === "defender" &&
      entity.followTargetId === companion.followTargetId &&
      entity.commandPriority !== "direct",
  );
  const defenderIndex = defenders.findIndex((entity) => entity.id === companion.id);
  const offsetRank = getDefenderOffsetRank(
    defenderIndex,
    defenders.length,
    avoidCenter,
  );

  if (offsetRank === 0) {
    return { x: 0, y: 0 };
  }

  const perpendicular = {
    x: -movementDirection.y,
    y: movementDirection.x,
  };

  return {
    x: perpendicular.x * offsetRank,
    y: perpendicular.y * offsetRank,
  };
}

function getDefenderOffsetRank(
  index: number,
  defenderCount: number,
  avoidCenter: boolean,
): number {
  if (index < 0) {
    return 0;
  }

  if (avoidCenter) {
    const offsetPattern = [-1, 1, -2, 2, -3, 3];

    return offsetPattern[index] ?? 0;
  }

  if (defenderCount <= 1) {
    return 0;
  }

  if (defenderCount === 2) {
    return index === 0 ? -1 : 1;
  }

  const offsetPattern = [0, -1, 1, -2, 2];

  return offsetPattern[index] ?? 0;
}
