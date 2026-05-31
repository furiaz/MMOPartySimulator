import { isActiveResource, isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getGridDistance } from "./positionUtils";
import { clearResurrectionRecoveryAssignmentForCompanion } from "./resurrectionSystem";
import {
  addCombatFeedback,
  getEntityById,
  updateEntity,
  type GameState,
} from "./state";
import {
  getBoundedPathDistance,
  isPositionAvailable,
  moveEntityTowardPositionIfUnoccupied,
} from "./movementPlanning";
import type {
  Companion,
  DirectCompanionCommand,
  DirectCompanionCommandResultCode,
  DirectCompanionCommandType,
  Enemy,
  Position,
  ResourceEntity,
} from "./types";

export const DIRECT_COMMAND_MAX_PATH_DISTANCE = 30;
export const DIRECT_COMMAND_REJOIN_GRACE_MS = 1500;
const DIRECT_MOVE_ARRIVAL_DISTANCE = 0.25;

export type CompanionDirectCommandInput =
  | {
      type: "attack" | "gather";
      companionId: string;
      targetId: string;
    }
  | {
      type: "move";
      companionId: string;
      targetPosition: Position;
    };

export type CompanionDirectCommandResult = {
  code: DirectCompanionCommandResultCode;
  state: GameState;
};

export function issueCompanionDirectCommand(
  state: GameState,
  input: CompanionDirectCommandInput,
  now = Date.now(),
): CompanionDirectCommandResult {
  const companion = getEntityById(state, input.companionId);

  if (!isLivingCompanion(companion)) {
    return rejectDirectCommand(state, input, "invalid_source");
  }

  const validation = validateDirectCommand(state, companion, input);

  if (validation.code !== "success") {
    return rejectDirectCommand(state, input, validation.code);
  }

  const previousCommand = state.directCompanionCommandsById?.[companion.id] ?? null;
  let nextState = clearResurrectionRecoveryAssignmentForCompanion(
    state,
    companion.id,
    now,
    "direct_command",
  );

  if (previousCommand) {
    nextState = appendDirectCommandEvent(nextState, {
      type: "direct_command_replaced",
      companionId: companion.id,
      command: previousCommand,
      reason: input.type,
    });
  }

  const command = createDirectCommand(input, validation.targetPosition, now);
  if (command.type === "move") {
    nextState = clearMovementPlanningForCompanion(nextState, companion.id);
  }

  nextState = {
    ...nextState,
    directCompanionCommandsById: {
      ...(nextState.directCompanionCommandsById ?? {}),
      [companion.id]: command,
    },
    directCommandGraceUntilByCompanionId: removeRecordEntry(
      nextState.directCommandGraceUntilByCompanionId,
      companion.id,
    ),
  };

  nextState = updateEntity(nextState, getCompanionCommandState(companion, command));
  nextState = appendDirectCommandEvent(nextState, {
    type: "direct_command_issued",
    companionId: companion.id,
    command,
  });

  return { code: "success", state: nextState };
}

export function updateDirectCompanionCommandSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
  now = Date.now(),
): GameState {
  let nextState = clearExpiredDirectCommandGrace(state, now);
  const commands = Object.values(nextState.directCompanionCommandsById ?? {}).sort(
    (first, second) =>
      first.issuedAt - second.issuedAt ||
      first.companionId.localeCompare(second.companionId),
  );

  for (const command of commands) {
    const currentCommand =
      nextState.directCompanionCommandsById?.[command.companionId];

    if (!currentCommand || currentCommand !== command) {
      continue;
    }

    const companion = getEntityById(nextState, command.companionId);

    if (!isLivingCompanion(companion)) {
      nextState = clearDirectCompanionCommand(
        nextState,
        command,
        now,
        "direct_command_canceled",
        "invalid_source",
        false,
      );
      continue;
    }

    if (command.type === "move") {
      nextState = updateDirectMoveCommand(nextState, companion, command, movedEntityIds, now);
      continue;
    }

    const target = getEntityById(nextState, command.targetId);

    if (command.type === "attack") {
      if (!isLivingEnemy(target)) {
        nextState = clearDirectCompanionCommand(
          nextState,
          command,
          now,
          "direct_command_completed",
          "target_invalid",
        );
        continue;
      }

      nextState = updateEntity(nextState, getCompanionCommandState(companion, command));
      continue;
    }

    if (!isActiveResource(target)) {
      nextState = clearDirectCompanionCommand(
        nextState,
        command,
        now,
        "direct_command_completed",
        "target_invalid",
      );
      continue;
    }

    if (!isDirectGatherCommandAllowed(nextState, command, target)) {
      nextState = addCombatFeedback(nextState, {
        type: "gather",
        entityId: companion.id,
        text: "Resource Full",
        now,
      });
      nextState = clearDirectCompanionCommand(
        nextState,
        command,
        now,
        "direct_command_canceled",
        "resource_full",
      );
      continue;
    }

    const personalThreat = findPersonalThreat(nextState, companion);

    if (personalThreat) {
      nextState = updateEntity(nextState, {
        ...companion,
        state: "attack",
        currentTargetId: personalThreat.id,
        commandPriority: "direct",
      });
      continue;
    }

    nextState = updateEntity(nextState, getCompanionCommandState(companion, command));
  }

  return nextState;
}

export function getActiveDirectCompanionCommand(
  state: GameState,
  companionId: string,
): DirectCompanionCommand | null {
  return state.directCompanionCommandsById?.[companionId] ?? null;
}

export function isCompanionInDirectCommandGrace(
  state: GameState,
  companionId: string,
  now = state.simulationTimeMs ?? Date.now(),
): boolean {
  return (state.directCommandGraceUntilByCompanionId?.[companionId] ?? 0) > now;
}

export function getDirectGatherCommandTargetId(
  state: GameState,
  companionId: string,
): string | null {
  const command = getActiveDirectCompanionCommand(state, companionId);

  return command?.type === "gather" ? command.targetId : null;
}

function validateDirectCommand(
  state: GameState,
  companion: Companion,
  input: CompanionDirectCommandInput,
): {
  code: DirectCompanionCommandResultCode;
  targetPosition: Position | null;
} {
  if (input.type === "move") {
    const targetPosition = { ...input.targetPosition };

    if (!isPositionAvailable(state, targetPosition, { ignoredEntityId: companion.id })) {
      return { code: "blocked_position", targetPosition: null };
    }

    return isWithinDirectCommandRange(state, companion, targetPosition)
      ? { code: "success", targetPosition }
      : { code: "out_of_range", targetPosition: null };
  }

  const target = getEntityById(state, input.targetId);

  if (input.type === "attack") {
    if (!isLivingEnemy(target)) {
      return { code: "invalid_target", targetPosition: null };
    }

    return isWithinDirectCommandRange(state, companion, target.position)
      ? { code: "success", targetPosition: { ...target.position } }
      : { code: "out_of_range", targetPosition: null };
  }

  if (!isActiveResource(target)) {
    return { code: "invalid_target", targetPosition: null };
  }

  if (!isWithinDirectCommandRange(state, companion, target.position)) {
    return { code: "out_of_range", targetPosition: null };
  }

  if (isResourceAtDirectCommandCapacity(state, target, companion.id)) {
    return { code: "resource_full", targetPosition: null };
  }

  return { code: "success", targetPosition: { ...target.position } };
}

function rejectDirectCommand(
  state: GameState,
  input: CompanionDirectCommandInput,
  code: DirectCompanionCommandResultCode,
): CompanionDirectCommandResult {
  return {
    code,
    state: appendDebugTelemetryEvent(state, {
      type: "direct_command_rejected",
      entityId: input.companionId,
      targetId: "targetId" in input ? input.targetId : null,
      result: code,
      directCommandType: input.type,
      directCommandTargetPosition:
        input.type === "move" ? { ...input.targetPosition } : null,
    }),
  };
}

function createDirectCommand(
  input: CompanionDirectCommandInput,
  targetPosition: Position | null,
  now: number,
): DirectCompanionCommand {
  if (input.type === "move") {
    return {
      type: "move",
      companionId: input.companionId,
      targetPosition: { ...input.targetPosition },
      issuedAt: now,
    };
  }

  return {
    type: input.type,
    companionId: input.companionId,
    targetId: input.targetId,
    targetPosition: targetPosition ? { ...targetPosition } : null,
    issuedAt: now,
  };
}

function getCompanionCommandState(
  companion: Companion,
  command: DirectCompanionCommand,
): Companion {
  if (command.type === "move") {
    return {
      ...companion,
      state: "follow",
      currentTargetId: null,
      commandPriority: "direct",
    };
  }

  return {
    ...companion,
    state: command.type,
    currentTargetId: command.targetId,
    commandPriority: "direct",
  };
}

function updateDirectMoveCommand(
  state: GameState,
  companion: Companion,
  command: Extract<DirectCompanionCommand, { type: "move" }>,
  movedEntityIds: Set<string>,
  now: number,
): GameState {
  if (getGridDistance(companion.position, command.targetPosition) <= DIRECT_MOVE_ARRIVAL_DISTANCE) {
    return clearDirectCompanionCommand(
      state,
      command,
      now,
      "direct_command_completed",
      "arrived",
    );
  }

  let nextState = updateEntity(state, getCompanionCommandState(companion, command));

  if (movedEntityIds.has(companion.id)) {
    return nextState;
  }

  nextState = moveEntityTowardPositionIfUnoccupied(
    nextState,
    getCompanionCommandState(companion, command),
    command.targetPosition,
    {
      allowPartyPassThrough: true,
      pathProfile: "directCommand",
      pathTargetKey: `direct-command:${companion.id}`,
      pathTargetPosition: command.targetPosition,
    },
  );

  const movedCompanion = getEntityById(nextState, companion.id);

  if (
    movedCompanion &&
    (movedCompanion.position.x !== companion.position.x ||
      movedCompanion.position.y !== companion.position.y)
  ) {
    movedEntityIds.add(companion.id);
  }

  return nextState;
}

function clearDirectCompanionCommand(
  state: GameState,
  command: DirectCompanionCommand,
  now: number,
  eventType: "direct_command_completed" | "direct_command_canceled",
  reason: string,
  shouldStartGrace = true,
): GameState {
  const companion = getEntityById(state, command.companionId);
  let nextState: GameState = {
    ...state,
    directCompanionCommandsById: removeRecordEntry(
      state.directCompanionCommandsById,
      command.companionId,
    ),
  };

  if (isLivingCompanion(companion)) {
    nextState = updateEntity(nextState, {
      ...companion,
      state: "follow",
      currentTargetId:
        companion.id === nextState.partyLeaderId ? null : nextState.partyLeaderId,
      commandPriority: "autonomous",
    });
  }

  nextState = appendDirectCommandEvent(nextState, {
    type: eventType,
    companionId: command.companionId,
    command,
    reason,
  });

  return shouldStartGrace
    ? startDirectCommandGrace(nextState, command, now)
    : nextState;
}

function startDirectCommandGrace(
  state: GameState,
  command: DirectCompanionCommand,
  now: number,
): GameState {
  const graceUntil = now + DIRECT_COMMAND_REJOIN_GRACE_MS;
  const nextState: GameState = {
    ...state,
    directCommandGraceUntilByCompanionId: {
      ...(state.directCommandGraceUntilByCompanionId ?? {}),
      [command.companionId]: graceUntil,
    },
  };

  return appendDirectCommandEvent(nextState, {
    type: "direct_command_grace_started",
    companionId: command.companionId,
    command,
    reason: "rejoin",
  });
}

function clearExpiredDirectCommandGrace(state: GameState, now: number): GameState {
  const graceById = state.directCommandGraceUntilByCompanionId;

  if (!graceById) {
    return state;
  }

  let nextGraceById: Record<string, number> | undefined = graceById;
  let nextState = state;
  let didExpireGrace = false;

  for (const [companionId, graceUntil] of Object.entries(graceById)) {
    if (graceUntil > now) {
      continue;
    }

    didExpireGrace = true;
    nextGraceById = removeRecordEntry(nextGraceById, companionId);
    nextState = appendDebugTelemetryEvent(
      { ...nextState, directCommandGraceUntilByCompanionId: nextGraceById },
      {
        type: "direct_command_grace_expired",
        entityId: companionId,
        result: "expired",
      },
    );
  }

  return didExpireGrace
    ? { ...nextState, directCommandGraceUntilByCompanionId: nextGraceById }
    : state;
}

function isWithinDirectCommandRange(
  state: GameState,
  companion: Companion,
  targetPosition: Position,
): boolean {
  const pathDistance = getBoundedPathDistance(
    state,
    companion,
    targetPosition,
    DIRECT_COMMAND_MAX_PATH_DISTANCE,
  );

  if (pathDistance !== null) {
    return true;
  }

  if (state.map) {
    return false;
  }

  return getGridDistance(companion.position, targetPosition) <= DIRECT_COMMAND_MAX_PATH_DISTANCE;
}

function isResourceAtDirectCommandCapacity(
  state: GameState,
  resource: ResourceEntity,
  replacingCompanionId?: string,
): boolean {
  const activeDirectGatherCommandCount = Object.values(
    state.directCompanionCommandsById ?? {},
  ).filter(
    (command) =>
      command.type === "gather" &&
      command.targetId === resource.id &&
      command.companionId !== replacingCompanionId,
  ).length;

  return activeDirectGatherCommandCount >= Math.max(0, resource.maxGatherers);
}

function isDirectGatherCommandAllowed(
  state: GameState,
  command: Extract<DirectCompanionCommand, { type: "gather" }>,
  resource: ResourceEntity,
): boolean {
  const directCommands = Object.values(state.directCompanionCommandsById ?? {})
    .filter(
      (currentCommand): currentCommand is Extract<DirectCompanionCommand, { type: "gather" }> =>
        currentCommand.type === "gather" && currentCommand.targetId === resource.id,
    )
    .sort(
      (first, second) =>
        first.issuedAt - second.issuedAt ||
        first.companionId.localeCompare(second.companionId),
    );
  const allowedDirectCommands = directCommands.slice(0, Math.max(0, resource.maxGatherers));

  return allowedDirectCommands.some(
    (allowedCommand) => allowedCommand.companionId === command.companionId,
  );
}

function findPersonalThreat(state: GameState, companion: Companion): Enemy | null {
  const movementFailure = state.movementFailuresByEntityId?.[companion.id];
  const blocker = movementFailure?.blockerId
    ? getEntityById(state, movementFailure.blockerId)
    : undefined;

  if (isLivingEnemy(blocker)) {
    return blocker;
  }

  return (
    Object.values(state.entities)
      .filter(isLivingEnemy)
      .filter((enemy) => enemy.state === "attack" && enemy.currentTargetId === companion.id)
      .sort(
        (first, second) =>
          getGridDistance(first.position, companion.position) -
            getGridDistance(second.position, companion.position) ||
          first.id.localeCompare(second.id),
      )[0] ?? null
  );
}

function appendDirectCommandEvent(
  state: GameState,
  {
    type,
    companionId,
    command,
    reason,
  }: {
    type:
      | "direct_command_issued"
      | "direct_command_replaced"
      | "direct_command_completed"
      | "direct_command_canceled"
      | "direct_command_grace_started";
    companionId: string;
    command: DirectCompanionCommand;
    reason?: string;
  },
): GameState {
  return appendDebugTelemetryEvent(state, {
    type,
    entityId: companionId,
    targetId: "targetId" in command ? command.targetId : null,
    result: reason,
    reason,
    directCommandType: command.type as DirectCompanionCommandType,
    directCommandTargetPosition:
      command.type === "move"
        ? { ...command.targetPosition }
        : command.targetPosition
          ? { ...command.targetPosition }
          : null,
  });
}

function removeRecordEntry<T>(
  record: Record<string, T> | undefined,
  key: string,
): Record<string, T> | undefined {
  if (!record || !(key in record)) {
    return record;
  }

  const nextRecord = { ...record };
  delete nextRecord[key];

  return Object.keys(nextRecord).length > 0 ? nextRecord : undefined;
}

function clearMovementPlanningForCompanion(
  state: GameState,
  companionId: string,
): GameState {
  return {
    ...state,
    failedMoveByEntityId: removeRecordEntry(state.failedMoveByEntityId, companionId),
    movementDecisionsByEntityId: removeRecordEntry(
      state.movementDecisionsByEntityId,
      companionId,
    ),
    movementFailuresByEntityId: removeRecordEntry(
      state.movementFailuresByEntityId,
      companionId,
    ),
    movementPathRetryAtMsByEntityId: removeRecordEntry(
      state.movementPathRetryAtMsByEntityId,
      companionId,
    ),
    movementPathsByEntityId: removeRecordEntry(
      state.movementPathsByEntityId,
      companionId,
    ),
    moveIntentsByEntityId: removeRecordEntry(
      state.moveIntentsByEntityId,
      companionId,
    ),
  };
}
