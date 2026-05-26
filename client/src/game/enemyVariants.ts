import type {
  DebugMapId,
  Enemy,
  EnemyVariant,
  GameEntity,
  GameMap,
  Position,
} from "./types";

export const SUPERIOR_ENEMY_CHANCE = 0.02;
export const SUPERIOR_ENEMY_RENDER_SCALE = 1.8;
export const SUPERIOR_ENEMY_XP_MULTIPLIER = 2;

const SUPERIOR_ENEMY_MAX_HEALTH_MULTIPLIER = 2.5;
const SUPERIOR_ENEMY_ATTACK_MULTIPLIER = 1.5;
const SUPERIOR_ENEMY_DEFENSE_MULTIPLIER = 1.25;
const SUPERIOR_ENEMY_MAGIC_DEFENSE_MULTIPLIER = 1.25;
const SUPERIOR_MIDDLE_BAND_START = 0.4;
const SUPERIOR_MIDDLE_BAND_END = 0.6;

type SuperiorRollOptions = {
  currentMapId?: DebugMapId;
  map?: GameMap;
  position: Position;
  subzoneId?: string;
  existingEntities: Record<string, GameEntity>;
  random?: () => number;
};

export function isSuperiorEnemy(enemy: Enemy): boolean {
  return enemy.variant === "superior";
}

export function applyEnemyVariantStats(enemy: Enemy): Enemy {
  if (!isSuperiorEnemy(enemy)) {
    return {
      ...enemy,
      variant: undefined,
    };
  }

  const maxHealth = multiplyStat(
    enemy.maxHealth,
    SUPERIOR_ENEMY_MAX_HEALTH_MULTIPLIER,
  );

  return {
    ...enemy,
    health: maxHealth,
    maxHealth,
    attack: multiplyStat(enemy.attack, SUPERIOR_ENEMY_ATTACK_MULTIPLIER),
    defense: multiplyStat(enemy.defense, SUPERIOR_ENEMY_DEFENSE_MULTIPLIER),
    magicDefense: multiplyStat(
      enemy.magicDefense,
      SUPERIOR_ENEMY_MAGIC_DEFENSE_MULTIPLIER,
    ),
  };
}

export function rollEnemyVariantForSpawn({
  currentMapId,
  map,
  position,
  subzoneId,
  existingEntities,
  random = Math.random,
}: SuperiorRollOptions): EnemyVariant | undefined {
  if (
    !isEligibleForSuperiorRoll({
      currentMapId,
      map,
      position,
      subzoneId,
      existingEntities,
    })
  ) {
    return undefined;
  }

  return random() < SUPERIOR_ENEMY_CHANCE ? "superior" : undefined;
}

export function isInSuperiorBlockedMiddleBand(
  position: Position,
  map: GameMap,
): boolean {
  return (
    position.y >= map.rows * SUPERIOR_MIDDLE_BAND_START &&
    position.y <= map.rows * SUPERIOR_MIDDLE_BAND_END
  );
}

function isEligibleForSuperiorRoll({
  currentMapId,
  map,
  position,
  subzoneId,
  existingEntities,
}: Omit<SuperiorRollOptions, "random">): boolean {
  return (
    currentMapId !== undefined &&
    currentMapId !== "hub" &&
    map !== undefined &&
    subzoneId !== undefined &&
    !isInSuperiorBlockedMiddleBand(position, map) &&
    !hasLivingSuperiorInSubzone(existingEntities, subzoneId)
  );
}

function hasLivingSuperiorInSubzone(
  entities: Record<string, GameEntity>,
  subzoneId: string,
): boolean {
  return Object.values(entities).some(
    (entity) =>
      entity.kind === "enemy" &&
      entity.state !== "dead" &&
      entity.health > 0 &&
      entity.subzoneId === subzoneId &&
      isSuperiorEnemy(entity),
  );
}

function multiplyStat(value: number, multiplier: number): number {
  return Math.round(value * multiplier);
}
