import { isPositionInsideAoe } from "./aoePatterns";
import type { GameState } from "./state";
import { launchCombatProjectile } from "./combatProjectileSystem";
import { isLivingEnemy, isTargetDummyEnemy } from "./entityGuards";
import { applyStatusEffect } from "./statusEffects";
import { prepareEnemyDash, startEnemyDash } from "./enemyDashSystem";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { startForcedMovement } from "./forcedMovement";
import { getEnemyAttackRange, getEnemyCombatBodyRadius } from "./enemyArchetypes";
import { getWarmasterPower } from "./warmasterState";
import { hasTerrainLineOfSight } from "./movementPlanning";
import { isFakeDeathActive } from "./statusEffects";
import type {
  AoePattern,
  AoeVisualIntent,
  CombatEntity,
  Enemy,
  EnemyAbilityCastState,
  EnemyAbilityId,
  EnemyDashPlan,
  ResolvedAoeArea,
} from "./types";

export const TIN_CRAWLER_DEFENSE_AURA_ABILITY_ID =
  "tin_crawler_defense_aura";
export const ORC_SHIELDBEARER_DEFENSE_AURA_ABILITY_ID =
  "orc_shieldbearer_defense_aura";
export const FORTIFYING_AURA_STATUS_SOURCE_KEY = "fortifying_aura";
export const NIGHT_BAT_RENDING_DASH_ABILITY_ID = "night_bat_rending_dash";
export const ORC_RAIDER_RENDING_DASH_ABILITY_ID = "orc_raider_rending_dash";

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

export type EnemyAbilityCastPreparationContext = EnemyAbilityStartContext & {
  origin: CombatEntity["position"];
  targetPosition: CombatEntity["position"];
  direction: CombatEntity["position"];
  area?: ResolvedAoeArea;
};

export type EnemyAbilityCastPreparation = {
  area?: ResolvedAoeArea;
  dashPlan?: EnemyDashPlan;
};

export type EnemyAbilityResolution = GameState & {
  enemyAbilityActionCompletion?: "deferred";
};

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
  prepareCast?: (
    context: EnemyAbilityCastPreparationContext,
  ) => EnemyAbilityCastPreparation | null;
  resolve?: (context: EnemyAbilityResolutionContext) => EnemyAbilityResolution;
};

export type EnemyAbilityRegistry = Readonly<
  Record<EnemyAbilityId, EnemyAbilityDefinition | undefined>
>;

export const ENEMY_ABILITY_DEFINITIONS: EnemyAbilityRegistry = {
  orc_warmaster_rending_dash: {
    ...createRendingDashDefinition({
      id: "orc_warmaster_rending_dash",
      range: 7.5,
      pattern: { type: "rectangle", rows: 5, columns: 2 },
      fullDistance: 7.5,
      castDurationMs: 900,
      windupDurationMs: 200,
      movementDurationMs: 350,
      powerMultiplier: 1.5,
      cooldownMs: 10000,
    }),
    canStart: ({ state, caster }) => state.warmasterAttempt?.bossId === caster.id,
  },
  orc_warmaster_patron_cleave: createPatronAreaAbility({
    id: "orc_warmaster_patron_cleave",
    displayName: "Patron Cleave",
    aoePattern: { type: "cone", range: 6, angleRadians: Math.PI / 2 },
    range: 6,
    castDurationMs: 1200,
    windupDurationMs: 300,
    cooldownMs: 12000,
  }, { minimumPower: 5, powerMultiplier: 1.5 }),
  orc_warmaster_patron_burst: createPatronAreaAbility({
    id: "orc_warmaster_patron_burst",
    displayName: "Patron Burst",
    aoePattern: { type: "circle", radius: 4 },
    range: 4,
    castDurationMs: 1500,
    windupDurationMs: 500,
    cooldownMs: 20000,
  }, { minimumPower: 10, powerMultiplier: 2 }),
  orc_warmaster_kick: {
    id: "orc_warmaster_kick",
    displayName: "Kick",
    range: 1,
    castDurationMs: 600,
    windupDurationMs: 200,
    cooldownMs: 8000,
    canStart: ({ state, caster }) => state.warmasterAttempt?.bossId === caster.id,
    resolve: ({ state, caster, target, cast, now }) => {
      const direction = { x: target.position.x - cast.origin.x, y: target.position.y - cast.origin.y };
      const distance = Math.hypot(direction.x, direction.y);
      if (distance > getEnemyAttackRange(caster) + getEnemyCombatBodyRadius(caster) ||
          !hasTerrainLineOfSight(state, cast.origin, target.position)) return state;
      const result = resolveAndApplyCombatDamage(state, caster, target, {
        damageType: "physical", powerMultiplier: 1,
        allowEvasion: true, allowPassiveBlock: true, label: "Kick", now,
      });
      return result.evaded || result.target.health <= 0 ? result.state : startForcedMovement(
        result.state, target.id, caster.id, distance > 0 ? direction : cast.direction, 4, 250, now,
      );
    },
  },
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
  [NIGHT_BAT_RENDING_DASH_ABILITY_ID]: createRendingDashDefinition({
    id: NIGHT_BAT_RENDING_DASH_ABILITY_ID,
    range: 6,
    pattern: { type: "line", squareCount: 4 },
    fullDistance: 6,
    castDurationMs: 650,
    windupDurationMs: 150,
    movementDurationMs: 250,
    powerMultiplier: 1.25,
    cooldownMs: 8000,
  }),
  [ORC_RAIDER_RENDING_DASH_ABILITY_ID]: createRendingDashDefinition({
    id: ORC_RAIDER_RENDING_DASH_ABILITY_ID,
    range: 7.5,
    pattern: { type: "rectangle", rows: 5, columns: 2 },
    fullDistance: 7.5,
    castDurationMs: 900,
    windupDurationMs: 200,
    movementDurationMs: 350,
    powerMultiplier: 1.5,
    cooldownMs: 10000,
  }),
};

function createPatronAreaAbility(
  definition: Omit<EnemyAbilityDefinition, "resolve">,
  config: { minimumPower: number; powerMultiplier: number },
): EnemyAbilityDefinition {
  return {
    ...definition,
    aoeVisualIntent: "enemyOffensive",
    canStart: ({ state, caster }) => state.warmasterAttempt?.bossId === caster.id &&
      getWarmasterPower(state, caster.id) >= config.minimumPower,
    prepareCast: ({ area, target }) => area && isPositionInsideAoe(area, target.position) ? { area } : null,
    resolve: ({ state, caster, cast, now }) => {
      if (!cast.area) return state;
      let next = state;
      for (const member of Object.values(state.entities)) {
        const target = next.entities[member.id];
        if (target?.kind !== "companion" || target.health <= 0 || target.state === "dead" ||
            isFakeDeathActive(next, target.id) || !isPositionInsideAoe(cast.area, target.position)) continue;
        next = resolveAndApplyCombatDamage(next, caster, target, {
          damageType: "physical", powerMultiplier: config.powerMultiplier,
          allowEvasion: true, allowPassiveBlock: true, label: definition.displayName, now,
        }).state;
      }
      return next;
    },
  };
}

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
    (definition.prepareCast !== undefined &&
      typeof definition.prepareCast !== "function") ||
    (definition.aoeVisualIntent !== undefined &&
      !isAoeVisualIntent(definition.aoeVisualIntent)) ||
    (definition.aoeVisualIntent !== undefined && !definition.aoePattern)
  ) {
    return undefined;
  }

  return definition;
}

type RendingDashConfig = {
  id: EnemyAbilityId;
  range: number;
  pattern: AoePattern;
  fullDistance: number;
  castDurationMs: number;
  windupDurationMs: number;
  movementDurationMs: number;
  powerMultiplier: number;
  cooldownMs: number;
};

function createRendingDashDefinition(
  config: RendingDashConfig,
): EnemyAbilityDefinition {
  return {
    id: config.id,
    displayName: "Rending Dash",
    range: config.range,
    cooldownMs: config.cooldownMs,
    castDurationMs: config.castDurationMs,
    windupDurationMs: config.windupDurationMs,
    aoePattern: config.pattern,
    aoeVisualIntent: "enemyOffensive",
    prepareCast: ({ state, caster, target, area }) => {
      if (!area) {
        return null;
      }

      const preparation = prepareEnemyDash(
        state,
        caster,
        target,
        area,
        config.fullDistance,
        config.movementDurationMs,
      );

      return preparation
        ? { area: preparation.area, dashPlan: preparation.dashPlan }
        : null;
    },
    resolve: ({ state, caster, cast, now }) => ({
      ...startEnemyDash(state, caster, cast, config.powerMultiplier, now),
      enemyAbilityActionCompletion: "deferred",
    }),
  };
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
