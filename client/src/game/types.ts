import type { PoiCategory } from "./poiTypes";
import type {
  GlobalPoiIntent,
  LocalPoiTarget,
  PoiDecisionState,
  QuestId,
  QuestState,
} from "./questTypes";

export type EntityState =
  | "idle"
  | "follow"
  | "attack"
  | "gather"
  | "defend"
  | "dead";

export type EntityKind = "companion" | "enemy" | "resource" | "npc";

export type EnemyTemperament = "passive" | "aggressive";

export type EnemyAggressionMode = EnemyTemperament;

export type EnemyCombatStyle = "melee" | "ranged" | "support";

export type EnemyTargetPreference = "closest" | "leader" | "lowestHealth";

export type EnemyArchetypeId =
  | "slime"
  | "cave_bat"
  | "forest_spider"
  | "goblin_scout"
  | "goblin_thrower"
  | "bog_imp"
  | "stone_crawler"
  | "thorn_shaman"
  | "ash_wisp"
  | "mossling"
  | "wolf"
  | "orc";

export type EnemyArchetypeDefinition = {
  id: EnemyArchetypeId;
  displayName: string;
  temperament: EnemyTemperament;
  combatStyle: EnemyCombatStyle;
  targetPreference: EnemyTargetPreference;
  level: number;
  maxHealth: number;
  attackCooldownMs: number;
  xpReward?: number;
  detectionRange: number;
  attackRange: number;
};

export type EnemyTargetDecisionReason =
  | "closest"
  | "leader"
  | "lowest_health"
  | "passive_no_auto_target"
  | "outside_detection"
  | "outside_leash"
  | "no_valid_target";

export type EnemyType = "wolf" | "orc";

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

export type EquipmentSlot =
  | "head"
  | "chest"
  | "legs"
  | "gloves"
  | "boots"
  | "mainHand"
  | "offhand"
  | "accessory1"
  | "accessory2";

export type EquipmentKind = "weapon" | "offhand" | "armor" | "accessory";

export type WeaponType =
  | "training_sword"
  | "one_handed_sword"
  | "one_handed_mace"
  | "claw_gauntlets"
  | "thorn_whip"
  | "bow"
  | "orb"
  | "rune_lantern"
  | "holy_mace";

export type OffhandType =
  | "shield"
  | "talisman"
  | "holy_lantern"
  | "sacrificial_dagger";

export type ArmorType =
  | "head_armor"
  | "chest_armor"
  | "legs_armor"
  | "gloves_armor"
  | "boots_armor";

export type AccessoryType = "accessory";

export type EquipmentType =
  | WeaponType
  | OffhandType
  | ArmorType
  | AccessoryType;

export type EquipmentStatModifiers = {
  attack?: number;
  defense?: number;
  maxHealth?: number;
  block?: number;
  evasion?: number;
  magicPower?: number;
  healingPower?: number;
};

export type CompanionEquipment = Record<EquipmentSlot, ItemId | null>;

export type LootMaterialItemId =
  | "wolf_pelt"
  | "wolf_fang"
  | "wolf_claw"
  | "orc_tusk"
  | "orc_hide"
  | "orc_scrap";

export type EquipmentItemId =
  | "training_sword"
  | "iron_sword"
  | "training_mace"
  | "claw_gauntlets"
  | "thorn_whip"
  | "short_bow"
  | "apprentice_orb"
  | "rune_lantern"
  | "holy_mace"
  | "wooden_shield"
  | "simple_talisman"
  | "holy_lantern"
  | "sacrificial_dagger"
  | "cloth_cap"
  | "padded_chest"
  | "padded_legs"
  | "cloth_gloves"
  | "travel_boots"
  | "plain_charm"
  | "worn_cap"
  | "worn_tunic"
  | "worn_pants"
  | "worn_gloves"
  | "worn_boots"
  | "reinforced_helm"
  | "reinforced_armor"
  | "reinforced_legguards"
  | "reinforced_gloves"
  | "reinforced_boots";

export type ItemId = ResourceType | LootMaterialItemId | EquipmentItemId;

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
  sellValue?: number;
  exchangeCategory?: "parts";
  canQuickExchange?: boolean;
  effectId?: string;
  equipmentSlot?: EquipmentSlot;
  equipmentKind?: EquipmentKind;
  equipmentType?: EquipmentType;
  allowedClassIds?: ClassId[];
  statModifiers?: EquipmentStatModifiers;
  levelRequirement?: number;
  occupiesBothHands?: boolean;
};

export type InventorySlot = {
  itemId: ItemId;
  quantity: number;
};

export type PartyInventory = {
  capacity: number;
  slots: InventorySlot[];
};

export type CurrencyId = "crowns";

export type CurrencyDefinition = {
  id: CurrencyId;
  displayName: string;
  symbol: string;
};

export type PartyWallet = {
  balancesByCurrencyId: Record<CurrencyId, number>;
  visibleUntil?: number;
};

export type InventoryMutationSource =
  | "gathering"
  | "debug"
  | "equipment"
  | "combat_loot"
  | "quest_reward"
  | "merchant"
  | "unknown";

export type CurrencyMutationSource =
  | "debug"
  | "quest_reward"
  | "merchant"
  | "chest"
  | "unknown";

export type CurrencyMutationStatus =
  | "success"
  | "failed_invalid"
  | "failed_insufficient";

export type CurrencyMutationResult = {
  status: CurrencyMutationStatus;
  currencyId: CurrencyId;
  requestedAmount: number;
  changedAmount: number;
  previousBalance: number;
  newBalance: number;
  source: CurrencyMutationSource;
  reason?: string;
};

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
  source?: "player" | "ai";
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

export type DropVisualEvent = {
  id: string;
  enemyId: string;
  enemyType?: EnemyType;
  itemId: ItemId;
  quantity: number;
  position: Position;
  createdAt: number;
  expiresAt: number;
  currentMapId?: DebugMapId;
  tableId: string;
  dropChance: number;
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
  | "equipment_equip_attempt"
  | "equipment_equipped"
  | "equipment_equip_failed"
  | "equipment_unequip_attempt"
  | "equipment_unequipped"
  | "equipment_unequip_failed"
  | "equipment_inventory_return_failed"
  | "equipment_invalid_class"
  | "equipment_invalid_slot"
  | "teleport_started"
  | "teleport_completed"
  | "teleport_skipped"
  | "map_transition"
  | "poi_selected"
  | "poi_skipped"
  | "poi_interrupted"
  | "quest_available"
  | "quest_dialog_opened"
  | "quest_accepted"
  | "quest_objective_progress"
  | "quest_objective_completed"
  | "quest_ready_to_turn_in"
  | "quest_finish_selected"
  | "quest_reward_validation_started"
  | "quest_reward_validation_failed_inventory_full"
  | "quest_reward_claim_started"
  | "quest_reward_crowns_added"
  | "quest_reward_xp_awarded"
  | "quest_reward_item_added"
  | "quest_reward_equipment_added"
  | "quest_reward_claim_failed"
  | "quest_reward_claim_succeeded"
  | "quest_repeat_reset"
  | "quest_turned_in"
  | "quest_completed"
  | "quest_unlocked"
  | "quest_intent_teleport"
  | "enemy_drop_roll_started"
  | "enemy_drop_rolled"
  | "enemy_drop_none"
  | "enemy_drop_visual_started"
  | "enemy_drop_visual_completed"
  | "enemy_drop_inventory_add_attempt"
  | "enemy_drop_inventory_added"
  | "enemy_drop_inventory_failed"
  | "enemy_drop_inventory_partial"
  | "enemy_drop_overflow"
  | "currency_add_attempt"
  | "currency_added"
  | "currency_remove_attempt"
  | "currency_removed"
  | "currency_remove_failed"
  | "wallet_balance_changed"
  | "merchant_interaction_opened"
  | "merchant_interaction_closed"
  | "merchant_menu_selected"
  | "quick_exchange_attempt"
  | "quick_exchange_item_selected"
  | "quick_exchange_item_removed"
  | "quick_exchange_currency_added"
  | "quick_exchange_completed"
  | "quick_exchange_failed"
  | "quick_exchange_no_items";

export type DebugTelemetryEntitySnapshot = {
  tick: number;
  entityId: string;
  kind: EntityKind;
  classId?: ClassId;
  role?: PartyMemberRole;
  state: EntityState;
  position: Position;
  currentTargetId?: string | null;
  archetypeId?: EnemyArchetypeId;
  enemyCombatStyle?: EnemyCombatStyle;
  enemyTargetPreference?: EnemyTargetPreference;
  attackRange?: number;
  targetDecisionReason?: EnemyTargetDecisionReason;
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
  archetypeId?: EnemyArchetypeId;
  enemyCombatStyle?: EnemyCombatStyle;
  enemyTargetPreference?: EnemyTargetPreference;
  attackRange?: number;
  targetDecisionReason?: EnemyTargetDecisionReason;
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
  companionClassId?: ClassId;
  previousRole?: PartyMemberRole;
  nextRole?: PartyMemberRole;
  result?: string;
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
  itemDisplayName?: string;
  itemCategory?: ItemCategory;
  targetSlot?: EquipmentSlot;
  equipmentType?: EquipmentType;
  enemyType?: EnemyType;
  enemyPosition?: Position;
  tableId?: string;
  dropChance?: number;
  previousItemId?: ItemId | null;
  requestedQuantity?: number;
  addedQuantity?: number;
  removedQuantity?: number;
  overflowQuantity?: number;
  quantitySold?: number;
  valueEach?: number;
  totalItemValue?: number;
  totalExchangeValue?: number;
  slotIndex?: number;
  stackQuantityBefore?: number;
  stackQuantityAfter?: number;
  inventoryUsedSlots?: number;
  inventoryCapacity?: number;
  source?: InventoryMutationSource | CurrencyMutationSource;
  currencyId?: CurrencyId;
  currencyDisplayName?: string;
  currencyAmount?: number;
  previousCurrencyBalance?: number;
  nextCurrencyBalance?: number;
  globalPoiIntentType?: GlobalPoiIntent["type"];
  localPoiId?: string;
  poiCategory?: PoiCategory;
  poiMapId?: DebugMapId;
  poiPosition?: Position;
  poiPriorityReason?: string;
  poiSkipReason?: string;
  questId?: QuestId;
  objectiveId?: string;
  objectiveProgress?: number;
  objectiveRequiredCount?: number;
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
  globalPoiIntent?: GlobalPoiIntent | null;
  localPoiTarget?: LocalPoiTarget | null;
  lastPoiDecision?: PoiDecisionState;
  activeQuestSummary?: Partial<Record<QuestId, QuestState>>;
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
  globalPoiIntent?: GlobalPoiIntent | null;
  localPoiTarget?: LocalPoiTarget | null;
  lastPoiDecision?: PoiDecisionState;
  activeQuestSummary?: Partial<Record<QuestId, QuestState>>;
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

export type HealingFountain = {
  id: string;
  position: Position;
  range: number;
};

export type GameMap = {
  id?: DebugMapId;
  displayName: string;
  debugName: string;
  columns: number;
  rows: number;
  walls: Position[];
  teleports: DebugTeleportPoint[];
  healingFountains: HealingFountain[];
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
  archetypeId?: EnemyArchetypeId;
  enemyType?: EnemyType;
  homePosition: Position;
  roamTargetPosition?: Position | null;
  nextRoamAt?: number;
  roamMoveUntil?: number;
  level: number;
  xpReward?: number;
  attackCooldownMs?: number;
  attackRange?: number;
  targetDecisionReason?: EnemyTargetDecisionReason;
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
  equipment: CompanionEquipment;
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
  npcRole: "quest_giver" | "merchant" | "smith" | "dog" | "test_blade" | "test_hunter";
};

export type GameEntity = Enemy | Companion | ResourceEntity | NpcEntity;

export type AutonomousEntity = Companion;

export type CombatEntity = Companion | Enemy;
