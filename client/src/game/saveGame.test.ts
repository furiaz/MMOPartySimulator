import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDebugMap,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  SLIMEWARD_FLOOR_ONE_ID,
  mapTwoEnemyStartData,
} from "./debugMap";
import { createDebugTelemetryState } from "./debugTelemetry";
import { createCompanion, createResource } from "./entities";
import {
  createInitialGuildNoticeBoardState,
  GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
} from "./guildNoticeBoard";
import {
  createInitialGuildRecruitState,
  GUILD_RECRUIT_REFRESH_INTERVAL_MS,
} from "./guildRecruit";
import {
  GUILD_SECONDARY_PARTY_ID,
  createInitialGuildSecondaryPartiesState,
} from "./guildSecondaryParties";
import { createInitialGuildUpgradesState } from "./guildRecruitUpgrades";
import {
  FARM_CARROT_BASE_HOLD_CAP,
  FARM_CARROT_GROWTH_MS,
  createInitialFarmState,
} from "./farm";
import {
  INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
  cookInnMealForCompanion,
  setInnKitchenAutoCookEnabled,
  setInnKitchenAutoCookRenewThresholdPercent,
  setInnKitchenSelectedRecipe,
} from "./innKitchen";
import { createInitialInnUpgradesState } from "./innRoomUpgrades";
import { addItemToInventoryState, countInventoryItem } from "./inventory";
import { getPartySizeLimit } from "./leveling";
import { moveCompanionToRestingReserve } from "./partySystem";
import { createInitialQuestStates } from "./questSystem";
import {
  QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS,
  updateQuestGuideSystem,
} from "./questGuideSystem";
import {
  applyOfflineFarmingProgress,
  claimPendingOfflineFarmingLoot,
  createSavedGame,
  MAX_OFFLINE_FARMING_MS,
  restoreGameStateFromSave,
  sanitizeGameStateForSave,
  validateSavedGame,
} from "./saveGame";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, GameEntity, ItemId, PartyMemberRole } from "./types";
import { addCurrencyToWalletState } from "./wallet";

const NOW_MS = 1_000_000;

describe("save game serialization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("validates v1 saves and rejects malformed saves", () => {
    const state = createWildState("fighter");
    const save = createSavedGame(state, NOW_MS);

    expect(validateSavedGame(save).ok).toBe(true);
    expect(validateSavedGame({ ...save, saveVersion: 999 }).ok).toBe(false);
    expect(validateSavedGame({ ...save, state: { ...save.state, entities: null } }).ok).toBe(false);
  });

  it("restores deterministic map data and clears transient runtime state", () => {
    const state = createWildState("fighter");
    const save = createSavedGame(
      {
        ...state,
        activeTeleport: {
          id: "test",
          position: { x: 1, y: 1 },
          range: 2,
          sourceMapId: MAP_ONE_ID,
          targetMapId: "map-2",
          triggeredBy: "player",
        },
        combatFeedbackEvents: [
          {
            id: "feedback",
            type: "damage",
            entityId: "companion-1",
            text: "1",
            createdAt: NOW_MS,
            expiresAt: NOW_MS + 1000,
          },
        ],
        movementPathsByEntityId: {
          "companion-1": {
            targetKey: "1,1",
            waypoints: [{ x: 1, y: 1 }],
          },
        },
        companionAoeChannelsByCasterId: {
          "companion-1": {
            id: "shockwave",
            abilityId: "shield_shockwave",
            casterId: "companion-1",
            shape: {
              type: "circle",
              center: { x: 14, y: 29 },
              radius: 2,
            },
            visualIntent: "partyOffensive",
            damageType: "physical",
            powerMultiplier: 0.5,
            bindDurationMs: 1000,
            startedAt: NOW_MS,
            channelEndsAt: NOW_MS + 200,
          },
        },
        debugTelemetry: {
          ...createDebugTelemetryState(),
          isRecording: true,
          startedAt: NOW_MS,
        },
      },
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(save.offlineFarmingBlockedReason).toContain("active travel");
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.map?.id).toBe(MAP_ONE_ID);
    expect(restored.state.activeTeleport).toBeNull();
    expect(restored.state.combatFeedbackEvents).toEqual([]);
    expect(restored.state.movementPathsByEntityId).toEqual({});
    expect(restored.state.companionAoeChannelsByCasterId).toEqual({});
    expect(restored.state.debugTelemetry).toBeUndefined();
  });

  it("keeps persistent party, inventory, wallet, quests, map, and resources", () => {
    let state = createWildState("fighter");
    state = addItemToInventoryState(state, "softwood", 2, "debug").state;

    const save = createSavedGame(state, NOW_MS);

    expect(save.state.currentMapId).toBe(MAP_ONE_ID);
    expect(save.state.entities["companion-1"]).toMatchObject({
      kind: "companion",
      role: "defender",
      characterLevel: 1,
    });
    expect(save.state.inventory.slots.some((slot) => slot.itemId === "softwood")).toBe(true);
    expect(save.state.wallet).toEqual(state.wallet);
    expect(save.state.quests).toEqual(state.quests);
    expect(
      Object.values(save.state.entities).some(
        (entity) => entity.kind === "resource" && entity.resourceType === "wood",
      ),
    ).toBe(true);
  });

  it("preserves resting companions and highest-ever level through save restore", () => {
    const leader: Companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      state: "idle",
      currentTargetId: null,
    };
    const veteran: Companion = {
      ...createCompanion("companion-2", { x: 16, y: 29 }, "companion-1", "fighter", 1),
      characterLevel: 50,
      characterXp: 12,
      state: "attack",
      currentTargetId: "enemy-1",
      commandPriority: "direct",
    };
    const activeState = createTestGameState({
      entities: {
        [leader.id]: leader,
        [veteran.id]: veteran,
      },
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      partyLeaderId: leader.id,
    });
    const restingState = moveCompanionToRestingReserve(activeState, veteran.id);
    const save = createSavedGame(restingState, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restingState.entities[veteran.id]).toBeUndefined();
    expect(restingState.restingCompanionsById?.[veteran.id]).toMatchObject({
      id: veteran.id,
      characterLevel: 50,
      state: "idle",
      currentTargetId: null,
      commandPriority: "autonomous",
    });
    expect(save.state.highestCharacterLevelEver).toBe(50);
    expect(save.state.restingCompanionsById?.[veteran.id]?.consumableBuffs).toEqual({
      flask: null,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.entities[veteran.id]).toBeUndefined();
    expect(restored.state.restingCompanionsById?.[veteran.id]).toMatchObject({
      id: veteran.id,
      characterLevel: 50,
      characterXp: 12,
    });
    expect(restored.state.highestCharacterLevelEver).toBe(50);
    expect(getPartySizeLimit(restored.state)).toBe(4);
  });

  it("cleans obsolete prototype food from old saves", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      consumables: {
        flask: null,
        foodItemId: "hearty_trail_rations",
      },
      consumableBuffs: {
        flask: null,
        food: {
          itemId: "skirmisher_rations",
          kind: "food",
          expiresAt: NOW_MS + 1_000,
        },
      },
    } as unknown as Companion;
    const state = createTestGameState({
      entities: { [companion.id]: companion },
      inventory: {
        capacity: 6,
        slots: [
          { itemId: "hearty_trail_rations" as ItemId, quantity: 2 },
          { itemId: "skirmisher_rations" as ItemId, quantity: 1 },
          { itemId: "minor_recovery_flask", quantity: 1 },
        ],
      },
      partyLeaderId: companion.id,
    });

    const save = createSavedGame(state, NOW_MS);
    const restored = restoreGameStateFromSave(save);
    const savedCompanion = save.state.entities[companion.id] as Companion;

    expect(save.state.inventory.slots).toEqual([
      { itemId: "minor_recovery_flask", quantity: 1 },
    ]);
    expect(savedCompanion.consumables).toEqual({ flask: null });
    expect(savedCompanion.consumableBuffs).toEqual({ flask: null });
    expect("hubDepartureFoodWarning" in save.state).toBe(false);
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.inventory.slots).toEqual([
      { itemId: "minor_recovery_flask", quantity: 1 },
    ]);
    expect((restored.state.entities[companion.id] as Companion).consumables).toEqual({
      flask: null,
    });
  });

  it("drops removed item ids from saved inventory, bank, and pending offline loot", () => {
    const removedItemId = "removed_crafting_supply" as ItemId;
    const state = createTestGameState({
      inventory: {
        capacity: 6,
        slots: [
          { itemId: removedItemId, quantity: 2 },
          { itemId: "minor_recovery_flask", quantity: 1 },
        ],
      },
      bank: {
        capacity: 6,
        slots: [
          { itemId: removedItemId, quantity: 3, slotIndex: 0 },
          { itemId: "softwood", quantity: 4, slotIndex: 1 },
        ],
        lockedSlotIndices: [],
        autoRoutingMode: "keep_inventory",
      },
      pendingOfflineFarmingLoot: {
        mapId: MAP_ONE_ID,
        subzoneId: "shore-fringe",
        subzoneName: "Shore Fringe",
        creditedMs: 60_000,
        enemyKills: 1,
        xpGranted: 1,
        rolledLoot: [
          { itemId: removedItemId, quantity: 5 },
          { itemId: "softwood", quantity: 1 },
        ],
        collectedLoot: [{ itemId: removedItemId, quantity: 1 }],
        pendingLoot: [
          { itemId: removedItemId, quantity: 4 },
          { itemId: "slime_gel_t1", quantity: 2 },
        ],
        createdAtMs: NOW_MS,
      },
    });

    const restored = restoreGameStateFromSave(createSavedGame(state, NOW_MS));

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.inventory.slots).toEqual([
      { itemId: "minor_recovery_flask", quantity: 1 },
    ]);
    expect(restored.state.bank.slots).toEqual([
      { itemId: "softwood", quantity: 4, slotIndex: 1 },
    ]);
    expect(restored.state.pendingOfflineFarmingLoot?.rolledLoot).toEqual([
      { itemId: "softwood", quantity: 1 },
    ]);
    expect(restored.state.pendingOfflineFarmingLoot?.collectedLoot).toEqual([]);
    expect(restored.state.pendingOfflineFarmingLoot?.pendingLoot).toEqual([
      { itemId: "slime_gel_t1", quantity: 2 },
    ]);
  });

  it("preserves Guild recruit candidate, timer, and sequence through save restore", () => {
    const guildRecruit = {
      ...createInitialGuildRecruitState(NOW_MS),
      recruitSequence: 7,
      candidates: [
        {
          id: "guild-recruit-candidate-7",
          classId: "beginner" as const,
          characterLevel: 1,
          role: "none" as const,
          generatedAtMs: NOW_MS,
          sequence: 7,
          equipmentItemIds: ["training_sword" as const],
          startingSkillRanksBySkillId: {
            first_aid: 2,
          },
        },
      ],
      nextRefreshAtMs: NOW_MS + GUILD_RECRUIT_REFRESH_INTERVAL_MS,
    };
    const save = createSavedGame(
      createTestGameState({
        guildRecruit,
      }),
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildRecruit).toEqual(guildRecruit);
  });

  it("preserves Guild Notice Board quest, timer, and sequence through save restore", () => {
    const guildNoticeBoard = {
      ...createInitialGuildNoticeBoardState(NOW_MS),
      questSequence: 5,
      hasSeenCurrentRefresh: true,
      nextRefreshAtMs: NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
      slots: [
        {
          ...createInitialGuildNoticeBoardState(NOW_MS).slots[0]!,
          id: "guild-notice-board-quest-5",
          sequence: 5,
          status: "taken" as const,
          takenAtMs: NOW_MS,
          levelAnchor: null,
          levelRange: null,
          objectives: [
            {
              id: "defeat-goblin_shaman",
              enemyTypeId: "goblin_shaman" as const,
              requiredCount: 50,
              currentCount: 12,
            },
            {
              id: "defeat-ash_wisp",
              enemyTypeId: "ash_wisp" as const,
              requiredCount: 50,
              currentCount: 7,
            },
          ],
        },
      ],
    };
    const save = createSavedGame(
      createTestGameState({
        guildNoticeBoard,
      }),
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildNoticeBoard).toEqual(guildNoticeBoard);
  });

  it("preserves Guild Field Team assignment through save restore", () => {
    const leader: Companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      state: "idle",
      currentTargetId: null,
    };
    const secondaryCompanion: Companion = {
      ...createCompanion("companion-2", { x: 15, y: 29 }, "companion-1", "fighter", 1),
      state: "idle",
      currentTargetId: null,
    };
    const guildSecondaryParties = {
      parties: [
        {
          id: GUILD_SECONDARY_PARTY_ID,
          displayName: "Field Team 1",
          companionIds: [secondaryCompanion.id],
          assignment: null,
        },
      ],
    };
    const guildUpgrades = createInitialGuildUpgradesState();
    guildUpgrades.secondaryParties.secondary_party_count = 1;
    const save = createSavedGame(
      createTestGameState({
        entities: {
          [leader.id]: leader,
        },
        restingCompanionsById: {
          [secondaryCompanion.id]: secondaryCompanion,
        },
        partyLeaderId: leader.id,
        guildUpgrades,
        guildSecondaryParties,
      }),
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.guildSecondaryParties?.parties[0].companionIds).toEqual([
      secondaryCompanion.id,
    ]);
    expect(restored.state.restingCompanionsById?.[secondaryCompanion.id]).toMatchObject({
      id: secondaryCompanion.id,
      state: "idle",
      currentTargetId: null,
    });
  });

  it("preserves active Inn Kitchen meals through save restore", () => {
    const companion = createCompanion(
      "meal-companion",
      { x: 0, y: 0 },
      "meal-companion",
    );
    const funded = addCurrencyToWalletState(
      createTestGameState({
        entities: {
          [companion.id]: companion,
        },
        partyLeaderId: companion.id,
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(),
        simulationTimeMs: NOW_MS,
      }),
      "crowns",
      100,
      "debug",
    ).state;
    const cooked = cookInnMealForCompanion(
      funded,
      companion.id,
      INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
      NOW_MS,
    );
    expect(cooked.ok).toBe(true);

    const save = createSavedGame(cooked.state, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.state.innKitchen?.activeMealBuffsByCompanionId).toMatchObject({
      [companion.id]: {
        recipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
        cookedAtMs: NOW_MS,
      },
    });
  });

  it("preserves partial Hearth's Fire through save restore without instant refill", () => {
    const companion = createCompanion(
      "meal-companion",
      { x: 0, y: 0 },
      "meal-companion",
    );
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      partyLeaderId: companion.id,
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(),
      simulationTimeMs: NOW_MS + 10 * 60 * 60 * 1000,
      innKitchen: {
        activeMealBuffsByCompanionId: {},
        preferencesByCompanionId: {},
        hearthFire: {
          current: 4,
          lastUpdatedAtMs: NOW_MS,
        },
        pantry: {
          unlockedIngredientIds: [],
          ingredientQuantitiesById: {},
        },
        autoCookFailuresByCompanionId: {},
      },
    });

    const save = createSavedGame(state, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.state.innKitchen?.hearthFire).toEqual({
      current: 4,
      lastUpdatedAtMs: NOW_MS,
    });
  });

  it("preserves Inn Kitchen selected recipe and auto-cook preferences", () => {
    const companion = createCompanion(
      "meal-companion",
      { x: 0, y: 0 },
      "meal-companion",
    );
    const state = setInnKitchenAutoCookRenewThresholdPercent(
      setInnKitchenAutoCookEnabled(
        setInnKitchenSelectedRecipe(
          createTestGameState({
            entities: {
              [companion.id]: companion,
            },
            partyLeaderId: companion.id,
            currentMapId: HUB_MAP_ID,
            map: createDebugMap(),
            simulationTimeMs: NOW_MS,
          }),
          companion.id,
          INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
        ),
        companion.id,
        true,
      ),
      companion.id,
      25,
    );

    const save = createSavedGame(state, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.innKitchen?.preferencesByCompanionId).toEqual({
      [companion.id]: {
        selectedRecipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
        autoCookEnabled: true,
        autoCookRenewThresholdPercent: 25,
      },
    });
  });

  it("restores old quest saves around the inserted Smithy quest without relocking progress", () => {
    const progressedQuests = createInitialQuestStates();
    progressedQuests.outfit_the_expedition = {
      ...progressedQuests.outfit_the_expedition,
      status: "completed",
    };
    progressedQuests.stolen_field_supplies = {
      ...progressedQuests.stolen_field_supplies,
      status: "active",
    };
    const progressedSave = createSavedGame(
      {
        ...createTestGameState(),
        quests: progressedQuests,
      },
      NOW_MS,
    );
    delete (progressedSave.state.quests as Partial<
      typeof progressedSave.state.quests
    >).smiths_first_work;

    const progressedRestore = restoreGameStateFromSave(progressedSave);

    expect(progressedRestore.ok).toBe(true);
    if (progressedRestore.ok) {
      expect(progressedRestore.state.quests.smiths_first_work.status).toBe(
        "completed",
      );
      expect(progressedRestore.state.quests.stolen_field_supplies.status).toBe(
        "active",
      );
    }

    const tutorialQuests = createInitialQuestStates();
    tutorialQuests.outfit_the_expedition = {
      ...tutorialQuests.outfit_the_expedition,
      status: "completed",
    };
    const tutorialSave = createSavedGame(
      {
        ...createTestGameState(),
        quests: tutorialQuests,
      },
      NOW_MS,
    );
    delete (tutorialSave.state.quests as Partial<typeof tutorialSave.state.quests>)
      .smiths_first_work;

    const tutorialRestore = restoreGameStateFromSave(tutorialSave);

    expect(tutorialRestore.ok).toBe(true);
    if (tutorialRestore.ok) {
      expect(tutorialRestore.state.quests.smiths_first_work.status).toBe(
        "available",
      );
      expect(
        tutorialRestore.state.quests.smiths_first_work.objectiveProgress
          .craft_plain_charm,
      ).toMatchObject({
        currentCount: 0,
        completed: false,
      });
    }
  });

  it("restores Forward Bastion saves with deterministic map data", () => {
    const state = sanitizeGameStateForSave({
      ...createTestGameState(),
      currentMapId: HUB_TWO_MAP_ID,
      map: createDebugMap(HUB_TWO_MAP_ID),
    });
    const save = createSavedGame(state, NOW_MS);

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.currentMapId).toBe(HUB_TWO_MAP_ID);
    expect(restored.state.map?.id).toBe(HUB_TWO_MAP_ID);
    expect(restored.state.map?.displayName).toBe("Forward Bastion");
  });

  it("defaults missing roster foundation fields on older saves", () => {
    const leader: Companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      characterLevel: 30,
      state: "idle",
      currentTargetId: null,
    };
    const save = createSavedGame(
      createTestGameState({
        entities: {
          [leader.id]: leader,
        },
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
        partyLeaderId: leader.id,
      }),
      NOW_MS,
    );
    delete (save.state as Partial<GameState>).restingCompanionsById;
    delete (save.state as Partial<GameState>).highestCharacterLevelEver;
    delete (save.state as Partial<GameState>).guildRecruit;
    delete (save.state as Partial<GameState>).guildUpgrades;
    delete (save.state as Partial<GameState>).guildNoticeBoard;
    delete (save.state as Partial<GameState>).guildSecondaryParties;
    delete (save.state as Partial<GameState>).innUpgrades;
    delete (save.state as Partial<GameState>).innKitchen;
    delete (save.state as Partial<GameState>).farm;
    delete (save.state as Partial<GameState>).worldDiscovery;

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.restingCompanionsById).toEqual({});
    expect(restored.state.highestCharacterLevelEver).toBe(30);
    expect(getPartySizeLimit(restored.state)).toBe(4);
    expect(restored.state.guildRecruit?.candidates[0]).toMatchObject({
      id: "guild-recruit-candidate-1",
      classId: "beginner",
      characterLevel: 1,
      role: "none",
      sequence: 1,
    });
    expect(restored.state.guildRecruit?.recruitSequence).toBe(1);
    expect(restored.state.guildUpgrades?.recruit.recruit_slots).toBe(1);
    expect(restored.state.guildNoticeBoard?.slots[0]).toMatchObject({
      id: "guild-notice-board-quest-1",
      status: "available",
      sequence: 1,
    });
    expect(restored.state.guildNoticeBoard?.hasSeenCurrentRefresh).toBe(false);
    expect(restored.state.guildSecondaryParties).toEqual(
      createInitialGuildSecondaryPartiesState(),
    );
    expect(restored.state.guildUpgrades?.secondaryParties.secondary_party_count).toBe(0);
    expect(restored.state.innUpgrades).toEqual(createInitialInnUpgradesState());
    expect(restored.state.innKitchen).toMatchObject({
      activeMealBuffsByCompanionId: {},
      preferencesByCompanionId: {},
      hearthFire: {
        current: 10,
      },
      pantry: {
        unlockedIngredientIds: [],
        ingredientQuantitiesById: {},
      },
      autoCookFailuresByCompanionId: {},
    });
    expect(restored.state.farm).toEqual(createInitialFarmState());
    expect(restored.state.worldDiscovery).toEqual({
      visitedMapIds: [HUB_MAP_ID],
      visitedSubzonesByMapId: {},
    });
    expect(restored.state.entities["hub-merchant"]).toMatchObject({
      kind: "npc",
      displayName: "Merchant",
      npcRole: "merchant",
    });
    expect(restored.state.entities["hub-guild-coordinator"]).toBeUndefined();
    expect(restored.state.entities["hub-tavern-keeper"]).toBeUndefined();
  });

  it("sanitizes invalid Inn Kitchen meal save entries", () => {
    const companion = createCompanion(
      "meal-companion",
      { x: 0, y: 0 },
      "meal-companion",
    );
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      partyLeaderId: companion.id,
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(HUB_MAP_ID),
      simulationTimeMs: NOW_MS,
      innKitchen: {
        activeMealBuffsByCompanionId: {
          [companion.id]: {
            recipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
            cookedAtMs: NOW_MS - 10_000,
            expiresAtMs: NOW_MS - 1,
          },
          missing: {
            recipeId: INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
            cookedAtMs: NOW_MS,
            expiresAtMs: NOW_MS + 10_000,
          },
        },
        preferencesByCompanionId: {},
        hearthFire: {
          current: 10,
          lastUpdatedAtMs: NOW_MS,
        },
        pantry: {
          unlockedIngredientIds: [],
          ingredientQuantitiesById: {},
        },
        autoCookFailuresByCompanionId: {},
      },
    });

    const save = createSavedGame(state, NOW_MS);

    expect(save.state.innKitchen).toMatchObject({
      activeMealBuffsByCompanionId: {},
      preferencesByCompanionId: {},
      hearthFire: {
        current: 10,
      },
      pantry: {
        unlockedIngredientIds: [],
        ingredientQuantitiesById: {},
      },
      autoCookFailuresByCompanionId: {},
    });
  });

  it("persists Farm state and applies restore catch-up to the holding cap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS + FARM_CARROT_GROWTH_MS * 30);
    const save = createSavedGame(
      createTestGameState({
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
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
              heldQuantity: 2,
              lastGeneratedAtMs: NOW_MS,
            },
          },
        },
      }),
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.farm?.fieldsById.carrot_field).toMatchObject({
      upgradeLevels: {
        speed: 1,
        cap: 1,
        fertilizer: 0,
      },
      heldQuantity: FARM_CARROT_BASE_HOLD_CAP,
    });
  });
});

describe("offline farming", () => {
  it("caps offline progress at thirty minutes", () => {
    const state = createWildState("fighter");
    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS * 10,
      NOW_MS,
    );

    expect(result.summary.creditedMs).toBe(MAX_OFFLINE_FARMING_MS);
    expect(result.summary.enemyKills).toBeGreaterThan(0);
    expect(result.summary.enemyKills).toBeLessThanOrEqual(960);
  });

  it("skips hub, dungeon, transition, recovery, chest, invalid, and defeated states", () => {
    const hub = createTestGameState();
    expect(getSkipReason(hub)).toContain("wild zones");

    const dungeon = {
      ...hub,
      currentMapId: SLIMEWARD_FLOOR_ONE_ID,
      map: createDebugMap(SLIMEWARD_FLOOR_ONE_ID),
    };
    expect(getSkipReason(dungeon)).toContain("wild zones");

    const transition = {
      ...createWildState("fighter"),
      activeTeleport: {
        id: "test",
        position: { x: 1, y: 1 },
        range: 2,
        sourceMapId: MAP_ONE_ID,
        targetMapId: "map-2" as const,
        triggeredBy: "player" as const,
      },
    };
    expect(getSkipReason(transition)).toContain("paused");

    const recovery = {
      ...createWildState("fighter"),
      resurrectionChannelsByHelperId: {
        "companion-1": { helperId: "companion-1", targetId: "companion-2" },
      },
    };
    expect(getSkipReason(recovery)).toContain("paused");

    const chest = {
      ...createWildState("fighter"),
      slimewardDungeon: {
        chest: {
          id: "chest",
          exitTeleportId: "exit",
          status: "opened" as const,
          position: { x: 1, y: 1 },
          isUiOpen: true,
          rolledLoot: [],
          collectedLoot: [],
          pendingLoot: [],
          inventoryFull: false,
        },
      },
    };
    expect(getSkipReason(chest)).toContain("paused");

    const defeated = {
      ...createWildState("fighter"),
      entities: Object.fromEntries(
        (Object.entries(createWildState("fighter").entities) as [string, GameEntity][]).map(([id, entity]) => [
          id,
          entity.kind === "companion" ? { ...entity, state: "dead" } : entity,
        ]),
      ),
    } as GameState;
    expect(getSkipReason(defeated)).toContain("leader");
  });

  it("uses roles so Defender plus Gatherer earns more resources", () => {
    const fighterResult = applyOfflineFarmingProgress(
      createWildState("fighter"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );
    const gathererResult = applyOfflineFarmingProgress(
      createWildState("gatherer"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(fighterResult.summary.enemyKills).toBeGreaterThan(0);
    expect(gathererResult.summary.enemyKills).toBeGreaterThan(0);
    expect(totalResources(fighterResult.summary.resourcesAdded)).toBeLessThan(
      totalResources(gathererResult.summary.resourcesAdded),
    );
  });

  it("grants estimator-based monster drops with offline rewards", () => {
    const result = applyOfflineFarmingProgress(
      createWildState("fighter"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(result.summary.enemyKills).toBeGreaterThan(0);
    expect(result.summary.lootAdded.length).toBeGreaterThan(0);
    expect(
      result.summary.lootAdded.some((loot) => loot.itemId === "slime_gel_t1"),
    ).toBe(true);
    expect(countInventoryItem(result.state.inventory, "slime_gel_t1")).toBeGreaterThan(0);
  });

  it("keeps overflow offline loot pending without blocking XP", () => {
    let state = createWildState("gatherer");

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(result.summary.enemyKills).toBeGreaterThan(0);
    expect(result.summary.xpGranted).toBeGreaterThan(0);
    expect(result.summary.resourcesAdded).toEqual([]);
    expect(result.summary.pendingLoot.length).toBeGreaterThan(0);
    expect(result.state.pendingOfflineFarmingLoot?.pendingLoot.length).toBeGreaterThan(0);
  });

  it("claims pending offline loot after inventory space is available", () => {
    let state = createWildState("fighter");

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );
    const withSpace = {
      ...result.state,
      inventory: {
        ...result.state.inventory,
        slots: [],
      },
    };
    const claimed = claimPendingOfflineFarmingLoot(withSpace, NOW_MS + 1);

    expect(claimed.summary.lootAdded.length).toBeGreaterThan(0);
    expect(claimed.summary.pendingLoot).toEqual([]);
    expect(claimed.state.pendingOfflineFarmingLoot).toBeNull();
  });

  it("preserves pending offline loot through save and restore", () => {
    let state = createWildState("fighter");

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );
    const save = createSavedGame(result.state, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.pendingOfflineFarmingLoot?.pendingLoot.length).toBeGreaterThan(0);
  });

  it("restores legacy id-only suppressed defense enemies after save and reload", () => {
    const legacyEnemyStart = mapTwoEnemyStartData.find(
      (enemyStart) => enemyStart.subzoneId === "south-east",
    );
    expect(legacyEnemyStart).toBeDefined();
    const quests = createInitialQuestStates();
    quests.hold_the_field_cache = {
      ...quests.hold_the_field_cache,
      status: "ready_to_turn_in",
      objectiveProgress: {
        ...quests.hold_the_field_cache.objectiveProgress,
        defend_old_grove_cache: {
          objectiveId: "defend_old_grove_cache",
          currentCount: 1,
          completed: true,
        },
      },
      runtime: {
        defenseStartedObjectiveIds: { defend_old_grove_cache: true },
        despawnedSubzoneEnemyIdsByObjectiveId: {
          defend_old_grove_cache: [legacyEnemyStart!.id],
        },
      },
    };
    const save = createSavedGame(
      createTestGameState({
        currentMapId: MAP_TWO_ID,
        map: createDebugMap(MAP_TWO_ID),
        quests,
      }),
      NOW_MS,
    );
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    const scheduledState = updateQuestGuideSystem(
      restored.state,
      new Set(),
      createTiming(NOW_MS, 100),
      () => 0.99,
    );
    const restoredState = updateQuestGuideSystem(
      scheduledState,
      new Set(),
      createTiming(NOW_MS + QUEST_DEFENSE_SUBZONE_ENEMY_RESTORE_DELAY_MS, 100),
      () => 0.99,
    );

    expect(restoredState.entities[legacyEnemyStart!.id]).toMatchObject({
      kind: "enemy",
      id: legacyEnemyStart!.id,
      state: "idle",
      position: legacyEnemyStart!.position,
      subzoneId: "south-east",
    });
  });
});

function createWildState(secondRole: PartyMemberRole): GameState {
  const map = createDebugMap(MAP_ONE_ID);
  const leader: Companion = {
    ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
    state: "idle",
    currentTargetId: null,
  };
  const second: Companion = {
    ...createCompanion("companion-2", { x: 16, y: 29 }, "companion-1", secondRole, 1),
    state: "follow",
    currentTargetId: "companion-1",
  };
  const baseState = createTestGameState();
  const resourceEntities = Object.fromEntries(
    map.subzones
      ?.flatMap((subzone) => subzone.resourceLocations ?? [])
      .map((resourceLocation) => [
        resourceLocation.id,
        createResource(resourceLocation.id, resourceLocation.position, {
          resourceType: resourceLocation.resourceType,
          tier: resourceLocation.tier ?? 1,
        }),
      ]) ?? [],
  );

  return sanitizeGameStateForSave({
    ...baseState,
    entities: {
      "companion-1": leader,
      "companion-2": second,
      ...resourceEntities,
    },
    currentMapId: MAP_ONE_ID,
    map,
    partyLeaderId: leader.id,
  });
}

function getSkipReason(state: GameState): string {
  return applyOfflineFarmingProgress(state, NOW_MS - MAX_OFFLINE_FARMING_MS, NOW_MS)
    .summary.skippedReason ?? "";
}

function totalResources(resources: { quantity: number }[]): number {
  return resources.reduce((total, resource) => total + resource.quantity, 0);
}

function createTiming(nowMs: number, deltaMs: number) {
  return {
    nowMs,
    deltaMs,
    deltaSeconds: deltaMs / 1000,
    frameNumber: 1,
  };
}
