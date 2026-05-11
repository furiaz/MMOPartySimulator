import { useState } from "react";
import {
  getItemDefinition,
  getUsedInventorySlots,
  ITEM_DEFINITIONS,
  type ItemCategory,
  type ItemId,
  type PartyInventory,
} from "./game";

function getInventorySlotTitle(slot: PartyInventory["slots"][number]): string {
  const itemDefinition = getItemDefinition(slot.itemId);

  return [
    itemDefinition.displayName,
    `Category ${itemDefinition.category}`,
    `Quantity ${slot.quantity}/${itemDefinition.maxStack}`,
  ].join("\n");
}

function getInventoryResourceShapeClass(itemId: ItemId): string {
  return `inventory-resource-shape ${itemId}`;
}

function formatCategoryLabel(category: ItemCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function InventoryPanel({ inventory }: { inventory: PartyInventory }) {
  const [activeCategory, setActiveCategory] = useState<ItemCategory | "all">(
    "all",
  );
  const availableCategories = Array.from(
    new Set(
      Object.values(ITEM_DEFINITIONS).map((itemDefinition) =>
        itemDefinition.category
      ),
    ),
  );
  const visibleSlots = inventory.slots.filter((slot) => {
    if (activeCategory === "all") {
      return true;
    }

    return getItemDefinition(slot.itemId).category === activeCategory;
  });
  const slots = Array.from({ length: inventory.capacity }, (_, index) => ({
    index,
    slot:
      activeCategory === "all"
        ? inventory.slots[index] ?? null
        : visibleSlots[index] ?? null,
  }));

  return (
    <section className="inventory-panel" aria-label="Inventory">
      <div className="inventory-header">
        <h2>Inventory</h2>
        <span>
          {getUsedInventorySlots(inventory)}/{inventory.capacity}
        </span>
      </div>
      <div className="inventory-category-tabs" aria-label="Inventory categories">
        <button
          className={activeCategory === "all" ? "active" : ""}
          onClick={() => setActiveCategory("all")}
          type="button"
        >
          All
        </button>
        {availableCategories.map((category) => (
          <button
            key={category}
            className={activeCategory === category ? "active" : ""}
            onClick={() => setActiveCategory(category)}
            type="button"
          >
            {formatCategoryLabel(category)}
          </button>
        ))}
      </div>
      <div className="inventory-slot-grid">
        {slots.map(({ index, slot }) => {
          if (!slot) {
            return (
              <div
                key={index}
                className="inventory-slot empty"
                title={`Empty slot ${index + 1}`}
              >
                <span className="inventory-slot-index">{index + 1}</span>
              </div>
            );
          }

          const itemDefinition = getItemDefinition(slot.itemId);

          return (
            <div
              key={index}
              className="inventory-slot filled"
              title={getInventorySlotTitle(slot)}
            >
              <span className="inventory-slot-index">{index + 1}</span>
              <span
                className={getInventoryResourceShapeClass(slot.itemId)}
                aria-hidden="true"
              />
              <span className="inventory-slot-name">
                {itemDefinition.displayName}
              </span>
              <span className="inventory-slot-quantity">x{slot.quantity}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
