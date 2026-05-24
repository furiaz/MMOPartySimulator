import type {
  EnemyArchetypeId,
  EnemyTypeId,
  ItemId,
  LootTier,
} from "./types";

export type DropTableId = `${EnemyArchetypeId}_tier_${LootTier}_drops` | "goblin_shaman_tier_2_drops";

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
  archetypeId: EnemyArchetypeId;
  tier: LootTier;
  groups: DropGroup[];
};

export type DropRollResult = {
  tableId: DropTableId;
  groupId: string;
  chance: number;
  didDrop: boolean;
  entry?: DropTableEntry;
};

export const SUPPORTED_LOOT_TIERS: LootTier[] = [1, 2];

export const ENEMY_DROP_TABLES: Partial<
  Record<EnemyArchetypeId, Partial<Record<LootTier, EnemyDropTable>>>
> = {
  slime: {
    1: createArchetypeDropTable("slime", 1, [
      createDropGroup("slime_common", 0.7, "slime_gel_t1"),
      createDropGroup("slime_rare", 0.12, "slime_core_t1"),
    ]),
  },
  bat: {
    1: createArchetypeDropTable("bat", 1, [
      createDropGroup("bat_common", 0.65, "bat_wing_t1"),
      createDropGroup("bat_rare", 0.1, "bat_ear_t1"),
    ]),
  },
  spider: {
    1: createArchetypeDropTable("spider", 1, [
      createDropGroup("spider_common", 0.65, "spider_silk_t1"),
      createDropGroup("spider_rare", 0.1, "spider_fang_t1"),
    ]),
  },
  goblin: {
    1: createArchetypeDropTable("goblin", 1, [
      createDropGroup("goblin_common", 0.6, "goblin_ear_t1"),
      createDropGroup("goblin_rare", 0.09, "goblin_tooth_t1"),
    ]),
    2: createArchetypeDropTable("goblin", 2, [
      createDropGroup("goblin_common", 0.6, "goblin_ear_t2"),
      createDropGroup("goblin_rare", 0.09, "goblin_tooth_t2"),
    ]),
  },
  imp: {
    1: createArchetypeDropTable("imp", 1, [
      createDropGroup("imp_common", 0.6, "imp_horn_chip_t1"),
      createDropGroup("imp_rare", 0.08, "imp_tail_t1"),
    ]),
  },
  wolf: {
    1: createArchetypeDropTable("wolf", 1, [
      createDropGroup("wolf_common", 0.6, "wolf_pelt"),
      createDropGroup("wolf_rare", 0.08, "wolf_fang"),
    ]),
  },
  crawler: {
    1: createArchetypeDropTable("crawler", 1, [
      createDropGroup("crawler_common", 0.55, "crawler_pebble_t1"),
      createDropGroup("crawler_rare", 0.07, "crawler_plate_t1"),
    ]),
  },
  mossling: {
    1: createArchetypeDropTable("mossling", 1, [
      createDropGroup("mossling_common", 0.55, "moss_tuft_t1"),
      createDropGroup("mossling_rare", 0.07, "mossling_cap_t1"),
    ]),
  },
  wisp: {
    2: createArchetypeDropTable("wisp", 2, [
      createDropGroup("wisp_common", 0.55, "wisp_ash_t2"),
      createDropGroup("wisp_rare", 0.07, "wisp_ember_t2"),
    ]),
  },
  orc: {
    2: createArchetypeDropTable("orc", 2, [
      createDropGroup("orc_common", 0.55, "orc_hide"),
      createDropGroup("orc_rare", 0.07, "orc_tusk"),
    ]),
  },
};

export const ENEMY_TYPE_DROP_TABLES: Partial<
  Record<EnemyTypeId, Partial<Record<LootTier, EnemyDropTable>>>
> = {
  goblin_shaman: {
    2: {
      id: "goblin_shaman_tier_2_drops",
      archetypeId: "goblin",
      tier: 2,
      groups: [
        createDropGroup("goblin_shaman_equipment", 0.02, "holy_lantern"),
      ],
    },
  },
};

export function getLootTierForLevel(level: number): LootTier {
  return level >= 10 ? 2 : 1;
}

export function getEnemyDropTable(
  archetypeId: EnemyArchetypeId,
  tier: LootTier,
): EnemyDropTable | undefined {
  return ENEMY_DROP_TABLES[archetypeId]?.[tier];
}

export function getEnemyTypeDropTable(
  enemyTypeId: EnemyTypeId | undefined,
  tier: LootTier,
): EnemyDropTable | undefined {
  return enemyTypeId ? ENEMY_TYPE_DROP_TABLES[enemyTypeId]?.[tier] : undefined;
}

export function rollEnemyDropTable(
  archetypeId: EnemyArchetypeId,
  tier: LootTier,
  random = Math.random,
  enemyTypeId?: EnemyTypeId,
): DropRollResult[] {
  const tables = [
    getEnemyDropTable(archetypeId, tier),
    getEnemyTypeDropTable(enemyTypeId, tier),
  ].filter((table): table is EnemyDropTable => Boolean(table));

  return tables.flatMap((table) =>
    table.groups.map((group) => rollDropGroup(table, group, random)),
  );
}

function createArchetypeDropTable(
  archetypeId: EnemyArchetypeId,
  tier: LootTier,
  groups: DropGroup[],
): EnemyDropTable {
  return {
    id: `${archetypeId}_tier_${tier}_drops`,
    archetypeId,
    tier,
    groups,
  };
}

function createDropGroup(
  id: string,
  chance: number,
  itemId: ItemId,
): DropGroup {
  return {
    id,
    chance,
    entries: [{ itemId, quantity: 1 }],
  };
}

function rollDropGroup(
  table: EnemyDropTable,
  group: DropGroup,
  random: () => number,
): DropRollResult {
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
}
