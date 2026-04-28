export type {
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
  moveEntityTo,
  setEntityState,
  updateCompanionFollow,
} from "./entities";
export { addEntity, getEntityById, updateEntity } from "./state";
export {
  issueCompanionCommand,
  type CompanionCommand,
} from "./commands";
export { updateGame } from "./updateGame";
export { startGameLoop, type GameStateUpdater } from "./gameLoop";
