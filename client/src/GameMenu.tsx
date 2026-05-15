import { InventoryPanel } from "./InventoryPanel";
import { QuestsPanel } from "./QuestPanels";
import { WorldPanel } from "./WorldPanel";
import {
  PartyManagementPanel,
  PartyMenuPanel,
  type GameMenuTab,
  type PartyManagementSection,
  type PartyMenuSection,
} from "./CompanionPanels";
import type {
  Companion,
  GameState,
  PartyInventory,
  PartyWallet,
  PartyMemberRole,
  EquipmentSlot,
  ItemId,
  QuestId,
  DebugMapId,
} from "./game";

export function GameMenu({
  activeTab,
  activeManagementSection,
  activePartySection,
  inventory,
  wallet,
  isOpen,
  leaderId,
  members,
  quests,
  currentMapId,
  worldTravelTargetMapId,
  selectedCompanionId,
  selectedQuestId,
  totalPartyLevel,
  onChangeLeader,
  onChangeRole,
  onEquipEquipment,
  onOpenEquipmentManagement,
  onSelectCompanion,
  onSelectManagementSection,
  onSelectPartySection,
  onSelectQuest,
  onSelectTab,
  onSetWorldTravelRoute,
  onClearWorldTravelRoute,
  onToggle,
  onUnequipEquipment,
  onMovePartyOrder,
}: {
  activeTab: GameMenuTab | null;
  activeManagementSection: PartyManagementSection;
  activePartySection: PartyMenuSection;
  inventory: PartyInventory;
  wallet: PartyWallet;
  isOpen: boolean;
  leaderId: string;
  members: Companion[];
  quests: GameState["quests"];
  currentMapId?: DebugMapId;
  worldTravelTargetMapId: DebugMapId | null;
  selectedCompanionId: string | null;
  selectedQuestId: QuestId | null;
  totalPartyLevel: number;
  onChangeLeader: (companionId: string) => void;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onOpenEquipmentManagement: () => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectManagementSection: (section: PartyManagementSection) => void;
  onSelectPartySection: (section: PartyMenuSection) => void;
  onSelectQuest: (questId: QuestId) => void;
  onSelectTab: (tab: GameMenuTab | null) => void;
  onSetWorldTravelRoute: (targetMapId: DebugMapId) => void;
  onClearWorldTravelRoute: () => void;
  onToggle: () => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onMovePartyOrder: (companionId: string, direction: "up" | "down") => void;
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
            <button
              className={activeTab === "world" ? "active" : ""}
              onClick={() => onSelectTab("world")}
              type="button"
            >
              World Travel
            </button>
          </nav>
          {activeTab ? (
            <div className="game-menu-content">
              {activeTab === "party" ? (
                <PartyMenuPanel
                  activeSection={activePartySection}
                  inventory={inventory}
                  members={members}
                  selectedCompanionId={selectedCompanionId}
                  totalPartyLevel={totalPartyLevel}
                  onEquipEquipment={onEquipEquipment}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectPartySection}
                  onUnequipEquipment={onUnequipEquipment}
                />
              ) : activeTab === "partyManagement" ? (
                <PartyManagementPanel
                  activeSection={activeManagementSection}
                  leaderId={leaderId}
                  members={members}
                  selectedCompanionId={selectedCompanionId}
                  totalPartyLevel={totalPartyLevel}
                  onChangeLeader={onChangeLeader}
                  onChangeRole={onChangeRole}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectManagementSection}
                  onMovePartyOrder={onMovePartyOrder}
                />
              ) : activeTab === "inventory" ? (
                <InventoryPanel
                  inventory={inventory}
                  wallet={wallet}
                  onOpenEquipmentManagement={onOpenEquipmentManagement}
                />
              ) : activeTab === "quests" ? (
                <QuestsPanel
                  quests={quests}
                  selectedQuestId={selectedQuestId}
                  onSelectQuest={onSelectQuest}
                />
              ) : (
                <WorldPanel
                  currentMapId={currentMapId}
                  worldTravelTargetMapId={worldTravelTargetMapId}
                  onClearRoute={onClearWorldTravelRoute}
                  onSetRoute={onSetWorldTravelRoute}
                />
              )}
            </div>
          ) : null}
        </aside>
      ) : null}
    </>
  );
}
