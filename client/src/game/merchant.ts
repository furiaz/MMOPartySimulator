import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { CLASS_DEFINITIONS } from "./classes";
import {
  FARM_POTATO_CROP_ID,
  FARM_POTATO_SEED_PRICE_CROWNS,
  getFarmCropDefinition,
  isFarmCropUnlocked,
  unlockFarmCrop,
} from "./farm";
import {
  addOwnedLivestockCreature,
  getLivestockCreatureDefinition,
  getLivestockState,
  LIVESTOCK_DUSKHEN_CREATURE_ID,
  LIVESTOCK_DUSKHEN_MERCHANT_PRICE_PER_OWNED,
} from "./livestock";
import {
  addItemToInventoryState,
  getAvailableInventorySlots,
} from "./inventory";
import { getCraftingRecipeOutputItemIds } from "./crafting";
import { getItemDefinition } from "./items";
import {
  isMerchantUnlockedForQuests,
  recordMerchantItemPurchasedForQuests,
  recordMerchantLockedForQuest,
} from "./questSystem";
import type { GameState } from "./state";
import { EQUIPMENT_SLOT_LABELS, EQUIPMENT_TYPE_LABELS } from "./equipmentTypes";
import { isClassAllowedForEquipment } from "./equipmentRules";
import { SKILL_DEFINITIONS } from "./skills";
import {
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";
import type {
  DebugTelemetryEventType,
  EquipmentSlot,
  FarmCropId,
  ItemDefinition,
  ItemId,
  KeyItemId,
  LivestockCreatureId,
  Companion,
  NpcEntity,
} from "./types";

export type MerchantMenuSelection =
  | "buy"
  | "farm_seeds"
  | "livestock"
  | "sell"
  | "leave";

export type MerchantStockGroup =
  | "flasks"
  | "books"
  | "weapons"
  | "offhands"
  | "cloth"
  | "leather"
  | "mail"
  | "plate"
  | "accessories";

export type MerchantStockEntry = {
  itemId: ItemId;
  priceCrowns: number;
  group: MerchantStockGroup;
};

export type MerchantBuyFilter = "all" | MerchantStockGroup;

export type MerchantStockFilterOptions = {
  mainFilter?: MerchantBuyFilter;
  secondaryFilter?: string | null;
  minLevelRequirement?: number | null;
  maxLevelRequirement?: number | null;
  partyCompatibleOnly?: boolean;
};

export type MerchantSecondaryFilterOption = {
  id: string;
  label: string;
};

export type MerchantBuyFailureReason =
  | "invalid_merchant"
  | "item_not_in_stock"
  | "invalid_item"
  | "invalid_price"
  | "insufficient_crowns"
  | "inventory_full"
  | "inventory_add_failed"
  | "currency_remove_failed"
  | "merchant_locked_for_quest";

export type MerchantBuyResult =
  | {
      status: "success";
      merchantNpcId: string;
      itemId: ItemId;
      displayName: string;
      priceCrowns: number;
      previousCrowns: number;
      newCrowns: number;
    }
  | {
      status: "failed";
      merchantNpcId: string;
      itemId: ItemId;
      displayName?: string;
      priceCrowns?: number;
      previousCrowns: number;
      newCrowns: number;
      reason: MerchantBuyFailureReason;
    };

export type MerchantFarmSeedStockEntry = {
  cropId: FarmCropId;
  seedKeyItemId: KeyItemId;
  displayName: string;
  cropDisplayName: string;
  priceCrowns: number;
  isOwned: boolean;
  sourceHint: string;
};

export type MerchantFarmSeedBuyFailureReason =
  | "invalid_merchant"
  | "merchant_locked_for_quest"
  | "item_not_in_stock"
  | "already_owned"
  | "insufficient_crowns"
  | "currency_remove_failed";

export type MerchantFarmSeedBuyResult =
  | {
      status: "success";
      merchantNpcId: string;
      cropId: FarmCropId;
      displayName: string;
      priceCrowns: number;
      previousCrowns: number;
      newCrowns: number;
    }
  | {
      status: "failed";
      merchantNpcId: string;
      cropId: FarmCropId;
      displayName?: string;
      priceCrowns?: number;
      previousCrowns: number;
      newCrowns: number;
      reason: MerchantFarmSeedBuyFailureReason;
    };

export type MerchantLivestockStockEntry = {
  creatureId: LivestockCreatureId;
  discoveryKeyItemId: KeyItemId;
  displayName: string;
  creatureDisplayName: string;
  ownedCount: number;
  priceCrowns: number;
  sourceHint: string;
};

export type MerchantLivestockBuyFailureReason =
  | "invalid_merchant"
  | "merchant_locked_for_quest"
  | "item_not_in_stock"
  | "insufficient_crowns"
  | "currency_remove_failed";

export type MerchantLivestockBuyResult =
  | {
      status: "success";
      merchantNpcId: string;
      creatureId: LivestockCreatureId;
      displayName: string;
      priceCrowns: number;
      previousCrowns: number;
      newCrowns: number;
      ownedCount: number;
    }
  | {
      status: "failed";
      merchantNpcId: string;
      creatureId: LivestockCreatureId;
      displayName?: string;
      priceCrowns?: number;
      previousCrowns: number;
      newCrowns: number;
      reason: MerchantLivestockBuyFailureReason;
    };

const BASE_MERCHANT_BUY_STOCK: MerchantStockEntry[] = [
  { itemId: "minor_recovery_flask", priceCrowns: 30, group: "flasks" },
  { itemId: "soldiers_recovery_flask", priceCrowns: 45, group: "flasks" },
  { itemId: "throw_rock_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "kick_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "guard_up_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "first_aid_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "deep_breath_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "rally_call_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "field_hands_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "quick_step_skill_book", priceCrowns: 25, group: "books" },
  { itemId: "duelist_challenge_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "second_wind_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "blade_parry_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "edge_focus_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "press_the_opening_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "woodcutter_rhythm_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "flash_step_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "sweeping_strike_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "shield_challenge_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "hold_fast_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "guard_wall_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "iron_stance_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "shield_formation_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "stonebreaker_rhythm_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "shield_rush_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "shield_shockwave_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "pinning_shot_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "fake_death_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "evasive_instinct_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "hunters_focus_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "poison_coating_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "herbalist_rhythm_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "skirmish_shot_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "arrow_burst_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "threatening_roar_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "blood_feast_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "rugged_hide_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "feral_surge_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "pack_frenzy_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "stoneclaw_rhythm_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "pounce_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "maul_sweep_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "elemental_bolt_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "mana_shield_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "frost_armor_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "overcharge_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "arcane_conduit_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "emberwood_rhythm_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "flame_step_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "fire_burst_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "binding_rune_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "rune_lance_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "warding_glyph_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "rewind_rune_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "runic_focus_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "leyline_matrix_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "stone_sigil_rhythm_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "rune_step_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "blinding_ray_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "light_mend_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "sanctuary_veil_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "guiding_light_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "radiant_benediction_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "herbalist_hymn_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "dawn_step_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "circle_of_renewal_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "whip_prison_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "flagellant_lash_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "martyrs_veil_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "penitents_gift_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "eternal_hope_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "burdened_benediction_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "woodcutting_penance_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "atonement_step_skill_book", priceCrowns: 60, group: "books" },
  { itemId: "training_sword", priceCrowns: 12, group: "weapons" },
  { itemId: "copper_training_sword", priceCrowns: 28, group: "weapons" },
  { itemId: "iron_sword", priceCrowns: 60, group: "weapons" },
  { itemId: "guard_mace", priceCrowns: 60, group: "weapons" },
  { itemId: "claw_gauntlets", priceCrowns: 65, group: "weapons" },
  { itemId: "thorn_whip", priceCrowns: 65, group: "weapons" },
  { itemId: "short_bow", priceCrowns: 65, group: "weapons" },
  { itemId: "apprentice_orb", priceCrowns: 60, group: "weapons" },
  { itemId: "rune_lantern", priceCrowns: 60, group: "weapons" },
  { itemId: "holy_mace", priceCrowns: 60, group: "weapons" },
  { itemId: "steel_sword", priceCrowns: 120, group: "weapons" },
  { itemId: "veteran_sword", priceCrowns: 180, group: "weapons" },
  { itemId: "bastion_mace", priceCrowns: 120, group: "weapons" },
  { itemId: "ironhold_mace", priceCrowns: 180, group: "weapons" },
  { itemId: "steel_claws", priceCrowns: 130, group: "weapons" },
  { itemId: "rending_claws", priceCrowns: 195, group: "weapons" },
  { itemId: "barbed_whip", priceCrowns: 130, group: "weapons" },
  { itemId: "bloodthorn_whip", priceCrowns: 195, group: "weapons" },
  { itemId: "reinforced_bow", priceCrowns: 130, group: "weapons" },
  { itemId: "veteran_warbow", priceCrowns: 195, group: "weapons" },
  { itemId: "adept_orb", priceCrowns: 120, group: "weapons" },
  { itemId: "storm_orb", priceCrowns: 180, group: "weapons" },
  { itemId: "etched_rune_lantern", priceCrowns: 120, group: "weapons" },
  { itemId: "deep_rune_lantern", priceCrowns: 180, group: "weapons" },
  { itemId: "sanctified_mace", priceCrowns: 120, group: "weapons" },
  { itemId: "dawn_mace", priceCrowns: 180, group: "weapons" },
  { itemId: "wooden_shield", priceCrowns: 45, group: "offhands" },
  { itemId: "simple_talisman", priceCrowns: 40, group: "offhands" },
  { itemId: "sacrificial_dagger", priceCrowns: 40, group: "offhands" },
  { itemId: "reinforced_shield", priceCrowns: 90, group: "offhands" },
  { itemId: "tower_shield", priceCrowns: 135, group: "offhands" },
  { itemId: "warded_talisman", priceCrowns: 90, group: "offhands" },
  { itemId: "greater_talisman", priceCrowns: 135, group: "offhands" },
  { itemId: "bright_lantern", priceCrowns: 90, group: "offhands" },
  { itemId: "radiant_lantern", priceCrowns: 135, group: "offhands" },
  { itemId: "ritual_dagger", priceCrowns: 90, group: "offhands" },
  { itemId: "oath_dagger", priceCrowns: 135, group: "offhands" },
  { itemId: "acolyte_robe", priceCrowns: 82, group: "cloth" },
  { itemId: "acolyte_pants", priceCrowns: 62, group: "cloth" },
  { itemId: "acolyte_wraps", priceCrowns: 52, group: "cloth" },
  { itemId: "acolyte_sandals", priceCrowns: 52, group: "cloth" },
  { itemId: "scholar_hood", priceCrowns: 62, group: "cloth" },
  { itemId: "scholar_robe", priceCrowns: 82, group: "cloth" },
  { itemId: "scholar_pants", priceCrowns: 62, group: "cloth" },
  { itemId: "scholar_gloves", priceCrowns: 52, group: "cloth" },
  { itemId: "scholar_sandals", priceCrowns: 52, group: "cloth" },
  { itemId: "blessed_hood", priceCrowns: 100, group: "cloth" },
  { itemId: "blessed_robe", priceCrowns: 140, group: "cloth" },
  { itemId: "blessed_pants", priceCrowns: 120, group: "cloth" },
  { itemId: "blessed_wraps", priceCrowns: 100, group: "cloth" },
  { itemId: "blessed_sandals", priceCrowns: 100, group: "cloth" },
  { itemId: "sanctuary_hood", priceCrowns: 150, group: "cloth" },
  { itemId: "sanctuary_robe", priceCrowns: 210, group: "cloth" },
  { itemId: "sanctuary_pants", priceCrowns: 180, group: "cloth" },
  { itemId: "sanctuary_wraps", priceCrowns: 150, group: "cloth" },
  { itemId: "sanctuary_sandals", priceCrowns: 150, group: "cloth" },
  { itemId: "adept_hood", priceCrowns: 100, group: "cloth" },
  { itemId: "adept_robe", priceCrowns: 140, group: "cloth" },
  { itemId: "adept_pants", priceCrowns: 120, group: "cloth" },
  { itemId: "adept_gloves", priceCrowns: 100, group: "cloth" },
  { itemId: "adept_sandals", priceCrowns: 100, group: "cloth" },
  { itemId: "arcanist_hood", priceCrowns: 150, group: "cloth" },
  { itemId: "arcanist_robe", priceCrowns: 210, group: "cloth" },
  { itemId: "arcanist_pants", priceCrowns: 180, group: "cloth" },
  { itemId: "arcanist_gloves", priceCrowns: 150, group: "cloth" },
  { itemId: "arcanist_sandals", priceCrowns: 150, group: "cloth" },
  { itemId: "scout_cap", priceCrowns: 26, group: "leather" },
  { itemId: "scout_jacket", priceCrowns: 35, group: "leather" },
  { itemId: "scout_trousers", priceCrowns: 28, group: "leather" },
  { itemId: "scout_gloves", priceCrowns: 24, group: "leather" },
  { itemId: "stalker_mask", priceCrowns: 44, group: "leather" },
  { itemId: "stalker_vest", priceCrowns: 60, group: "leather" },
  { itemId: "stalker_leggings", priceCrowns: 50, group: "leather" },
  { itemId: "stalker_grips", priceCrowns: 46, group: "leather" },
  { itemId: "stalker_boots", priceCrowns: 44, group: "leather" },
  { itemId: "pathfinder_cap", priceCrowns: 100, group: "leather" },
  { itemId: "pathfinder_jacket", priceCrowns: 140, group: "leather" },
  { itemId: "pathfinder_trousers", priceCrowns: 120, group: "leather" },
  { itemId: "pathfinder_gloves", priceCrowns: 100, group: "leather" },
  { itemId: "pathfinder_boots", priceCrowns: 100, group: "leather" },
  { itemId: "wayfarer_cap", priceCrowns: 150, group: "leather" },
  { itemId: "wayfarer_jacket", priceCrowns: 210, group: "leather" },
  { itemId: "wayfarer_trousers", priceCrowns: 180, group: "leather" },
  { itemId: "wayfarer_gloves", priceCrowns: 150, group: "leather" },
  { itemId: "wayfarer_boots", priceCrowns: 150, group: "leather" },
  { itemId: "striker_mask", priceCrowns: 100, group: "leather" },
  { itemId: "striker_vest", priceCrowns: 140, group: "leather" },
  { itemId: "striker_leggings", priceCrowns: 120, group: "leather" },
  { itemId: "striker_grips", priceCrowns: 100, group: "leather" },
  { itemId: "striker_boots", priceCrowns: 100, group: "leather" },
  { itemId: "duelist_mask", priceCrowns: 150, group: "leather" },
  { itemId: "duelist_vest", priceCrowns: 210, group: "leather" },
  { itemId: "duelist_leggings", priceCrowns: 180, group: "leather" },
  { itemId: "duelist_grips", priceCrowns: 150, group: "leather" },
  { itemId: "duelist_boots", priceCrowns: 150, group: "leather" },
  { itemId: "guard_coif", priceCrowns: 26, group: "mail" },
  { itemId: "guard_hauberk", priceCrowns: 35, group: "mail" },
  { itemId: "guard_legguards", priceCrowns: 28, group: "mail" },
  { itemId: "guard_gloves", priceCrowns: 24, group: "mail" },
  { itemId: "guard_boots", priceCrowns: 24, group: "mail" },
  { itemId: "vanguard_coif", priceCrowns: 44, group: "mail" },
  { itemId: "vanguard_hauberk", priceCrowns: 60, group: "mail" },
  { itemId: "vanguard_legguards", priceCrowns: 50, group: "mail" },
  { itemId: "vanguard_gloves", priceCrowns: 46, group: "mail" },
  { itemId: "vanguard_boots", priceCrowns: 44, group: "mail" },
  { itemId: "sentinel_coif", priceCrowns: 100, group: "mail" },
  { itemId: "sentinel_hauberk", priceCrowns: 140, group: "mail" },
  { itemId: "sentinel_legguards", priceCrowns: 120, group: "mail" },
  { itemId: "sentinel_gloves", priceCrowns: 100, group: "mail" },
  { itemId: "sentinel_boots", priceCrowns: 100, group: "mail" },
  { itemId: "ironward_coif", priceCrowns: 150, group: "mail" },
  { itemId: "ironward_hauberk", priceCrowns: 210, group: "mail" },
  { itemId: "ironward_legguards", priceCrowns: 180, group: "mail" },
  { itemId: "ironward_gloves", priceCrowns: 150, group: "mail" },
  { itemId: "ironward_boots", priceCrowns: 150, group: "mail" },
  { itemId: "marshal_coif", priceCrowns: 100, group: "mail" },
  { itemId: "marshal_hauberk", priceCrowns: 140, group: "mail" },
  { itemId: "marshal_legguards", priceCrowns: 120, group: "mail" },
  { itemId: "marshal_gloves", priceCrowns: 100, group: "mail" },
  { itemId: "marshal_boots", priceCrowns: 100, group: "mail" },
  { itemId: "frontline_coif", priceCrowns: 150, group: "mail" },
  { itemId: "frontline_hauberk", priceCrowns: 210, group: "mail" },
  { itemId: "frontline_legguards", priceCrowns: 180, group: "mail" },
  { itemId: "frontline_gloves", priceCrowns: 150, group: "mail" },
  { itemId: "frontline_boots", priceCrowns: 150, group: "mail" },
  { itemId: "bulwark_helm", priceCrowns: 62, group: "plate" },
  { itemId: "bulwark_greaves", priceCrowns: 74, group: "plate" },
  { itemId: "bulwark_gauntlets", priceCrowns: 62, group: "plate" },
  { itemId: "bulwark_sabatons", priceCrowns: 62, group: "plate" },
  { itemId: "warplate_helm", priceCrowns: 64, group: "plate" },
  { itemId: "warplate_cuirass", priceCrowns: 90, group: "plate" },
  { itemId: "warplate_greaves", priceCrowns: 74, group: "plate" },
  { itemId: "warplate_gauntlets", priceCrowns: 66, group: "plate" },
  { itemId: "warplate_sabatons", priceCrowns: 64, group: "plate" },
  { itemId: "bastion_helm", priceCrowns: 100, group: "plate" },
  { itemId: "bastion_cuirass", priceCrowns: 140, group: "plate" },
  { itemId: "bastion_greaves", priceCrowns: 120, group: "plate" },
  { itemId: "bastion_gauntlets", priceCrowns: 100, group: "plate" },
  { itemId: "bastion_sabatons", priceCrowns: 100, group: "plate" },
  { itemId: "ironhold_helm", priceCrowns: 150, group: "plate" },
  { itemId: "ironhold_cuirass", priceCrowns: 210, group: "plate" },
  { itemId: "ironhold_greaves", priceCrowns: 180, group: "plate" },
  { itemId: "ironhold_gauntlets", priceCrowns: 150, group: "plate" },
  { itemId: "ironhold_sabatons", priceCrowns: 150, group: "plate" },
  { itemId: "breaker_helm", priceCrowns: 100, group: "plate" },
  { itemId: "breaker_cuirass", priceCrowns: 140, group: "plate" },
  { itemId: "breaker_greaves", priceCrowns: 120, group: "plate" },
  { itemId: "breaker_gauntlets", priceCrowns: 100, group: "plate" },
  { itemId: "breaker_sabatons", priceCrowns: 100, group: "plate" },
  { itemId: "conqueror_helm", priceCrowns: 150, group: "plate" },
  { itemId: "conqueror_cuirass", priceCrowns: 210, group: "plate" },
  { itemId: "conqueror_greaves", priceCrowns: 180, group: "plate" },
  { itemId: "conqueror_gauntlets", priceCrowns: 150, group: "plate" },
  { itemId: "conqueror_sabatons", priceCrowns: 150, group: "plate" },
  { itemId: "plain_charm", priceCrowns: 25, group: "accessories" },
];

const craftableEquipmentItemIds = new Set(
  getCraftingRecipeOutputItemIds().filter(
    (itemId) => getItemDefinition(itemId).category === "equipment",
  ),
);

const DEFAULT_MERCHANT_BUY_STOCK: MerchantStockEntry[] =
  BASE_MERCHANT_BUY_STOCK.filter(
    (entry) => !craftableEquipmentItemIds.has(entry.itemId),
  );

export function isMerchantNpc(entity: unknown): entity is NpcEntity {
  return Boolean(
    entity &&
      typeof entity === "object" &&
      "kind" in entity &&
      entity.kind === "npc" &&
      "npcRole" in entity &&
      entity.npcRole === "merchant",
  );
}

export function getMerchantBuyStock(
  state: GameState,
  merchantNpcId: string,
): MerchantStockEntry[] {
  const merchant = state.entities[merchantNpcId];

  return isMerchantNpc(merchant) ? DEFAULT_MERCHANT_BUY_STOCK : [];
}

export function getFilteredMerchantBuyStock(
  state: GameState,
  merchantNpcId: string,
  filters: MerchantStockFilterOptions = {},
): MerchantStockEntry[] {
  return getMerchantBuyStock(state, merchantNpcId).filter((entry) => {
    const itemDefinition = getItemDefinition(entry.itemId);

    if (!itemDefinition) {
      return false;
    }

    if (filters.mainFilter && filters.mainFilter !== "all" && entry.group !== filters.mainFilter) {
      return false;
    }

    if (
      filters.secondaryFilter &&
      !doesMerchantSecondaryFilterMatch(entry, itemDefinition, filters.secondaryFilter)
    ) {
      return false;
    }

    if (!doesMerchantLevelRequirementMatch(itemDefinition, filters)) {
      return false;
    }

    return !filters.partyCompatibleOnly ||
      isMerchantStockEntryCompatibleWithParty(state, entry);
  });
}

export function getMerchantSecondaryFilterOptions(
  stock: MerchantStockEntry[],
  group: MerchantStockGroup,
): MerchantSecondaryFilterOption[] {
  const optionsById = new Map<string, MerchantSecondaryFilterOption>();

  for (const entry of stock) {
    if (entry.group !== group) {
      continue;
    }

    const itemDefinition = getItemDefinition(entry.itemId);
    const option = itemDefinition
      ? getMerchantSecondaryFilterOption(entry, itemDefinition)
      : null;

    if (option) {
      optionsById.set(option.id, option);
    }
  }

  return [...optionsById.values()].sort((first, second) =>
    first.label.localeCompare(second.label),
  );
}

export function isMerchantStockEntryCompatibleWithParty(
  state: GameState,
  entry: MerchantStockEntry,
): boolean {
  const itemDefinition = getItemDefinition(entry.itemId);

  if (!itemDefinition) {
    return false;
  }

  if (itemDefinition.category === "consumable") {
    return true;
  }

  if (itemDefinition.category === "skill_book") {
    return true;
  }

  if (itemDefinition.category === "material") {
    return true;
  }

  if (itemDefinition.category !== "equipment") {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "companion" &&
      isMerchantEquipmentCompatibleWithCompanion(entity, itemDefinition),
  );
}

export function getMerchantFarmSeedStock(
  state: GameState,
  merchantNpcId: string,
): MerchantFarmSeedStockEntry[] {
  const merchant = state.entities[merchantNpcId];

  if (!isMerchantNpc(merchant) || !isMerchantUnlockedForQuests(state)) {
    return [];
  }

  const potato = getFarmCropDefinition(FARM_POTATO_CROP_ID);

  return potato.seedKeyItemId
    ? [
        {
          cropId: potato.id,
          seedKeyItemId: potato.seedKeyItemId,
          displayName: "Potato Seed",
          cropDisplayName: potato.displayName,
          priceCrowns: FARM_POTATO_SEED_PRICE_CROWNS,
          isOwned: isFarmCropUnlocked(state, potato.id),
          sourceHint: potato.sourceHint,
        },
      ]
    : [];
}

export function buyMerchantFarmSeed(
  state: GameState,
  merchantNpcId: string,
  cropId: FarmCropId,
  nowMs = Date.now(),
): { state: GameState; result: MerchantFarmSeedBuyResult } {
  const previousCrowns = getCurrencyBalance(state.wallet, "crowns");
  const merchant = state.entities[merchantNpcId];
  const crop = getFarmCropDefinition(cropId);
  const stockEntry = getMerchantFarmSeedStock(state, merchantNpcId).find(
    (entry) => entry.cropId === cropId,
  );

  if (!isMerchantNpc(merchant)) {
    return createMerchantFarmSeedBuyFailure(
      state,
      merchantNpcId,
      cropId,
      previousCrowns,
      "invalid_merchant",
      stockEntry,
    );
  }

  if (!isMerchantUnlockedForQuests(state)) {
    const lockedState = recordMerchantLockedForQuest(
      state,
      merchantNpcId,
      "merchant_seed_buy_locked",
    );

    return createMerchantFarmSeedBuyFailure(
      lockedState,
      merchantNpcId,
      cropId,
      previousCrowns,
      "merchant_locked_for_quest",
      stockEntry,
    );
  }

  if (!stockEntry || !crop.seedKeyItemId) {
    return createMerchantFarmSeedBuyFailure(
      state,
      merchantNpcId,
      cropId,
      previousCrowns,
      "item_not_in_stock",
      stockEntry,
    );
  }

  let nextState = appendMerchantFarmSeedTelemetry(
    state,
    "farm_seed_purchase_attempt",
    merchantNpcId,
    stockEntry,
    {
      result: "attempt",
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
    },
  );

  if (isFarmCropUnlocked(nextState, cropId)) {
    return createMerchantFarmSeedBuyFailure(
      nextState,
      merchantNpcId,
      cropId,
      previousCrowns,
      "already_owned",
      stockEntry,
    );
  }

  if (!canAfford(nextState.wallet, "crowns", stockEntry.priceCrowns)) {
    return createMerchantFarmSeedBuyFailure(
      nextState,
      merchantNpcId,
      cropId,
      previousCrowns,
      "insufficient_crowns",
      stockEntry,
    );
  }

  const currencyResult = removeCurrencyFromWalletState(
    nextState,
    "crowns",
    stockEntry.priceCrowns,
    "merchant",
  );

  if (currencyResult.result.status !== "success") {
    return createMerchantFarmSeedBuyFailure(
      nextState,
      merchantNpcId,
      cropId,
      previousCrowns,
      "currency_remove_failed",
      stockEntry,
    );
  }

  const unlock = unlockFarmCrop(
    currencyResult.state,
    cropId,
    "merchant",
    nowMs,
  );
  nextState = appendMerchantFarmSeedTelemetry(
    unlock.state,
    "farm_seed_purchase_succeeded",
    merchantNpcId,
    stockEntry,
    {
      result: "success",
      currencyAmount: stockEntry.priceCrowns,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: currencyResult.result.newBalance,
    },
  );

  return {
    state: nextState,
    result: {
      status: "success",
      merchantNpcId,
      cropId,
      displayName: stockEntry.displayName,
      priceCrowns: stockEntry.priceCrowns,
      previousCrowns,
      newCrowns: currencyResult.result.newBalance,
    },
  };
}

export function getMerchantLivestockStock(
  state: GameState,
  merchantNpcId: string,
): MerchantLivestockStockEntry[] {
  const merchant = state.entities[merchantNpcId];

  if (!isMerchantNpc(merchant) || !isMerchantUnlockedForQuests(state)) {
    return [];
  }

  const duskhen = getLivestockCreatureDefinition(LIVESTOCK_DUSKHEN_CREATURE_ID);

  if (!duskhen) {
    return [];
  }

  const ownedCount =
    getLivestockState(state).ownedCreaturesById[LIVESTOCK_DUSKHEN_CREATURE_ID] ??
    0;

  return [
    {
      creatureId: duskhen.id,
      discoveryKeyItemId: duskhen.discoveryKeyItemId,
      displayName: "Duskhen Egg",
      creatureDisplayName: duskhen.displayName,
      ownedCount,
      priceCrowns:
        Math.max(1, ownedCount) * LIVESTOCK_DUSKHEN_MERCHANT_PRICE_PER_OWNED,
      sourceHint: "Permanent Duskhen ownership",
    },
  ];
}

export function buyMerchantLivestockCreature(
  state: GameState,
  merchantNpcId: string,
  creatureId: LivestockCreatureId,
  nowMs = Date.now(),
): { state: GameState; result: MerchantLivestockBuyResult } {
  const previousCrowns = getCurrencyBalance(state.wallet, "crowns");
  const merchant = state.entities[merchantNpcId];
  const stockEntry = getMerchantLivestockStock(state, merchantNpcId).find(
    (entry) => entry.creatureId === creatureId,
  );

  if (!isMerchantNpc(merchant)) {
    return createMerchantLivestockBuyFailure(
      state,
      merchantNpcId,
      creatureId,
      previousCrowns,
      "invalid_merchant",
      stockEntry,
    );
  }

  if (!isMerchantUnlockedForQuests(state)) {
    const lockedState = recordMerchantLockedForQuest(
      state,
      merchantNpcId,
      "merchant_livestock_buy_locked",
    );

    return createMerchantLivestockBuyFailure(
      lockedState,
      merchantNpcId,
      creatureId,
      previousCrowns,
      "merchant_locked_for_quest",
      stockEntry,
    );
  }

  if (!stockEntry) {
    return createMerchantLivestockBuyFailure(
      state,
      merchantNpcId,
      creatureId,
      previousCrowns,
      "item_not_in_stock",
      stockEntry,
    );
  }

  let nextState = appendMerchantLivestockTelemetry(
    state,
    "livestock_creature_purchase_attempt",
    merchantNpcId,
    stockEntry,
    {
      result: "attempt",
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
    },
  );

  if (!canAfford(nextState.wallet, "crowns", stockEntry.priceCrowns)) {
    return createMerchantLivestockBuyFailure(
      nextState,
      merchantNpcId,
      creatureId,
      previousCrowns,
      "insufficient_crowns",
      stockEntry,
    );
  }

  const currencyResult = removeCurrencyFromWalletState(
    nextState,
    "crowns",
    stockEntry.priceCrowns,
    "merchant",
  );

  if (currencyResult.result.status !== "success") {
    return createMerchantLivestockBuyFailure(
      nextState,
      merchantNpcId,
      creatureId,
      previousCrowns,
      "currency_remove_failed",
      stockEntry,
    );
  }

  const unlock = addOwnedLivestockCreature(
    currencyResult.state,
    creatureId,
    "merchant",
    nowMs,
  );
  nextState = appendMerchantLivestockTelemetry(
    unlock.state,
    "livestock_creature_purchase_succeeded",
    merchantNpcId,
    stockEntry,
    {
      result: "success",
      currencyAmount: stockEntry.priceCrowns,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: currencyResult.result.newBalance,
    },
  );

  return {
    state: nextState,
    result: {
      status: "success",
      merchantNpcId,
      creatureId,
      displayName: stockEntry.displayName,
      priceCrowns: stockEntry.priceCrowns,
      previousCrowns,
      newCrowns: currencyResult.result.newBalance,
      ownedCount:
        nextState.livestock?.ownedCreaturesById[creatureId] ??
        stockEntry.ownedCount + 1,
    },
  };
}

export function buyMerchantItem(
  state: GameState,
  merchantNpcId: string,
  itemId: ItemId,
): { state: GameState; result: MerchantBuyResult } {
  const previousCrowns = getCurrencyBalance(state.wallet, "crowns");
  const merchant = state.entities[merchantNpcId];

  if (!isMerchantNpc(merchant)) {
    return createMerchantBuyFailure(
      state,
      merchantNpcId,
      itemId,
      previousCrowns,
      "invalid_merchant",
    );
  }

  if (!isMerchantUnlockedForQuests(state)) {
    const lockedState = recordMerchantLockedForQuest(
      state,
      merchantNpcId,
      "merchant_buy_locked",
    );

    return createMerchantBuyFailure(
      lockedState,
      merchantNpcId,
      itemId,
      previousCrowns,
      "merchant_locked_for_quest",
    );
  }

  const stockEntry = getMerchantBuyStock(state, merchantNpcId).find(
    (entry) => entry.itemId === itemId,
  );

  if (!stockEntry) {
    return createMerchantBuyFailure(
      state,
      merchantNpcId,
      itemId,
      previousCrowns,
      "item_not_in_stock",
    );
  }

  const itemDefinition = getItemDefinition(stockEntry.itemId);

  if (
    !itemDefinition ||
    (itemDefinition.category !== "equipment" &&
      itemDefinition.category !== "consumable" &&
      itemDefinition.category !== "material" &&
      itemDefinition.category !== "skill_book")
  ) {
    return createMerchantBuyFailure(
      state,
      merchantNpcId,
      itemId,
      previousCrowns,
      "invalid_item",
      stockEntry,
      itemDefinition,
    );
  }

  if (!Number.isFinite(stockEntry.priceCrowns) || stockEntry.priceCrowns <= 0) {
    return createMerchantBuyFailure(
      state,
      merchantNpcId,
      itemId,
      previousCrowns,
      "invalid_price",
      stockEntry,
      itemDefinition,
    );
  }

  let nextState = appendMerchantBuyTelemetry(
    state,
    "merchant_buy_attempt",
    merchantNpcId,
    stockEntry,
    itemDefinition,
    {
      result: "attempt",
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
    },
  );

  if (!canAfford(nextState.wallet, "crowns", stockEntry.priceCrowns)) {
    return createMerchantBuyFailure(
      nextState,
      merchantNpcId,
      itemId,
      previousCrowns,
      "insufficient_crowns",
      stockEntry,
      itemDefinition,
    );
  }

  if (!canInventoryAcceptMerchantPurchase(nextState, itemDefinition)) {
    return createMerchantBuyFailure(
      nextState,
      merchantNpcId,
      itemId,
      previousCrowns,
      "inventory_full",
      stockEntry,
      itemDefinition,
    );
  }

  const currencyResult = removeCurrencyFromWalletState(
    nextState,
    "crowns",
    stockEntry.priceCrowns,
    "merchant",
  );

  if (currencyResult.result.status !== "success") {
    return createMerchantBuyFailure(
      nextState,
      merchantNpcId,
      itemId,
      previousCrowns,
      "currency_remove_failed",
      stockEntry,
      itemDefinition,
    );
  }

  nextState = appendMerchantBuyTelemetry(
    currencyResult.state,
    "merchant_buy_currency_removed",
    merchantNpcId,
    stockEntry,
    itemDefinition,
    {
      result: "success",
      currencyAmount: stockEntry.priceCrowns,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: currencyResult.result.newBalance,
    },
  );

  const inventoryResult = addItemToInventoryState(
    nextState,
    itemId,
    1,
    "merchant",
  );

  if (inventoryResult.result.status !== "success") {
    return createMerchantBuyFailure(
      state,
      merchantNpcId,
      itemId,
      previousCrowns,
      "inventory_add_failed",
      stockEntry,
      itemDefinition,
    );
  }

  nextState = appendMerchantBuyTelemetry(
    inventoryResult.state,
    "merchant_buy_item_added",
    merchantNpcId,
    stockEntry,
    itemDefinition,
    {
      result: "success",
      addedQuantity: 1,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: currencyResult.result.newBalance,
    },
  );
  nextState = appendMerchantBuyTelemetry(
    nextState,
    "merchant_buy_completed",
    merchantNpcId,
    stockEntry,
    itemDefinition,
    {
      result: "success",
      currencyAmount: stockEntry.priceCrowns,
      addedQuantity: 1,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: currencyResult.result.newBalance,
    },
  );
  nextState = recordMerchantItemPurchasedForQuests(nextState, itemId, 1);

  return {
    state: nextState,
    result: {
      status: "success",
      merchantNpcId,
      itemId,
      displayName: itemDefinition.displayName,
      priceCrowns: stockEntry.priceCrowns,
      previousCrowns,
      newCrowns: currencyResult.result.newBalance,
    },
  };
}

function canInventoryAcceptMerchantPurchase(
  state: GameState,
  itemDefinition: ItemDefinition,
): boolean {
  if (
    itemDefinition.stackable &&
    state.inventory.slots.some(
      (slot) =>
        slot.itemId === itemDefinition.id &&
        slot.quantity < itemDefinition.maxStack,
    )
  ) {
    return true;
  }

  return getAvailableInventorySlots(state.inventory) > 0;
}

function doesMerchantSecondaryFilterMatch(
  entry: MerchantStockEntry,
  itemDefinition: ItemDefinition,
  secondaryFilter: string,
): boolean {
  const option = getMerchantSecondaryFilterOption(entry, itemDefinition);

  return option?.id === secondaryFilter;
}

function doesMerchantLevelRequirementMatch(
  itemDefinition: ItemDefinition,
  filters: MerchantStockFilterOptions,
): boolean {
  const itemLevelRequirement = itemDefinition.levelRequirement ?? 0;
  const minLevelRequirement = normalizeMerchantLevelFilter(
    filters.minLevelRequirement,
  );
  const maxLevelRequirement = normalizeMerchantLevelFilter(
    filters.maxLevelRequirement,
  );

  if (
    minLevelRequirement !== null &&
    itemLevelRequirement < minLevelRequirement
  ) {
    return false;
  }

  if (
    maxLevelRequirement !== null &&
    itemLevelRequirement > maxLevelRequirement
  ) {
    return false;
  }

  return true;
}

function normalizeMerchantLevelFilter(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function getMerchantSecondaryFilterOption(
  entry: MerchantStockEntry,
  itemDefinition: ItemDefinition,
): MerchantSecondaryFilterOption | null {
  if ((entry.group === "weapons" || entry.group === "offhands") && itemDefinition.equipmentType) {
    return {
      id: itemDefinition.equipmentType,
      label: EQUIPMENT_TYPE_LABELS[itemDefinition.equipmentType],
    };
  }

  if (
    (entry.group === "cloth" ||
      entry.group === "leather" ||
      entry.group === "mail" ||
      entry.group === "plate") &&
    itemDefinition.equipmentSlot
  ) {
    return {
      id: itemDefinition.equipmentSlot,
      label: getArmorSlotLabel(itemDefinition.equipmentSlot),
    };
  }

  if (entry.group === "accessories" && itemDefinition.equipmentType) {
    return {
      id: itemDefinition.equipmentType,
      label: "Charm",
    };
  }

  if (entry.group === "books" && itemDefinition.skillBookSkillId) {
    const skillDefinition = SKILL_DEFINITIONS[itemDefinition.skillBookSkillId];
    const classDefinition = skillDefinition
      ? CLASS_DEFINITIONS[skillDefinition.classId]
      : null;

    return classDefinition
      ? {
          id: classDefinition.id,
          label: classDefinition.displayName,
        }
      : null;
  }

  return null;
}

function getArmorSlotLabel(slot: EquipmentSlot): string {
  return EQUIPMENT_SLOT_LABELS[slot].replace(" Armor", "");
}

function isMerchantEquipmentCompatibleWithCompanion(
  companion: Companion,
  itemDefinition: ItemDefinition,
): boolean {
  if (itemDefinition.category !== "equipment") {
    return false;
  }

  if (itemDefinition.equipmentKind === "armor" || itemDefinition.equipmentKind === "accessory") {
    return true;
  }

  if (!itemDefinition.equipmentSlot || !itemDefinition.equipmentType) {
    return false;
  }

  if (
    itemDefinition.equipmentSlot !== "mainHand" &&
    itemDefinition.equipmentSlot !== "offhand"
  ) {
    return false;
  }

  return isClassAllowedForEquipment(companion.classId, itemDefinition);
}

export function recordMerchantInteractionOpened(
  state: GameState,
  merchantNpcId: string,
): GameState {
  return appendMerchantTelemetry(state, "merchant_interaction_opened", merchantNpcId, {
    result: "success",
  });
}

export function recordMerchantInteractionClosed(
  state: GameState,
  merchantNpcId: string,
): GameState {
  return appendMerchantTelemetry(state, "merchant_interaction_closed", merchantNpcId, {
    result: "success",
  });
}

export function recordMerchantMenuSelected(
  state: GameState,
  merchantNpcId: string,
  selection: MerchantMenuSelection,
): GameState {
  return appendMerchantTelemetry(state, "merchant_menu_selected", merchantNpcId, {
    result: selection,
    reason: selection,
  });
}

function createMerchantBuyFailure(
  state: GameState,
  merchantNpcId: string,
  itemId: ItemId,
  previousCrowns: number,
  reason: MerchantBuyFailureReason,
  stockEntry?: MerchantStockEntry,
  itemDefinition = getItemDefinition(itemId),
): { state: GameState; result: MerchantBuyResult } {
  const failedState = appendMerchantBuyTelemetry(
    state,
    "merchant_buy_failed",
    merchantNpcId,
    stockEntry ?? { itemId, priceCrowns: 0, group: "weapons" },
    itemDefinition,
    {
      result: "failed",
      reason,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
    },
  );

  return {
    state: failedState,
    result: {
      status: "failed",
      merchantNpcId,
      itemId,
      displayName: itemDefinition?.displayName,
      priceCrowns: stockEntry?.priceCrowns,
      previousCrowns,
      newCrowns: previousCrowns,
      reason,
    },
  };
}

function createMerchantFarmSeedBuyFailure(
  state: GameState,
  merchantNpcId: string,
  cropId: FarmCropId,
  previousCrowns: number,
  reason: MerchantFarmSeedBuyFailureReason,
  stockEntry?: MerchantFarmSeedStockEntry,
): { state: GameState; result: MerchantFarmSeedBuyResult } {
  const fallbackCrop = getFarmCropDefinition(cropId);
  const failedState = appendMerchantFarmSeedTelemetry(
    state,
    "farm_seed_purchase_failed",
    merchantNpcId,
    stockEntry ?? {
      cropId,
      seedKeyItemId: fallbackCrop.seedKeyItemId ?? "farm_seed_potato",
      displayName: fallbackCrop.singularName,
      cropDisplayName: fallbackCrop.displayName,
      priceCrowns: 0,
      isOwned: isFarmCropUnlocked(state, cropId),
      sourceHint: fallbackCrop.sourceHint,
    },
    {
      result: "failed",
      reason,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
    },
  );

  return {
    state: failedState,
    result: {
      status: "failed",
      merchantNpcId,
      cropId,
      displayName: stockEntry?.displayName,
      priceCrowns: stockEntry?.priceCrowns,
      previousCrowns,
      newCrowns: previousCrowns,
      reason,
    },
  };
}

function createMerchantLivestockBuyFailure(
  state: GameState,
  merchantNpcId: string,
  creatureId: LivestockCreatureId,
  previousCrowns: number,
  reason: MerchantLivestockBuyFailureReason,
  stockEntry?: MerchantLivestockStockEntry,
): { state: GameState; result: MerchantLivestockBuyResult } {
  const fallbackCreature = getLivestockCreatureDefinition(creatureId);
  const failedState = appendMerchantLivestockTelemetry(
    state,
    "livestock_creature_purchase_failed",
    merchantNpcId,
    stockEntry ?? {
      creatureId,
      discoveryKeyItemId:
        fallbackCreature?.discoveryKeyItemId ?? "livestock_creature_duskhen",
      displayName: fallbackCreature?.displayName ?? "Livestock Creature",
      creatureDisplayName: fallbackCreature?.displayName ?? "Livestock Creature",
      ownedCount: 0,
      priceCrowns: 0,
      sourceHint: fallbackCreature?.sourceHint ?? "Unavailable",
    },
    {
      result: "failed",
      reason,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
    },
  );

  return {
    state: failedState,
    result: {
      status: "failed",
      merchantNpcId,
      creatureId,
      displayName: stockEntry?.displayName,
      priceCrowns: stockEntry?.priceCrowns,
      previousCrowns,
      newCrowns: previousCrowns,
      reason,
    },
  };
}

function appendMerchantBuyTelemetry(
  state: GameState,
  type: DebugTelemetryEventType,
  merchantNpcId: string,
  stockEntry: MerchantStockEntry,
  itemDefinition: ItemDefinition | undefined,
  event: {
    result: string;
    reason?: string;
    currencyAmount?: number;
    addedQuantity?: number;
    previousCurrencyBalance: number;
    nextCurrencyBalance: number;
  },
): GameState {
  return appendMerchantTelemetry(state, type, merchantNpcId, {
    itemId: stockEntry.itemId,
    itemDisplayName: itemDefinition?.displayName,
    itemCategory: itemDefinition?.category,
    equipmentType: itemDefinition?.equipmentType,
    valueEach: stockEntry.priceCrowns,
    currencyId: "crowns",
    currencyAmount: event.currencyAmount ?? stockEntry.priceCrowns,
    addedQuantity: event.addedQuantity,
    previousCurrencyBalance: event.previousCurrencyBalance,
    nextCurrencyBalance: event.nextCurrencyBalance,
    inventoryUsedSlots: state.inventory.slots.length,
    inventoryCapacity: state.inventory.capacity,
    result: event.result,
    reason: event.reason,
  });
}

function appendMerchantFarmSeedTelemetry(
  state: GameState,
  type: DebugTelemetryEventType,
  merchantNpcId: string,
  stockEntry: MerchantFarmSeedStockEntry,
  event: {
    result: string;
    reason?: string;
    currencyAmount?: number;
    previousCurrencyBalance: number;
    nextCurrencyBalance: number;
  },
): GameState {
  return appendMerchantTelemetry(state, type, merchantNpcId, {
    farmCropId: stockEntry.cropId,
    keyItemId: stockEntry.seedKeyItemId,
    keyItemDisplayName: stockEntry.displayName,
    farmUnlockSource: "merchant",
    crownCost: stockEntry.priceCrowns,
    currencyId: "crowns",
    currencyAmount: event.currencyAmount ?? stockEntry.priceCrowns,
    previousCurrencyBalance: event.previousCurrencyBalance,
    nextCurrencyBalance: event.nextCurrencyBalance,
    result: event.result,
    reason: event.reason,
  });
}

function appendMerchantLivestockTelemetry(
  state: GameState,
  type: DebugTelemetryEventType,
  merchantNpcId: string,
  stockEntry: MerchantLivestockStockEntry,
  event: {
    result: string;
    reason?: string;
    currencyAmount?: number;
    previousCurrencyBalance: number;
    nextCurrencyBalance: number;
  },
): GameState {
  return appendMerchantTelemetry(state, type, merchantNpcId, {
    livestockCreatureId: stockEntry.creatureId,
    keyItemId: stockEntry.discoveryKeyItemId,
    keyItemDisplayName: stockEntry.displayName,
    livestockUnlockSource: "merchant",
    livestockQuantityBefore: stockEntry.ownedCount,
    livestockQuantityAfter:
      event.result === "success" ? stockEntry.ownedCount + 1 : stockEntry.ownedCount,
    crownCost: stockEntry.priceCrowns,
    currencyId: "crowns",
    currencyAmount: event.currencyAmount ?? stockEntry.priceCrowns,
    previousCurrencyBalance: event.previousCurrencyBalance,
    nextCurrencyBalance: event.nextCurrencyBalance,
    result: event.result,
    reason: event.reason,
  });
}

function appendMerchantTelemetry(
  state: GameState,
  type: DebugTelemetryEventType,
  merchantNpcId: string,
  event: Omit<Parameters<typeof appendDebugTelemetryEvent>[1], "type" | "entityId" | "tick">,
): GameState {
  return appendDebugTelemetryEvent(state, {
    type,
    entityId: merchantNpcId,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
    ...event,
  });
}
