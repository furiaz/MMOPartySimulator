export type {
  AutonomousEntity,
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
  isAutonomousEntity,
  moveEntityTo,
  moveEntityToward,
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
export { startGameLoop, type GameStateUpdater } from "./gameLoop";
