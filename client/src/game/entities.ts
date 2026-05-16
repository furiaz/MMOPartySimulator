import type {
  AutonomousEntity,
  ClassId,
  CombatEntity,
  Companion,
  Enemy,
  EnemyAggressionMode,
  EnemyArchetypeId,
  EnemyType,
  EntityState,
  GameEntity,
  LootTier,
  NpcEntity,
  PartyMemberRole,
  Position,
  ResourceEntity,
  ResourceType,
} from "./types";
import { GAME_LOOP_TICK_MS } from "./simulationTiming";
import { createEmptyCompanionEquipment } from "./equipmentTypes";
import { getEnemyArchetype } from "./enemyArchetypes";
import { getScaledEnemyStats } from "./enemyScaling";
import {
  createDefaultNaturalCompanionStats,
  createEmptyAllocatedCompanionStats,
  syncCompanionDerivedMaxHealth,
} from "./stats";

export const MOVEMENT_SPEED_PER_SECOND = 0.91;
export const ENEMY_MOVEMENT_SPEED_PER_SECOND = 1.16;
export const COMPANION_MOVEMENT_SPEED_PER_SECOND = 2;
export const MOVEMENT_STEP_DISTANCE =
  MOVEMENT_SPEED_PER_SECOND * (GAME_LOOP_TICK_MS / 1000);
export const ENEMY_MOVEMENT_STEP_DISTANCE =
  ENEMY_MOVEMENT_SPEED_PER_SECOND * (GAME_LOOP_TICK_MS / 1000);
export const COMPANION_MOVEMENT_STEP_DISTANCE =
  COMPANION_MOVEMENT_SPEED_PER_SECOND * (GAME_LOOP_TICK_MS / 1000);
const STARTING_HEALTH = 10;
const STARTING_GATHER_SPEED = 1;
const STARTING_RESOURCE_DURABILITY = 5;
const STARTING_RESOURCE_QUANTITY = 3;
const STARTING_RESOURCE_MAX_GATHERERS = 4;
const DEFAULT_RESOURCE_TYPE: ResourceType = "wood";
const STARTING_CHARACTER_LEVEL = 1;
const STARTING_CHARACTER_XP = 0;
const STARTING_ENEMY_LEVEL = 1;

type CreateResourceOptions = {
  durability?: number;
  maxDurability?: number;
  quantity?: number;
  maxGatherers?: number;
  resourceType?: ResourceType;
  tier?: LootTier;
};

type CreateEnemyOptions = {
  archetypeId?: EnemyArchetypeId;
  level?: number;
  xpReward?: number;
  maxHealth?: number;
  attack?: number;
  defense?: number;
  magicDefense?: number;
  evasion?: number;
  attackCooldownMs?: number;
  attackRange?: number;
  enemyType?: EnemyType;
  subzoneId?: string;
  encounterAreaId?: string;
};

export function createEnemy(
  id: string,
  position: Position,
  aggressionMode?: EnemyAggressionMode,
  options: CreateEnemyOptions = {},
): Enemy {
  const archetype = getEnemyArchetype(options.archetypeId);
  const level = options.level ?? archetype?.level ?? STARTING_ENEMY_LEVEL;
  const scaledStats = getScaledEnemyStats(level, options.archetypeId);
  const maxHealth = options.maxHealth ?? scaledStats.maxHealth;
  const scalingOverrides = getEnemyScalingOverrides(options);

  return {
    id,
    kind: "enemy",
    position,
    state: "idle",
    health: maxHealth,
    maxHealth,
    lastAttackAt: 0,
    currentTargetId: null,
    aggressionMode: aggressionMode ?? archetype?.temperament ?? "passive",
    archetypeId: options.archetypeId,
    enemyType: options.enemyType,
    homePosition: position,
    subzoneId: options.subzoneId,
    encounterAreaId: options.encounterAreaId,
    level,
    xpReward: options.xpReward,
    attack: options.attack ?? scaledStats.attack,
    defense: options.defense ?? scaledStats.defense,
    magicDefense: options.magicDefense ?? scaledStats.magicDefense,
    evasion: options.evasion ?? scaledStats.evasion,
    effectiveScalingLevel: scaledStats.effectiveLevel,
    scalingBand: scaledStats.scalingBand,
    threat: scaledStats.threat,
    scalingOverrides,
    attackCooldownMs: options.attackCooldownMs ?? archetype?.attackCooldownMs,
    attackRange: options.attackRange ?? archetype?.attackRange,
  };
}

export function createCompanion(
  id: string,
  position: Position,
  followTargetId: string,
  role: PartyMemberRole = "none",
  partyOrder = 1,
  classId: ClassId = "beginner",
): Companion {
  return syncCompanionDerivedMaxHealth({
    id,
    kind: "companion",
    classId,
    characterLevel: STARTING_CHARACTER_LEVEL,
    characterXp: STARTING_CHARACTER_XP,
    lastCharacterXpGained: 0,
    naturalStats: createDefaultNaturalCompanionStats(),
    allocatedStats: createEmptyAllocatedCompanionStats(),
    unspentStatPoints: 0,
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
    equipment: createEmptyCompanionEquipment(),
  });
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
    tier = 1,
  } = options;

  return {
    id,
    kind: "resource",
    resourceType,
    tier,
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
  deltaMs = GAME_LOOP_TICK_MS,
): T {
  return moveEntityTo(
    entity,
    stepToward(entity.position, target.position, getMovementStepDistance(entity, deltaMs)),
  );
}

export function createNpc(
  id: string,
  position: Position,
  displayName: string,
  npcRole: NpcEntity["npcRole"],
): NpcEntity {
  return {
    id,
    kind: "npc",
    position,
    state: "idle",
    displayName,
    npcRole,
  };
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

export function getMovementStepDistance(
  entity: GameEntity,
  deltaMs = GAME_LOOP_TICK_MS,
): number {
  const deltaSeconds = deltaMs / 1000;

  if (entity.kind === "companion") {
    return COMPANION_MOVEMENT_SPEED_PER_SECOND * deltaSeconds;
  }

  if (entity.kind === "enemy") {
    return ENEMY_MOVEMENT_SPEED_PER_SECOND * deltaSeconds;
  }

  return MOVEMENT_SPEED_PER_SECOND * deltaSeconds;
}

function stepToward(
  current: Position,
  target: Position,
  stepDistance: number,
): Position {
  const xDistance = target.x - current.x;
  const yDistance = target.y - current.y;
  const distance = Math.hypot(xDistance, yDistance);

  if (distance <= stepDistance) {
    return target;
  }

  return {
    x: current.x + (xDistance / distance) * stepDistance,
    y: current.y + (yDistance / distance) * stepDistance,
  };
}

function getEnemyScalingOverrides(options: CreateEnemyOptions): string[] {
  const overrides: string[] = [];

  if (options.maxHealth !== undefined) {
    overrides.push("maxHealth");
  }

  if (options.attack !== undefined) {
    overrides.push("attack");
  }

  if (options.defense !== undefined) {
    overrides.push("defense");
  }

  if (options.magicDefense !== undefined) {
    overrides.push("magicDefense");
  }

  if (options.evasion !== undefined) {
    overrides.push("evasion");
  }

  return overrides;
}
