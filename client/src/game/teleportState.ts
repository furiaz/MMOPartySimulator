import { debugMapDefinitions } from "./debugMap";
import type { DebugTeleportPoint } from "./types";
import type { GameState } from "./state";

export function isTeleportWorking(
  state: Pick<GameState, "map" | "teleportStatesById">,
  teleportId: string,
): boolean {
  const runtimeState = state.teleportStatesById?.[teleportId];

  if (runtimeState) {
    return runtimeState.isWorking;
  }

  return getTeleportDefaultWorkingState(state, teleportId);
}

export function setTeleportWorking(
  state: GameState,
  teleportId: string,
  isWorking: boolean,
): GameState {
  return {
    ...state,
    teleportStatesById: {
      ...(state.teleportStatesById ?? {}),
      [teleportId]: { isWorking },
    },
  };
}

export function getTeleportWorkingStateById(
  state: Pick<GameState, "map" | "teleportStatesById">,
): Record<string, boolean> {
  const teleports = state.map?.teleports ?? [];

  return Object.fromEntries(
    teleports.map((teleport) => [
      teleport.id,
      isTeleportWorking(state, teleport.id),
    ]),
  );
}

function getTeleportDefaultWorkingState(
  state: Pick<GameState, "map">,
  teleportId: string,
): boolean {
  return getTeleportDefinition(state, teleportId)?.startsWorking ?? true;
}

function getTeleportDefinition(
  state: Pick<GameState, "map">,
  teleportId: string,
): DebugTeleportPoint | null {
  const currentMapTeleport =
    state.map?.teleports.find((teleport) => teleport.id === teleportId) ?? null;

  if (currentMapTeleport) {
    return currentMapTeleport;
  }

  for (const definition of Object.values(debugMapDefinitions)) {
    const teleport = definition.teleports.find(
      (candidate) => candidate.id === teleportId,
    );

    if (teleport) {
      return teleport;
    }
  }

  return null;
}
