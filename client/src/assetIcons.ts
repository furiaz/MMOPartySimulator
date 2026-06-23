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
const firstClassSkillEffectsPath = "/assets/Generated/first-class-skill-effects";
const bladeSkillEffectsPath = `${firstClassSkillEffectsPath}/blade/sprites`;
const aegisSkillEffectsPath = `${firstClassSkillEffectsPath}/aegis/sprites`;
const hunterSkillEffectsPath = `${firstClassSkillEffectsPath}/hunter/sprites`;
const beastSkillEffectsPath = `${firstClassSkillEffectsPath}/beast/sprites`;
const elementalistSkillEffectsPath = `${firstClassSkillEffectsPath}/elementalist/sprites`;
const runecasterSkillEffectsPath = `${firstClassSkillEffectsPath}/runecaster/sprites`;
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
  class_mentor: `${nowAssetPackPath}/class-mentor.png`,
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
  duelist_challenge: `${bladeSkillEffectsPath}/duelist_challenge.png`,
  second_wind: `${bladeSkillEffectsPath}/second_wind.png`,
  blade_parry: `${bladeSkillEffectsPath}/blade_parry.png`,
  edge_focus: `${bladeSkillEffectsPath}/edge_focus.png`,
  press_the_opening: `${bladeSkillEffectsPath}/press_the_opening_caster.png`,
  woodcutter_rhythm: `${bladeSkillEffectsPath}/woodcutter_rhythm.png`,
  flash_step: `${bladeSkillEffectsPath}/flash_step.png`,
  sweeping_strike: `${bladeSkillEffectsPath}/sweeping_strike.png`,
  shield_challenge: `${aegisSkillEffectsPath}/shield_challenge.png`,
  hold_fast: `${aegisSkillEffectsPath}/hold_fast.png`,
  guard_wall: `${aegisSkillEffectsPath}/guard_wall.png`,
  iron_stance: `${aegisSkillEffectsPath}/iron_stance.png`,
  shield_formation: `${aegisSkillEffectsPath}/shield_formation_caster.png`,
  stonebreaker_rhythm: `${aegisSkillEffectsPath}/stonebreaker_rhythm.png`,
  shield_rush: `${aegisSkillEffectsPath}/shield_rush.png`,
  shield_shockwave: `${aegisSkillEffectsPath}/shield_shockwave.png`,
  pinning_shot: `${hunterSkillEffectsPath}/pinning_shot.png`,
  fake_death: `${hunterSkillEffectsPath}/fake_death.png`,
  evasive_instinct: `${hunterSkillEffectsPath}/evasive_instinct.png`,
  hunters_focus: `${hunterSkillEffectsPath}/hunters_focus.png`,
  poison_coating: `${hunterSkillEffectsPath}/poison_coating_caster.png`,
  herbalist_rhythm: `${hunterSkillEffectsPath}/herbalist_rhythm.png`,
  skirmish_shot: `${hunterSkillEffectsPath}/skirmish_shot.png`,
  arrow_burst: `${hunterSkillEffectsPath}/arrow_burst.png`,
  threatening_roar: `${beastSkillEffectsPath}/threatening_roar.png`,
  blood_feast: `${beastSkillEffectsPath}/blood_feast.png`,
  rugged_hide: `${beastSkillEffectsPath}/rugged_hide.png`,
  feral_surge: `${beastSkillEffectsPath}/feral_surge.png`,
  pack_frenzy: `${beastSkillEffectsPath}/pack_frenzy_caster.png`,
  stoneclaw_rhythm: `${beastSkillEffectsPath}/stoneclaw_rhythm.png`,
  pounce: `${beastSkillEffectsPath}/pounce.png`,
  maul_sweep: `${beastSkillEffectsPath}/maul_sweep.png`,
  elemental_bolt: `${elementalistSkillEffectsPath}/elemental_bolt.png`,
  mana_shield: `${elementalistSkillEffectsPath}/mana_shield.png`,
  frost_armor: `${elementalistSkillEffectsPath}/frost_armor.png`,
  overcharge: `${elementalistSkillEffectsPath}/overcharge.png`,
  arcane_conduit: `${elementalistSkillEffectsPath}/arcane_conduit_caster.png`,
  emberwood_rhythm: `${elementalistSkillEffectsPath}/emberwood_rhythm.png`,
  flame_step: `${elementalistSkillEffectsPath}/flame_step.png`,
  fire_burst: `${elementalistSkillEffectsPath}/fire_burst.png`,
  binding_rune: `${runecasterSkillEffectsPath}/binding_rune.png`,
  rune_lance: `${runecasterSkillEffectsPath}/rune_lance.png`,
  warding_glyph: `${runecasterSkillEffectsPath}/warding_glyph.png`,
  rewind_rune: `${runecasterSkillEffectsPath}/rewind_rune.png`,
  runic_focus: `${runecasterSkillEffectsPath}/runic_focus.png`,
  leyline_matrix: `${runecasterSkillEffectsPath}/leyline_matrix_caster.png`,
  stone_sigil_rhythm: `${runecasterSkillEffectsPath}/stone_sigil_rhythm.png`,
  rune_step: `${runecasterSkillEffectsPath}/rune_step.png`,
};

export type SkillVisualPresentation = {
  src: string;
  width: number;
  height: number;
  targetedSrc?: string;
  targetedWidth?: number;
  targetedHeight?: number;
};

export const SKILL_VISUAL_PRESENTATION: Partial<
  Record<SkillId, SkillVisualPresentation>
> = {
  duelist_challenge: {
    src: `${bladeSkillEffectsPath}/duelist_challenge.png`,
    width: 84,
    height: 84,
  },
  second_wind: {
    src: `${bladeSkillEffectsPath}/second_wind.png`,
    width: 76,
    height: 76,
  },
  blade_parry: {
    src: `${bladeSkillEffectsPath}/blade_parry.png`,
    width: 80,
    height: 80,
  },
  edge_focus: {
    src: `${bladeSkillEffectsPath}/edge_focus.png`,
    width: 78,
    height: 78,
  },
  press_the_opening: {
    src: `${bladeSkillEffectsPath}/press_the_opening_caster.png`,
    width: 92,
    height: 92,
    targetedSrc: `${bladeSkillEffectsPath}/press_the_opening_companion.png`,
    targetedWidth: 58,
    targetedHeight: 58,
  },
  woodcutter_rhythm: {
    src: `${bladeSkillEffectsPath}/woodcutter_rhythm.png`,
    width: 82,
    height: 82,
  },
  flash_step: {
    src: `${bladeSkillEffectsPath}/flash_step.png`,
    width: 80,
    height: 80,
  },
  sweeping_strike: {
    src: `${bladeSkillEffectsPath}/sweeping_strike.png`,
    width: 96,
    height: 96,
  },
  shield_challenge: {
    src: `${aegisSkillEffectsPath}/shield_challenge.png`,
    width: 84,
    height: 84,
  },
  hold_fast: {
    src: `${aegisSkillEffectsPath}/hold_fast.png`,
    width: 88,
    height: 88,
  },
  guard_wall: {
    src: `${aegisSkillEffectsPath}/guard_wall.png`,
    width: 86,
    height: 86,
  },
  iron_stance: {
    src: `${aegisSkillEffectsPath}/iron_stance.png`,
    width: 82,
    height: 82,
  },
  shield_formation: {
    src: `${aegisSkillEffectsPath}/shield_formation_caster.png`,
    width: 96,
    height: 96,
    targetedSrc: `${aegisSkillEffectsPath}/shield_formation_companion.png`,
    targetedWidth: 60,
    targetedHeight: 60,
  },
  stonebreaker_rhythm: {
    src: `${aegisSkillEffectsPath}/stonebreaker_rhythm.png`,
    width: 82,
    height: 82,
  },
  shield_rush: {
    src: `${aegisSkillEffectsPath}/shield_rush.png`,
    width: 84,
    height: 84,
  },
  shield_shockwave: {
    src: `${aegisSkillEffectsPath}/shield_shockwave.png`,
    width: 100,
    height: 100,
  },
  pinning_shot: {
    src: `${hunterSkillEffectsPath}/pinning_shot.png`,
    width: 84,
    height: 84,
  },
  fake_death: {
    src: `${hunterSkillEffectsPath}/fake_death.png`,
    width: 82,
    height: 82,
  },
  evasive_instinct: {
    src: `${hunterSkillEffectsPath}/evasive_instinct.png`,
    width: 82,
    height: 82,
  },
  hunters_focus: {
    src: `${hunterSkillEffectsPath}/hunters_focus.png`,
    width: 84,
    height: 84,
  },
  poison_coating: {
    src: `${hunterSkillEffectsPath}/poison_coating_caster.png`,
    width: 96,
    height: 96,
    targetedSrc: `${hunterSkillEffectsPath}/poison_coating_companion.png`,
    targetedWidth: 60,
    targetedHeight: 60,
  },
  herbalist_rhythm: {
    src: `${hunterSkillEffectsPath}/herbalist_rhythm.png`,
    width: 82,
    height: 82,
  },
  skirmish_shot: {
    src: `${hunterSkillEffectsPath}/skirmish_shot.png`,
    width: 84,
    height: 84,
  },
  arrow_burst: {
    src: `${hunterSkillEffectsPath}/arrow_burst.png`,
    width: 100,
    height: 100,
  },
  threatening_roar: {
    src: `${beastSkillEffectsPath}/threatening_roar.png`,
    width: 88,
    height: 88,
  },
  blood_feast: {
    src: `${beastSkillEffectsPath}/blood_feast.png`,
    width: 84,
    height: 84,
  },
  rugged_hide: {
    src: `${beastSkillEffectsPath}/rugged_hide.png`,
    width: 86,
    height: 86,
  },
  feral_surge: {
    src: `${beastSkillEffectsPath}/feral_surge.png`,
    width: 84,
    height: 84,
  },
  pack_frenzy: {
    src: `${beastSkillEffectsPath}/pack_frenzy_caster.png`,
    width: 96,
    height: 96,
    targetedSrc: `${beastSkillEffectsPath}/pack_frenzy_companion.png`,
    targetedWidth: 60,
    targetedHeight: 60,
  },
  stoneclaw_rhythm: {
    src: `${beastSkillEffectsPath}/stoneclaw_rhythm.png`,
    width: 82,
    height: 82,
  },
  pounce: {
    src: `${beastSkillEffectsPath}/pounce.png`,
    width: 86,
    height: 86,
  },
  maul_sweep: {
    src: `${beastSkillEffectsPath}/maul_sweep.png`,
    width: 100,
    height: 100,
  },
  elemental_bolt: {
    src: `${elementalistSkillEffectsPath}/elemental_bolt.png`,
    width: 84,
    height: 84,
  },
  mana_shield: {
    src: `${elementalistSkillEffectsPath}/mana_shield.png`,
    width: 88,
    height: 88,
  },
  frost_armor: {
    src: `${elementalistSkillEffectsPath}/frost_armor.png`,
    width: 86,
    height: 86,
  },
  overcharge: {
    src: `${elementalistSkillEffectsPath}/overcharge.png`,
    width: 86,
    height: 86,
  },
  arcane_conduit: {
    src: `${elementalistSkillEffectsPath}/arcane_conduit_caster.png`,
    width: 96,
    height: 96,
    targetedSrc: `${elementalistSkillEffectsPath}/arcane_conduit_companion.png`,
    targetedWidth: 60,
    targetedHeight: 60,
  },
  emberwood_rhythm: {
    src: `${elementalistSkillEffectsPath}/emberwood_rhythm.png`,
    width: 82,
    height: 82,
  },
  flame_step: {
    src: `${elementalistSkillEffectsPath}/flame_step.png`,
    width: 86,
    height: 86,
  },
  fire_burst: {
    src: `${elementalistSkillEffectsPath}/fire_burst.png`,
    width: 100,
    height: 100,
  },
  binding_rune: {
    src: `${runecasterSkillEffectsPath}/binding_rune.png`,
    width: 86,
    height: 86,
  },
  rune_lance: {
    src: `${runecasterSkillEffectsPath}/rune_lance.png`,
    width: 88,
    height: 88,
  },
  warding_glyph: {
    src: `${runecasterSkillEffectsPath}/warding_glyph.png`,
    width: 86,
    height: 86,
  },
  rewind_rune: {
    src: `${runecasterSkillEffectsPath}/rewind_rune.png`,
    width: 86,
    height: 86,
  },
  runic_focus: {
    src: `${runecasterSkillEffectsPath}/runic_focus.png`,
    width: 84,
    height: 84,
  },
  leyline_matrix: {
    src: `${runecasterSkillEffectsPath}/leyline_matrix_caster.png`,
    width: 98,
    height: 98,
    targetedSrc: `${runecasterSkillEffectsPath}/leyline_matrix_companion.png`,
    targetedWidth: 60,
    targetedHeight: 60,
  },
  stone_sigil_rhythm: {
    src: `${runecasterSkillEffectsPath}/stone_sigil_rhythm.png`,
    width: 84,
    height: 84,
  },
  rune_step: {
    src: `${runecasterSkillEffectsPath}/rune_step.png`,
    width: 88,
    height: 88,
  },
};

export const SKILL_VISUAL_PRESENTATION_TEXTURE_SRC = Object.values(
  SKILL_VISUAL_PRESENTATION,
).flatMap((presentation) =>
  presentation
    ? [presentation.src, presentation.targetedSrc].filter(
        (src): src is string => Boolean(src),
      )
    : [],
);

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
