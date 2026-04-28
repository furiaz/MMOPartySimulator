import { isAutonomousEntity } from "./entities";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { AutonomousEntity, EntityState } from "./types";

type TargetedEntityCommandType = Exclude<EntityState, "idle">;

export type EntityCommand =
  | {
      type: "idle";
      entityId: string;
    }
  | {
      type: TargetedEntityCommandType;
      entityId: string;
      targetId: string;
    };

export type CompanionCommand =
  | {
      type: "idle";
      companionId: string;
    }
  | {
      type: TargetedEntityCommandType;
      companionId: string;
      targetId: string;
    };

export function issueEntityCommand(
  state: GameState,
  command: EntityCommand,
): GameState {
  const entity = getEntityById(state, command.entityId);

  if (!isAutonomousEntity(entity)) {
    return state;
  }

  if (command.type === "idle") {
    const updatedEntity: AutonomousEntity = {
      ...entity,
      state: "idle",
      currentTargetId: null,
    };

    return updateEntity(state, updatedEntity);
  }

  const updatedEntity: AutonomousEntity = {
    ...entity,
    state: command.type,
    currentTargetId: command.targetId,
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
        }
      : {
          type: command.type,
          entityId: command.companionId,
          targetId: command.targetId,
        };

  return issueEntityCommand(state, entityCommand);
}
