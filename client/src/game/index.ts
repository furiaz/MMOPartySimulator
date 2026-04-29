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
  addEntity,
  addResourceToInventory,
  createEmptyResourceInventory,
  getEntityById,
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
export { updateGatherSystem } from "./gatherSystem";
export { updateRoleSystem } from "./roleSystem";
export { startGameLoop, type GameStateUpdater } from "./gameLoop";
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
