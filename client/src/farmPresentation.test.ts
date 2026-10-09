import { describe, expect, it } from "vitest";
import {
  createInitialLivestockState,
  FARM_CARROT_GROWTH_MS,
  LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
} from "./game";
import { getFarmDisplay } from "./farmPresentation";
import { createTestGameState } from "./game/testState";

describe("farm presentation", () => {
  it("shows locked carrot holding and upgrade state", () => {
    const display = getFarmDisplay(createTestGameState(), 1_000);

    expect(display.isUnlocked).toBe(false);
    expect(display.totalCropsPerHourText).toBe("0");
    expect(display.livestockProductionPerHourText).toBe("0");
    expect(display.field.holdText).toBe("Carrots 0/20");
    expect(display.field.productionText).toBe("Production inactive");
    expect(display.field.harvestActionText).toBe("Service unavailable");
    expect(display.field.canHarvest).toBe(false);
    expect(display.field.speedText).toBe("0%");
    expect(display.field.multiCropText).toBe("0%");
    expect(display.field.generationPerHourText).toBe("0");
    expect(display.field.generationPerDayText).toBe("0");
    expect(display.field.speedTooltip).toBe("Faster Generation Lv 0/5");
    expect(display.field.multiCropTooltip).toBe("Fertilizer Lv 0/3");
    expect(display.field.holdingTooltip).toBe("Harvest Cap Lv 1/5");
    expect(display.field.upgrades.map((upgrade) => upgrade.id)).toEqual([
      "speed",
      "cap",
      "fertilizer",
    ]);
    expect(display.field.upgrades[0]).toMatchObject({
      displayName: "Faster Generation",
      level: 0,
      maxLevel: 5,
      costCrowns: 100,
      canPurchase: false,
      actionText: "Service unavailable",
      currentEffectText: "Inactive",
      nextEffectText: "100% speed",
    });
  });

  it("shows locked crop rows only when the All filter is selected", () => {
    const unlocked = getFarmDisplay(createTestGameState(), 1_000, "unlocked");
    const all = getFarmDisplay(createTestGameState(), 1_000, "all");

    expect(unlocked.fields.map((field) => field.cropId)).toEqual(["carrot"]);
    expect(all.fields.map((field) => field.cropId)).toEqual([
      "carrot",
      "potato",
      "moonleaf",
      "bittercap_mushroom",
      "ashpepper",
    ]);
    expect(all.fields[1]).toMatchObject({
      cropId: "potato",
      isUnlocked: false,
      productionText: "Undiscovered",
      sourceHint: "Merchant seed purchase",
      upgrades: [],
    });
  });

  it("shows active crop production, cap, and expected crop rate", () => {
    const state = createTestGameState({
      farm: {
        fieldsById: {
          carrot_field: {
            id: "carrot_field",
            cropId: "carrot",
            upgradeLevels: {
              speed: 3,
              cap: 2,
              fertilizer: 2,
            },
            heldQuantity: 4,
            lastGeneratedAtMs: 0,
          },
        },
      },
    });

    const display = getFarmDisplay(state, FARM_CARROT_GROWTH_MS / 2);

    expect(display.field.holdText).toBe("Carrots 4/24");
    expect(display.field.productionText).toBe("Next carrot in 8:11");
    expect(display.field.speedText).toBe("110%");
    expect(display.field.multiCropText).toBe("2%");
    expect(display.field.generationPerHourText).toBe("3.37");
    expect(display.field.generationPerDayText).toBe("80.78");
    expect(display.totalCropsPerHourText).toBe("3.37");
    expect(display.field.generationPerHourTooltip).toBe(
      "Based on Faster Generation Lv 3/5 and Fertilizer Lv 2/3",
    );
  });

  it("includes Elder Mossling helper bonus in Farm expected rates and tooltips", () => {
    const livestock = createInitialLivestockState();
    const state = createTestGameState({
      farm: {
        fieldsById: {
          carrot_field: {
            id: "carrot_field",
            cropId: "carrot",
            upgradeLevels: {
              speed: 1,
              cap: 1,
              fertilizer: 0,
            },
            heldQuantity: 0,
            lastGeneratedAtMs: 0,
          },
        },
      },
      livestock: {
        ...livestock,
        ownedCreaturesById: {
          ...livestock.ownedCreaturesById,
          elder_mossling: 1,
        },
        placementsById: {
          elder_mossling_1: {
            id: "elder_mossling_1",
            creatureId: LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
            x: 0,
            y: 0,
            rotation: "horizontal",
            placedAtMs: 0,
            lastProducedAtMs: 0,
          },
        },
      },
    });

    const display = getFarmDisplay(state, 0);

    expect(display.field.speedText).toBe("100%");
    expect(display.field.generationPerHourText).toBe("3.30");
    expect(display.field.generationPerDayText).toBe("79.20");
    expect(display.field.generationPerHourTooltip).toBe(
      "Based on Faster Generation Lv 1/5 and Fertilizer Lv 0/3; +10% from Livestock (Elder Mossling x1)",
    );
    expect(display.field.generationPerDayTooltip).toBe(
      "Expected crop output over 24 hours at current upgrades; +10% from Livestock (Elder Mossling x1).",
    );
  });
});
