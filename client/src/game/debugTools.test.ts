import { describe, expect, it } from "vitest";

import { createCompanion, createEnemy, createNpc } from "./entities";
import { createDebugMap, TELEPORTER_ID } from "./debugMap";
import {
  debugAddTestCrowns,
  debugApplyCompanionInfiniteHealth,
  debugFinishCurrentQuest,
  debugForceSuperiorEnemyInCurrentSubzone,
  debugLevelUpAllCompanions,
  debugToggleCompanionInfiniteHealth,
  debugTurnInCurrentQuest,
} from "./debugTools";
import { isSuperiorEnemy } from "./enemyVariants";
import { MAX_CHARACTER_LEVEL } from "./leveling";
import { createInitialQuestStates } from "./questSystem";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS } from "./state";
import { createTestGameState } from "./testState";
import { isTeleportWorking } from "./teleportState";
import { getCurrencyBalance } from "./wallet";
import type { QuestId, QuestState } from "./questTypes";

describe("debugForceSuperiorEnemyInCurrentSubzone", () => {
  it("turns the closest normal enemy in the leader subzone into a Superior enemy", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const closestEnemy = createEnemy("enemy-close", { x: 12, y: 10 }, "passive", {
      enemyTypeId: "slime",
      subzoneId: "shore-fringe",
    });
    const fartherEnemy = createEnemy("enemy-far", { x: 30, y: 10 }, "passive", {
      enemyTypeId: "slime",
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
    expect(transformedEnemy?.kind === "enemy" ? transformedEnemy.maxHealth : 0).toBe(20);
    expect(transformedEnemy?.kind === "enemy" ? transformedEnemy.health : 0).toBe(20);
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
        enemyTypeId: "slime",
        subzoneId: "shore-fringe",
        variant: "superior",
      },
    );
    const normalEnemy = createEnemy("enemy-normal", { x: 14, y: 10 }, "passive", {
      enemyTypeId: "slime",
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
      enemyTypeId: "slime",
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

  it("adds 100 Crowns through the debug wallet helper", () => {
    const state = createTestGameState();

    const nextState = debugAddTestCrowns(state);

    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(100);
    expect(nextState.wallet.visibleUntil).toBeGreaterThan(Date.now() - 1);
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
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(35);
    expect(nextState.inventory.slots).toEqual([
      { itemId: "hearty_trail_rations", quantity: 1 },
    ]);
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
