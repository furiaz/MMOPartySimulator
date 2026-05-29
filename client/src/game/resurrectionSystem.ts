import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isCompanionEntity, isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getPartyResurrectionRecoveryTargetId } from "./partyIntentSystem";
import { getActivePartyThreatTargetInArea } from "./partyTargetSystem";
import { getGridDistance } from "./positionUtils";
import {
  getEntityById,
  isPositionAvailable,
  moveEntityTowardPositionIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import type {
  Companion,
  GameEntity,
  Position,
  ResurrectionCancelReason,
  ResurrectionProgressState,
  ResurrectionRecoveryAssignmentState,
} from "./types";

export const RESURRECTION_REQUIRED_MS = 10_000;
export const RESURRECTION_RANGE = 5;

const RESURRECTION_MIN_STAND_DISTANCE = 1.5;
const RESURRECTION_CONTRIBUTION_MULTIPLIERS = [0, 1, 1.5, 1.8, 2, 2.1];

export function updateResurrectionSystem(
  state: GameState,
  movedEntityIds: Set<string>,
  now: number,
  deltaMs: number,
): GameState {
  const recoveryTargetId = getPartyResurrectionRecoveryTargetId(state);
  let nextState = clearInvalidResurrectionAssignments(
    state,
    now,
    recoveryTargetId,
  );

  if (recoveryTargetId) {
    nextState = assignAvailableResurrectionParticipants(
      nextState,
      now,
      recoveryTargetId,
    );
  }

  nextState = assignResurrectionAreaCombatTargets(nextState);
  nextState = moveResurrectionParticipants(nextState, movedEntityIds);
  nextState = progressResurrectionArea(
    nextState,
    now,
    deltaMs,
    recoveryTargetId,
  );

  return nextState;
}

function assignResurrectionAreaCombatTargets(state: GameState): GameState {
  let nextState = state;
  const target = getActiveResurrectionTarget(nextState);

  if (!target) {
    return nextState;
  }

  for (const channel of Object.values(nextState.resurrectionChannelsByHelperId ?? {})) {
    const helper = getEntityById(nextState, channel.helperId);

    if (!isLivingCompanion(helper) || !isInResurrectionRange(helper, target)) {
      continue;
    }

    const enemy = getActivePartyThreatTargetInArea(
      nextState,
      target.position,
      RESURRECTION_RANGE,
    );

    nextState = updateEntity(nextState, {
      ...helper,
      state: enemy ? "attack" : "follow",
      currentTargetId: enemy?.id ?? target.id,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

export function isCompanionAssignedToResurrectionRecovery(
  state: GameState,
  companionId: string,
): boolean {
  return Boolean(state.resurrectionChannelsByHelperId?.[companionId]);
}

export function isCompanionInActiveResurrectionArea(
  state: GameState,
  companion: Companion,
): boolean {
  const target = getActiveResurrectionTarget(state);

  return Boolean(target && isInResurrectionRange(companion, target));
}

export function isPositionInActiveResurrectionArea(
  state: GameState,
  position: Position,
): boolean {
  const target = getActiveResurrectionTarget(state);

  return Boolean(
    target && getGridDistance(position, target.position) <= RESURRECTION_RANGE,
  );
}

export function clearResurrectionRecoveryAssignmentForCompanion(
  state: GameState,
  helperId: string,
  now: number,
  cancelReason: ResurrectionCancelReason,
): GameState {
  const channel = state.resurrectionChannelsByHelperId?.[helperId];

  if (!channel) {
    return state;
  }

  return removeResurrectionAssignment(state, channel, now, cancelReason);
}

function assignAvailableResurrectionParticipants(
  state: GameState,
  now: number,
  recoveryTargetId: string,
): GameState {
  let nextState = state;
  const target = getEntityById(nextState, recoveryTargetId);

  if (!isDeadCompanion(target)) {
    return nextState;
  }

  for (const helper of getLivingCompanions(nextState)) {
    if (
      helper.commandPriority === "direct" ||
      isCompanionAssignedToResurrectionRecovery(nextState, helper.id)
    ) {
      continue;
    }

    nextState = ensureResurrectionProgress(nextState, target.id);
    nextState = setResurrectionAssignment(nextState, helper.id, target.id, now);
  }

  return nextState;
}

function moveResurrectionParticipants(
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

    if (isResurrectionParticipantAttackingAreaThreat(nextState, helper)) {
      continue;
    }

    if (isInValidResurrectionStandPosition(nextState, helper, target)) {
      movedEntityIds.add(helper.id);
      continue;
    }

    if (movedEntityIds.has(helper.id)) {
      continue;
    }

    const standPosition = getResurrectionStandPosition(nextState, helper, target);
    const previousPosition = helper.position;

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      helper,
      standPosition,
      {
        allowPartyPassThrough: true,
        pathProfile: "resurrection",
        pathTargetKey: `resurrection:${target.id}`,
        pathTargetPosition: standPosition,
      },
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

function progressResurrectionArea(
  state: GameState,
  now: number,
  deltaMs: number,
  recoveryTargetId: string | null,
): GameState {
  if (!recoveryTargetId) {
    return state;
  }

  const target = getEntityById(state, recoveryTargetId);

  if (!isDeadCompanion(target)) {
    return state;
  }

  const contributorCount = getResurrectionContributorCount(state, target);

  if (contributorCount <= 0) {
    return state;
  }

  const contributionMs =
    deltaMs * getResurrectionContributionMultiplier(contributorCount);
  const nextState = addResurrectionProgress(
    state,
    target.id,
    now,
    contributionMs,
    contributorCount,
  );
  const progress = nextState.resurrectionProgressByCompanionId?.[target.id];

  return progress && progress.progressMs >= progress.requiredMs
    ? completeResurrection(nextState, target, now)
    : nextState;
}

function addResurrectionProgress(
  state: GameState,
  targetId: string,
  _now: number,
  contributionMs: number,
  contributorCount: number,
): GameState {
  const progress = state.resurrectionProgressByCompanionId?.[targetId] ?? {
    companionId: targetId,
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
      [targetId]: {
        ...progress,
        progressMs: progressAfterMs,
      },
    },
  };

  return appendDebugTelemetryEvent(nextState, {
    type: "resurrection_area_progressed",
    entityId: targetId,
    targetId,
    progressBeforeMs,
    progressAfterMs,
    progressContributionMs: progressAfterMs - progressBeforeMs,
    requiredProgressMs: progress.requiredMs,
    result: String(contributorCount),
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
      nextState = removeResurrectionAssignment(
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

function clearInvalidResurrectionAssignments(
  state: GameState,
  now: number,
  recoveryTargetId: string | null,
): GameState {
  let nextState = state;

  for (const channel of Object.values(state.resurrectionChannelsByHelperId ?? {})) {
    const helper = getEntityById(nextState, channel.helperId);
    const target = getEntityById(nextState, channel.targetId);

    if (
      !isLivingCompanion(helper) ||
      helper.commandPriority === "direct" ||
      !recoveryTargetId ||
      channel.targetId !== recoveryTargetId ||
      !isDeadCompanion(target)
    ) {
      nextState = removeResurrectionAssignment(
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

function setResurrectionAssignment(
  state: GameState,
  helperId: string,
  targetId: string,
  _now: number,
): GameState {
  const helper = state.entities[helperId];
  const channel: ResurrectionRecoveryAssignmentState = { helperId, targetId };
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
    type: "resurrection_participant_assigned",
    entityId: helperId,
    targetId,
    progressBeforeMs:
      state.resurrectionProgressByCompanionId?.[targetId]?.progressMs ?? 0,
    requiredProgressMs: RESURRECTION_REQUIRED_MS,
  });
}

function removeResurrectionAssignment(
  state: GameState,
  channel: ResurrectionRecoveryAssignmentState,
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
    type: "resurrection_participant_removed",
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

function getLivingCompanions(state: GameState): Companion[] {
  return Object.values(state.entities).filter(isLivingCompanion);
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

function getActiveResurrectionTarget(state: GameState): Companion | null {
  const targetId = getPartyResurrectionRecoveryTargetId(state);
  const target = targetId ? getEntityById(state, targetId) : undefined;

  return isDeadCompanion(target) ? target : null;
}

function getResurrectionContributorCount(
  state: GameState,
  target: Companion,
): number {
  return getLivingCompanions(state).filter((companion) =>
    isInResurrectionRange(companion, target),
  ).length;
}

function isResurrectionParticipantAttackingAreaThreat(
  state: GameState,
  helper: Companion,
): boolean {
  const target = helper.currentTargetId
    ? getEntityById(state, helper.currentTargetId)
    : undefined;

  return Boolean(
    isLivingEnemy(target) && isPositionInActiveResurrectionArea(state, target.position),
  );
}

function getResurrectionContributionMultiplier(contributorCount: number): number {
  return (
    RESURRECTION_CONTRIBUTION_MULTIPLIERS[
      Math.min(contributorCount, RESURRECTION_CONTRIBUTION_MULTIPLIERS.length - 1)
    ] ??
    RESURRECTION_CONTRIBUTION_MULTIPLIERS[
      RESURRECTION_CONTRIBUTION_MULTIPLIERS.length - 1
    ] ??
    1
  );
}

function isInValidResurrectionStandPosition(
  state: GameState,
  helper: Companion,
  target: Companion,
): boolean {
  return (
    isInResurrectionRange(helper, target) &&
    getGridDistance(helper.position, target.position) >=
      RESURRECTION_MIN_STAND_DISTANCE &&
    isPositionAvailable(state, helper.position, { ignoredEntityId: helper.id })
  );
}

function getResurrectionStandPosition(
  state: GameState,
  helper: Companion,
  target: Companion,
): Position {
  return (
    getResurrectionStandCandidates(target.position)
      .filter((position) =>
        isPositionAvailable(state, position, { ignoredEntityId: helper.id }),
      )
      .sort(
        (first, second) =>
          getGridDistance(first, helper.position) -
            getGridDistance(second, helper.position) ||
          getGridDistance(second, target.position) -
            getGridDistance(first, target.position) ||
          first.y - second.y ||
          first.x - second.x,
      )[0] ?? target.position
  );
}

function getResurrectionStandCandidates(center: Position): Position[] {
  const positions: Position[] = [];

  for (
    let y = center.y - RESURRECTION_RANGE;
    y <= center.y + RESURRECTION_RANGE;
    y += 1
  ) {
    for (
      let x = center.x - RESURRECTION_RANGE;
      x <= center.x + RESURRECTION_RANGE;
      x += 1
    ) {
      const position = { x, y };

      if (
        getGridDistance(position, center) <= RESURRECTION_RANGE &&
        getGridDistance(position, center) >= RESURRECTION_MIN_STAND_DISTANCE
      ) {
        positions.push(position);
      }
    }
  }

  return positions;
}
