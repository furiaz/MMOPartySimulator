import { isSuperiorEnemy } from "./enemyVariants";
import type { Enemy } from "./types";

export function getDirectEnemyKillCredit(enemy: Enemy): number {
  return isSuperiorEnemy(enemy) ? 2 : 1;
}
