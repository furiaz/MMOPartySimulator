import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aoeTargetDummyId,
  aoeTargetDummyPosition,
  createDebugMap,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  MAP_ONE_ID,
  MAP_SEVEN_ID,
  MAP_TWO_ID,
  SLIMEWARD_FLOOR_ONE_ID,
  mapTwoEnemyStartData,
} from "./debugMap";
import { createDebugTelemetryState } from "./debugTelemetry";
import {
  createCompanion,
  createEnemy,
  createResource,
  createTargetDummy,
} from "./entities";
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
  migrateSavedGameToCurrentVersion,
  restoreGameStateFromSave,
  SAVE_VERSION,
  sanitizeGameStateForSave,
  validateSavedGame,
} from "./saveGame";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, Enemy, GameEntity, ItemId, PartyMemberRole } from "./types";
import { addCurrencyToWalletState } from "./wallet";
import { createAoeCastTransform, resolveAoePattern } from "./aoePatterns";

const NOW_MS = 1_000_000;

describe("save game serialization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("validates current saves and rejects malformed or future saves", () => {
    const state = createWildState("fighter");
    const save = createSavedGame(state, NOW_MS);

    expect(validateSavedGame(save).ok).toBe(true);
    expect(validateSavedGame({ ...save, saveVersion: 999 }).ok).toBe(false);
    expect(validateSavedGame({ ...save, state: { ...save.state, entities: null } }).ok).toBe(false);
  });

  it("restores authored encounter bands and sanitizes dynamic enemy bands", () => {
    const warmaster = createEnemy(
      "zone-7-orc-warmaster-01",
      { x: 82, y: 29 },
      undefined,
      { enemyTypeId: "orc_warmaster", encounterBand: "elite" },
    );
    const dynamicChampion = createEnemy(
      "dynamic-champion",
      { x: 40, y: 30 },
      undefined,
      { encounterBand: "champion" },
    );
    const malformedBandEnemy = {
      ...createEnemy("malformed-band", { x: 45, y: 30 }),
      encounterBand: "legendary" as Enemy["encounterBand"],
    };
    const state = {
      ...createTestGameState(),
      currentMapId: MAP_SEVEN_ID,
      map: createDebugMap(MAP_SEVEN_ID),
      entities: {
        [warmaster.id]: warmaster,
        [dynamicChampion.id]: dynamicChampion,
        [malformedBandEnemy.id]: malformedBandEnemy,
      },
    };

    const sanitized = sanitizeGameStateForSave(state, NOW_MS);

    expect(sanitized.entities[warmaster.id]).toMatchObject({
      encounterBand: "boss",
    });
    expect(sanitized.entities[dynamicChampion.id]).toMatchObject({
      encounterBand: "champion",
    });
    expect(sanitized.entities[malformedBandEnemy.id]).toMatchObject({
      encounterBand: "standard",
    });

    const legacySave = createSavedGame(state, NOW_MS);
    const savedWarmaster = legacySave.state.entities[warmaster.id];
    if (savedWarmaster?.kind === "enemy") {
      delete (savedWarmaster as Partial<Enemy>).encounterBand;
    }
    const restored = restoreGameStateFromSave(legacySave);

    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.state.entities[warmaster.id]).toMatchObject({
        encounterBand: "boss",
      });
    }
  });

  it("migrates every persisted legacy item container before validation", () => {
    const migrated = migrateSavedGameToCurrentVersion({
      saveVersion: 1,
      savedAtMs: NOW_MS,
      state: {
        inventory: {
          capacity: 3,
          slots: [{ itemId: "holy_mace", quantity: 2 }],
        },
        bank: {
          slots: [{ itemId: "sanctified_mace", quantity: 3, slotIndex: 4 }],
        },
        pendingOfflineFarmingLoot: {
          rolledLoot: [{ itemId: "dawn_mace", quantity: 1 }],
          collectedLoot: [{ itemId: "holy_lantern", quantity: 1 }],
          pendingLoot: [{ itemId: "bright_lantern", quantity: 1 }],
        },
        slimewardDungeon: {
          chest: {
            rolledLoot: [{ itemId: "radiant_lantern", quantity: 1 }],
            collectedLoot: [{ itemId: "holy_mace", quantity: 1 }],
            pendingLoot: [{ itemId: "sanctified_mace", quantity: 1 }],
          },
        },
        guildRecruit: {
          candidates: [{ equipmentItemIds: ["holy_lantern", "dawn_mace"] }],
        },
        guildSecondaryParties: {
          preview: { expectedDrop: { itemId: "bright_lantern" } },
          pendingResult: {
            loot: [{ itemId: "radiant_lantern", quantity: 1 }],
            resources: [{ itemId: "holy_mace", quantity: 1 }],
          },
        },
      },
    });

    expect(migrated).toMatchObject({
      saveVersion: SAVE_VERSION,
      state: {
        inventory: {
          slots: [{ itemId: "guard_mace", quantity: 2 }],
        },
        bank: {
          slots: [{ itemId: "bastion_mace", quantity: 3, slotIndex: 4 }],
        },
        pendingOfflineFarmingLoot: {
          rolledLoot: [{ itemId: "ironhold_mace", quantity: 1 }],
          collectedLoot: [{ itemId: "rune_lantern", quantity: 1 }],
          pendingLoot: [{ itemId: "etched_rune_lantern", quantity: 1 }],
        },
        slimewardDungeon: {
          chest: {
            rolledLoot: [{ itemId: "deep_rune_lantern", quantity: 1 }],
            collectedLoot: [{ itemId: "guard_mace", quantity: 1 }],
            pendingLoot: [{ itemId: "bastion_mace", quantity: 1 }],
          },
        },
        guildRecruit: {
          candidates: [
            { equipmentItemIds: ["rune_lantern", "ironhold_mace"] },
          ],
        },
        guildSecondaryParties: {
          preview: { expectedDrop: { itemId: "etched_rune_lantern" } },
          pendingResult: {
            loot: [{ itemId: "deep_rune_lantern", quantity: 1 }],
            resources: [{ itemId: "guard_mace", quantity: 1 }],
          },
        },
      },
    });
  });

  it("grants matching missing offhands to active and resting v1 companions once", () => {
    const blade = {
      ...createCompanion(
        "blade",
        { x: 14, y: 29 },
        "blade",
        "fighter",
        0,
        "blade",
      ),
      characterLevel: 15,
      equipment: {
        ...createCompanion("template", { x: 0, y: 0 }, "template").equipment,
        mainHand: "steel_sword" as const,
        offhand: null,
      },
    };
    const hunter = {
      ...createCompanion(
        "hunter",
        { x: 15, y: 29 },
        "blade",
        "fighter",
        1,
        "hunter",
      ),
      equipment: {
        ...createCompanion("template", { x: 0, y: 0 }, "template").equipment,
        mainHand: "training_sword" as const,
        offhand: null,
      },
    };
    const occupiedBlade = {
      ...createCompanion(
        "occupied-blade",
        { x: 16, y: 29 },
        "blade",
        "fighter",
        2,
        "blade",
      ),
      equipment: {
        ...createCompanion("template", { x: 0, y: 0 }, "template").equipment,
        mainHand: "iron_sword" as const,
        offhand: "wooden_shield" as const,
      },
    };
    const beast = {
      ...createCompanion(
        "beast",
        { x: 0, y: 0 },
        "beast",
        "fighter",
        0,
        "beast",
      ),
      equipment: {
        ...createCompanion("template", { x: 0, y: 0 }, "template").equipment,
        mainHand: "rending_claws" as const,
        offhand: null,
      },
    };
    const elementalist = {
      ...createCompanion(
        "elementalist",
        { x: 0, y: 0 },
        "elementalist",
        "fighter",
        0,
        "elementalist",
      ),
      equipment: {
        ...createCompanion("template", { x: 0, y: 0 }, "template").equipment,
        mainHand: "adept_orb" as const,
        offhand: null,
      },
    };
    const currentSave = createSavedGame(
      createTestGameState({
        entities: {
          [blade.id]: blade,
          [hunter.id]: hunter,
          [occupiedBlade.id]: occupiedBlade,
        },
        restingCompanionsById: {
          [beast.id]: beast,
          [elementalist.id]: elementalist,
        },
        partyLeaderId: blade.id,
      }),
      NOW_MS,
    );
    const validation = validateSavedGame({ ...currentSave, saveVersion: 1 });

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    expect(validation.save.saveVersion).toBe(SAVE_VERSION);
    expect((validation.save.state.entities[blade.id] as Companion).equipment.offhand)
      .toBe("ritual_dagger");
    expect((validation.save.state.entities[hunter.id] as Companion).equipment.offhand)
      .toBe("leather_quiver");
    expect(
      (validation.save.state.entities[occupiedBlade.id] as Companion).equipment.offhand,
    ).toBe("wooden_shield");
    expect(validation.save.state.restingCompanionsById?.[beast.id]?.equipment.offhand)
      .toBe("rending_claws");
    expect(
      validation.save.state.restingCompanionsById?.[elementalist.id]?.equipment.offhand,
    ).toBe("adept_orb");

    const currentVersionBlade = {
      ...(validation.save.state.entities[blade.id] as Companion),
      equipment: {
        ...(validation.save.state.entities[blade.id] as Companion).equipment,
        offhand: null,
      },
    };
    const currentVersionValidation = validateSavedGame({
      ...validation.save,
      state: {
        ...validation.save.state,
        entities: {
          ...validation.save.state.entities,
          [blade.id]: currentVersionBlade,
        },
      },
    });

    expect(currentVersionValidation.ok).toBe(true);
    if (currentVersionValidation.ok) {
      expect(
        (currentVersionValidation.save.state.entities[blade.id] as Companion)
          .equipment.offhand,
      ).toBeNull();
    }
  });

  it("migrates version-2 wild enemy ids and every durable reference", () => {
    const firstEnemyId = mapTwoEnemyStartData[0].id;
    const secondEnemyId = mapTwoEnemyStartData[1].id;
    const firstEnemy = createEnemy(
      "test-enemy",
      mapTwoEnemyStartData[0].position,
      undefined,
      { enemyTypeId: mapTwoEnemyStartData[0].enemyTypeId },
    );
    const secondEnemy = createEnemy(
      "test-enemy-2",
      mapTwoEnemyStartData[1].position,
      undefined,
      { enemyTypeId: mapTwoEnemyStartData[1].enemyTypeId },
    );
    const migrated = migrateSavedGameToCurrentVersion({
      saveVersion: 2,
      savedAtMs: NOW_MS,
      state: {
        currentMapId: MAP_TWO_ID,
        entities: {
          "test-enemy": firstEnemy,
          "test-enemy-2": secondEnemy,
        },
        flaskRechargeCountedEnemyDefeats: {
          "test-enemy": NOW_MS,
          "test-enemy-2": NOW_MS + 1,
        },
        quests: {
          hold_the_field_cache: {
            questId: "hold_the_field_cache",
            runtime: {
              despawnedSubzoneEnemyIdsByObjectiveId: {
                defend_old_grove_cache: ["test-enemy"],
              },
              suppressedSubzoneEnemiesByObjectiveId: {
                defend_old_grove_cache: [secondEnemy],
              },
              ambientEnemySuppressionsByGroupId: {
                defend_old_grove_cache: {
                  targetMapId: MAP_TWO_ID,
                  scope: "subzone",
                  targetSubzoneId: "south-east",
                  restoreDelayMs: 3_000,
                  variantPolicy: "reroll",
                  activeObjectiveIds: ["defend_old_grove_cache"],
                  enemySnapshots: [firstEnemy],
                },
              },
            },
          },
        },
      },
    });

    expect(migrated).toMatchObject({
      saveVersion: SAVE_VERSION,
      state: {
        entities: {
          [firstEnemyId]: { id: firstEnemyId },
          [secondEnemyId]: { id: secondEnemyId },
        },
        flaskRechargeCountedEnemyDefeats: {
          [firstEnemyId]: NOW_MS,
          [secondEnemyId]: NOW_MS + 1,
        },
        quests: {
          hold_the_field_cache: {
            runtime: {
              despawnedSubzoneEnemyIdsByObjectiveId: {
                defend_old_grove_cache: [firstEnemyId],
              },
              suppressedSubzoneEnemiesByObjectiveId: {
                defend_old_grove_cache: [{ id: secondEnemyId }],
              },
              ambientEnemySuppressionsByGroupId: {
                defend_old_grove_cache: {
                  enemySnapshots: [{ id: firstEnemyId }],
                },
              },
            },
          },
        },
      },
    });
  });

  it("chains version-1 item and wild-enemy migrations into version 3", () => {
    const migrated = migrateSavedGameToCurrentVersion({
      saveVersion: 1,
      savedAtMs: NOW_MS,
      state: {
        currentMapId: MAP_TWO_ID,
        entities: {
          "test-enemy": createEnemy(
            "test-enemy",
            mapTwoEnemyStartData[0].position,
            undefined,
            { enemyTypeId: mapTwoEnemyStartData[0].enemyTypeId },
          ),
        },
        inventory: {
          capacity: 1,
          slots: [{ itemId: "holy_mace", quantity: 1 }],
        },
      },
    });

    expect(migrated).toMatchObject({
      saveVersion: SAVE_VERSION,
      state: {
        entities: {
          [mapTwoEnemyStartData[0].id]: {
            id: mapTwoEnemyStartData[0].id,
          },
        },
        inventory: {
          slots: [{ itemId: "guard_mace", quantity: 1 }],
        },
      },
    });
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
            area: resolveAoePattern(
              { type: "circle", radius: 2 },
              createAoeCastTransform({ x: 14, y: 29 }, { x: 14, y: 29 }),
            ),
            visualIntent: "partyOffensive",
            damageType: "physical",
            powerMultiplier: 0.5,
            bindDurationMs: 1000,
            startedAt: NOW_MS,
            channelEndsAt: NOW_MS + 200,
          },
        },
        aoeDummyPatternSequenceIndex: 5,
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
    expect(restored.state.aoeDummyPatternSequenceIndex).toBe(0);
    expect(restored.state.debugTelemetry).toBeUndefined();
  });

  it("clears a quest start-speech cue on restore without replaying the started defense", () => {
    const quests = createInitialQuestStates();
    const causeway = quests.open_wolf_causeway;
    quests.open_wolf_causeway = {
      ...causeway,
      status: "active",
      objectiveProgress: {
        ...causeway.objectiveProgress,
        escort_causeway_worker: {
          objectiveId: "escort_causeway_worker",
          currentCount: 1,
          completed: true,
        },
      },
      runtime: {
        defenseStartedObjectiveIds: {
          defend_wolf_causeway: true,
        },
      },
    };
    const state = createTestGameState({
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      quests,
      questNpcSpeechCue: {
        id: "open_wolf_causeway:defend_wolf_causeway:999",
        mapId: MAP_TWO_ID,
        npcId: "map-2-causeway-worker",
        text: "Its an ambush! Protect me!",
        createdAt: NOW_MS - 1_000,
      },
    });
    const save = createSavedGame(state, NOW_MS);

    expect(save.state.questNpcSpeechCue).toBeUndefined();
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.questNpcSpeechCue).toBeUndefined();
    expect(
      restored.state.quests.open_wolf_causeway.runtime
        ?.defenseStartedObjectiveIds?.defend_wolf_causeway,
    ).toBe(true);

    const resumedState = updateQuestGuideSystem(
      restored.state,
      new Set(),
      {
        nowMs: NOW_MS + 100,
        deltaMs: 100,
        deltaSeconds: 0.1,
        frameNumber: 1,
      },
    );
    expect(resumedState.questNpcSpeechCue).toBeUndefined();
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

  it("moves a saved Hub 1 AoE dummy to its current canonical position", () => {
    const savedPosition = { x: 55, y: 8 };
    const dummy = createTargetDummy(aoeTargetDummyId, savedPosition);
    const save = createSavedGame(
      createTestGameState({
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
        entities: { [dummy.id]: dummy },
      }),
      NOW_MS,
    );

    expect(save.state.entities[aoeTargetDummyId]).toMatchObject({
      position: savedPosition,
      homePosition: savedPosition,
    });

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.state.entities[aoeTargetDummyId]).toMatchObject({
      position: aoeTargetDummyPosition,
      homePosition: aoeTargetDummyPosition,
    });
  });

  it("persists the equipment drop popup threshold and defaults legacy or invalid values", () => {
    const state = {
      ...createWildState("fighter"),
      equipmentDropPopupThreshold: "epic" as const,
    };
    const save = createSavedGame(state, NOW_MS);
    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.equipmentDropPopupThreshold).toBe("epic");

    const legacyRestore = restoreGameStateFromSave({
      ...save,
      state: {
        ...save.state,
        equipmentDropPopupThreshold: undefined,
      },
    });
    const invalidRestore = restoreGameStateFromSave({
      ...save,
      state: {
        ...save.state,
        equipmentDropPopupThreshold:
          "mythic" as GameState["equipmentDropPopupThreshold"],
      },
    });

    expect(legacyRestore.ok).toBe(true);
    expect(invalidRestore.ok).toBe(true);
    if (legacyRestore.ok && invalidRestore.ok) {
      expect(legacyRestore.state.equipmentDropPopupThreshold).toBe("common");
      expect(invalidRestore.state.equipmentDropPopupThreshold).toBe("common");
    }
  });

  it("persists the party-size guide state and defaults legacy or invalid values", () => {
    const save = createSavedGame(
      {
        ...createWildState("fighter"),
        partySizeGrowthGuideViewed: true,
      },
      NOW_MS,
    );
    const restored = restoreGameStateFromSave(save);

    expect(save.state.partySizeGrowthGuideViewed).toBe(true);
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.state.partySizeGrowthGuideViewed).toBe(true);

    const legacyRestore = restoreGameStateFromSave({
      ...save,
      state: {
        ...save.state,
        partySizeGrowthGuideViewed: undefined,
      },
    });
    const invalidRestore = restoreGameStateFromSave({
      ...save,
      state: {
        ...save.state,
        partySizeGrowthGuideViewed: "yes" as unknown as boolean,
      },
    });

    expect(legacyRestore.ok).toBe(true);
    expect(invalidRestore.ok).toBe(true);
    if (legacyRestore.ok && invalidRestore.ok) {
      expect(legacyRestore.state.partySizeGrowthGuideViewed).toBe(false);
      expect(invalidRestore.state.partySizeGrowthGuideViewed).toBe(false);
    }
  });

  it("preserves resting companions and highest-ever level through save restore", () => {
    const leader: Companion = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
      characterLevel: 19,
      characterXp: 5302,
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
    expect(restored.state.entities[leader.id]).toMatchObject({
      id: leader.id,
      characterLevel: 19,
      characterXp: 5302,
    });
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
      starterContractAccepted: true,
      nextRefreshAtMs: NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
      slots: [
        {
          ...createInitialGuildNoticeBoardState(NOW_MS).slots[0]!,
          id: "guild-notice-board-quest-5",
          title: "Ashwatch Field Orders",
          category: "extermination" as const,
          zoneDisplayName: "Ashwatch",
          description: undefined,
          isStarterContract: undefined,
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

  it("skips onboarding for an already-eligible legacy save without replacing Board progress", () => {
    const leader = {
      ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1"),
      classId: "blade" as const,
      characterLevel: 10,
    };
    const quests = createInitialQuestStates();
    quests.azure_trial = {
      ...quests.azure_trial,
      status: "completed",
      completedCycle: 1,
      rewardClaimedCycle: 1,
    };
    const legacyBoard = createLegacyGuildNoticeBoardState();
    const save = createSavedGame(
      createTestGameState({
        entities: { [leader.id]: leader },
        partyLeaderId: leader.id,
        quests,
        guildNoticeBoard: legacyBoard,
      }),
      NOW_MS,
    );
    const legacyQuests = save.state.quests as Partial<typeof save.state.quests>;
    delete legacyQuests.orders_from_the_guild;
    delete legacyQuests.break_the_ash_camp;
    save.state.guildNoticeBoard = legacyBoard;

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.state.quests.orders_from_the_guild.status).toBe("completed");
    expect(restored.state.quests.break_the_ash_camp.status).toBe("available");
    expect(restored.state.guildNoticeBoard?.slots).toHaveLength(1);
    expect(restored.state.guildNoticeBoard?.slots[0]?.id).toBe(
      "guild-notice-board-quest-5",
    );
    expect(restored.state.guildNoticeBoard?.starterContractAccepted).toBe(false);
  });

  it("keeps onboarding for a pre-eligibility legacy save and preserves its Board slot", () => {
    const quests = createInitialQuestStates();
    quests.azure_trial = {
      ...quests.azure_trial,
      status: "completed",
      completedCycle: 1,
      rewardClaimedCycle: 1,
    };
    const legacyBoard = createLegacyGuildNoticeBoardState();
    const save = createSavedGame(
      createTestGameState({
        quests,
        guildNoticeBoard: legacyBoard,
      }),
      NOW_MS,
    );
    const legacyQuests = save.state.quests as Partial<typeof save.state.quests>;
    delete legacyQuests.orders_from_the_guild;
    delete legacyQuests.break_the_ash_camp;
    save.state.guildNoticeBoard = legacyBoard;

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.state.quests.orders_from_the_guild.status).toBe("locked");
    expect(restored.state.guildNoticeBoard?.slots.map((slot) => slot?.id)).toEqual([
      "guild-notice-board-starter-ash-goblin-encampment",
      "guild-notice-board-quest-5",
    ]);
  });

  it("unlocks Into the Briar Burrows when an older save completed Break the Ash Camp", () => {
    const quests = createInitialQuestStates();
    quests.break_the_ash_camp = {
      ...quests.break_the_ash_camp,
      status: "completed",
      completedCycle: 1,
      rewardClaimedCycle: 1,
    };
    const save = createSavedGame(createTestGameState({ quests }), NOW_MS);
    delete (save.state.quests as Partial<typeof save.state.quests>)
      .into_the_briar_burrows;

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.state.quests.into_the_briar_burrows.status).toBe(
      "available",
    );
  });

  it("restores Briar Burrows kill progress and reconciles current ownership and party size", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 14, y: 29 },
      "companion-1",
    );
    const follower = createCompanion(
      "companion-2",
      { x: 15, y: 29 },
      leader.id,
    );
    const thirdCompanion = {
      ...createCompanion("companion-3", { x: 16, y: 29 }, leader.id),
      state: "dead" as const,
      health: 0,
    };
    const quests = createInitialQuestStates();
    quests.into_the_briar_burrows = {
      ...quests.into_the_briar_burrows,
      status: "active",
      objectiveProgress: {
        ...quests.into_the_briar_burrows.objectiveProgress,
        defeat_briar_burrows_enemies: {
          objectiveId: "defeat_briar_burrows_enemies",
          currentCount: 123,
          completed: false,
        },
      },
    };
    const baseState = createTestGameState();
    const save = createSavedGame(
      createTestGameState({
        entities: {
          [leader.id]: leader,
          [follower.id]: follower,
          [thirdCompanion.id]: thirdCompanion,
        },
        partyLeaderId: leader.id,
        quests,
        livestock: {
          ...baseState.livestock!,
          ownedCreaturesById: {
            ...baseState.livestock!.ownedCreaturesById,
            tin_crawler: 1,
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
    expect(
      restored.state.quests.into_the_briar_burrows.objectiveProgress
        .defeat_briar_burrows_enemies.currentCount,
    ).toBe(123);
    expect(
      restored.state.quests.into_the_briar_burrows.objectiveProgress
        .find_tin_crawler_hatchling,
    ).toMatchObject({ currentCount: 1, completed: true });
    expect(
      restored.state.quests.into_the_briar_burrows.objectiveProgress
        .assemble_three_companions,
    ).toMatchObject({ currentCount: 3, completed: true });
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
      id: "guild-notice-board-starter-ash-goblin-encampment",
      status: "available",
      sequence: 0,
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

function createLegacyGuildNoticeBoardState() {
  const initial = createInitialGuildNoticeBoardState(NOW_MS);

  return {
    ...initial,
    questSequence: 5,
    starterContractAccepted: undefined,
    slots: [
      {
        ...initial.slots[0]!,
        id: "guild-notice-board-quest-5",
        title: "Ashwatch Field Orders",
        category: "extermination" as const,
        zoneDisplayName: "Ashwatch",
        description: undefined,
        isStarterContract: undefined,
        sequence: 5,
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
}

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
