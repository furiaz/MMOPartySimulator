import { isCombatEntity } from "./entities";
import { isWithinFollowLeash } from "./followSystem";
import {
  getFollowTrailPosition,
  updateEntity,
  type GameState,
} from "./state";
import { getPartyLeader, isPartyMember, type PartyMember } from "./partySystem";
import { ROLE_TUNING } from "./roleProfiles";
import { findResourceTarget } from "./targetSelection";
import type {
  Companion,
  Enemy,
  GameEntity,
  Player,
  Position,
  ResourceEntity,
} from "./types";

export const GATHERER_RESOURCE_SEARCH_PATH_DISTANCE =
  ROLE_TUNING.gatherer.resourceSearchRange ?? 30;
const DEFENDER_ENEMY_SEARCH_RADIUS = ROLE_TUNING.defender.engageRange ?? 6;
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
): entity is PartyMember {
  if (
    !isPartyMember(entity) ||
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

  const followTarget = getPartyLeader(state);

  return Boolean(followTarget && isWithinFollowLeash(state, entity, followTarget));
}

function getRoleTarget(
  state: GameState,
  partyMember: PartyMember,
): { state: "attack" | "gather" | "follow" | "defend"; targetId: string | null } | null {
  const leader = getPartyLeader(state);
  const isTravelFormation = isFormationTravelMovementActive(state);

  if (partyMember.role === "fighter") {
    const followTarget = leader;

    if (!followTarget) {
      return null;
    }

    if (isTravelFormation) {
      return getFollowTarget(partyMember, followTarget);
    }

    const enemy = getLeaderCombatTarget(state, followTarget);

    return enemy
      ? { state: "attack", targetId: enemy.id }
      : getFollowTarget(partyMember, followTarget);
  }

  if (partyMember.role === "gatherer") {
    const resource = findGathererTarget(state, partyMember);

    if (resource) {
      return { state: "gather", targetId: resource.id };
    }

    if (isTravelFormation) {
      return null;
    }

    return leader ? getFollowTarget(partyMember, leader) : null;
  }

  if (partyMember.role === "support") {
    if (isTravelFormation) {
      return null;
    }

    const enemy = leader ? getLeaderCombatTarget(state, leader) : undefined;

    return enemy ? { state: "attack", targetId: enemy.id } : null;
  }

  if (partyMember.role === "defender") {
    return partyMember.kind === "companion"
      ? { state: "defend", targetId: null }
      : null;
  }

  return null;
}

function findGathererTarget(
  state: GameState,
  partyMember: PartyMember,
): ResourceEntity | undefined {
  return findResourceTarget(
    state,
    partyMember,
    getGathererWorkOrigin(state, partyMember),
    { maxDistance: GATHERER_RESOURCE_SEARCH_PATH_DISTANCE },
  );
}

function isFormationTravelMovementActive(state: GameState): boolean {
  return (
    state.partyFormation?.phase === "forming" ||
    state.partyFormation?.phase === "traveling"
  );
}

export function getGathererWorkOrigin(
  state: GameState,
  partyMember: PartyMember,
): Position {
  return (
    getPartyLeader(state)?.position ??
    partyMember.position
  );
}

function getFollowTarget(
  partyMember: PartyMember,
  leader: PartyMember,
): { state: "follow"; targetId: string | null } {
  return {
    state: "follow",
    targetId: partyMember.kind === "companion" ? leader.id : null,
  };
}

export function getDefenderAnchorPosition(
  state: GameState,
  companion: Companion,
): Position {
  if (companion.defendPosition) {
    return companion.defendPosition;
  }

  const followTarget = getPartyLeader(state) ?? state.entities[companion.followTargetId];

  if (followTarget?.kind === "player") {
    return getLeaderIntentAnchorPosition(state, companion, followTarget);
  }

  return (
    followTarget?.position ??
    companion.position
  );
}

function getLeaderCombatTarget(
  state: GameState,
  leader: GameEntity,
): Enemy | undefined {
  return getLeaderEnemyTarget(state, leader);
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

  if (!isPartyMember(leader)) {
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
  return isPartyMember(entity) && (entity.id === leaderId || entity.state !== "dead");
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
