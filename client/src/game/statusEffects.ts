import { damageEntity } from "./entities";
import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getEuclideanDistance } from "./positionUtils";
import { addCombatFeedback, updateEntity, type GameState } from "./state";
import type {
  CombatDamageType,
  CombatEntity,
  StatusEffectType,
} from "./types";

export const POISON_TICK_INTERVAL_MS = 2000;
export const POISON_MAX_DURATION_MULTIPLIER = 3;
export const BURNING_TICK_INTERVAL_MS = POISON_TICK_INTERVAL_MS;
export const BURNING_MAX_DURATION_MULTIPLIER = POISON_MAX_DURATION_MULTIPLIER;
export const BLEED_TICK_INTERVAL_MS = 1000;
export const BLEED_MAX_DURATION_MULTIPLIER = POISON_MAX_DURATION_MULTIPLIER;

export type ApplyStatusEffectInput =
  | {
      type:
        | "immobilized"
        | "taunted"
        | "incapacitated"
        | "disarmed"
        | "silenced"
        | "fakeDeath"
        | "forcedEvasion";
      targetId: string;
      durationMs: number;
      sourceId?: string;
      sourceKey?: string;
    }
  | {
      type: "nextAttackDamageBonus";
      targetId: string;
      durationMs: number;
      damageMultiplierBonus: number;
      sourceId?: string;
      sourceKey?: string;
      damageTypes?: CombatDamageType[];
    }
  | {
      type: "poison" | "burning" | "bleed";
      targetId: string;
      durationMs: number;
      tickDamage: number;
      sourceKey: string;
      sourceId?: string;
      tickIntervalMs?: number;
      maxDurationMs?: number;
    }
  | {
      type: "defenseBuff";
      targetId: string;
      durationMs: number;
      defenseBonusPercent: number;
      sourceId?: string;
      sourceKey?: string;
    };

export type StatusEffectRemovalFilter = {
  targetId?: string;
  sourceId?: string;
  sourceKey?: string;
  type?: StatusEffectType;
};

export function applyStatusEffect(
  state: GameState,
  input: ApplyStatusEffectInput,
  now: number,
): GameState {
  const target = state.entities[input.targetId];

  if (
    !target ||
    target.state === "dead" ||
    ("health" in target && target.health <= 0)
  ) {
    return state;
  }

  if (
    input.type === "poison" ||
    input.type === "burning" ||
    input.type === "bleed"
  ) {
    return applyDotStatusEffect(state, input, now);
  }

  const statusEffectsById = { ...(state.statusEffectsById ?? {}) };
  const id = createStatusEffectId(input.targetId, input.type, input.sourceKey ?? input.sourceId);
  const baseStatus = {
    id,
    targetId: input.targetId,
    sourceId: input.sourceId,
    sourceKey: input.sourceKey,
    appliedAt: now,
    expiresAt: now + Math.max(0, input.durationMs),
  };

  if (input.type === "nextAttackDamageBonus") {
    statusEffectsById[id] = {
      ...baseStatus,
      type: "nextAttackDamageBonus",
      damageMultiplierBonus: input.damageMultiplierBonus,
      damageTypes: input.damageTypes,
    };
  } else if (input.type === "defenseBuff") {
    statusEffectsById[id] = {
      ...baseStatus,
      type: "defenseBuff",
      defenseBonusPercent: input.defenseBonusPercent,
    };
  } else {
    statusEffectsById[id] = {
      ...baseStatus,
      type: input.type,
    };
  }

  return {
    ...state,
    statusEffectsById,
  };
}

export function removeStatusEffects(
  state: GameState,
  filter: StatusEffectRemovalFilter,
): GameState {
  const statusEffectsById = state.statusEffectsById;

  if (!statusEffectsById) {
    return state;
  }

  let didRemove = false;
  const entries = Object.entries(statusEffectsById).filter(([, status]) => {
    const shouldRemove =
      (!filter.targetId || status.targetId === filter.targetId) &&
      (!filter.sourceId || status.sourceId === filter.sourceId) &&
      (!filter.sourceKey || status.sourceKey === filter.sourceKey) &&
      (!filter.type || status.type === filter.type);

    didRemove ||= shouldRemove;
    return !shouldRemove;
  });

  return didRemove
    ? {
        ...state,
        statusEffectsById: Object.fromEntries(entries),
      }
    : state;
}

export function clearStatusEffectsForEntity(
  state: GameState,
  entityId: string,
): GameState {
  return removeStatusEffects(state, { targetId: entityId });
}

export function isMovementBlockedByStatus(
  state: GameState,
  entityId: string,
): boolean {
  return hasActiveStatus(state, entityId, ["immobilized", "incapacitated"]);
}

export function isAttackBlockedByStatus(
  state: GameState,
  entityId: string,
): boolean {
  return hasActiveStatus(state, entityId, ["incapacitated", "disarmed"]);
}

export function isSkillUseBlockedByStatus(
  state: GameState,
  entityId: string,
): boolean {
  return hasActiveStatus(state, entityId, ["incapacitated", "silenced"]);
}

export function isGatherBlockedByStatus(
  state: GameState,
  entityId: string,
): boolean {
  return hasActiveStatus(state, entityId, ["incapacitated"]);
}

export function isFakeDeathActive(state: GameState, entityId: string): boolean {
  return hasActiveStatus(state, entityId, ["fakeDeath"]);
}

export function getStatusDefenseBonusPercent(
  state: GameState,
  entityId: string,
): number {
  return Object.values(state.statusEffectsById ?? {}).reduce(
    (total, status) =>
      status.targetId === entityId && status.type === "defenseBuff"
        ? total + status.defenseBonusPercent
        : total,
    0,
  );
}

export function consumeForcedEvasionStatus(
  state: GameState,
  entityId: string,
): { state: GameState; consumed: boolean } {
  const status = Object.values(state.statusEffectsById ?? {}).find(
    (candidate) =>
      candidate.targetId === entityId && candidate.type === "forcedEvasion",
  );

  if (!status) {
    return { state, consumed: false };
  }

  const statusEffectsById = { ...(state.statusEffectsById ?? {}) };
  delete statusEffectsById[status.id];

  return {
    state: {
      ...state,
      statusEffectsById,
    },
    consumed: true,
  };
}

export function consumeNextAttackDamageBonus(
  state: GameState,
  attackerId: string,
  damageType: CombatDamageType,
): { state: GameState; damageMultiplierBonus: number } {
  const statusEffectsById = { ...(state.statusEffectsById ?? {}) };
  let damageMultiplierBonus = 0;
  let didConsume = false;

  for (const status of Object.values(state.statusEffectsById ?? {})) {
    if (
      status.targetId !== attackerId ||
      status.type !== "nextAttackDamageBonus" ||
      (status.damageTypes && !status.damageTypes.includes(damageType))
    ) {
      continue;
    }

    damageMultiplierBonus += status.damageMultiplierBonus;
    delete statusEffectsById[status.id];
    didConsume = true;
  }

  if (!didConsume) {
    return { state, damageMultiplierBonus: 0 };
  }

  return {
    state: {
      ...state,
      statusEffectsById,
    },
    damageMultiplierBonus,
  };
}

export function updateStatusEffects(
  state: GameState,
  now: number,
): GameState {
  let nextState = state;
  let statusEffectsById = { ...(nextState.statusEffectsById ?? {}) };

  for (const status of Object.values(statusEffectsById)) {
    const target = nextState.entities[status.targetId];

    if (
      !target ||
      target.state === "dead" ||
      ("health" in target && target.health <= 0)
    ) {
      delete statusEffectsById[status.id];
      continue;
    }

    if (
      status.type !== "poison" &&
      status.type !== "burning" &&
      status.type !== "bleed"
    ) {
      if (status.expiresAt <= now) {
        nextState = releaseExpiredTaunt(nextState, status, statusEffectsById, now);
        delete statusEffectsById[status.id];
      }
      continue;
    }

    let nextTickAt = status.nextTickAt;
    let totalDotDamage = 0;

    while (nextTickAt <= now && nextTickAt <= status.expiresAt) {
      totalDotDamage += status.tickDamage;
      nextTickAt += status.tickIntervalMs;
    }

    if (totalDotDamage > 0 && isCombatEntity(target)) {
      const dotDamage = Math.max(1, Math.round(totalDotDamage));
      const damagedTarget = damageEntity(target, dotDamage);
      nextState = updateEntity(nextState, damagedTarget);
      nextState = addCombatFeedback(nextState, {
        type: "damage",
        entityId: target.id,
        sourceEntityId: status.sourceId,
        targetEntityId: target.id,
        damageType: status.type === "bleed" ? "physical" : "magic",
        dotStatusType: status.type,
        feedbackKind: "damage",
        amount: dotDamage,
        text: `-${dotDamage}`,
        now,
      });

      if (damagedTarget.state === "dead" || damagedTarget.health <= 0) {
        nextState = clearStatusEffectsForEntity(
          {
            ...nextState,
            statusEffectsById,
          },
          damagedTarget.id,
        );
        statusEffectsById = { ...(nextState.statusEffectsById ?? {}) };
        continue;
      }
    }

    if (status.expiresAt <= now) {
      delete statusEffectsById[status.id];
    } else {
      statusEffectsById[status.id] = {
        ...status,
        nextTickAt,
      };
    }
  }

  return {
    ...nextState,
    statusEffectsById,
  };
}

function releaseExpiredTaunt(
  state: GameState,
  status: {
    id: string;
    type: StatusEffectType;
    targetId: string;
    sourceId?: string;
  },
  statusEffectsById: Record<
    string,
    {
      id: string;
      type: StatusEffectType;
      targetId: string;
      sourceId?: string;
      expiresAt: number;
    }
  >,
  now: number,
): GameState {
  if (status.type !== "taunted" || !status.sourceId) {
    return state;
  }

  const hasNewerTauntFromSameSource = Object.values(statusEffectsById).some(
    (candidate) =>
      candidate.id !== status.id &&
      candidate.type === "taunted" &&
      candidate.targetId === status.targetId &&
      candidate.sourceId === status.sourceId &&
      candidate.expiresAt > now,
  );

  if (hasNewerTauntFromSameSource) {
    return state;
  }

  const target = state.entities[status.targetId];

  if (
    !isLivingEnemy(target) ||
    target.currentTargetId !== status.sourceId
  ) {
    return state;
  }

  return updateEntity(state, {
    ...target,
    state: "idle",
    currentTargetId: null,
  });
}

export function dropAggroFromTarget(
  state: GameState,
  targetId: string,
): GameState {
  let nextState = state;
  const fallbackTargets = Object.values(state.entities).filter(
    (entity) => isLivingCompanion(entity) && entity.id !== targetId,
  );

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "enemy" || entity.currentTargetId !== targetId) {
      continue;
    }

    const replacementTarget = fallbackTargets
      .filter((candidate) => candidate.id !== entity.id)
      .sort((first, second) => {
        return (
          getEuclideanDistance(entity.position, first.position) -
            getEuclideanDistance(entity.position, second.position) ||
          first.id.localeCompare(second.id)
        );
      })[0];

    nextState = updateEntity(nextState, {
      ...entity,
      state: replacementTarget ? "attack" : "idle",
      currentTargetId: replacementTarget?.id ?? null,
    });
  }

  return nextState;
}

function applyDotStatusEffect(
  state: GameState,
  input: Extract<ApplyStatusEffectInput, { type: "poison" | "burning" | "bleed" }>,
  now: number,
): GameState {
  const statusEffectsById = { ...(state.statusEffectsById ?? {}) };
  const id = createStatusEffectId(input.targetId, input.type, input.sourceKey);
  const tickIntervalMs =
    input.tickIntervalMs ??
    getDefaultDotTickIntervalMs(input.type);
  const baseDurationMs = Math.max(0, input.durationMs);
  const maxDurationMs =
    input.maxDurationMs ??
    baseDurationMs * getDefaultDotMaxDurationMultiplier(input.type);
  const existing = statusEffectsById[id];

  if (existing?.type === input.type) {
    statusEffectsById[id] = {
      ...existing,
      sourceId: input.sourceId,
      expiresAt: Math.min(existing.expiresAt + baseDurationMs, now + maxDurationMs),
      tickDamage: Math.max(existing.tickDamage, input.tickDamage),
      tickIntervalMs,
      baseDurationMs,
      maxDurationMs,
      nextTickAt:
        existing.nextTickAt > now ? existing.nextTickAt : now + tickIntervalMs,
    };
  } else {
    statusEffectsById[id] = {
      id,
      type: input.type,
      targetId: input.targetId,
      sourceId: input.sourceId,
      sourceKey: input.sourceKey,
      appliedAt: now,
      expiresAt: now + baseDurationMs,
      tickDamage: input.tickDamage,
      tickIntervalMs,
      nextTickAt: now + tickIntervalMs,
      baseDurationMs,
      maxDurationMs,
    };
  }

  return {
    ...state,
    statusEffectsById,
  };
}

function getDefaultDotTickIntervalMs(type: "poison" | "burning" | "bleed"): number {
  if (type === "burning") {
    return BURNING_TICK_INTERVAL_MS;
  }

  return type === "bleed" ? BLEED_TICK_INTERVAL_MS : POISON_TICK_INTERVAL_MS;
}

function getDefaultDotMaxDurationMultiplier(
  type: "poison" | "burning" | "bleed",
): number {
  if (type === "burning") {
    return BURNING_MAX_DURATION_MULTIPLIER;
  }

  return type === "bleed"
    ? BLEED_MAX_DURATION_MULTIPLIER
    : POISON_MAX_DURATION_MULTIPLIER;
}

function hasActiveStatus(
  state: GameState,
  entityId: string,
  types: StatusEffectType[],
): boolean {
  return Object.values(state.statusEffectsById ?? {}).some(
    (status) => status.targetId === entityId && types.includes(status.type),
  );
}

function createStatusEffectId(
  targetId: string,
  type: StatusEffectType,
  sourceKey?: string,
): string {
  return `${targetId}-${type}-${sourceKey ?? "status"}`;
}

function isCombatEntity(entity: unknown): entity is CombatEntity {
  return Boolean(
    entity &&
      typeof entity === "object" &&
      "kind" in entity &&
      ((entity as CombatEntity).kind === "companion" ||
        (entity as CombatEntity).kind === "enemy"),
  );
}
