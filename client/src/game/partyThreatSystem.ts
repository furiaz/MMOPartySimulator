import { isCombatEntity } from "./entities";
import { getPartyMembers, isPartyMember, type PartyMember } from "./partySystem";
import { getGridDistance } from "./positionUtils";
import { getEntityById, type GameState } from "./state";
import type { Enemy, GameEntity } from "./types";

type CommittedPartyThreatTargetOptions = {
  currentTarget?: Enemy | null;
  includeDirectPersonalAttackers?: boolean;
  range: number;
};

export function getActivePartyThreatTarget(state: GameState): Enemy | null {
  return (
    Object.values(state.entities).find((entity): entity is Enemy =>
      isActivePartyThreat(state, entity),
    ) ?? null
  );
}

export function hasActivePartyThreat(state: GameState): boolean {
  return getActivePartyThreatTarget(state) !== null;
}

export function getCommittedPartyThreatTarget(
  state: GameState,
  options: CommittedPartyThreatTargetOptions,
): Enemy | null {
  const immediateTarget = getImmediatePartyThreatTarget(state, options);

  if (immediateTarget) {
    return immediateTarget;
  }

  if (
    options.currentTarget &&
    isRetainableActivePartyThreat(state, options.currentTarget, options.range)
  ) {
    return options.currentTarget;
  }

  return getNearestActivePartyThreatTarget(state, options.range);
}

export function isPartyMemberRespondingToActiveThreat(
  state: GameState,
  partyMember: PartyMember,
): boolean {
  if (partyMember.state !== "attack" || !partyMember.currentTargetId) {
    return false;
  }

  const target = getEntityById(state, partyMember.currentTargetId);

  return (
    isLiveEnemy(target) &&
    target.state === "attack" &&
    target.currentTargetId === partyMember.id
  );
}

export function isActivePartyThreat(
  state: GameState,
  entity: GameEntity | undefined,
): entity is Enemy {
  if (!isLiveEnemy(entity) || entity.state !== "attack" || !entity.currentTargetId) {
    return false;
  }

  const target = getEntityById(state, entity.currentTargetId);

  return isLivingPartyMember(target);
}

export function isLivingPartyMember(
  entity: GameEntity | undefined,
): entity is PartyMember {
  return isPartyMember(entity) && entity.state !== "dead" && entity.health > 0;
}

export function getPartyMembersRespondingToActiveThreat(
  state: GameState,
): PartyMember[] {
  return getPartyMembers(state).filter((member) =>
    isPartyMemberRespondingToActiveThreat(state, member),
  );
}

function getImmediatePartyThreatTarget(
  state: GameState,
  options: CommittedPartyThreatTargetOptions,
): Enemy | null {
  const candidates = getPartyMembers(state).flatMap((member) => {
    const blocker = getMovementBlockerEnemy(state, member);
    const directAttacker = options.includeDirectPersonalAttackers
      ? getDirectPersonalAttacker(state, member, options.range)
      : null;
    const targets: { enemy: Enemy; priority: number; distance: number }[] = [];

    if (blocker && member.commandPriority !== "direct") {
      targets.push({
        enemy: blocker,
        priority: 0,
        distance: getGridDistance(member.position, blocker.position),
      });
    }

    if (directAttacker) {
      targets.push({
        enemy: directAttacker,
        priority: 1,
        distance: getGridDistance(member.position, directAttacker.position),
      });
    }

    return targets;
  });

  return getSortedThreatCandidates(candidates)[0]?.enemy ?? null;
}

function getMovementBlockerEnemy(
  state: GameState,
  member: PartyMember,
): Enemy | null {
  const failure = state.movementFailuresByEntityId?.[member.id];
  const blocker = failure?.blockerId
    ? getEntityById(state, failure.blockerId)
    : undefined;

  return isLiveEnemy(blocker) ? blocker : null;
}

function getDirectPersonalAttacker(
  state: GameState,
  member: PartyMember,
  range: number,
): Enemy | null {
  if (member.commandPriority !== "direct") {
    return null;
  }

  return (
    Object.values(state.entities)
      .filter((entity): entity is Enemy => isActivePartyThreat(state, entity))
      .filter(
        (enemy) =>
          enemy.currentTargetId === member.id &&
          getGridDistance(member.position, enemy.position) <= range,
      )
      .sort(
        (first, second) =>
          getGridDistance(member.position, first.position) -
            getGridDistance(member.position, second.position) ||
          first.id.localeCompare(second.id),
      )[0] ?? null
  );
}

function isRetainableActivePartyThreat(
  state: GameState,
  enemy: Enemy,
  range: number,
): boolean {
  return (
    isActivePartyThreat(state, enemy) &&
    isThreatWithinAutonomousPartyRange(state, enemy, range)
  );
}

function getNearestActivePartyThreatTarget(
  state: GameState,
  range: number,
): Enemy | null {
  return (
    getSortedThreatCandidates(
      Object.values(state.entities)
        .filter((entity): entity is Enemy => isActivePartyThreat(state, entity))
        .flatMap((enemy) => {
          const distance = getNearestAutonomousPartyDistance(state, enemy, range);

          return distance === null
            ? []
            : [{ enemy, priority: 2, distance }];
        }),
    )[0]?.enemy ?? null
  );
}

function isThreatWithinAutonomousPartyRange(
  state: GameState,
  enemy: Enemy,
  range: number,
): boolean {
  return getNearestAutonomousPartyDistance(state, enemy, range) !== null;
}

function getNearestAutonomousPartyDistance(
  state: GameState,
  enemy: Enemy,
  range: number,
): number | null {
  const distances = getPartyMembers(state)
    .filter(
      (member) =>
        member.commandPriority !== "direct" &&
        !isCompanionInDirectCommandGrace(state, member.id),
    )
    .map((member) => getGridDistance(member.position, enemy.position))
    .filter((distance) => distance <= range);

  return distances.length > 0 ? Math.min(...distances) : null;
}

function getSortedThreatCandidates<
  T extends { enemy: Enemy; priority: number; distance: number },
>(
  candidates: T[],
): T[] {
  return [...candidates].sort(
    (first, second) =>
      first.priority - second.priority ||
      first.distance - second.distance ||
      first.enemy.id.localeCompare(second.enemy.id),
  );
}

function isCompanionInDirectCommandGrace(
  state: GameState,
  companionId: string,
): boolean {
  const graceUntil = state.directCommandGraceUntilByCompanionId?.[companionId];

  return Boolean(
    graceUntil && graceUntil > (state.simulationTimeMs ?? Date.now()),
  );
}

function isLiveEnemy(entity: GameEntity | undefined): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}
