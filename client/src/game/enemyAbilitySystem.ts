import { isCombatEntity, setLastAttackAt } from "./entities";
import {
  ENEMY_ABILITY_DEFINITIONS,
  getEnemyAbilityDefinition,
  type EnemyAbilityDefinition,
  type EnemyAbilityCastPreparation,
  type EnemyAbilityRegistry,
  type EnemyAbilityResolution,
} from "./enemyAbilities";
import { resolveAoePattern } from "./aoePatterns";
import { getEnemyCombatBodyRadius, getEnemyType } from "./enemyArchetypes";
import { isEnemyEntity } from "./entityGuards";
import { getEuclideanDistance } from "./positionUtils";
import { isEnemyBound } from "./skillRuntime";
import { getEntityById, updateEntity, type GameState } from "./state";
import {
  hasActiveStatusEffect,
  isFakeDeathActive,
  isSkillUseBlockedByStatus,
} from "./statusEffects";
import type {
  CombatEntity,
  Enemy,
  EnemyAbilityCastState,
  EnemyAbilityCooldownState,
  EnemyAbilityId,
  EnemyAbilityInterruptReason,
  GameEntity,
  Position,
} from "./types";

const DEFAULT_ENEMY_ATTACK_COOLDOWN_MS = 2000;

export function updateEnemyAbilitySystem(
  state: GameState,
  now = Date.now(),
  definitions: EnemyAbilityRegistry = ENEMY_ABILITY_DEFINITIONS,
): GameState {
  let nextState = clearExpiredEnemyAbilityCooldowns(state, now);

  for (const cast of Object.values(nextState.enemyAbilityCastsByEnemyId ?? {})) {
    nextState = updateActiveEnemyAbilityCast(nextState, cast, now, definitions);
  }

  for (const entity of Object.values(nextState.entities)) {
    if (!isEnemyEntity(entity)) {
      continue;
    }

    nextState = maybeStartEnemyAbility(nextState, entity.id, now, definitions);
  }

  return nextState;
}

export function isEnemyAbilityCasting(state: GameState, enemyId: string): boolean {
  return Boolean(state.enemyAbilityCastsByEnemyId?.[enemyId]);
}

export function isEnemyAbilityBusy(state: GameState, enemyId: string): boolean {
  return Boolean(
    state.enemyAbilityCastsByEnemyId?.[enemyId] ||
      state.enemyDashesByEnemyId?.[enemyId],
  );
}

export function isEnemyBasicAttackRequired(
  state: GameState,
  enemyId: string,
): boolean {
  return state.enemyAbilityBasicAttackRequiredByEnemyId?.[enemyId] === true;
}

export function recordEnemyBasicAttackCommitted(
  state: GameState,
  enemyId: string,
): GameState {
  if (!isEnemyBasicAttackRequired(state, enemyId)) {
    return state;
  }

  const enemyAbilityBasicAttackRequiredByEnemyId = {
    ...(state.enemyAbilityBasicAttackRequiredByEnemyId ?? {}),
  };
  delete enemyAbilityBasicAttackRequiredByEnemyId[enemyId];

  return {
    ...state,
    enemyAbilityBasicAttackRequiredByEnemyId,
  };
}

export function cancelEnemyAbilityCast(
  state: GameState,
  enemyId: string,
  _reason: EnemyAbilityInterruptReason,
  now = Date.now(),
): GameState {
  if (!state.enemyAbilityCastsByEnemyId?.[enemyId]) {
    return state;
  }

  const enemyAbilityCastsByEnemyId = {
    ...state.enemyAbilityCastsByEnemyId,
  };
  delete enemyAbilityCastsByEnemyId[enemyId];

  const caster = getEntityById(state, enemyId);
  const nextState = {
    ...state,
    enemyAbilityCastsByEnemyId,
  };

  return isEnemyEntity(caster) && caster.state !== "dead" && caster.health > 0
    ? updateEntity(nextState, setLastAttackAt(caster, now))
    : nextState;
}

export function clearEnemyAbilityRuntimeForEnemy(
  state: GameState,
  enemyId: string,
): GameState {
  const enemyAbilityCastsByEnemyId = { ...(state.enemyAbilityCastsByEnemyId ?? {}) };
  const enemyAbilityCooldownsByEnemyId = {
    ...(state.enemyAbilityCooldownsByEnemyId ?? {}),
  };
  const enemyAbilityBasicAttackRequiredByEnemyId = {
    ...(state.enemyAbilityBasicAttackRequiredByEnemyId ?? {}),
  };
  const enemyDashesByEnemyId = { ...(state.enemyDashesByEnemyId ?? {}) };
  delete enemyAbilityCastsByEnemyId[enemyId];
  delete enemyAbilityCooldownsByEnemyId[enemyId];
  delete enemyAbilityBasicAttackRequiredByEnemyId[enemyId];
  delete enemyDashesByEnemyId[enemyId];

  return {
    ...state,
    enemyAbilityCastsByEnemyId,
    enemyAbilityCooldownsByEnemyId,
    enemyAbilityBasicAttackRequiredByEnemyId,
    enemyDashesByEnemyId,
  };
}

export function sanitizeEnemyAbilityRuntimeForSave(
  state: GameState,
  entities: Record<string, GameEntity>,
  now = Date.now(),
  definitions: EnemyAbilityRegistry = ENEMY_ABILITY_DEFINITIONS,
): Pick<
  GameState,
  | "enemyAbilityCastsByEnemyId"
  | "enemyAbilityCooldownsByEnemyId"
  | "enemyAbilityBasicAttackRequiredByEnemyId"
  | "enemyDashesByEnemyId"
> {
  const enemyAbilityCooldownsByEnemyId: NonNullable<
    GameState["enemyAbilityCooldownsByEnemyId"]
  > = {};

  for (const [enemyId, cooldowns] of Object.entries(
    state.enemyAbilityCooldownsByEnemyId ?? {},
  )) {
    const enemy = entities[enemyId];

    if (!isEnemyEntity(enemy) || !isRecord(cooldowns)) {
      continue;
    }

    const configuredAbilityIds = getEnemyType(enemy.enemyTypeId)?.abilityIds ?? [];
    const validCooldowns: Record<string, EnemyAbilityCooldownState> = {};

    for (const [abilityId, cooldown] of Object.entries(cooldowns)) {
      if (
        !configuredAbilityIds.includes(abilityId) ||
        !getEnemyAbilityDefinition(abilityId, definitions) ||
        !isValidCooldown(cooldown, enemyId, abilityId, now)
      ) {
        continue;
      }

      validCooldowns[abilityId] = cooldown;
    }

    if (Object.keys(validCooldowns).length > 0) {
      enemyAbilityCooldownsByEnemyId[enemyId] = validCooldowns;
    }
  }

  const enemyAbilityBasicAttackRequiredByEnemyId: Record<string, true> = {};

  for (const [enemyId, isRequired] of Object.entries(
    state.enemyAbilityBasicAttackRequiredByEnemyId ?? {},
  )) {
    const enemy = entities[enemyId];
    const configuredAbilityIds = isEnemyEntity(enemy)
      ? getEnemyType(enemy.enemyTypeId)?.abilityIds ?? []
      : [];
    const hasKnownAbility = configuredAbilityIds.some((abilityId) =>
      Boolean(getEnemyAbilityDefinition(abilityId, definitions)),
    );

    if (isRequired === true && isEnemyEntity(enemy) && hasKnownAbility) {
      enemyAbilityBasicAttackRequiredByEnemyId[enemyId] = true;
    }
  }

  return {
    enemyAbilityCastsByEnemyId: {},
    enemyAbilityCooldownsByEnemyId,
    enemyAbilityBasicAttackRequiredByEnemyId,
    enemyDashesByEnemyId: {},
  };
}

function updateActiveEnemyAbilityCast(
  state: GameState,
  cast: EnemyAbilityCastState,
  now: number,
  definitions: EnemyAbilityRegistry,
): GameState {
  const caster = getEntityById(state, cast.casterId);

  if (!caster) {
    return clearEnemyAbilityRuntimeForEnemy(state, cast.casterId);
  }

  if (!isEnemyEntity(caster) || caster.state === "dead" || caster.health <= 0) {
    return cancelEnemyAbilityCast(state, cast.casterId, "caster_dead", now);
  }

  const interruptionReason = getCasterInterruptionReason(state, caster);

  if (interruptionReason) {
    return cancelEnemyAbilityCast(state, cast.casterId, interruptionReason, now);
  }

  const target = getEntityById(state, cast.targetId);

  if (!isCombatEntity(target)) {
    return cancelEnemyAbilityCast(state, cast.casterId, "target_missing", now);
  }

  const targetInterruptionReason = getTargetInterruptionReason(state, target);

  if (targetInterruptionReason) {
    return cancelEnemyAbilityCast(
      state,
      cast.casterId,
      targetInterruptionReason,
      now,
    );
  }

  const definition = getEnemyAbilityDefinition(cast.abilityId, definitions);

  if (!definition) {
    return cancelEnemyAbilityCast(state, cast.casterId, "unknown_ability", now);
  }

  if (!definition.resolve) {
    return cancelEnemyAbilityCast(state, cast.casterId, "missing_resolver", now);
  }

  if (now < cast.castEndsAt) {
    return updateCastPhase(state, cast, "casting");
  }

  if (now < cast.windupEndsAt) {
    return updateCastPhase(state, cast, "windup");
  }

  return resolveEnemyAbility(state, caster, target, cast, definition, now);
}

function maybeStartEnemyAbility(
  state: GameState,
  enemyId: string,
  now: number,
  definitions: EnemyAbilityRegistry,
): GameState {
  const enemy = getEntityById(state, enemyId);

  if (!isEnemyEntity(enemy) || !canEnemyStartAbility(state, enemy, now)) {
    return state;
  }

  const target = enemy.currentTargetId
    ? getEntityById(state, enemy.currentTargetId)
    : undefined;

  if (!isLivingAbilityTarget(state, target)) {
    return state;
  }

  for (const abilityId of getEnemyType(enemy.enemyTypeId)?.abilityIds ?? []) {
    const definition = getEnemyAbilityDefinition(abilityId, definitions);

    if (
      !definition ||
      !definition.resolve ||
      isEnemyAbilityOnCooldown(state, enemy.id, abilityId, now) ||
      !isInAbilityRange(enemy, target, definition.range) ||
      (definition.canStart &&
        !definition.canStart({
          state,
          caster: enemy,
          target,
          definition,
          now,
        }))
    ) {
      continue;
    }

    const origin = { ...enemy.position };
    const targetPosition = { ...target.position };
    const direction = getNormalizedDirection(origin, targetPosition);
    const area = definition.aoePattern
      ? resolveAoePattern(definition.aoePattern, { origin, direction })
      : undefined;
    const preparation = definition.prepareCast?.({
      state,
      caster: enemy,
      target,
      definition,
      now,
      origin,
      targetPosition,
      direction,
      area,
    });

    if (definition.prepareCast && !preparation) {
      continue;
    }

    return startEnemyAbility(
      state,
      enemy,
      target,
      definition,
      now,
      origin,
      targetPosition,
      direction,
      preparation ?? { area },
    );
  }

  return state;
}

function canEnemyStartAbility(state: GameState, enemy: Enemy, now: number): boolean {
  return (
    enemy.state === "attack" &&
    enemy.health > 0 &&
    enemy.currentTargetId !== null &&
    now - enemy.lastAttackAt >=
      (enemy.attackCooldownMs ?? DEFAULT_ENEMY_ATTACK_COOLDOWN_MS) &&
    enemy.attackWindupStartedAt === undefined &&
    enemy.attackWindupDurationMs === undefined &&
    !enemy.attackWindupTargetId &&
    !isEnemyAbilityBusy(state, enemy.id) &&
    !state.enemyAoeChannelsByCasterId?.[enemy.id] &&
    !isEnemyBasicAttackRequired(state, enemy.id) &&
    !isEnemyBound(state, enemy) &&
    !isSkillUseBlockedByStatus(state, enemy.id) &&
    !hasActiveStatusEffect(state, enemy.id, "taunted")
  );
}

function startEnemyAbility(
  state: GameState,
  caster: Enemy,
  target: CombatEntity,
  definition: EnemyAbilityDefinition,
  now: number,
  origin: Position,
  targetPosition: Position,
  direction: Position,
  preparation: EnemyAbilityCastPreparation,
): GameState {
  const castDurationMs = Math.max(0, definition.castDurationMs);
  const windupDurationMs = Math.max(0, definition.windupDurationMs ?? 0);
  const area = preparation.area;
  const cast: EnemyAbilityCastState = {
    id: `${caster.id}:${definition.id}:${now}`,
    abilityId: definition.id,
    casterId: caster.id,
    targetId: target.id,
    phase: "casting",
    startedAt: now,
    castEndsAt: now + castDurationMs,
    windupEndsAt: now + castDurationMs + windupDurationMs,
    origin,
    targetPosition,
    direction,
    area,
    visualIntent: area ? definition.aoeVisualIntent : undefined,
    dashPlan: preparation.dashPlan,
  };
  const cooldown: EnemyAbilityCooldownState = {
    abilityId: definition.id,
    casterId: caster.id,
    startedAt: now,
    expiresAt: now + Math.max(0, definition.cooldownMs),
  };

  return {
    ...state,
    enemyAbilityCastsByEnemyId: {
      ...(state.enemyAbilityCastsByEnemyId ?? {}),
      [caster.id]: cast,
    },
    enemyAbilityCooldownsByEnemyId: {
      ...(state.enemyAbilityCooldownsByEnemyId ?? {}),
      [caster.id]: {
        ...(state.enemyAbilityCooldownsByEnemyId?.[caster.id] ?? {}),
        [definition.id]: cooldown,
      },
    },
    enemyAbilityBasicAttackRequiredByEnemyId: {
      ...(state.enemyAbilityBasicAttackRequiredByEnemyId ?? {}),
      [caster.id]: true,
    },
  };
}

function resolveEnemyAbility(
  state: GameState,
  caster: Enemy,
  target: CombatEntity,
  cast: EnemyAbilityCastState,
  definition: EnemyAbilityDefinition,
  now: number,
): GameState {
  const enemyAbilityCastsByEnemyId = {
    ...(state.enemyAbilityCastsByEnemyId ?? {}),
  };
  delete enemyAbilityCastsByEnemyId[caster.id];
  const stateWithoutCast = {
    ...state,
    enemyAbilityCastsByEnemyId,
  };
  const resolution: EnemyAbilityResolution = definition.resolve?.({
    state: stateWithoutCast,
    caster,
    target,
    cast,
    definition,
    now,
  }) ?? stateWithoutCast;
  const isDeferred = resolution.enemyAbilityActionCompletion === "deferred";
  const resolvedState = { ...resolution };
  delete resolvedState.enemyAbilityActionCompletion;

  if (isDeferred) {
    return resolvedState;
  }
  const currentCaster = getEntityById(resolvedState, caster.id);

  return isEnemyEntity(currentCaster)
    ? updateEntity(resolvedState, setLastAttackAt(currentCaster, now))
    : resolvedState;
}

function updateCastPhase(
  state: GameState,
  cast: EnemyAbilityCastState,
  phase: EnemyAbilityCastState["phase"],
): GameState {
  if (cast.phase === phase) {
    return state;
  }

  return {
    ...state,
    enemyAbilityCastsByEnemyId: {
      ...(state.enemyAbilityCastsByEnemyId ?? {}),
      [cast.casterId]: {
        ...cast,
        phase,
      },
    },
  };
}

function getCasterInterruptionReason(
  state: GameState,
  caster: Enemy,
): EnemyAbilityInterruptReason | null {
  if (hasActiveStatusEffect(state, caster.id, "taunted")) {
    return "taunted";
  }

  if (hasActiveStatusEffect(state, caster.id, "incapacitated")) {
    return "incapacitated";
  }

  if (hasActiveStatusEffect(state, caster.id, "silenced")) {
    return "silenced";
  }

  return isEnemyBound(state, caster) ? "bound" : null;
}

function getTargetInterruptionReason(
  state: GameState,
  target: GameEntity | undefined,
): EnemyAbilityInterruptReason | null {
  if (!target || !isCombatEntity(target)) {
    return "target_missing";
  }

  if (target.state === "dead" || target.health <= 0) {
    return "target_dead";
  }

  if (target.kind === "companion" && isFakeDeathActive(state, target.id)) {
    return "target_fake_death";
  }

  return null;
}

function isLivingAbilityTarget(
  state: GameState,
  target: GameEntity | undefined,
): target is CombatEntity {
  return getTargetInterruptionReason(state, target) === null;
}

function isInAbilityRange(
  caster: Enemy,
  target: CombatEntity,
  range: number,
): boolean {
  const targetBodyRadius = target.kind === "enemy"
    ? getEnemyCombatBodyRadius(target)
    : 0;

  return getEuclideanDistance(caster.position, target.position) <=
    Math.max(0, range) + getEnemyCombatBodyRadius(caster) + targetBodyRadius;
}

function isEnemyAbilityOnCooldown(
  state: GameState,
  enemyId: string,
  abilityId: EnemyAbilityId,
  now: number,
): boolean {
  return (state.enemyAbilityCooldownsByEnemyId?.[enemyId]?.[abilityId]?.expiresAt ?? 0) > now;
}

function clearExpiredEnemyAbilityCooldowns(
  state: GameState,
  now: number,
): GameState {
  const currentCooldowns = state.enemyAbilityCooldownsByEnemyId;

  if (!currentCooldowns) {
    return state;
  }

  let didChange = false;
  const enemyAbilityCooldownsByEnemyId: NonNullable<
    GameState["enemyAbilityCooldownsByEnemyId"]
  > = {};

  for (const [enemyId, cooldowns] of Object.entries(currentCooldowns)) {
    const activeCooldowns = Object.fromEntries(
      Object.entries(cooldowns).filter(([, cooldown]) => cooldown.expiresAt > now),
    );

    if (Object.keys(activeCooldowns).length > 0) {
      enemyAbilityCooldownsByEnemyId[enemyId] = activeCooldowns;
    }

    didChange ||= Object.keys(activeCooldowns).length !== Object.keys(cooldowns).length;
  }

  return didChange
    ? {
        ...state,
        enemyAbilityCooldownsByEnemyId,
      }
    : state;
}

function getNormalizedDirection(origin: Position, target: Position): Position {
  const x = target.x - origin.x;
  const y = target.y - origin.y;
  const length = Math.hypot(x, y);

  return length > 0
    ? { x: x / length, y: y / length }
    : { x: 1, y: 0 };
}

function isValidCooldown(
  value: unknown,
  enemyId: string,
  abilityId: string,
  now: number,
): value is EnemyAbilityCooldownState {
  return (
    isRecord(value) &&
    value.casterId === enemyId &&
    value.abilityId === abilityId &&
    typeof value.startedAt === "number" &&
    Number.isFinite(value.startedAt) &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > now &&
    value.startedAt <= value.expiresAt
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
