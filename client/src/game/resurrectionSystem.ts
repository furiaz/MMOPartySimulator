import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isCompanionEntity, isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getGridDistance } from "./positionUtils";
import {
  getEntityById,
  moveEntityTowardPositionIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import type {
  Companion,
  GameEntity,
  ResurrectionCancelReason,
  ResurrectionChannelState,
  ResurrectionProgressState,
} from "./types";

export const RESURRECTION_REQUIRED_MS = 10_000;
export const RESURRECTION_RANGE = 1;

export function updateResurrectionSystem(
  state: GameState,
  movedEntityIds: Set<string>,
  now: number,
  deltaMs: number,
): GameState {
  let nextState = clearInvalidResurrectionChannels(state, now);

  if (!isPartyInCombat(nextState)) {
    nextState = assignAvailableResurrectionHelpers(nextState, now);
  }

  nextState = moveResurrectionHelpers(nextState, movedEntityIds);
  nextState = progressResurrectionChannels(nextState, now, deltaMs);

  return nextState;
}

export function isCompanionResurrectionChanneling(
  state: GameState,
  companionId: string,
): boolean {
  return Boolean(state.resurrectionChannelsByHelperId?.[companionId]);
}

export function cancelResurrectionChannelForHelper(
  state: GameState,
  helperId: string,
  now: number,
  cancelReason: ResurrectionCancelReason,
): GameState {
  const channel = state.resurrectionChannelsByHelperId?.[helperId];

  if (!channel) {
    return state;
  }

  return removeResurrectionChannel(state, channel, now, cancelReason);
}

function assignAvailableResurrectionHelpers(
  state: GameState,
  now: number,
): GameState {
  let nextState = state;
  const deadCompanions = getDeadCompanions(nextState);

  if (deadCompanions.length === 0) {
    return nextState;
  }

  for (const helper of getLivingCompanions(nextState)) {
    if (
      helper.commandPriority === "direct" ||
      isCompanionResurrectionChanneling(nextState, helper.id)
    ) {
      continue;
    }

    const target = getNearestDeadCompanion(helper, deadCompanions);

    if (!target) {
      continue;
    }

    nextState = ensureResurrectionProgress(nextState, target.id);
    nextState = setResurrectionChannel(nextState, helper.id, target.id, now);
  }

  return nextState;
}

function moveResurrectionHelpers(
  state: GameState,
  movedEntityIds: Set<string>,
): GameState {
  let nextState = state;

  for (const channel of Object.values(state.resurrectionChannelsByHelperId ?? {})) {
    const helper = getEntityById(nextState, channel.helperId);
    const target = getEntityById(nextState, channel.targetId);

    if (!isLivingCompanion(helper) || !isDeadCompanion(target)) {
      continue;
    }

    if (isInResurrectionRange(helper, target)) {
      movedEntityIds.add(helper.id);
      continue;
    }

    if (movedEntityIds.has(helper.id)) {
      continue;
    }

    const previousPosition = helper.position;

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      helper,
      target.position,
      { allowPartyPassThrough: true },
    );

    const movedHelper = getEntityById(nextState, helper.id);

    if (
      movedHelper &&
      (movedHelper.position.x !== previousPosition.x ||
        movedHelper.position.y !== previousPosition.y)
    ) {
      movedEntityIds.add(helper.id);
    }
  }

  return nextState;
}

function progressResurrectionChannels(
  state: GameState,
  now: number,
  deltaMs: number,
): GameState {
  let nextState = state;
  const channels = Object.values(state.resurrectionChannelsByHelperId ?? {});

  for (const channel of channels) {
    const helper = getEntityById(nextState, channel.helperId);
    const target = getEntityById(nextState, channel.targetId);

    if (!isLivingCompanion(helper) || !isDeadCompanion(target)) {
      continue;
    }

    if (!isInResurrectionRange(helper, target)) {
      continue;
    }

    nextState = addResurrectionProgress(nextState, channel, now, deltaMs);

    const progress = nextState.resurrectionProgressByCompanionId?.[channel.targetId];

    if (progress && progress.progressMs >= progress.requiredMs) {
      nextState = completeResurrection(nextState, target, now);
    }
  }

  return nextState;
}

function addResurrectionProgress(
  state: GameState,
  channel: ResurrectionChannelState,
  _now: number,
  contributionMs: number,
): GameState {
  const progress = state.resurrectionProgressByCompanionId?.[channel.targetId] ?? {
    companionId: channel.targetId,
    progressMs: 0,
    requiredMs: RESURRECTION_REQUIRED_MS,
  };
  const progressBeforeMs = progress.progressMs;
  const progressAfterMs = Math.min(
    progress.requiredMs,
    progress.progressMs + contributionMs,
  );
  const nextState: GameState = {
    ...state,
    resurrectionProgressByCompanionId: {
      ...(state.resurrectionProgressByCompanionId ?? {}),
      [channel.targetId]: {
        ...progress,
        progressMs: progressAfterMs,
      },
    },
  };

  return appendDebugTelemetryEvent(nextState, {
    type: "resurrection_channel_progressed",
    entityId: channel.helperId,
    targetId: channel.targetId,
    progressBeforeMs,
    progressAfterMs,
    progressContributionMs: progressAfterMs - progressBeforeMs,
    requiredProgressMs: progress.requiredMs,
  });
}

function completeResurrection(
  state: GameState,
  companion: Companion,
  now: number,
): GameState {
  const revivedCompanion: Companion = {
    ...companion,
    health: 1,
    state: "follow",
    commandPriority: "autonomous",
    currentTargetId:
      companion.id === state.partyLeaderId ? null : state.partyLeaderId,
    followTargetId:
      companion.id === state.partyLeaderId ? companion.id : state.partyLeaderId,
    defendPosition: null,
  };
  let nextState = updateEntity(state, revivedCompanion);

  for (const channel of Object.values(state.resurrectionChannelsByHelperId ?? {})) {
    if (channel.targetId === companion.id) {
      nextState = removeResurrectionChannel(
        nextState,
        channel,
        now,
        "target_revived",
      );
    }
  }

  const resurrectionProgressByCompanionId = {
    ...(nextState.resurrectionProgressByCompanionId ?? {}),
  };
  delete resurrectionProgressByCompanionId[companion.id];

  nextState = {
    ...nextState,
    resurrectionProgressByCompanionId,
  };

  return appendDebugTelemetryEvent(nextState, {
    type: "companion_resurrected",
    entityId: companion.id,
    previousHealth: companion.health,
    nextHealth: revivedCompanion.health,
    requiredProgressMs: RESURRECTION_REQUIRED_MS,
  });
}

function clearInvalidResurrectionChannels(
  state: GameState,
  now: number,
): GameState {
  let nextState = state;

  for (const channel of Object.values(state.resurrectionChannelsByHelperId ?? {})) {
    const helper = getEntityById(nextState, channel.helperId);
    const target = getEntityById(nextState, channel.targetId);

    if (
      !isLivingCompanion(helper) ||
      helper.commandPriority === "direct" ||
      !isDeadCompanion(target)
    ) {
      nextState = removeResurrectionChannel(
        nextState,
        channel,
        now,
        helper?.kind === "companion" && helper.commandPriority === "direct"
          ? "direct_command"
          : "target_invalid",
      );
    }
  }

  return nextState;
}

function setResurrectionChannel(
  state: GameState,
  helperId: string,
  targetId: string,
  _now: number,
): GameState {
  const helper = state.entities[helperId];
  const channel: ResurrectionChannelState = { helperId, targetId };
  const helperState =
    isLivingCompanion(helper)
      ? updateEntity(state, {
          ...helper,
          state: "follow",
          currentTargetId: targetId,
          commandPriority: "autonomous",
        })
      : state;
  const nextState: GameState = {
    ...helperState,
    resurrectionChannelsByHelperId: {
      ...(helperState.resurrectionChannelsByHelperId ?? {}),
      [helperId]: channel,
    },
  };
  const targetSelectedState = appendDebugTelemetryEvent(nextState, {
    type: "resurrection_target_selected",
    entityId: helperId,
    targetId,
  });

  return appendDebugTelemetryEvent(targetSelectedState, {
    type: "resurrection_channel_started",
    entityId: helperId,
    targetId,
    progressBeforeMs:
      state.resurrectionProgressByCompanionId?.[targetId]?.progressMs ?? 0,
    requiredProgressMs: RESURRECTION_REQUIRED_MS,
  });
}

function removeResurrectionChannel(
  state: GameState,
  channel: ResurrectionChannelState,
  _now: number,
  cancelReason: ResurrectionCancelReason,
): GameState {
  const resurrectionChannelsByHelperId = {
    ...(state.resurrectionChannelsByHelperId ?? {}),
  };
  delete resurrectionChannelsByHelperId[channel.helperId];

  const nextState: GameState = {
    ...state,
    resurrectionChannelsByHelperId,
  };

  return appendDebugTelemetryEvent(nextState, {
    type: "resurrection_channel_canceled",
    entityId: channel.helperId,
    targetId: channel.targetId,
    cancelReason,
    progressAfterMs:
      state.resurrectionProgressByCompanionId?.[channel.targetId]?.progressMs ?? 0,
    requiredProgressMs: RESURRECTION_REQUIRED_MS,
  });
}

function ensureResurrectionProgress(
  state: GameState,
  companionId: string,
): GameState {
  if (state.resurrectionProgressByCompanionId?.[companionId]) {
    return state;
  }

  const progress: ResurrectionProgressState = {
    companionId,
    progressMs: 0,
    requiredMs: RESURRECTION_REQUIRED_MS,
  };

  return {
    ...state,
    resurrectionProgressByCompanionId: {
      ...(state.resurrectionProgressByCompanionId ?? {}),
      [companionId]: progress,
    },
  };
}

function isPartyInCombat(state: GameState): boolean {
  return Object.values(state.entities).some((entity) => {
    if (!isLivingEnemy(entity)) {
      return false;
    }

    const target = entity.currentTargetId
      ? state.entities[entity.currentTargetId]
      : undefined;

    return entity.state === "attack" && isLivingCompanion(target);
  }) || Object.values(state.entities).some((entity) => {
    if (!isLivingCompanion(entity)) {
      return false;
    }

    const target = entity.currentTargetId
      ? state.entities[entity.currentTargetId]
      : undefined;

    return entity.state === "attack" && isLivingEnemy(target);
  });
}

function getLivingCompanions(state: GameState): Companion[] {
  return Object.values(state.entities).filter(isLivingCompanion);
}

function getDeadCompanions(state: GameState): Companion[] {
  return Object.values(state.entities).filter(isDeadCompanion);
}

function getNearestDeadCompanion(
  helper: Companion,
  deadCompanions: Companion[],
): Companion | undefined {
  return [...deadCompanions].sort(
    (first, second) =>
      getGridDistance(helper.position, first.position) -
        getGridDistance(helper.position, second.position) ||
      first.id.localeCompare(second.id),
  )[0];
}

function isDeadCompanion(entity: GameEntity | undefined): entity is Companion {
  return Boolean(
    isCompanionEntity(entity) &&
      (entity.state === "dead" || entity.health <= 0),
  );
}

function isInResurrectionRange(helper: Companion, target: Companion): boolean {
  return getGridDistance(helper.position, target.position) <= RESURRECTION_RANGE;
}
