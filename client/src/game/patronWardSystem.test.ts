import { describe, expect, it } from "vitest";
import {
  MAP_SEVEN_ID,
  MAP_SIX_ID,
  MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID,
  createDebugMapForQuestState,
} from "./debugMap";
import { createCompanion, createEnemy } from "./entities";
import {
  getPatronWardPresentationState,
  isLegacyNightmireRouteSave,
  preparePatronWardStateForMapExit,
  requestPatronWardActivation,
  restorePatronWardStateFromSave,
  updatePatronWardSystem,
} from "./patronWardSystem";
import {
  PATRON_BARRIER_FADE_DURATION_MS,
  PATRON_FINALE_HOLD_DURATION_MS,
  PATRON_WARD_QUEST_ID,
  PATRON_WARD_RETREAT_RESET_DELAY_MS,
  PATRON_WARD_WAVE_DELAY_MS,
  getPatronWardDefinition,
} from "./patronWardState";
import { reconcileStateDerivedQuestObjectivesForQuests } from "./questProgressionHooks";
import { updateQuestAmbientEnemySuppressionSystem } from "./questAmbientEnemySuppressionSystem";
import {
  QUEST_DEFINITIONS,
  createInitialQuestStates,
  reconcileQuestAvailability,
} from "./questSystem";
import { createTestGameState } from "./testState";
import { isTeleportWorking } from "./teleportState";
import type { GameState } from "./state";
import type { Enemy } from "./types";
import type { PatronWardId } from "./questTypes";

describe("Patron Ward system", () => {
  it("defines and unlocks the Hub 2 quest after Into the Briar Burrows", () => {
    const quests = createInitialQuestStates();
    quests.into_the_briar_burrows = {
      ...quests.into_the_briar_burrows,
      status: "completed",
    };
    let state = reconcileQuestAvailability(createTestGameState({ quests }));
    const definition = QUEST_DEFINITIONS[PATRON_WARD_QUEST_ID];

    expect(state.quests[PATRON_WARD_QUEST_ID].status).toBe("available");
    expect(definition.rewards).toEqual({ crowns: 1_000, characterXp: 4_000 });
    expect(definition.objectives.map((objective) => objective.requiredCount)).toEqual([
      100,
      100,
      100,
      1,
    ]);

    state = {
      ...state,
      quests: {
        ...state.quests,
        [PATRON_WARD_QUEST_ID]: {
          ...state.quests[PATRON_WARD_QUEST_ID],
          status: "active",
        },
      },
      livestock: {
        ...state.livestock!,
        ownedCreaturesById: {
          ...state.livestock!.ownedCreaturesById,
          elder_mossling: 1,
        },
      },
    };
    state = reconcileStateDerivedQuestObjectivesForQuests(state, "test");

    expect(
      state.quests[PATRON_WARD_QUEST_ID].objectiveProgress.find_elder_mossling,
    ).toMatchObject({ currentCount: 1, completed: true });
  });

  it("starts a ready ward manually, suppresses ambient enemies, and blocks other wards", () => {
    const state = createNightmireWardState();
    const requested = requestPatronWardActivation(state, "night_bat_ward");

    expect(
      requested.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards
        ?.pendingActivationWardId,
    ).toBe("night_bat_ward");
    expect(
      getPatronWardPresentationState(requested)?.wards.find(
        (ward) => ward.id === "elder_mossling_ward",
      ),
    ).toMatchObject({ label: "Elder Mossling Ward — Blocked", isInteractable: false });

    const ignoredSecondRequest = requestPatronWardActivation(
      requested,
      "elder_mossling_ward",
    );
    expect(ignoredSecondRequest).toBe(requested);

    const active = updatePatronWardSystem(requested, 1_000);
    const runtime =
      active.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards;
    const defenders = getPatronDefenders(active);

    expect(runtime).toMatchObject({
      activeWardId: "night_bat_ward",
      activeWaveIndex: 0,
    });
    expect(defenders).toHaveLength(3);
    expect(defenders.every((enemy) => enemy.enemyTypeId === "night_bat")).toBe(
      true,
    );
    expect(defenders.every((enemy) => enemy.variant === undefined)).toBe(true);
    expect(defenders.every((enemy) => enemy.questSpawn?.patronAura)).toBe(true);
    expect(active.entities["ambient-near-ward"]).toBeUndefined();
  });

  it("spawns sequential waves and completes a charged ward only after its defense", () => {
    let state = updatePatronWardSystem(
      requestPatronWardActivation(createNightmireWardState(), "night_bat_ward"),
      1_000,
    );

    state = defeatTrackedDefenders(state);
    state = updatePatronWardSystem(state, 2_000);
    expect(
      state.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards?.nextWaveAtMs,
    ).toBe(2_000 + PATRON_WARD_WAVE_DELAY_MS);

    state = updatePatronWardSystem(
      state,
      2_000 + PATRON_WARD_WAVE_DELAY_MS - 1,
    );
    expect(getPatronDefenders(state)).toHaveLength(3);

    state = updatePatronWardSystem(
      state,
      2_000 + PATRON_WARD_WAVE_DELAY_MS,
    );
    expect(getPatronDefenders(state)).toHaveLength(3);
    expect(
      state.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards
        ?.activeWaveIndex,
    ).toBe(1);

    state = defeatTrackedDefenders(state);
    state = updatePatronWardSystem(state, 3_000);

    expect(
      state.quests[PATRON_WARD_QUEST_ID].objectiveProgress
        .break_night_bat_ward,
    ).toEqual({
      objectiveId: "break_night_bat_ward",
      currentCount: 100,
      completed: true,
    });
    expect(getPatronDefenders(state)).toHaveLength(0);
    expect(state.entities["ambient-near-ward"]).toBeUndefined();

    state = updateQuestAmbientEnemySuppressionSystem(state, 5_000);
    expect(state.entities["ambient-near-ward"]).toBeDefined();
  });

  it("resets a defense after retreat while preserving its full charge", () => {
    let state = updatePatronWardSystem(
      requestPatronWardActivation(createNightmireWardState(), "night_bat_ward"),
      1_000,
    );
    const leader = state.entities.leader;

    state = {
      ...state,
      entities: {
        ...state.entities,
        leader: { ...leader, position: { x: 10, y: 10 } },
      },
    };
    state = updatePatronWardSystem(state, 2_000);
    state = updatePatronWardSystem(
      state,
      2_000 + PATRON_WARD_RETREAT_RESET_DELAY_MS,
    );

    expect(
      state.quests[PATRON_WARD_QUEST_ID].objectiveProgress
        .break_night_bat_ward,
    ).toMatchObject({ currentCount: 100, completed: false });
    expect(
      state.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards?.activeWardId,
    ).toBeUndefined();
    expect(getPatronDefenders(state)).toHaveLength(0);
    expect(state.entities["ambient-near-ward"]).toBeUndefined();

    state = updateQuestAmbientEnemySuppressionSystem(
      state,
      2_000 + PATRON_WARD_RETREAT_RESET_DELAY_MS + 2_000,
    );
    expect(state.entities["ambient-near-ward"]).toBeDefined();
  });

  it("plays the finale after the third ward and opens the route before turn-in", () => {
    let state = createNightmireWardState({
      completedWardObjectiveIds: [
        "break_elder_mossling_ward",
        "break_cinder_wisp_ward",
      ],
    });
    state = updatePatronWardSystem(
      requestPatronWardActivation(state, "night_bat_ward"),
      1_000,
    );
    state = defeatTrackedDefenders(state);
    state = updatePatronWardSystem(state, 1_100);
    state = updatePatronWardSystem(
      state,
      1_100 + PATRON_WARD_WAVE_DELAY_MS,
    );
    state = defeatTrackedDefenders(state);
    state = updatePatronWardSystem(state, 2_000);

    const finaleStartedAtMs =
      state.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards
        ?.finaleStartedAtMs;
    expect(finaleStartedAtMs).toBe(2_000);
    expect(isTeleportWorking(state, MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID)).toBe(
      false,
    );
    expect(getPatronWardPresentationState(state)?.barrier).not.toBeNull();

    state = updatePatronWardSystem(
      state,
      2_000 +
        PATRON_FINALE_HOLD_DURATION_MS +
        PATRON_BARRIER_FADE_DURATION_MS,
    );

    expect(isTeleportWorking(state, MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID)).toBe(
      true,
    );
    expect(getPatronWardPresentationState(state)?.barrier).toBeNull();
    expect(
      state.quests[PATRON_WARD_QUEST_ID].objectiveProgress.find_elder_mossling
        .completed,
    ).toBe(false);
  });

  it("clears transient fights on travel and preserves legacy Map 7 access", () => {
    let state = updatePatronWardSystem(
      requestPatronWardActivation(createNightmireWardState(), "night_bat_ward"),
      1_000,
    );
    state = preparePatronWardStateForMapExit(state);

    expect(getPatronDefenders(state)).toHaveLength(0);
    expect(
      state.quests[PATRON_WARD_QUEST_ID].objectiveProgress
        .break_night_bat_ward.currentCount,
    ).toBe(100);
    expect(
      state.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards?.activeWardId,
    ).toBeUndefined();

    const legacy = {
      ...createNightmireWardState(),
      currentMapId: MAP_SEVEN_ID,
      map: createDebugMapForQuestState(MAP_SEVEN_ID),
      worldDiscovery: {
        visitedMapIds: [MAP_SEVEN_ID],
        visitedSubzonesByMapId: {},
      },
    };
    expect(isLegacyNightmireRouteSave(legacy)).toBe(true);

    const restored = restorePatronWardStateFromSave(legacy, true);
    expect(
      restored.quests[PATRON_WARD_QUEST_ID].runtime?.patronWards,
    ).toMatchObject({ routeUnlocked: true, legacyRoutePreserved: true });
    expect(isTeleportWorking(restored, MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID)).toBe(
      true,
    );
  });

  it.each([
    ["night_bat_ward", "elder_mossling_ward", "cinder_wisp_ward"],
    ["night_bat_ward", "cinder_wisp_ward", "elder_mossling_ward"],
    ["elder_mossling_ward", "night_bat_ward", "cinder_wisp_ward"],
    ["elder_mossling_ward", "cinder_wisp_ward", "night_bat_ward"],
    ["cinder_wisp_ward", "night_bat_ward", "elder_mossling_ward"],
    ["cinder_wisp_ward", "elder_mossling_ward", "night_bat_ward"],
  ] as const)(
    "keeps ambient enemies suppressed through consecutive ward order %s, %s, %s",
    (...wardIds) => {
      let state = createNightmireWardState();
      let nowMs = 1_000;

      for (const wardId of wardIds) {
        ({ state, nowMs } = completeWardDefenseForTest(
          state,
          wardId,
          nowMs,
        ));
        expect(state.entities["ambient-near-ward"]).toBeUndefined();
      }

      state = updateQuestAmbientEnemySuppressionSystem(state, nowMs + 1_999);
      expect(state.entities["ambient-near-ward"]).toBeUndefined();
      state = updateQuestAmbientEnemySuppressionSystem(state, nowMs + 2_000);
      expect(state.entities["ambient-near-ward"]).toBeDefined();
    },
  );
});

function createNightmireWardState(options?: {
  completedWardObjectiveIds?: string[];
}): GameState {
  const quests = createInitialQuestStates();
  const quest = quests[PATRON_WARD_QUEST_ID];
  const completedIds = new Set(options?.completedWardObjectiveIds ?? []);

  quests[PATRON_WARD_QUEST_ID] = {
    ...quest,
    status: "active",
    objectiveProgress: Object.fromEntries(
      Object.entries(quest.objectiveProgress).map(([objectiveId, progress]) => [
        objectiveId,
        {
          ...progress,
          currentCount: objectiveId.startsWith("break_") ? 100 : 0,
          completed: completedIds.has(objectiveId),
        },
      ]),
    ),
  };

  const leader = createCompanion(
    "leader",
    { x: 96, y: 20 },
    "leader",
  );
  const ambient = createEnemy(
    "ambient-near-ward",
    { x: 95, y: 24 },
    "aggressive",
    {
      enemyTypeId: "night_bat",
      subzoneId: "nightmire-canopy",
      encounterAreaId: "nightmire-cinder-hollow",
    },
  );

  return createTestGameState({
    currentMapId: MAP_SIX_ID,
    map: createDebugMapForQuestState(MAP_SIX_ID, quests),
    quests,
    entities: {
      [leader.id]: leader,
      [ambient.id]: ambient,
    },
    partyLeaderId: leader.id,
    followTrailsByEntityId: {
      [leader.id]: [],
      [ambient.id]: [],
    },
  });
}

function getPatronDefenders(state: GameState): Enemy[] {
  return Object.values(state.entities).filter(
    (entity): entity is Enemy =>
      entity.kind === "enemy" && entity.questSpawn?.patronAura === true,
  );
}

function defeatTrackedDefenders(state: GameState): GameState {
  const entities = { ...state.entities };

  for (const defender of getPatronDefenders(state)) {
    entities[defender.id] = {
      ...defender,
      state: "dead",
      health: 0,
    };
  }

  return { ...state, entities };
}

function completeWardDefenseForTest(
  state: GameState,
  wardId: PatronWardId,
  startedAtMs: number,
): { state: GameState; nowMs: number } {
  const ward = getPatronWardDefinition(wardId);
  const leader = state.entities.leader;
  let nextState: GameState = {
    ...state,
    entities: {
      ...state.entities,
      leader: { ...leader, position: ward.position },
    },
  };
  let nowMs = startedAtMs;
  nextState = updatePatronWardSystem(
    requestPatronWardActivation(nextState, wardId),
    nowMs,
  );

  for (let waveIndex = 0; waveIndex < ward.waveCounts.length; waveIndex += 1) {
    nextState = defeatTrackedDefenders(nextState);
    nowMs += 100;
    nextState = updatePatronWardSystem(nextState, nowMs);

    if (waveIndex < ward.waveCounts.length - 1) {
      nowMs += PATRON_WARD_WAVE_DELAY_MS;
      nextState = updatePatronWardSystem(nextState, nowMs);
    }
  }

  return { state: nextState, nowMs };
}
