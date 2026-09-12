import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { sanitizeInnKitchenState } from "./innKitchen";
import {
  awardKeyItemIfMissing,
  getKeyItemDefinition,
  FARM_ASHPEPPER_SEED_KEY_ITEM_ID,
  FARM_BITTERCAP_MUSHROOM_SEED_KEY_ITEM_ID,
  FARM_MOONLEAF_SEED_KEY_ITEM_ID,
  FARM_POTATO_SEED_KEY_ITEM_ID,
} from "./keyItems";
import { queueUnlockNewsBroadcast } from "./newsBroadcast";
import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import { getLivestockHelperBonusSummary } from "./livestockHelperBonuses";
import type { GameState } from "./state";
import type {
  Enemy,
  FarmCropId,
  FarmFieldId,
  FarmFieldState,
  FarmFieldUpgradeId,
  FarmFieldUpgradeLevels,
  FarmState,
  KeyItemId,
  NpcEntity,
  ResourceEntity,
} from "./types";
import { isTownServicesUnlocked } from "./townServices";
import {
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";

export const FARM_INTERACTION_RANGE = 8;
export const FARM_CARROT_CROP_ID: FarmCropId = "carrot";
export const FARM_POTATO_CROP_ID: FarmCropId = "potato";
export const FARM_MOONLEAF_CROP_ID: FarmCropId = "moonleaf";
export const FARM_BITTERCAP_MUSHROOM_CROP_ID: FarmCropId =
  "bittercap_mushroom";
export const FARM_ASHPEPPER_CROP_ID: FarmCropId = "ashpepper";
export const FARM_CARROT_FIELD_ID: FarmFieldId = "carrot_field";
export const FARM_POTATO_FIELD_ID: FarmFieldId = "potato_field";
export const FARM_MOONLEAF_FIELD_ID: FarmFieldId = "moonleaf_field";
export const FARM_BITTERCAP_MUSHROOM_FIELD_ID: FarmFieldId =
  "bittercap_mushroom_field";
export const FARM_ASHPEPPER_FIELD_ID: FarmFieldId = "ashpepper_field";
export const FARM_CARROT_GROWTH_MS = 20 * 60 * 1000;
export const FARM_CARROT_YIELD = 1;
export const FARM_CARROT_BASE_HOLD_CAP = 20;
export const FARM_SEED_UNLOCK_CHANCE = 0.1;
export const FARM_POTATO_SEED_PRICE_CROWNS = 100;
export const FARM_FIELD_UPGRADE_IDS: FarmFieldUpgradeId[] = [
  "speed",
  "cap",
  "fertilizer",
];
export const FARM_SPEED_MAX_LEVEL = 5;
export const FARM_CAP_MAX_LEVEL = 5;
export const FARM_FERTILIZER_MAX_LEVEL = 3;
export const FARM_SPEED_BONUS_PER_LEVEL_AFTER_BASE = 0.05;
export const FARM_CAP_BONUS_PER_LEVEL_AFTER_BASE = 0.2;
export const FARM_FERTILIZER_DOUBLE_CROP_CHANCE_PERCENT_PER_LEVEL = 1;

export type FarmCropUnlockSource =
  | "base"
  | "merchant"
  | "herb_gathering"
  | "wood_gathering"
  | "ash_wisp_defeat";

export type FarmCropDefinition = {
  id: FarmCropId;
  fieldId: FarmFieldId;
  displayName: string;
  singularName: string;
  seedKeyItemId: KeyItemId | null;
  sourceHint: string;
  unlockSource: FarmCropUnlockSource;
  growthMs: number;
  yieldQuantity: number;
  baseHoldCap: number;
};

export const FARM_CROP_DEFINITIONS: FarmCropDefinition[] = [
  {
    id: FARM_CARROT_CROP_ID,
    fieldId: FARM_CARROT_FIELD_ID,
    displayName: "Carrots",
    singularName: "Carrot",
    seedKeyItemId: null,
    sourceHint: "Base crop",
    unlockSource: "base",
    growthMs: FARM_CARROT_GROWTH_MS,
    yieldQuantity: FARM_CARROT_YIELD,
    baseHoldCap: FARM_CARROT_BASE_HOLD_CAP,
  },
  {
    id: FARM_POTATO_CROP_ID,
    fieldId: FARM_POTATO_FIELD_ID,
    displayName: "Potatoes",
    singularName: "Potato",
    seedKeyItemId: FARM_POTATO_SEED_KEY_ITEM_ID,
    sourceHint: "Merchant seed purchase",
    unlockSource: "merchant",
    growthMs: FARM_CARROT_GROWTH_MS,
    yieldQuantity: FARM_CARROT_YIELD,
    baseHoldCap: FARM_CARROT_BASE_HOLD_CAP,
  },
  {
    id: FARM_MOONLEAF_CROP_ID,
    fieldId: FARM_MOONLEAF_FIELD_ID,
    displayName: "Moonleaf",
    singularName: "Moonleaf",
    seedKeyItemId: FARM_MOONLEAF_SEED_KEY_ITEM_ID,
    sourceHint: "Rare find from T1 herb gathering",
    unlockSource: "herb_gathering",
    growthMs: FARM_CARROT_GROWTH_MS,
    yieldQuantity: FARM_CARROT_YIELD,
    baseHoldCap: FARM_CARROT_BASE_HOLD_CAP,
  },
  {
    id: FARM_BITTERCAP_MUSHROOM_CROP_ID,
    fieldId: FARM_BITTERCAP_MUSHROOM_FIELD_ID,
    displayName: "Bittercap Mushrooms",
    singularName: "Bittercap Mushroom",
    seedKeyItemId: FARM_BITTERCAP_MUSHROOM_SEED_KEY_ITEM_ID,
    sourceHint: "Rare find from T1 wood gathering",
    unlockSource: "wood_gathering",
    growthMs: FARM_CARROT_GROWTH_MS,
    yieldQuantity: FARM_CARROT_YIELD,
    baseHoldCap: FARM_CARROT_BASE_HOLD_CAP,
  },
  {
    id: FARM_ASHPEPPER_CROP_ID,
    fieldId: FARM_ASHPEPPER_FIELD_ID,
    displayName: "Ashpeppers",
    singularName: "Ashpepper",
    seedKeyItemId: FARM_ASHPEPPER_SEED_KEY_ITEM_ID,
    sourceHint: "Rare find from Ash Wisp defeats",
    unlockSource: "ash_wisp_defeat",
    growthMs: FARM_CARROT_GROWTH_MS,
    yieldQuantity: FARM_CARROT_YIELD,
    baseHoldCap: FARM_CARROT_BASE_HOLD_CAP,
  },
];

export type FarmCommandFailureReason =
  | "locked_service"
  | "not_near_farmer"
  | "insufficient_crowns"
  | "max_level"
  | "invalid_field"
  | "invalid_upgrade"
  | "nothing_to_harvest";

export type FarmUpgradeResult =
  | {
      ok: true;
      state: GameState;
      field: FarmFieldState;
      upgradeId: FarmFieldUpgradeId;
      costCrowns: number;
      previousLevel: number;
      nextLevel: number;
    }
  | {
      ok: false;
      state: GameState;
      reason: FarmCommandFailureReason;
      missingCrowns?: number;
    };

export type FarmHarvestAllResult =
  | {
      ok: true;
      state: GameState;
      harvestedByCropId: Partial<Record<FarmCropId, number>>;
    }
  | {
      ok: false;
      state: GameState;
      reason: FarmCommandFailureReason;
    };

export type FarmCropUnlockResult =
  | {
      ok: true;
      state: GameState;
      crop: FarmCropDefinition;
      field: FarmFieldState;
      seedKeyItemId: KeyItemId | null;
      source: FarmCropUnlockSource;
    }
  | {
      ok: false;
      state: GameState;
      crop: FarmCropDefinition;
      reason: "already_unlocked";
      source: FarmCropUnlockSource;
    };

type FarmUpgradeDefinition = {
  id: FarmFieldUpgradeId;
  displayName: string;
  maxLevel: number;
};

export const FARM_FIELD_UPGRADE_DEFINITIONS: Record<
  FarmFieldUpgradeId,
  FarmUpgradeDefinition
> = {
  speed: {
    id: "speed",
    displayName: "Faster Generation",
    maxLevel: FARM_SPEED_MAX_LEVEL,
  },
  cap: {
    id: "cap",
    displayName: "Harvest Cap",
    maxLevel: FARM_CAP_MAX_LEVEL,
  },
  fertilizer: {
    id: "fertilizer",
    displayName: "Fertilizer",
    maxLevel: FARM_FERTILIZER_MAX_LEVEL,
  },
};

export function getFarmCropDefinitions(): FarmCropDefinition[] {
  return FARM_CROP_DEFINITIONS;
}

export function getFarmCropDefinition(
  cropId: FarmCropId,
): FarmCropDefinition {
  return (
    FARM_CROP_DEFINITIONS.find((definition) => definition.id === cropId) ??
    FARM_CROP_DEFINITIONS[0]
  );
}

export function getFarmCropDefinitionByFieldId(
  fieldId: FarmFieldId,
): FarmCropDefinition | null {
  return (
    FARM_CROP_DEFINITIONS.find((definition) => definition.fieldId === fieldId) ??
    null
  );
}

export function createInitialFarmState(nowMs = 0): FarmState {
  return {
    fieldsById: {
      carrot_field: createInitialFarmField(
        getFarmCropDefinition(FARM_CARROT_CROP_ID),
        nowMs,
      ),
    },
  };
}

export function getFarmState(state: GameState): FarmState {
  return sanitizeFarmState(state.farm);
}

export function sanitizeFarmState(farm: unknown): FarmState {
  if (!isRecord(farm) || !isRecord(farm.fieldsById)) {
    return createInitialFarmState();
  }

  const fieldsById: FarmState["fieldsById"] = {
    carrot_field: sanitizeFarmField(
      farm.fieldsById[FARM_CARROT_FIELD_ID],
      getFarmCropDefinition(FARM_CARROT_CROP_ID),
    ),
  };

  for (const definition of FARM_CROP_DEFINITIONS) {
    if (definition.id === FARM_CARROT_CROP_ID) {
      continue;
    }

    const rawField = farm.fieldsById[definition.fieldId];

    if (!isRecord(rawField)) {
      continue;
    }

    fieldsById[definition.fieldId] = sanitizeFarmField(rawField, definition);
  }

  return { fieldsById };
}

export function isFarmCropUnlocked(
  state: Pick<GameState, "farm">,
  cropId: FarmCropId,
): boolean {
  const definition = getFarmCropDefinition(cropId);

  return Boolean(sanitizeFarmState(state.farm).fieldsById[definition.fieldId]);
}

export function unlockFarmCrop(
  state: GameState,
  cropId: FarmCropId,
  source: FarmCropUnlockSource,
  nowMs = Date.now(),
): FarmCropUnlockResult {
  const definition = getFarmCropDefinition(cropId);
  const farm = sanitizeFarmState(state.farm);

  if (farm.fieldsById[definition.fieldId]) {
    return {
      ok: false,
      state: appendFarmUnlockTelemetry(state, "farm_crop_unlock_duplicate", {
        crop: definition,
        source,
        result: "duplicate",
        reason: "already_unlocked",
      }),
      crop: definition,
      reason: "already_unlocked",
      source,
    };
  }

  const field = createInitialFarmField(definition, nowMs);
  let nextState: GameState = {
    ...state,
    farm: {
      fieldsById: {
        ...farm.fieldsById,
        [definition.fieldId]: field,
      },
    },
  };

  if (definition.seedKeyItemId) {
    const award = awardKeyItemIfMissing(nextState, definition.seedKeyItemId);
    nextState = award.state;

    if (award.awardedQuantity > 0) {
      nextState = queueUnlockNewsBroadcast(
        nextState,
        getKeyItemDefinition(definition.seedKeyItemId).displayName,
        nowMs,
      );
    }
  }

  return {
    ok: true,
    state: appendFarmUnlockTelemetry(nextState, "farm_crop_unlocked", {
      crop: definition,
      field,
      source,
      result: "success",
    }),
    crop: definition,
    field,
    seedKeyItemId: definition.seedKeyItemId,
    source,
  };
}

export function tryUnlockFarmCropFromGathering(
  state: GameState,
  resource: ResourceEntity,
  nowMs = Date.now(),
  random = Math.random,
): GameState {
  const cropId =
    resource.tier === 1 && resource.resourceType === "herb"
      ? FARM_MOONLEAF_CROP_ID
      : resource.tier === 1 && resource.resourceType === "wood"
        ? FARM_BITTERCAP_MUSHROOM_CROP_ID
        : null;

  if (!cropId || isFarmCropUnlocked(state, cropId)) {
    return state;
  }

  const source =
    resource.resourceType === "herb" ? "herb_gathering" : "wood_gathering";
  const roll = random();
  const crop = getFarmCropDefinition(cropId);
  const rolledState = appendFarmUnlockTelemetry(state, "farm_crop_unlock_roll", {
    crop,
    source,
    chance: FARM_SEED_UNLOCK_CHANCE,
    roll,
    result: roll < FARM_SEED_UNLOCK_CHANCE ? "success" : "failed",
    reason: roll < FARM_SEED_UNLOCK_CHANCE ? undefined : "roll_failed",
  });

  if (roll >= FARM_SEED_UNLOCK_CHANCE) {
    return rolledState;
  }

  return unlockFarmCrop(rolledState, cropId, source, nowMs).state;
}

export function tryUnlockFarmCropFromEnemyDefeat(
  state: GameState,
  enemy: Enemy,
  nowMs = Date.now(),
  random = Math.random,
): GameState {
  if (
    enemy.enemyTypeId !== "ash_wisp" ||
    isFarmCropUnlocked(state, FARM_ASHPEPPER_CROP_ID)
  ) {
    return state;
  }

  const roll = random();
  const crop = getFarmCropDefinition(FARM_ASHPEPPER_CROP_ID);
  const rolledState = appendFarmUnlockTelemetry(state, "farm_crop_unlock_roll", {
    crop,
    source: "ash_wisp_defeat",
    chance: FARM_SEED_UNLOCK_CHANCE,
    roll,
    result: roll < FARM_SEED_UNLOCK_CHANCE ? "success" : "failed",
    reason: roll < FARM_SEED_UNLOCK_CHANCE ? undefined : "roll_failed",
  });

  if (roll >= FARM_SEED_UNLOCK_CHANCE) {
    return rolledState;
  }

  return unlockFarmCrop(
    rolledState,
    FARM_ASHPEPPER_CROP_ID,
    "ash_wisp_defeat",
    nowMs,
  ).state;
}

export function settleFarmState(
  state: GameState,
  nowMs = Date.now(),
  random = Math.random,
): GameState {
  let farm = sanitizeFarmState(state.farm);
  let nextState = setFarmStateIfChanged(state, farm);

  for (const definition of FARM_CROP_DEFINITIONS) {
    const field = farm.fieldsById[definition.fieldId];

    if (!field || field.upgradeLevels.speed < 1) {
      continue;
    }

    const holdCap = getFarmFieldHoldCap(field);
    const generationIntervalMs = getFarmFieldGenerationIntervalMs(field, state);
    const elapsedMs = Math.max(0, nowMs - field.lastGeneratedAtMs);

    if (field.heldQuantity >= holdCap) {
      if (elapsedMs < generationIntervalMs) {
        continue;
      }

      const blockedField = {
        ...field,
        heldQuantity: holdCap,
        lastGeneratedAtMs: nowMs,
      };
      farm = {
        fieldsById: {
          ...farm.fieldsById,
          [definition.fieldId]: blockedField,
        },
      };
      nextState = appendFarmTelemetry(
        setFarmStateIfChanged(nextState, farm),
        "farm_generation_blocked_cap",
        {
          field,
          nextField: blockedField,
          quantityBefore: field.heldQuantity,
          quantityAfter: blockedField.heldQuantity,
          generatedQuantity: 0,
          doubleCropRolls: 0,
          result: "blocked_cap",
          reason: "cap_full",
        },
      );
      continue;
    }

    const completedCycles = Math.floor(elapsedMs / generationIntervalMs);

    if (completedCycles <= 0) {
      continue;
    }

    const availableSpace = holdCap - field.heldQuantity;
    const fertilizerChance =
      getFarmFertilizerDoubleCropChancePercent(field) / 100;
    let generatedQuantity = 0;
    let completedGeneratedCycles = 0;
    let doubleCropRolls = 0;

    for (
      let cycle = 0;
      cycle < completedCycles && generatedQuantity < availableSpace;
      cycle += 1
    ) {
      let cycleQuantity = definition.yieldQuantity;

      if (fertilizerChance > 0 && random() < fertilizerChance) {
        cycleQuantity += definition.yieldQuantity;
        doubleCropRolls += 1;
      }

      generatedQuantity += Math.min(
        cycleQuantity,
        availableSpace - generatedQuantity,
      );
      completedGeneratedCycles += 1;
    }

    const reachedCap = generatedQuantity >= availableSpace;
    const nextField = {
      ...field,
      heldQuantity: Math.min(holdCap, field.heldQuantity + generatedQuantity),
      lastGeneratedAtMs: reachedCap
        ? nowMs
        : field.lastGeneratedAtMs +
          completedGeneratedCycles * generationIntervalMs,
    };
    farm = {
      fieldsById: {
        ...farm.fieldsById,
        [definition.fieldId]: nextField,
      },
    };
    nextState = setFarmStateIfChanged(nextState, farm);

    if (generatedQuantity > 0) {
      nextState = appendFarmTelemetry(nextState, "farm_crop_generated", {
        field,
        nextField,
        quantityBefore: field.heldQuantity,
        quantityAfter: nextField.heldQuantity,
        generatedQuantity,
        doubleCropRolls,
        result: "success",
      });
    }

    if (reachedCap && completedCycles > completedGeneratedCycles) {
      nextState = appendFarmTelemetry(
        nextState,
        "farm_generation_blocked_cap",
        {
          field,
          nextField,
          quantityBefore: field.heldQuantity,
          quantityAfter: nextField.heldQuantity,
          generatedQuantity,
          doubleCropRolls,
          result: "blocked_cap",
          reason: "cap_full",
        },
      );
    }
  }

  return nextState;
}

export function purchaseFarmFieldUpgrade(
  state: GameState,
  fieldId: FarmFieldId,
  upgradeId: FarmFieldUpgradeId,
  nowMs = Date.now(),
): FarmUpgradeResult {
  let settledState = settleFarmState(state, nowMs);
  const farm = sanitizeFarmState(settledState.farm);
  const field = farm.fieldsById[fieldId];
  const upgradeDefinition = FARM_FIELD_UPGRADE_DEFINITIONS[upgradeId];
  const currentLevel = field?.upgradeLevels[upgradeId] ?? 0;
  const costCrowns = getFarmUpgradeCostCrowns(currentLevel);

  settledState = appendFarmTelemetry(settledState, "farm_upgrade_attempt", {
    field: field ?? createInitialFarmField(FARM_CROP_DEFINITIONS[0], nowMs),
    upgradeId,
    quantityBefore: field?.heldQuantity ?? 0,
    quantityAfter: field?.heldQuantity ?? 0,
    previousUpgradeLevel: currentLevel,
    nextUpgradeLevel: upgradeDefinition
      ? Math.min(currentLevel + 1, upgradeDefinition.maxLevel)
      : currentLevel,
    costCrowns,
    result: "attempt",
  });

  const failure = getFarmCommandFailure(settledState, field);

  if (failure) {
    return failUpgrade(settledState, field, upgradeId, failure, costCrowns);
  }

  if (!field) {
    return failUpgrade(
      settledState,
      field,
      upgradeId,
      "invalid_field",
      costCrowns,
    );
  }

  if (!upgradeDefinition) {
    return failUpgrade(
      settledState,
      field,
      upgradeId,
      "invalid_upgrade",
      costCrowns,
    );
  }

  if (currentLevel >= upgradeDefinition.maxLevel) {
    return failUpgrade(settledState, field, upgradeId, "max_level", costCrowns);
  }

  const crownBalance = getCurrencyBalance(settledState.wallet, "crowns");

  if (crownBalance < costCrowns) {
    return failUpgrade(
      settledState,
      field,
      upgradeId,
      "insufficient_crowns",
      costCrowns,
      { missingCrowns: costCrowns - crownBalance },
    );
  }

  const payment = removeCurrencyFromWalletState(
    settledState,
    "crowns",
    costCrowns,
    "farm_upgrade",
  );
  const nextField: FarmFieldState = {
    ...field,
    upgradeLevels: {
      ...field.upgradeLevels,
      [upgradeId]: currentLevel + 1,
    },
    lastGeneratedAtMs:
      upgradeId === "speed" && currentLevel === 0
        ? nowMs
        : field.lastGeneratedAtMs,
  };
  const nextState = appendFarmTelemetry(
    {
      ...payment.state,
      farm: {
        fieldsById: {
          ...farm.fieldsById,
          [fieldId]: nextField,
        },
      },
    },
    "farm_upgrade_succeeded",
    {
      field,
      nextField,
      upgradeId,
      quantityBefore: field.heldQuantity,
      quantityAfter: nextField.heldQuantity,
      previousUpgradeLevel: currentLevel,
      nextUpgradeLevel: nextField.upgradeLevels[upgradeId],
      costCrowns,
      result: "success",
    },
  );

  return {
    ok: true,
    state: nextState,
    field: nextField,
    upgradeId,
    costCrowns,
    previousLevel: currentLevel,
    nextLevel: nextField.upgradeLevels[upgradeId],
  };
}

export function harvestAllFarmCrops(
  state: GameState,
  nowMs = Date.now(),
): FarmHarvestAllResult {
  const farm = sanitizeFarmState(state.farm);
  const harvestState = setFarmStateIfChanged(state, farm);
  const firstField = getFirstFarmField(farm);
  const failure = getFarmCommandFailure(harvestState, firstField);

  if (failure) {
    return failHarvest(harvestState, firstField, failure);
  }

  const fieldsToHarvest = FARM_CROP_DEFINITIONS.map((definition) => ({
    definition,
    field: farm.fieldsById[definition.fieldId],
  })).filter(
    (entry): entry is { definition: FarmCropDefinition; field: FarmFieldState } =>
      Boolean(entry.field && entry.field.heldQuantity > 0),
  );

  if (fieldsToHarvest.length === 0) {
    return failHarvest(harvestState, firstField, "nothing_to_harvest");
  }

  const nextFarmFields = { ...farm.fieldsById };
  const harvestedByCropId: Partial<Record<FarmCropId, number>> = {};
  let nextState: GameState = harvestState;
  let kitchen = sanitizeInnKitchenState(
    harvestState.innKitchen,
    harvestState,
    nowMs,
    { settleHearthFire: false },
  );

  for (const { definition, field } of fieldsToHarvest) {
    const quantity = field.heldQuantity;
    const nextField = {
      ...field,
      heldQuantity: 0,
    };
    nextFarmFields[definition.fieldId] = nextField;
    harvestedByCropId[definition.id] = quantity;

    const previousPantryQuantity =
      kitchen.pantry.ingredientQuantitiesById[definition.id] ?? 0;
    const nextPantryQuantity = previousPantryQuantity + quantity;
    const unlockedIngredientIds =
      kitchen.pantry.unlockedIngredientIds.includes(definition.id)
        ? kitchen.pantry.unlockedIngredientIds
        : [...kitchen.pantry.unlockedIngredientIds, definition.id];

    kitchen = {
      ...kitchen,
      pantry: {
        unlockedIngredientIds,
        ingredientQuantitiesById: {
          ...kitchen.pantry.ingredientQuantitiesById,
          [definition.id]: nextPantryQuantity,
        },
      },
    };
    nextState = appendFarmTelemetry(nextState, "farm_harvest_all_succeeded", {
      field,
      nextField,
      quantityBefore: field.heldQuantity,
      quantityAfter: nextField.heldQuantity,
      result: "success",
    });
    nextState = appendFarmTelemetry(nextState, "farm_pantry_transfer", {
      field,
      nextField,
      quantityBefore: previousPantryQuantity,
      quantityAfter: nextPantryQuantity,
      result: "success",
    });
  }

  nextState = {
    ...nextState,
    farm: {
      fieldsById: nextFarmFields,
    },
    innKitchen: kitchen,
  };

  return {
    ok: true,
    state: nextState,
    harvestedByCropId,
  };
}

export function getFarmFieldHoldCap(field: FarmFieldState): number {
  const definition = getFarmCropDefinition(field.cropId);

  return Math.round(
    definition.baseHoldCap *
      (1 +
        Math.max(0, field.upgradeLevels.cap - 1) *
          FARM_CAP_BONUS_PER_LEVEL_AFTER_BASE),
  );
}

export function getFarmFieldGenerationIntervalMs(
  field: FarmFieldState,
  state?: Pick<GameState, "livestock">,
): number {
  const definition = getFarmCropDefinition(field.cropId);

  if (field.upgradeLevels.speed <= 0) {
    return definition.growthMs;
  }

  return Math.round(
    definition.growthMs /
      (getFarmSpeedMultiplier(field) * getFarmHelperSpeedMultiplier(state)),
  );
}

export function getFarmExpectedCropsPerHour(
  field: FarmFieldState,
  state?: Pick<GameState, "livestock">,
): number {
  const definition = getFarmCropDefinition(field.cropId);

  if (field.upgradeLevels.speed <= 0) {
    return 0;
  }

  const baseCyclesPerHour =
    (60 * 60 * 1000) / getFarmFieldGenerationIntervalMs(field, state);
  const expectedYield =
    definition.yieldQuantity *
    (1 + getFarmFertilizerDoubleCropChancePercent(field) / 100);

  return baseCyclesPerHour * expectedYield;
}

export function getFarmHelperSpeedMultiplier(
  state?: Pick<GameState, "livestock">,
): number {
  return state
    ? getLivestockHelperBonusSummary(state).farmGenerationMultiplier
    : 1;
}

export function getFarmFertilizerDoubleCropChancePercent(
  field: FarmFieldState,
): number {
  return (
    field.upgradeLevels.fertilizer *
    FARM_FERTILIZER_DOUBLE_CROP_CHANCE_PERCENT_PER_LEVEL
  );
}

export function getFarmSpeedMultiplier(field: FarmFieldState): number {
  if (field.upgradeLevels.speed <= 0) {
    return 0;
  }

  return (
    1 +
    Math.max(0, field.upgradeLevels.speed - 1) *
      FARM_SPEED_BONUS_PER_LEVEL_AFTER_BASE
  );
}

export function getFarmUpgradeCostCrowns(currentLevel: number): number {
  return 100 * (currentLevel + 1);
}

export function isFarmerNpc(
  entity: unknown,
): entity is NpcEntity & { npcRole: "farmer" } {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "kind" in entity &&
    entity.kind === "npc" &&
    "npcRole" in entity &&
    entity.npcRole === "farmer"
  );
}

export function isLivestockKeeperNpc(
  entity: unknown,
): entity is NpcEntity & { npcRole: "livestock_keeper" } {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "kind" in entity &&
    entity.kind === "npc" &&
    "npcRole" in entity &&
    entity.npcRole === "livestock_keeper"
  );
}

export function isPartyLeaderNearFarmer(state: GameState): boolean {
  const leader = getPartyLeader(state);

  if (!leader) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isFarmerNpc(entity) &&
      getEuclideanDistance(leader.position, entity.position) <=
        FARM_INTERACTION_RANGE,
  );
}

export function isPartyLeaderNearLivestockKeeper(state: GameState): boolean {
  const leader = getPartyLeader(state);

  if (!leader) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isLivestockKeeperNpc(entity) &&
      getEuclideanDistance(leader.position, entity.position) <=
        FARM_INTERACTION_RANGE,
  );
}

function createInitialFarmField(
  definition: FarmCropDefinition,
  nowMs: number,
): FarmFieldState {
  return {
    id: definition.fieldId,
    cropId: definition.id,
    upgradeLevels: createInitialFarmFieldUpgradeLevels(),
    heldQuantity: 0,
    lastGeneratedAtMs: nowMs,
  };
}

function createInitialFarmFieldUpgradeLevels(): FarmFieldUpgradeLevels {
  return {
    speed: 0,
    cap: 1,
    fertilizer: 0,
  };
}

function sanitizeFarmField(
  rawField: unknown,
  definition: FarmCropDefinition,
): FarmFieldState {
  if (!isRecord(rawField)) {
    return createInitialFarmField(definition, 0);
  }

  const legacyLevel = sanitizeNonNegativeInteger(rawField.level);
  const rawUpgradeLevels = isRecord(rawField.upgradeLevels)
    ? rawField.upgradeLevels
    : {};
  const upgradeLevels: FarmFieldUpgradeLevels = {
    speed: clampInteger(
      sanitizeNonNegativeInteger(rawUpgradeLevels.speed ?? legacyLevel),
      0,
      FARM_SPEED_MAX_LEVEL,
    ),
    cap: clampInteger(
      sanitizeNonNegativeInteger(rawUpgradeLevels.cap ?? 1),
      1,
      FARM_CAP_MAX_LEVEL,
    ),
    fertilizer: clampInteger(
      sanitizeNonNegativeInteger(rawUpgradeLevels.fertilizer ?? 0),
      0,
      FARM_FERTILIZER_MAX_LEVEL,
    ),
  };
  const field: FarmFieldState = {
    id: definition.fieldId,
    cropId: definition.id,
    upgradeLevels,
    heldQuantity: sanitizeNonNegativeInteger(rawField.heldQuantity),
    lastGeneratedAtMs: sanitizeNonNegativeInteger(rawField.lastGeneratedAtMs),
  };

  return {
    ...field,
    heldQuantity: Math.min(getFarmFieldHoldCap(field), field.heldQuantity),
  };
}

function setFarmStateIfChanged(state: GameState, farm: FarmState): GameState {
  const currentFarm = sanitizeFarmState(state.farm);

  if (areFarmStatesEqual(currentFarm, farm)) {
    return state;
  }

  return {
    ...state,
    farm,
  };
}

function areFarmStatesEqual(first: FarmState, second: FarmState): boolean {
  return FARM_CROP_DEFINITIONS.every((definition) =>
    areFarmFieldsEqual(
      first.fieldsById[definition.fieldId],
      second.fieldsById[definition.fieldId],
    ),
  );
}

function areFarmFieldsEqual(
  first: FarmFieldState | undefined,
  second: FarmFieldState | undefined,
): boolean {
  if (!first || !second) {
    return first === second;
  }

  return (
    first.id === second.id &&
    first.cropId === second.cropId &&
    first.upgradeLevels.speed === second.upgradeLevels.speed &&
    first.upgradeLevels.cap === second.upgradeLevels.cap &&
    first.upgradeLevels.fertilizer === second.upgradeLevels.fertilizer &&
    first.heldQuantity === second.heldQuantity &&
    first.lastGeneratedAtMs === second.lastGeneratedAtMs
  );
}

function getFirstFarmField(farm: FarmState): FarmFieldState {
  return (
    FARM_CROP_DEFINITIONS.map(
      (definition) => farm.fieldsById[definition.fieldId],
    ).find((field): field is FarmFieldState => Boolean(field)) ??
    createInitialFarmField(FARM_CROP_DEFINITIONS[0], 0)
  );
}

function getFarmCommandFailure(
  state: GameState,
  field: FarmFieldState | undefined,
): FarmCommandFailureReason | null {
  if (!field || !getFarmCropDefinitionByFieldId(field.id)) {
    return "invalid_field";
  }

  if (!isTownServicesUnlocked(state)) {
    return "locked_service";
  }

  if (!isPartyLeaderNearFarmer(state)) {
    return "not_near_farmer";
  }

  return null;
}

function failUpgrade(
  state: GameState,
  field: FarmFieldState | undefined,
  upgradeId: FarmFieldUpgradeId,
  reason: FarmCommandFailureReason,
  costCrowns: number,
  extra: { missingCrowns?: number } = {},
): FarmUpgradeResult {
  const fallbackField = field ?? createInitialFarmField(FARM_CROP_DEFINITIONS[0], 0);
  const currentLevel = fallbackField.upgradeLevels[upgradeId] ?? 0;

  return {
    ok: false,
    state: appendFarmTelemetry(state, "farm_upgrade_failed", {
      field: fallbackField,
      upgradeId,
      quantityBefore: fallbackField.heldQuantity,
      quantityAfter: fallbackField.heldQuantity,
      previousUpgradeLevel: currentLevel,
      nextUpgradeLevel: currentLevel,
      costCrowns,
      result: "failed",
      reason,
    }),
    reason,
    ...extra,
  };
}

function failHarvest(
  state: GameState,
  field: FarmFieldState,
  reason: FarmCommandFailureReason,
): FarmHarvestAllResult {
  return {
    ok: false,
    state: appendFarmTelemetry(state, "farm_harvest_all_failed", {
      field,
      quantityBefore: field.heldQuantity,
      quantityAfter: field.heldQuantity,
      result: "failed",
      reason,
    }),
    reason,
  };
}

function appendFarmTelemetry(
  state: GameState,
  type:
    | "farm_upgrade_attempt"
    | "farm_upgrade_succeeded"
    | "farm_upgrade_failed"
    | "farm_crop_generated"
    | "farm_generation_blocked_cap"
    | "farm_harvest_all_succeeded"
    | "farm_harvest_all_failed"
    | "farm_pantry_transfer",
  event: {
    field: FarmFieldState;
    nextField?: FarmFieldState;
    upgradeId?: FarmFieldUpgradeId;
    quantityBefore: number;
    quantityAfter: number;
    previousUpgradeLevel?: number;
    nextUpgradeLevel?: number;
    costCrowns?: number;
    generatedQuantity?: number;
    doubleCropRolls?: number;
    result: string;
    reason?: string;
  },
): GameState {
  const telemetryField = event.nextField ?? event.field;

  return appendDebugTelemetryEvent(state, {
    type,
    entityId: "__farm__",
    farmFieldId: event.field.id,
    farmCropId: event.field.cropId,
    farmUpgradeId: event.upgradeId,
    cropQuantityBefore: event.quantityBefore,
    cropQuantityAfter: event.quantityAfter,
    cropCapacity: getFarmFieldHoldCap(telemetryField),
    previousFarmFieldLevel: event.field.upgradeLevels.speed,
    nextFarmFieldLevel: telemetryField.upgradeLevels.speed,
    previousFarmUpgradeLevel: event.previousUpgradeLevel,
    nextFarmUpgradeLevel: event.nextUpgradeLevel,
    farmSpeedMultiplier: getFarmSpeedMultiplier(telemetryField),
    farmFertilizerDoubleCropChancePercent:
      getFarmFertilizerDoubleCropChancePercent(telemetryField),
    farmGeneratedQuantity: event.generatedQuantity,
    farmDoubleCropRolls: event.doubleCropRolls,
    crownCost: event.costCrowns,
    result: event.result,
    reason: event.reason,
  });
}

function appendFarmUnlockTelemetry(
  state: GameState,
  type:
    | "farm_crop_unlock_roll"
    | "farm_crop_unlocked"
    | "farm_crop_unlock_duplicate",
  event: {
    crop: FarmCropDefinition;
    field?: FarmFieldState;
    source: FarmCropUnlockSource;
    chance?: number;
    roll?: number;
    result: string;
    reason?: string;
  },
): GameState {
  return appendDebugTelemetryEvent(state, {
    type,
    entityId: "__farm__",
    farmFieldId: event.field?.id ?? event.crop.fieldId,
    farmCropId: event.crop.id,
    keyItemId: event.crop.seedKeyItemId ?? undefined,
    keyItemDisplayName: event.crop.seedKeyItemId
      ? getKeyItemDefinition(event.crop.seedKeyItemId).displayName
      : undefined,
    farmUnlockSource: event.source,
    farmUnlockChance: event.chance,
    farmUnlockRoll: event.roll,
    result: event.result,
    reason: event.reason,
  });
}

function sanitizeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
