import type {
  Companion,
  Enemy,
  EntityState,
  GameEntity,
  Player,
  Position,
} from "./types";

const FOLLOW_DISTANCE = 1;

export function createPlayer(id: string, position: Position): Player {
  return {
    id,
    kind: "player",
    position,
    state: "idle",
  };
}

export function createEnemy(id: string, position: Position): Enemy {
  return {
    id,
    kind: "enemy",
    position,
    state: "idle",
  };
}

export function createCompanion(
  id: string,
  position: Position,
  followTargetId: string,
): Companion {
  return {
    id,
    kind: "companion",
    position,
    state: "follow",
    followTargetId,
    currentTargetId: followTargetId,
  };
}

export function setEntityState<T extends GameEntity>(
  entity: T,
  state: EntityState,
): T {
  return {
    ...entity,
    state,
  };
}

export function moveEntityTo<T extends GameEntity>(
  entity: T,
  position: Position,
): T {
  return {
    ...entity,
    position,
  };
}

export function updateCompanionFollow(
  companion: Companion,
  target: GameEntity,
): Companion {
  if (companion.state !== "follow") {
    return companion;
  }

  const nextPosition = stepToward(companion.position, target.position);

  return {
    ...companion,
    position: nextPosition,
  };
}

function stepToward(current: Position, target: Position): Position {
  const xDistance = target.x - current.x;
  const yDistance = target.y - current.y;

  if (
    Math.abs(xDistance) <= FOLLOW_DISTANCE &&
    Math.abs(yDistance) <= FOLLOW_DISTANCE
  ) {
    return current;
  }

  return {
    x: current.x + Math.sign(xDistance),
    y: current.y + Math.sign(yDistance),
  };
}
