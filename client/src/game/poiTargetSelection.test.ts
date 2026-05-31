import { describe, expect, it } from "vitest";
import {
  HUB_MAP_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  MAP_TWO_TO_MAP_THREE_TELEPORTER_ID,
  TELEPORTER_ID,
  createDebugMap,
  npcIds,
} from "./debugMap";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { addItemToInventoryState } from "./inventory";
import { selectPoiTarget } from "./poiTargetSelection";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { createInitialQuestStates } from "./questSystem";
import type { GathererResourceReservations } from "./gathererResourceReservation";
import type { GameEntity, GameMap, Position } from "./types";
import type { GlobalPoiIntent, LocalPoiTarget, QuestId, QuestStatus } from "./questTypes";

describe("POI target selection", () => {
  it("chooses local quest targets before wild fallback targets", () => {
    const leader = createLeader({ x: 10, y: 8 });
    const questEnemy = createEnemy("quest-slime", { x: 18, y: 13 }, undefined, {
      archetypeId: "slime",
      subzoneId: "shore-fringe",
    });
    const fallbackResource = createResource("fallback-herb", { x: 11, y: 8 }, {
      resourceType: "herb",
    });
    const state = createGameState(
      MAP_ONE_ID,
      [leader, questEnemy, fallbackResource],
      {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          clear_the_shore: "active",
        }),
      },
    );

    const selection = selectPoiTarget(
      state,
      {
        type: "complete_current_quest",
        questId: "clear_the_shore",
        objectiveId: "defeat_shore_fringe_slimes",
        reason: "active quest objective",
      },
      createEmptyReservations(),
    );

    expect(selection.localTarget).toMatchObject({
      poiId: questEnemy.id,
      category: "combat",
      targetEntityId: questEnemy.id,
      reason: "active quest combat objective",
    });
  });

  it("orders hub Merchant quick exchange, quest giver work, and idle options", () => {
    const leader = createLeader({ x: 7, y: 20 });
    let state = createGameState(
      HUB_MAP_ID,
      [leader, ...createHubNpcs()],
      {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          clear_the_shore: "available",
          outfit_the_expedition: "completed",
        }),
      },
    );
    state = addItemToInventoryState(state, "wolf_pelt", 1, "debug").state;

    const selection = selectPoiTarget(
      state,
      {
        type: "get_new_quest",
        questId: "clear_the_shore",
        reason: "new quest available",
      },
      createEmptyReservations(),
    );

    expect(selection.localTarget?.poiId).toBe(npcIds[1]);
    expect(selection.consideredTargets.map((target) => target.poiId)).toEqual([
      npcIds[1],
      npcIds[0],
      "hub-idle-city-point",
    ]);
    expect(selection.consideredTargets.map((target) => target.priority)).toEqual([
      10,
      30,
      100,
    ]);
  });

  it("uses the World Travel route helper result for travel targets", () => {
    const leader = createLeader({ x: 10, y: 12 });
    const state = createGameState(HUB_MAP_ID, [leader], {
      partyLeaderId: leader.id,
      teleportStatesById: createUnlockedMainRouteTeleportStates(),
    });

    const selection = selectPoiTarget(
      state,
      {
        type: "travel_to_map",
        targetMapId: MAP_FOUR_ID,
        reason: "world route toward map-4",
      },
      createEmptyReservations(),
    );

    expect(selection.localTarget).toMatchObject({
      poiId: "hub-to-map-1",
      category: "teleport",
      reason: "world route toward map-4",
    });
  });

  it("filters wild fallback targets to the leader subzone", () => {
    const leader = createLeader({ x: 10, y: 8 });
    const outsideEnemy = createEnemy("outside-enemy", { x: 65, y: 14 }, undefined, {
      archetypeId: "bat",
      subzoneId: "mossy-glade",
    });
    const insideResource = createResource("inside-resource", { x: 12, y: 8 });
    const state = createGameState(
      MAP_ONE_ID,
      [leader, outsideEnemy, insideResource],
      {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: true,
          searchScope: "subzone_only",
        },
      },
    );

    const selection = selectPoiTarget(
      state,
      idleIntent(),
      createEmptyReservations(),
    );

    expect(selection.localTarget?.poiId).toBe(insideResource.id);
    expect(
      selection.consideredTargets.some((target) => target.poiId === outsideEnemy.id),
    ).toBe(false);
  });

  it("allows teleport routing even when Stay in Subzone is enabled", () => {
    const leader = createLeader({ x: 10, y: 8 });
    const state = createGameState(MAP_ONE_ID, [leader], {
      partyLeaderId: leader.id,
      poiPreferences: {
        stayInMap: true,
        searchScope: "subzone_only",
      },
      teleportStatesById: {
        [TELEPORTER_ID]: { isWorking: true },
      },
    });

    const selection = selectPoiTarget(
      state,
      {
        type: "travel_to_map",
        targetMapId: MAP_TWO_ID,
        reason: "world route toward map-2",
      },
      createEmptyReservations(),
    );

    expect(selection.localTarget?.poiId).toBe(TELEPORTER_ID);
  });

  it("waits before using whole-map fallback beyond progressive distance tiers", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const farResource = createResource("far-resource", { x: 150, y: 2 });
    const baseState = createGameState(MAP_ONE_ID, [leader, farResource], {
      partyLeaderId: leader.id,
      map: createOpenTestMap(),
      lastPoiDecision: {
        evaluatedAtMs: 0,
        skippedReasons: {},
      },
    });

    const earlySelection = selectPoiTarget(
      {
        ...baseState,
        simulationTimeMs: 1000,
      },
      idleIntent(),
      createEmptyReservations(),
    );
    const laterSelection = selectPoiTarget(
      {
        ...baseState,
        simulationTimeMs: 5000,
      },
      idleIntent(),
      createEmptyReservations(),
    );

    expect(earlySelection.localTarget).toBeNull();
    expect(laterSelection.localTarget?.poiId).toBe(farResource.id);
  });

  it("records unreachable POIs in skipped reasons", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const blockedResource = createResource("blocked-resource", { x: 10, y: 10 });
    const reachableEnemy = createEnemy("reachable-enemy", { x: 4, y: 2 });
    const state = createGameState(
      MAP_ONE_ID,
      [leader, blockedResource, reachableEnemy],
      {
        partyLeaderId: leader.id,
        map: createBlockedTargetMap(blockedResource.position),
      },
    );

    const selection = selectPoiTarget(
      state,
      idleIntent(),
      createEmptyReservations(),
    );

    expect(selection.localTarget?.poiId).toBe(reachableEnemy.id);
    expect(selection.skippedReasons[blockedResource.id]).toBe("unreachable");
  });

  it("retains a stable current target within the switch threshold", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const currentResource = createResource("current-resource", { x: 8, y: 2 });
    const closerResource = createResource("closer-resource", { x: 6, y: 2 });
    const currentTarget: LocalPoiTarget = {
      poiId: currentResource.id,
      category: "resource",
      mapId: MAP_ONE_ID,
      position: currentResource.position,
      targetEntityId: currentResource.id,
      reason: "wild resource fallback",
    };
    const state = createGameState(
      MAP_ONE_ID,
      [leader, currentResource, closerResource],
      {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        localPoiTarget: currentTarget,
      },
    );

    const selection = selectPoiTarget(
      state,
      idleIntent(),
      createEmptyReservations(),
    );

    expect(selection.localTarget?.poiId).toBe(currentResource.id);
    expect(
      selection.consideredTargets.find(
        (target) => target.poiId === currentResource.id,
      )?.isSelected,
    ).toBe(true);
  });

  it("lets a Gatherer-role leader prefer resource fallback options", () => {
    const leader = createLeader({ x: 2, y: 2 }, "gatherer");
    const nearbyEnemy = createEnemy("nearby-enemy", { x: 4, y: 2 });
    const resource = createResource("leader-resource", { x: 8, y: 2 });
    const state = createGameState(
      MAP_ONE_ID,
      [leader, nearbyEnemy, resource],
      {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
      },
    );

    const selection = selectPoiTarget(
      state,
      idleIntent(),
      createEmptyReservations(),
    );

    expect(selection.localTarget).toMatchObject({
      poiId: resource.id,
      category: "resource",
    });
  });

  it("excludes reserved Gatherer resources unless they are the current party gather target", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const reservedResource = createResource("reserved-resource", { x: 4, y: 2 });
    const openResource = createResource("open-resource", { x: 8, y: 2 });
    const reservations = createReservations([reservedResource.id]);
    const baseState = createGameState(
      MAP_ONE_ID,
      [leader, reservedResource, openResource],
      {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
      },
    );

    const reservedSelection = selectPoiTarget(
      baseState,
      idleIntent(),
      reservations,
    );
    const partyTargetSelection = selectPoiTarget(
      {
        ...baseState,
        leaderIntent: {
          type: "gather",
          targetId: reservedResource.id,
          targetPosition: reservedResource.position,
          source: "ai",
        },
      },
      idleIntent(),
      reservations,
    );

    expect(reservedSelection.localTarget?.poiId).toBe(openResource.id);
    expect(partyTargetSelection.localTarget?.poiId).toBe(reservedResource.id);
  });
});

function createLeader(position: Position, role: "fighter" | "gatherer" = "fighter") {
  return createCompanion("leader", position, "leader", role, 0);
}

function createGameState(
  mapId: typeof HUB_MAP_ID | typeof MAP_ONE_ID,
  entities: GameEntity[],
  overrides: Partial<GameState> = {},
): GameState {
  const state = createTestGameState({
    autoModeEnabled: true,
    currentMapId: mapId,
    map: createDebugMap(mapId),
    quests: createQuestStates(),
    activeTeleport: null,
    ...overrides,
  });

  return entities.reduce(addEntity, state);
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

function createHubNpcs(): GameEntity[] {
  return [
    createNpc(npcIds[0], { x: 22, y: 13 }, "Quest Giver", "quest_giver"),
    createNpc(npcIds[1], { x: 18, y: 15 }, "Merchant", "merchant"),
  ];
}

function idleIntent(): GlobalPoiIntent {
  return {
    type: "idle",
    reason: "test idle",
  };
}

function createEmptyReservations(): GathererResourceReservations {
  return createReservations([]);
}

function createReservations(resourceIds: string[]): GathererResourceReservations {
  return {
    resourceIds: new Set(resourceIds),
    resourceIdByGathererId: new Map(),
    gathererIdByResourceId: new Map(),
  };
}

function createUnlockedMainRouteTeleportStates(): GameState["teleportStatesById"] {
  return {
    [TELEPORTER_ID]: { isWorking: true },
    [MAP_TWO_TO_MAP_THREE_TELEPORTER_ID]: { isWorking: true },
  };
}

function createOpenTestMap(): GameMap {
  return {
    id: MAP_ONE_ID,
    displayName: "Open Test Map",
    debugName: "open-test-map",
    columns: 200,
    rows: 40,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

function createBlockedTargetMap(blockedPosition: Position): GameMap {
  return {
    id: MAP_ONE_ID,
    displayName: "Blocked Test Map",
    debugName: "blocked-test-map",
    columns: 20,
    rows: 20,
    walls: [
      { x: blockedPosition.x - 1, y: blockedPosition.y },
      { x: blockedPosition.x + 1, y: blockedPosition.y },
      { x: blockedPosition.x, y: blockedPosition.y - 1 },
      { x: blockedPosition.x, y: blockedPosition.y + 1 },
    ],
    teleports: [],
    healingFountains: [],
  };
}
