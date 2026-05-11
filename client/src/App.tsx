import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import "./App.css";
import SpriteAnimation from "./SpriteAnimation";

import {
  addEntity,
  CLASS_DEFINITIONS,
  companionIds,
  companionStartPositions,
  createCompanion,
  createDebugMap,
  createEmptyPartyInventory,
  createInitialQuestStates,
  createNpc,
  DEBUG_MAP_COLUMNS,
  DEBUG_MAP_ROWS,
  clearDebugTelemetry,
  debugAddCompanionToParty,
  debugAddTestWoodToInventory,
  debugRefreshResources,
  debugRandomizeLocations,
  debugRemoveCompanionFromParty,
  debugResurrectEnemy,
  debugRestorePartyHealth,
  enemyIds,
  exportDebugTelemetryReport,
  getCharacterXpProgress,
  getItemDefinition,
  hubCompanionStartPositions,
  hubNpcStartData,
  HUB_MAP_ID,
  ITEM_DEFINITIONS,
  QUEST_DEFINITIONS,
  QUEST_GIVER_POI_ID,
  QUEST_ORDER,
  issueCompanionCommands,
  isCombatEntity,
  resourceIds,
  setAutoModeEnabled,
  getUsedInventorySlots,
  setLeaderIntent,
  setPartyMemberRole,
  startGameLoop,
  startDebugTelemetryRecording,
  stopDebugTelemetryRecording,
  triggerMapTeleport,
  updateEntity,
  type Companion,
  type CombatEntity,
  type DebugTeleportPoint,
  type Enemy,
  type GameEntity,
  type GameState,
  type ItemCategory,
  type ItemId,
  type NpcEntity,
  type PartyMemberRole,
  type PartyInventory,
  type Position,
  type QuestId,
  type QuestObjectiveDefinition,
  type QuestState,
  type ResourceEntity,
} from "./game";
import {
  getEntityVisualAsset,
  getEntityVisualClassName,
  getSpriteAnimation,
  mapTileVisualAssets,
  type SpriteDirection,
} from "./visualAssets";

const partyMemberRoleOptions: PartyMemberRole[] = [
  "none",
  "defender",
  "fighter",
  "support",
  "gatherer",
];
const debugMap = createDebugMap();
const cellSize = 36;
const visualMovementGraceMs = 180;
const visualMovementReachedDistance = 1;

type EntityVisualMovement = {
  direction: SpriteDirection;
  expiresAt: number;
};

type GameMenuTab = "party" | "partyManagement" | "inventory" | "quests";

type PartyManagementSection =
  | "role"
  | "equipment"
  | "stats"
  | "partyOrder"
  | "formation"
  | "skillPreferences"
  | "behaviorSettings";

type PartyShortcutTarget = Extract<
  PartyManagementSection,
  "stats" | "role" | "equipment"
>;

const partyMemberRoleLabels: Record<PartyMemberRole, string> = {
  defender: "Defender",
  fighter: "Fighter",
  support: "Support",
  gatherer: "Gatherer",
  none: "None / Unassigned",
};

const partyManagementSectionLabels: Record<PartyManagementSection, string> = {
  role: "Role Select",
  equipment: "Equipment",
  stats: "Full Stats",
  partyOrder: "Party Order",
  formation: "Formation",
  skillPreferences: "Skill Preferences",
  behaviorSettings: "Behavior Settings",
};

const partyManagementSections: PartyManagementSection[] = [
  "role",
  "equipment",
  "stats",
  "partyOrder",
  "formation",
  "skillPreferences",
  "behaviorSettings",
];

function formatResourceName(resourceType: ResourceEntity["resourceType"]): string {
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
}

function formatTargetId(entity: CombatEntity): string {
  return entity.currentTargetId ?? "none";
}

function getResourceTooltip(resource: ResourceEntity): string {
  return [
    formatResourceName(resource.resourceType),
    `Durability ${resource.durability}/${resource.maxDurability}`,
    `Resources left ${resource.quantity}`,
  ].join("\n");
}

function getEnemyTooltip(enemy: Enemy): string {
  return [
    "Enemy",
    `Level ${enemy.level}`,
    `XP ${enemy.xpReward ?? "auto"}`,
    `HP ${enemy.health}/${enemy.maxHealth}`,
    `State ${enemy.state}`,
    `Target ${formatTargetId(enemy)}`,
    `Aggression ${enemy.aggressionMode}`,
  ].join("\n");
}

function getCharacterXpText(member: Companion): string {
  const progress = getCharacterXpProgress(member);

  if (progress.isMaxLevel) {
    return "MAX";
  }

  return `${progress.xp}/${progress.xpToNextLevel} XP`;
}

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

function InventoryPanel({ inventory }: { inventory: PartyInventory }) {
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

function formatCategoryLabel(category: ItemCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatQuestStatus(status: QuestState["status"]): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDisplayQuest(quests: GameState["quests"]): QuestState | null {
  for (const questId of QUEST_ORDER) {
    const quest = quests[questId];

    if (
      quest.status === "active" ||
      quest.status === "ready_to_turn_in" ||
      quest.status === "available"
    ) {
      return quest;
    }
  }

  return null;
}

function getQuestLogQuests(quests: GameState["quests"]): QuestState[] {
  return QUEST_ORDER
    .map((questId) => quests[questId])
    .filter(
      (quest): quest is QuestState =>
        quest.status === "available" ||
        quest.status === "active" ||
        quest.status === "ready_to_turn_in",
    );
}

function getQuestProgressTotals(quest: QuestState): {
  currentCount: number;
  requiredCount: number;
} {
  const definition = QUEST_DEFINITIONS[quest.questId];

  return definition.objectives.reduce(
    (totals, objective) => {
      const progress = quest.objectiveProgress[objective.id];
      const requiredCount = objective.requiredCount ?? 1;

      return {
        currentCount: totals.currentCount + (progress?.currentCount ?? 0),
        requiredCount: totals.requiredCount + requiredCount,
      };
    },
    { currentCount: 0, requiredCount: 0 },
  );
}

function getQuestObjectiveText(quest: QuestState | null): string {
  if (!quest) {
    return "none";
  }

  const definition = QUEST_DEFINITIONS[quest.questId];

  return definition.objectives
    .map((objective) => getObjectiveProgressText(quest, objective))
    .join(" | ");
}

function getObjectiveProgressText(
  quest: QuestState,
  objective: QuestObjectiveDefinition,
): string {
  const progress = quest.objectiveProgress[objective.id];
  const requiredCount = objective.requiredCount ?? 1;

  return `${getObjectiveLabel(objective, requiredCount)} ${progress.currentCount}/${requiredCount}`;
}

function getObjectiveLabel(
  objective: QuestObjectiveDefinition,
  requiredCount = objective.requiredCount ?? 1,
): string {
  if (objective.type === "defeat_enemy_count") {
    return `Kill ${requiredCount} Enemies`;
  }

  if (objective.type === "gather_item_count") {
    return `Gather ${requiredCount} ${formatQuestResourceName(
      objective.resourceType,
    )}`;
  }

  if (objective.type === "reach_poi") {
    return `Explore ${formatQuestMapName(objective.targetMapId)}`;
  }

  if (objective.type === "return_to_poi") {
    return "Return to Quest Giver";
  }

  if (objective.type === "talk_to_poi") {
    return "Talk to Quest Giver";
  }

  return objective.type;
}

function formatQuestResourceName(
  resourceType: ResourceEntity["resourceType"] | undefined,
): string {
  return resourceType ? formatResourceName(resourceType) : "Resource";
}

function formatQuestMapName(mapId: QuestObjectiveDefinition["targetMapId"]): string {
  if (mapId === "hub") {
    return "Harbor Union Bastion";
  }

  if (mapId === "map-1") {
    return "First Wild Map";
  }

  if (mapId === "map-2") {
    return "Second Wild Map";
  }

  return "Region";
}

function QuestTrackerPanel({ quest }: { quest: QuestState | null }) {
  if (!quest || quest.status === "completed" || quest.status === "locked") {
    return null;
  }

  const definition = QUEST_DEFINITIONS[quest.questId];

  return (
    <section className="quest-tracker-panel" aria-label="Current quests">
      <div className="quest-tracker-header">
        <span>Current Quest</span>
        <span>{formatQuestStatus(quest.status)}</span>
      </div>
      <strong>{definition.displayName}</strong>
      <div className="quest-tracker-objectives">
        {definition.objectives.map((objective) => {
          const progress = quest.objectiveProgress[objective.id];
          const requiredCount = objective.requiredCount ?? 1;

          return (
            <div key={objective.id} className="quest-tracker-objective">
              <span>{getObjectiveLabel(objective, requiredCount)}</span>
              <span>
                {progress?.currentCount ?? 0}/{requiredCount}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuestsPanel({
  quests,
  selectedQuestId,
  onSelectQuest,
}: {
  quests: GameState["quests"];
  selectedQuestId: QuestId | null;
  onSelectQuest: (questId: QuestId) => void;
}) {
  const visibleQuests = getQuestLogQuests(quests);
  const selectedQuest =
    visibleQuests.find((quest) => quest.questId === selectedQuestId) ??
    visibleQuests[0] ??
    null;

  return (
    <section className="quests-panel" aria-label="Quests">
      <h2>Quests</h2>
      {visibleQuests.length > 0 ? (
        <div className="menu-split-layout">
          <div className="quest-list">
            {visibleQuests.map((quest) => {
              const definition = QUEST_DEFINITIONS[quest.questId];
              const progressTotals = getQuestProgressTotals(quest);

              return (
                <button
                  key={quest.questId}
                  className={`quest-list-item${
                    selectedQuest?.questId === quest.questId ? " selected" : ""
                  }`}
                  onClick={() => onSelectQuest(quest.questId)}
                  type="button"
                >
                  <span>{definition.displayName}</span>
                  <span>
                    {progressTotals.currentCount}/{progressTotals.requiredCount}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedQuest ? <QuestDetailPanel quest={selectedQuest} /> : null}
        </div>
      ) : (
        <div className="placeholder-box">No current quests.</div>
      )}
    </section>
  );
}

function QuestDetailPanel({ quest }: { quest: QuestState }) {
  const definition = QUEST_DEFINITIONS[quest.questId];

  return (
    <div className="quest-detail-panel">
      <div className="menu-section-heading">
        <span>{definition.displayName}</span>
        <span>{formatQuestStatus(quest.status)}</span>
      </div>
      <div className="quest-objective-list">
        {definition.objectives.map((objective) => {
          const progress = quest.objectiveProgress[objective.id];
          const requiredCount = objective.requiredCount ?? 1;

          return (
            <div
              key={objective.id}
              className={`quest-objective-row${
                progress?.completed ? " completed" : ""
              }`}
            >
              <span>{getObjectiveLabel(objective, requiredCount)}</span>
              <strong>
                {progress?.currentCount ?? 0}/{requiredCount}
              </strong>
            </div>
          );
        })}
      </div>
      <div className="placeholder-box">
        Quest details and rewards are placeholder UI for now.
      </div>
    </div>
  );
}

function getCompanionLabel(member: Companion): string {
  const companionNumber = companionIds.indexOf(member.id) + 1;

  return companionNumber > 0 ? `C${companionNumber}` : member.id;
}

function getOrderedMenuMembers(members: Companion[]): Companion[] {
  return [...members].sort(
    (a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id),
  );
}

function getRoleAccentClass(role: PartyMemberRole): string {
  return `role-accent-${role}`;
}

function PartyMenuPanel({
  members,
  selectedCompanionId,
  onSelectCompanion,
  onShortcut,
}: {
  members: Companion[];
  selectedCompanionId: string | null;
  onSelectCompanion: (companionId: string) => void;
  onShortcut: (companionId: string, target: PartyShortcutTarget) => void;
}) {
  const orderedMembers = getOrderedMenuMembers(members);
  const selectedMember =
    orderedMembers.find((member) => member.id === selectedCompanionId) ?? null;

  return (
    <section className="party-menu-panel" aria-label="Party">
      <h2>Party</h2>
      <div className="menu-split-layout">
        <CompanionMenuList
          members={orderedMembers}
          selectedCompanionId={selectedCompanionId}
          onSelectCompanion={onSelectCompanion}
        />
        <div className="party-selected-summary">
          {selectedMember ? (
            <>
              <div className="menu-section-heading">
                <span>{getCompanionLabel(selectedMember)} Overview</span>
                <span
                  className={`role-pill ${getRoleAccentClass(
                    selectedMember.role,
                  )}`}
                >
                  {partyMemberRoleLabels[selectedMember.role]}
                </span>
              </div>
              <dl className="compact-stat-grid">
                <div>
                  <dt>HP</dt>
                  <dd>
                    {selectedMember.health}/{selectedMember.maxHealth}
                  </dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{selectedMember.characterLevel}</dd>
                </div>
                <div>
                  <dt>Class</dt>
                  <dd>{CLASS_DEFINITIONS[selectedMember.classId].displayName}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>{selectedMember.state}</dd>
                </div>
              </dl>
              <div className="placeholder-box">
                Equipment preview unavailable. Equipment slots are not implemented
                yet.
              </div>
              <div className="party-shortcut-actions">
                <button
                  onClick={() => onShortcut(selectedMember.id, "stats")}
                  type="button"
                >
                  View Full Stats
                </button>
                <button
                  onClick={() => onShortcut(selectedMember.id, "role")}
                  type="button"
                >
                  Change Role
                </button>
                <button
                  onClick={() => onShortcut(selectedMember.id, "equipment")}
                  type="button"
                >
                  Manage Equipment
                </button>
              </div>
            </>
          ) : (
            <span className="party-menu-empty">Select a companion</span>
          )}
        </div>
      </div>
    </section>
  );
}

function CompanionMenuList({
  members,
  selectedCompanionId,
  onSelectCompanion,
}: {
  members: Companion[];
  selectedCompanionId: string | null;
  onSelectCompanion: (companionId: string) => void;
}) {
  return (
    <div className="party-companion-list">
        {members.length > 0
          ? members.map((member) => {
              const characterXpProgress = getCharacterXpProgress(member);
              const isSelected = member.id === selectedCompanionId;
              const xpToNextLevelText = characterXpProgress.isMaxLevel ||
                characterXpProgress.xpToNextLevel === null
                ? "Max level"
                : `${characterXpProgress.xpToNextLevel - characterXpProgress.xp} XP to next level`;

              return (
                <div key={member.id} className="party-companion-list-item">
                  <button
                    className={`party-companion-card${
                      isSelected ? " selected" : ""
                    }`}
                    onClick={() => onSelectCompanion(member.id)}
                    type="button"
                  >
                    <span className="party-companion-card-header">
                      <strong>{getCompanionLabel(member)}</strong>
                      <span
                        className={`role-dot ${getRoleAccentClass(member.role)}`}
                        title={partyMemberRoleLabels[member.role]}
                      />
                    </span>
                    <span className="party-companion-card-detail">
                      Level {member.characterLevel} |{" "}
                      {partyMemberRoleLabels[member.role]}
                    </span>
                    <span
                      className={`party-menu-xp-bar${
                        characterXpProgress.isMaxLevel ? " xp-bar-max" : ""
                      }`}
                      title={`Character XP ${getCharacterXpText(member)}`}
                    >
                      <span style={{ width: `${characterXpProgress.percent}%` }} />
                    </span>
                    <span className="party-companion-xp-text">
                      {xpToNextLevelText}
                    </span>
                  </button>
                </div>
              );
            })
          : <span className="party-menu-empty">No companions in party</span>}
      </div>
  );
}

function PartyManagementPanel({
  activeSection,
  leaderId,
  members,
  selectedCompanionId,
  onChangeRole,
  onSelectCompanion,
  onSelectSection,
}: {
  activeSection: PartyManagementSection;
  leaderId: string;
  members: Companion[];
  selectedCompanionId: string | null;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectSection: (section: PartyManagementSection) => void;
}) {
  const orderedMembers = getOrderedMenuMembers(members);
  const selectedMember =
    orderedMembers.find((member) => member.id === selectedCompanionId) ?? null;

  return (
    <section className="party-management-panel" aria-label="Party Management">
      <h2>Party Management</h2>
      <div className="menu-split-layout">
        <CompanionMenuList
          members={orderedMembers}
          selectedCompanionId={selectedCompanionId}
          onSelectCompanion={onSelectCompanion}
        />
        <div className="party-management-detail">
          {selectedMember ? (
            <>
              <div className="menu-section-heading">
                <span>
                  {getCompanionLabel(selectedMember)} |{" "}
                  {partyMemberRoleLabels[selectedMember.role]}
                </span>
                <span>{selectedMember.id}</span>
              </div>
              <nav
                className="party-management-sections"
                aria-label="Party management sections"
              >
                {partyManagementSections.map((section) => (
                  <button
                    key={section}
                    className={activeSection === section ? "active" : ""}
                    onClick={() => onSelectSection(section)}
                    type="button"
                  >
                    {partyManagementSectionLabels[section]}
                  </button>
                ))}
              </nav>
              <PartyManagementSectionPanel
                activeSection={activeSection}
                leaderId={leaderId}
                member={selectedMember}
                onChangeRole={onChangeRole}
              />
            </>
          ) : (
            <span className="party-menu-empty">No companion selected</span>
          )}
        </div>
      </div>
    </section>
  );
}

function PartyManagementSectionPanel({
  activeSection,
  leaderId,
  member,
  onChangeRole,
}: {
  activeSection: PartyManagementSection;
  leaderId: string;
  member: Companion;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
}) {
  if (activeSection === "role") {
    return <RoleSelectSection member={member} onChangeRole={onChangeRole} />;
  }

  if (activeSection === "equipment") {
    return (
      <PlaceholderSection title="Equipment">
        Equipment system not implemented yet. This section is reserved for
        future equipment management.
      </PlaceholderSection>
    );
  }

  if (activeSection === "stats") {
    return <FullStatsSection leaderId={leaderId} member={member} />;
  }

  return (
    <PlaceholderSection title={partyManagementSectionLabels[activeSection]}>
      {partyManagementSectionLabels[activeSection]} is a future-facing
      placeholder and does not change party behavior yet.
    </PlaceholderSection>
  );
}

function RoleSelectSection({
  member,
  onChangeRole,
}: {
  member: Companion;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
}) {
  return (
    <section className="management-section-card" aria-label="Role Select">
      <h3>Role Select</h3>
      <div className="role-select-grid">
        {partyMemberRoleOptions.map((role) => (
          <button
            key={role}
            className={`role-select-button ${getRoleAccentClass(role)}${
              member.role === role ? " active" : ""
            }`}
            onClick={() => onChangeRole(member.id, role)}
            type="button"
          >
            <span className={`role-dot ${getRoleAccentClass(role)}`} />
            {partyMemberRoleLabels[role]}
          </button>
        ))}
      </div>
    </section>
  );
}

function FullStatsSection({
  leaderId,
  member,
}: {
  leaderId: string;
  member: Companion;
}) {
  return (
    <section className="management-section-card" aria-label="Full Stats">
      <h3>Full Stats</h3>
      <dl className="full-stat-grid">
        <div>
          <dt>HP</dt>
          <dd>
            {member.health}/{member.maxHealth}
          </dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{member.characterLevel}</dd>
        </div>
        <div>
          <dt>XP</dt>
          <dd>{getCharacterXpText(member)}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd>{CLASS_DEFINITIONS[member.classId].displayName}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{partyMemberRoleLabels[member.role]}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{member.state}</dd>
        </div>
        <div>
          <dt>Command</dt>
          <dd>{member.commandPriority}</dd>
        </div>
        <div>
          <dt>Gather Speed</dt>
          <dd>{member.gatherSpeed}</dd>
        </div>
        <div>
          <dt>Party Order</dt>
          <dd>{member.partyOrder}</dd>
        </div>
        <div>
          <dt>Leader</dt>
          <dd>{leaderId === member.id ? "yes" : "no"}</dd>
        </div>
      </dl>
    </section>
  );
}

function PlaceholderSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="management-section-card" aria-label={title}>
      <h3>{title}</h3>
      <div className="placeholder-box">{children}</div>
    </section>
  );
}

function GameMenu({
  activeTab,
  activeManagementSection,
  inventory,
  isOpen,
  leaderId,
  members,
  quests,
  selectedCompanionId,
  selectedQuestId,
  onChangeRole,
  onSelectCompanion,
  onSelectManagementSection,
  onSelectQuest,
  onShortcut,
  onSelectTab,
  onToggle,
}: {
  activeTab: GameMenuTab | null;
  activeManagementSection: PartyManagementSection;
  inventory: PartyInventory;
  isOpen: boolean;
  leaderId: string;
  members: Companion[];
  quests: GameState["quests"];
  selectedCompanionId: string | null;
  selectedQuestId: QuestId | null;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectManagementSection: (section: PartyManagementSection) => void;
  onSelectQuest: (questId: QuestId) => void;
  onShortcut: (companionId: string, target: PartyShortcutTarget) => void;
  onSelectTab: (tab: GameMenuTab | null) => void;
  onToggle: () => void;
}) {
  return (
    <>
      <button className="game-menu-toggle-button" onClick={onToggle} type="button">
        {isOpen ? "Close Menu" : "Menu"}
      </button>
      {isOpen ? (
        <aside className="game-menu-panel" aria-label="Game menu">
          <nav className="game-menu-tabs" aria-label="Menu sections">
            <button
              className={activeTab === "party" ? "active" : ""}
              onClick={() => onSelectTab("party")}
              type="button"
            >
              Party
            </button>
            <button
              className={activeTab === "partyManagement" ? "active" : ""}
              onClick={() => onSelectTab("partyManagement")}
              type="button"
            >
              Party Management
            </button>
            <button
              className={activeTab === "inventory" ? "active" : ""}
              onClick={() => onSelectTab("inventory")}
              type="button"
            >
              Inventory
            </button>
            <button
              className={activeTab === "quests" ? "active" : ""}
              onClick={() => onSelectTab("quests")}
              type="button"
            >
              Quests
            </button>
          </nav>
          {activeTab ? (
            <div className="game-menu-content">
              {activeTab === "party" ? (
                <PartyMenuPanel
                  members={members}
                  selectedCompanionId={selectedCompanionId}
                  onSelectCompanion={onSelectCompanion}
                  onShortcut={onShortcut}
                />
              ) : activeTab === "partyManagement" ? (
                <PartyManagementPanel
                  activeSection={activeManagementSection}
                  leaderId={leaderId}
                  members={members}
                  selectedCompanionId={selectedCompanionId}
                  onChangeRole={onChangeRole}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectManagementSection}
                />
              ) : activeTab === "inventory" ? (
                <InventoryPanel inventory={inventory} />
              ) : (
                <QuestsPanel
                  quests={quests}
                  selectedQuestId={selectedQuestId}
                  onSelectQuest={onSelectQuest}
                />
              )}
            </div>
          ) : null}
        </aside>
      ) : null}
    </>
  );
}

function CompanionVitalsPanel({ members }: { members: Companion[] }) {
  if (members.length === 0) {
    return null;
  }

  const orderedMembers = [...members].sort(
    (a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id),
  );

  return (
    <section className="companion-vitals-panel" aria-label="Companion vitals">
      {orderedMembers.map((member) => {
        const healthPercent =
          member.maxHealth > 0
            ? Math.max(0, Math.min(100, (member.health / member.maxHealth) * 100))
            : 0;
        const characterXpProgress = getCharacterXpProgress(member);
        const companionNumber = companionIds.indexOf(member.id) + 1;

        return (
          <div key={member.id} className="companion-vitals-row">
            <div className="companion-vitals-header">
              <span>C{companionNumber}</span>
              <span>
                {member.health}/{member.maxHealth} HP
              </span>
            </div>
            <span
              className="companion-vitals-bar companion-vitals-hp"
              title={`HP ${member.health}/${member.maxHealth}`}
            >
              <span style={{ width: `${healthPercent}%` }} />
            </span>
            <span
              className={`companion-vitals-bar companion-vitals-xp${
                characterXpProgress.isMaxLevel ? " companion-vitals-xp-max" : ""
              }`}
              title={`Character XP ${getCharacterXpText(member)}`}
            >
              <span style={{ width: `${characterXpProgress.percent}%` }} />
            </span>
          </div>
        );
      })}
    </section>
  );
}

function getPartyMarkerClass(member: Companion, leaderId: string): string {
  if (member.id === leaderId) {
    return "entity-marker companion leader";
  }

  const classPath = CLASS_DEFINITIONS[member.classId].path;
  const classPathClass = classPath ? ` class-path-${classPath}` : "";

  return `entity-marker companion${classPathClass}`;
}

function isSamePosition(first: Position, second: Position): boolean {
  return first.x === second.x && first.y === second.y;
}

function getMovementDirection(
  previousPosition: Position,
  currentPosition: Position,
): SpriteDirection {
  const xDelta = currentPosition.x - previousPosition.x;
  const yDelta = currentPosition.y - previousPosition.y;

  if (Math.abs(xDelta) >= Math.abs(yDelta)) {
    return xDelta >= 0 ? "east" : "west";
  }

  return yDelta >= 0 ? "south" : "north";
}

function getPositionDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function createInitialState(): GameState {
  const leader: Companion = {
    ...createCompanion(
      companionIds[0],
      hubCompanionStartPositions[0],
      companionIds[0],
      "fighter",
      0,
    ),
    state: "idle",
    currentTargetId: null,
  };
  const secondCompanion: Companion = {
    ...createCompanion(
      companionIds[1],
      hubCompanionStartPositions[1],
      companionIds[0],
      "defender",
      1,
    ),
    state: "idle",
    currentTargetId: null,
  };
  const npcs = hubNpcStartData.map((npc) =>
    createNpc(npc.id, npc.position, npc.displayName, npc.npcRole),
  );

  return [leader, secondCompanion, ...npcs].reduce(addEntity, {
    entities: {},
    inventory: createEmptyPartyInventory(),
    map: debugMap,
    currentMapId: HUB_MAP_ID,
    activeTeleport: null,
    autoModeEnabled: false,
    simulationTick: 0,
    partyLeaderId: leader.id,
    leaderIntent: null,
    quests: createInitialQuestStates(),
    globalPoiIntent: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
    exploredTiles: {
      [`${leader.position.x},${leader.position.y}`]: true,
    },
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    skillMarksByEnemyId: {},
    skillSelfBuffsByCompanionId: {},
    skillBindsByEnemyId: {},
    skillShieldBlocksById: {},
    skillCooldownsByCompanionId: {},
    skillVisualEvents: [],
  });
}

function EntityDebugLabel({
  name,
  entity,
  detail,
  isVisible,
}: {
  name: string;
  entity: GameEntity;
  detail?: string;
  isVisible: boolean;
}) {
  const targetId = "currentTargetId" in entity ? entity.currentTargetId : null;

  if (!isVisible) {
    return null;
  }

  return (
    <span className="entity-label">
      {name}
      {detail ? ` ${detail}` : ""}
      <br />
      State {entity.state}
      <br />
      Target {targetId ?? "none"}
    </span>
  );
}

type HealthBarEntity = GameEntity & {
  health: number;
  maxHealth: number;
};

function hasHealthBar(entity: GameEntity): entity is HealthBarEntity {
  return "health" in entity && "maxHealth" in entity;
}

function HealthBar({ entity }: { entity: HealthBarEntity }) {
  const healthPercent =
    entity.maxHealth > 0
      ? Math.max(0, Math.min(100, (entity.health / entity.maxHealth) * 100))
      : 0;

  return (
    <span
      className="health-bar"
      title={`HP ${entity.health}/${entity.maxHealth}`}
    >
      <span style={{ width: `${healthPercent}%` }} />
    </span>
  );
}

function AttackCooldownIndicator({
  entity,
  currentTime,
}: {
  entity: CombatEntity;
  currentTime: number;
}) {
  const cooldownProgress = Math.max(
    0,
    1 - (currentTime - entity.lastAttackAt) / 1000,
  );

  if (cooldownProgress <= 0 || entity.state === "dead") {
    return null;
  }

  return (
    <span className="attack-cooldown">
      <span style={{ width: `${cooldownProgress * 100}%` }} />
    </span>
  );
}

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [showEntityInfo, setShowEntityInfo] = useState(true);
  const [showDebugTools, setShowDebugTools] = useState(true);
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [activeGameMenuTab, setActiveGameMenuTab] =
    useState<GameMenuTab | null>(null);
  const [activePartyManagementSection, setActivePartyManagementSection] =
    useState<PartyManagementSection>("role");
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(
    null,
  );
  const [selectedQuestId, setSelectedQuestId] = useState<QuestId | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [
    visualMovementByEntityId,
    setVisualMovementByEntityId,
  ] = useState<Record<string, EntityVisualMovement>>({});
  const stopLoopRef = useRef<(() => void) | null>(null);
  const latestAnimatedEntityPositionsRef = useRef<Record<string, Position>>({});
  const previousAnimatedEntityPositionsRef = useRef<Record<string, Position>>({});
  const currentMap = gameState.map ?? debugMap;

  const partyMembers = companionIds
    .map((id) => gameState.entities[id] as Companion | undefined)
    .filter((companion): companion is Companion => Boolean(companion));
  const selectedMenuCompanionId = partyMembers.some(
    (member) => member.id === selectedCompanionId,
  )
    ? selectedCompanionId
    : partyMembers[0]?.id ?? null;
  const activePartyMemberIds = partyMembers.map((companion) => companion.id);
  const leader = partyMembers.find(
    (member) => member.id === gameState.partyLeaderId,
  ) ?? partyMembers[0];
  const enemies = enemyIds
    .map((id) => gameState.entities[id] as Enemy | undefined)
    .filter((enemy): enemy is Enemy => Boolean(enemy));
  const resources = resourceIds
    .map((id) => gameState.entities[id] as ResourceEntity | undefined)
    .filter((resource): resource is ResourceEntity => Boolean(resource));
  const npcs = Object.values(gameState.entities).filter(
    (entity): entity is NpcEntity => entity.kind === "npc",
  );
  const displayQuest = getDisplayQuest(gameState.quests);
  const activeQuestIds = getQuestLogQuests(gameState.quests).map(
    (quest) => quest.questId,
  );
  const selectedMenuQuestId =
    selectedQuestId && activeQuestIds.includes(selectedQuestId)
      ? selectedQuestId
      : activeQuestIds[0] ?? null;
  const questGiverHasWork = QUEST_ORDER.some((questId) => {
    const status = gameState.quests[questId]?.status;
    return status === "available" || status === "ready_to_turn_in";
  });
  const targetEnemy = enemies.find((enemy) => enemy.state !== "dead");
  const targetResource = resources.find((resource) => !resource.isDepleted);
  const poiTarget = gameState.leaderIntent?.targetId
    ? gameState.entities[gameState.leaderIntent.targetId]
    : null;
  const enemyPoiPosition =
    poiTarget?.kind === "enemy" && poiTarget.state !== "dead"
      ? poiTarget.position
      : null;
  const gathererTargetResourceIds = new Set(
    partyMembers
      .filter(
        (entity) =>
          entity.role === "gatherer" &&
          entity.state === "gather" &&
          Boolean(entity.currentTargetId),
      )
      .map((entity) => entity.currentTargetId),
  );
  const inventory = gameState.inventory;
  const activeTeleport = gameState.activeTeleport;
  const teleports = currentMap.teleports;
  const movePoiPosition =
    gameState.leaderIntent?.type === "move" &&
    gameState.leaderIntent.targetPosition &&
    !isTeleportPosition(gameState.leaderIntent.targetPosition)
      ? gameState.leaderIntent.targetPosition
      : null;
  const activeSkillVisualEvents = (gameState.skillVisualEvents ?? []).filter(
    (event) => event.expiresAt > currentTime,
  );
  const redFlashEntityIds = new Set(
    activeSkillVisualEvents
      .filter((event) => event.type === "red_flash")
      .map((event) => event.sourceId),
  );
  const healedEntityIds = new Set(
    activeSkillVisualEvents
      .filter((event) => event.type === "heal" && event.targetId)
      .map((event) => event.targetId),
  );
  const projectileVisuals = activeSkillVisualEvents.filter(
    (event) => event.type === "projectile" || event.type === "heal",
  );
  const slashVisuals = activeSkillVisualEvents.filter(
    (event) => event.type === "slash",
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const latestPositions = latestAnimatedEntityPositionsRef.current;
      const previousPositions = previousAnimatedEntityPositionsRef.current;
      const movedEntityIds = Object.keys(latestPositions).filter(
        (entityId) =>
          previousPositions[entityId] &&
          !isSamePosition(
            previousPositions[entityId],
            latestPositions[entityId],
          ),
      );

      setCurrentTime(now);

      if (movedEntityIds.length > 0) {
        setVisualMovementByEntityId((currentVisualMovement) => {
          const nextVisualMovement = { ...currentVisualMovement };

          for (const entityId of movedEntityIds) {
            nextVisualMovement[entityId] = {
              direction: getMovementDirection(
                previousPositions[entityId],
                latestPositions[entityId],
              ),
              expiresAt: now + visualMovementGraceMs,
            };
          }

          return nextVisualMovement;
        });
      }

      previousAnimatedEntityPositionsRef.current = { ...latestPositions };
    }, 100);

    return () => {
      window.clearInterval(intervalId);
      stopLoopRef.current?.();
    };
  }, []);

  useEffect(() => {
    latestAnimatedEntityPositionsRef.current = [...partyMembers, ...enemies]
      .filter((entity) => entity.state !== "dead")
      .reduce<Record<string, Position>>((positionsById, entity) => {
        positionsById[entity.id] = entity.position;
        return positionsById;
      }, {});
  }, [enemies, partyMembers]);

  function toggleSimulationLoop() {
    if (stopLoopRef.current) {
      stopLoopRef.current();
      stopLoopRef.current = null;
      setIsSimulationRunning(false);
      return;
    }

    stopLoopRef.current = startGameLoop(setGameState);
    setIsSimulationRunning(true);
  }

  function toggleAutoMode() {
    setGameState((state) =>
      setAutoModeEnabled(state, !state.autoModeEnabled),
    );
  }

  function changePartyMemberRole(
    entityId: string,
    role: PartyMemberRole,
  ) {
    setGameState((state) => setPartyMemberRole(state, entityId, role));
  }

  function commandCompanionsToFollow() {
    if (!leader || activePartyMemberIds.length === 0) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(
        state,
        activePartyMemberIds.filter(
          (entityId) => entityId !== state.partyLeaderId,
        ),
        {
          type: "follow",
          targetId: state.partyLeaderId,
        },
      ),
    );
  }

  function commandCompanionsToIdle() {
    if (activePartyMemberIds.length === 0) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(state, activePartyMemberIds, {
        type: "idle",
      }),
    );
  }

  function commandPartyToTargetEnemy(targetEnemyId = targetEnemy?.id) {
    if (!targetEnemyId) {
      return;
    }

    setGameState((state) => {
      const target = state.entities[targetEnemyId];
      const leader = state.entities[state.partyLeaderId];
      const leaderIntentState = setLeaderIntent(state, {
        type: "attack",
        targetId: targetEnemyId,
        targetPosition: target?.position ?? null,
        source: "player",
      });

      return leader?.kind === "companion"
        ? updateEntity(leaderIntentState, {
            ...leader,
            state: "follow",
            currentTargetId: targetEnemyId,
            commandPriority: "autonomous",
          })
        : leaderIntentState;
    });
  }

  function commandCompanionsToGatherResource(targetResourceId = targetResource?.id) {
    if (activePartyMemberIds.length === 0 || !targetResourceId) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(state, activePartyMemberIds, {
        type: "gather",
        targetId: targetResourceId,
      }),
    );
  }

  function addCompanionToParty() {
    const debugCompanionPositions =
      currentMap.id === HUB_MAP_ID
        ? hubCompanionStartPositions
        : companionStartPositions;

    setGameState((state) =>
      debugAddCompanionToParty(
        state,
        companionIds,
        state.partyLeaderId,
        debugCompanionPositions,
      ),
    );
  }

  function removeCompanionFromParty() {
    setGameState((state) => debugRemoveCompanionFromParty(state, companionIds));
  }

  function randomizeLocations() {
    setGameState((state) =>
      debugRandomizeLocations(state, DEBUG_MAP_COLUMNS, DEBUG_MAP_ROWS),
    );
  }

  function resurrectEnemy() {
    setGameState((state) =>
      enemyIds.reduce(debugResurrectEnemy, state),
    );
  }

  function refreshGatherPoints() {
    setGameState(debugRefreshResources);
  }

  function restorePartyHealth() {
    setGameState(debugRestorePartyHealth);
  }

  function addTestWoodToInventory() {
    setGameState(debugAddTestWoodToInventory);
  }

  function toggleEntityInfo() {
    setShowEntityInfo((isVisible) => !isVisible);
  }

  function toggleDebugTools() {
    setShowDebugTools((isVisible) => !isVisible);
  }

  function selectGameMenuTab(tab: GameMenuTab | null) {
    setActiveGameMenuTab(tab);
  }

  function navigatePartyShortcut(
    companionId: string,
    target: PartyShortcutTarget,
  ) {
    setSelectedCompanionId(companionId);
    setActiveGameMenuTab("partyManagement");
    setActivePartyManagementSection(target);
  }

  function toggleGameMenu() {
    setIsGameMenuOpen((isOpen) => {
      const nextIsOpen = !isOpen;

      if (nextIsOpen && !activeGameMenuTab) {
        setActiveGameMenuTab("party");
      }

      return nextIsOpen;
    });
  }

  function commandPartyToMoveToPosition(targetPosition: Position) {
    setGameState((state) => {
      const leader = state.entities[state.partyLeaderId];
      const leaderIntentState = setLeaderIntent(state, {
        type: "move",
        targetId: null,
        targetPosition: { ...targetPosition },
        source: "player",
      });

      return leader?.kind === "companion"
        ? updateEntity(leaderIntentState, {
            ...leader,
            state: "follow",
            currentTargetId: null,
            commandPriority: "autonomous",
          })
        : leaderIntentState;
    });
  }

  function commandPartyToMoveFromFloorClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const targetPosition = {
      x: Math.floor((event.clientX - bounds.left) / cellSize),
      y: Math.floor((event.clientY - bounds.top) / cellSize),
    };

    if (!isValidFloorPosition(targetPosition)) {
      return;
    }

    commandPartyToMoveToPosition(targetPosition);
  }

  function toggleDebugTelemetryRecording() {
    setGameState((state) =>
      state.debugTelemetry?.isRecording
        ? stopDebugTelemetryRecording(state)
        : startDebugTelemetryRecording(state),
    );
  }

  function clearDebugTelemetryReport() {
    setGameState(clearDebugTelemetry);
  }

  function exportDebugTelemetryJson() {
    const report = exportDebugTelemetryReport(gameState);
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `debug-telemetry-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function triggerTeleport(teleportId: string) {
    setGameState((state) => triggerMapTeleport(state, "player", teleportId));
  }

  function isTeleportPoi(teleport: DebugTeleportPoint): boolean {
    return Boolean(
      gameState.leaderIntent?.type === "move" &&
        gameState.leaderIntent.targetPosition &&
        Math.hypot(
          gameState.leaderIntent.targetPosition.x - teleport.position.x,
          gameState.leaderIntent.targetPosition.y - teleport.position.y,
        ) <= 0.001,
    );
  }

  function isTeleportPosition(position: Position): boolean {
    return teleports.some(
      (teleport) =>
        Math.hypot(
          position.x - teleport.position.x,
          position.y - teleport.position.y,
        ) <= 0.001,
    );
  }

  function isValidFloorPosition(position: Position): boolean {
    return (
      position.x >= 0 &&
      position.x < currentMap.columns &&
      position.y >= 0 &&
      position.y < currentMap.rows &&
      !currentMap.walls.some(
        (wall) => wall.x === position.x && wall.y === position.y,
      )
    );
  }

  function getCompanionMovementTarget(member: Companion): Position | null {
    if (member.state === "idle" || member.state === "dead") {
      return null;
    }

    if (member.state === "defend") {
      return member.defendPosition;
    }

    const targetId =
      member.currentTargetId ??
      (member.state === "follow" ? member.followTargetId : null);
    const target = targetId ? gameState.entities[targetId] : null;

    if (target) {
      return target.position;
    }

    return gameState.leaderIntent?.targetPosition ?? null;
  }

  function isCompanionTryingToMove(member: Companion): boolean {
    const targetPosition = getCompanionMovementTarget(member);

    return targetPosition
      ? getPositionDistance(member.position, targetPosition) >
          visualMovementReachedDistance
      : false;
  }

  function getCompanionAnimationDirection(
    member: Companion,
    visualMovement?: EntityVisualMovement,
  ): SpriteDirection | undefined {
    if (visualMovement) {
      return visualMovement.direction;
    }

    const targetPosition = getCompanionMovementTarget(member);

    return targetPosition
      ? getMovementDirection(member.position, targetPosition)
      : undefined;
  }

  function getEnemyMovementTarget(enemy: Enemy): Position | null {
    if (enemy.state === "dead" || !enemy.currentTargetId) {
      return null;
    }

    return gameState.entities[enemy.currentTargetId]?.position ?? null;
  }

  function isEnemyTryingToMove(enemy: Enemy): boolean {
    const targetPosition = getEnemyMovementTarget(enemy);

    return targetPosition
      ? getPositionDistance(enemy.position, targetPosition) >
          visualMovementReachedDistance
      : false;
  }

  function getEnemyAnimationDirection(
    enemy: Enemy,
    visualMovement?: EntityVisualMovement,
  ): SpriteDirection | undefined {
    if (visualMovement) {
      return visualMovement.direction;
    }

    const targetPosition = getEnemyMovementTarget(enemy);

    return targetPosition
      ? getMovementDirection(enemy.position, targetPosition)
      : undefined;
  }

  return (
    <main className="game-page">
      <section className="game-panel">
        <h1>Follow System Test</h1>

        <div
          key={gameState.currentMapId ?? HUB_MAP_ID}
          className={`test-area ${mapTileVisualAssets.floor.className}`}
          aria-label="Follow system top-down test area"
          onClick={commandPartyToMoveFromFloorClick}
        >
          <div className="map-label-overlay">
            <strong>{currentMap.displayName}</strong>
            <span>debug: {currentMap.debugName}</span>
          </div>
          {currentMap.walls.map((wall) => (
            <div
              key={`${wall.x}-${wall.y}`}
              className={`wall-tile ${mapTileVisualAssets.wall.className}`}
              style={{
                transform: `translate(${wall.x * cellSize}px, ${
                  wall.y * cellSize
                }px)`,
              }}
            />
          ))}
          {activeTeleport ? (
            <div
              className="teleport-range"
              style={{
                width: activeTeleport.range * cellSize * 2,
                height: activeTeleport.range * cellSize * 2,
                transform: `translate(${
                  (activeTeleport.position.x - activeTeleport.range) * cellSize
                }px, ${
                  (activeTeleport.position.y - activeTeleport.range) * cellSize
                }px)`,
              }}
              title="Teleport rally range"
            />
          ) : null}
          {teleports.map((teleport) => (
            <div key={teleport.id}>
              {isTeleportPoi(teleport) && !activeTeleport ? (
                <div
                  className="poi-ring teleport-poi"
                  style={{
                    transform: `translate(${teleport.position.x * cellSize}px, ${
                      teleport.position.y * cellSize
                    }px)`,
                  }}
                  title={`${teleport.id} point of interest`}
                />
              ) : null}
              <button
                className="teleporter"
                onClick={(event) => {
                  event.stopPropagation();
                  triggerTeleport(teleport.id);
                }}
                style={{
                  transform: `translate(${teleport.position.x * cellSize}px, ${
                    teleport.position.y * cellSize
                  }px)`,
                }}
                title={`${teleport.id}: ${teleport.sourceMapId} to ${teleport.targetMapId}`}
                type="button"
              />
            </div>
          ))}
          {Object.values(gameState.skillShieldBlocksById ?? {}).map((shield) => (
            <div
              key={shield.id}
              className="skill-shield-block"
              style={{
                transform: `translate(${shield.position.x * cellSize}px, ${
                  shield.position.y * cellSize
                }px) rotate(${shield.rotationRadians}rad)`,
              }}
              title="Guard Wall"
            />
          ))}
          {projectileVisuals.map((event) => {
            const source = gameState.entities[event.sourceId];
            const target = event.targetId
              ? gameState.entities[event.targetId]
              : undefined;

            if (!source || !target) {
              return null;
            }

            const xDistance = target.position.x - source.position.x;
            const yDistance = target.position.y - source.position.y;
            const length = Math.hypot(xDistance, yDistance) * cellSize;
            const angle = Math.atan2(yDistance, xDistance);

            return (
              <div
                key={event.id}
                className={`skill-link ${event.type}`}
                style={{
                  width: length,
                  transform: `translate(${
                    source.position.x * cellSize + cellSize / 2
                  }px, ${
                    source.position.y * cellSize + cellSize / 2
                  }px) rotate(${angle}rad)`,
                }}
              />
            );
          })}
          {slashVisuals.map((event) => {
            const source = gameState.entities[event.sourceId];

            if (!source) {
              return null;
            }

            return (
              <div
                key={event.id}
                className="skill-slash"
                style={{
                  transform: `translate(${source.position.x * cellSize}px, ${
                    source.position.y * cellSize
                  }px)`,
                }}
              />
            );
          })}
          {gameState.combatFeedbackEvents.map((event) => {
            const entity = gameState.entities[event.entityId];

            if (!entity) {
              return null;
            }

            return (
              <div
                key={event.id}
                className={`combat-feedback ${event.type}`}
                style={{
                  transform: `translate(${entity.position.x * cellSize}px, ${
                    entity.position.y * cellSize
                  }px)`,
                }}
              >
                {event.text}
              </div>
            );
          })}
          {partyMembers.map((member, index) =>
            member.state === "idle" ? (
              <div
                key={`idle-${member.id}`}
                className="idle-feedback"
                style={{
                  transform: `translate(${member.position.x * cellSize}px, ${
                    member.position.y * cellSize
                  }px)`,
                }}
                title={`Party member ${index + 1} is idle`}
              >
                AFK
              </div>
            ) : null,
          )}
          {enemyPoiPosition ? (
            <div
              className="poi-ring enemy-poi"
              style={{
                transform: `translate(${enemyPoiPosition.x * cellSize}px, ${
                  enemyPoiPosition.y * cellSize
                }px)`,
              }}
              title="Enemy point of interest"
            />
          ) : null}
          {movePoiPosition ? (
            <div
              className="poi-ring move-poi"
              style={{
                transform: `translate(${movePoiPosition.x * cellSize}px, ${
                  movePoiPosition.y * cellSize
                }px)`,
              }}
              title="Move point of interest"
            />
          ) : null}
          {partyMembers.map((member, index) => {
            const visualAsset = getEntityVisualAsset(member);
            const visualMovement =
              visualMovementByEntityId[member.id];
            const isVisuallyMoving =
              Boolean(visualMovement) && visualMovement.expiresAt > currentTime;
            const shouldRunAnimation =
              isVisuallyMoving || isCompanionTryingToMove(member);
            const animation =
              visualAsset.kind === "sprite"
                ? getSpriteAnimation(
                    visualAsset,
                    shouldRunAnimation,
                    getCompanionAnimationDirection(member, visualMovement),
                  )
                : null;

            return (
              <div
                key={member.id}
                className={`${getPartyMarkerClass(member, gameState.partyLeaderId)}${
                  redFlashEntityIds.has(member.id) ? " skill-red-flash" : ""
                }${healedEntityIds.has(member.id) ? " skill-heal-outline" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  commandPartyToMoveToPosition(member.position);
                }}
                style={{
                  transform: `translate(${member.position.x * cellSize}px, ${
                    member.position.y * cellSize
                  }px)`,
                }}
                title="Move party POI to this party member"
              >
                {animation ? (
                  <SpriteAnimation
                    alt={`Party member ${index + 1}`}
                    animation={animation}
                    className="entity-sprite"
                    currentTime={currentTime}
                  />
                ) : null}
                <span className="map-marker-id">{index + 1}</span>
                <EntityDebugLabel
                  name={`C${index + 1}`}
                  entity={member}
                  detail={`HP ${member.health} GS ${member.gatherSpeed} Role ${member.role}`}
                  isVisible={showEntityInfo}
                />
                <HealthBar entity={member} />
                <AttackCooldownIndicator
                  entity={member}
                  currentTime={currentTime}
                />
              </div>
            );
          })}
          {enemies.map((enemy, index) => {
            if (enemy.state === "dead") {
              return (
              <div
                key={`${gameState.currentMapId ?? HUB_MAP_ID}-${enemy.id}`}
                className="dead-label"
                style={{
                  transform: `translate(${enemy.position.x * cellSize}px, ${
                    enemy.position.y * cellSize
                  }px)`,
                }}
                title={getEnemyTooltip(enemy)}
              >
                {showEntityInfo ? (
                  <>
                    E{index + 1}
                    <br />
                    State {enemy.state}
                    <br />
                    Target {enemy.currentTargetId ?? "none"}
                  </>
                ) : null}
                <HealthBar entity={enemy} />
              </div>
              );
            }

            const visualAsset = getEntityVisualAsset(enemy);
            const visualMovement = visualMovementByEntityId[enemy.id];
            const isVisuallyMoving =
              Boolean(visualMovement) && visualMovement.expiresAt > currentTime;
            const shouldRunAnimation =
              isVisuallyMoving || isEnemyTryingToMove(enemy);
            const animation =
              visualAsset.kind === "sprite"
                ? getSpriteAnimation(
                    visualAsset,
                    shouldRunAnimation,
                    getEnemyAnimationDirection(enemy, visualMovement),
                  )
                : null;

            return (
              <div
                key={`${gameState.currentMapId ?? HUB_MAP_ID}-${enemy.id}`}
                className={`entity-marker ${
                  visualAsset.kind === "sprite"
                    ? "enemy sprite-entity"
                    : getEntityVisualClassName(enemy)
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  commandPartyToTargetEnemy(enemy.id);
                }}
                style={{
                  transform: `translate(${enemy.position.x * cellSize}px, ${
                    enemy.position.y * cellSize
                  }px)`,
                }}
                title={getEnemyTooltip(enemy)}
              >
                {animation ? (
                  <SpriteAnimation
                    alt={`Enemy ${index + 1}`}
                    animation={animation}
                    className="entity-sprite"
                    currentTime={currentTime}
                  />
                ) : null}
                <span className="map-marker-id">{index + 1}</span>
                <EntityDebugLabel
                  name={`E${index + 1}`}
                  entity={enemy}
                  detail={`HP ${enemy.health} Aggro ${enemy.aggressionMode}`}
                  isVisible={showEntityInfo}
                />
                {hasHealthBar(enemy) ? <HealthBar entity={enemy} /> : null}
                {gameState.skillMarksByEnemyId?.[enemy.id] ? (
                  <span className="skill-mark-target" title="Marked target" />
                ) : null}
                {gameState.skillBindsByEnemyId?.[enemy.id] ? (
                  <span className="skill-bind-target" title="Binding Rune" />
                ) : null}
                {isCombatEntity(enemy) ? (
                  <AttackCooldownIndicator
                    entity={enemy}
                    currentTime={currentTime}
                  />
                ) : null}
              </div>
            );
          })}
          {resources.map((resource) =>
            resource.isDepleted ? (
              <div
                key={`${gameState.currentMapId ?? HUB_MAP_ID}-${resource.id}`}
                className="depleted-label"
                style={{
                  transform: `translate(${resource.position.x * cellSize}px, ${
                    resource.position.y * cellSize
                  }px)`,
                }}
                title={getResourceTooltip(resource)}
              >
                {showEntityInfo ? (
                  <>
                    {resource.resourceType}
                    <br />
                    Depleted
                    <br />
                    Quantity {resource.quantity}
                  </>
                ) : null}
              </div>
            ) : (
              <div
                key={`${gameState.currentMapId ?? HUB_MAP_ID}-${resource.id}`}
                className={`entity-marker ${getEntityVisualClassName(resource)}${
                  gathererTargetResourceIds.has(resource.id)
                    ? " gatherer-target"
                    : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  commandCompanionsToGatherResource(resource.id);
                }}
                style={{
                  transform: `translate(${resource.position.x * cellSize}px, ${
                    resource.position.y * cellSize
                  }px)`,
                }}
                title={getResourceTooltip(resource)}
              >
                <EntityDebugLabel
                  name={resource.resourceType}
                  entity={resource}
                  detail={`${resource.durability}/${resource.maxDurability} Qty ${resource.quantity}`}
                  isVisible={showEntityInfo}
                />
              </div>
            ),
          )}
          {npcs.map((npc) => {
            const visualAsset = getEntityVisualAsset(npc);
            const isImageNpc = visualAsset.kind === "image";

            return (
              <div
                key={`${gameState.currentMapId ?? HUB_MAP_ID}-${npc.id}`}
                className={`entity-marker ${
                  isImageNpc ? "npc-image-entity" : getEntityVisualClassName(npc)
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  commandPartyToMoveToPosition(npc.position);
                }}
                style={{
                  transform: `translate(${npc.position.x * cellSize}px, ${
                    npc.position.y * cellSize
                  }px)`,
                }}
                title={`Move party POI to ${npc.displayName}`}
              >
                {isImageNpc ? (
                  <img
                    alt={npc.displayName}
                    className="npc-test-image"
                    src={visualAsset.src}
                  />
                ) : (
                  <span className="map-marker-id">
                    {npc.npcRole === "dog" ? "D" : "N"}
                  </span>
                )}
                {npc.id === QUEST_GIVER_POI_ID && questGiverHasWork ? (
                  <span className="quest-available-indicator" title="Quest available or ready">
                    !
                  </span>
                ) : null}
                <EntityDebugLabel
                  name={npc.displayName}
                  entity={npc}
                  detail="Placeholder"
                  isVisible={showEntityInfo}
                />
              </div>
            );
          })}
        </div>

        <GameMenu
          activeTab={activeGameMenuTab}
          activeManagementSection={activePartyManagementSection}
          inventory={inventory}
          isOpen={isGameMenuOpen}
          leaderId={gameState.partyLeaderId}
          members={partyMembers}
          quests={gameState.quests}
          selectedCompanionId={selectedMenuCompanionId}
          selectedQuestId={selectedMenuQuestId}
          onChangeRole={changePartyMemberRole}
          onSelectCompanion={setSelectedCompanionId}
          onSelectManagementSection={setActivePartyManagementSection}
          onSelectQuest={setSelectedQuestId}
          onSelectTab={selectGameMenuTab}
          onShortcut={navigatePartyShortcut}
          onToggle={toggleGameMenu}
        />
        <CompanionVitalsPanel members={partyMembers} />
        <QuestTrackerPanel quest={displayQuest} />

        <div
          className={`test-controls${
            showDebugTools ? "" : " test-controls-debug-hidden"
          }`}
        >
          <button onClick={toggleSimulationLoop}>
            {isSimulationRunning ? "Stop Simulation" : "Start Simulation"}
          </button>
          <button onClick={toggleAutoMode}>
            Auto Mode {gameState.autoModeEnabled ? "On" : "Off"}
          </button>
          <button onClick={commandCompanionsToFollow}>Follow All</button>
          <button onClick={commandCompanionsToIdle}>Idle All</button>
          <button onClick={() => commandPartyToTargetEnemy()}>
            Target Enemy
          </button>
          <button onClick={() => commandCompanionsToGatherResource()}>
            Gather Resource All
          </button>
        </div>

        <section
          className={`debug-tools${showDebugTools ? "" : " debug-tools-hidden"}`}
          aria-label="Debug tools"
        >
          <h2>Debug Tools</h2>
          <div className="test-controls">
            <button onClick={toggleDebugTools}>
              {showDebugTools ? "Hide Debug UI" : "Show Debug UI"}
            </button>
            {showDebugTools ? (
              <>
                <button onClick={addCompanionToParty}>
                  Add Companion to Party
                </button>
                <button onClick={removeCompanionFromParty}>
                  Remove Companion from Party
                </button>
                <button onClick={randomizeLocations}>
                  Randomize Locations
                </button>
                <button onClick={resurrectEnemy}>Resurrect Enemy</button>
                <button onClick={restorePartyHealth}>Restore Party HP</button>
                <button onClick={refreshGatherPoints}>
                  Refresh Gather Points
                </button>
                <button onClick={addTestWoodToInventory}>Add Test Wood</button>
                <button onClick={toggleEntityInfo}>
                  {showEntityInfo ? "Hide Entity Info" : "Show Entity Info"}
                </button>
                <button onClick={toggleDebugTelemetryRecording}>
                  {gameState.debugTelemetry?.isRecording
                    ? "Stop Debug Recording"
                    : "Start Debug Recording"}
                </button>
                <button onClick={exportDebugTelemetryJson}>
                  Export Debug JSON
                </button>
                <button onClick={clearDebugTelemetryReport}>
                  Clear Debug Report
                </button>
                <span>
                  Debug Recording{" "}
                  {gameState.debugTelemetry?.isRecording ? "On" : "Off"} | Ticks{" "}
                  {gameState.debugTelemetry?.ticks.length ?? 0}/
                  {gameState.debugTelemetry?.maxTicks ?? 1000} | Events{" "}
                  {gameState.debugTelemetry?.events.length ?? 0}
                </span>
                <span>
                  Quest{" "}
                  {displayQuest
                    ? `${QUEST_DEFINITIONS[displayQuest.questId].displayName} (${formatQuestStatus(displayQuest.status)})`
                    : "none"}
                </span>
                <span>Objective {getQuestObjectiveText(displayQuest)}</span>
                <span>
                  Global POI {gameState.globalPoiIntent?.reason ?? "none"}
                </span>
                <span>
                  Local POI{" "}
                  {gameState.localPoiTarget
                    ? `${gameState.localPoiTarget.poiId} (${gameState.localPoiTarget.category})`
                    : "none"}
                </span>
                <span>
                  POI Reason {gameState.lastPoiDecision?.selectedReason ?? "none"}
                </span>
              </>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
