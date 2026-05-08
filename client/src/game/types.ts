export type EntityState =
  | "idle"
  | "follow"
  | "attack"
  | "gather"
  | "defend"
  | "dead";

export type EntityKind = "companion" | "enemy" | "resource";

export type EnemyAggressionMode = "passive" | "aggressive";

export type CommandPriority = "autonomous" | "direct";

export type ClassPath = "honor" | "primal" | "arcane" | "holy";

export type ClassId =
  | "beginner"
  | "blade"
  | "aegis"
  | "hunter"
  | "beast"
  | "elementalist"
  | "runecaster"
  | "lightbearer"
  | "penitent";

export type ClassDefinition = {
  id: ClassId;
  path: ClassPath | null;
  displayName: string;
};

export type PartyMemberRole =
  | "defender"
  | "fighter"
  | "support"
  | "gatherer"
  | "none";

export type CompanionRole = PartyMemberRole;

export type ResourceType = "wood" | "ore" | "herb";

export type ResourceInventory = {
  wood: number;
  ore: number;
  herb: number;
};

export type DebugMapId = "map-1" | "map-2";

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

export type CombatFeedbackType = "attack" | "damage" | "death" | "gather";

export type CombatFeedbackEvent = {
  id: string;
  type: CombatFeedbackType;
  entityId: string;
  text: string;
  createdAt: number;
  expiresAt: number;
};

export type SkillId =
  | "sweeping_strike"
  | "guard_wall"
  | "mark_target"
  | "feral_surge"
  | "elemental_bolt"
  | "binding_rune"
  | "light_mend"
  | "penitents_gift";

export type SkillTag =
  | "Offensive"
  | "Damage"
  | "DoT"
  | "Single Target"
  | "Multi Target"
  | "AoE"
  | "Trap"
  | "Summon - Attack"
  | "Defensive"
  | "Shield"
  | "Heal"
  | "Safety"
  | "Damage Mitigation"
  | "Elemental Mitigation"
  | "Summon - Defense"
  | "Control"
  | "Taunt"
  | "Aggro"
  | "Buff"
  | "Cleanse"
  | "Summon - Support"
  | "Mobility"
  | "Dash"
  | "Jump"
  | "Escape"
  | "Gathering"
  | "Resource Buff"
  | "Tool Buff"
  | "Self Cost - HP"
  | "Self Buff"
  | "Light Damage";

export type SkillDefinition = {
  id: SkillId;
  classId: ClassId;
  displayName: string;
  tags: SkillTag[];
  type: "active";
  range: number;
  effect:
    | { type: "damage"; damage: number }
    | { type: "sweepingDamage"; mainDamage: number; splashDamage: number; splashRange: number }
    | { type: "mark"; bonusDamage: number; durationMs: number }
    | { type: "selfBuff"; bonusDamage: number; durationMs: number; hpCost: number }
    | { type: "shieldBlock"; durationMs: number; blocks: number }
    | { type: "bind"; durationMs: number }
    | { type: "heal"; amount: number }
    | { type: "selfCostHeal"; amount: number; hpCost: number };
};

export type SkillMarkState = {
  sourceId: string;
  targetId: string;
  bonusDamage: number;
  expiresAt: number;
};

export type SkillSelfBuffState = {
  companionId: string;
  bonusDamage: number;
  expiresAt: number;
};

export type SkillBindState = {
  sourceId: string;
  targetId: string;
  expiresAt: number;
};

export type SkillShieldBlockState = {
  id: string;
  ownerId: string;
  position: Position;
  rotationRadians: number;
  expiresAt: number;
  remainingBlocks: number;
};

export type SkillCooldownState = {
  companionId: string;
  skillId: SkillId;
  expiresAt: number;
};

export type SkillVisualType =
  | "slash"
  | "projectile"
  | "red_flash"
  | "heal";

export type SkillVisualEvent = {
  id: string;
  type: SkillVisualType;
  sourceId: string;
  targetId?: string;
  position?: Position;
  createdAt: number;
  expiresAt: number;
};

export type DebugMovementResult = "moved" | "waited" | "blocked" | "failed";

export type DebugNavigationReason =
  | "path"
  | "direct_step"
  | "swap"
  | "fallback"
  | "blocked"
  | "no_path";

export type DebugNavigationBlocker =
  | EntityKind
  | "wall"
  | "bounds"
  | "reserved"
  | "unknown"
  | "none";

export type DebugNavigationTelemetry = {
  startCell?: Position;
  targetCell?: Position | null;
  nextCell?: Position | null;
  pathLength?: number;
  targetPathDistance?: number | null;
  nextCellWalkable?: boolean;
  nextCellWallAdjacent?: boolean;
  blockedBy?: DebugNavigationBlocker;
  reason?: DebugNavigationReason;
};

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
  | "class_changed"
  | "role_changed";

export type DebugTelemetryEntitySnapshot = {
  tick: number;
  entityId: string;
  kind: EntityKind;
  classId?: ClassId;
  role?: PartyMemberRole;
  state: EntityState;
  position: Position;
  currentTargetId?: string | null;
  commandPriority?: CommandPriority;
  movementResult: DebugMovementResult;
  reason?: string;
  formationPhase?: FormationPhase;
  formationSlot?: Position | null;
  formationSlotReason?: string;
  targetDistance?: number;
  intendedPosition?: Position | null;
  blockerId?: string;
  blockerKind?: EntityKind | "wall" | "bounds" | "reserved" | "unknown";
  navigation?: DebugNavigationTelemetry;
};

export type DebugTelemetryEvent = {
  tick: number;
  type: DebugTelemetryEventType;
  entityId: string;
  targetId?: string | null;
  previousTargetId?: string | null;
  amount?: number;
  previousClassId?: ClassId;
  nextClassId?: ClassId;
  previousRole?: PartyMemberRole;
  nextRole?: PartyMemberRole;
  reason?: string;
  formationPhase?: FormationPhase;
  approachPoint?: Position | null;
  targetDistance?: number;
  intendedPosition?: Position | null;
  blockerId?: string;
  blockerKind?: EntityKind | "wall" | "bounds" | "reserved" | "unknown";
  attackSlot?: Position | null;
  navigation?: DebugNavigationTelemetry;
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
  id?: DebugMapId;
  columns: number;
  rows: number;
  walls: Position[];
  navigationGrid?: NavigationGrid;
};

export type ActiveTeleport = {
  id: string;
  position: Position;
  range: number;
  targetMapId: DebugMapId;
  triggeredBy: "ai" | "player";
};

export type NavigationGridCell = {
  position: Position;
  walkable: boolean;
  wallAdjacent: boolean;
  movementCost: number;
};

export type NavigationGrid = {
  columns: number;
  rows: number;
  cellsByKey: Record<string, NavigationGridCell>;
};

export type FormationPhase =
  | "idle"
  | "forming"
  | "traveling"
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

export type Enemy = LivingEntity & {
  kind: "enemy";
  currentTargetId: string | null;
  aggressionMode: EnemyAggressionMode;
  homePosition: Position;
};

export type Companion = LivingEntity & {
  kind: "companion";
  classId: ClassId;
  role: PartyMemberRole;
  partyOrder: number;
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

export type GameEntity = Enemy | Companion | ResourceEntity;

export type AutonomousEntity = Companion;

export type CombatEntity = Companion | Enemy;
