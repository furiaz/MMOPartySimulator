import {
  FARM_CAP_BONUS_PER_LEVEL_AFTER_BASE,
  FARM_CARROT_BASE_HOLD_CAP,
  FARM_FIELD_UPGRADE_DEFINITIONS,
  FARM_SPEED_BONUS_PER_LEVEL_AFTER_BASE,
  getCurrencyBalance,
  getFarmCropDefinitions,
  getFarmExpectedCropsPerHour,
  getFarmFertilizerDoubleCropChancePercent,
  getFarmFieldGenerationIntervalMs,
  getFarmFieldHoldCap,
  getFarmSpeedMultiplier,
  getFarmState,
  getLivestockHelperBonusSummary,
  getLivestockExpectedOutputsPerHour,
  getFarmUpgradeCostCrowns,
  isFarmServiceAvailable,
  isLivestockServiceAvailable,
  isTownServicesUnlocked,
  type FarmCropId,
  type FarmFieldId,
  type FarmFieldState,
  type FarmFieldUpgradeId,
  type GameState,
} from "./game";

export type FarmCropFilter = "unlocked" | "all";

export type FarmFieldUpgradeDisplay = {
  id: FarmFieldUpgradeId;
  displayName: string;
  level: number;
  maxLevel: number;
  costCrowns: number | null;
  canPurchase: boolean;
  actionText: string;
  currentEffectText: string;
  nextEffectText: string | null;
};

export type FarmFieldDisplay = {
  fieldId: FarmFieldId;
  cropId: FarmCropId;
  cropName: string;
  singularName: string;
  isUnlocked: boolean;
  sourceHint: string;
  heldQuantity: number;
  holdCap: number;
  canHarvest: boolean;
  isProducing: boolean;
  isAtCap: boolean;
  timeRemainingMs: number | null;
  productionText: string;
  holdText: string;
  harvestActionText: string;
  speedText: string;
  speedTooltip: string;
  multiCropText: string;
  multiCropTooltip: string;
  generationPerHourText: string;
  generationPerHourTooltip: string;
  generationPerDayText: string;
  generationPerDayTooltip: string;
  holdingTooltip: string;
  upgrades: FarmFieldUpgradeDisplay[];
};

export type FarmDisplay = {
  isUnlocked: boolean;
  isFarmServiceAvailable: boolean;
  isLivestockServiceAvailable: boolean;
  crownBalance: number;
  totalCropsPerHourText: string;
  totalHeldQuantity: number;
  totalHoldCap: number;
  livestockProductionPerHourText: string;
  fields: FarmFieldDisplay[];
  allFields: FarmFieldDisplay[];
  field: FarmFieldDisplay;
};

export function getFarmDisplay(
  state: GameState,
  nowMs = Date.now(),
  cropFilter: FarmCropFilter = "unlocked",
): FarmDisplay {
  const farm = getFarmState(state);
  const isUnlocked = isTownServicesUnlocked(state);
  const farmServiceAvailable = isFarmServiceAvailable(state);
  const livestockServiceAvailable = isLivestockServiceAvailable(state);
  const crownBalance = getCurrencyBalance(state.wallet, "crowns");
  const allFields = getFarmCropDefinitions().map((definition) => {
    const field = farm.fieldsById[definition.fieldId];

    return field
        ? getUnlockedFieldDisplay({
            crownBalance,
            definition,
            field,
            farmServiceAvailable,
            isUnlocked,
            nowMs,
            state,
        })
      : getLockedFieldDisplay(definition);
  });
  const unlockedFields = allFields.filter((field) => field.isUnlocked);
  const visibleFields =
    cropFilter === "all" ? allFields : unlockedFields;
  const totalCropsPerHour = unlockedFields.reduce(
    (total, field) => total + Number(field.generationPerHourValue ?? 0),
    0,
  );
  const totalHeldQuantity = unlockedFields.reduce(
    (total, field) => total + field.heldQuantity,
    0,
  );
  const totalHoldCap = unlockedFields.reduce(
    (total, field) => total + field.holdCap,
    0,
  );
  const firstField = unlockedFields[0] ?? allFields[0];

  return {
    isUnlocked,
    isFarmServiceAvailable: farmServiceAvailable,
    isLivestockServiceAvailable: livestockServiceAvailable,
    crownBalance,
    totalCropsPerHourText: formatRate(totalCropsPerHour),
    totalHeldQuantity,
    totalHoldCap,
    livestockProductionPerHourText: formatRate(
      getLivestockExpectedOutputsPerHour(state),
    ),
    fields: visibleFields,
    allFields,
    field: firstField,
  };
}

export function formatFarmDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getUnlockedFieldDisplay({
  crownBalance,
  definition,
  field,
  farmServiceAvailable,
  isUnlocked,
  nowMs,
  state,
}: {
  crownBalance: number;
  definition: ReturnType<typeof getFarmCropDefinitions>[number];
  field: FarmFieldState;
  farmServiceAvailable: boolean;
  isUnlocked: boolean;
  nowMs: number;
  state: GameState;
}): FarmFieldDisplay & { generationPerHourValue: number } {
  const holdCap = getFarmFieldHoldCap(field);
  const isAtCap = field.heldQuantity >= holdCap;
  const isProducing = field.upgradeLevels.speed >= 1 && !isAtCap;
  const generationIntervalMs = getFarmFieldGenerationIntervalMs(field, state);
  const elapsedMs = Math.max(0, nowMs - field.lastGeneratedAtMs);
  const timeRemainingMs =
    isProducing ? Math.max(0, generationIntervalMs - elapsedMs) : null;
  const cropsPerHour = getFarmExpectedCropsPerHour(field, state);
  const speedMultiplier = getFarmSpeedMultiplier(field);
  const fertilizerChance = getFarmFertilizerDoubleCropChancePercent(field);
  const helperBonus = getLivestockHelperBonusSummary(state);
  const helperTooltip = helperBonus.farmGenerationLivestockSourceText
    ? `; ${helperBonus.farmGenerationLivestockSourceText}`
    : "";

  return {
    fieldId: definition.fieldId,
    cropId: definition.id,
    cropName: definition.displayName,
    singularName: definition.singularName,
    isUnlocked: true,
    sourceHint: definition.sourceHint,
    heldQuantity: field.heldQuantity,
    holdCap,
    canHarvest: isUnlocked && farmServiceAvailable && field.heldQuantity > 0,
    isProducing,
    isAtCap,
    timeRemainingMs,
    productionText: getProductionText(
      field.upgradeLevels.speed,
      definition.singularName.toLowerCase(),
      isAtCap,
      timeRemainingMs,
    ),
    holdText: `${definition.displayName} ${field.heldQuantity}/${holdCap}`,
    harvestActionText: getFarmHarvestActionText({
      displayName: definition.displayName,
      heldQuantity: field.heldQuantity,
      holdCap,
      farmServiceAvailable,
      isUnlocked,
    }),
    speedText: formatPercent(speedMultiplier * 100),
    speedTooltip: `Faster Generation Lv ${field.upgradeLevels.speed}/${FARM_FIELD_UPGRADE_DEFINITIONS.speed.maxLevel}`,
    multiCropText: formatPercent(fertilizerChance),
    multiCropTooltip: `Fertilizer Lv ${field.upgradeLevels.fertilizer}/${FARM_FIELD_UPGRADE_DEFINITIONS.fertilizer.maxLevel}`,
    generationPerHourText: formatRate(cropsPerHour),
    generationPerHourTooltip: `Based on Faster Generation Lv ${field.upgradeLevels.speed}/${FARM_FIELD_UPGRADE_DEFINITIONS.speed.maxLevel} and Fertilizer Lv ${field.upgradeLevels.fertilizer}/${FARM_FIELD_UPGRADE_DEFINITIONS.fertilizer.maxLevel}${helperTooltip}`,
    generationPerDayText: formatRate(cropsPerHour * 24),
    generationPerDayTooltip: `Expected crop output over 24 hours at current upgrades${helperTooltip}.`,
    holdingTooltip: `Harvest Cap Lv ${field.upgradeLevels.cap}/${FARM_FIELD_UPGRADE_DEFINITIONS.cap.maxLevel}`,
    upgrades: (Object.keys(FARM_FIELD_UPGRADE_DEFINITIONS) as FarmFieldUpgradeId[]).map(
      (upgradeId) =>
        getUpgradeDisplay({
          crownBalance,
          farmServiceAvailable,
          isUnlocked,
          upgradeId,
          upgradeLevel: field.upgradeLevels[upgradeId],
        }),
    ),
    generationPerHourValue: cropsPerHour,
  };
}

function getLockedFieldDisplay(
  definition: ReturnType<typeof getFarmCropDefinitions>[number],
): FarmFieldDisplay & { generationPerHourValue: number } {
  return {
    fieldId: definition.fieldId,
    cropId: definition.id,
    cropName: definition.displayName,
    singularName: definition.singularName,
    isUnlocked: false,
    sourceHint: definition.sourceHint,
    heldQuantity: 0,
    holdCap: 0,
    canHarvest: false,
    isProducing: false,
    isAtCap: false,
    timeRemainingMs: null,
    productionText: "Undiscovered",
    holdText: "",
    harvestActionText: "Undiscovered",
    speedText: "0%",
    speedTooltip: "Unlock this crop to view Speed levels.",
    multiCropText: "0%",
    multiCropTooltip: "Unlock this crop to view Fertilizer levels.",
    generationPerHourText: "0",
    generationPerHourTooltip: "Unlock this crop to view generation.",
    generationPerDayText: "0",
    generationPerDayTooltip: "Unlock this crop to view daily generation.",
    holdingTooltip: "Unlock this crop to view Harvest Cap levels.",
    upgrades: [],
    generationPerHourValue: 0,
  };
}

function getUpgradeDisplay({
  crownBalance,
  farmServiceAvailable,
  isUnlocked,
  upgradeId,
  upgradeLevel,
}: {
  crownBalance: number;
  farmServiceAvailable: boolean;
  isUnlocked: boolean;
  upgradeId: FarmFieldUpgradeId;
  upgradeLevel: number;
}): FarmFieldUpgradeDisplay {
  const definition = FARM_FIELD_UPGRADE_DEFINITIONS[upgradeId];
  const isMax = upgradeLevel >= definition.maxLevel;
  const costCrowns = isMax ? null : getFarmUpgradeCostCrowns(upgradeLevel);
  const canPurchase =
    isUnlocked &&
    farmServiceAvailable &&
    !isMax &&
    costCrowns !== null &&
    crownBalance >= costCrowns;

  return {
    id: upgradeId,
    displayName: definition.displayName,
    level: upgradeLevel,
    maxLevel: definition.maxLevel,
    costCrowns,
    canPurchase,
    actionText: getFarmUpgradeActionText({
      costCrowns,
      crownBalance,
      isMax,
      farmServiceAvailable,
      isUnlocked,
    }),
    currentEffectText: getUpgradeEffectText(upgradeId, upgradeLevel),
    nextEffectText: isMax
      ? null
      : getUpgradeEffectText(upgradeId, upgradeLevel + 1),
  };
}

function getProductionText(
  speedLevel: number,
  cropName: string,
  isAtCap: boolean,
  timeRemainingMs: number | null,
): string {
  if (speedLevel <= 0) {
    return "Production inactive";
  }

  if (isAtCap) {
    return "Holding full";
  }

  return timeRemainingMs === null
    ? "Production inactive"
    : `Next ${cropName} in ${formatFarmDuration(timeRemainingMs)}`;
}

function getFarmUpgradeActionText({
  costCrowns,
  crownBalance,
  isMax,
  farmServiceAvailable,
  isUnlocked,
}: {
  costCrowns: number | null;
  crownBalance: number;
  isMax: boolean;
  farmServiceAvailable: boolean;
  isUnlocked: boolean;
}): string {
  if (!isUnlocked || !farmServiceAvailable) {
    return "Service unavailable";
  }

  if (isMax || costCrowns === null) {
    return "Max level";
  }

  if (crownBalance < costCrowns) {
    return "Need Crowns";
  }

  return `${costCrowns} Crowns`;
}

function getFarmHarvestActionText({
  displayName,
  heldQuantity,
  holdCap,
  farmServiceAvailable,
  isUnlocked,
}: {
  displayName: string;
  heldQuantity: number;
  holdCap: number;
  farmServiceAvailable: boolean;
  isUnlocked: boolean;
}): string {
  if (!isUnlocked || !farmServiceAvailable) {
    return "Service unavailable";
  }

  if (heldQuantity <= 0) {
    return "Nothing held";
  }

  return `${displayName} ${heldQuantity}/${holdCap}`;
}

function getUpgradeEffectText(
  upgradeId: FarmFieldUpgradeId,
  level: number,
): string {
  if (upgradeId === "speed") {
    if (level <= 0) {
      return "Inactive";
    }

    return `${formatPercent(
      (1 +
        Math.max(0, level - 1) * FARM_SPEED_BONUS_PER_LEVEL_AFTER_BASE) *
        100,
    )} speed`;
  }

  if (upgradeId === "cap") {
    return `${Math.round(
      FARM_CARROT_BASE_HOLD_CAP *
        (1 + Math.max(0, level - 1) * FARM_CAP_BONUS_PER_LEVEL_AFTER_BASE),
    )} held`;
  }

  return `${formatPercent(level)} double crop chance`;
}

function formatPercent(value: number): string {
  const roundedWhole = Math.round(value);

  return `${
    Math.abs(value - roundedWhole) < 0.001
      ? roundedWhole.toFixed(0)
      : value.toFixed(1)
  }%`;
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}
