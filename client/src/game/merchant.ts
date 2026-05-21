import { appendDebugTelemetryEvent } from "./debugTelemetry";
import {
  addItemToInventoryState,
  countInventoryItem,
  getAvailableInventorySlots,
  removeItemFromInventoryState,
} from "./inventory";
import { getItemDefinition, ITEM_DEFINITIONS } from "./items";
import type { GameState } from "./state";
import { EQUIPMENT_SLOT_LABELS, EQUIPMENT_TYPE_LABELS } from "./equipmentTypes";
import { isClassAllowedForEquipment } from "./equipmentRules";
import {
  addCurrencyToWalletState,
  canAfford,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
} from "./wallet";
import type {
  DebugTelemetryEventType,
  EquipmentSlot,
  InventoryRemoveResult,
  ItemDefinition,
  ItemId,
  Companion,
  NpcEntity,
} from "./types";

export type MerchantMenuSelection = "buy" | "sell" | "quick_exchange_parts" | "leave";

export type MerchantStockGroup =
  | "flasks"
  | "food"
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
  partyCompatibleOnly?: boolean;
};

export type MerchantSecondaryFilterOption = {
  id: string;
  label: string;
};

export type QuickExchangeItem = {
  itemId: ItemId;
  displayName: string;
  quantity: number;
  valueEach: number;
  totalValue: number;
};

export type QuickExchangeResult =
  | {
      status: "success";
      merchantNpcId: string;
      exchangedItems: QuickExchangeItem[];
      totalExchangeValue: number;
      previousCrowns: number;
      newCrowns: number;
    }
  | {
      status: "no_items";
      merchantNpcId: string;
      exchangedItems: [];
      totalExchangeValue: 0;
      previousCrowns: number;
      newCrowns: number;
      reason: "no_exchangeable_parts";
    }
  | {
      status: "failed";
      merchantNpcId: string;
      exchangedItems: QuickExchangeItem[];
      totalExchangeValue: number;
      previousCrowns: number;
      newCrowns: number;
      reason: string;
    };

export type MerchantBuyFailureReason =
  | "invalid_merchant"
  | "item_not_in_stock"
  | "invalid_item"
  | "invalid_price"
  | "insufficient_crowns"
  | "inventory_full"
  | "inventory_add_failed"
  | "currency_remove_failed";

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

type RemoveItemFromInventory = (
  state: GameState,
  itemId: ItemId,
  quantity: number,
  source: "merchant",
) => { state: GameState; result: InventoryRemoveResult };

type QuickExchangeOptions = {
  removeItemFromInventory?: RemoveItemFromInventory;
};

const DEFAULT_MERCHANT_BUY_STOCK: MerchantStockEntry[] = [
  { itemId: "minor_recovery_flask", priceCrowns: 30, group: "flasks" },
  { itemId: "soldiers_recovery_flask", priceCrowns: 45, group: "flasks" },
  { itemId: "hearty_trail_rations", priceCrowns: 15, group: "food" },
  { itemId: "skirmisher_rations", priceCrowns: 15, group: "food" },
  { itemId: "training_sword", priceCrowns: 12, group: "weapons" },
  { itemId: "iron_sword", priceCrowns: 60, group: "weapons" },
  { itemId: "guard_mace", priceCrowns: 60, group: "weapons" },
  { itemId: "claw_gauntlets", priceCrowns: 65, group: "weapons" },
  { itemId: "thorn_whip", priceCrowns: 65, group: "weapons" },
  { itemId: "short_bow", priceCrowns: 65, group: "weapons" },
  { itemId: "apprentice_orb", priceCrowns: 60, group: "weapons" },
  { itemId: "rune_lantern", priceCrowns: 60, group: "weapons" },
  { itemId: "holy_mace", priceCrowns: 60, group: "weapons" },
  { itemId: "wooden_shield", priceCrowns: 45, group: "offhands" },
  { itemId: "simple_talisman", priceCrowns: 40, group: "offhands" },
  { itemId: "sacrificial_dagger", priceCrowns: 40, group: "offhands" },
  { itemId: "acolyte_robe", priceCrowns: 32, group: "cloth" },
  { itemId: "acolyte_pants", priceCrowns: 24, group: "cloth" },
  { itemId: "acolyte_wraps", priceCrowns: 22, group: "cloth" },
  { itemId: "acolyte_sandals", priceCrowns: 22, group: "cloth" },
  { itemId: "scholar_hood", priceCrowns: 24, group: "cloth" },
  { itemId: "scholar_robe", priceCrowns: 32, group: "cloth" },
  { itemId: "scholar_pants", priceCrowns: 24, group: "cloth" },
  { itemId: "scholar_gloves", priceCrowns: 22, group: "cloth" },
  { itemId: "scholar_sandals", priceCrowns: 22, group: "cloth" },
  { itemId: "scout_cap", priceCrowns: 26, group: "leather" },
  { itemId: "scout_jacket", priceCrowns: 35, group: "leather" },
  { itemId: "scout_trousers", priceCrowns: 28, group: "leather" },
  { itemId: "scout_gloves", priceCrowns: 24, group: "leather" },
  { itemId: "stalker_mask", priceCrowns: 28, group: "leather" },
  { itemId: "stalker_vest", priceCrowns: 36, group: "leather" },
  { itemId: "stalker_leggings", priceCrowns: 28, group: "leather" },
  { itemId: "stalker_grips", priceCrowns: 26, group: "leather" },
  { itemId: "stalker_boots", priceCrowns: 26, group: "leather" },
  { itemId: "guard_coif", priceCrowns: 42, group: "mail" },
  { itemId: "guard_hauberk", priceCrowns: 60, group: "mail" },
  { itemId: "guard_legguards", priceCrowns: 50, group: "mail" },
  { itemId: "guard_gloves", priceCrowns: 42, group: "mail" },
  { itemId: "guard_boots", priceCrowns: 42, group: "mail" },
  { itemId: "vanguard_coif", priceCrowns: 44, group: "mail" },
  { itemId: "vanguard_hauberk", priceCrowns: 60, group: "mail" },
  { itemId: "vanguard_legguards", priceCrowns: 50, group: "mail" },
  { itemId: "vanguard_gloves", priceCrowns: 46, group: "mail" },
  { itemId: "vanguard_boots", priceCrowns: 44, group: "mail" },
  { itemId: "bulwark_helm", priceCrowns: 62, group: "plate" },
  { itemId: "bulwark_greaves", priceCrowns: 74, group: "plate" },
  { itemId: "bulwark_gauntlets", priceCrowns: 62, group: "plate" },
  { itemId: "bulwark_sabatons", priceCrowns: 62, group: "plate" },
  { itemId: "warplate_helm", priceCrowns: 64, group: "plate" },
  { itemId: "warplate_cuirass", priceCrowns: 90, group: "plate" },
  { itemId: "warplate_greaves", priceCrowns: 74, group: "plate" },
  { itemId: "warplate_gauntlets", priceCrowns: 66, group: "plate" },
  { itemId: "warplate_sabatons", priceCrowns: 64, group: "plate" },
  { itemId: "plain_charm", priceCrowns: 25, group: "accessories" },
];

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

  if (itemDefinition.category !== "equipment") {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "companion" &&
      isMerchantEquipmentCompatibleWithCompanion(entity, itemDefinition),
  );
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
    (itemDefinition.category !== "equipment" && itemDefinition.category !== "consumable")
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

export function getQuickExchangeItemDefinitions(): ItemDefinition[] {
  return Object.values(ITEM_DEFINITIONS).filter(isQuickExchangeItemDefinition);
}

export function isQuickExchangeItemDefinition(
  itemDefinition: ItemDefinition,
): boolean {
  return Boolean(
    itemDefinition.category === "junk" &&
      itemDefinition.sellValue &&
      itemDefinition.sellValue > 0,
  );
}

export function getQuickExchangeItems(state: GameState): QuickExchangeItem[] {
  return getQuickExchangeItemDefinitions()
    .map((itemDefinition) => {
      const quantity = countInventoryItem(state.inventory, itemDefinition.id);
      const valueEach = itemDefinition.sellValue ?? 0;

      return {
        itemId: itemDefinition.id,
        displayName: itemDefinition.displayName,
        quantity,
        valueEach,
        totalValue: quantity * valueEach,
      };
    })
    .filter((item) => item.quantity > 0 && item.totalValue > 0);
}

export function quickExchangeParts(
  state: GameState,
  merchantNpcId: string,
  options: QuickExchangeOptions = {},
): { state: GameState; result: QuickExchangeResult } {
  const merchant = state.entities[merchantNpcId];
  const previousCrowns = getCurrencyBalance(state.wallet, "crowns");

  if (!isMerchantNpc(merchant)) {
    const failedState = appendMerchantTelemetry(state, "quick_exchange_failed", merchantNpcId, {
      result: "failed",
      reason: "invalid_merchant",
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
      totalExchangeValue: 0,
    });

    return {
      state: failedState,
      result: {
        status: "failed",
        merchantNpcId,
        exchangedItems: [],
        totalExchangeValue: 0,
        previousCrowns,
        newCrowns: previousCrowns,
        reason: "invalid_merchant",
      },
    };
  }

  const exchangeItems = getQuickExchangeItems(state);
  const totalExchangeValue = exchangeItems.reduce(
    (total, item) => total + item.totalValue,
    0,
  );
  let nextState = appendMerchantTelemetry(state, "quick_exchange_attempt", merchantNpcId, {
    result: "attempt",
    previousCurrencyBalance: previousCrowns,
    nextCurrencyBalance: previousCrowns,
    totalExchangeValue,
  });

  if (exchangeItems.length === 0) {
    nextState = appendMerchantTelemetry(nextState, "quick_exchange_no_items", merchantNpcId, {
      result: "no_items",
      reason: "no_exchangeable_parts",
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
      totalExchangeValue: 0,
    });

    return {
      state: nextState,
      result: {
        status: "no_items",
        merchantNpcId,
        exchangedItems: [],
        totalExchangeValue: 0,
        previousCrowns,
        newCrowns: previousCrowns,
        reason: "no_exchangeable_parts",
      },
    };
  }

  for (const item of exchangeItems) {
    nextState = appendMerchantItemTelemetry(
      nextState,
      "quick_exchange_item_selected",
      merchantNpcId,
      item,
      "selected",
      previousCrowns,
      previousCrowns,
      totalExchangeValue,
    );
  }

  const removeItem = options.removeItemFromInventory ?? removeItemFromInventoryState;

  for (const item of exchangeItems) {
    const removal = removeItem(nextState, item.itemId, item.quantity, "merchant");

    if (removal.result.status !== "success") {
      const failedState = appendMerchantItemTelemetry(
        state,
        "quick_exchange_failed",
        merchantNpcId,
        item,
        "failed",
        previousCrowns,
        previousCrowns,
        totalExchangeValue,
        `remove_${removal.result.status}`,
      );

      return {
        state: failedState,
        result: {
          status: "failed",
          merchantNpcId,
          exchangedItems: exchangeItems,
          totalExchangeValue,
          previousCrowns,
          newCrowns: previousCrowns,
          reason: `remove_${removal.result.status}`,
        },
      };
    }

    nextState = appendMerchantItemTelemetry(
      removal.state,
      "quick_exchange_item_removed",
      merchantNpcId,
      item,
      "success",
      previousCrowns,
      previousCrowns,
      totalExchangeValue,
    );
  }

  const currencyResult = addCurrencyToWalletState(
    nextState,
    "crowns",
    totalExchangeValue,
    "merchant",
  );

  if (currencyResult.result.status !== "success") {
    const failedState = appendMerchantTelemetry(state, "quick_exchange_failed", merchantNpcId, {
      result: "failed",
      reason: `currency_${currencyResult.result.status}`,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: previousCrowns,
      totalExchangeValue,
    });

    return {
      state: failedState,
      result: {
        status: "failed",
        merchantNpcId,
        exchangedItems: exchangeItems,
        totalExchangeValue,
        previousCrowns,
        newCrowns: previousCrowns,
        reason: `currency_${currencyResult.result.status}`,
      },
    };
  }

  nextState = appendMerchantTelemetry(
    currencyResult.state,
    "quick_exchange_currency_added",
    merchantNpcId,
    {
      result: "success",
      currencyAmount: totalExchangeValue,
      previousCurrencyBalance: previousCrowns,
      nextCurrencyBalance: currencyResult.result.newBalance,
      totalExchangeValue,
    },
  );
  nextState = appendMerchantTelemetry(nextState, "quick_exchange_completed", merchantNpcId, {
    result: "success",
    currencyAmount: totalExchangeValue,
    previousCurrencyBalance: previousCrowns,
    nextCurrencyBalance: currencyResult.result.newBalance,
    totalExchangeValue,
  });

  return {
    state: nextState,
    result: {
      status: "success",
      merchantNpcId,
      exchangedItems: exchangeItems,
      totalExchangeValue,
      previousCrowns,
      newCrowns: currencyResult.result.newBalance,
    },
  };
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

function appendMerchantItemTelemetry(
  state: GameState,
  type: DebugTelemetryEventType,
  merchantNpcId: string,
  item: QuickExchangeItem,
  result: string,
  previousCrowns: number,
  newCrowns: number,
  totalExchangeValue: number,
  reason?: string,
): GameState {
  const itemDefinition = getItemDefinition(item.itemId);

  return appendMerchantTelemetry(state, type, merchantNpcId, {
    itemId: item.itemId,
    itemDisplayName: itemDefinition.displayName,
    itemCategory: itemDefinition.category,
    quantitySold: item.quantity,
    removedQuantity: type === "quick_exchange_item_removed" ? item.quantity : undefined,
    valueEach: item.valueEach,
    totalItemValue: item.totalValue,
    totalExchangeValue,
    previousCurrencyBalance: previousCrowns,
    nextCurrencyBalance: newCrowns,
    result,
    reason,
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
