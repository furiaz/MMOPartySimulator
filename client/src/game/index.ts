export type {
  Companion,
  EntityKind,
  EntityState,
  GameEntity,
  Player,
  Position,
} from "./types";
export type { GameState } from "./state";

export {
  createCompanion,
  createPlayer,
  moveEntityTo,
  setEntityState,
  updateCompanionFollow,
} from "./entities";
export { addEntity, getEntityById, updateEntity } from "./state";
export { updateFollowSystem } from "./followSystem";
