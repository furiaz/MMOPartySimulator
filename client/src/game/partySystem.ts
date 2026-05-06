import { getEntityById, updateEntity, type GameState } from "./state";
import { getRolePriority } from "./roleProfiles";
import type {
  Companion,
  GameEntity,
  PartyMemberRole,
  Player,
  ResourceEntity,
} from "./types";

export type PartyMember = Player | Companion;

export function isPartyMember(
  entity: GameEntity | undefined,
): entity is PartyMember {
  return entity?.kind === "player" || entity?.kind === "companion";
}

export function getPartyMembers(state: GameState): PartyMember[] {
  return Object.values(state.entities).filter(
    (entity): entity is PartyMember =>
      isPartyMember(entity) && entity.state !== "dead",
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
    (entity) => !isGathererBusy(state, entity),
  );
}

export function getRequiredFormationMembers(state: GameState): PartyMember[] {
  return getOrderedPartyMembers(state).filter(
    (entity) => entity.role !== "gatherer" || !isGathererBusy(state, entity),
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
): GameState {
  const entity = getEntityById(state, entityId);

  if (!isPartyMember(entity)) {
    return state;
  }

  return updateEntity(state, {
    ...entity,
    role,
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

function isActiveResource(
  entity: GameEntity | undefined,
): entity is ResourceEntity {
  return (
    entity?.kind === "resource" &&
    !entity.isDepleted &&
    entity.quantity > 0
  );
}
