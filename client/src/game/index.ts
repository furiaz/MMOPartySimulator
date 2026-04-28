export type {
  AutonomousEntity,
  BaseEntity,
  CombatEntity,
  CommandPriority,
  Companion,
  Enemy,
  EnemyAggressionMode,
  EntityKind,
  EntityState,
  GameEntity,
  LivingEntity,
  Player,
  Position,
  ResourceEntity,
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
export { addEntity, getEntityById, updateEntity } from "./state";
export {
  issueEntityCommand,
  issueCompanionCommand,
  type CompanionCommand,
  type EntityCommand,
} from "./commands";
export { updateGame } from "./updateGame";
export { updateAttackSystem } from "./attackSystem";
export { updateEnemyAISystem } from "./enemyAISystem";
export { updateGatherSystem } from "./gatherSystem";
export { startGameLoop, type GameStateUpdater } from "./gameLoop";
