export type {
  AutonomousEntity,
  BaseEntity,
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
  PartyMemberRole,
  Position,
  ResourceInventory,
  ResourceEntity,
  ResourceType,
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
  addResourceToInventory,
  clearExpiredCombatFeedback,
  createEmptyResourceInventory,
  getEntityById,
  setAutoModeEnabled,
  setCompanionDefendPosition,
  setCompanionRole,
  setLeaderIntent,
  setPartyLeader,
  setPartyMemberRole,
  setPartyOrder,
  updateEntity,
} from "./state";
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
