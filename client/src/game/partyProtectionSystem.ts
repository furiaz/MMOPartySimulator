import { isWithinFollowLeash } from "./followSystem";
import { updateEntity, type GameState } from "./state";
import type { AutonomousEntity, Enemy, GameEntity, Player } from "./types";

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
    if (!canProtectLeader(state, entity, leader)) {
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
  state: GameState,
  entity: GameEntity,
  leader: Player,
): entity is AutonomousEntity {
  if (entity.kind !== "player" && entity.kind !== "companion") {
    return false;
  }

  if (entity.commandPriority === "direct") {
    return false;
  }

  if (entity.kind === "player") {
    return (
      entity.id === leader.id &&
      (entity.state === "idle" || entity.state === "follow")
    );
  }

  if (entity.followTargetId !== leader.id) {
    return false;
  }

  if (!isWithinFollowLeash(state, entity, leader)) {
    return false;
  }

  return (
    entity.state === "idle" ||
    entity.state === "follow"
  );
}
