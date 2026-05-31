import { describe, expect, it } from "vitest";
import { HUB_MAP_ID, MAP_FOUR_ID, MAP_ONE_ID } from "./debugMap";
import {
  clearPartyIntent,
  getPartyExecutionIntent,
  hasDirectPlayerLeaderIntent,
  hasDirectPlayerPartyIntent,
  queuePartyIntent,
  restoreQueuedPartyIntent,
  setPartyExecutionIntent,
  setPartyIntent,
  setWorldTravelTargetMapId,
} from "./partyIntentState";
import { createTestGameState } from "./testState";
import type { LocalPoiTarget, PoiDecisionState } from "./questTypes";
import type { PartyExecutionIntent, PartyIntent } from "./types";

describe("party intent state helpers", () => {
  it("sets execution intent and mirrors it to leaderIntent", () => {
    const executionIntent = createMoveIntent();
    const nextState = setPartyExecutionIntent(
      createTestGameState(),
      executionIntent,
    );

    expect(nextState.leaderIntent).toBe(executionIntent);
    expect(nextState.partyIntent).toMatchObject({
      mode: "travel",
      source: "ai",
      executionIntent,
    });
    expect(nextState.partyIntent?.executionIntent).not.toBe(executionIntent);
  });

  it("clears execution intent while preserving queued recovery state", () => {
    const queuedIntent = {
      executionIntent: createMoveIntent(),
      globalPoiIntent: null,
      localPoiTarget: null,
      worldTravelTargetMapId: MAP_FOUR_ID,
    };
    const state = createTestGameState({
      globalPoiIntent: {
        type: "idle",
        reason: "waiting",
      },
      leaderIntent: createMoveIntent(),
      localPoiTarget: createLocalPoiTarget(),
      partyIntent: {
        mode: "resurrect",
        source: "ai",
        executionIntent: createMoveIntent(),
        globalPoiIntent: null,
        localPoiTarget: null,
        worldTravelTargetMapId: MAP_FOUR_ID,
        queuedIntent,
        recoveryIntent: {
          action: "resurrect",
          deadCompanionId: "companion-2",
          threatEnemyIds: [],
        },
      },
      worldTravelTargetMapId: MAP_ONE_ID,
    });

    const nextState = setPartyExecutionIntent(state, null);

    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.partyIntent).toMatchObject({
      mode: "resurrect",
      executionIntent: null,
      queuedIntent,
      recoveryIntent: {
        action: "resurrect",
        deadCompanionId: "companion-2",
      },
    });
    expect(nextState.partyIntent?.globalPoiIntent).toEqual(state.globalPoiIntent);
    expect(nextState.partyIntent?.localPoiTarget).toEqual(state.localPoiTarget);
  });

  it("mirrors party intent compatibility fields and clones local POI target position", () => {
    const localPoiTarget = createLocalPoiTarget();
    const partyIntent: PartyIntent = {
      mode: "travel",
      source: "player",
      executionIntent: createMoveIntent(),
      globalPoiIntent: {
        type: "travel_to_map",
        targetMapId: MAP_FOUR_ID,
        reason: "world route",
      },
      localPoiTarget,
      worldTravelTargetMapId: MAP_FOUR_ID,
      lastPoiDecision: createPoiDecisionState(),
    };

    const nextState = setPartyIntent(createTestGameState(), partyIntent);
    localPoiTarget.position.x = 99;

    expect(nextState.leaderIntent).toEqual(partyIntent.executionIntent);
    expect(nextState.globalPoiIntent).toEqual(partyIntent.globalPoiIntent);
    expect(nextState.localPoiTarget?.position).toEqual({ x: 4, y: 5 });
    expect(nextState.worldTravelTargetMapId).toBe(MAP_FOUR_ID);
    expect(nextState.lastPoiDecision).toEqual(partyIntent.lastPoiDecision);
  });

  it("creates and updates World Travel route intent", () => {
    const routeState = setWorldTravelTargetMapId(
      createTestGameState(),
      MAP_FOUR_ID,
    );
    const clearedState = setWorldTravelTargetMapId(routeState, null);

    expect(routeState.worldTravelTargetMapId).toBe(MAP_FOUR_ID);
    expect(routeState.partyIntent).toMatchObject({
      mode: "travel",
      source: "player",
      executionIntent: null,
      worldTravelTargetMapId: MAP_FOUR_ID,
    });
    expect(clearedState.worldTravelTargetMapId).toBeNull();
    expect(clearedState.partyIntent?.worldTravelTargetMapId).toBeNull();
    expect(clearedState.partyIntent?.source).toBe("player");
  });

  it("queues the current execution and POI intent snapshot", () => {
    const state = createTestGameState({
      globalPoiIntent: {
        type: "travel_to_map",
        targetMapId: MAP_FOUR_ID,
        reason: "world route",
      },
      lastPoiDecision: createPoiDecisionState(),
      leaderIntent: createMoveIntent(),
      localPoiTarget: createLocalPoiTarget(),
      worldTravelTargetMapId: MAP_FOUR_ID,
    });

    const nextState = queuePartyIntent(state);

    expect(nextState.partyIntent?.queuedIntent).toMatchObject({
      executionIntent: state.leaderIntent,
      globalPoiIntent: state.globalPoiIntent,
      localPoiTarget: state.localPoiTarget,
      worldTravelTargetMapId: MAP_FOUR_ID,
      lastPoiDecision: state.lastPoiDecision,
    });
    expect(nextState.partyIntent?.mode).toBe("travel");
  });

  it("restores queued intent and clears recovery state", () => {
    const queuedIntent = {
      executionIntent: createAttackIntent(),
      globalPoiIntent: {
        type: "idle" as const,
        reason: "waiting",
      },
      localPoiTarget: createLocalPoiTarget(),
      worldTravelTargetMapId: HUB_MAP_ID,
      lastPoiDecision: createPoiDecisionState(),
    };
    const state = createTestGameState({
      partyIntent: {
        mode: "resurrect",
        source: "ai",
        executionIntent: null,
        globalPoiIntent: null,
        localPoiTarget: null,
        worldTravelTargetMapId: MAP_FOUR_ID,
        queuedIntent,
        recoveryIntent: {
          action: "resurrect",
          deadCompanionId: "companion-2",
          threatEnemyIds: [],
        },
      },
    });

    const nextState = restoreQueuedPartyIntent(state);

    expect(nextState.partyIntent).toMatchObject({
      mode: "engage",
      executionIntent: queuedIntent.executionIntent,
      globalPoiIntent: queuedIntent.globalPoiIntent,
      localPoiTarget: queuedIntent.localPoiTarget,
      worldTravelTargetMapId: HUB_MAP_ID,
    });
    expect(nextState.partyIntent?.queuedIntent).toBeUndefined();
    expect(nextState.partyIntent?.recoveryIntent).toBeUndefined();
  });

  it("clears recovery intent when no queued intent exists", () => {
    const state = createTestGameState({
      partyIntent: {
        mode: "resurrect",
        source: "ai",
        executionIntent: null,
        globalPoiIntent: null,
        localPoiTarget: null,
        worldTravelTargetMapId: MAP_FOUR_ID,
        queuedIntent: null,
        recoveryIntent: {
          action: "resurrect",
          deadCompanionId: "companion-2",
          threatEnemyIds: [],
        },
      },
      worldTravelTargetMapId: MAP_FOUR_ID,
    });

    const nextState = restoreQueuedPartyIntent(state);

    expect(nextState.partyIntent).toBeNull();
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.worldTravelTargetMapId).toBe(MAP_FOUR_ID);
  });

  it("falls back to leaderIntent when partyIntent has no execution intent", () => {
    const leaderIntent = createMoveIntent();
    const state = createTestGameState({
      leaderIntent,
      partyIntent: null,
    });

    expect(getPartyExecutionIntent(state)).toBe(leaderIntent);
  });

  it("detects direct player party intent through both compatibility helpers", () => {
    const state = setPartyExecutionIntent(createTestGameState(), {
      ...createMoveIntent(),
      source: "player",
    });
    const clearedState = clearPartyIntent(state);

    expect(hasDirectPlayerPartyIntent(state)).toBe(true);
    expect(hasDirectPlayerLeaderIntent(state)).toBe(true);
    expect(hasDirectPlayerPartyIntent(clearedState)).toBe(false);
  });
});

function createMoveIntent(): PartyExecutionIntent {
  return {
    type: "move",
    targetId: null,
    targetPosition: { x: 2, y: 3 },
    source: "ai",
  };
}

function createAttackIntent(): PartyExecutionIntent {
  return {
    type: "attack",
    targetId: "enemy-1",
    targetPosition: { x: 8, y: 9 },
    source: "ai",
  };
}

function createLocalPoiTarget(): LocalPoiTarget {
  return {
    poiId: "poi-1",
    category: "teleport",
    mapId: MAP_ONE_ID,
    position: { x: 4, y: 5 },
    reason: "test POI",
  };
}

function createPoiDecisionState(): PoiDecisionState {
  return {
    evaluatedAtMs: 1_000,
    selectedPoiId: "poi-1",
    skippedReasons: {},
  };
}
