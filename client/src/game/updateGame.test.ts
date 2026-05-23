import { describe, expect, it } from "vitest";
import {
  createCompanion,
  createEnemy,
  createNpc,
  createResource,
  getMovementStepDistance,
} from "./entities";
import {
  createDebugMap,
  HUB_MAP_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
  hubTeleporterPosition,
  npcIds,
} from "./debugMap";
import { updateExplorationSystem } from "./explorationSystem";
import { addItemToInventoryState } from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import {
  QUEST_GUIDE_NPC_ID,
  QUEST_GUIDE_ESCORT_RANGE,
  QUEST_GUIDE_MOVE_SPEED_MULTIPLIER,
  QUEST_GUIDE_START_POSITION,
  QUEST_GUIDE_TARGET_POSITION,
  createQuestGuideNpc,
} from "./questGuideSystem";
import {
  addEntity,
  getPoiSearchScope,
  setPoiSearchScope,
  setStayInMapEnabled,
  type GameState,
} from "./state";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import type { GameEntity, GameMap, Position, ZoneSubzone } from "./types";
import type { QuestId, QuestStatus } from "./questTypes";

describe("game update intent priority", () => {
  it("keeps active gather quest intent when a reachable enemy exists", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const distantCompanion = {
      ...createCompanion("companion-2", { x: 40, y: 22 }, leader.id),
      state: "idle" as const,
      currentTargetId: null,
    };
    const wood = createResource("quest-herb", { x: 8, y: 4 }, {
      resourceType: "herb",
    });
    const reachableEnemy = createEnemy("nearby-passive-enemy", { x: 6, y: 4 });

    const nextState = updateGame(
      createMapOneState(
        [leader, distantCompanion, wood, reachableEnemy],
        {
          partyLeaderId: leader.id,
          map: createMossyQuestTestMap(),
          quests: createPostGuideQuestStates(),
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
    const wood = createResource("quest-herb", { x: 4, y: 6 }, {
      resourceType: "herb",
    });

    const nextState = updateGame(
      createMapOneState(
        [leader, follower, wood],
        {
          partyLeaderId: leader.id,
          map: createMossyQuestTestMap(),
          quests: createPostGuideQuestStates(),
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

  it("completes inspect POIs when the leader reaches the quest target", () => {
    const leader = createLeader({ x: 46, y: 22 });
    const quests = createQuestStates({ clear_the_shore: "active" });
    markObjectiveCompleted(quests, "clear_the_shore", "defeat_shore_fringe_slimes", 10);
    markObjectiveCompleted(quests, "clear_the_shore", "gather_shore_fringe_wood", 3);

    const nextState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        localPoiTarget: {
          poiId: "shore-fringe-supply-marker",
          category: "exploration",
          mapId: MAP_ONE_ID,
          position: { x: 46, y: 22 },
          questId: "clear_the_shore",
          objectiveId: "inspect_shore_fringe_marker",
          reason: "active quest inspect objective",
        },
        quests,
      }),
    );

    expect(
      nextState.quests.clear_the_shore.objectiveProgress
        .inspect_shore_fringe_marker,
    ).toMatchObject({
      currentCount: 1,
      completed: true,
    });
    expect(nextState.quests.clear_the_shore.status).toBe("ready_to_turn_in");
  });

  it("routes guide objectives to the guide first and guards the moving guide after contact", () => {
    const leader = createLeader({ x: 7, y: 29 });
    const nearbyHerb = createResource("nearby-herb", { x: 8, y: 29 }, {
      resourceType: "herb",
    });
    const nearbyBat = createEnemy("nearby-bat", { x: 9, y: 29 }, undefined, {
      archetypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });
    const quests = createActiveGuideQuestStates();

    const initialState = updateGame(
      createMapOneState([leader, createQuestGuideNpc(), nearbyHerb, nearbyBat], {
        partyLeaderId: leader.id,
        quests,
      }),
    );

    expect(initialState.localPoiTarget).toMatchObject({
      category: "npc",
      targetEntityId: QUEST_GUIDE_NPC_ID,
    });

    const followingGuide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };
    const followingState = updateGame(
      createMapOneState([leader, followingGuide], {
        partyLeaderId: leader.id,
        quests,
      }),
    );

    expect(followingState.localPoiTarget).toMatchObject({
      category: "npc",
      targetEntityId: QUEST_GUIDE_NPC_ID,
      position: followingGuide.position,
    });
  });

  it("keeps guide POIs active after the leader reaches the Surveyor", () => {
    const leader = createLeader(QUEST_GUIDE_START_POSITION);
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };

    const nextState = updateGame(
      createMapOneState([leader, guide], {
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
        simulationDeltaMs: 100,
      }),
      { deltaMs: 100 },
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "npc",
      targetEntityId: QUEST_GUIDE_NPC_ID,
      objectiveId: "guide_mossy_glade_surveyor",
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "move",
    });
    expect(nextState.leaderIntent?.targetPosition).toEqual(
      nextState.localPoiTarget?.position,
    );

    const guideAfterFirstTick = nextState.entities[QUEST_GUIDE_NPC_ID];
    const reusedState = updateGame(nextState, { deltaMs: 100 });

    expect(reusedState.localPoiTarget).toMatchObject({
      category: "npc",
      targetEntityId: QUEST_GUIDE_NPC_ID,
      objectiveId: "guide_mossy_glade_surveyor",
      position: guideAfterFirstTick?.position,
    });
    expect(reusedState.leaderIntent).toMatchObject({
      type: "move",
      targetPosition: guideAfterFirstTick?.position,
    });
  });

  it("spawns the guide during the active Map 1 quest flow and waits for contact", () => {
    const leader = createLeader({ x: 7, y: 29 });
    const earlyState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          gather_expedition_supplies: "active",
        }),
      }),
    );

    expect(earlyState.entities[QUEST_GUIDE_NPC_ID]).toMatchObject({
      kind: "npc",
      npcRole: "quest_guide",
      state: "idle",
      position: QUEST_GUIDE_START_POSITION,
    });

    const guideLeader = createLeader(QUEST_GUIDE_START_POSITION);
    const guideState = updateGame(
      createMapOneState([guideLeader], {
        partyLeaderId: guideLeader.id,
        quests: createActiveGuideQuestStates(),
      }),
    );

    expect(guideState.entities[QUEST_GUIDE_NPC_ID]).toMatchObject({
      kind: "npc",
      npcRole: "quest_guide",
      state: "follow",
    });
  });

  it("spawns the guide when the party enters Map 1 during the guide quest flow", () => {
    const leader = createLeader(hubTeleporterPosition);

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          gather_expedition_supplies: "active",
        }),
        activeTeleport: {
          id: "hub-to-map-1",
          position: hubTeleporterPosition,
          range: 10,
          sourceMapId: HUB_MAP_ID,
          targetMapId: MAP_ONE_ID,
          triggeredBy: "ai",
        },
      }),
    );

    expect(nextState.currentMapId).toBe(MAP_ONE_ID);
    expect(nextState.entities[QUEST_GUIDE_NPC_ID]).toMatchObject({
      kind: "npc",
      npcRole: "quest_guide",
      state: "idle",
      position: QUEST_GUIDE_START_POSITION,
    });
  });

  it("moves the active guide toward the route marker and respects super speed", () => {
    const leader = createLeader({ x: 8, y: 29 });
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };
    const normalState = updateGame(
      createMapOneState([leader, guide], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
        map: undefined,
        simulationDeltaMs: 100,
      }),
      { deltaMs: 100 },
    );
    const superSpeedState = updateGame(
      createMapOneState([leader, guide], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
        map: undefined,
        simulationDeltaMs: 100,
        debugOptions: {
          superSpeedEnabled: true,
          superExpEnabled: false,
        },
      }),
      { deltaMs: 100 },
    );
    const normalGuide = normalState.entities[QUEST_GUIDE_NPC_ID];
    const superSpeedGuide = superSpeedState.entities[QUEST_GUIDE_NPC_ID];
    const normalGuideStep =
      getMovementStepDistance(leader, 100) * QUEST_GUIDE_MOVE_SPEED_MULTIPLIER;

    expect(normalGuide?.position.x).toBeCloseTo(
      QUEST_GUIDE_START_POSITION.x + normalGuideStep,
    );
    expect(normalGuide?.position.x).toBeLessThan(QUEST_GUIDE_TARGET_POSITION.x);
    expect(superSpeedGuide?.position.x).toBeCloseTo(
      QUEST_GUIDE_START_POSITION.x + normalGuideStep * 5,
    );
    expect(superSpeedGuide?.position.x).toBeLessThan(60);
  });

  it("pauses the guide when all companions are outside escort range", () => {
    const leader = createLeader({
      x: QUEST_GUIDE_START_POSITION.x - QUEST_GUIDE_ESCORT_RANGE - 1,
      y: QUEST_GUIDE_START_POSITION.y,
    });
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };

    const nextState = updateGame(
      createMapOneState([leader, guide], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
        map: undefined,
        simulationDeltaMs: 100,
      }),
      { deltaMs: 100 },
    );

    expect(nextState.entities[QUEST_GUIDE_NPC_ID]?.position).toEqual(
      QUEST_GUIDE_START_POSITION,
    );
  });

  it("resumes guide movement when a companion is inside escort range", () => {
    const leader = createLeader({
      x: QUEST_GUIDE_START_POSITION.x - QUEST_GUIDE_ESCORT_RANGE + 1,
      y: QUEST_GUIDE_START_POSITION.y,
    });
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };

    const nextState = updateGame(
      createMapOneState([leader, guide], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
        map: undefined,
        simulationDeltaMs: 100,
      }),
      { deltaMs: 100 },
    );

    expect(nextState.entities[QUEST_GUIDE_NPC_ID]?.position.x).toBeGreaterThan(
      QUEST_GUIDE_START_POSITION.x,
    );
  });

  it("requires the guide to reach the target before completing the guide objective", () => {
    const leaderAtTarget = createLeader(QUEST_GUIDE_TARGET_POSITION);
    const guideAtStart = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };
    const incompleteState = updateGame(
      createMapOneState([leaderAtTarget, guideAtStart], {
        partyLeaderId: leaderAtTarget.id,
        quests: createActiveGuideQuestStates(),
      }),
    );

    expect(
      incompleteState.quests.gather_expedition_supplies.objectiveProgress
        .guide_mossy_glade_surveyor.completed,
    ).toBe(false);

    const guideAtTarget = {
      ...createQuestGuideNpc(),
      position: QUEST_GUIDE_TARGET_POSITION,
      state: "follow" as const,
    };
    const completeState = updateGame(
      createMapOneState([leaderAtTarget, guideAtTarget], {
        partyLeaderId: leaderAtTarget.id,
        quests: createActiveGuideQuestStates(),
      }),
    );

    expect(
      completeState.quests.gather_expedition_supplies.objectiveProgress
        .guide_mossy_glade_surveyor.completed,
    ).toBe(true);
    expect(completeState.quests.gather_expedition_supplies.status).toBe(
      "ready_to_turn_in",
    );
  });

  it("does not let the guide attract enemies outside normal aggro range", () => {
    const leader = createLeader({ x: 92, y: 28 });
    const guide = {
      ...createQuestGuideNpc(),
      position: { x: 60, y: 28 },
      state: "follow" as const,
    };
    const enemy = createEnemy("glade-bat", { x: 76, y: 28 }, undefined, {
      archetypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });

    const nextState = updateGame(
      createMapOneState([leader, guide, enemy], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
      }),
    );
    const updatedEnemy = nextState.entities[enemy.id];

    expect(updatedEnemy).toMatchObject({
      state: "idle",
      currentTargetId: null,
      targetDecisionReason: "outside_detection",
    });
    expect(updatedEnemy).not.toMatchObject({ currentTargetId: guide.id });
    expect(nextState.entities[guide.id]).not.toHaveProperty("health");
  });

  it("keeps guarding the guide instead of chasing distant escort aggro", () => {
    const leader = createLeader({ x: 20, y: 29 });
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };
    const distantEnemy = {
      ...createEnemy("distant-escort-aggro", { x: 25, y: 29 }, "aggressive", {
        archetypeId: "cave_bat",
        subzoneId: "mossy-glade",
      }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, guide, distantEnemy], {
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "npc",
      targetEntityId: QUEST_GUIDE_NPC_ID,
    });
    expect(nextState.leaderIntent).toMatchObject({
      targetPosition: guide.position,
    });
    expect(nextState.leaderIntent?.type).not.toBe("attack");
    expect(nextState.entities[leader.id]).not.toMatchObject({
      state: "attack",
      currentTargetId: distantEnemy.id,
    });
  });

  it("still fights enemies that threaten the guide escort area", () => {
    const leader = createLeader({ x: 13, y: 29 });
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };
    const escortThreat = {
      ...createEnemy("near-guide-aggro", { x: 14, y: 29 }, "aggressive", {
        archetypeId: "cave_bat",
        subzoneId: "mossy-glade",
      }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, guide, escortThreat], {
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
      }),
    );

    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: escortThreat.id,
    });
  });

  it("does not let party protection override escort for enemies outside Surveyor range", () => {
    const leader = createLeader({ x: 20, y: 29 });
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };
    const outsideThreat = {
      ...createEnemy("outside-threat", { x: 18, y: 29 }, "aggressive", {
        archetypeId: "cave_bat",
        subzoneId: "mossy-glade",
        attackCooldownMs: 0,
        attackRange: 3,
      }),
      state: "attack" as const,
      currentTargetId: leader.id,
      lastAttackAt: -1000,
    };

    const nextState = updateGame(
      createMapOneState([leader, guide, outsideThreat], {
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
      }),
      { nowMs: 1000, deltaMs: 100 },
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "npc",
      targetEntityId: QUEST_GUIDE_NPC_ID,
    });
    expect(nextState.leaderIntent?.type).not.toBe("attack");
    expect(nextState.entities[leader.id]).not.toMatchObject({
      state: "attack",
      currentTargetId: outsideThreat.id,
    });
  });

  it("keeps defenders from chasing enemies outside Surveyor range during escort", () => {
    const leader = createLeader({ x: 20, y: 29 });
    const defender = {
      ...createCompanion("defender", { x: 19, y: 29 }, leader.id, "defender"),
      state: "defend" as const,
      currentTargetId: null,
    };
    const guide = {
      ...createQuestGuideNpc(),
      state: "follow" as const,
    };
    const outsideThreat = createEnemy("outside-defender-threat", { x: 18, y: 29 }, "aggressive", {
      archetypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });

    const nextState = updateGame(
      createMapOneState([leader, defender, guide, outsideThreat], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        quests: createActiveGuideQuestStates(),
      }),
    );

    expect(nextState.entities[defender.id]).not.toMatchObject({
      state: "attack",
      currentTargetId: outsideThreat.id,
    });
  });

  it("routes the second Map 1 quest to Mossy Glade passage before the far herb", () => {
    const leader = createLeader({ x: 4, y: 29 });
    const gladeHerb = createResource("glade-herb", { x: 101, y: 51 }, {
      resourceType: "herb",
    });

    const nextState = updateGame(
      createMapOneState([leader, gladeHerb], {
        partyLeaderId: leader.id,
        quests: createPostGuideQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "exploration",
      position: { x: 53, y: 29 },
      reason: "route to quest subzone",
      questId: "gather_expedition_supplies",
      objectiveId: "gather_mossy_glade_herbs",
    });
    expect(nextState.localPoiTarget?.targetEntityId).toBeUndefined();
    expect(nextState.leaderIntent).toMatchObject({
      type: "explore",
      targetPosition: { x: 53, y: 29 },
    });
  });

  it("selects the second Map 1 quest target directly once inside Mossy Glade", () => {
    const leader = createLeader({ x: 58, y: 29 });
    const gladeHerb = createResource("glade-herb", { x: 101, y: 51 }, {
      resourceType: "herb",
    });

    const nextState = updateGame(
      createMapOneState([leader, gladeHerb], {
        partyLeaderId: leader.id,
        quests: createPostGuideQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "resource",
      targetEntityId: gladeHerb.id,
      reason: "active quest gather herb",
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "gather",
      targetId: gladeHerb.id,
    });
  });

  it("selects nearest incomplete kill or gather quest objective after the guide is complete", () => {
    const leader = createLeader({ x: 58, y: 29 });
    const gladeHerb = createResource("glade-herb", { x: 101, y: 51 }, {
      resourceType: "herb",
    });
    const gladeBat = createEnemy("glade-bat", { x: 59, y: 29 }, undefined, {
      archetypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });

    const nextState = updateGame(
      createMapOneState([leader, gladeHerb, gladeBat], {
        partyLeaderId: leader.id,
        quests: createPostGuideQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "combat",
      targetEntityId: gladeBat.id,
      reason: "active quest combat objective",
      objectiveId: "defeat_mossy_glade_bats",
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: gladeBat.id,
    });
  });

  it("skips completed kill objective enemies when choosing active quest fallback targets", () => {
    const leader = createLeader({ x: 5, y: 4 });
    const completedObjectiveBat = createEnemy(
      "completed-objective-bat",
      { x: 6, y: 4 },
      undefined,
      {
        archetypeId: "cave_bat",
        subzoneId: "mossy-glade",
      },
    );
    const fallbackOre = createResource("fallback-ore", { x: 7, y: 4 }, {
      resourceType: "ore",
    });
    const quests = createPostGuideQuestStates();
    markObjectiveCompleted(
      quests,
      "gather_expedition_supplies",
      "defeat_mossy_glade_bats",
      20,
    );

    const nextState = updateGame(
      createMapOneState([leader, completedObjectiveBat, fallbackOre], {
        partyLeaderId: leader.id,
        map: createMossyQuestTestMap(),
        poiPreferences: {
          stayInMap: false,
          searchScope: "zone_only",
        },
        quests,
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "resource",
      targetEntityId: fallbackOre.id,
      reason: "wild resource fallback",
    });
    expect(nextState.lastPoiDecision?.consideredTargets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetEntityId: completedObjectiveBat.id,
        }),
      ]),
    );
  });

  it("routes Lower Shore quest objectives through each Map 1 subzone hop", () => {
    const shoreLeader = createLeader({ x: 4, y: 29 });
    const shoreState = updateGame(
      createMapOneState([shoreLeader], {
        partyLeaderId: shoreLeader.id,
        quests: createQuestStates({
          scout_the_northern_road: "active",
        }),
      }),
    );

    expect(shoreState.localPoiTarget).toMatchObject({
      position: { x: 53, y: 29 },
      reason: "route to quest subzone",
      objectiveId: "defeat_lower_shore_spiders",
    });

    const gladeLeader = createLeader({ x: 58, y: 29 });
    const gladeState = updateGame(
      createMapOneState([gladeLeader], {
        partyLeaderId: gladeLeader.id,
        quests: createQuestStates({
          scout_the_northern_road: "active",
        }),
      }),
    );

    expect(gladeState.localPoiTarget).toMatchObject({
      position: { x: 106, y: 29 },
      reason: "route to quest subzone",
      objectiveId: "defeat_lower_shore_spiders",
    });
  });

  it("reuses valid subzone route POIs while traveling toward the passage", () => {
    const leader = createLeader({ x: 4, y: 29 });
    const routeTarget = {
      poiId: "route-shore-fringe-to-mossy-glade-shore-fringe-to-mossy-glade",
      category: "exploration" as const,
      mapId: MAP_ONE_ID,
      position: { x: 53, y: 29 },
      questId: "gather_expedition_supplies" as const,
      objectiveId: "gather_mossy_glade_herbs",
      reason: "route to quest subzone",
    };

    const nextState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        localPoiTarget: routeTarget,
        lastPoiDecision: {
          evaluatedAtMs: 0,
          selectedPoiId: routeTarget.poiId,
          selectedCategory: routeTarget.category,
          selectedMapId: routeTarget.mapId,
          selectedPosition: routeTarget.position,
          selectedReason: routeTarget.reason,
          skippedReasons: {},
        },
        simulationTimeMs: 1000,
        quests: createPostGuideQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject(routeTarget);
    expect(nextState.leaderIntent).toMatchObject({
      type: "explore",
      targetPosition: routeTarget.position,
    });
  });

  it("invalidates reused quest POIs when their objective is complete", () => {
    const leader = createLeader({ x: 58, y: 29 });
    const gladeHerb = createResource("glade-herb", { x: 59, y: 29 }, {
      resourceType: "herb",
    });
    const gladeBat = createEnemy("glade-bat", { x: 63, y: 29 }, undefined, {
      archetypeId: "cave_bat",
      subzoneId: "mossy-glade",
    });
    const quests = createPostGuideQuestStates();
    markObjectiveCompleted(
      quests,
      "gather_expedition_supplies",
      "gather_mossy_glade_herbs",
      3,
    );

    const nextState = updateGame(
      createMapOneState([leader, gladeHerb, gladeBat], {
        partyLeaderId: leader.id,
        localPoiTarget: {
          poiId: gladeHerb.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: gladeHerb.position,
          targetEntityId: gladeHerb.id,
          questId: "gather_expedition_supplies",
          objectiveId: "gather_mossy_glade_herbs",
          reason: "active quest gather herb",
        },
        lastPoiDecision: {
          evaluatedAtMs: 0,
          selectedPoiId: gladeHerb.id,
          selectedCategory: "resource",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: gladeHerb.position,
          selectedReason: "active quest gather herb",
          skippedReasons: {},
        },
        simulationTimeMs: 1000,
        quests,
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "combat",
      targetEntityId: gladeBat.id,
      objectiveId: "defeat_mossy_glade_bats",
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: gladeBat.id,
    });
  });

  it("keeps current gather quest resources eligible while a gatherer works them", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 4 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const wood = createResource("quest-herb", { x: 6, y: 4 }, {
      resourceType: "herb",
    });
    const enemy = createEnemy("fallback-enemy", { x: 8, y: 4 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, wood, enemy], {
        partyLeaderId: leader.id,
        map: createMossyQuestTestMap(),
        simulationTimeMs: 4200,
        leaderIntent: {
          type: "gather",
          targetId: wood.id,
          targetPosition: wood.position,
          source: "ai",
        },
        localPoiTarget: {
          poiId: wood.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: wood.position,
          targetEntityId: wood.id,
          questId: "gather_expedition_supplies",
          objectiveId: "gather_mossy_glade_herbs",
          reason: "active quest gather herb",
        },
        lastPoiDecision: {
          evaluatedAtMs: 0,
          selectedPoiId: wood.id,
          selectedCategory: "resource",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: wood.position,
          selectedReason: "active quest gather herb",
          skippedReasons: {},
        },
        quests: createPostGuideQuestStates(),
      }),
      { deltaMs: 100 },
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "resource",
      targetEntityId: wood.id,
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "gather",
      targetId: wood.id,
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: wood.id,
    });
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: wood.id,
    });
  });

  it("keeps a quest resource POI committed while the gatherer is targeting it", () => {
    const leader = createLeader({ x: 19, y: 4 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 4 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "quest-herb",
    };
    const currentWood = createResource("quest-herb", { x: 6, y: 4 }, {
      resourceType: "herb",
    });
    const closerWood = createResource("closer-quest-herb", { x: 20, y: 4 }, {
      resourceType: "herb",
    });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, currentWood, closerWood], {
        partyLeaderId: leader.id,
        map: createMossyQuestTestMap(),
        simulationTimeMs: 1500,
        leaderIntent: {
          type: "gather",
          targetId: currentWood.id,
          targetPosition: currentWood.position,
          source: "ai",
        },
        localPoiTarget: {
          poiId: currentWood.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: currentWood.position,
          targetEntityId: currentWood.id,
          questId: "gather_expedition_supplies",
          objectiveId: "gather_mossy_glade_herbs",
          reason: "active quest gather herb",
        },
        lastPoiDecision: {
          evaluatedAtMs: 0,
          selectedPoiId: currentWood.id,
          selectedCategory: "resource",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: currentWood.position,
          selectedReason: "active quest gather herb",
          skippedReasons: {},
        },
        quests: createPostGuideQuestStates(),
      }),
      { deltaMs: 100 },
    );

    expect(nextState.localPoiTarget).toMatchObject({
      targetEntityId: currentWood.id,
      reason: "active quest gather herb",
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "gather",
      targetId: currentWood.id,
    });
  });

  it("keeps the current quest gather target in candidates after commitment expires", () => {
    const leader = createLeader({ x: 5, y: 4 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 5 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "quest-herb",
    };
    const currentWood = createResource("quest-herb", { x: 6, y: 4 }, {
      resourceType: "herb",
    });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, currentWood], {
        partyLeaderId: leader.id,
        map: createMossyQuestTestMap(),
        simulationTimeMs: 4200,
        leaderIntent: {
          type: "gather",
          targetId: currentWood.id,
          targetPosition: currentWood.position,
          source: "ai",
        },
        localPoiTarget: {
          poiId: currentWood.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: currentWood.position,
          targetEntityId: currentWood.id,
          questId: "gather_expedition_supplies",
          objectiveId: "gather_mossy_glade_herbs",
          reason: "active quest gather herb",
        },
        lastPoiDecision: {
          evaluatedAtMs: 0,
          selectedPoiId: currentWood.id,
          selectedCategory: "resource",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: currentWood.position,
          selectedReason: "active quest gather herb",
          skippedReasons: {},
        },
        quests: createPostGuideQuestStates(),
      }),
      { deltaMs: 100 },
    );

    expect(
      nextState.lastPoiDecision?.consideredTargets?.map(
        (target) => target.targetEntityId,
      ),
    ).toContain(currentWood.id);
    expect(nextState.localPoiTarget).toMatchObject({
      targetEntityId: currentWood.id,
    });
  });

  it("preserves a valid quest resource POI after the commitment window", () => {
    const leader = createLeader({ x: 19, y: 4 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 4 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "distant-quest-herb",
    };
    const distantWood = createResource("distant-quest-herb", { x: 6, y: 4 }, {
      resourceType: "herb",
    });
    const closerWood = createResource("closer-quest-herb", { x: 20, y: 4 }, {
      resourceType: "herb",
    });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, distantWood, closerWood], {
        partyLeaderId: leader.id,
        map: createMossyQuestTestMap(),
        simulationTimeMs: 2200,
        leaderIntent: {
          type: "gather",
          targetId: distantWood.id,
          targetPosition: distantWood.position,
          source: "ai",
        },
        localPoiTarget: {
          poiId: distantWood.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: distantWood.position,
          targetEntityId: distantWood.id,
          questId: "gather_expedition_supplies",
          objectiveId: "gather_mossy_glade_herbs",
          reason: "active quest gather herb",
        },
        lastPoiDecision: {
          evaluatedAtMs: 0,
          selectedPoiId: distantWood.id,
          selectedCategory: "resource",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: distantWood.position,
          selectedReason: "active quest gather herb",
          skippedReasons: {},
        },
        quests: createPostGuideQuestStates(),
      }),
      { deltaMs: 100 },
    );

    expect(nextState.localPoiTarget).toMatchObject({
      targetEntityId: distantWood.id,
      reason: "active quest gather herb",
    });
    expect(nextState.localPoiTarget?.targetEntityId).not.toBe(closerWood.id);
    expect(nextState.leaderIntent).toMatchObject({
      type: "gather",
      targetId: distantWood.id,
    });
  });

  it("breaks quest resource POI commitment when the current target is depleted", () => {
    const leader = createLeader({ x: 19, y: 4 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 4 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "depleted-quest-herb",
    };
    const depletedWood = {
      ...createResource("depleted-quest-herb", { x: 6, y: 4 }, {
        resourceType: "herb",
        quantity: 0,
      }),
      isDepleted: true,
    };
    const validWood = createResource("valid-quest-herb", { x: 20, y: 4 }, {
      resourceType: "herb",
    });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, depletedWood, validWood], {
        partyLeaderId: leader.id,
        map: createMossyQuestTestMap(),
        simulationTimeMs: 1500,
        leaderIntent: {
          type: "gather",
          targetId: depletedWood.id,
          targetPosition: depletedWood.position,
          source: "ai",
        },
        localPoiTarget: {
          poiId: depletedWood.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: depletedWood.position,
          targetEntityId: depletedWood.id,
          questId: "gather_expedition_supplies",
          objectiveId: "gather_mossy_glade_herbs",
          reason: "active quest gather herb",
        },
        lastPoiDecision: {
          evaluatedAtMs: 0,
          selectedPoiId: depletedWood.id,
          selectedCategory: "resource",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: depletedWood.position,
          selectedReason: "active quest gather herb",
          skippedReasons: {},
        },
        quests: createPostGuideQuestStates(),
      }),
      { deltaMs: 100 },
    );

    expect(nextState.localPoiTarget?.targetEntityId).not.toBe(depletedWood.id);
    expect(nextState.leaderIntent?.targetId).not.toBe(depletedWood.id);
  });

  it("makes autonomous gatherers abandon valid resources to resurrect dead companions", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const deadCompanion = {
      ...createCompanion("dead-companion", { x: 5, y: 5 }, leader.id, "fighter"),
      state: "dead" as const,
      health: 0,
    };
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 4 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("nearby-resource", { x: 6, y: 4 });

    const nextState = updateGame(
      createMapOneState([leader, deadCompanion, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.resurrectionChannelsByHelperId?.[gatherer.id]).toMatchObject({
      helperId: gatherer.id,
      targetId: deadCompanion.id,
    });
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: deadCompanion.id,
    });
  });

  it("allows autonomous gatherers to resurrect when no valid resource is available", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const deadCompanion = {
      ...createCompanion("dead-companion", { x: 5, y: 5 }, leader.id, "fighter"),
      state: "dead" as const,
      health: 0,
    };
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 4 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const depletedResource = {
      ...createResource("depleted-resource", { x: 6, y: 4 }),
      isDepleted: true,
      quantity: 0,
    };

    const nextState = updateGame(
      createMapOneState([leader, deadCompanion, gatherer, depletedResource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.resurrectionChannelsByHelperId?.[gatherer.id]).toMatchObject({
      helperId: gatherer.id,
      targetId: deadCompanion.id,
    });
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: deadCompanion.id,
    });
  });

  it("makes the only living gatherer prioritize resurrection over gathering", () => {
    const deadLeader = {
      ...createLeader({ x: 4, y: 4 }),
      state: "dead" as const,
      health: 0,
    };
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 4 }, deadLeader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "nearby-resource",
    };
    const resource = createResource("nearby-resource", { x: 6, y: 4 });

    const nextState = updateGame(
      createMapOneState([deadLeader, gatherer, resource], {
        partyLeaderId: deadLeader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.resurrectionChannelsByHelperId?.[gatherer.id]).toMatchObject({
      helperId: gatherer.id,
      targetId: deadLeader.id,
    });
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: deadLeader.id,
    });
  });

  it("keeps direct gather commands from being taken over by resurrection", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const deadCompanion = {
      ...createCompanion("dead-companion", { x: 5, y: 5 }, leader.id, "fighter"),
      state: "dead" as const,
      health: 0,
    };
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 4 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "direct-resource",
      commandPriority: "direct" as const,
    };
    const resource = createResource("direct-resource", { x: 6, y: 4 });

    const nextState = updateGame(
      createMapOneState([leader, deadCompanion, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.resurrectionChannelsByHelperId?.[gatherer.id]).toBeUndefined();
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
  });

  it("prioritizes resurrection over active gather quest resources", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const deadCompanion = {
      ...createCompanion("dead-companion", { x: 5, y: 5 }, leader.id, "fighter"),
      state: "dead" as const,
      health: 0,
    };
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 4 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const wood = createResource("quest-wood", { x: 6, y: 4 }, {
      resourceType: "wood",
    });

    const nextState = updateGame(
      createMapOneState([leader, deadCompanion, gatherer, wood], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createPostGuideQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toBeNull();
    expect(nextState.resurrectionChannelsByHelperId?.[gatherer.id]).toMatchObject({
      helperId: gatherer.id,
      targetId: deadCompanion.id,
    });
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: deadCompanion.id,
    });
  });

  it("prioritizes resurrection over autonomous combat when the helper is not targeted", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const deadCompanion = {
      ...createCompanion("dead-companion", { x: 5, y: 5 }, leader.id, "fighter"),
      state: "dead" as const,
      health: 0,
    };
    const fighter = {
      ...createCompanion("fighter", { x: 5, y: 4 }, leader.id, "fighter"),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const enemy = createEnemy("enemy", { x: 30, y: 4 }, "passive");

    const nextState = updateGame(
      createMapOneState([leader, deadCompanion, fighter, enemy], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.resurrectionChannelsByHelperId?.[fighter.id]).toMatchObject({
      helperId: fighter.id,
      targetId: deadCompanion.id,
    });
    expect(nextState.entities[fighter.id]).toMatchObject({
      state: "follow",
      currentTargetId: deadCompanion.id,
    });
  });

  it("keeps direct gather commands when companions are inside enemy aggro range", () => {
    const resource = createResource("danger-wood", { x: 6, y: 5 }, {
      resourceType: "wood",
      durability: 5,
    });
    const leader = {
      ...createCompanion("leader", { x: 6, y: 5 }, "leader", "fighter", 0),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
      lastGatherAt: 0,
    };
    const ally = {
      ...createCompanion("companion-2", { x: 6.5, y: 5 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
      lastGatherAt: 0,
    };
    const enemy = createEnemy("aggro-enemy", { x: 5, y: 5 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, ally, resource, enemy], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        leaderIntent: {
          type: "gather",
          targetId: resource.id,
          targetPosition: resource.position,
        },
      }),
      { nowMs: 2_000 },
    );

    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "attack",
    });
    expect([leader.id, ally.id]).toContain(
      (nextState.entities[enemy.id] as { currentTargetId: string | null })
        .currentTargetId,
    );
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
    expect(nextState.entities[ally.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
    expect(nextState.entities[resource.id]).toMatchObject({
      durability: 3,
      quantity: resource.quantity,
    });
  });

  it("switches to attack intent when an enemy is attacking the party", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const wood = createResource("quest-herb", { x: 8, y: 4 }, {
      resourceType: "herb",
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
          map: createMossyQuestTestMap(),
          quests: createPostGuideQuestStates(),
        },
      ),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(attacker.id);
  });

  it("keeps direct player move intent from being replaced by combat aggro", () => {
    const leader = {
      ...createLeader({ x: 4, y: 4 }),
      state: "attack" as const,
      currentTargetId: "attacking-enemy",
    };
    const ally = {
      ...createCompanion("companion-2", { x: 4.5, y: 4 }, leader.id, "fighter"),
      state: "attack" as const,
      currentTargetId: "attacking-enemy",
    };
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 5, y: 4 }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const moveTarget = { x: 10, y: 4 };

    const nextState = updateGame(
      createMapOneState([leader, ally, attacker], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: moveTarget,
          source: "player",
        },
      }),
      { nowMs: 2_000 },
    );

    expect(nextState.leaderIntent).toMatchObject({
      type: "move",
      targetId: null,
      targetPosition: moveTarget,
      source: "player",
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "follow",
      currentTargetId: null,
    });
    expect(nextState.entities[ally.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
    expect(nextState.entities[attacker.id]).toMatchObject({
      state: "attack",
    });
    expect([leader.id, ally.id]).toContain(
      (nextState.entities[attacker.id] as { currentTargetId: string | null })
        .currentTargetId,
    );
  });

  it("keeps direct player attack intent from being replaced by another attacker", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const chosenEnemy = createEnemy("chosen-enemy", { x: 5, y: 4 });
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 4, y: 5 }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, chosenEnemy, attacker], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "attack",
          targetId: chosenEnemy.id,
          targetPosition: chosenEnemy.position,
          source: "player",
        },
      }),
      { nowMs: 2_000 },
    );

    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: chosenEnemy.id,
      source: "player",
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: chosenEnemy.id,
    });
  });

  it("remembers the interrupted POI when enemy aggro pulls the party into combat", () => {
    const leader = createLeader({ x: 4, y: 4 });
    const wood = createResource("quest-herb", { x: 8, y: 4 }, {
      resourceType: "herb",
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
          map: createMossyQuestTestMap(),
          quests: createPostGuideQuestStates(),
        },
      ),
    );

    expect(nextState.leaderIntent?.targetId).toBe(attacker.id);
    expect(nextState.interruptedPoiTarget?.leaderIntent).toMatchObject({
      type: "gather",
      targetId: wood.id,
    });
    expect(nextState.interruptedPoiTarget?.localPoiTarget?.targetEntityId).toBe(wood.id);
  });

  it("does not interrupt direct gather commands when enemy aggro only starts chasing", () => {
    const resource = createResource("direct-resource", { x: 8, y: 4 });
    const leader = {
      ...createCompanion("leader", { x: 4, y: 4 }, "leader", "fighter", 0),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
    };
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 5, y: 4 }),
      state: "attack" as const,
      currentTargetId: leader.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, resource, attacker], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        leaderIntent: null,
        localPoiTarget: null,
        globalPoiIntent: null,
      }),
    );

    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.interruptedPoiTarget).toBeUndefined();
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
  });

  it("interrupts autonomous non-gatherers from gathering when they are attacked", () => {
    const resource = createResource("party-resource", { x: 4, y: 4 });
    const leader = {
      ...createCompanion("leader", { x: 4, y: 4 }, "leader", "fighter", 0),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "autonomous" as const,
    };
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 5, y: 4 }),
      state: "attack" as const,
      currentTargetId: leader.id,
      attackWindupStartedAt: 1_000,
      attackWindupDurationMs: 500,
      attackWindupTargetId: leader.id,
      lastAttackAt: 0,
    };

    const nextState = updateGame(
      createMapOneState([leader, resource, attacker], {
        autoModeEnabled: true,
        partyLeaderId: leader.id,
        leaderIntent: {
          type: "gather",
          targetId: resource.id,
          targetPosition: resource.position,
          source: "ai",
        },
      }),
      { nowMs: 2_000 },
    );

    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: attacker.id,
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: attacker.id,
      commandPriority: "autonomous",
    });
  });

  it("interrupts autonomous non-gatherers from gathering while an enemy is attacking the party", () => {
    const resource = createResource("party-resource", { x: 4, y: 4 });
    const leader = {
      ...createCompanion("leader", { x: 4, y: 4 }, "leader", "fighter", 0),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "autonomous" as const,
    };
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 5, y: 4 }),
      state: "attack" as const,
      currentTargetId: leader.id,
      attackWindupStartedAt: undefined,
      attackWindupDurationMs: undefined,
      attackWindupTargetId: null,
      lastAttackAt: 1_900,
    };

    const nextState = updateGame(
      createMapOneState([leader, resource, attacker], {
        autoModeEnabled: true,
        partyLeaderId: leader.id,
        leaderIntent: {
          type: "gather",
          targetId: resource.id,
          targetPosition: resource.position,
          source: "ai",
        },
      }),
      { nowMs: 2_000 },
    );

    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: attacker.id,
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "attack",
      currentTargetId: attacker.id,
      commandPriority: "autonomous",
    });
    expect(nextState.entities[resource.id]).toMatchObject({
      durability: resource.durability,
      quantity: resource.quantity,
    });
  });

  it("keeps autonomous gatherers on their resource when they are attacked", () => {
    const resource = createResource("gatherer-resource", { x: 4, y: 4 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 4, y: 4 }, "gatherer", "gatherer", 0),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "autonomous" as const,
    };
    const attacker = {
      ...createEnemy("attacking-enemy", { x: 5, y: 4 }),
      state: "attack" as const,
      currentTargetId: gatherer.id,
      attackWindupStartedAt: 1_000,
      attackWindupDurationMs: 500,
      attackWindupTargetId: gatherer.id,
      lastAttackAt: 0,
    };

    const nextState = updateGame(
      createMapOneState([gatherer, resource, attacker], {
        autoModeEnabled: true,
        partyLeaderId: gatherer.id,
        leaderIntent: {
          type: "gather",
          targetId: resource.id,
          targetPosition: resource.position,
          source: "ai",
        },
      }),
      { nowMs: 2_000 },
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "autonomous",
    });
  });

  it("restores a direct gather command after the interrupting enemy dies", () => {
    const resource = createResource("direct-resource", { x: 8, y: 4 });
    const leader = {
      ...createCompanion("leader", { x: 5, y: 4 }, "leader", "fighter", 0),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
    };
    const attacker = defeatedEnemy("attacking-enemy", { x: 5, y: 4 });

    const nextState = updateGame(
      createMapOneState([leader, resource, attacker], {
        autoModeEnabled: false,
        partyLeaderId: leader.id,
        leaderIntent: {
          type: "attack",
          targetId: attacker.id,
          targetPosition: attacker.position,
        },
        interruptedPoiTarget: {
          interruptedByEnemyId: attacker.id,
          mapId: MAP_ONE_ID,
          leaderIntent: {
            type: "gather",
            targetId: resource.id,
            targetPosition: resource.position,
            source: "player",
          },
          globalPoiIntent: null,
          localPoiTarget: null,
        },
      }),
    );

    expect(nextState.interruptedPoiTarget).toBeNull();
    expect(nextState.leaderIntent).toMatchObject({
      type: "gather",
      targetId: resource.id,
      targetPosition: resource.position,
      source: "player",
    });
  });

  it("restores an interrupted world travel teleport POI after combat ends", () => {
    const leader = {
      ...createLeader({ x: 70, y: 40 }),
      state: "attack" as const,
      currentTargetId: "attacker",
    };
    const attacker = defeatedEnemy("attacker", { x: 69, y: 40 });
    const teleportPosition = { x: 74, y: 40 };

    const nextState = updateGame(
      createMapOneState([leader, attacker], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_TWO_ID,
        leaderIntent: {
          type: "attack",
          targetId: attacker.id,
          targetPosition: attacker.position,
        },
        interruptedPoiTarget: {
          interruptedByEnemyId: attacker.id,
          mapId: MAP_ONE_ID,
          leaderIntent: {
            type: "move",
            targetId: null,
            targetPosition: teleportPosition,
          },
          globalPoiIntent: {
            type: "travel_to_map",
            targetMapId: MAP_TWO_ID,
            reason: "world route toward map-2",
          },
          localPoiTarget: {
            poiId: "map-1-to-map-2",
            category: "teleport",
            mapId: MAP_ONE_ID,
            position: teleportPosition,
            targetEntityId: "map-1-to-map-2",
            reason: "world route toward map-2",
          },
        },
      }),
    );

    expect(nextState.interruptedPoiTarget).toBeNull();
    expect(nextState.leaderIntent).toMatchObject({
      type: "move",
      targetId: null,
      targetPosition: teleportPosition,
    });
    expect(nextState.localPoiTarget?.poiId).toBe("map-1-to-map-2");
  });

  it("restores an interrupted resource POI when the resource is still valid", () => {
    const leader = {
      ...createLeader({ x: 2, y: 2 }),
      state: "attack" as const,
      currentTargetId: "attacker",
    };
    const resource = createResource("fallback-resource", { x: 8, y: 2 });
    const attacker = defeatedEnemy("attacker", { x: 3, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, resource, attacker], {
        partyLeaderId: leader.id,
        leaderIntent: {
          type: "attack",
          targetId: attacker.id,
          targetPosition: attacker.position,
        },
        interruptedPoiTarget: {
          interruptedByEnemyId: attacker.id,
          mapId: MAP_ONE_ID,
          leaderIntent: {
            type: "gather",
            targetId: resource.id,
            targetPosition: resource.position,
          },
          globalPoiIntent: {
            type: "idle",
            reason: "no active or available quest",
          },
          localPoiTarget: {
            poiId: resource.id,
            category: "resource",
            mapId: MAP_ONE_ID,
            position: resource.position,
            targetEntityId: resource.id,
            reason: "wild resource fallback",
          },
        },
      }),
    );

    expect(nextState.leaderIntent?.type).toBe("gather");
    expect(nextState.leaderIntent?.targetId).toBe(resource.id);
    expect(nextState.localPoiTarget?.targetEntityId).toBe(resource.id);
  });

  it("restores an interrupted combat POI when the original enemy is still valid", () => {
    const leader = {
      ...createLeader({ x: 2, y: 2 }),
      state: "attack" as const,
      currentTargetId: "attacker",
    };
    const originalEnemy = createEnemy("original-enemy", { x: 8, y: 2 });
    const attacker = defeatedEnemy("attacker", { x: 3, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, originalEnemy, attacker], {
        partyLeaderId: leader.id,
        leaderIntent: {
          type: "attack",
          targetId: attacker.id,
          targetPosition: attacker.position,
        },
        interruptedPoiTarget: {
          interruptedByEnemyId: attacker.id,
          mapId: MAP_ONE_ID,
          leaderIntent: {
            type: "attack",
            targetId: originalEnemy.id,
            targetPosition: originalEnemy.position,
          },
          globalPoiIntent: {
            type: "idle",
            reason: "no active or available quest",
          },
          localPoiTarget: {
            poiId: originalEnemy.id,
            category: "combat",
            mapId: MAP_ONE_ID,
            position: originalEnemy.position,
            targetEntityId: originalEnemy.id,
            reason: "wild enemy fallback",
          },
        },
      }),
    );

    expect(nextState.leaderIntent?.type).toBe("attack");
    expect(nextState.leaderIntent?.targetId).toBe(originalEnemy.id);
    expect(nextState.localPoiTarget?.targetEntityId).toBe(originalEnemy.id);
  });

  it("clears an interrupted POI when the original target is no longer valid", () => {
    const leader = {
      ...createLeader({ x: 2, y: 2 }),
      state: "attack" as const,
      currentTargetId: "attacker",
    };
    const depletedResource = {
      ...createResource("depleted-resource", { x: 8, y: 2 }),
      isDepleted: true,
      quantity: 0,
    };
    const attacker = defeatedEnemy("attacker", { x: 3, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, depletedResource, attacker], {
        partyLeaderId: leader.id,
        autoModeEnabled: false,
        leaderIntent: {
          type: "attack",
          targetId: attacker.id,
          targetPosition: attacker.position,
        },
        interruptedPoiTarget: {
          interruptedByEnemyId: attacker.id,
          mapId: MAP_ONE_ID,
          leaderIntent: {
            type: "gather",
            targetId: depletedResource.id,
            targetPosition: depletedResource.position,
          },
          globalPoiIntent: null,
          localPoiTarget: {
            poiId: depletedResource.id,
            category: "resource",
            mapId: MAP_ONE_ID,
            position: depletedResource.position,
            targetEntityId: depletedResource.id,
            reason: "wild resource fallback",
          },
        },
      }),
    );

    expect(nextState.interruptedPoiTarget).toBeNull();
    expect(nextState.leaderIntent?.targetId).not.toBe(depletedResource.id);
  });

  it("does not restore interrupted POI over a direct player command", () => {
    const leader = {
      ...createLeader({ x: 2, y: 2 }),
      commandPriority: "direct" as const,
    };
    const resource = createResource("fallback-resource", { x: 8, y: 2 });
    const attacker = defeatedEnemy("attacker", { x: 3, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, resource, attacker], {
        partyLeaderId: leader.id,
        autoModeEnabled: false,
        leaderIntent: null,
        interruptedPoiTarget: {
          interruptedByEnemyId: attacker.id,
          mapId: MAP_ONE_ID,
          leaderIntent: {
            type: "gather",
            targetId: resource.id,
            targetPosition: resource.position,
          },
          globalPoiIntent: null,
          localPoiTarget: {
            poiId: resource.id,
            category: "resource",
            mapId: MAP_ONE_ID,
            position: resource.position,
            targetEntityId: resource.id,
            reason: "wild resource fallback",
          },
        },
      }),
    );

    expect(nextState.interruptedPoiTarget).toBeNull();
    expect(nextState.leaderIntent?.targetId).not.toBe(resource.id);
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

  it("reuses a valid nearby wild combat POI between throttle intervals", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const currentEnemy = createEnemy("current-enemy", { x: 3, y: 2 });
    const alternateEnemy = createEnemy("alternate-enemy", { x: 4, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, currentEnemy, alternateEnemy], {
        partyLeaderId: leader.id,
        simulationTimeMs: 1000,
        simulationDeltaMs: 100,
        localPoiTarget: {
          poiId: currentEnemy.id,
          category: "combat",
          mapId: MAP_ONE_ID,
          position: currentEnemy.position,
          targetEntityId: currentEnemy.id,
          reason: "wild enemy fallback",
        },
        lastPoiDecision: {
          evaluatedAtMs: 1000,
          selectedPoiId: currentEnemy.id,
          selectedCategory: "combat",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: currentEnemy.position,
          selectedReason: "wild enemy fallback",
          consideredTargets: [],
          skippedReasons: {},
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.leaderIntent?.targetId).toBe(currentEnemy.id);
    expect(nextState.lastPoiDecision?.evaluatedAtMs).toBe(1000);
  });

  it("throttles whole-map fallback when no progressive tier finds a target", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const farEnemy = createEnemy("far-whole-map-enemy", { x: 150, y: 2 });
    const recentNoTargetState = createMapOneState([leader, farEnemy], {
      partyLeaderId: leader.id,
      map: createWideOpenTestMap(),
      simulationTimeMs: 1200,
      lastPoiDecision: {
        evaluatedAtMs: 1000,
        skippedReasons: {},
      },
      quests: createQuestStates(),
    });

    const throttledState = updateGame(recentNoTargetState);

    expect(throttledState.localPoiTarget).toBeNull();

    const nextAllowedState = updateGame({
      ...recentNoTargetState,
      simulationTimeMs: 5100,
    });

    expect(nextAllowedState.localPoiTarget?.targetEntityId).toBe(farEnemy.id);
    expect(nextAllowedState.lastPoiDecision?.consideredTargets?.[0]).toMatchObject({
      poiId: farEnemy.id,
      pathDistance: 148,
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

  it("lets gatherers choose nearby resources from their own position within leader leash", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 14, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("gatherer-resource", { x: 15, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 20, y: 2 },
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("keeps autonomous gatherers focused on nearby resources when aggressive enemies are nearby", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("gatherer-resource", { x: 6, y: 2 });
    const enemy = createEnemy("nearby-aggressive-enemy", { x: 9, y: 2 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource, enemy], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 20, y: 2 },
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("reclaims autonomous gatherers when the player gives a move order", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "gatherer-resource",
      commandPriority: "autonomous" as const,
    };
    const resource = createResource("gatherer-resource", { x: 6, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 20, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
    expect(nextState.entities[resource.id]).toMatchObject({
      durability: resource.durability,
      quantity: resource.quantity,
    });
  });

  it("keeps gatherer-claimed resources out of whole-party POI selection", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "claimed-resource",
    };
    const resource = createResource("claimed-resource", { x: 6, y: 2 });
    const enemy = createEnemy("party-enemy", { x: 14, y: 2 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource, enemy], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "combat",
      targetEntityId: enemy.id,
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: enemy.id,
    });
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("reserves non-leader gatherer resources from party POI before the gatherer is busy", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("reserved-resource", { x: 6, y: 2 });
    const enemy = createEnemy("party-enemy", { x: 14, y: 2 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource, enemy], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "combat",
      targetEntityId: enemy.id,
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: enemy.id,
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      currentTargetId: enemy.id,
    });
    expect(nextState.entities[leader.id].state).not.toBe("gather");
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("keeps autonomous gatherer reservations within resource capacity", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const firstGatherer = {
      ...createCompanion("gatherer-a", { x: 5, y: 2 }, leader.id, "gatherer", 1),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const secondGatherer = {
      ...createCompanion("gatherer-b", { x: 5.2, y: 2 }, leader.id, "gatherer", 2),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const firstResource = createResource("reserved-resource-a", { x: 6, y: 2 }, {
      maxGatherers: 1,
    });
    const secondResource = createResource("reserved-resource-b", { x: 8, y: 2 }, {
      maxGatherers: 1,
    });
    const enemy = createEnemy("party-enemy", { x: 14, y: 2 }, "aggressive");

    const nextState = updateGame(
      createMapOneState(
        [leader, firstGatherer, secondGatherer, firstResource, secondResource, enemy],
        {
          partyLeaderId: leader.id,
          map: createOpenTestMap(),
          quests: createQuestStates(),
        },
      ),
    );

    expect(nextState.entities[firstGatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: firstResource.id,
    });
    expect(nextState.entities[secondGatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: secondResource.id,
    });
    expect(nextState.localPoiTarget?.targetEntityId).toBe(enemy.id);
  });

  it("does not reuse a recently selected resource POI once a non-leader gatherer reserves it", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("reserved-resource", { x: 6, y: 2 });
    const enemy = createEnemy("party-enemy", { x: 14, y: 2 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource, enemy], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        simulationTimeMs: 1100,
        localPoiTarget: {
          poiId: resource.id,
          category: "resource",
          mapId: MAP_ONE_ID,
          position: resource.position,
          targetEntityId: resource.id,
          reason: "wild resource fallback",
        },
        lastPoiDecision: {
          evaluatedAtMs: 1000,
          selectedPoiId: resource.id,
          selectedCategory: "resource",
          selectedMapId: MAP_ONE_ID,
          selectedPosition: resource.position,
          selectedReason: "wild resource fallback",
          skippedReasons: {},
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "combat",
      targetEntityId: enemy.id,
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "attack",
      targetId: enemy.id,
    });
    expect(nextState.entities[leader.id].state).not.toBe("gather");
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("does not reserve invalid gatherer resources from party POI", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const invalidResource = {
      ...createResource("depleted-resource", { x: 6, y: 2 }),
      isDepleted: true,
      quantity: 0,
    };
    const fallbackResource = createResource("party-resource", { x: 36, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, invalidResource, fallbackResource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "resource",
      targetEntityId: fallbackResource.id,
    });
    expect(nextState.localPoiTarget?.targetEntityId).not.toBe(invalidResource.id);
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: fallbackResource.id,
    });
  });

  it("lets a gatherer leader make their claimed resource the whole-party POI", () => {
    const leader = {
      ...createCompanion("leader", { x: 5, y: 2 }, "leader", "gatherer", 0),
      state: "gather" as const,
      currentTargetId: "leader-resource",
    };
    const resource = createResource("leader-resource", { x: 6, y: 2 });
    const enemy = createEnemy("fallback-enemy", { x: 30, y: 2 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, resource, enemy], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        quests: createQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget).toMatchObject({
      category: "resource",
      targetEntityId: resource.id,
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "gather",
      targetId: resource.id,
    });
    expect(nextState.entities[leader.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("keeps autonomous gatherers rejoining when the leader is beyond gatherer leash", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 35, y: 2 }, leader.id, "gatherer"),
      state: "idle" as const,
      currentTargetId: null,
    };
    const resource = createResource("gatherer-resource", { x: 36, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("switches active autonomous gatherers to follow when the leader moves beyond gatherer leash", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const resource = createResource("gatherer-resource", { x: 36, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 35, y: 2 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: resource.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("allows same-subzone autonomous gatherer resources beyond leader leash", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 35, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("same-subzone-resource", { x: 36, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createSingleSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("keeps same-subzone gatherers on resources after yielding beyond leader leash", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 35, y: 2 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: "same-subzone-resource",
      lastGatherAt: 0,
    };
    const resource = createResource("same-subzone-resource", { x: 36, y: 2 }, {
      durability: 1,
      maxDurability: 1,
      quantity: 2,
    });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createSingleSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        quests: createQuestStates(),
      }),
      { nowMs: 2_000 },
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("ignores cross-subzone autonomous gatherer resources beyond leader leash", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 35, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("cross-subzone-resource", { x: 36, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: false,
        },
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("keeps direct gather commands active even when the leader is far away", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const resource = createResource("direct-resource", { x: 24, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 23, y: 2 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
    };

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
  });

  it("does not acquire autonomous gatherer resources beyond search range", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("outside-search-range", { x: 36, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("does not acquire autonomous gatherer resources beyond leader leash even when inside search range", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 30, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("outside-leash-resource", { x: 35, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("uses path-distance search range for gatherer resource acquisition", () => {
    const leader = createLeader({ x: 8, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 8, y: 3 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("detour-resource", { x: 12, y: 3 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createDetourTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 8, y: 10 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("uses path-distance search range for same-subzone resources", () => {
    const leader = createLeader({ x: 8, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 8, y: 3 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("detour-resource", { x: 12, y: 3 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createDetourTestMap({ withSubzone: true }),
        poiPreferences: {
          stayInMap: true,
        },
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 8, y: 10 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("keeps autonomous gatherers inside the leader subzone when the preference is on", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 3 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("outside-subzone-resource", { x: 21, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 18, y: 10 },
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
  });

  it("lets autonomous gatherers choose outside-subzone resources when the preference is off", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 3 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("outside-subzone-resource", { x: 21, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: false,
        },
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 18, y: 10 },
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("keeps autonomous gatherers focused on same-subzone resources when nearby enemies aggro", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 3 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("same-subzone-resource", { x: 12, y: 2 });
    const enemy = createEnemy("nearby-aggressive-enemy", { x: 16, y: 3 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource, enemy], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 18, y: 10 },
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("keeps direct gather commands outside the leader subzone active", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const resource = createResource("outside-subzone-resource", { x: 21, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 3 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
    };

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 18, y: 10 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
  });

  it("lets autonomous gatherers leave fallback combat for nearby resources", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const enemy = createEnemy("fallback-enemy", { x: 7, y: 2 });
    const resource = createResource("priority-resource", { x: 6, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "attack" as const,
      currentTargetId: enemy.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, gatherer, enemy, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "attack",
          targetId: enemy.id,
          targetPosition: enemy.position,
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("lets autonomous gatherers leave fallback combat for resources inside the leader subzone", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const enemy = createEnemy("fallback-enemy", { x: 21, y: 2 });
    const resource = createResource("inside-subzone-resource", { x: 12, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 14, y: 2 }, leader.id, "gatherer"),
      state: "attack" as const,
      currentTargetId: enemy.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, gatherer, enemy, resource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        leaderIntent: {
          type: "attack",
          targetId: enemy.id,
          targetPosition: enemy.position,
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
    });
  });

  it("keeps autonomous gatherers in fallback combat when no allowed resource is nearby", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const enemy = createEnemy("fallback-enemy", { x: 21, y: 2 });
    const resource = createResource("outside-subzone-resource", { x: 21, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 18, y: 3 }, leader.id, "gatherer"),
      state: "attack" as const,
      currentTargetId: enemy.id,
    };

    const nextState = updateGame(
      createMapOneState([leader, gatherer, enemy, resource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        leaderIntent: {
          type: "attack",
          targetId: enemy.id,
          targetPosition: enemy.position,
          source: "ai",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "attack",
      currentTargetId: enemy.id,
    });
  });

  it("keeps direct player move intent when aggressive enemies threaten autonomous gatherers", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const depletedResource = {
      ...createResource("depleted-resource", { x: 6, y: 2 }),
      isDepleted: true,
      quantity: 0,
    };
    const enemy = createEnemy("nearby-aggressive-enemy", { x: 7, y: 2 }, "aggressive");

    const nextState = updateGame(
      createMapOneState([leader, gatherer, depletedResource, enemy], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 20, y: 2 },
          source: "player",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
    });
    expect(nextState.leaderIntent).toMatchObject({
      type: "move",
      targetPosition: { x: 20, y: 2 },
      source: "player",
    });
  });

  it("clears auto POI during player move and keeps gatherers on the player order", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 5, y: 2 }, leader.id, "gatherer"),
      state: "follow" as const,
      currentTargetId: leader.id,
    };
    const resource = createResource("gatherer-resource", { x: 6, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, gatherer, resource], {
        partyLeaderId: leader.id,
        map: createOpenTestMap(),
        leaderIntent: {
          type: "move",
          targetId: null,
          targetPosition: { x: 15, y: 2 },
          source: "player",
        },
        localPoiTarget: {
          poiId: "stale-poi",
          category: "resource",
          mapId: MAP_ONE_ID,
          position: resource.position,
          targetEntityId: resource.id,
          reason: "stale test poi",
        },
        globalPoiIntent: {
          type: "idle",
          reason: "stale test intent",
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.globalPoiIntent).toBeNull();
    expect(nextState.localPoiTarget).toBeNull();
    expect(nextState.leaderIntent).toMatchObject({
      type: "move",
      source: "player",
    });
    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: leader.id,
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

  it("does not choose hub Merchant quick exchange before the equipment tutorial is accepted", () => {
    const leader = createLeader({ x: 7, y: 20 });
    const stateWithJunk = addItemToInventoryState(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        quests: createQuestStates({
          outfit_the_expedition: "available",
        }),
      }),
      "wolf_pelt",
      1,
    ).state;

    const nextState = updateGame(stateWithJunk);

    expect(nextState.localPoiTarget?.poiId).not.toBe(npcIds[1]);
    expect(nextState.localPoiTarget?.reason).toBe("accept available quest");
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

  it("maps legacy Stay in Subzone preferences to the new POI search scope", () => {
    const state = createTestGameState();
    const subzoneState = setStayInMapEnabled(state, true);
    const freeTravelState = setStayInMapEnabled(subzoneState, false);
    const zoneOnlyState = setPoiSearchScope(freeTravelState, "zone_only");

    expect(getPoiSearchScope(subzoneState)).toBe("subzone_only");
    expect(subzoneState.poiPreferences.stayInMap).toBe(true);
    expect(getPoiSearchScope(freeTravelState)).toBe("free_travel");
    expect(freeTravelState.poiPreferences.stayInMap).toBe(false);
    expect(getPoiSearchScope(zoneOnlyState)).toBe("zone_only");
    expect(zoneOnlyState.poiPreferences.stayInMap).toBe(false);
  });

  it("Free Travel routes cross-map quest delivery through teleports", () => {
    const leader = createLeader({ x: 10, y: 12 });

    const nextState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: false,
          searchScope: "free_travel",
        },
        quests: createQuestStates({
          clear_the_shore: "ready_to_turn_in",
        }),
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-1-to-hub");
    expect(nextState.localPoiTarget?.reason).toBe("route toward hub");
  });

  it("Zone Only blocks autonomous cross-map quest routing and chooses a local fallback", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const localEnemy = createEnemy("zone-local-enemy", { x: 4, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, localEnemy], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: false,
          searchScope: "zone_only",
        },
        quests: createQuestStates({
          clear_the_shore: "ready_to_turn_in",
        }),
      }),
    );

    expect(nextState.localPoiTarget?.category).toBe("combat");
    expect(nextState.leaderIntent?.targetId).toBe(localEnemy.id);
  });

  it("Stay in Subzone blocks cross-map quest delivery and chooses a local fallback", () => {
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

  it("Stay in Subzone still allows same-subzone active quest objectives", () => {
    const leader = createLeader({ x: 2, y: 2 });
    const questEnemy = createEnemy("quest-enemy", { x: 4, y: 2 }, undefined, {
      archetypeId: "slime",
      subzoneId: "shore-fringe",
    });

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

  it("Stay in Subzone still allows local hub quest turn-in", () => {
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

  it("Stay in Subzone blocks hub routing toward a wild objective", () => {
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

  it("routes world travel from hub toward map 4 through map 1", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_FOUR_ID,
      }),
    );

    expect(nextState.globalPoiIntent?.type).toBe("travel_to_map");
    expect(nextState.localPoiTarget?.poiId).toBe("hub-to-map-1");
    expect(nextState.localPoiTarget?.reason).toBe("world route toward map-4");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 1 toward map 2 directly", () => {
    const leader = createLeader({ x: 70, y: 12 });

    const nextState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_TWO_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-1-to-map-2");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 1 toward map 4 through map 2", () => {
    const leader = createLeader({ x: 70, y: 12 });

    const nextState = updateGame(
      createMapOneState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_FOUR_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-1-to-map-2");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 2 toward map 4 through map 3", () => {
    const leader = createLeader({ x: 130, y: 12 });

    const nextState = updateGame(
      createMapTwoState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_FOUR_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-2-to-map-3");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 3 toward map 4 directly", () => {
    const leader = createLeader({ x: 80, y: 12 });

    const nextState = updateGame(
      createMapThreeState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: MAP_FOUR_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-3-to-map-4");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 4 toward hub through map 3", () => {
    const leader = createLeader({ x: 130, y: 12 });

    const nextState = updateGame(
      createMapFourState([leader], {
        partyLeaderId: leader.id,
        worldTravelTargetMapId: HUB_MAP_ID,
      }),
    );

    expect(nextState.localPoiTarget?.poiId).toBe("map-4-to-map-3");
    expect(nextState.leaderIntent?.type).toBe("move");
  });

  it("routes world travel from map 2 toward hub through map 1", () => {
    const leader = createLeader({ x: 70, y: 12 });

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

  it("Stay in Subzone filters local fallback POI candidates to the leader subzone", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const outsideEnemy = createEnemy("outside-subzone-enemy", { x: 21, y: 2 });
    const insideResource = createResource("inside-subzone-resource", { x: 12, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, outsideEnemy, insideResource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: true,
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget?.targetEntityId).toBe(insideResource.id);
    expect(nextState.localPoiTarget?.category).toBe("resource");
  });

  it("allows local fallback POI candidates outside the leader subzone when preference is off", () => {
    const leader = createLeader({ x: 18, y: 2 });
    const outsideEnemy = createEnemy("outside-subzone-enemy", { x: 21, y: 2 });
    const insideResource = createResource("inside-subzone-resource", { x: 12, y: 2 });

    const nextState = updateGame(
      createMapOneState([leader, outsideEnemy, insideResource], {
        partyLeaderId: leader.id,
        map: createSubzoneTestMap(),
        poiPreferences: {
          stayInMap: false,
        },
        quests: createQuestStates(),
      }),
    );

    expect(nextState.localPoiTarget?.targetEntityId).toBe(outsideEnemy.id);
    expect(nextState.localPoiTarget?.category).toBe("combat");
  });

  it("world travel ignores Stay in Subzone", () => {
    const leader = createLeader({ x: 22, y: 13 });

    const nextState = updateGame(
      createHubState([leader, ...createHubNpcs()], {
        partyLeaderId: leader.id,
        poiPreferences: {
          stayInMap: true,
        },
        worldTravelTargetMapId: MAP_FOUR_ID,
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

function defeatedEnemy(id: string, position: Position) {
  return {
    ...createEnemy(id, position),
    state: "dead" as const,
    health: 0,
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

function createMapThreeState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_THREE_ID,
      map: createDebugMap(MAP_THREE_ID),
      activeTeleport: null,
      exploredTiles: {},
      ...overrides,
    }),
  );
}

function createMapFourState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      autoModeEnabled: true,
      currentMapId: MAP_FOUR_ID,
      map: createDebugMap(MAP_FOUR_ID),
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

function createOpenTestMap(): GameMap {
  return {
    id: MAP_ONE_ID,
    displayName: "Open Test Map",
    debugName: "open-test-map",
    columns: 40,
    rows: 20,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

function createMossyQuestTestMap(): GameMap {
  return {
    ...createOpenTestMap(),
    subzones: [
      createTestSubzone("mossy-glade", "Mossy Glade", {
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      }),
    ],
  };
}

function createWideOpenTestMap(): GameMap {
  return {
    ...createOpenTestMap(),
    displayName: "Wide Open Test Map",
    debugName: "wide-open-test-map",
    columns: 200,
    rows: 60,
  };
}

function createSubzoneTestMap(): GameMap {
  const subzones: ZoneSubzone[] = [
    createTestSubzone("west-test-subzone", "West Test Subzone", {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    }),
    createTestSubzone("east-test-subzone", "East Test Subzone", {
      x: 20,
      y: 0,
      width: 20,
      height: 20,
    }),
  ];

  return {
    ...createOpenTestMap(),
    subzones,
  };
}

function createSingleSubzoneTestMap(): GameMap {
  return {
    ...createOpenTestMap(),
    subzones: [
      createTestSubzone("single-test-subzone", "Single Test Subzone", {
        x: 0,
        y: 0,
        width: 40,
        height: 20,
      }),
    ],
  };
}

function createDetourTestMap(options: { withSubzone?: boolean } = {}): GameMap {
  const map: GameMap = {
    id: MAP_ONE_ID,
    displayName: "Detour Test Map",
    debugName: "detour-test-map",
    columns: 30,
    rows: 30,
    walls: Array.from({ length: 25 }, (_, y) => ({ x: 10, y })),
    teleports: [],
    healingFountains: [],
  };

  if (!options.withSubzone) {
    return map;
  }

  return {
    ...map,
    subzones: [
      createTestSubzone("detour-test-subzone", "Detour Test Subzone", {
        x: 0,
        y: 0,
        width: 30,
        height: 30,
      }),
    ],
  };
}

function createTestSubzone(
  id: string,
  displayName: string,
  bounds: ZoneSubzone["bounds"],
): ZoneSubzone {
  return {
    id,
    displayName,
    bounds,
    levelRange: {
      min: 1,
      max: 1,
    },
    enemyArchetypeIds: [],
    encounterAreas: [],
    resourceLocations: [],
    passages: [],
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

function createActiveGuideQuestStates() {
  const quests = createQuestStates({
    gather_expedition_supplies: "active",
  });

  markObjectiveCompleted(
    quests,
    "gather_expedition_supplies",
    "gather_mossy_glade_herbs",
    3,
  );
  markObjectiveCompleted(
    quests,
    "gather_expedition_supplies",
    "defeat_mossy_glade_bats",
    20,
  );

  return quests;
}

function createPostGuideQuestStates() {
  const quests = createQuestStates({
    gather_expedition_supplies: "active",
  });

  markObjectiveCompleted(
    quests,
    "gather_expedition_supplies",
    "guide_mossy_glade_surveyor",
    1,
  );

  return quests;
}

function markObjectiveCompleted(
  quests: ReturnType<typeof createInitialQuestStates>,
  questId: QuestId,
  objectiveId: string,
  currentCount: number,
) {
  quests[questId].objectiveProgress[objectiveId] = {
    objectiveId,
    currentCount,
    completed: true,
  };
}
