import type { GameState } from "./state";
import { launchCombatProjectile } from "./combatProjectileSystem";
import type {
  CombatEntity,
  Enemy,
  EnemyAbilityCastState,
  EnemyAbilityId,
} from "./types";

export type EnemyAbilityResolutionContext = {
  state: GameState;
  caster: Enemy;
  target: CombatEntity;
  cast: EnemyAbilityCastState;
  definition: EnemyAbilityDefinition;
  now: number;
};

export type EnemyAbilityDefinition = {
  id: EnemyAbilityId;
  displayName: string;
  range: number;
  cooldownMs: number;
  castDurationMs: number;
  windupDurationMs?: number;
  resolve?: (context: EnemyAbilityResolutionContext) => GameState;
};

export type EnemyAbilityRegistry = Readonly<
  Record<EnemyAbilityId, EnemyAbilityDefinition | undefined>
>;

export const ENEMY_ABILITY_DEFINITIONS: EnemyAbilityRegistry = {
  fire_bolt: {
    id: "fire_bolt",
    displayName: "Fire Bolt",
    range: 5,
    cooldownMs: 6000,
    castDurationMs: 900,
    windupDurationMs: 300,
    resolve: ({ state, caster, target, cast, definition, now }) =>
      launchCombatProjectile(
        state,
        caster,
        target,
        {
          damageType: "magic",
          powerMultiplier: 1.5,
          visualProfileId: "enemy_fire_bolt",
          speed: 8,
          impactRadius: 0.35,
        },
        now,
        {
          impactLabel: definition.displayName,
          origin: cast.origin,
        },
      ),
  },
};

export function getEnemyAbilityDefinition(
  abilityId: EnemyAbilityId,
  definitions: EnemyAbilityRegistry = ENEMY_ABILITY_DEFINITIONS,
): EnemyAbilityDefinition | undefined {
  const definition = definitions[abilityId];

  if (
    !definition ||
    definition.id !== abilityId ||
    typeof definition.displayName !== "string" ||
    definition.displayName.trim().length === 0 ||
    !isNonNegativeFiniteNumber(definition.range) ||
    !isNonNegativeFiniteNumber(definition.cooldownMs) ||
    !isNonNegativeFiniteNumber(definition.castDurationMs) ||
    (definition.windupDurationMs !== undefined &&
      !isNonNegativeFiniteNumber(definition.windupDurationMs))
  ) {
    return undefined;
  }

  return definition;
}

function isNonNegativeFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
