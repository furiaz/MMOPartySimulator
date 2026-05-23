import { isCombatEntity } from "./entities";
import { getPartyMembers, isPartyMember, type PartyMember } from "./partySystem";
import { getEntityById, type GameState } from "./state";
import type { Enemy, GameEntity } from "./types";

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

function isLiveEnemy(entity: GameEntity | undefined): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}
