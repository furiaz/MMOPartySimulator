import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc } from "./entities";
import {
  addOwnedLivestockCreature,
  collectAllLivestockOutputs,
  createInitialLivestockState,
  feedHungryLivestockNow,
  LIVESTOCK_DUSKHEN_CREATURE_ID,
  LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
  LIVESTOCK_DUSKHEN_FEED_PER_DAY,
  LIVESTOCK_EGG_HOLD_CAP,
  LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
  LIVESTOCK_TIN_CRAWLER_CREATURE_ID,
  LIVESTOCK_TIN_ORE_OUTPUT_ID,
  LIVESTOCK_WOLF_CREATURE_ID,
  moveLivestockPlacement,
  placeLivestockCreature,
  purchaseLivestockAnimalUpgrade,
  purchaseLivestockBuildingUpgrade,
  removeLivestockPlacement,
  sanitizeLivestockState,
  settleLivestockState,
  tryUnlockLivestockCreatureFromEnemyDefeat,
} from "./livestock";
import { getLivestockHelperBonusSummary } from "./livestockHelperBonuses";
import { createEmptyPartyInventory, countInventoryItem } from "./inventory";
import {
  LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID,
  LIVESTOCK_WOLF_DISCOVERY_KEY_ITEM_ID,
} from "./keyItems";
import { sanitizeGameStateForSave } from "./saveGame";
import { createTestGameState } from "./testState";
import type {
  LivestockPlacedCreatureState,
  LivestockState,
  Position,
} from "./types";

const NOW_MS = 1_000_000;

describe("Livestock MVP", () => {
  it("initializes two owned unplaced Duskhens on a 5x3 grid", () => {
    const state = createLivestockTestState();

    expect(state.livestock).toMatchObject({
      grid: { width: 5, height: 3 },
      ownedCreaturesById: { duskhen: 2 },
      placementsById: {},
      animalUpgradeLevelsByCreatureId: {
        duskhen: { speed: 1, feedDiscount: 0, outputCap: 1 },
      },
      buildingUpgradeLevels: { columns: 0, rows: 0, slotEfficiency: 0 },
      holdingQuantitiesByOutputId: { egg: 0 },
      holdingCapsByOutputId: { egg: 20 },
    });
    expect(state.keyItemsById?.[LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]).toBe(1);
  });

  it("sanitizes missing and invalid Livestock state safely", () => {
    const missing = sanitizeLivestockState(undefined);
    const invalid = sanitizeLivestockState({
      grid: { width: -5, height: 1 },
      ownedCreaturesById: { duskhen: 1 },
      placementSequence: 0,
      placementsById: {
        invalid: {
          id: "invalid",
          creatureId: "duskhen",
          x: 99,
          y: 99,
          rotation: "horizontal",
          placedAtMs: 0,
          lastProducedAtMs: 0,
        },
      },
      holdingQuantitiesByOutputId: { egg: 99 },
      holdingCapsByOutputId: { egg: 2 },
    });

    expect(missing.grid).toEqual({ width: 5, height: 3 });
    expect(missing.ownedCreaturesById.duskhen).toBe(2);
    expect(invalid.grid).toEqual({ width: 5, height: 3 });
    expect(invalid.ownedCreaturesById.duskhen).toBe(2);
    expect(invalid.placementsById).toEqual({});
    expect(invalid.holdingQuantitiesByOutputId.egg).toBe(
      LIVESTOCK_EGG_HOLD_CAP,
    );
    expect(invalid.animalUpgradeLevelsByCreatureId.duskhen).toEqual({
      speed: 1,
      feedDiscount: 0,
      outputCap: 1,
    });
    expect(invalid.buildingUpgradeLevels).toEqual({
      columns: 0,
      rows: 0,
      slotEfficiency: 0,
    });
  });

  it("purchases animal upgrades, spends Crowns, and applies speed, feed, and cap effects", () => {
    const speed = purchaseLivestockAnimalUpgrade(
      createLivestockTestState({ crowns: 1_000 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      "speed",
      NOW_MS,
    );

    expect(speed.ok).toBe(true);
    if (!speed.ok) {
      return;
    }

    expect(speed.costCrowns).toBe(200);
    expect(speed.state.wallet.balancesByCurrencyId.crowns).toBe(800);
    expect(
      speed.state.livestock?.animalUpgradeLevelsByCreatureId.duskhen?.speed,
    ).toBe(2);

    const fasterState = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        placementSequence: 1,
        animalUpgradeLevelsByCreatureId: {
          duskhen: { speed: 5, feedDiscount: 0, outputCap: 1 },
        },
        placementsById: {
          livestock_duskhen_1: createPlacedDuskhen({
            id: "livestock_duskhen_1",
            x: 0,
            y: 0,
            lastProducedAtMs: 0,
          }),
        },
      },
    });
    const fasterSettled = settleLivestockState(fasterState, 9_000_000);
    expect(fasterSettled.livestock?.holdingQuantitiesByOutputId.egg).toBe(1);

    const discountedPlaced = placeLivestockCreature(
      createLivestockTestState({
        pantryCarrots: 10,
        livestock: {
          ...createInitialLivestockState(),
          animalUpgradeLevelsByCreatureId: {
            duskhen: { speed: 1, feedDiscount: 3, outputCap: 1 },
          },
        },
      }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      new Date(2026, 0, 1, 12).getTime(),
    );
    expect(discountedPlaced.ok).toBe(true);
    if (discountedPlaced.ok) {
      expect(
        discountedPlaced.state.innKitchen?.pantry.ingredientQuantitiesById.carrot,
      ).toBe(6);
    }

    const capped = settleLivestockState(
      createLivestockTestState({
        livestock: {
          ...createInitialLivestockState(),
          animalUpgradeLevelsByCreatureId: {
            duskhen: { speed: 1, feedDiscount: 0, outputCap: 5 },
          },
          placementsById: {
            livestock_duskhen_1: createPlacedDuskhen({
              id: "livestock_duskhen_1",
              x: 0,
              y: 0,
              lastProducedAtMs: 0,
            }),
          },
          holdingQuantitiesByOutputId: { egg: 35 },
        },
      }),
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS * 5,
    );
    expect(capped.livestock?.holdingCapsByOutputId.egg).toBe(36);
    expect(capped.livestock?.holdingQuantitiesByOutputId.egg).toBe(36);
  });

  it("purchases building upgrades and allows placement in expanded grid cells", () => {
    let state = createLivestockTestState({ crowns: 1_000 });
    const columnUpgrade = purchaseLivestockBuildingUpgrade(state, "columns", NOW_MS);

    expect(columnUpgrade.ok).toBe(true);
    if (!columnUpgrade.ok) {
      return;
    }

    state = columnUpgrade.state;
    const rowUpgrade = purchaseLivestockBuildingUpgrade(state, "rows", NOW_MS);
    expect(rowUpgrade.ok).toBe(true);
    if (!rowUpgrade.ok) {
      return;
    }

    state = rowUpgrade.state;
    expect(state.livestock?.grid).toEqual({ width: 6, height: 4 });

    const placedInNewColumn = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      5,
      0,
      "horizontal",
      NOW_MS,
    );
    expect(placedInNewColumn.ok).toBe(true);
    if (!placedInNewColumn.ok) {
      return;
    }

    const placedInNewRow = placeLivestockCreature(
      placedInNewColumn.state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      3,
      "horizontal",
      NOW_MS,
    );
    expect(placedInNewRow.ok).toBe(true);
  });

  it("rejects invalid, locked, far, unaffordable, maxed, and disabled Livestock upgrades", () => {
    const locked = purchaseLivestockAnimalUpgrade(
      createLivestockTestState({ azureTrialCompleted: false, crowns: 1_000 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      "speed",
      NOW_MS,
    );
    const far = purchaseLivestockAnimalUpgrade(
      createLivestockTestState({
        leaderPosition: { x: 0, y: 0 },
        crowns: 1_000,
      }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      "speed",
      NOW_MS,
    );
    const insufficient = purchaseLivestockAnimalUpgrade(
      createLivestockTestState({ crowns: 0 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      "speed",
      NOW_MS,
    );
    const maxed = purchaseLivestockAnimalUpgrade(
      createLivestockTestState({
        crowns: 1_000,
        livestock: {
          ...createInitialLivestockState(),
          animalUpgradeLevelsByCreatureId: {
            duskhen: { speed: 5, feedDiscount: 0, outputCap: 1 },
          },
        },
      }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      "speed",
      NOW_MS,
    );
    const disabled = purchaseLivestockBuildingUpgrade(
      createLivestockTestState({ crowns: 1_000 }),
      "slotEfficiency",
      NOW_MS,
    );
    const invalid = purchaseLivestockAnimalUpgrade(
      createLivestockTestState({ crowns: 1_000 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      "invalid" as never,
      NOW_MS,
    );

    expect(locked).toMatchObject({ ok: false, reason: "locked_service" });
    expect(far).toMatchObject({ ok: false, reason: "not_near_livestock" });
    expect(insufficient).toMatchObject({
      ok: false,
      reason: "insufficient_crowns",
    });
    expect(maxed).toMatchObject({ ok: false, reason: "max_level" });
    expect(disabled).toMatchObject({ ok: false, reason: "upgrade_disabled" });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid_upgrade" });
  });

  it("places Duskhens and rejects locked, far, occupied, out-of-bounds, and unavailable placement", () => {
    const locked = placeLivestockCreature(
      createLivestockTestState({ azureTrialCompleted: false }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );
    const far = placeLivestockCreature(
      createLivestockTestState({ leaderPosition: { x: 0, y: 0 } }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );
    let state = createLivestockTestState();
    const first = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    state = first.state;
    const occupied = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      NOW_MS,
    );
    const second = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      1,
      0,
      "horizontal",
      NOW_MS,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    state = second.state;
    const unavailable = placeLivestockCreature(
      state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      2,
      0,
      "horizontal",
      NOW_MS,
    );
    const outOfBounds = placeLivestockCreature(
      createLivestockTestState(),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      5,
      0,
      "horizontal",
      NOW_MS,
    );

    expect(locked).toMatchObject({ ok: false, reason: "locked_service" });
    expect(far).toMatchObject({ ok: false, reason: "not_near_livestock" });
    expect(occupied).toMatchObject({ ok: false, reason: "occupied_cell" });
    expect(unavailable).toMatchObject({
      ok: false,
      reason: "no_available_creature",
    });
    expect(outOfBounds).toMatchObject({ ok: false, reason: "out_of_bounds" });
  });

  it("consumes prorated Pantry carrots on placement and rejects insufficient feed", () => {
    const midday = new Date(2026, 0, 1, 12).getTime();
    const placed = placeLivestockCreature(
      createLivestockTestState({ pantryCarrots: 10 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      midday,
    );
    const insufficient = placeLivestockCreature(
      createLivestockTestState({ pantryCarrots: 4 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      midday,
    );
    const freeLatePlacement = placeLivestockCreature(
      createLivestockTestState({ pantryCarrots: 0 }),
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      0,
      0,
      "horizontal",
      new Date(2026, 0, 1, 23, 59).getTime(),
    );

    expect(placed.ok).toBe(true);
    if (placed.ok) {
      expect(
        placed.state.innKitchen?.pantry.ingredientQuantitiesById.carrot,
      ).toBe(5);
    }
    expect(insufficient).toMatchObject({
      ok: false,
      reason: "insufficient_feed",
    });
    expect(freeLatePlacement.ok).toBe(true);
  });

  it("moves while preserving timers and re-places removed Duskhens with a fresh timer", () => {
    const placement = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 100,
    });
    const state = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        placementSequence: 1,
        placementsById: {
          [placement.id]: placement,
        },
      },
    });
    const moved = moveLivestockPlacement(
      state,
      placement.id,
      2,
      1,
      "horizontal",
      200,
    );

    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      return;
    }

    expect(moved.placement).toMatchObject({
      x: 2,
      y: 1,
      lastProducedAtMs: 100,
    });

    const removed = removeLivestockPlacement(moved.state, placement.id, 300);
    expect(removed.ok).toBe(true);
    if (!removed.ok) {
      return;
    }

    const rePlaced = placeLivestockCreature(
      removed.state,
      LIVESTOCK_DUSKHEN_CREATURE_ID,
      3,
      1,
      "horizontal",
      400,
    );
    expect(rePlaced.ok).toBe(true);
    if (!rePlaced.ok) {
      return;
    }

    expect(rePlaced.placement.lastProducedAtMs).toBe(400);
  });

  it("produces staggered Eggs, catches up, and clamps at the shared holding cap", () => {
    const first = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 0,
    });
    const second = createPlacedDuskhen({
      id: "livestock_duskhen_2",
      x: 1,
      y: 0,
      lastProducedAtMs: LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
    });
    const state = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        placementSequence: 2,
        placementsById: {
          [first.id]: first,
          [second.id]: second,
        },
      },
    });
    const oneReady = settleLivestockState(
      state,
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
    );
    const bothReady = settleLivestockState(
      oneReady,
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS +
        LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
    );

    expect(oneReady.livestock?.holdingQuantitiesByOutputId.egg).toBe(1);
    expect(bothReady.livestock?.holdingQuantitiesByOutputId.egg).toBe(2);
    expect(
      bothReady.livestock?.placementsById[first.id].lastProducedAtMs,
    ).toBe(LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS);
    expect(
      bothReady.livestock?.placementsById[second.id].lastProducedAtMs,
    ).toBe(
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS +
        LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS / 2,
    );

    const capped = settleLivestockState(
      createLivestockTestState({
        livestock: {
          ...createInitialLivestockState(),
          placementsById: {
            [first.id]: first,
          },
          holdingQuantitiesByOutputId: { egg: 19 },
        },
      }),
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS * 5,
    );

    expect(capped.livestock?.holdingQuantitiesByOutputId.egg).toBe(20);
  });

  it("feeds placed animals at midnight in placement order and marks unfed animals hungry", () => {
    const start = new Date(2026, 0, 1, 0).getTime();
    const first = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: start,
    });
    const second = createPlacedDuskhen({
      id: "livestock_duskhen_2",
      x: 1,
      y: 0,
      lastProducedAtMs: start,
    });
    const fed = settleLivestockState(
      createLivestockTestState({
        pantryCarrots: LIVESTOCK_DUSKHEN_FEED_PER_DAY,
        livestock: {
          ...createInitialLivestockState(start),
          placementSequence: 2,
          lastFeedDayStartMs: start,
          placementsById: {
            [first.id]: first,
            [second.id]: second,
          },
        },
      }),
      new Date(2026, 0, 2, 0, 1).getTime(),
    );

    expect(fed.livestock?.placementsById[first.id].isHungry).toBeUndefined();
    expect(fed.livestock?.placementsById[second.id].isHungry).toBe(true);
    expect(fed.innKitchen?.pantry.ingredientQuantitiesById.carrot).toBe(0);
  });

  it("pauses hungry production and resumes remaining timer after Feed Now", () => {
    const start = new Date(2026, 0, 1, 0).getTime();
    const beforeMidnight = new Date(2026, 0, 1, 22).getTime();
    const afterMidnight = new Date(2026, 0, 2, 0, 1).getTime();
    const afterFeed = new Date(2026, 0, 2, 12).getTime();
    const placed = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: beforeMidnight,
    });
    const hungry = settleLivestockState(
      createLivestockTestState({
        pantryCarrots: 0,
        livestock: {
          ...createInitialLivestockState(start),
          placementSequence: 1,
          lastFeedDayStartMs: start,
          placementsById: {
            [placed.id]: placed,
          },
        },
      }),
      afterMidnight,
    );
    const hungryPlacement = hungry.livestock?.placementsById[placed.id];

    expect(hungryPlacement?.isHungry).toBe(true);
    expect(hungryPlacement?.pausedProductionRemainingMs).toBe(
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS - 2 * 60 * 60 * 1000,
    );

    const stillPaused = settleLivestockState(
      {
        ...hungry,
        innKitchen: {
          ...hungry.innKitchen!,
          pantry: {
            ...hungry.innKitchen!.pantry,
            ingredientQuantitiesById: {
              ...hungry.innKitchen!.pantry.ingredientQuantitiesById,
              carrot: 5,
            },
          },
        },
      },
      afterFeed,
    );

    expect(stillPaused.livestock?.holdingQuantitiesByOutputId.egg).toBe(0);

    const fed = feedHungryLivestockNow(stillPaused, afterFeed);
    expect(fed.ok).toBe(true);
    if (!fed.ok) {
      return;
    }

    const resumedOneHourLater = settleLivestockState(
      fed.state,
      afterFeed + 60 * 60 * 1000,
    );
    expect(
      resumedOneHourLater.livestock?.placementsById[placed.id].isHungry,
    ).not.toBe(true);
    expect(resumedOneHourLater.livestock?.holdingQuantitiesByOutputId.egg).toBe(1);
  });

  it("Feed Now fails when no animals are hungry", () => {
    const fed = feedHungryLivestockNow(createLivestockTestState(), NOW_MS);

    expect(fed).toMatchObject({ ok: false, reason: "no_hungry_animals" });
  });

  it("collects held Eggs into Pantry without generating first, resetting timers, or creating inventory clutter", () => {
    const placement = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 0,
    });
    const state = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        placementsById: {
          [placement.id]: placement,
        },
        holdingQuantitiesByOutputId: { egg: 1 },
      },
    });

    const collected = collectAllLivestockOutputs(
      state,
      LIVESTOCK_DUSKHEN_EGG_INTERVAL_MS,
    );

    expect(collected.ok).toBe(true);
    if (!collected.ok) {
      return;
    }

    expect(collected.collectedByOutputId.egg).toBe(1);
    expect(collected.state.livestock?.holdingQuantitiesByOutputId.egg).toBe(0);
    expect(
      collected.state.livestock?.placementsById[placement.id].lastProducedAtMs,
    ).toBe(0);
    expect(
      collected.state.innKitchen?.pantry.unlockedIngredientIds,
    ).toContain("egg");
    expect(
      collected.state.innKitchen?.pantry.ingredientQuantitiesById.egg,
    ).toBe(1);
    expect(
      collected.state.inventory.slots.some((slot) => String(slot.itemId) === "egg"),
    ).toBe(false);
  });

  it("unlocks livestock creatures from enemy defeats with scaling repeated drop chances", () => {
    const wolf = createEnemy("wolf", { x: 0, y: 0 }, "aggressive", {
      enemyTypeId: "wolf",
    });
    const unlocked = tryUnlockLivestockCreatureFromEnemyDefeat(
      createLivestockTestState(),
      wolf,
      NOW_MS,
      () => 0.09,
    );
    const failedSecond = tryUnlockLivestockCreatureFromEnemyDefeat(
      unlocked,
      wolf,
      NOW_MS + 1,
      () => 0.06,
    );
    const passedSecond = tryUnlockLivestockCreatureFromEnemyDefeat(
      failedSecond,
      wolf,
      NOW_MS + 2,
      () => 0.04,
    );

    expect(unlocked.livestock?.ownedCreaturesById.wolf).toBe(1);
    expect(unlocked.keyItemsById?.[LIVESTOCK_WOLF_DISCOVERY_KEY_ITEM_ID]).toBe(1);
    expect(unlocked.newsBroadcasts?.at(-1)).toMatchObject({
      title: "Unlock Acquired",
      text: "Unlocked: Wolf Pup",
      details: ["Unlocked: Wolf Pup"],
    });
    expect(failedSecond.livestock?.ownedCreaturesById.wolf).toBe(1);
    expect(failedSecond.newsBroadcasts).toHaveLength(
      unlocked.newsBroadcasts?.length ?? 0,
    );
    expect(passedSecond.livestock?.ownedCreaturesById.wolf).toBe(2);
    expect(passedSecond.newsBroadcasts?.at(-1)).toMatchObject({
      title: "Items Received",
      text: "Obtained: Wolf Pup",
      details: ["Obtained: Wolf Pup"],
    });
  });

  it("counts only placed fed helper creatures for helper bonuses", () => {
    const livestock = createInitialLivestockState();
    const state = createLivestockTestState({
      livestock: {
        ...livestock,
        ownedCreaturesById: {
          ...livestock.ownedCreaturesById,
          wolf: 3,
          elder_mossling: 2,
        },
        placementsById: {
          wolf_fed: createPlacedCreature({
            id: "wolf_fed",
            creatureId: LIVESTOCK_WOLF_CREATURE_ID,
            x: 0,
            y: 0,
          }),
          wolf_hungry: createPlacedCreature({
            id: "wolf_hungry",
            creatureId: LIVESTOCK_WOLF_CREATURE_ID,
            x: 2,
            y: 0,
            isHungry: true,
          }),
          mossling_fed: createPlacedCreature({
            id: "mossling_fed",
            creatureId: LIVESTOCK_ELDER_MOSSLING_CREATURE_ID,
            x: 0,
            y: 1,
          }),
        },
      },
    });

    expect(getLivestockHelperBonusSummary(state)).toMatchObject({
      activeWolfCount: 1,
      noticeBoardRerollBonus: 1,
      activeElderMosslingCount: 1,
      farmGenerationBonusPercent: 10,
      farmGenerationMultiplier: 1.1,
      noticeBoardLivestockSourceText: "1 from Livestock (Wolf x1)",
      farmGenerationLivestockSourceText:
        "+10% from Livestock (Elder Mossling x1)",
      summaryText:
        "Farm generation +10% (Elder Mossling x1), Notice Board rerolls +1/day (Wolf x1)",
    });
  });

  it("places a Tin Crawler and produces Tin Ore", () => {
    let state = createLivestockTestState({
      pantryIngredients: { bittercap_mushroom: 10 },
    });
    state = addOwnedLivestockCreature(
      state,
      LIVESTOCK_TIN_CRAWLER_CREATURE_ID,
      "tin_crawler_defeat",
      NOW_MS,
    ).state;

    const placed = placeLivestockCreature(
      state,
      LIVESTOCK_TIN_CRAWLER_CREATURE_ID,
      0,
      0,
      "horizontal",
      new Date(2026, 0, 1, 12).getTime(),
    );

    expect(placed.ok).toBe(true);
    if (!placed.ok) {
      return;
    }

    expect(
      placed.state.innKitchen?.pantry.ingredientQuantitiesById
        .bittercap_mushroom,
    ).toBe(5);

    const settled = settleLivestockState(
      placed.state,
      new Date(2026, 0, 1, 15).getTime(),
    );
    expect(
      settled.livestock?.holdingQuantitiesByOutputId[
        LIVESTOCK_TIN_ORE_OUTPUT_ID
      ],
    ).toBe(1);
  });

  it("collects Tin Ore to inventory and blocks all collection if inventory transfer fails", () => {
    const withOre = createLivestockTestState({
      livestock: {
        ...createInitialLivestockState(),
        holdingQuantitiesByOutputId: { egg: 1, tin_ore: 1 },
      },
    });
    const collected = collectAllLivestockOutputs(withOre, NOW_MS);

    expect(collected.ok).toBe(true);
    if (!collected.ok) {
      return;
    }

    expect(collected.state.innKitchen?.pantry.ingredientQuantitiesById.egg).toBe(1);
    expect(countInventoryItem(collected.state.inventory, "tin_ore")).toBe(1);
    expect(collected.state.livestock?.holdingQuantitiesByOutputId).toMatchObject({
      egg: 0,
      tin_ore: 0,
    });

    const blocked = collectAllLivestockOutputs(
      createLivestockTestState({
        inventory: createEmptyPartyInventory(0),
        livestock: {
          ...createInitialLivestockState(),
          holdingQuantitiesByOutputId: { egg: 1, tin_ore: 1 },
        },
      }),
      NOW_MS,
    );

    expect(blocked).toMatchObject({ ok: false, reason: "collection_error" });
    expect(blocked.state.livestock?.holdingQuantitiesByOutputId).toMatchObject({
      egg: 1,
      tin_ore: 1,
    });
  });

  it("preserves Livestock through save sanitization and restores the Duskhen discovery key item", () => {
    const placement = createPlacedDuskhen({
      id: "livestock_duskhen_1",
      x: 0,
      y: 0,
      lastProducedAtMs: 0,
    });
    const sanitized = sanitizeGameStateForSave(
      createLivestockTestState({
        keyItemsById: {},
        livestock: {
          ...createInitialLivestockState(),
          placementSequence: 1,
          placementsById: {
            [placement.id]: placement,
          },
          holdingQuantitiesByOutputId: { egg: 4 },
        },
      }),
    );

    expect(sanitized.livestock?.placementsById[placement.id]).toMatchObject({
      creatureId: "duskhen",
      x: 0,
      y: 0,
    });
    expect(sanitized.livestock?.holdingQuantitiesByOutputId.egg).toBe(4);
    expect(
      sanitized.keyItemsById?.[LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID],
    ).toBe(1);
  });
});

function createLivestockTestState({
  azureTrialCompleted = true,
  leaderPosition = { x: 10, y: 10 },
  livestock = createInitialLivestockState(),
  keyItemsById,
  pantryIngredients = {},
  inventory,
  pantryCarrots = 100,
  crowns = 0,
}: {
  azureTrialCompleted?: boolean;
  leaderPosition?: Position;
  livestock?: LivestockState;
  keyItemsById?: Partial<Record<string, number>>;
  pantryIngredients?: Record<string, number>;
  inventory?: ReturnType<typeof createEmptyPartyInventory>;
  pantryCarrots?: number;
  crowns?: number;
} = {}) {
  const leader = createCompanion("leader", leaderPosition, "leader");
  const keeper = createNpc(
    "livestock",
    { x: 11, y: 10 },
    "Livestock",
    "livestock_keeper",
  );
  const baseState = createTestGameState();
  const baseQuests = baseState.quests;
  const baseKitchen = baseState.innKitchen!;

  return createTestGameState({
    partyLeaderId: leader.id,
    entities: {
      [leader.id]: leader,
      [keeper.id]: keeper,
    },
    wallet: {
      ...baseState.wallet,
      balancesByCurrencyId: {
        ...baseState.wallet.balancesByCurrencyId,
        crowns,
      },
    },
    inventory: inventory ?? baseState.inventory,
    livestock,
    keyItemsById:
      keyItemsById === undefined
        ? {
            [LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]: 1,
          }
        : keyItemsById,
    quests: {
      ...baseQuests,
      azure_trial: {
        ...baseQuests.azure_trial,
        status: azureTrialCompleted ? "completed" : "available",
      },
    },
    innKitchen: {
      ...baseKitchen,
      pantry: {
        ...baseKitchen.pantry,
        unlockedIngredientIds: baseKitchen.pantry.unlockedIngredientIds.includes(
          "carrot",
        )
          ? baseKitchen.pantry.unlockedIngredientIds
          : [...baseKitchen.pantry.unlockedIngredientIds, "carrot"],
        ingredientQuantitiesById: {
          ...baseKitchen.pantry.ingredientQuantitiesById,
          carrot: pantryCarrots,
          ...pantryIngredients,
        },
      },
    },
  });
}

function createPlacedDuskhen({
  id,
  x,
  y,
  lastProducedAtMs,
}: {
  id: string;
  x: number;
  y: number;
  lastProducedAtMs: number;
}): LivestockPlacedCreatureState {
  return {
    id,
    creatureId: LIVESTOCK_DUSKHEN_CREATURE_ID,
    x,
    y,
    rotation: "horizontal",
    placedAtMs: lastProducedAtMs,
    lastProducedAtMs,
  };
}

function createPlacedCreature({
  id,
  creatureId,
  x,
  y,
  isHungry = false,
}: {
  id: string;
  creatureId: LivestockPlacedCreatureState["creatureId"];
  x: number;
  y: number;
  isHungry?: boolean;
}): LivestockPlacedCreatureState {
  return {
    id,
    creatureId,
    x,
    y,
    rotation: "horizontal",
    placedAtMs: 0,
    lastProducedAtMs: 0,
    isHungry: isHungry ? true : undefined,
  };
}
