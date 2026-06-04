import { isAutonomousEntity } from "./entities";
import {
  getEntityById,
  type GameState,
} from "./state";
import { moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import { getSoftFollowPosition, isStackedWithPartyMember } from "./partySpacing";
import {
  getPartyLeader,
  isPartyMember,
  isPartyMemberBusyGatheringResource,
} from "./partySystem";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { getPartyMovementTargetPosition } from "./partyTargetSystem";
import { arePositionsEqual, getGridDistance } from "./positionUtils";
import type { AutonomousEntity, GameEntity } from "./types";

export const FOLLOW_LEASH_RADIUS = 1.5;
const FOLLOW_CATCHUP_DISTANCE = 5;
const FOLLOW_CATCH_UP_SPEED_MULTIPLIER = 1.8;

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
      !isFollowingAutonomousEntity(follower) ||
      !isPartyMember(follower) ||
      follower.id === leader.id ||
      isCompanionAssignedToResurrectionRecovery(nextState, follower.id) ||
      follower.commandPriority === "direct" ||
      isPartyMemberBusyGatheringResource(nextState, follower) ||
      movedEntityIds.has(follower.id)
    ) {
      continue;
    }

    if (
      isWithinFollowLeash(nextState, follower, leader) &&
      !isStackedWithPartyMember(nextState, follower)
    ) {
      continue;
    }

    const previousPosition = follower.position;
    const speedMultiplier =
      getGridDistance(follower.position, leader.position) >= FOLLOW_CATCHUP_DISTANCE
        ? FOLLOW_CATCH_UP_SPEED_MULTIPLIER
        : 1;

    const followPosition = getSoftFollowPosition(
      nextState,
      follower,
      leader,
      getPartyMovementTargetPosition(nextState),
    );

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      follower,
      followPosition,
      {
        allowPartyPassThrough: true,
        pathProfile: "follow",
        pathTargetKey: `follow:${leader.id}`,
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
