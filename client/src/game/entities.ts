import type {
  AutonomousEntity,
  CombatEntity,
  Companion,
  Enemy,
  EnemyAggressionMode,
  EntityState,
  GameEntity,
  Player,
  Position,
  ResourceEntity,
  ResourceType,
} from "./types";

const FOLLOW_DISTANCE = 1;
const STARTING_HEALTH = 10;
const STARTING_RESOURCE_DURABILITY = 5;
const DEFAULT_RESOURCE_TYPE: ResourceType = "wood";

type CreateResourceOptions = {
  durability?: number;
  maxGatherers?: number;
  resourceType?: ResourceType;
};

export function createPlayer(id: string, position: Position): Player {
  return {
    id,
    kind: "player",
    position,
    state: "idle",
    health: STARTING_HEALTH,
    lastAttackAt: 0,
    currentTargetId: null,
    lastGatherAt: 0,
    commandPriority: "direct",
  };
}

export function createEnemy(
  id: string,
  position: Position,
  aggressionMode: EnemyAggressionMode = "passive",
): Enemy {
  return {
    id,
    kind: "enemy",
    position,
    state: "idle",
    health: STARTING_HEALTH,
    lastAttackAt: 0,
    currentTargetId: null,
    aggressionMode,
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
    health: STARTING_HEALTH,
    lastAttackAt: 0,
    followTargetId,
    currentTargetId: followTargetId,
    lastGatherAt: 0,
    commandPriority: "autonomous",
  };
}

export function createResource(
  id: string,
  position: Position,
  options: CreateResourceOptions = {},
): ResourceEntity {
  const {
    durability = STARTING_RESOURCE_DURABILITY,
    maxGatherers = 1,
    resourceType = DEFAULT_RESOURCE_TYPE,
  } = options;

  return {
    id,
    kind: "resource",
    resourceType,
    position,
    state: "idle",
    durability,
    maxGatherers,
    isDepleted: false,
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

export function damageEntity<T extends CombatEntity>(
  entity: T,
  damage: number,
): T {
  const health = Math.max(0, entity.health - damage);

  return {
    ...entity,
    health,
    state: health === 0 ? "dead" : entity.state,
  };
}

export function setLastAttackAt<T extends CombatEntity>(
  entity: T,
  lastAttackAt: number,
): T {
  return {
    ...entity,
    lastAttackAt,
  };
}

export function gatherResource(
  resource: ResourceEntity,
  gatherAmount: number,
): ResourceEntity {
  const durability = Math.max(0, resource.durability - gatherAmount);

  return {
    ...resource,
    durability,
    isDepleted: durability === 0,
  };
}

export function setLastGatherAt<T extends AutonomousEntity>(
  entity: T,
  lastGatherAt: number,
): T {
  return {
    ...entity,
    lastGatherAt,
  };
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

export function isCombatEntity(
  entity: GameEntity | undefined,
): entity is CombatEntity {
  return isAutonomousEntity(entity) || entity?.kind === "enemy";
}

export function isResourceEntity(
  entity: GameEntity | undefined,
): entity is ResourceEntity {
  return entity?.kind === "resource";
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
