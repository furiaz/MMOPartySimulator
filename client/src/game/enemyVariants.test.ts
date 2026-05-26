import { describe, expect, it } from "vitest";
import { createEnemy } from "./entities";
import {
  isInSuperiorBlockedMiddleBand,
  rollEnemyVariantForSpawn,
} from "./enemyVariants";
import { createDebugMap, MAP_ONE_ID, HUB_MAP_ID } from "./debugMap";

describe("enemy variants", () => {
  it("applies Superior stat multipliers when creating an enemy", () => {
    const slime = createEnemy("slime", { x: 10, y: 10 }, undefined, {
      enemyTypeId: "slime",
      variant: "superior",
    });

    expect(slime).toMatchObject({
      variant: "superior",
      maxHealth: 20,
      health: 20,
      attack: 3,
      defense: 0,
      magicDefense: 0,
    });
    expect(slime.scalingOverrides).toContain("superior");
  });

  it("blocks Superior rolls in the middle twenty percent of map height", () => {
    const map = createDebugMap(MAP_ONE_ID);

    expect(isInSuperiorBlockedMiddleBand({ x: 10, y: map.rows * 0.4 }, map)).toBe(true);
    expect(isInSuperiorBlockedMiddleBand({ x: 10, y: map.rows * 0.5 }, map)).toBe(true);
    expect(isInSuperiorBlockedMiddleBand({ x: 10, y: map.rows * 0.6 }, map)).toBe(true);
    expect(isInSuperiorBlockedMiddleBand({ x: 10, y: map.rows * 0.39 }, map)).toBe(false);
    expect(isInSuperiorBlockedMiddleBand({ x: 10, y: map.rows * 0.61 }, map)).toBe(false);
  });

  it("rolls Superior only for eligible wild-map subzone enemies", () => {
    const map = createDebugMap(MAP_ONE_ID);

    expect(
      rollEnemyVariantForSpawn({
        currentMapId: MAP_ONE_ID,
        map,
        position: { x: 10, y: 10 },
        subzoneId: "shore-fringe",
        existingEntities: {},
        random: () => 0.01,
      }),
    ).toBe("superior");
    expect(
      rollEnemyVariantForSpawn({
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
        position: { x: 10, y: 10 },
        subzoneId: "hub",
        existingEntities: {},
        random: () => 0,
      }),
    ).toBeUndefined();
  });

  it("allows at most one living Superior enemy per subzone", () => {
    const map = createDebugMap(MAP_ONE_ID);
    const superior = createEnemy("superior", { x: 8, y: 8 }, undefined, {
      enemyTypeId: "slime",
      subzoneId: "shore-fringe",
      variant: "superior",
    });

    expect(
      rollEnemyVariantForSpawn({
        currentMapId: MAP_ONE_ID,
        map,
        position: { x: 10, y: 10 },
        subzoneId: "shore-fringe",
        existingEntities: { [superior.id]: superior },
        random: () => 0,
      }),
    ).toBeUndefined();
  });
});
