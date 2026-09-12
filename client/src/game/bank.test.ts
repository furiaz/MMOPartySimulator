import { describe, expect, it } from "vitest";
import {
  autoDepositByRoutingMode,
  BANK_CAPACITY,
  clampBankTransferQuantity,
  createEmptyPartyBank,
  depositAllToBank,
  depositInventorySlotToBank,
  isAutoDepositEnemyPartMaterialDefinition,
  isPartyLeaderNearBankChest,
  sanitizePartyBank,
  setBankAutoRoutingMode,
  toggleInventoryBankLock,
  withdrawBankSlotToInventory,
} from "./bank";
import { createCompanion, createNpc } from "./entities";
import { addItemToInventoryState, createEmptyPartyInventory } from "./inventory";
import { getItemDefinition } from "./items";
import { createSavedGame } from "./saveGame";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import { getCurrencyBalance, setCurrencyBalanceForDebug } from "./wallet";
import type { GameState } from "./state";

const LEADER_ID = "leader";
const BANK_ID = "bank";

describe("bank storage", () => {
  it("creates defaults and sanitizes old saves with missing bank fields", () => {
    const bank = createEmptyPartyBank();

    expect(bank.capacity).toBe(BANK_CAPACITY);
    expect(bank.slots).toEqual([]);
    expect(bank.lockedSlotIndices).toEqual([]);
    expect(bank.autoRoutingMode).toBe("keep_inventory");

    const state = createBankState();
    const saved = createSavedGame({
      ...state,
      bank: undefined,
      inventory: {
        capacity: 5,
        slots: [{ itemId: "wood", quantity: 2 }],
        lockedSlotIndices: [3],
      },
    } as unknown as GameState);

    expect(saved.state.bank.capacity).toBe(BANK_CAPACITY);
    expect(saved.state.bank.autoRoutingMode).toBe("keep_inventory");
    expect(saved.state.inventory.lockedSlotIndices).toEqual([3]);
    expect(saved.state.inventory.slots[0]).toMatchObject({
      itemId: "wood",
      quantity: 2,
      slotIndex: 0,
    });
  });

  it("validates leader proximity to a bank chest", () => {
    expect(isPartyLeaderNearBankChest(createBankState())).toBe(true);
    expect(
      isPartyLeaderNearBankChest(createBankState({ leaderPosition: { x: 8, y: 8 } })),
    ).toBe(false);
  });

  it("deposits non-stackable equipment into bank storage", () => {
    let state = createBankState();
    state = addItemToInventoryState(state, "training_sword", 1, "debug").state;

    const transfer = depositInventorySlotToBank(state, 0, 1);

    expect(transfer.result).toMatchObject({
      status: "success",
      itemId: "training_sword",
      movedQuantity: 1,
    });
    expect(transfer.state.inventory.slots).toEqual([]);
    expect(transfer.state.bank.slots).toEqual([
      { itemId: "training_sword", quantity: 1, slotIndex: 0 },
    ]);
  });

  it("deposits and withdraws stackable quantities with clamp support", () => {
    let state = createBankState();
    state = addItemToInventoryState(state, "wood", 10, "debug").state;

    const deposit = depositInventorySlotToBank(state, 0, 7);
    expect(deposit.result).toMatchObject({
      status: "success",
      movedQuantity: 7,
      nextSourceQuantity: 3,
    });
    expect(deposit.state.bank.slots[0]).toMatchObject({
      itemId: "wood",
      quantity: 7,
    });

    const withdraw = withdrawBankSlotToInventory(deposit.state, 0, 4);
    expect(withdraw.result).toMatchObject({
      status: "success",
      movedQuantity: 4,
      nextSourceQuantity: 3,
    });
    expect(withdraw.state.bank.slots[0]).toMatchObject({
      itemId: "wood",
      quantity: 3,
    });
    expect(clampBankTransferQuantity(99, 5, 3)).toBe(3);
  });

  it("blocks manual movement when the leader is not near a bank chest", () => {
    let state = createBankState({ leaderPosition: { x: 8, y: 8 } });
    state = addItemToInventoryState(state, "wood", 1, "debug").state;

    const transfer = depositInventorySlotToBank(state, 0, 1);

    expect(transfer.result).toMatchObject({
      status: "failed",
      reason: "not_near_bank",
    });
    expect(transfer.state.inventory).toEqual(state.inventory);
    expect(transfer.state.bank).toEqual(state.bank);
  });

  it("respects inventory and bank slot locks", () => {
    let state = createBankState();
    state = addItemToInventoryState(state, "wood", 5, "debug").state;
    state = toggleInventoryBankLock(state, 0);

    const lockedDeposit = depositInventorySlotToBank(state, 0, 1);
    expect(lockedDeposit.result).toMatchObject({
      status: "failed",
      reason: "source_locked",
    });

    state = {
      ...state,
      inventory: createEmptyPartyInventory(5),
      bank: sanitizePartyBank({
        capacity: 5,
        slots: [{ itemId: "wood", quantity: 5, slotIndex: 0 }],
        lockedSlotIndices: [0],
        autoRoutingMode: "keep_inventory",
      }),
    };
    const lockedWithdraw = withdrawBankSlotToInventory(state, 0, 1);
    expect(lockedWithdraw.result).toMatchObject({
      status: "failed",
      reason: "source_locked",
    });
  });

  it("keeps empty locked inventory slots locked", () => {
    let state = createBankState();
    state = toggleInventoryBankLock(state, 4);
    state = addItemToInventoryState(state, "training_sword", 1, "debug").state;

    expect(state.inventory.lockedSlotIndices).toEqual([4]);
    expect(state.inventory.slots[0]).toMatchObject({ slotIndex: 0 });
  });

  it("deposit all skips locked slots and enemy-part-only routing skips resources", () => {
    let state = createBankState();
    state = addItemToInventoryState(state, "wolf_pelt", 2, "debug").state;
    state = addItemToInventoryState(state, "softwood", 3, "debug").state;
    state = toggleInventoryBankLock(state, 1);

    const deposit = depositAllToBank(state, {
      onlyEnemyParts: true,
      requireProximity: false,
    });

    expect(deposit.movedQuantity).toBe(2);
    expect(deposit.state.bank.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 2, slotIndex: 0 },
    ]);
    expect(deposit.state.inventory.slots).toEqual([
      { itemId: "softwood", quantity: 3, slotIndex: 1 },
    ]);
  });

  it("partially deposits until bank storage is full", () => {
    let state = createBankState({
      bank: sanitizePartyBank({
        capacity: 1,
        slots: [],
        lockedSlotIndices: [],
        autoRoutingMode: "keep_inventory",
      }),
    });
    state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    state = addItemToInventoryState(state, "plain_charm", 1, "debug").state;

    const deposit = depositAllToBank(state, { requireProximity: false });

    expect(deposit.movedQuantity).toBe(1);
    expect(deposit.stoppedBecauseFull).toBe(true);
    expect(deposit.state.bank.slots).toHaveLength(1);
    expect(deposit.state.inventory.slots).toHaveLength(1);
  });

  it("auto-deposit routing deposits enemy-part materials without awarding Crowns", () => {
    let state = createBankState();
    state = addItemToInventoryState(state, "slime_gel_t1", 4, "debug").state;
    state = addItemToInventoryState(state, "softwood", 4, "debug").state;
    state = setCurrencyBalanceForDebug(state, "crowns", 10).state;
    state = setBankAutoRoutingMode(state, "deposit_body_parts");

    const deposit = autoDepositByRoutingMode(state);

    expect(deposit.message).toBe("Items Deposited!");
    expect(getCurrencyBalance(deposit.state.wallet, "crowns")).toBe(10);
    expect(deposit.state.bank.slots).toEqual([
      { itemId: "slime_gel_t1", quantity: 4, slotIndex: 0 },
    ]);
    expect(deposit.state.inventory.slots).toEqual([
      { itemId: "softwood", quantity: 4, slotIndex: 1 },
    ]);
  });

  it("treats new Tier 2 monster parts as enemy parts for auto-deposit", () => {
    expect(isAutoDepositEnemyPartMaterialDefinition(getItemDefinition("imp_horn_chip_t2")))
      .toBe(true);
    expect(isAutoDepositEnemyPartMaterialDefinition(getItemDefinition("crawler_plate_t2")))
      .toBe(true);
    expect(isAutoDepositEnemyPartMaterialDefinition(getItemDefinition("redleaf_herb")))
      .toBe(false);
  });

  it("remote-style bank actions fail without proximity and mutate nothing", () => {
    let state = createBankState({ leaderPosition: { x: 12, y: 12 } });
    state = addItemToInventoryState(state, "wood", 1, "debug").state;

    const transfer = depositInventorySlotToBank(state, 0, 1);

    expect(transfer.result).toMatchObject({
      status: "failed",
      reason: "not_near_bank",
    });
    expect(transfer.state.inventory).toEqual(state.inventory);
    expect(transfer.state.bank).toEqual(state.bank);
  });
});

function createBankState({
  leaderPosition = { x: 0, y: 0 },
  bank = createEmptyPartyBank(),
}: {
  leaderPosition?: { x: number; y: number };
  bank?: ReturnType<typeof createEmptyPartyBank>;
} = {}) {
  const leader = createCompanion(LEADER_ID, leaderPosition, LEADER_ID);

  return addEntity(
    addEntity(
      createTestGameState({
        currentMapId: "hub",
        partyLeaderId: LEADER_ID,
        bank,
      }),
      {
        ...leader,
        state: "idle",
        currentTargetId: null,
      },
    ),
    createNpc(BANK_ID, { x: 1, y: 0 }, "Bank Chest", "bank_chest"),
  );
}
