import { getEnemyArchetype, getEnemyType } from "./game/enemyArchetypes";
import type { PoiConsideration } from "./game/questTypes";
import type { GameEntity } from "./game/types";

export function getPoiDisplayName(
  target: PoiConsideration,
  entities: Record<string, GameEntity>,
): string {
  if (target.category !== "combat") {
    return target.poiId;
  }

  const targetEntityId = target.targetEntityId ?? target.poiId;
  const targetEntity = entities[targetEntityId];

  if (!targetEntity || targetEntity.kind !== "enemy") {
    return "Enemy";
  }

  const enemyType = getEnemyType(targetEntity.enemyTypeId);
  const archetype = getEnemyArchetype(
    targetEntity.archetypeId ?? enemyType?.archetypeId,
  );

  return archetype?.displayName ?? enemyType?.displayName ?? "Enemy";
}
