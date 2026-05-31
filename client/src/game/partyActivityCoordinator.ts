import { isCompanionInDirectCommandGrace } from "./directCompanionCommands";
import { isLivingEnemy } from "./entityGuards";
import { isWithinFollowLeash } from "./followSystem";
import { isWithinGathererLeaderBoundary } from "./gathererResourceReservation";
import {
  hasDirectPlayerPartyIntent,
} from "./partyIntentState";
import {
  getPartyCombatTarget,
  getPartyMovementTargetPosition,
} from "./partyTargetSystem";
import {
  getPartyMembers,
  getPartyLeader,
  isGathererBusy,
  isPartyMember,
  type PartyMember,
} from "./partySystem";
import {
  isActivePartyThreat,
  isPartyMemberRespondingToActiveThreat,
} from "./partyThreatSystem";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { getEntityById, type GameState } from "./state";
import type {
  Enemy,
  GameEntity,
  Position,
} from "./types";

export const PARTY_COHESION_DISTANCE = 4;
export const PARTY_WAIT_DISTANCE = 7;
export const FOLLOW_DISTANCE = 1.5;
export const FOLLOW_CATCHUP_DISTANCE = 5;
export const COMBAT_BREAK_DISTANCE = 3;
export const POI_REACHED_DISTANCE = 1;
export const GATHERER_REJOIN_DISTANCE = 6;

export type PartyActivityPlan = {
  phase: "traveling" | "combat";
  target: Enemy | null;
  targetPosition: Position | null;
};

type PartyActivityPlanOptions = {
  combatBreakDistance?: number;
};

type TravelCohesionOptions = {
  gathererRejoinDistance?: number;
};

export function resolvePartyActivityPlan(
  state: GameState,
  leader: PartyMember,
  options: PartyActivityPlanOptions = {},
): PartyActivityPlan {
  const combatBreakDistance =
    options.combatBreakDistance ?? COMBAT_BREAK_DISTANCE;
  const movementTargetPosition = getPartyMovementTargetPosition(state);

  if (hasDirectPlayerPartyIntent(state)) {
    const intentTarget = getPartyCombatTarget(state);

    return {
      phase:
        intentTarget &&
        getDistance(leader.position, intentTarget.position) <= combatBreakDistance
          ? "combat"
          : "traveling",
      target: intentTarget,
      targetPosition: intentTarget?.position ?? movementTargetPosition ?? null,
    };
  }

  const nearbyThreatTarget = getNearbyPartyThreatTarget(state, combatBreakDistance);
  const intentTarget = getPartyCombatTarget(state);
  const target = nearbyThreatTarget ?? intentTarget;

  return {
    phase:
      target &&
      isWithinPartyCombatDistance(state, leader, target, combatBreakDistance)
        ? "combat"
        : "traveling",
    target,
    targetPosition: target?.position ?? movementTargetPosition ?? null,
  };
}

export function canAssignPartyTravelTarget(
  state: GameState,
  member: PartyMember,
  leaderId: string,
  hasPlayerIntent: boolean,
): boolean {
  return (
    member.id !== leaderId &&
    member.commandPriority !== "direct" &&
    !isCompanionAssignedToResurrectionRecovery(state, member.id) &&
    (hasPlayerIntent || !isPartyMemberRespondingToActiveThreat(state, member)) &&
    (hasPlayerIntent || !isGathererBusy(state, member))
  );
}

export function canAssignPartyGatherTarget(
  state: GameState,
  member: PartyMember,
  hasPlayerIntent: boolean,
): boolean {
  return (
    member.commandPriority !== "direct" &&
    !isCompanionAssignedToResurrectionRecovery(state, member.id) &&
    (hasPlayerIntent || !isPartyMemberRespondingToActiveThreat(state, member))
  );
}

export function canAssignPartyCombatTarget(
  state: GameState,
  member: PartyMember,
  hasPlayerIntent: boolean,
): boolean {
  return (
    member.commandPriority !== "direct" &&
    !isCompanionAssignedToResurrectionRecovery(state, member.id) &&
    (hasPlayerIntent || !isPartyMemberRespondingToActiveThreat(state, member)) &&
    (hasPlayerIntent || !isGathererBusy(state, member))
  );
}

export function canAssignSelfDefenseTarget(
  state: GameState,
  member: PartyMember,
  target: Enemy,
): boolean {
  if (isCompanionAssignedToResurrectionRecovery(state, member.id)) {
    return false;
  }

  if (isCompanionPersonallyBlockedOrThreatened(state, member, target)) {
    return true;
  }

  return member.commandPriority !== "direct" && !isGathererBusy(state, member);
}

export function isRequiredForTravelCohesion(
  state: GameState,
  member: PartyMember,
  leader: PartyMember,
  options: TravelCohesionOptions = {},
): boolean {
  if (
    member.commandPriority === "direct" ||
    isCompanionInDirectCommandGrace(state, member.id) ||
    isCompanionAssignedToResurrectionRecovery(state, member.id) ||
    isPartyMemberRespondingToActiveThreat(state, member)
  ) {
    return false;
  }

  if (member.role !== "gatherer") {
    return true;
  }

  return (
    !isGathererBusy(state, member) &&
    getDistance(member.position, leader.position) <=
      (options.gathererRejoinDistance ?? GATHERER_REJOIN_DISTANCE)
  );
}

export function canUseAutonomousRoleBehavior(
  state: GameState,
  entity: GameEntity,
): entity is PartyMember {
  if (
    !isPartyMember(entity) ||
    isCompanionAssignedToResurrectionRecovery(state, entity.id) ||
    entity.commandPriority === "direct" ||
    isPartyMemberRespondingToActiveThreat(state, entity) ||
    (entity.state !== "idle" &&
      entity.state !== "follow" &&
      entity.state !== "attack" &&
      entity.state !== "gather" &&
      entity.state !== "defend")
  ) {
    return false;
  }

  if (entity.state === "attack") {
    return entity.role === "gatherer";
  }

  if (entity.state === "gather") {
    return entity.role === "gatherer";
  }

  if (entity.state === "idle" || entity.state === "defend") {
    return true;
  }

  const followTarget = getPartyLeader(state);

  if (entity.role === "gatherer") {
    return Boolean(
      followTarget && isWithinGathererLeaderBoundary(state, entity, followTarget),
    );
  }

  return Boolean(followTarget && isWithinFollowLeash(state, entity, followTarget));
}

function getNearbyPartyThreatTarget(
  state: GameState,
  combatBreakDistance: number,
): Enemy | null {
  return (
    Object.values(state.entities)
      .filter((entity): entity is Enemy => isActivePartyThreat(state, entity))
      .filter((enemy) =>
        getPartyMembers(state).some(
          (member) =>
            member.commandPriority !== "direct" &&
            !isCompanionInDirectCommandGrace(state, member.id) &&
            getDistance(member.position, enemy.position) <= combatBreakDistance,
        ),
      )
      .sort(
        (first, second) =>
          getNearestPartyDistance(state, first) -
            getNearestPartyDistance(state, second) ||
          first.id.localeCompare(second.id),
      )[0] ?? null
  );
}

function isWithinPartyCombatDistance(
  state: GameState,
  leader: PartyMember,
  target: Enemy,
  combatBreakDistance: number,
): boolean {
  if (getDistance(leader.position, target.position) <= combatBreakDistance) {
    return true;
  }

  return getNearestPartyDistance(state, target) <= combatBreakDistance;
}

function getNearestPartyDistance(state: GameState, target: Enemy): number {
  const distances = getPartyMembers(state)
    .filter(
      (member) =>
        member.commandPriority !== "direct" &&
        !isCompanionInDirectCommandGrace(state, member.id),
    )
    .map((member) => getDistance(member.position, target.position));

  return distances.length > 0 ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

function isCompanionPersonallyBlockedOrThreatened(
  state: GameState,
  member: PartyMember,
  target: Enemy,
): boolean {
  return (
    getMovementBlockerEnemy(state, member)?.id === target.id ||
    target.currentTargetId === member.id
  );
}

function getMovementBlockerEnemy(
  state: GameState,
  member: PartyMember,
): Enemy | null {
  const failure = state.movementFailuresByEntityId?.[member.id];
  const blocker = failure?.blockerId
    ? getEntityById(state, failure.blockerId)
    : undefined;

  return isLivingEnemy(blocker) ? blocker : null;
}

function getDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}
