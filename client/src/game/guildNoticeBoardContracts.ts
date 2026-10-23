import { debugMapDefinitions, getEnemyStartDataForMap } from "./debugMap";
import { ENEMY_TYPES } from "./enemyArchetypes";
import { isFirstClassId } from "./classes";
import { getSameLevelEnemyXp } from "./leveling";
import { SKILL_BOOK_ITEM_IDS_BY_SKILL_ID } from "./skillProgression";
import { SKILL_DEFINITIONS } from "./skills";
import type { GameState } from "./state";
import type { DebugMapId, Enemy, EnemyTypeId, GuildNoticeBoardQuest, GuildNoticeBoardQuestCategory, GuildNoticeBoardQuestObjective, SkillBookItemId } from "./types";

export const TIER_TWO_BOARD_MAP_IDS = ["map-4", "map-5", "map-6", "map-7"] as const;
export type TierTwoBoardMapId = typeof TIER_TWO_BOARD_MAP_IDS[number];
export const FIRST_CLASS_BOARD_BOOKS = Object.values(SKILL_DEFINITIONS)
  .filter(skill => isFirstClassId(skill.classId))
  .map(skill => SKILL_BOOK_ITEM_IDS_BY_SKILL_ID[skill.id] as SkillBookItemId);
const CATEGORIES: GuildNoticeBoardQuestCategory[] = ["assault", "extermination", "rummage", "forage"];

export function getBoardZoneTuning(mapId: TierTwoBoardMapId) {
  const offset = TIER_TWO_BOARD_MAP_IDS.indexOf(mapId);
  return { kills: 50 + offset * 20, rummage: 30 + offset * 12, forage: 10 + offset * 5, crowns: 150 + offset * 50 };
}

export function getBoardZoneMonsterTypes(mapId: DebugMapId): EnemyTypeId[] {
  return [...new Set(getEnemyStartDataForMap(mapId)
    .filter(spawn => (spawn.encounterBand ?? "standard") === "standard")
    .map(spawn => spawn.enemyTypeId)
    .filter((id): id is EnemyTypeId => Boolean(id && ENEMY_TYPES[id])))];
}

export function isBoardOrdinaryEnemy(enemy: Enemy): boolean {
  return (enemy.encounterBand ?? "standard") === "standard" && !enemy.isTargetDummy;
}

export function formatGuildNoticeBoardQuestTitle(category: GuildNoticeBoardQuestCategory, zone: string, enemy?: string): string {
  switch (category) {
    case "assault": return `Assault on ${zone}`;
    case "extermination": return `${enemy ?? "Enemy"} Extermination in ${zone}`;
    case "rummage": return `Rummage of ${zone}`;
    case "forage": return `Forage in ${zone}`;
  }
}

export function getBoardObjectiveEnemyTypes(objective: GuildNoticeBoardQuestObjective): EnemyTypeId[] {
  if (objective.type === "gather_resources") return [];
  return "enemyTypeId" in objective ? [objective.enemyTypeId] : objective.eligibleEnemyTypeIds;
}

export function getBoardObjectiveLabel(objective: GuildNoticeBoardQuestObjective): string {
  if (objective.type === "gather_resources") return "Gather wood, ore or herbs";
  if (objective.type === "quest_drop") return objective.itemDisplayName;
  if (objective.type === "zone_kills") return "Defeat ordinary enemies";
  return `Defeat ${ENEMY_TYPES[objective.enemyTypeId]?.displayName ?? objective.enemyTypeId}`;
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
}

export function selectBoardDestination(state: GameState, random = Math.random): TierTwoBoardMapId | undefined {
  const visited = TIER_TWO_BOARD_MAP_IDS.filter(id => state.worldDiscovery?.visitedMapIds.includes(id));
  const companions = Object.values(state.entities).filter(entity => entity.kind === "companion");
  const partyLevel = companions.reduce((sum, companion) => sum + companion.characterLevel, 0) / Math.max(1, companions.length);
  const preferred = visited.filter(id => {
    const types = getBoardZoneMonsterTypes(id);
    const meanLevel = types.reduce((sum, type) => sum + ENEMY_TYPES[type].level, 0) / types.length;
    return Math.abs(meanLevel - partyLevel) <= 5;
  });
  const other = visited.filter(id => !preferred.includes(id));
  const pool = preferred.length && other.length ? (random() < 0.8 ? preferred : other) : preferred.length ? preferred : other;
  return pool.length ? pick(pool, random) : undefined;
}

export function createTierTwoBoardContract(sequence: number, now: number, state?: GameState, random = Math.random, fixedMap?: TierTwoBoardMapId, fixedCategory?: GuildNoticeBoardQuestCategory): GuildNoticeBoardQuest | null {
  const mapId = fixedMap ?? (state ? selectBoardDestination(state, random) : undefined);
  if (!mapId) return null;
  const category = fixedCategory ?? pick(CATEGORIES, random);
  const types = getBoardZoneMonsterTypes(mapId);
  if (!types.length) return null;
  const target = category === "extermination" ? pick(types, random) : undefined;
  const zone = debugMapDefinitions[mapId].displayName;
  const tuning = getBoardZoneTuning(mapId);
  const normalXp = (id: EnemyTypeId) => getSameLevelEnemyXp(ENEMY_TYPES[id].level);
  const xpSum = types.reduce((sum, id) => sum + normalXp(id), 0);
  const characterXp = Math.floor(category === "extermination" && target
    ? 0.5 * tuning.kills * normalXp(target)
    : (category === "rummage" ? tuning.rummage : 0.5 * tuning.kills) * xpSum / types.length);
  let objective: GuildNoticeBoardQuestObjective;
  switch (category) {
    case "assault": objective = { id: "zone-kills", type: "zone_kills", eligibleEnemyTypeIds: types, requiredCount: tuning.kills, currentCount: 0 }; break;
    case "extermination": objective = { id: "enemy-kills", type: "enemy_kills", enemyTypeId: target!, requiredCount: tuning.kills, currentCount: 0 }; break;
    case "rummage": objective = { id: "recovered-supplies", type: "quest_drop", eligibleEnemyTypeIds: types, itemDisplayName: `Recovered Supplies — ${zone}`, requiredCount: tuning.rummage, currentCount: 0 }; break;
    case "forage": objective = { id: "gather-resources", type: "gather_resources", requiredCount: tuning.forage, currentCount: 0 }; break;
  }
  const books: [SkillBookItemId, SkillBookItemId] = [pick(FIRST_CLASS_BOARD_BOOKS, random), pick(FIRST_CLASS_BOARD_BOOKS, random)];
  return {
    schemaVersion: 2, id: `guild-notice-board-quest-${sequence}`, sequence, category, targetMapId: mapId,
    title: formatGuildNoticeBoardQuestTitle(category, zone, target ? ENEMY_TYPES[target].displayName : undefined),
    zoneDisplayName: zone,
    description: category === "rummage"
      ? `Recover supplies from ordinary enemies in ${zone}. Each defeat has a 50% drop chance. Progress begins after taking this posting.`
      : `${getBoardObjectiveLabel(objective)} in ${zone}. Progress begins after taking this posting.`,
    status: "available", generatedAtMs: now, takenAtMs: null, levelAnchor: null, levelRange: null,
    objectives: [objective], rewardClaimedAtMs: null,
    rewards: { crowns: tuning.crowns, characterXp, skillBookItemId: books[0], skillBookItemIds: books, bonusSkillBookItemId: pick(FIRST_CLASS_BOARD_BOOKS, random), bonusBookRoll: Math.min(1 - Number.EPSILON, Math.max(0, random())) },
  };
}
