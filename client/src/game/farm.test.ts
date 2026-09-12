import { describe, expect, it } from "vitest";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import {
  FARM_ASHPEPPER_CROP_ID,
  FARM_BITTERCAP_MUSHROOM_CROP_ID,
  FARM_CARROT_BASE_HOLD_CAP,
  FARM_CARROT_FIELD_ID,
  FARM_CARROT_GROWTH_MS,
  FARM_CROP_DEFINITIONS,
  FARM_MOONLEAF_CROP_ID,
  FARM_POTATO_CROP_ID,
  getFarmFieldGenerationIntervalMs,
  getFarmFieldHoldCap,
  getFarmUpgradeCostCrowns,
  createInitialFarmState,
  harvestAllFarmCrops,
  isFarmCropUnlocked,
  purchaseFarmFieldUpgrade,
  sanitizeFarmState,
  settleFarmState,
  tryUnlockFarmCropFromEnemyDefeat,
  tryUnlockFarmCropFromGathering,
  unlockFarmCrop,
} from "./farm";
import {
  createInitialLivestockState,
  LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
} from "./livestock";
import { buyMerchantFarmSeed, getMerchantFarmSeedStock } from "./merchant";
import { EQUIPMENT_TUTORIAL_QUEST_ID } from "./questSystem";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type {
  FarmFieldUpgradeId,
  FarmFieldUpgradeLevels,
  LivestockPlacedCreatureState,
} from "./types";
import { addCurrencyToWalletState } from "./wallet";

const NOW_MS = 1_000_000;

describe("Farm upgrades", () => {
  it("keeps crop definitions in fixed display order with only Carrots unlocked initially", () => {
    const state = createFarmState();

    expect(FARM_CROP_DEFINITIONS.map((crop) => crop.id)).toEqual([
      "carrot",
      "potato",
      "moonleaf",
      "bittercap_mushroom",
      "ashpepper",
    ]);
    expect(Object.keys(state.farm?.fieldsById ?? {})).toEqual([
      "carrot_field",
    ]);
  });

  it("initializes and migrates old level saves into upgrade tracks", () => {
    const initial = createInitialFarmState();
    const sanitized = sanitizeFarmState({
      fieldsById: {
        carrot_field: {
          id: "carrot_field",
          cropId: "carrot",
          level: 1,
          heldQuantity: 4,
          lastGeneratedAtMs: 12,
        },
      },
    });

    expect(initial.fieldsById.carrot_field).toMatchObject({
      id: "carrot_field",
      cropId: "carrot",
      upgradeLevels: {
        speed: 0,
        cap: 1,
        fertilizer: 0,
      },
      heldQuantity: 0,
    });
    expect(sanitized.fieldsById.carrot_field).toMatchObject({
      upgradeLevels: {
        speed: 1,
        cap: 1,
        fertilizer: 0,
      },
      heldQuantity: 4,
      lastGeneratedAtMs: 12,
    });
  });

  it("unlocks new plots at level 0 and ignores duplicate seed rewards", () => {
    const unlocked = unlockFarmCrop(
      createFarmState(),
      FARM_MOONLEAF_CROP_ID,
      "herb_gathering",
      NOW_MS,
    );

    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) {
      return;
    }

    expect(unlocked.field).toMatchObject({
      id: "moonleaf_field",
      cropId: "moonleaf",
      upgradeLevels: { speed: 0, cap: 1, fertilizer: 0 },
      heldQuantity: 0,
      lastGeneratedAtMs: NOW_MS,
    });
    expect(unlocked.state.keyItemsById?.farm_seed_moonleaf).toBe(1);
    expect(unlocked.state.newsBroadcasts?.at(-1)).toMatchObject({
      title: "Unlock Acquired",
      text: "Unlocked: Moonleaf Seed",
      details: ["Unlocked: Moonleaf Seed"],
    });

    const duplicate = unlockFarmCrop(
      unlocked.state,
      FARM_MOONLEAF_CROP_ID,
      "herb_gathering",
      NOW_MS + 1,
    );

    expect(duplicate).toMatchObject({
      ok: false,
      reason: "already_unlocked",
    });
    expect(duplicate.state.keyItemsById?.farm_seed_moonleaf).toBe(1);
  });

  it("does not produce while speed is level 0", () => {
    const state = createFarmState({
      farm: createInitialFarmState(0),
    });

    const settled = settleFarmState(state, FARM_CARROT_GROWTH_MS * 3);

    expect(settled.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
  });

  it("upgrades, generates, and harvests non-Carrot crops into the Pantry", () => {
    const unlocked = unlockFarmCrop(
      createFarmState({ azureTrialCompleted: true, crowns: 200 }),
      FARM_POTATO_CROP_ID,
      "merchant",
      0,
    );
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) {
      return;
    }

    const upgraded = purchaseFarmFieldUpgrade(
      unlocked.state,
      "potato_field",
      "speed",
      0,
    );
    expect(upgraded.ok).toBe(true);
    if (!upgraded.ok) {
      return;
    }

    const settled = settleFarmState(upgraded.state, FARM_CARROT_GROWTH_MS);
    const harvested = harvestAllFarmCrops(settled, FARM_CARROT_GROWTH_MS);

    expect(harvested.ok).toBe(true);
    if (!harvested.ok) {
      return;
    }

    expect(harvested.harvestedByCropId.potato).toBe(1);
    expect(
      harvested.state.innKitchen?.pantry.unlockedIngredientIds,
    ).toContain("potato");
    expect(
      harvested.state.innKitchen?.pantry.ingredientQuantitiesById.potato,
    ).toBe(1);
    expect(
      harvested.state.inventory.slots.some(
        (slot) => String(slot.itemId) === "potato",
      ),
    ).toBe(false);
  });

  it("keeps speed level 1 at the 20 minute baseline", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
    });

    const oneCycle = settleFarmState(state, FARM_CARROT_GROWTH_MS);
    const capped = settleFarmState(state, FARM_CARROT_GROWTH_MS * 60);

    expect(oneCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
    expect(capped.farm?.fieldsById.carrot_field.heldQuantity).toBe(
      FARM_CARROT_BASE_HOLD_CAP,
    );
  });

  it("reduces generation interval through speed level 5", () => {
    const field = createFarmField({
      upgradeLevels: { speed: 5, cap: 1, fertilizer: 0 },
    });
    const state = createFarmState({
      azureTrialCompleted: true,
      farm: { fieldsById: { carrot_field: field } },
    });
    const interval = getFarmFieldGenerationIntervalMs(field);

    const beforeCycle = settleFarmState(state, interval - 1);
    const afterCycle = settleFarmState(state, interval);

    expect(interval).toBe(Math.round(FARM_CARROT_GROWTH_MS / 1.2));
    expect(beforeCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
    expect(afterCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
  });

  it("uses placed fed Elder Mosslings to speed Farm generation", () => {
    const livestock = createInitialLivestockState();
    const field = createFarmField({
      upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
    });
    const state = createFarmState({
      azureTrialCompleted: true,
      farm: { fieldsById: { carrot_field: field } },
      livestock: {
        ...livestock,
        ownedCreaturesById: {
          ...livestock.ownedCreaturesById,
          elder_mossling: 1,
        },
        placementsById: {
          elder_mossling_1: createFarmTestLivestockPlacement({
            id: "elder_mossling_1",
            creatureId: LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
          }),
        },
      },
    });
    const interval = getFarmFieldGenerationIntervalMs(field, state);

    const beforeCycle = settleFarmState(state, interval - 1);
    const afterCycle = settleFarmState(state, interval);

    expect(interval).toBe(Math.round(FARM_CARROT_GROWTH_MS / 1.1));
    expect(beforeCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
    expect(afterCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
  });

  it("uses Harvest Cap levels 1 through 5 as 20 to 36", () => {
    expect(
      [1, 2, 3, 4, 5].map((cap) =>
        getFarmFieldHoldCap(
          createFarmField({ upgradeLevels: { speed: 1, cap, fertilizer: 0 } }),
        ),
      ),
    ).toEqual([20, 24, 28, 32, 36]);
  });

  it("rolls fertilizer double crops and clamps at the cap", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      heldQuantity: 35,
      upgradeLevels: { speed: 1, cap: 5, fertilizer: 3 },
    });

    const settled = settleFarmState(
      state,
      FARM_CARROT_GROWTH_MS,
      () => 0,
    );

    expect(settled.farm?.fieldsById.carrot_field.heldQuantity).toBe(36);
  });

  it("does not store hidden overflow after reaching the holding cap", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      heldQuantity: FARM_CARROT_BASE_HOLD_CAP,
      upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
    });

    const capped = settleFarmState(state, FARM_CARROT_GROWTH_MS * 4);
    const harvested = harvestAllFarmCrops(capped, FARM_CARROT_GROWTH_MS * 4);

    expect(harvested.ok).toBe(true);
    if (!harvested.ok) {
      return;
    }

    const beforeFreshCycle = settleFarmState(
      harvested.state,
      FARM_CARROT_GROWTH_MS * 5 - 1,
    );
    const afterFreshCycle = settleFarmState(
      harvested.state,
      FARM_CARROT_GROWTH_MS * 5,
    );

    expect(beforeFreshCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
    expect(afterFreshCycle.farm?.fieldsById.carrot_field.heldQuantity).toBe(1);
  });

  it("purchases each upgrade, spends Crowns, and updates only that track", () => {
    const state = createFarmState({ azureTrialCompleted: true, crowns: 900 });
    const speed = purchaseFarmFieldUpgrade(
      state,
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );

    expect(speed.ok).toBe(true);
    if (!speed.ok) {
      return;
    }

    const cap = purchaseFarmFieldUpgrade(
      speed.state,
      FARM_CARROT_FIELD_ID,
      "cap",
      NOW_MS,
    );
    expect(cap.ok).toBe(true);
    if (!cap.ok) {
      return;
    }

    const fertilizer = purchaseFarmFieldUpgrade(
      cap.state,
      FARM_CARROT_FIELD_ID,
      "fertilizer",
      NOW_MS,
    );

    expect(fertilizer.ok).toBe(true);
    if (!fertilizer.ok) {
      return;
    }

    expect(fertilizer.state.farm?.fieldsById.carrot_field.upgradeLevels).toEqual(
      {
        speed: 1,
        cap: 2,
        fertilizer: 1,
      },
    );
    expect(fertilizer.state.wallet.balancesByCurrencyId.crowns).toBe(500);
    expect(getFarmUpgradeCostCrowns(0)).toBe(100);
    expect(getFarmUpgradeCostCrowns(1)).toBe(200);
  });

  it("fails upgrade commands while locked, away, underfunded, maxed, or invalid", () => {
    const locked = purchaseFarmFieldUpgrade(
      createFarmState(),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const away = purchaseFarmFieldUpgrade(
      createFarmState({
        azureTrialCompleted: true,
        leaderPosition: { x: 0, y: 0 },
      }),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const underfunded = purchaseFarmFieldUpgrade(
      createFarmState({ azureTrialCompleted: true }),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const maxed = purchaseFarmFieldUpgrade(
      createFarmState({
        azureTrialCompleted: true,
        crowns: 500,
        upgradeLevels: { speed: 5, cap: 1, fertilizer: 0 },
      }),
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );
    const invalidUpgrade = purchaseFarmFieldUpgrade(
      createFarmState({ azureTrialCompleted: true, crowns: 500 }),
      FARM_CARROT_FIELD_ID,
      "missing" as FarmFieldUpgradeId,
      NOW_MS,
    );

    expect(locked).toMatchObject({ ok: false, reason: "locked_service" });
    expect(away).toMatchObject({ ok: false, reason: "not_near_farmer" });
    expect(underfunded).toMatchObject({
      ok: false,
      reason: "insufficient_crowns",
    });
    expect(maxed).toMatchObject({ ok: false, reason: "max_level" });
    expect(invalidUpgrade).toMatchObject({
      ok: false,
      reason: "invalid_upgrade",
    });
  });

  it("harvests all held carrots into the Inn Kitchen Pantry without inventory clutter", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      heldQuantity: 3,
      upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
    });

    const harvested = harvestAllFarmCrops(state, NOW_MS);

    expect(harvested.ok).toBe(true);
    if (!harvested.ok) {
      return;
    }

    expect(harvested.harvestedByCropId.carrot).toBe(3);
    expect(harvested.state.farm?.fieldsById.carrot_field.heldQuantity).toBe(0);
    expect(
      harvested.state.innKitchen?.pantry.unlockedIngredientIds,
    ).toContain("carrot");
    expect(
      harvested.state.innKitchen?.pantry.ingredientQuantitiesById.carrot,
    ).toBe(3);
    expect(
      harvested.state.inventory.slots.some(
        (slot) => String(slot.itemId) === "carrot",
      ),
    ).toBe(false);
  });

  it("harvests all held crops into the Inn Kitchen Pantry together", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      farm: {
        fieldsById: {
          carrot_field: createFarmField({
            heldQuantity: 2,
            lastGeneratedAtMs: 111,
            upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
          }),
          potato_field: {
            id: "potato_field",
            cropId: "potato",
            heldQuantity: 3,
            lastGeneratedAtMs: 222,
            upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
          },
        },
      },
    });

    const harvested = harvestAllFarmCrops(state, NOW_MS);

    expect(harvested.ok).toBe(true);
    if (!harvested.ok) {
      return;
    }

    expect(harvested.harvestedByCropId).toMatchObject({
      carrot: 2,
      potato: 3,
    });
    expect(
      harvested.state.innKitchen?.pantry.ingredientQuantitiesById,
    ).toMatchObject({
      carrot: 2,
      potato: 3,
    });
    expect(harvested.state.farm?.fieldsById.carrot_field.lastGeneratedAtMs).toBe(
      111,
    );
    expect(harvested.state.farm?.fieldsById.potato_field!.lastGeneratedAtMs).toBe(
      222,
    );
  });

  it("does not generate newly ready crops as part of Harvest All", () => {
    const state = createFarmState({
      azureTrialCompleted: true,
      farm: {
        fieldsById: {
          carrot_field: createFarmField({
            heldQuantity: 1,
            lastGeneratedAtMs: 10,
            upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
          }),
          potato_field: {
            id: "potato_field",
            cropId: "potato",
            heldQuantity: 0,
            lastGeneratedAtMs: 0,
            upgradeLevels: { speed: 1, cap: 1, fertilizer: 0 },
          },
        },
      },
    });

    const harvested = harvestAllFarmCrops(state, FARM_CARROT_GROWTH_MS);

    expect(harvested.ok).toBe(true);
    if (!harvested.ok) {
      return;
    }

    expect(harvested.harvestedByCropId).toEqual({ carrot: 1 });
    expect(harvested.state.farm?.fieldsById.potato_field!.heldQuantity).toBe(0);
    expect(
      harvested.state.farm?.fieldsById.potato_field!.lastGeneratedAtMs,
    ).toBe(0);
    expect(
      harvested.state.innKitchen?.pantry.ingredientQuantitiesById.potato,
    ).toBeUndefined();
  });

  it("unlocks placeholder crops from Merchant, T1 gathering, and Ash Wisp sources", () => {
    const merchant = createNpc("merchant", { x: 3, y: 3 }, "Merchant", "merchant");
    let state = createFarmState({
      crowns: 100,
      farm: createInitialFarmState(),
    });
    state = {
      ...state,
      entities: {
        ...state.entities,
        [merchant.id]: merchant,
      },
      quests: {
        ...state.quests,
        [EQUIPMENT_TUTORIAL_QUEST_ID]: {
          ...state.quests[EQUIPMENT_TUTORIAL_QUEST_ID],
          status: "active",
        },
      },
    };

    expect(getMerchantFarmSeedStock(state, merchant.id)[0]).toMatchObject({
      cropId: "potato",
      isOwned: false,
      priceCrowns: 100,
    });

    const potatoPurchase = buyMerchantFarmSeed(
      state,
      merchant.id,
      FARM_POTATO_CROP_ID,
      NOW_MS,
    );
    expect(potatoPurchase.result.status).toBe("success");
    state = potatoPurchase.state;
    expect(isFarmCropUnlocked(state, FARM_POTATO_CROP_ID)).toBe(true);
    expect(state.inventory.slots).toEqual([]);
    expect(getMerchantFarmSeedStock(state, merchant.id)[0]).toMatchObject({
      isOwned: true,
    });
    expect(
      buyMerchantFarmSeed(state, merchant.id, FARM_POTATO_CROP_ID, NOW_MS)
        .result,
    ).toMatchObject({ status: "failed", reason: "already_owned" });

    state = tryUnlockFarmCropFromGathering(
      state,
      createResource("herb", { x: 0, y: 0 }, { resourceType: "herb", tier: 1 }),
      NOW_MS,
      () => 0,
    );
    state = tryUnlockFarmCropFromGathering(
      state,
      createResource("wood", { x: 0, y: 0 }, { resourceType: "wood", tier: 1 }),
      NOW_MS,
      () => 0,
    );
    state = tryUnlockFarmCropFromEnemyDefeat(
      state,
      createEnemy("ash-wisp", { x: 0, y: 0 }, "passive", {
        enemyTypeId: "ash_wisp",
      }),
      NOW_MS,
      () => 0,
    );

    expect(isFarmCropUnlocked(state, FARM_MOONLEAF_CROP_ID)).toBe(true);
    expect(isFarmCropUnlocked(state, FARM_BITTERCAP_MUSHROOM_CROP_ID)).toBe(
      true,
    );
    expect(isFarmCropUnlocked(state, FARM_ASHPEPPER_CROP_ID)).toBe(true);
    expect(state.keyItemsById).toMatchObject({
      farm_seed_potato: 1,
      farm_seed_moonleaf: 1,
      farm_seed_bittercap_mushroom: 1,
      farm_seed_ashpepper: 1,
    });
  });

  it("records Farm upgrade telemetry while debug recording is active", () => {
    const state = startDebugTelemetryRecording(
      createFarmState({ azureTrialCompleted: true, crowns: 100 }),
    );

    const upgraded = purchaseFarmFieldUpgrade(
      state,
      FARM_CARROT_FIELD_ID,
      "speed",
      NOW_MS,
    );

    expect(upgraded.state.debugTelemetry?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "farm_upgrade_attempt",
        "farm_upgrade_succeeded",
      ]),
    );
    expect(upgraded.state.debugTelemetry?.events.at(-1)).toMatchObject({
      farmFieldId: "carrot_field",
      farmCropId: "carrot",
      farmUpgradeId: "speed",
      previousFarmUpgradeLevel: 0,
      nextFarmUpgradeLevel: 1,
      crownCost: 100,
      farmSpeedMultiplier: 1,
    });
  });
});

function createFarmState({
  azureTrialCompleted = false,
  crowns = 0,
  heldQuantity = 0,
  leaderPosition = { x: 10, y: 10 },
  upgradeLevels = { speed: 0, cap: 1, fertilizer: 0 },
  farm = {
    fieldsById: {
      carrot_field: createFarmField({ heldQuantity, upgradeLevels }),
    },
  },
  livestock,
}: {
  azureTrialCompleted?: boolean;
  crowns?: number;
  heldQuantity?: number;
  leaderPosition?: { x: number; y: number };
  upgradeLevels?: FarmFieldUpgradeLevels;
  farm?: GameState["farm"];
  livestock?: GameState["livestock"];
} = {}): GameState {
  const leader = createCompanion("leader", leaderPosition, "leader");
  const farmer = createNpc("farmer", { x: 11, y: 10 }, "Farmer", "farmer");
  const state = createTestGameState({
    partyLeaderId: leader.id,
    entities: {
      [leader.id]: leader,
      [farmer.id]: farmer,
    },
    farm,
    livestock,
    quests: {
      ...createTestGameState().quests,
      azure_trial: {
        ...createTestGameState().quests.azure_trial,
        status: azureTrialCompleted ? "completed" : "available",
      },
    },
  });

  return crowns > 0
    ? addCurrencyToWalletState(state, "crowns", crowns, "debug").state
    : state;
}

function createFarmField({
  heldQuantity = 0,
  lastGeneratedAtMs = 0,
  upgradeLevels,
}: {
  heldQuantity?: number;
  lastGeneratedAtMs?: number;
  upgradeLevels: FarmFieldUpgradeLevels;
}) {
  return {
    id: "carrot_field" as const,
    cropId: "carrot" as const,
    heldQuantity,
    lastGeneratedAtMs,
    upgradeLevels,
  };
}

function createFarmTestLivestockPlacement({
  id,
  creatureId,
  isHungry = false,
}: {
  id: string;
  creatureId: LivestockPlacedCreatureState["creatureId"];
  isHungry?: boolean;
}): LivestockPlacedCreatureState {
  return {
    id,
    creatureId,
    x: 0,
    y: 0,
    rotation: "horizontal",
    placedAtMs: 0,
    lastProducedAtMs: 0,
    isHungry: isHungry ? true : undefined,
  };
}
