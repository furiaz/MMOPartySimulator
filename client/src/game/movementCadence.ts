import type { GameState } from "./state";
import type { GameEntity, PartyMemberRole, Position } from "./types";

type MovementCadenceOptions = {
  alwaysMove?: boolean;
  catchUpDistance?: number;
};

export function canMoveOnCadence(
  state: GameState,
  entity: GameEntity,
  targetPosition: Position,
  options: MovementCadenceOptions = {},
): boolean {
  if (options.alwaysMove || entity.kind === "enemy" || entity.kind === "resource") {
    return true;
  }

  if (entity.role === "defender") {
    return true;
  }

  const catchUpDistance = options.catchUpDistance ?? 4;

  if (getGridDistance(entity.position, targetPosition) >= catchUpDistance) {
    return true;
  }

  const cadence = getRoleMovementCadence(entity.role);

  if (cadence <= 1) {
    return true;
  }

  const offset = getStableOffset(entity.id, cadence);

  return ((state.simulationTick ?? 0) + offset) % cadence === 0;
}

function getRoleMovementCadence(role: PartyMemberRole): number {
  if (role === "fighter") {
    return 2;
  }

  if (role === "support" || role === "gatherer") {
    return 3;
  }

  return 2;
}

function getStableOffset(id: string, cadence: number): number {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % cadence;
  }

  return hash;
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}
