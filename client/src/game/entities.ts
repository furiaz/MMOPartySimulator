import type {
  AutonomousEntity,
  ClassId,
  CombatEntity,
  Companion,
  Enemy,
  EnemyAggressionMode,
  EnemyArchetypeId,
  EnemyTypeId,
  EnemyVariant,
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
import {
  createEmptyCompanionConsumableBuffs,
  createEmptyCompanionConsumables,
  createDefaultCompanionConsumableBehavior,
} from "./consumables";
import { createDefaultCompanionSkillBehavior } from "./skillBehavior";
import { createAssignedRoleBonusState } from "./roleBonus";
import { getEnemyArchetype, getEnemyType } from "./enemyArchetypes";
import { getScaledEnemyStats } from "./enemyScaling";
import { applyEnemyVariantStats } from "./enemyVariants";
import {
  createDefaultNaturalCompanionStats,
  createEmptyAllocatedCompanionStats,
  syncCompanionDerivedMaxHealth,
} from "./stats";

export const MOVEMENT_SPEED_PER_SECOND = 0.91;
export const ENEMY_MOVEMENT_SPEED_PER_SECOND = 1.16;
export const COMPANION_MOVEMENT_SPEED_PER_SECOND = 8;
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
const TARGET_DUMMY_MAX_HEALTH = 100;
const TARGET_DUMMY_REWARD_XP = 0;

type CreateResourceOptions = {
  durability?: number;
  maxDurability?: number;
  quantity?: number;
  maxGatherers?: number;
  resourceType?: ResourceType;
  tier?: LootTier;
};

type CreateEnemyOptions = {
  isTargetDummy?: true;
  archetypeId?: EnemyArchetypeId;
  enemyTypeId?: EnemyTypeId;
  level?: number;
  xpReward?: number;
  maxHealth?: number;
  attack?: number;
  defense?: number;
  magicDefense?: number;
  evasion?: number;
  variant?: EnemyVariant;
  attackCooldownMs?: number;
  attackRange?: number;
  combatBodyRadius?: number;
  subzoneId?: string;
  encounterAreaId?: string;
  questSpawn?: Enemy["questSpawn"];
};

export function createEnemy(
  id: string,
  position: Position,
  aggressionMode?: EnemyAggressionMode,
  options: CreateEnemyOptions = {},
): Enemy {
  const enemyType = getEnemyType(options.enemyTypeId);
  const archetypeId = options.archetypeId ?? enemyType?.archetypeId;
  const archetype = getEnemyArchetype(archetypeId);
  const level = options.level ?? enemyType?.level ?? STARTING_ENEMY_LEVEL;
  const scaledStats = getScaledEnemyStats(level, archetypeId);
  const maxHealth = options.maxHealth ?? scaledStats.maxHealth;
  const scalingOverrides = getEnemyScalingOverrides(options);

  return applyEnemyVariantStats({
    id,
    kind: "enemy",
    position,
    state: "idle",
    health: maxHealth,
    maxHealth,
    lastAttackAt: 0,
    currentTargetId: null,
    aggressionMode:
      aggressionMode ??
      enemyType?.temperament ??
      archetype?.defaultTemperament ??
      "passive",
    variant: options.variant,
    isTargetDummy: options.isTargetDummy,
    archetypeId,
    enemyTypeId: options.enemyTypeId,
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
    attackCooldownMs: options.attackCooldownMs ?? enemyType?.attackCooldownMs,
    attackRange:
      options.attackRange ??
      enemyType?.attackRange ??
      archetype?.defaultAttackRange,
    combatBodyRadius: options.combatBodyRadius ?? enemyType?.combatBodyRadius ?? 0,
    questSpawn: options.questSpawn,
  });
}

export function createTargetDummy(id: string, position: Position): Enemy {
  return createEnemy(id, position, "passive", {
    isTargetDummy: true,
    maxHealth: TARGET_DUMMY_MAX_HEALTH,
    xpReward: TARGET_DUMMY_REWARD_XP,
    attack: 0,
    defense: 0,
    magicDefense: 0,
    evasion: 0,
    combatBodyRadius: 0.7,
  });
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
    consumables: createEmptyCompanionConsumables(),
    consumableBuffs: createEmptyCompanionConsumableBuffs(),
    consumableBehavior: createDefaultCompanionConsumableBehavior(),
    skillBehavior: createDefaultCompanionSkillBehavior(),
    roleBonus: createAssignedRoleBonusState(role),
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
  const resourceQuantity = Math.max(0, quantity);
  const resourceMaxDurability = Math.max(0, maxDurability);
  const resourceDurability =
    resourceQuantity <= 0 ? 0 : Math.max(0, durability);

  return {
    id,
    kind: "resource",
    resourceType,
    tier,
    position,
    state: "idle",
    durability: resourceDurability,
    maxDurability: resourceMaxDurability,
    quantity: resourceQuantity,
    maxGatherers,
    isDepleted: resourceQuantity <= 0,
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
  const minimumHealth = entity.kind === "enemy" && entity.isTargetDummy ? 1 : 0;
  const health = Math.max(minimumHealth, entity.health - damage);

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
  const currentQuantity = Math.max(0, resource.quantity);

  if (currentQuantity <= 0 || resource.isDepleted) {
    return {
      ...resource,
      durability: 0,
      quantity: 0,
      isDepleted: true,
    };
  }

  const durability = Math.max(0, resource.durability - Math.max(0, gatherAmount));

  if (durability > 0) {
    return {
      ...resource,
      durability,
      quantity: currentQuantity,
      isDepleted: false,
    };
  }

  const quantity = Math.max(0, currentQuantity - 1);

  return {
    ...resource,
    durability: quantity > 0 ? Math.max(0, resource.maxDurability) : 0,
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

  if (usesCompanionMovementSpeed(entity)) {
    return COMPANION_MOVEMENT_SPEED_PER_SECOND * deltaSeconds;
  }

  if (entity.kind === "enemy") {
    return ENEMY_MOVEMENT_SPEED_PER_SECOND * deltaSeconds;
  }

  return MOVEMENT_SPEED_PER_SECOND * deltaSeconds;
}

function usesCompanionMovementSpeed(entity: GameEntity): boolean {
  return (
    entity.kind === "companion" ||
    (entity.kind === "npc" && entity.npcRole === "quest_guide")
  );
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

  if (options.variant === "superior") {
    overrides.push("superior");
  }

  return overrides;
}
