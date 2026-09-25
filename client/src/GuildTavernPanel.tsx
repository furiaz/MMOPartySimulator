import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import {
  CLASS_DEFINITIONS,
  getGuildNoticeBoardRerollDisplayState,
  getGuildNoticeBoardRewardPercent,
  getGuildRecruitDestination,
  getGuildRecruitState,
  getGuildNoticeBoardUpgradeStatuses,
  getGuildRecruitUpgradeStatuses,
  getGuildNoticeBoardState,
  getInnRoomUpgradeStatuses,
  getActiveCompanions,
  getCurrencyBalance,
  getEnemyType,
  getGuildSecondaryPartyCount,
  getGuildSecondaryPartyAssignmentDestinations,
  getGuildSecondaryPartyAssignmentPreview,
  getGuildSecondaryPartyDropEfficiency,
  getGuildSecondaryPartyExperienceEfficiency,
  getGuildSecondaryPartyUpgradeStatuses,
  getGuildCompanionCapacity,
  getGuildSecondaryPartiesState,
  getTownServicesLockedMessage,
  INN_KITCHEN_HOUSE_BREAD_RECIPE_ID,
  getInnKitchenUpgradeStatuses,
  getInnKitchenRecipes,
  getInnReserveCompanions,
  getItemDefinition,
  isPartyLeaderNearGuildTavern,
  getPartySizeLimit,
  getPartySizeUnlockRequirement,
  getRestingCompanions,
  getTotalRosterCompanionCount,
  getTotalRosterCompanionLevel,
  SKILL_DEFINITIONS,
  type Companion,
  type GuildRecruitCandidate,
  type GuildNoticeBoardUpgradeId,
  type GuildRecruitUpgradeId,
  type GuildSecondaryPartyAssignmentResult,
  type GuildSecondaryParty,
  type GuildSecondaryPartyAssignmentState,
  type GuildSecondaryPartyUpgradeId,
  type GuildRosterSlotRef,
  type GuildNoticeBoardQuest,
  type InnKitchenRecipeId,
  type InnKitchenUpgradeId,
  type InnRoomUpgradeId,
  type DebugMapId,
  type GameState,
  type ItemId,
  type PartyMemberRole,
  type ResourceType,
} from "./game";
import SpriteAnimation from "./SpriteAnimation";
import {
  getInnRoomEquipmentRows,
  getInnRoomOverview,
  getInnRoomSkillGroups,
  type InnRoomCard,
} from "./innRoomsPresentation";
import {
  formatInnKitchenDuration,
  getInnKitchenBulkCookGroups,
  getInnKitchenCompanionRows,
  getInnKitchenHearthFireDisplay,
  getInnKitchenPantryDisplay,
  getInnKitchenRecipeDisplay,
} from "./innKitchenPresentation";
import { getClassIdleFrameSrc, getEnemyWalkingAnimation } from "./visualAssets";

type GuildTavernSection = "guild" | "inn";
type GuildView =
  | "hall"
  | "recruit"
  | "noticeBoard"
  | "secondaryParties"
  | "rooms"
  | "kitchen"
  | "recruitUpgrades"
  | "noticeBoardUpgrades"
  | "secondaryPartyUpgrades"
  | "roomUpgrades"
  | "kitchenRecipeBook"
  | "kitchenPantry"
  | "kitchenUpgrades";

const MAX_MAIN_PARTY_SLOTS = 5;
const GUILD_INN_PROXIMITY_MESSAGE =
  "Stand near the Guild Coordinator or Inn Keeper to manage Guild & Inn services.";
const GUILD_INN_BROWSE_MESSAGE =
  `${GUILD_INN_PROXIMITY_MESSAGE} You can browse from afar, but actions require proximity.`;

export type GuildSecondaryPartyRedeemSummary = {
  partyName: string;
  mapName: string;
  subzoneName: string;
  elapsedMs: number;
  experienceEfficiency: number;
  dropEfficiency: number;
  result: GuildSecondaryPartyAssignmentResult;
};

export function GuildTavernPanel({
  canUse,
  currentTime,
  recruitResultMessage,
  upgradeResultMessage,
  noticeBoardResultMessage,
  secondaryPartyResultMessage,
  innKitchenResultMessage,
  pantryRequestId,
  state,
  onCancelNoticeBoardQuest,
  onMoveGuildRosterCompanion,
  onOpenNoticeBoard,
  onPurchaseNoticeBoardUpgrade,
  onPurchaseRecruitUpgrade,
  onPurchaseRoomUpgrade,
  onPurchaseKitchenUpgrade,
  onPurchaseSecondaryPartyUpgrade,
  onRecruit,
  onRerollNoticeBoard,
  onTakeNoticeBoardQuest,
  onAssignSecondaryParty,
  onRedeemSecondaryPartyAssignment,
  onReturnSecondaryPartyAssignment,
  onCookInnMeal,
  onSelectInnKitchenRecipe,
  onCycleInnKitchenAutoCook,
  onBulkCookInnMeals,
  onClearSecondaryPartySummary,
  secondaryPartyRedeemSummary,
}: {
  canUse: boolean;
  currentTime: number;
  recruitResultMessage?: string | null;
  upgradeResultMessage?: string | null;
  noticeBoardResultMessage?: string | null;
  secondaryPartyResultMessage?: string | null;
  innKitchenResultMessage?: string | null;
  pantryRequestId?: number;
  secondaryPartyRedeemSummary?: GuildSecondaryPartyRedeemSummary | null;
  state: GameState;
  onCancelNoticeBoardQuest: (slotIndex?: number) => void;
  onMoveGuildRosterCompanion: (
    companionId: string,
    target: GuildRosterSlotRef,
  ) => void;
  onOpenNoticeBoard: () => void;
  onPurchaseNoticeBoardUpgrade: (upgradeId: GuildNoticeBoardUpgradeId) => void;
  onPurchaseRecruitUpgrade: (upgradeId: GuildRecruitUpgradeId) => void;
  onPurchaseRoomUpgrade: (upgradeId: InnRoomUpgradeId) => void;
  onPurchaseKitchenUpgrade: (upgradeId: InnKitchenUpgradeId) => void;
  onPurchaseSecondaryPartyUpgrade: (
    upgradeId: GuildSecondaryPartyUpgradeId,
    partyId?: string | null,
  ) => void;
  onRecruit: (candidateId?: string) => void;
  onRerollNoticeBoard: () => void;
  onTakeNoticeBoardQuest: (slotIndex?: number) => void;
  onAssignSecondaryParty: (
    partyId: string,
    mapId: DebugMapId,
    subzoneId: string,
  ) => void;
  onRedeemSecondaryPartyAssignment: (partyId: string) => void;
  onReturnSecondaryPartyAssignment: (partyId: string) => void;
  onCookInnMeal: (companionId: string, recipeId: InnKitchenRecipeId) => void;
  onSelectInnKitchenRecipe: (
    companionId: string,
    recipeId: InnKitchenRecipeId,
  ) => void;
  onCycleInnKitchenAutoCook: (companionId: string) => void;
  onBulkCookInnMeals: (companionIds: string[], label: string) => void;
  onClearSecondaryPartySummary: () => void;
}) {
  const [activeSection, setActiveSection] =
    useState<GuildTavernSection>("guild");
  const [guildView, setGuildView] = useState<GuildView>("hall");
  const [selectedRosterCompanionId, setSelectedRosterCompanionId] =
    useState<string | null>(null);
  const [selectedInnRoomCompanionId, setSelectedInnRoomCompanionId] =
    useState<string | null>(null);
  const [isInnRoomSelectionLocked, setInnRoomSelectionLocked] =
    useState(false);
  const [selectedKitchenCompanionId, setSelectedKitchenCompanionId] =
    useState<string | null>(null);
  const [recipePickerCompanionId, setRecipePickerCompanionId] =
    useState<string | null>(null);
  const activeCompanions = getActiveCompanions(state);
  const partySizeLimit = getPartySizeLimit(state);
  const rosterCapacity = getGuildCompanionCapacity(state);
  const rosterCount = getTotalRosterCompanionCount(state);
  const totalRosterLevel = getTotalRosterCompanionLevel(state);
  const lockedMessage = getTownServicesLockedMessage(state);
  const isNearGuildInn = isPartyLeaderNearGuildTavern(state);
  const proximityMessage =
    !lockedMessage && !isNearGuildInn ? GUILD_INN_BROWSE_MESSAGE : null;
  const guildRecruit = getGuildRecruitState(state, currentTime);
  const readyRecruitCount = guildRecruit.candidates.filter(Boolean).length;
  const recruitButtonStatus = lockedMessage
    ? "Locked"
    : readyRecruitCount > 0
      ? "Ready"
      : "Waiting";
  const recruitButtonCountdown = formatRecruitButtonCountdown(
    guildRecruit.nextRefreshAtMs,
    currentTime,
  );
  const noticeBoard = getGuildNoticeBoardState(state, currentTime);
  const noticeBoardQuest = noticeBoard.slots[0] ?? null;
  const noticeBoardButtonCountdown = formatRecruitButtonCountdown(
    noticeBoard.nextRefreshAtMs,
    currentTime,
  );
  const noticeBoardButtonStatus = lockedMessage
    ? "Locked"
    : getNoticeBoardButtonStatus(noticeBoardQuest);
  const serviceButtonStatus = lockedMessage ? "Locked" : "Ready";
  const innRoomOverview = getInnRoomOverview(state);
  const kitchenRows = getInnKitchenCompanionRows(state, currentTime);
  const kitchenBulkCookGroups = getInnKitchenBulkCookGroups(state);
  const selectedKitchenRow =
    kitchenRows.find((row) => row.companion.id === selectedKitchenCompanionId) ??
    kitchenRows[0] ??
    null;
  const selectedKitchenRecipeId = selectedKitchenRow
    ? selectedKitchenRow.selectedRecipeId
    : INN_KITCHEN_HOUSE_BREAD_RECIPE_ID;

  useEffect(() => {
    if (!pantryRequestId) {
      return;
    }

    setActiveSection("inn");
    setGuildView("kitchenPantry");
  }, [pantryRequestId]);

  useEffect(() => {
    if (!selectedKitchenCompanionId && kitchenRows.length > 0) {
      setSelectedKitchenCompanionId(kitchenRows[0].companion.id);
      return;
    }

    if (
      selectedKitchenCompanionId &&
      !kitchenRows.some((row) => row.companion.id === selectedKitchenCompanionId)
    ) {
      setSelectedKitchenCompanionId(kitchenRows[0]?.companion.id ?? null);
    }
  }, [kitchenRows, selectedKitchenCompanionId]);

  function showSection(section: GuildTavernSection) {
    setActiveSection(section);
    setGuildView("hall");
  }

  return (
    <section className="guild-tavern-panel" aria-label="Guild and Inn">
      <div className="guild-tavern-header">
        <div>
          <h2>Guild & Inn</h2>
          <span>
            {lockedMessage ? "Locked" : canUse ? "Nearby" : "Browsing"}
          </span>
        </div>
        <dl>
          <div>
            <dt>Active</dt>
            <dd>
              {activeCompanions.length}/{partySizeLimit}
            </dd>
          </div>
          <div>
            <dt>Companions</dt>
            <dd>
              {rosterCount}/{rosterCapacity}
            </dd>
          </div>
          <div>
            <dt>Total Level</dt>
            <dd>
              {totalRosterLevel}
            </dd>
          </div>
        </dl>
      </div>

      {lockedMessage ? (
        <p className="guild-requires-service">{lockedMessage}</p>
      ) : proximityMessage ? (
        <p className="guild-requires-service">{proximityMessage}</p>
      ) : null}

      <div className="guild-tavern-section-nav" role="tablist" aria-label="Guild and Inn sections">
        <button
          aria-selected={activeSection === "guild"}
          className={activeSection === "guild" ? "active" : ""}
          onClick={() => showSection("guild")}
          role="tab"
          type="button"
        >
          <strong>Guild</strong>
          <small>
            {readyRecruitCount > 0 ? `${readyRecruitCount} recruit` : "Recruiting"}
          </small>
        </button>
        <button
          aria-selected={activeSection === "inn"}
          className={activeSection === "inn" ? "active" : ""}
          onClick={() => showSection("inn")}
          role="tab"
          type="button"
        >
          <strong>Inn</strong>
          <small>
            {innRoomOverview.occupiedRooms}/{innRoomOverview.capacity} rooms
          </small>
        </button>
      </div>

      {activeSection === "guild" && guildView === "recruit" ? (
        <GuildRecruitView
          canUse={canUse}
          currentTime={currentTime}
          recruitResultMessage={recruitResultMessage}
          state={state}
          onBack={() => setGuildView("hall")}
          onOpenUpgrades={() => setGuildView("recruitUpgrades")}
          onRecruit={onRecruit}
        />
      ) : activeSection === "guild" && guildView === "noticeBoard" ? (
        <GuildNoticeBoardView
          canUse={canUse}
          currentTime={currentTime}
          noticeBoardResultMessage={noticeBoardResultMessage}
          state={state}
          onBack={() => setGuildView("hall")}
          onCancelQuest={onCancelNoticeBoardQuest}
          onOpenUpgrades={() => setGuildView("noticeBoardUpgrades")}
          onReroll={onRerollNoticeBoard}
          onTakeQuest={onTakeNoticeBoardQuest}
        />
      ) : activeSection === "guild" && guildView === "secondaryParties" ? (
        <GuildSecondaryPartiesView
          canUse={canUse}
          resultMessage={secondaryPartyResultMessage}
          redeemSummary={secondaryPartyRedeemSummary}
          currentTime={currentTime}
          selectedCompanionId={selectedRosterCompanionId}
          state={state}
          onBack={() => setGuildView("hall")}
          onRedeemAssignment={onRedeemSecondaryPartyAssignment}
          onReturnAssignment={onReturnSecondaryPartyAssignment}
          onClearSummary={onClearSecondaryPartySummary}
          onAssign={onAssignSecondaryParty}
          onMoveCompanion={onMoveGuildRosterCompanion}
          onOpenUpgrades={() => setGuildView("secondaryPartyUpgrades")}
          onSelectCompanion={setSelectedRosterCompanionId}
        />
      ) : activeSection === "inn" && guildView === "rooms" ? (
        <InnRoomsView
          canUse={canUse}
          isSelectionLocked={isInnRoomSelectionLocked}
          resultMessage={upgradeResultMessage}
          selectedCompanionId={selectedInnRoomCompanionId}
          state={state}
          onBack={() => {
            setInnRoomSelectionLocked(false);
            setGuildView("hall");
          }}
          onClearSelectionLock={() => setInnRoomSelectionLocked(false)}
          onLockCompanion={(companionId) => {
            setSelectedInnRoomCompanionId(companionId);
            setInnRoomSelectionLocked(true);
          }}
          onOpenUpgrades={() => {
            setInnRoomSelectionLocked(false);
            setGuildView("roomUpgrades");
          }}
          onPreviewCompanion={(companionId) => {
            if (!isInnRoomSelectionLocked) {
              setSelectedInnRoomCompanionId(companionId);
            }
          }}
        />
      ) : activeSection === "inn" && guildView === "kitchen" ? (
        <InnKitchenView
          canUse={canUse}
          currentTime={currentTime}
          resultMessage={innKitchenResultMessage}
          state={state}
          rows={kitchenRows}
          bulkCookGroups={kitchenBulkCookGroups}
          selectedCompanionId={selectedKitchenRow?.companion.id ?? null}
          selectedRecipeId={selectedKitchenRecipeId}
          recipePickerCompanionId={recipePickerCompanionId}
          onBack={() => {
            setRecipePickerCompanionId(null);
            setGuildView("hall");
          }}
          onCook={onCookInnMeal}
          onBulkCook={onBulkCookInnMeals}
          onCloseRecipePicker={() => setRecipePickerCompanionId(null)}
          onOpenRecipePicker={setRecipePickerCompanionId}
          onSelectCompanion={setSelectedKitchenCompanionId}
          onCycleAutoCook={onCycleInnKitchenAutoCook}
          onSelectRecipe={(companionId, recipeId) => {
            onSelectInnKitchenRecipe(companionId, recipeId);
            setRecipePickerCompanionId(null);
          }}
          onOpenRecipeBook={() => setGuildView("kitchenRecipeBook")}
          onOpenPantry={() => setGuildView("kitchenPantry")}
          onOpenUpgrades={() => setGuildView("kitchenUpgrades")}
        />
      ) : activeSection === "inn" && guildView === "kitchenRecipeBook" ? (
        <InnKitchenRecipeBookView
          currentTime={currentTime}
          state={state}
          onBack={() => setGuildView("kitchen")}
        />
      ) : activeSection === "inn" && guildView === "kitchenPantry" ? (
        <InnKitchenPantryView
          state={state}
          onBack={() => setGuildView("kitchen")}
        />
      ) : activeSection === "inn" && guildView === "kitchenUpgrades" ? (
        <InnKitchenUpgradesView
          canUse={canUse}
          currentTime={currentTime}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("kitchen")}
          onPurchase={onPurchaseKitchenUpgrade}
        />
      ) : activeSection === "guild" && guildView === "recruitUpgrades" ? (
        <GuildRecruitUpgradesView
          canUse={canUse}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("recruit")}
          onPurchase={onPurchaseRecruitUpgrade}
        />
      ) : activeSection === "guild" && guildView === "noticeBoardUpgrades" ? (
        <GuildNoticeBoardUpgradesView
          canUse={canUse}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("noticeBoard")}
          onPurchase={onPurchaseNoticeBoardUpgrade}
        />
      ) : activeSection === "guild" && guildView === "secondaryPartyUpgrades" ? (
        <GuildSecondaryPartyUpgradesView
          canUse={canUse}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("secondaryParties")}
          onPurchase={onPurchaseSecondaryPartyUpgrade}
        />
      ) : activeSection === "inn" && guildView === "roomUpgrades" ? (
        <InnRoomUpgradesView
          canUse={canUse}
          resultMessage={upgradeResultMessage}
          state={state}
          onBack={() => setGuildView("rooms")}
          onPurchase={onPurchaseRoomUpgrade}
        />
      ) : (
        <div className="guild-tavern-section">
          <div className="guild-tavern-service-portrait" aria-hidden="true">
            <img
              alt=""
              src={
                activeSection === "guild"
                  ? "/assets/entities/npcs/hub/guild-coordinator.png"
                  : "/assets/entities/npcs/hub/tavern-keeper.png"
              }
            />
          </div>
          <div className="guild-tavern-service-actions">
            <h3>
              {activeSection === "guild" ? "Guild Hall" : "Inn Hearth"}
            </h3>
            <div>
              {activeSection === "guild" ? (
                <>
                  <button
                    onClick={() => setGuildView("recruit")}
                    type="button"
                  >
                    <span>Recruit</span>
                    <span className="guild-recruit-button-timer">
                      {recruitButtonCountdown}
                    </span>
                    <small>{recruitButtonStatus}</small>
                  </button>
                  <button
                    onClick={() => {
                      if (canUse) {
                        onOpenNoticeBoard();
                      }
                      setGuildView("noticeBoard");
                    }}
                    type="button"
                  >
                    <span>Notice Board</span>
                    <span className="guild-recruit-button-timer">
                      {noticeBoardButtonCountdown}
                    </span>
                    <small>{noticeBoardButtonStatus}</small>
                  </button>
                  <button
                    onClick={() => setGuildView("secondaryParties")}
                    type="button"
                  >
                    <span>Field Teams</span>
                    <small>{serviceButtonStatus}</small>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setGuildView("rooms")}
                    type="button"
                  >
                    <span>Rooms</span>
                    <span className="guild-recruit-button-timer">
                      {innRoomOverview.occupiedRooms}/{innRoomOverview.capacity}
                    </span>
                    <small>{serviceButtonStatus}</small>
                  </button>
                  <button
                    onClick={() => setGuildView("kitchen")}
                    type="button"
                  >
                    <span>Kitchen</span>
                    <small>{serviceButtonStatus}</small>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GuildInnRequirementMessage() {
  return (
    <p className="guild-recruit-message guild-requires-service">
      {GUILD_INN_PROXIMITY_MESSAGE}
    </p>
  );
}

function getGuildMessageClassName(message: string | null | undefined): string {
  return isGuildRequirementMessage(message)
    ? "guild-recruit-message guild-requires-service"
    : "guild-recruit-message";
}

function isGuildRequirementMessage(message: string | null | undefined): boolean {
  return Boolean(
    message &&
      (message === GUILD_INN_PROXIMITY_MESSAGE ||
        message === GUILD_INN_BROWSE_MESSAGE ||
        message.startsWith("Complete The Azure Trial")),
  );
}

function InnRoomsView({
  canUse,
  isSelectionLocked,
  resultMessage,
  selectedCompanionId,
  state,
  onBack,
  onClearSelectionLock,
  onLockCompanion,
  onOpenUpgrades,
  onPreviewCompanion,
}: {
  canUse: boolean;
  isSelectionLocked: boolean;
  resultMessage?: string | null;
  selectedCompanionId: string | null;
  state: GameState;
  onBack: () => void;
  onClearSelectionLock: () => void;
  onLockCompanion: (companionId: string) => void;
  onOpenUpgrades: () => void;
  onPreviewCompanion: (companionId: string | null) => void;
}) {
  const overview = getInnRoomOverview(state);
  const firstCompanionCard = overview.cards.find(
    (card): card is Extract<InnRoomCard, { kind: "companion" }> =>
      card.kind === "companion",
  );
  const selectedCard =
    overview.cards.find(
      (card): card is Extract<InnRoomCard, { kind: "companion" }> =>
        card.kind === "companion" && card.companion.id === selectedCompanionId,
    ) ??
    firstCompanionCard ??
    null;

  return (
    <div
      className="guild-inn-rooms-view"
      onClick={(event) => {
        if (
          event.target instanceof HTMLElement &&
          !event.target.closest("button")
        ) {
          onClearSelectionLock();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onClearSelectionLock();
      }}
    >
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
        <button onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>
      <div className="guild-roster-topline">
        <div>
          <span className="guild-recruit-kicker">Inn Rooms</span>
          <h3>
            Rooms {overview.occupiedRooms}/{overview.capacity}
          </h3>
        </div>
      </div>
      {!canUse ? (
        <GuildInnRequirementMessage />
      ) : null}
      {resultMessage ? (
        <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
      ) : null}
      {overview.isOverCapacity ? (
        <p className="guild-recruit-message">
          Inn is over room capacity. All companions are still shown.
        </p>
      ) : null}
      <div className="guild-inn-rooms-layout">
        <div
          className="guild-inn-room-grid-panel"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClearSelectionLock();
            }
          }}
        >
          <div className="guild-inn-room-grid">
            {overview.cards.map((card) => (
              <InnRoomCardButton
                card={card}
                isSelectionLocked={isSelectionLocked}
                isSelected={
                  card.kind === "companion" &&
                  selectedCard?.companion.id === card.companion.id
                }
                key={`${card.kind}-${card.slotNumber}-${
                  card.kind === "companion" ? card.companion.id : "empty"
                }`}
                onClearSelectionLock={onClearSelectionLock}
                onLockCompanion={onLockCompanion}
                onPreviewCompanion={onPreviewCompanion}
              />
            ))}
          </div>
        </div>
        <InnRoomDetailsPanel selectedCard={selectedCard} />
      </div>
    </div>
  );
}

function InnRoomCardButton({
  card,
  isSelectionLocked,
  isSelected,
  onClearSelectionLock,
  onLockCompanion,
  onPreviewCompanion,
}: {
  card: InnRoomCard;
  isSelectionLocked: boolean;
  isSelected: boolean;
  onClearSelectionLock: () => void;
  onLockCompanion: (companionId: string) => void;
  onPreviewCompanion: (companionId: string | null) => void;
}) {
  if (card.kind === "empty") {
    return (
      <button
        className="guild-inn-room-card empty"
        onClick={() => {
          onPreviewCompanion(null);
          onClearSelectionLock();
        }}
        type="button"
      >
        <span className="guild-inn-room-number">Room {card.slotNumber}</span>
        <strong>Empty Room</strong>
        <small>Available</small>
      </button>
    );
  }

  const classDefinition = CLASS_DEFINITIONS[card.companion.classId];
  const idleFrameSrc = getClassIdleFrameSrc(card.companion.classId);

  return (
    <button
      className={`guild-inn-room-card ${card.visualState}${
        isSelected ? " selected" : ""
      }${isSelected && isSelectionLocked ? " locked-selection" : ""}`}
      onClick={() => onLockCompanion(card.companion.id)}
      onMouseEnter={() => {
        if (!isSelectionLocked) {
          onPreviewCompanion(card.companion.id);
        }
      }}
      title={card.locationLabel}
      type="button"
    >
      <span className="guild-inn-room-number">Room {card.slotNumber}</span>
      <span className="guild-roster-companion-sprite" aria-hidden="true">
        {idleFrameSrc ? <img alt="" src={idleFrameSrc} /> : null}
      </span>
      <strong>
        Lv {card.companion.characterLevel}{" "}
        {classDefinition?.displayName ?? card.companion.classId}
      </strong>
      <small>{card.statusLabel}</small>
      {card.badgeText ? (
        <span className="guild-inn-room-badge">{card.badgeText}</span>
      ) : null}
    </button>
  );
}

function InnRoomDetailsPanel({
  selectedCard,
}: {
  selectedCard: Extract<InnRoomCard, { kind: "companion" }> | null;
}) {
  if (!selectedCard) {
    return (
      <aside className="guild-inn-room-details">
        <span className="guild-recruit-kicker">Companion Details</span>
        <h3>Select a room</h3>
        <p className="guild-recruit-message">
          Empty rooms are available for future companions.
        </p>
      </aside>
    );
  }

  const { companion } = selectedCard;
  const classDefinition = CLASS_DEFINITIONS[companion.classId];
  const equipmentRows = getInnRoomEquipmentRows(companion);
  const skillGroups = getInnRoomSkillGroups(companion);

  return (
    <aside className="guild-inn-room-details">
      <span className="guild-recruit-kicker">Companion Details</span>
      <h3>{companion.id}</h3>
      <dl className="guild-inn-room-detail-list">
        <div>
          <dt>Status</dt>
          <dd>{selectedCard.statusLabel}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{companion.characterLevel}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd>{classDefinition?.displayName ?? companion.classId}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{getRoleLabel(companion.role)}</dd>
        </div>
        <div>
          <dt>HP</dt>
          <dd>
            {companion.health}/{companion.maxHealth}
          </dd>
        </div>
      </dl>

      <section className="guild-inn-room-detail-section">
        <h4>Equipment</h4>
        <div className="guild-inn-room-equipment-list">
          {equipmentRows.map((row) => (
            <div key={row.slot}>
              <span>{row.label}</span>
              <strong>{row.itemName}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="guild-inn-room-detail-section">
        <h4>Skills</h4>
        {skillGroups.length > 0 ? (
          <div className="guild-inn-room-skill-groups">
            {skillGroups.map((group) => (
              <div key={group.classId} className="guild-inn-room-skill-group">
                <strong>{group.className}</strong>
                {group.skills.map((skill) => (
                  <div key={skill.skillId}>
                    <span>{skill.enabled ? "[ON]" : "[OFF]"}</span>
                    <span>
                      {skill.displayName} Lv {skill.rank}/{skill.maxRank}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <span className="party-menu-empty">No known skills</span>
        )}
      </section>
    </aside>
  );
}

function InnKitchenView({
  canUse,
  currentTime,
  resultMessage,
  state,
  rows,
  bulkCookGroups,
  selectedCompanionId,
  selectedRecipeId,
  recipePickerCompanionId,
  onBack,
  onCloseRecipePicker,
  onCook,
  onBulkCook,
  onOpenRecipePicker,
  onOpenRecipeBook,
  onOpenPantry,
  onOpenUpgrades,
  onSelectCompanion,
  onSelectRecipe,
  onCycleAutoCook,
}: {
  canUse: boolean;
  currentTime: number;
  resultMessage?: string | null;
  state: GameState;
  rows: ReturnType<typeof getInnKitchenCompanionRows>;
  bulkCookGroups: ReturnType<typeof getInnKitchenBulkCookGroups>;
  selectedCompanionId: string | null;
  selectedRecipeId: InnKitchenRecipeId;
  recipePickerCompanionId: string | null;
  onBack: () => void;
  onCloseRecipePicker: () => void;
  onCook: (companionId: string, recipeId: InnKitchenRecipeId) => void;
  onBulkCook: (companionIds: string[], label: string) => void;
  onOpenRecipePicker: (companionId: string) => void;
  onOpenRecipeBook: () => void;
  onOpenPantry: () => void;
  onOpenUpgrades: () => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectRecipe: (companionId: string, recipeId: InnKitchenRecipeId) => void;
  onCycleAutoCook: (companionId: string) => void;
}) {
  const selectedRow =
    rows.find((row) => row.companion.id === selectedCompanionId) ?? null;
  const selectedRecipeDisplay = getInnKitchenRecipeDisplay(selectedRecipeId, state);
  const recipes = getInnKitchenRecipes();
  const hearthFire = getInnKitchenHearthFireDisplay(state, currentTime);
  const activeMealRecipe = selectedRow?.activeMeal
    ? getInnKitchenRecipeDisplay(selectedRow.activeMeal.recipeId, state)
    : null;
  const remainingMealDuration = selectedRow?.activeMeal
    ? formatInnKitchenDuration(selectedRow.activeMeal.expiresAtMs - currentTime)
    : null;

  return (
    <div className="guild-inn-kitchen-view">
      <div className="guild-roster-topline">
        <div>
          <span className="guild-recruit-kicker">Inn Kitchen</span>
          <h3>Kitchen</h3>
        </div>
        <button onClick={onBack} type="button">
          Back
        </button>
      </div>
      {!canUse ? (
        <GuildInnRequirementMessage />
      ) : null}
      {resultMessage ? (
        <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
      ) : null}
      <div className="guild-inn-kitchen-status-bar">
        <div title={hearthFire.tooltip}>
          <strong>Hearth&apos;s Fire</strong>
          <span>
            {hearthFire.current.toFixed(1)} / {hearthFire.capacity.toFixed(1)}
          </span>
          <small>{hearthFire.generationPerHour.toFixed(1)} Fire/hour</small>
        </div>
        <button onClick={onOpenRecipeBook} type="button">
          Recipe Book
        </button>
        <button onClick={onOpenPantry} type="button">
          Pantry
        </button>
        <button onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>
      {bulkCookGroups.length > 0 ? (
        <div className="guild-inn-kitchen-bulk-actions" aria-label="Bulk cooking">
          {bulkCookGroups.map((group) => (
            <button
              disabled={!canUse || group.isAssigned}
              key={group.id}
              onClick={() => onBulkCook(group.companionIds, group.label)}
              title={group.costTitle}
              type="button"
            >
              {group.isAssigned ? group.label.replace("Cook ", "") + " Dispatched" : group.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="guild-inn-kitchen-layout">
        <div className="guild-inn-kitchen-list" aria-label="Kitchen companions">
          {rows.length > 0 ? (
            rows.map((row) => {
              const rowRecipe = getInnKitchenRecipeDisplay(row.selectedRecipeId, state);
              const classDefinition = CLASS_DEFINITIONS[row.companion.classId];
              const idleFrameSrc = getClassIdleFrameSrc(row.companion.classId);
              const activeMealText = row.activeMeal
                ? formatInnKitchenDuration(row.activeMeal.expiresAtMs - currentTime)
                : "No meal";
              const autoCookStatusText = row.isHubEligible
                ? activeMealText
                : row.locationLabel.startsWith("Dispatched")
                  ? "Dispatched"
                  : "Away from hub";

              return (
                <div
                  className={`guild-inn-kitchen-row${
                    selectedRow?.companion.id === row.companion.id
                      ? " selected"
                      : ""
                  }`}
                  key={row.companion.id}
                >
                  <button
                    className="guild-inn-kitchen-companion"
                    onClick={() => onSelectCompanion(row.companion.id)}
                    type="button"
                  >
                    <span className="guild-roster-companion-sprite" aria-hidden="true">
                      {idleFrameSrc ? <img alt="" src={idleFrameSrc} /> : null}
                    </span>
                    <span>
                      Lv {row.companion.characterLevel}{" "}
                      {classDefinition?.displayName ?? row.companion.classId}
                    </span>
                    <small>Role: {getRoleLabel(row.companion.role)}</small>
                    <small>{row.locationLabel}</small>
                    {row.badgeText ? (
                      <strong aria-label={row.locationLabel}>{row.badgeText}</strong>
                    ) : null}
                  </button>
                  <button
                    className="guild-inn-kitchen-recipe-button"
                    onClick={() => {
                      onSelectCompanion(row.companion.id);
                      onOpenRecipePicker(row.companion.id);
                    }}
                    type="button"
                  >
                    <span>{rowRecipe.recipe.displayName}</span>
                    <small>{rowRecipe.effectText}</small>
                  </button>
                  <button
                    aria-pressed={row.autoCookEnabled}
                    className="guild-inn-kitchen-auto-toggle"
                    onClick={() => onCycleAutoCook(row.companion.id)}
                    title="Cycle Auto-cook: Off, On 25%, On 50%, On 75%, On 90%"
                    type="button"
                  >
                    <span>Auto-cook</span>
                    <strong>
                      {row.autoCookEnabled
                        ? `On ${row.autoCookRenewThresholdPercent}%`
                        : "Off"}
                    </strong>
                    <small>{autoCookStatusText}</small>
                    {row.autoCookFailure ? (
                      <small className="guild-requires-service">
                        Missing{" "}
                        {formatKitchenMissingResources(
                          row.autoCookFailure.missingCrowns,
                          row.autoCookFailure.missingHearthFire,
                        )}
                      </small>
                    ) : null}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="guild-recruit-message">No companions recruited.</p>
          )}
        </div>
        <aside className="guild-inn-kitchen-details">
          {selectedRow ? (
            <>
              <span className="guild-recruit-kicker">Selected Meal</span>
              <h3>{selectedRecipeDisplay.recipe.displayName}</h3>
              <p>{selectedRecipeDisplay.recipe.description}</p>
              <dl className="guild-inn-room-detail-list">
                <div>
                  <dt>Companion</dt>
                  <dd>{selectedRow.companion.id}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedRow.locationLabel}</dd>
                </div>
                <div>
                  <dt>Effect</dt>
                  <dd>{selectedRecipeDisplay.effectText}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{selectedRecipeDisplay.durationText}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{selectedRecipeDisplay.costText}</dd>
                </div>
                <div>
                  <dt>Hearth&apos;s Fire</dt>
                  <dd>{selectedRecipeDisplay.hearthFireCostText}</dd>
                </div>
                <div>
                  <dt>Ingredients</dt>
                  <dd>{selectedRecipeDisplay.ingredientText}</dd>
                </div>
              </dl>
              {activeMealRecipe && remainingMealDuration ? (
                <p className="guild-recruit-message">
                  Active: {activeMealRecipe.recipe.displayName} -{" "}
                  {activeMealRecipe.effectText} - {remainingMealDuration}
                </p>
              ) : (
                <p className="guild-recruit-message">No active Inn meal.</p>
              )}
              <div className="guild-inn-kitchen-cook-row">
                <span>Cost: {selectedRecipeDisplay.costText}</span>
                <span>Fire: {selectedRecipeDisplay.hearthFireCostText}</span>
                <span>Ingredients: {selectedRecipeDisplay.ingredientText}</span>
                <button
                  disabled={!canUse || !selectedRow.isHubEligible}
                  onClick={() =>
                    onCook(selectedRow.companion.id, selectedRecipeId)
                  }
                  type="button"
                >
                  Cook now
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="guild-recruit-kicker">Selected Meal</span>
              <h3>No companion</h3>
              <p className="guild-recruit-message">
                Recruit companions before preparing Inn meals.
              </p>
            </>
          )}
        </aside>
      </div>
      {recipePickerCompanionId ? (
        <div
          className="guild-inn-recipe-picker-layer"
          onClick={onCloseRecipePicker}
          role="presentation"
        >
          <div
            className="guild-inn-recipe-picker"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="guild-roster-topline">
              <div>
                <span className="guild-recruit-kicker">Recipe Selection</span>
                <h3>Choose Recipe</h3>
              </div>
              <button onClick={onCloseRecipePicker} type="button">
                Close
              </button>
            </div>
            <div className="guild-inn-recipe-picker-layout">
              <div className="guild-inn-recipe-list">
                {recipes.map((recipe) => {
                  const display = getInnKitchenRecipeDisplay(recipe.id, state);

                  return (
                    <button
                      key={recipe.id}
                      onClick={() => onSelectRecipe(recipePickerCompanionId, recipe.id)}
                      type="button"
                    >
                      <span>{recipe.displayName}</span>
                      <small>{display.effectText}</small>
                    </button>
                  );
                })}
              </div>
              <div className="guild-inn-recipe-detail">
                {recipes.map((recipe) => {
                  const display = getInnKitchenRecipeDisplay(recipe.id, state);

                  return (
                    <section key={recipe.id}>
                      <h4>{recipe.displayName}</h4>
                      <p>{recipe.description}</p>
                      <dl className="guild-inn-room-detail-list">
                        <div>
                          <dt>Effect</dt>
                          <dd>{display.effectText}</dd>
                        </div>
                        <div>
                          <dt>Cost</dt>
                          <dd>{display.costText}</dd>
                        </div>
                        <div>
                          <dt>Hearth&apos;s Fire</dt>
                          <dd>{display.hearthFireCostText}</dd>
                        </div>
                        <div>
                          <dt>Ingredients</dt>
                          <dd>{display.ingredientText}</dd>
                        </div>
                      </dl>
                      <div className="guild-inn-recipe-salt-placeholder">
                        <strong>Salt Booster</strong>
                        <span>Coming soon</span>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InnKitchenRecipeBookView({
  currentTime,
  state,
  onBack,
}: {
  currentTime: number;
  state: GameState;
  onBack: () => void;
}) {
  const hearthFire = getInnKitchenHearthFireDisplay(state, currentTime);
  const recipes = getInnKitchenRecipes();

  return (
    <div className="guild-inn-kitchen-view">
      <div className="guild-roster-topline">
        <div>
          <span className="guild-recruit-kicker">Inn Kitchen</span>
          <h3>Recipe Book</h3>
        </div>
        <button onClick={onBack} type="button">
          Back
        </button>
      </div>
      <div className="guild-inn-kitchen-status-bar">
        <div title={hearthFire.tooltip}>
          <strong>Hearth&apos;s Fire</strong>
          <span>
            {hearthFire.current.toFixed(1)} / {hearthFire.capacity.toFixed(1)}
          </span>
          <small>{hearthFire.generationPerHour.toFixed(1)} Fire/hour</small>
        </div>
      </div>
      <div className="guild-inn-recipe-book-list">
        {recipes.map((recipe) => {
          const display = getInnKitchenRecipeDisplay(recipe.id, state);

          return (
            <article key={recipe.id}>
              <div>
                <strong>{recipe.displayName}</strong>
                <span>Tier {recipe.tier}</span>
              </div>
              <p>{recipe.description}</p>
              <dl className="guild-inn-room-detail-list">
                <div>
                  <dt>Effect</dt>
                  <dd>{display.effectText}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{display.durationText}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{display.costText}</dd>
                </div>
                <div>
                  <dt>Hearth&apos;s Fire</dt>
                  <dd>{display.hearthFireCostText}</dd>
                </div>
                <div>
                  <dt>Ingredients</dt>
                  <dd>{display.ingredientText}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function InnKitchenPantryView({
  state,
  onBack,
}: {
  state: GameState;
  onBack: () => void;
}) {
  const pantry = getInnKitchenPantryDisplay(state);

  return (
    <div className="guild-inn-kitchen-view">
      <div className="guild-roster-topline">
        <div>
          <span className="guild-recruit-kicker">Inn Kitchen</span>
          <h3>Pantry</h3>
        </div>
        <button onClick={onBack} type="button">
          Back
        </button>
      </div>
      {pantry.ingredientGroups.length > 0 ? (
        <div className="guild-inn-pantry-list">
          {pantry.ingredientGroups.map((group) => (
            <section key={group.groupName}>
              <h4>{group.groupName}</h4>
              {group.ingredients.map((ingredient) => (
                <div key={ingredient.ingredientId}>
                  <span>{ingredient.isUnlocked ? ingredient.displayName : "???"}</span>
                  <strong>{ingredient.quantity.toLocaleString()}</strong>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p className="guild-recruit-message">{pantry.emptyText}</p>
      )}
    </div>
  );
}

function InnKitchenUpgradesView({
  canUse,
  currentTime,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  currentTime: number;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (upgradeId: InnKitchenUpgradeId) => void;
}) {
  const crowns = getCurrencyBalance(state.wallet, "crowns");
  const hearthFire = getInnKitchenHearthFireDisplay(state, currentTime);
  const upgradeStatuses = getInnKitchenUpgradeStatuses(state);

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Inn Investment</span>
            <h3>Kitchen Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()} | Hearth&apos;s Fire:{" "}
            {hearthFire.current.toFixed(1)}/{hearthFire.capacity.toFixed(1)}
          </strong>
        </div>

        {!canUse ? (
          <GuildInnRequirementMessage />
        ) : null}
        {resultMessage ? (
          <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {upgradeStatuses.map((upgrade) => (
            <GuildUpgradeRow
              canUse={canUse}
              key={upgrade.id}
              upgrade={upgrade}
              onPurchase={() => onPurchase(upgrade.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function formatKitchenMissingResources(
  missingCrowns: number,
  missingHearthFire: number,
): string {
  const parts: string[] = [];

  if (missingCrowns > 0) {
    parts.push(`${missingCrowns} Crowns`);
  }

  if (missingHearthFire > 0) {
    parts.push(`${missingHearthFire.toFixed(1)} Fire`);
  }

  return parts.length > 0 ? parts.join(" and ") : "resources";
}

function GuildRecruitView({
  canUse,
  currentTime,
  recruitResultMessage,
  state,
  onBack,
  onOpenUpgrades,
  onRecruit,
}: {
  canUse: boolean;
  currentTime: number;
  recruitResultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onOpenUpgrades: () => void;
  onRecruit: (candidateId?: string) => void;
}) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const guildRecruit = getGuildRecruitState(state, currentTime);
  const candidates = guildRecruit.candidates;
  const candidate =
    candidates.find((item) => item?.id === selectedCandidateId) ??
    candidates.find(Boolean) ??
    null;
  const destination = getGuildRecruitDestination(state);
  const classDefinition = candidate
    ? CLASS_DEFINITIONS[candidate.classId]
    : null;
  const idleFrameSrc = candidate
    ? getClassIdleFrameSrc(candidate.classId)
    : null;
  const recruitDisabled = !canUse || !candidate || destination === "blocked_full";
  const blockedText = !canUse
    ? GUILD_INN_PROXIMITY_MESSAGE
    : !candidate
      ? `Next recruit in ${formatRecruitCountdown(
          guildRecruit.nextRefreshAtMs,
          currentTime,
        )}`
      : destination === "blocked_full"
        ? "No active slot or Inn room."
        : null;

  return (
    <div className="guild-recruit-view">
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
        <button onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>

      <div className="guild-recruit-card">
        <div className="guild-recruit-slot-list" aria-label="Recruit slots">
          {candidates.map((slotCandidate, index) => (
            <button
              className={
                candidate?.id === slotCandidate?.id
                  ? "guild-recruit-slot selected"
                  : "guild-recruit-slot"
              }
              disabled={!slotCandidate}
              key={slotCandidate?.id ?? `empty-${index}`}
              onClick={() => setSelectedCandidateId(slotCandidate?.id ?? null)}
              type="button"
            >
              <strong>Slot {index + 1}</strong>
              <span>
                {slotCandidate
                  ? `Lv ${slotCandidate.characterLevel} ${
                      CLASS_DEFINITIONS[slotCandidate.classId]?.displayName ??
                      slotCandidate.classId
                    }`
                  : "Empty"}
              </span>
              <small>
                {slotCandidate
                  ? "Available"
                  : `Refresh ${formatRecruitCountdown(
                      guildRecruit.nextRefreshAtMs,
                      currentTime,
                    )}`}
              </small>
            </button>
          ))}
        </div>

        <div className="guild-recruit-details">
          <span className="guild-recruit-kicker">Available Recruit</span>
          {candidate && classDefinition ? (
            <>
              <h3>
                Level {candidate.characterLevel} {classDefinition.displayName}
              </h3>
              <dl>
                <div>
                  <dt>Role</dt>
                  <dd>None / Unassigned</dd>
                </div>
                <div>
                  <dt>Gear</dt>
                  <dd>{formatCandidateGear(candidate)}</dd>
                </div>
                <div>
                  <dt>Skills</dt>
                  <dd>{formatCandidateSkills(candidate)}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{getDestinationLabel(destination)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <h3>No recruit available</h3>
              <p>
                Next recruit in{" "}
                {formatRecruitCountdown(guildRecruit.nextRefreshAtMs, currentTime)}.
              </p>
            </>
          )}
          {blockedText ? (
            <p className={getGuildMessageClassName(blockedText)}>{blockedText}</p>
          ) : null}
          {recruitResultMessage ? (
            <p className={getGuildMessageClassName(recruitResultMessage)}>
              {recruitResultMessage}
            </p>
          ) : null}
          <button
            disabled={recruitDisabled}
            onClick={() => {
              if (candidate) {
                onRecruit(candidate.id);
              }
            }}
            type="button"
          >
            Recruit
          </button>
        </div>

        <div className="guild-recruit-sprite-frame" aria-hidden={!idleFrameSrc}>
          {idleFrameSrc ? (
            <img
              alt={`${classDefinition?.displayName ?? "Recruit"} idle sprite`}
              src={idleFrameSrc}
            />
          ) : (
            <span>Waiting</span>
          )}
        </div>
      </div>
    </div>
  );
}

function GuildNoticeBoardView({
  canUse,
  currentTime,
  noticeBoardResultMessage,
  state,
  onBack,
  onCancelQuest,
  onOpenUpgrades,
  onReroll,
  onTakeQuest,
}: {
  canUse: boolean;
  currentTime: number;
  noticeBoardResultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onCancelQuest: (slotIndex?: number) => void;
  onOpenUpgrades: () => void;
  onReroll: () => void;
  onTakeQuest: (slotIndex?: number) => void;
}) {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const board = getGuildNoticeBoardState(state, currentTime);
  const rerollState = getGuildNoticeBoardRerollDisplayState(state, currentTime);
  const quest = board.slots[selectedSlotIndex] ?? null;
  const isAvailable = quest?.status === "available";
  const isTaken = quest?.status === "taken";
  const isDone = quest?.status === "done";
  const actionDisabled = !canUse || !quest || isDone;
  const takeButtonLabel = isTaken
    ? "Taken"
    : quest && isDone
      ? getNoticeBoardQuestStatusLabel(quest)
      : "Take Quest";
  const statusText = !canUse
    ? GUILD_INN_PROXIMITY_MESSAGE
    : quest
      ? getNoticeBoardQuestStatusLabel(quest)
      : `Next posting in ${formatRecruitCountdown(
          board.nextRefreshAtMs,
          currentTime,
        )}`;
  const rerollDisabled = !canUse || !rerollState.isUnlocked || rerollState.remaining <= 0;

  useEffect(() => {
    if (selectedSlotIndex >= board.slots.length) {
      setSelectedSlotIndex(0);
    }
  }, [board.slots.length, selectedSlotIndex]);

  return (
    <div className="guild-notice-board-view">
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
        <button onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>

      <div className="guild-notice-board-card">
        <div className="guild-notice-board-topline">
          <div>
            <span className="guild-recruit-kicker">Notice Board</span>
            <h3>Guild Postings</h3>
          </div>
          {rerollState.isUnlocked ? (
            <button
              disabled={rerollDisabled}
              onClick={onReroll}
              title={rerollState.sourceTooltipText}
              type="button"
            >
              Reroll {rerollState.remaining}/{rerollState.dailyLimit}
            </button>
          ) : (
            <small title={rerollState.sourceTooltipText}>
              Scouts or Wolf helper locked
            </small>
          )}
        </div>

        {rerollState.isUnlocked ? (
          <p className="guild-recruit-message">
            Rerolls reset at {new Date(rerollState.nextResetAtMs).toLocaleTimeString()}.
          </p>
        ) : null}

        {!canUse ? (
          <GuildInnRequirementMessage />
        ) : null}

        <div className="guild-notice-board-slots" aria-label="Notice Board postings">
          {board.slots.map((slot, index) => (
            <button
              className={
                selectedSlotIndex === index
                  ? "guild-notice-board-slot selected"
                  : "guild-notice-board-slot"
              }
              key={slot?.id ?? `notice-slot-${index}`}
              onClick={() => setSelectedSlotIndex(index)}
              type="button"
            >
              <strong>
                <span aria-hidden="true">!</span>
                Slot {index + 1}
              </strong>
              <span>{slot?.title ?? "No posting"}</span>
              <small>
                {slot ? getNoticeBoardQuestStatusLabel(slot) : statusText}
              </small>
            </button>
          ))}
        </div>

        {quest ? (
          <div className="guild-notice-board-detail">
            <div className="guild-notice-board-summary">
              <div>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{getNoticeBoardQuestStatusLabel(quest)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>Exterminate</dd>
                  </div>
                </dl>
              </div>
              <div className="guild-notice-board-monsters" aria-label="Quest targets">
                {quest.objectives.map((objective) => {
                  const enemyType = getEnemyType(objective.enemyTypeId);
                  const enemyDisplayName =
                    enemyType?.displayName ?? objective.enemyTypeId;
                  const animation = getEnemyWalkingAnimation(
                    objective.enemyTypeId,
                    "east",
                  );

                  return (
                    <div key={objective.id}>
                      <SpriteAnimation
                        alt={`${enemyDisplayName} walking east`}
                        animation={animation}
                        currentTime={currentTime}
                      />
                      <span>{enemyDisplayName}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="guild-notice-board-objectives">
              <strong>Objectives</strong>
              {quest.objectives.map((objective) => {
                const enemyType = getEnemyType(objective.enemyTypeId);
                const enemyDisplayName =
                  enemyType?.displayName ?? objective.enemyTypeId;
                return (
                  <span key={objective.id}>
                    Kill {enemyDisplayName}: {objective.currentCount}/
                    {objective.requiredCount}
                  </span>
                );
              })}
            </div>

            <div className="guild-notice-board-rewards">
              <strong>Rewards</strong>
              <span>{formatNoticeBoardRewards(state, quest)}</span>
            </div>

            {noticeBoardResultMessage ? (
              <p className={getGuildMessageClassName(noticeBoardResultMessage)}>
                {noticeBoardResultMessage}
              </p>
            ) : null}

            <div className="guild-notice-board-actions">
              <button
                disabled={actionDisabled || !isAvailable}
                onClick={() => onTakeQuest(selectedSlotIndex)}
                type="button"
              >
                {takeButtonLabel}
              </button>
              <button
                disabled={!canUse || !isTaken}
                onClick={() => onCancelQuest(selectedSlotIndex)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="guild-recruit-message">
            No quest is posted. Next posting in{" "}
            {formatRecruitCountdown(board.nextRefreshAtMs, currentTime)}.
          </p>
        )}
      </div>
    </div>
  );
}

function GuildRecruitUpgradesView({
  canUse,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (upgradeId: GuildRecruitUpgradeId) => void;
}) {
  const upgradeStatuses = getGuildRecruitUpgradeStatuses(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Guild Investment</span>
            <h3>Recruit Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <GuildInnRequirementMessage />
        ) : null}
        {resultMessage ? (
          <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {upgradeStatuses.map((upgrade) => {
            const purchaseDisabled =
              !canUse ||
              upgrade.isLocked ||
              upgrade.isMaxLevel ||
              !upgrade.canAfford;
            const statusText = upgrade.isLocked
              ? upgrade.lockReason
              : upgrade.isMaxLevel
                ? "Max"
                : upgrade.canAfford
                  ? `${upgrade.nextCostCrowns} Crowns`
                  : `Need ${upgrade.nextCostCrowns} Crowns`;

            return (
              <article className="guild-upgrade-row" key={upgrade.id}>
                <div>
                  <strong>{upgrade.displayName}</strong>
                  <span>Lv {upgrade.level}</span>
                </div>
                <p>{upgrade.description}</p>
                <dl>
                  <div>
                    <dt>Current</dt>
                    <dd>{upgrade.currentEffect}</dd>
                  </div>
                  <div>
                    <dt>Next</dt>
                    <dd>{upgrade.nextEffect ?? "Max"}</dd>
                  </div>
                </dl>
                <button
                  disabled={purchaseDisabled}
                  onClick={() => onPurchase(upgrade.id)}
                  type="button"
                >
                  {statusText}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GuildNoticeBoardUpgradesView({
  canUse,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (upgradeId: GuildNoticeBoardUpgradeId) => void;
}) {
  const upgradeStatuses = getGuildNoticeBoardUpgradeStatuses(state);
  const crowns = getCurrencyBalance(state.wallet, "crowns");

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Guild Investment</span>
            <h3>Notice Board Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <GuildInnRequirementMessage />
        ) : null}
        {resultMessage ? (
          <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {upgradeStatuses.map((upgrade) => {
            const purchaseDisabled =
              !canUse ||
              upgrade.isLocked ||
              upgrade.isMaxLevel ||
              !upgrade.canAfford;
            const statusText = upgrade.isLocked
              ? upgrade.lockReason
              : upgrade.isMaxLevel
                ? "Max"
                : upgrade.canAfford
                  ? `${upgrade.nextCostCrowns} Crowns`
                  : `Need ${upgrade.nextCostCrowns} Crowns`;

            return (
              <article className="guild-upgrade-row" key={upgrade.id}>
                <div>
                  <strong>{upgrade.displayName}</strong>
                  <span>Lv {upgrade.level}</span>
                </div>
                <p>{upgrade.description}</p>
                <dl>
                  <div>
                    <dt>Current</dt>
                    <dd>{upgrade.currentEffect}</dd>
                  </div>
                  <div>
                    <dt>Next</dt>
                    <dd>{upgrade.nextEffect ?? "Max"}</dd>
                  </div>
                </dl>
                <button
                  disabled={purchaseDisabled}
                  onClick={() => onPurchase(upgrade.id)}
                  type="button"
                >
                  {statusText}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GuildSecondaryPartyUpgradesView({
  canUse,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (
    upgradeId: GuildSecondaryPartyUpgradeId,
    partyId?: string | null,
  ) => void;
}) {
  const crowns = getCurrencyBalance(state.wallet, "crowns");
  const partyCountStatuses = getGuildSecondaryPartyUpgradeStatuses(state);
  const secondaryParties = getGuildSecondaryPartiesState(state);
  const unlockedPartyCount = getGuildSecondaryPartyCount(state);

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Guild Investment</span>
            <h3>Field Team Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <GuildInnRequirementMessage />
        ) : null}
        {resultMessage ? (
          <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {partyCountStatuses.map((upgrade) => (
            <GuildUpgradeRow
              canUse={canUse}
              key={upgrade.id}
              upgrade={upgrade}
              onPurchase={() => onPurchase(upgrade.id, upgrade.partyId)}
            />
          ))}
        </div>

        <div className="guild-secondary-upgrade-groups">
          {secondaryParties.parties.map((party, index) => {
            const isUnlocked = index < unlockedPartyCount;
            const upgradeStatuses = getGuildSecondaryPartyUpgradeStatuses(
              state,
              party.id,
            );

            return (
              <section className="guild-secondary-upgrade-group" key={party.id}>
                <div>
                  <h4>{party.displayName}</h4>
                  <small>
                    {isUnlocked ? "Unlocked" : `Unlock Field Team ${index + 1}`}
                  </small>
                </div>
                <div className="guild-upgrade-list">
                  {upgradeStatuses.map((upgrade) => (
                    <GuildUpgradeRow
                      canUse={canUse}
                      key={`${party.id}-${upgrade.id}`}
                      upgrade={upgrade}
                      onPurchase={() => onPurchase(upgrade.id, party.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InnRoomUpgradesView({
  canUse,
  resultMessage,
  state,
  onBack,
  onPurchase,
}: {
  canUse: boolean;
  resultMessage?: string | null;
  state: GameState;
  onBack: () => void;
  onPurchase: (upgradeId: InnRoomUpgradeId) => void;
}) {
  const crowns = getCurrencyBalance(state.wallet, "crowns");
  const upgradeStatuses = getInnRoomUpgradeStatuses(state);

  return (
    <div className="guild-upgrades-view">
      <button className="guild-recruit-back-button" onClick={onBack} type="button">
        &lt; Back
      </button>

      <div className="guild-upgrades-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Inn Investment</span>
            <h3>Room Upgrades</h3>
          </div>
          <strong className="guild-upgrade-crowns">
            Crowns: {crowns.toLocaleString()}
          </strong>
        </div>

        {!canUse ? (
          <GuildInnRequirementMessage />
        ) : null}
        {resultMessage ? (
          <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
        ) : null}

        <div className="guild-upgrade-list">
          {upgradeStatuses.map((upgrade) => (
            <GuildUpgradeRow
              canUse={canUse}
              key={upgrade.id}
              upgrade={upgrade}
              onPurchase={() => onPurchase(upgrade.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GuildUpgradeRow({
  canUse,
  upgrade,
  onPurchase,
}: {
  canUse: boolean;
  upgrade: {
    id: string;
    displayName: string;
    description: string;
    level: number;
    currentEffect: string;
    nextEffect: string | null;
    nextCostCrowns: number | null;
    isLocked: boolean;
    isMaxLevel: boolean;
    lockReason: string | null;
    canAfford: boolean;
  };
  onPurchase: () => void;
}) {
  const purchaseDisabled =
    !canUse ||
    upgrade.isLocked ||
    upgrade.isMaxLevel ||
    !upgrade.canAfford;
  const statusText = upgrade.isLocked
    ? upgrade.lockReason
    : upgrade.isMaxLevel
      ? "Max"
      : upgrade.canAfford
        ? `${upgrade.nextCostCrowns} Crowns`
        : `Need ${upgrade.nextCostCrowns} Crowns`;

  return (
    <article className="guild-upgrade-row">
      <div>
        <strong>{upgrade.displayName}</strong>
        <span>Lv {upgrade.level}</span>
      </div>
      <p>{upgrade.description}</p>
      <dl>
        <div>
          <dt>Current</dt>
          <dd>{upgrade.currentEffect}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{upgrade.nextEffect ?? "Max"}</dd>
        </div>
      </dl>
      <button disabled={purchaseDisabled} onClick={onPurchase} type="button">
        {statusText}
      </button>
    </article>
  );
}

function GuildSecondaryPartiesView({
  canUse,
  redeemSummary,
  currentTime,
  resultMessage,
  selectedCompanionId,
  state,
  onBack,
  onRedeemAssignment,
  onReturnAssignment,
  onClearSummary,
  onAssign,
  onMoveCompanion,
  onOpenUpgrades,
  onSelectCompanion,
}: {
  canUse: boolean;
  redeemSummary?: GuildSecondaryPartyRedeemSummary | null;
  currentTime: number;
  resultMessage?: string | null;
  selectedCompanionId: string | null;
  state: GameState;
  onBack: () => void;
  onRedeemAssignment: (partyId: string) => void;
  onReturnAssignment: (partyId: string) => void;
  onClearSummary: () => void;
  onAssign: (
    partyId: string,
    mapId: DebugMapId,
    subzoneId: string,
  ) => void;
  onMoveCompanion: (companionId: string, target: GuildRosterSlotRef) => void;
  onOpenUpgrades: () => void;
  onSelectCompanion: (companionId: string | null) => void;
}) {
  const [draggedCompanionId, setDraggedCompanionId] = useState<string | null>(
    null,
  );
  const [assignmentPartyId, setAssignmentPartyId] = useState<string | null>(null);
  const [selectedDestinationKey, setSelectedDestinationKey] =
    useState<string>("");
  const activeCompanions = getActiveCompanions(state).sort(compareCompanionCards);
  const innReserveCompanions = getInnReserveCompanions(state);
  const secondaryParties = getGuildSecondaryPartiesState(state);
  const unlockedPartyCount = getGuildSecondaryPartyCount(state);
  const assignmentDestinations = getGuildSecondaryPartyAssignmentDestinations(state);
  const partySizeLimit = getPartySizeLimit(state);
  const rosterCapacity = getGuildCompanionCapacity(state);
  const rosterCount = getTotalRosterCompanionCount(state);
  const totalRosterLevel = getTotalRosterCompanionLevel(state);
  const companionsById = Object.fromEntries(
    [
      ...activeCompanions,
      ...getRestingCompanions(state),
    ].map((companion) => [companion.id, companion]),
  );
  const reserveSlotCount = innReserveCompanions.length + 1;
  const assignmentParty = assignmentPartyId
    ? secondaryParties.parties.find((party) => party.id === assignmentPartyId) ?? null
    : null;
  const selectedDestination = selectedDestinationKey
    ? parseAssignmentDestinationKey(selectedDestinationKey)
    : null;
  const assignmentPreview =
    assignmentParty && selectedDestination
      ? getGuildSecondaryPartyAssignmentPreview(
          state,
          assignmentParty.id,
          selectedDestination.mapId,
          selectedDestination.subzoneId,
        )
      : null;

  useEffect(() => {
    setDraggedCompanionId(null);
  }, [state]);

  useEffect(() => {
    if (!selectedDestinationKey && assignmentDestinations.length > 0) {
      const firstDestination = assignmentDestinations[0];
      setSelectedDestinationKey(
        createAssignmentDestinationKey(
          firstDestination.mapId,
          firstDestination.subzoneId,
        ),
      );
    }
  }, [assignmentDestinations, selectedDestinationKey]);

  useEffect(() => {
    if (selectedCompanionId && !companionsById[selectedCompanionId]) {
      onSelectCompanion(null);
    }
  }, [companionsById, onSelectCompanion, selectedCompanionId]);

  return (
    <div className="guild-roster-view">
      <div className="guild-submenu-actions">
        <button className="guild-recruit-back-button" onClick={onBack} type="button">
          &lt; Back
        </button>
        <button onClick={onOpenUpgrades} type="button">
          Upgrade
        </button>
      </div>

      <div className="guild-roster-card">
        <div className="guild-roster-topline">
          <div>
            <span className="guild-recruit-kicker">Roster Board</span>
            <h3>Field Teams</h3>
          </div>
          <dl>
            <div>
              <dt>Companions</dt>
              <dd>
                {rosterCount}/{rosterCapacity}
              </dd>
            </div>
            <div>
              <dt>Total Level</dt>
              <dd>{totalRosterLevel}</dd>
            </div>
          </dl>
        </div>

        {!canUse ? (
          <GuildInnRequirementMessage />
        ) : null}
        {selectedCompanionId ? (
          <p className="guild-recruit-message">
            Selected {companionsById[selectedCompanionId]?.id ?? "companion"}. Pick a
            slot to move.
          </p>
        ) : null}
        {resultMessage ? (
          <p className={getGuildMessageClassName(resultMessage)}>{resultMessage}</p>
        ) : null}
        {redeemSummary ? (
          <div className="guild-assignment-summary">
            <div>
              <span className="guild-recruit-kicker">Redeemed</span>
              <h4>{redeemSummary.partyName}</h4>
              <p>
                {redeemSummary.mapName} - {redeemSummary.subzoneName}
                {" | "}
                {formatAssignmentDuration(redeemSummary.elapsedMs)}
              </p>
            </div>
            <dl>
              <div>
                <dt>EXP Eff.</dt>
                <dd>{formatAssignmentMultiplier(redeemSummary.experienceEfficiency)}</dd>
              </div>
              <div>
                <dt>Drop Eff.</dt>
                <dd>{formatAssignmentMultiplier(redeemSummary.dropEfficiency)}</dd>
              </div>
              <div>
                <dt>Kills</dt>
                <dd>{redeemSummary.result.enemyKills}</dd>
              </div>
              <div>
                <dt>XP</dt>
                <dd>{redeemSummary.result.xpGranted}</dd>
              </div>
            </dl>
            <p>
              Loot: {formatAssignmentLoot(redeemSummary.result.loot)}
              {" | "}
              Resources: {formatAssignmentLoot(redeemSummary.result.resources)}
            </p>
            <button onClick={onClearSummary} type="button">
              Continue
            </button>
          </div>
        ) : null}

        <div className="guild-roster-board">
          <RosterColumn title="Main Party">
            {Array.from({ length: MAX_MAIN_PARTY_SLOTS }, (_, index) => {
              const isLocked = index >= partySizeLimit;
              const unlockRequirement = getPartySizeUnlockRequirement(index + 1);

              return (
                <RosterSlot
                  canUse={canUse}
                  companion={activeCompanions[index] ?? null}
                  draggedCompanionId={draggedCompanionId}
                  key={`main-${index}`}
                  label={
                    isLocked && unlockRequirement
                      ? `Slot ${index + 1} - Level ${unlockRequirement}`
                      : `Slot ${index + 1}`
                  }
                  locked={isLocked}
                  selectedCompanionId={selectedCompanionId}
                  slotRef={{
                    area: "main_party",
                    slotIndex: index,
                  }}
                  onDragEnd={() => setDraggedCompanionId(null)}
                  onDragStart={setDraggedCompanionId}
                  onMoveCompanion={onMoveCompanion}
                  onSelectCompanion={onSelectCompanion}
                />
              );
            })}
          </RosterColumn>

          <RosterColumn title="Inn's Reserve">
            {Array.from({ length: reserveSlotCount }, (_, index) => (
              <RosterSlot
                canUse={canUse}
                companion={innReserveCompanions[index] ?? null}
                draggedCompanionId={draggedCompanionId}
                key={`reserve-${index}`}
                label={`Reserve ${index + 1}`}
                locked={false}
                selectedCompanionId={selectedCompanionId}
                slotRef={{
                  area: "inn_reserve",
                  slotIndex: index,
                }}
                onDragEnd={() => setDraggedCompanionId(null)}
                onDragStart={setDraggedCompanionId}
                onMoveCompanion={onMoveCompanion}
                onSelectCompanion={onSelectCompanion}
              />
            ))}
          </RosterColumn>

          {secondaryParties.parties.map((party, partyIndex) => {
            const isUnlocked = partyIndex < unlockedPartyCount;
            const displayAssignment = getDisplayAssignment(party, currentTime);
            const partyCompanionCount = party.companionIds.filter(Boolean).length;
            const isPartyLocked = Boolean(displayAssignment);
            const redeemReady = displayAssignment
              ? getAssignmentClaimableElapsedMs(displayAssignment, currentTime) >=
                60_000
              : false;
            const efficiencyTooltip = [
              `EXP: ${formatAssignmentPercent(getGuildSecondaryPartyExperienceEfficiency(state, party.id))}`,
              `Drop: ${formatAssignmentPercent(getGuildSecondaryPartyDropEfficiency(state, party.id))}`,
            ].join("\n");

            return (
              <RosterColumn
                key={party.id}
                subtitle={
                  isUnlocked
                    ? getAssignmentStatusLabel(displayAssignment, currentTime)
                    : `Unlock Field Team ${partyIndex + 1}`
                }
                title={party.displayName}
                titleTooltip={efficiencyTooltip}
              >
                {Array.from({ length: MAX_MAIN_PARTY_SLOTS }, (_, index) => {
                  const isMemberSlotUnlocked = isUnlocked &&
                    index < party.companionIds.length;
                  const companionId = isMemberSlotUnlocked
                    ? party.companionIds[index]
                    : null;

                  return (
                    <RosterSlot
                      canUse={canUse && !isPartyLocked}
                      companion={companionId ? companionsById[companionId] ?? null : null}
                      draggedCompanionId={draggedCompanionId}
                      key={`${party.id}-${index}`}
                      label={`Slot ${index + 1}`}
                      locked={!isMemberSlotUnlocked || isPartyLocked}
                      lockedText={
                        isPartyLocked
                          ? "Assigned"
                          : isUnlocked
                            ? "Upgrade"
                            : "Locked"
                      }
                      selectedCompanionId={selectedCompanionId}
                      slotRef={{
                        area: "secondary_party",
                        partyId: party.id,
                        slotIndex: index,
                      }}
                      onDragEnd={() => setDraggedCompanionId(null)}
                      onDragStart={setDraggedCompanionId}
                      onMoveCompanion={onMoveCompanion}
                      onSelectCompanion={onSelectCompanion}
                    />
                  );
                })}
                <div className="guild-assignment-actions">
                  {!isUnlocked ? (
                    <small>Buy Number of Field Teams to unlock.</small>
                  ) : displayAssignment ? (
                    <>
                      <strong>
                        {getAssignmentActionLabel(displayAssignment, currentTime)}
                      </strong>
                      <small>
                        {displayAssignment.mapName} - {displayAssignment.subzoneName}
                      </small>
                      <button
                        disabled={!canUse || !redeemReady}
                        onClick={() => onRedeemAssignment(party.id)}
                        type="button"
                      >
                        Redeem
                      </button>
                      <button
                        disabled={!canUse}
                        onClick={() => onReturnAssignment(party.id)}
                        type="button"
                      >
                        Return
                      </button>
                      <button
                        disabled={!canUse}
                        onClick={() => setAssignmentPartyId(party.id)}
                        type="button"
                      >
                        Assign
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        disabled={
                          !canUse ||
                          partyCompanionCount <= 0 ||
                          assignmentDestinations.length <= 0
                        }
                        onClick={() => setAssignmentPartyId(party.id)}
                        type="button"
                      >
                        Assign
                      </button>
                      <small>
                        {assignmentDestinations.length > 0
                          ? `${partyCompanionCount} assigned`
                          : "No visited wild subzones"}
                      </small>
                    </>
                  )}
                </div>
              </RosterColumn>
            );
          })}
        </div>

        {assignmentParty ? (
          <div className="guild-assignment-setup">
            <div className="guild-roster-topline">
              <div>
                <span className="guild-recruit-kicker">Assignment Setup</span>
                <h3>{assignmentParty.displayName}</h3>
              </div>
              <button onClick={() => setAssignmentPartyId(null)} type="button">
                Close
              </button>
            </div>
            {assignmentDestinations.length > 0 ? (
              <>
                <label>
                  Destination
                  <select
                    onChange={(event) =>
                      setSelectedDestinationKey(event.currentTarget.value)
                    }
                    value={selectedDestinationKey}
                  >
                    {assignmentDestinations.map((destination) => (
                      <option
                        key={createAssignmentDestinationKey(
                          destination.mapId,
                          destination.subzoneId,
                        )}
                        value={createAssignmentDestinationKey(
                          destination.mapId,
                          destination.subzoneId,
                        )}
                      >
                        {destination.mapName} - {destination.subzoneName}
                      </option>
                    ))}
                  </select>
                </label>
                {assignmentPreview?.ok ? (
                  <div className="guild-assignment-preview">
                    <dl>
                      <div>
                        <dt>Rating</dt>
                        <dd>{assignmentPreview.estimate.rating}</dd>
                      </div>
                      <div>
                        <dt>Kills/hr</dt>
                        <dd>{assignmentPreview.estimate.killsPerHour}</dd>
                      </div>
                      <div>
                        <dt>Max Time</dt>
                        <dd>{formatAssignmentDuration(assignmentPreview.maxDurationMs)}</dd>
                      </div>
                      <div>
                        <dt>EXP Eff.</dt>
                        <dd>{formatAssignmentMultiplier(assignmentPreview.experienceEfficiency)}</dd>
                      </div>
                      <div>
                        <dt>Drop Eff.</dt>
                        <dd>{formatAssignmentMultiplier(assignmentPreview.dropEfficiency)}</dd>
                      </div>
                    </dl>
                    <p>
                      Possible drops:{" "}
                      {formatItemIdList(assignmentPreview.estimate.estimatedDropsPerHour.map((drop) => drop.itemId))}
                    </p>
                    <p>
                      Resources:{" "}
                      {formatResourceTypes(assignmentPreview.estimate.resources)}
                    </p>
                    {assignmentPreview.estimate.warnings.length > 0 ? (
                      <p className="guild-recruit-message">
                        Warning: {assignmentPreview.estimate.warnings.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : assignmentPreview ? (
                  <p className="guild-recruit-message">{assignmentPreview.message}</p>
                ) : null}
                <button
                  disabled={!canUse || !assignmentPreview?.ok}
                  onClick={() => {
                    if (selectedDestination) {
                      onAssign(
                        assignmentParty.id,
                        selectedDestination.mapId,
                        selectedDestination.subzoneId,
                      );
                      setAssignmentPartyId(null);
                    }
                  }}
                  type="button"
                >
                  Assign
                </button>
              </>
            ) : (
              <p className="guild-recruit-message">
                Visit a wild subzone with enemies to unlock assignment destinations.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RosterColumn({
  children,
  subtitle,
  title,
  titleTooltip,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
  titleTooltip?: string;
}) {
  return (
    <div className="guild-roster-column">
      <h4 title={titleTooltip}>{title}</h4>
      <small aria-hidden={subtitle ? undefined : true}>{subtitle ?? ""}</small>
      <div>{children}</div>
    </div>
  );
}

function RosterSlot({
  canUse,
  companion,
  draggedCompanionId,
  label,
  locked,
  lockedText = "Locked",
  selectedCompanionId,
  slotRef,
  onDragEnd,
  onDragStart,
  onMoveCompanion,
  onSelectCompanion,
}: {
  canUse: boolean;
  companion: Companion | null;
  draggedCompanionId: string | null;
  label: string;
  locked: boolean;
  lockedText?: string;
  selectedCompanionId: string | null;
  slotRef: GuildRosterSlotRef;
  onDragEnd: () => void;
  onDragStart: (companionId: string) => void;
  onMoveCompanion: (companionId: string, target: GuildRosterSlotRef) => void;
  onSelectCompanion: (companionId: string | null) => void;
}) {
  const canReceive = canUse && !locked;
  const isTargeting = canReceive && Boolean(draggedCompanionId || selectedCompanionId);

  function moveCompanion(companionId: string) {
    if (!canReceive || companionId === companion?.id) {
      return;
    }

    onMoveCompanion(companionId, slotRef);
    onDragEnd();
    onSelectCompanion(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const companionId =
      event.dataTransfer.getData("text/plain") || draggedCompanionId;

    if (companionId) {
      moveCompanion(companionId);
    }
  }

  function handleSlotClick() {
    if (selectedCompanionId) {
      moveCompanion(selectedCompanionId);
    }
  }

  return (
    <div
      className={`guild-roster-slot${locked ? " locked" : ""}${
        isTargeting ? " can-receive" : ""
      }`}
      onClick={handleSlotClick}
      onDragOver={(event) => {
        if (canReceive) {
          event.preventDefault();
        }
      }}
      onDrop={handleDrop}
    >
      <span className="guild-roster-slot-label">{label}</span>
      {companion ? (
        <>
          {locked ? (
            <span className="guild-roster-locked-status">{lockedText}</span>
          ) : null}
          <CompanionRosterCard
            canUse={canUse && !locked}
            companion={companion}
            isSelected={!locked && selectedCompanionId === companion.id}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onSelectCompanion={onSelectCompanion}
          />
        </>
      ) : locked ? (
        <span className="guild-roster-locked">{lockedText}</span>
      ) : (
        <span className="guild-roster-empty">Empty</span>
      )}
    </div>
  );
}

function CompanionRosterCard({
  canUse,
  companion,
  isSelected,
  onDragEnd,
  onDragStart,
  onSelectCompanion,
}: {
  canUse: boolean;
  companion: Companion;
  isSelected: boolean;
  onDragEnd: () => void;
  onDragStart: (companionId: string) => void;
  onSelectCompanion: (companionId: string | null) => void;
}) {
  const classDefinition = CLASS_DEFINITIONS[companion.classId];
  const idleFrameSrc = getClassIdleFrameSrc(companion.classId);

  return (
    <button
      className={`guild-roster-companion-card${isSelected ? " selected" : ""}`}
      disabled={!canUse}
      draggable={canUse}
      onClick={(event) => {
        event.stopPropagation();
        onSelectCompanion(isSelected ? null : companion.id);
      }}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", companion.id);
        onDragStart(companion.id);
      }}
      type="button"
    >
      <span className="guild-roster-companion-sprite" aria-hidden="true">
        {idleFrameSrc ? <img alt="" src={idleFrameSrc} /> : null}
      </span>
      <strong>
        Lv {companion.characterLevel} {classDefinition?.displayName ?? companion.classId}
      </strong>
      <small>{getRoleLabel(companion.role)}</small>
    </button>
  );
}

function getDisplayAssignment(
  party: GuildSecondaryParty,
  currentTime: number,
): GuildSecondaryPartyAssignmentState | null {
  if (!party.assignment) {
    return null;
  }

  if (
    party.assignment.status === "assigned" &&
    currentTime >= party.assignment.capsAtMs
  ) {
    return {
      ...party.assignment,
      status: "capped",
    };
  }

  return party.assignment;
}

function getAssignmentStatusLabel(
  assignment: GuildSecondaryPartyAssignmentState | null,
  currentTime: number,
): string {
  if (!assignment) {
    return "Idle";
  }

  if (assignment.status === "pending_loot") {
    return "Pending loot";
  }

  if (assignment.status === "capped") {
    return "Capped";
  }

  return `Assigned ${formatAssignmentDuration(getAssignmentClaimableElapsedMs(assignment, currentTime))}`;
}

function getAssignmentActionLabel(
  assignment: GuildSecondaryPartyAssignmentState,
  currentTime: number,
): string {
  if (assignment.status === "pending_loot") {
    return "Pending loot";
  }

  if (assignment.status === "capped") {
    return `Capped ${formatAssignmentDuration(assignment.maxDurationMs)}`;
  }

  return `${formatAssignmentDuration(getAssignmentClaimableElapsedMs(assignment, currentTime))} / ${formatAssignmentDuration(assignment.maxDurationMs)}`;
}

function getAssignmentClaimableElapsedMs(
  assignment: GuildSecondaryPartyAssignmentState,
  currentTime: number,
): number {
  return Math.max(
    0,
    Math.min(currentTime, assignment.capsAtMs) - assignment.lastSettledAtMs,
  );
}

function createAssignmentDestinationKey(
  mapId: DebugMapId,
  subzoneId: string,
): string {
  return `${mapId}|${subzoneId}`;
}

function parseAssignmentDestinationKey(
  key: string,
): { mapId: DebugMapId; subzoneId: string } | null {
  const [mapId, subzoneId] = key.split("|");

  if (!mapId || !subzoneId) {
    return null;
  }

  return {
    mapId: mapId as DebugMapId,
    subzoneId,
  };
}

function formatAssignmentDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function formatAssignmentMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatAssignmentPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatAssignmentLoot(
  loot: GuildSecondaryPartyAssignmentResult["loot"],
): string {
  if (loot.length <= 0) {
    return "None";
  }

  return loot
    .map((item) => `${getItemDefinition(item.itemId).displayName} x${item.quantity}`)
    .join(", ");
}

function formatItemIdList(itemIds: ItemId[]): string {
  const uniqueItemIds = [...new Set(itemIds)];

  if (uniqueItemIds.length <= 0) {
    return "None";
  }

  return uniqueItemIds
    .map((itemId) => getItemDefinition(itemId).displayName)
    .join(", ");
}

function formatResourceTypes(resources: ResourceType[]): string {
  if (resources.length <= 0) {
    return "None";
  }

  const labels: Record<ResourceType, string> = {
    herb: "Herbs",
    ore: "Ore",
    wood: "Wood",
  };

  return [...new Set(resources)].map((resource) => labels[resource]).join(", ");
}

function getDestinationLabel(destination: ReturnType<typeof getGuildRecruitDestination>): string {
  if (destination === "active_party") {
    return "Active Party";
  }

  if (destination === "tavern_reserve") {
    return "Inn's Reserve";
  }

  return "No room available";
}

function formatCandidateGear(candidate: GuildRecruitCandidate): string {
  const equipmentItemIds = candidate.equipmentItemIds ?? [];

  if (equipmentItemIds.length <= 0) {
    return "None";
  }

  return equipmentItemIds
    .map((itemId) => getItemDefinition(itemId).displayName)
    .join(", ");
}

function formatCandidateSkills(candidate: GuildRecruitCandidate): string {
  const skillRows = Object.entries(candidate.startingSkillRanksBySkillId ?? {})
    .map(([skillId, rank]) => {
      const skillDefinition = SKILL_DEFINITIONS[skillId as keyof typeof SKILL_DEFINITIONS];

      return skillDefinition
        ? `${skillDefinition.displayName} Lv ${rank}`
        : null;
    })
    .filter((row): row is string => Boolean(row));

  return skillRows.length > 0 ? skillRows.join(", ") : "None";
}

function formatNoticeBoardRewards(
  state: GameState,
  quest: GuildNoticeBoardQuest,
): string {
  const rewardPercent = getGuildNoticeBoardRewardPercent(state);
  const crowns = Math.floor((quest.rewards.crowns * rewardPercent) / 100);
  const guaranteedBooks = Math.floor(rewardPercent / 100);
  const extraChance = Math.floor(rewardPercent % 100);
  const bookName = getItemDefinition(quest.rewards.skillBookItemId).displayName;
  const bookText =
    extraChance > 0
      ? `${guaranteedBooks} ${bookName} + ${extraChance}% extra`
      : `${guaranteedBooks} ${bookName}`;

  return `${crowns} Crowns, ${bookText}`;
}

function getNoticeBoardButtonStatus(
  quest: GuildNoticeBoardQuest | null,
): string {
  if (!quest) {
    return "Empty";
  }

  return getNoticeBoardQuestStatusLabel(quest);
}

function getNoticeBoardQuestStatusLabel(
  quest: GuildNoticeBoardQuest,
): string {
  if (quest.status === "taken") {
    return "Taken";
  }

  if (quest.status === "done") {
    return quest.rewardClaimedAtMs === null ? "Done" : "Completed";
  }

  return "Available";
}

function getRoleLabel(role: PartyMemberRole): string {
  const roleLabels: Record<PartyMemberRole, string> = {
    defender: "Defender",
    fighter: "Fighter",
    gatherer: "Gatherer",
    support: "Support",
    none: "None",
  };

  return roleLabels[role];
}

function compareCompanionCards(a: Companion, b: Companion): number {
  return a.partyOrder - b.partyOrder || a.id.localeCompare(b.id);
}

function formatRecruitCountdown(refreshAtMs: number, currentTime: number): string {
  const remainingMs = Math.max(0, refreshAtMs - currentTime);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatRecruitButtonCountdown(
  refreshAtMs: number,
  currentTime: number,
): string {
  const remainingMs = Math.max(0, refreshAtMs - currentTime);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}min`;
  }

  return `${hours}H ${minutes}min`;
}
