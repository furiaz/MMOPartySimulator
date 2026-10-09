import { describe, expect, it } from "vitest";
import { createEnemy } from "./game/entities";
import type { PoiConsideration } from "./game/questTypes";
import type { EnemyArchetypeId, GameEntity } from "./game/types";
import { getPoiDisplayName } from "./poiPresentation";

const BASE_TARGET: PoiConsideration = {
  poiId: "zone-1-green-slime-01",
  category: "combat",
  mapId: "map-1",
  position: { x: 1, y: 1 },
  reason: "Reachable combat target",
  priority: 1,
  pathDistance: 1,
};

describe("POI presentation", () => {
  it("shows the broad enemy archetype for combat POIs", () => {
    const enemy = createEnemy(
      BASE_TARGET.poiId,
      BASE_TARGET.position,
      undefined,
      { enemyTypeId: "green_slime" },
    );

    expect(getPoiDisplayName(BASE_TARGET, { [enemy.id]: enemy })).toBe("Slime");
  });

  it("resolves a combat target through targetEntityId", () => {
    const enemy = createEnemy("actual-enemy", BASE_TARGET.position, undefined, {
      enemyTypeId: "cave_bat",
    });

    expect(
      getPoiDisplayName(
        { ...BASE_TARGET, poiId: "combat-poi", targetEntityId: enemy.id },
        { [enemy.id]: enemy },
      ),
    ).toBe("Bat");
  });

  it("uses the enemy type and generic fallbacks when needed", () => {
    const typeOnlyEnemy = {
      ...createEnemy("type-only", BASE_TARGET.position, undefined, {
        enemyTypeId: "green_slime",
      }),
      archetypeId: "missing-archetype" as EnemyArchetypeId,
    };
    const unknownEnemy = {
      ...typeOnlyEnemy,
      id: "unknown-enemy",
      enemyTypeId: undefined,
    };
    const entities: Record<string, GameEntity> = {
      [typeOnlyEnemy.id]: typeOnlyEnemy,
      [unknownEnemy.id]: unknownEnemy,
    };

    expect(
      getPoiDisplayName(
        { ...BASE_TARGET, poiId: typeOnlyEnemy.id },
        entities,
      ),
    ).toBe("Green Slime");
    expect(
      getPoiDisplayName(
        { ...BASE_TARGET, poiId: unknownEnemy.id },
        entities,
      ),
    ).toBe("Enemy");
    expect(
      getPoiDisplayName(
        { ...BASE_TARGET, poiId: "missing-enemy" },
        entities,
      ),
    ).toBe("Enemy");
  });

  it("leaves non-combat POI ids unchanged", () => {
    expect(
      getPoiDisplayName(
        { ...BASE_TARGET, category: "resource", poiId: "test-resource-wood" },
        {},
      ),
    ).toBe("test-resource-wood");
  });
});
