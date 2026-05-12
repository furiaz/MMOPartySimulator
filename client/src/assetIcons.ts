import type { EquipmentSlot, ItemId, NpcEntity, ResourceType } from "./game";

const nowAssetPackPath = "/Asserts/Generated/now-pack";
const wildernessMapAssetPath = "/Asserts/Generated/map-wilderness";

export const INVENTORY_ITEM_ICON_SRC: Partial<Record<ItemId, string>> = {
  wood: `${nowAssetPackPath}/wood-node.png`,
  ore: `${nowAssetPackPath}/ore-node.png`,
  herb: `${nowAssetPackPath}/herb-node.png`,
  wolf_pelt: `${nowAssetPackPath}/wood-node.png`,
  wolf_fang: `${nowAssetPackPath}/ore-node.png`,
  wolf_claw: `${nowAssetPackPath}/ore-node.png`,
  orc_tusk: `${nowAssetPackPath}/ore-node.png`,
  orc_hide: `${nowAssetPackPath}/wood-node.png`,
  orc_scrap: `${nowAssetPackPath}/ore-node.png`,
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
  tree: `${wildernessMapAssetPath}/tree.png`,
  bush: `${wildernessMapAssetPath}/bush.png`,
} as const;
