import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc, createResource } from "./entities";
import { createTestGameState } from "./testState";
import { createAoeCastTransform, resolveAoePattern } from "./aoePatterns";
import { doesEntityOverlapFootprint, isStructureFootprintOccupied, planStructureRebuildClearance } from "./structureRebuildClearance";
import type { EnemyAbilityCastState, GameEntity, GameMap } from "./types";

const footprint = { minX: 9, maxX: 11, minY: 9, maxY: 11 };
function setup(entities: GameEntity[]) {
  return createTestGameState({ entities: Object.fromEntries(entities.map(entity => [entity.id, entity])),
    map: { columns: 35, rows: 35, walls: [], collisionWalls: [], teleports: [], healingFountains: [], displayName: "Clearance", debugName: "clearance" } as GameMap });
}
function cast(id: string): EnemyAbilityCastState {
  return { id: "cast", abilityId: "orc_raider_rending_dash", casterId: id, targetId: "target", phase: "casting",
    startedAt: 0, castEndsAt: 900, windupEndsAt: 1100, origin: { x: 5, y: 10 }, targetPosition: { x: 15, y: 10 }, direction: { x: 1, y: 0 },
    dashPlan: { destination: { x: 15, y: 10 }, distance: 10, durationMs: 350 } };
}
describe("structure rebuild clearance", () => {
  it("chooses a nearest valid capsule placement without changing the input", () => {
    const actor = createCompanion("actor", { x: 9.1, y: 10 }, "Actor");
    const state = setup([actor]);
    const corrections = planStructureRebuildClearance(state, "building", footprint)!;
    expect(corrections.size).toBe(1);
    expect(corrections.get("actor")!.x).toBeCloseTo(8.389);
    expect(corrections.get("actor")!.y).toBe(10);
    expect(doesEntityOverlapFootprint(actor, footprint, corrections.get("actor"))).toBe(false);
    expect(state.entities.actor).toBe(actor);
    expect(actor.position).toEqual({ x: 9.1, y: 10 });
  });
  it("plans several bodies deterministically without shared landing positions", () => {
    const actors = [createCompanion("b", { x: 10.5, y: 10 }, "B"), createCompanion("a", { x: 9.5, y: 10 }, "A")];
    const first = planStructureRebuildClearance(setup(actors), "building", footprint)!;
    const second = planStructureRebuildClearance(setup([...actors].reverse()), "building", footprint);
    expect(first).toEqual(second);
    expect(first.size).toBe(2);
    expect(first.get("a")).not.toEqual(first.get("b"));
    for (const actor of actors) expect(doesEntityOverlapFootprint(actor, footprint, first.get(actor.id))).toBe(false);
  });
  it.each(["npc", "resource", "structure"])("never displaces an immovable %s", kind => {
    const entity = kind === "npc" ? createNpc("fixed", { x: 10, y: 10 }, "NPC", "quest_guide")
      : kind === "resource" ? createResource("fixed", { x: 10, y: 10 })
      : { ...createEnemy("fixed", { x: 10, y: 10 }), kind: "structure" as const, structureType: "orc_barracks" as const,
        displayName: "Building", footprint, attackBounds: footprint };
    expect(planStructureRebuildClearance(setup([entity]), "building", footprint)).toBeNull();
  });
  it("fails atomically when a later enemy cannot leave its movement bounds", () => {
    const actor = createCompanion("a", { x: 10.5, y: 10 }, "A");
    const trapped = { ...createEnemy("z", { x: 10, y: 10 }), movementBounds: footprint };
    const state = setup([actor, trapped]);
    expect(planStructureRebuildClearance(state, "building", footprint)).toBeNull();
    expect(state.entities.a).toBe(actor);
    expect(state.entities.z).toBe(trapped);
  });
  it.each(["wall", "resource"])("does not separate through a %s on the nearest side", kind => {
    const actor = createCompanion("actor", { x: 10, y: 10 }, "Actor");
    const state = setup(kind === "resource" ? [actor, createResource("resource", { x: 8, y: 10 })] : [actor]);
    if (kind === "wall") state.map!.walls = [{ x: 8, y: 10 }];
    const position = planStructureRebuildClearance(state, "building", footprint)!.get("actor")!;
    expect(position.x).toBeGreaterThan(11);
  });
  it("waits for a reservation without moving its physically clear owner", () => {
    const actor = createCompanion("actor", { x: 2, y: 2 }, "Actor");
    const state = { ...setup([actor]), reservedPositionsByEntityId: { actor: { x: 10, y: 10 } } };
    expect(isStructureFootprintOccupied(state, "building", footprint)).toBe(true);
    expect(planStructureRebuildClearance(state, "building", footprint)).toBeNull();
    expect(state.entities.actor).toBe(actor);
  });
  it.each(["pending_dash", "dash", "forced"])("waits for %s paths crossing the footprint even with a distant landing", mode => {
    const actor = createEnemy("actor", { x: 5, y: 10 }, "aggressive", { enemyTypeId: "orc_raider" });
    const state = setup([actor]);
    if (mode === "pending_dash") state.enemyAbilityCastsByEnemyId = { actor: cast(actor.id) };
    else if (mode === "dash") state.enemyDashesByEnemyId = { actor: { id: "dash", abilityId: "orc_raider_rending_dash", casterId: actor.id,
      origin: actor.position, direction: { x: 1, y: 0 }, destination: { x: 15, y: 10 }, distance: 10,
      area: resolveAoePattern({ type: "circle", radius: 1 }, createAoeCastTransform(actor.position, { x: 15, y: 10 })),
      startedAt: 0, endsAt: 350, lastUpdatedAt: 0, lastProgressDistance: 0, lastSafePosition: actor.position, powerMultiplier: 1, hitTargetIds: [] } };
    else state.forcedMovementsByEntityId = { actor: { targetId: actor.id, sourceId: "source", origin: actor.position, direction: { x: 1, y: 0 },
      distance: 10, startedAt: 0, endsAt: 250, lastSafePosition: actor.position } };
    expect(planStructureRebuildClearance(state, "building", footprint)).toBeNull();
    expect(isStructureFootprintOccupied(state, "building", footprint)).toBe(true);
  });
  it("uses the fully grown Boss body and respects map edges", () => {
    const boss = { ...createEnemy("boss", { x: 10, y: 10 }, "aggressive", { enemyTypeId: "orc_warmaster", combatBodyRadius: 1.25 }), combatSizeMultiplier: 1.5 };
    const state = setup([boss]);
    const position = planStructureRebuildClearance(state, "building", footprint)!.get("boss")!;
    expect(doesEntityOverlapFootprint(boss, footprint, position)).toBe(false);
    expect(Math.hypot(position.x - 10, position.y - 10)).toBeGreaterThan(2.9);
  });
  it("reserves maximum-growth clearance even while a Boss is still base-sized", () => {
    const boss = { ...createEnemy("boss", { x: 10, y: 10 }, "aggressive", { enemyTypeId: "orc_warmaster", combatBodyRadius: 1.25 }), minimumMovementBodyRadius: 1.875 };
    const position = planStructureRebuildClearance(setup([boss]), "building", footprint)!.get("boss")!;
    expect(doesEntityOverlapFootprint({ ...boss, combatSizeMultiplier: 1.5 }, footprint, position)).toBe(false);
  });
  it("does not choose a landing reserved by a physically distant actor", () => {
    const actor = createCompanion("actor", { x: 9.1, y: 10 }, "Actor");
    const other = createCompanion("other", { x: 2, y: 2 }, "Other");
    const state = setup([actor, other]);
    state.reservedPositionsByEntityId = { other: { x: 8.389, y: 10 } };
    const destination = planStructureRebuildClearance(state, "building", footprint)!.get("actor")!;
    expect(Math.hypot(destination.x - 8.389, destination.y - 10)).toBeGreaterThan(1.12);
  });
  it("does not push a body beyond the map boundary", () => {
    const actor = createCompanion("actor", { x: 0, y: 10 }, "Actor");
    const edgeFootprint = { minX: -0.5, maxX: 1, minY: 9, maxY: 11 };
    const destination = planStructureRebuildClearance(setup([actor]), "building", edgeFootprint);
    // The source body already intersects the map edge, so no safe swept correction exists.
    expect(destination).toBeNull();
  });
  it("ignores dead bodies and empty footprints", () => {
    const dead = { ...createCompanion("dead", { x: 10, y: 10 }, "Dead"), health: 0, state: "dead" as const };
    expect(planStructureRebuildClearance(setup([dead]), "building", footprint)?.size).toBe(0);
  });
});
