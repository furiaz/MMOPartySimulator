import { useState } from "react";
import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  ARMOR_FAMILY_LABELS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_TYPE_LABELS,
  getItemDefinition,
  formatCurrencyDisplay,
  getUsedInventorySlots,
  ITEM_DEFINITIONS,
  type ItemCategory,
  type ItemDefinition,
  type ItemId,
  type PartyInventory,
  type PartyWallet,
  type PrimaryStatId,
} from "./game";

const primaryStatLabels: Record<PrimaryStatId, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
};

function getInventorySlotTitle(slot: PartyInventory["slots"][number]): string {
  const itemDefinition = getItemDefinition(slot.itemId);

  return [
    itemDefinition.displayName,
    `Category ${itemDefinition.category}`,
    `Quantity ${slot.quantity}/${itemDefinition.maxStack}`,
    getEquipmentDetailText(itemDefinition),
    getItemModifierText(itemDefinition),
  ].join("\n");
}

function getInventoryResourceShapeClass(itemId: ItemId): string {
  return `inventory-resource-shape ${itemId}`;
}

function formatCategoryLabel(category: ItemCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function InventoryPanel({
  inventory,
  wallet,
  onOpenEquipmentManagement,
}: {
  inventory: PartyInventory;
  wallet: PartyWallet;
  onOpenEquipmentManagement: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<ItemCategory | "all">(
    "all",
  );
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
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
  const selectedSlot = slots.find(
    ({ index, slot }) =>
      slot && selectedItemKey === `${index}-${slot.itemId}`,
  )?.slot ?? null;
  const selectedItemDefinition = selectedSlot
    ? getItemDefinition(selectedSlot.itemId)
    : null;

  return (
    <section className="inventory-panel" aria-label="Inventory">
      <div className="inventory-header">
        <h2>Inventory</h2>
        <span>
          {getUsedInventorySlots(inventory)}/{inventory.capacity}
        </span>
      </div>
      <div className="inventory-wallet-row" title="Shared party wallet">
        <span className="inventory-wallet-label">Wallet</span>
        <span className="inventory-wallet-balance">
          {formatCurrencyDisplay(wallet, "crowns")}
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
            onClick={() => {
              setActiveCategory(category);
              setSelectedItemKey(null);
            }}
            type="button"
          >
            {formatCategoryLabel(category)}
          </button>
        ))}
      </div>
      {selectedSlot && selectedItemDefinition ? (
        <div className="inventory-item-action-panel">
          <div>
            <strong>{selectedItemDefinition.displayName}</strong>
            <span>{getEquipmentDetailText(selectedItemDefinition)}</span>
            <span>{getItemModifierText(selectedItemDefinition)}</span>
          </div>
          {selectedItemDefinition.category === "equipment" ? (
            <button onClick={onOpenEquipmentManagement} type="button">
              Equip
            </button>
          ) : null}
        </div>
      ) : null}
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
          const itemKey = `${index}-${slot.itemId}`;
          const isEquipment = itemDefinition.category === "equipment";
          const isSelected = selectedItemKey === itemKey;
          const iconSrc = INVENTORY_ITEM_ICON_SRC[slot.itemId];

          return (
            <div
              key={index}
              className={`inventory-slot filled${isSelected ? " selected" : ""}`}
              onClick={() =>
                setSelectedItemKey(isEquipment && !isSelected ? itemKey : null)
              }
              title={getInventorySlotTitle(slot)}
            >
              <span className="inventory-slot-index">{index + 1}</span>
              {iconSrc ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="inventory-item-icon"
                  src={iconSrc}
                />
              ) : (
                <span
                  className={getInventoryResourceShapeClass(slot.itemId)}
                  aria-hidden="true"
                />
              )}
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

function getEquipmentDetailText(itemDefinition: ItemDefinition): string {
  if (itemDefinition.category !== "equipment") {
    return "";
  }

  return [
    itemDefinition.equipmentSlot
      ? `Slot ${EQUIPMENT_SLOT_LABELS[itemDefinition.equipmentSlot]}`
      : null,
    itemDefinition.equipmentType
      ? `Type ${EQUIPMENT_TYPE_LABELS[itemDefinition.equipmentType]}`
      : null,
    itemDefinition.armorFamily
      ? `Family ${ARMOR_FAMILY_LABELS[itemDefinition.armorFamily]}`
      : null,
    itemDefinition.tier ? `Tier ${itemDefinition.tier}` : null,
    itemDefinition.occupiesBothHands ? "Occupies both hands" : null,
    itemDefinition.levelRequirement
      ? `Level ${itemDefinition.levelRequirement}+`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function getItemModifierText(itemDefinition: ItemDefinition): string {
  const primaryStats = Object.entries(itemDefinition.primaryStatModifiers ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(
      ([stat, value]) =>
        `${primaryStatLabels[stat as PrimaryStatId]} ${formatModifier(value)}`,
    );
  const derivedStats = Object.entries(itemDefinition.statModifiers ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([stat, value]) => `${formatStatName(stat)} ${formatModifier(value)}`);
  const stats = [...primaryStats, ...derivedStats];

  return stats.length > 0
    ? stats.join(", ")
    : itemDefinition.category === "equipment"
      ? "Stats none"
      : "";
}

function formatStatName(stat: string): string {
  return stat.replace(/[A-Z]/g, (letter) => ` ${letter}`).toLowerCase();
}

function formatModifier(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}
