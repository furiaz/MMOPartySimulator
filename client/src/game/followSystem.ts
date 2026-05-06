import { isAutonomousEntity } from "./entities";
import {
  getEntityById,
  moveEntityTowardPositionIfUnoccupied,
  type GameState,
} from "./state";
import { getSoftFollowPosition, isStackedWithPartyMember } from "./partySpacing";
import { getPartyLeader, isGathererBusy, isPartyMember } from "./partySystem";
import type { AutonomousEntity, GameEntity, Position } from "./types";

export const FOLLOW_LEASH_RADIUS = 1.5;
const FOLLOW_CATCHUP_DISTANCE = 5;

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
      follower.commandPriority === "direct" ||
      isGathererBusy(nextState, follower) ||
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
    const stepCount =
      getDistance(follower.position, leader.position) >= FOLLOW_CATCHUP_DISTANCE
        ? 2
        : 1;

    for (let step = 0; step < stepCount; step += 1) {
      const currentFollower = getEntityById(nextState, follower.id);
      const currentLeader = getPartyLeader(nextState);

      if (
        !currentFollower ||
        !currentLeader ||
        !isFollowingAutonomousEntity(currentFollower) ||
        (isWithinFollowLeash(nextState, currentFollower, currentLeader) &&
          !isStackedWithPartyMember(nextState, currentFollower))
      ) {
        break;
      }

      nextState = moveEntityTowardPositionIfUnoccupied(
        nextState,
        currentFollower,
        getSoftFollowPosition(
          nextState,
          currentFollower,
          currentLeader,
          nextState.leaderIntent?.targetPosition,
        ),
        { allowPartyPassThrough: true },
      );
    }

    const movedFollower = getEntityById(nextState, follower.id);

    if (
      movedFollower &&
      !isSamePosition(previousPosition, movedFollower.position)
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
  return getDistance(entity.position, target.position) <= FOLLOW_LEASH_RADIUS;
}

function isFollowingAutonomousEntity(
  entity: GameEntity,
): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "follow";
}

function getDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}
