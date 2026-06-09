import { describe, expect, it } from "vitest";
import { HUB_MAP_ID, npcIds } from "./debugMap";
import { createCompanion, createNpc } from "./entities";
import { addItemToInventoryState } from "./inventory";
import { getQuickExchangeItems } from "./merchant";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import { updatePoiSystem } from "./poiSystem";
import { createInitialQuestStates } from "./questSystem";
import { createTestGameState } from "./testState";
import type { GameMap } from "./types";

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

describe("POI system interaction movement", () => {
  it("uses an approach position for auto merchant interaction intent", () => {
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

    const nextState = updatePoiSystem(state);

    expect(nextState.localPoiTarget).toMatchObject({
      poiId: merchant.id,
      interactionRange: 1.5,
    });
    expect(nextState.partyIntent?.executionIntent?.targetPosition).toEqual({
      x: 4,
      y: 5,
    });
    expect(nextState.partyIntent?.executionIntent?.targetPosition).not.toEqual(
      merchant.position,
    );
  });

  it("reuses a hub interaction stand position without repeating path distance", () => {
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
      x: 4,
      y: 5,
    });
    expect(reusedState.localPoiTarget).toMatchObject({
      interactionStandActorId: leader.id,
      interactionStandPosition: { x: 4, y: 5 },
      interactionStandTargetPosition: merchant.position,
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
    state = addItemToInventoryState(state, "wolf_pelt", 1, "debug").state;

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

    expect(getQuickExchangeItems(nextState)).toEqual([]);
  });

  it("invalidates a cached hub interaction stand position when it is reserved", () => {
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
        other: { x: 4, y: 5 },
      },
    });
    const metrics = consumeGamePerformanceMetrics();

    expect(metrics.pathDistanceQueries).toBeGreaterThan(0);
    expect(nextState.partyIntent?.executionIntent?.targetPosition).toEqual({
      x: 5,
      y: 4,
    });
  });
});
