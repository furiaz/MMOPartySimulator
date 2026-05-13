import type {
  EnemyArchetypeId,
  EnemyFamilyId,
  ItemId,
  LootTier,
} from "./types";

export type DropTableId = `${EnemyFamilyId}_tier_${LootTier}_drops` | "goblin_shaman_tier_2_drops";

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
  familyId: EnemyFamilyId;
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
  Record<EnemyFamilyId, Partial<Record<LootTier, EnemyDropTable>>>
> = {
  slime: {
    1: createFamilyDropTable("slime", 1, [
      createDropGroup("slime_common", 0.7, "slime_gel_t1"),
      createDropGroup("slime_rare", 0.12, "slime_core_t1"),
    ]),
  },
  bat: {
    1: createFamilyDropTable("bat", 1, [
      createDropGroup("bat_common", 0.65, "bat_wing_t1"),
      createDropGroup("bat_rare", 0.1, "bat_ear_t1"),
    ]),
  },
  spider: {
    1: createFamilyDropTable("spider", 1, [
      createDropGroup("spider_common", 0.65, "spider_silk_t1"),
      createDropGroup("spider_rare", 0.1, "spider_fang_t1"),
    ]),
  },
  goblin: {
    1: createFamilyDropTable("goblin", 1, [
      createDropGroup("goblin_common", 0.6, "goblin_ear_t1"),
      createDropGroup("goblin_rare", 0.09, "goblin_tooth_t1"),
    ]),
    2: createFamilyDropTable("goblin", 2, [
      createDropGroup("goblin_common", 0.6, "goblin_ear_t2"),
      createDropGroup("goblin_rare", 0.09, "goblin_tooth_t2"),
    ]),
  },
  imp: {
    1: createFamilyDropTable("imp", 1, [
      createDropGroup("imp_common", 0.6, "imp_horn_chip_t1"),
      createDropGroup("imp_rare", 0.08, "imp_tail_t1"),
    ]),
  },
  wolf: {
    1: createFamilyDropTable("wolf", 1, [
      createDropGroup("wolf_common", 0.6, "wolf_pelt"),
      createDropGroup("wolf_rare", 0.08, "wolf_fang"),
    ]),
  },
  crawler: {
    1: createFamilyDropTable("crawler", 1, [
      createDropGroup("crawler_common", 0.55, "crawler_pebble_t1"),
      createDropGroup("crawler_rare", 0.07, "crawler_plate_t1"),
    ]),
  },
  mossling: {
    1: createFamilyDropTable("mossling", 1, [
      createDropGroup("mossling_common", 0.55, "moss_tuft_t1"),
      createDropGroup("mossling_rare", 0.07, "mossling_cap_t1"),
    ]),
  },
  wisp: {
    2: createFamilyDropTable("wisp", 2, [
      createDropGroup("wisp_common", 0.55, "wisp_ash_t2"),
      createDropGroup("wisp_rare", 0.07, "wisp_ember_t2"),
    ]),
  },
  orc: {
    2: createFamilyDropTable("orc", 2, [
      createDropGroup("orc_common", 0.55, "orc_hide"),
      createDropGroup("orc_rare", 0.07, "orc_tusk"),
    ]),
  },
};

export const ENEMY_ARCHETYPE_DROP_TABLES: Partial<
  Record<EnemyArchetypeId, Partial<Record<LootTier, EnemyDropTable>>>
> = {
  goblin_shaman: {
    2: {
      id: "goblin_shaman_tier_2_drops",
      familyId: "goblin",
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
  familyId: EnemyFamilyId,
  tier: LootTier,
): EnemyDropTable | undefined {
  return ENEMY_DROP_TABLES[familyId]?.[tier];
}

export function getEnemyArchetypeDropTable(
  archetypeId: EnemyArchetypeId | undefined,
  tier: LootTier,
): EnemyDropTable | undefined {
  return archetypeId ? ENEMY_ARCHETYPE_DROP_TABLES[archetypeId]?.[tier] : undefined;
}

export function rollEnemyDropTable(
  familyId: EnemyFamilyId,
  tier: LootTier,
  random = Math.random,
  archetypeId?: EnemyArchetypeId,
): DropRollResult[] {
  const tables = [
    getEnemyDropTable(familyId, tier),
    getEnemyArchetypeDropTable(archetypeId, tier),
  ].filter((table): table is EnemyDropTable => Boolean(table));

  return tables.flatMap((table) =>
    table.groups.map((group) => rollDropGroup(table, group, random)),
  );
}

function createFamilyDropTable(
  familyId: EnemyFamilyId,
  tier: LootTier,
  groups: DropGroup[],
): EnemyDropTable {
  return {
    id: `${familyId}_tier_${tier}_drops`,
    familyId,
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
