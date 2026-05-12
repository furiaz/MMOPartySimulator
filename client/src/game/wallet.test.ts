import { describe, expect, it } from "vitest";
import { createTestGameState } from "./testState";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import {
  addCurrencyToWalletState,
  canAfford,
  createEmptyPartyWallet,
  formatCurrencyDisplay,
  getCurrencyBalance,
  removeCurrencyFromWalletState,
  setCurrencyBalanceForDebug,
} from "./wallet";

describe("party wallet", () => {
  it("starts with zero Crowns", () => {
    const wallet = createEmptyPartyWallet();

    expect(wallet.balancesByCurrencyId.crowns).toBe(0);
    expect(getCurrencyBalance(wallet, "crowns")).toBe(0);
  });

  it("adds Crowns without using inventory slots", () => {
    const state = createTestGameState();
    const { state: nextState, result } = addCurrencyToWalletState(
      state,
      "crowns",
      100,
      "debug",
    );

    expect(result).toEqual({
      status: "success",
      currencyId: "crowns",
      requestedAmount: 100,
      changedAmount: 100,
      previousBalance: 0,
      newBalance: 100,
      source: "debug",
    });
    expect(nextState.wallet.balancesByCurrencyId.crowns).toBe(100);
    expect(nextState.inventory).toEqual(state.inventory);
  });

  it("rejects invalid additions without changing the balance", () => {
    const state = createTestGameState();
    const { state: nextState, result } = addCurrencyToWalletState(
      state,
      "crowns",
      0,
      "debug",
    );

    expect(result.status).toBe("failed_invalid");
    expect(result.changedAmount).toBe(0);
    expect(result.previousBalance).toBe(0);
    expect(result.newBalance).toBe(0);
    expect(nextState.wallet.balancesByCurrencyId.crowns).toBe(0);
  });

  it("removes Crowns when affordable", () => {
    const state = setCurrencyBalanceForDebug(
      createTestGameState(),
      "crowns",
      150,
    ).state;
    const { state: nextState, result } = removeCurrencyFromWalletState(
      state,
      "crowns",
      100,
      "debug",
    );

    expect(result.status).toBe("success");
    expect(result.changedAmount).toBe(100);
    expect(result.previousBalance).toBe(150);
    expect(result.newBalance).toBe(50);
    expect(nextState.wallet.balancesByCurrencyId.crowns).toBe(50);
  });

  it("fails safely when removing more Crowns than available", () => {
    const state = setCurrencyBalanceForDebug(
      createTestGameState(),
      "crowns",
      50,
    ).state;
    const { state: nextState, result } = removeCurrencyFromWalletState(
      state,
      "crowns",
      100,
      "debug",
    );

    expect(result.status).toBe("failed_insufficient");
    expect(result.changedAmount).toBe(0);
    expect(result.previousBalance).toBe(50);
    expect(result.newBalance).toBe(50);
    expect(nextState.wallet.balancesByCurrencyId.crowns).toBe(50);
  });

  it("checks affordability and formats the Crown display", () => {
    const state = setCurrencyBalanceForDebug(
      createTestGameState(),
      "crowns",
      1234,
    ).state;

    expect(canAfford(state.wallet, "crowns", 1000)).toBe(true);
    expect(canAfford(state.wallet, "crowns", 2000)).toBe(false);
    expect(formatCurrencyDisplay(state.wallet, "crowns")).toBe("♛ 1,234");
  });

  it("records wallet telemetry only when debug recording is active", () => {
    const inactiveState = createTestGameState();
    const inactiveResult = addCurrencyToWalletState(
      inactiveState,
      "crowns",
      25,
      "debug",
    ).state;

    expect(inactiveResult.debugTelemetry).toBeUndefined();

    const recordingState = startDebugTelemetryRecording(createTestGameState());
    const nextState = addCurrencyToWalletState(
      recordingState,
      "crowns",
      25,
      "debug",
    ).state;

    expect(
      nextState.debugTelemetry?.events.map((event) => event.type),
    ).toEqual([
      "currency_add_attempt",
      "currency_added",
      "wallet_balance_changed",
    ]);
    expect(nextState.debugTelemetry?.events.at(-1)).toMatchObject({
      currencyId: "crowns",
      currencyDisplayName: "Crowns",
      currencyAmount: 25,
      previousCurrencyBalance: 0,
      nextCurrencyBalance: 25,
      source: "debug",
      result: "success",
    });
  });
});
