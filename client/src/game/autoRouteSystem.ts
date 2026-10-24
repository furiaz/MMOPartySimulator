import { hasDirectCompanionAuthority } from "./directCommandState";
import { isLivingEnemy } from "./entityGuards";
import { getNextWorldTravelTeleport } from "./worldTravelRouting";
import {
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_FIVE_ID,
  MAP_FOUR_ID,
  MAP_SEVEN_ID,
  MAP_SIX_ID,
} from "./debugMap";
import { getPartyMembers, isPartyMember } from "./partySystem";
import { getGridDistance } from "./positionUtils";
import {
  getEntityById,
  updateEntity,
  type GameState,
} from "./state";
import {
  getPartyExecutionIntent,
  setPartyIntent,
  setWorldTravelTargetMapId,
} from "./partyIntentState";
import type { DebugMapId } from "./types";

export const AUTO_ROUTE_CALM_TIME_MS = 1500;
export const AUTO_ROUTE_INTERRUPT_COOLDOWN_MS = 1500;
export const AUTO_COMBAT_ON_ARRIVAL_DELAY_MS = 500;
export const AUTO_ROUTE_COHESION_DISTANCE = 6;

const ROUTE_VISITED_AFTER_FORWARD_BASTION = [
  MAP_FOUR_ID,
  MAP_FIVE_ID,
  MAP_SIX_ID,
  MAP_SEVEN_ID,
] as const;

export type AutoRouteStartResult =
  | { status: "success"; state: GameState }
  | { status: "failed"; state: GameState; reason: "current_map" | "unknown_destination" | "blocked_route" };

export type AutoRouteStartFailureReason = Extract<
  AutoRouteStartResult,
  { status: "failed" }
>["reason"];

export function startAutoRoute(
  state: GameState,
  targetMapId: DebugMapId,
): AutoRouteStartResult {
  if (targetMapId === state.currentMapId) {
    return { status: "failed", state, reason: "current_map" };
  }

  if (!isAutoRouteDestinationKnown(state, targetMapId)) {
    return { status: "failed", state, reason: "unknown_destination" };
  }

  if (!getNextWorldTravelTeleport(state, state.currentMapId, targetMapId)) {
    return { status: "failed", state, reason: "blocked_route" };
  }

  return {
    status: "success",
    state: {
      ...setWorldTravelTargetMapId(state, targetMapId),
      autoRoute: undefined,
    },
  };
}

export function clearAutoRoute(state: GameState): GameState {
  const clearedRouteState = setWorldTravelTargetMapId(
    {
      ...state,
      autoRoute: undefined,
      interruptedPoiTarget: null,
    },
    null,
  );

  const executionIntent = getPartyExecutionIntent(clearedRouteState);
  const shouldClearIntent =
    state.worldTravelTargetMapId &&
    executionIntent?.source !== "player";
  const intentState = shouldClearIntent
    ? setPartyIntent(clearedRouteState, null)
    : clearedRouteState;

  return haltAutonomousPartyMembers(intentState);
}

export function completeAutoRouteArrival(state: GameState): GameState {
  const clearedState = setWorldTravelTargetMapId(state, null);

  return {
    ...clearedState,
    autoRoute: state.autoCombatOnArrivalEnabled
      ? {
          autoCombatEnableAtMs:
            (state.simulationTimeMs ?? 0) + AUTO_COMBAT_ON_ARRIVAL_DELAY_MS,
        }
      : undefined,
  };
}

export function updateAutoRouteRuntime(state: GameState): GameState {
  const nowMs = state.simulationTimeMs ?? 0;

  if (
    !state.worldTravelTargetMapId &&
    state.autoRoute?.autoCombatEnableAtMs !== undefined
  ) {
    if (state.autoRoute.autoCombatEnableAtMs > nowMs) {
      return state;
    }

    return {
      ...state,
      autoModeEnabled: true,
      autoRoute: undefined,
    };
  }

  if (!state.worldTravelTargetMapId && state.autoRoute) {
    return {
      ...state,
      autoRoute: undefined,
    };
  }

  return state;
}

export function isAutoRouteActive(state: GameState): boolean {
  return Boolean(state.worldTravelTargetMapId);
}

export function isAutoRoutePaused(state: GameState): boolean {
  const resumeAfterMs = state.autoRoute?.resumeAfterMs;

  return Boolean(
    resumeAfterMs !== undefined && resumeAfterMs > (state.simulationTimeMs ?? 0),
  );
}

export function beginAutoRouteCalmPeriod(state: GameState): GameState {
  const nowMs = state.simulationTimeMs ?? 0;

  if (!state.worldTravelTargetMapId) {
    return state;
  }

  const resumeAfterMs =
    state.autoRoute?.resumeAfterMs && state.autoRoute.resumeAfterMs > nowMs
      ? state.autoRoute.resumeAfterMs
      : nowMs + AUTO_ROUTE_CALM_TIME_MS;

  const calmState = setPartyIntent(state, {
    mode: "idle",
    source: "ai",
    executionIntent: null,
    globalPoiIntent: null,
    localPoiTarget: null,
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    lastPoiDecision: undefined,
    queuedIntent: state.partyIntent?.queuedIntent ?? null,
    recoveryIntent: state.partyIntent?.recoveryIntent ?? null,
  });

  return haltAutonomousPartyMembers({
    ...calmState,
    autoRoute: {
      ...state.autoRoute,
      resumeAfterMs,
    },
  });
}

export function finishAutoRouteCalmPeriod(state: GameState): GameState {
  const nowMs = state.simulationTimeMs ?? 0;

  return {
    ...state,
    autoRoute: {
      ...state.autoRoute,
      resumeAfterMs: undefined,
      interruptCooldownUntilMs: nowMs + AUTO_ROUTE_INTERRUPT_COOLDOWN_MS,
    },
  };
}

export function canAutoRouteInterrupt(state: GameState): boolean {
  const nowMs = state.simulationTimeMs ?? 0;
  const cooldownUntilMs = state.autoRoute?.interruptCooldownUntilMs;

  return !cooldownUntilMs || cooldownUntilMs <= nowMs;
}

export function hasAutoRouteResumeCohesion(state: GameState): boolean {
  const leader = getEntityById(state, state.partyLeaderId);

  if (!isPartyMember(leader) || leader.state === "dead" || leader.health <= 0) {
    return false;
  }

  return getPartyMembers(state).every((member) => {
    if (
      member.id === leader.id ||
      member.state === "dead" ||
      member.health <= 0 ||
      hasDirectCompanionAuthority(state, member) ||
      member.state === "gather"
    ) {
      return true;
    }

    return getGridDistance(member.position, leader.position) <= AUTO_ROUTE_COHESION_DISTANCE;
  });
}

export function isAutoRouteDestinationKnown(
  state: GameState,
  targetMapId: DebugMapId,
): boolean {
  if (targetMapId === state.currentMapId || targetMapId === HUB_MAP_ID) {
    return true;
  }

  if (targetMapId === HUB_TWO_MAP_ID) {
    return (
      state.currentMapId === HUB_TWO_MAP_ID ||
      ROUTE_VISITED_AFTER_FORWARD_BASTION.some((mapId) =>
        state.worldDiscovery?.visitedMapIds.includes(mapId),
      )
    );
  }

  return Boolean(state.worldDiscovery?.visitedMapIds.includes(targetMapId));
}

export function hasNearbyHostile(state: GameState, companionId: string, range: number): boolean {
  const companion = getEntityById(state, companionId);

  if (!isPartyMember(companion)) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isLivingEnemy(entity) &&
      getGridDistance(companion.position, entity.position) <= range,
  );
}

function haltAutonomousPartyMembers(state: GameState): GameState {
  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    if (hasDirectCompanionAuthority(nextState, member) || member.state === "dead") {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: "idle",
      currentTargetId: null,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}
