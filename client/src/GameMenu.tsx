import { InventoryPanel } from "./InventoryPanel";
import { QuestsPanel } from "./QuestPanels";
import { WorldPanel } from "./WorldPanel";
import type {
  GameMenuTab,
  PartyManagementSection,
  PartyMenuSection,
} from "./gameMenuTypes";
import {
  PartyManagementPanel,
  PartyMenuPanel,
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
  PrimaryStatId,
} from "./game";

export function GameMenu({
  activeTab,
  activeManagementSection,
  activePartySection,
  inventory,
  wallet,
  leaderId,
  members,
  currentTime,
  quests,
  currentMapId,
  worldTravelTargetMapId,
  selectedCompanionId,
  selectedQuestId,
  totalPartyLevel,
  onAllocateStatPoint,
  onChangeLeader,
  onChangeRole,
  onAssignFood,
  onChangeConsumableBehavior,
  onEquipEquipment,
  onEquipFlask,
  onOpenEquipmentManagement,
  onSelectCompanion,
  onSelectManagementSection,
  onSelectPartySection,
  onSelectQuest,
  onSelectTab,
  onSetWorldTravelRoute,
  onClearWorldTravelRoute,
  onUnequipEquipment,
  onUnequipFlask,
  onMovePartyOrder,
}: {
  activeTab: GameMenuTab | null;
  activeManagementSection: PartyManagementSection;
  activePartySection: PartyMenuSection;
  inventory: PartyInventory;
  wallet: PartyWallet;
  leaderId: string;
  members: Companion[];
  currentTime: number;
  quests: GameState["quests"];
  currentMapId?: DebugMapId;
  worldTravelTargetMapId: DebugMapId | null;
  selectedCompanionId: string | null;
  selectedQuestId: QuestId | null;
  totalPartyLevel: number;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onChangeLeader: (companionId: string) => void;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onAssignFood: (companionId: string, itemId: ItemId | null) => void;
  onChangeConsumableBehavior: (
    companionId: string,
    update: Partial<Companion["consumableBehavior"]>,
  ) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onOpenEquipmentManagement: () => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectManagementSection: (section: PartyManagementSection) => void;
  onSelectPartySection: (section: PartyMenuSection) => void;
  onSelectQuest: (questId: QuestId) => void;
  onSelectTab: (tab: GameMenuTab | null) => void;
  onSetWorldTravelRoute: (targetMapId: DebugMapId) => void;
  onClearWorldTravelRoute: () => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onUnequipFlask: (companionId: string) => void;
  onMovePartyOrder: (companionId: string, direction: "up" | "down") => void;
}) {
  return (
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
                  currentTime={currentTime}
                  selectedCompanionId={selectedCompanionId}
                  totalPartyLevel={totalPartyLevel}
                  onAllocateStatPoint={onAllocateStatPoint}
                  onAssignFood={onAssignFood}
                  onEquipEquipment={onEquipEquipment}
                  onEquipFlask={onEquipFlask}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectPartySection}
                  onUnequipEquipment={onUnequipEquipment}
                  onUnequipFlask={onUnequipFlask}
                />
              ) : activeTab === "partyManagement" ? (
                <PartyManagementPanel
                  activeSection={activeManagementSection}
                  leaderId={leaderId}
                  members={members}
                  selectedCompanionId={selectedCompanionId}
                  totalPartyLevel={totalPartyLevel}
                  onChangeLeader={onChangeLeader}
                  onChangeConsumableBehavior={onChangeConsumableBehavior}
                  onChangeRole={onChangeRole}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectManagementSection}
                  onMovePartyOrder={onMovePartyOrder}
                />
              ) : activeTab === "inventory" ? (
                <InventoryPanel
                  inventory={inventory}
                  quests={quests}
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
  );
}
