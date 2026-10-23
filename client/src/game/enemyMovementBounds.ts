import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import type { GameState } from "./state";
import type { Enemy, Position } from "./types";
export function getEnemyMovementBodyRadius(enemy: Enemy): number {
  return Math.max(getEnemyCombatBodyRadius(enemy), enemy.minimumMovementBodyRadius ?? 0);
}
export function isInsideEnemyMovementBounds(enemy: Enemy, position: Position, radius = 0): boolean {
  const bounds = enemy.movementBounds;
  return !bounds || (position.x - radius >= bounds.minX && position.x + radius <= bounds.maxX && position.y - radius >= bounds.minY && position.y + radius <= bounds.maxY);
}
export function isEnemyMovementPositionAllowed(state: GameState, enemy: Enemy, position: Position): boolean {
  if (!enemy.movementBounds && !enemy.minimumMovementBodyRadius)
    return true;
  const radius = getEnemyMovementBodyRadius(enemy) + 0.05;
  if (!isInsideEnemyMovementBounds(enemy, position, radius))
    return false;
  return ![...(state.map?.walls ?? []), ...(state.map?.collisionWalls ?? [])].some(wall => {
    const dx = Math.max(0, Math.abs(position.x - wall.x) - 0.5);
    const dy = Math.max(0, Math.abs(position.y - wall.y) - 0.5);
    return Math.hypot(dx, dy) < radius;
  });
}
