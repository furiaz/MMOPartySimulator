export type EntityState =
  | "idle"
  | "follow"
  | "attack"
  | "gather"
  | "defend"
  | "dead";

export type EntityKind = "player" | "companion" | "enemy" | "resource";

export type EnemyAggressionMode = "passive" | "aggressive";

export type CommandPriority = "autonomous" | "direct";

export type Position = {
  x: number;
  y: number;
};

export type BaseEntity = {
  id: string;
  kind: EntityKind;
  position: Position;
  state: EntityState;
};

export type LivingEntity = BaseEntity & {
  health: number;
  lastAttackAt: number;
};

export type Player = LivingEntity & {
  kind: "player";
  currentTargetId: string | null;
  lastGatherAt: number;
  commandPriority: CommandPriority;
};

export type Enemy = LivingEntity & {
  kind: "enemy";
  currentTargetId: string | null;
  aggressionMode: EnemyAggressionMode;
};

export type Companion = LivingEntity & {
  kind: "companion";
  followTargetId: string;
  currentTargetId: string | null;
  lastGatherAt: number;
  commandPriority: CommandPriority;
};

export type ResourceEntity = BaseEntity & {
  kind: "resource";
  durability: number;
  maxGatherers: number;
  isDepleted: boolean;
};

export type GameEntity = Player | Enemy | Companion | ResourceEntity;

export type AutonomousEntity = Player | Companion;

export type CombatEntity = Player | Companion | Enemy;
