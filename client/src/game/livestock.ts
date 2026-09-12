import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isPartyLeaderNearLivestockKeeper } from "./farm";
import { sanitizeInnKitchenState } from "./innKitchen";
import { addItemToInventoryState } from "./inventory";
import {
  awardKeyItemIfMissing,
  LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID,
  LIVESTOCK_ELDER_MOSSLING_DISCOVERY_KEY_ITEM_ID,
  LIVESTOCK_TIN_CRAWLER_DISCOVERY_KEY_ITEM_ID,
  LIVESTOCK_WOLF_DISCOVERY_KEY_ITEM_ID,
} from "./keyItems";
import {
  queueImportantItemAcquisitionBroadcast,
  queueUnlockNewsBroadcast,
} from "./newsBroadcast";
import { isTownServicesUnlocked } from "./townServices";
import {
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";
import type { GameState } from "./state";
import type {
  FarmCropId,
  LivestockAnimalUpgradeId,
  LivestockAnimalUpgradeLevels,
  LivestockBuildingUpgradeId,
  LivestockBuildingUpgradeLevels,
  LivestockCreatureId,
  LivestockFeedIngredientId,
  LivestockOutputId,
  LivestockPlacedCreatureState,
  LivestockPlacementId,
  LivestockPlacementRotation,
  LivestockState,
  Enemy,
  EnemyTypeId,
  ItemId,
  KeyItemId,
} from "./types";

export const LIVESTOCK_GRID_WIDTH = 5;
export const LIVESTOCK_GRID_HEIGHT = 3;
export const LIVESTOCK_DUSKHEN_CREATURE_ID =
  "duskhen" satisfies LivestockCreatureId;
export const LIVESTOCK_WOLF_CREATURE_ID = "wolf" satisfies LivestockCreatureId;
export const LIVESTOCK_TIN_CRAWLER_CREATURE_ID =
  "tin_crawler" satisfies LivestockCreatureId;
export const LIVESTOCK_ELDER_MOSSLING_CREATURE_ID =
  "elder_mossling" satisfies LivestockCreatureId;
export const LIVESTOCK_EGG_OUTPUT_ID = "egg" satisfies LivestockOutputId;
export const LIVESTOCK_TIN_ORE_OUTPUT_ID =
  "tin_ore" satisfies LivestockOutputId;
export const LIVESTOCK_DUSKHEN_BASE_OWNED = 2;
export const LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const LIVESTOCK_DUSKHEN_EGG_YIELD = 1;
export const LIVESTOCK_EGG_HOLD_CAP = 20;
export const LIVESTOCK_DAY_MS = 24 * 60 * 60 * 1000;
export const LIVESTOCK_DUSKHEN_FEED_CROP_ID = "carrot" satisfies FarmCropId;
export const LIVESTOCK_DUSKHEN_FEED_PER_DAY = 10;
export const LIVESTOCK_CREATURE_UNLOCK_FIRST_CHANCE = 0.1;
export const LIVESTOCK_CREATURE_UNLOCK_SECOND_CHANCE = 0.05;
export const LIVESTOCK_CREATURE_UNLOCK_REPEAT_CHANCE = 0.01;
export const LIVESTOCK_DUSKHEN_MERCHANT_PRICE_PER_OWNED = 100;
export const LIVESTOCK_UPGRADE_COST_BASE_CROWNS = 100;
export const LIVESTOCK_SPEED_MAX_LEVEL = 5;
export const LIVESTOCK_SPEED_BONUS_PER_LEVEL_AFTER_BASE = 0.05;
export const LIVESTOCK_FEED_DISCOUNT_MAX_LEVEL = 3;
export const LIVESTOCK_FEED_DISCOUNT_PER_LEVEL = 0.05;
export const LIVESTOCK_OUTPUT_CAP_MAX_LEVEL = 5;
export const LIVESTOCK_OUTPUT_CAP_BONUS_PER_LEVEL_AFTER_BASE = 0.2;
export const LIVESTOCK_GRID_COLUMNS_MAX_LEVEL = 3;
export const LIVESTOCK_GRID_ROWS_MAX_LEVEL = 3;
export const LIVESTOCK_SLOT_EFFICIENCY_MAX_LEVEL = 3;

export const LIVESTOCK_ANIMAL_UPGRADE_IDS: LivestockAnimalUpgradeId[] = [
  "speed",
  "feedDiscount",
  "outputCap",
];

export const LIVESTOCK_BUILDING_UPGRADE_IDS: LivestockBuildingUpgradeId[] = [
  "columns",
  "rows",
  "slotEfficiency",
];

export type LivestockCommandFailureReason =
  | "locked_service"
  | "not_near_livestock"
  | "invalid_creature"
  | "invalid_placement"
  | "invalid_upgrade"
  | "no_available_creature"
  | "out_of_bounds"
  | "occupied_cell"
  | "nothing_to_collect"
  | "collection_error"
  | "insufficient_feed"
  | "no_hungry_animals"
  | "insufficient_crowns"
  | "max_level"
  | "upgrade_disabled";

export type LivestockCreatureDefinition = {
  id: LivestockCreatureId;
  displayName: string;
  shortLabel: string;
  footprint: {
    width: number;
    height: number;
  };
  output: {
    id: LivestockOutputId;
    displayName: string;
    intervalMs: number;
    quantity: number;
    destination: "pantry" | "inventory";
  } | null;
  feedPerDay: Array<{
    ingredientId: LivestockFeedIngredientId;
    quantity: number;
  }>;
  sourceHint: string;
  discoveryKeyItemId: KeyItemId;
};

export type LivestockCreatureUnlockSource =
  | "merchant"
  | "wolf_defeat"
  | "tin_crawler_defeat"
  | "elder_mossling_defeat";

export type LivestockCreatureUnlockResult =
  | {
      ok: true;
      state: GameState;
      creature: LivestockCreatureDefinition;
      source: LivestockCreatureUnlockSource;
      awardedQuantity: number;
      keyItemId: KeyItemId;
    }
  | {
      ok: false;
      state: GameState;
      creature: LivestockCreatureDefinition;
      source: LivestockCreatureUnlockSource;
      reason: "already_unlocked";
    };

export type LivestockPlacementResult =
  | {
      ok: true;
      state: GameState;
      placement: LivestockPlacedCreatureState;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

export type LivestockRemoveResult =
  | {
      ok: true;
      state: GameState;
      removedPlacement: LivestockPlacedCreatureState;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

export type LivestockCollectAllResult =
  | {
      ok: true;
      state: GameState;
      collectedByOutputId: Partial<Record<LivestockOutputId, number>>;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

export type LivestockFeedNowResult =
  | {
      ok: true;
      state: GameState;
      fedPlacementIds: LivestockPlacementId[];
      consumedByIngredientId: Partial<Record<LivestockFeedIngredientId, number>>;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

export type LivestockUpgradeResult =
  | {
      ok: true;
      state: GameState;
      previousLevel: number;
      nextLevel: number;
      costCrowns: number;
    }
  | {
      ok: false;
      state: GameState;
      reason: LivestockCommandFailureReason;
    };

type LivestockUpgradeDefinition<
  TUpgradeId extends LivestockAnimalUpgradeId | LivestockBuildingUpgradeId,
> = {
  id: TUpgradeId;
  displayName: string;
  maxLevel: number;
  isEnabled: boolean;
};

export const LIVESTOCK_ANIMAL_UPGRADE_DEFINITIONS: Record<
  LivestockAnimalUpgradeId,
  LivestockUpgradeDefinition<LivestockAnimalUpgradeId>
> = {
  speed: {
    id: "speed",
    displayName: "Faster Production",
    maxLevel: LIVESTOCK_SPEED_MAX_LEVEL,
    isEnabled: true,
  },
  feedDiscount: {
    id: "feedDiscount",
    displayName: "Feed Discount",
    maxLevel: LIVESTOCK_FEED_DISCOUNT_MAX_LEVEL,
    isEnabled: true,
  },
  outputCap: {
    id: "outputCap",
    displayName: "Output Holding",
    maxLevel: LIVESTOCK_OUTPUT_CAP_MAX_LEVEL,
    isEnabled: true,
  },
};

export const LIVESTOCK_BUILDING_UPGRADE_DEFINITIONS: Record<
  LivestockBuildingUpgradeId,
  LivestockUpgradeDefinition<LivestockBuildingUpgradeId>
> = {
  columns: {
    id: "columns",
    displayName: "Expand Columns",
    maxLevel: LIVESTOCK_GRID_COLUMNS_MAX_LEVEL,
    isEnabled: true,
  },
  rows: {
    id: "rows",
    displayName: "Expand Rows",
    maxLevel: LIVESTOCK_GRID_ROWS_MAX_LEVEL,
    isEnabled: true,
  },
  slotEfficiency: {
    id: "slotEfficiency",
    displayName: "Slot Efficiency",
    maxLevel: LIVESTOCK_SLOT_EFFICIENCY_MAX_LEVEL,
    isEnabled: false,
  },
};

export const LIVESTOCK_CREATURE_DEFINITIONS: LivestockCreatureDefinition[] = [
  {
    id: LIVESTOCK_DUSKHEN_CREATURE_ID,
    displayName: "Duskhen",
    shortLabel: "DH",
    footprint: {
      width: 1,
      height: 1,
    },
    output: {
      id: LIVESTOCK_EGG_OUTPUT_ID,
      displayName: "Egg",
      intervalMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
      quantity: LIVESTOCK_DUSKHEN_EGG_YIELD,
      destination: "pantry",
    },
    feedPerDay: [
      {
        ingredientId: LIVESTOCK_DUSKHEN_FEED_CROP_ID,
        quantity: LIVESTOCK_DUSKHEN_FEED_PER_DAY,
      },
    ],
    sourceHint: "Base Livestock creature",
    discoveryKeyItemId: LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID,
  },
  {
    id: LIVESTOCK_WOLF_CREATURE_ID,
    displayName: "Wolf",
    shortLabel: "WF",
    footprint: {
      width: 2,
      height: 1,
    },
    output: null,
    feedPerDay: [
      {
        ingredientId: LIVESTOCK_EGG_OUTPUT_ID,
        quantity: LIVESTOCK_DUSKHEN_FEED_PER_DAY,
      },
    ],
    sourceHint: "Rare drop from Wolves",
    discoveryKeyItemId: LIVESTOCK_WOLF_DISCOVERY_KEY_ITEM_ID,
  },
  {
    id: LIVESTOCK_TIN_CRAWLER_CREATURE_ID,
    displayName: "Tin Crawler",
    shortLabel: "TC",
    footprint: {
      width: 2,
      height: 2,
    },
    output: {
      id: LIVESTOCK_TIN_ORE_OUTPUT_ID,
      displayName: "Tin Ore",
      intervalMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
      quantity: LIVESTOCK_DUSKHEN_EGG_YIELD,
      destination: "inventory",
    },
    feedPerDay: [
      {
        ingredientId: "bittercap_mushroom",
        quantity: LIVESTOCK_DUSKHEN_FEED_PER_DAY,
      },
    ],
    sourceHint: "Rare drop from Tin Crawlers",
    discoveryKeyItemId: LIVESTOCK_TIN_CRAWLER_DISCOVERY_KEY_ITEM_ID,
  },
  {
    id: LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
    displayName: "Elder Mossling",
    shortLabel: "EM",
    footprint: {
      width: 2,
      height: 2,
    },
    output: null,
    feedPerDay: [
      {
        ingredientId: "moonleaf",
        quantity: LIVESTOCK_DUSKHEN_FEED_PER_DAY,
      },
    ],
    sourceHint: "Rare drop from Elder Mosslings",
    discoveryKeyItemId: LIVESTOCK_ELDER_MOSSLING_DISCOVERY_KEY_ITEM_ID,
  },
];

export function createInitialLivestockState(nowMs = 0): LivestockState {
  const buildingUpgradeLevels = createInitialLivestockBuildingUpgradeLevels();

  return {
    grid: getLivestockGridForBuildingUpgradeLevels(buildingUpgradeLevels),
    ownedCreaturesById: {
      duskhen: LIVESTOCK_DUSKHEN_BASE_OWNED,
      wolf: 0,
      tin_crawler: 0,
      elder_mossling: 0,
    },
    placementsById: {},
    placementSequence: 0,
    lastFeedDayStartMs: getLivestockLocalDayStartMs(nowMs),
    animalUpgradeLevelsByCreatureId: {
      duskhen: createInitialLivestockAnimalUpgradeLevels(),
      tin_crawler: createInitialLivestockAnimalUpgradeLevels(),
    },
    buildingUpgradeLevels,
    holdingQuantitiesByOutputId: {
      egg: 0,
      tin_ore: 0,
    },
    holdingCapsByOutputId: {
      egg: getLivestockOutputCapForLevel(1),
      tin_ore: getLivestockOutputCapForLevel(1),
    },
  };
}

export function getLivestockState(
  state: GameState,
  nowMs = Date.now(),
): LivestockState {
  return sanitizeLivestockState(state.livestock, nowMs);
}

export function getLivestockCreatureDefinitions(): LivestockCreatureDefinition[] {
  return LIVESTOCK_CREATURE_DEFINITIONS;
}

export function getLivestockCreatureDefinition(
  creatureId: LivestockCreatureId,
): LivestockCreatureDefinition | null {
  return (
    LIVESTOCK_CREATURE_DEFINITIONS.find(
      (definition) => definition.id === creatureId,
    ) ?? null
  );
}

export function getLivestockOutputDefinition(outputId: LivestockOutputId):
  | (NonNullable<LivestockCreatureDefinition["output"]> & {
      creatureId: LivestockCreatureId;
    })
  | null {
  for (const definition of LIVESTOCK_CREATURE_DEFINITIONS) {
    if (definition.output?.id === outputId) {
      return {
        ...definition.output,
        creatureId: definition.id,
      };
    }
  }

  return null;
}

export function isLivestockCreatureUnlocked(
  state: Pick<GameState, "livestock">,
  creatureId: LivestockCreatureId,
): boolean {
  const livestock = sanitizeLivestockState(state.livestock);

  return (livestock.ownedCreaturesById[creatureId] ?? 0) > 0;
}

export function createInitialLivestockAnimalUpgradeLevels(): LivestockAnimalUpgradeLevels {
  return {
    speed: 1,
    feedDiscount: 0,
    outputCap: 1,
  };
}

export function createInitialLivestockBuildingUpgradeLevels(): LivestockBuildingUpgradeLevels {
  return {
    columns: 0,
    rows: 0,
    slotEfficiency: 0,
  };
}

export function getLivestockAnimalUpgradeLevels(
  livestock: LivestockState,
  creatureId: LivestockCreatureId,
): LivestockAnimalUpgradeLevels {
  return (
    livestock.animalUpgradeLevelsByCreatureId[creatureId] ??
    createInitialLivestockAnimalUpgradeLevels()
  );
}

export function getLivestockBuildingUpgradeLevels(
  livestock: LivestockState,
): LivestockBuildingUpgradeLevels {
  return livestock.buildingUpgradeLevels;
}

export function getLivestockGridForBuildingUpgradeLevels(
  levels: LivestockBuildingUpgradeLevels,
): LivestockState["grid"] {
  return {
    width: LIVESTOCK_GRID_WIDTH + levels.columns,
    height: LIVESTOCK_GRID_HEIGHT + levels.rows,
  };
}

export function getLivestockUpgradeCostCrowns(currentLevel: number): number {
  return LIVESTOCK_UPGRADE_COST_BASE_CROWNS * (currentLevel + 1);
}

export function getLivestockSpeedMultiplier(level: number): number {
  return level <= 0
    ? 0
    : 1 + (level - 1) * LIVESTOCK_SPEED_BONUS_PER_LEVEL_AFTER_BASE;
}

export function getLivestockOutputIntervalMs(
  livestock: LivestockState,
  definition: LivestockCreatureDefinition,
): number {
  if (!definition.output) {
    return Number.POSITIVE_INFINITY;
  }

  const levels = getLivestockAnimalUpgradeLevels(livestock, definition.id);
  const multiplier = getLivestockSpeedMultiplier(levels.speed);

  return multiplier <= 0
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.floor(definition.output.intervalMs / multiplier));
}

export function getLivestockFeedDiscountPercent(level: number): number {
  return Math.max(0, level) * LIVESTOCK_FEED_DISCOUNT_PER_LEVEL * 100;
}

export function getLivestockEffectiveFeedQuantity(
  baseQuantity: number,
  discountLevel: number,
): number {
  if (baseQuantity <= 0) {
    return 0;
  }

  return Math.max(
    1,
    Math.floor(baseQuantity * (1 - discountLevel * LIVESTOCK_FEED_DISCOUNT_PER_LEVEL)),
  );
}

export function getLivestockOutputCapForLevel(level: number): number {
  return Math.round(
    LIVESTOCK_EGG_HOLD_CAP *
      (1 + Math.max(0, level - 1) * LIVESTOCK_OUTPUT_CAP_BONUS_PER_LEVEL_AFTER_BASE),
  );
}

export function sanitizeLivestockState(
  livestock: unknown,
  nowMs = Date.now(),
): LivestockState {
  const fallback = createInitialLivestockState(nowMs);

  if (!isRecord(livestock)) {
    return fallback;
  }

  const animalUpgradeLevelsByCreatureId: LivestockState["animalUpgradeLevelsByCreatureId"] = {};

  for (const definition of LIVESTOCK_CREATURE_DEFINITIONS) {
    if (!definition.output) {
      continue;
    }

    animalUpgradeLevelsByCreatureId[definition.id] =
      sanitizeLivestockAnimalUpgradeLevels(
        isRecord(livestock.animalUpgradeLevelsByCreatureId)
          ? livestock.animalUpgradeLevelsByCreatureId[definition.id]
          : undefined,
      );
  }

  const buildingUpgradeLevels = sanitizeLivestockBuildingUpgradeLevels(
    livestock.buildingUpgradeLevels,
  );
  const grid = getLivestockGridForBuildingUpgradeLevels(buildingUpgradeLevels);
  const ownedCreaturesById: LivestockState["ownedCreaturesById"] = {};

  for (const definition of LIVESTOCK_CREATURE_DEFINITIONS) {
    const owned = sanitizeNonNegativeInteger(
      isRecord(livestock.ownedCreaturesById)
        ? livestock.ownedCreaturesById[definition.id]
        : undefined,
    );
    ownedCreaturesById[definition.id] =
      definition.id === LIVESTOCK_DUSKHEN_CREATURE_ID
        ? Math.max(LIVESTOCK_DUSKHEN_BASE_OWNED, owned)
        : owned;
  }

  const holdingCapsByOutputId: LivestockState["holdingCapsByOutputId"] = {};
  const holdingQuantitiesByOutputId: LivestockState["holdingQuantitiesByOutputId"] = {};

  for (const definition of LIVESTOCK_CREATURE_DEFINITIONS) {
    if (!definition.output) {
      continue;
    }

    const outputId = definition.output.id;
    const cap = getLivestockOutputCapForLevel(
      getLivestockAnimalUpgradeLevels(
        {
          ...fallback,
          animalUpgradeLevelsByCreatureId,
        },
        definition.id,
      ).outputCap,
    );
    holdingCapsByOutputId[outputId] = cap;
    holdingQuantitiesByOutputId[outputId] = Math.min(
      cap,
      sanitizeNonNegativeInteger(
        isRecord(livestock.holdingQuantitiesByOutputId)
          ? livestock.holdingQuantitiesByOutputId[outputId]
          : undefined,
      ),
    );
  }
  const placementsById: LivestockState["placementsById"] = {};
  const rawPlacements = isRecord(livestock.placementsById)
    ? Object.entries(livestock.placementsById)
    : [];
  const placedCounts: Partial<Record<LivestockCreatureId, number>> = {};

  for (const [placementId, rawPlacement] of rawPlacements) {
    const placement = sanitizePlacement(placementId, rawPlacement);
    const definition = placement
      ? getLivestockCreatureDefinition(placement.creatureId)
      : null;

    if (!placement || !definition) {
      continue;
    }

    const placedCount = placedCounts[placement.creatureId] ?? 0;
    const ownedCount = ownedCreaturesById[placement.creatureId] ?? 0;

    if (placedCount >= ownedCount) {
      continue;
    }

    const validation = validatePlacementLocation(
      {
        ...fallback,
        grid,
        ownedCreaturesById,
        placementsById,
      },
      definition,
      placement.x,
      placement.y,
      placement.rotation,
    );

    if (validation) {
      continue;
    }

    placementsById[placement.id] = placement;
    placedCounts[placement.creatureId] = placedCount + 1;
  }

  return {
    grid,
    ownedCreaturesById,
    placementsById,
    placementSequence: Math.max(
      sanitizeNonNegativeInteger(livestock.placementSequence),
      getHighestPlacementSequence(placementsById),
    ),
    lastFeedDayStartMs: sanitizeLivestockDayStart(
      livestock.lastFeedDayStartMs,
      nowMs,
    ),
    animalUpgradeLevelsByCreatureId,
    buildingUpgradeLevels,
    holdingQuantitiesByOutputId,
    holdingCapsByOutputId,
  };
}

export function ensureInitialLivestockKeyItems(
  keyItemsById: GameState["keyItemsById"],
): GameState["keyItemsById"] {
  return {
    ...(keyItemsById ?? {}),
    [LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]: Math.max(
      1,
      sanitizeNonNegativeInteger(
        keyItemsById?.[LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID],
      ),
    ),
  };
}

export function addOwnedLivestockCreature(
  state: GameState,
  creatureId: LivestockCreatureId,
  source: LivestockCreatureUnlockSource,
  nowMs = Date.now(),
): LivestockCreatureUnlockResult {
  const creature = getLivestockCreatureDefinition(creatureId);

  if (!creature) {
    const fallbackCreature = LIVESTOCK_CREATURE_DEFINITIONS[0];

    return {
      ok: false,
      state,
      creature: fallbackCreature,
      source,
      reason: "already_unlocked",
    };
  }

  const livestock = sanitizeLivestockState(state.livestock, nowMs);
  const previousOwned = livestock.ownedCreaturesById[creatureId] ?? 0;
  let nextState: GameState = {
    ...state,
    livestock: {
      ...livestock,
      ownedCreaturesById: {
        ...livestock.ownedCreaturesById,
        [creatureId]: previousOwned + 1,
      },
    },
  };
  const award = awardKeyItemIfMissing(nextState, creature.discoveryKeyItemId);
  nextState = award.state;

  if (award.awardedQuantity > 0) {
    nextState = queueUnlockNewsBroadcast(
      nextState,
      getLivestockCreatureDropDisplayName(creature),
      nowMs,
    );
  } else if (source !== "merchant") {
    nextState = queueImportantItemAcquisitionBroadcast(
      nextState,
      {
        title: "Items Received",
        entries: [
          {
            verb: "Obtained",
            displayName: getLivestockCreatureDropDisplayName(creature),
            quantity: 1,
            stackable: false,
          },
        ],
      },
      nowMs,
    );
  }

  return {
    ok: true,
    state: appendLivestockTelemetry(nextState, "livestock_creature_unlocked", {
      creatureId,
      keyItemId: creature.discoveryKeyItemId,
      quantityBefore: previousOwned,
      quantityAfter: previousOwned + 1,
      livestockUnlockSource: source,
      result: "success",
    }),
    creature,
    source,
    awardedQuantity: 1,
    keyItemId: creature.discoveryKeyItemId,
  };
}

export function getLivestockCreatureUnlockChance(ownedCount: number): number {
  if (ownedCount <= 0) {
    return LIVESTOCK_CREATURE_UNLOCK_FIRST_CHANCE;
  }

  if (ownedCount === 1) {
    return LIVESTOCK_CREATURE_UNLOCK_SECOND_CHANCE;
  }

  return LIVESTOCK_CREATURE_UNLOCK_REPEAT_CHANCE;
}

export function tryUnlockLivestockCreatureFromEnemyDefeat(
  state: GameState,
  enemy: Enemy,
  nowMs = Date.now(),
  random = Math.random,
): GameState {
  const unlockSource = getLivestockUnlockSourceForEnemyType(enemy.enemyTypeId);

  if (!unlockSource) {
    return state;
  }

  const creature = getLivestockCreatureDefinition(unlockSource.creatureId);

  if (!creature) {
    return state;
  }

  const livestock = sanitizeLivestockState(state.livestock, nowMs);
  const ownedCount = livestock.ownedCreaturesById[unlockSource.creatureId] ?? 0;
  const chance = getLivestockCreatureUnlockChance(ownedCount);
  const roll = random();
  const rolledState = appendLivestockTelemetry(
    setLivestockStateIfChanged(state, livestock, nowMs),
    "livestock_creature_unlock_roll",
    {
      creatureId: unlockSource.creatureId,
      keyItemId: creature.discoveryKeyItemId,
      livestockUnlockSource: unlockSource.source,
      livestockUnlockChance: chance,
      livestockUnlockRoll: roll,
      quantityBefore: ownedCount,
      quantityAfter: ownedCount,
      result: roll < chance ? "success" : "failed",
      reason: roll < chance ? undefined : "roll_failed",
    },
  );

  if (roll >= chance) {
    return rolledState;
  }

  return addOwnedLivestockCreature(
    rolledState,
    unlockSource.creatureId,
    unlockSource.source,
    nowMs,
  ).state;
}

export function settleLivestockState(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  let livestock = sanitizeLivestockState(state.livestock, nowMs);
  let nextState = setLivestockStateIfChanged(state, livestock, nowMs);
  const currentDayStartMs = getLivestockLocalDayStartMs(nowMs);

  while (livestock.lastFeedDayStartMs < currentDayStartMs) {
    const feedAtMs = Math.min(
      getNextLivestockDayStartMs(livestock.lastFeedDayStartMs),
      currentDayStartMs,
    );
    const productionResult = settleLivestockProduction(
      nextState,
      livestock,
      feedAtMs,
      nowMs,
    );
    nextState = productionResult.state;
    livestock = productionResult.livestock;

    const feedResult = applyMidnightLivestockFeeding(
      nextState,
      livestock,
      feedAtMs,
      nowMs,
    );
    nextState = feedResult.state;
    livestock = feedResult.livestock;
  }

  const productionResult = settleLivestockProduction(
    nextState,
    livestock,
    nowMs,
    nowMs,
  );

  return productionResult.state;
}

function settleLivestockProduction(
  state: GameState,
  startingLivestock: LivestockState,
  nowMs: number,
  sanitizeNowMs: number,
): { state: GameState; livestock: LivestockState } {
  let livestock = startingLivestock;
  let nextState = setLivestockStateIfChanged(state, livestock, sanitizeNowMs);

  for (const placement of Object.values(livestock.placementsById)) {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition || !definition.output || placement.isHungry) {
      continue;
    }

    const outputId = definition.output.id;
    const cap = livestock.holdingCapsByOutputId[outputId] ?? 0;
    const quantityBefore = livestock.holdingQuantitiesByOutputId[outputId] ?? 0;
    const intervalMs = getLivestockOutputIntervalMs(livestock, definition);
    const elapsedMs = Math.max(0, nowMs - placement.lastProducedAtMs);

    if (quantityBefore >= cap) {
      if (elapsedMs < intervalMs) {
        continue;
      }

      const nextPlacement = {
        ...placement,
        lastProducedAtMs: nowMs,
      };
      livestock = {
        ...livestock,
        placementsById: {
          ...livestock.placementsById,
          [placement.id]: nextPlacement,
        },
      };
      nextState = appendLivestockTelemetry(
        setLivestockStateIfChanged(nextState, livestock, sanitizeNowMs),
        "livestock_generation_blocked_cap",
        {
          placement,
          nextPlacement,
          outputId,
          quantityBefore,
          quantityAfter: quantityBefore,
          capacity: cap,
          generatedQuantity: 0,
          result: "blocked_cap",
          reason: "cap_full",
        },
      );
      continue;
    }

    const completedCycles = Math.floor(elapsedMs / intervalMs);

    if (completedCycles <= 0) {
      continue;
    }

    const availableSpace = cap - quantityBefore;
    const generatedQuantity = Math.min(
      completedCycles * definition.output.quantity,
      availableSpace,
    );
    const completedGeneratedCycles = Math.ceil(
      generatedQuantity / definition.output.quantity,
    );
    const reachedCap = generatedQuantity >= availableSpace;
    const nextPlacement = {
      ...placement,
      lastProducedAtMs: reachedCap
        ? nowMs
        : placement.lastProducedAtMs +
          completedGeneratedCycles * intervalMs,
    };
    const quantityAfter = quantityBefore + generatedQuantity;

    livestock = {
      ...livestock,
      placementsById: {
        ...livestock.placementsById,
        [placement.id]: nextPlacement,
      },
      holdingQuantitiesByOutputId: {
        ...livestock.holdingQuantitiesByOutputId,
        [outputId]: quantityAfter,
      },
    };
    nextState = appendLivestockTelemetry(
      setLivestockStateIfChanged(nextState, livestock, sanitizeNowMs),
      "livestock_output_generated",
      {
        placement,
        nextPlacement,
        outputId,
        quantityBefore,
        quantityAfter,
        capacity: cap,
        generatedQuantity,
        result: "success",
      },
    );

    if (reachedCap && completedCycles > completedGeneratedCycles) {
      nextState = appendLivestockTelemetry(
        nextState,
        "livestock_generation_blocked_cap",
        {
          placement,
          nextPlacement,
          outputId,
          quantityBefore,
          quantityAfter,
          capacity: cap,
          generatedQuantity,
          result: "blocked_cap",
          reason: "cap_full",
        },
      );
    }
  }

  return { state: nextState, livestock };
}

function applyMidnightLivestockFeeding(
  state: GameState,
  startingLivestock: LivestockState,
  feedAtMs: number,
  sanitizeNowMs: number,
): { state: GameState; livestock: LivestockState } {
  let livestock = {
    ...startingLivestock,
    lastFeedDayStartMs: feedAtMs,
  };
  let nextState = setLivestockStateIfChanged(state, livestock, sanitizeNowMs);
  let fedCount = 0;
  let hungryCount = 0;
  let consumedFeedCost = 0;

  for (const placement of getOrderedLivestockPlacements(livestock)) {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition) {
      continue;
    }

    const feedCosts = getFullLivestockFeedCosts(livestock, definition);
    const feedResult = consumeLivestockFeedCosts(
      nextState,
      feedCosts,
      feedAtMs,
    );
    const feedCost = getTotalFeedCost(feedCosts);

    if (!feedResult.ok) {
      const nextPlacement = makeLivestockPlacementHungry(
        placement,
        definition,
        livestock,
        feedAtMs,
      );
      livestock = {
        ...livestock,
        placementsById: {
          ...livestock.placementsById,
          [placement.id]: nextPlacement,
        },
      };
      nextState = appendLivestockTelemetry(
        setLivestockStateIfChanged(nextState, livestock, sanitizeNowMs),
        "livestock_became_hungry",
        {
          placement,
          nextPlacement,
          outputId: definition.output?.id,
          feedCost,
          result: "failed",
          reason: "insufficient_feed",
        },
      );
      hungryCount += 1;
      continue;
    }

    nextState = feedResult.state;
    consumedFeedCost += feedCost;

    if (placement.isHungry) {
      const nextPlacement = resumeLivestockPlacementProduction(
        placement,
        definition,
        livestock,
        feedAtMs,
      );
      livestock = {
        ...livestock,
        placementsById: {
          ...livestock.placementsById,
          [placement.id]: nextPlacement,
        },
      };
      nextState = appendLivestockTelemetry(
        setLivestockStateIfChanged(nextState, livestock, sanitizeNowMs),
        "livestock_resumed_production",
        {
          placement,
          nextPlacement,
          outputId: definition.output?.id,
          feedCost,
          result: "success",
        },
      );
    }

    fedCount += 1;
  }

  nextState = appendLivestockTelemetry(nextState, "livestock_midnight_feed", {
    creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
    outputId: LIVESTOCK_EGG_OUTPUT_ID,
    quantityBefore: fedCount,
    quantityAfter: hungryCount,
    feedCost: consumedFeedCost,
    result: "success",
  });

  return { state: nextState, livestock };
}

export function placeLivestockCreature(
  state: GameState,
  creatureId: LivestockCreatureId,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation = "horizontal",
  nowMs = Date.now(),
): LivestockPlacementResult {
  let nextState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(nextState.livestock, nowMs);
  const definition = getLivestockCreatureDefinition(creatureId);

  nextState = appendLivestockTelemetry(nextState, "livestock_place_attempt", {
    creatureId,
    outputId: definition?.output?.id,
    x,
    y,
    rotation,
    result: "attempt",
  });

  const actionFailure = getLivestockActionFailure(nextState);

  if (actionFailure) {
    return failPlacement(nextState, "livestock_place_failed", actionFailure, {
      creatureId,
      outputId: definition?.output?.id,
      x,
      y,
      rotation,
    });
  }

  if (!definition) {
    return failPlacement(nextState, "livestock_place_failed", "invalid_creature", {
      creatureId,
      x,
      y,
      rotation,
    });
  }

  if (getAvailableLivestockCreatureCount(livestock, creatureId) <= 0) {
    return failPlacement(
      nextState,
      "livestock_place_failed",
      "no_available_creature",
      { creatureId, outputId: definition.output?.id, x, y, rotation },
    );
  }

  const validationFailure = validatePlacementLocation(
    livestock,
    definition,
    x,
    y,
    rotation,
  );

  if (validationFailure) {
    return failPlacement(nextState, "livestock_place_failed", validationFailure, {
      creatureId,
      outputId: definition.output?.id,
      x,
      y,
      rotation,
    });
  }

  const initialFeedCosts = getProratedLivestockFeedCosts(
    livestock,
    definition,
    nowMs,
  );
  const initialFeedResult = consumeLivestockFeedCosts(
    nextState,
    initialFeedCosts,
    nowMs,
  );

  if (!initialFeedResult.ok) {
    return failPlacement(nextState, "livestock_place_failed", "insufficient_feed", {
      creatureId,
      outputId: definition.output?.id,
      x,
      y,
      rotation,
      feedCost: getTotalFeedCost(initialFeedCosts),
    });
  }

  nextState = appendLivestockTelemetry(
    initialFeedResult.state,
    "livestock_feed_paid",
    {
      creatureId,
      outputId: definition.output?.id,
      x,
      y,
      rotation,
      feedCost: getTotalFeedCost(initialFeedCosts),
      result: "success",
    },
  );

  const placement: LivestockPlacedCreatureState = {
    id: createPlacementId(livestock, creatureId),
    creatureId,
    x,
    y,
    rotation,
    placedAtMs: nowMs,
    lastProducedAtMs: nowMs,
  };
  const nextLivestock = {
    ...livestock,
    placementSequence: livestock.placementSequence + 1,
    placementsById: {
      ...livestock.placementsById,
      [placement.id]: placement,
    },
  };

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: nextLivestock,
      },
      "livestock_place_succeeded",
      {
        placement,
        outputId: definition.output?.id,
        result: "success",
      },
    ),
    placement,
  };
}

export function moveLivestockPlacement(
  state: GameState,
  placementId: LivestockPlacementId,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation = "horizontal",
  nowMs = Date.now(),
): LivestockPlacementResult {
  let nextState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(nextState.livestock, nowMs);
  const placement = livestock.placementsById[placementId];
  const definition = placement
    ? getLivestockCreatureDefinition(placement.creatureId)
    : null;

  nextState = appendLivestockTelemetry(nextState, "livestock_move_attempt", {
    placement,
    placementId,
    creatureId: placement?.creatureId,
    outputId: definition?.output?.id,
    x,
    y,
    rotation,
    result: "attempt",
  });

  const actionFailure = getLivestockActionFailure(nextState);

  if (actionFailure) {
    return failPlacement(nextState, "livestock_move_failed", actionFailure, {
      placement,
      placementId,
      creatureId: placement?.creatureId,
      outputId: definition?.output?.id,
      x,
      y,
      rotation,
    });
  }

  if (!placement || !definition) {
    return failPlacement(
      nextState,
      "livestock_move_failed",
      "invalid_placement",
      { placementId, x, y, rotation },
    );
  }

  const validationFailure = validatePlacementLocation(
    livestock,
    definition,
    x,
    y,
    rotation,
    placementId,
  );

  if (validationFailure) {
    return failPlacement(nextState, "livestock_move_failed", validationFailure, {
      placement,
      placementId,
      creatureId: placement.creatureId,
      outputId: definition.output?.id,
      x,
      y,
      rotation,
    });
  }

  const nextPlacement = {
    ...placement,
    x,
    y,
    rotation,
  };
  const nextLivestock = {
    ...livestock,
    placementsById: {
      ...livestock.placementsById,
      [placementId]: nextPlacement,
    },
  };

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: nextLivestock,
      },
      "livestock_move_succeeded",
      {
        placement,
        nextPlacement,
        outputId: definition.output?.id,
        result: "success",
      },
    ),
    placement: nextPlacement,
  };
}

export function removeLivestockPlacement(
  state: GameState,
  placementId: LivestockPlacementId,
  nowMs = Date.now(),
): LivestockRemoveResult {
  let nextState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(nextState.livestock, nowMs);
  const placement = livestock.placementsById[placementId];
  const definition = placement
    ? getLivestockCreatureDefinition(placement.creatureId)
    : null;

  nextState = appendLivestockTelemetry(nextState, "livestock_remove_attempt", {
    placement,
    placementId,
    creatureId: placement?.creatureId,
    outputId: definition?.output?.id,
    result: "attempt",
  });

  const actionFailure = getLivestockActionFailure(nextState);

  if (actionFailure) {
    return failRemove(nextState, actionFailure, placement, definition?.output?.id);
  }

  if (!placement || !definition) {
    return failRemove(nextState, "invalid_placement", placement);
  }

  const nextPlacements = { ...livestock.placementsById };
  delete nextPlacements[placementId];

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: {
          ...livestock,
          placementsById: nextPlacements,
        },
      },
      "livestock_remove_succeeded",
      {
        placement,
        outputId: definition.output?.id,
        result: "success",
      },
    ),
    removedPlacement: placement,
  };
}

export function collectAllLivestockOutputs(
  state: GameState,
  nowMs = Date.now(),
): LivestockCollectAllResult {
  const livestock = sanitizeLivestockState(state.livestock, nowMs);
  const collectState = setLivestockStateIfChanged(state, livestock, nowMs);
  const actionFailure = getLivestockActionFailure(collectState);

  if (actionFailure) {
    return failCollect(collectState, actionFailure);
  }

  const outputsToCollect = Object.entries(
    livestock.holdingQuantitiesByOutputId,
  ).filter(
    (entry): entry is [LivestockOutputId, number] =>
      isLivestockOutputId(entry[0]) && entry[1] > 0,
  );

  if (outputsToCollect.length <= 0) {
    return failCollect(collectState, "nothing_to_collect");
  }

  let kitchen = sanitizeInnKitchenState(
    collectState.innKitchen,
    collectState,
    nowMs,
    { settleHearthFire: false },
  );
  let nextState: GameState = collectState;
  const nextHoldingQuantities = {
    ...livestock.holdingQuantitiesByOutputId,
  };
  const collectedByOutputId: Partial<Record<LivestockOutputId, number>> = {};

  for (const [outputId, quantity] of outputsToCollect) {
    const outputDefinition = getLivestockOutputDefinition(outputId);

    if (!outputDefinition) {
      return failCollect(collectState, "collection_error");
    }

    nextHoldingQuantities[outputId] = 0;
    collectedByOutputId[outputId] = quantity;

    if (outputDefinition.destination === "pantry") {
      const previousPantryQuantity =
        kitchen.pantry.ingredientQuantitiesById[outputId] ?? 0;
      const nextPantryQuantity = previousPantryQuantity + quantity;
      const unlockedIngredientIds =
        kitchen.pantry.unlockedIngredientIds.includes(outputId)
          ? kitchen.pantry.unlockedIngredientIds
          : [...kitchen.pantry.unlockedIngredientIds, outputId];

      kitchen = {
        ...kitchen,
        pantry: {
          unlockedIngredientIds,
          ingredientQuantitiesById: {
            ...kitchen.pantry.ingredientQuantitiesById,
            [outputId]: nextPantryQuantity,
          },
        },
      };
      nextState = appendLivestockTelemetry(
        nextState,
        "livestock_pantry_transfer",
        {
          outputId,
          quantityBefore: previousPantryQuantity,
          quantityAfter: nextPantryQuantity,
          result: "success",
        },
      );
      continue;
    }

    const inventoryTransfer = addItemToInventoryState(
      nextState,
      outputId as ItemId,
      quantity,
      "livestock",
    );

    if (inventoryTransfer.result.status !== "success") {
      return failCollect(collectState, "collection_error");
    }

    nextState = appendLivestockTelemetry(
      inventoryTransfer.state,
      "livestock_inventory_transfer",
      {
        outputId,
        quantityBefore: 0,
        quantityAfter: quantity,
        result: "success",
      },
    );
  }

  const nextLivestock = {
    ...livestock,
    holdingQuantitiesByOutputId: nextHoldingQuantities,
  };

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...nextState,
        livestock: nextLivestock,
        innKitchen: kitchen,
      },
      "livestock_collect_all_succeeded",
      {
        quantityBefore: outputsToCollect.reduce(
          (total, [, quantity]) => total + quantity,
          0,
        ),
        quantityAfter: 0,
        result: "success",
      },
    ),
    collectedByOutputId,
  };
}

export function feedHungryLivestockNow(
  state: GameState,
  nowMs = Date.now(),
): LivestockFeedNowResult {
  let nextState = settleLivestockState(state, nowMs);
  let livestock = sanitizeLivestockState(nextState.livestock, nowMs);
  nextState = setLivestockStateIfChanged(nextState, livestock, nowMs);
  const actionFailure = getLivestockActionFailure(nextState);

  if (actionFailure) {
    return failFeedNow(nextState, actionFailure);
  }

  const hungryPlacements = getOrderedLivestockPlacements(livestock).filter(
    (placement) => placement.isHungry,
  );

  if (hungryPlacements.length <= 0) {
    return failFeedNow(nextState, "no_hungry_animals");
  }

  const fedPlacementIds: LivestockPlacementId[] = [];
  const consumedByIngredientId: Partial<
    Record<LivestockFeedIngredientId, number>
  > = {};

  for (const placement of hungryPlacements) {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition) {
      continue;
    }

    const feedCosts = getProratedLivestockFeedCosts(
      livestock,
      definition,
      nowMs,
    );
    const feedResult = consumeLivestockFeedCosts(nextState, feedCosts, nowMs);

    if (!feedResult.ok) {
      nextState = appendLivestockTelemetry(nextState, "livestock_feed_failed", {
        placement,
        outputId: definition.output?.id,
        feedCost: getTotalFeedCost(feedCosts),
        result: "failed",
        reason: "insufficient_feed",
      });
      continue;
    }

    nextState = feedResult.state;
    for (const [ingredientId, quantity] of Object.entries(feedCosts) as Array<
      [LivestockFeedIngredientId, number]
    >) {
      consumedByIngredientId[ingredientId] =
        (consumedByIngredientId[ingredientId] ?? 0) + quantity;
    }

    const nextPlacement = resumeLivestockPlacementProduction(
      placement,
      definition,
      livestock,
      nowMs,
    );
    livestock = {
      ...livestock,
      placementsById: {
        ...livestock.placementsById,
        [placement.id]: nextPlacement,
      },
    };
    nextState = appendLivestockTelemetry(
      setLivestockStateIfChanged(nextState, livestock, nowMs),
      "livestock_resumed_production",
      {
        placement,
        nextPlacement,
        outputId: definition.output?.id,
        feedCost: getTotalFeedCost(feedCosts),
        result: "success",
      },
    );
    fedPlacementIds.push(placement.id);
  }

  if (fedPlacementIds.length <= 0) {
    return failFeedNow(nextState, "insufficient_feed");
  }

  return {
    ok: true,
    state: appendLivestockTelemetry(nextState, "livestock_feed_now_succeeded", {
      creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
      outputId: LIVESTOCK_EGG_OUTPUT_ID,
      feedCost: getTotalFeedCost(consumedByIngredientId),
      result: "success",
    }),
    fedPlacementIds,
    consumedByIngredientId,
  };
}

export function purchaseLivestockAnimalUpgrade(
  state: GameState,
  creatureId: LivestockCreatureId,
  upgradeId: LivestockAnimalUpgradeId,
  nowMs = Date.now(),
): LivestockUpgradeResult {
  const settledState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(settledState.livestock, nowMs);
  const definition = getLivestockCreatureDefinition(creatureId);
  const upgradeDefinition = LIVESTOCK_ANIMAL_UPGRADE_DEFINITIONS[upgradeId];
  const attemptState = appendLivestockTelemetry(
    setLivestockStateIfChanged(settledState, livestock, nowMs),
    "livestock_upgrade_attempt",
    {
      creatureId,
      upgradeId,
      result: "attempt",
    },
  );
  const actionFailure = getLivestockActionFailure(attemptState);

  if (actionFailure) {
    return failUpgrade(attemptState, actionFailure, {
      creatureId,
      upgradeId,
    });
  }

  if (!definition) {
    return failUpgrade(attemptState, "invalid_creature", {
      creatureId,
      upgradeId,
    });
  }

  if (!definition.output) {
    return failUpgrade(attemptState, "upgrade_disabled", {
      creatureId,
      upgradeId,
    });
  }

  if (!upgradeDefinition) {
    return failUpgrade(attemptState, "invalid_upgrade", {
      creatureId,
      upgradeId,
    });
  }

  if (!upgradeDefinition.isEnabled) {
    return failUpgrade(attemptState, "upgrade_disabled", {
      creatureId,
      upgradeId,
    });
  }

  const levels = getLivestockAnimalUpgradeLevels(livestock, creatureId);
  const currentLevel = levels[upgradeId];

  if (currentLevel >= upgradeDefinition.maxLevel) {
    return failUpgrade(attemptState, "max_level", {
      creatureId,
      upgradeId,
      previousLevel: currentLevel,
    });
  }

  const costCrowns = getLivestockUpgradeCostCrowns(currentLevel);

  if (getCurrencyBalance(attemptState.wallet, "crowns") < costCrowns) {
    return failUpgrade(attemptState, "insufficient_crowns", {
      creatureId,
      upgradeId,
      previousLevel: currentLevel,
      costCrowns,
    });
  }

  const nextLevel = currentLevel + 1;
  const nextAnimalUpgradeLevels = {
    ...livestock.animalUpgradeLevelsByCreatureId,
    [creatureId]: {
      ...levels,
      [upgradeId]: nextLevel,
    },
  };
  const nextLivestock = sanitizeLivestockState(
    {
      ...livestock,
      animalUpgradeLevelsByCreatureId: nextAnimalUpgradeLevels,
    },
    nowMs,
  );
  const walletResult = removeCurrencyFromWalletState(
    attemptState,
    "crowns",
    costCrowns,
    "livestock_upgrade",
  );

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...walletResult.state,
        livestock: nextLivestock,
      },
      "livestock_upgrade_succeeded",
      {
        creatureId,
        upgradeId,
        previousLevel: currentLevel,
        nextLevel,
        costCrowns,
        result: "success",
      },
    ),
    previousLevel: currentLevel,
    nextLevel,
    costCrowns,
  };
}

export function purchaseLivestockBuildingUpgrade(
  state: GameState,
  upgradeId: LivestockBuildingUpgradeId,
  nowMs = Date.now(),
): LivestockUpgradeResult {
  const settledState = settleLivestockState(state, nowMs);
  const livestock = sanitizeLivestockState(settledState.livestock, nowMs);
  const upgradeDefinition = LIVESTOCK_BUILDING_UPGRADE_DEFINITIONS[upgradeId];
  const attemptState = appendLivestockTelemetry(
    setLivestockStateIfChanged(settledState, livestock, nowMs),
    "livestock_upgrade_attempt",
    {
      upgradeId,
      result: "attempt",
    },
  );
  const actionFailure = getLivestockActionFailure(attemptState);

  if (actionFailure) {
    return failUpgrade(attemptState, actionFailure, { upgradeId });
  }

  if (!upgradeDefinition) {
    return failUpgrade(attemptState, "invalid_upgrade", { upgradeId });
  }

  if (!upgradeDefinition.isEnabled) {
    return failUpgrade(attemptState, "upgrade_disabled", { upgradeId });
  }

  const levels = getLivestockBuildingUpgradeLevels(livestock);
  const currentLevel = levels[upgradeId];

  if (currentLevel >= upgradeDefinition.maxLevel) {
    return failUpgrade(attemptState, "max_level", {
      upgradeId,
      previousLevel: currentLevel,
    });
  }

  const costCrowns = getLivestockUpgradeCostCrowns(currentLevel);

  if (getCurrencyBalance(attemptState.wallet, "crowns") < costCrowns) {
    return failUpgrade(attemptState, "insufficient_crowns", {
      upgradeId,
      previousLevel: currentLevel,
      costCrowns,
    });
  }

  const nextLevel = currentLevel + 1;
  const nextLivestock = sanitizeLivestockState(
    {
      ...livestock,
      buildingUpgradeLevels: {
        ...levels,
        [upgradeId]: nextLevel,
      },
    },
    nowMs,
  );
  const walletResult = removeCurrencyFromWalletState(
    attemptState,
    "crowns",
    costCrowns,
    "livestock_upgrade",
  );

  return {
    ok: true,
    state: appendLivestockTelemetry(
      {
        ...walletResult.state,
        livestock: nextLivestock,
      },
      "livestock_upgrade_succeeded",
      {
        upgradeId,
        previousLevel: currentLevel,
        nextLevel,
        costCrowns,
        result: "success",
      },
    ),
    previousLevel: currentLevel,
    nextLevel,
    costCrowns,
  };
}

export function getLivestockExpectedOutputsPerHour(
  state: Pick<GameState, "livestock">,
): number {
  const livestock = sanitizeLivestockState(state.livestock);

  return Object.values(livestock.placementsById).reduce((total, placement) => {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition || !definition.output || placement.isHungry) {
      return total;
    }

    return (
      total +
      (60 * 60 * 1000 * definition.output.quantity) /
        getLivestockOutputIntervalMs(livestock, definition)
    );
  }, 0);
}

export function getAvailableLivestockCreatureCount(
  livestock: LivestockState,
  creatureId: LivestockCreatureId,
): number {
  const owned = livestock.ownedCreaturesById[creatureId] ?? 0;
  const placed = Object.values(livestock.placementsById).filter(
    (placement) => placement.creatureId === creatureId,
  ).length;

  return Math.max(0, owned - placed);
}

export function getLivestockFootprintCells(
  definition: LivestockCreatureDefinition,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation,
): Array<{ x: number; y: number }> {
  const width =
    rotation === "vertical"
      ? definition.footprint.height
      : definition.footprint.width;
  const height =
    rotation === "vertical"
      ? definition.footprint.width
      : definition.footprint.height;
  const cells: Array<{ x: number; y: number }> = [];

  for (let offsetY = 0; offsetY < height; offsetY += 1) {
    for (let offsetX = 0; offsetX < width; offsetX += 1) {
      cells.push({ x: x + offsetX, y: y + offsetY });
    }
  }

  return cells;
}

function validatePlacementLocation(
  livestock: LivestockState,
  definition: LivestockCreatureDefinition,
  x: number,
  y: number,
  rotation: LivestockPlacementRotation,
  ignoredPlacementId?: LivestockPlacementId,
): LivestockCommandFailureReason | null {
  const cells = getLivestockFootprintCells(definition, x, y, rotation);

  if (
    cells.some(
      (cell) =>
        cell.x < 0 ||
        cell.y < 0 ||
        cell.x >= livestock.grid.width ||
        cell.y >= livestock.grid.height,
    )
  ) {
    return "out_of_bounds";
  }

  const occupiedCells = new Set<string>();

  for (const placement of Object.values(livestock.placementsById)) {
    if (placement.id === ignoredPlacementId) {
      continue;
    }

    const otherDefinition = getLivestockCreatureDefinition(placement.creatureId);

    if (!otherDefinition) {
      continue;
    }

    for (const cell of getLivestockFootprintCells(
      otherDefinition,
      placement.x,
      placement.y,
      placement.rotation,
    )) {
      occupiedCells.add(getGridCellKey(cell.x, cell.y));
    }
  }

  return cells.some((cell) => occupiedCells.has(getGridCellKey(cell.x, cell.y)))
    ? "occupied_cell"
    : null;
}

function setLivestockStateIfChanged(
  state: GameState,
  livestock: LivestockState,
  nowMs = Date.now(),
): GameState {
  if (
    areLivestockStatesEqual(
      sanitizeLivestockState(state.livestock, nowMs),
      livestock,
    )
  ) {
    return state;
  }

  return {
    ...state,
    livestock,
  };
}

function areLivestockStatesEqual(
  first: LivestockState,
  second: LivestockState,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function getLivestockActionFailure(
  state: GameState,
): LivestockCommandFailureReason | null {
  if (!isTownServicesUnlocked(state)) {
    return "locked_service";
  }

  if (!isPartyLeaderNearLivestockKeeper(state)) {
    return "not_near_livestock";
  }

  return null;
}

function createPlacementId(
  livestock: LivestockState,
  creatureId: LivestockCreatureId,
): LivestockPlacementId {
  let sequence = livestock.placementSequence + 1;
  let placementId = `livestock_${creatureId}_${sequence}`;

  while (livestock.placementsById[placementId]) {
    sequence += 1;
    placementId = `livestock_${creatureId}_${sequence}`;
  }

  return placementId;
}

function sanitizeLivestockAnimalUpgradeLevels(
  levels: unknown,
): LivestockAnimalUpgradeLevels {
  const fallback = createInitialLivestockAnimalUpgradeLevels();

  if (!isRecord(levels)) {
    return fallback;
  }

  return {
    speed: sanitizeUpgradeLevel(levels.speed, 1, LIVESTOCK_SPEED_MAX_LEVEL),
    feedDiscount: sanitizeUpgradeLevel(
      levels.feedDiscount,
      0,
      LIVESTOCK_FEED_DISCOUNT_MAX_LEVEL,
    ),
    outputCap: sanitizeUpgradeLevel(
      levels.outputCap,
      1,
      LIVESTOCK_OUTPUT_CAP_MAX_LEVEL,
    ),
  };
}

function sanitizeLivestockBuildingUpgradeLevels(
  levels: unknown,
): LivestockBuildingUpgradeLevels {
  const fallback = createInitialLivestockBuildingUpgradeLevels();

  if (!isRecord(levels)) {
    return fallback;
  }

  return {
    columns: sanitizeUpgradeLevel(levels.columns, 0, LIVESTOCK_GRID_COLUMNS_MAX_LEVEL),
    rows: sanitizeUpgradeLevel(levels.rows, 0, LIVESTOCK_GRID_ROWS_MAX_LEVEL),
    slotEfficiency: sanitizeUpgradeLevel(
      levels.slotEfficiency,
      0,
      LIVESTOCK_SLOT_EFFICIENCY_MAX_LEVEL,
    ),
  };
}

function sanitizeUpgradeLevel(
  value: unknown,
  fallback: number,
  maxLevel: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maxLevel, Math.max(0, Math.floor(value)));
}

function sanitizePlacement(
  fallbackId: string,
  placement: unknown,
): LivestockPlacedCreatureState | null {
  if (!isRecord(placement)) {
    return null;
  }

  const creatureId = placement.creatureId;

  if (!getLivestockCreatureDefinition(creatureId as LivestockCreatureId)) {
    return null;
  }

  const isHungry = placement.isHungry === true;
  const sanitizedPlacement: LivestockPlacedCreatureState = {
    id:
      typeof placement.id === "string" && placement.id.length > 0
        ? placement.id
        : fallbackId,
    creatureId: creatureId as LivestockCreatureId,
    x: sanitizeNonNegativeInteger(placement.x),
    y: sanitizeNonNegativeInteger(placement.y),
    rotation: sanitizeRotation(placement.rotation),
    placedAtMs: sanitizeNonNegativeInteger(placement.placedAtMs),
    lastProducedAtMs: sanitizeNonNegativeInteger(placement.lastProducedAtMs),
  };

  if (!isHungry) {
    return sanitizedPlacement;
  }

  return {
    ...sanitizedPlacement,
    isHungry: true,
    hungrySinceMs: sanitizeNonNegativeInteger(placement.hungrySinceMs),
    pausedProductionRemainingMs: sanitizeNonNegativeInteger(
      placement.pausedProductionRemainingMs,
    ),
  };
}

function sanitizeRotation(value: unknown): LivestockPlacementRotation {
  return value === "vertical" ? "vertical" : "horizontal";
}

function getHighestPlacementSequence(
  placementsById: LivestockState["placementsById"],
): number {
  return Object.keys(placementsById).reduce((highest, placementId) => {
    const match = placementId.match(/_(\d+)$/);

    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
}

function sanitizeLivestockDayStart(value: unknown, nowMs: number): number {
  const sanitized = sanitizeNonNegativeInteger(value);

  if (sanitized <= 0) {
    return getLivestockLocalDayStartMs(nowMs);
  }

  return sanitized;
}

export function getLivestockLocalDayStartMs(nowMs = Date.now()): number {
  const date = new Date(nowMs);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function getNextLivestockDayStartMs(dayStartMs: number): number {
  const date = new Date(dayStartMs);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).getTime();
}

export function getNextLivestockFeedAtMs(nowMs = Date.now()): number {
  return getNextLivestockDayStartMs(getLivestockLocalDayStartMs(nowMs));
}

function getRemainingMsUntilNextLocalMidnight(nowMs: number): number {
  return Math.max(0, getNextLivestockFeedAtMs(nowMs) - nowMs);
}

function getProratedLivestockFeedCosts(
  livestock: LivestockState,
  definition: LivestockCreatureDefinition,
  nowMs: number,
): Partial<Record<LivestockFeedIngredientId, number>> {
  const remainingMs = getRemainingMsUntilNextLocalMidnight(nowMs);
  const levels = getLivestockAnimalUpgradeLevels(livestock, definition.id);

  return definition.feedPerDay.reduce<
    Partial<Record<LivestockFeedIngredientId, number>>
  >(
    (costs, feed) => ({
      ...costs,
      [feed.ingredientId]:
        (costs[feed.ingredientId] ?? 0) +
        Math.floor(
          (getLivestockEffectiveFeedQuantity(
            feed.quantity,
            levels.feedDiscount,
          ) *
            remainingMs) /
            LIVESTOCK_DAY_MS,
        ),
    }),
    {},
  );
}

function getFullLivestockFeedCosts(
  livestock: LivestockState,
  definition: LivestockCreatureDefinition,
): Partial<Record<LivestockFeedIngredientId, number>> {
  const levels = getLivestockAnimalUpgradeLevels(livestock, definition.id);

  return definition.feedPerDay.reduce<
    Partial<Record<LivestockFeedIngredientId, number>>
  >(
    (costs, feed) => ({
      ...costs,
      [feed.ingredientId]:
        (costs[feed.ingredientId] ?? 0) +
        getLivestockEffectiveFeedQuantity(feed.quantity, levels.feedDiscount),
    }),
    {},
  );
}

function consumeLivestockFeedCosts(
  state: GameState,
  feedCosts: Partial<Record<LivestockFeedIngredientId, number>>,
  nowMs: number,
): { ok: true; state: GameState } | { ok: false } {
  const totalCost = getTotalFeedCost(feedCosts);

  if (totalCost <= 0) {
    return { ok: true, state };
  }

  const kitchen = sanitizeInnKitchenState(state.innKitchen, state, nowMs, {
    settleHearthFire: false,
  });
  const nextIngredientQuantities = {
    ...kitchen.pantry.ingredientQuantitiesById,
  };

  for (const [ingredientId, quantity] of Object.entries(feedCosts) as Array<
    [LivestockFeedIngredientId, number]
  >) {
    if (quantity <= 0) {
      continue;
    }

    if ((nextIngredientQuantities[ingredientId] ?? 0) < quantity) {
      return { ok: false };
    }
  }

  for (const [ingredientId, quantity] of Object.entries(feedCosts) as Array<
    [LivestockFeedIngredientId, number]
  >) {
    if (quantity <= 0) {
      continue;
    }

    nextIngredientQuantities[ingredientId] =
      (nextIngredientQuantities[ingredientId] ?? 0) - quantity;
  }

  return {
    ok: true,
    state: {
      ...state,
      innKitchen: {
        ...kitchen,
        pantry: {
          ...kitchen.pantry,
          ingredientQuantitiesById: nextIngredientQuantities,
        },
      },
    },
  };
}

function getTotalFeedCost(
  feedCosts: Partial<Record<LivestockFeedIngredientId, number>>,
): number {
  return Object.values(feedCosts).reduce(
    (total, quantity) => total + Math.max(0, quantity ?? 0),
    0,
  );
}

function makeLivestockPlacementHungry(
  placement: LivestockPlacedCreatureState,
  definition: LivestockCreatureDefinition,
  livestock: LivestockState,
  nowMs: number,
): LivestockPlacedCreatureState {
  if (placement.isHungry) {
    return placement;
  }

  return {
    ...placement,
    isHungry: true,
    hungrySinceMs: nowMs,
    pausedProductionRemainingMs: getLivestockProductionRemainingMs(
      placement,
      definition,
      livestock,
      nowMs,
    ),
  };
}

function resumeLivestockPlacementProduction(
  placement: LivestockPlacedCreatureState,
  definition: LivestockCreatureDefinition,
  livestock: LivestockState,
  nowMs: number,
): LivestockPlacedCreatureState {
  if (!definition.output) {
    return {
      ...placement,
      isHungry: false,
      hungrySinceMs: undefined,
      pausedProductionRemainingMs: undefined,
    };
  }

  const intervalMs = getLivestockOutputIntervalMs(livestock, definition);
  const remainingMs = Math.min(
    intervalMs,
    Math.max(
      0,
      placement.pausedProductionRemainingMs ??
        getLivestockProductionRemainingMs(placement, definition, livestock, nowMs),
    ),
  );

  return {
    ...placement,
    isHungry: false,
    hungrySinceMs: undefined,
    pausedProductionRemainingMs: undefined,
    lastProducedAtMs: nowMs - (intervalMs - remainingMs),
  };
}

function getLivestockProductionRemainingMs(
  placement: LivestockPlacedCreatureState,
  definition: LivestockCreatureDefinition,
  livestock: LivestockState,
  nowMs: number,
): number {
  if (!definition.output) {
    return 0;
  }

  const intervalMs = getLivestockOutputIntervalMs(livestock, definition);
  const elapsedMs = Math.max(0, nowMs - placement.lastProducedAtMs);
  const cycleProgressMs = elapsedMs % intervalMs;

  return cycleProgressMs === 0 && elapsedMs > 0
    ? intervalMs
    : intervalMs - cycleProgressMs;
}

function getOrderedLivestockPlacements(
  livestock: LivestockState,
): LivestockPlacedCreatureState[] {
  const definitionOrder = new Map(
    LIVESTOCK_CREATURE_DEFINITIONS.map((definition, index) => [
      definition.id,
      index,
    ]),
  );

  return Object.values(livestock.placementsById).sort((first, second) => {
    const firstOrder = definitionOrder.get(first.creatureId) ?? Number.MAX_SAFE_INTEGER;
    const secondOrder = definitionOrder.get(second.creatureId) ?? Number.MAX_SAFE_INTEGER;

    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    if (first.placedAtMs !== second.placedAtMs) {
      return first.placedAtMs - second.placedAtMs;
    }

    return first.id.localeCompare(second.id);
  });
}

function failPlacement(
  state: GameState,
  type: "livestock_place_failed" | "livestock_move_failed",
  reason: LivestockCommandFailureReason,
  event: {
    placement?: LivestockPlacedCreatureState;
    placementId?: LivestockPlacementId;
    creatureId?: LivestockCreatureId;
    outputId?: LivestockOutputId;
    x?: number;
    y?: number;
    rotation?: LivestockPlacementRotation;
    feedCost?: number;
  },
): LivestockPlacementResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, type, {
      ...event,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function failRemove(
  state: GameState,
  reason: LivestockCommandFailureReason,
  placement?: LivestockPlacedCreatureState,
  outputId?: LivestockOutputId,
): LivestockRemoveResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, "livestock_remove_failed", {
      placement,
      outputId,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function failCollect(
  state: GameState,
  reason: LivestockCommandFailureReason,
): LivestockCollectAllResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, "livestock_collect_all_failed", {
      outputId: LIVESTOCK_EGG_OUTPUT_ID,
      quantityBefore:
        sanitizeLivestockState(state.livestock).holdingQuantitiesByOutputId[
          LIVESTOCK_EGG_OUTPUT_ID
        ] ?? 0,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function failFeedNow(
  state: GameState,
  reason: LivestockCommandFailureReason,
): LivestockFeedNowResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, "livestock_feed_now_failed", {
      outputId: LIVESTOCK_EGG_OUTPUT_ID,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function failUpgrade(
  state: GameState,
  reason: LivestockCommandFailureReason,
  event: {
    creatureId?: LivestockCreatureId;
    upgradeId?: LivestockAnimalUpgradeId | LivestockBuildingUpgradeId;
    previousLevel?: number;
    nextLevel?: number;
    costCrowns?: number;
  },
): LivestockUpgradeResult {
  return {
    ok: false,
    state: appendLivestockTelemetry(state, "livestock_upgrade_failed", {
      creatureId: event.creatureId,
      upgradeId: event.upgradeId,
      previousLevel: event.previousLevel,
      nextLevel: event.nextLevel,
      costCrowns: event.costCrowns,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function appendLivestockTelemetry(
  state: GameState,
  type:
    | "livestock_creature_unlock_roll"
    | "livestock_creature_unlocked"
    | "livestock_creature_unlock_duplicate"
    | "livestock_creature_purchase_attempt"
    | "livestock_creature_purchase_succeeded"
    | "livestock_creature_purchase_failed"
    | "livestock_place_attempt"
    | "livestock_place_succeeded"
    | "livestock_place_failed"
    | "livestock_move_attempt"
    | "livestock_move_succeeded"
    | "livestock_move_failed"
    | "livestock_remove_attempt"
    | "livestock_remove_succeeded"
    | "livestock_remove_failed"
    | "livestock_output_generated"
    | "livestock_generation_blocked_cap"
    | "livestock_collect_all_succeeded"
    | "livestock_collect_all_failed"
    | "livestock_pantry_transfer"
    | "livestock_inventory_transfer"
    | "livestock_feed_paid"
    | "livestock_feed_failed"
    | "livestock_midnight_feed"
    | "livestock_feed_now_succeeded"
    | "livestock_feed_now_failed"
    | "livestock_became_hungry"
    | "livestock_resumed_production"
    | "livestock_upgrade_attempt"
    | "livestock_upgrade_succeeded"
    | "livestock_upgrade_failed",
  event: {
    placement?: LivestockPlacedCreatureState;
    nextPlacement?: LivestockPlacedCreatureState;
    placementId?: LivestockPlacementId;
    creatureId?: LivestockCreatureId;
    keyItemId?: KeyItemId;
    livestockUnlockSource?: LivestockCreatureUnlockSource;
    livestockUnlockChance?: number;
    livestockUnlockRoll?: number;
    upgradeId?: LivestockAnimalUpgradeId | LivestockBuildingUpgradeId;
    outputId?: LivestockOutputId;
    x?: number;
    y?: number;
    rotation?: LivestockPlacementRotation;
    quantityBefore?: number;
    quantityAfter?: number;
    capacity?: number;
    generatedQuantity?: number;
    feedCost?: number;
    costCrowns?: number;
    previousLevel?: number;
    nextLevel?: number;
    result: string;
    reason?: string;
  },
): GameState {
  const placement = event.nextPlacement ?? event.placement;
  const definition = event.creatureId
    ? getLivestockCreatureDefinition(event.creatureId)
    : placement
      ? getLivestockCreatureDefinition(placement.creatureId)
      : null;

  return appendDebugTelemetryEvent(state, {
    type,
    entityId: "__livestock__",
    keyItemId: event.keyItemId ?? getLivestockDiscoveryKeyItemId(
      event.creatureId ?? placement?.creatureId,
    ),
    livestockCreatureId: event.creatureId ?? placement?.creatureId,
    livestockPlacementId: event.placementId ?? placement?.id,
    livestockOutputId: event.outputId,
    livestockUnlockSource: event.livestockUnlockSource,
    livestockUnlockChance: event.livestockUnlockChance,
    livestockUnlockRoll: event.livestockUnlockRoll,
    livestockGridX: event.x ?? placement?.x,
    livestockGridY: event.y ?? placement?.y,
    livestockRotation: event.rotation ?? placement?.rotation,
    livestockFootprintWidth: definition?.footprint.width,
    livestockFootprintHeight: definition?.footprint.height,
    livestockQuantityBefore: event.quantityBefore,
    livestockQuantityAfter: event.quantityAfter,
    livestockCapacity: event.capacity,
    livestockGeneratedQuantity: event.generatedQuantity,
    livestockFeedCost: event.feedCost,
    livestockUpgradeId: event.upgradeId,
    crownCost: event.costCrowns,
    previousLivestockUpgradeLevel: event.previousLevel,
    nextLivestockUpgradeLevel: event.nextLevel,
    result: event.result,
    reason: event.reason,
  });
}

function isLivestockOutputId(value: string): value is LivestockOutputId {
  return value === LIVESTOCK_EGG_OUTPUT_ID || value === LIVESTOCK_TIN_ORE_OUTPUT_ID;
}

function getLivestockDiscoveryKeyItemId(
  creatureId: LivestockCreatureId | undefined,
): KeyItemId | undefined {
  if (!creatureId) {
    return undefined;
  }

  return getLivestockCreatureDefinition(creatureId)?.discoveryKeyItemId;
}

function getLivestockCreatureDropDisplayName(
  creature: LivestockCreatureDefinition,
): string {
  return creature.id === LIVESTOCK_WOLF_CREATURE_ID
    ? "Wolf Pup"
    : creature.displayName;
}

function getLivestockUnlockSourceForEnemyType(
  enemyTypeId: EnemyTypeId | undefined,
): { creatureId: LivestockCreatureId; source: LivestockCreatureUnlockSource } | null {
  switch (enemyTypeId) {
    case "wolf":
      return {
        creatureId: LIVESTOCK_WOLF_CREATURE_ID,
        source: "wolf_defeat",
      };
    case "tin_crawler":
      return {
        creatureId: LIVESTOCK_TIN_CRAWLER_CREATURE_ID,
        source: "tin_crawler_defeat",
      };
    case "elder_mossling":
      return {
        creatureId: LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
        source: "elder_mossling_defeat",
      };
    default:
      return null;
  }
}

function getGridCellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
