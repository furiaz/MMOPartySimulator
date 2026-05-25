import {
  isActiveResourcePosition,
  isPositionInsideEntityCollisionShape,
  isWallPosition,
  type GameState,
} from "./state";
import { getEuclideanDistance } from "./positionUtils";
import type { Companion, Enemy, GameEntity, Position } from "./types";

const SKILL_MOVEMENT_SAMPLE_DISTANCE = 0.1;
const QUICK_STEP_ANGLE_OFFSETS_RADIANS = [
  0,
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 2,
];

type SkillPositionOptions = {
  ignoredEntityIds?: string[];
};

export function getClearLungePosition(
  state: GameState,
  caster: Companion,
  target: Enemy,
  distance: number,
): Position | null {
  if (
    !isDirectSkillPathClear(state, caster.position, target.position, {
      ignoredEntityIds: [caster.id, target.id],
    })
  ) {
    return null;
  }

  const direction = getUnitDirection(
    {
      x: target.position.x - caster.position.x,
      y: target.position.y - caster.position.y,
    },
    { x: 0, y: 0 },
  );

  if (direction.x === 0 && direction.y === 0) {
    return caster.position;
  }

  return getFarthestSkillPosition(state, caster, direction, distance, {
    ignoredEntityIds: [caster.id],
  });
}

export function getSkillDashPosition(
  state: GameState,
  caster: Companion,
  direction: Position,
  distance: number,
  options: { allowAngles?: boolean } = {},
): Position | null {
  const unitDirection = getUnitDirection(direction, { x: 0, y: 0 });

  if (unitDirection.x === 0 && unitDirection.y === 0) {
    return null;
  }

  const angleOffsets = options.allowAngles
    ? QUICK_STEP_ANGLE_OFFSETS_RADIANS
    : [0];

  for (const angleOffset of angleOffsets) {
    const position = getFarthestSkillPosition(
      state,
      caster,
      rotateDirection(unitDirection, angleOffset),
      distance,
      { ignoredEntityIds: [caster.id] },
    );

    if (
      position &&
      getEuclideanDistance(caster.position, position) >=
        distance - SKILL_MOVEMENT_SAMPLE_DISTANCE / 2
    ) {
      return position;
    }
  }

  return null;
}

export function getDirectionToward(
  caster: Companion,
  target: GameEntity,
): Position {
  return {
    x: target.position.x - caster.position.x,
    y: target.position.y - caster.position.y,
  };
}

export function getDirectionAwayFrom(
  caster: Companion,
  target: GameEntity,
): Position {
  return {
    x: caster.position.x - target.position.x,
    y: caster.position.y - target.position.y,
  };
}

function getFarthestSkillPosition(
  state: GameState,
  caster: Companion,
  direction: Position,
  distance: number,
  options: SkillPositionOptions,
): Position | null {
  const steps = Math.max(1, Math.ceil(distance / SKILL_MOVEMENT_SAMPLE_DISTANCE));
  let farthestPosition: Position | null = null;

  for (let step = 1; step <= steps; step += 1) {
    const stepDistance = Math.min(
      distance,
      step * SKILL_MOVEMENT_SAMPLE_DISTANCE,
    );
    const position = {
      x: caster.position.x + direction.x * stepDistance,
      y: caster.position.y + direction.y * stepDistance,
    };

    if (!isSkillPositionAvailable(state, position, options)) {
      break;
    }

    farthestPosition = position;
  }

  return farthestPosition;
}

function isDirectSkillPathClear(
  state: GameState,
  from: Position,
  to: Position,
  options: SkillPositionOptions,
): boolean {
  const distance = getEuclideanDistance(from, to);

  if (distance === 0) {
    return true;
  }

  const direction = {
    x: (to.x - from.x) / distance,
    y: (to.y - from.y) / distance,
  };
  const steps = Math.max(1, Math.ceil(distance / SKILL_MOVEMENT_SAMPLE_DISTANCE));

  for (let step = 1; step <= steps; step += 1) {
    const stepDistance = Math.min(
      distance,
      step * SKILL_MOVEMENT_SAMPLE_DISTANCE,
    );
    const position = {
      x: from.x + direction.x * stepDistance,
      y: from.y + direction.y * stepDistance,
    };

    if (!isSkillPathPositionClear(state, position, options)) {
      return false;
    }
  }

  return true;
}

function isSkillPathPositionClear(
  state: GameState,
  position: Position,
  options: SkillPositionOptions,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isActiveResourcePosition(state, position, undefined) &&
    !isPositionOccupiedByBlockingEntity(state, position, options)
  );
}

function isSkillPositionAvailable(
  state: GameState,
  position: Position,
  options: SkillPositionOptions,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isActiveResourcePosition(state, position, undefined) &&
    !isPositionOccupiedByBlockingEntity(state, position, options)
  );
}

function isInMapBounds(state: GameState, position: Position): boolean {
  if (!state.map) {
    return true;
  }

  return (
    position.x >= 0 &&
    position.x < state.map.columns &&
    position.y >= 0 &&
    position.y < state.map.rows
  );
}

function isPositionOccupiedByBlockingEntity(
  state: GameState,
  position: Position,
  options: SkillPositionOptions,
): boolean {
  const ignoredEntityIds = new Set(options.ignoredEntityIds ?? []);

  return Object.values(state.entities).some(
    (entity) =>
      !ignoredEntityIds.has(entity.id) &&
      entity.state !== "dead" &&
      isPositionInsideEntityCollisionShape(entity, position),
  );
}

function getUnitDirection(
  direction: Position,
  fallbackDirection: Position,
): Position {
  const directionLength = Math.hypot(direction.x, direction.y);

  if (directionLength > 0) {
    return {
      x: direction.x / directionLength,
      y: direction.y / directionLength,
    };
  }

  const fallbackLength = Math.hypot(fallbackDirection.x, fallbackDirection.y);

  if (fallbackLength === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: fallbackDirection.x / fallbackLength,
    y: fallbackDirection.y / fallbackLength,
  };
}

function rotateDirection(direction: Position, radians: number): Position {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  };
}
