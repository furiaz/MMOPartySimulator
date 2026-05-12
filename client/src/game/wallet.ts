import { appendDebugTelemetryEvent } from "./debugTelemetry";
import type { GameState } from "./state";
import type {
  CurrencyDefinition,
  CurrencyId,
  CurrencyMutationResult,
  CurrencyMutationSource,
  PartyWallet,
} from "./types";

export const WALLET_VISIBILITY_DURATION_MS = 5000;
const WALLET_TELEMETRY_ENTITY_ID = "__wallet__";

export const CURRENCY_DEFINITIONS: Record<CurrencyId, CurrencyDefinition> = {
  crowns: {
    id: "crowns",
    displayName: "Crowns",
    symbol: "♛",
  },
};

export function createEmptyPartyWallet(): PartyWallet {
  return {
    balancesByCurrencyId: {
      crowns: 0,
    },
  };
}

export function getCurrencyDefinition(
  currencyId: CurrencyId,
): CurrencyDefinition {
  return CURRENCY_DEFINITIONS[currencyId];
}

export function getCurrencyBalance(
  wallet: PartyWallet,
  currencyId: CurrencyId,
): number {
  const balance = wallet.balancesByCurrencyId[currencyId] ?? 0;

  return Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
}

export function formatCurrencyDisplay(
  wallet: PartyWallet,
  currencyId: CurrencyId,
): string {
  const definition = getCurrencyDefinition(currencyId);
  const balance = getCurrencyBalance(wallet, currencyId);

  return `${definition.symbol} ${balance.toLocaleString()}`;
}

export function canAfford(
  wallet: PartyWallet,
  currencyId: CurrencyId,
  amount: number,
): boolean {
  const normalizedAmount = normalizeCurrencyAmount(amount);

  return (
    normalizedAmount > 0 &&
    getCurrencyBalance(wallet, currencyId) >= normalizedAmount
  );
}

export function markWalletVisible(
  state: GameState,
  now = Date.now(),
  durationMs = WALLET_VISIBILITY_DURATION_MS,
): GameState {
  return {
    ...state,
    wallet: {
      ...state.wallet,
      visibleUntil: now + durationMs,
    },
  };
}

export function addCurrencyToWalletState(
  state: GameState,
  currencyId: CurrencyId,
  amount: number,
  source: CurrencyMutationSource = "unknown",
): { state: GameState; result: CurrencyMutationResult } {
  const requestedAmount = Math.floor(amount);
  const previousBalance = getCurrencyBalance(state.wallet, currencyId);
  let nextState = appendWalletTelemetry(state, currencyId, source, {
    type: "currency_add_attempt",
    amount: requestedAmount,
    previousBalance,
    nextBalance: previousBalance,
    result: "attempt",
  });

  if (!isValidCurrencyAmount(amount)) {
    return {
      state: nextState,
      result: createCurrencyResult({
        status: "failed_invalid",
        currencyId,
        requestedAmount,
        changedAmount: 0,
        previousBalance,
        newBalance: previousBalance,
        source,
        reason: "invalid_amount",
      }),
    };
  }

  const nextBalance = previousBalance + requestedAmount;
  nextState = setWalletBalance(nextState, currencyId, nextBalance);
  nextState = markWalletVisible(nextState);
  nextState = appendWalletTelemetry(nextState, currencyId, source, {
    type: "currency_added",
    amount: requestedAmount,
    previousBalance,
    nextBalance,
    result: "success",
  });
  nextState = appendWalletTelemetry(nextState, currencyId, source, {
    type: "wallet_balance_changed",
    amount: requestedAmount,
    previousBalance,
    nextBalance,
    result: "success",
  });

  return {
    state: nextState,
    result: createCurrencyResult({
      status: "success",
      currencyId,
      requestedAmount,
      changedAmount: requestedAmount,
      previousBalance,
      newBalance: nextBalance,
      source,
    }),
  };
}

export function removeCurrencyFromWalletState(
  state: GameState,
  currencyId: CurrencyId,
  amount: number,
  source: CurrencyMutationSource = "unknown",
): { state: GameState; result: CurrencyMutationResult } {
  const requestedAmount = Math.floor(amount);
  const previousBalance = getCurrencyBalance(state.wallet, currencyId);
  let nextState = appendWalletTelemetry(state, currencyId, source, {
    type: "currency_remove_attempt",
    amount: requestedAmount,
    previousBalance,
    nextBalance: previousBalance,
    result: "attempt",
  });

  if (!isValidCurrencyAmount(amount)) {
    nextState = appendWalletTelemetry(nextState, currencyId, source, {
      type: "currency_remove_failed",
      amount: requestedAmount,
      previousBalance,
      nextBalance: previousBalance,
      result: "failed_invalid",
      reason: "invalid_amount",
    });

    return {
      state: nextState,
      result: createCurrencyResult({
        status: "failed_invalid",
        currencyId,
        requestedAmount,
        changedAmount: 0,
        previousBalance,
        newBalance: previousBalance,
        source,
        reason: "invalid_amount",
      }),
    };
  }

  if (previousBalance < requestedAmount) {
    nextState = appendWalletTelemetry(nextState, currencyId, source, {
      type: "currency_remove_failed",
      amount: requestedAmount,
      previousBalance,
      nextBalance: previousBalance,
      result: "failed_insufficient",
      reason: "insufficient_balance",
    });

    return {
      state: nextState,
      result: createCurrencyResult({
        status: "failed_insufficient",
        currencyId,
        requestedAmount,
        changedAmount: 0,
        previousBalance,
        newBalance: previousBalance,
        source,
        reason: "insufficient_balance",
      }),
    };
  }

  const nextBalance = previousBalance - requestedAmount;
  nextState = setWalletBalance(nextState, currencyId, nextBalance);
  nextState = markWalletVisible(nextState);
  nextState = appendWalletTelemetry(nextState, currencyId, source, {
    type: "currency_removed",
    amount: requestedAmount,
    previousBalance,
    nextBalance,
    result: "success",
  });
  nextState = appendWalletTelemetry(nextState, currencyId, source, {
    type: "wallet_balance_changed",
    amount: -requestedAmount,
    previousBalance,
    nextBalance,
    result: "success",
  });

  return {
    state: nextState,
    result: createCurrencyResult({
      status: "success",
      currencyId,
      requestedAmount,
      changedAmount: requestedAmount,
      previousBalance,
      newBalance: nextBalance,
      source,
    }),
  };
}

export function setCurrencyBalanceForDebug(
  state: GameState,
  currencyId: CurrencyId,
  amount: number,
): { state: GameState; result: CurrencyMutationResult } {
  const requestedAmount = Math.floor(amount);
  const previousBalance = getCurrencyBalance(state.wallet, currencyId);

  if (!Number.isFinite(amount) || requestedAmount < 0) {
    return {
      state,
      result: createCurrencyResult({
        status: "failed_invalid",
        currencyId,
        requestedAmount,
        changedAmount: 0,
        previousBalance,
        newBalance: previousBalance,
        source: "debug",
        reason: "invalid_amount",
      }),
    };
  }

  let nextState = setWalletBalance(state, currencyId, requestedAmount);
  nextState = markWalletVisible(nextState);
  nextState = appendWalletTelemetry(nextState, currencyId, "debug", {
    type: "wallet_balance_changed",
    amount: requestedAmount - previousBalance,
    previousBalance,
    nextBalance: requestedAmount,
    result: "success",
  });

  return {
    state: nextState,
    result: createCurrencyResult({
      status: "success",
      currencyId,
      requestedAmount,
      changedAmount: Math.abs(requestedAmount - previousBalance),
      previousBalance,
      newBalance: requestedAmount,
      source: "debug",
    }),
  };
}

function setWalletBalance(
  state: GameState,
  currencyId: CurrencyId,
  balance: number,
): GameState {
  return {
    ...state,
    wallet: {
      ...state.wallet,
      balancesByCurrencyId: {
        ...state.wallet.balancesByCurrencyId,
        [currencyId]: Math.max(0, Math.floor(balance)),
      },
    },
  };
}

function isValidCurrencyAmount(amount: number): boolean {
  return Number.isFinite(amount) && Math.floor(amount) > 0;
}

function normalizeCurrencyAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.floor(amount) : 0;
}

function createCurrencyResult(
  result: CurrencyMutationResult,
): CurrencyMutationResult {
  return result;
}

function appendWalletTelemetry(
  state: GameState,
  currencyId: CurrencyId,
  source: CurrencyMutationSource,
  event: {
    type:
      | "currency_add_attempt"
      | "currency_added"
      | "currency_remove_attempt"
      | "currency_removed"
      | "currency_remove_failed"
      | "wallet_balance_changed";
    amount: number;
    previousBalance: number;
    nextBalance: number;
    result: string;
    reason?: string;
  },
): GameState {
  const definition = getCurrencyDefinition(currencyId);

  return appendDebugTelemetryEvent(state, {
    type: event.type,
    entityId: WALLET_TELEMETRY_ENTITY_ID,
    currencyId,
    currencyDisplayName: definition.displayName,
    currencyAmount: event.amount,
    previousCurrencyBalance: event.previousBalance,
    nextCurrencyBalance: event.nextBalance,
    source,
    result: event.result,
    reason: event.reason,
  });
}
