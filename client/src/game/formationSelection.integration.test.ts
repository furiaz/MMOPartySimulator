import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { assignFormationSlots, reconcileFormationAssignments } from "./formationAssignments";
import { FORMATION_CHOICES, selectFormationPreset } from "./formationSelection";
import { transformFormationSlots } from "./formationTemplates";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import { updateAttackSystem } from "./attackSystem";
import { advanceFormationTransition } from "./formationTransition";
import { prepareCombatFormation } from "./combatFormation";
import { clearFrameMovementPlanning } from "./movementState";
import { bakeNavigationGrid } from "./navigation";
import { issueCompanionDirectCommand } from "./directCompanionCommands";
import { issuePartyOrder } from "./commands";
import { getPartyExecutionIntent, setPartyExecutionIntent } from "./partyIntentState";
import { startForcedMovement } from "./forcedMovement";
import { createBarrackEntity, BARRACK_DEFINITIONS } from "./barrackDefinitions";
import { createDebugMap } from "./debugMap";
import { createInitialGameState } from "./createInitialGameState";
import { createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { moveCompanionToRestingReserve } from "./partySystem";
import { startAutoRoute } from "./autoRouteSystem";
import { updateWorldWipeRecovery } from "./worldWipeRecovery";
import { answerWarmasterDeparture } from "./warmasterLifecycle";
import { resetWarmasterAttempt } from "./warmasterSystem";
import { isSpecializedMovementPositionAvailable } from "./specializedMovementGeometry";
import * as authority from "./movementAuthority";
import type { GameState } from "./state";
import type { Companion } from "./types";

afterEach(() => vi.restoreAllMocks());

function party(count = 5): GameState {
  const roles = ["fighter", "fighter", "support", "gatherer", "none"] as const;
  const members = roles.slice(0, count).map((role, index) => createCompanion(`m${index}`, { x: 30, y: 30 }, "m0", role, index));
  const assignments = assignFormationSlots(members, "m0")!;
  const points = transformFormationSlots(assignments, members[0], { x: 0, y: -1 });
  const state = createTestGameState({ partyLeaderId: "m0", currentMapId: "hub", formationAssignments: assignments,
    simulationFrame: 1, simulationTimeMs: 1000, simulationDeltaMs: 100,
    map: { columns: 70, rows: 70, walls: [], teleports: [], healingFountains: [], displayName: "Formation", debugName: "formation" },
    entities: Object.fromEntries(members.map(member => [member.id, { ...member, position: points[member.id] }])) });
  state.map!.navigationGrid = bakeNavigationGrid(state.map!);
  return state;
}
function step(state: GameState) {
  return updateGame(state, { frameNumber: (state.simulationFrame ?? 0) + 1, nowMs: (state.simulationTimeMs ?? 0) + 100, deltaMs: 100 });
}
function publications() {
  const counts = new Map<string, number>();
  const normal = authority.commitNormalMovementPosition, special = authority.commitSpecializedMovementPosition;
  const record = (state: GameState, id: string) => { const key = `${state.simulationFrame}:${id}`; counts.set(key, (counts.get(key) ?? 0) + 1); };
  vi.spyOn(authority, "commitNormalMovementPosition").mockImplementation((state, actor) => {
    const next = normal(state, actor); if (next.entities[actor.id].position !== state.entities[actor.id].position) record(state, actor.id); return next;
  });
  vi.spyOn(authority, "commitSpecializedMovementPosition").mockImplementation((state, id, position, source, transaction) => {
    const result = special(state, id, position, source, transaction); if (result.outcome === "moved") record(state, id); return result;
  });
  return counts;
}

describe("formation selection behavioral compatibility", () => {
  const cases = FORMATION_CHOICES.flatMap(choice => ["move", "enemy", "structure", "gather"].map(command => ({ preset: choice.id, command })));
  it.each(cases)("preserves $command through $preset selection, party focus, and knockback", ({ preset, command }) => {
    let state = party();
    state.entities.enemy = createEnemy("enemy", { x: 39, y: 28 }, "passive", { maxHealth: 100000, attack: 0 });
    state.entities.resource = createResource("resource", { x: 41, y: 36 });
    state.entities.structure = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), id: "structure", position: { x: 40, y: 34 },
      footprint: { minX: 39.5, maxX: 40.5, minY: 33.5, maxY: 34.5 }, attackBounds: { minX: 39, maxX: 41, minY: 33, maxY: 35 } };
    const input = command === "move" ? { type: "move" as const, companionId: "m1", targetPosition: { x: 42, y: 40 } }
      : { type: command === "gather" ? "gather" as const : "attack" as const, companionId: "m1", targetId: command === "gather" ? "resource" : command };
    const issued = issueCompanionDirectCommand(state, input, 1000);
    expect(issued.code).toBe("success"); state = issued.state;
    state = startForcedMovement(state, "m1", "enemy", { x: -1, y: 0 }, 1.5, 400, 1000);
    const motion = state.forcedMovementsByEntityId?.m1, direct = state.directCompanionCommandsById?.m1;
    expect(motion).toBeDefined();
    const counts = publications();
    state = reconcileFormationAssignments(selectFormationPreset(state, preset));
    expect(state.forcedMovementsByEntityId?.m1).toBe(motion);
    state = issuePartyOrder(state, { type: "attack", targetId: "enemy" });
    for (let frame = 0; frame < 12; frame++) {
      state = step(state);
      expect(state.directCompanionCommandsById?.m1).toBe(direct);
      expect(getPartyExecutionIntent(state)?.targetId).toBe("enemy");
    }
    expect(state.forcedMovementsByEntityId?.m1).toBeUndefined();
    expect(state.formationAssignments?.preset).toBe(preset);
    expect(Math.max(0, ...counts.values())).toBeLessThanOrEqual(1);
  });

  it("retains an existing legal engagement and target through every preset", () => {
    let state = party();
    const enemy = createEnemy("enemy", { x: 30, y: 28 }, "passive", { maxHealth: 100000, attack: 0 });
    state.entities.enemy = enemy;
    state.entities.m0 = { ...createCompanion("m0", { x: 30, y: 30 }, "m0", "fighter", 0, "hunter"), state: "attack", currentTargetId: "enemy" };
    state = setPartyExecutionIntent({ ...state, autoModeEnabled: true }, { type: "attack", targetId: "enemy", targetPosition: enemy.position, source: "ai" });
    const origin = state.entities.m0.position;
    for (const choice of FORMATION_CHOICES) {
      state = selectFormationPreset(state, choice.id);
      for (let frame = 0; frame < 12; frame++) {
        state = reconcileFormationAssignments(state);
        state = advanceFormationTransition(clearFrameMovementPlanning({ ...state, simulationFrame: (state.simulationFrame ?? 0) + 1,
          simulationTimeMs: (state.simulationTimeMs ?? 0) + 100, simulationDeltaMs: 100 }));
        state = updateAttackSystem(prepareCombatFormation(state), new Set(), state.simulationTimeMs);
        expect((state.entities.m0 as Companion).currentTargetId).toBe("enemy");
        expect(state.entities.m0.position).toEqual(origin);
      }
    }
  });

  it("keeps legal bodies in a narrow passage throughout repeated switches", () => {
    let state = party();
    state.map = { ...state.map!, walls: Array.from({ length: 70 }, (_, y) => [{ x: 27, y }, { x: 33, y }]).flat() };
    state.map.navigationGrid = bakeNavigationGrid(state.map);
    state = issuePartyOrder(state, { type: "move", targetPosition: { x: 30, y: 14 } });
    let adapted = false;
    for (let frame = 0; frame < 100; frame++) {
      if (frame % 25 === 0) state = selectFormationPreset(state, FORMATION_CHOICES[(frame / 25) % 3].id);
      state = step(state);
      const travel = state.formationAssignments?.travel;
      adapted ||= Boolean(travel?.trailing || (travel && travel.lateralScale < 1));
      for (const actor of Object.values(state.entities)) if (actor.kind === "companion") expect(isSpecializedMovementPositionAvailable(state, actor, actor.position)).toBe(true);
    }
    expect(adapted).toBe(true);
  }, 60000);

  it("preserves World Travel through 100 switching updates with Auto Combat off", () => {
    let state: GameState = { ...party(), map: createDebugMap("hub"), worldDiscovery: { visitedMapIds: ["map-1"], visitedSubzonesByMapId: {} } };
    const started = startAutoRoute(state, "map-1"); expect(started.status).toBe("success"); state = started.state;
    for (let frame = 0; frame < 100; frame++) {
      if (frame % 25 === 0) state = selectFormationPreset(state, FORMATION_CHOICES[(frame / 25) % 3].id);
      state = step(state);
      expect(state.worldTravelTargetMapId).toBe("map-1");
      expect(state.autoRoute?.pauseReason).not.toBe("emergency");
      expect(state.autoModeEnabled).toBe(false);
    }
  }, 60000);

  it.each([20, 100])("recovers a switched front slot around a body-tight passage at %i ms updates", deltaMs => {
    let state = party();
    const roles = ["support", "defender", "fighter", "fighter", "none"] as const;
    const points = [{ x: 55.1020898627, y: 30.7755224657 }, { x: 59.849, y: 31.779 },
      { x: 50.890406785, y: 34.1423900362 }, { x: 57.143, y: 32.360 }, { x: 54.653, y: 33.154 }];
    const members = Object.values(state.entities).map((actor, i) => ({ ...actor as Companion, role: roles[i], position: points[i],
      state: i ? "follow" as const : "idle" as const, currentTargetId: i ? "m0" : null }));
    state = { ...state, currentMapId: "map-3", map: createDebugMap("map-3"), selectedFormationPreset: "balanced",
      entities: Object.fromEntries(members.map(actor => [actor.id, actor])), formationAssignments: assignFormationSlots(members, "m0", "balanced") };
    state.formationAssignments!.travel = { leaderId: "m0", facing: { x: 0.9701425, y: 0.2425356 }, lateralScale: 1,
      trailing: false, trail: [points[0]], trailOrder: ["m1", "m2", "m3", "m4"], lastLeaderPosition: points[0], cohesion: "normal", goalsByEntityId: {} };
    const counts = publications();
    let settledPosition: { x: number; y: number } | undefined;
    const updates = 13000 / deltaMs;
    for (let frame = 0; frame < updates; frame++) {
      state = updateGame(state, { frameNumber: (state.simulationFrame ?? 0) + 1,
        nowMs: (state.simulationTimeMs ?? 0) + deltaMs, deltaMs });
      for (const actor of Object.values(state.entities)) if (actor.kind === "companion") expect(isSpecializedMovementPositionAvailable(state, actor, actor.position)).toBe(true);
      if (frame === updates - 31) settledPosition = state.entities.m2.position;
      if (frame > updates - 31) expect(state.entities.m2.position).toEqual(settledPosition);
    }
    expect(state.entities.m2.position.x).toBeGreaterThan(52);
    const goal = state.formationAssignments!.travel!.goalsByEntityId.m2;
    expect(Math.hypot(state.entities.m2.position.x - goal.position.x, state.entities.m2.position.y - goal.position.y)).toBeLessThanOrEqual(0.6);
    expect(Math.max(...counts.values())).toBe(1);
  });

  it.each(["map-4", "map-5", "map-6", "map-7"] as const)("retains the preset while rebuilding %s save and transition runtime", mapId => {
    const state = { ...selectFormationPreset(createInitialGameState(), "side-by-side"), currentMapId: mapId, map: createDebugMap(mapId) };
    const saved = createSavedGame(state, 1000), restored = restoreGameStateFromSave(JSON.parse(JSON.stringify(saved)));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.selectedFormationPreset).toBe("side-by-side");
    expect(restored.state.formationAssignments).toBeUndefined();
    const clean = clearMapTransitionRuntimeState(reconcileFormationAssignments(restored.state));
    expect(clean.selectedFormationPreset).toBe("side-by-side");
    expect(reconcileFormationAssignments(clean).formationAssignments?.preset).toBe("side-by-side");
  });

  it("retains choice through reserve transfer, wipe, and enemy-only/party departure cleanup", () => {
    let state = reconcileFormationAssignments(selectFormationPreset(party(), "balanced"));
    state = moveCompanionToRestingReserve(state, "m4");
    expect(state.formationAssignments?.members).toHaveLength(4);
    expect(state.selectedFormationPreset).toBe("balanced");
    const dead = Object.fromEntries(Object.values(state.entities).map(actor => [actor.id, { ...actor, state: "dead" as const, health: 0 }]));
    const rescued = updateWorldWipeRecovery({ ...state, entities: dead, currentMapId: "map-1", map: createDebugMap("map-1") }, 2000);
    expect(rescued.selectedFormationPreset).toBe("balanced");
    state = { ...state, currentMapId: "map-7", map: createDebugMap("map-7") };
    expect(resetWarmasterAttempt(state, 2000).selectedFormationPreset).toBe("balanced");
    const departing = { ...state, warmasterInteraction: { departure: { kind: "walk" as const } } };
    const left = answerWarmasterDeparture(departing, true);
    expect(left.formationAssignments).toBeUndefined();
    expect(left.selectedFormationPreset).toBe("balanced");
  });
});
