import { isPositionInsideAoe } from "./aoePatterns";
import type { GameState } from "./state";
import { launchCombatProjectile } from "./combatProjectileSystem";
import { isLivingEnemy, isTargetDummyEnemy } from "./entityGuards";
import { applyStatusEffect } from "./statusEffects";
import type {
  AoePattern,
  AoeVisualIntent,
  CombatEntity,
  Enemy,
  EnemyAbilityCastState,
  EnemyAbilityId,
} from "./types";

export const TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID =
  "tin_crawler_defense_aura";
export const ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID =
  "orc_shieldbearer_defense_aura";
export const FORTIFYING_AURA_STATUS_SOURCE_KEY = "fortifying_aura";

const FORTIFYING_AURA_ABILITY_IDS = new Set<EnemyAbilityId>([
  TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID,
  ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID,
]);

export type EnemyAbilityResolutionContext = {
  state: GameState;
  caster: Enemy;
  target: CombatEntity;
  cast: EnemyAbilityCastState;
  definition: EnemyAbilityDefinition;
  now: number;
};

export type EnemyAbilityStartContext = Omit<
  EnemyAbilityResolutionContext,
  "cast"
>;

export type EnemyAbilityDefinition = {
  id: EnemyAbilityId;
  displayName: string;
  range: number;
  cooldownMs: number;
  castDurationMs: number;
  windupDurationMs?: number;
  aoePattern?: AoePattern;
  aoeVisualIntent?: AoeVisualIntent;
  canStart?: (context: EnemyAbilityStartContext) => boolean;
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
  [TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID]: createFortifyingAuraDefinition({
    id: TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID,
    range: 6,
    radius: 5,
    defenseBonusPercent: 50,
    castDurationMs: 800,
    windupDurationMs: 200,
    buffDurationMs: 8000,
    cooldownMs: 14000,
  }),
  [ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID]: createFortifyingAuraDefinition({
    id: ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID,
    range: 10,
    radius: 6,
    defenseBonusPercent: 75,
    castDurationMs: 1000,
    windupDurationMs: 250,
    buffDurationMs: 10000,
    cooldownMs: 16000,
  }),
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
      !isNonNegativeFiniteNumber(definition.windupDurationMs)) ||
    (definition.canStart !== undefined &&
      typeof definition.canStart !== "function") ||
    (definition.aoeVisualIntent !== undefined &&
      !isAoeVisualIntent(definition.aoeVisualIntent)) ||
    (definition.aoeVisualIntent !== undefined && !definition.aoePattern)
  ) {
    return undefined;
  }

  return definition;
}

type FortifyingAuraConfig = {
  id: EnemyAbilityId;
  range: number;
  radius: number;
  defenseBonusPercent: number;
  castDurationMs: number;
  windupDurationMs: number;
  buffDurationMs: number;
  cooldownMs: number;
};

function createFortifyingAuraDefinition(
  config: FortifyingAuraConfig,
): EnemyAbilityDefinition {
  return {
    id: config.id,
    displayName: "Fortifying Aura",
    range: config.range,
    cooldownMs: config.cooldownMs,
    castDurationMs: config.castDurationMs,
    windupDurationMs: config.windupDurationMs,
    aoePattern: { type: "circle", radius: config.radius },
    aoeVisualIntent: "enemySupportive",
    canStart: canStartFortifyingAura,
    resolve: ({ state, caster, cast, now }) => {
      if (!cast.area) {
        return state;
      }

      let nextState = state;

      for (const entity of Object.values(state.entities)) {
        if (
          !isLivingEnemy(entity) ||
          isTargetDummyEnemy(entity) ||
          !isPositionInsideAoe(cast.area, entity.position)
        ) {
          continue;
        }

        nextState = applyStatusEffect(
          nextState,
          {
            type: "defenseBuff",
            targetId: entity.id,
            durationMs: config.buffDurationMs,
            defenseBonusPercent: config.defenseBonusPercent,
            sourceId: caster.id,
            sourceKey: FORTIFYING_AURA_STATUS_SOURCE_KEY,
            endsWhenSourceDies: true,
          },
          now,
        );
      }

      return nextState;
    },
  };
}

function canStartFortifyingAura({
  state,
  caster,
  now,
}: EnemyAbilityStartContext): boolean {
  const isAlreadyFortified = Object.values(state.statusEffectsById ?? {}).some(
    (status) =>
      status.type === "defenseBuff" &&
      status.targetId === caster.id &&
      status.sourceKey === FORTIFYING_AURA_STATUS_SOURCE_KEY &&
      status.expiresAt > now,
  );

  if (isAlreadyFortified) {
    return false;
  }

  return !Object.values(state.enemyAbilityCastsByEnemyId ?? {}).some(
    (cast) =>
      cast.casterId !== caster.id &&
      FORTIFYING_AURA_ABILITY_IDS.has(cast.abilityId) &&
      cast.windupEndsAt > now &&
      Boolean(cast.area && isPositionInsideAoe(cast.area, caster.position)),
  );
}

function isAoeVisualIntent(value: AoeVisualIntent): boolean {
  return (
    value === "enemyOffensive" ||
    value === "enemySupportive" ||
    value === "partyOffensive" ||
    value === "partyHealing"
  );
}

function isNonNegativeFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
