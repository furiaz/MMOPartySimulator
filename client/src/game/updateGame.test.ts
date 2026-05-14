import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import {
  createDebugMap,
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  npcIds,
} from "./debugMap";
import { updateExplorationSystem } from "./explorationSystem";
import { addItemToInventoryState } from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import type { GameEntity, GameMap, Position } from "./types";
import type { QuestId, QuestStatus } from "./questTypes";

describe("game update intent priority", () => {
  it("keeps active gather quest intent when a reachable enemy exists", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const distantCompanion = {
      ...createCompanion("companion-2", { x: 40, y: 22 }, leader.id),
      state: "idle" as const,
      currentTargetId: null,
    };
    const wood = createResource("quest-wood", { x: 8, y: 4 }, {
      resourceType: "wood",
    });
    const reachableEnemy = createEnemy("nearby-passive-enemy", { x: 6, y: 4 });

    const nextState = updateGame(
      createMapOneState(
        [leader, distantCompanion, wood, reachableEnemy],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            gather_expedition_supplies: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("gather");
    expect(nextState.leaderIntent?.targetId).toBe(wood.id);
  });

  it("sends the party to gather a reached resource POI", () => {
    const leader = createLeader({ x: 5, y: 5 });
    const follower = {
      ...createCompanion("companion-2", { x: 6, y: 5 }, leader.id, "defender"),
      state: "idle" as const,
      currentTargetId: null,
    };
    const wood = createResource("quest-wood", { x: 4, y: 6 }, {
      resourceType: "wood",
    });

    const nextState = updateGame(
      createMapOneState(
        [leader, follower, wood],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            gather_expedition_supplies: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("gather");
    expect(nextState.leaderIntent?.targetId).toBe(wood.id);
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: wood.id,
    });
    expect(nextState.entities[follower.id]).toMatchObject({
      state: "gather",
      currentTargetId: wood.id,
    });
  });

  it("switches to attack intent when an enemy is attacking the party", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const wood = createResource("quest-wood", { x: 8, y: 4 }, {
      resourceType: "wood",
    });
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 5, y: 4 }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };

    const nextState = updateGame(
      createMapOneState(
        [leader, wood, attacker],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            gather_expedition_supplies: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(attacker.id);
  });

  it("still explores unexplored positions without a quest or POI target", () => {
    const leader = createLeader({ x: 3, y: 3 });
    const nextState = updateExplorationSystem(
      createMapOneState(
        [leader],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates(),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("explore");
    expect(nextState.leaderIntent?.targetPosition).not.toBeNull();
  });

  it("keeps combat quest targeting under POI control", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const questEnemy = createEnemy("quest-enemy", { x: 5, y: 4 });

    const nextState = updateGame(
      createMapOneState(
        [leader, questEnemy],
        {
          partyLeaderId: leader.id,
          quests: createQuestStates({
            clear_the_shore: "active",
          }),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(questEnemy.id);
  });

  it("selects a far same-map enemy outside nearby threat range when no quest exists", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const distantEnemy = createEnemy("distant-enemy", { x: 30, y: 4 });

    const nextState = updateGame(
      createMapOneState([leader, distantEnemy], {
        partyLeaderId: leader.id,
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(distantEnemy.id);
    expect(nextState.lastPoiDecision?.consideredTargets).toEqual([
      expect.objectContaining({
        poiId: distantEnemy.id,
        pathDistance: expect.any(Number),
        isSelected: true,
      }),
    ]);
  });

  it("skips unreachable POIs and chooses the next reachable target", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const unreachableEnemy = createEnemy("blocked-enemy", { x: 10, y: 10 });
    const reachableEnemy = createEnemy("reachable-enemy", { x: 4, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, unreachableEnemy, reachableEnemy], {
        partyLeaderId: leader.id,
        map: createBlockedTargetMap(unreachableEnemy.position),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.targetId).toBe(reachableEnemy.id);
    expect(nextState.lastPoiDecision?.skippedReasons[unreachableEnemy.id]).toBe("unreachable");
    expect(
      nextState.lastPoiDecision?.consideredTargets?.some(
        (target) => target.poiId === unreachableEnemy.id,
      ),
    ).toBe(false);
    expect(nextState.lastPoiDecision?.consideredTargets?.[0]).toMatchObject({
      poiId: reachableEnemy.id,
      isSelected: true,
    });
  });

  it("tie-breaks same-priority POIs by shortest viable path distance", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const farEnemy = createEnemy("far-enemy", { x: 10, y: 2 });
    const nearEnemy = createEnemy("near-enemy", { x: 5, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, farEnemy, nearEnemy], {
        partyLeaderId: leader.id,
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.targetId).toBe(nearEnemy.id);
    expect(nextState.lastPoiDecision?.consideredTargets?.map((target) => target.poiId)).toEqual([
      nearEnemy.id,
      farEnemy.id,
    ]);
    expect(nextState.lastPoiDecision?.consideredTargets?.[0]?.pathDistance).toBeLessThan(
      nextState.lastPoiDecision?.consideredTargets?.[1]?.pathDistance ?? 0,
    );
  });

  it("keeps the current POI when an equivalent target is only slightly closer", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const currentEnemy = createEnemy("current-enemy", { x: 12, y: 3 });
    const slightlyCloserEnemy = createEnemy("slightly-closer-enemy", { x: 10, y: 4 });

    const nextState = updateGame(
      createMapOneState([leader, currentEnemy, slightlyCloserEnemy], {
        partyLeaderId: leader.id,
        localPoiTarget: {
          poiId: currentEnemy.id,
          category: "combat",
          mapId: MAP_ONE_ID,
          position: currentEnemy.position,
          targetEntityId: currentEnemy.id,
          reason: "wild enemy fallback",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.targetId).toBe(currentEnemy.id);
    expect(
      nextState.lastPoiDecision?.consideredTargets?.find(
        (target) => target.poiId === currentEnemy.id,
      ),
    ).toMatchObject({
      isSelected: true,
    });
  });

  it("switches from a resource POI to a much better enemy fallback", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const resource = createResource("fallback-resource", { x: 12, y: 2 });
    const enemy = createEnemy("fallback-enemy", { x: 4, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, resource, enemy], {
        partyLeaderId: leader.id,
        localPoiTarget: {
          poiId: resource.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: resource.position,
          targetEntityId: resource.id,
          reason: "wild resource fallback",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(enemy.id);
    expect(nextState.lastPoiDecision?.consideredTargets?.[0]).toMatchObject({
      poiId: enemy.id,
      priority: 50,
      isSelected: true,
    });
  });

  it("uses weighted fallback so a nearby resource beats a far enemy", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const resource = createResource("near-resource", { x: 4, y: 2 });
    const farEnemy = createEnemy("far-enemy", { x: 30, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, resource, farEnemy], {
        partyLeaderId: leader.id,
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.type).toBe("gather");
    expect(nextState.leaderIntent?.targetId).toBe(resource.id);
    expect(nextState.lastPoiDecision?.consideredTargets?.[0]).toMatchObject({
      poiId: resource.id,
      category: "resource",
      isSelected: true,
    });
  });

  it("uses weighted fallback so a nearby enemy beats a farther resource", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const enemy = createEnemy("near-enemy", { x: 4, y: 2 });
    const resource = createResource("far-resource", { x: 10, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, enemy, resource], {
        partyLeaderId: leader.id,
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(enemy.id);
    expect(nextState.lastPoiDecision?.consideredTargets?.[0]).toMatchObject({
      poiId: enemy.id,
      category: "combat",
      isSelected: true,
    });
  });

  it("skips unreachable resources before weighted fallback selection", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const blockedResource = createResource("blocked-resource", { x: 10, y: 10 });
    const reachableEnemy = createEnemy("reachable-enemy", { x: 4, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, blockedResource, reachableEnemy], {
        partyLeaderId: leader.id,
        map: createBlockedTargetMap(blockedResource.position),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.targetId).toBe(reachableEnemy.id);
    expect(nextState.lastPoiDecision?.skippedReasons[blockedResource.id]).toBe("unreachable");
    expect(
      nextState.lastPoiDecision?.consideredTargets?.some(
        (target) => target.poiId === blockedResource.id,
      ),
    ).toBe(false);
  });

  it("limits considered POIs to the top five reachable candidates", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const enemies = Array.from({ length: 6 }, (_, index) =>
      createEnemy(`enemy-${index}`, { x: 4 + index, y: 2 }),
    );

    const nextState = updateGame(
      createMapOneState([leader, ...enemies], {
        partyLeaderId: leader.id,
        quests: createQuestStates(),
      }),
    );

    const consideredTargets = nextState.lastPoiDecision?.consideredTargets ?? [];

    expect(consideredTargets).toHaveLength(5);
    expect(consideredTargets.map((target) => target.poiId)).toEqual([
      "enemy-0",
      "enemy-1",
      "enemy-2",
      "enemy-3",
      "enemy-4",
    ]);
    expect(consideredTargets.every((target) => Number.isFinite(target.pathDistance))).toBe(true);
    expect(consideredTargets.filter((target) => target.isSelected)).toHaveLength(1);
  });

  it("sends the whole autonomous party to gather a fallback resource POI", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const follower = {
      ...createCompanion("companion-2", { x: 3, y: 2 }, leader.id, "defender"),
      state: "idle" as const,
      currentTargetId: null,
    };
    const resource = createResource("fallback-resource", { x: 8, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, follower, resource], {
        partyLeaderId: leader.id,
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.type).toBe("gather");
    expect(nextState.leaderIntent?.targetId).toBe(resource.id);
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
    expect(nextState.entities[follower.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("prioritizes hub Merchant quick exchange before quest work", () => {
    const leader = createLeader({ x: 7, y: 20 });
    const stateWithJunk = addItemToInventoryState(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          clear_the_shore: "available",
        }),
      }),
      "wolf_pelt",
      1,
    ).state;

    const nextState = updateGame(stateWithJunk);

    expect(nextState.localPoiTarget?.poiId).toBe(npcIds[1]);
    expect(nextState.localPoiTarget?.reason).toBe("merchant quick exchange");
  });

  it("delivers a ready hub quest before accepting a new quest", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          clear_the_shore: "ready_to_turn_in",
          gather_expedition_supplies: "available",
        }),
      }),
    );

    expect(nextState.quests.clear_the_shore.status).toBe("completed");
    expect(nextState.quests.gather_expedition_supplies.status).toBe("available");
  });

  it("Stay in Map blocks cross-map quest delivery and chooses a local fallback", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const localEnemy = createEnemy("local-enemy", { x: 4, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, localEnemy], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: true,
        },
        quests: createQuestStates({
          clear_the_shore: "ready_to_turn_in",
        }),
      }),
    );

    expect(nextState.localPoiTarget?.category).toBe("combat");
    expect(nextState.leaderIntent?.targetId).toBe(localEnemy.id);
  });

  it("Stay in Map still allows same-map active quest objectives", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const questEnemy = createEnemy("quest-enemy", { x: 4, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, questEnemy], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: true,
        },
        quests: createQuestStates({
          clear_the_shore: "active",
        }),
      }),
    );

    expect(nextState.localPoiTarget?.reason).toBe("active quest combat objective");
    expect(nextState.leaderIntent?.targetId).toBe(questEnemy.id);
  });

  it("Stay in Map still allows local hub quest turn-in", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: true,
        },
        quests: createQuestStates({
          clear_the_shore: "ready_to_turn_in",
        }),
      }),
    );

    expect(nextState.quests.clear_the_shore.status).toBe("completed");
  });

  it("Stay in Map blocks hub routing toward a wild objective", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: true,
        },
        quests: createQuestStates({
          clear_the_shore: "active",
        }),
      }),
    );

    expect(nextState.localPoiTarget?.category).toBe("idle");
    expect(nextState.localPoiTarget?.reason).toBe("hub idle city point");
  });

  it("routes world travel from hub toward map 2 through map 1", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_TWO_ID,
      }),
    );

    expect(nextState.globalPoiIntent?.type).toBe("travel_to_map");
    expect(nextState.localPoiTarget?.poiId).toBe("hub-to-map-1");
    expect(nextState.localPoiTarget?.reason).toBe("world route toward map-2");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 1 toward map 2 directly", () => {
    const leader = createLeader({ x: 70, y: 40 });

    const nextState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_TWO_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-1-to-map-2");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 2 toward hub through map 1", () => {
    const leader = createLeader({ x: 70, y: 40 });

    const nextState = updateGame(
      createMapTwoState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: HUB_MAP_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-2-to-map-1");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 1 toward hub directly", () => {
    const leader = createLeader({ x: 10, y: 12 });

    const nextState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: HUB_MAP_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-1-to-hub");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("clears world travel when the destination map is reached", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: HUB_MAP_ID,
      }),
    );

    expect(nextState.worldTravelTargetMapId).toBeNull();
    expect(nextState.globalPoiIntent?.type).not.toBe("travel_to_map");
  });

  it("world travel ignores Stay in Map", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: true,
        },
        worldTravelTargetMapId: MAP_TWO_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("hub-to-map-1");
    expect(nextState.leaderIntent?.type).toBe("move");
  });
});

function createLeader(position: { x: number; y: number }) {
  return {
    ...createCompanion("leader", position, "leader", "fighter", 0),
    state: "idle" as const,
    currentTargetId: null,
  };
}

function createMapOneState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      activeTeleport: null,
      exploredTiles: {},
      ...overrides,
    }),
  );
}

function createHubState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(HUB_MAP_ID),
      activeTeleport: null,
      exploredTiles: {},
      ...overrides,
    }),
  );
}

function createMapTwoState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      activeTeleport: null,
      exploredTiles: {},
      ...overrides,
    }),
  );
}

function createHubNpcs(): GameEntity[] {
  return [
    createNpc(npcIds[0], { x: 22, y: 13 }, "Quest Giver", "quest_giver"),
    createNpc(npcIds[1], { x: 18, y: 15 }, "Merchant", "merchant"),
  ];
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
