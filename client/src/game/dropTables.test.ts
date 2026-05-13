import { describe, expect, it } from "vitest";
import {
  ENEMY_DROP_TABLES,
  getLootTierForLevel,
  rollEnemyDropTable,
} from "./dropTables";
import { getItemDefinition } from "./items";

describe("enemy drop tables", () => {
  it("maps prototype content levels to the supported loot tiers", () => {
    expect(getLootTierForLevel(1)).toBe(1);
    expect(getLootTierForLevel(9)).toBe(1);
    expect(getLootTierForLevel(10)).toBe(2);
    expect(getLootTierForLevel(19)).toBe(2);
    expect(getLootTierForLevel(20)).toBe(2);
  });

  it("gives each supported family tier one common and one rare family drop", () => {
    const familyTierPairs = Object.values(ENEMY_DROP_TABLES).flatMap((tiers) =>
      Object.values(tiers),
    );

    for (const table of familyTierPairs) {
      expect(table?.groups).toHaveLength(2);
      expect(table?.groups[0]?.id).toContain("common");
      expect(table?.groups[1]?.id).toContain("rare");
      expect(table?.groups.every((group) => group.entries.length === 1)).toBe(true);
    }
  });

  it("keeps normal wolf and orc tables scoped to junk drops", () => {
    const wolfItemIds = ENEMY_DROP_TABLES.wolf?.[1]?.groups.flatMap((group) =>
      group.entries.map((entry) => entry.itemId),
    );
    const orcItemIds = ENEMY_DROP_TABLES.orc?.[2]?.groups.flatMap((group) =>
      group.entries.map((entry) => entry.itemId),
    );

    expect(wolfItemIds).toEqual(["wolf_pelt", "wolf_fang"]);
    expect(orcItemIds).toEqual(["orc_hide", "orc_tusk"]);
    expect(wolfItemIds?.every((itemId) => getItemDefinition(itemId).category === "junk"))
      .toBe(true);
    expect(orcItemIds?.every((itemId) => getItemDefinition(itemId).category === "junk"))
      .toBe(true);
  });

  it("shares goblin family drops across goblin archetypes", () => {
    const scoutRolls = rollEnemyDropTable("goblin", 1, createAlwaysDropRandom());
    const throwerRolls = rollEnemyDropTable("goblin", 1, createAlwaysDropRandom());

    expect(scoutRolls.map((roll) => roll.entry?.itemId)).toEqual([
      "goblin_ear_t1",
      "goblin_tooth_t1",
    ]);
    expect(throwerRolls.map((roll) => roll.entry?.itemId)).toEqual(
      scoutRolls.map((roll) => roll.entry?.itemId),
    );
  });

  it("adds the Goblin Shaman Tier 2 archetype equipment drop", () => {
    const rolls = rollEnemyDropTable(
      "goblin",
      2,
      createAlwaysDropRandom(),
      "goblin_shaman",
    );

    expect(rolls.map((roll) => roll.entry?.itemId)).toEqual([
      "goblin_ear_t2",
      "goblin_tooth_t2",
      "holy_lantern",
    ]);
    expect(getItemDefinition("holy_lantern").category).toBe("equipment");
  });
});

function createAlwaysDropRandom() {
  return () => 0;
}
