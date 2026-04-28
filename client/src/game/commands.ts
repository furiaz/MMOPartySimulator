import { isAutonomousEntity } from "./entities";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { AutonomousEntity, CommandPriority, EntityState } from "./types";

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

    return updateEntity(state, updatedEntity);
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

  return updateEntity(state, updatedEntity);
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

function canApplyCommand(
  entity: AutonomousEntity,
  commandPriority: CommandPriority,
): boolean {
  return commandPriority === "direct" || entity.commandPriority !== "direct";
}
