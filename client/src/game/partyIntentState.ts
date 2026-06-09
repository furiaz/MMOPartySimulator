import type {
  LocalPoiTarget,
} from "./questTypes";
import type { GameState } from "./state";
import type {
  DebugMapId,
  LeaderIntent,
  PartyExecutionIntent,
  PartyIntent,
  PartyIntentSnapshot,
  PartyIntentSource,
} from "./types";

export function setWorldTravelTargetMapId(
  state: GameState,
  worldTravelTargetMapId: DebugMapId | null,
  source: PartyIntentSource = "player",
): GameState {
  const partyIntent = state.partyIntent
    ? {
        ...state.partyIntent,
        source: worldTravelTargetMapId ? source : state.partyIntent.source,
        worldTravelTargetMapId,
      }
    : worldTravelTargetMapId
      ? {
          mode: "travel" as const,
          source,
          executionIntent: null,
          globalPoiIntent: state.globalPoiIntent,
          localPoiTarget: state.localPoiTarget,
          worldTravelTargetMapId,
          lastPoiDecision: state.lastPoiDecision,
          queuedIntent: null,
          recoveryIntent: null,
        }
      : null;

  return {
    ...state,
    partyIntent,
    worldTravelTargetMapId,
  };
}

export function setLeaderIntent(
  state: GameState,
  leaderIntent: LeaderIntent | null,
): GameState {
  return setPartyExecutionIntent(state, leaderIntent);
}

export function setPartyExecutionIntent(
  state: GameState,
  executionIntent: PartyExecutionIntent | null,
): GameState {
  return {
    ...state,
    partyIntent: createPartyIntentFromExecutionIntent(state, executionIntent),
    leaderIntent: executionIntent,
  };
}

export function hasDirectPlayerPartyIntent(state: GameState): boolean {
  return getPartyExecutionIntent(state)?.source === "player";
}

export const hasDirectPlayerLeaderIntent = hasDirectPlayerPartyIntent;

export function setPartyIntent(
  state: GameState,
  partyIntent: PartyIntent | null,
): GameState {
  return {
    ...state,
    partyIntent,
    leaderIntent: clonePartyExecutionIntent(partyIntent?.executionIntent ?? null),
    globalPoiIntent: partyIntent?.globalPoiIntent
      ? { ...partyIntent.globalPoiIntent }
      : null,
    localPoiTarget: cloneLocalPoiTarget(partyIntent?.localPoiTarget ?? null),
    worldTravelTargetMapId:
      partyIntent?.worldTravelTargetMapId ?? state.worldTravelTargetMapId,
    lastPoiDecision: partyIntent ? partyIntent.lastPoiDecision : undefined,
  };
}

export function clearPartyIntent(state: GameState): GameState {
  return setPartyIntent(state, null);
}

export function queuePartyIntent(state: GameState): GameState {
  const existingQueuedIntent = state.partyIntent?.queuedIntent;

  if (existingQueuedIntent) {
    return state;
  }

  const queuedIntent = createPartyIntentSnapshot(state);

  return {
    ...state,
    partyIntent: state.partyIntent
      ? {
          ...state.partyIntent,
          queuedIntent,
        }
      : {
          mode: queuedIntent.executionIntent ? "travel" : "idle",
          source: queuedIntent.executionIntent?.source ?? "ai",
          ...queuedIntent,
          queuedIntent,
        },
  };
}

export function restoreQueuedPartyIntent(state: GameState): GameState {
  const queuedIntent = state.partyIntent?.queuedIntent;

  if (!queuedIntent) {
    return state.partyIntent?.recoveryIntent ? clearPartyIntent(state) : state;
  }

  return setPartyIntent(state, {
    mode: getPartyBehaviorModeForIntent(queuedIntent.executionIntent),
    source: queuedIntent.executionIntent?.source ?? "ai",
    ...queuedIntent,
  });
}

export function getPartyExecutionIntent(
  state: GameState,
): PartyExecutionIntent | null {
  return state.partyIntent?.executionIntent ?? state.leaderIntent;
}

function createPartyIntentFromExecutionIntent(
  state: GameState,
  executionIntent: PartyExecutionIntent | null,
): PartyIntent | null {
  if (!executionIntent) {
    return state.partyIntent?.queuedIntent
      ? {
          mode: state.partyIntent.recoveryIntent
            ? state.partyIntent.mode
            : "idle",
          source: state.partyIntent.source,
          executionIntent: null,
          globalPoiIntent: state.globalPoiIntent,
          localPoiTarget: state.localPoiTarget,
          worldTravelTargetMapId: state.worldTravelTargetMapId,
          lastPoiDecision: state.lastPoiDecision,
          queuedIntent: state.partyIntent.queuedIntent,
          recoveryIntent: state.partyIntent.recoveryIntent,
        }
      : null;
  }

  return {
    mode: getPartyBehaviorModeForIntent(executionIntent),
    source: executionIntent.source ?? "ai",
    executionIntent: clonePartyExecutionIntent(executionIntent),
    globalPoiIntent: state.globalPoiIntent,
    localPoiTarget: state.localPoiTarget,
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    lastPoiDecision: state.lastPoiDecision,
    queuedIntent: state.partyIntent?.queuedIntent ?? null,
    recoveryIntent: state.partyIntent?.recoveryIntent ?? null,
  };
}

function createPartyIntentSnapshot(state: GameState): PartyIntentSnapshot {
  return {
    executionIntent: clonePartyExecutionIntent(getPartyExecutionIntent(state)),
    globalPoiIntent: state.globalPoiIntent
      ? { ...state.globalPoiIntent }
      : null,
    localPoiTarget: cloneLocalPoiTarget(state.localPoiTarget),
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    lastPoiDecision: state.lastPoiDecision,
  };
}

function getPartyBehaviorModeForIntent(
  executionIntent: PartyExecutionIntent | null,
): PartyIntent["mode"] {
  if (!executionIntent) {
    return "idle";
  }

  if (executionIntent.type === "attack") {
    return "engage";
  }

  return "travel";
}

function clonePartyExecutionIntent(
  executionIntent: PartyExecutionIntent | null,
): PartyExecutionIntent | null {
  return executionIntent
    ? {
        ...executionIntent,
        targetPosition: executionIntent.targetPosition
          ? { ...executionIntent.targetPosition }
          : null,
      }
    : null;
}

function cloneLocalPoiTarget(
  localPoiTarget: LocalPoiTarget | null,
): LocalPoiTarget | null {
  return localPoiTarget
    ? {
        ...localPoiTarget,
        position: { ...localPoiTarget.position },
        interactionStandPosition: localPoiTarget.interactionStandPosition
          ? { ...localPoiTarget.interactionStandPosition }
          : undefined,
        interactionStandTargetPosition: localPoiTarget.interactionStandTargetPosition
          ? { ...localPoiTarget.interactionStandTargetPosition }
          : undefined,
      }
    : null;
}
