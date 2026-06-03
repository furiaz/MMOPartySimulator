import type {
  DebugMapId,
  EnemyArchetypeId,
  EnemyTypeId,
  EnemyVariant,
  EquipmentSlot,
  ItemId,
  Position,
  ResourceType,
} from "./types";
import type { PoiCategory } from "./poiTypes";

export type QuestId =
  | "clear_the_shore"
  | "outfit_the_expedition"
  | "stolen_field_supplies"
  | "break_lower_shore_blockage"
  | "scout_rise_samples"
  | "rescue_the_grove_runner"
  | "hold_the_field_cache"
  | "open_wolf_causeway"
  | "broken_thicket_survey"
  | "crawler_shelf_report"
  | "find_slimeward_camp";

export type QuestStatus =
  | "locked"
  | "available"
  | "active"
  | "ready_to_turn_in"
  | "completed";

export type QuestObjectiveType =
  | "talk_to_poi"
  | "reach_poi"
  | "defeat_enemy_count"
  | "collect_enemy_quest_drop_count"
  | "gather_item_count"
  | "equip_item"
  | "equip_flask"
  | "buy_merchant_equipment"
  | "inspect_poi"
  | "repair_poi"
  | "defend_area"
  | "rescue_npc"
  | "guide_npc_to_poi"
  | "unlock_route"
  | "defeat_elite"
  | "return_to_poi";

export type QuestSpawnEnemyDefinition = {
  enemyTypeId?: EnemyTypeId;
  enemyArchetypeId?: EnemyArchetypeId;
  level?: number;
  count?: number;
};

export type QuestObjectiveDefinition = {
  id: string;
  type: QuestObjectiveType;
  targetMapId?: DebugMapId;
  targetSubzoneId?: string;
  targetPoiId?: string;
  targetPosition?: Position;
  guideNpcId?: string;
  npcDisplayName?: string;
  guideStartPosition?: Position;
  guideTargetPosition?: Position;
  enemyMapId?: DebugMapId;
  enemyArchetypeId?: EnemyArchetypeId;
  enemyVariant?: EnemyVariant;
  resourceType?: ResourceType;
  itemId?: ItemId;
  targetSlot?: EquipmentSlot;
  requiredCount?: number;
  questItemDisplayName?: string;
  dropChance?: number;
  pityKillCount?: number;
  repairDurationMs?: number;
  defenseRadius?: number;
  defenseDurationMs?: number;
  waveProgressPercents?: number[];
  questSpawnEnemies?: QuestSpawnEnemyDefinition[];
  routeTeleportId?: string;
  eliteSpawnPosition?: Position;
  eliteEnemy?: QuestSpawnEnemyDefinition;
};

export type QuestSourceType = "npc" | "mapTrigger" | "objectTrigger";
export type QuestObjectiveFlow = "parallel" | "sequential";

export type QuestRewardItem = {
  itemId: ItemId;
  quantity: number;
};

export type QuestReward = {
  crowns?: number;
  characterXp?: number;
  items?: QuestRewardItem[];
  equipment?: QuestRewardItem[];
};

export type QuestDefinition = {
  id: QuestId;
  displayName: string;
  sourceType?: QuestSourceType;
  objectiveFlow?: QuestObjectiveFlow;
  questGiverPoiId: string;
  objectives: QuestObjectiveDefinition[];
  rewards?: QuestReward;
  repeatable?: boolean;
  unlocksQuestIds?: QuestId[];
  requiresCompletedQuestIds?: QuestId[];
};

export type QuestObjectiveProgress = {
  objectiveId: string;
  currentCount: number;
  completed: boolean;
};

export type QuestRuntimeState = {
  questDropMissCountsByObjectiveId?: Record<string, number>;
  repairProgressMsByObjectiveId?: Record<string, number>;
  defenseStartedObjectiveIds?: Record<string, true>;
  defenseSpawnedWaveKeys?: Record<string, true>;
  questSpawnedEnemyIdsByObjectiveId?: Record<string, string[]>;
  despawnedSubzoneEnemyIdsByObjectiveId?: Record<string, string[]>;
};

export type QuestState = {
  questId: QuestId;
  status: QuestStatus;
  objectiveProgress: Record<string, QuestObjectiveProgress>;
  completedCycle: number;
  rewardClaimedCycle: number | null;
  lastTurnInError?: "inventory_full" | "invalid_reward";
  runtime?: QuestRuntimeState;
};

export type GlobalPoiIntent = {
  type: "complete_current_quest" | "get_new_quest" | "travel_to_map" | "idle";
  questId?: QuestId;
  objectiveId?: string;
  targetMapId?: DebugMapId;
  reason: string;
};

export type LocalPoiTarget = {
  poiId: string;
  category: PoiCategory;
  mapId: DebugMapId;
  position: Position;
  targetEntityId?: string;
  questId?: QuestId;
  objectiveId?: string;
  reason: string;
};

export type PoiConsideration = {
  poiId: string;
  category: PoiCategory;
  mapId: DebugMapId;
  position: Position;
  reason: string;
  priority: number;
  pathDistance: number;
  score?: number;
  targetEntityId?: string;
  questId?: QuestId;
  objectiveId?: string;
  isSelected?: boolean;
};

export type PoiDecisionState = {
  evaluatedAtMs?: number;
  selectedPoiId?: string;
  selectedCategory?: PoiCategory;
  selectedMapId?: DebugMapId;
  selectedPosition?: Position;
  selectedReason?: string;
  consideredTargets?: PoiConsideration[];
  skippedReasons: Record<string, string>;
};
