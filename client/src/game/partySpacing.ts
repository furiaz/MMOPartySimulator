import { getFollowTrailPosition, type GameState } from "./state";
import { ENTITY_COLLISION_DISTANCE } from "./movementPlanning";
import { getOrderedPartyMembers, type PartyMember } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import type { GameEntity, Position } from "./types";

const SOFT_SIDE_SPACING = 0.9;
const SOFT_BACK_SPACING = 0.45;
const STACK_DISTANCE = 0.45;
export const COMBAT_PARTY_SPACING_DISTANCE = ENTITY_COLLISION_DISTANCE;

export function getSoftFollowPosition(
  state: GameState,
  member: PartyMember,
  leader: PartyMember,
  intentPosition?: Position | null,
): Position {
  const direction = getLeaderDirection(state, leader, intentPosition);
  const perpendicular =
    direction.x === 0 && direction.y === 0
      ? { x: 1, y: 0 }
      : { x: -direction.y, y: direction.x };
  const offsetRank = getFollowOffsetRank(state, member, leader);

  return {
    x:
      leader.position.x +
      perpendicular.x * offsetRank * SOFT_SIDE_SPACING -
      direction.x * SOFT_BACK_SPACING,
    y:
      leader.position.y +
      perpendicular.y * offsetRank * SOFT_SIDE_SPACING -
      direction.y * SOFT_BACK_SPACING,
  };
}

export function isStackedWithPartyMember(
  state: GameState,
  member: PartyMember,
): boolean {
  return getOrderedPartyMembers(state).some(
    (otherMember) =>
      otherMember.id !== member.id &&
      getEuclideanDistance(member.position, otherMember.position) < STACK_DISTANCE,
  );
}

export function isCombatPositionSpacedFromParty(
  state: GameState,
  attacker: GameEntity,
  position: Position,
): boolean {
  if (attacker.kind !== "companion") {
    return true;
  }

  return getOrderedPartyMembers(state).every((member) => {
    if (
      member.id === attacker.id ||
      member.state === "dead" ||
      member.health <= 0
    ) {
      return true;
    }

    const reservedPosition = state.reservedPositionsByEntityId?.[member.id];

    return (
      getEuclideanDistance(position, member.position) >=
        COMBAT_PARTY_SPACING_DISTANCE &&
      (!reservedPosition ||
        getEuclideanDistance(position, reservedPosition) >=
          COMBAT_PARTY_SPACING_DISTANCE)
    );
  });
}

function getLeaderDirection(
  state: GameState,
  leader: PartyMember,
  intentPosition?: Position | null,
): Position {
  if (intentPosition) {
    const direction = normalizeDirection({
      x: intentPosition.x - leader.position.x,
      y: intentPosition.y - leader.position.y,
    });

    if (direction.x !== 0 || direction.y !== 0) {
      return direction;
    }
  }

  const previousPosition = getFollowTrailPosition(state, leader.id, 0);

  return previousPosition
    ? normalizeDirection({
        x: leader.position.x - previousPosition.x,
        y: leader.position.y - previousPosition.y,
      })
    : { x: 0, y: 0 };
}

function normalizeDirection(direction: Position): Position {
  const length = Math.hypot(direction.x, direction.y);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: direction.x / length,
    y: direction.y / length,
  };
}

function getFollowOffsetRank(
  state: GameState,
  member: PartyMember,
  leader: PartyMember,
): number {
  const followers = getOrderedPartyMembers(state).filter(
    (partyMember) => partyMember.id !== leader.id,
  );
  const index = followers.findIndex((partyMember) => partyMember.id === member.id);
  const offsetPattern = [-1, 1, -2, 2];

  return offsetPattern[index] ?? 0;
}
