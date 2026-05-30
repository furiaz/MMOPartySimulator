import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  addCombatFeedback,
  PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS,
  updateEntity,
  type GameState,
} from "./state";
import type { Companion, Enemy } from "./types";
import { applyCompanionLevelUpStatGrowth } from "./stats";
import { SUPERIOR_ENEMY_XP_MULTIPLIER, isSuperiorEnemy } from "./enemyVariants";

export const MAX_CHARACTER_LEVEL = 200;
export const BEGINNER_CLASS_UNLOCK_LEVEL = 10;
export const DEBUG_SUPER_EXP_MULTIPLIER = 5;

const XP_TO_NEXT_LEVEL_ANCHORS: Record<number, number> = {
  1: 6,
  2: 18,
  3: 50,
  4: 112,
  5: 216,
  6: 385,
  7: 624,
  8: 1008,
  9: 1440,
  10: 2100,
  20: 8736,
  30: 26460,
  40: 57948,
  50: 106800,
  75: 324192,
  100: 713708,
  150: 2175085,
  199: 4727448,
};

const TOTAL_XP_ANCHORS: Record<number, number> = {
  1: 0,
  2: 6,
  3: 24,
  4: 74,
  5: 186,
  6: 402,
  7: 787,
  8: 1411,
  9: 2419,
  10: 3859,
  20: 44972,
  30: 201991,
  40: 595531,
  50: 1378392,
  75: 6341709,
  100: 18721319,
  150: 85983356,
  199: 248705990,
};

const SAME_LEVEL_MOB_XP_ANCHORS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
  6: 11,
  7: 13,
  8: 16,
  9: 18,
  10: 21,
  20: 52,
  30: 90,
  40: 132,
  50: 178,
  75: 307,
  100: 452,
  150: 781,
  199: 1143,
};

export type CharacterXpProgress = {
  xp: number;
  xpToNextLevel: number | null;
  percent: number;
  isMaxLevel: boolean;
};

const PARTY_SIZE_UNLOCK_REQUIREMENTS: Record<number, number> = {
  3: 10,
  4: 30,
  5: 60,
};

export function getCharacterXpToNextLevel(level: number): number | null {
  const clampedLevel = clampLevel(level);

  if (clampedLevel >= MAX_CHARACTER_LEVEL) {
    return null;
  }

  return getAnchoredValue(XP_TO_NEXT_LEVEL_ANCHORS, clampedLevel);
}

export function getTotalCharacterXpForLevel(level: number): number {
  const clampedLevel = clampLevel(level);
  const anchoredTotal = TOTAL_XP_ANCHORS[clampedLevel];

  if (anchoredTotal !== undefined) {
    return anchoredTotal;
  }

  let totalXp = 0;

  for (let currentLevel = 1; currentLevel < clampedLevel; currentLevel += 1) {
    totalXp += getCharacterXpToNextLevel(currentLevel) ?? 0;
  }

  return totalXp;
}

export function getSameLevelEnemyXp(level: number): number {
  return getAnchoredValue(SAME_LEVEL_MOB_XP_ANCHORS, clampEnemyLevel(level));
}

export function getEnemyXpReward(enemy: Enemy): number {
  const baseXp = enemy.xpReward ?? getSameLevelEnemyXp(enemy.level);
  const variantMultiplier = isSuperiorEnemy(enemy)
    ? SUPERIOR_ENEMY_XP_MULTIPLIER
    : 1;

  return Math.max(0, Math.floor(baseXp * variantMultiplier));
}

export function getLevelGapXpModifier(
  companionLevel: number,
  enemyLevel: number,
): number {
  const levelDifference = companionLevel - enemyLevel;

  if (levelDifference <= 10) {
    return 1;
  }

  if (levelDifference <= 20) {
    return 0.5;
  }

  if (levelDifference <= 30) {
    return 0.25;
  }

  return 0;
}

export function grantCharacterXpToParty(
  state: GameState,
  enemy: Enemy,
  sourceId?: string,
  now = Date.now(),
): GameState {
  const baseXpAmount = getEnemyXpReward(enemy);
  const debugXpMultiplier = getDebugXpMultiplier(state);
  let nextState = state;

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    if (entity.state === "dead") {
      nextState = appendCharacterXpSkippedEvent(
        nextState,
        entity,
        enemy,
        baseXpAmount,
        "dead",
      );
      continue;
    }

    if (entity.characterLevel >= MAX_CHARACTER_LEVEL) {
      nextState = appendCharacterXpSkippedEvent(
        nextState,
        entity,
        enemy,
        baseXpAmount,
        "max_level",
      );
      continue;
    }

    const levelGapXpModifier = getLevelGapXpModifier(entity.characterLevel, enemy.level);
    const xpModifier = levelGapXpModifier * debugXpMultiplier;
    const modifiedXpAmount = Math.floor(baseXpAmount * xpModifier);

    if (levelGapXpModifier < 1 && levelGapXpModifier > 0) {
      nextState = appendDebugTelemetryEvent(nextState, {
        type: "character_xp_reduced",
        entityId: entity.id,
        targetId: enemy.id,
        baseXpAmount,
        modifiedXpAmount,
        xpModifier: levelGapXpModifier,
        reason: "level_gap",
      });
    }

    if (modifiedXpAmount <= 0) {
      nextState = appendCharacterXpSkippedEvent(
        nextState,
        entity,
        enemy,
        baseXpAmount,
        "level_gap",
        xpModifier,
      );
      continue;
    }

    const updatedCompanion = grantCharacterXpToCompanion(
      entity,
      modifiedXpAmount,
    );

    nextState = updateEntity(nextState, updatedCompanion);
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "character_xp_awarded",
      entityId: entity.id,
      targetId: enemy.id,
      baseXpAmount,
      modifiedXpAmount,
      xpAmount: modifiedXpAmount,
      xpModifier,
      previousLevel: entity.characterLevel,
      nextLevel: updatedCompanion.characterLevel,
      previousXp: entity.characterXp,
      nextXp: updatedCompanion.characterXp,
      reason: sourceId ? `enemy_killed:${sourceId}` : "enemy_killed",
    });

    if (updatedCompanion.characterLevel > entity.characterLevel) {
      nextState = addCombatFeedback(nextState, {
        type: "level_up",
        entityId: updatedCompanion.id,
        targetEntityId: enemy.id,
        text: "Level Up",
        now,
        durationMs: PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS,
      });
      nextState = appendDebugTelemetryEvent(nextState, {
        type: "character_level_up",
        entityId: entity.id,
        targetId: enemy.id,
        xpAmount: modifiedXpAmount,
        previousLevel: entity.characterLevel,
        nextLevel: updatedCompanion.characterLevel,
        previousXp: entity.characterXp,
        nextXp: updatedCompanion.characterXp,
      });
    }
  }

  return nextState;
}

export function getDebugXpMultiplier(state: GameState): number {
  return state.debugOptions?.superExpEnabled ? DEBUG_SUPER_EXP_MULTIPLIER : 1;
}

export function grantCharacterXpToCompanion(
  companion: Companion,
  amount: number,
): Companion {
  if (companion.characterLevel >= MAX_CHARACTER_LEVEL || amount <= 0) {
    return {
      ...companion,
      lastCharacterXpGained: 0,
    };
  }

  let characterLevel = companion.characterLevel;
  let characterXp = companion.characterXp + Math.floor(amount);
  let xpToNextLevel = getCharacterXpToNextLevel(characterLevel);

  while (
    xpToNextLevel !== null &&
    characterXp >= xpToNextLevel &&
    characterLevel < MAX_CHARACTER_LEVEL
  ) {
    characterXp -= xpToNextLevel;
    characterLevel += 1;
    xpToNextLevel = getCharacterXpToNextLevel(characterLevel);
  }

  const levelsGained = characterLevel - companion.characterLevel;

  if (characterLevel >= MAX_CHARACTER_LEVEL) {
    return applyCompanionLevelUpStatGrowth(
      {
        ...companion,
        characterLevel: MAX_CHARACTER_LEVEL,
        characterXp: 0,
        lastCharacterXpGained: Math.floor(amount),
      },
      levelsGained,
    );
  }

  return applyCompanionLevelUpStatGrowth(
    {
      ...companion,
      characterLevel,
      characterXp,
      lastCharacterXpGained: Math.floor(amount),
    },
    levelsGained,
  );
}

export function getCharacterXpProgress(
  companion: Companion,
): CharacterXpProgress {
  const xpToNextLevel = getCharacterXpToNextLevel(companion.characterLevel);
  const isMaxLevel = xpToNextLevel === null;

  return {
    xp: isMaxLevel ? 0 : companion.characterXp,
    xpToNextLevel,
    percent: isMaxLevel
      ? 100
      : Math.min(100, Math.max(0, (companion.characterXp / xpToNextLevel) * 100)),
    isMaxLevel,
  };
}

export function getTotalPartyCharacterLevel(state: GameState): number {
  return Object.values(state.entities).reduce(
    (totalLevel, entity) =>
      entity.kind === "companion" ? totalLevel + entity.characterLevel : totalLevel,
    0,
  );
}

export function getPartySizeLimit(state: GameState): number {
  const totalPartyLevel = getTotalPartyCharacterLevel(state);

  if (totalPartyLevel >= 60) {
    return 5;
  }

  if (totalPartyLevel >= 30) {
    return 4;
  }

  if (totalPartyLevel >= 10) {
    return 3;
  }

  return 2;
}

export function getPartySizeUnlockRequirement(slotNumber: number): number | null {
  return PARTY_SIZE_UNLOCK_REQUIREMENTS[slotNumber] ?? null;
}

export function isBeginnerClassEligible(companion: Companion): boolean {
  return (
    companion.classId === "beginner" &&
    companion.characterLevel >= BEGINNER_CLASS_UNLOCK_LEVEL
  );
}

function appendCharacterXpSkippedEvent(
  state: GameState,
  companion: Companion,
  enemy: Enemy,
  baseXpAmount: number,
  reason: string,
  xpModifier = 0,
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: "character_xp_skipped",
    entityId: companion.id,
    targetId: enemy.id,
    baseXpAmount,
    modifiedXpAmount: 0,
    xpModifier,
    previousLevel: companion.characterLevel,
    nextLevel: companion.characterLevel,
    previousXp: companion.characterXp,
    nextXp: companion.characterXp,
    reason,
  });
}

function getAnchoredValue(anchors: Record<number, number>, level: number): number {
  const exactValue = anchors[level];

  if (exactValue !== undefined) {
    return exactValue;
  }

  const anchorLevels = Object.keys(anchors)
    .map(Number)
    .sort((a, b) => a - b);
  const lowerLevel =
    anchorLevels
      .slice()
      .reverse()
      .find((anchorLevel) => anchorLevel < level) ?? anchorLevels[0];
  const upperLevel =
    anchorLevels.find((anchorLevel) => anchorLevel > level) ??
    anchorLevels[anchorLevels.length - 1];
  const lowerValue = anchors[lowerLevel];
  const upperValue = anchors[upperLevel];

  if (lowerLevel === upperLevel) {
    return lowerValue;
  }

  const progress = (level - lowerLevel) / (upperLevel - lowerLevel);
  const logLower = Math.log(lowerValue);
  const logUpper = Math.log(upperValue);

  return Math.max(1, Math.round(Math.exp(logLower + (logUpper - logLower) * progress)));
}

function clampLevel(level: number): number {
  return Math.min(MAX_CHARACTER_LEVEL, Math.max(1, Math.floor(level)));
}

function clampEnemyLevel(level: number): number {
  return Math.min(MAX_CHARACTER_LEVEL - 1, Math.max(1, Math.floor(level)));
}
