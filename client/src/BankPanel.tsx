import { useState } from "react";
import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  getBankSlotsByFixedIndex,
  getInventorySlotsByFixedIndex,
  getItemDefinition,
  getItemDisplayName,
  getPartyBank,
  type BankAutoRoutingMode,
  type GameState,
  type ItemId,
  type PartyInventory,
} from "./game";

type BankMoveMode = "deposit" | "withdraw";

type PendingQuantityMove = {
  mode: BankMoveMode;
  slotIndex: number;
  itemId: ItemId;
  maxQuantity: number;
};

const autoRoutingLabels: Record<BankAutoRoutingMode, string> = {
  keep_inventory: "Keep in inventory",
  deposit_body_parts: "Deposit enemy parts only",
  deposit_all: "Deposit all",
};

function getItemTitle(itemId: ItemId, quantity: number): string {
  const itemDefinition = getItemDefinition(itemId);

  return [
    getItemDisplayName(itemDefinition),
    `Category ${itemDefinition.category}`,
    `Quantity ${quantity}`,
  ].join("\n");
}

function getResourceShapeClass(itemId: ItemId): string {
  return `inventory-resource-shape ${itemId}`;
}

export function BankPanel({
  state,
  canManage,
  resultMessage,
  onDeposit,
  onWithdraw,
  onDepositAll,
  onSetAutoRoutingMode,
  onToggleBankLock,
  onToggleInventoryLock,
}: {
  state: GameState;
  canManage: boolean;
  resultMessage?: string | null;
  onDeposit?: (slotIndex: number, quantity: number) => void;
  onWithdraw?: (slotIndex: number, quantity: number) => void;
  onDepositAll?: () => void;
  onSetAutoRoutingMode?: (mode: BankAutoRoutingMode) => void;
  onToggleBankLock?: (slotIndex: number) => void;
  onToggleInventoryLock?: (slotIndex: number) => void;
}) {
  const bank = getPartyBank(state);
  const bankSlots = getBankSlotsByFixedIndex(bank);
  const inventorySlots = getInventorySlotsByFixedIndex(state.inventory);
  const [moveMode, setMoveMode] = useState<BankMoveMode | null>(null);
  const [lockMode, setLockMode] = useState(false);
  const [pendingQuantityMove, setPendingQuantityMove] =
    useState<PendingQuantityMove | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");

  function startQuantityMove(move: PendingQuantityMove) {
    setPendingQuantityMove(move);
    setQuantityInput("1");
  }

  function commitQuantityMove(quantity: number) {
    const move = pendingQuantityMove;

    if (!move) {
      return;
    }

    const clampedQuantity = Math.max(
      1,
      Math.min(Math.floor(quantity), move.maxQuantity),
    );

    if (move.mode === "deposit") {
      onDeposit?.(move.slotIndex, clampedQuantity);
    } else {
      onWithdraw?.(move.slotIndex, clampedQuantity);
    }

    setPendingQuantityMove(null);
    setQuantityInput("1");
  }

  return (
    <section className="bank-panel" aria-label="Bank">
      <div className="bank-header">
        <div>
          <h2>Bank</h2>
          <span>
            {bank.slots.length}/{bank.capacity} slots
          </span>
        </div>
        {!canManage ? <strong>View only</strong> : null}
      </div>
      {canManage ? (
        <div className="bank-actions">
          <button
            className={moveMode === "deposit" ? "active" : ""}
            onClick={() => {
              setMoveMode(moveMode === "deposit" ? null : "deposit");
              setLockMode(false);
            }}
            type="button"
          >
            Deposit
          </button>
          <button
            className={moveMode === "withdraw" ? "active" : ""}
            onClick={() => {
              setMoveMode(moveMode === "withdraw" ? null : "withdraw");
              setLockMode(false);
            }}
            type="button"
          >
            Withdraw
          </button>
          <button onClick={onDepositAll} type="button">
            Deposit all
          </button>
          <button
            className={lockMode ? "active" : ""}
            onClick={() => {
              setLockMode((current) => !current);
              setMoveMode(null);
            }}
            type="button"
          >
            Lock slots
          </button>
          <label className="bank-routing-control">
            <span>Auto routing</span>
            <select
              value={bank.autoRoutingMode}
              onChange={(event) =>
                onSetAutoRoutingMode?.(
                  event.currentTarget.value as BankAutoRoutingMode,
                )
              }
            >
              {Object.entries(autoRoutingLabels).map(([mode, label]) => (
                <option key={mode} value={mode}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {resultMessage ? (
        <p className="bank-result-message">{resultMessage}</p>
      ) : null}
      <div className="bank-layout">
        <BankSlotGrid
          title="Bank"
          slots={bankSlots}
          inventory={state.inventory}
          canManage={canManage}
          lockMode={lockMode}
          activeMoveMode={moveMode}
          expectedMoveMode="withdraw"
          onToggleLock={onToggleBankLock}
          onMove={(slotIndex, itemId, quantity) => {
            const itemDefinition = getItemDefinition(itemId);

            if (itemDefinition.stackable && quantity > 1) {
              startQuantityMove({
                mode: "withdraw",
                slotIndex,
                itemId,
                maxQuantity: quantity,
              });
              return;
            }

            onWithdraw?.(slotIndex, 1);
          }}
        />
        <BankSlotGrid
          title="Inventory"
          slots={inventorySlots}
          inventory={state.inventory}
          canManage={canManage}
          lockMode={lockMode}
          activeMoveMode={moveMode}
          expectedMoveMode="deposit"
          onToggleLock={onToggleInventoryLock}
          onMove={(slotIndex, itemId, quantity) => {
            const itemDefinition = getItemDefinition(itemId);

            if (itemDefinition.stackable && quantity > 1) {
              startQuantityMove({
                mode: "deposit",
                slotIndex,
                itemId,
                maxQuantity: quantity,
              });
              return;
            }

            onDeposit?.(slotIndex, 1);
          }}
        />
      </div>
      {pendingQuantityMove ? (
        <div className="bank-quantity-popover" role="dialog" aria-label="Move quantity">
          <h3>{getItemDisplayName(pendingQuantityMove.itemId)}</h3>
          <label>
            <span>Quantity</span>
            <input
              min={1}
              max={pendingQuantityMove.maxQuantity}
              type="number"
              value={quantityInput}
              onChange={(event) => {
                const value = Math.max(
                  1,
                  Math.min(
                    Math.floor(Number(event.currentTarget.value) || 1),
                    pendingQuantityMove.maxQuantity,
                  ),
                );

                setQuantityInput(String(value));
              }}
            />
          </label>
          <button
            onClick={() => setQuantityInput(String(pendingQuantityMove.maxQuantity))}
            type="button"
          >
            Max
          </button>
          <button
            onClick={() => commitQuantityMove(Number(quantityInput) || 1)}
            type="button"
          >
            Move
          </button>
          <button
            onClick={() => setPendingQuantityMove(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  );
}

function BankSlotGrid({
  title,
  slots,
  canManage,
  lockMode,
  activeMoveMode,
  expectedMoveMode,
  onMove,
  onToggleLock,
}: {
  title: string;
  slots: Array<{
    index: number;
    slot: PartyInventory["slots"][number] | null;
    locked: boolean;
  }>;
  inventory: PartyInventory;
  canManage: boolean;
  lockMode: boolean;
  activeMoveMode: BankMoveMode | null;
  expectedMoveMode: BankMoveMode;
  onMove?: (slotIndex: number, itemId: ItemId, quantity: number) => void;
  onToggleLock?: (slotIndex: number) => void;
}) {
  return (
    <div className="bank-slot-panel">
      <div className="bank-slot-panel-header">
        <h3>{title}</h3>
        <span>{slots.filter(({ slot }) => Boolean(slot)).length}</span>
      </div>
      <div className="bank-slot-grid">
        {slots.map(({ index, slot, locked }) => {
          const itemDefinition = slot ? getItemDefinition(slot.itemId) : null;
          const iconSrc = slot ? INVENTORY_ITEM_ICON_SRC[slot.itemId] : undefined;
          const canClickForMove =
            canManage &&
            activeMoveMode === expectedMoveMode &&
            Boolean(slot) &&
            !locked;
          const canClickForLock = canManage && lockMode;

          return (
            <button
              key={index}
              className={`bank-slot${slot ? " filled" : " empty"}${
                locked ? " locked" : ""
              }${canClickForMove ? " actionable" : ""}`}
              disabled={!canClickForMove && !canClickForLock}
              onClick={() => {
                if (canClickForLock) {
                  onToggleLock?.(index);
                  return;
                }

                if (slot && canClickForMove) {
                  onMove?.(index, slot.itemId, slot.quantity);
                }
              }}
              title={
                slot
                  ? getItemTitle(slot.itemId, slot.quantity)
                  : `Empty slot ${index + 1}`
              }
              type="button"
            >
              <span className="bank-slot-index">{index + 1}</span>
              {locked ? <span className="bank-slot-lock" aria-label="Locked" /> : null}
              {slot && itemDefinition ? (
                <>
                  {iconSrc ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      className="inventory-item-icon"
                      src={iconSrc}
                    />
                  ) : (
                    <span
                      className={getResourceShapeClass(slot.itemId)}
                      aria-hidden="true"
                    />
                  )}
                  <span className="bank-slot-name">
                    {getItemDisplayName(itemDefinition)}
                  </span>
                  <span className="bank-slot-quantity">x{slot.quantity}</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
