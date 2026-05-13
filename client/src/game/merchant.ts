import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { countInventoryItem, removeItemFromInventoryState } from "./inventory";
import { getItemDefinition, ITEM_DEFINITIONS } from "./items";
import type { GameState } from "./state";
import {
  addCurrencyToWalletState,
  getCurrencyBalance,
} from "./wallet";
import type {
  DebugTelemetryEventType,
  InventoryRemoveResult,
  ItemDefinition,
  ItemId,
  NpcEntity,
} from "./types";

export type MerchantMenuSelection = "buy" | "sell" | "quick_exchange_parts" | "leave";

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

type RemoveItemFromInventory = (
  state: GameState,
  itemId: ItemId,
  quantity: number,
  source: "merchant",
) => { state: GameState; result: InventoryRemoveResult };

type QuickExchangeOptions = {
  removeItemFromInventory?: RemoveItemFromInventory;
};

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
