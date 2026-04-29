export type {
  AutonomousEntity,
  BaseEntity,
  CombatEntity,
  CommandPriority,
  Companion,
  CompanionRole,
  Enemy,
  EnemyAggressionMode,
  EntityKind,
  EntityState,
  GameEntity,
  GameMap,
  LivingEntity,
  Player,
  Position,
  ResourceInventory,
  ResourceEntity,
  ResourceType,
} from "./types";
export type { GameState } from "./state";

export {
  createCompanion,
  createEnemy,
  createPlayer,
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
  addEntity,
  addResourceToInventory,
  createEmptyResourceInventory,
  getEntityById,
  setAutoModeEnabled,
  setCompanionRole,
  updateEntity,
} from "./state";
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
export { updateEnemyAISystem } from "./enemyAISystem";
export { updateExplorationSystem } from "./explorationSystem";
export { updateGatherSystem } from "./gatherSystem";
export { updateRoleSystem } from "./roleSystem";
export { startGameLoop, type GameStateUpdater } from "./gameLoop";
export { createDebugMap } from "./debugMap";
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
