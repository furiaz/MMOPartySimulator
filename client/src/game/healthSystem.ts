import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isLivingCompanion, isTargetDummyEnemy } from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import {
  getCompanionDerivedStatsWithPartyBuffs,
  syncCompanionDerivedMaxHealthWithPartyBuffs,
} from "./stats";
import { addCombatFeedback, updateEntity, type GameState } from "./state";
import { applyCompanionHealing } from "./skillRuntime";

const HEALTH_REGEN_INTERVAL_MS = 5000;
const TARGET_DUMMY_REGEN_INTERVAL_MS = 5000;
const TARGET_DUMMY_REGEN_AMOUNT = 10;

export function syncPartyDerivedMaxHealth(state: GameState): GameState {
  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    const syncedMember = syncCompanionDerivedMaxHealthWithPartyBuffs(
      nextState,
      member,
    );

    if (syncedMember === member) {
      continue;
    }

    nextState = updateEntity(nextState, syncedMember);
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "max_health_synced",
      entityId: member.id,
      previousMaxHealth: member.maxHealth,
      nextMaxHealth: syncedMember.maxHealth,
      previousHealth: member.health,
      nextHealth: syncedMember.health,
    });
  }

  return nextState;
}

export function updateTargetDummyHealthRegen(
  state: GameState,
  now: number,
): GameState {
  let nextState = state;
  let lastRegenAtByEnemyId = state.lastTargetDummyRegenAtByEnemyId;
  const validDummyIds = new Set<string>();

  for (const entity of Object.values(state.entities)) {
    if (!isTargetDummyEnemy(entity)) {
      continue;
    }

    validDummyIds.add(entity.id);
    const lastRegenAt = lastRegenAtByEnemyId?.[entity.id];

    if (lastRegenAt === undefined) {
      lastRegenAtByEnemyId = setTargetDummyRegenTimestamp(
        lastRegenAtByEnemyId,
        entity.id,
        now,
      );
      nextState = {
        ...nextState,
        lastTargetDummyRegenAtByEnemyId: lastRegenAtByEnemyId,
      };
      continue;
    }

    if (now - lastRegenAt < TARGET_DUMMY_REGEN_INTERVAL_MS) {
      continue;
    }

    lastRegenAtByEnemyId = setTargetDummyRegenTimestamp(
      lastRegenAtByEnemyId,
      entity.id,
      now,
    );
    nextState = {
      ...nextState,
      lastTargetDummyRegenAtByEnemyId: lastRegenAtByEnemyId,
    };

    if (entity.health >= entity.maxHealth) {
      continue;
    }

    const nextHealth = Math.min(
      entity.maxHealth,
      entity.health + TARGET_DUMMY_REGEN_AMOUNT,
    );
    const healedAmount = nextHealth - entity.health;

    if (healedAmount <= 0) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...entity,
      health: nextHealth,
    });
    nextState = addCombatFeedback(nextState, {
      type: "heal",
      entityId: entity.id,
      text: `+${healedAmount} HP`,
      now,
    });
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "health_regen",
      entityId: entity.id,
      healthRegenAmount: healedAmount,
      previousHealth: entity.health,
      nextHealth,
    });
  }

  nextState = removeStaleTargetDummyRegenTimestamps(nextState, validDummyIds);

  return nextState;
}

export function updatePassiveHealthRegen(
  state: GameState,
  now: number,
): GameState {
  let nextState = state;
  let lastRegenAtByCompanionId = state.lastHealthRegenAtByCompanionId;
  const validCompanionIds = new Set<string>();

  for (const member of getPartyMembers(state)) {
    validCompanionIds.add(member.id);
    const lastRegenAt = lastRegenAtByCompanionId?.[member.id];

    if (lastRegenAt === undefined) {
      lastRegenAtByCompanionId = setCompanionRegenTimestamp(
        lastRegenAtByCompanionId,
        member.id,
        now,
      );
      nextState = {
        ...nextState,
        lastHealthRegenAtByCompanionId: lastRegenAtByCompanionId,
      };
      continue;
    }

    if (now - lastRegenAt < HEALTH_REGEN_INTERVAL_MS) {
      continue;
    }

    lastRegenAtByCompanionId = setCompanionRegenTimestamp(
      lastRegenAtByCompanionId,
      member.id,
      now,
    );
    nextState = {
      ...nextState,
      lastHealthRegenAtByCompanionId: lastRegenAtByCompanionId,
    };

    if (!isLivingCompanion(member) || member.health >= member.maxHealth) {
      continue;
    }

    const amount = getCompanionDerivedStatsWithPartyBuffs(
      nextState,
      member,
    ).healthRegen;
    const healResult = applyCompanionHealing(nextState, member, amount, now, {
      feedback: false,
    });
    const healedAmount = healResult.healedAmount;

    if (healedAmount <= 0) {
      continue;
    }

    nextState = healResult.state;
    nextState = addCombatFeedback(nextState, {
      type: "heal",
      entityId: member.id,
      text: `+${healedAmount} HP`,
      now,
    });
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "health_regen",
      entityId: member.id,
      healthRegenAmount: healedAmount,
      previousHealth: member.health,
      nextHealth: healResult.target.health,
    });
  }

  nextState = removeStaleCompanionRegenTimestamps(nextState, validCompanionIds);

  return nextState;
}

function setCompanionRegenTimestamp(
  timestamps: Record<string, number> | undefined,
  companionId: string,
  now: number,
): Record<string, number> {
  if (timestamps?.[companionId] === now) {
    return timestamps;
  }

  return {
    ...(timestamps ?? {}),
    [companionId]: now,
  };
}

function setTargetDummyRegenTimestamp(
  timestamps: Record<string, number> | undefined,
  enemyId: string,
  now: number,
): Record<string, number> {
  if (timestamps?.[enemyId] === now) {
    return timestamps;
  }

  return {
    ...(timestamps ?? {}),
    [enemyId]: now,
  };
}

function removeStaleCompanionRegenTimestamps(
  state: GameState,
  validCompanionIds: Set<string>,
): GameState {
  return removeStaleRegenTimestamps(
    state,
    "lastHealthRegenAtByCompanionId",
    validCompanionIds,
  );
}

function removeStaleTargetDummyRegenTimestamps(
  state: GameState,
  validDummyIds: Set<string>,
): GameState {
  return removeStaleRegenTimestamps(
    state,
    "lastTargetDummyRegenAtByEnemyId",
    validDummyIds,
  );
}

function removeStaleRegenTimestamps<
  TKey extends "lastHealthRegenAtByCompanionId" | "lastTargetDummyRegenAtByEnemyId",
>(state: GameState, key: TKey, validIds: Set<string>): GameState {
  const timestamps = state[key];

  if (!timestamps) {
    return state;
  }

  let nextTimestamps: Record<string, number> | null = null;

  for (const id of Object.keys(timestamps)) {
    if (validIds.has(id)) {
      continue;
    }

    nextTimestamps ??= { ...timestamps };
    delete nextTimestamps[id];
  }

  if (!nextTimestamps) {
    return state;
  }

  return {
    ...state,
    [key]: nextTimestamps,
  };
}
