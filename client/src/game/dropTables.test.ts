import { describe, expect, it } from "vitest";
import {
  ENEMY_DROP_TABLES,
  ENEMY_TYPE_DROP_TABLES,
  SUPERIOR_ENEMY_DROP_TABLES,
  getLootTierForLevel,
  rollEnemyDropTable,
} from "./dropTables";
import { getItemDefinition, getItemDisplayName } from "./items";

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

  it("keeps normal wolf and orc tables scoped to enemy-part material drops", () => {
    const wolfItemIds = ENEMY_DROP_TABLES.wolf?.[1]?.groups.flatMap((group) =>
      group.entries.map((entry) => entry.itemId),
    );
    const orcItemIds = ENEMY_DROP_TABLES.orc?.[2]?.groups.flatMap((group) =>
      group.entries.map((entry) => entry.itemId),
    );

    expect(wolfItemIds).toEqual(["wolf_pelt", "wolf_fang"]);
    expect(orcItemIds).toEqual(["orc_hide", "orc_tusk"]);
    expect(wolfItemIds?.every((itemId) => {
      const itemDefinition = getItemDefinition(itemId);

      return itemDefinition.category === "material" &&
        itemDefinition.materialKind === "enemy_part";
    })).toBe(true);
    expect(orcItemIds?.every((itemId) => {
      const itemDefinition = getItemDefinition(itemId);

      return itemDefinition.category === "material" &&
        itemDefinition.materialKind === "enemy_part";
    })).toBe(true);
  });

  it("adds Tier 2 drops for the level 13-18 archetypes", () => {
    expect(ENEMY_DROP_TABLES.imp?.[2]?.groups.map((group) => group.entries[0]?.itemId))
      .toEqual(["imp_horn_chip_t2", "imp_tail_t2"]);
    expect(ENEMY_DROP_TABLES.crawler?.[2]?.groups.map((group) => group.entries[0]?.itemId))
      .toEqual(["crawler_pebble_t2", "crawler_plate_t2"]);
    expect(ENEMY_DROP_TABLES.wolf?.[2]?.groups.map((group) => group.entries[0]?.itemId))
      .toEqual(["wolf_pelt_t2", "wolf_fang_t2"]);
    expect(ENEMY_DROP_TABLES.spider?.[2]?.groups.map((group) => group.entries[0]?.itemId))
      .toEqual(["spider_silk_t2", "spider_fang_t2"]);
    expect(ENEMY_DROP_TABLES.bat?.[2]?.groups.map((group) => group.entries[0]?.itemId))
      .toEqual(["bat_wing_t2", "bat_ear_t2"]);
    expect(ENEMY_DROP_TABLES.mossling?.[2]?.groups.map((group) => group.entries[0]?.itemId))
      .toEqual(["moss_tuft_t2", "mossling_cap_t2"]);
  });

  it("formats tiered monster parts with the tier after the base name", () => {
    expect(getItemDefinition("orc_hide").displayName).toBe("Orc Hide");
    expect(getItemDisplayName("orc_hide")).toBe("Orc Hide (Tier 2)");
    expect(getItemDisplayName("slime_gel_t1")).toBe("Slime Gel (Tier 1)");
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

  it("uses explicit Superior drop tables for Superior enemies", () => {
    expect(SUPERIOR_ENEMY_DROP_TABLES.slime?.[1]?.groups.map((group) => ({
      id: group.id,
      chance: group.chance,
      itemId: group.entries[0]?.itemId,
    }))).toEqual([
      { id: "slime_superior_common", chance: 1.5, itemId: "slime_gel_t1" },
      { id: "slime_superior_rare", chance: 0.8, itemId: "slime_core_t1" },
    ]);
    expect(SUPERIOR_ENEMY_DROP_TABLES.crawler?.[1]?.groups[1]?.chance).toBe(0.6);
    expect(SUPERIOR_ENEMY_DROP_TABLES.orc?.[2]?.groups[1]?.chance).toBe(0.55);
  });

  it("uses higher Zone 7 type-specific rates without adding archetype duplicates", () => {
    expect(ENEMY_TYPE_DROP_TABLES.cinder_wisp?.[2]?.overridesArchetypeDrops)
      .toBe(true);
    expect(ENEMY_TYPE_DROP_TABLES.orc_warmaster?.[2]?.overridesArchetypeDrops)
      .toBe(true);

    const wispRolls = rollEnemyDropTable(
      "wisp",
      2,
      createAlwaysDropRandom(),
      "cinder_wisp",
    );
    const orcRolls = rollEnemyDropTable(
      "orc",
      2,
      createAlwaysDropRandom(),
      "orc_warmaster",
    );

    expect(wispRolls.map((roll) => roll.entry?.itemId)).toEqual([
      "wisp_ash_t2",
      "wisp_ember_t2",
    ]);
    expect(orcRolls.map((roll) => roll.entry?.itemId)).toEqual([
      "orc_hide",
      "orc_tusk",
    ]);
    expect(wispRolls.map((roll) => roll.chance)).toEqual([0.65, 0.1]);
    expect(orcRolls.map((roll) => roll.chance)).toEqual([0.65, 0.1]);
  });

  it("treats drop chances over one hundred percent as guaranteed quantity plus fractional bonus", () => {
    const guaranteedOnlyRolls = rollEnemyDropTable(
      "slime",
      1,
      createNeverDropRandom(),
      undefined,
      "superior",
    );
    const bonusRolls = rollEnemyDropTable(
      "slime",
      1,
      createAlwaysDropRandom(),
      undefined,
      "superior",
    );

    expect(guaranteedOnlyRolls[0]?.entry).toMatchObject({
      itemId: "slime_gel_t1",
      quantity: 1,
    });
    expect(bonusRolls[0]?.entry).toMatchObject({
      itemId: "slime_gel_t1",
      quantity: 2,
    });
  });

  it("selects Superior type-specific drops for Superior Goblin Shaman", () => {
    const rolls = rollEnemyDropTable(
      "goblin",
      2,
      createAlwaysDropRandom(),
      "goblin_shaman",
      "superior",
    );

    expect(rolls.map((roll) => roll.entry?.itemId)).toEqual([
      "goblin_ear_t2",
      "goblin_tooth_t2",
      "holy_lantern",
    ]);
    expect(rolls[2]?.chance).toBe(0.2);
  });
});

function createAlwaysDropRandom() {
  return () => 0;
}

function createNeverDropRandom() {
  return () => 0.99;
}
