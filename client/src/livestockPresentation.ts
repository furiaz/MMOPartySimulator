import {
  getAvailableLivestockCreatureCount,
  getLivestockAnimalUpgradeLevels,
  getLivestockBuildingUpgradeLevels,
  getLivestockCreatureDefinition,
  getLivestockCreatureDefinitions,
  getLivestockEffectiveFeedQuantity,
  getLivestockExpectedOutputsPerHour,
  getLivestockFootprintCells,
  getLivestockFeedDiscountPercent,
  getLivestockOutputCapForLevel,
  getLivestockOutputIntervalMs,
  getNextLivestockFeedAtMs,
  getLivestockState,
  getLivestockUpgradeCostCrowns,
  getLivestockHelperBonusSummary,
  isLivestockServiceAvailable,
  isTownServicesUnlocked,
  LIVESTOCK_ANIMAL_UPGRADE_DEFINITIONS,
  LIVESTOCK_ANIMAL_UPGRADE_IDS,
  LIVESTOCK_BUILDING_UPGRADE_DEFINITIONS,
  LIVESTOCK_BUILDING_UPGRADE_IDS,
  type GameState,
  type LivestockAnimalUpgradeId,
  type LivestockBuildingUpgradeId,
  type LivestockCreatureId,
  type LivestockOutputId,
  type LivestockPlacedCreatureState,
  type LivestockPlacementId,
  type LivestockPlacementRotation,
} from "./game";
import { LIVESTOCK_CREATURE_ICON_SRC } from "./assetIcons";

export type LivestockCreatureFilter = "unlocked" | "all";

export type LivestockUpgradeDisplay<
  TUpgradeId extends LivestockAnimalUpgradeId | LivestockBuildingUpgradeId,
> = {
  id: TUpgradeId;
  displayName: string;
  level: number;
  maxLevel: number;
  currentEffectText: string;
  nextEffectText: string;
  actionText: string;
  canPurchase: boolean;
  isEnabled: boolean;
};

export type LivestockGridCellDisplay = {
  x: number;
  y: number;
  placementId: LivestockPlacementId | null;
  creatureId: LivestockCreatureId | null;
  label: string;
  isOrigin: boolean;
  isHungry: boolean;
};

export type LivestockCreatureDisplay = {
  creatureId: LivestockCreatureId;
  displayName: string;
  shortLabel: string;
  ownedCount: number;
  placedCount: number;
  availableCount: number;
  footprintText: string;
  feedText: string;
  yieldText: string;
  expectedOutputPerHourText: string;
  upgrades: Array<LivestockUpgradeDisplay<LivestockAnimalUpgradeId>>;
  isUnlocked: boolean;
  sourceHint: string;
  iconSrc: string;
  fedCount: number;
  hungryCount: number;
  canHoldForPlacement: boolean;
};

export type LivestockOutputDisplay = {
  outputId: LivestockOutputId;
  displayName: string;
  quantity: number;
  cap: number;
  holdText: string;
};

export type LivestockDisplay = {
  isUnlocked: boolean;
  isLivestockServiceAvailable: boolean;
  canUseActions: boolean;
  width: number;
  height: number;
  cells: LivestockGridCellDisplay[];
  creatures: LivestockCreatureDisplay[];
  allCreatures: LivestockCreatureDisplay[];
  placements: LivestockPlacedCreatureState[];
  outputs: LivestockOutputDisplay[];
  totalOutputPerHourText: string;
  expectedDailyOutputText: string;
  helperBonusText: string;
  totalFeedText: string;
  feedingStatusText: string;
  nextFeedAtText: string;
  collectActionText: string;
  canCollect: boolean;
  feedNowActionText: string;
  canFeedNow: boolean;
  hasHungryAnimals: boolean;
  gridSizeText: string;
  buildingUpgrades: Array<LivestockUpgradeDisplay<LivestockBuildingUpgradeId>>;
};

export function getLivestockDisplay(
  state: GameState,
  nowMs = Date.now(),
  creatureFilter: LivestockCreatureFilter = "unlocked",
): LivestockDisplay {
  const livestock = getLivestockState(state, nowMs);
  const isUnlocked = isTownServicesUnlocked(state);
  const livestockServiceAvailable = isLivestockServiceAvailable(state);
  const canUseActions = isUnlocked && livestockServiceAvailable;
  const placements = Object.values(livestock.placementsById).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const buildingUpgradeLevels = getLivestockBuildingUpgradeLevels(livestock);
  const allCreatures = getLivestockCreatureDefinitions().map((definition) => {
    const upgradeLevels = getLivestockAnimalUpgradeLevels(livestock, definition.id);
    const intervalMs = getLivestockOutputIntervalMs(livestock, definition);
    const placedCount = placements.filter(
      (placement) => placement.creatureId === definition.id,
    ).length;
    const hungryCount = placements.filter(
      (placement) =>
        placement.creatureId === definition.id && placement.isHungry === true,
    ).length;
    const fedCount = Math.max(0, placedCount - hungryCount);
    const ownedCount = livestock.ownedCreaturesById[definition.id] ?? 0;
    const availableCount = getAvailableLivestockCreatureCount(
      livestock,
      definition.id,
    );
    const expectedPerHour = definition.output
      ? fedCount *
        ((60 * 60 * 1000 * definition.output.quantity) / intervalMs)
      : 0;
    const isUnlocked = ownedCount > 0;

    return {
      creatureId: definition.id,
      displayName: definition.displayName,
      shortLabel: definition.shortLabel,
      ownedCount,
      placedCount,
      availableCount,
      footprintText: `${definition.footprint.width}x${definition.footprint.height}`,
      feedText:
        definition.feedPerDay.length > 0
          ? definition.feedPerDay
              .map(
                (feed) =>
                  `${formatIngredientName(feed.ingredientId)} ${getLivestockEffectiveFeedQuantity(
                    feed.quantity,
                    upgradeLevels.feedDiscount,
                  )}/day`,
              )
              .join(", ")
          : "None",
      yieldText: definition.output
        ? `${definition.output.displayName} ${definition.output.quantity} / ${formatDuration(intervalMs)}`
        : "No output yet",
      expectedOutputPerHourText: formatRate(expectedPerHour),
      upgrades: createAnimalUpgradeDisplays(
        livestock,
        definition.id,
        canUseActions,
      ),
      isUnlocked,
      sourceHint: definition.sourceHint,
      iconSrc: isUnlocked
        ? LIVESTOCK_CREATURE_ICON_SRC[definition.id]
        : LIVESTOCK_CREATURE_ICON_SRC.locked,
      fedCount,
      hungryCount,
      canHoldForPlacement: canUseActions && isUnlocked && availableCount > 0,
    };
  });
  const creatures = creatureFilter === "all"
    ? allCreatures
    : allCreatures.filter((creature) => creature.isUnlocked);
  const outputs: LivestockOutputDisplay[] = getLivestockCreatureDefinitions()
    .filter((definition) => definition.output)
    .map((definition) => {
      const output = definition.output!;
      const quantity = livestock.holdingQuantitiesByOutputId[output.id] ?? 0;
      const cap = livestock.holdingCapsByOutputId[output.id] ?? 0;
      const displayName = pluralizeOutputName(output.displayName);

      return {
        outputId: output.id,
        displayName,
        quantity,
        cap,
        holdText: `${displayName} ${quantity}/${cap}`,
      };
    });
  const totalHeld = outputs.reduce((total, output) => total + output.quantity, 0);
  const hungryCount = placements.filter((placement) => placement.isHungry).length;
  const placedCount = placements.length;

  return {
    isUnlocked,
    isLivestockServiceAvailable: livestockServiceAvailable,
    canUseActions,
    width: livestock.grid.width,
    height: livestock.grid.height,
    cells: createGridCells(livestock, placements),
    creatures,
    allCreatures,
    placements,
    outputs,
    totalOutputPerHourText: formatRate(getLivestockExpectedOutputsPerHour(state)),
    expectedDailyOutputText: getExpectedDailyOutputText(livestock, placements),
    helperBonusText: getLivestockHelperBonusSummary(state).summaryText,
    totalFeedText: getTotalFeedText(creatures),
    feedingStatusText: `Fed ${Math.max(0, placedCount - hungryCount)} / Hungry ${hungryCount}`,
    nextFeedAtText: formatClockTime(getNextLivestockFeedAtMs(nowMs)),
    collectActionText: canUseActions
      ? totalHeld > 0
        ? outputs.map((output) => output.holdText).join(", ")
        : "Nothing held"
      : "Service unavailable",
    canCollect: canUseActions && totalHeld > 0,
    feedNowActionText:
      hungryCount <= 0
        ? "No hungry animals"
        : canUseActions
          ? `${hungryCount} hungry`
          : "Service unavailable",
    canFeedNow: canUseActions && hungryCount > 0,
    hasHungryAnimals: hungryCount > 0,
    gridSizeText: `${livestock.grid.width}x${livestock.grid.height}`,
    buildingUpgrades: createBuildingUpgradeDisplays(
      buildingUpgradeLevels,
      canUseActions,
    ),
  };
}

export function getLivestockPlacementTimeRemainingText(
  placement: LivestockPlacedCreatureState,
  nowMs: number,
  state?: GameState,
): string {
  const definition = getLivestockCreatureDefinition(placement.creatureId);

  if (!definition) {
    return "Unknown";
  }

  if (!definition.output) {
    return "No output";
  }

  const intervalMs = state
    ? getLivestockOutputIntervalMs(getLivestockState(state, nowMs), definition)
    : definition.output.intervalMs;

  if (placement.isHungry) {
    return `Hungry (${formatDuration(
      placement.pausedProductionRemainingMs ?? intervalMs,
    )} paused)`;
  }

  return formatDuration(
    Math.max(0, intervalMs - (nowMs - placement.lastProducedAtMs)),
  );
}

export function getNextLivestockRotation(
  rotation: LivestockPlacementRotation,
): LivestockPlacementRotation {
  return rotation === "horizontal" ? "vertical" : "horizontal";
}

function createAnimalUpgradeDisplays(
  livestock: ReturnType<typeof getLivestockState>,
  creatureId: LivestockCreatureId,
  canUseActions: boolean,
): Array<LivestockUpgradeDisplay<LivestockAnimalUpgradeId>> {
  const definition = getLivestockCreatureDefinition(creatureId);
  const levels = getLivestockAnimalUpgradeLevels(livestock, creatureId);

  if (!definition || !definition.output) {
    return [];
  }

  return LIVESTOCK_ANIMAL_UPGRADE_IDS.map((upgradeId) => {
    const upgrade = LIVESTOCK_ANIMAL_UPGRADE_DEFINITIONS[upgradeId];
    const level = levels[upgradeId];
    const nextLevel = Math.min(upgrade.maxLevel, level + 1);

    return {
      id: upgradeId,
      displayName: upgrade.displayName,
      level,
      maxLevel: upgrade.maxLevel,
      currentEffectText: getAnimalUpgradeEffectText(
        livestock,
        definition,
        upgradeId,
        level,
      ),
      nextEffectText:
        level >= upgrade.maxLevel
          ? ""
          : getAnimalUpgradeEffectText(livestock, definition, upgradeId, nextLevel),
      actionText:
        level >= upgrade.maxLevel
          ? "Max"
          : `${getLivestockUpgradeCostCrowns(level)} Crowns`,
      canPurchase: canUseActions && upgrade.isEnabled && level < upgrade.maxLevel,
      isEnabled: upgrade.isEnabled,
    };
  });
}

function createBuildingUpgradeDisplays(
  levels: ReturnType<typeof getLivestockBuildingUpgradeLevels>,
  canUseActions: boolean,
): Array<LivestockUpgradeDisplay<LivestockBuildingUpgradeId>> {
  return LIVESTOCK_BUILDING_UPGRADE_IDS.map((upgradeId) => {
    const upgrade = LIVESTOCK_BUILDING_UPGRADE_DEFINITIONS[upgradeId];
    const level = levels[upgradeId];
    const nextLevel = Math.min(upgrade.maxLevel, level + 1);

    return {
      id: upgradeId,
      displayName: upgrade.displayName,
      level,
      maxLevel: upgrade.maxLevel,
      currentEffectText: getBuildingUpgradeEffectText(upgradeId, level),
      nextEffectText:
        !upgrade.isEnabled || level >= upgrade.maxLevel
          ? ""
          : getBuildingUpgradeEffectText(upgradeId, nextLevel),
      actionText: !upgrade.isEnabled
        ? "Coming soon"
        : level >= upgrade.maxLevel
          ? "Max"
          : `${getLivestockUpgradeCostCrowns(level)} Crowns`,
      canPurchase: canUseActions && upgrade.isEnabled && level < upgrade.maxLevel,
      isEnabled: upgrade.isEnabled,
    };
  });
}

function getAnimalUpgradeEffectText(
  livestock: ReturnType<typeof getLivestockState>,
  definition: NonNullable<ReturnType<typeof getLivestockCreatureDefinition>>,
  upgradeId: LivestockAnimalUpgradeId,
  level: number,
): string {
  switch (upgradeId) {
    case "speed":
      return formatDuration(
        getLivestockOutputIntervalMs(
          {
            ...livestock,
            animalUpgradeLevelsByCreatureId: {
              ...livestock.animalUpgradeLevelsByCreatureId,
              [definition.id]: {
                ...getLivestockAnimalUpgradeLevels(livestock, definition.id),
                speed: level,
              },
            },
          },
          definition,
        ),
      );
    case "feedDiscount":
      return `${getLivestockFeedDiscountPercent(level).toFixed(0)}% discount`;
    case "outputCap":
      return `${pluralizeOutputName(definition.output?.displayName ?? "Output")} ${getLivestockOutputCapForLevel(level)}`;
    default:
      return "";
  }
}

function getBuildingUpgradeEffectText(
  upgradeId: LivestockBuildingUpgradeId,
  level: number,
): string {
  switch (upgradeId) {
    case "columns":
      return `${5 + level} columns`;
    case "rows":
      return `${3 + level} rows`;
    case "slotEfficiency":
      return "Bonus slots";
    default:
      return "";
  }
}

function createGridCells(
  livestock: ReturnType<typeof getLivestockState>,
  placements: LivestockPlacedCreatureState[],
): LivestockGridCellDisplay[] {
  const cells: LivestockGridCellDisplay[] = [];

  for (let y = 0; y < livestock.grid.height; y += 1) {
    for (let x = 0; x < livestock.grid.width; x += 1) {
      const occupant = findOccupant(placements, x, y);

      cells.push({
        x,
        y,
        placementId: occupant?.placement.id ?? null,
        creatureId: occupant?.placement.creatureId ?? null,
        label: occupant?.isOrigin ? occupant.definition.shortLabel : "",
        isOrigin: occupant?.isOrigin ?? false,
        isHungry: occupant?.placement.isHungry ?? false,
      });
    }
  }

  return cells;
}

function findOccupant(
  placements: LivestockPlacedCreatureState[],
  x: number,
  y: number,
):
  | {
      placement: LivestockPlacedCreatureState;
      definition: NonNullable<ReturnType<typeof getLivestockCreatureDefinition>>;
      isOrigin: boolean;
    }
  | null {
  for (const placement of placements) {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition) {
      continue;
    }

    if (
      getLivestockFootprintCells(
        definition,
        placement.x,
        placement.y,
        placement.rotation,
      ).some((cell) => cell.x === x && cell.y === y)
    ) {
      return {
        placement,
        definition,
        isOrigin: placement.x === x && placement.y === y,
      };
    }
  }

  return null;
}

function getTotalFeedText(creatures: LivestockCreatureDisplay[]): string {
  const feedByName = new Map<string, number>();

  for (const creature of creatures) {
    if (creature.placedCount <= 0 || creature.feedText === "None") {
      continue;
    }

    for (const feedPart of creature.feedText.split(",")) {
      const match = feedPart.trim().match(/^(.+) (\d+)\/day$/);

      if (!match) {
        continue;
      }

      const [, ingredientName, quantityText] = match;
      const displayName = pluralizeIngredientName(ingredientName);
      feedByName.set(
        displayName,
        (feedByName.get(displayName) ?? 0) +
          Number(quantityText) * creature.placedCount,
      );
    }
  }

  return feedByName.size > 0
    ? [...feedByName.entries()]
        .map(([ingredientName, quantity]) => `${ingredientName} ${quantity}/day`)
        .join(", ")
    : "No feed needed";
}

function getExpectedDailyOutputText(
  livestock: ReturnType<typeof getLivestockState>,
  placements: LivestockPlacedCreatureState[],
): string {
  const outputByName = new Map<string, number>();

  for (const placement of placements) {
    const definition = getLivestockCreatureDefinition(placement.creatureId);

    if (!definition?.output || placement.isHungry) {
      continue;
    }

    const intervalMs = getLivestockOutputIntervalMs(livestock, definition);
    const expectedDailyQuantity =
      ((24 * 60 * 60 * 1000) / intervalMs) * definition.output.quantity;
    const displayName = pluralizeOutputName(definition.output.displayName);

    outputByName.set(
      displayName,
      (outputByName.get(displayName) ?? 0) + expectedDailyQuantity,
    );
  }

  return outputByName.size > 0
    ? [...outputByName.entries()]
        .map(([outputName, quantity]) => `${outputName} ${formatRate(quantity)}/day`)
        .join(", ")
    : "No output expected";
}

function pluralizeOutputName(displayName: string): string {
  return displayName === "Tin Ore" ? displayName : pluralizeIngredientName(displayName);
}

function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatIngredientName(ingredientId: string): string {
  return ingredientId
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function pluralizeIngredientName(ingredientName: string): string {
  return ingredientName.endsWith("s") ? ingredientName : `${ingredientName}s`;
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}
