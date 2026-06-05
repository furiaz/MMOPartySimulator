import type {
  CompanionGlobalCooldownSource,
  CompanionGlobalCooldownState,
  SkillCooldownsBySkillId,
  SkillDefinition,
} from "./types";
import type { GameState } from "./state";

export const COMPANION_GLOBAL_COOLDOWN_MS = 2000;

export function isCompanionGlobalCooldownActive(
  state: GameState,
  companionId: string,
  now: number,
): boolean {
  return getCompanionGlobalCooldownRemainingMs(state, companionId, now) > 0;
}

export function getCompanionGlobalCooldownRemainingMs(
  state: GameState,
  companionId: string,
  now: number,
): number {
  const cooldown = state.globalCooldownsByCompanionId?.[companionId];

  return cooldown ? Math.max(0, cooldown.expiresAt - now) : 0;
}

export function getCompanionGlobalCooldownProgress(
  state: GameState,
  companionId: string,
  now: number,
): { remainingMs: number; durationMs: number; percent: number } | null {
  const cooldown = state.globalCooldownsByCompanionId?.[companionId];

  if (!cooldown || cooldown.expiresAt <= now) {
    return null;
  }

  const durationMs = Math.max(1, cooldown.expiresAt - cooldown.startedAt);
  const remainingMs = cooldown.expiresAt - now;

  return {
    remainingMs,
    durationMs,
    percent: Math.min(100, Math.max(0, (remainingMs / durationMs) * 100)),
  };
}

export function isSkillCooldownActive(
  state: GameState,
  companionId: string,
  skillId: SkillDefinition["id"],
  now: number,
): boolean {
  const cooldown = state.skillCooldownsByCompanionId?.[companionId]?.[skillId];

  return Boolean(cooldown && cooldown.expiresAt > now);
}

export function startCompanionGlobalCooldown(
  state: GameState,
  companionId: string,
  now: number,
  source: CompanionGlobalCooldownSource,
  skillId?: SkillDefinition["id"],
): GameState {
  return {
    ...state,
    globalCooldownsByCompanionId: {
      ...(state.globalCooldownsByCompanionId ?? {}),
      [companionId]: {
        companionId,
        source,
        skillId,
        startedAt: now,
        expiresAt: now + COMPANION_GLOBAL_COOLDOWN_MS,
      },
    },
  };
}

export function startSkillCooldown(
  state: GameState,
  companionId: string,
  skill: SkillDefinition,
  now: number,
  cooldownMs: number,
): GameState {
  return {
    ...state,
    skillCooldownsByCompanionId: {
      ...(state.skillCooldownsByCompanionId ?? {}),
      [companionId]: {
        ...(state.skillCooldownsByCompanionId?.[companionId] ?? {}),
        [skill.id]: {
          companionId,
          skillId: skill.id,
          expiresAt: now + cooldownMs,
        },
      },
    },
  };
}

export function filterExpiredSkillCooldownsByCompanion(
  record: Record<string, SkillCooldownsBySkillId> | undefined,
  now: number,
): Record<string, SkillCooldownsBySkillId> | undefined {
  if (!record) {
    return record;
  }

  let didChange = false;
  const nextEntries: [string, SkillCooldownsBySkillId][] = [];

  for (const [companionId, cooldownsBySkillId] of Object.entries(record)) {
    const activeEntries = Object.entries(cooldownsBySkillId).filter(
      ([, cooldown]) => {
        const isActive = Boolean(cooldown && cooldown.expiresAt > now);
        didChange ||= !isActive;
        return isActive;
      },
    );

    if (activeEntries.length > 0) {
      nextEntries.push([companionId, Object.fromEntries(activeEntries)]);
    } else {
      didChange = true;
    }
  }

  return didChange ? Object.fromEntries(nextEntries) : record;
}

export function filterExpiredGlobalCooldowns(
  record: Record<string, CompanionGlobalCooldownState> | undefined,
  now: number,
): Record<string, CompanionGlobalCooldownState> | undefined {
  if (!record) {
    return record;
  }

  let didChange = false;
  const entries = Object.entries(record).filter(([, cooldown]) => {
    const isActive = cooldown.expiresAt > now;
    didChange ||= !isActive;
    return isActive;
  });

  return didChange ? Object.fromEntries(entries) : record;
}
