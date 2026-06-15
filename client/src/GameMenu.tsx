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
  SkillId,
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
  skillBookReadMessage,
  worldTravelTargetMapId,
  selectedCompanionId,
  selectedQuestId,
  totalPartyLevel,
  onAllocateStatPoint,
  onChangeLeader,
  onChangeRole,
  onAssignFood,
  onChangeConsumableBehavior,
  onChangeSkillBehavior,
  onEquipEquipment,
  onEquipFlask,
  onOpenEquipmentManagement,
  onReadSkillBook,
  onSetLegacySkillEnabled,
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
  saveStatusMessage,
  onExportSave,
  onImportSaveFile,
  onManualSave,
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
  skillBookReadMessage?: string | null;
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
  onChangeSkillBehavior: (
    companionId: string,
    update: Partial<Companion["skillBehavior"]>,
  ) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onOpenEquipmentManagement: () => void;
  onReadSkillBook: (companionId: string, itemId: ItemId) => void;
  onSetLegacySkillEnabled: (
    companionId: string,
    skillId: SkillId,
    enabled: boolean,
  ) => void;
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
  saveStatusMessage: string | null;
  onExportSave: () => void;
  onImportSaveFile: (file: File) => void | Promise<void>;
  onManualSave: () => void;
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
            <button
              className={activeTab === "options" ? "active" : ""}
              onClick={() => onSelectTab("options")}
              type="button"
            >
              Options
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
                  onSetLegacySkillEnabled={onSetLegacySkillEnabled}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectPartySection}
                  onUnequipEquipment={onUnequipEquipment}
                  onUnequipFlask={onUnequipFlask}
                />
              ) : activeTab === "partyManagement" ? (
                <PartyManagementPanel
                  activeSection={activeManagementSection}
                  currentTime={currentTime}
                  leaderId={leaderId}
                  members={members}
                  selectedCompanionId={selectedCompanionId}
                  totalPartyLevel={totalPartyLevel}
                  onChangeLeader={onChangeLeader}
                  onChangeConsumableBehavior={onChangeConsumableBehavior}
                  onChangeSkillBehavior={onChangeSkillBehavior}
                  onChangeRole={onChangeRole}
                  onSelectCompanion={onSelectCompanion}
                  onSelectSection={onSelectManagementSection}
                  onMovePartyOrder={onMovePartyOrder}
                />
              ) : activeTab === "inventory" ? (
                <InventoryPanel
                  inventory={inventory}
                  members={members}
                  quests={quests}
                  skillBookReadMessage={skillBookReadMessage}
                  wallet={wallet}
                  onReadSkillBook={onReadSkillBook}
                  onOpenEquipmentManagement={onOpenEquipmentManagement}
                />
              ) : activeTab === "quests" ? (
                <QuestsPanel
                  quests={quests}
                  selectedQuestId={selectedQuestId}
                  onSelectQuest={onSelectQuest}
                />
              ) : activeTab === "world" ? (
                <WorldPanel
                  currentMapId={currentMapId}
                  worldTravelTargetMapId={worldTravelTargetMapId}
                  onClearRoute={onClearWorldTravelRoute}
                  onSetRoute={onSetWorldTravelRoute}
                />
              ) : (
                <OptionsPanel
                  saveStatusMessage={saveStatusMessage}
                  onExportSave={onExportSave}
                  onImportSaveFile={onImportSaveFile}
                  onManualSave={onManualSave}
                />
              )}
            </div>
          ) : null}
    </aside>
  );
}

function OptionsPanel({
  saveStatusMessage,
  onExportSave,
  onImportSaveFile,
  onManualSave,
}: {
  saveStatusMessage: string | null;
  onExportSave: () => void;
  onImportSaveFile: (file: File) => void | Promise<void>;
  onManualSave: () => void;
}) {
  return (
    <section className="options-panel" aria-label="Options">
      <div className="options-actions">
        <button onClick={onManualSave} type="button">
          Manual Save
        </button>
        <button onClick={onExportSave} type="button">
          Export Save
        </button>
        <label className="import-save-button">
          Import Save
          <input
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];

              if (file) {
                void onImportSaveFile(file);
              }

              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <p className="options-save-status">
        {saveStatusMessage ?? "Autosave ready."}
      </p>
    </section>
  );
}
