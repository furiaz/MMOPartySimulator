import type {
  AutonomousEntity,
  CombatEntity,
  Companion,
  Enemy,
  EnemyAggressionMode,
  EntityState,
  GameEntity,
  PartyMemberRole,
  Position,
  ResourceEntity,
  ResourceType,
} from "./types";

export const MOVEMENT_STEP_DISTANCE = 0.455;
const STARTING_HEALTH = 10;
const STARTING_ENEMY_HEALTH = 3;
const STARTING_GATHER_SPEED = 1;
const STARTING_RESOURCE_DURABILITY = 5;
const STARTING_RESOURCE_QUANTITY = 3;
const STARTING_RESOURCE_MAX_GATHERERS = 4;
const DEFAULT_RESOURCE_TYPE: ResourceType = "wood";

type CreateResourceOptions = {
  durability?: number;
  maxDurability?: number;
  quantity?: number;
  maxGatherers?: number;
  resourceType?: ResourceType;
};

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
    health: STARTING_ENEMY_HEALTH,
    maxHealth: STARTING_ENEMY_HEALTH,
    lastAttackAt: 0,
    currentTargetId: null,
    aggressionMode,
  };
}

export function createCompanion(
  id: string,
  position: Position,
  followTargetId: string,
  role: PartyMemberRole = "none",
  partyOrder = 1,
): Companion {
  return {
    id,
    kind: "companion",
    role,
    partyOrder,
    position,
    state: "follow",
    health: STARTING_HEALTH,
    maxHealth: STARTING_HEALTH,
    lastAttackAt: 0,
    followTargetId,
    defendPosition: null,
    currentTargetId: followTargetId,
    lastGatherAt: 0,
    gatherSpeed: STARTING_GATHER_SPEED,
    commandPriority: "autonomous",
  };
}

export function createResource(
  id: string,
  position: Position,
  options: CreateResourceOptions = {},
): ResourceEntity {
  const {
    maxDurability = STARTING_RESOURCE_DURABILITY,
    durability = maxDurability,
    quantity = STARTING_RESOURCE_QUANTITY,
    maxGatherers = STARTING_RESOURCE_MAX_GATHERERS,
    resourceType = DEFAULT_RESOURCE_TYPE,
  } = options;

  return {
    id,
    kind: "resource",
    resourceType,
    position,
    state: "idle",
    durability,
    maxDurability,
    quantity,
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

  if (durability > 0) {
    return {
      ...resource,
      durability,
    };
  }

  const quantity = Math.max(0, resource.quantity - 1);

  return {
    ...resource,
    durability: quantity > 0 ? resource.maxDurability : 0,
    quantity,
    isDepleted: quantity <= 0,
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
  return entity?.kind === "companion";
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
  const distance = Math.hypot(xDistance, yDistance);

  if (distance <= MOVEMENT_STEP_DISTANCE) {
    return target;
  }

  return {
    x: current.x + (xDistance / distance) * MOVEMENT_STEP_DISTANCE,
    y: current.y + (yDistance / distance) * MOVEMENT_STEP_DISTANCE,
  };
}
