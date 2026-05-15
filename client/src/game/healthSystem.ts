import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isLivingCompanion } from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import { getCompanionDerivedStats, syncCompanionDerivedMaxHealth } from "./stats";
import { addCombatFeedback, updateEntity, type GameState } from "./state";

const HEALTH_REGEN_INTERVAL_MS = 5000;

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
