import type {
  EquipmentSlot,
  ItemId,
  MapVisualObjectId,
  NpcEntity,
  ResourceType,
  SkillId,
} from "./game";

const nowAssetPackPath = "/assets/Generated/now-pack";
const wildernessMapAssetPath = "/assets/Generated/map-wilderness";
const hubFloorAssetPath = "/assets/Generated/hub-floors";
const hubCastleWallAssetPath = "/assets/Generated/hub-castle-walls";
const hubStructureAssetPath = "/assets/Generated/hub-structures/256";
const teleportAssetPath = "/assets/Generated/teleports";
const passageBlockerAssetPath = "/assets/Generated/passage-blockers";
const slimewardDungeonAssetPath = "/assets/Generated/Dungeon Generation";
const beginnerSkillEffectsPath = "/assets/Generated/beginner-skill-effects-50/sprites";
const wildernessMapFloor128AssetPath = `${wildernessMapAssetPath}/128`;
const hubFloor128AssetPath = `${hubFloorAssetPath}/New/128`;

export const INVENTORY_ITEM_ICON_SRC: Partial<Record<ItemId, string>> = {
  wood: `${nowAssetPackPath}/wood-node.png`,
  ore: `${nowAssetPackPath}/ore-node.png`,
  herb: `${nowAssetPackPath}/herb-node.png`,
  softwood: `${nowAssetPackPath}/wood-node.png`,
  copper_ore: `${nowAssetPackPath}/ore-node.png`,
  field_herb: `${nowAssetPackPath}/herb-node.png`,
  hardwood: `${nowAssetPackPath}/wood-node.png`,
  iron_ore: `${nowAssetPackPath}/ore-node.png`,
  redleaf_herb: `${nowAssetPackPath}/herb-node.png`,
  slime_gel_t1: `${nowAssetPackPath}/herb-node.png`,
  slime_core_t1: `${nowAssetPackPath}/ore-node.png`,
  bat_wing_t1: `${nowAssetPackPath}/wood-node.png`,
  bat_ear_t1: `${nowAssetPackPath}/wood-node.png`,
  spider_silk_t1: `${nowAssetPackPath}/herb-node.png`,
  spider_fang_t1: `${nowAssetPackPath}/ore-node.png`,
  goblin_ear_t1: `${nowAssetPackPath}/wood-node.png`,
  goblin_tooth_t1: `${nowAssetPackPath}/ore-node.png`,
  imp_horn_chip_t1: `${nowAssetPackPath}/ore-node.png`,
  imp_tail_t1: `${nowAssetPackPath}/wood-node.png`,
  wolf_pelt: `${nowAssetPackPath}/wood-node.png`,
  wolf_fang: `${nowAssetPackPath}/ore-node.png`,
  crawler_pebble_t1: `${nowAssetPackPath}/ore-node.png`,
  crawler_plate_t1: `${nowAssetPackPath}/ore-node.png`,
  moss_tuft_t1: `${nowAssetPackPath}/herb-node.png`,
  mossling_cap_t1: `${nowAssetPackPath}/herb-node.png`,
  goblin_ear_t2: `${nowAssetPackPath}/wood-node.png`,
  goblin_tooth_t2: `${nowAssetPackPath}/ore-node.png`,
  wisp_ash_t2: `${nowAssetPackPath}/ore-node.png`,
  wisp_ember_t2: `${nowAssetPackPath}/ore-node.png`,
  orc_tusk: `${nowAssetPackPath}/ore-node.png`,
  orc_hide: `${nowAssetPackPath}/wood-node.png`,
  minor_recovery_flask: `${beginnerSkillEffectsPath}/first_aid.png`,
  soldiers_recovery_flask: `${beginnerSkillEffectsPath}/rally_call.png`,
  hearty_trail_rations: `${nowAssetPackPath}/herb-node.png`,
  skirmisher_rations: `${nowAssetPackPath}/herb-node.png`,
  training_sword: `${nowAssetPackPath}/training-sword.png`,
};

export const EMPTY_EQUIPMENT_SLOT_ICON_SRC: Partial<Record<EquipmentSlot, string>> = {
  mainHand: `${nowAssetPackPath}/empty-main-hand.png`,
  offhand: `${nowAssetPackPath}/empty-offhand.png`,
};

export const RESOURCE_ICON_SRC = {
  wood: `${nowAssetPackPath}/wood-node.png`,
  ore: `${nowAssetPackPath}/ore-node.png`,
  herb: `${nowAssetPackPath}/herb-node.png`,
} satisfies Record<ResourceType, string>;

export const NPC_ICON_SRC: Partial<Record<NpcEntity["npcRole"], string>> = {
  quest_giver: `${nowAssetPackPath}/quest-giver.png`,
  merchant: `${nowAssetPackPath}/merchant.png`,
  smith: `${nowAssetPackPath}/smith.png`,
  dog: `${nowAssetPackPath}/dog.png`,
  dungeon_chest_closed: `${slimewardDungeonAssetPath}/dungeon-chest-closed-64.png`,
  dungeon_chest_open: `${slimewardDungeonAssetPath}/dungeon-chest-open-64.png`,
};

export const WILDERNESS_MAP_TILE_SRC = {
  grassA: `${wildernessMapAssetPath}/grass-a.png`,
  grassB: `${wildernessMapAssetPath}/grass-b.png`,
  grass128: `${wildernessMapFloor128AssetPath}/forest-grass-floor-atlas-128.png`,
  grassDetail128: `${wildernessMapFloor128AssetPath}/forest-grass-detail-floor-atlas-128.png`,
  grassBackup128: `${wildernessMapFloor128AssetPath}/forest-grass-backup-floor-atlas-128.png`,
  grassFlowers128: `${wildernessMapFloor128AssetPath}/forest-grass-flowers-floor-atlas-128.png`,
  tree: `${wildernessMapAssetPath}/tree.png`,
  bush: `${wildernessMapAssetPath}/bush.png`,
} as const;

export const HUB_MAP_TILE_SRC = {
  stone: `${hubFloorAssetPath}/hub-city-stone-seamless.png`,
  grass128: `${hubFloor128AssetPath}/hub-outside-grass-floor-atlas-128.png`,
  stone128: `${hubFloor128AssetPath}/hub-stone-floor-atlas-128.png`,
} as const;

export const HUB_WALL_TILE_SRC = {
  north: `${hubCastleWallAssetPath}/castle-wall-north.png`,
  east: `${hubCastleWallAssetPath}/castle-wall-east.png`,
  south: `${hubCastleWallAssetPath}/castle-wall-south.png`,
  west: `${hubCastleWallAssetPath}/castle-wall-west.png`,
} as const;

export const MAP_VISUAL_OBJECT_SRC: Record<MapVisualObjectId, string> = {
  hub_house: `${hubStructureAssetPath}/hub_house.png`,
  hub_cabin: `${hubStructureAssetPath}/hub_cabin.png`,
  hub_tent: `${hubStructureAssetPath}/hub_tent.png`,
  hub_dock_shore_connector: `${hubStructureAssetPath}/hub_dock_shore_connector.png`,
  passage_gate_closed: `${passageBlockerAssetPath}/passage_gate_closed_edge_v2_100x350.png`,
  passage_gate_open: `${passageBlockerAssetPath}/passage_gate_open_faces_v2_100x350.png`,
  passage_blocker_collapsed_column: `${passageBlockerAssetPath}/passage_blocker_collapsed_column_100x350.png`,
  passage_blocker_repaired_column: `${passageBlockerAssetPath}/passage_blocker_repaired_column_100x350.png`,
  slime_covered_stone: `${slimewardDungeonAssetPath}/slime-covered-stone-64.png`,
  azure_slime_rock_cluster: `${slimewardDungeonAssetPath}/azure-slime-rock-cluster-128.png`,
};

export const SKILL_VISUAL_ICON_SRC: Partial<Record<SkillId, string>> = {
  throw_rock: `${beginnerSkillEffectsPath}/throw_rock.png`,
  kick: `${beginnerSkillEffectsPath}/kick.png`,
  guard_up: `${beginnerSkillEffectsPath}/guard_up.png`,
  first_aid: `${beginnerSkillEffectsPath}/first_aid.png`,
  deep_breath: `${beginnerSkillEffectsPath}/deep_breath.png`,
  rally_call: `${beginnerSkillEffectsPath}/rally_call.png`,
  field_hands: `${beginnerSkillEffectsPath}/field_hands.png`,
  quick_step: `${beginnerSkillEffectsPath}/quick_step.png`,
};

export const SHARED_SKILL_VISUAL_ICON_SRC = {
  projectile: `${beginnerSkillEffectsPath}/generic_projectile.png`,
  slash: `${beginnerSkillEffectsPath}/generic_slash.png`,
  redFlash: `${beginnerSkillEffectsPath}/generic_red_flash.png`,
  heal: `${beginnerSkillEffectsPath}/generic_heal_outline.png`,
} as const;

export const MAP_OBJECT_ICON_SRC = {
  healingFountain: `${beginnerSkillEffectsPath}/hub_healing_fountain.png`,
  teleportBroken: `${teleportAssetPath}/TeleportBroken.png`,
  teleportGood: `${teleportAssetPath}/TeleportGood.png`,
  slimewardTeleportBroken: `${slimewardDungeonAssetPath}/slimeward-teleporter-broken.png`,
  slimewardTeleportGood: `${slimewardDungeonAssetPath}/slimeward-teleporter-active.png`,
  slimewardWaypoint: `${slimewardDungeonAssetPath}/dungeon-waypoint-marker-32.png`,
} as const;

export const SLIMEWARD_DUNGEON_TILE_SRC = {
  floorDamp: `${slimewardDungeonAssetPath}/slimeward-floor-damp-stone-128.png`,
  floorAzure: `${slimewardDungeonAssetPath}/slimeward-floor-azure-slime-stone-128.png`,
  wall: `${slimewardDungeonAssetPath}/slimeward-wall-azure-stone-64.png`,
} as const;
