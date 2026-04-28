export type EntityState =
  | "idle"
  | "follow"
  | "attack"
  | "gather"
  | "defend"
  | "dead";

export type EntityKind = "player" | "companion" | "enemy";

export type Position = {
  x: number;
  y: number;
};

export type GameEntity = {
  id: string;
  kind: EntityKind;
  position: Position;
  state: EntityState;
  health: number;
  lastAttackAt: number;
};

export type Player = GameEntity & {
  kind: "player";
  currentTargetId: string | null;
};

export type Enemy = GameEntity & {
  kind: "enemy";
  currentTargetId: string | null;
};

export type Companion = GameEntity & {
  kind: "companion";
  followTargetId: string;
  currentTargetId: string | null;
};

export type AutonomousEntity = Player | Companion;

export type CombatEntity = Player | Companion | Enemy;
