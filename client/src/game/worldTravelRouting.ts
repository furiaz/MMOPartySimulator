import {
  debugMapDefinitions,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import type { GameState } from "./state";
import type { DebugMapId, DebugTeleportPoint } from "./types";

type WorldTravelRoutingState = Pick<GameState, "teleportStatesById">;

const MAIN_WORLD_ROUTE: readonly DebugMapId[] = [
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  MAP_THREE_ID,
  HUB_TWO_MAP_ID,
  MAP_FOUR_ID,
];

export function getNextWorldTravelTeleport(
  state: WorldTravelRoutingState,
  currentMapId: DebugMapId | undefined,
  targetMapId: DebugMapId,
): DebugTeleportPoint | null {
  if (!currentMapId || currentMapId === targetMapId) {
    return null;
  }

  const directTeleports = getTeleportsToMap(currentMapId, targetMapId);

  if (directTeleports.length > 0) {
    return (
      directTeleports.find((teleport) =>
        isWorldTravelTeleportWorking(state, teleport),
      ) ?? null
    );
  }

  if (
    isMainWorldRouteMap(currentMapId) &&
    isMainWorldRouteMap(targetMapId)
  ) {
    return getMainWorldRouteTeleport(state, currentMapId, targetMapId);
  }

  return getRouteTeleportBySearch(state, currentMapId, targetMapId);
}

function getMainWorldRouteTeleport(
  state: WorldTravelRoutingState,
  currentMapId: DebugMapId,
  targetMapId: DebugMapId,
): DebugTeleportPoint | null {
  const currentIndex = MAIN_WORLD_ROUTE.indexOf(currentMapId);
  const targetIndex = MAIN_WORLD_ROUTE.indexOf(targetMapId);

  if (currentIndex === -1 || targetIndex === -1 || currentIndex === targetIndex) {
    return null;
  }

  const direction = targetIndex > currentIndex ? 1 : -1;
  let firstTeleport: DebugTeleportPoint | null = null;

  for (
    let routeIndex = currentIndex;
    routeIndex !== targetIndex;
    routeIndex += direction
  ) {
    const sourceMapId = MAIN_WORLD_ROUTE[routeIndex];
    const nextMapId = MAIN_WORLD_ROUTE[routeIndex + direction];

    if (!sourceMapId || !nextMapId) {
      return null;
    }

    const teleport = getWorkingTeleportToMap(state, sourceMapId, nextMapId);

    if (!teleport) {
      return null;
    }

    firstTeleport ??= teleport;
  }

  return firstTeleport;
}

function getRouteTeleportBySearch(
  state: WorldTravelRoutingState,
  currentMapId: DebugMapId,
  targetMapId: DebugMapId,
): DebugTeleportPoint | null {
  const visited = new Set<DebugMapId>([currentMapId]);
  const queue: Array<{
    firstTeleport: DebugTeleportPoint | null;
    mapId: DebugMapId;
  }> = [{ firstTeleport: null, mapId: currentMapId }];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (!current) {
      continue;
    }

    for (const teleport of debugMapDefinitions[current.mapId].teleports) {
      if (
        !isWorldTravelTeleportWorking(state, teleport) ||
        !canUseTeleportForRoute(currentMapId, targetMapId, teleport) ||
        visited.has(teleport.targetMapId)
      ) {
        continue;
      }

      const firstTeleport = current.firstTeleport ?? teleport;

      if (teleport.targetMapId === targetMapId) {
        return firstTeleport;
      }

      visited.add(teleport.targetMapId);
      queue.push({ firstTeleport, mapId: teleport.targetMapId });
    }
  }

  return null;
}

function canUseTeleportForRoute(
  startMapId: DebugMapId,
  targetMapId: DebugMapId,
  teleport: DebugTeleportPoint,
): boolean {
  if (!isMainWorldRouteMap(targetMapId) || !isMainWorldRouteMap(startMapId)) {
    return true;
  }

  return (
    isMainWorldRouteMap(teleport.sourceMapId) &&
    isMainWorldRouteMap(teleport.targetMapId)
  );
}

function getWorkingTeleportToMap(
  state: WorldTravelRoutingState,
  sourceMapId: DebugMapId,
  targetMapId: DebugMapId,
): DebugTeleportPoint | null {
  return (
    getTeleportsToMap(sourceMapId, targetMapId).find((teleport) =>
      isWorldTravelTeleportWorking(state, teleport),
    ) ?? null
  );
}

function getTeleportsToMap(
  sourceMapId: DebugMapId,
  targetMapId: DebugMapId,
): DebugTeleportPoint[] {
  return debugMapDefinitions[sourceMapId].teleports.filter(
    (teleport) => teleport.targetMapId === targetMapId,
  );
}

function isMainWorldRouteMap(mapId: DebugMapId): boolean {
  return MAIN_WORLD_ROUTE.includes(mapId);
}

function isWorldTravelTeleportWorking(
  state: WorldTravelRoutingState,
  teleport: DebugTeleportPoint,
): boolean {
  return (
    state.teleportStatesById?.[teleport.id]?.isWorking ??
    teleport.startsWorking ??
    true
  );
}
