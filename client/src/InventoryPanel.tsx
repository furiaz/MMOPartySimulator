import { useState } from "react";
import { INVENTORY_ITEM_ICON_SRC, NPC_ICON_SRC } from "./assetIcons";
import {
  ARMOR_FAMILY_LABELS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_TYPE_LABELS,
  getItemDefinition,
  getQuestItemInventoryEntries,
  formatCurrencyDisplay,
  getCompanionSkillRank,
  getSkillBookReadCandidates,
  getSkillMaxRank,
  getUsedInventorySlots,
  ITEM_DEFINITIONS,
  SKILL_DEFINITIONS,
  type Companion,
  type ItemCategory,
  type ItemDefinition,
  type ItemId,
  type PartyInventory,
  type PartyWallet,
  type PrimaryStatId,
  type SkillDefinition,
  type GameState,
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
  members,
  quests,
  skillBookReadMessage,
  wallet,
  onReadSkillBook,
  onOpenEquipmentManagement,
}: {
  inventory: PartyInventory;
  members: Companion[];
  quests: GameState["quests"];
  skillBookReadMessage?: string | null;
  wallet: PartyWallet;
  onReadSkillBook: (companionId: string, itemId: ItemId) => void;
  onOpenEquipmentManagement: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<
    ItemCategory | "all" | "questItems"
  >("all");
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const questItemEntries = getQuestItemInventoryEntries(quests);
  const availableCategories = Array.from(
    new Set(
      Object.values(ITEM_DEFINITIONS).map((itemDefinition) =>
        itemDefinition.category
      ),
    ),
  ).filter((category) => category !== "quest");
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
  const selectedSkillBookSkillId =
    selectedItemDefinition?.category === "skill_book"
      ? selectedItemDefinition.skillBookSkillId ?? null
      : null;
  const selectedSkillBookSkill = selectedSkillBookSkillId
    ? SKILL_DEFINITIONS[selectedSkillBookSkillId]
    : null;
  const skillBookReadCandidates =
    selectedSlot && selectedItemDefinition?.category === "skill_book"
      ? getSkillBookReadCandidates(members, selectedSlot.itemId)
      : [];
  const selectedQuestItem =
    activeCategory === "questItems"
      ? questItemEntries.find((entry) => selectedItemKey === entry.key) ?? null
      : null;

  return (
    <section className="inventory-panel" aria-label="Inventory">
      <div className="inventory-header">
        <h2>Inventory</h2>
        <span>
          {activeCategory === "questItems"
            ? `${questItemEntries.length} Quest Items`
            : `${getUsedInventorySlots(inventory)}/${inventory.capacity}`}
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
          onClick={() => {
            setActiveCategory("all");
            setSelectedItemKey(null);
          }}
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
        <button
          className={activeCategory === "questItems" ? "active" : ""}
          onClick={() => {
            setActiveCategory("questItems");
            setSelectedItemKey(null);
          }}
          type="button"
        >
          Quest Items
        </button>
      </div>
      {selectedQuestItem ? (
        <div className="inventory-item-action-panel">
          <div>
            <strong>{selectedQuestItem.displayName}</strong>
            <span>Quest {selectedQuestItem.questDisplayName}</span>
            <span>
              Progress {selectedQuestItem.quantity}/{selectedQuestItem.requiredCount}
            </span>
          </div>
        </div>
      ) : selectedSlot && selectedItemDefinition ? (
        <div className="inventory-item-action-panel">
          <div>
            <strong>{selectedItemDefinition.displayName}</strong>
            <span>
              {selectedItemDefinition.category === "skill_book" &&
              selectedSkillBookSkill
                ? getSkillBookDetailText(selectedSkillBookSkill)
                : getEquipmentDetailText(selectedItemDefinition)}
            </span>
            <span>
              {selectedItemDefinition.category === "skill_book" &&
              selectedSkillBookSkill
                ? "Read to raise this skill by one rank."
                : getItemModifierText(selectedItemDefinition)}
            </span>
            {skillBookReadMessage ? <span>{skillBookReadMessage}</span> : null}
          </div>
          {selectedItemDefinition.category === "equipment" ? (
            <button onClick={onOpenEquipmentManagement} type="button">
              Equip
            </button>
          ) : selectedItemDefinition.category === "skill_book" &&
            selectedSlot &&
            selectedSkillBookSkill ? (
            <div className="inventory-skill-book-actions">
              {skillBookReadCandidates.length > 0 ? (
                skillBookReadCandidates.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => onReadSkillBook(member.id, selectedSlot.itemId)}
                    type="button"
                  >
                    Read: {member.id}{" "}
                    {getCompanionSkillRank(member, selectedSkillBookSkill.id)}/
                    {getSkillMaxRank(selectedSkillBookSkill)}
                  </button>
                ))
              ) : (
                <span>No eligible companion</span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="inventory-slot-grid">
        {activeCategory === "questItems" ? (
          questItemEntries.length > 0 ? (
            questItemEntries.map((entry, index) => {
              const isSelected = selectedItemKey === entry.key;

              return (
                <div
                  key={entry.key}
                  className={`inventory-slot filled quest-item${isSelected ? " selected" : ""}`}
                  onClick={() =>
                    setSelectedItemKey(isSelected ? null : entry.key)
                  }
                  title={[
                    entry.displayName,
                    `Quest ${entry.questDisplayName}`,
                    `Progress ${entry.quantity}/${entry.requiredCount}`,
                  ].join("\n")}
                >
                  <span className="inventory-slot-index">{index + 1}</span>
                  <img
                    alt=""
                    aria-hidden="true"
                    className="inventory-item-icon"
                    src={NPC_ICON_SRC.quest_giver}
                  />
                  <span className="inventory-slot-name">
                    {entry.displayName}
                  </span>
                  <span className="inventory-slot-quantity">
                    {entry.quantity}/{entry.requiredCount}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="inventory-slot empty inventory-quest-empty">
              <span className="inventory-slot-name">No quest items</span>
            </div>
          )
        ) : slots.map(({ index, slot }) => {
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
          const isSkillBook = itemDefinition.category === "skill_book";
          const isSelected = selectedItemKey === itemKey;
          const iconSrc = INVENTORY_ITEM_ICON_SRC[slot.itemId];

          return (
            <div
              key={index}
              className={`inventory-slot filled${isSelected ? " selected" : ""}`}
              onClick={() =>
                setSelectedItemKey(
                  (isEquipment || isSkillBook) && !isSelected ? itemKey : null,
                )
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

function getSkillBookDetailText(skill: SkillDefinition): string {
  return `${skill.displayName} | Max rank ${getSkillMaxRank(skill)}`;
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
