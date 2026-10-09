import { describe, expect, it } from "vitest";
import { createCompanion, createNpc } from "./game/entities";
import {
  createInitialLivestockState,
  LIVESTOCK_DUSKHEN_CREATURE_ID,
  LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
  LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
  LIVESTOCK_WOLF_CREATURE_ID,
} from "./game/livestock";
import { createTestGameState } from "./game/testState";
import { getLivestockDisplay } from "./livestockPresentation";
import type { GameState, Position } from "./game";

describe("livestock presentation", () => {
  it("shows the MVP grid, Duskhen counts, feed, yield, and held Eggs", () => {
    const display = getLivestockDisplay(createLivestockPresentationState(), 0);

    expect(display.width).toBe(5);
    expect(display.height).toBe(3);
    expect(display.cells).toHaveLength(15);
    expect(display.totalOutputPerHourText).toBe("0");
    expect(display.expectedDailyOutputText).toBe("No output expected");
    expect(display.helperBonusText).toBe("No helper bonuses active");
    expect(display.totalFeedText).toBe("No feed needed");
    expect(display.outputs[0]).toMatchObject({
      outputId: "egg",
      holdText: "Eggs 0/20",
    });
    expect(display.creatures[0]).toMatchObject({
      creatureId: "duskhen",
      displayName: "Duskhen",
      ownedCount: 2,
      placedCount: 0,
      availableCount: 2,
      footprintText: "1x1",
      feedText: "Carrot 10/day",
      yieldText: "Egg 1 / 3h",
      canHoldForPlacement: true,
    });
    expect(display.creatures[0].upgrades).toMatchObject([
      {
        id: "speed",
        displayName: "Faster Production",
        level: 1,
        maxLevel: 5,
        currentEffectText: "3h",
        nextEffectText: "2h 52m",
        actionText: "200 Crowns",
        canPurchase: true,
      },
      {
        id: "feedDiscount",
        displayName: "Feed Discount",
        level: 0,
        maxLevel: 3,
        currentEffectText: "0% discount",
        nextEffectText: "5% discount",
        actionText: "100 Crowns",
        canPurchase: true,
      },
      {
        id: "outputCap",
        displayName: "Output Holding",
        level: 1,
        maxLevel: 5,
        currentEffectText: "Eggs 20",
        nextEffectText: "Eggs 24",
        actionText: "200 Crowns",
        canPurchase: true,
      },
    ]);
    expect(display.gridSizeText).toBe("5x3");
    expect(display.buildingUpgrades).toMatchObject([
      {
        id: "columns",
        displayName: "Expand Columns",
        level: 0,
        currentEffectText: "5 columns",
        nextEffectText: "6 columns",
        actionText: "100 Crowns",
        canPurchase: true,
      },
      {
        id: "rows",
        displayName: "Expand Rows",
        level: 0,
        currentEffectText: "3 rows",
        nextEffectText: "4 rows",
        actionText: "100 Crowns",
        canPurchase: true,
      },
      {
        id: "slotEfficiency",
        displayName: "Slot Efficiency",
        level: 0,
        currentEffectText: "Bonus slots",
        actionText: "Coming soon",
        canPurchase: false,
      },
    ]);
    expect(display.feedingStatusText).toBe("Fed 0 / Hungry 0");
    expect(display.canFeedNow).toBe(false);
  });

  it("shows occupied grid cells and aggregate feed/output for placed Duskhens", () => {
    const display = getLivestockDisplay(
      createLivestockPresentationState({
        livestock: {
          ...createInitialLivestockState(),
          placementSequence: 2,
          placementsById: {
            livestock_duskhen_1: {
              id: "livestock_duskhen_1",
              creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
              x: 0,
              y: 0,
              rotation: "horizontal",
              placedAtMs: 0,
              lastProducedAtMs: 0,
            },
            livestock_duskhen_2: {
              id: "livestock_duskhen_2",
              creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
              x: 1,
              y: 0,
              rotation: "horizontal",
              placedAtMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
              lastProducedAtMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
            },
          },
          holdingQuantitiesByOutputId: { egg: 7 },
        },
      }),
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
    );

    expect(display.cells.slice(0, 2)).toMatchObject([
      { x: 0, y: 0, label: "DH", placementId: "livestock_duskhen_1" },
      { x: 1, y: 0, label: "DH", placementId: "livestock_duskhen_2" },
    ]);
    expect(display.creatures[0]).toMatchObject({
      placedCount: 2,
      availableCount: 0,
      expectedOutputPerHourText: "0.67",
      canHoldForPlacement: false,
    });
    expect(display.totalFeedText).toBe("Carrots 20/day");
    expect(display.totalOutputPerHourText).toBe("0.67");
    expect(display.expectedDailyOutputText).toBe("Eggs 16/day");
    expect(display.outputs[0].holdText).toBe("Eggs 7/20");
    expect(display.canCollect).toBe(true);
  });

  it("shows hungry grid cells and disables their expected output", () => {
    const display = getLivestockDisplay(
      createLivestockPresentationState({
        livestock: {
          ...createInitialLivestockState(),
          placementSequence: 1,
          placementsById: {
            livestock_duskhen_1: {
              id: "livestock_duskhen_1",
              creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
              x: 0,
              y: 0,
              rotation: "horizontal",
              placedAtMs: 0,
              lastProducedAtMs: 0,
              isHungry: true,
              hungrySinceMs: 1,
              pausedProductionRemainingMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
            },
          },
        },
      }),
      1,
    );

    expect(display.cells[0]).toMatchObject({
      placementId: "livestock_duskhen_1",
      isHungry: true,
    });
    expect(display.creatures[0]).toMatchObject({
      placedCount: 1,
      fedCount: 0,
      hungryCount: 1,
      expectedOutputPerHourText: "0",
    });
    expect(display.totalOutputPerHourText).toBe("0");
    expect(display.feedNowActionText).toBe("1 hungry");
    expect(display.canFeedNow).toBe(true);
  });

  it("reflects upgraded Livestock speed, feed, cap, and grid size", () => {
    const display = getLivestockDisplay(
      createLivestockPresentationState({
        livestock: {
          ...createInitialLivestockState(),
          grid: { width: 99, height: 99 },
          animalUpgradeLevelsByCreatureId: {
            duskhen: { speed: 5, feedDiscount: 3, outputCap: 5 },
          },
          buildingUpgradeLevels: {
            columns: 2,
            rows: 1,
            slotEfficiency: 0,
          },
          placementSequence: 1,
          placementsById: {
            livestock_duskhen_1: {
              id: "livestock_duskhen_1",
              creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
              x: 0,
              y: 0,
              rotation: "horizontal",
              placedAtMs: 0,
              lastProducedAtMs: 0,
            },
          },
          holdingQuantitiesByOutputId: { egg: 35 },
        },
      }),
      0,
    );

    expect(display.width).toBe(7);
    expect(display.height).toBe(4);
    expect(display.gridSizeText).toBe("7x4");
    expect(display.outputs[0].holdText).toBe("Eggs 35/36");
    expect(display.creatures[0]).toMatchObject({
      feedText: "Carrot 8/day",
      yieldText: "Egg 1 / 2h 30m",
      expectedOutputPerHourText: "0.40",
    });
    expect(display.totalFeedText).toBe("Carrots 8/day");
    expect(display.totalOutputPerHourText).toBe("0.40");
    expect(display.expectedDailyOutputText).toBe("Eggs 9.60/day");
  });

  it("allows browsing while locked or outside a qualifying hub but disables actions", () => {
    const locked = getLivestockDisplay(
      createLivestockPresentationState({ azureTrialCompleted: false }),
      0,
    );
    const unavailable = getLivestockDisplay(
      createLivestockPresentationState({ currentMapId: "map-1" }),
      0,
    );

    expect(locked.isUnlocked).toBe(false);
    expect(locked.creatures[0].canHoldForPlacement).toBe(false);
    expect(locked.collectActionText).toBe("Service unavailable");
    expect(unavailable.isLivestockServiceAvailable).toBe(false);
    expect(unavailable.creatures[0].canHoldForPlacement).toBe(false);
  });

  it("filters locked creatures and shows source hints in All mode", () => {
    const unlocked = getLivestockDisplay(createLivestockPresentationState(), 0);
    const all = getLivestockDisplay(createLivestockPresentationState(), 0, "all");

    expect(unlocked.creatures.map((creature) => creature.creatureId)).toEqual([
      "duskhen",
    ]);
    expect(all.creatures.map((creature) => creature.creatureId)).toEqual([
      "duskhen",
      "wolf",
      "tin_crawler",
      "elder_mossling",
    ]);
    expect(all.creatures[1]).toMatchObject({
      creatureId: "wolf",
      isUnlocked: false,
      sourceHint: "Rare drop from Wolves",
      canHoldForPlacement: false,
      upgrades: [],
    });
  });

  it("shows active helper bonuses in the summary text", () => {
    const livestock = createInitialLivestockState();
    const display = getLivestockDisplay(
      createLivestockPresentationState({
        livestock: {
          ...livestock,
          ownedCreaturesById: {
            ...livestock.ownedCreaturesById,
            wolf: 1,
            elder_mossling: 1,
          },
          placementsById: {
            wolf_1: {
              id: "wolf_1",
              creatureId: LIVESTOCK_WOLF_CREATURE_ID,
              x: 0,
              y: 0,
              rotation: "horizontal",
              placedAtMs: 0,
              lastProducedAtMs: 0,
            },
            elder_mossling_1: {
              id: "elder_mossling_1",
              creatureId: LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
              x: 2,
              y: 0,
              rotation: "horizontal",
              placedAtMs: 0,
              lastProducedAtMs: 0,
            },
          },
        },
      }),
      0,
    );

    expect(display.helperBonusText).toBe(
      "Farm generation +10% (Elder Mossling x1), Notice Board rerolls +1/day (Wolf x1)",
    );
  });
});

function createLivestockPresentationState({
  azureTrialCompleted = true,
  leaderPosition = { x: 10, y: 10 },
  livestock = createInitialLivestockState(),
  currentMapId = "hub-2",
}: {
  azureTrialCompleted?: boolean;
  leaderPosition?: Position;
  livestock?: GameState["livestock"];
  currentMapId?: GameState["currentMapId"];
} = {}) {
  const leader = createCompanion("leader", leaderPosition, "leader");
  const keeper = createNpc(
    "livestock",
    { x: 11, y: 10 },
    "Livestock",
    "livestock_keeper",
  );
  const baseQuests = createTestGameState().quests;

  return createTestGameState({
    currentMapId,
    partyLeaderId: leader.id,
    entities: {
      [leader.id]: leader,
      [keeper.id]: keeper,
    },
    livestock,
    quests: {
      ...baseQuests,
      azure_trial: {
        ...baseQuests.azure_trial,
        status: azureTrialCompleted ? "completed" : "available",
      },
    },
  });
}
