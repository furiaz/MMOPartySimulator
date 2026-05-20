import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isLivingCompanion, isTargetDummyEnemy } from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import { getCompanionDerivedStats, syncCompanionDerivedMaxHealth } from "./stats";
import { addCombatFeedback, updateEntity, type GameState } from "./state";

const HEALTH_REGEN_INTERVAL_MS = 5000;
const TARGET_DUMMY_REGEN_INTERVAL_MS = 5000;
const TARGET_DUMMY_REGEN_AMOUNT = 10;

export function syncPartyDerivedMaxHealth(state: GameState): GameState {
  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    const syncedMember = syncCompanionDerivedMaxHealth(member);

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
  const lastRegenAtByEnemyId = {
    ...(state.lastTargetDummyRegenAtByEnemyId ?? {}),
  };
  let nextState: GameState = {
    ...state,
    lastTargetDummyRegenAtByEnemyId: lastRegenAtByEnemyId,
  };

  for (const entity of Object.values(nextState.entities)) {
    if (!isTargetDummyEnemy(entity)) {
      continue;
    }

    const lastRegenAt = lastRegenAtByEnemyId[entity.id];

    if (lastRegenAt === undefined) {
      lastRegenAtByEnemyId[entity.id] = now;
      continue;
    }

    if (now - lastRegenAt < TARGET_DUMMY_REGEN_INTERVAL_MS) {
      continue;
    }

    lastRegenAtByEnemyId[entity.id] = now;

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

  return nextState;
}

export function updatePassiveHealthRegen(
  state: GameState,
  now: number,
): GameState {
  const lastRegenAtByCompanionId = {
    ...(state.lastHealthRegenAtByCompanionId ?? {}),
  };
  let nextState: GameState = {
    ...state,
    lastHealthRegenAtByCompanionId: lastRegenAtByCompanionId,
  };

  for (const member of getPartyMembers(nextState)) {
    const lastRegenAt = lastRegenAtByCompanionId[member.id];

    if (lastRegenAt === undefined) {
      lastRegenAtByCompanionId[member.id] = now;
      continue;
    }

    if (now - lastRegenAt < HEALTH_REGEN_INTERVAL_MS) {
      continue;
    }

    lastRegenAtByCompanionId[member.id] = now;

    if (!isLivingCompanion(member) || member.health >= member.maxHealth) {
      continue;
    }

    const amount = getCompanionDerivedStats(member).healthRegen;
    const nextHealth = Math.min(member.maxHealth, member.health + amount);
    const healedAmount = nextHealth - member.health;

    if (healedAmount <= 0) {
      continue;
    }

    const healedMember = {
      ...member,
      health: nextHealth,
    };

    nextState = updateEntity(nextState, healedMember);
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
      nextHealth,
    });
  }

  return nextState;
}
