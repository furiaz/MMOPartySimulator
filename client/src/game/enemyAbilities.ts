import type { GameState } from "./state";
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
  range: number;
  cooldownMs: number;
  castDurationMs: number;
  windupDurationMs?: number;
  resolve?: (context: EnemyAbilityResolutionContext) => GameState;
};

export type EnemyAbilityRegistry = Readonly<
  Record<EnemyAbilityId, EnemyAbilityDefinition | undefined>
>;

export const ENEMY_ABILITY_DEFINITIONS: EnemyAbilityRegistry = {};

export function getEnemyAbilityDefinition(
  abilityId: EnemyAbilityId,
  definitions: EnemyAbilityRegistry = ENEMY_ABILITY_DEFINITIONS,
): EnemyAbilityDefinition | undefined {
  const definition = definitions[abilityId];

  if (
    !definition ||
    definition.id !== abilityId ||
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
