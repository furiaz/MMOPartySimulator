export type EntityState = "idle" | "follow" | "attack" | "gather" | "defend";

export type EntityKind = "player" | "companion";

export type Position = {
  x: number;
  y: number;
};

export type GameEntity = {
  id: string;
  kind: EntityKind;
  position: Position;
  state: EntityState;
};

export type Player = GameEntity & {
  kind: "player";
};

export type Companion = GameEntity & {
  kind: "companion";
  followTargetId: string;
};
