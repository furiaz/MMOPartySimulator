import { useState } from "react";
import { FARM_CROP_ICON_SRC, LIVESTOCK_CREATURE_ICON_SRC } from "./assetIcons";
import {
  getTownServicesLockedMessage,
  type FarmFieldId,
  type FarmFieldUpgradeId,
  type GameState,
  type LivestockAnimalUpgradeId,
  type LivestockBuildingUpgradeId,
  type LivestockCreatureId,
  type LivestockPlacementId,
  type LivestockPlacementRotation,
} from "./game";
import {
  getFarmDisplay,
  type FarmCropFilter,
  type FarmFieldDisplay,
} from "./farmPresentation";
import {
  getLivestockDisplay,
  getLivestockPlacementTimeRemainingText,
  getNextLivestockRotation,
  type LivestockCreatureFilter,
  type LivestockCreatureDisplay,
  type LivestockGridCellDisplay,
  type LivestockUpgradeDisplay,
} from "./livestockPresentation";
import { OverlayPanel } from "./OverlayPanel";

type FarmLivestockPanelProps = {
  currentTime: number;
  farmResultMessage?: string | null;
  livestockResultMessage?: string | null;
  state: GameState;
  onHarvestAll: () => void;
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
};

type FarmLivestockSection = "farm" | "livestock";

export function FarmLivestockPanel({
  currentTime,
  farmResultMessage,
  livestockResultMessage,
  state,
  onHarvestAll,
  onPurchaseFarmUpgrade,
  onPlaceLivestockCreature,
  onMoveLivestockPlacement,
  onRemoveLivestockPlacement,
  onCollectAllLivestockOutputs,
  onFeedHungryLivestockNow,
  onPurchaseLivestockAnimalUpgrade,
  onPurchaseLivestockBuildingUpgrade,
  onOpenInnKitchenPantry,
}: FarmLivestockPanelProps) {
  const [cropFilter, setCropFilter] = useState<FarmCropFilter>("unlocked");
  const [creatureFilter, setCreatureFilter] =
    useState<LivestockCreatureFilter>("unlocked");
  const display = getFarmDisplay(state, currentTime, cropFilter);
  const livestockDisplay = getLivestockDisplay(
    state,
    currentTime,
    creatureFilter,
  );
  const lockedMessage = getTownServicesLockedMessage(state);
  const field = display.field;
  const [activeSection, setActiveSection] =
    useState<FarmLivestockSection>("farm");
  const [selectedUpgradeFieldId, setSelectedUpgradeFieldId] = useState<
    FarmFieldDisplay["fieldId"] | null
  >(null);
  const selectedUpgradeField =
    display.fields.find((farmField) => farmField.fieldId === selectedUpgradeFieldId) ??
    null;
  const [heldCreatureId, setHeldCreatureId] =
    useState<LivestockCreatureId | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] =
    useState<LivestockPlacementId | null>(null);
  const [livestockRotation, setLivestockRotation] =
    useState<LivestockPlacementRotation>("horizontal");
  const [isLivestockSummaryOpen, setLivestockSummaryOpen] = useState(false);
  const [selectedLivestockUpgradeCreatureId, setSelectedLivestockUpgradeCreatureId] =
    useState<LivestockCreatureId | null>(null);
  const [isLivestockBuildingUpgradeOpen, setLivestockBuildingUpgradeOpen] =
    useState(false);
  const selectedPlacement =
    livestockDisplay.placements.find(
      (placement) => placement.id === selectedPlacementId,
    ) ?? null;
  const heldCreature = livestockDisplay.creatures.find(
    (creature) => creature.creatureId === heldCreatureId,
  );
  const selectedLivestockUpgradeCreature =
    livestockDisplay.creatures.find(
      (creature) => creature.creatureId === selectedLivestockUpgradeCreatureId,
    ) ?? null;
  const livestockCanRotate = false;

  function clearLivestockSelection() {
    setHeldCreatureId(null);
    setSelectedPlacementId(null);
    setLivestockRotation("horizontal");
  }

  function selectAvailableCreature(creature: LivestockCreatureDisplay) {
    if (!creature.canHoldForPlacement) {
      return;
    }

    setHeldCreatureId(creature.creatureId);
    setSelectedPlacementId(null);
    setLivestockRotation("horizontal");
  }

  function handleLivestockCellClick(cell: LivestockGridCellDisplay) {
    if (cell.placementId && !heldCreatureId) {
      if (cell.placementId === selectedPlacementId) {
        clearLivestockSelection();
        return;
      }

      setSelectedPlacementId(cell.placementId);
      return;
    }

    if (heldCreatureId) {
      const didPlace = onPlaceLivestockCreature(
        heldCreatureId,
        cell.x,
        cell.y,
        livestockRotation,
      );
      if (didPlace) {
        clearLivestockSelection();
      }
      return;
    }

    if (selectedPlacementId && !cell.placementId) {
      const didMove = onMoveLivestockPlacement(
        selectedPlacementId,
        cell.x,
        cell.y,
        livestockRotation,
      );
      if (didMove) {
        clearLivestockSelection();
      }
    }
  }

  return (
    <section
      aria-label="Farm and Livestock"
      className="guild-tavern-panel farm-livestock-panel"
    >
      <div className="guild-tavern-header">
        <div>
          <h2>Farm & Livestock</h2>
          <span>{display.isUnlocked ? "Town service" : "Locked"}</span>
        </div>
        <dl>
          <div>
            <dt>Crowns</dt>
            <dd>{display.crownBalance.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Crops/hr</dt>
            <dd>{display.totalCropsPerHourText}</dd>
          </div>
          <div>
            <dt>Livestock/hr</dt>
            <dd>{display.livestockProductionPerHourText}</dd>
          </div>
        </dl>
      </div>

      {lockedMessage ? (
        <p className="guild-requires-service">{lockedMessage}</p>
      ) : null}

      {farmResultMessage ? (
        <p className="guild-result-message">{farmResultMessage}</p>
      ) : null}

      <div
        aria-label="Farm and Livestock sections"
        className="guild-tavern-section-nav"
        role="tablist"
      >
        <button
          aria-selected={activeSection === "farm"}
          className={activeSection === "farm" ? "active" : ""}
          onClick={() => setActiveSection("farm")}
          role="tab"
          type="button"
        >
          <strong>Farm</strong>
          <small>
            Crops {display.totalHeldQuantity}/{display.totalHoldCap}
          </small>
        </button>
        <button
          aria-selected={activeSection === "livestock"}
          className={activeSection === "livestock" ? "active" : ""}
          onClick={() => setActiveSection("livestock")}
          role="tab"
          type="button"
        >
          <strong>Livestock</strong>
          <small>
            {livestockDisplay.outputs.map((output) => output.holdText).join(", ") ||
              "No output held"}
          </small>
        </button>
      </div>

      {activeSection === "farm" ? (
        <>
          <div className="guild-tavern-service-actions farm-actions">
            <button disabled={!field.canHarvest} onClick={onHarvestAll} type="button">
              <span>Harvest All</span>
              <small>{getFarmHarvestButtonStatusText(field)}</small>
            </button>
            <button disabled type="button">
              <span>Upgrade Building</span>
              <small>Coming soon</small>
            </button>
          </div>

          <section className="guild-tavern-section farm-field-card">
            <div className="guild-roster-topline">
              <div>
                <span className="guild-recruit-kicker">Farm</span>
                <h3>Fields</h3>
              </div>
              <div className="farm-crop-filter" aria-label="Farm crop filter">
                <button
                  className={cropFilter === "unlocked" ? "active" : ""}
                  onClick={() => setCropFilter("unlocked")}
                  type="button"
                >
                  Unlocked
                </button>
                <button
                  className={cropFilter === "all" ? "active" : ""}
                  onClick={() => setCropFilter("all")}
                  type="button"
                >
                  All
                </button>
              </div>
            </div>
            {!lockedMessage && !display.isFarmServiceAvailable ? (
              <p className="guild-requires-service">
                Visit a hub with the Farmer to upgrade fields or harvest crops.
                You can browse remotely, but actions require that service in
                your current hub.
              </p>
            ) : null}
            <div className="farm-crop-list">
              {display.fields.map((farmField) => (
                <FarmCropRow
                  key={farmField.fieldId}
                  field={farmField}
                  onOpenUpgrades={() => setSelectedUpgradeFieldId(farmField.fieldId)}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="guild-tavern-section livestock-section">
          {!lockedMessage && !display.isLivestockServiceAvailable ? (
            <p className="guild-requires-service">
              Visit a hub with Livestock to place, move, remove, or collect. You
              can browse remotely, but actions require that service in your
              current hub.
            </p>
          ) : null}
          {livestockResultMessage ? (
            <p className="guild-result-message">{livestockResultMessage}</p>
          ) : null}

          <div className="guild-tavern-service-actions farm-actions livestock-actions">
            <button
              disabled={!livestockDisplay.canCollect}
              onClick={onCollectAllLivestockOutputs}
              type="button"
            >
              <span>Collect All</span>
              <small>{livestockDisplay.collectActionText}</small>
            </button>
            <button
              disabled={!livestockDisplay.canFeedNow}
              onClick={onFeedHungryLivestockNow}
              type="button"
            >
              <span>Feed Now</span>
              <small>{livestockDisplay.feedNowActionText}</small>
            </button>
            <button onClick={onOpenInnKitchenPantry} type="button">
              <span>Open Pantry</span>
              <small>Inn Kitchen</small>
            </button>
            <button
              aria-expanded={isLivestockSummaryOpen}
              onClick={() => setLivestockSummaryOpen((isOpen) => !isOpen)}
              type="button"
            >
              <span>Costs & Yield</span>
              <small>{isLivestockSummaryOpen ? "Hide" : "Show"}</small>
            </button>
            <button
              onClick={() => setLivestockBuildingUpgradeOpen(true)}
              type="button"
            >
              <span>Building Upgrades</span>
              <small>{livestockDisplay.gridSizeText}</small>
            </button>
          </div>

          {isLivestockSummaryOpen ? (
            <div className="livestock-summary-panel">
              <div>
                <span>Daily Feed</span>
                <strong>{livestockDisplay.totalFeedText}</strong>
              </div>
              <div>
                <span>24h Production</span>
                <strong>{livestockDisplay.expectedDailyOutputText}</strong>
              </div>
              <div>
                <span>Helper Bonuses</span>
                <strong>{livestockDisplay.helperBonusText}</strong>
              </div>
              <div>
                <span>Feed Status</span>
                <strong>{livestockDisplay.feedingStatusText}</strong>
              </div>
              <div>
                <span>Next Feed</span>
                <strong>{livestockDisplay.nextFeedAtText}</strong>
              </div>
              <div>
                <span>Output/hr</span>
                <strong>All/hr {livestockDisplay.totalOutputPerHourText}</strong>
              </div>
              <div>
                <span>Held Output</span>
                <strong>
                  {livestockDisplay.outputs
                    .map((output) => output.holdText)
                    .join(", ") || "No output held"}
                </strong>
              </div>
            </div>
          ) : null}

          <div className="livestock-layout">
            <div className="livestock-grid-column">
              <div
                className="livestock-grid"
                style={{
                  gridTemplateColumns: `repeat(${livestockDisplay.width}, minmax(42px, 1fr))`,
                }}
              >
                {livestockDisplay.cells.map((cell) => (
                  <button
                    className={[
                      "livestock-grid-cell",
                      cell.placementId ? "occupied" : "",
                      cell.isHungry ? "hungry" : "",
                      cell.placementId === selectedPlacementId ? "selected" : "",
                      !cell.placementId && (heldCreatureId || selectedPlacementId)
                        ? "available-target"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={`${cell.x},${cell.y}`}
                    onClick={() => handleLivestockCellClick(cell)}
                    type="button"
                  >
                    {cell.label}
                  </button>
                ))}
              </div>

              <div className="livestock-grid-controls">
                <span>
                  {heldCreature
                    ? `Selected: ${heldCreature.displayName} held`
                    : selectedPlacement
                      ? `Selected: ${selectedPlacement.creatureId}`
                      : "Selected: None"}
                </span>
                <button
                  disabled={!livestockCanRotate}
                  onClick={() =>
                    setLivestockRotation((rotation) =>
                      getNextLivestockRotation(rotation),
                    )
                  }
                  type="button"
                >
                  Rotate
                </button>
                <button
                  disabled={!heldCreatureId && !selectedPlacementId}
                  onClick={clearLivestockSelection}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  disabled={!selectedPlacementId || !livestockDisplay.canUseActions}
                  onClick={() => {
                    if (selectedPlacementId) {
                      onRemoveLivestockPlacement(selectedPlacementId);
                      clearLivestockSelection();
                    }
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>

              <div className="livestock-available-list">
                <div className="guild-roster-topline">
                  <h3>Available Creatures</h3>
                  <div
                    className="farm-crop-filter"
                    aria-label="Livestock creature filter"
                  >
                    <button
                      className={creatureFilter === "unlocked" ? "active" : ""}
                      onClick={() => setCreatureFilter("unlocked")}
                      type="button"
                    >
                      Unlocked
                    </button>
                    <button
                      className={creatureFilter === "all" ? "active" : ""}
                      onClick={() => setCreatureFilter("all")}
                      type="button"
                    >
                      All
                    </button>
                  </div>
                </div>
                <div>
                  {livestockDisplay.creatures.map((creature) => (
                    <article
                      className={`livestock-creature-card${
                        creature.isUnlocked ? "" : " locked"
                      }`}
                      key={creature.creatureId}
                    >
                      <button
                        className="livestock-creature-select"
                        disabled={!creature.canHoldForPlacement}
                        onClick={() => selectAvailableCreature(creature)}
                        type="button"
                      >
                        <img
                          alt=""
                          aria-hidden="true"
                          className={`livestock-creature-icon${
                            creature.isUnlocked ? "" : " locked"
                          }`}
                          src={creature.iconSrc}
                        />
                        <strong>
                          {creature.displayName} x{creature.availableCount}
                        </strong>
                        {!creature.isUnlocked ? (
                          <small>{creature.sourceHint}</small>
                        ) : null}
                      </button>
                      <button
                        className="livestock-creature-upgrade-button"
                        disabled={!creature.isUnlocked || creature.upgrades.length <= 0}
                        onClick={() =>
                          setSelectedLivestockUpgradeCreatureId(
                            creature.creatureId,
                          )
                        }
                        type="button"
                      >
                        Upgrade
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <aside className="livestock-details">
              {livestockDisplay.creatures.map((creature) => (
                <article key={creature.creatureId}>
                  <div>
                    <h3>{creature.displayName}</h3>
                    <span>
                      Owned {creature.ownedCount} / Placed {creature.placedCount}
                      {creature.hungryCount > 0
                        ? ` / Hungry ${creature.hungryCount}`
                        : ""}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Size</dt>
                      <dd>{creature.footprintText}</dd>
                    </div>
                    <div>
                      <dt>Feed/day</dt>
                      <dd>{creature.feedText}</dd>
                    </div>
                    <div>
                      <dt>Yield</dt>
                      <dd>{creature.yieldText}</dd>
                    </div>
                    <div>
                      <dt>Fed</dt>
                      <dd>
                        {creature.fedCount}/{creature.placedCount}
                      </dd>
                    </div>
                    <div>
                      <dt>Output/hr</dt>
                      <dd>{creature.expectedOutputPerHourText}</dd>
                    </div>
                  </dl>
                </article>
              ))}
              <article>
                <div>
                  <h3>Placed Creatures</h3>
                  <span>{livestockDisplay.placements.length} active</span>
                </div>
                {livestockDisplay.placements.length > 0 ? (
                  <ul>
                    {livestockDisplay.placements.map((placement) => (
                      <li key={placement.id}>
                        {placement.creatureId} at {placement.x + 1},{" "}
                        {placement.y + 1} - next output in{" "}
                        {getLivestockPlacementTimeRemainingText(
                          placement,
                          currentTime,
                          state,
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No creatures placed.</p>
                )}
              </article>
            </aside>
          </div>
        </section>
      )}

      {selectedUpgradeField ? (
        <OverlayPanel
          ariaLabel={`${selectedUpgradeField.cropName} upgrades`}
          className="farm-upgrade-overlay"
          onClose={() => setSelectedUpgradeFieldId(null)}
        >
          <FarmUpgradeOverlayContent
            field={selectedUpgradeField}
            isFarmServiceAvailable={display.isFarmServiceAvailable}
            isUnlocked={display.isUnlocked}
            lockedMessage={lockedMessage}
            onClose={() => setSelectedUpgradeFieldId(null)}
            onPurchase={onPurchaseFarmUpgrade}
          />
        </OverlayPanel>
      ) : null}
      {selectedLivestockUpgradeCreature ? (
        <OverlayPanel
          ariaLabel={`${selectedLivestockUpgradeCreature.displayName} upgrades`}
          className="farm-upgrade-overlay"
          onClose={() => setSelectedLivestockUpgradeCreatureId(null)}
        >
          <LivestockAnimalUpgradeOverlayContent
            creature={selectedLivestockUpgradeCreature}
            isLivestockServiceAvailable={
              livestockDisplay.isLivestockServiceAvailable
            }
            isUnlocked={livestockDisplay.isUnlocked}
            lockedMessage={lockedMessage}
            onClose={() => setSelectedLivestockUpgradeCreatureId(null)}
            onPurchase={onPurchaseLivestockAnimalUpgrade}
          />
        </OverlayPanel>
      ) : null}
      {isLivestockBuildingUpgradeOpen ? (
        <OverlayPanel
          ariaLabel="Livestock building upgrades"
          className="farm-upgrade-overlay"
          onClose={() => setLivestockBuildingUpgradeOpen(false)}
        >
          <LivestockBuildingUpgradeOverlayContent
            upgrades={livestockDisplay.buildingUpgrades}
            isLivestockServiceAvailable={
              livestockDisplay.isLivestockServiceAvailable
            }
            isUnlocked={livestockDisplay.isUnlocked}
            lockedMessage={lockedMessage}
            onClose={() => setLivestockBuildingUpgradeOpen(false)}
            onPurchase={onPurchaseLivestockBuildingUpgrade}
          />
        </OverlayPanel>
      ) : null}
    </section>
  );
}

function FarmCropRow({
  field,
  onOpenUpgrades,
}: {
  field: FarmFieldDisplay;
  onOpenUpgrades: () => void;
}) {
  if (!field.isUnlocked) {
    return (
      <article className="farm-crop-row locked">
        <div className="farm-crop-row-main">
          <div className="farm-crop-heading">
            <img
              alt=""
              className="farm-crop-icon locked"
              src={FARM_CROP_ICON_SRC.locked}
            />
            <div>
              <h3>{field.cropName}</h3>
              <span>{field.productionText}</span>
            </div>
          </div>
        </div>
        <div className="farm-crop-row-stats">
          <div className="farm-crop-metrics">
            <span>{field.sourceHint}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="farm-crop-row">
      <div className="farm-crop-row-main">
        <div className="farm-crop-heading">
          <img
            alt=""
            className="farm-crop-icon"
            src={FARM_CROP_ICON_SRC[field.cropId] ?? FARM_CROP_ICON_SRC.locked}
          />
          <div>
            <h3>{field.cropName}</h3>
            <span>{field.productionText}</span>
          </div>
        </div>
        <button onClick={onOpenUpgrades} type="button">
          Upgrades
        </button>
      </div>
      <div className="farm-crop-row-stats">
        <div className="farm-crop-metrics">
          <span title={field.speedTooltip}>Speed {field.speedText}</span>
          <span title={field.multiCropTooltip}>
            Multi crop {field.multiCropText}
          </span>
          <span title={field.generationPerHourTooltip}>
            Gen/hr {field.generationPerHourText}
          </span>
          <span title={field.generationPerDayTooltip}>
            Crops/day {field.generationPerDayText}
          </span>
        </div>
        <strong title={field.holdingTooltip}>{field.holdText}</strong>
      </div>
    </article>
  );
}

function FarmUpgradeOverlayContent({
  field,
  isFarmServiceAvailable,
  isUnlocked,
  lockedMessage,
  onClose,
  onPurchase,
}: {
  field: FarmFieldDisplay;
  isFarmServiceAvailable: boolean;
  isUnlocked: boolean;
  lockedMessage: string | null;
  onClose: () => void;
  onPurchase: (fieldId: FarmFieldId, upgradeId: FarmFieldUpgradeId) => void;
}) {
  return (
    <>
      <div className="farm-upgrade-overlay-heading">
          <img
          alt=""
          className="farm-crop-icon"
          src={FARM_CROP_ICON_SRC[field.cropId] ?? FARM_CROP_ICON_SRC.locked}
        />
        <h3>{field.cropName}</h3>
      </div>

      {lockedMessage ? (
        <p className="guild-requires-service">{lockedMessage}</p>
      ) : !isFarmServiceAvailable && isUnlocked ? (
        <p className="guild-requires-service">
          Visit a hub with the Farmer to purchase upgrades.
        </p>
      ) : null}

      <div className="farm-upgrade-row-list">
        {field.upgrades.map((upgrade) => (
          <div className="farm-upgrade-row" key={upgrade.id}>
            <div>
              <strong>{upgrade.displayName}</strong>
              <span>
                Lv {upgrade.level}/{upgrade.maxLevel}
              </span>
            </div>
            <small>
              {upgrade.currentEffectText}
              {upgrade.nextEffectText ? ` -> ${upgrade.nextEffectText}` : ""}
            </small>
            <button
              disabled={!upgrade.canPurchase}
              onClick={() => onPurchase(field.fieldId, upgrade.id)}
              type="button"
            >
              {upgrade.actionText}
            </button>
          </div>
        ))}
      </div>

      <div className="farm-upgrade-overlay-footer">
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </>
  );
}

function LivestockAnimalUpgradeOverlayContent({
  creature,
  isLivestockServiceAvailable,
  isUnlocked,
  lockedMessage,
  onClose,
  onPurchase,
}: {
  creature: LivestockCreatureDisplay;
  isLivestockServiceAvailable: boolean;
  isUnlocked: boolean;
  lockedMessage: string | null;
  onClose: () => void;
  onPurchase: (
    creatureId: LivestockCreatureId,
    upgradeId: LivestockAnimalUpgradeId,
  ) => void;
}) {
  return (
    <>
      <div className="farm-upgrade-overlay-heading">
        <img
          alt=""
          aria-hidden="true"
          className="livestock-creature-icon"
          src={creature.iconSrc}
        />
        <h3>{creature.displayName}</h3>
      </div>

      <LivestockUpgradeRequirementMessage
        isLivestockServiceAvailable={isLivestockServiceAvailable}
        isUnlocked={isUnlocked}
        lockedMessage={lockedMessage}
      />

      <LivestockUpgradeRowList
        upgrades={creature.upgrades}
        onPurchase={(upgradeId) => onPurchase(creature.creatureId, upgradeId)}
      />

      <div className="farm-upgrade-overlay-footer">
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </>
  );
}

function LivestockBuildingUpgradeOverlayContent({
  upgrades,
  isLivestockServiceAvailable,
  isUnlocked,
  lockedMessage,
  onClose,
  onPurchase,
}: {
  upgrades: Array<LivestockUpgradeDisplay<LivestockBuildingUpgradeId>>;
  isLivestockServiceAvailable: boolean;
  isUnlocked: boolean;
  lockedMessage: string | null;
  onClose: () => void;
  onPurchase: (upgradeId: LivestockBuildingUpgradeId) => void;
}) {
  return (
    <>
      <div className="farm-upgrade-overlay-heading">
        <img
          alt=""
          aria-hidden="true"
          className="livestock-creature-icon"
          src={LIVESTOCK_CREATURE_ICON_SRC.locked}
        />
        <h3>Livestock Building</h3>
      </div>

      <LivestockUpgradeRequirementMessage
        isLivestockServiceAvailable={isLivestockServiceAvailable}
        isUnlocked={isUnlocked}
        lockedMessage={lockedMessage}
      />

      <LivestockUpgradeRowList upgrades={upgrades} onPurchase={onPurchase} />

      <div className="farm-upgrade-overlay-footer">
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </>
  );
}

function LivestockUpgradeRequirementMessage({
  isLivestockServiceAvailable,
  isUnlocked,
  lockedMessage,
}: {
  isLivestockServiceAvailable: boolean;
  isUnlocked: boolean;
  lockedMessage: string | null;
}) {
  return lockedMessage ? (
    <p className="guild-requires-service">{lockedMessage}</p>
  ) : !isLivestockServiceAvailable && isUnlocked ? (
    <p className="guild-requires-service">
      Visit a hub with Livestock to purchase upgrades.
    </p>
  ) : null;
}

function LivestockUpgradeRowList<
  TUpgradeId extends LivestockAnimalUpgradeId | LivestockBuildingUpgradeId,
>({
  upgrades,
  onPurchase,
}: {
  upgrades: Array<LivestockUpgradeDisplay<TUpgradeId>>;
  onPurchase: (upgradeId: TUpgradeId) => void;
}) {
  return (
    <div className="farm-upgrade-row-list">
      {upgrades.map((upgrade) => (
        <div className="farm-upgrade-row" key={upgrade.id}>
          <div>
            <strong>{upgrade.displayName}</strong>
            <span>
              Lv {upgrade.level}/{upgrade.maxLevel}
            </span>
          </div>
          <small>
            {upgrade.currentEffectText}
            {upgrade.nextEffectText ? ` -> ${upgrade.nextEffectText}` : ""}
          </small>
          <button
            disabled={!upgrade.canPurchase}
            onClick={() => onPurchase(upgrade.id)}
            type="button"
          >
            {upgrade.actionText}
          </button>
        </div>
      ))}
    </div>
  );
}

function getFarmHarvestButtonStatusText(field: FarmFieldDisplay): string {
  return field.harvestActionText === "Service unavailable"
    ? field.heldQuantity > 0
      ? field.holdText
      : "Nothing held"
    : field.harvestActionText;
}
