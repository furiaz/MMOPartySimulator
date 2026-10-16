import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { selectAutoCombatPoiTarget } from "./poiTargetSelection";
import {
  clearAutomaticResourceWorkForQuestDefense,
  getActiveQuestDefenseFocus,
} from "./questDefenseFocus";
import { createInitialQuestStates } from "./questSystem";
import { updateRoleSystem } from "./roleSystem";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { GameMap } from "./types";

const NIGHTMIRE_TEST_MAP: GameMap = {
  id: "map-6",
  debugName: "Nightmire Defense Test",
  displayName: "Nightmire Defense Test",
  columns: 120,
  rows: 60,
  walls: [],
  teleports: [],
  healingFountains: [],
};

describe("quest defense focus", () => {
  it("resolves an active Patron Ward and its living defenders", () => {
    const state = createPatronDefenseState();

    expect(getActiveQuestDefenseFocus(state)).toEqual({
      anchorPosition: { x: 96, y: 20 },
      defenderIds: ["ward-defender"],
      objectiveId: "break_night_bat_ward",
      questId: "the_patrons_shadow",
    });
  });

  it("resolves a started defend_area objective without quest-specific logic", () => {
    const quests = createInitialQuestStates();
    quests.hold_the_field_cache = {
      ...quests.hold_the_field_cache,
      status: "active",
      runtime: {
        defenseStartedObjectiveIds: {
          defend_old_grove_cache: true,
        },
      },
    };
    const state = createTestGameState({
      currentMapId: "map-2",
      quests,
    });

    expect(getActiveQuestDefenseFocus(state)).toMatchObject({
      anchorPosition: { x: 100, y: 25 },
      objectiveId: "defend_old_grove_cache",
      questId: "hold_the_field_cache",
    });
  });

  it("clears only AI-owned gathering when a defense starts", () => {
    const baseState = createPatronDefenseState();
    const resource = createResource("nearby-resource", { x: 95, y: 20 });
    const follower = {
      ...createCompanion("follower", { x: 94, y: 20 }, "leader", "fighter", 1),
      state: "gather" as const,
      currentTargetId: resource.id,
    };
    const directCollector = {
      ...createCompanion(
        "direct-collector",
        { x: 94, y: 21 },
        "leader",
        "gatherer",
        2,
      ),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
    };
    const state: GameState = {
      ...baseState,
      entities: {
        ...baseState.entities,
        [resource.id]: resource,
        [follower.id]: follower,
        [directCollector.id]: directCollector,
      },
      partyIntent: {
        mode: "travel",
        source: "ai",
        executionIntent: {
          type: "gather",
          targetId: resource.id,
          targetPosition: resource.position,
          source: "ai",
        },
        globalPoiIntent: null,
        localPoiTarget: {
          poiId: resource.id,
          category: "resource",
          mapId: "map-6",
          position: resource.position,
          targetEntityId: resource.id,
          reason: "wild resource fallback",
        },
        worldTravelTargetMapId: null,
      },
      leaderIntent: {
        type: "gather",
        targetId: resource.id,
        targetPosition: resource.position,
        source: "ai",
      },
      localPoiTarget: {
        poiId: resource.id,
        category: "resource",
        mapId: "map-6",
        position: resource.position,
        targetEntityId: resource.id,
        reason: "wild resource fallback",
      },
    };

    const nextState = clearAutomaticResourceWorkForQuestDefense(state);

    expect(nextState.partyIntent).toBeNull();
    expect(nextState.entities[follower.id]).toMatchObject({
      state: "follow",
      currentTargetId: "leader",
    });
    expect(nextState.entities[directCollector.id]).toMatchObject({
      state: "gather",
      currentTargetId: resource.id,
      commandPriority: "direct",
    });
  });

  it("preserves player-authored party gathering during a defense", () => {
    const state = createPatronDefenseState();
    const playerGatherState: GameState = {
      ...state,
      partyIntent: {
        mode: "travel",
        source: "player",
        executionIntent: {
          type: "gather",
          targetId: "resource",
          targetPosition: { x: 90, y: 20 },
          source: "player",
        },
        globalPoiIntent: null,
        localPoiTarget: null,
        worldTravelTargetMapId: null,
      },
      leaderIntent: {
        type: "gather",
        targetId: "resource",
        targetPosition: { x: 90, y: 20 },
        source: "player",
      },
    };

    expect(clearAutomaticResourceWorkForQuestDefense(playerGatherState)).toBe(
      playerGatherState,
    );
  });

  it("targets defenders and holds at the anchor between waves", () => {
    const state = createPatronDefenseState();
    const resource = createResource("nearby-resource", { x: 93, y: 20 });
    const stateWithResource = {
      ...state,
      entities: {
        ...state.entities,
        [resource.id]: resource,
      },
    };
    const reservations = {
      resourceIds: new Set<string>(),
      resourceIdByGathererId: new Map<string, string>(),
      gathererIdByResourceId: new Map<string, string>(),
    };
    const defenderSelection = selectAutoCombatPoiTarget(
      stateWithResource,
      reservations,
    );
    const betweenWavesState = {
      ...stateWithResource,
      entities: {
        ...stateWithResource.entities,
        "ward-defender": {
          ...stateWithResource.entities["ward-defender"],
          state: "dead" as const,
          health: 0,
        },
      },
    };
    const anchorSelection = selectAutoCombatPoiTarget(
      betweenWavesState,
      reservations,
    );

    expect(defenderSelection.localTarget).toMatchObject({
      poiId: "ward-defender",
      category: "combat",
      reason: "active quest defense enemy",
    });
    expect(anchorSelection.localTarget).toMatchObject({
      category: "event",
      position: { x: 96, y: 20 },
      reason: "active quest defense anchor",
    });
  });

  it("keeps an autonomous Gatherer-role companion with the party", () => {
    const state = createPatronDefenseState();
    const resource = createResource("nearby-resource", { x: 94, y: 20 });
    const gatherer = createCompanion(
      "gatherer",
      { x: 95, y: 20 },
      "leader",
      "gatherer",
      1,
    );
    const focusedState = {
      ...state,
      entities: {
        ...state.entities,
        [resource.id]: resource,
        [gatherer.id]: gatherer,
      },
    };

    const nextState = updateRoleSystem(focusedState);

    expect(nextState.entities[gatherer.id]).toMatchObject({
      state: "follow",
      currentTargetId: "leader",
    });
  });
});

function createPatronDefenseState(): GameState {
  const quests = createInitialQuestStates();
  quests.the_patrons_shadow = {
    ...quests.the_patrons_shadow,
    status: "active",
    objectiveProgress: {
      ...quests.the_patrons_shadow.objectiveProgress,
      break_night_bat_ward: {
        objectiveId: "break_night_bat_ward",
        currentCount: 100,
        completed: false,
      },
    },
    runtime: {
      patronWards: {
        activeWardId: "night_bat_ward",
        activeWaveIndex: 0,
        trackedDefenderIds: ["ward-defender"],
      },
    },
  };
  const leader = createCompanion(
    "leader",
    { x: 95, y: 20 },
    "leader",
    "fighter",
    0,
  );
  const defender = createEnemy(
    "ward-defender",
    { x: 98, y: 20 },
    "aggressive",
    {
      enemyTypeId: "night_bat",
      questSpawn: {
        questId: "the_patrons_shadow",
        objectiveId: "break_night_bat_ward",
        patronAura: true,
      },
    },
  );

  return createTestGameState({
    autoModeEnabled: true,
    currentMapId: "map-6",
    map: NIGHTMIRE_TEST_MAP,
    entities: {
      [leader.id]: leader,
      [defender.id]: defender,
    },
    partyLeaderId: leader.id,
    quests,
  });
}
