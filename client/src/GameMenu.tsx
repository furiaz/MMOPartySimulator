import { InventoryPanel } from "./InventoryPanel";
import { QuestsPanel } from "./QuestPanels";
import {
  PartyManagementPanel,
  PartyMenuPanel,
  type GameMenuTab,
  type PartyManagementSection,
  type PartyShortcutTarget,
} from "./CompanionPanels";
import type {
  Companion,
  GameState,
  PartyInventory,
  PartyMemberRole,
  EquipmentSlot,
  ItemId,
  QuestId,
} from "./game";

export function GameMenu({
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
  onEquipEquipment,
  onOpenEquipmentManagement,
  onSelectCompanion,
  onSelectManagementSection,
  onSelectQuest,
  onShortcut,
  onSelectTab,
  onToggle,
  onUnequipEquipment,
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
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onOpenEquipmentManagement: () => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectManagementSection: (section: PartyManagementSection) => void;
  onSelectQuest: (questId: QuestId) => void;
  onShortcut: (companionId: string, target: PartyShortcutTarget) => void;
  onSelectTab: (tab: GameMenuTab | null) => void;
  onToggle: () => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
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
                  inventory={inventory}
                  selectedCompanionId={selectedCompanionId}
                  onChangeRole={onChangeRole}
                  onEquipEquipment={onEquipEquipment}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectManagementSection}
                  onUnequipEquipment={onUnequipEquipment}
                />
              ) : activeTab === "inventory" ? (
                <InventoryPanel
                  inventory={inventory}
                  onOpenEquipmentManagement={onOpenEquipmentManagement}
                />
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
