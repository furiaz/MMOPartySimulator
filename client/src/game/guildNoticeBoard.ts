import { addItemToInventoryState } from "./inventory";
import { getDirectEnemyKillCredit } from "./directKillCredit";
import { getItemDefinition } from "./items";
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
};

export type GuildNoticeBoardRerollResult =
  | {
      ok: true;
      state: GameState;
      claimedRewards: GuildNoticeBoardClaimedReward[];
      rerollsRemaining: number;
    }
  | {
      ok: false;
      state: GameState;
      claimedRewards: GuildNoticeBoardClaimedReward[];
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

export function formatGuildNoticeBoardQuestTitle(
  category: GuildNoticeBoardQuestCategory,
  zoneDisplayName: string,
  enemyDisplayName?: string,
): string {
  return category === "assault"
    ? `Assault on ${zoneDisplayName}`
    : `${enemyDisplayName ?? "Enemy"} Extermination in ${zoneDisplayName}`;
}

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
): GuildNoticeBoardState {
  const slotCount = getGuildNoticeBoardSlotCount(state);
  const regularSlotCount = Math.max(0, slotCount - 1);
  return {
    slots: [
      createStarterGuildNoticeBoardQuest(nowMs),
      ...Array.from({ length: regularSlotCount }, (_, index) =>
        createGuildNoticeBoardQuest(index + 1, nowMs),
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
  nowMs = Date.now(),
): GuildNoticeBoardState {
  return refreshGuildNoticeBoardState(state, nowMs).guildNoticeBoard ??
    createInitialGuildNoticeBoardState(nowMs, state);
}

export function refreshGuildNoticeBoardState(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const hadGuildNoticeBoard = Boolean(state.guildNoticeBoard);
  const board = resetGuildNoticeBoardRerollDayIfNeeded(
    sanitizeGuildNoticeBoardState(state.guildNoticeBoard, nowMs, state),
    nowMs,
  );

  if (board.nextRefreshAtMs > nowMs) {
    return hadGuildNoticeBoard ? { ...state, guildNoticeBoard: board } : state;
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
    return [createGuildNoticeBoardQuest(sequence, nowMs)];
  });

  while (slots.length < configuredSlotCount) {
    sequence += 1;
    changedSlot = true;
    slots.push(createGuildNoticeBoardQuest(sequence, nowMs));
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
  let nextState = refreshGuildNoticeBoardState(state, nowMs);
  let board = getGuildNoticeBoardState(nextState, nowMs);
  const claimedRewards: GuildNoticeBoardClaimedReward[] = [];
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
    );
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
  };
}

export function takeGuildNoticeBoardQuest(
  state: GameState,
  nowMs = Date.now(),
  slotIndex?: number,
): GuildNoticeBoardTakeResult {
  const refreshedState = refreshGuildNoticeBoardState(state, nowMs);
  const board = getGuildNoticeBoardState(refreshedState, nowMs);
  const targetSlotIndex =
    slotIndex ?? board.slots.findIndex((slot) => slot?.status === "available");

  if (targetSlotIndex < 0) {
    return { ok: false, state: refreshedState, reason: "no_available_quest" };
  }

  const slot = board.slots[targetSlotIndex];

  if (!slot) {
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
  const refreshedState = refreshGuildNoticeBoardState(state, nowMs);
  const board = getGuildNoticeBoardState(refreshedState, nowMs);
  const targetSlotIndex =
    slotIndex ?? board.slots.findIndex((slot) => slot?.status === "taken");

  if (targetSlotIndex < 0) {
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
      reason: "no_rerolls",
    };
  }

  let sequence = board.questSequence;
  let changedSlot = false;
  const configuredSlotCount = getGuildNoticeBoardSlotCount(nextState);
  const slots = board.slots.flatMap((slot) => {
    if (
      slot?.status === "taken" ||
      (slot?.isStarterContract && slot.status === "available")
    ) {
      return [slot];
    }

    if (slot?.isStarterContract && board.slots.length > configuredSlotCount) {
      changedSlot = true;
      return [];
    }

    sequence += 1;
    changedSlot = true;
    return [createGuildNoticeBoardQuest(sequence, nowMs)];
  });

  while (slots.length < configuredSlotCount) {
    sequence += 1;
    changedSlot = true;
    slots.push(createGuildNoticeBoardQuest(sequence, nowMs));
  }

  if (!changedSlot) {
    return {
      ok: false,
      state: {
        ...nextState,
        guildNoticeBoard: board,
      },
      claimedRewards: opened.claimedRewards,
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
): GameState {
  if (defeatedEnemy.state !== "dead" || !defeatedEnemy.enemyTypeId) {
    return state;
  }

  const defeatedEnemyTypeId = defeatedEnemy.enemyTypeId;
  const killCredit = getDirectEnemyKillCredit(defeatedEnemy);
  const board = sanitizeGuildNoticeBoardState(state.guildNoticeBoard, undefined, state);
  let changed = false;
  const slots = board.slots.map((slot) => {
    if (!slot || slot.status !== "taken") {
      return slot;
    }

    let progressed = false;
    const objectives = slot.objectives.map((objective) => {
      const nextObjective = updateObjectiveForEnemy(
        objective,
        defeatedEnemyTypeId,
        killCredit,
      );
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

export function recordEnemyDefeatsForGuildNoticeBoard(
  state: GameState,
  defeats: Array<{ enemyTypeId: EnemyTypeId; quantity: number }>,
): GameState {
  const countByEnemyTypeId = new Map<EnemyTypeId, number>();

  for (const defeat of defeats) {
    const quantity = Math.max(0, Math.floor(defeat.quantity));

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

  const board = sanitizeGuildNoticeBoardState(state.guildNoticeBoard, undefined, state);
  let changed = false;
  const slots = board.slots.map((slot) => {
    if (!slot || slot.status !== "taken") {
      return slot;
    }

    let progressed = false;
    const objectives = slot.objectives.map((objective) => {
      const defeatCount = countByEnemyTypeId.get(objective.enemyTypeId) ?? 0;
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
    return createInitialGuildNoticeBoardState(nowMs, state);
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

      maxSequence += 1;
      return createGuildNoticeBoardQuest(maxSequence, nowMs);
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
    rerollsUsedToday: Math.max(
      0,
      Math.floor(guildNoticeBoard.rerollsUsedToday ?? 0),
    ),
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
): GuildNoticeBoardQuest {
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

  const isStarterContract =
    quest.isStarterContract === true ||
    quest.id === GUILD_NOTICE_BOARD_STARTER_QUEST_ID;
  const fallbackQuest = isStarterContract
    ? createStarterGuildNoticeBoardQuest(nowMs)
    : createGuildNoticeBoardQuest(fallbackSequence, nowMs);
  const status = sanitizeQuestStatus(quest.status);
  const objectives = sanitizeObjectives(quest.objectives, fallbackQuest.objectives);
  const reward = sanitizeReward(quest.rewards, fallbackQuest.rewards);
  return {
    ...fallbackQuest,
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
    status,
    generatedAtMs: sanitizeTimestamp(quest.generatedAtMs, nowMs),
    takenAtMs:
      status === "available" ? null : sanitizeNullableTimestamp(quest.takenAtMs),
    levelAnchor: null,
    levelRange: null,
    objectives,
    rewards: reward,
    rewardClaimedAtMs: sanitizeNullableTimestamp(quest.rewardClaimedAtMs),
  };
}

function sanitizeObjectives(
  objectives: GuildNoticeBoardQuestObjective[] | undefined,
  fallbackObjectives: GuildNoticeBoardQuestObjective[],
): GuildNoticeBoardQuestObjective[] {
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return fallbackObjectives;
  }

  return fallbackObjectives.map((fallbackObjective) => {
    const savedObjective = objectives.find(
      (objective) => objective.id === fallbackObjective.id,
    );

    return {
      ...fallbackObjective,
      currentCount: Math.min(
        fallbackObjective.requiredCount,
        Math.max(0, Math.floor(savedObjective?.currentCount ?? 0)),
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

function updateObjectiveForEnemy(
  objective: GuildNoticeBoardQuestObjective,
  enemyTypeId: EnemyTypeId,
  amount: number,
): GuildNoticeBoardQuestObjective {
  if (
    objective.enemyTypeId !== enemyTypeId ||
    objective.currentCount >= objective.requiredCount
  ) {
    return objective;
  }

  return {
    ...objective,
    currentCount: Math.min(
      objective.requiredCount,
      objective.currentCount + amount,
    ),
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
): { state: GameState; claimedReward: GuildNoticeBoardClaimedReward } {
  const crowns = Math.floor((quest.rewards.crowns * rewardPercent) / 100);
  const skillBookCount = getScaledItemRewardCount(
    rewardPercent,
    quest.sequence,
  );
  let nextState = addCurrencyToWalletState(
    state,
    "crowns",
    crowns,
    "quest_reward",
  ).state;
  nextState = addItemToInventoryState(
    nextState,
    quest.rewards.skillBookItemId,
    skillBookCount,
    "quest_reward",
  ).state;

  return {
    state: nextState,
    claimedReward: {
      questTitle: quest.title,
      crowns,
      skillBookItemIds: Array.from(
        { length: skillBookCount },
        () => quest.rewards.skillBookItemId,
      ),
    },
  };
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
