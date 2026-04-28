export type {
  AutonomousEntity,
  CombatEntity,
  Companion,
  Enemy,
  EntityKind,
  EntityState,
  GameEntity,
  Player,
  Position,
} from "./types";
export type { GameState } from "./state";

export {
  createCompanion,
  createEnemy,
  createPlayer,
  damageEntity,
  isCombatEntity,
  isAutonomousEntity,
  moveEntityTo,
  moveEntityToward,
  setLastAttackAt,
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
export { startGameLoop, type GameStateUpdater } from "./gameLoop";
