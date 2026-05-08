export type {
  AutonomousEntity,
  BaseEntity,
  ClassDefinition,
  ClassId,
  ClassPath,
  CombatEntity,
  CommandPriority,
  Companion,
  CompanionRole,
  CombatFeedbackEvent,
  CombatFeedbackType,
  DebugMovementResult,
  DebugMapId,
  DebugTelemetryEntitySnapshot,
  DebugTelemetryEvent,
  DebugTelemetryEventType,
  DebugTelemetryReport,
  DebugTelemetryState,
  DebugTelemetryTick,
  Enemy,
  EnemyAggressionMode,
  EntityKind,
  EntityState,
  GameEntity,
  GameMap,
  ActiveTeleport,
  LeaderIntent,
  LeaderIntentType,
  LivingEntity,
  InventoryAddResult,
  InventoryMutationSource,
  InventoryMutationStatus,
  InventoryRemoveResult,
  InventorySlot,
  ItemCategory,
  ItemDefinition,
  ItemId,
  ItemRarity,
  PartyMemberRole,
  PartyInventory,
  Position,
  ResourceEntity,
  ResourceType,
  SkillBindState,
  SkillCooldownState,
  SkillDefinition,
  SkillId,
  SkillMarkState,
  SkillSelfBuffState,
  SkillShieldBlockState,
  SkillTag,
  SkillVisualEvent,
  SkillVisualType,
} from "./types";
export type { GameState } from "./state";

export {
  createCompanion,
  createEnemy,
  createResource,
  damageEntity,
  gatherResource,
  isCombatEntity,
  isAutonomousEntity,
  isResourceEntity,
  moveEntityTo,
  moveEntityToward,
  setLastAttackAt,
  setLastGatherAt,
  setEntityState,
  updateAutonomousEntityFollow,
  updateCompanionFollow,
} from "./entities";
export {
  addEnemy,
  addCombatFeedback,
  addEntity,
  addSkillVisualEvent,
  clearExpiredCombatFeedback,
  clearExpiredSkillRuntimeState,
  getEntityById,
  setAutoModeEnabled,
  setCompanionDefendPosition,
  setCompanionRole,
  setLeaderIntent,
  setPartyLeader,
  setPartyMemberClass,
  setPartyMemberRole,
  setPartyOrder,
  updateEntity,
} from "./state";
export {
  ITEM_DEFINITIONS,
  getItemDefinition,
  getItemDefinitionForResourceType,
} from "./items";
export {
  STARTING_INVENTORY_CAPACITY,
  addItemToInventoryState,
  canStackItems,
  countInventoryItem,
  createEmptyPartyInventory,
  getAvailableInventorySlots,
  getUsedInventorySlots,
  removeItemFromInventoryState,
} from "./inventory";
export { CLASS_DEFINITIONS } from "./classes";
export { SKILL_DEFINITIONS, getSkillsForClass } from "./skills";
export {
  SKILL_ROLE_PREFERENCES,
  getSkillRoleScore,
  type SkillRolePreference,
} from "./skillRolePreferences";
export {
  getOrderedFormationMembers,
  getOrderedPartyMembers,
  getPartyLeader,
  getPartyMembers,
  isGathererBusy,
  isPartyMember,
} from "./partySystem";
export {
  COMBAT_APPROACH_DISTANCE,
  FORMATION_COHESION_PATH_DISTANCE,
  ROLE_PRIORITY,
  ROLE_PROFILES,
  ROLE_TUNING,
  getRolePriority,
} from "./roleProfiles";
export {
  issueEntityCommand,
  issueCompanionCommand,
  issueCompanionCommands,
  type CompanionCommand,
  type CompanionGroupCommand,
  type EntityCommand,
} from "./commands";
export { updateGame } from "./updateGame";
export { updateAttackSystem } from "./attackSystem";
export { updateDefendSystem } from "./defendSystem";
export { updateEnemyAISystem } from "./enemyAISystem";
export { updateExplorationSystem } from "./explorationSystem";
export { updateGatherSystem } from "./gatherSystem";
export { updateRoleSystem } from "./roleSystem";
export { updateSkillSystem } from "./skillSystem";
export {
  isMapTeleportPoiActive,
  isTeleportRallyActive,
  setMapTeleportPoi,
  triggerMapTeleport,
  updateTeleportSystem,
} from "./teleportSystem";
export { startGameLoop, type GameStateUpdater } from "./gameLoop";
export {
  companionIds,
  companionStartPositions,
  createDebugMap,
  DEBUG_MAP_COLUMNS,
  DEBUG_MAP_ROWS,
  enemyIds,
  mapOneEnemyStartPositions,
  mapOneResourceStartData,
  MAP_ONE_ID,
  MAP_TWO_ID,
  resourceIds,
  teleporterPosition,
  TELEPORTER_RANGE,
} from "./debugMap";
export {
  debugAddCompanion,
  debugAddCompanionToParty,
  debugAddTestWoodToInventory,
  debugRefreshResources,
  debugRandomizeLocations,
  debugRemoveCompanion,
  debugRemoveCompanionFromParty,
  debugResurrectEnemy,
  debugRestorePartyHealth,
} from "./debugTools";
export {
  appendDebugTelemetryEvent,
  clearDebugTelemetry,
  createDebugTelemetryState,
  exportDebugTelemetryReport,
  recordDebugTelemetryTick,
  startDebugTelemetryRecording,
  stopDebugTelemetryRecording,
} from "./debugTelemetry";
export type { CharacterXpProgress } from "./leveling";
export {
  BEGINNER_CLASS_UNLOCK_LEVEL,
  MAX_CHARACTER_LEVEL,
  getCharacterXpProgress,
  getCharacterXpToNextLevel,
  getEnemyXpReward,
  getLevelGapXpModifier,
  getPartySizeLimit,
  getSameLevelEnemyXp,
  getTotalCharacterXpForLevel,
  getTotalPartyCharacterLevel,
  grantCharacterXpToCompanion,
  grantCharacterXpToParty,
  isBeginnerClassEligible,
} from "./leveling";
