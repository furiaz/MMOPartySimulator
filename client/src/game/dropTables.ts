import type { EnemyType, ItemId } from "./types";

export type DropTableId = "wolf_drops" | "orc_drops";

export type DropTableEntry = {
  itemId: ItemId;
  quantity: number;
};

export type DropGroup = {
  id: string;
  chance: number;
  entries: DropTableEntry[];
};

export type EnemyDropTable = {
  id: DropTableId;
  enemyType: EnemyType;
  groups: DropGroup[];
};

export type DropRollResult = {
  tableId: DropTableId;
  groupId: string;
  chance: number;
  didDrop: boolean;
  entry?: DropTableEntry;
};

export const ENEMY_DROP_TABLES: Record<EnemyType, EnemyDropTable> = {
  wolf: {
    id: "wolf_drops",
    enemyType: "wolf",
    groups: [
      {
        id: "wolf_material",
        chance: 0.85,
        entries: [
          { itemId: "wolf_pelt", quantity: 1 },
          { itemId: "wolf_fang", quantity: 1 },
          { itemId: "wolf_claw", quantity: 1 },
        ],
      },
      {
        id: "wolf_equipment",
        chance: 0.3,
        entries: [
          { itemId: "worn_cap", quantity: 1 },
          { itemId: "worn_tunic", quantity: 1 },
          { itemId: "worn_pants", quantity: 1 },
          { itemId: "worn_gloves", quantity: 1 },
          { itemId: "worn_boots", quantity: 1 },
        ],
      },
    ],
  },
  orc: {
    id: "orc_drops",
    enemyType: "orc",
    groups: [
      {
        id: "orc_material",
        chance: 0.85,
        entries: [
          { itemId: "orc_tusk", quantity: 1 },
          { itemId: "orc_hide", quantity: 1 },
          { itemId: "orc_scrap", quantity: 1 },
        ],
      },
      {
        id: "orc_equipment",
        chance: 0.3,
        entries: [
          { itemId: "reinforced_helm", quantity: 1 },
          { itemId: "reinforced_armor", quantity: 1 },
          { itemId: "reinforced_legguards", quantity: 1 },
          { itemId: "reinforced_gloves", quantity: 1 },
          { itemId: "reinforced_boots", quantity: 1 },
        ],
      },
    ],
  },
};

export function getEnemyDropTable(
  enemyType: EnemyType,
): EnemyDropTable {
  return ENEMY_DROP_TABLES[enemyType];
}

export function rollEnemyDropTable(
  enemyType: EnemyType,
  random = Math.random,
): DropRollResult[] {
  const table = getEnemyDropTable(enemyType);

  return table.groups.map((group) => {
    const didDrop = random() < group.chance;

    if (!didDrop) {
      return {
        tableId: table.id,
        groupId: group.id,
        chance: group.chance,
        didDrop,
      };
    }

    const entryIndex = Math.floor(random() * group.entries.length);

    return {
      tableId: table.id,
      groupId: group.id,
      chance: group.chance,
      didDrop,
      entry: group.entries[entryIndex] ?? group.entries[0],
    };
  });
}
