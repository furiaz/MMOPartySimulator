import { addItemToInventoryState } from "./inventory";
import { getDirectEnemyKillCredit } from "./directKillCredit";
import { getItemDefinition } from "./items";
import { ENEMY_TYPES } from "./enemyArchetypes";
import type { GameState } from "./state";
import {
  getGuildNoticeBoardDailyRerollLimit,
  getGuildNoticeBoardRefreshIntervalMs,
  getGuildNoticeBoardRewardPercent,
  getGuildNoticeBoardSlotCount,
} from "./guildRecruitUpgrades";
import { getLivestockHelperBonusSummary } from "./livestockHelperBonuses";
import {
  SKILL_BOOK_ITEM_IDS_BY_SKILL_ID,
  isSkillBookItemDefinition,
} from "./skillProgression";
import type {
  Enemy,
  EnemyTypeId,
  GuildNoticeBoardClaimedReward,
  GuildNoticeBoardQuest,
  GuildNoticeBoardQuestCategory,
  GuildNoticeBoardQuestObjective,
  GuildNoticeBoardQuestReward,
  GuildNoticeBoardQuestStatus,
  GuildNoticeBoardState,
  SkillBookItemId,
} from "./types";
import { addCurrencyToWalletState } from "./wallet";
import { createTierTwoBoardContract, FIRST_CLASS_BOARD_BOOKS, getBoardObjectiveEnemyTypes, getBoardZoneMonsterTypes, isBoardOrdinaryEnemy, TIER_TWO_BOARD_MAP_IDS } from "./guildNoticeBoardContracts";
import { grantQuestXpToCurrentParty } from "./questSystem";
import { DROP_VISUAL_DURATION_MS } from "./dropSystem";
import type { DebugMapId, ResourceType } from "./types";
export { formatGuildNoticeBoardQuestTitle, getBoardObjectiveLabel, getBoardObjectiveEnemyTypes } from "./guildNoticeBoardContracts";
import { formatGuildNoticeBoardQuestTitle } from "./guildNoticeBoardContracts";

export const GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const GUILD_NOTICE_BOARD_SLOT_COUNT = 1;
export const GUILD_NOTICE_BOARD_REWARD_CROWNS = 100;
export const GUILD_NOTICE_BOARD_STARTER_QUEST_ID =
  "guild-notice-board-starter-ash-goblin-encampment";
const GUILD_NOTICE_BOARD_STARTER_SEQUENCE = 0;
const ASH_GOBLIN_ENCAMPMENT_NAME = "Ash Goblin Encampment";

export type GuildNoticeBoardTemplate = {
  title: string;
  category: GuildNoticeBoardQuestCategory;
  zoneDisplayName?: string;
  description?: string;
  targetEnemyTypeIds: EnemyTypeId[];
};

export type GuildNoticeBoardKillTemplateOptions = {
  category: GuildNoticeBoardQuestCategory;
  targetEnemyTypeIds: EnemyTypeId[];
  zoneDisplayName: string;
  enemyDisplayName?: string;
  description?: string;
  titleOverride?: string;
};

export type GuildNoticeBoardTakeResult =
  | { ok: true; state: GameState; quest: GuildNoticeBoardQuest }
  | { ok: false; state: GameState; reason: "no_available_quest" };

export type GuildNoticeBoardCancelResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: "no_taken_quest" };

export type GuildNoticeBoardOpenResult = {
  state: GameState;
  claimedRewards: GuildNoticeBoardClaimedReward[];
  failedClaims: string[];
};

export type GuildNoticeBoardRerollResult =
  | {
      ok: true;
      state: GameState;
      claimedRewards: GuildNoticeBoardClaimedReward[];
      failedClaims: string[];
      rerollsRemaining: number;
    }
  | {
      ok: false;
      state: GameState;
      claimedRewards: GuildNoticeBoardClaimedReward[];
      failedClaims: string[];
      reason: "locked" | "no_rerolls" | "no_change";
    };

export type GuildNoticeBoardRerollDisplayState = {
  isUnlocked: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  nextResetAtMs: number;
  sourceTooltipText: string;
};

export type GuildNoticeBoardRerollLimitBreakdown = {
  guildLimit: number;
  livestockLimit: number;
  dailyLimit: number;
  sourceTooltipText: string;
};

export function createGuildNoticeBoardKillTemplate({
  category,
  targetEnemyTypeIds,
  zoneDisplayName,
  enemyDisplayName,
  description,
  titleOverride,
}: GuildNoticeBoardKillTemplateOptions): GuildNoticeBoardTemplate {
  return {
    title:
      titleOverride ??
      formatGuildNoticeBoardQuestTitle(
        category,
        zoneDisplayName,
        enemyDisplayName,
      ),
    category,
    zoneDisplayName,
    description,
    targetEnemyTypeIds,
  };
}

const questTemplates: GuildNoticeBoardTemplate[] = [
  createGuildNoticeBoardKillTemplate({
    category: "extermination",
    zoneDisplayName: "Ashwatch",
    enemyDisplayName: "Field Threat",
    titleOverride: "Ashwatch Field Orders",
    targetEnemyTypeIds: ["goblin_shaman", "ash_wisp"],
  }),
  createGuildNoticeBoardKillTemplate({
    category: "extermination",
    zoneDisplayName: "Ashwatch",
    enemyDisplayName: "Shaman Watch",
    titleOverride: "Shaman Watch Culling",
    targetEnemyTypeIds: ["ash_wisp", "goblin_shaman"],
  }),
  createGuildNoticeBoardKillTemplate({
    category: "extermination",
    zoneDisplayName: "Orc Approach",
    enemyDisplayName: "Orc",
    titleOverride: "Orc Approach Patrol",
    targetEnemyTypeIds: ["orc", "ash_wisp"],
  }),
  createGuildNoticeBoardKillTemplate({
    category: "extermination",
    zoneDisplayName: "Hollow",
    enemyDisplayName: "Hollow Threat",
    titleOverride: "Hollow Threat Sweep",
    targetEnemyTypeIds: ["goblin_shaman", "orc"],
  }),
];

const starterQuestTemplate = createGuildNoticeBoardKillTemplate({
  category: "assault",
  zoneDisplayName: ASH_GOBLIN_ENCAMPMENT_NAME,
  targetEnemyTypeIds: ["ash_wisp", "ember_imp"],
  description:
    "Defeat 50 Ash Wisps and 50 Ember Imps. Progress begins after taking this posting.",
});

const allSkillBookItemIds = Object.values(
  SKILL_BOOK_ITEM_IDS_BY_SKILL_ID,
).filter((itemId): itemId is SkillBookItemId =>
  isSkillBookItemDefinition(getItemDefinition(itemId)),
);

export function createInitialGuildNoticeBoardState(
  nowMs = Date.now(),
  state?: GameState,
  random = Math.random,
): GuildNoticeBoardState {
  const slotCount = getGuildNoticeBoardSlotCount(state);
  const regularSlotCount = Math.max(0, slotCount - 1);
  return {
    slots: [
      createStarterGuildNoticeBoardQuest(nowMs, random),
      ...Array.from({ length: regularSlotCount }, (_, index) =>
        createTierTwoBoardContract(index + 1, nowMs, state, random),
      ),
    ],
    nextRefreshAtMs: nowMs + getNoticeBoardRefreshIntervalMs(state),
    questSequence: regularSlotCount,
    hasSeenCurrentRefresh: false,
    rerollsUsedToday: 0,
    rerollDayStartMs: getLocalDayStartMs(nowMs),
    starterContractAccepted: false,
  };
}

export function getGuildNoticeBoardState(
  state: GameState,
  _nowMs = Date.now(),
): GuildNoticeBoardState {
  void _nowMs; // Retained for callers of the old time-aware read API.
  // Reads never initialize or refresh a posting. Initialization belongs to game state.
  return state.guildNoticeBoard ?? {
    slots: [], nextRefreshAtMs: Infinity, questSequence: 0,
    hasSeenCurrentRefresh: true, rerollsUsedToday: 0, rerollDayStartMs: 0,
    starterContractAccepted: false,
  };
}

export function refreshGuildNoticeBoardState(
  state: GameState,
  nowMs = Date.now(),
  random = Math.random,
): GameState {
  let board = resetGuildNoticeBoardRerollDayIfNeeded(
    state.guildNoticeBoard ?? createInitialGuildNoticeBoardState(nowMs, state, random),
    nowMs,
  );

  // Initialize newly purchased slots through the game clock, never a read model.
  const missingSlots = getGuildNoticeBoardSlotCount(state) - board.slots.length;
  if (missingSlots > 0 && board.nextRefreshAtMs > nowMs) {
    let sequence = board.questSequence;
    const added = Array.from({ length: missingSlots }, () => createTierTwoBoardContract(++sequence, nowMs, state, random));
    board = { ...board, slots: [...board.slots, ...added], questSequence: sequence, hasSeenCurrentRefresh: false };
  }
  if (board.nextRefreshAtMs > nowMs) {
    return board === state.guildNoticeBoard ? state : { ...state, guildNoticeBoard: board };
  }

  let sequence = board.questSequence;
  let changedSlot = false;
  const configuredSlotCount = getGuildNoticeBoardSlotCount(state);
  const slots = board.slots.flatMap((slot) => {
    if (!canRefreshSlot(slot)) {
      return [slot];
    }

    if (
      slot?.isStarterContract &&
      board.slots.length > configuredSlotCount
    ) {
      changedSlot = true;
      return [];
    }

    sequence += 1;
    changedSlot = true;
    return [createTierTwoBoardContract(sequence, nowMs, state, random)];
  });

  while (slots.length < configuredSlotCount) {
    sequence += 1;
    changedSlot = true;
    slots.push(createTierTwoBoardContract(sequence, nowMs, state, random));
  }

  const nextBoard: GuildNoticeBoardState = {
    slots,
    nextRefreshAtMs: nowMs + getNoticeBoardRefreshIntervalMs(state),
    questSequence: Math.max(sequence, board.questSequence),
    hasSeenCurrentRefresh: changedSlot ? false : board.hasSeenCurrentRefresh,
    rerollsUsedToday: board.rerollsUsedToday,
    rerollDayStartMs: board.rerollDayStartMs,
    starterContractAccepted: board.starterContractAccepted,
  };

  return {
    ...state,
    guildNoticeBoard: nextBoard,
  };
}

export function openGuildNoticeBoard(
  state: GameState,
  nowMs = Date.now(),
): GuildNoticeBoardOpenResult {
  let nextState = state;
  let board = getGuildNoticeBoardState(nextState, nowMs);
  const claimedRewards: GuildNoticeBoardClaimedReward[] = [];
  const failedClaims: string[] = [];
  const slots: Array<GuildNoticeBoardQuest | null> = [];

  for (const slot of board.slots) {
    if (!slot || slot.status !== "done" || slot.rewardClaimedAtMs !== null) {
      slots.push(slot);
      continue;
    }

    const rewardResult = grantGuildNoticeBoardReward(
      nextState,
      slot,
      getGuildNoticeBoardRewardPercent(nextState),
      nowMs,
    );
    if (!rewardResult.claimedReward) {
      failedClaims.push(slot.title);
      slots.push(slot);
      continue;
    }
    nextState = rewardResult.state;
    claimedRewards.push(rewardResult.claimedReward);
    slots.push({
      ...slot,
      rewardClaimedAtMs: nowMs,
    });
  }

  board = {
    ...board,
    slots,
    hasSeenCurrentRefresh: true,
  };

  return {
    state: {
      ...nextState,
      guildNoticeBoard: board,
    },
    claimedRewards,
    failedClaims,
  };
}

export function takeGuildNoticeBoardQuest(
  state: GameState,
  nowMs = Date.now(),
  slotIndex?: number,
): GuildNoticeBoardTakeResult {
  const refreshedState = state;
  const board = getGuildNoticeBoardState(refreshedState, nowMs);
  const targetSlotIndex =
    slotIndex ?? board.slots.findIndex((slot) => slot?.status === "available");

  if (targetSlotIndex < 0) {
    return { ok: false, state: refreshedState, reason: "no_available_quest" };
  }

  const slot = board.slots[targetSlotIndex];

  if (!slot || slot.status !== "available") {
    return { ok: false, state: refreshedState, reason: "no_available_quest" };
  }

  const quest: GuildNoticeBoardQuest = {
    ...slot,
    status: "taken",
    takenAtMs: nowMs,
    levelAnchor: null,
    levelRange: null,
  };
  const slots = [...board.slots];
  slots[targetSlotIndex] = quest;
  const starterContractAccepted =
    board.starterContractAccepted || quest.isStarterContract === true;

  return {
    ok: true,
    state: {
      ...refreshedState,
      guildNoticeBoard: {
        ...board,
        slots,
        hasSeenCurrentRefresh: true,
        starterContractAccepted,
      },
    },
    quest,
  };
}

export function cancelGuildNoticeBoardQuest(
  state: GameState,
  nowMs = Date.now(),
  slotIndex?: number,
): GuildNoticeBoardCancelResult {
  const refreshedState = state;
  const board = getGuildNoticeBoardState(refreshedState, nowMs);
  const targetSlotIndex =
    slotIndex ?? board.slots.findIndex((slot) => slot?.status === "taken");

  if (targetSlotIndex < 0 || board.slots[targetSlotIndex]?.status !== "taken") {
    return { ok: false, state: refreshedState, reason: "no_taken_quest" };
  }

  const slots = [...board.slots];
  if (
    slots[targetSlotIndex]?.isStarterContract &&
    slots.length > getGuildNoticeBoardSlotCount(refreshedState)
  ) {
    slots.splice(targetSlotIndex, 1);
  } else {
    slots[targetSlotIndex] = null;
  }

  return {
    ok: true,
    state: {
      ...refreshedState,
      guildNoticeBoard: {
        ...board,
        slots,
      },
    },
  };
}

export function rerollGuildNoticeBoard(
  state: GameState,
  nowMs = Date.now(),
  random = Math.random,
): GuildNoticeBoardRerollResult {
  const opened = openGuildNoticeBoard(state, nowMs);
  let nextState = opened.state;
  const board = resetGuildNoticeBoardRerollDayIfNeeded(
    getGuildNoticeBoardState(nextState, nowMs),
    nowMs,
  );
  const rerollLimit = getGuildNoticeBoardRerollLimitBreakdown(nextState);
  const dailyLimit = rerollLimit.dailyLimit;

  if (dailyLimit <= 0) {
    return {
      ok: false,
      state: {
        ...nextState,
        guildNoticeBoard: board,
      },
      claimedRewards: opened.claimedRewards,
      failedClaims: opened.failedClaims,
      reason: "locked",
    };
  }

  if (board.rerollsUsedToday >= dailyLimit) {
    return {
      ok: false,
      state: {
        ...nextState,
        guildNoticeBoard: board,
      },
      claimedRewards: opened.claimedRewards,
      failedClaims: opened.failedClaims,
      reason: "no_rerolls",
    };
  }

  let sequence = board.questSequence;
  let changedSlot = false;
  const configuredSlotCount = getGuildNoticeBoardSlotCount(nextState);
  const slots = board.slots.flatMap((slot) => {
    if (!canRefreshSlot(slot)) {
      return [slot];
    }

    if (slot?.isStarterContract && board.slots.length > configuredSlotCount) {
      changedSlot = true;
      return [];
    }

    sequence += 1;
    const replacement = createTierTwoBoardContract(sequence, nowMs, nextState, random);
    changedSlot ||= Boolean(slot || replacement);
    return [replacement];
  });

  while (slots.length < configuredSlotCount) {
    sequence += 1;
    const replacement = createTierTwoBoardContract(sequence, nowMs, nextState, random);
    changedSlot ||= Boolean(replacement);
    slots.push(replacement);
  }

  if (!changedSlot) {
    return {
      ok: false,
      state: {
        ...nextState,
        guildNoticeBoard: board,
      },
      claimedRewards: opened.claimedRewards,
      failedClaims: opened.failedClaims,
      reason: "no_change",
    };
  }

  const rerollsUsedToday = board.rerollsUsedToday + 1;

  nextState = {
    ...nextState,
    guildNoticeBoard: {
      ...board,
      slots,
      questSequence: Math.max(sequence, board.questSequence),
      rerollsUsedToday,
      hasSeenCurrentRefresh: true,
    },
  };

  return {
    ok: true,
    state: nextState,
    claimedRewards: opened.claimedRewards,
    failedClaims: opened.failedClaims,
    rerollsRemaining: Math.max(0, dailyLimit - rerollsUsedToday),
  };
}

export function getGuildNoticeBoardRerollDisplayState(
  state: GameState,
  nowMs = Date.now(),
): GuildNoticeBoardRerollDisplayState {
  const board = resetGuildNoticeBoardRerollDayIfNeeded(
    getGuildNoticeBoardState(state, nowMs),
    nowMs,
  );
  const rerollLimit = getGuildNoticeBoardRerollLimitBreakdown(state);
  return {
    isUnlocked: rerollLimit.dailyLimit > 0,
    dailyLimit: rerollLimit.dailyLimit,
    usedToday: Math.min(board.rerollsUsedToday, rerollLimit.dailyLimit),
    remaining: Math.max(0, rerollLimit.dailyLimit - board.rerollsUsedToday),
    nextResetAtMs: getNextLocalDayStartMs(nowMs),
    sourceTooltipText: rerollLimit.sourceTooltipText,
  };
}

export function getGuildNoticeBoardRerollLimitBreakdown(
  state: GameState,
): GuildNoticeBoardRerollLimitBreakdown {
  const guildLimit = getGuildNoticeBoardDailyRerollLimit(state);
  const livestockBonus = getLivestockHelperBonusSummary(state);
  const livestockLimit = livestockBonus.noticeBoardRerollBonus;
  const sourceParts = [
    guildLimit > 0 ? `${guildLimit} from Guild (Scouts)` : null,
    livestockBonus.noticeBoardLivestockSourceText,
  ].filter((source): source is string => source !== null);

  return {
    guildLimit,
    livestockLimit,
    dailyLimit: guildLimit + livestockLimit,
    sourceTooltipText:
      sourceParts.length > 0
        ? sourceParts.join(", ")
        : "Unlock Scouts or place a fed Wolf.",
  };
}

export function recordEnemyDefeatedForGuildNoticeBoard(
  state: GameState,
  defeatedEnemy: Enemy,
  mapId = state.currentMapId,
  random = Math.random,
  now = Date.now(),
): GameState {
  if (defeatedEnemy.state !== "dead" || !defeatedEnemy.enemyTypeId) {
    return state;
  }
  const corpse = state.entities[defeatedEnemy.id];
  if (defeatedEnemy.noticeBoardDefeatCounted || (corpse?.kind === "enemy" && corpse.noticeBoardDefeatCounted)) return state;
  // The marker belongs to this physical corpse. Normal respawn/reconstruction
  // creates a fresh enemy, so another death of the same authored ID still counts.
  const recordedState = corpse?.kind === "enemy" && corpse.state === "dead"
    ? { ...state, entities: { ...state.entities, [corpse.id]: { ...corpse, noticeBoardDefeatCounted: true as const } } }
    : state;

  const defeatedEnemyTypeId = defeatedEnemy.enemyTypeId;
  const killCredit = getDirectEnemyKillCredit(defeatedEnemy);
  const board = getGuildNoticeBoardState(state);
  const dropVisualEvents = [...(state.dropVisualEvents ?? [])];
  let changed = false;
  const slots = board.slots.map((slot) => {
    if (!slot || slot.status !== "taken" || (slot.targetMapId && slot.targetMapId !== mapId) || (slot.schemaVersion === 2 && !isBoardOrdinaryEnemy(defeatedEnemy))) {
      return slot;
    }

    let progressed = false;
    const objectives = slot.objectives.map((objective) => {
      if (objective.currentCount >= objective.requiredCount || !getBoardObjectiveEnemyTypes(objective).includes(defeatedEnemyTypeId)) return objective;
      const isDrop = objective.type === "quest_drop";
      if (isDrop && random() >= 0.5) return objective;
      const nextObjective = updateObjectiveForEnemyCount(objective, isDrop ? 1 : killCredit);
      if (isDrop) dropVisualEvents.push({
        id: `${now}-board-drop-${slot.id}-${defeatedEnemy.id}-${dropVisualEvents.length}`,
        kind: "quest_item", boardContractId: slot.id, objectiveId: objective.id,
        displayName: objective.itemDisplayName, iconRole: "quest_giver", quantity: 1,
        enemyId: defeatedEnemy.id, enemyTypeId: defeatedEnemyTypeId,
        enemyArchetypeId: defeatedEnemy.archetypeId, enemyVariant: defeatedEnemy.variant,
        position: defeatedEnemy.position, createdAt: now, expiresAt: now + DROP_VISUAL_DURATION_MS,
        currentMapId: mapId, dropChance: 0.5,
      });
      progressed = progressed || nextObjective !== objective;
      return nextObjective;
    });

    if (!progressed) {
      return slot;
    }

    const status: GuildNoticeBoardQuestStatus = areObjectivesComplete(objectives)
      ? "done"
      : slot.status;

    changed = true;
    return {
      ...slot,
      status,
      objectives,
    };
  });

  if (!changed) {
    return recordedState;
  }

  return {
    ...recordedState,
    dropVisualEvents,
    guildNoticeBoard: {
      ...board,
      slots,
      hasSeenCurrentRefresh: false,
    },
  };
}

export function recordEnemyDefeatsForGuildNoticeBoard(
  state: GameState,
  defeats: Array<{ enemyTypeId: EnemyTypeId; quantity: number }>,
  mapId?: DebugMapId,
): GameState {
  const countByEnemyTypeId = new Map<EnemyTypeId, number>();

  for (const defeat of defeats) {
    const quantity = Number.isFinite(defeat.quantity) ? Math.max(0, Math.floor(defeat.quantity)) : 0;

    if (quantity <= 0) {
      continue;
    }

    countByEnemyTypeId.set(
      defeat.enemyTypeId,
      (countByEnemyTypeId.get(defeat.enemyTypeId) ?? 0) + quantity,
    );
  }

  if (countByEnemyTypeId.size === 0) {
    return state;
  }

  const board = getGuildNoticeBoardState(state);
  let changed = false;
  const slots = board.slots.map((slot) => {
    if (!slot || slot.status !== "taken" || (slot.targetMapId && slot.targetMapId !== mapId)) {
      return slot;
    }

    let progressed = false;
    const objectives = slot.objectives.map((objective) => {
      if (objective.type === "quest_drop" || objective.type === "gather_resources") return objective;
      const defeatCount = getBoardObjectiveEnemyTypes(objective).reduce((sum, type) => sum + (countByEnemyTypeId.get(type) ?? 0), 0);
      const nextObjective = updateObjectiveForEnemyCount(objective, defeatCount);

      progressed = progressed || nextObjective !== objective;
      return nextObjective;
    });

    if (!progressed) {
      return slot;
    }

    const status: GuildNoticeBoardQuestStatus = areObjectivesComplete(objectives)
      ? "done"
      : slot.status;

    changed = true;
    return {
      ...slot,
      status,
      objectives,
    };
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    guildNoticeBoard: {
      ...board,
      slots,
      hasSeenCurrentRefresh: false,
    },
  };
}

export function shouldShowGuildNoticeBoardSign(
  state: GameState,
  nowMs = Date.now(),
): boolean {
  const board = getGuildNoticeBoardState(state, nowMs);
  return board.slots.some((slot) => {
    if (!slot) {
      return false;
    }

    if (slot.status === "done" && slot.rewardClaimedAtMs === null) {
      return true;
    }

    return slot.status === "available" && !board.hasSeenCurrentRefresh;
  });
}

export function sanitizeGuildNoticeBoardState(
  guildNoticeBoard: GuildNoticeBoardState | undefined,
  nowMs = Date.now(),
  state?: GameState,
): GuildNoticeBoardState {
  if (!guildNoticeBoard) {
    // Deterministic fallback for old saves. Explicit restoration migrates the starter.
    return createInitialGuildNoticeBoardState(nowMs, undefined, () => 0);
  }

  const questSequence = sanitizeSequence(guildNoticeBoard.questSequence);
  let maxSequence = questSequence;
  const configuredSlotCount = getGuildNoticeBoardSlotCount(state);
  const savedSlotCount = Array.isArray(guildNoticeBoard.slots)
    ? guildNoticeBoard.slots.length
    : 0;
  const slots = Array.from(
    { length: Math.max(configuredSlotCount, savedSlotCount) },
    (_, index) => {
      if (
        Array.isArray(guildNoticeBoard.slots) &&
        index < guildNoticeBoard.slots.length &&
        guildNoticeBoard.slots[index] === null
      ) {
        return null;
      }

      const fallbackSequence = Math.max(1, questSequence + index);
      const quest = sanitizeGuildNoticeBoardQuest(
        guildNoticeBoard.slots?.[index],
        fallbackSequence,
        nowMs,
      );

      if (quest) {
        if (!quest.isStarterContract) {
          maxSequence = Math.max(maxSequence, quest.sequence);
        }
        return quest;
      }

      return null;
    },
  );

  return {
    slots,
    nextRefreshAtMs: sanitizeTimestamp(
      guildNoticeBoard.nextRefreshAtMs,
      nowMs + getNoticeBoardRefreshIntervalMs(state),
    ),
    questSequence: maxSequence,
    hasSeenCurrentRefresh: Boolean(guildNoticeBoard.hasSeenCurrentRefresh),
    rerollsUsedToday: Number.isFinite(guildNoticeBoard.rerollsUsedToday) ? Math.max(0, Math.floor(guildNoticeBoard.rerollsUsedToday)) : 0,
    rerollDayStartMs: sanitizeDayStartTimestamp(
      guildNoticeBoard.rerollDayStartMs,
      getLocalDayStartMs(nowMs),
    ),
    starterContractAccepted:
      guildNoticeBoard.starterContractAccepted === true ||
      slots.some(
        (slot) =>
          slot?.isStarterContract === true && slot.status !== "available",
      ),
  };
}

export function ensureStarterGuildNoticeBoardContract(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const board = sanitizeGuildNoticeBoardState(
    state.guildNoticeBoard,
    nowMs,
    state,
  );

  if (
    board.starterContractAccepted ||
    board.slots.some((slot) => slot?.isStarterContract)
  ) {
    return { ...state, guildNoticeBoard: board };
  }

  return {
    ...state,
    guildNoticeBoard: {
      ...board,
      slots: [createStarterGuildNoticeBoardQuest(nowMs), ...board.slots],
      hasSeenCurrentRefresh: false,
    },
  };
}

function createGuildNoticeBoardQuest(
  sequence: number,
  nowMs: number,
): GuildNoticeBoardQuest {
  const template = questTemplates[(sequence - 1) % questTemplates.length];

  return {
    id: `guild-notice-board-quest-${sequence}`,
    title: template.title,
    category: template.category,
    zoneDisplayName: template.zoneDisplayName,
    description: template.description,
    sequence,
    status: "available",
    generatedAtMs: nowMs,
    takenAtMs: null,
    levelAnchor: null,
    levelRange: null,
    objectives: template.targetEnemyTypeIds.map((enemyTypeId) => ({
      id: `defeat-${enemyTypeId}`,
      enemyTypeId,
      requiredCount: 50,
      currentCount: 0,
    })),
    rewards: createGuildNoticeBoardReward(sequence),
    rewardClaimedAtMs: null,
  };
}

function createStarterGuildNoticeBoardQuest(
  nowMs: number,
  random = Math.random,
): GuildNoticeBoardQuest {
  return {
    ...createTierTwoBoardContract(0, nowMs, undefined, random, "map-4", "assault")!,
    id: GUILD_NOTICE_BOARD_STARTER_QUEST_ID,
    isStarterContract: true,
  };
}

// Only used to interpret legacy records, never for new generation.
function createLegacyStarterQuest(nowMs: number): GuildNoticeBoardQuest {
  return {
    id: GUILD_NOTICE_BOARD_STARTER_QUEST_ID,
    title: starterQuestTemplate.title,
    category: starterQuestTemplate.category,
    zoneDisplayName: starterQuestTemplate.zoneDisplayName,
    description: starterQuestTemplate.description,
    isStarterContract: true,
    sequence: GUILD_NOTICE_BOARD_STARTER_SEQUENCE,
    status: "available",
    generatedAtMs: nowMs,
    takenAtMs: null,
    levelAnchor: null,
    levelRange: null,
    objectives: starterQuestTemplate.targetEnemyTypeIds.map((enemyTypeId) => ({
      id: `defeat-${enemyTypeId}`,
      enemyTypeId,
      requiredCount: 50,
      currentCount: 0,
    })),
    rewards: createGuildNoticeBoardReward(1),
    rewardClaimedAtMs: null,
  };
}

function createGuildNoticeBoardReward(
  sequence: number,
): GuildNoticeBoardQuestReward {
  return {
    crowns: GUILD_NOTICE_BOARD_REWARD_CROWNS,
    skillBookItemId:
      allSkillBookItemIds[(sequence - 1) % allSkillBookItemIds.length] ??
      "throw_rock_skill_book",
  };
}

function sanitizeGuildNoticeBoardQuest(
  quest: GuildNoticeBoardQuest | null | undefined,
  fallbackSequence: number,
  nowMs: number,
): GuildNoticeBoardQuest | null {
  if (!quest) {
    return null;
  }
  if (typeof quest.id !== "string" || !quest.id || !Array.isArray(quest.objectives)) return null;

  const isStarterContract =
    quest.isStarterContract === true ||
    quest.id === GUILD_NOTICE_BOARD_STARTER_QUEST_ID;
  const fallbackQuest = isStarterContract
    ? createLegacyStarterQuest(nowMs)
    : createGuildNoticeBoardQuest(fallbackSequence, nowMs);
  const status = sanitizeQuestStatus(quest.status);
  const objectives = sanitizeObjectives(quest.objectives);
  const reward = sanitizeReward(quest.rewards, fallbackQuest.rewards);
  if (!quest.rewards || !Number.isFinite(quest.rewards.crowns) || quest.rewards.crowns < 0 || !allSkillBookItemIds.includes(quest.rewards.skillBookItemId)) return null;
  if (!objectives.length || objectives.length !== quest.objectives.length || (quest.schemaVersion !== undefined && quest.schemaVersion !== 2)) return null;
  if (quest.schemaVersion === undefined && quest.objectives.some(objective => objective.type !== undefined && objective.type !== "enemy_kills")) return null;
  if (quest.schemaVersion === 2 && (
    !TIER_TWO_BOARD_MAP_IDS.includes(quest.targetMapId as typeof TIER_TWO_BOARD_MAP_IDS[number]) ||
    !["assault", "extermination", "rummage", "forage"].includes(quest.category ?? "") ||
    !isValidModernReward(quest.rewards) || !areValidModernObjectives(quest)
  )) return null;
  return {
    ...fallbackQuest,
    ...(quest.schemaVersion === 2 ? { schemaVersion: 2 as const, targetMapId: quest.targetMapId } : {}),
    id: typeof quest.id === "string" && quest.id ? quest.id : fallbackQuest.id,
    title:
      typeof quest.title === "string" && quest.title
        ? quest.title
        : fallbackQuest.title,
    category: quest.category ?? fallbackQuest.category,
    zoneDisplayName: quest.zoneDisplayName ?? fallbackQuest.zoneDisplayName,
    description: quest.description ?? fallbackQuest.description,
    isStarterContract: isStarterContract ? true : undefined,
    sequence: isStarterContract
      ? GUILD_NOTICE_BOARD_STARTER_SEQUENCE
      : sanitizeSequence(quest.sequence),
    status: status === "done" && !areObjectivesComplete(objectives) ? "taken" : status,
    generatedAtMs: sanitizeTimestamp(quest.generatedAtMs, nowMs),
    takenAtMs:
      status === "available" ? null : sanitizeNullableTimestamp(quest.takenAtMs),
    levelAnchor: null,
    levelRange: null,
    objectives,
    rewards: reward,
    rewardClaimedAtMs: status === "done" && areObjectivesComplete(objectives) ? sanitizeNullableTimestamp(quest.rewardClaimedAtMs) : null,
  };
}

function sanitizeObjectives(
  objectives: GuildNoticeBoardQuestObjective[] | undefined,
): GuildNoticeBoardQuestObjective[] {
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return [];
  }

  return objectives.filter(objective => objective && typeof objective.id === "string" &&
    Number.isSafeInteger(objective.requiredCount) && objective.requiredCount > 0 &&
    (objective.type === "gather_resources" || (Array.isArray(getBoardObjectiveEnemyTypes(objective)) && getBoardObjectiveEnemyTypes(objective).length > 0 && getBoardObjectiveEnemyTypes(objective).every(id => Object.hasOwn(ENEMY_TYPES, id))))
  ).map((objective) => {
    const requiredCount = Math.floor(objective.requiredCount);
    return {
      ...objective,
      requiredCount,
      currentCount: Math.min(
        requiredCount,
        Number.isFinite(objective.currentCount) ? Math.max(0, Math.floor(objective.currentCount)) : 0,
      ),
    };
  });
}

function sanitizeReward(
  reward: GuildNoticeBoardQuestReward | undefined,
  fallbackReward: GuildNoticeBoardQuestReward,
): GuildNoticeBoardQuestReward {
  const skillBookItemId = reward?.skillBookItemId;
  return {
    ...(isValidModernReward(reward) ? { characterXp: reward!.characterXp,
      skillBookItemIds: reward!.skillBookItemIds, bonusSkillBookItemId: reward!.bonusSkillBookItemId,
      bonusBookRoll: reward!.bonusBookRoll } : {}),
    crowns:
      Number.isFinite(reward?.crowns)
        ? Math.max(0, Math.floor(reward?.crowns ?? 0))
        : fallbackReward.crowns,
    skillBookItemId:
      skillBookItemId && allSkillBookItemIds.includes(skillBookItemId)
        ? skillBookItemId
        : fallbackReward.skillBookItemId,
  };
}

function updateObjectiveForEnemyCount(
  objective: GuildNoticeBoardQuestObjective,
  defeatCount: number,
): GuildNoticeBoardQuestObjective {
  if (defeatCount <= 0 || objective.currentCount >= objective.requiredCount) {
    return objective;
  }

  return {
    ...objective,
    currentCount: Math.min(
      objective.requiredCount,
      objective.currentCount + defeatCount,
    ),
  };
}

function areObjectivesComplete(
  objectives: GuildNoticeBoardQuestObjective[],
): boolean {
  return objectives.every(
    (objective) => objective.currentCount >= objective.requiredCount,
  );
}

function grantGuildNoticeBoardReward(
  state: GameState,
  quest: GuildNoticeBoardQuest,
  rewardPercent: number,
  nowMs: number,
): { state: GameState; claimedReward?: GuildNoticeBoardClaimedReward } {
  const reward = getGuildNoticeBoardRewardPreview(quest, rewardPercent);
  // Immutable trial additions account for duplicates, stack limits and locked slots.
  // Publish nothing (including telemetry) unless the entire award fits.
  let nextState = state;
  for (const book of reward.skillBookItemIds) {
    const addition = addItemToInventoryState(nextState, book, 1, "quest_reward");
    if (addition.result.addedQuantity !== 1) return { state };
    nextState = addition.state;
  }
  nextState = addCurrencyToWalletState(nextState, "crowns", reward.crowns, "quest_reward").state;
  if (reward.characterXp > 0) nextState = grantQuestXpToCurrentParty(nextState, undefined, reward.characterXp, nowMs);

  return {
    state: nextState,
    claimedReward: {
      questTitle: quest.title,
      ...reward,
    },
  };
}

export function getGuildNoticeBoardRewardPreview(quest: GuildNoticeBoardQuest, rewardPercent: number) {
  const reward = quest.rewards;
  const books = quest.schemaVersion === 2 && reward.skillBookItemIds
    ? [...reward.skillBookItemIds, ...((reward.bonusBookRoll ?? 1) * 100 < rewardPercent - 100 && reward.bonusSkillBookItemId ? [reward.bonusSkillBookItemId] : [])]
    : Array.from({ length: getScaledItemRewardCount(rewardPercent, quest.sequence) }, () => reward.skillBookItemId);
  return { crowns: Math.floor(reward.crowns * rewardPercent / 100), characterXp: quest.schemaVersion === 2 ? reward.characterXp ?? 0 : 0, skillBookItemIds: books };
}

function isValidModernReward(reward: GuildNoticeBoardQuestReward | undefined): boolean {
  return Boolean(reward && Number.isSafeInteger(reward.characterXp) && reward.characterXp! >= 0 &&
    Number.isSafeInteger(reward.crowns) && reward.crowns >= 0 &&
    Array.isArray(reward.skillBookItemIds) && reward.skillBookItemIds.length === 2 &&
    reward.skillBookItemIds.every(id => FIRST_CLASS_BOARD_BOOKS.includes(id)) &&
    reward.bonusSkillBookItemId && FIRST_CLASS_BOARD_BOOKS.includes(reward.bonusSkillBookItemId) &&
    Number.isFinite(reward.bonusBookRoll) && reward.bonusBookRoll! >= 0 && reward.bonusBookRoll! < 1);
}

function areValidModernObjectives(quest: GuildNoticeBoardQuest): boolean {
  if (!Array.isArray(quest.objectives) || quest.objectives.length !== 1) return false;
  const objective = quest.objectives[0];
  const expected = { assault: "zone_kills", extermination: "enemy_kills", rummage: "quest_drop", forage: "gather_resources" };
  if (!objective || objective.type !== expected[quest.category as keyof typeof expected]) return false;
  if (objective.type === "quest_drop" && (typeof objective.itemDisplayName !== "string" || !objective.itemDisplayName)) return false;
  const types = getBoardObjectiveEnemyTypes(objective);
  return objective.type === "gather_resources" || (Array.isArray(types) && types.length > 0 && types.every(id => getBoardZoneMonsterTypes(quest.targetMapId!).includes(id)));
}

export function recordResourceGatheredForGuildNoticeBoard(state: GameState, mapId: DebugMapId, resourceType: ResourceType, quantity: number): GameState {
  if (!["wood", "ore", "herb"].includes(resourceType) || !Number.isFinite(quantity) || quantity <= 0) return state;
  return progressBoardObjectives(state, (quest, objective) => quest.targetMapId === mapId && objective.type === "gather_resources" ? Math.floor(quantity) : 0);
}

function progressBoardObjectives(state: GameState, amount: (quest: GuildNoticeBoardQuest, objective: GuildNoticeBoardQuestObjective) => number): GameState {
  const board = getGuildNoticeBoardState(state);
  let changed = false;
  const slots = board.slots.map(quest => {
    if (!quest || quest.status !== "taken") return quest;
    const objectives = quest.objectives.map(objective => updateObjectiveForEnemyCount(objective, amount(quest, objective)));
    if (objectives.every((objective, index) => objective === quest.objectives[index])) return quest;
    changed = true;
    return { ...quest, objectives, status: areObjectivesComplete(objectives) ? "done" as const : quest.status };
  });
  return changed ? { ...state, guildNoticeBoard: { ...board, slots, hasSeenCurrentRefresh: false } } : state;
}

export function getGuildNoticeBoardPouchEntries(board: GuildNoticeBoardState | undefined) {
  return (board?.slots ?? []).flatMap(quest => !quest || quest.rewardClaimedAtMs !== null || quest.status === "available" ? [] : quest.objectives.flatMap(objective =>
    objective.type === "quest_drop" && objective.currentCount > 0 ? [{ key: `${quest.id}:${objective.id}`, questDisplayName: quest.title, displayName: objective.itemDisplayName, quantity: objective.currentCount, requiredCount: objective.requiredCount }] : []));
}

/** Explicit one-time restoration migration; never called by a read model. */
export function restoreGuildNoticeBoard(state: GameState, now = Date.now(), random = Math.random): GameState {
  const board = state.guildNoticeBoard ? sanitizeGuildNoticeBoardState(state.guildNoticeBoard, now, state) : createInitialGuildNoticeBoardState(now, state, random);
  const slots = board.slots.map(quest => quest?.isStarterContract && quest.status === "available" && quest.schemaVersion !== 2
    ? { ...createStarterGuildNoticeBoardQuest(quest.generatedAtMs, random), id: quest.id } : quest);
  return refreshGuildNoticeBoardState({ ...state, guildNoticeBoard: { ...board, slots } }, now, random);
}

function canRefreshSlot(slot: GuildNoticeBoardQuest | null): boolean {
  if (slot?.isStarterContract && slot.status === "available") {
    return false;
  }

  return (
    slot === null ||
    slot.status === "available" ||
    (slot.status === "done" && slot.rewardClaimedAtMs !== null)
  );
}

function sanitizeQuestStatus(
  status: GuildNoticeBoardQuestStatus | undefined,
): GuildNoticeBoardQuestStatus {
  return status === "taken" || status === "done" ? status : "available";
}

function sanitizeSequence(sequence: number | undefined): number {
  return Number.isFinite(sequence) ? Math.max(1, Math.floor(sequence ?? 1)) : 1;
}

function sanitizeTimestamp(timestamp: number | undefined, fallback: number): number {
  return Number.isFinite(timestamp) ? Math.max(0, timestamp ?? fallback) : fallback;
}

function sanitizeDayStartTimestamp(
  timestamp: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(timestamp) ? Math.floor(timestamp ?? fallback) : fallback;
}

function sanitizeNullableTimestamp(timestamp: number | null | undefined): number | null {
  return Number.isFinite(timestamp) ? Math.max(0, timestamp ?? 0) : null;
}

function getNoticeBoardRefreshIntervalMs(state?: GameState): number {
  return state
    ? getGuildNoticeBoardRefreshIntervalMs(state)
    : GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS;
}

function resetGuildNoticeBoardRerollDayIfNeeded(
  board: GuildNoticeBoardState,
  nowMs: number,
): GuildNoticeBoardState {
  const dayStartMs = getLocalDayStartMs(nowMs);

  if (board.rerollDayStartMs === dayStartMs) {
    return board;
  }

  return {
    ...board,
    rerollsUsedToday: 0,
    rerollDayStartMs: dayStartMs,
  };
}

function getLocalDayStartMs(nowMs: number): number {
  const date = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function getNextLocalDayStartMs(nowMs: number): number {
  const date = new Date(getLocalDayStartMs(nowMs));
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function getScaledItemRewardCount(rewardPercent: number, sequence: number): number {
  const wholeItems = Math.max(0, Math.floor(rewardPercent / 100));
  const remainderChance = Math.max(0, Math.floor(rewardPercent % 100));
  const extraItem =
    remainderChance > 0 && getRewardChanceRoll(sequence) < remainderChance
      ? 1
      : 0;

  return wholeItems + extraItem;
}

function getRewardChanceRoll(sequence: number): number {
  return Math.abs(sequence * 37 + 17) % 100;
}
