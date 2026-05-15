import type {
  ClassId,
  CompanionEquipment,
  EquipmentSlot,
  EquipmentStatModifiers,
  EquipmentType,
  OffhandType,
  WeaponType,
} from "./types";

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "head",
  "chest",
  "legs",
  "gloves",
  "boots",
  "mainHand",
  "offhand",
  "accessory1",
  "accessory2",
];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  head: "Head",
  chest: "Chest",
  legs: "Legs",
  gloves: "Gloves",
  boots: "Boots",
  mainHand: "Main Hand",
  offhand: "Offhand",
  accessory1: "Accessory 1",
  accessory2: "Accessory 2",
};

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  training_sword: "Training Sword",
  one_handed_sword: "One-Handed Sword",
  one_handed_mace: "One-Handed Mace",
  claw_gauntlets: "Claw Gauntlets",
  thorn_whip: "Thorn Whip",
  bow: "Bow",
  orb: "Orb",
  rune_lantern: "Rune Lantern",
  holy_mace: "Holy Mace",
  shield: "Shield",
  talisman: "Talisman",
  holy_lantern: "Holy Lantern",
  sacrificial_dagger: "Sacrificial Dagger",
  head_armor: "Head Armor",
  chest_armor: "Chest Armor",
  legs_armor: "Legs Armor",
  gloves_armor: "Gloves Armor",
  boots_armor: "Boots Armor",
  accessory: "Accessory",
};

export type ClassEquipmentProfile = {
  mainHand: WeaponType[];
  offhand: OffhandType[];
};

export const CLASS_EQUIPMENT_PROFILES: Record<ClassId, ClassEquipmentProfile> = {
  beginner: {
    mainHand: ["training_sword"],
    offhand: [],
  },
  blade: {
    mainHand: ["one_handed_sword"],
    offhand: [],
  },
  aegis: {
    mainHand: ["one_handed_mace"],
    offhand: ["shield"],
  },
  hunter: {
    mainHand: ["bow"],
    offhand: [],
  },
  beast: {
    mainHand: ["claw_gauntlets"],
    offhand: [],
  },
  elementalist: {
    mainHand: ["orb"],
    offhand: [],
  },
  runecaster: {
    mainHand: ["rune_lantern"],
    offhand: ["talisman"],
  },
  lightbearer: {
    mainHand: ["holy_mace"],
    offhand: ["holy_lantern"],
  },
  penitent: {
    mainHand: ["thorn_whip"],
    offhand: ["sacrificial_dagger"],
  },
};

export function createEmptyCompanionEquipment(): CompanionEquipment {
  return {
    head: null,
    chest: null,
    legs: null,
    gloves: null,
    boots: null,
    mainHand: null,
    offhand: null,
    accessory1: null,
    accessory2: null,
  };
}

export function addEquipmentStatModifiers(
  first: EquipmentStatModifiers,
  second: EquipmentStatModifiers,
): EquipmentStatModifiers {
  return {
    attack: (first.attack ?? 0) + (second.attack ?? 0) || undefined,
    defense: (first.defense ?? 0) + (second.defense ?? 0) || undefined,
    maxHealth: (first.maxHealth ?? 0) + (second.maxHealth ?? 0) || undefined,
    block: (first.block ?? 0) + (second.block ?? 0) || undefined,
    evasion: (first.evasion ?? 0) + (second.evasion ?? 0) || undefined,
    magicPower: (first.magicPower ?? 0) + (second.magicPower ?? 0) || undefined,
    healingPower:
      (first.healingPower ?? 0) + (second.healingPower ?? 0) || undefined,
    magicDefense:
      (first.magicDefense ?? 0) + (second.magicDefense ?? 0) || undefined,
    accuracy: (first.accuracy ?? 0) + (second.accuracy ?? 0) || undefined,
    criticalChance:
      (first.criticalChance ?? 0) + (second.criticalChance ?? 0) || undefined,
    criticalDamage:
      (first.criticalDamage ?? 0) + (second.criticalDamage ?? 0) || undefined,
    healthRegen:
      (first.healthRegen ?? 0) + (second.healthRegen ?? 0) || undefined,
  };
}
