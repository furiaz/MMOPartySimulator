import type {
  AutonomousEntity,
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
    currentTargetId: null,
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

export function moveEntityToward<T extends GameEntity>(
  entity: T,
  target: GameEntity,
): T {
  return moveEntityTo(entity, stepToward(entity.position, target.position));
}

export function updateCompanionFollow(
  companion: Companion,
  target: GameEntity,
): Companion {
  if (companion.state !== "follow") {
    return companion;
  }

  return moveEntityToward(companion, target);
}

export function updateAutonomousEntityFollow<T extends AutonomousEntity>(
  entity: T,
  target: GameEntity,
): T {
  if (entity.state !== "follow") {
    return entity;
  }

  return moveEntityToward(entity, target);
}

export function isAutonomousEntity(
  entity: GameEntity | undefined,
): entity is AutonomousEntity {
  return entity?.kind === "player" || entity?.kind === "companion";
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
