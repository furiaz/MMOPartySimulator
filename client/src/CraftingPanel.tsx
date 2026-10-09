import { useEffect, useMemo, useState } from "react";
import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  ARMOR_FAMILY_LABELS,
  CLASS_DEFINITIONS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_TYPE_LABELS,
  formatCurrencyDisplay,
  getSortedCraftingRecipeStatuses,
  type ArmorFamily,
  type ClassId,
  type CraftingRecipeId,
  type CraftingRecipeStatus,
  type EquipmentType,
  type GameState,
  type ItemDefinition,
  type PrimaryStatId,
} from "./game";

type CraftingLevelFilter = "all" | "1" | "5" | "10" | "15" | "20plus";
type CraftingCategoryFilter =
  | "all"
  | "key_items"
  | "weapons"
  | "armor"
  | "accessories";
type CraftingArmorFamilyFilter = "all" | ArmorFamily;
type CraftingWeaponTypeFilter = "all" | EquipmentType;
type CraftingArmorPartFilter =
  | "all"
  | "head"
  | "chest"
  | "legs"
  | "gloves"
  | "boots";
type CraftingCraftabilityFilter = "all" | "craftable" | "missing";

const armorFamilyFilterOptions: CraftingArmorFamilyFilter[] = [
  "all",
  "cloth",
  "leather",
  "mail",
  "plate",
];

const armorPartFilterOptions: CraftingArmorPartFilter[] = [
  "all",
  "head",
  "chest",
  "legs",
  "gloves",
  "boots",
];

const primaryStatLabels: Record<PrimaryStatId, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
};

function getCraftingBlockReason(status: CraftingRecipeStatus): string | null {
  if (!status.outputDisplayName) {
    return "Recipe unavailable";
  }

  if (status.isOutputOwned) {
    return "Owned";
  }

  if (!status.isSmithServiceAvailable) {
    return "Visit a hub with a Smithy";
  }

  if (!status.hasRequiredMaterials) {
    return "Missing materials";
  }

  if (!status.hasRequiredCrowns) {
    return "Not enough Crowns";
  }

  if (!status.hasInventorySpace) {
    return "Inventory full";
  }

  return null;
}

function getRecipeSummary(status: CraftingRecipeStatus): string {
  if (status.outputKeyItemDefinition) {
    return "Key Item";
  }

  const itemDefinition = status.outputItemDefinition;

  if (!itemDefinition) {
    return "Unavailable";
  }

  const level = itemDefinition.levelRequirement ?? 1;

  if (itemDefinition.equipmentKind === "armor" && itemDefinition.armorFamily) {
    return `Level ${level} ${ARMOR_FAMILY_LABELS[itemDefinition.armorFamily]} ${itemDefinition.equipmentSlot ? EQUIPMENT_SLOT_LABELS[itemDefinition.equipmentSlot] : "Armor"}`;
  }

  if (itemDefinition.equipmentKind === "weapon") {
    return `Level ${level} Weapon`;
  }

  if (itemDefinition.equipmentKind === "offhand") {
    return `Level ${level} Offhand`;
  }

  if (itemDefinition.equipmentKind === "accessory") {
    return `Level ${level} Accessory`;
  }

  return `Level ${level} Equipment`;
}

function getEquipmentStatDetails(itemDefinition: ItemDefinition): string[] {
  const primaryStats = Object.entries(itemDefinition.primaryStatModifiers ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(
      ([stat, value]) =>
        `${primaryStatLabels[stat as PrimaryStatId]} ${formatModifier(value)}`,
    );
  const derivedStats = Object.entries(itemDefinition.statModifiers ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([stat, value]) => `${formatStatName(stat)} ${formatModifier(value)}`);

  return [...primaryStats, ...derivedStats];
}

function getCraftingOutputDescription(status: CraftingRecipeStatus): string {
  if (status.outputKeyItemDefinition) {
    return status.outputKeyItemDefinition.description;
  }

  return status.outputItemDefinition?.description ?? "No description available.";
}

function getWeaponClassRequirementText(
  itemDefinition: ItemDefinition | undefined,
): string | null {
  if (
    itemDefinition?.category !== "equipment" ||
    (itemDefinition.equipmentKind !== "weapon" &&
      itemDefinition.equipmentKind !== "offhand")
  ) {
    return null;
  }

  const allowedClassNames = (itemDefinition.allowedClassIds ?? [])
    .map((classId: ClassId) => CLASS_DEFINITIONS[classId]?.displayName)
    .filter((displayName): displayName is string => Boolean(displayName));

  if (allowedClassNames.length === 0) {
    return null;
  }

  return `${allowedClassNames.length === 1 ? "Required class" : "Required classes"}: ${allowedClassNames.join(", ")}`;
}

function matchesCraftingFilters(
  status: CraftingRecipeStatus,
  filters: {
    level: CraftingLevelFilter;
    category: CraftingCategoryFilter;
    armorFamily: CraftingArmorFamilyFilter;
    armorPart: CraftingArmorPartFilter;
    weaponType: CraftingWeaponTypeFilter;
    craftability: CraftingCraftabilityFilter;
  },
): boolean {
  const itemDefinition = status.outputItemDefinition;

  if (!itemDefinition) {
    if (filters.level !== "all") {
      return false;
    }

    if (
      filters.category !== "all" &&
      (filters.category !== "key_items" || !status.outputKeyItemDefinition)
    ) {
      return false;
    }

    return (
      (filters.craftability !== "craftable" || status.canCraft) &&
      (filters.craftability !== "missing" || !status.canCraft)
    );
  }

  const level = itemDefinition.levelRequirement ?? 1;

  if (
    (filters.level === "1" && level !== 1) ||
    (filters.level === "5" && level !== 5) ||
    (filters.level === "10" && level !== 10) ||
    (filters.level === "15" && level !== 15) ||
    (filters.level === "20plus" && level < 20)
  ) {
    return false;
  }

  if (
    (filters.category === "weapons" &&
      itemDefinition.equipmentKind !== "weapon" &&
      itemDefinition.equipmentKind !== "offhand") ||
    (filters.category === "armor" && itemDefinition.equipmentKind !== "armor") ||
    (filters.category === "accessories" &&
      itemDefinition.equipmentKind !== "accessory") ||
    filters.category === "key_items"
  ) {
    return false;
  }

  if (
    filters.category === "armor" &&
    filters.armorFamily !== "all" &&
    itemDefinition.armorFamily !== filters.armorFamily
  ) {
    return false;
  }

  if (
    filters.category === "armor" &&
    filters.armorPart !== "all" &&
    itemDefinition.equipmentSlot !== filters.armorPart
  ) {
    return false;
  }

  if (
    filters.category === "weapons" &&
    filters.weaponType !== "all" &&
    itemDefinition.equipmentType !== filters.weaponType
  ) {
    return false;
  }

  if (
    (filters.craftability === "craftable" && !status.canCraft) ||
    (filters.craftability === "missing" && status.canCraft)
  ) {
    return false;
  }

  return true;
}

export function CraftingPanel({
  state,
  resultMessage,
  onCraft,
}: {
  state: GameState;
  resultMessage?: string | null;
  onCraft: (recipeId: CraftingRecipeId) => void;
}) {
  const recipeStatuses = useMemo(
    () => getSortedCraftingRecipeStatuses(state),
    [state],
  );
  const [levelFilter, setLevelFilter] = useState<CraftingLevelFilter>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<CraftingCategoryFilter>("all");
  const [armorFamilyFilter, setArmorFamilyFilter] =
    useState<CraftingArmorFamilyFilter>("all");
  const [armorPartFilter, setArmorPartFilter] =
    useState<CraftingArmorPartFilter>("all");
  const [weaponTypeFilter, setWeaponTypeFilter] =
    useState<CraftingWeaponTypeFilter>("all");
  const [craftabilityFilter, setCraftabilityFilter] =
    useState<CraftingCraftabilityFilter>("all");
  const weaponTypeFilterOptions = useMemo<CraftingWeaponTypeFilter[]>(() => {
    const weaponTypes = new Set<EquipmentType>();

    for (const status of recipeStatuses) {
      const itemDefinition = status.outputItemDefinition;

      if (
        (itemDefinition?.equipmentKind === "weapon" ||
          itemDefinition?.equipmentKind === "offhand") &&
        itemDefinition.equipmentType
      ) {
        weaponTypes.add(itemDefinition.equipmentType);
      }
    }

    return [
      "all",
      ...Array.from(weaponTypes).sort((first, second) =>
        EQUIPMENT_TYPE_LABELS[first].localeCompare(EQUIPMENT_TYPE_LABELS[second]),
      ),
    ];
  }, [recipeStatuses]);
  const filteredRecipeStatuses = useMemo(
    () =>
      recipeStatuses.filter((status) =>
        matchesCraftingFilters(status, {
          level: levelFilter,
          category: categoryFilter,
          armorFamily: armorFamilyFilter,
          armorPart: armorPartFilter,
          weaponType: weaponTypeFilter,
          craftability: craftabilityFilter,
        }),
      ),
    [
      armorFamilyFilter,
      armorPartFilter,
      categoryFilter,
      craftabilityFilter,
      levelFilter,
      recipeStatuses,
      weaponTypeFilter,
    ],
  );
  const [selectedRecipeId, setSelectedRecipeId] =
    useState<CraftingRecipeId | null>(
      filteredRecipeStatuses[0]?.recipe.id ?? null,
    );

  useEffect(() => {
    if (
      selectedRecipeId &&
      filteredRecipeStatuses.some(
        (status) => status.recipe.id === selectedRecipeId,
      )
    ) {
      return;
    }

    setSelectedRecipeId(filteredRecipeStatuses[0]?.recipe.id ?? null);
  }, [filteredRecipeStatuses, selectedRecipeId]);

  const selectedStatus =
    filteredRecipeStatuses.find(
      (status) => status.recipe.id === selectedRecipeId,
    ) ??
    filteredRecipeStatuses[0] ??
    null;
  const selectedBlockReason = selectedStatus
    ? getCraftingBlockReason(selectedStatus)
    : "No recipe selected";
  const selectedIsEquipment =
    selectedStatus?.outputItemDefinition?.category === "equipment";
  const selectedEquipmentStats =
    selectedIsEquipment && selectedStatus?.outputItemDefinition
      ? getEquipmentStatDetails(selectedStatus.outputItemDefinition)
      : [];
  const selectedDescription = selectedStatus
    ? getCraftingOutputDescription(selectedStatus)
    : "";
  const selectedWeaponClassRequirement = getWeaponClassRequirementText(
    selectedStatus?.outputItemDefinition,
  );
  const selectedOutputIconSrc = selectedStatus?.outputItemDefinition
    ? INVENTORY_ITEM_ICON_SRC[selectedStatus.outputItemDefinition.id]
    : undefined;
  const hasActiveCategoryFilter = categoryFilter !== "all";
  const hasActiveArmorFilters =
    categoryFilter === "armor" &&
    (armorFamilyFilter !== "all" || armorPartFilter !== "all");
  const hasActiveWeaponFilters =
    categoryFilter === "weapons" && weaponTypeFilter !== "all";
  const hasActiveFilters =
    levelFilter !== "all" ||
    hasActiveCategoryFilter ||
    hasActiveArmorFilters ||
    hasActiveWeaponFilters ||
    craftabilityFilter !== "all";

  function changeCategoryFilter(nextCategoryFilter: CraftingCategoryFilter) {
    setCategoryFilter(nextCategoryFilter);

    if (nextCategoryFilter !== "armor") {
      setArmorFamilyFilter("all");
      setArmorPartFilter("all");
    }

    if (nextCategoryFilter !== "weapons") {
      setWeaponTypeFilter("all");
    }
  }

  function clearFilters() {
    setLevelFilter("all");
    setCategoryFilter("all");
    setArmorFamilyFilter("all");
    setArmorPartFilter("all");
    setWeaponTypeFilter("all");
    setCraftabilityFilter("all");
  }

  return (
    <section className="crafting-panel" aria-label="Crafts">
      <div className="crafting-header">
        <div>
          <h2>Crafts</h2>
          <span>{formatCurrencyDisplay(state.wallet, "crowns")}</span>
        </div>
        <span>
          Slots {state.inventory.slots.length}/{state.inventory.capacity}
        </span>
      </div>
      <div className="crafting-layout">
        <div className="crafting-browser">
          <div className="crafting-filters" aria-label="Crafting filters">
            <label>
              <span>Level</span>
              <select
                value={levelFilter}
                onChange={(event) =>
                  setLevelFilter(event.currentTarget.value as CraftingLevelFilter)
                }
              >
                <option value="all">All</option>
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20plus">20+</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(event) =>
                  changeCategoryFilter(
                    event.currentTarget.value as CraftingCategoryFilter,
                  )
                }
              >
                <option value="all">All</option>
                <option value="key_items">Key Items</option>
                <option value="weapons">Weapons</option>
                <option value="armor">Armor</option>
                <option value="accessories">Accessories</option>
              </select>
            </label>
            {categoryFilter === "weapons" ? (
              <label>
                <span>Weapon type</span>
                <select
                  value={weaponTypeFilter}
                  onChange={(event) =>
                    setWeaponTypeFilter(
                      event.currentTarget.value as CraftingWeaponTypeFilter,
                    )
                  }
                >
                  {weaponTypeFilterOptions.map((weaponType) => (
                    <option key={weaponType} value={weaponType}>
                      {weaponType === "all"
                        ? "All"
                        : EQUIPMENT_TYPE_LABELS[weaponType]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {categoryFilter === "armor" ? (
              <>
                <label>
                  <span>Armor type</span>
                  <select
                    value={armorFamilyFilter}
                    onChange={(event) =>
                      setArmorFamilyFilter(
                        event.currentTarget.value as CraftingArmorFamilyFilter,
                      )
                    }
                  >
                    {armorFamilyFilterOptions.map((armorFamily) => (
                      <option key={armorFamily} value={armorFamily}>
                        {armorFamily === "all"
                          ? "All"
                          : ARMOR_FAMILY_LABELS[armorFamily]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Armor part</span>
                  <select
                    value={armorPartFilter}
                    onChange={(event) =>
                      setArmorPartFilter(
                        event.currentTarget.value as CraftingArmorPartFilter,
                      )
                    }
                  >
                    {armorPartFilterOptions.map((armorPart) => (
                      <option key={armorPart} value={armorPart}>
                        {armorPart === "all"
                          ? "All"
                          : EQUIPMENT_SLOT_LABELS[armorPart]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label>
              <span>Status</span>
              <select
                value={craftabilityFilter}
                onChange={(event) =>
                  setCraftabilityFilter(
                    event.currentTarget.value as CraftingCraftabilityFilter,
                  )
                }
              >
                <option value="all">All</option>
                <option value="craftable">Craftable</option>
                <option value="missing">Missing requirements</option>
              </select>
            </label>
            <button
              disabled={!hasActiveFilters}
              onClick={clearFilters}
              type="button"
            >
              Clear Filters
            </button>
          </div>
          <div className="crafting-recipe-count">
            {filteredRecipeStatuses.length}/{recipeStatuses.length} recipes
          </div>
          <div className="crafting-recipe-list" aria-label="Crafting recipes">
            {filteredRecipeStatuses.map((status) => {
              const isSelected = selectedStatus?.recipe.id === status.recipe.id;
              const statusLabel = status.canCraft
                ? "Ready"
                : status.isOutputOwned
                  ? "Owned"
                  : "Missing";

              return (
                <button
                  key={status.recipe.id}
                  className={`crafting-recipe-row${
                    isSelected ? " selected" : ""
                  }${status.canCraft ? " craftable" : ""}`}
                  onClick={() => setSelectedRecipeId(status.recipe.id)}
                  type="button"
                >
                  <span>
                    <strong>{status.outputDisplayName ?? "Unknown Recipe"}</strong>
                    <small>{getRecipeSummary(status)}</small>
                  </span>
                  <b>{statusLabel}</b>
                </button>
              );
            })}
            {filteredRecipeStatuses.length === 0 ? (
              <span className="crafting-empty">No recipes match filters</span>
            ) : null}
          </div>
        </div>
        <div className="crafting-detail" aria-label="Selected recipe">
          {selectedStatus ? (
            <>
              <div className="crafting-output">
                {selectedOutputIconSrc ? (
                  <img alt="" src={selectedOutputIconSrc} />
                ) : (
                  <span className="crafting-output-placeholder" aria-hidden="true" />
                )}
                <div>
                  <span className="crafting-detail-kicker">Output</span>
                  <h3>
                    {selectedStatus.outputDisplayName ?? "Unknown Recipe"}
                  </h3>
                  <p>
                    Quantity x{selectedStatus.recipe.outputQuantity}
                    {selectedStatus.outputKeyItemDefinition
                      ? " - Key Item"
                      : selectedStatus.outputItemDefinition?.stackable
                      ? ""
                      : " - one slot each"}
                  </p>
                  {selectedWeaponClassRequirement ? (
                    <p className="crafting-output-class-requirement">
                      {selectedWeaponClassRequirement}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="crafting-output-details">
                <span className="crafting-detail-kicker">
                  {selectedIsEquipment ? "Stats" : "Description"}
                </span>
                {selectedIsEquipment ? (
                  <div className="crafting-output-stat-list">
                    {selectedEquipmentStats.length > 0 ? (
                      selectedEquipmentStats.map((stat) => (
                        <span key={stat}>{stat}</span>
                      ))
                    ) : (
                      <span>Stats none</span>
                    )}
                  </div>
                ) : (
                  <p>{selectedDescription}</p>
                )}
              </div>
              <dl className="crafting-cost-grid">
                <div>
                  <dt>Crowns</dt>
                  <dd>
                    {selectedStatus.crownBalance}/
                    {selectedStatus.recipe.crownCost}
                  </dd>
                </div>
                <div>
                  <dt>Smithy</dt>
                  <dd>
                    {selectedStatus.isSmithServiceAvailable
                      ? "Available"
                      : "Unavailable"}
                  </dd>
                </div>
              </dl>
              <div className="crafting-requirement-list">
                <span className="crafting-detail-kicker">Materials</span>
                {selectedStatus.requirements.map((requirement) => {
                  return (
                    <div
                      key={`${requirement.kind}:${requirement.displayName}`}
                      className={`crafting-requirement-row${
                        requirement.isMet ? " met" : " missing"
                      }`}
                    >
                      <span>{requirement.displayName}</span>
                      <strong>
                        {requirement.ownedQuantity}/{requirement.quantity}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <button
                className="crafting-action"
                disabled={Boolean(selectedBlockReason)}
                onClick={() => onCraft(selectedStatus.recipe.id)}
                title={
                  selectedBlockReason ||
                  `Craft ${selectedStatus.outputDisplayName}`
                }
                type="button"
              >
                {selectedBlockReason || "Craft"}
              </button>
              {resultMessage ? (
                <p className="crafting-result-message">{resultMessage}</p>
              ) : null}
            </>
          ) : (
            <span className="crafting-empty">No recipes available</span>
          )}
        </div>
      </div>
    </section>
  );
}

function formatStatName(stat: string): string {
  return stat.replace(/[A-Z]/g, (letter) => ` ${letter}`).toLowerCase();
}

function formatModifier(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}
