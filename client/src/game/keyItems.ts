import type { GameState } from "./state";
import type { KeyItemDefinition, KeyItemId, KeyItemsById } from "./types";

export const TELEPORT_ECHO_HARBOR_UNION_BASTION_KEY_ITEM_ID =
  "teleport_echo_harbor_union_bastion" satisfies KeyItemId;
export const TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID =
  "teleport_echo_slimeward_camp" satisfies KeyItemId;
export const FARM_POTATO_SEED_KEY_ITEM_ID =
  "farm_seed_potato" satisfies KeyItemId;
export const FARM_MOONLEAF_SEED_KEY_ITEM_ID =
  "farm_seed_moonleaf" satisfies KeyItemId;
export const FARM_BITTERCAP_MUSHROOM_SEED_KEY_ITEM_ID =
  "farm_seed_bittercap_mushroom" satisfies KeyItemId;
export const FARM_ASHPEPPER_SEED_KEY_ITEM_ID =
  "farm_seed_ashpepper" satisfies KeyItemId;
export const LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID =
  "livestock_creature_duskhen" satisfies KeyItemId;
export const LIVESTOCK_WOLF_DISCOVERY_KEY_ITEM_ID =
  "livestock_creature_wolf" satisfies KeyItemId;
export const LIVESTOCK_TIN_CRAWLER_DISCOVERY_KEY_ITEM_ID =
  "livestock_creature_tin_crawler" satisfies KeyItemId;
export const LIVESTOCK_ELDER_MOSSLING_DISCOVERY_KEY_ITEM_ID =
  "livestock_creature_elder_mossling" satisfies KeyItemId;

export const KEY_ITEM_DEFINITIONS: Record<KeyItemId, KeyItemDefinition> = {
  teleport_echo_harbor_union_bastion: {
    id: "teleport_echo_harbor_union_bastion",
    displayName: "Teleportation Echo - Harbor Union Bastion",
    description: "Unlocks free World Travel teleport to Harbor Union Bastion.",
  },
  teleport_echo_slimeward_camp: {
    id: "teleport_echo_slimeward_camp",
    displayName: "Teleportation Echo - Slimeward Camp",
    description: "Unlocks free World Travel teleport to Slimeward Camp.",
  },
  farm_seed_potato: {
    id: "farm_seed_potato",
    displayName: "Potato Seed",
    description: "Unlocks the Potato plot at the Farm.",
  },
  farm_seed_moonleaf: {
    id: "farm_seed_moonleaf",
    displayName: "Moonleaf Seed",
    description: "Unlocks the Moonleaf plot at the Farm.",
  },
  farm_seed_bittercap_mushroom: {
    id: "farm_seed_bittercap_mushroom",
    displayName: "Bittercap Mushroom Spores",
    description: "Unlocks the Bittercap Mushroom plot at the Farm.",
  },
  farm_seed_ashpepper: {
    id: "farm_seed_ashpepper",
    displayName: "Ashpepper Seed",
    description: "Unlocks the Ashpepper plot at the Farm.",
  },
  livestock_creature_duskhen: {
    id: "livestock_creature_duskhen",
    displayName: "Duskhen Discovery",
    description: "Registers Duskhens as a Livestock creature.",
  },
  livestock_creature_wolf: {
    id: "livestock_creature_wolf",
    displayName: "Wolf Pup Discovery",
    description: "Registers Wolves as a Livestock creature.",
  },
  livestock_creature_tin_crawler: {
    id: "livestock_creature_tin_crawler",
    displayName: "Tin Crawler Hatchling Discovery",
    description: "Registers Tin Crawlers as a Livestock creature.",
  },
  livestock_creature_elder_mossling: {
    id: "livestock_creature_elder_mossling",
    displayName: "Elder Mossling Discovery",
    description: "Registers Elder Mosslings as a Livestock creature.",
  },
};

export type KeyItemAwardResult = {
  state: GameState;
  awardedQuantity: number;
  previousQuantity: number;
  newQuantity: number;
};

export function getKeyItemDefinition(
  keyItemId: KeyItemId,
): KeyItemDefinition {
  return KEY_ITEM_DEFINITIONS[keyItemId];
}

export function getKeyItemQuantity(
  state: Pick<GameState, "keyItemsById">,
  keyItemId: KeyItemId,
): number {
  return sanitizeKeyItemQuantity(state.keyItemsById?.[keyItemId]);
}

export function hasKeyItem(
  state: Pick<GameState, "keyItemsById">,
  keyItemId: KeyItemId,
): boolean {
  return getKeyItemQuantity(state, keyItemId) > 0;
}

export function awardKeyItem(
  state: GameState,
  keyItemId: KeyItemId,
  quantity = 1,
): KeyItemAwardResult {
  const awardedQuantity = sanitizeKeyItemQuantity(quantity);
  const previousQuantity = getKeyItemQuantity(state, keyItemId);

  if (awardedQuantity <= 0) {
    return {
      state,
      awardedQuantity: 0,
      previousQuantity,
      newQuantity: previousQuantity,
    };
  }

  const newQuantity = previousQuantity + awardedQuantity;

  return {
    state: {
      ...state,
      keyItemsById: {
        ...(state.keyItemsById ?? {}),
        [keyItemId]: newQuantity,
      },
    },
    awardedQuantity,
    previousQuantity,
    newQuantity,
  };
}

export function awardKeyItemIfMissing(
  state: GameState,
  keyItemId: KeyItemId,
  quantity = 1,
): KeyItemAwardResult {
  if (hasKeyItem(state, keyItemId)) {
    const currentQuantity = getKeyItemQuantity(state, keyItemId);

    return {
      state,
      awardedQuantity: 0,
      previousQuantity: currentQuantity,
      newQuantity: currentQuantity,
    };
  }

  return awardKeyItem(state, keyItemId, quantity);
}

export function getOwnedKeyItemEntries(
  state: Pick<GameState, "keyItemsById">,
): Array<{ definition: KeyItemDefinition; quantity: number }> {
  return (Object.keys(KEY_ITEM_DEFINITIONS) as KeyItemId[])
    .map((keyItemId) => ({
      definition: KEY_ITEM_DEFINITIONS[keyItemId],
      quantity: getKeyItemQuantity(state, keyItemId),
    }))
    .filter((entry) => entry.quantity > 0);
}

export function sanitizeKeyItemsById(value: unknown): KeyItemsById {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Partial<Record<KeyItemId, unknown>>;
  const sanitized: KeyItemsById = {};

  for (const keyItemId of Object.keys(KEY_ITEM_DEFINITIONS) as KeyItemId[]) {
    const quantity = sanitizeKeyItemQuantity(source[keyItemId]);

    if (quantity > 0) {
      sanitized[keyItemId] = quantity;
    }
  }

  return sanitized;
}

function sanitizeKeyItemQuantity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
