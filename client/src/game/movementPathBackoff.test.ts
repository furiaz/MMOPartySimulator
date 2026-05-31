import { describe, expect, it } from "vitest";
import { createEnemy, createNpc, createResource } from ".";
import { markMoveFailed } from "./movementState";
import { consumeGamePerformanceMetrics } from "./performanceMetrics";
import {
  getEntityById,
} from "./state";
import {
  getBoundedPathDistance,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
} from "./movementPlanning";
import { updateDirectCompanionCommandSystem } from "./directCompanionCommands";
import { createTestGameState } from "./testState";
import type { Companion, GameEntity, GameMap, Position } from "./types";

const blockedMap: GameMap = {
  debugName: "Blocked Path Test Map",
  displayName: "Blocked Path Test Map",
  columns: 6,
  rows: 3,
  walls: [
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ],
  teleports: [],
  healingFountains: [],
};

const detourMap: GameMap = {
  debugName: "Detour Path Test Map",
  displayName: "Detour Path Test Map",
  columns: 6,
  rows: 5,
  walls: [
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 3 },
    { x: 2, y: 4 },
  ],
  teleports: [],
  healingFountains: [],
};

const openMap: GameMap = {
  debugName: "Open Path Test Map",
  displayName: "Open Path Test Map",
  columns: 6,
  rows: 5,
  walls: [],
  teleports: [],
  healingFountains: [],
};

const singleRowMap: GameMap = {
  debugName: "Single Row Path Test Map",
  displayName: "Single Row Path Test Map",
  columns: 5,
  rows: 1,
  walls: [],
  teleports: [],
  healingFountains: [],
};

const singleRowWallMap: GameMap = {
  ...singleRowMap,
  walls: [{ x: 2, y: 0 }],
};

const noGoalMap: GameMap = {
  debugName: "No Goal Path Test Map",
  displayName: "No Goal Path Test Map",
  columns: 6,
  rows: 3,
  walls: [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 5, y: 1 },
  ],
  teleports: [],
  healingFountains: [],
};

const companion = {
  id: "companion-1",
  kind: "companion",
  position: { x: 1, y: 1 },
  state: "follow",
  health: 10,
  maxHealth: 10,
  lastAttackAt: 0,
  classId: "beginner",
  characterLevel: 1,
  characterXp: 0,
  lastCharacterXpGained: 0,
  naturalStats: {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    intelligence: 1,
    wisdom: 1,
  },
  allocatedStats: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
  },
  unspentStatPoints: 0,
  role: "fighter",
  partyOrder: 0,
  followTargetId: null,
  defendPosition: null,
  currentTargetId: null,
  lastGatherAt: 0,
  gatherSpeed: 1,
  commandPriority: "autonomous",
  equipment: {},
  consumables: {},
  consumableBuffs: [],
  consumableBehavior: "auto",
} as unknown as Companion;

function createCompanion(overrides: Partial<Companion> = {}): Companion {
  return {
    ...companion,
    ...overrides,
    position: overrides.position ?? companion.position,
  };
}

function createStateWithCachedFollowPath({
  entity,
  extraEntities = [],
  map = openMap,
  simulationDeltaMs = 100,
  targetPosition,
  waypoint,
}: {
  entity: GameEntity;
  extraEntities?: GameEntity[];
  map?: GameMap;
  simulationDeltaMs?: number;
  targetPosition: Position;
  waypoint: Position;
}) {
  return createTestGameState({
    entities: Object.fromEntries(
      [entity, ...extraEntities].map((currentEntity) => [
        currentEntity.id,
        currentEntity,
      ]),
    ),
    map,
    movementPathsByEntityId: {
      [entity.id]: {
        blockedCount: 0,
        lastRequestedAtMs: 100,
        profile: "follow",
        targetKey: "follow:__position_target__:follow:leader:solid-party",
        targetPosition,
        waypoints: [waypoint],
      },
    },
    simulationDeltaMs,
    simulationTimeMs: 100,
  });
}

describe("movement path backoff", () => {
  it("does not request a full navigation path for a walkable direct step", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: openMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(getEntityById(nextState, companion.id)?.position.x).toBeGreaterThan(
      companion.position.x,
    );
  });

  it("keeps reserved positions unavailable for movement", () => {
    const reservedStep = { x: 1.8, y: 1 };
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      failedMoveByEntityId: {
        [companion.id]: true,
      },
      reservedPositionsByEntityId: {
        other: reservedStep,
      },
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
    );

    expect(getEntityById(nextState, companion.id)?.position).toEqual(
      companion.position,
    );
    expect(nextState.failedMoveByEntityId?.[companion.id]).toBe(true);
    expect(nextState.reservedPositionsByEntityId?.[companion.id]).toBeUndefined();
  });

  it("uses a cached path before direct movement toward the final target", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: openMap,
      movementPathsByEntityId: {
        [companion.id]: {
          blockedCount: 0,
          lastRequestedAtMs: 100,
          profile: "follow",
          targetKey: "follow:__position_target__:follow:leader:solid-party",
          targetPosition: { x: 4, y: 1 },
          waypoints: [{ x: 1, y: 2 }],
        },
      },
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    const movedCompanion = getEntityById(nextState, companion.id);

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
    expect(movedCompanion?.position.y).toBeGreaterThan(companion.position.y);
  });

  it("lets companions move through static passive NPCs", () => {
    const movingCompanion = {
      ...companion,
      position: { x: 1, y: 1 },
    };
    const questGiver = createNpc(
      "quest-giver",
      { x: 1.8, y: 1 },
      "Quest Giver",
      "quest_giver",
    );
    const state = createStateWithCachedFollowPath({
      entity: movingCompanion,
      extraEntities: [questGiver],
      targetPosition: { x: 4, y: 1 },
      waypoint: { x: 4, y: 1 },
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      { x: 4, y: 1 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    expect(getEntityById(nextState, movingCompanion.id)?.position.x).toBeGreaterThan(
      movingCompanion.position.x,
    );
    expect(nextState.movementFailuresByEntityId?.[movingCompanion.id]).toBeUndefined();
  });

  it("swaps party members that are moving into each other's positions", () => {
    const firstCompanion = createCompanion({
      id: "first-companion",
      position: { x: 1, y: 1 },
    });
    const secondCompanion = createCompanion({
      id: "second-companion",
      position: { x: 1.8, y: 1 },
    });
    const state = createTestGameState({
      entities: {
        [firstCompanion.id]: firstCompanion,
        [secondCompanion.id]: secondCompanion,
      },
      moveIntentsByEntityId: {
        [secondCompanion.id]: firstCompanion.position,
      },
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      firstCompanion,
      { x: 4, y: 1 },
    );

    expect(getEntityById(nextState, firstCompanion.id)?.position).toEqual(
      secondCompanion.position,
    );
    expect(getEntityById(nextState, secondCompanion.id)?.position).toEqual(
      firstCompanion.position,
    );
  });

  it("keeps static passive NPCs solid for enemies", () => {
    const enemy = createEnemy("enemy", { x: 1, y: 1 });
    const questGiver = createNpc(
      "quest-giver",
      { x: 1.116, y: 1 },
      "Quest Giver",
      "quest_giver",
    );
    const state = createStateWithCachedFollowPath({
      entity: enemy,
      extraEntities: [questGiver],
      targetPosition: { x: 4, y: 1 },
      waypoint: { x: 4, y: 1 },
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      enemy,
      { x: 4, y: 1 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    expect(getEntityById(nextState, enemy.id)?.position).toEqual(enemy.position);
    expect(nextState.failedMoveByEntityId?.[enemy.id]).toBe(true);
  });

  it("keeps resources and enemies solid for companion movement", () => {
    const movingCompanion = {
      ...companion,
      position: { x: 1, y: 1 },
    };
    const resource = createResource("wood", { x: 1.8, y: 1 });
    const enemy = createEnemy("enemy", { x: 1, y: 1.8 });

    for (const blocker of [resource, enemy]) {
      const state = createStateWithCachedFollowPath({
        entity: movingCompanion,
        extraEntities: [blocker],
        targetPosition:
          blocker.kind === "resource" ? { x: 4, y: 1 } : { x: 1, y: 4 },
        waypoint:
          blocker.kind === "resource" ? { x: 4, y: 1 } : { x: 1, y: 4 },
      });

      const nextState = moveEntityTowardPositionIfUnoccupied(
        state,
        movingCompanion,
        blocker.kind === "resource" ? { x: 4, y: 1 } : { x: 1, y: 4 },
        {
          pathProfile: "follow",
          pathTargetKey: "follow:leader",
          pathTargetPosition:
            blocker.kind === "resource" ? { x: 4, y: 1 } : { x: 1, y: 4 },
        },
      );

      expect(getEntityById(nextState, movingCompanion.id)?.position).toEqual(
        movingCompanion.position,
      );
      expect(nextState.failedMoveByEntityId?.[movingCompanion.id]).toBe(true);
    }
  });

  it("keeps quest guide NPC movement collision unchanged without party pass-through", () => {
    const movingCompanion = {
      ...companion,
      position: { x: 1, y: 1 },
    };
    const questGuide = createNpc(
      "quest-guide",
      { x: 1.8, y: 1 },
      "Guide",
      "quest_guide",
    );
    const state = createStateWithCachedFollowPath({
      entity: movingCompanion,
      extraEntities: [questGuide],
      targetPosition: { x: 4, y: 1 },
      waypoint: { x: 4, y: 1 },
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      { x: 4, y: 1 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    expect(getEntityById(nextState, movingCompanion.id)?.position).toEqual(
      movingCompanion.position,
    );
    expect(nextState.failedMoveByEntityId?.[movingCompanion.id]).toBe(true);
  });

  it("moves through the Quest Giver stall shape from telemetry", () => {
    const stalledCompanion = {
      ...companion,
      position: { x: 42.63793423203175, y: 28.611057129586612 },
    };
    const questGiver = createNpc(
      "quest-giver",
      { x: 43, y: 28 },
      "Quest Giver",
      "quest_giver",
    );
    const state = createStateWithCachedFollowPath({
      entity: stalledCompanion,
      extraEntities: [questGiver],
      map: {
        debugName: "Telemetry Stall Test Map",
        displayName: "Telemetry Stall Test Map",
        columns: 60,
        rows: 40,
        walls: [],
        teleports: [],
        healingFountains: [],
      },
      simulationDeltaMs: 17,
      targetPosition: { x: 49.65198495218459, y: 29.26854669743356 },
      waypoint: { x: 44, y: 29 },
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      stalledCompanion,
      { x: 49.65198495218459, y: 29.26854669743356 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 49.65198495218459, y: 29.26854669743356 },
      },
    );

    expect(getEntityById(nextState, stalledCompanion.id)?.position.x).toBeGreaterThan(
      stalledCompanion.position.x,
    );
    expect(nextState.movementFailuresByEntityId?.[stalledCompanion.id]).toBeUndefined();
  });

  it("reuses a static profile path for a stable target", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: detourMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const firstMoveState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "gather",
        pathTargetKey: "gather:wood",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );
    const afterFirstMoveMetrics = consumeGamePerformanceMetrics();
    const movedCompanion = getEntityById(firstMoveState, companion.id) as Companion;
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      firstMoveState,
      movedCompanion,
      { x: 4, y: 1 },
      {
        pathProfile: "gather",
        pathTargetKey: "gather:wood",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    expect(afterFirstMoveMetrics.navigationPathQueries).toBe(1);
    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("throttles combat path refreshes while the target stays in the same navigation cell", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: detourMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    const firstMoveState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "chase",
        pathTargetKey: "chase:enemy",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );
    const movedCompanion = getEntityById(firstMoveState, companion.id) as Companion;
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      {
        ...firstMoveState,
        simulationTimeMs: 200,
      },
      movedCompanion,
      { x: 4.4, y: 1 },
      {
        pathProfile: "chase",
        pathTargetKey: "chase:enemy",
        pathTargetPosition: { x: 4.4, y: 1 },
      },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("does not generate full navigation paths while previewing movement", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      simulationTimeMs: 100,
    });
    consumeGamePerformanceMetrics();

    previewMoveTowardPosition(state, companion, { x: 4, y: 1 });

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("keeps a blocked cached path after one failed waypoint step", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      movementPathsByEntityId: {
        [companion.id]: {
          blockedCount: 0,
          lastRequestedAtMs: 100,
          profile: "follow",
          targetKey: "follow:__position_target__:follow:leader:solid-party",
          targetPosition: { x: 4, y: 1 },
          waypoints: [{ x: 2, y: 1 }],
        },
      },
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
      {
        pathProfile: "follow",
        pathTargetKey: "follow:leader",
        pathTargetPosition: { x: 4, y: 1 },
      },
    );

    expect(nextState.movementPathsByEntityId?.[companion.id]).toMatchObject({
      blockedCount: 1,
      waypoints: [{ x: 2, y: 1 }],
    });
  });

  it("does not regenerate full navigation paths while retry backoff is active", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      simulationTimeMs: 100,
      movementPathRetryAtMsByEntityId: {
        [companion.id]: 250,
      },
    });
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBe(0);
  });

  it("does not extend active path retry backoff on repeated failures", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      movementPathRetryAtMsByEntityId: {
        [companion.id]: 250,
      },
      simulationTimeMs: 100,
    });

    const firstFailureState = markMoveFailed(
      state,
      companion.id,
      {},
      "no_path",
    );
    const secondFailureState = markMoveFailed(
      {
        ...firstFailureState,
        simulationTimeMs: 150,
      },
      companion.id,
      {},
      "no_path",
    );

    expect(
      firstFailureState.movementPathRetryAtMsByEntityId?.[companion.id],
    ).toBe(250);
    expect(
      secondFailureState.movementPathRetryAtMsByEntityId?.[companion.id],
    ).toBe(250);
  });

  it("regenerates navigation paths after retry backoff expires", () => {
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
      map: blockedMap,
      simulationTimeMs: 300,
      movementPathRetryAtMsByEntityId: {
        [companion.id]: 250,
      },
    });
    consumeGamePerformanceMetrics();

    moveEntityTowardPositionIfUnoccupied(
      state,
      companion,
      { x: 4, y: 1 },
    );

    expect(consumeGamePerformanceMetrics().navigationPathQueries).toBeGreaterThan(0);
  });

  it("keeps bounded path distance blocked by walls, resources, and reservations", () => {
    const movingCompanion = createCompanion({
      position: { x: 0, y: 0 },
    });
    const resource = createResource("wood", { x: 2, y: 0 });
    const openState = createTestGameState({
      entities: {
        [movingCompanion.id]: movingCompanion,
      },
      map: singleRowMap,
    });

    expect(
      getBoundedPathDistance(openState, movingCompanion, { x: 4, y: 0 }, 10),
    ).toBe(4);
    expect(
      getBoundedPathDistance(
        {
          ...openState,
          map: singleRowWallMap,
        },
        movingCompanion,
        { x: 4, y: 0 },
        10,
      ),
    ).toBeNull();
    expect(
      getBoundedPathDistance(
        {
          ...openState,
          entities: {
            ...openState.entities,
            [resource.id]: resource,
          },
        },
        movingCompanion,
        { x: 4, y: 0 },
        10,
      ),
    ).toBeNull();
    expect(
      getBoundedPathDistance(
        {
          ...openState,
          reservedPositionsByEntityId: {
            other: { x: 2, y: 0 },
          },
        },
        movingCompanion,
        { x: 4, y: 0 },
        10,
      ),
    ).toBeNull();
  });

  it("reports target_unwalkable path failure detail for wall targets", () => {
    const movingCompanion = createCompanion({
      position: { x: 1.49, y: 1 },
    });
    const state = createTestGameState({
      entities: {
        [movingCompanion.id]: movingCompanion,
      },
      failedMoveByEntityId: {
        [movingCompanion.id]: true,
      },
      map: blockedMap,
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      { x: 2, y: 1 },
    );

    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.pathFailureReason,
    ).toBe("target_unwalkable");
    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.targetCellWalkable,
    ).toBe(false);
  });

  it("reports target_blocked path failure detail with blocker attribution", () => {
    const movingCompanion = createCompanion();
    const blockingCompanion = createCompanion({
      id: "companion-blocker",
      position: { x: 4, y: 1 },
    });
    const state = createTestGameState({
      entities: {
        [movingCompanion.id]: movingCompanion,
        [blockingCompanion.id]: blockingCompanion,
      },
      failedMoveByEntityId: {
        [movingCompanion.id]: true,
      },
      map: blockedMap,
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      blockingCompanion.position,
    );
    const detail = nextState.movementFailuresByEntityId?.[movingCompanion.id];

    expect(detail?.pathFailureReason).toBe("target_blocked");
    expect(detail?.targetCellBlockedBy).toEqual({
      id: blockingCompanion.id,
      kind: "companion",
    });
    expect(detail?.resolvedGoalCells?.length).toBeGreaterThan(0);
  });

  it("reports unreachable path failure detail for separated valid targets", () => {
    const movingCompanion = createCompanion();
    const state = createTestGameState({
      entities: {
        [movingCompanion.id]: movingCompanion,
      },
      failedMoveByEntityId: {
        [movingCompanion.id]: true,
      },
      map: blockedMap,
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      { x: 4, y: 1 },
    );

    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.pathFailureReason,
    ).toBe("unreachable");
    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.freshPathAttempted,
    ).toBe(true);
  });

  it("reports path_backoff when a fresh path is skipped by retry timing", () => {
    const movingCompanion = createCompanion();
    const state = createTestGameState({
      entities: {
        [movingCompanion.id]: movingCompanion,
      },
      failedMoveByEntityId: {
        [movingCompanion.id]: true,
      },
      map: blockedMap,
      movementPathRetryAtMsByEntityId: {
        [movingCompanion.id]: 250,
      },
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      { x: 4, y: 1 },
    );

    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.pathFailureReason,
    ).toBe("path_backoff");
    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.freshPathAttempted,
    ).toBe(false);
  });

  it("reports no_goals when no valid path goal cells exist", () => {
    const movingCompanion = createCompanion();
    const blockingCompanion = createCompanion({
      id: "companion-blocker",
      position: { x: 4, y: 1 },
    });
    const state = createTestGameState({
      entities: {
        [movingCompanion.id]: movingCompanion,
        [blockingCompanion.id]: blockingCompanion,
      },
      failedMoveByEntityId: {
        [movingCompanion.id]: true,
      },
      map: noGoalMap,
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      blockingCompanion.position,
    );

    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.pathFailureReason,
    ).toBe("no_goals");
    expect(
      nextState.movementFailuresByEntityId?.[movingCompanion.id]?.resolvedGoalCells,
    ).toEqual([]);
  });

  it("adds nearby-cell summaries only when deep navigation telemetry is enabled", () => {
    const movingCompanion = createCompanion();
    const blockingCompanion = createCompanion({
      id: "companion-blocker",
      position: { x: 4, y: 1 },
    });
    const state = createTestGameState({
      debugOptions: {
        superSpeedEnabled: false,
        superExpEnabled: false,
        deepNavigationTelemetryEnabled: true,
      },
      entities: {
        [movingCompanion.id]: movingCompanion,
        [blockingCompanion.id]: blockingCompanion,
      },
      failedMoveByEntityId: {
        [movingCompanion.id]: true,
      },
      map: noGoalMap,
      simulationTimeMs: 100,
    });

    const nextState = moveEntityTowardPositionIfUnoccupied(
      state,
      movingCompanion,
      blockingCompanion.position,
    );
    const detail = nextState.movementFailuresByEntityId?.[movingCompanion.id];

    expect(detail?.nearbyReachableCellCount).toBe(0);
    expect(detail?.nearbyBlockedCellSummary).toEqual({ wall: 4 });
  });

  it("records direct-command-shaped no_path detail without clearing the command", () => {
    const movingCompanion = createCompanion();
    const state = createTestGameState({
      entities: {
        [movingCompanion.id]: movingCompanion,
      },
      failedMoveByEntityId: {
        [movingCompanion.id]: true,
      },
      map: blockedMap,
      directCompanionCommandsById: {
        [movingCompanion.id]: {
          type: "move",
          companionId: movingCompanion.id,
          targetPosition: { x: 4, y: 1 },
          issuedAt: 100,
        },
      },
      simulationTimeMs: 100,
    });

    const nextState = updateDirectCompanionCommandSystem(
      state,
      new Set<string>(),
      100,
    );
    const movedCompanion = getEntityById(nextState, movingCompanion.id) as Companion;
    const detail = nextState.movementFailuresByEntityId?.[movingCompanion.id];

    expect(movedCompanion.commandPriority).toBe("direct");
    expect(nextState.directCompanionCommandsById?.[movingCompanion.id]?.type).toBe(
      "move",
    );
    expect(detail?.pathFailureReason).toBe("unreachable");
    expect(detail?.requestedTargetCell).toEqual({ x: 4, y: 1 });
    expect(detail?.resolvedGoalCells).toEqual([{ x: 4, y: 1 }]);
  });
});
