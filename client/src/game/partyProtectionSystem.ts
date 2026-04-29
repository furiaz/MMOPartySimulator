import { updateEntity, type GameState } from "./state";
import type { Companion, Enemy, GameEntity, Player } from "./types";

export function protectLeader(
  state: GameState,
  leader: Player,
  attacker: Enemy,
): GameState {
  if (leader.state === "dead" || attacker.state === "dead") {
    return state;
  }

  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!canProtectLeader(entity, leader.id)) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...entity,
      state: "attack",
      currentTargetId: attacker.id,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function canProtectLeader(
  entity: GameEntity,
  leaderId: string,
): entity is Companion {
  if (entity.kind !== "companion") {
    return false;
  }

  return (
    entity.followTargetId === leaderId &&
    (entity.state === "idle" || entity.state === "follow")
  );
}
