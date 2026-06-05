import { getEntityById, updateEntity, type GameState } from "./state";
import { createPendingRoleBonusState } from "./roleBonus";
import { getRolePriority } from "./roleProfiles";
import { isActiveResource } from "./entityGuards";
import type {
  Companion,
  GameEntity,
  PartyMemberRole,
} from "./types";

export type PartyMember = Companion;

export function isPartyMember(
  entity: GameEntity | undefined,
): entity is PartyMember {
  return entity?.kind === "companion";
}

export function getPartyMembers(state: GameState): PartyMember[] {
  return Object.values(state.entities).filter(
    (entity): entity is PartyMember =>
      isPartyMember(entity) && entity.state !== "dead",
  );
}

export function hasDeadPartyMembers(state: GameState): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      isPartyMember(entity) && (entity.state === "dead" || entity.health <= 0),
  );
}

export function getPartyLeader(state: GameState): PartyMember | undefined {
  const leader = getEntityById(state, state.partyLeaderId);

  if (isPartyMember(leader) && leader.state !== "dead") {
    return leader;
  }

  return getPartyMembers(state)[0];
}

export function getOrderedPartyMembers(state: GameState): PartyMember[] {
  return getPartyMembers(state).sort(comparePartyMembers);
}

export function getOrderedFormationMembers(state: GameState): PartyMember[] {
  return getOrderedPartyMembers(state).filter(
    (entity) => !isPartyMemberBusyGatheringResource(state, entity),
  );
}

export function getRequiredFormationMembers(state: GameState): PartyMember[] {
  return getOrderedPartyMembers(state).filter(
    (entity) => !isPartyMemberBusyGatheringResource(state, entity),
  );
}

export function isGathererBusy(
  state: GameState,
  entity: PartyMember,
): boolean {
  if (entity.role !== "gatherer" || entity.state !== "gather") {
    return false;
  }

  const target = entity.currentTargetId
    ? getEntityById(state, entity.currentTargetId)
    : undefined;

  return isActiveResource(target);
}

export function isPartyMemberBusyGatheringResource(
  state: GameState,
  entity: PartyMember,
): boolean {
  if (entity.state !== "gather") {
    return false;
  }

  const target = entity.currentTargetId
    ? getEntityById(state, entity.currentTargetId)
    : undefined;

  return isActiveResource(target);
}

export function setPartyLeader(
  state: GameState,
  entityId: string,
): GameState {
  const entity = getEntityById(state, entityId);

  if (!isPartyMember(entity)) {
    return state;
  }

  return {
    ...state,
    partyLeaderId: entity.id,
  };
}

export function setPartyMemberRole(
  state: GameState,
  entityId: string,
  role: PartyMemberRole,
  nowMs = Date.now(),
): GameState {
  const entity = getEntityById(state, entityId);

  if (!isPartyMember(entity)) {
    return state;
  }

  if (entity.role === role) {
    return state;
  }

  return updateEntity(state, {
    ...entity,
    role,
    roleBonus: createPendingRoleBonusState(role, nowMs),
  });
}

export function setPartyOrder(
  state: GameState,
  entityId: string,
  partyOrder: number,
): GameState {
  const entity = getEntityById(state, entityId);

  if (!isPartyMember(entity)) {
    return state;
  }

  return updateEntity(state, {
    ...entity,
    partyOrder,
  });
}

function comparePartyMembers(a: PartyMember, b: PartyMember): number {
  return (
    getRolePriority(a.role) - getRolePriority(b.role) ||
    a.partyOrder - b.partyOrder ||
    a.id.localeCompare(b.id)
  );
}

