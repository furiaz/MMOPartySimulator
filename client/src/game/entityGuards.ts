import { isCombatEntity, isResourceEntity } from "./entities";
import type {
  Companion,
  Enemy,
  GameEntity,
  ResourceEntity,
} from "./types";

export function isCompanionEntity(
  entity: GameEntity | undefined,
): entity is Companion {
  return entity?.kind === "companion";
}

export function isEnemyEntity(
  entity: GameEntity | undefined,
): entity is Enemy {
  return entity?.kind === "enemy";
}

export function isTargetDummyEnemy(
  entity: GameEntity | undefined,
): entity is Enemy & { isTargetDummy: true } {
  return Boolean(isEnemyEntity(entity) && entity.isTargetDummy);
}

export function isResourceGameEntity(
  entity: GameEntity | undefined,
): entity is ResourceEntity {
  return Boolean(entity && isResourceEntity(entity));
}

export function isLivingCompanion(
  entity: GameEntity | undefined,
): entity is Companion {
  return Boolean(
    isCompanionEntity(entity) &&
      isCombatEntity(entity) &&
      entity.state !== "dead" &&
      entity.health > 0,
  );
}

export function isLivingEnemy(
  entity: GameEntity | undefined,
): entity is Enemy {
  return Boolean(
    isEnemyEntity(entity) &&
      isCombatEntity(entity) &&
      entity.state !== "dead" &&
      entity.health > 0,
  );
}

export function isActiveResource(
  entity: GameEntity | undefined,
): entity is ResourceEntity {
  return Boolean(
    isResourceGameEntity(entity) &&
      !entity.isDepleted &&
      entity.quantity > 0,
  );
}
