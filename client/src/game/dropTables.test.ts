import { describe, expect, it } from "vitest";
import { ENEMY_DROP_TABLES, rollEnemyDropTable } from "./dropTables";
import { getItemDefinition } from "./items";

describe("enemy drop tables", () => {
  it("keeps wolf drops scoped to wolf materials and worn armor", () => {
    const itemIds = ENEMY_DROP_TABLES.wolf.groups.flatMap((group) =>
      group.entries.map((entry) => entry.itemId),
    );

    expect(itemIds).toEqual([
      "wolf_pelt",
      "wolf_fang",
      "wolf_claw",
      "worn_cap",
      "worn_tunic",
      "worn_pants",
      "worn_gloves",
      "worn_boots",
    ]);
  });

  it("keeps orc drops scoped to orc materials and reinforced armor", () => {
    const itemIds = ENEMY_DROP_TABLES.orc.groups.flatMap((group) =>
      group.entries.map((entry) => entry.itemId),
    );

    expect(itemIds).toEqual([
      "orc_tusk",
      "orc_hide",
      "orc_scrap",
      "reinforced_helm",
      "reinforced_armor",
      "reinforced_legguards",
      "reinforced_gloves",
      "reinforced_boots",
    ]);
  });

  it("uses stronger map-2 armor stats than map-1 armor stats", () => {
    expect(getItemDefinition("worn_cap").statModifiers).toEqual({ defense: 1 });
    expect(getItemDefinition("reinforced_helm").statModifiers).toEqual({ defense: 2 });
    expect(getItemDefinition("worn_tunic").statModifiers).toEqual({ defense: 2 });
    expect(getItemDefinition("reinforced_armor").statModifiers).toEqual({ defense: 3 });
    expect(getItemDefinition("worn_gloves").statModifiers).toEqual({ attack: 1 });
    expect(getItemDefinition("reinforced_gloves").statModifiers).toEqual({ attack: 2 });
  });

  it("rolls groups independently with deterministic random input", () => {
    const randomValues = [0.1, 0, 0.99];
    const rolls = rollEnemyDropTable("wolf", () => randomValues.shift() ?? 0);

    expect(rolls).toEqual([
      {
        tableId: "wolf_drops",
        groupId: "wolf_material",
        chance: 0.85,
        didDrop: true,
        entry: { itemId: "wolf_pelt", quantity: 1 },
      },
      {
        tableId: "wolf_drops",
        groupId: "wolf_equipment",
        chance: 0.3,
        didDrop: false,
      },
    ]);
  });
});
