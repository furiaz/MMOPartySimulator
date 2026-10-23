import { describe, expect, it } from "vitest";
import { createDebugMap, getEnemyStartDataForMap } from "./debugMap";
import { createCompanion, createEnemy } from "./entities";
import { initializeBarracks } from "./barracks";
import { BARRACK_DEFINITIONS } from "./barrackDefinitions";
import { isForcedMovementPositionAvailable } from "./forcedMovement";
import { isEnemyMovementPositionAllowed } from "./enemyMovementBounds";
import { findNavigationPath } from "./navigation";
import { getStructureApproachPosition } from "./combatStructures";
import { updateEnemyAbilitySystem } from "./enemyAbilitySystem";
import { prepareEnemyDash } from "./enemyDashSystem";
import { resolveAoePattern } from "./aoePatterns";
import { ORC_WARCAMP_ARENA, ORC_WARCAMP_BOSS_POSITION } from "./orcWarcampLayout";
import { restoreOrcWarcampLayout } from "./orcWarcampRestoration";
import { sanitizeGameStateForSave } from "./saveGame";
import { createTestGameState } from "./testState";
import { updateEntity } from "./state";
import { getActiveWarmasterEncounterIds, updateWarmasterSystem } from "./warmasterSystem";
import type { CombatStructure, Companion, Enemy } from "./types";

function setup() {
  const authored = getEnemyStartDataForMap("map-7").find(spawn => spawn.enemyTypeId === "orc_warmaster")!;
  const boss = createEnemy(authored.id, { x: 101, y: 10 }, "aggressive", { enemyTypeId: "orc_warmaster", combatBodyRadius: 1.25 });
  const leader = createCompanion("guild-recruit-test", { x: 95, y: 12 }, "leader");
  return initializeBarracks(createTestGameState({ currentMapId: "map-7", map: createDebugMap("map-7"), partyLeaderId: leader.id,
    entities: { [boss.id]: boss, [leader.id]: leader } }));
}

describe("compact Warcamp restoration", () => {
  it("relocates full companion bodies deterministically without changing roster, life or progression", () => {
    const state = setup();
    const leader = state.entities[state.partyLeaderId] as Companion;
    state.entities[leader.id] = { ...leader, health: 7, characterLevel: 20, characterXp: 12 };
    const dead = { ...createCompanion("dead", { x: 93, y: 21.8 }, "leader", "fighter", 2), health: 0, state: "dead" as const };
    state.entities.dead = dead;
    const restored = restoreOrcWarcampLayout(state);
    expect(restored.partyLeaderId).toBe(leader.id);
    expect(Object.values(restored.entities).filter(entity => entity.kind === "companion")).toHaveLength(2);
    expect(restored.entities[leader.id]).toEqual({ ...state.entities[leader.id], position: restored.entities[leader.id].position });
    expect(restored.entities.dead).toEqual({ ...dead, position: restored.entities.dead.position });
    for (const id of [leader.id, "dead"]) {
      expect(restored.entities[id].position).not.toEqual(state.entities[id].position);
      expect(isForcedMovementPositionAvailable(restored, restored.entities[id], restored.entities[id].position)).toBe(true);
    }
    expect(restoreOrcWarcampLayout(state).entities).toEqual(restored.entities);
    expect(restoreOrcWarcampLayout(restored).entities).toEqual(restored.entities);
  });
  it("rebinds the authored Boss home and arena, resets living attempts, but never revives a dead Boss", () => {
    const state = setup();
    const boss = Object.values(state.entities).find((entity): entity is Enemy => entity.kind === "enemy")!;
    state.entities[boss.id] = { ...boss, health: 100, combatSizeMultiplier: 1.5 };
    const restored = sanitizeGameStateForSave(state, 1000);
    expect(restored.entities[boss.id]).toMatchObject({ homePosition: ORC_WARCAMP_BOSS_POSITION, position: ORC_WARCAMP_BOSS_POSITION,
      health: 1500, combatSizeMultiplier: 1, movementBounds: ORC_WARCAMP_ARENA, minimumMovementBodyRadius: 1.875 });
    const defeated = updateEntity(state, { ...boss, health: 0, state: "dead" }, 900);
    expect(sanitizeGameStateForSave(defeated, 1000).entities[boss.id]).toMatchObject({ homePosition: ORC_WARCAMP_BOSS_POSITION, health: 0, state: "dead" });
  });
  it("repairs reinforcement homes and actors trapped by moved structures or reclaimed terrain", () => {
    const state = setup();
    const definition = BARRACK_DEFINITIONS.find(item => item.id === "map-7-arena-barrack-west")!;
    const id = `${definition.id}-orc-4`;
    state.entities[id] = { ...createEnemy(id, { x: 88, y: 29 }, "aggressive", { enemyTypeId: "orc" }), homePosition: { x: 88, y: 12 }, barrackSpawn: { barrackId: definition.id, sequence: 4 } };
    const restored = sanitizeGameStateForSave(state, 1000);
    const enemy = restored.entities[id] as Enemy;
    expect(definition.spawnCandidates).toContainEqual(enemy.homePosition);
    expect(isForcedMovementPositionAvailable(restored, enemy, enemy.position)).toBe(true);
    expect(enemy).toMatchObject({ health: 208, barrackSpawn: { barrackId: definition.id, sequence: 4 } });
    expect(restored.barracksById?.[definition.id].spawnSequence).toBe(4);
  });
  it("leaves valid actors and unrelated maps alone", () => {
    const state = setup();
    const leader = state.entities[state.partyLeaderId];
    state.entities[leader.id] = { ...leader, position: { x: 91, y: 44 } };
    const restored = restoreOrcWarcampLayout(state);
    expect(restored.entities[leader.id]).toBe(state.entities[leader.id]);
    const unrelated = { ...state, currentMapId: "map-6" as const };
    expect(restoreOrcWarcampLayout(unrelated)).toBe(unrelated);
  });
  it("supplies encounter context only for a living Boss's active arena attempt", () => {
    let state = restoreOrcWarcampLayout(setup());
    expect(getActiveWarmasterEncounterIds(state).size).toBe(0);
    state = updateWarmasterSystem(state, 1000);
    expect(getActiveWarmasterEncounterIds(state).size).toBe(1);
    const bossId = state.warmasterAttempt!.bossId;
    state.entities[bossId] = { ...state.entities[bossId], health: 0, state: "dead" } as Enemy;
    expect(getActiveWarmasterEncounterIds(state).size).toBe(0);
    expect(getActiveWarmasterEncounterIds({ ...state, currentMapId: "map-6" }).size).toBe(0);
  });
  it("keeps entry, full-growth clearance, five body-clear companions and all Barrack attack lanes usable", () => {
    const state = restoreOrcWarcampLayout(setup());
    const boss = Object.values(state.entities).find((entity): entity is Enemy => entity.kind === "enemy")!;
    state.entities[boss.id] = { ...boss, position: ORC_WARCAMP_BOSS_POSITION, combatSizeMultiplier: 1.5 };
    const grown = state.entities[boss.id] as Enemy;
    expect(isEnemyMovementPositionAllowed(state, grown, grown.position)).toBe(true);
    expect(findNavigationPath(state.map!, { x: 5, y: 29 }, [grown.position]).length).toBeGreaterThan(0);
    const leader = state.entities[state.partyLeaderId] as Companion;
    state.entities[leader.id] = { ...leader, position: { x: 91, y: 38 } };
    for (let index = 1; index < 5; index++) {
      const companion = createCompanion(`member-${index}`, { x: 91 + index * 2, y: 38 }, leader.id, "fighter", index);
      state.entities[companion.id] = companion;
    }
    for (const companion of Object.values(state.entities).filter((entity): entity is Companion => entity.kind === "companion")) {
      expect(isForcedMovementPositionAvailable(state, companion, companion.position, true)).toBe(true);
    }
    for (const definition of BARRACK_DEFINITIONS.filter(item => item.activation)) {
      expect(getStructureApproachPosition(state, state.entities[leader.id], state.entities[definition.id] as CombatStructure)).not.toBeNull();
    }
  });
  it("can prepare the fully grown Boss's original full dash in the compact room", () => {
    let state = restoreOrcWarcampLayout(setup());
    const boss = Object.values(state.entities).find((entity): entity is Enemy => entity.kind === "enemy")!;
    const targetId = state.partyLeaderId;
    state.entities[targetId] = { ...state.entities[targetId], position: { x: 95, y: 35.5 } };
    state = updateWarmasterSystem(state, 1000);
    state.warmasterAttempt!.power = 10;
    state.entities[boss.id] = { ...state.entities[boss.id], position: ORC_WARCAMP_BOSS_POSITION, combatSizeMultiplier: 1.5,
      state: "attack", currentTargetId: targetId, lastAttackAt: 0 } as Enemy;
    state.enemyAbilityCooldownsByEnemyId = { [boss.id]: Object.fromEntries(
      (["orc_warmaster_patron_burst", "orc_warmaster_patron_cleave", "orc_warmaster_kick"] as const).map(abilityId => [abilityId,
        { abilityId, casterId: boss.id, startedAt: 0, expiresAt: 10_000 }]),
    ) };
    const area = resolveAoePattern({ type: "rectangle", rows: 5, columns: 2 }, { origin: ORC_WARCAMP_BOSS_POSITION, direction: { x: 0, y: 1 } });
    expect(prepareEnemyDash(state, state.entities[boss.id] as Enemy, state.entities[targetId] as Companion, area, 7.5, 350)).toMatchObject({ dashPlan: { distance: 7.5 } });
    state = updateEnemyAbilitySystem(state, 3000);
    expect(state.enemyAbilityCastsByEnemyId?.[boss.id]).toMatchObject({ abilityId: "orc_warmaster_rending_dash", dashPlan: { distance: 7.5, durationMs: 350 } });
  });
});
