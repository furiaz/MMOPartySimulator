import type { GameState } from "./state";
import type {
  GuildNoticeBoardUpgradeId,
  GuildNoticeBoardUpgradeLevels,
  GuildRecruitUpgradeId,
  GuildRecruitUpgradeLevels,
  GuildSecondaryPartyPerPartyUpgradeId,
  GuildSecondaryPartyUpgradeId,
  GuildSecondaryPartyUpgradeLevels,
  GuildUpgradesState,
} from "./types";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";
import { getPartySizeLimit } from "./leveling";

export const GUILD_RECRUIT_UPGRADE_MAX_LEVEL = 3;
export const GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL = 3;
export const GUILD_SECONDARY_PARTY_COUNT_MAX_LEVEL = 3;
export const GUILD_SECONDARY_PARTY_MEMBER_MAX_LEVEL = 5;
export const GUILD_SECONDARY_PARTY_EFFICIENCY_MAX_LEVEL = 11;
export const GUILD_SECONDARY_PARTY_DURATION_MAX_LEVEL = 22;

export const GUILD_SECONDARY_PARTY_UPGRADE_IDS: GuildSecondaryPartyUpgradeId[] = [
  "secondary_party_count",
  "secondary_party_members",
  "secondary_party_experience_efficiency",
  "secondary_party_drop_efficiency",
  "secondary_party_assignment_duration",
];

export const GUILD_SECONDARY_PARTY_PER_PARTY_UPGRADE_IDS: GuildSecondaryPartyPerPartyUpgradeId[] = [
  "secondary_party_members",
  "secondary_party_experience_efficiency",
  "secondary_party_drop_efficiency",
  "secondary_party_assignment_duration",
];

export type GuildRecruitUpgradePurchaseFailureReason =
  | "unknown_upgrade"
  | "max_level"
  | "locked"
  | "insufficient_crowns";

export type GuildRecruitUpgradePurchaseResult =
  | {
      ok: true;
      state: GameState;
      upgradeId: GuildRecruitUpgradeId;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      upgradeId: GuildRecruitUpgradeId;
      reason: GuildRecruitUpgradePurchaseFailureReason;
      currentLevel: number;
      costCrowns: number | null;
    };

export type GuildRecruitUpgradeStatus = {
  id: GuildRecruitUpgradeId;
  displayName: string;
  description: string;
  level: number;
  maxLevel: number;
  currentEffect: string;
  nextEffect: string | null;
  nextCostCrowns: number | null;
  isLocked: boolean;
  isMaxLevel: boolean;
  lockReason: string | null;
  canAfford: boolean;
};

export type GuildNoticeBoardUpgradePurchaseFailureReason =
  | "unknown_upgrade"
  | "max_level"
  | "insufficient_crowns";

export type GuildNoticeBoardUpgradePurchaseResult =
  | {
      ok: true;
      state: GameState;
      upgradeId: GuildNoticeBoardUpgradeId;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      upgradeId: GuildNoticeBoardUpgradeId;
      reason: GuildNoticeBoardUpgradePurchaseFailureReason;
      currentLevel: number;
      costCrowns: number | null;
    };

export type GuildNoticeBoardUpgradeStatus = {
  id: GuildNoticeBoardUpgradeId;
  displayName: string;
  description: string;
  level: number;
  maxLevel: number;
  currentEffect: string;
  nextEffect: string | null;
  nextCostCrowns: number | null;
  isLocked: boolean;
  isMaxLevel: boolean;
  lockReason: string | null;
  canAfford: boolean;
};

export type GuildSecondaryPartyUpgradePurchaseFailureReason =
  | "unknown_upgrade"
  | "unknown_party"
  | "missing_party"
  | "max_level"
  | "locked"
  | "insufficient_crowns";

export type GuildSecondaryPartyUpgradePurchaseResult =
  | {
      ok: true;
      state: GameState;
      upgradeId: GuildSecondaryPartyUpgradeId;
      partyId: string | null;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      upgradeId: GuildSecondaryPartyUpgradeId;
      partyId: string | null;
      reason: GuildSecondaryPartyUpgradePurchaseFailureReason;
      currentLevel: number;
      costCrowns: number | null;
    };

export type GuildSecondaryPartyUpgradeStatus = {
  id: GuildSecondaryPartyUpgradeId;
  partyId: string | null;
  displayName: string;
  description: string;
  level: number;
  maxLevel: number;
  currentEffect: string;
  nextEffect: string | null;
  nextCostCrowns: number | null;
  isLocked: boolean;
  isMaxLevel: boolean;
  lockReason: string | null;
  canAfford: boolean;
};

type GuildRecruitUpgradeDefinition = {
  id: GuildRecruitUpgradeId;
  displayName: string;
  description: string;
  costsByNextLevel: Partial<Record<number, number>>;
  effectTextByLevel: Record<number, string>;
};

type GuildNoticeBoardUpgradeDefinition = {
  id: GuildNoticeBoardUpgradeId;
  displayName: string;
  description: string;
  costsByNextLevel: Partial<Record<number, number>>;
  effectTextByLevel: Record<number, string>;
};

type GuildSecondaryPartyUpgradeDefinition = {
  id: GuildSecondaryPartyUpgradeId;
  displayName: string;
  description: string;
  maxLevel: number;
  getCostForNextLevel: (nextLevel: number, partyNumber: number) => number | null;
  getEffectText: (level: number) => string;
};

export const GUILD_RECRUIT_UPGRADE_IDS: GuildRecruitUpgradeId[] = [
  "recruit_slots",
  "recruit_max_level",
  "recruit_min_level",
  "recruit_refresh_rate",
  "recruit_equipment_chance",
  "recruit_skill_chance",
];

export const GUILD_NOTICE_BOARD_UPGRADE_IDS: GuildNoticeBoardUpgradeId[] = [
  "notice_board_slots",
  "notice_board_reward_quality",
  "notice_board_refresh_rate",
  "notice_board_scouts",
];

const GUILD_RECRUIT_UPGRADE_DEFINITIONS: Record<
  GuildRecruitUpgradeId,
  GuildRecruitUpgradeDefinition
> = {
  recruit_slots: {
    id: "recruit_slots",
    displayName: "Recruit Slots",
    description: "Show more recruit candidates at once.",
    costsByNextLevel: {
      2: 500,
      3: 1500,
    },
    effectTextByLevel: {
      1: "1 candidate",
      2: "2 candidates",
      3: "3 candidates",
    },
  },
  recruit_max_level: {
    id: "recruit_max_level",
    displayName: "Recruit Max Level",
    description: "Raises the highest level a recruit can arrive at.",
    costsByNextLevel: {
      2: 150,
      3: 300,
    },
    effectTextByLevel: {
      1: "Max Lv 1",
      2: "Max Lv 2",
      3: "Max Lv 3",
    },
  },
  recruit_min_level: {
    id: "recruit_min_level",
    displayName: "Recruit Min Level",
    description: "Raises the lowest level a recruit can arrive at.",
    costsByNextLevel: {
      2: 300,
      3: 450,
    },
    effectTextByLevel: {
      1: "Min Lv 1",
      2: "Min Lv 2",
      3: "Min Lv 3",
    },
  },
  recruit_refresh_rate: {
    id: "recruit_refresh_rate",
    displayName: "Refresh Rate",
    description: "Reduces the shared recruit refresh timer.",
    costsByNextLevel: {
      2: 100,
      3: 200,
    },
    effectTextByLevel: {
      1: "180 min",
      2: "179 min",
      3: "178 min",
    },
  },
  recruit_equipment_chance: {
    id: "recruit_equipment_chance",
    displayName: "Recruit Equipment Chance",
    description: "Improves the chance recruits arrive with equipment.",
    costsByNextLevel: {
      2: 250,
      3: 500,
    },
    effectTextByLevel: {
      1: "50%",
      2: "100%",
      3: "150%",
    },
  },
  recruit_skill_chance: {
    id: "recruit_skill_chance",
    displayName: "Recruit Skill Chance",
    description: "Improves the chance recruits arrive with boosted Beginner skills.",
    costsByNextLevel: {
      2: 250,
      3: 500,
    },
    effectTextByLevel: {
      1: "50%",
      2: "100%",
      3: "150%",
    },
  },
};

const GUILD_NOTICE_BOARD_UPGRADE_DEFINITIONS: Record<
  GuildNoticeBoardUpgradeId,
  GuildNoticeBoardUpgradeDefinition
> = {
  notice_board_slots: {
    id: "notice_board_slots",
    displayName: "Quest Slots",
    description: "Shows more Notice Board quests at once.",
    costsByNextLevel: {
      2: 750,
      3: 2000,
    },
    effectTextByLevel: {
      1: "1 posting",
      2: "2 postings",
      3: "3 postings",
    },
  },
  notice_board_reward_quality: {
    id: "notice_board_reward_quality",
    displayName: "Reward Quality",
    description: "Improves Crowns and the chance of an independent third book; character XP is unchanged.",
    costsByNextLevel: {
      2: 300,
      3: 750,
    },
    effectTextByLevel: {
      1: "100%",
      2: "110%",
      3: "120%",
    },
  },
  notice_board_refresh_rate: {
    id: "notice_board_refresh_rate",
    displayName: "Refresh Rate",
    description: "Reduces the shared Notice Board refresh timer.",
    costsByNextLevel: {
      2: 100,
      3: 200,
    },
    effectTextByLevel: {
      1: "180 min",
      2: "179 min",
      3: "178 min",
    },
  },
  notice_board_scouts: {
    id: "notice_board_scouts",
    displayName: "Scouts",
    description: "Unlocks board-wide rerolls and daily reroll uses.",
    costsByNextLevel: {
      1: 500,
      2: 1000,
      3: 2000,
    },
    effectTextByLevel: {
      0: "Locked",
      1: "1 reroll/day",
      2: "2 rerolls/day",
      3: "3 rerolls/day",
    },
  },
};

const GUILD_SECONDARY_PARTY_UPGRADE_DEFINITIONS: Record<
  GuildSecondaryPartyUpgradeId,
  GuildSecondaryPartyUpgradeDefinition
> = {
  secondary_party_count: {
    id: "secondary_party_count",
    displayName: "Number of Field Teams",
    description: "Unlocks additional Field Teams.",
    maxLevel: GUILD_SECONDARY_PARTY_COUNT_MAX_LEVEL,
    getCostForNextLevel: (nextLevel) =>
      ({ 1: 1, 2: 5000, 3: 30000 })[nextLevel] ?? null,
    getEffectText: (level) => `${level} parties`,
  },
  secondary_party_members: {
    id: "secondary_party_members",
    displayName: "Field Team Members",
    description: "Increases this Field Team's member capacity.",
    maxLevel: GUILD_SECONDARY_PARTY_MEMBER_MAX_LEVEL,
    getCostForNextLevel: (nextLevel, partyNumber) => {
      const baseCost = ({ 2: 500, 3: 1000, 4: 3000, 5: 20000 })[nextLevel];

      return baseCost ? baseCost * partyNumber : null;
    },
    getEffectText: (level) => `${level} members`,
  },
  secondary_party_experience_efficiency: {
    id: "secondary_party_experience_efficiency",
    displayName: "EXP Efficiency",
    description: "Improves this Field Team's assignment EXP gain.",
    maxLevel: GUILD_SECONDARY_PARTY_EFFICIENCY_MAX_LEVEL,
    getCostForNextLevel: (nextLevel, partyNumber) =>
      nextLevel >= 2 && nextLevel <= GUILD_SECONDARY_PARTY_EFFICIENCY_MAX_LEVEL
        ? (100 + (nextLevel - 2) * 50) * partyNumber
        : null,
    getEffectText: (level) => `${formatMultiplier(getGuildSecondaryPartyEfficiencyForLevel(level))}x`,
  },
  secondary_party_drop_efficiency: {
    id: "secondary_party_drop_efficiency",
    displayName: "Drop Efficiency",
    description: "Improves this Field Team's assignment loot gain.",
    maxLevel: GUILD_SECONDARY_PARTY_EFFICIENCY_MAX_LEVEL,
    getCostForNextLevel: (nextLevel, partyNumber) =>
      nextLevel >= 2 && nextLevel <= GUILD_SECONDARY_PARTY_EFFICIENCY_MAX_LEVEL
        ? (100 + (nextLevel - 2) * 50) * partyNumber
        : null,
    getEffectText: (level) => `${formatMultiplier(getGuildSecondaryPartyEfficiencyForLevel(level))}x`,
  },
  secondary_party_assignment_duration: {
    id: "secondary_party_assignment_duration",
    displayName: "Assignment Duration",
    description: "Extends how long this Field Team can farm before capping.",
    maxLevel: GUILD_SECONDARY_PARTY_DURATION_MAX_LEVEL,
    getCostForNextLevel: (nextLevel, partyNumber) =>
      nextLevel >= 2 && nextLevel <= GUILD_SECONDARY_PARTY_DURATION_MAX_LEVEL
        ? (1000 + (nextLevel - 2) * 2000) * partyNumber
        : null,
    getEffectText: (level) => formatDurationMinutes(getGuildSecondaryPartyAssignmentDurationMinutesForLevel(level)),
  },
};

export function createInitialGuildUpgradesState(): GuildUpgradesState {
  return {
    recruit: createInitialGuildRecruitUpgradeLevels(),
    noticeBoard: createInitialGuildNoticeBoardUpgradeLevels(),
    secondaryParties: createInitialGuildSecondaryPartyUpgradeLevels(),
  };
}

export function getGuildUpgradesState(state: GameState): GuildUpgradesState {
  return sanitizeGuildUpgradesState(state.guildUpgrades);
}

export function sanitizeGuildUpgradesState(
  guildUpgrades: GuildUpgradesState | undefined,
): GuildUpgradesState {
  return {
    recruit: sanitizeGuildRecruitUpgradeLevels(guildUpgrades?.recruit),
    noticeBoard: sanitizeGuildNoticeBoardUpgradeLevels(guildUpgrades?.noticeBoard),
    secondaryParties: sanitizeGuildSecondaryPartyUpgradeLevels(
      guildUpgrades?.secondaryParties,
    ),
  };
}

export function getGuildRecruitUpgradeStatuses(
  state: GameState,
): GuildRecruitUpgradeStatus[] {
  const upgrades = getGuildUpgradesState(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return GUILD_RECRUIT_UPGRADE_IDS.map((upgradeId) => {
    const definition = GUILD_RECRUIT_UPGRADE_DEFINITIONS[upgradeId];
    const level = upgrades.recruit[upgradeId];
    const nextLevel =
      level >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL ? null : level + 1;
    const nextCostCrowns = nextLevel
      ? definition.costsByNextLevel[nextLevel] ?? null
      : null;
    const lockReason = getGuildRecruitUpgradeLockReason(upgrades, upgradeId);

    return {
      id: upgradeId,
      displayName: definition.displayName,
      description: definition.description,
      level,
      maxLevel: GUILD_RECRUIT_UPGRADE_MAX_LEVEL,
      currentEffect: definition.effectTextByLevel[level],
      nextEffect: nextLevel ? definition.effectTextByLevel[nextLevel] : null,
      nextCostCrowns,
      isLocked: Boolean(lockReason),
      isMaxLevel: level >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL,
      lockReason,
      canAfford: nextCostCrowns !== null && crowns >= nextCostCrowns,
    };
  });
}

export function purchaseGuildRecruitUpgrade(
  state: GameState,
  upgradeId: GuildRecruitUpgradeId,
): GuildRecruitUpgradePurchaseResult {
  if (!GUILD_RECRUIT_UPGRADE_IDS.includes(upgradeId)) {
    return {
      ok: false,
      state,
      upgradeId,
      reason: "unknown_upgrade",
      currentLevel: 1,
      costCrowns: null,
    };
  }

  const upgrades = getGuildUpgradesState(state);
  const currentLevel = upgrades.recruit[upgradeId];
  const lockReason = getGuildRecruitUpgradeLockReason(upgrades, upgradeId);

  if (lockReason) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "locked",
      currentLevel,
      costCrowns: null,
    };
  }

  if (currentLevel >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "max_level",
      currentLevel,
      costCrowns: null,
    };
  }

  const nextLevel = currentLevel + 1;
  const costCrowns =
    GUILD_RECRUIT_UPGRADE_DEFINITIONS[upgradeId].costsByNextLevel[nextLevel];

  if (!costCrowns || !canAfford(state.wallet, "crowns", costCrowns)) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns: costCrowns ?? null,
    };
  }

  const currencyRemoval = removeCurrencyFromWalletState(
    {
      ...state,
      guildUpgrades: upgrades,
    },
    "crowns",
    costCrowns,
    "guild_upgrade",
  );

  if (currencyRemoval.result.status !== "success") {
    return {
      ok: false,
      state: currencyRemoval.state,
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns,
    };
  }

  return {
    ok: true,
    state: {
      ...currencyRemoval.state,
      guildUpgrades: {
        ...upgrades,
        recruit: {
          ...upgrades.recruit,
          [upgradeId]: nextLevel,
        },
      },
    },
    upgradeId,
    previousLevel: currentLevel,
    nextLevel,
    costCrowns,
  };
}

export function getGuildNoticeBoardUpgradeStatuses(
  state: GameState,
): GuildNoticeBoardUpgradeStatus[] {
  const upgrades = getGuildUpgradesState(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return GUILD_NOTICE_BOARD_UPGRADE_IDS.map((upgradeId) => {
    const definition = GUILD_NOTICE_BOARD_UPGRADE_DEFINITIONS[upgradeId];
    const level = upgrades.noticeBoard[upgradeId];
    const nextLevel =
      level >= GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL ? null : level + 1;
    const nextCostCrowns = nextLevel
      ? definition.costsByNextLevel[nextLevel] ?? null
      : null;

    return {
      id: upgradeId,
      displayName: definition.displayName,
      description: definition.description,
      level,
      maxLevel: GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL,
      currentEffect: definition.effectTextByLevel[level],
      nextEffect: nextLevel ? definition.effectTextByLevel[nextLevel] : null,
      nextCostCrowns,
      isLocked: false,
      isMaxLevel: level >= GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL,
      lockReason: null,
      canAfford: nextCostCrowns !== null && crowns >= nextCostCrowns,
    };
  });
}

export function purchaseGuildNoticeBoardUpgrade(
  state: GameState,
  upgradeId: GuildNoticeBoardUpgradeId,
): GuildNoticeBoardUpgradePurchaseResult {
  if (!GUILD_NOTICE_BOARD_UPGRADE_IDS.includes(upgradeId)) {
    return {
      ok: false,
      state,
      upgradeId,
      reason: "unknown_upgrade",
      currentLevel: upgradeId === "notice_board_scouts" ? 0 : 1,
      costCrowns: null,
    };
  }

  const upgrades = getGuildUpgradesState(state);
  const currentLevel = upgrades.noticeBoard[upgradeId];

  if (currentLevel >= GUILD_NOTICE_BOARD_UPGRADE_MAX_LEVEL) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "max_level",
      currentLevel,
      costCrowns: null,
    };
  }

  const nextLevel = currentLevel + 1;
  const costCrowns =
    GUILD_NOTICE_BOARD_UPGRADE_DEFINITIONS[upgradeId].costsByNextLevel[
      nextLevel
    ];

  if (!costCrowns || !canAfford(state.wallet, "crowns", costCrowns)) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns: costCrowns ?? null,
    };
  }

  const currencyRemoval = removeCurrencyFromWalletState(
    {
      ...state,
      guildUpgrades: upgrades,
    },
    "crowns",
    costCrowns,
    "guild_upgrade",
  );

  if (currencyRemoval.result.status !== "success") {
    return {
      ok: false,
      state: currencyRemoval.state,
      upgradeId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns,
    };
  }

  return {
    ok: true,
    state: {
      ...currencyRemoval.state,
      guildUpgrades: {
        ...upgrades,
        noticeBoard: {
          ...upgrades.noticeBoard,
          [upgradeId]: nextLevel,
        },
      },
    },
    upgradeId,
    previousLevel: currentLevel,
    nextLevel,
    costCrowns,
  };
}

export function getGuildSecondaryPartyUpgradeStatuses(
  state: GameState,
  partyId: string | null = null,
): GuildSecondaryPartyUpgradeStatus[] {
  const upgrades = getGuildUpgradesState(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");
  const ids: GuildSecondaryPartyUpgradeId[] = partyId
    ? GUILD_SECONDARY_PARTY_PER_PARTY_UPGRADE_IDS
    : ["secondary_party_count"];

  return ids.map((upgradeId) => {
    const definition = GUILD_SECONDARY_PARTY_UPGRADE_DEFINITIONS[upgradeId];
    const partyNumber = partyId ? getSecondaryPartyNumber(partyId) : 1;
    const level = getGuildSecondaryPartyUpgradeLevel(upgrades, upgradeId, partyId);
    const maxLevel = definition.maxLevel;
    const nextLevel = level >= maxLevel ? null : level + 1;
    const nextCostCrowns = nextLevel
      ? definition.getCostForNextLevel(nextLevel, partyNumber)
      : null;
    const lockReason = getGuildSecondaryPartyUpgradeLockReason(
      state,
      upgrades,
      upgradeId,
      partyId,
      nextLevel,
    );

    return {
      id: upgradeId,
      partyId,
      displayName: definition.displayName,
      description: definition.description,
      level,
      maxLevel,
      currentEffect: definition.getEffectText(level),
      nextEffect: nextLevel ? definition.getEffectText(nextLevel) : null,
      nextCostCrowns,
      isLocked: Boolean(lockReason),
      isMaxLevel: level >= maxLevel,
      lockReason,
      canAfford: nextCostCrowns !== null && crowns >= nextCostCrowns,
    };
  });
}

export function purchaseGuildSecondaryPartyUpgrade(
  state: GameState,
  upgradeId: GuildSecondaryPartyUpgradeId,
  partyId: string | null = null,
): GuildSecondaryPartyUpgradePurchaseResult {
  if (!GUILD_SECONDARY_PARTY_UPGRADE_IDS.includes(upgradeId)) {
    return {
      ok: false,
      state,
      upgradeId,
      partyId,
      reason: "unknown_upgrade",
      currentLevel: 0,
      costCrowns: null,
    };
  }

  if (upgradeId !== "secondary_party_count" && !partyId) {
    return {
      ok: false,
      state,
      upgradeId,
      partyId,
      reason: "missing_party",
      currentLevel: 1,
      costCrowns: null,
    };
  }

  const upgrades = getGuildUpgradesState(state);
  const currentLevel = getGuildSecondaryPartyUpgradeLevel(
    upgrades,
    upgradeId,
    partyId,
  );
  const definition = GUILD_SECONDARY_PARTY_UPGRADE_DEFINITIONS[upgradeId];
  const maxLevel = definition.maxLevel;
  const nextLevel = currentLevel + 1;
  const partyNumber = partyId ? getSecondaryPartyNumber(partyId) : 1;
  const lockReason = getGuildSecondaryPartyUpgradeLockReason(
    state,
    upgrades,
    upgradeId,
    partyId,
    nextLevel,
  );

  if (lockReason) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      partyId,
      reason: "locked",
      currentLevel,
      costCrowns: null,
    };
  }

  if (currentLevel >= maxLevel) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      partyId,
      reason: "max_level",
      currentLevel,
      costCrowns: null,
    };
  }

  const costCrowns = definition.getCostForNextLevel(nextLevel, partyNumber);

  if (!costCrowns || !canAfford(state.wallet, "crowns", costCrowns)) {
    return {
      ok: false,
      state: {
        ...state,
        guildUpgrades: upgrades,
      },
      upgradeId,
      partyId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns,
    };
  }

  const currencyRemoval = removeCurrencyFromWalletState(
    {
      ...state,
      guildUpgrades: upgrades,
    },
    "crowns",
    costCrowns,
    "guild_upgrade",
  );

  if (currencyRemoval.result.status !== "success") {
    return {
      ok: false,
      state: currencyRemoval.state,
      upgradeId,
      partyId,
      reason: "insufficient_crowns",
      currentLevel,
      costCrowns,
    };
  }

  return {
    ok: true,
    state: {
      ...currencyRemoval.state,
      guildUpgrades: setGuildSecondaryPartyUpgradeLevel(
        upgrades,
        upgradeId,
        partyId,
        nextLevel,
      ),
    },
    upgradeId,
    partyId,
    previousLevel: currentLevel,
    nextLevel,
    costCrowns,
  };
}

export function getGuildRecruitSlotCount(state: GameState): number {
  return getGuildUpgradesState(state).recruit.recruit_slots;
}

export function getGuildRecruitLevelRange(state: GameState): {
  min: number;
  max: number;
} {
  const upgrades = getGuildUpgradesState(state).recruit;
  const max = upgrades.recruit_max_level;
  const min =
    upgrades.recruit_max_level >= GUILD_RECRUIT_UPGRADE_MAX_LEVEL
      ? Math.min(upgrades.recruit_min_level, max)
      : 1;

  return {
    min,
    max,
  };
}

export function getGuildRecruitRefreshIntervalMs(state: GameState): number {
  const level = getGuildUpgradesState(state).recruit.recruit_refresh_rate;

  return (181 - level) * 60 * 1000;
}

export function getGuildRecruitEquipmentChancePercent(state: GameState): number {
  return getGuildUpgradesState(state).recruit.recruit_equipment_chance * 50;
}

export function getGuildRecruitSkillChancePercent(state: GameState): number {
  return getGuildUpgradesState(state).recruit.recruit_skill_chance * 50;
}

export function getGuildNoticeBoardSlotCount(state?: GameState): number {
  return state ? getGuildUpgradesState(state).noticeBoard.notice_board_slots : 1;
}

export function getGuildNoticeBoardRefreshIntervalMs(state?: GameState): number {
  const level = state
    ? getGuildUpgradesState(state).noticeBoard.notice_board_refresh_rate
    : 1;

  return (181 - level) * 60 * 1000;
}

export function getGuildNoticeBoardRewardPercent(state: GameState): number {
  const level = getGuildUpgradesState(state).noticeBoard
    .notice_board_reward_quality;

  return 90 + level * 10;
}

export function getGuildNoticeBoardDailyRerollLimit(state: GameState): number {
  return getGuildUpgradesState(state).noticeBoard.notice_board_scouts;
}

export function getGuildSecondaryPartyCount(state: GameState): number {
  return getGuildUpgradesState(state).secondaryParties.secondary_party_count;
}

export function getGuildSecondaryPartyMemberSlotCount(
  state: GameState,
  partyId: string,
): number {
  const level = getGuildSecondaryPartyPerPartyUpgradeLevels(
    state,
    partyId,
  ).secondary_party_members;

  return Math.min(level, getPartySizeLimit(state));
}

export function getGuildSecondaryPartyExperienceEfficiency(
  state: GameState,
  partyId: string,
): number {
  return getGuildSecondaryPartyEfficiencyForLevel(
    getGuildSecondaryPartyPerPartyUpgradeLevels(
      state,
      partyId,
    ).secondary_party_experience_efficiency,
  );
}

export function getGuildSecondaryPartyDropEfficiency(
  state: GameState,
  partyId: string,
): number {
  return getGuildSecondaryPartyEfficiencyForLevel(
    getGuildSecondaryPartyPerPartyUpgradeLevels(
      state,
      partyId,
    ).secondary_party_drop_efficiency,
  );
}

export function getGuildSecondaryPartyAssignmentDurationMs(
  state: GameState,
  partyId: string,
): number {
  const minutes = getGuildSecondaryPartyAssignmentDurationMinutesForLevel(
    getGuildSecondaryPartyPerPartyUpgradeLevels(
      state,
      partyId,
    ).secondary_party_assignment_duration,
  );

  return minutes * 60 * 1000;
}

export function getGuildSecondaryPartyPerPartyUpgradeLevels(
  state: GameState,
  partyId: string,
): Record<GuildSecondaryPartyPerPartyUpgradeId, number> {
  const upgrades = getGuildUpgradesState(state).secondaryParties;

  return sanitizeGuildSecondaryPartyPerPartyUpgradeLevels(
    upgrades.parties[partyId],
  );
}

function createInitialGuildRecruitUpgradeLevels(): GuildRecruitUpgradeLevels {
  return {
    recruit_slots: 1,
    recruit_max_level: 1,
    recruit_min_level: 1,
    recruit_refresh_rate: 1,
    recruit_equipment_chance: 1,
    recruit_skill_chance: 1,
  };
}

function createInitialGuildNoticeBoardUpgradeLevels(): GuildNoticeBoardUpgradeLevels {
  return {
    notice_board_slots: 1,
    notice_board_reward_quality: 1,
    notice_board_refresh_rate: 1,
    notice_board_scouts: 0,
  };
}

function createInitialGuildSecondaryPartyUpgradeLevels(): GuildSecondaryPartyUpgradeLevels {
  return {
    secondary_party_count: 0,
    parties: Object.fromEntries(
      [1, 2, 3].map((partyNumber) => [
        getSecondaryPartyIdForNumber(partyNumber),
        createInitialGuildSecondaryPartyPerPartyUpgradeLevels(),
      ]),
    ),
  };
}

function createInitialGuildSecondaryPartyPerPartyUpgradeLevels(): Record<
  GuildSecondaryPartyPerPartyUpgradeId,
  number
> {
  return {
    secondary_party_members: 1,
    secondary_party_experience_efficiency: 1,
    secondary_party_drop_efficiency: 1,
    secondary_party_assignment_duration: 1,
  };
}

function sanitizeGuildRecruitUpgradeLevels(
  levels: Partial<GuildRecruitUpgradeLevels> | undefined,
): GuildRecruitUpgradeLevels {
  const defaults = createInitialGuildRecruitUpgradeLevels();

  return Object.fromEntries(
    GUILD_RECRUIT_UPGRADE_IDS.map((upgradeId) => [
      upgradeId,
      sanitizeUpgradeLevel(levels?.[upgradeId], defaults[upgradeId]),
    ]),
  ) as GuildRecruitUpgradeLevels;
}

function sanitizeGuildNoticeBoardUpgradeLevels(
  levels: Partial<GuildNoticeBoardUpgradeLevels> | undefined,
): GuildNoticeBoardUpgradeLevels {
  const defaults = createInitialGuildNoticeBoardUpgradeLevels();

  return Object.fromEntries(
    GUILD_NOTICE_BOARD_UPGRADE_IDS.map((upgradeId) => [
      upgradeId,
      sanitizeUpgradeLevelWithMinimum(
        levels?.[upgradeId],
        defaults[upgradeId],
        upgradeId === "notice_board_scouts" ? 0 : 1,
      ),
    ]),
  ) as GuildNoticeBoardUpgradeLevels;
}

function sanitizeGuildSecondaryPartyUpgradeLevels(
  levels: Partial<GuildSecondaryPartyUpgradeLevels> | undefined,
): GuildSecondaryPartyUpgradeLevels {
  const defaults = createInitialGuildSecondaryPartyUpgradeLevels();

  return {
    secondary_party_count: sanitizeUpgradeLevelWithMinimum(
      levels?.secondary_party_count,
      defaults.secondary_party_count,
      0,
      GUILD_SECONDARY_PARTY_COUNT_MAX_LEVEL,
    ),
    parties: Object.fromEntries(
      [1, 2, 3].map((partyNumber) => {
        const partyId = getSecondaryPartyIdForNumber(partyNumber);

        return [
          partyId,
          sanitizeGuildSecondaryPartyPerPartyUpgradeLevels(
            levels?.parties?.[partyId],
          ),
        ];
      }),
    ),
  };
}

function sanitizeGuildSecondaryPartyPerPartyUpgradeLevels(
  levels:
    | Partial<Record<GuildSecondaryPartyPerPartyUpgradeId, number>>
    | undefined,
): Record<GuildSecondaryPartyPerPartyUpgradeId, number> {
  const defaults = createInitialGuildSecondaryPartyPerPartyUpgradeLevels();

  return {
    secondary_party_members: sanitizeUpgradeLevelWithMinimum(
      levels?.secondary_party_members,
      defaults.secondary_party_members,
      1,
      GUILD_SECONDARY_PARTY_MEMBER_MAX_LEVEL,
    ),
    secondary_party_experience_efficiency: sanitizeUpgradeLevelWithMinimum(
      levels?.secondary_party_experience_efficiency,
      defaults.secondary_party_experience_efficiency,
      1,
      GUILD_SECONDARY_PARTY_EFFICIENCY_MAX_LEVEL,
    ),
    secondary_party_drop_efficiency: sanitizeUpgradeLevelWithMinimum(
      levels?.secondary_party_drop_efficiency,
      defaults.secondary_party_drop_efficiency,
      1,
      GUILD_SECONDARY_PARTY_EFFICIENCY_MAX_LEVEL,
    ),
    secondary_party_assignment_duration: sanitizeUpgradeLevelWithMinimum(
      levels?.secondary_party_assignment_duration ??
        (
          levels as Partial<Record<string, number>> | undefined
        )?.secondary_party_dispatch_duration,
      defaults.secondary_party_assignment_duration,
      1,
      GUILD_SECONDARY_PARTY_DURATION_MAX_LEVEL,
    ),
  };
}

function sanitizeUpgradeLevel(level: number | undefined, fallback: number): number {
  return sanitizeUpgradeLevelWithMinimum(level, fallback, 1);
}

function sanitizeUpgradeLevelWithMinimum(
  level: number | undefined,
  fallback: number,
  minimumLevel: number,
  maximumLevel = GUILD_RECRUIT_UPGRADE_MAX_LEVEL,
): number {
  return typeof level === "number" && Number.isFinite(level)
    ? Math.min(
        maximumLevel,
        Math.max(minimumLevel, Math.floor(level)),
      )
    : fallback;
}

function getGuildRecruitUpgradeLockReason(
  upgrades: GuildUpgradesState,
  upgradeId: GuildRecruitUpgradeId,
): string | null {
  if (
    upgradeId === "recruit_min_level" &&
    upgrades.recruit.recruit_max_level < GUILD_RECRUIT_UPGRADE_MAX_LEVEL
  ) {
    return "Requires Recruit Max Level Lv 3";
  }

  return null;
}

function getGuildSecondaryPartyUpgradeLevel(
  upgrades: GuildUpgradesState,
  upgradeId: GuildSecondaryPartyUpgradeId,
  partyId: string | null,
): number {
  if (upgradeId === "secondary_party_count") {
    return upgrades.secondaryParties.secondary_party_count;
  }

  if (!partyId) {
    return createInitialGuildSecondaryPartyPerPartyUpgradeLevels()[upgradeId];
  }

  return sanitizeGuildSecondaryPartyPerPartyUpgradeLevels(
    upgrades.secondaryParties.parties[partyId],
  )[upgradeId];
}

function setGuildSecondaryPartyUpgradeLevel(
  upgrades: GuildUpgradesState,
  upgradeId: GuildSecondaryPartyUpgradeId,
  partyId: string | null,
  nextLevel: number,
): GuildUpgradesState {
  if (upgradeId === "secondary_party_count") {
    return {
      ...upgrades,
      secondaryParties: {
        ...upgrades.secondaryParties,
        secondary_party_count: nextLevel,
      },
    };
  }

  if (!partyId) {
    return upgrades;
  }

  const partyLevels = sanitizeGuildSecondaryPartyPerPartyUpgradeLevels(
    upgrades.secondaryParties.parties[partyId],
  );

  return {
    ...upgrades,
    secondaryParties: {
      ...upgrades.secondaryParties,
      parties: {
        ...upgrades.secondaryParties.parties,
        [partyId]: {
          ...partyLevels,
          [upgradeId]: nextLevel,
        },
      },
    },
  };
}

function getGuildSecondaryPartyUpgradeLockReason(
  state: GameState,
  upgrades: GuildUpgradesState,
  upgradeId: GuildSecondaryPartyUpgradeId,
  partyId: string | null,
  nextLevel: number | null,
): string | null {
  if (upgradeId === "secondary_party_count") {
    return null;
  }

  if (!partyId) {
    return "Select a Field Team";
  }

  const partyNumber = getSecondaryPartyNumber(partyId);

  if (partyNumber < 1 || partyNumber > GUILD_SECONDARY_PARTY_COUNT_MAX_LEVEL) {
    return "Unknown Field Team";
  }

  if (upgrades.secondaryParties.secondary_party_count < partyNumber) {
    return `Unlock Field Team ${partyNumber}`;
  }

  if (
    upgradeId === "secondary_party_members" &&
    nextLevel !== null &&
    nextLevel > getPartySizeLimit(state)
  ) {
    return `Requires main party slot ${nextLevel} unlock`;
  }

  return null;
}

function getSecondaryPartyIdForNumber(partyNumber: number): string {
  return `secondary-party-${partyNumber}`;
}

function getSecondaryPartyNumber(partyId: string): number {
  const match = /^secondary-party-(\d+)$/.exec(partyId);

  return match ? Number.parseInt(match[1], 10) : 0;
}

function getGuildSecondaryPartyEfficiencyForLevel(level: number): number {
  return Math.min(1, 0.5 + (Math.max(1, level) - 1) * 0.05);
}

function getGuildSecondaryPartyAssignmentDurationMinutesForLevel(level: number): number {
  return Math.min(48 * 60, 6 * 60 + (Math.max(1, level) - 1) * 2 * 60);
}

function formatMultiplier(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDurationMinutes(minutes: number): string {
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
