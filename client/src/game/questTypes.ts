import type { DebugMapId, ItemId, Position, ResourceType } from "./types";
import type { PoiCategory } from "./poiTypes";

export type QuestId =
  | "clear_the_shore"
  | "gather_expedition_supplies"
  | "scout_the_northern_road"
  | "threat_beyond_the_pass";

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
  | "gather_item_count"
  | "return_to_poi";

export type QuestObjectiveDefinition = {
  id: string;
  type: QuestObjectiveType;
  targetMapId?: DebugMapId;
  targetPoiId?: string;
  enemyMapId?: DebugMapId;
  resourceType?: ResourceType;
  requiredCount?: number;
};

export type QuestSourceType = "npc" | "mapTrigger" | "objectTrigger";

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

export type QuestState = {
  questId: QuestId;
  status: QuestStatus;
  objectiveProgress: Record<string, QuestObjectiveProgress>;
  completedCycle: number;
  rewardClaimedCycle: number | null;
  lastTurnInError?: "inventory_full" | "invalid_reward";
};

export type GlobalPoiIntent = {
  type: "complete_current_quest" | "get_new_quest" | "idle";
  questId?: QuestId;
  objectiveId?: string;
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
  selectedPoiId?: string;
  selectedCategory?: PoiCategory;
  selectedMapId?: DebugMapId;
  selectedPosition?: Position;
  selectedReason?: string;
  consideredTargets?: PoiConsideration[];
  skippedReasons: Record<string, string>;
};
