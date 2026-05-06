import { isAutonomousEntity } from "./entities";
import {
  getEntityById,
  setLeaderIntent,
  updateEntity,
  type GameState,
} from "./state";
import type {
  AutonomousEntity,
  CommandPriority,
  EntityState,
  LeaderIntent,
} from "./types";

type TargetedEntityCommandType = Exclude<EntityState, "idle" | "dead">;

export type EntityCommand =
  | {
      type: "idle";
      entityId: string;
      priority?: CommandPriority;
    }
  | {
      type: TargetedEntityCommandType;
      entityId: string;
      targetId: string;
      priority?: CommandPriority;
    };

export type CompanionCommand =
  | {
      type: "idle";
      companionId: string;
      priority?: CommandPriority;
    }
  | {
      type: TargetedEntityCommandType;
      companionId: string;
      targetId: string;
      priority?: CommandPriority;
    };

export type CompanionGroupCommand =
  | {
      type: "idle";
      priority?: CommandPriority;
    }
  | {
      type: TargetedEntityCommandType;
      targetId: string;
      priority?: CommandPriority;
    };

export function issueEntityCommand(
  state: GameState,
  command: EntityCommand,
): GameState {
  const entity = getEntityById(state, command.entityId);

  if (!isAutonomousEntity(entity)) {
    return state;
  }

  if (entity.state === "dead") {
    return state;
  }

  const commandPriority = command.priority ?? "direct";

  if (!canApplyCommand(entity, commandPriority)) {
    return state;
  }

  if (command.type === "idle") {
    const updatedEntity: AutonomousEntity = {
      ...entity,
      state: "idle",
      currentTargetId: null,
      commandPriority,
    };

    const nextState = updateEntity(state, updatedEntity);

    return entity.id === state.partyLeaderId
      ? setLeaderIntent(nextState, null)
      : nextState;
  }

  const updatedEntity: AutonomousEntity = {
    ...entity,
    state: command.type,
    currentTargetId: command.targetId,
    commandPriority,
    ...(entity.kind === "companion" && command.type === "follow"
      ? { followTargetId: command.targetId }
      : {}),
  };

  const nextState = updateEntity(state, updatedEntity);

  return entity.id === state.partyLeaderId
    ? setLeaderIntent(nextState, getLeaderIntentFromCommand(state, command))
    : nextState;
}

export function issueCompanionCommand(
  state: GameState,
  command: CompanionCommand,
): GameState {
  const entityCommand =
    command.type === "idle"
      ? {
          type: command.type,
          entityId: command.companionId,
          priority: command.priority,
        }
      : {
          type: command.type,
          entityId: command.companionId,
          targetId: command.targetId,
          priority: command.priority,
        };

  return issueEntityCommand(state, entityCommand);
}

export function issueCompanionCommands(
  state: GameState,
  companionIds: string[],
  command: CompanionGroupCommand,
): GameState {
  return companionIds.reduce((nextState, companionId) => {
    const companionCommand =
      command.type === "idle"
        ? {
            type: command.type,
            companionId,
            priority: command.priority,
          }
        : {
            type: command.type,
            companionId,
            targetId: command.targetId,
            priority: command.priority,
          };

    return issueCompanionCommand(nextState, companionCommand);
  }, state);
}

function canApplyCommand(
  entity: AutonomousEntity,
  commandPriority: CommandPriority,
): boolean {
  return commandPriority === "direct" || entity.commandPriority !== "direct";
}

function getLeaderIntentFromCommand(
  state: GameState,
  command: Extract<EntityCommand, { targetId: string }>,
): LeaderIntent {
  const targetPosition = getEntityById(state, command.targetId)?.position ?? null;

  return {
    type: getLeaderIntentType(command.type),
    targetId: command.targetId,
    targetPosition,
  };
}

function getLeaderIntentType(
  commandType: Exclude<EntityState, "idle" | "dead">,
): LeaderIntent["type"] {
  if (commandType === "attack") {
    return "attack";
  }

  if (commandType === "gather") {
    return "gather";
  }

  return "move";
}
