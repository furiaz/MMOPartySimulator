import { isAutonomousEntity } from "./entities";
import { isActiveResource } from "./entityGuards";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  getEntityById,
  updateEntity,
  type GameState,
} from "./state";
import { setPartyIntent } from "./partyIntentState";
import { clearResurrectionRecoveryAssignmentForCompanion } from "./resurrectionSystem";
import type {
  AutonomousEntity,
  CommandPriority,
  EntityState,
  PartyExecutionIntent,
  Position,
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

export type PartyOrder =
  | {
      type: "move";
      targetPosition: Position;
    }
  | {
      type: "attack" | "gather";
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

  if (entity.state === "dead") {
    return state;
  }

  const commandPriority = command.priority ?? "direct";

  if (!canApplyCommand(entity, commandPriority)) {
    return state;
  }

  const commandState =
    commandPriority === "direct"
      ? clearResurrectionRecoveryAssignmentForCompanion(
          state,
          entity.id,
          Date.now(),
          "direct_command",
        )
      : state;

  if (command.type === "idle") {
    const updatedEntity: AutonomousEntity = {
      ...entity,
      state: "idle",
      currentTargetId: null,
      commandPriority,
    };

    const nextState = updateEntity(commandState, updatedEntity);

    return nextState;
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

  const nextState = updateEntity(commandState, updatedEntity);

  return nextState;
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

export function issuePartyOrder(
  state: GameState,
  order: PartyOrder,
): GameState {
  const leader = getPartyLeader(state);

  if (!leader) {
    return state;
  }

  if (order.type !== "move") {
    const target = getEntityById(state, order.targetId);

    if (!target || (order.type === "gather" && !isActiveResource(target))) {
      return state;
    }
  }

  const playerIntent = getPlayerPartyExecutionIntent(state, order);
  let nextState = setPartyIntent(state, {
    mode: playerIntent.type === "attack" ? "engage" : "travel",
    source: "player",
    executionIntent: playerIntent,
    globalPoiIntent: null,
    localPoiTarget: null,
    worldTravelTargetMapId: null,
  });

  for (const member of getPartyMembers(nextState)) {
    if (member.state === "dead") {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      ...getPartyOrderEntityState(member.id, leader.id, order),
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function canApplyCommand(
  entity: AutonomousEntity,
  commandPriority: CommandPriority,
): boolean {
  return commandPriority === "direct" || entity.commandPriority !== "direct";
}

function getPlayerPartyExecutionIntent(
  state: GameState,
  order: PartyOrder,
): PartyExecutionIntent {
  if (order.type === "move") {
    return {
      type: "move",
      targetId: null,
      targetPosition: { ...order.targetPosition },
      source: "player",
    };
  }

  return {
    type: order.type,
    targetId: order.targetId,
    targetPosition: getEntityById(state, order.targetId)?.position ?? null,
    source: "player",
  };
}

function getPartyOrderEntityState(
  memberId: string,
  leaderId: string,
  order: PartyOrder,
): Pick<AutonomousEntity, "state" | "currentTargetId"> {
  if (order.type === "move") {
    return {
      state: "follow",
      currentTargetId: memberId === leaderId ? null : leaderId,
    };
  }

  return {
    state: order.type,
    currentTargetId: order.targetId,
  };
}

