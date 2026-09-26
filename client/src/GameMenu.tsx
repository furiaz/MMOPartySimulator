import { InventoryPanel } from "./InventoryPanel";
import { QuestsPanel } from "./QuestPanels";
import { WorldPanel } from "./WorldPanel";
import { BankPanel } from "./BankPanel";
import { GuildTavernPanel } from "./GuildTavernPanel";
import { FarmLivestockPanel } from "./FarmLivestockPanel";
import { getLivestockDisplay } from "./livestockPresentation";
import type {
  AtlasSubpage,
  GameMenuTab,
  PartyManagementSection,
  PartyMenuSection,
} from "./gameMenuTypes";
import { CraftingPanel } from "./CraftingPanel";
import {
  PartyManagementPanel,
  PartyMenuPanel,
} from "./CompanionPanels";
import { estimateCurrentPartyAfkCombat, getItemDefinition } from "./game";
import type {
  AfkCombatEstimate,
  AfkCombatEstimateWarning,
  AfkCombatMultiplierSource,
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
  CraftingRecipeId,
  GuildNoticeBoardUpgradeId,
  GuildRecruitUpgradeId,
  InnKitchenUpgradeId,
  InnKitchenRecipeId,
  GuildRosterSlotRef,
  GuildSecondaryPartyRedeemSummary,
  GuildSecondaryPartyUpgradeId,
  FarmFieldId,
  FarmFieldUpgradeId,
  InnRoomUpgradeId,
  LivestockAnimalUpgradeId,
  LivestockBuildingUpgradeId,
  LivestockCreatureId,
  LivestockPlacementId,
  LivestockPlacementRotation,
} from "./game";

export type GuildSecondaryPartyRedeemSummaryState = GuildSecondaryPartyRedeemSummary;

export function GameMenu({
  activeTab,
  activeAtlasSubpage,
  activeManagementSection,
  activePartySection,
  gameState,
  inventory,
  wallet,
  leaderId,
  members,
  currentTime,
  quests,
  currentMapId,
  backgroundMusicMuted,
  backgroundMusicVolumePercent,
  skillBookReadMessage,
  worldTravelTargetMapId,
  selectedCompanionId,
  selectedQuestId,
  craftingResultMessage,
  guildRecruitResultMessage,
  guildUpgradeResultMessage,
  guildNoticeBoardResultMessage,
  guildSecondaryPartyResultMessage,
  innKitchenResultMessage,
  farmResultMessage,
  livestockResultMessage,
  guildTavernPantryRequestId,
  guildSecondaryPartyRedeemSummary,
  canUseGuildTavern,
  highestCharacterLevelEver,
  onAllocateStatPoint,
  onChangeLeader,
  onChangeRole,
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
  onSelectAtlasSubpage,
  onSelectQuest,
  onSelectTab,
  onCraftRecipe,
  onRecruitGuildCandidate,
  onPurchaseGuildNoticeBoardUpgrade,
  onPurchaseGuildRecruitUpgrade,
  onPurchaseGuildSecondaryPartyUpgrade,
  onPurchaseInnRoomUpgrade,
  onPurchaseInnKitchenUpgrade,
  onOpenGuildNoticeBoard,
  onRerollGuildNoticeBoard,
  onTakeGuildNoticeBoardQuest,
  onCancelGuildNoticeBoardQuest,
  onMoveGuildRosterCompanion,
  onAssignGuildSecondaryParty,
  onRedeemGuildSecondaryPartyAssignment,
  onReturnGuildSecondaryPartyAssignment,
  onCookInnMeal,
  onSelectInnKitchenRecipe,
  onCycleInnKitchenAutoCook,
  onBulkCookInnMeals,
  onHarvestAllFarmCrops,
  onPurchaseFarmUpgrade,
  onPlaceLivestockCreature,
  onMoveLivestockPlacement,
  onRemoveLivestockPlacement,
  onCollectAllLivestockOutputs,
  onFeedHungryLivestockNow,
  onPurchaseLivestockAnimalUpgrade,
  onPurchaseLivestockBuildingUpgrade,
  onOpenInnKitchenPantry,
  onClearGuildSecondaryPartySummary,
  onSetWorldTravelRoute,
  onClearWorldTravelRoute,
  onToggleAutoCombatOnArrival,
  onTeleportWorldTravelDestination,
  onUnequipEquipment,
  onUnequipFlask,
  onMovePartyOrder,
  onChangeBackgroundMusicMuted,
  onChangeBackgroundMusicVolume,
  saveStatusMessage,
  onExportSave,
  onImportSaveFile,
  onManualSave,
}: {
  activeTab: GameMenuTab | null;
  activeAtlasSubpage: AtlasSubpage;
  activeManagementSection: PartyManagementSection;
  activePartySection: PartyMenuSection;
  gameState: GameState;
  inventory: PartyInventory;
  wallet: PartyWallet;
  leaderId: string;
  members: Companion[];
  currentTime: number;
  quests: GameState["quests"];
  currentMapId?: DebugMapId;
  backgroundMusicMuted: boolean;
  backgroundMusicVolumePercent: number;
  skillBookReadMessage?: string | null;
  worldTravelTargetMapId: DebugMapId | null;
  selectedCompanionId: string | null;
  selectedQuestId: QuestId | null;
  craftingResultMessage?: string | null;
  guildRecruitResultMessage?: string | null;
  guildUpgradeResultMessage?: string | null;
  guildNoticeBoardResultMessage?: string | null;
  guildSecondaryPartyResultMessage?: string | null;
  innKitchenResultMessage?: string | null;
  farmResultMessage?: string | null;
  livestockResultMessage?: string | null;
  guildTavernPantryRequestId: number;
  guildSecondaryPartyRedeemSummary?: GuildSecondaryPartyRedeemSummaryState | null;
  canUseGuildTavern: boolean;
  highestCharacterLevelEver: number;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onChangeLeader: (companionId: string) => void;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
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
  onSelectAtlasSubpage: (subpage: AtlasSubpage) => void;
  onSelectQuest: (questId: QuestId) => void;
  onSelectTab: (tab: GameMenuTab | null) => void;
  onCraftRecipe: (recipeId: CraftingRecipeId) => void;
  onRecruitGuildCandidate: (candidateId?: string) => void;
  onPurchaseGuildNoticeBoardUpgrade: (
    upgradeId: GuildNoticeBoardUpgradeId,
  ) => void;
  onPurchaseGuildRecruitUpgrade: (upgradeId: GuildRecruitUpgradeId) => void;
  onPurchaseGuildSecondaryPartyUpgrade: (
    upgradeId: GuildSecondaryPartyUpgradeId,
    partyId?: string | null,
  ) => void;
  onPurchaseInnRoomUpgrade: (upgradeId: InnRoomUpgradeId) => void;
  onPurchaseInnKitchenUpgrade: (upgradeId: InnKitchenUpgradeId) => void;
  onOpenGuildNoticeBoard: () => void;
  onRerollGuildNoticeBoard: () => void;
  onTakeGuildNoticeBoardQuest: (slotIndex?: number) => void;
  onCancelGuildNoticeBoardQuest: (slotIndex?: number) => void;
  onMoveGuildRosterCompanion: (
    companionId: string,
    target: GuildRosterSlotRef,
  ) => void;
  onAssignGuildSecondaryParty: (
    partyId: string,
    mapId: DebugMapId,
    subzoneId: string,
  ) => void;
  onRedeemGuildSecondaryPartyAssignment: (partyId: string) => void;
  onReturnGuildSecondaryPartyAssignment: (partyId: string) => void;
  onCookInnMeal: (companionId: string, recipeId: InnKitchenRecipeId) => void;
  onSelectInnKitchenRecipe: (
    companionId: string,
    recipeId: InnKitchenRecipeId,
  ) => void;
  onCycleInnKitchenAutoCook: (companionId: string) => void;
  onBulkCookInnMeals: (companionIds: string[], label: string) => void;
  onHarvestAllFarmCrops: () => void;
  onPurchaseFarmUpgrade: (
    fieldId: FarmFieldId,
    upgradeId: FarmFieldUpgradeId,
  ) => void;
  onPlaceLivestockCreature: (
    creatureId: LivestockCreatureId,
    x: number,
    y: number,
    rotation: LivestockPlacementRotation,
  ) => boolean;
  onMoveLivestockPlacement: (
    placementId: LivestockPlacementId,
    x: number,
    y: number,
    rotation: LivestockPlacementRotation,
  ) => boolean;
  onRemoveLivestockPlacement: (placementId: LivestockPlacementId) => void;
  onCollectAllLivestockOutputs: () => void;
  onFeedHungryLivestockNow: () => void;
  onPurchaseLivestockAnimalUpgrade: (
    creatureId: LivestockCreatureId,
    upgradeId: LivestockAnimalUpgradeId,
  ) => void;
  onPurchaseLivestockBuildingUpgrade: (
    upgradeId: LivestockBuildingUpgradeId,
  ) => void;
  onOpenInnKitchenPantry: () => void;
  onClearGuildSecondaryPartySummary: () => void;
  onSetWorldTravelRoute: (targetMapId: DebugMapId) => void;
  onClearWorldTravelRoute: () => void;
  onToggleAutoCombatOnArrival: () => void;
  onTeleportWorldTravelDestination: (targetMapId: DebugMapId) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onUnequipFlask: (companionId: string) => void;
  onMovePartyOrder: (companionId: string, direction: "up" | "down") => void;
  onChangeBackgroundMusicMuted: (muted: boolean) => void;
  onChangeBackgroundMusicVolume: (volumePercent: number) => void;
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
              className={activeTab === "atlas" ? "active" : ""}
              onClick={() => onSelectTab("atlas")}
              type="button"
            >
              Atlas
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
                  gameState={gameState}
                  members={members}
                  currentTime={currentTime}
                  selectedCompanionId={selectedCompanionId}
                  highestCharacterLevelEver={highestCharacterLevelEver}
                  onAllocateStatPoint={onAllocateStatPoint}
                  onChangeSkillBehavior={onChangeSkillBehavior}
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
                  highestCharacterLevelEver={highestCharacterLevelEver}
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
                  gameState={gameState}
                  members={members}
                  quests={quests}
                  skillBookReadMessage={skillBookReadMessage}
                  wallet={wallet}
                  onReadSkillBook={onReadSkillBook}
                  onOpenEquipmentManagement={onOpenEquipmentManagement}
                />
              ) : activeTab === "atlas" ? (
                <AtlasPanel
                  activeSubpage={activeAtlasSubpage}
                  craftingResultMessage={craftingResultMessage}
                  currentTime={currentTime}
                  guildRecruitResultMessage={guildRecruitResultMessage}
                  guildUpgradeResultMessage={guildUpgradeResultMessage}
                  guildNoticeBoardResultMessage={guildNoticeBoardResultMessage}
                  guildSecondaryPartyResultMessage={guildSecondaryPartyResultMessage}
                  innKitchenResultMessage={innKitchenResultMessage}
                  farmResultMessage={farmResultMessage}
                  livestockResultMessage={livestockResultMessage}
                  guildTavernPantryRequestId={guildTavernPantryRequestId}
                  guildSecondaryPartyRedeemSummary={
                    guildSecondaryPartyRedeemSummary
                  }
                  canUseGuildTavern={canUseGuildTavern}
                  gameState={gameState}
                  quests={quests}
                  selectedQuestId={selectedQuestId}
                  onCraftRecipe={onCraftRecipe}
                  onRecruitGuildCandidate={onRecruitGuildCandidate}
                  onPurchaseGuildNoticeBoardUpgrade={
                    onPurchaseGuildNoticeBoardUpgrade
                  }
                  onPurchaseGuildRecruitUpgrade={onPurchaseGuildRecruitUpgrade}
                  onPurchaseGuildSecondaryPartyUpgrade={
                    onPurchaseGuildSecondaryPartyUpgrade
                  }
                  onPurchaseInnRoomUpgrade={onPurchaseInnRoomUpgrade}
                  onPurchaseInnKitchenUpgrade={onPurchaseInnKitchenUpgrade}
                  onOpenGuildNoticeBoard={onOpenGuildNoticeBoard}
                  onRerollGuildNoticeBoard={onRerollGuildNoticeBoard}
                  onTakeGuildNoticeBoardQuest={onTakeGuildNoticeBoardQuest}
                  onCancelGuildNoticeBoardQuest={onCancelGuildNoticeBoardQuest}
                  onMoveGuildRosterCompanion={onMoveGuildRosterCompanion}
                  onAssignGuildSecondaryParty={onAssignGuildSecondaryParty}
                  onRedeemGuildSecondaryPartyAssignment={
                    onRedeemGuildSecondaryPartyAssignment
                  }
                  onReturnGuildSecondaryPartyAssignment={
                    onReturnGuildSecondaryPartyAssignment
                  }
                  onCookInnMeal={onCookInnMeal}
                  onSelectInnKitchenRecipe={onSelectInnKitchenRecipe}
                  onCycleInnKitchenAutoCook={onCycleInnKitchenAutoCook}
                  onBulkCookInnMeals={onBulkCookInnMeals}
                  onHarvestAllFarmCrops={onHarvestAllFarmCrops}
                  onPurchaseFarmUpgrade={onPurchaseFarmUpgrade}
                  onPlaceLivestockCreature={onPlaceLivestockCreature}
                  onMoveLivestockPlacement={onMoveLivestockPlacement}
                  onRemoveLivestockPlacement={onRemoveLivestockPlacement}
                  onCollectAllLivestockOutputs={onCollectAllLivestockOutputs}
                  onFeedHungryLivestockNow={onFeedHungryLivestockNow}
                  onPurchaseLivestockAnimalUpgrade={
                    onPurchaseLivestockAnimalUpgrade
                  }
                  onPurchaseLivestockBuildingUpgrade={
                    onPurchaseLivestockBuildingUpgrade
                  }
                  onOpenInnKitchenPantry={onOpenInnKitchenPantry}
                  onClearGuildSecondaryPartySummary={
                    onClearGuildSecondaryPartySummary
                  }
                  onSelectQuest={onSelectQuest}
                  onSelectSubpage={onSelectAtlasSubpage}
                />
              ) : activeTab === "world" ? (
                <WorldPanel
                  currentMapId={currentMapId}
                  gameState={gameState}
                  worldTravelTargetMapId={worldTravelTargetMapId}
                  onClearRoute={onClearWorldTravelRoute}
                  onSetRoute={onSetWorldTravelRoute}
                  onToggleAutoCombatOnArrival={onToggleAutoCombatOnArrival}
                  onTeleport={onTeleportWorldTravelDestination}
                />
              ) : (
                <OptionsPanel
                  backgroundMusicMuted={backgroundMusicMuted}
                  backgroundMusicVolumePercent={backgroundMusicVolumePercent}
                  saveStatusMessage={saveStatusMessage}
                  onChangeBackgroundMusicMuted={onChangeBackgroundMusicMuted}
                  onChangeBackgroundMusicVolume={onChangeBackgroundMusicVolume}
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

function AtlasPanel({
  activeSubpage,
  craftingResultMessage,
  currentTime,
  guildRecruitResultMessage,
  guildUpgradeResultMessage,
  guildNoticeBoardResultMessage,
  guildSecondaryPartyResultMessage,
  innKitchenResultMessage,
  farmResultMessage,
  livestockResultMessage,
  guildTavernPantryRequestId,
  guildSecondaryPartyRedeemSummary,
  canUseGuildTavern,
  gameState,
  quests,
  selectedQuestId,
  onCraftRecipe,
  onRecruitGuildCandidate,
  onPurchaseGuildNoticeBoardUpgrade,
  onPurchaseGuildRecruitUpgrade,
  onPurchaseGuildSecondaryPartyUpgrade,
  onPurchaseInnRoomUpgrade,
  onPurchaseInnKitchenUpgrade,
  onOpenGuildNoticeBoard,
  onRerollGuildNoticeBoard,
  onTakeGuildNoticeBoardQuest,
  onCancelGuildNoticeBoardQuest,
  onMoveGuildRosterCompanion,
  onAssignGuildSecondaryParty,
  onRedeemGuildSecondaryPartyAssignment,
  onReturnGuildSecondaryPartyAssignment,
  onCookInnMeal,
  onSelectInnKitchenRecipe,
  onCycleInnKitchenAutoCook,
  onBulkCookInnMeals,
  onHarvestAllFarmCrops,
  onPurchaseFarmUpgrade,
  onPlaceLivestockCreature,
  onMoveLivestockPlacement,
  onRemoveLivestockPlacement,
  onCollectAllLivestockOutputs,
  onFeedHungryLivestockNow,
  onPurchaseLivestockAnimalUpgrade,
  onPurchaseLivestockBuildingUpgrade,
  onOpenInnKitchenPantry,
  onClearGuildSecondaryPartySummary,
  onSelectQuest,
  onSelectSubpage,
}: {
  activeSubpage: AtlasSubpage;
  craftingResultMessage?: string | null;
  currentTime: number;
  guildRecruitResultMessage?: string | null;
  guildUpgradeResultMessage?: string | null;
  guildNoticeBoardResultMessage?: string | null;
  guildSecondaryPartyResultMessage?: string | null;
  innKitchenResultMessage?: string | null;
  farmResultMessage?: string | null;
  livestockResultMessage?: string | null;
  guildTavernPantryRequestId: number;
  guildSecondaryPartyRedeemSummary?: GuildSecondaryPartyRedeemSummaryState | null;
  canUseGuildTavern: boolean;
  gameState: GameState;
  quests: GameState["quests"];
  selectedQuestId: QuestId | null;
  onCraftRecipe: (recipeId: CraftingRecipeId) => void;
  onRecruitGuildCandidate: (candidateId?: string) => void;
  onPurchaseGuildNoticeBoardUpgrade: (
    upgradeId: GuildNoticeBoardUpgradeId,
  ) => void;
  onPurchaseGuildRecruitUpgrade: (upgradeId: GuildRecruitUpgradeId) => void;
  onPurchaseGuildSecondaryPartyUpgrade: (
    upgradeId: GuildSecondaryPartyUpgradeId,
    partyId?: string | null,
  ) => void;
  onPurchaseInnRoomUpgrade: (upgradeId: InnRoomUpgradeId) => void;
  onPurchaseInnKitchenUpgrade: (upgradeId: InnKitchenUpgradeId) => void;
  onOpenGuildNoticeBoard: () => void;
  onRerollGuildNoticeBoard: () => void;
  onTakeGuildNoticeBoardQuest: (slotIndex?: number) => void;
  onCancelGuildNoticeBoardQuest: (slotIndex?: number) => void;
  onMoveGuildRosterCompanion: (
    companionId: string,
    target: GuildRosterSlotRef,
  ) => void;
  onAssignGuildSecondaryParty: (
    partyId: string,
    mapId: DebugMapId,
    subzoneId: string,
  ) => void;
  onRedeemGuildSecondaryPartyAssignment: (partyId: string) => void;
  onReturnGuildSecondaryPartyAssignment: (partyId: string) => void;
  onCookInnMeal: (companionId: string, recipeId: InnKitchenRecipeId) => void;
  onSelectInnKitchenRecipe: (
    companionId: string,
    recipeId: InnKitchenRecipeId,
  ) => void;
  onCycleInnKitchenAutoCook: (companionId: string) => void;
  onBulkCookInnMeals: (companionIds: string[], label: string) => void;
  onHarvestAllFarmCrops: () => void;
  onPurchaseFarmUpgrade: (
    fieldId: FarmFieldId,
    upgradeId: FarmFieldUpgradeId,
  ) => void;
  onPlaceLivestockCreature: (
    creatureId: LivestockCreatureId,
    x: number,
    y: number,
    rotation: LivestockPlacementRotation,
  ) => boolean;
  onMoveLivestockPlacement: (
    placementId: LivestockPlacementId,
    x: number,
    y: number,
    rotation: LivestockPlacementRotation,
  ) => boolean;
  onRemoveLivestockPlacement: (placementId: LivestockPlacementId) => void;
  onCollectAllLivestockOutputs: () => void;
  onFeedHungryLivestockNow: () => void;
  onPurchaseLivestockAnimalUpgrade: (
    creatureId: LivestockCreatureId,
    upgradeId: LivestockAnimalUpgradeId,
  ) => void;
  onPurchaseLivestockBuildingUpgrade: (
    upgradeId: LivestockBuildingUpgradeId,
  ) => void;
  onOpenInnKitchenPantry: () => void;
  onClearGuildSecondaryPartySummary: () => void;
  onSelectQuest: (questId: QuestId) => void;
  onSelectSubpage: (subpage: AtlasSubpage) => void;
}) {
  const livestockDisplay = getLivestockDisplay(gameState, currentTime);

  return (
    <section className="atlas-panel" aria-label="Atlas">
      <nav className="atlas-subtabs" aria-label="Atlas pages">
        <button
          className={activeSubpage === "quests" ? "active" : ""}
          onClick={() => onSelectSubpage("quests")}
          type="button"
        >
          Quests
        </button>
        <button
          className={activeSubpage === "crafts" ? "active" : ""}
          onClick={() => onSelectSubpage("crafts")}
          type="button"
        >
          Crafts
        </button>
        <button
          className={activeSubpage === "bank" ? "active" : ""}
          onClick={() => onSelectSubpage("bank")}
          type="button"
        >
          Bank
        </button>
        <button
          className={activeSubpage === "guildTavern" ? "active" : ""}
          onClick={() => onSelectSubpage("guildTavern")}
          type="button"
        >
          Guild & Inn
        </button>
        <button
          className={activeSubpage === "farmLivestock" ? "active" : ""}
          onClick={() => onSelectSubpage("farmLivestock")}
          type="button"
        >
          <span>Farm & Livestock</span>
          {livestockDisplay.hasHungryAnimals ? (
            <small className="atlas-warning-label">Hungry</small>
          ) : null}
        </button>
        <button
          className={activeSubpage === "afkEstimate" ? "active" : ""}
          onClick={() => onSelectSubpage("afkEstimate")}
          type="button"
        >
          AFK Estimate
        </button>
      </nav>
      {activeSubpage === "quests" ? (
        <QuestsPanel
          currentTime={currentTime}
          state={gameState}
          quests={quests}
          selectedQuestId={selectedQuestId}
          onSelectQuest={onSelectQuest}
        />
      ) : activeSubpage === "crafts" ? (
        <CraftingPanel
          resultMessage={craftingResultMessage}
          state={gameState}
          onCraft={onCraftRecipe}
        />
      ) : activeSubpage === "bank" ? (
        <BankPanel
          canManage={false}
          state={gameState}
        />
      ) : activeSubpage === "guildTavern" ? (
        <GuildTavernPanel
          canUse={canUseGuildTavern}
          currentTime={currentTime}
          recruitResultMessage={guildRecruitResultMessage}
          upgradeResultMessage={guildUpgradeResultMessage}
          noticeBoardResultMessage={guildNoticeBoardResultMessage}
          secondaryPartyResultMessage={guildSecondaryPartyResultMessage}
          innKitchenResultMessage={innKitchenResultMessage}
          pantryRequestId={guildTavernPantryRequestId}
          secondaryPartyRedeemSummary={guildSecondaryPartyRedeemSummary}
          state={gameState}
          onCancelNoticeBoardQuest={onCancelGuildNoticeBoardQuest}
          onMoveGuildRosterCompanion={onMoveGuildRosterCompanion}
          onOpenNoticeBoard={onOpenGuildNoticeBoard}
          onPurchaseNoticeBoardUpgrade={onPurchaseGuildNoticeBoardUpgrade}
          onPurchaseRecruitUpgrade={onPurchaseGuildRecruitUpgrade}
          onPurchaseSecondaryPartyUpgrade={
            onPurchaseGuildSecondaryPartyUpgrade
          }
          onPurchaseRoomUpgrade={onPurchaseInnRoomUpgrade}
          onPurchaseKitchenUpgrade={onPurchaseInnKitchenUpgrade}
          onRecruit={onRecruitGuildCandidate}
          onRerollNoticeBoard={onRerollGuildNoticeBoard}
          onTakeNoticeBoardQuest={onTakeGuildNoticeBoardQuest}
          onAssignSecondaryParty={onAssignGuildSecondaryParty}
          onRedeemSecondaryPartyAssignment={
            onRedeemGuildSecondaryPartyAssignment
          }
          onReturnSecondaryPartyAssignment={onReturnGuildSecondaryPartyAssignment}
          onCookInnMeal={onCookInnMeal}
          onSelectInnKitchenRecipe={onSelectInnKitchenRecipe}
          onCycleInnKitchenAutoCook={onCycleInnKitchenAutoCook}
          onBulkCookInnMeals={onBulkCookInnMeals}
          onClearSecondaryPartySummary={onClearGuildSecondaryPartySummary}
        />
      ) : activeSubpage === "farmLivestock" ? (
        <FarmLivestockPanel
          currentTime={currentTime}
          farmResultMessage={farmResultMessage}
          livestockResultMessage={livestockResultMessage}
          state={gameState}
          onHarvestAll={onHarvestAllFarmCrops}
          onPurchaseFarmUpgrade={onPurchaseFarmUpgrade}
          onPlaceLivestockCreature={onPlaceLivestockCreature}
          onMoveLivestockPlacement={onMoveLivestockPlacement}
          onRemoveLivestockPlacement={onRemoveLivestockPlacement}
          onCollectAllLivestockOutputs={onCollectAllLivestockOutputs}
          onFeedHungryLivestockNow={onFeedHungryLivestockNow}
          onPurchaseLivestockAnimalUpgrade={onPurchaseLivestockAnimalUpgrade}
          onPurchaseLivestockBuildingUpgrade={onPurchaseLivestockBuildingUpgrade}
          onOpenInnKitchenPantry={onOpenInnKitchenPantry}
        />
      ) : (
        <AfkEstimatePanel state={gameState} />
      )}
    </section>
  );
}

function AfkEstimatePanel({ state }: { state: GameState }) {
  const estimate = estimateCurrentPartyAfkCombat(state);

  if (!estimate.available) {
    return (
      <section className="afk-estimate-panel" aria-label="AFK Estimate">
        <div className="menu-section-heading">
          <h2>AFK Estimate</h2>
          <span>Unavailable</span>
        </div>
        <p className="afk-estimate-empty">{estimate.message}</p>
      </section>
    );
  }

  return (
    <section className="afk-estimate-panel" aria-label="AFK Estimate">
      <div className="menu-section-heading">
        <h2>AFK Estimate</h2>
        <span>{estimate.rating}</span>
      </div>
      <div className="afk-estimate-location">
        <strong>{estimate.mapName}</strong>
        <span>{estimate.subzoneName}</span>
      </div>
      <div className="afk-estimate-grid">
        <AfkEstimateStat
          label="Damage / min"
          tooltipLines={[
            "Estimated party damage per minute before enemy availability limits.",
            "Includes auto attacks, usable attack skills averaged by cooldown, combat role efficiency, role passives, equipment stats, and offensive buff uptime.",
          ]}
          value={formatWhole(estimate.partyDamagePerMinute)}
        />
        <AfkEstimateStat
          label="Kills / hour"
          tooltipLines={[
            "Final deterministic AFK kills for one hour in this subzone.",
            "Uses damage potential, access efficiency, spawn cap, and survivability.",
          ]}
          value={formatWhole(estimate.killsPerHour)}
        />
        <AfkEstimateStat
          label="EXP / min"
          tooltipLines={[
            "Estimated combat XP per minute from the final kill rate.",
            "Uses average enemy XP and the current EXP gain modifiers shown below.",
          ]}
          value={formatWhole(estimate.experiencePerMinute)}
        />
        <AfkEstimateStat
          label="Survivability"
          tooltipLines={[
            "How safely the party can sustain this subzone over AFK time.",
            "Considers enemy pressure against party health, defense, magic defense, block, evasion, regeneration, healing, mitigation, shields, and role survivability.",
            "100% means the party can sustain itself perfectly with flasks and support tools included in the estimate.",
          ]}
          value={`${estimate.survivabilityPercent}%`}
        />
        <AfkEstimateStat
          label="Party kill potential"
          tooltipLines={[
            "Kills per minute from party damage divided by average enemy health.",
            "This is the raw combat result before access downtime, spawn cap, and survivability reduce it.",
          ]}
          value={`${formatDecimal(estimate.partyKillPotentialPerMinute)}/min`}
        />
        <AfkEstimateStat
          label="Access efficiency"
          tooltipLines={[
            "How much combat time remains after AFK movement and targeting losses.",
            "Includes retargeting, moving between enemy packs, party formation catch-up, and the current AFK control efficiency.",
            `${estimate.accessEfficiencyPercent}% means roughly ${estimate.accessEfficiencyPercent}% of time becomes useful combat time before spawn and safety limits.`,
          ]}
          value={`${estimate.accessEfficiencyPercent}%`}
        />
        <AfkEstimateStat
          label="Downtime / kill"
          tooltipLines={[
            "Estimated non-damaging seconds spent per kill.",
            "Covers retargeting, travel between enemy packs, and extra formation delay for larger parties.",
          ]}
          value={`${formatDecimal(estimate.downtimeSecondsPerKill)}s`}
        />
        <AfkEstimateStat
          label="Subzone spawn cap"
          tooltipLines={[
            "Maximum possible kills per minute from enemy count and respawn timing.",
            "This prevents AFK rewards from exceeding what the subzone can actually supply.",
          ]}
          value={`${formatDecimal(estimate.subzoneSpawnCapPerMinute)}/min`}
        />
        <AfkEstimateStat
          label="EXP gain"
          tooltipLines={getMultiplierTooltipLines(
            estimate.combatExperienceMultiplier,
            estimate.combatExperienceMultiplierSources,
          )}
          value={`${formatDecimal(estimate.combatExperienceMultiplier * 100)}%`}
        />
        <AfkEstimateStat
          label="Drop gain"
          tooltipLines={getMultiplierTooltipLines(
            estimate.combatDropMultiplier,
            estimate.combatDropMultiplierSources,
          )}
          value={`${formatDecimal(estimate.combatDropMultiplier * 100)}%`}
        />
        <AfkEstimateStat
          label="Resources / min"
          tooltipLines={[
            "Estimated natural resources gathered per minute from this subzone.",
            "The Gatherer role improves this number. Combat-focused roles do not improve combat AFK resources the same way.",
          ]}
          value={formatDecimal(estimate.resourceEstimatePerMinute)}
        />
      </div>
      <AfkEnemySummary estimate={estimate} />
      <AfkDropSummary estimate={estimate} />
      <AfkWarningList warnings={estimate.warnings} />
      <p className="afk-estimate-footnote">
        Continue rewards use this estimator with the current 30 minute AFK cap.
      </p>
    </section>
  );
}

function AfkEstimateStat({
  label,
  tooltipLines,
  value,
}: {
  label: string;
  tooltipLines?: string[];
  value: string;
}) {
  return (
    <div
      className="afk-estimate-stat"
      tabIndex={tooltipLines && tooltipLines.length > 0 ? 0 : undefined}
    >
      <span className="afk-estimate-stat-label">{label}</span>
      <strong>{value}</strong>
      {tooltipLines && tooltipLines.length > 0 ? (
        <div className="afk-estimate-tooltip" role="tooltip">
          <strong>{label}</strong>
          {tooltipLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getMultiplierTooltipLines(
  totalMultiplier: number,
  sources: AfkCombatMultiplierSource[],
): string[] {
  return [
    `Total: ${formatDecimal(totalMultiplier * 100)}%.`,
    ...sources.map((source) =>
      `${source.label}: ${formatDecimal(source.multiplier * 100)}%. ${source.description}`,
    ),
  ];
}

function AfkEnemySummary({ estimate }: { estimate: AfkCombatEstimate }) {
  return (
    <div className="afk-estimate-detail">
      <h3>Enemies</h3>
      <div className="afk-estimate-enemy-list">
        {estimate.enemies.map((enemy) => (
          <div key={enemy.enemyTypeId} className="afk-estimate-enemy">
            <strong>{enemy.displayName}</strong>
            <span>Lv {enemy.level}</span>
            <small>
              HP {enemy.maxHealth} / ATK {enemy.attack} / DEF {enemy.defense}
            </small>
          </div>
        ))}
      </div>
      <p>
        Resources: {estimate.resources.length > 0
          ? estimate.resources.join(", ")
          : "None"}
      </p>
    </div>
  );
}

function AfkDropSummary({ estimate }: { estimate: AfkCombatEstimate }) {
  return (
    <div className="afk-estimate-detail">
      <h3>Estimated Drops / hour</h3>
      {estimate.estimatedDropsPerHour.length > 0 ? (
        <div className="afk-estimate-enemy-list">
          {estimate.estimatedDropsPerHour.map((drop) => {
            const item = getItemDefinition(drop.itemId);

            return (
              <div key={drop.itemId} className="afk-estimate-enemy">
                <strong>{item.displayName}</strong>
                <span>x{formatWhole(drop.quantityPerHour)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p>None</p>
      )}
    </div>
  );
}

function AfkWarningList({ warnings }: { warnings: AfkCombatEstimateWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="afk-estimate-warnings">
      {warnings.map((warning) => (
        <span key={warning}>{AFK_WARNING_LABELS[warning]}</span>
      ))}
    </div>
  );
}

const AFK_WARNING_LABELS: Record<AfkCombatEstimateWarning, string> = {
  low_damage: "Damage is low for this subzone.",
  low_survivability: "Survivability is below perfect sustain.",
  enemy_data_incomplete: "Some enemy data was estimated.",
  respawn_data_estimated: "Respawn cap uses the prototype respawn timer.",
};

function formatWhole(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString();
}

function formatDecimal(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function OptionsPanel({
  backgroundMusicMuted,
  backgroundMusicVolumePercent,
  saveStatusMessage,
  onChangeBackgroundMusicMuted,
  onChangeBackgroundMusicVolume,
  onExportSave,
  onImportSaveFile,
  onManualSave,
}: {
  backgroundMusicMuted: boolean;
  backgroundMusicVolumePercent: number;
  saveStatusMessage: string | null;
  onChangeBackgroundMusicMuted: (muted: boolean) => void;
  onChangeBackgroundMusicVolume: (volumePercent: number) => void;
  onExportSave: () => void;
  onImportSaveFile: (file: File) => void | Promise<void>;
  onManualSave: () => void;
}) {
  return (
    <section className="options-panel" aria-label="Options">
      <div className="options-audio-settings">
        <label className="options-volume-control">
          <span>Background Music</span>
          <input
            max="100"
            min="0"
            onChange={(event) =>
              onChangeBackgroundMusicVolume(Number(event.currentTarget.value))
            }
            step="1"
            type="range"
            value={backgroundMusicVolumePercent}
          />
          <output>{backgroundMusicVolumePercent}%</output>
        </label>
        <label className="options-mute-control">
          <input
            checked={backgroundMusicMuted}
            onChange={(event) =>
              onChangeBackgroundMusicMuted(event.currentTarget.checked)
            }
            type="checkbox"
          />
          Mute
        </label>
      </div>
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
