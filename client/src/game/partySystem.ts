import { getEntityById, updateEntity, type GameState } from "./state";
import { pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
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

export function getActiveCompanions(state: GameState): PartyMember[] {
  return Object.values(state.entities).filter(isPartyMember);
}

export function getActiveCompanionsInPartyOrder(
  state: GameState,
): PartyMember[] {
  return getActiveCompanions(state).sort(
    (first, second) =>
      first.partyOrder - second.partyOrder || first.id.localeCompare(second.id),
  );
}

export function getRestingCompanions(state: GameState): PartyMember[] {
  return Object.values(state.restingCompanionsById ?? {});
}

export function getAllRosterCompanions(state: GameState): PartyMember[] {
  return [...getActiveCompanions(state), ...getRestingCompanions(state)];
}

export function getHighestCompanionCharacterLevel(state: GameState): number {
  return getAllRosterCompanions(state).reduce(
    (highestLevel, companion) =>
      Math.max(highestLevel, sanitizeCharacterLevel(companion.characterLevel)),
    1,
  );
}

export function getHighestCharacterLevelEver(state: GameState): number {
  return Math.max(
    sanitizeCharacterLevel(state.highestCharacterLevelEver),
    getHighestCompanionCharacterLevel(state),
  );
}

export function recordHighestCharacterLevelEver(
  state: GameState,
  characterLevel: number,
): GameState {
  const nextHighestLevel = Math.max(
    getHighestCharacterLevelEver(state),
    sanitizeCharacterLevel(characterLevel),
  );

  if (state.highestCharacterLevelEver === nextHighestLevel) {
    return state;
  }

  return {
    ...state,
    highestCharacterLevelEver: nextHighestLevel,
  };
}

export function moveCompanionToRestingReserve(
  state: GameState,
  companionId: string,
): GameState {
  const companion = state.entities[companionId];

  if (!isPartyMember(companion) || companion.id === state.partyLeaderId) {
    return state;
  }

  const activeEntities = { ...state.entities };
  delete activeEntities[companion.id];

  return pruneMissingEntityRuntimeState(
    recordHighestCharacterLevelEver(
      {
        ...state,
        entities: activeEntities,
        restingCompanionsById: {
          ...(state.restingCompanionsById ?? {}),
          [companion.id]: sanitizeRestingCompanion(companion),
        },
      },
      companion.characterLevel,
    ),
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

function sanitizeRestingCompanion(companion: PartyMember): PartyMember {
  return {
    ...companion,
    state: "idle",
    currentTargetId: null,
    commandPriority: "autonomous",
    defendPosition: null,
    consumableBuffs: {
      flask: null,
    },
  };
}

function sanitizeCharacterLevel(level: number | undefined): number {
  return typeof level === "number" && Number.isFinite(level)
    ? Math.max(1, Math.floor(level))
    : 1;
}
