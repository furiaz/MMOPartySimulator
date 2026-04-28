import { getEntityById, updateEntity, type GameState } from "./state";
import type { Companion, EntityState } from "./types";

type TargetedCompanionCommandType = Exclude<EntityState, "idle">;

export type CompanionCommand =
  | {
      type: "idle";
      companionId: string;
    }
  | {
      type: TargetedCompanionCommandType;
      companionId: string;
      targetId: string;
    };

export function issueCompanionCommand(
  state: GameState,
  command: CompanionCommand,
): GameState {
  const companion = getEntityById(state, command.companionId);

  if (!isCompanion(companion)) {
    return state;
  }

  if (command.type === "idle") {
    const updatedCompanion: Companion = {
      ...companion,
      state: "idle",
      currentTargetId: null,
    };

    return updateEntity(state, updatedCompanion);
  }

  const updatedCompanion: Companion = {
    ...companion,
    state: command.type,
    currentTargetId: command.targetId,
    followTargetId:
      command.type === "follow" ? command.targetId : companion.followTargetId,
  };

  return updateEntity(state, updatedCompanion);
}

function isCompanion(entity: unknown): entity is Companion {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "kind" in entity &&
    entity.kind === "companion"
  );
}
