import { getNavigationPositionKey } from "./navigation";
import { getPartyLeader, getPartyMembers, type PartyMember } from "./partySystem";
import { getEuclideanDistance, getGridDistance } from "./positionUtils";
import { ROLE_TUNING } from "./roleProfiles";
import { getEntityById, getPoiSearchScope, type GameState } from "./state";
import { getSubzoneAtPosition, isPositionInsideSubzone } from "./subzoneSystem";
import { isResourceTargetInRange } from "./targetSelection";
import type { Position, ResourceEntity, ZoneSubzone } from "./types";

export const GATHERER_RESOURCE_SEARCH_PATH_DISTANCE =
  ROLE_TUNING.gatherer.resourceSearchRange ?? 30;
export const GATHERER_LEADER_LEASH_DISTANCE = ROLE_TUNING.gatherer.leashDistance;

export type GathererResourceReservations = {
  resourceIds: Set<string>;
  resourceIdByGathererId: Map<string, string>;
  gathererIdByResourceId: Map<string, string>;
};

export type ResourceWorkContext = {
  reservations: GathererResourceReservations;
  resourceTargetByGathererId: Map<string, string | null>;
  reachabilityByKey: Map<string, boolean>;
};

type GathererTargetOptions = {
  respectReservationCapacity?: boolean;
};

export function createResourceWorkContext(state: GameState): ResourceWorkContext {
  const context: ResourceWorkContext = {
    reservations: createEmptyGathererResourceReservations(),
    resourceTargetByGathererId: new Map<string, string | null>(),
    reachabilityByKey: new Map<string, boolean>(),
  };
  const leader = getPartyLeader(state);
  const partyGatherResourceTargetId = getCurrentPartyGatherResourceTargetId(state);

  for (const member of getPartyMembers(state)) {
    if (
      member.id === leader?.id ||
      member.role !== "gatherer" ||
      member.commandPriority !== "autonomous" ||
      member.state === "dead" ||
      Boolean(state.resurrectionChannelsByHelperId?.[member.id])
    ) {
      continue;
    }

    const resource = findAllowedGathererResourceTarget(state, member, context, {
      respectReservationCapacity: true,
    });

    if (resource && resource.id !== partyGatherResourceTargetId) {
      reserveGathererResource(context.reservations, member.id, resource.id);
    }
  }

  return context;
}

export function getCurrentPartyGatherResourceTargetId(
  state: GameState,
): string | null {
  if (state.leaderIntent?.type !== "gather" || !state.leaderIntent.targetId) {
    return null;
  }

  const target = getEntityById(state, state.leaderIntent.targetId);

  if (
    target?.kind !== "resource" ||
    target.isDepleted ||
    target.quantity <= 0
  ) {
    return null;
  }

  return target.id;
}

export function findAllowedGathererResourceTarget(
  state: GameState,
  gatherer: PartyMember,
  context?: ResourceWorkContext,
  options: GathererTargetOptions = {},
): ResourceEntity | undefined {
  if (context?.resourceTargetByGathererId.has(gatherer.id)) {
    const cachedResourceId = context.resourceTargetByGathererId.get(gatherer.id);
    const cachedResource = cachedResourceId
      ? getEntityById(state, cachedResourceId)
      : undefined;

    return cachedResource?.kind === "resource" &&
      isResourceAvailableForReservation(cachedResource, context, options) &&
      isAllowedGathererResourceTarget(state, gatherer, cachedResource, context)
      ? cachedResource
      : undefined;
  }

  const leader = getPartyLeader(state);
  const leaderSubzone = getLeaderSubzone(state);

  if (
    !leader ||
    !isPositionAllowedForGatherer(state, gatherer.position, leaderSubzone)
  ) {
    return cacheGathererResourceTarget(context, gatherer.id, undefined);
  }

  const currentResource = getCurrentGathererResourceTarget(state, gatherer);

  if (
    currentResource &&
    isResourceAvailableForReservation(currentResource, context, options) &&
    isAllowedGathererResourceTarget(state, gatherer, currentResource, context)
  ) {
    return cacheGathererResourceTarget(context, gatherer.id, currentResource);
  }

  return cacheGathererResourceTarget(
    context,
    gatherer.id,
    findNearestAllowedResourceTarget(
      state,
      gatherer,
      leaderSubzone,
      context,
      options,
    ),
  );
}

export function createGathererResourceReservations(
  state: GameState,
  context?: ResourceWorkContext,
): GathererResourceReservations {
  return context?.reservations ?? createResourceWorkContext(state).reservations;
}

export function getResourcesReservedByAutonomousGatherers(
  state: GameState,
): Set<string> {
  return createGathererResourceReservations(state).resourceIds;
}

export function getGathererWorkOrigin(gatherer: PartyMember): Position {
  return gatherer.position;
}

export function isWithinGathererLeaderLeash(
  gatherer: PartyMember,
  leader: PartyMember,
): boolean {
  return (
    getGridDistance(gatherer.position, leader.position) <=
    GATHERER_LEADER_LEASH_DISTANCE
  );
}

export function isWithinGathererLeaderBoundary(
  state: GameState,
  gatherer: PartyMember,
  leader: PartyMember,
): boolean {
  return (
    isWithinGathererLeaderLeash(gatherer, leader) ||
    isPositionInLeaderSubzone(state, gatherer.position, getLeaderSubzone(state))
  );
}

function createEmptyGathererResourceReservations(): GathererResourceReservations {
  return {
    resourceIds: new Set<string>(),
    resourceIdByGathererId: new Map<string, string>(),
    gathererIdByResourceId: new Map<string, string>(),
  };
}

function reserveGathererResource(
  reservations: GathererResourceReservations,
  gathererId: string,
  resourceId: string,
): void {
  reservations.resourceIds.add(resourceId);
  reservations.resourceIdByGathererId.set(gathererId, resourceId);
  reservations.gathererIdByResourceId.set(resourceId, gathererId);
}

function isAllowedGathererResourceTarget(
  state: GameState,
  gatherer: PartyMember,
  resource: ResourceEntity,
  context?: ResourceWorkContext,
): boolean {
  const leader = getPartyLeader(state);
  const leaderSubzone = getLeaderSubzone(state);

  if (!leader) {
    return false;
  }

  if (!isPositionAllowedForGatherer(state, gatherer.position, leaderSubzone)) {
    return false;
  }

  if (!isPositionAllowedForGatherer(state, resource.position, leaderSubzone)) {
    return false;
  }

  if (
    getEuclideanDistance(getGathererWorkOrigin(gatherer), resource.position) >
    GATHERER_RESOURCE_SEARCH_PATH_DISTANCE
  ) {
    return false;
  }

  return isResourceReachableForGatherer(state, gatherer, resource, context);
}

function findNearestAllowedResourceTarget(
  state: GameState,
  gatherer: PartyMember,
  leaderSubzone: ZoneSubzone | null,
  context: ResourceWorkContext | undefined,
  options: GathererTargetOptions,
): ResourceEntity | undefined {
  const searchOrigin = getGathererWorkOrigin(gatherer);
  const candidates = Object.values(state.entities)
    .filter(
      (entity): entity is ResourceEntity =>
        entity.kind === "resource" &&
        !entity.isDepleted &&
        entity.quantity > 0 &&
        isResourceAvailableForReservation(entity, context, options) &&
        isPositionAllowedForGatherer(state, entity.position, leaderSubzone) &&
        getEuclideanDistance(searchOrigin, entity.position) <=
          GATHERER_RESOURCE_SEARCH_PATH_DISTANCE,
    )
    .sort(
      (first, second) =>
        getEuclideanDistance(gatherer.position, first.position) -
          getEuclideanDistance(gatherer.position, second.position) ||
        first.id.localeCompare(second.id),
    );

  for (const resource of candidates) {
    if (isResourceReachableForGatherer(state, gatherer, resource, context)) {
      return resource;
    }
  }

  return undefined;
}

function isResourceAvailableForReservation(
  resource: ResourceEntity,
  context: ResourceWorkContext | undefined,
  options: GathererTargetOptions,
): boolean {
  if (!options.respectReservationCapacity || !context) {
    return true;
  }

  const reservedCount = Array.from(
    context.reservations.resourceIdByGathererId.values(),
  ).filter((resourceId) => resourceId === resource.id).length;

  return reservedCount < Math.max(0, resource.maxGatherers);
}

function isResourceReachableForGatherer(
  state: GameState,
  gatherer: PartyMember,
  resource: ResourceEntity,
  context?: ResourceWorkContext,
): boolean {
  const searchOrigin = getGathererWorkOrigin(gatherer);
  const maxDistance = GATHERER_RESOURCE_SEARCH_PATH_DISTANCE;
  const cacheKey = getResourceReachabilityCacheKey(
    state,
    gatherer,
    resource,
    searchOrigin,
    maxDistance,
  );
  const cached = context?.reachabilityByKey.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const reachable = isResourceTargetInRange(state, resource, searchOrigin, {
    maxDistance,
  });

  context?.reachabilityByKey.set(cacheKey, reachable);

  return reachable;
}

function cacheGathererResourceTarget(
  context: ResourceWorkContext | undefined,
  gathererId: string,
  resource: ResourceEntity | undefined,
): ResourceEntity | undefined {
  context?.resourceTargetByGathererId.set(gathererId, resource?.id ?? null);

  return resource;
}

function getCurrentGathererResourceTarget(
  state: GameState,
  gatherer: PartyMember,
): ResourceEntity | undefined {
  const target = gatherer.currentTargetId
    ? getEntityById(state, gatherer.currentTargetId)
    : undefined;

  return target?.kind === "resource" ? target : undefined;
}

function getLeaderSubzone(state: GameState): ZoneSubzone | null {
  const leader = getPartyLeader(state);

  return getSubzoneAtPosition(state.map, leader?.position);
}

function isPositionAllowedForGatherer(
  state: GameState,
  position: Position,
  leaderSubzone: ZoneSubzone | null,
): boolean {
  const leader = getPartyLeader(state);

  if (!leader) {
    return false;
  }

  if (
    getPoiSearchScope(state) === "subzone_only" &&
    !isPositionInLeaderSubzone(state, position, leaderSubzone)
  ) {
    return false;
  }

  if (isPositionInLeaderSubzone(state, position, leaderSubzone)) {
    return true;
  }

  return getGridDistance(position, leader.position) <= GATHERER_LEADER_LEASH_DISTANCE;
}

function isPositionInLeaderSubzone(
  state: GameState,
  position: Position,
  leaderSubzone: ZoneSubzone | null,
): boolean {
  return Boolean(
    leaderSubzone &&
      getPartyLeader(state) &&
      isPositionInsideSubzone(position, leaderSubzone),
  );
}

function getResourceReachabilityCacheKey(
  state: GameState,
  gatherer: PartyMember,
  resource: ResourceEntity,
  searchOrigin: Position,
  maxDistance: number,
): string {
  return [
    state.currentMapId ?? "no-map",
    gatherer.id,
    getNavigationPositionKey(searchOrigin),
    resource.id,
    getNavigationPositionKey(resource.position),
    resource.isDepleted ? "depleted" : "active",
    resource.quantity,
    resource.durability,
    maxDistance,
    getBlockingInputsCacheKey(state),
  ].join("|");
}

function getBlockingInputsCacheKey(state: GameState): string {
  return [
    Object.values(state.entities)
      .filter(
        (entity) =>
          entity.kind === "resource" &&
          !entity.isDepleted &&
          entity.quantity > 0,
      )
      .map((entity) => `${entity.id}:${getNavigationPositionKey(entity.position)}`)
      .sort()
      .join(","),
    Object.entries(state.reservedPositionsByEntityId ?? {})
      .map(([entityId, position]) => `${entityId}:${getNavigationPositionKey(position)}`)
      .sort()
      .join(","),
  ].join("#");
}
