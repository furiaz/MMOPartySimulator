import { describe, expect, it } from "vitest";

import { createCompanion, createEnemy, createNpc } from "./entities";
import {
  companionIds,
  createDebugMap,
  hubCompanionStartPositions,
  slimewardCampArrivalPositions,
  SLIMEWARD_CAMP_ID,
  TELEPORTER_ID,
} from "./debugMap";
import {
  DEBUG_ADD_ENEMIES_MAX_COUNT,
  debugAddCompanionToParty,
  debugAddCraftingMaterialsAndEnemyDropsToInventory,
  debugAddEnemiesToCurrentSubzone,
  debugAddOwnedLivestockCreature,
  debugAddPrototypeFlasksToInventory,
  debugAddTestCrowns,
  debugApplyCompanionInfiniteHealth,
  debugFinishCurrentQuest,
  debugForceSuperiorEnemyInCurrentSubzone,
  debugCycleCompanionClass,
  debugKillCompanion,
  debugLevelUpCompanion,
  debugLevelUpAllCompanions,
  debugRemoveDebugEnemies,
  debugRestoreCompanionHealth,
  debugSummonEnemy,
  debugTeleportToSlimewardCamp,
  debugToggleCompanionInfiniteHealth,
  debugTurnInCurrentQuest,
  debugUnlockFarmCrop,
  debugUnlockTownServices,
  getDebugEnemySummonGroups,
  isDebugSummonableEnemyType,
} from "./debugTools";
import { createInitialGameState } from "./createInitialGameState";
import { isSuperiorEnemy } from "./enemyVariants";
import {
  FARM_POTATO_CROP_ID,
  getFarmCropDefinition,
  isFarmCropUnlocked,
} from "./farm";
import { countInventoryItem, createEmptyPartyInventory } from "./inventory";
import { MAX_CHARACTER_LEVEL } from "./leveling";
import {
  LIVESTOCK_WOLF_CREATURE_ID,
  getLivestockCreatureDefinition,
  getLivestockState,
} from "./livestock";
import { createInitialQuestStates } from "./questSystem";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS } from "./state";
import { isPositionInsideSubzone } from "./subzoneSystem";
import { createTestGameState } from "./testState";
import { isTeleportWorking } from "./teleportState";
import { getCurrencyBalance } from "./wallet";
import type { Enemy } from "./types";
import type { QuestId, QuestState } from "./questTypes";

describe("debugAddCompanionToParty", () => {
  it("adds the fifth fixed companion and stops when the roster is full", () => {
    let state = createInitialGameState();

    for (let additionCount = 0; additionCount < 3; additionCount += 1) {
      state = debugAddCompanionToParty(
        state,
        companionIds,
        state.partyLeaderId,
        hubCompanionStartPositions,
      );
    }

    expect(
      Object.values(state.entities).filter(
        (entity) => entity.kind === "companion",
      ),
    ).toHaveLength(5);
    expect(state.entities[companionIds[4]]).toMatchObject({
      kind: "companion",
      partyOrder: 4,
      position: hubCompanionStartPositions[4],
    });
    expect(
      debugAddCompanionToParty(
        state,
        companionIds,
        state.partyLeaderId,
        hubCompanionStartPositions,
      ),
    ).toBe(state);
  });
});

describe("debugTeleportToSlimewardCamp", () => {
  it("moves the party to Slimeward Camp and clears map-local runtime", () => {
    const companions = companionIds.map((companionId, index) =>
      createCompanion(companionId, { x: 5 + index, y: 5 }, companionId),
    );
    const state = createTestGameState({
      partyLeaderId: companionIds[0],
      entities: Object.fromEntries(
        companions.map((companion) => [companion.id, companion]),
      ),
      activeTeleport: {
        id: TELEPORTER_ID,
        position: { x: 10, y: 10 },
        range: 5,
        sourceMapId: "map-1",
        targetMapId: "map-2",
        triggeredBy: "player",
      },
      worldTravelTargetMapId: "map-4",
      combatFeedbackEvents: [
        {
          id: "hit-1",
          entityId: companionIds[0],
          type: "damage",
          text: "1",
          createdAt: 0,
          expiresAt: 1,
        },
      ],
      dropVisualEvents: [
        {
          id: "drop-1",
          enemyId: "enemy-1",
          itemId: "slime_gel_t1",
          quantity: 1,
          dropChance: 1,
          position: { x: 1, y: 1 },
          createdAt: 0,
          expiresAt: 1,
        },
      ],
    });

    const nextState = debugTeleportToSlimewardCamp(state);

    expect(nextState.currentMapId).toBe(SLIMEWARD_CAMP_ID);
    expect(nextState.map?.id).toBe(SLIMEWARD_CAMP_ID);
    expect(nextState.activeTeleport).toBeNull();
    expect(nextState.worldTravelTargetMapId).toBeNull();
    expect(nextState.combatFeedbackEvents).toEqual([]);
    expect(nextState.dropVisualEvents).toEqual([]);
    expect(nextState.entities[companionIds[0]]?.position).toEqual(
      slimewardCampArrivalPositions[0],
    );
  });
});

describe("debugForceSuperiorEnemyInCurrentSubzone", () => {
  it("turns the closest normal enemy in the leader subzone into a Superior enemy", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const closestEnemy = createEnemy("enemy-close", { x: 12, y: 10 }, "passive", {
      enemyTypeId: "green_slime",
      subzoneId: "shore-fringe",
    });
    const fartherEnemy = createEnemy("enemy-far", { x: 30, y: 10 }, "passive", {
      enemyTypeId: "green_slime",
      subzoneId: "shore-fringe",
    });
    const otherSubzoneEnemy = createEnemy(
      "enemy-other-subzone",
      { x: 60, y: 10 },
      "passive",
      {
        enemyTypeId: "cave_bat",
        subzoneId: "mossy-glade",
      },
    );
    const state = startDebugTelemetryRecording(
      createTestGameState({
        currentMapId: "map-1",
        map: createDebugMap("map-1"),
        partyLeaderId: leader.id,
        entities: {
          [leader.id]: leader,
          [closestEnemy.id]: closestEnemy,
          [fartherEnemy.id]: fartherEnemy,
          [otherSubzoneEnemy.id]: otherSubzoneEnemy,
        },
      }),
    );

    const nextState = debugForceSuperiorEnemyInCurrentSubzone(state);
    const transformedEnemy = nextState.entities[closestEnemy.id];
    const untouchedEnemy = nextState.entities[fartherEnemy.id];
    const untouchedOtherSubzoneEnemy = nextState.entities[otherSubzoneEnemy.id];

    expect(transformedEnemy?.kind).toBe("enemy");
    expect(transformedEnemy?.kind === "enemy" && isSuperiorEnemy(transformedEnemy)).toBe(true);
    expect(transformedEnemy?.kind === "enemy" ? transformedEnemy.maxHealth : 0).toBe(30);
    expect(transformedEnemy?.kind === "enemy" ? transformedEnemy.health : 0).toBe(30);
    expect(untouchedEnemy?.kind === "enemy" && isSuperiorEnemy(untouchedEnemy)).toBe(false);
    expect(
      untouchedOtherSubzoneEnemy?.kind === "enemy" &&
        isSuperiorEnemy(untouchedOtherSubzoneEnemy),
    ).toBe(false);
    expect(nextState.debugTelemetry?.events.at(-1)).toMatchObject({
      type: "superior_enemy_spawned",
      entityId: closestEnemy.id,
      enemyVariant: "superior",
      reason: "debug_force",
    });
  });

  it("does not create a second Superior enemy in the leader subzone", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const existingSuperior = createEnemy(
      "enemy-superior",
      { x: 12, y: 10 },
      "passive",
      {
        enemyTypeId: "green_slime",
        subzoneId: "shore-fringe",
        variant: "superior",
      },
    );
    const normalEnemy = createEnemy("enemy-normal", { x: 14, y: 10 }, "passive", {
      enemyTypeId: "green_slime",
      subzoneId: "shore-fringe",
    });
    const state = createTestGameState({
      currentMapId: "map-1",
      map: createDebugMap("map-1"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [existingSuperior.id]: existingSuperior,
        [normalEnemy.id]: normalEnemy,
      },
    });

    const nextState = debugForceSuperiorEnemyInCurrentSubzone(state);

    expect(nextState.entities[normalEnemy.id]).toEqual(normalEnemy);
  });

  it("does nothing in the hub", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const enemy = createEnemy("enemy-normal", { x: 12, y: 10 }, "passive", {
      enemyTypeId: "green_slime",
      subzoneId: "shore-fringe",
    });
    const state = createTestGameState({
      currentMapId: "hub",
      map: createDebugMap("hub"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [enemy.id]: enemy,
      },
    });

    expect(debugForceSuperiorEnemyInCurrentSubzone(state)).toBe(state);
  });
});

describe("debugAddEnemiesToCurrentSubzone", () => {
  it("adds enemies using the leader's current subzone setup", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const map = createDebugMap("map-1");
    const state = createTestGameState({
      currentMapId: "map-1",
      map,
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
      },
    });

    const nextState = debugAddEnemiesToCurrentSubzone(state, 3);
    const enemies = getDebugSubzoneEnemies(nextState);
    const subzone = map.subzones?.find((candidate) => candidate.id === "shore-fringe");

    expect(enemies).toHaveLength(3);
    expect(subzone).toBeDefined();

    for (const enemy of enemies) {
      expect(enemy.debugSpawn).toBe(true);
      expect(enemy.subzoneId).toBe("shore-fringe");
      expect(enemy.enemyTypeId).toBe("green_slime");
      expect(enemy.level).toBe(1);
      expect(enemy.encounterAreaId).toBeTruthy();
      expect(subzone && isPositionInsideSubzone(enemy.position, subzone)).toBe(true);
    }
  });

  it("cycles current subzone enemy types and level range", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const state = createTestGameState({
      currentMapId: "map-2",
      map: createDebugMap("map-2"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
      },
    });

    const nextState = debugAddEnemiesToCurrentSubzone(state, 3);
    const enemies = getDebugSubzoneEnemies(nextState);

    expect(enemies.map((enemy) => enemy.enemyTypeId)).toEqual([
      "forest_spider",
      "goblin_scout",
      "forest_spider",
    ]);
    expect(enemies.map((enemy) => enemy.level)).toEqual([3, 4, 3]);
  });

  it("ignores invalid counts and maps without a current subzone", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const state = createTestGameState({
      currentMapId: "hub",
      map: createDebugMap("hub"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
      },
    });

    expect(debugAddEnemiesToCurrentSubzone(state, Number.NaN)).toBe(state);
    expect(debugAddEnemiesToCurrentSubzone(state, 2)).toBe(state);
  });

  it("clamps large debug enemy counts", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const state = createTestGameState({
      currentMapId: "map-1",
      map: createDebugMap("map-1"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
      },
    });

    const nextState = debugAddEnemiesToCurrentSubzone(
      state,
      DEBUG_ADD_ENEMIES_MAX_COUNT + 25,
    );

    expect(getDebugSubzoneEnemies(nextState)).toHaveLength(
      DEBUG_ADD_ENEMIES_MAX_COUNT,
    );
  });

  it("removes only debug-spawned enemies", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const normalEnemy = createEnemy(
      "normal-enemy",
      { x: 12, y: 10 },
      "passive",
      {
        enemyTypeId: "green_slime",
        subzoneId: "shore-fringe",
      },
    );
    const legacyDebugEnemy = createEnemy(
      "debug-subzone-enemy-999",
      { x: 14, y: 10 },
      "passive",
      {
        enemyTypeId: "green_slime",
        subzoneId: "shore-fringe",
      },
    );
    const state = createTestGameState({
      currentMapId: "map-1",
      map: createDebugMap("map-1"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [normalEnemy.id]: normalEnemy,
        [legacyDebugEnemy.id]: legacyDebugEnemy,
      },
      followTrailsByEntityId: {
        [leader.id]: [],
        [normalEnemy.id]: [],
        [legacyDebugEnemy.id]: [],
      },
    });
    const stateWithDebugEnemies = debugAddEnemiesToCurrentSubzone(state, 2);

    const nextState = debugRemoveDebugEnemies(stateWithDebugEnemies);

    expect(nextState.entities[normalEnemy.id]).toEqual(normalEnemy);
    expect(nextState.entities[legacyDebugEnemy.id]).toBeUndefined();
    expect(getDebugSubzoneEnemies(nextState)).toHaveLength(0);
    expect(nextState.followTrailsByEntityId[legacyDebugEnemy.id]).toBeUndefined();
  });
});

describe("debugSummonEnemy", () => {
  it("offers normal map enemies by map while excluding The Azure Mass", () => {
    const groups = getDebugEnemySummonGroups();
    const enemyIds = groups.flatMap((group) =>
      group.enemies.map((enemy) => enemy.id),
    );

    expect(groups.length).toBeGreaterThan(0);
    expect(enemyIds).toContain("green_slime");
    expect(enemyIds).toContain("orc_warmaster");
    expect(enemyIds).not.toContain("azure_mass");
    expect(isDebugSummonableEnemyType("azure_mass")).toBe(false);
  });

  it("summons one selected enemy at its default level in the current subzone", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const map = createDebugMap("map-1");
    const state = createTestGameState({
      currentMapId: "map-1",
      map,
      partyLeaderId: leader.id,
      entities: { [leader.id]: leader },
    });

    const nextState = debugSummonEnemy(state, "tin_crawler");
    const enemies = getDebugSubzoneEnemies(nextState);

    expect(enemies).toHaveLength(1);
    expect(enemies[0]).toMatchObject({
      id: "debug-subzone-enemy-1",
      enemyTypeId: "tin_crawler",
      level: 13,
      subzoneId: "shore-fringe",
      debugSpawn: true,
    });
    expect(enemies[0].questSpawn).toBeUndefined();
    expect(enemies[0].isTargetDummy).toBeUndefined();
  });

  it("rejects the dungeon boss and removes a summoned enemy by its stable prefix", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const state = createTestGameState({
      currentMapId: "map-1",
      map: createDebugMap("map-1"),
      partyLeaderId: leader.id,
      entities: { [leader.id]: leader },
    });

    expect(debugSummonEnemy(state, "azure_mass")).toBe(state);

    const summoned = debugSummonEnemy(state, "green_slime");
    const enemy = getDebugSubzoneEnemies(summoned)[0];
    const respawnedState = {
      ...summoned,
      entities: {
        ...summoned.entities,
        [enemy.id]: { ...enemy, debugSpawn: undefined },
      },
    };

    expect(debugRemoveDebugEnemies(respawnedState).entities[enemy.id]).toBeUndefined();
  });
});

describe("town debug setup tools", () => {
  it("completes the Town prerequisite without granting quest rewards", () => {
    const state = createTestGameState();

    const nextState = debugUnlockTownServices(state);

    expect(nextState.quests.azure_trial.status).toBe("completed");
    expect(nextState.quests.azure_trial.completedCycle).toBe(1);
    expect(nextState.quests.azure_trial.rewardClaimedCycle).toBe(1);
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(0);
    expect(nextState.inventory).toEqual(state.inventory);
    expect(nextState.newsBroadcasts).toEqual([]);
  });

  it("unlocks a selected crop through its canonical Farm path", () => {
    const state = createTestGameState();
    const crop = getFarmCropDefinition(FARM_POTATO_CROP_ID);

    const nextState = debugUnlockFarmCrop(state, FARM_POTATO_CROP_ID, 1_000);

    expect(isFarmCropUnlocked(nextState, FARM_POTATO_CROP_ID)).toBe(true);
    expect(nextState.farm?.fieldsById[crop.fieldId]).toBeDefined();
    expect(crop.seedKeyItemId && nextState.keyItemsById?.[crop.seedKeyItemId]).toBe(1);
    expect(debugUnlockFarmCrop(nextState, FARM_POTATO_CROP_ID, 2_000).farm).toEqual(
      nextState.farm,
    );
  });

  it("adds exactly one selected owned creature and its discovery key item", () => {
    const state = createTestGameState();
    const creature = getLivestockCreatureDefinition(LIVESTOCK_WOLF_CREATURE_ID);

    if (!creature) {
      throw new Error("Expected Wolf livestock definition");
    }

    const nextState = debugAddOwnedLivestockCreature(
      state,
      LIVESTOCK_WOLF_CREATURE_ID,
      1_000,
    );

    expect(
      getLivestockState(nextState).ownedCreaturesById[LIVESTOCK_WOLF_CREATURE_ID],
    ).toBe(1);
    expect(nextState.keyItemsById?.[creature.discoveryKeyItemId]).toBe(1);
  });
});

describe("companion debug test tools", () => {
  it("levels up every eligible companion once", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const maxLevelCompanion = {
      ...createCompanion("companion-2", { x: 11, y: 10 }, leader.id),
      characterLevel: MAX_CHARACTER_LEVEL,
      characterXp: 0,
    };
    const enemy = createEnemy("enemy", { x: 12, y: 10 });
    const state = createTestGameState({
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [maxLevelCompanion.id]: maxLevelCompanion,
        [enemy.id]: enemy,
      },
    });

    const nextState = debugLevelUpAllCompanions(state, 5_000);
    const leveledCompanion = nextState.entities[leader.id];
    const unchangedMaxLevelCompanion = nextState.entities[maxLevelCompanion.id];

    expect(leveledCompanion?.kind === "companion" && leveledCompanion.characterLevel).toBe(2);
    expect(
      unchangedMaxLevelCompanion?.kind === "companion" &&
        unchangedMaxLevelCompanion.characterLevel,
    ).toBe(MAX_CHARACTER_LEVEL);
    expect(nextState.entities[enemy.id]).toEqual(enemy);
    expect(nextState.combatFeedbackEvents).toEqual([
      expect.objectContaining({
        type: "level_up",
        entityId: leader.id,
        text: "Level Up",
        createdAt: 5_000,
        expiresAt: 5_000 + PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS,
      }),
    ]);
  });

  it("toggles and applies companion infinite health", () => {
    const deadCompanion = {
      ...createCompanion("companion-1", { x: 10, y: 10 }, "companion-1"),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      partyLeaderId: deadCompanion.id,
      entities: {
        [deadCompanion.id]: deadCompanion,
      },
    });

    const toggledState = debugToggleCompanionInfiniteHealth(state);
    const nextState = debugApplyCompanionInfiniteHealth(toggledState);
    const restoredCompanion = nextState.entities[deadCompanion.id];

    expect(toggledState.debugOptions?.companionInfiniteHealthEnabled).toBe(true);
    expect(restoredCompanion?.kind === "companion" && restoredCompanion.health).toBe(
      deadCompanion.maxHealth,
    );
    expect(restoredCompanion?.state).toBe("idle");
  });

  it("targets the selected fifth companion when cycling classes", () => {
    const leader = createCompanion(
      companionIds[0],
      { x: 10, y: 10 },
      companionIds[0],
    );
    const selectedCompanion = {
      ...createCompanion(
        companionIds[4],
        { x: 11, y: 10 },
        companionIds[0],
      ),
      health: 1,
    };
    const state = createTestGameState({
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [selectedCompanion.id]: selectedCompanion,
      },
    });

    const outcome = debugCycleCompanionClass(state, selectedCompanion.id);
    const nextLeader = outcome.state.entities[leader.id];
    const nextSelectedCompanion = outcome.state.entities[selectedCompanion.id];

    expect(outcome.result).toMatchObject({
      status: "success",
      previousClassId: "beginner",
      nextClassId: "blade",
    });
    expect(nextLeader?.kind === "companion" && nextLeader.classId).toBe("beginner");
    expect(
      nextSelectedCompanion?.kind === "companion" && nextSelectedCompanion.classId,
    ).toBe("blade");
    expect(
      nextSelectedCompanion?.kind === "companion" && nextSelectedCompanion.health,
    ).toBe(1);
  });

  it("loops every class without adding unspent points or changing progression", () => {
    const baseCompanion = createCompanion(
      companionIds[0],
      { x: 10, y: 10 },
      companionIds[0],
    );
    const companion = {
      ...baseCompanion,
      characterLevel: 20,
      characterXp: 37,
      unspentStatPoints: 7,
      allocatedStats: {
        ...baseCompanion.allocatedStats,
        strength: 3,
      },
    };
    let state = createTestGameState({
      partyLeaderId: companion.id,
      entities: { [companion.id]: companion },
    });
    const classIds = [];
    const expectedNaturalStatsByClass = {
      beginner: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10 },
      blade: { strength: 30, dexterity: 30, constitution: 20, intelligence: 10, wisdom: 10 },
      aegis: { strength: 20, dexterity: 10, constitution: 40, intelligence: 10, wisdom: 20 },
      hunter: { strength: 20, dexterity: 40, constitution: 10, intelligence: 10, wisdom: 20 },
      beast: { strength: 30, dexterity: 20, constitution: 30, intelligence: 10, wisdom: 10 },
      elementalist: { strength: 10, dexterity: 10, constitution: 20, intelligence: 50, wisdom: 10 },
      runecaster: { strength: 10, dexterity: 10, constitution: 20, intelligence: 30, wisdom: 30 },
      lightbearer: { strength: 10, dexterity: 10, constitution: 20, intelligence: 20, wisdom: 40 },
      penitent: { strength: 20, dexterity: 10, constitution: 30, intelligence: 10, wisdom: 30 },
    };

    for (let index = 0; index < 9; index += 1) {
      const outcome = debugCycleCompanionClass(state, companion.id);
      state = outcome.state;
      const cycledCompanion = state.entities[companion.id];

      if (cycledCompanion?.kind !== "companion") {
        throw new Error("Expected companion test entity");
      }
      classIds.push(cycledCompanion.classId);
      expect(cycledCompanion.naturalStats).toEqual(
        expectedNaturalStatsByClass[cycledCompanion.classId],
      );
    }

    const finalCompanion = state.entities[companion.id];
    expect(classIds).toEqual([
      "blade",
      "aegis",
      "hunter",
      "beast",
      "elementalist",
      "runecaster",
      "lightbearer",
      "penitent",
      "beginner",
    ]);
    expect(finalCompanion?.kind === "companion" && finalCompanion.characterLevel).toBe(20);
    expect(finalCompanion?.kind === "companion" && finalCompanion.characterXp).toBe(37);
    expect(finalCompanion?.kind === "companion" && finalCompanion.unspentStatPoints).toBe(7);
    expect(finalCompanion?.kind === "companion" && finalCompanion.allocatedStats.strength).toBe(3);
  });

  it("auto-unequips incompatible gear and cancels atomically when inventory is full", () => {
    const baseCompanion = createCompanion(
      companionIds[0],
      { x: 10, y: 10 },
      companionIds[0],
      "fighter",
      0,
      "blade",
    );
    const companion = {
      ...baseCompanion,
      equipment: {
        ...baseCompanion.equipment,
        mainHand: "iron_sword" as const,
      },
    };
    const state = createTestGameState({
      partyLeaderId: companion.id,
      entities: { [companion.id]: companion },
      inventory: createEmptyPartyInventory(10),
    });

    const success = debugCycleCompanionClass(state, companion.id);
    const changedCompanion = success.state.entities[companion.id];

    expect(success.result).toMatchObject({
      status: "success",
      nextClassId: "aegis",
      unequippedItemIds: ["iron_sword"],
    });
    expect(changedCompanion?.kind === "companion" && changedCompanion.equipment.mainHand).toBeNull();
    expect(countInventoryItem(success.state.inventory, "iron_sword")).toBe(1);

    const fullState = {
      ...state,
      inventory: createEmptyPartyInventory(0),
    };
    const failure = debugCycleCompanionClass(fullState, companion.id);

    expect(failure.state).toBe(fullState);
    expect(failure.result.status).toBe("failed_inventory_full");
  });

  it("restores, levels, and kills only the selected companion", () => {
    const first = {
      ...createCompanion("companion-1", { x: 10, y: 10 }, "companion-1"),
      health: 1,
    };
    const second = {
      ...createCompanion("companion-2", { x: 11, y: 10 }, "companion-1"),
      health: 1,
    };
    const state = createTestGameState({
      partyLeaderId: first.id,
      entities: { [first.id]: first, [second.id]: second },
    });

    const restored = debugRestoreCompanionHealth(state, second.id);
    const restoredSecond = restored.entities[second.id];
    expect(restored.entities[first.id]).toEqual(first);
    expect(
      restoredSecond?.kind === "companion" && restoredSecond.health,
    ).toBe(second.maxHealth);

    const leveled = debugLevelUpCompanion(restored, second.id, 1_000);
    const leveledFirst = leveled.entities[first.id];
    const leveledSecond = leveled.entities[second.id];
    expect(
      leveledFirst?.kind === "companion" && leveledFirst.characterLevel,
    ).toBe(1);
    expect(
      leveledSecond?.kind === "companion" && leveledSecond.characterLevel,
    ).toBe(2);

    const killed = debugKillCompanion(leveled, second.id);
    expect(killed.entities[first.id]?.state).not.toBe("dead");
    expect(killed.entities[second.id]).toMatchObject({ state: "dead", health: 0 });
  });

  it("adds 100 Crowns through the debug wallet helper", () => {
    const state = createTestGameState();

    const nextState = debugAddTestCrowns(state);

    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(100);
    expect(nextState.wallet.visibleUntil).toBeGreaterThan(Date.now() - 1);
  });

  it("adds one of each prototype flask to inventory", () => {
    const state = createTestGameState({
      inventory: createEmptyPartyInventory(10),
    });

    const nextState = debugAddPrototypeFlasksToInventory(state);

    expect(countInventoryItem(nextState.inventory, "minor_recovery_flask")).toBe(1);
    expect(countInventoryItem(nextState.inventory, "soldiers_recovery_flask")).toBe(1);
  });

  it("adds 20 of each crafting material and enemy drop to inventory", () => {
    const state = createTestGameState({
      inventory: createEmptyPartyInventory(80),
    });

    const nextState = debugAddCraftingMaterialsAndEnemyDropsToInventory(state);

    expect(countInventoryItem(nextState.inventory, "softwood")).toBe(20);
    expect(countInventoryItem(nextState.inventory, "slime_gel_t1")).toBe(20);
    expect(countInventoryItem(nextState.inventory, "orc_hide")).toBe(20);
    expect(countInventoryItem(nextState.inventory, "training_sword")).toBe(0);
    expect(countInventoryItem(nextState.inventory, "minor_recovery_flask")).toBe(0);
    expect(countInventoryItem(nextState.inventory, "first_aid_skill_book")).toBe(0);
  });

  it("records debug crafting material fill telemetry while recording", () => {
    const state = startDebugTelemetryRecording(
      createTestGameState({
        inventory: createEmptyPartyInventory(80),
      }),
    );

    const nextState = debugAddCraftingMaterialsAndEnemyDropsToInventory(state);

    expect(nextState.debugTelemetry?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "debug_crafting_materials_added",
          entityId: "debug_tools",
          requestedQuantity: 20,
          successfulItemCount: expect.any(Number),
          partialItemCount: 0,
          failedItemCount: 0,
          inventoryCapacity: 80,
        }),
      ]),
    );
  });

  it("summarizes constrained inventory results for debug material fill", () => {
    const state = startDebugTelemetryRecording(
      createTestGameState({
        inventory: createEmptyPartyInventory(1),
      }),
    );

    const nextState = debugAddCraftingMaterialsAndEnemyDropsToInventory(state);
    const fillEvent = nextState.debugTelemetry?.events.find(
      (event) => event.type === "debug_crafting_materials_added",
    );

    expect(fillEvent).toMatchObject({
      requestedQuantity: 20,
      successfulItemCount: 1,
      partialItemCount: 0,
      inventoryCapacity: 1,
      inventoryFreeSlotsAfter: 0,
    });
    expect(fillEvent?.failedItemCount).toBeGreaterThan(0);
    expect(fillEvent?.eligibleItemCount).toBeGreaterThan(1);
  });

  it("does not record debug crafting material fill telemetry when recording is off", () => {
    const state = createTestGameState({
      inventory: createEmptyPartyInventory(80),
    });

    const nextState = debugAddCraftingMaterialsAndEnemyDropsToInventory(state);

    expect(nextState.debugTelemetry?.events ?? []).toEqual([]);
  });
});

describe("quest debug test tools", () => {
  it("finishes one active count quest from a different map", () => {
    const state = createPartyQuestTestState({
      currentMapId: "map-2",
      map: createDebugMap("map-2"),
      quests: createQuestStates({
        clear_the_shore: "active",
      }),
    });

    const nextState = debugFinishCurrentQuest(state, "clear_the_shore");

    expect(nextState.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(
      nextState.quests.clear_the_shore.objectiveProgress
        .defeat_shore_fringe_slimes,
    ).toMatchObject({
      currentCount: 10,
      completed: true,
    });
    expect(
      nextState.quests.clear_the_shore.objectiveProgress
        .gather_shore_fringe_wood,
    ).toMatchObject({
      currentCount: 3,
      completed: true,
    });
    expect(
      nextState.quests.clear_the_shore.objectiveProgress
        .inspect_shore_fringe_marker,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
  });

  it("finishes a sequential route quest, unlocks its route, and clears quest runtime", () => {
    const questEnemy = createEnemy(
      "quest-break-lower-shore-blockage-defense",
      { x: 10, y: 10 },
      "aggressive",
      {
        questSpawn: {
          questId: "break_lower_shore_blockage",
          objectiveId: "repair_lower_shore_blockage",
          targetPosition: { x: 153, y: 29 },
        },
      },
    );
    const guideNpc = createNpc(
      "map-1-route-worker",
      { x: 110, y: 29 },
      "Route Worker",
      "quest_guide",
    );
    const normalEnemy = createEnemy("normal-enemy", { x: 0, y: 0 });
    const state = createPartyQuestTestState({
      currentMapId: "hub",
      map: createDebugMap("hub"),
      entities: {
        [questEnemy.id]: questEnemy,
        [guideNpc.id]: guideNpc,
        [normalEnemy.id]: normalEnemy,
      },
      quests: createQuestStates({
        break_lower_shore_blockage: "active",
      }),
    });
    const activeQuest = state.quests.break_lower_shore_blockage;
    const stateWithRuntime = {
      ...state,
      quests: {
        ...state.quests,
        break_lower_shore_blockage: {
          ...activeQuest,
          runtime: {
            questDropMissCountsByObjectiveId: {
              defeat_lower_shore_spiders: 1,
            },
            repairProgressMsByObjectiveId: {
              repair_lower_shore_blockage: 3000,
            },
            defenseStartedObjectiveIds: {
              repair_lower_shore_blockage: true as const,
            },
            defenseSpawnedWaveKeys: {
              "repair_lower_shore_blockage:0": true as const,
            },
            questSpawnedEnemyIdsByObjectiveId: {
              repair_lower_shore_blockage: [questEnemy.id],
            },
            despawnedSubzoneEnemyIdsByObjectiveId: {
              repair_lower_shore_blockage: ["despawned-enemy"],
            },
          },
        },
      },
    };

    expect(isTeleportWorking(stateWithRuntime, TELEPORTER_ID)).toBe(false);

    const nextState = debugFinishCurrentQuest(
      stateWithRuntime,
      "break_lower_shore_blockage",
    );

    expect(nextState.quests.break_lower_shore_blockage.status).toBe(
      "ready_to_turn_in",
    );
    expect(
      Object.values(
        nextState.quests.break_lower_shore_blockage.objectiveProgress,
      ).every((progress) => progress.completed),
    ).toBe(true);
    expect(isTeleportWorking(nextState, TELEPORTER_ID)).toBe(true);
    expect(nextState.quests.break_lower_shore_blockage.runtime).toBeUndefined();
    expect(nextState.entities[questEnemy.id]).toBeUndefined();
    expect(nextState.entities[guideNpc.id]).toBeUndefined();
    expect(nextState.entities[normalEnemy.id]).toEqual(normalEnemy);
  });

  it("turns in only the selected ready quest", () => {
    const state = createPartyQuestTestState({
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
        stolen_field_supplies: "ready_to_turn_in",
      }),
    });

    const nextState = debugTurnInCurrentQuest(
      state,
      "stolen_field_supplies",
      5_000,
    );

    expect(nextState.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(nextState.quests.stolen_field_supplies.status).toBe("completed");
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(45);
    expect(nextState.inventory.slots).toEqual([]);
  });

  it("leaves a ready quest ready when debug turn-in reward validation fails", () => {
    const state = createPartyQuestTestState({
      inventory: {
        capacity: 0,
        slots: [],
      },
      quests: createQuestStates({
        clear_the_shore: "ready_to_turn_in",
      }),
    });

    const nextState = debugTurnInCurrentQuest(state, "clear_the_shore");

    expect(nextState.quests.clear_the_shore.status).toBe("ready_to_turn_in");
    expect(nextState.quests.clear_the_shore.lastTurnInError).toBe(
      "inventory_full",
    );
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(0);
    expect(nextState.inventory.slots).toEqual([]);
  });

  it("does nothing when there is no matching active or ready quest", () => {
    const state = createPartyQuestTestState({
      quests: createQuestStates({
        clear_the_shore: "available",
      }),
    });

    expect(debugFinishCurrentQuest(state)).toBe(state);
    expect(debugTurnInCurrentQuest(state)).toBe(state);
  });
});

function createPartyQuestTestState(
  overrides: Parameters<typeof createTestGameState>[0] = {},
) {
  const leader = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");
  const follower = createCompanion("companion-2", { x: 1, y: 0 }, leader.id);
  const { entities: overrideEntities, ...restOverrides } = overrides;

  return createTestGameState({
    ...restOverrides,
    entities: {
      [leader.id]: leader,
      [follower.id]: follower,
      ...overrideEntities,
    },
    partyLeaderId: leader.id,
    followTrailsByEntityId: {
      [leader.id]: [],
      [follower.id]: [],
    },
  });
}

function createQuestStates(statuses: Partial<Record<QuestId, QuestState["status"]>>) {
  const quests = createInitialQuestStates();

  for (const questId of Object.keys(quests) as QuestId[]) {
    quests[questId] = {
      ...quests[questId],
      status: statuses[questId] ?? quests[questId].status,
    };
  }

  return quests;
}

function getDebugSubzoneEnemies(state: ReturnType<typeof createTestGameState>): Enemy[] {
  return Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        entity.kind === "enemy" && entity.id.startsWith("debug-subzone-enemy-"),
    )
    .sort((first, second) => first.id.localeCompare(second.id));
}
