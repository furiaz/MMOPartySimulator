import { getEnemyCombatStyle } from "./enemyArchetypes";
import type {
  CombatProjectileVisualProfileId,
  Companion,
  Enemy,
} from "./types";

export const BASIC_PROJECTILE_SPEED = 12;
export const BASIC_PROJECTILE_IMPACT_RADIUS = 0.3;

export type CombatProjectileProfile = {
  visualProfileId: CombatProjectileVisualProfileId;
  speed: number;
  impactRadius: number;
};

export function getCompanionBasicProjectileProfile(
  companion: Companion,
): CombatProjectileProfile | null {
  if (companion.classId !== "hunter") {
    return null;
  }

  return {
    visualProfileId: "hunter_arrow",
    speed: BASIC_PROJECTILE_SPEED,
    impactRadius: BASIC_PROJECTILE_IMPACT_RADIUS,
  };
}

export function getEnemyBasicProjectileProfile(
  enemy: Enemy,
): CombatProjectileProfile | null {
  if (getEnemyCombatStyle(enemy) !== "ranged") {
    return null;
  }

  return {
    visualProfileId: getEnemyProjectileVisualProfileId(enemy),
    speed: BASIC_PROJECTILE_SPEED,
    impactRadius: BASIC_PROJECTILE_IMPACT_RADIUS,
  };
}

function getEnemyProjectileVisualProfileId(
  enemy: Enemy,
): CombatProjectileVisualProfileId {
  switch (enemy.enemyTypeId) {
    case "slimeward_spitter_slime":
      return "slime_spitter";
    case "goblin_thrower":
      return "goblin_thrower";
    case "ash_wisp":
      return "ash_wisp";
    case "bog_imp":
    default:
      return "bog_imp";
  }
}
