import { useState } from "react";
import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  formatCurrencyDisplay,
  getItemDefinition,
  getMerchantSellEntries,
  type GameState,
  type MerchantSellFilter,
} from "./game";

const sellFilterLabels: Record<MerchantSellFilter, string> = {
  all: "All",
  merchant_items: "Merchant Items",
  enemy_parts: "Enemy Parts",
};

const sellFilters: MerchantSellFilter[] = [
  "all",
  "merchant_items",
  "enemy_parts",
];

export function MerchantSellPanel({
  merchantNpcId,
  state,
  onSell,
}: {
  merchantNpcId: string;
  state: GameState;
  onSell: (slotIndex: number, quantity: number) => void;
}) {
  const [activeFilter, setActiveFilter] =
    useState<MerchantSellFilter>("all");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const entries = getMerchantSellEntries(state, merchantNpcId, activeFilter);
  const selectedEntry =
    entries.find((entry) => entry.slotIndex === selectedSlotIndex) ??
    entries[0] ??
    null;
  const selectedItemDefinition = selectedEntry
    ? getItemDefinition(selectedEntry.itemId)
    : null;
  const selectedQuantity = selectedEntry
    ? Math.max(1, Math.min(Math.floor(quantity), selectedEntry.quantity))
    : 1;
  const totalPriceCrowns = selectedEntry
    ? selectedEntry.unitPriceCrowns * selectedQuantity
    : 0;

  function setSelectedQuantity(nextQuantity: number) {
    if (!selectedEntry) {
      setQuantity(1);
      return;
    }

    setQuantity(
      Math.max(1, Math.min(Math.floor(nextQuantity) || 1, selectedEntry.quantity)),
    );
  }

  return (
    <aside
      className="merchant-detail-panel merchant-buy-panel merchant-sell-panel"
      aria-label="Merchant sell"
    >
      <div className="merchant-buy-header">
        <div>
          <h2>Sell</h2>
          <span>{entries.length} sellable stacks</span>
        </div>
        <strong>{formatCurrencyDisplay(state.wallet, "crowns")}</strong>
      </div>
      <nav className="merchant-buy-filter-tabs" aria-label="Merchant sell filters">
        {sellFilters.map((filter) => (
          <button
            key={filter}
            className={activeFilter === filter ? "active" : ""}
            onClick={() => {
              setActiveFilter(filter);
              setSelectedSlotIndex(null);
              setQuantity(1);
            }}
            type="button"
          >
            {sellFilterLabels[filter]}
          </button>
        ))}
      </nav>
      <div className="merchant-buy-layout">
        <div className="merchant-stock-list" aria-label="Sellable inventory">
          {entries.length > 0 ? (
            entries.map((entry) => {
              const itemDefinition = getItemDefinition(entry.itemId);
              const isSelected = selectedEntry?.slotIndex === entry.slotIndex;

              return (
                <button
                  key={entry.slotIndex}
                  className={`merchant-stock-row${isSelected ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedSlotIndex(entry.slotIndex);
                    setQuantity(1);
                  }}
                  type="button"
                >
                  <span>
                    <strong>{itemDefinition.displayName}</strong>
                    <small>
                      x{entry.quantity} · {entry.unitPriceCrowns} Crowns each
                    </small>
                  </span>
                  <b>{entry.unitPriceCrowns}</b>
                </button>
              );
            })
          ) : (
            <span className="merchant-empty-stock">No sellable items</span>
          )}
        </div>
        <div className="merchant-buy-detail" aria-label="Selected sale item">
          {selectedEntry && selectedItemDefinition ? (
            <>
              {INVENTORY_ITEM_ICON_SRC[selectedItemDefinition.id] ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="merchant-detail-item-icon"
                  src={INVENTORY_ITEM_ICON_SRC[selectedItemDefinition.id]}
                />
              ) : null}
              <div>
                <span className="merchant-detail-kicker">
                  {selectedEntry.source === "merchant_stock"
                    ? "Merchant Item"
                    : "Enemy Part"}
                </span>
                <h3>{selectedItemDefinition.displayName}</h3>
                <p>{selectedItemDefinition.description}</p>
              </div>
              <dl className="merchant-item-stat-grid">
                <div>
                  <dt>Owned</dt>
                  <dd>{selectedEntry.quantity}</dd>
                </div>
                <div>
                  <dt>Unit value</dt>
                  <dd>{selectedEntry.unitPriceCrowns} Crowns</dd>
                </div>
              </dl>
              <div className="merchant-sell-quantity">
                <span className="merchant-detail-kicker">Quantity</span>
                <div>
                  <button
                    aria-label="Decrease sale quantity"
                    disabled={selectedQuantity <= 1}
                    onClick={() => setSelectedQuantity(selectedQuantity - 1)}
                    type="button"
                  >
                    −
                  </button>
                  <input
                    aria-label="Sale quantity"
                    inputMode="numeric"
                    max={selectedEntry.quantity}
                    min={1}
                    onChange={(event) =>
                      setSelectedQuantity(Number(event.currentTarget.value))
                    }
                    step={1}
                    type="number"
                    value={selectedQuantity}
                  />
                  <button
                    aria-label="Increase sale quantity"
                    disabled={selectedQuantity >= selectedEntry.quantity}
                    onClick={() => setSelectedQuantity(selectedQuantity + 1)}
                    type="button"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setSelectedQuantity(selectedEntry.quantity)}
                    type="button"
                  >
                    Max
                  </button>
                </div>
              </div>
              <p className="merchant-sell-preview" aria-live="polite">
                Selling {selectedItemDefinition.displayName} ×{selectedQuantity} for{" "}
                {totalPriceCrowns} Crowns
              </p>
              <button
                className="merchant-buy-action"
                onClick={() => {
                  onSell(selectedEntry.slotIndex, selectedQuantity);
                  setQuantity(1);
                }}
                type="button"
              >
                Sell
              </button>
            </>
          ) : (
            <span className="merchant-empty-stock">Select an item</span>
          )}
        </div>
      </div>
    </aside>
  );
}
