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

export type CompanionRole = "fighter" | "gatherer" | "defender" | "none";

export type ResourceType = "wood" | "ore" | "herb";

export type ResourceInventory = {
  wood: number;
  ore: number;
  herb: number;
};

export type Position = {
  x: number;
  y: number;
};

export type LeaderIntentType = "attack" | "move" | "gather" | "explore";

export type LeaderIntent = {
  type: LeaderIntentType;
  targetId: string | null;
  targetPosition: Position | null;
};

export type CombatFeedbackType = "attack" | "damage" | "death";

export type CombatFeedbackEvent = {
  id: string;
  type: CombatFeedbackType;
  entityId: string;
  text: string;
  createdAt: number;
  expiresAt: number;
};

export type DebugMovementResult = "moved" | "waited" | "blocked" | "failed";

export type DebugTelemetryEventType =
  | "target_acquired"
  | "target_changed"
  | "formation_changed"
  | "target_skipped"
  | "movement_failed"
  | "attack_started"
  | "damage_dealt"
  | "entity_died"
  | "gather_started"
  | "resource_depleted"
  | "role_changed";

export type DebugTelemetryEntitySnapshot = {
  tick: number;
  entityId: string;
  kind: EntityKind;
  role?: CompanionRole;
  state: EntityState;
  position: Position;
  currentTargetId?: string | null;
  commandPriority?: CommandPriority;
  movementResult: DebugMovementResult;
  reason?: string;
  formationPhase?: FormationPhase;
  formationSlot?: Position | null;
  formationSlotReason?: string;
};

export type DebugTelemetryEvent = {
  tick: number;
  type: DebugTelemetryEventType;
  entityId: string;
  targetId?: string | null;
  previousTargetId?: string | null;
  amount?: number;
  previousRole?: CompanionRole;
  nextRole?: CompanionRole;
  reason?: string;
  formationPhase?: FormationPhase;
  approachPoint?: Position | null;
};

export type DebugTelemetryTick = {
  tick: number;
  recordedAt: number;
  entities: DebugTelemetryEntitySnapshot[];
  events: DebugTelemetryEvent[];
};

export type DebugTelemetryState = {
  isRecording: boolean;
  tickNumber: number;
  maxTicks: number;
  ticks: DebugTelemetryTick[];
  events: DebugTelemetryEvent[];
  startedAt: number | null;
  stoppedAt: number | null;
};

export type DebugTelemetryReport = {
  exportedAt: number;
  tickCount: number;
  eventCount: number;
  telemetry: DebugTelemetryState;
};

export type GameMap = {
  columns: number;
  rows: number;
  walls: Position[];
};

export type FormationPhase =
  | "idle"
  | "forming"
  | "traveling"
  | "engaging"
  | "combat";

export type PartyFormationMemberSlot = {
  entityId: string;
  position: Position;
};

export type PartyFormationState = {
  phase: FormationPhase;
  targetId: string | null;
  approachPoint: Position | null;
  direction: Position;
  slotsByEntityId: Record<string, Position>;
  slotReasonsByEntityId: Record<string, string>;
  skippedTargetIds: string[];
};

export type BaseEntity = {
  id: string;
  kind: EntityKind;
  position: Position;
  state: EntityState;
};

export type LivingEntity = BaseEntity & {
  health: number;
  maxHealth: number;
  lastAttackAt: number;
};

export type Player = LivingEntity & {
  kind: "player";
  currentTargetId: string | null;
  lastGatherAt: number;
  gatherSpeed: number;
  commandPriority: CommandPriority;
};

export type Enemy = LivingEntity & {
  kind: "enemy";
  currentTargetId: string | null;
  aggressionMode: EnemyAggressionMode;
};

export type Companion = LivingEntity & {
  kind: "companion";
  role: CompanionRole;
  followTargetId: string;
  defendPosition: Position | null;
  currentTargetId: string | null;
  lastGatherAt: number;
  gatherSpeed: number;
  commandPriority: CommandPriority;
};

export type ResourceEntity = BaseEntity & {
  kind: "resource";
  resourceType: ResourceType;
  durability: number;
  maxDurability: number;
  quantity: number;
  maxGatherers: number;
  isDepleted: boolean;
};

export type GameEntity = Player | Enemy | Companion | ResourceEntity;

export type AutonomousEntity = Player | Companion;

export type CombatEntity = Player | Companion | Enemy;
