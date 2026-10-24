import { hasDirectCompanionAuthority, getDirectLeaderCommand, canFollowDirectLeader } from "./directCommandState";
import { isAutonomousEntity } from "./entities";
import {
  getEntityById,
  type GameState,
} from "./state";
import { holdEntityMovement, moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { getSoftFollowPosition, isStackedWithPartyMember } from "./partySpacing";
import {
  getOrderedPartyMembers,
  getPartyLeader,
  isPartyMember,
  isPartyMemberBusyGatheringResource,
} from "./partySystem";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { getPartyMovementTargetPosition } from "./partyTargetSystem";
import { arePositionsEqual, getGridDistance } from "./positionUtils";
import type { AutonomousEntity, GameEntity, Position } from "./types";

export const FOLLOW_LEASH_RADIUS = 1.5;
const FOLLOW_CATCHUP_DISTANCE = 5;
const FOLLOW_CATCH_UP_SPEED_MULTIPLIER = 1.8;
const SETTLE_SIDE_SPACING = 0.9;
const SETTLE_BACK_SPACING = 0.45;

export function updateFollowSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const leader = getPartyLeader(nextState);

  for (const entity of Object.values(state.entities)) {
    const follower = getEntityById(nextState, entity.id);

    if (
      !leader ||
      !follower ||
      (!isFollowingAutonomousEntity(follower) && !canFollowDirectLeader(nextState, follower)) ||
      !isPartyMember(follower) ||
      follower.id === leader.id ||
      isCompanionAssignedToResurrectionRecovery(nextState, follower.id) ||
      hasDirectCompanionAuthority(nextState, follower) ||
      isPartyMemberBusyGatheringResource(nextState, follower) ||
      movedEntityIds.has(follower.id)
    ) {
      continue;
    }

    if (
      isWithinFollowLeash(nextState, follower, leader) &&
      !isStackedWithPartyMember(nextState, follower)
    ) {
      nextState = holdEntityMovement(nextState, follower, "follow", "follow settled");
      continue;
    }

    const previousPosition = follower.position;
    const speedMultiplier =
      getGridDistance(follower.position, leader.position) >= FOLLOW_CATCHUP_DISTANCE
        ? FOLLOW_CATCH_UP_SPEED_MULTIPLIER
        : 1;

    const directLeaderCommand = getDirectLeaderCommand(nextState);
    const movementTargetPosition = directLeaderCommand
      ? (directLeaderCommand.type === "move" ? directLeaderCommand.targetPosition : null)
      : getPartyMovementTargetPosition(nextState);
    const followPosition = movementTargetPosition
      ? getSoftFollowPosition(
          nextState,
          follower,
          leader,
          movementTargetPosition,
        )
      : getSettledFollowPosition(nextState, follower, leader);

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      follower,
      followPosition,
      {
        allowPartyPassThrough: true,
        pathProfile: "follow",
        source: "follow",
        // Without a travel intent the game loop can idle the follower after
        // this step, even if it has not reached its soft follow destination.
        isSettlingPosition: position => !movementTargetPosition || getGridDistance(position, leader.position) <= FOLLOW_LEASH_RADIUS,
        pathTargetKey: getFollowPathTargetKey(
          leader.id,
          follower.id,
          followPosition,
          Boolean(movementTargetPosition),
        ),
        pathTargetPosition: followPosition,
        speedMultiplier,
      },
    );

    const movedFollower = getEntityById(nextState, follower.id);

    if (
      movedFollower &&
      !arePositionsEqual(previousPosition, movedFollower.position)
    ) {
      movedEntityIds.add(follower.id);
    }
  }

  return nextState;
}

function getSettledFollowPosition(
  state: GameState,
  follower: AutonomousEntity,
  leader: AutonomousEntity,
): Position {
  const followers = getOrderedPartyMembers(state).filter(
    (partyMember) => partyMember.id !== leader.id,
  );
  const index = followers.findIndex((partyMember) => partyMember.id === follower.id);
  const offsetPattern = [-1, 1, -2, 2];
  const offsetRank = offsetPattern[index] ?? 0;

  return {
    x: leader.position.x + offsetRank * SETTLE_SIDE_SPACING,
    y: leader.position.y + SETTLE_BACK_SPACING,
  };
}

function getFollowPathTargetKey(
  leaderId: string,
  followerId: string,
  followPosition: Position,
  hasMovementTarget: boolean,
): string {
  if (hasMovementTarget) {
    return `follow:${leaderId}`;
  }

  return [
    "follow",
    leaderId,
    followerId,
    followPosition.x.toFixed(2),
    followPosition.y.toFixed(2),
  ].join(":");
}

export function isWithinFollowLeash(
  _state: GameState,
  entity: GameEntity,
  target: GameEntity,
): boolean {
  return getGridDistance(entity.position, target.position) <= FOLLOW_LEASH_RADIUS;
}

function isFollowingAutonomousEntity(
  entity: GameEntity,
): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "follow";
}
