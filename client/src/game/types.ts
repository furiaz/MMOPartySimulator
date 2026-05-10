export type EntityState =
  | "idle"
  | "follow"
  | "attack"
  | "gather"
  | "defend"
  | "dead";

export type EntityKind = "companion" | "enemy" | "resource" | "npc";

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

export type ItemCategory =
  | "material"
  | "consumable"
  | "equipment"
  | "quest"
  | "event";

export type ItemId = ResourceType;

export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type ItemDefinition = {
  id: ItemId;
  displayName: string;
  category: ItemCategory;
  description?: string;
  rarity?: ItemRarity;
  stackable: boolean;
  maxStack: number;
  value?: number;
  effectId?: string;
};

export type InventorySlot = {
  itemId: ItemId;
  quantity: number;
};

export type PartyInventory = {
  capacity: number;
  slots: InventorySlot[];
};

export type InventoryMutationSource =
  | "gathering"
  | "debug"
  | "combat_loot"
  | "unknown";

export type InventoryMutationStatus =
  | "success"
  | "partial"
  | "failed_full"
  | "failed_invalid";

export type InventoryAddResult = {
  status: InventoryMutationStatus;
  itemId: ItemId;
  requestedQuantity: number;
  addedQuantity: number;
  overflowQuantity: number;
};

export type InventoryRemoveResult = {
  status: InventoryMutationStatus;
  itemId: ItemId;
  requestedQuantity: number;
  removedQuantity: number;
  remainingQuantity: number;
};

export type DebugMapId = "hub" | "map-1" | "map-2";

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
  | "role_changed"
  | "character_xp_awarded"
  | "character_xp_reduced"
  | "character_level_up"
  | "character_xp_skipped"
  | "item_add_attempt"
  | "item_added"
  | "item_add_partial"
  | "item_add_failed_full"
  | "item_removed"
  | "inventory_stack_created"
  | "inventory_stack_updated"
  | "inventory_capacity_checked"
  | "teleport_started"
  | "teleport_completed"
  | "teleport_skipped"
  | "map_transition";

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
  characterLevel?: number;
  characterXp?: number;
  characterXpToNextLevel?: number | null;
  characterXpProgressPercent?: number;
  lastCharacterXpGained?: number;
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
  currentMapId?: DebugMapId;
  currentMapDisplayName?: string;
  currentMapDebugName?: string;
  previousMapId?: DebugMapId;
  nextMapId?: DebugMapId;
  previousMapDisplayName?: string;
  nextMapDisplayName?: string;
  activeTeleportId?: string | null;
  activeTeleportSourceMapId?: DebugMapId;
  activeTeleportTargetMapId?: DebugMapId;
  teleportTriggerSource?: "ai" | "player";
  positionsBeforeTransition?: Record<string, Position>;
  positionsAfterTransition?: Record<string, Position>;
  targetId?: string | null;
  previousTargetId?: string | null;
  amount?: number;
  xpAmount?: number;
  baseXpAmount?: number;
  modifiedXpAmount?: number;
  xpModifier?: number;
  previousLevel?: number;
  nextLevel?: number;
  previousXp?: number;
  nextXp?: number;
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
  itemId?: ItemId;
  itemCategory?: ItemCategory;
  requestedQuantity?: number;
  addedQuantity?: number;
  removedQuantity?: number;
  overflowQuantity?: number;
  slotIndex?: number;
  stackQuantityBefore?: number;
  stackQuantityAfter?: number;
  inventoryUsedSlots?: number;
  inventoryCapacity?: number;
  source?: InventoryMutationSource;
};

export type DebugTelemetryTick = {
  tick: number;
  recordedAt: number;
  currentMapId?: DebugMapId;
  currentMapDisplayName?: string;
  currentMapDebugName?: string;
  activeTeleportId?: string | null;
  activeTeleportSourceMapId?: DebugMapId;
  activeTeleportTargetMapId?: DebugMapId;
  teleportTriggerSource?: "ai" | "player";
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
  currentMapId?: DebugMapId;
  currentMapDisplayName?: string;
  currentMapDebugName?: string;
  activeTeleportId?: string | null;
  activeTeleportSourceMapId?: DebugMapId;
  activeTeleportTargetMapId?: DebugMapId;
  teleportTriggerSource?: "ai" | "player";
  telemetry: DebugTelemetryState;
};

export type DebugTeleportPoint = {
  id: string;
  position: Position;
  range: number;
  sourceMapId: DebugMapId;
  targetMapId: DebugMapId;
  arrivalPositions: Position[];
  autoSelectAfterEnemiesCleared?: boolean;
};

export type GameMap = {
  id?: DebugMapId;
  displayName: string;
  debugName: string;
  columns: number;
  rows: number;
  walls: Position[];
  teleports: DebugTeleportPoint[];
  navigationGrid?: NavigationGrid;
};

export type ActiveTeleport = {
  id: string;
  position: Position;
  range: number;
  sourceMapId: DebugMapId;
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
  level: number;
  xpReward?: number;
};

export type Companion = LivingEntity & {
  kind: "companion";
  classId: ClassId;
  characterLevel: number;
  characterXp: number;
  lastCharacterXpGained?: number;
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

export type NpcEntity = BaseEntity & {
  kind: "npc";
  displayName: string;
  npcRole: "quest_giver" | "merchant" | "smith" | "dog";
};

export type GameEntity = Enemy | Companion | ResourceEntity | NpcEntity;

export type AutonomousEntity = Companion;

export type CombatEntity = Companion | Enemy;
