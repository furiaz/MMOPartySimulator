import { getEuclideanDistance } from "./positionUtils";
import { resolveBasicAttackImpact } from "./combatBasicAttackResolution";
import { getEntityById, type GameState } from "./state";
import type {
  ActiveCombatProjectile,
  CombatEntity,
  CombatProjectileVisualProfileId,
  Position,
} from "./types";

export type CombatProjectileLaunchProfile = {
  visualProfileId: CombatProjectileVisualProfileId;
  speed: number;
  impactRadius: number;
};

export function launchBasicCombatProjectile(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  profile: CombatProjectileLaunchProfile,
  now: number,
): GameState {
  const projectiles = state.combatProjectiles ?? [];
  const projectile: ActiveCombatProjectile = {
    id: `${now}-${attacker.id}-${target.id}-${projectiles.length}`,
    sourceId: attacker.id,
    targetId: target.id,
    position: { ...attacker.position },
    targetFallbackPosition: { ...target.position },
    speed: profile.speed,
    impactRadius: profile.impactRadius,
    visualProfileId: profile.visualProfileId,
    launchedAt: now,
    damageType: "physical",
    powerMultiplier: 1,
  };

  return {
    ...state,
    combatProjectiles: [...projectiles, projectile],
  };
}

export function updateCombatProjectileSystem(
  state: GameState,
  now: number,
  deltaMs: number,
): GameState {
  const projectiles = state.combatProjectiles ?? [];

  if (projectiles.length === 0) {
    return state;
  }

  let nextState = state;
  const nextProjectiles: ActiveCombatProjectile[] = [];

  for (const projectile of projectiles) {
    const source = getEntityById(nextState, projectile.sourceId);
    const target = getEntityById(nextState, projectile.targetId);

    if (!isLiveCombatEntity(source) || !isLiveCombatEntity(target)) {
      continue;
    }

    const targetPosition = target.position;
    const distanceToTarget = getEuclideanDistance(
      projectile.position,
      targetPosition,
    );
    const travelDistance = projectile.speed * (deltaMs / 1000);

    if (distanceToTarget <= projectile.impactRadius + travelDistance) {
      const impactResult = resolveBasicAttackImpact(nextState, source, target, now);
      nextState = impactResult.state;
      continue;
    }

    nextProjectiles.push({
      ...projectile,
      position: moveToward(projectile.position, targetPosition, travelDistance),
      targetFallbackPosition: { ...targetPosition },
    });
  }

  return {
    ...nextState,
    combatProjectiles: nextProjectiles,
  };
}

function moveToward(
  position: Position,
  targetPosition: Position,
  distance: number,
): Position {
  const dx = targetPosition.x - position.x;
  const dy = targetPosition.y - position.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return position;
  }

  return {
    x: position.x + (dx / length) * distance,
    y: position.y + (dy / length) * distance,
  };
}

function isLiveCombatEntity(
  entity: ReturnType<typeof getEntityById>,
): entity is CombatEntity {
  return (
    Boolean(entity) &&
    (entity?.kind === "companion" || entity?.kind === "enemy") &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}
