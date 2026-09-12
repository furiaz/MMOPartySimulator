import { describe, expect, it } from "vitest";
import { HUB_MAP_ID, MAP_ONE_ID, MAP_TWO_ID, npcIds } from "./debugMap";
import { createCompanion, createEnemy, createNpc } from "./entities";
import { addItemToInventoryState } from "./inventory";
import { setBankAutoRoutingMode } from "./bank";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { updatePoiSystem } from "./poiSystem";
import { createInitialQuestStates } from "./questSystem";
import { createTestGameState } from "./testState";
import type { GameMap } from "./types";
import type { QuestId, QuestStatus } from "./questTypes";

function createMap(): GameMap {
  return {
    id: HUB_MAP_ID,
    displayName: "Hub Interaction Test Map",
    debugName: "hub-interaction-test-map",
    columns: 8,
    rows: 8,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

function createWildMap(id: typeof MAP_ONE_ID | typeof MAP_TWO_ID): GameMap {
  return {
    id,
    displayName: "Wild POI Test Map",
    debugName: "wild-poi-test-map",
    columns: 180,
    rows: 60,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

function createQuestStates(
  statuses: Partial<Record<QuestId, QuestStatus>> = {},
) {
  const quests = createInitialQuestStates();

  for (const questId of Object.keys(quests) as QuestId[]) {
    quests[questId] = {
      ...quests[questId],
      status: statuses[questId] ?? "completed",
    };
  }

  return quests;
}

function markObjectiveCompleted(
  quests: ReturnType<typeof createInitialQuestStates>,
  questId: QuestId,
  objectiveId: string,
  count = 1,
): void {
  quests[questId] = {
    ...quests[questId],
    objectiveProgress: {
      ...quests[questId].objectiveProgress,
      [objectiveId]: {
        objectiveId,
        currentCount: count,
        completed: true,
      },
    },
  };
}

function createActiveRepairQuestStates() {
  const quests = createQuestStates({
    break_lower_shore_blockage: "active",
  });

  markObjectiveCompleted(
    quests,
    "break_lower_shore_blockage",
    "inspect_lower_shore_wreckage",
    1,
  );
  markObjectiveCompleted(
    quests,
    "break_lower_shore_blockage",
    "defeat_lower_shore_spiders",
    20,
  );
  markObjectiveCompleted(
    quests,
    "break_lower_shore_blockage",
    "escort_lower_shore_worker",
    1,
  );

  return quests;
}

describe("POI system interaction movement", () => {
  it.skip("uses an approach position for auto quest interaction intent", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc(npcIds[1], { x: 5, y: 5 }, "Merchant", "merchant");
    const questGiver = createNpc(npcIds[0], { x: 6, y: 5 }, "Quest Giver", "quest_giver");
    const quests = createInitialQuestStates();
    quests.outfit_the_expedition = {
      ...quests.outfit_the_expedition,
      status: "completed",
    };
    let state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
        [questGiver.id]: questGiver,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      quests,
    });
    state = setBankAutoRoutingMode(
      addItemToInventoryState(state, "wolf_pelt", 1, "debug").state,
      "deposit_body_parts",
    );

    const nextState = updatePoiSystem(state);

    expect(nextState.localPoiTarget).toMatchObject({
      poiId: questGiver.id,
      interactionRange: 4,
    });
    expect(nextState.partyIntent?.executionIntent?.targetPosition).toEqual({
      x: 6,
      y: 4,
    });
    expect(nextState.partyIntent?.executionIntent?.targetPosition).not.toEqual(
      merchant.position,
    );
  });

  it.skip("reuses a hub interaction stand position without repeating path distance", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc(npcIds[1], { x: 5, y: 5 }, "Merchant", "merchant");
    const questGiver = createNpc(npcIds[0], { x: 6, y: 5 }, "Quest Giver", "quest_giver");
    const quests = createInitialQuestStates();
    quests.outfit_the_expedition = {
      ...quests.outfit_the_expedition,
      status: "completed",
    };
    let state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
        [questGiver.id]: questGiver,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      quests,
    });
    state = addItemToInventoryState(state, "wolf_pelt", 1, "debug").state;

    consumeGamePerformanceMetrics();
    const selectedState = updatePoiSystem(state);
    const firstMetrics = consumeGamePerformanceMetrics();

    const reusedState = updatePoiSystem(selectedState);
    const secondMetrics = consumeGamePerformanceMetrics();

    expect(firstMetrics.pathDistanceQueries).toBeGreaterThan(0);
    expect(secondMetrics.pathDistanceQueries).toBe(0);
    expect(reusedState.partyIntent?.executionIntent?.targetPosition).toEqual({
      x: 6,
      y: 4,
    });
    expect(reusedState.localPoiTarget).toMatchObject({
      interactionStandActorId: leader.id,
      interactionStandPosition: { x: 6, y: 4 },
      interactionStandTargetPosition: questGiver.position,
    });
  });

  it("processes reached hub interactions before reusing the cached POI", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc(npcIds[1], { x: 5, y: 5 }, "Merchant", "merchant");
    const questGiver = createNpc(npcIds[0], { x: 6, y: 5 }, "Quest Giver", "quest_giver");
    const quests = createInitialQuestStates();
    quests.outfit_the_expedition = {
      ...quests.outfit_the_expedition,
      status: "completed",
    };
    let state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
        [questGiver.id]: questGiver,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      quests,
    });
    state = setBankAutoRoutingMode(
      addItemToInventoryState(state, "wolf_pelt", 1, "debug").state,
      "deposit_body_parts",
    );

    const selectedState = updatePoiSystem(state);
    const reachedState = {
      ...selectedState,
      entities: {
        ...selectedState.entities,
        [leader.id]: {
          ...selectedState.entities[leader.id],
          position: { x: 4, y: 5 },
        },
      },
    };

    const nextState = updatePoiSystem(reachedState);

    expect(nextState.bank.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 1, slotIndex: 0 },
    ]);
  });

  it("processes a hub interaction when separation leaves the leader near the cached stand position", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc(npcIds[1], { x: 5, y: 5 }, "Merchant", "merchant");
    const questGiver = createNpc(npcIds[0], { x: 6, y: 5 }, "Quest Giver", "quest_giver");
    const quests = createInitialQuestStates();
    quests.outfit_the_expedition = {
      ...quests.outfit_the_expedition,
      status: "completed",
    };
    let state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
        [questGiver.id]: questGiver,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      quests,
    });
    state = setBankAutoRoutingMode(
      addItemToInventoryState(state, "wolf_pelt", 1, "debug").state,
      "deposit_body_parts",
    );

    const selectedState = updatePoiSystem(state);
    const separatedState = {
      ...selectedState,
      entities: {
        ...selectedState.entities,
        [leader.id]: {
          ...selectedState.entities[leader.id],
          position: { x: 5.2, y: 4 },
        },
      },
    };

    const nextState = updatePoiSystem(separatedState);

    expect(nextState.bank.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 1, slotIndex: 0 },
    ]);
  });

  it("does not process a cached hub interaction stand position for a moved target", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc(npcIds[1], { x: 5, y: 5 }, "Merchant", "merchant");
    const questGiver = createNpc(npcIds[0], { x: 6, y: 5 }, "Quest Giver", "quest_giver");
    const quests = createInitialQuestStates();
    quests.outfit_the_expedition = {
      ...quests.outfit_the_expedition,
      status: "completed",
    };
    let state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
        [questGiver.id]: questGiver,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      quests,
    });
    state = addItemToInventoryState(state, "wolf_pelt", 1, "debug").state;

    const selectedState = updatePoiSystem(state);
    const staleStandState = {
      ...selectedState,
      entities: {
        ...selectedState.entities,
        [leader.id]: {
          ...selectedState.entities[leader.id],
          position: { x: 3.2, y: 5 },
        },
        [questGiver.id]: {
          ...selectedState.entities[questGiver.id],
          position: { x: 5.5, y: 5 },
        },
      },
    };

    const nextState = updatePoiSystem(staleStandState);

    expect(nextState.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 1 },
    ]);
  });

  it.skip("invalidates a cached hub interaction stand position when it is reserved", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc(npcIds[1], { x: 5, y: 5 }, "Merchant", "merchant");
    const questGiver = createNpc(npcIds[0], { x: 6, y: 5 }, "Quest Giver", "quest_giver");
    const quests = createInitialQuestStates();
    quests.outfit_the_expedition = {
      ...quests.outfit_the_expedition,
      status: "completed",
    };
    let state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
        [questGiver.id]: questGiver,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      quests,
    });
    state = addItemToInventoryState(state, "wolf_pelt", 1, "debug").state;
    const selectedState = updatePoiSystem(state);

    consumeGamePerformanceMetrics();
    const nextState = updatePoiSystem({
      ...selectedState,
      reservedPositionsByEntityId: {
        other: { x: 6, y: 4 },
      },
    });
    const metrics = consumeGamePerformanceMetrics();

    expect(metrics.pathDistanceQueries).toBeGreaterThan(0);
    expect(nextState.partyIntent?.executionIntent?.targetPosition).toEqual({
      x: 6,
      y: 6,
    });
  });
});

describe("POI system quest marker proximity exclusions", () => {
  it("does not complete repair, defend, or unlock objectives through marker proximity", () => {
    const repairLeader = createCompanion(
      "repair-leader",
      { x: 153, y: 29 },
      "repair-leader",
      "fighter",
    );
    const repairState = updatePoiSystem(
      createTestGameState({
        autoModeEnabled: false,
        currentMapId: MAP_ONE_ID,
        entities: {
          [repairLeader.id]: repairLeader,
        },
        map: createWildMap(MAP_ONE_ID),
        partyLeaderId: repairLeader.id,
        quests: createActiveRepairQuestStates(),
      }),
    );

    expect(
      repairState.quests.break_lower_shore_blockage.objectiveProgress
        .repair_lower_shore_blockage,
    ).toMatchObject({
      currentCount: 0,
      completed: false,
    });

    const defendLeader = createCompanion(
      "defend-leader",
      { x: 100, y: 25 },
      "defend-leader",
      "fighter",
    );
    const defendState = updatePoiSystem(
      createTestGameState({
        autoModeEnabled: false,
        currentMapId: MAP_TWO_ID,
        entities: {
          [defendLeader.id]: defendLeader,
        },
        map: createWildMap(MAP_TWO_ID),
        partyLeaderId: defendLeader.id,
        quests: createQuestStates({ hold_the_field_cache: "active" }),
      }),
    );

    expect(
      defendState.quests.hold_the_field_cache.objectiveProgress
        .defend_old_grove_cache,
    ).toMatchObject({
      currentCount: 0,
      completed: false,
    });

    const unlockQuests = createActiveRepairQuestStates();
    markObjectiveCompleted(
      unlockQuests,
      "break_lower_shore_blockage",
      "repair_lower_shore_blockage",
      1,
    );
    const unlockLeader = createCompanion(
      "unlock-leader",
      { x: 154, y: 29 },
      "unlock-leader",
      "fighter",
    );
    const unlockState = updatePoiSystem(
      createTestGameState({
        autoModeEnabled: false,
        currentMapId: MAP_ONE_ID,
        entities: {
          [unlockLeader.id]: unlockLeader,
        },
        map: createWildMap(MAP_ONE_ID),
        partyLeaderId: unlockLeader.id,
        quests: unlockQuests,
      }),
    );

    expect(
      unlockState.quests.break_lower_shore_blockage.objectiveProgress
        .unlock_map_two_route,
    ).toMatchObject({
      currentCount: 0,
      completed: false,
    });
  });
});

describe("POI system active threat preservation", () => {
  it("keeps a committed threat while refreshing an active defend-area POI", () => {
    const leader = {
      ...createCompanion("leader", { x: 102.5, y: 25 }, "leader", "defender", 0),
      state: "attack" as const,
      currentTargetId: "current-threat",
    };
    const follower = {
      ...createCompanion("follower", { x: 101.5, y: 25 }, leader.id, "fighter", 1),
      state: "attack" as const,
      currentTargetId: "current-threat",
    };
    const currentThreat = {
      ...createEnemy("current-threat", { x: 101.5, y: 25 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const closerThreat = {
      ...createEnemy("closer-threat", { x: 102, y: 25.5 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_TWO_ID,
      entities: {
        [leader.id]: leader,
        [follower.id]: follower,
        [currentThreat.id]: currentThreat,
        [closerThreat.id]: closerThreat,
      },
      leaderIntent: {
        type: "attack",
        targetId: currentThreat.id,
        targetPosition: currentThreat.position,
        source: "ai",
      },
      localPoiTarget: {
        poiId: "old-grove-field-cache",
        category: "exploration",
        mapId: MAP_TWO_ID,
        position: { x: 100, y: 25 },
        interactionRange: 2,
        questId: "hold_the_field_cache",
        objectiveId: "defend_old_grove_cache",
        reason: "active quest defend_area objective",
      },
      lastPoiDecision: {
        evaluatedAtMs: 0,
        selectedPoiId: "old-grove-field-cache",
        selectedCategory: "exploration",
        selectedMapId: MAP_TWO_ID,
        selectedPosition: { x: 100, y: 25 },
        selectedReason: "active quest defend_area objective",
        consideredTargets: [],
        skippedReasons: {},
      },
      map: createWildMap(MAP_TWO_ID),
      partyLeaderId: leader.id,
      quests: createQuestStates({ hold_the_field_cache: "active" }),
      simulationTimeMs: 500,
    });

    const nextState = updatePoiSystem(state);

    expect(nextState.partyIntent?.executionIntent).toMatchObject({
      type: "attack",
      targetId: currentThreat.id,
    });
    expect(nextState.localPoiTarget).toMatchObject({
      objectiveId: "defend_old_grove_cache",
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: currentThreat.id,
    });
  });

  it("keeps a committed threat while refreshing an active repair POI", () => {
    const leader = {
      ...createCompanion("leader", { x: 155.5, y: 29 }, "leader", "defender", 0),
      state: "attack" as const,
      currentTargetId: "repair-threat",
    };
    const repairThreat = {
      ...createEnemy("repair-threat", { x: 154.5, y: 29 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_ONE_ID,
      entities: {
        [leader.id]: leader,
        [repairThreat.id]: repairThreat,
      },
      leaderIntent: {
        type: "attack",
        targetId: repairThreat.id,
        targetPosition: repairThreat.position,
        source: "ai",
      },
      localPoiTarget: {
        poiId: "lower-shore-route-blockage",
        category: "exploration",
        mapId: MAP_ONE_ID,
        position: { x: 153, y: 29 },
        interactionRange: 2,
        questId: "break_lower_shore_blockage",
        objectiveId: "repair_lower_shore_blockage",
        reason: "active quest repair_poi objective",
      },
      lastPoiDecision: {
        evaluatedAtMs: 0,
        selectedPoiId: "lower-shore-route-blockage",
        selectedCategory: "exploration",
        selectedMapId: MAP_ONE_ID,
        selectedPosition: { x: 153, y: 29 },
        selectedReason: "active quest repair_poi objective",
        consideredTargets: [],
        skippedReasons: {},
      },
      map: createWildMap(MAP_ONE_ID),
      partyLeaderId: leader.id,
      quests: createActiveRepairQuestStates(),
      simulationTimeMs: 500,
    });

    const nextState = updatePoiSystem(state);

    expect(nextState.partyIntent?.executionIntent).toMatchObject({
      type: "attack",
      targetId: repairThreat.id,
    });
    expect(nextState.localPoiTarget).toMatchObject({
      objectiveId: "repair_lower_shore_blockage",
    });
  });

  it("falls back to a live active threat when the current POI combat target is dead", () => {
    const leader = {
      ...createCompanion("leader", { x: 102.5, y: 25 }, "leader", "defender", 0),
      state: "attack" as const,
      currentTargetId: "dead-threat",
    };
    const deadThreat = {
      ...createEnemy("dead-threat", { x: 101.5, y: 25 }, "aggressive"),
      state: "dead" as const,
      health: 0,
      currentTargetId: leader.id,
    };
    const liveThreat = {
      ...createEnemy("live-threat", { x: 102, y: 25.5 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_TWO_ID,
      entities: {
        [leader.id]: leader,
        [deadThreat.id]: deadThreat,
        [liveThreat.id]: liveThreat,
      },
      leaderIntent: {
        type: "attack",
        targetId: deadThreat.id,
        targetPosition: deadThreat.position,
        source: "ai",
      },
      localPoiTarget: {
        poiId: "old-grove-field-cache",
        category: "exploration",
        mapId: MAP_TWO_ID,
        position: { x: 100, y: 25 },
        interactionRange: 2,
        questId: "hold_the_field_cache",
        objectiveId: "defend_old_grove_cache",
        reason: "active quest defend_area objective",
      },
      lastPoiDecision: {
        evaluatedAtMs: 0,
        selectedPoiId: "old-grove-field-cache",
        selectedCategory: "exploration",
        selectedMapId: MAP_TWO_ID,
        selectedPosition: { x: 100, y: 25 },
        selectedReason: "active quest defend_area objective",
        consideredTargets: [],
        skippedReasons: {},
      },
      map: createWildMap(MAP_TWO_ID),
      partyLeaderId: leader.id,
      quests: createQuestStates({ hold_the_field_cache: "active" }),
      simulationTimeMs: 500,
    });

    const nextState = updatePoiSystem(state);

    expect(nextState.partyIntent?.executionIntent).toMatchObject({
      type: "attack",
      targetId: liveThreat.id,
    });
  });

  it.skip("keeps normal exploration intent when no active threat is present", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_TWO_ID,
      entities: {
        [leader.id]: leader,
      },
      localPoiTarget: {
        poiId: "quiet-point",
        category: "exploration",
        mapId: MAP_TWO_ID,
        position: { x: 10, y: 0 },
        interactionRange: 1.5,
        reason: "quiet exploration point",
      },
      lastPoiDecision: {
        evaluatedAtMs: 0,
        selectedPoiId: "quiet-point",
        selectedCategory: "exploration",
        selectedMapId: MAP_TWO_ID,
        selectedPosition: { x: 10, y: 0 },
        selectedReason: "quiet exploration point",
        consideredTargets: [],
        skippedReasons: {},
      },
      map: createWildMap(MAP_TWO_ID),
      partyLeaderId: leader.id,
      simulationTimeMs: 500,
    });

    const nextState = updatePoiSystem(state);

    expect(nextState.partyIntent?.executionIntent).toMatchObject({
      type: "explore",
      targetId: null,
      targetPosition: { x: 10, y: 0 },
    });
  });
});
