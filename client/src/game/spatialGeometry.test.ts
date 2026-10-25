import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { BARRACK_DEFINITIONS, createBarrackEntity } from "./barrackDefinitions";
import { isCombatPositionAvailable, isEntitySeparationPositionAvailable, isWalkablePosition } from "./movementPlanning";
import { isCombatPositionSpacedFromParty } from "./partySpacing";
import { areEntitiesOverlapping, getCollisionBody, getEffectiveAttackRange, getEntityCollisionShape, isWithinAttackReach, SPATIAL_EPSILON } from "./spatialGeometry";
import { createTestGameState } from "./testState";
import type { GameEntity, GameMap } from "./types";

const openMap: GameMap = {
  columns: 40, rows: 40, walls: [], teleports: [], healingFountains: [], displayName: "Spatial test", debugName: "spatial-test",
};
function setup(entities: GameEntity[]) {
  return createTestGameState({ map: openMap, entities: Object.fromEntries(entities.map(entity => [entity.id, entity])) });
}

describe("continuous engagement geometry", () => {
  it.each([1, 3, 4, 5])("preserves authored reach %s, adding only current combat bodies", reach => {
    const actor = createCompanion("actor", { x: 8, y: 10 }, "actor");
    const target = { ...createEnemy("target", { x: 10, y: 10 }, undefined, { combatBodyRadius: 1.25 }),
      combatSizeMultiplier: 1.5, minimumMovementBodyRadius: 4 };
    const range = reach + 1.875;
    expect(getEffectiveAttackRange(actor, target, reach)).toBe(range);
    expect(getEntityCollisionShape(target)).toEqual({ kind: "circle", radius: 1.875 });
    expect(isWithinAttackReach(actor, target, reach, { x: 10 - range, y: 10 })).toBe(true);
    expect(isWithinAttackReach(actor, target, reach, { x: 10 - range - SPATIAL_EPSILON / 2, y: 10 })).toBe(true);
    expect(isWithinAttackReach(actor, target, reach, { x: 10 - range - 0.01, y: 10 })).toBe(false);
    expect(isWithinAttackReach(actor, target, reach, { x: 10 - range, y: 10 - range })).toBe(false);
  });

  it("uses the collision fallback for enemies without combat-body metadata", () => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const target = createEnemy("target", { x: 7, y: 5 });
    expect(getEffectiveAttackRange(actor, target, 1)).toBe(1.7);
  });

  it("measures structure reach to attack bounds, not its center or ground footprint", () => {
    const target = createBarrackEntity(BARRACK_DEFINITIONS[0]);
    const actor = createCompanion("actor", { x: 75, y: 21 }, "actor");
    expect(isWithinAttackReach(actor, target, 1)).toBe(true);
    expect(isWithinAttackReach(actor, target, 1, { x: 72, y: 21 })).toBe(false);
  });
});

describe("standing clearance", () => {
  it("allows improving an existing third-party overlap but rejects worsening or new overlap", () => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const source = createEnemy("source", { x: 6, y: 5 }, "passive", { combatBodyRadius: 0.7 });
    const other = createEnemy("other", { x: 5, y: 6 }, "passive", { combatBodyRadius: 0.7 });
    const state = setup([actor, source, other]);
    const candidate = { x: 4.88, y: 5 };
    expect(isEntitySeparationPositionAvailable(state, actor.id, source.id, candidate)).toBe(true);
    expect(isCombatPositionAvailable(state, actor, candidate)).toBe(false);
    state.entities.other = { ...other, position: { x: 4, y: 5 } };
    expect(isEntitySeparationPositionAvailable(state, actor.id, source.id, candidate)).toBe(false);
    state.entities.other = { ...other, position: { x: 3.5, y: 5 } };
    expect(isEntitySeparationPositionAvailable(state, actor.id, source.id, candidate)).toBe(false);
  });

  it.each([{ x: 8.3, y: 10 }, { x: 9.6695, y: 10 }])("keeps a friendly forced landing solid without changing ordinary party transit: %j", candidate => {
    const actor = createCompanion("actor", { x: 6, y: 10 }, "actor");
    const friend = createCompanion("friend", { x: 20, y: 10 }, "actor");
    const state = setup([actor, friend]);
    state.forcedMovementsByEntityId = { friend: { targetId: friend.id, sourceId: "source", origin: friend.position,
      direction: { x: -1, y: 0 }, distance: 11.5, startedAt: 0, endsAt: 1000, lastSafePosition: friend.position } };
    expect(isWalkablePosition(state, candidate, actor.id, { allowPartyPassThrough: true })).toBe(true);
    expect(isCombatPositionAvailable(state, actor, candidate, { allowPartyPassThrough: true })).toBe(false);
    expect(isEntitySeparationPositionAvailable(state, actor.id, "source", candidate)).toBe(false);
    expect(isCombatPositionAvailable(state, friend, { x: 8.5, y: 10 })).toBe(true);
    state.entities.friend = { ...friend, state: "dead", health: 0 };
    expect(isCombatPositionAvailable(state, actor, candidate, { allowPartyPassThrough: true })).toBe(true);
  });

  it("uses live ground footprints and releases them when the structure is destroyed", () => {
    const target = { ...createBarrackEntity(BARRACK_DEFINITIONS[0]), position: { x: 10, y: 10 },
      footprint: { minX: 9, maxX: 11, minY: 9, maxY: 11 } };
    const actor = createCompanion("actor", { x: 10, y: 7.5 }, "actor");
    const state = setup([actor, target]);
    expect(isCombatPositionAvailable(state, actor, actor.position)).toBe(false);
    state.entities[target.id] = { ...target, state: "dead", health: 0 };
    expect(isCombatPositionAvailable(state, actor, actor.position)).toBe(true);
  });

  it.each(["pending dash", "forced movement"])("rejects an endpoint reserved by %s", motion => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const enemy = createEnemy("enemy", { x: 12, y: 5 }, undefined, { enemyTypeId: "orc_raider" });
    const state = setup([actor, enemy]);
    if (motion === "pending dash") {
      state.enemyAbilityCastsByEnemyId = { enemy: { id: "cast", abilityId: "orc_raider_rending_dash", casterId: enemy.id,
        targetId: actor.id, phase: "casting", startedAt: 0, castEndsAt: 900, windupEndsAt: 1100,
        origin: enemy.position, targetPosition: actor.position, direction: { x: -1, y: 0 },
        dashPlan: { destination: actor.position, distance: 7, durationMs: 350 } } };
    } else {
      state.forcedMovementsByEntityId = { enemy: { targetId: enemy.id, sourceId: "source", origin: enemy.position,
        direction: { x: -1, y: 0 }, distance: 7, startedAt: 0, endsAt: 1000, lastSafePosition: enemy.position } };
    }
    expect(isCombatPositionAvailable(state, actor, actor.position)).toBe(false);
  });

  it("preserves capsule shape and applies it to hard obstacles, not just the actor origin", () => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const state = setup([actor]);
    state.map = { ...openMap, walls: [{ x: 5, y: 7 }] };
    expect(getCollisionBody(actor).bottom + getCollisionBody(actor).radius).toBeCloseTo(6.568);
    expect(isWalkablePosition(state, actor.position, actor.id)).toBe(true);
    expect(isCombatPositionAvailable(state, actor, actor.position)).toBe(false);
    expect(isCombatPositionAvailable(state, actor, { x: 5, y: 4.8 })).toBe(true);
    expect(isCombatPositionAvailable(state, actor, { x: 0, y: 0 })).toBe(false);
  });

  it.each(["npc", "resource"])("rejects endpoints overlapping a %s", kind => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const blocker = kind === "npc" ? createNpc("blocker", { x: 7, y: 5 }, "NPC", "quest_giver") : createResource("blocker", { x: 7, y: 5 });
    expect(isCombatPositionAvailable(setup([actor, blocker]), actor, { x: 6.5, y: 5 })).toBe(false);
  });

  it("keeps pass-through scoped and agrees with recovery on soft party spacing", () => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const friend = createCompanion("friend", { x: 5, y: 5.8 }, "actor");
    const state = setup([actor, friend]);
    expect(areEntitiesOverlapping(actor, friend)).toBe(true);
    expect(isCombatPositionSpacedFromParty(state, actor, actor.position)).toBe(false);
    expect(isWalkablePosition(state, friend.position, actor.id, { allowPartyPassThrough: true })).toBe(true);
    expect(isCombatPositionAvailable(state, actor, friend.position)).toBe(false);
    const settled = { x: 4.1, y: 5.45 };
    expect(areEntitiesOverlapping(actor, friend, settled, actor.position)).toBe(false);
  });

  it("checks reserved enemy bodies and allows partial recovery out of the source body", () => {
    const actor = createCompanion("actor", { x: 5, y: 5 }, "actor");
    const enemy = createEnemy("enemy", { x: 8, y: 5 }, undefined, { combatBodyRadius: 1.25 });
    const state = setup([actor, enemy]);
    state.reservedPositionsByEntityId = { enemy: { x: 5, y: 5 } };
    expect(isCombatPositionAvailable(state, actor, { x: 5.8, y: 5 })).toBe(false);
    expect(isEntitySeparationPositionAvailable(state, actor.id, enemy.id, { x: 5.12, y: 5 })).toBe(true);
  });

  it("keeps minimum movement radius and full bodies inside encounter bounds", () => {
    const enemy = { ...createEnemy("enemy", { x: 10, y: 10 }, undefined, { combatBodyRadius: 0.7 }),
      minimumMovementBodyRadius: 2, movementBounds: { minX: 5, maxX: 15, minY: 5, maxY: 15 } };
    const state = setup([enemy]);
    expect(isCombatPositionAvailable(state, enemy, { x: 7.04, y: 10 })).toBe(false);
    expect(isCombatPositionAvailable(state, enemy, { x: 7.06, y: 10 })).toBe(true);
    expect(isEntitySeparationPositionAvailable(state, enemy.id, "source", { x: 7.04, y: 10 })).toBe(false);
    const actor = createCompanion("actor", { x: 5, y: 10 }, "actor");
    expect(getEffectiveAttackRange(enemy, actor, 1)).toBe(1.7);
  });
});
