import { clearDirectCommandPlanning, getDirectLeaderCommand, hasDirectCompanionAuthority } from "./directCommandState";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isLivingEnemy } from "./entityGuards";
import { getNormalMovementResult, getSpecializedMovementOwner } from "./movementAuthority";
import { isRequiredForTravelCohesion } from "./partyActivityCoordinator";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { isMovementBlockedByStatus } from "./statusEffects";
import { getMovementApproachProgress, isAutomaticCombatTarget } from "./targetCommitment";
import { getTravelFormationExpectedPosition } from "./travelFormation";
import { isWarmasterRewardUiOpen } from "./warmasterLifecycleState";
import { getNextWorldTravelTeleport } from "./worldTravelRouting";
import {
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_FIVE_ID,
  MAP_FOUR_ID,
  MAP_SEVEN_ID,
  MAP_SIX_ID,
} from "./debugMap";
import { getPartyMembers, isPartyMember, isPartyMemberBusyGatheringResource } from "./partySystem";
import { getEuclideanDistance, getGridDistance } from "./positionUtils";
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
import type { Companion, DebugMapId, Enemy } from "./types";

export const AUTO_ROUTE_CALM_TIME_MS = 1500;
export const AUTO_ROUTE_INTERRUPT_COOLDOWN_MS = 1500;
export const AUTO_COMBAT_ON_ARRIVAL_DELAY_MS = 500;
export const AUTO_ROUTE_COHESION_DISTANCE = 6;
export const AUTO_ROUTE_BODY_BLOCK_MS = 1000;
const AUTO_ROUTE_THREAT_RADIUS = 5;

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

  const previousRuntime = state.autoRoute;
  const emergency = previousRuntime?.pauseReason === "emergency";
  let next = setWorldTravelTargetMapId(state, targetMapId);
  if (!emergency) next = clearRouteExecution(next, false);
  return { status: "success", state: { ...next, interruptedPoiTarget: null,
    // Replacing the route step cannot bypass an existing emergency recovery gate.
    autoRoute: previousRuntime ? {
      pauseReason: previousRuntime.pauseReason === "gate" ? undefined : previousRuntime.pauseReason,
      resumeAfterMs: previousRuntime.resumeAfterMs,
      interruptCooldownUntilMs: previousRuntime.interruptCooldownUntilMs,
      ...(emergency ? { emergencyTargetId: previousRuntime.emergencyTargetId, emergencyFrame: previousRuntime.emergencyFrame } : {}),
    } : undefined } };
}

export function clearAutoRoute(state: GameState): GameState {
  const clearedRouteState = setWorldTravelTargetMapId(
    {
      ...state,
      autoRoute: undefined,
      interruptedPoiTarget: null,
      activeTeleport: state.worldTravelTargetMapId ? null : state.activeTeleport,
      partyIntent: state.partyIntent?.queuedIntent?.worldTravelTargetMapId
        ? { ...state.partyIntent, queuedIntent: null } : state.partyIntent,
    },
    null,
  );

  return state.worldTravelTargetMapId ? clearRouteExecution(clearedRouteState, false) : haltAutonomousPartyMembers(clearedRouteState);
}

export function completeAutoRouteArrival(state: GameState): GameState {
  if (!state.worldTravelTargetMapId || state.worldTravelTargetMapId !== state.currentMapId) return state;
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
  if (state.worldTravelTargetMapId === state.currentMapId && !state.activeTeleport) return completeAutoRouteArrival(state);

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
  const leader = state.entities[state.partyLeaderId];
  return isAutoRouteActive(state) && Boolean(getDirectLeaderCommand(state) || state.autoRoute?.pauseReason ||
    !isPartyMember(leader) || leader.health <= 0 || leader.state === "dead" ||
    state.partyIntent?.recoveryIntent || state.autoRoute?.resumeAfterMs !== undefined ||
    !isAutoRouteStepAvailable(state));
}

export function isAutoRouteStepAvailable(state: GameState, teleportId?: string): boolean {
  if (!state.worldTravelTargetMapId) return true;
  if (state.worldWipeRecovery || state.slimewardDungeon?.chest?.isUiOpen || isWarmasterRewardUiOpen(state) ||
    (state.currentMapId === "map-7" && (state.warmasterLifecycle?.phase === "active" ||
      state.warmasterLifecycle?.phase === "reset_pending" || state.warmasterResetPending))) return false;
  const step = getNextWorldTravelTeleport(state, state.currentMapId, state.worldTravelTargetMapId);
  return Boolean(step && (!teleportId || step.id === teleportId));
}

/** Route execution may wait while the existing follower producers regroup. */
export function canRegroupAutoRoute(state: GameState): boolean {
  return !isAutoRouteActive(state) || Boolean(getDirectLeaderCommand(state)) ||
    state.autoRoute?.pauseReason !== "emergency";
}

export function canStartAutoRouteRally(state: GameState, teleportId: string): boolean {
  if (!isAutoRouteActive(state) || state.activeTeleport) return true;
  return !isAutoRoutePaused(state) && !getPartyMembers(state).some(member => hasDirectCompanionAuthority(state, member)) &&
    !state.partyIntent?.recoveryIntent &&
    isAutoRouteStepAvailable(state, teleportId);
}

export function beginAutoRouteCalmPeriod(state: GameState): GameState {
  const nowMs = state.simulationTimeMs ?? 0;

  if (!state.worldTravelTargetMapId) {
    return state;
  }

  const resumeAfterMs = state.autoRoute?.resumeAfterMs ?? nowMs + AUTO_ROUTE_CALM_TIME_MS;
  return {
    ...clearRouteExecution(state),
    autoRoute: {
      ...state.autoRoute,
      pauseReason: "calm",
      emergencyTargetId: undefined,
      emergencyFrame: undefined,
      resumeAfterMs,
    },
  };
}

export function finishAutoRouteCalmPeriod(state: GameState): GameState {
  const nowMs = state.simulationTimeMs ?? 0;

  return {
    ...state,
    interruptedPoiTarget: null,
    autoRoute: {
      ...state.autoRoute,
      pauseReason: undefined,
      emergencyTargetId: undefined,
      emergencyFrame: undefined,
      resumeAfterMs: undefined,
      bodyBlocksByEntityId: {},
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
      getSpecializedMovementOwner(state, member.id) ||
      isMovementBlockedByStatus(state, member.id) ||
      !isRequiredForTravelCohesion(state, member, leader)
    ) {
      return true;
    }

    return getEuclideanDistance(member.position, getTravelFormationExpectedPosition(state, member) ?? leader.position) <= AUTO_ROUTE_COHESION_DISTANCE;
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

function haltAutonomousPartyMembers(state: GameState, preserveCombat = false): GameState {
  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    if (hasDirectCompanionAuthority(nextState, member) || member.state === "dead" ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id) ||
      getSpecializedMovementOwner(nextState, member.id) || isPartyMemberBusyGatheringResource(nextState, member) ||
      (preserveCombat && hasValidCombatTask(nextState, member))) {
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

/** Drop only speculative route work. Finalized results, reservations and motion survive. */
function hasValidCombatTask(state: GameState, member: Companion): boolean {
  return (member.state === "attack" || member.state === "defend") && Boolean(member.currentTargetId &&
    isAutomaticCombatTarget(state, state.entities[member.currentTargetId]));
}

function clearRouteExecution(state: GameState, preserveCombat = true): GameState {
  let next = setPartyIntent(state, { mode: state.partyIntent?.recoveryIntent ? state.partyIntent.mode : "idle", source: "ai", executionIntent: null,
    globalPoiIntent: null, localPoiTarget: null, worldTravelTargetMapId: state.worldTravelTargetMapId,
    queuedIntent: state.partyIntent?.queuedIntent ?? null, recoveryIntent: state.partyIntent?.recoveryIntent ?? null });
  for (const member of getPartyMembers(next)) {
    if (hasDirectCompanionAuthority(next, member) || isCompanionAssignedToResurrectionRecovery(next, member.id) ||
      getSpecializedMovementOwner(next, member.id) || isPartyMemberBusyGatheringResource(next, member) ||
      (preserveCombat && hasValidCombatTask(next, member))) continue;
    next = clearDirectCommandPlanning(next, member.id);
  }
  return haltAutonomousPartyMembers({ ...next, interruptedPoiTarget: null }, preserveCombat);
}

export function pruneAutoRouteObservations(state: GameState): GameState {
  const observations = state.autoRoute?.bodyBlocksByEntityId;
  if (!observations) return state;
  const kept = Object.fromEntries(Object.entries(observations).filter(([id, entry]) => {
    const actor = state.entities[id];
    return isPartyMember(actor) && actor.health > 0 && actor.state !== "dead" &&
      !hasDirectCompanionAuthority(state, actor) && isLivingEnemy(state.entities[entry.enemyId]);
  }));
  return Object.keys(kept).length === Object.keys(observations).length ? state :
    { ...state, autoRoute: { ...state.autoRoute, bodyBlocksByEntityId: kept } };
}

/** Consume only this update's selected route movement, once even across phase checks. */
function observeRouteBodyBlocks(state: GameState): GameState {
  const observations = { ...state.autoRoute?.bodyBlocksByEntityId };
  for (const actor of getPartyMembers(state)) {
    const result = getNormalMovementResult(state, actor.id), previous = observations[actor.id];
    if (previous?.frame === result?.frameNumber && previous?.timeMs === result?.timeMs) continue;
    const paused = hasDirectCompanionAuthority(state, actor) || isMovementBlockedByStatus(state, actor.id) ||
      Boolean(getSpecializedMovementOwner(state, actor.id)) || Boolean(state.forcedMovementsByEntityId?.[actor.id]) ||
      isCompanionAssignedToResurrectionRecovery(state, actor.id);
    if (paused || !result || result.request.mode !== "walk" || !["partyTravel", "follow"].includes(result.request.source) ||
      result.outcome === "deferred" || result.outcome === "invalid" || result.reason === "constraint" ||
      (result.outcome === "held" && result.reason !== "crowd_wait")) {
      continue;
    }
    const key = `${state.worldTravelTargetMapId}:${result.request.pathTargetKey ?? result.request.source}`;
    const blockers = (result.blockingEnemyIds ?? []).filter(id => isAutomaticCombatTarget(state, state.entities[id]));
    const enemyId = previous && blockers.includes(previous.enemyId) ? previous.enemyId : blockers.sort()[0];
    if (!enemyId) { delete observations[actor.id]; continue; }
    const last = previous?.requestKey === key && previous.enemyId === enemyId ? previous : undefined;
    const { progressed, displaced, ...progress } = getMovementApproachProgress(state, result, last);
    observations[actor.id] = { enemyId, requestKey: key, frame: result.frameNumber, timeMs: result.timeMs,
      position: { ...result.to }, ...progress,
      blockedMs: progressed || displaced ? 0 : (last?.blockedMs ?? 0) + Math.max(0, state.simulationDeltaMs ?? 100) };
  }
  return { ...state, autoRoute: { ...state.autoRoute, bodyBlocksByEntityId: observations } };
}

export function getAutoRouteEmergency(state: GameState): { active: boolean; target?: Enemy } {
  const members = getPartyMembers(state).filter(member => member.health > 0).sort((a, b) => a.id.localeCompare(b.id));
  const enemies = Object.values(state.entities).filter((entity): entity is Enemy => isAutomaticCombatTarget(state, entity))
    .sort((a, b) => a.id.localeCompare(b.id));
  const nearest = (memberId: string) => enemies.filter(enemy => enemy.currentTargetId === memberId ||
    getGridDistance(state.entities[memberId].position, enemy.position) <= AUTO_ROUTE_THREAT_RADIUS)
    .sort((a, b) => getGridDistance(state.entities[memberId].position, a.position) -
      getGridDistance(state.entities[memberId].position, b.position) || a.id.localeCompare(b.id))[0];
  const controlled = members.filter(member => !hasDirectCompanionAuthority(state, member) &&
    (isMovementBlockedByStatus(state, member.id) || Object.values(state.statusEffectsById ?? {}).some(status =>
      status.targetId === member.id && status.type === "taunted" && status.expiresAt > (state.simulationTimeMs ?? 0))));
  if (controlled.length) return { active: true, target: nearest(controlled[0].id) };
  const injured = members.find(member => member.health / member.maxHealth < 0.5 && enemies.some(enemy =>
    getGridDistance(member.position, enemy.position) <= AUTO_ROUTE_THREAT_RADIUS));
  if (injured) return { active: true, target: nearest(injured.id) };
  const accepted = state.autoRoute?.emergencyTargetId ? state.entities[state.autoRoute.emergencyTargetId] : undefined;
  if (state.autoRoute?.pauseReason === "emergency" && state.autoRoute.emergencyFrame === (state.simulationFrame ?? state.simulationTick) &&
    isAutomaticCombatTarget(state, accepted)) return { active: true, target: accepted };
  const intent = getPartyExecutionIntent(state);
  const current = intent?.type === "attack" && intent.targetId ? state.entities[intent.targetId] : undefined;
  if (state.autoRoute?.pauseReason === "emergency" && isAutomaticCombatTarget(state, current)) return { active: true, target: current };
  const aggressor = state.autoRoute?.pauseReason === "emergency" && enemies.find(enemy =>
    enemy.state === "attack" && members.some(member => member.id === enemy.currentTargetId));
  if (aggressor) return { active: true, target: aggressor };
  const blocker = canAutoRouteInterrupt(state) && Object.entries(state.autoRoute?.bodyBlocksByEntityId ?? {})
    .filter(([id, entry]) => entry.blockedMs >= AUTO_ROUTE_BODY_BLOCK_MS && entry.frame === (state.simulationFrame ?? state.simulationTick) &&
      entry.timeMs === (state.simulationTimeMs ?? 0) && getNormalMovementResult(state, id)?.blockingEnemyIds?.includes(entry.enemyId) &&
      isPartyMember(state.entities[id]) && !getSpecializedMovementOwner(state, id) && !hasDirectCompanionAuthority(state, state.entities[id]))
    .map(([, entry]) => state.entities[entry.enemyId]).filter((enemy): enemy is Enemy => isAutomaticCombatTarget(state, enemy))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return blocker ? { active: true, target: blocker } : { active: false };
}

/** Early guards and late observations share lifecycle transitions, never a movement commit. */
export function updateAutoRouteExecution(state: GameState, observeMovement = false): GameState {
  if (!isAutoRouteActive(state) || state.activeTeleport || isWarmasterRewardUiOpen(state)) return state;
  if (state.worldTravelTargetMapId === state.currentMapId) return completeAutoRouteArrival(state);
  let next = pruneAutoRouteObservations(state);
  if (next.partyIntent?.recoveryIntent) return next;
  if (observeMovement) next = observeRouteBodyBlocks(next);
  const emergency = getAutoRouteEmergency(next);
  const oldReason = next.autoRoute?.pauseReason;
  if (emergency.active) {
    if (oldReason !== "emergency") next = clearRouteExecution(next);
    next = { ...next, autoRoute: { ...next.autoRoute, pauseReason: "emergency", resumeAfterMs: undefined,
      emergencyTargetId: emergency.target?.id, emergencyFrame: next.simulationFrame ?? next.simulationTick } };
  } else if (oldReason === "emergency" || oldReason === "calm" || oldReason === "cohesion" || next.autoRoute?.resumeAfterMs !== undefined) {
    if (oldReason === "emergency" || next.autoRoute?.resumeAfterMs === undefined) next = beginAutoRouteCalmPeriod(next);
    if ((next.autoRoute!.resumeAfterMs ?? Infinity) <= (next.simulationTimeMs ?? 0)) {
      next = hasAutoRouteResumeCohesion(next) ? finishAutoRouteCalmPeriod(next) :
        { ...next, autoRoute: { ...next.autoRoute, pauseReason: "cohesion" } };
    }
  }
  if (!next.autoRoute?.pauseReason || next.autoRoute.pauseReason === "gate") {
    const blocked = !isAutoRouteStepAvailable(next);
    if (blocked && next.autoRoute?.pauseReason !== "gate") next = clearRouteExecution(next);
    next = { ...next, autoRoute: { ...next.autoRoute, pauseReason: blocked ? "gate" : undefined } };
  }
  const reason = next.autoRoute?.pauseReason;
  return reason === oldReason ? next : appendDebugTelemetryEvent(next, { entityId: "party",
    type: reason ? "auto_route_paused" : "auto_route_resumed", reason: reason ?? "calm_and_cohesive" });
}
