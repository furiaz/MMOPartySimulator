import type { EquipmentSlot, ItemId, NpcEntity, ResourceType, SkillId } from "./game";

const nowAssetPackPath = "/Asserts/Generated/now-pack";
const wildernessMapAssetPath = "/Asserts/Generated/map-wilderness";
const hubFloorAssetPath = "/Asserts/Generated/hub-floors";
const beginnerSkillEffectsPath = "/Asserts/Generated/beginner-skill-effects-50/sprites";
const wildernessMapFloor64AssetPath = `${wildernessMapAssetPath}/64`;
const hubFloor64AssetPath = `${hubFloorAssetPath}/New/64`;

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
};

export const WILDERNESS_MAP_TILE_SRC = {
  grassA: `${wildernessMapAssetPath}/grass-a.png`,
  grassB: `${wildernessMapAssetPath}/grass-b.png`,
  grass64: `${wildernessMapFloor64AssetPath}/forest-grass-floor-atlas-64.png`,
  grassDetail64: `${wildernessMapFloor64AssetPath}/forest-grass-detail-floor-atlas-64.png`,
  grassImagegen64: `${wildernessMapFloor64AssetPath}/forest-grass-detail-floor-imagegen-64.png`,
  grassFlowers64: `${wildernessMapFloor64AssetPath}/forest-grass-flowers-floor-atlas-64.png`,
  tree: `${wildernessMapAssetPath}/tree.png`,
  bush: `${wildernessMapAssetPath}/bush.png`,
} as const;

export const HUB_MAP_TILE_SRC = {
  stone: `${hubFloorAssetPath}/hub-city-stone-seamless.png`,
  grass64: `${hubFloor64AssetPath}/hub-outside-grass-floor-atlas-64.png`,
  stone64: `${hubFloor64AssetPath}/hub-stone-floor-atlas-64.png`,
} as const;

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
  teleportPoint: `${beginnerSkillEffectsPath}/teleport_point.png`,
} as const;
