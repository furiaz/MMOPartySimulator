import {
  useEffect,
  useRef,
  useState,
} from "react";
import "./App.css";
import { GameMenu } from "./GameMenu";
import {
  CompanionVitalsPanel,
  type GameMenuTab,
  type PartyManagementSection,
  type PartyMenuSection,
} from "./CompanionPanels";
import {
  formatQuestStatus,
  getDisplayQuest,
  getQuestLogQuests,
  getQuestObjectiveText,
} from "./questUiHelpers";
import { QuestTrackerPanel } from "./QuestPanels";
import { PixiWorldRenderer } from "./worldRenderer/PixiWorldRenderer";

import {
  addEntity,
  allocateCompanionStatPoint,
  ARMOR_FAMILY_LABELS,
  buyMerchantItem,
  CLASS_DEFINITIONS,
  companionIds,
  companionStartPositions,
  createCompanion,
  createDebugMap,
  createEmptyPartyInventory,
  createEmptyPartyWallet,
  createInitialQuestStates,
  createNpc,
  createTargetDummy,
  clearDebugTelemetry,
  debugAddCompanionToParty,
  debugKillOneCompanion,
  debugRefreshResources,
  debugRemoveCompanionFromParty,
  debugResurrectEnemy,
  debugRestorePartyHealth,
  debugToggleSuperExp,
  debugToggleSuperSpeed,
  enemyIds,
  equipItemToCompanion,
  exportDebugTelemetryReport,
  formatCurrencyDisplay,
  getAvailableInventorySlots,
  getCurrencyBalance,
  getItemDefinition,
  getMerchantBuyStock,
  hubCompanionStartPositions,
  hubNpcStartData,
  HUB_MAP_ID,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_TYPE_LABELS,
  QUEST_DEFINITIONS,
  addItemToInventoryState,
  getPartyLeader,
  getPoiSearchScope,
  getTotalPartyCharacterLevel,
  hasQuestGiverWork,
  issueCompanionCommands,
  isMerchantNpc,
  quickExchangeParts,
  recordMerchantInteractionClosed,
  recordMerchantInteractionOpened,
  recordMerchantMenuSelected,
  resourceIds,
  resolveWorldWipeRecoveryChoice,
  setAutoModeEnabled,
  setLeaderIntent,
  setPartyLeader,
  setPartyMemberRole,
  setPartyOrder,
  setPoiSearchScope,
  setWorldTravelTargetMapId,
  startGameLoop,
  startDebugTelemetryRecording,
  stopDebugTelemetryRecording,
  targetDummyId,
  targetDummyPosition,
  unequipItemFromCompanion,
  updateEntity,
  type Companion,
  type DebugMapId,
  type Enemy,
  type EquipmentSlot,
  type EquipmentStatModifiers,
  type GameState,
  type ItemDefinition,
  type ItemId,
  type MerchantBuyFailureReason,
  type MerchantStockEntry,
  type MerchantStockGroup,
  type NpcEntity,
  type PartyMemberRole,
  type PrimaryStatId,
  type PoiConsideration,
  type PoiSearchScope,
  type Position,
  type QuestId,
  type ResourceEntity,
  type WorldWipeRecoveryChoice,
} from "./game";
import { type SpriteDirection } from "./visualAssets";

const debugMap = createDebugMap();
const gameVersion = "0.01";
const currencyGainFeedbackDurationMs = 1200;
const currencyGainBurstSrc =
  "Asserts/Generated/prototype-vfx/sprites/currency-gain-burst.png";
const mapConstructionCellPixelSize = 32;
const visualMovementGraceMs = 180;
const cameraSettleFactor = 0.08;
const cameraSnapDistance = 0.35;
const cameraDeadZoneWidthRatio = 0.34;
const cameraDeadZoneHeightRatio = 0.3;
const wildernessMapIds = new Set(["map-1", "map-2", "map-3", "map-4"]);
const poiSearchScopeLabels: Record<PoiSearchScope, string> = {
  free_travel: "Free Travel",
  zone_only: "Zone Only",
  subzone_only: "Subzone Only",
};
const poiSearchScopeCycle: PoiSearchScope[] = [
  "free_travel",
  "zone_only",
  "subzone_only",
];

function getNextPoiSearchScope(scope: PoiSearchScope): PoiSearchScope {
  const currentIndex = poiSearchScopeCycle.indexOf(scope);

  return poiSearchScopeCycle[
    (currentIndex + 1) % poiSearchScopeCycle.length
  ] ?? "free_travel";
}

type EntityVisualMovement = {
  direction: SpriteDirection;
  expiresAt: number;
};

type MerchantPanel = "buy" | "sell";

type MerchantBuyFilter = "all" | MerchantStockGroup;

const merchantBuyFilterLabels: Record<MerchantBuyFilter, string> = {
  all: "All",
  weapons: "Weapons",
  offhands: "Offhands",
  cloth: "Cloth",
  leather: "Leather",
  mail: "Mail",
  plate: "Plate",
  accessories: "Accessories",
};

const merchantBuyFilters: MerchantBuyFilter[] = [
  "all",
  "weapons",
  "offhands",
  "cloth",
  "leather",
  "mail",
  "plate",
  "accessories",
];

const primaryStatLabels: Record<PrimaryStatId, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
};

const merchantBuyFailureMessages: Record<MerchantBuyFailureReason, string> = {
  invalid_merchant: "Merchant unavailable",
  item_not_in_stock: "Item is not in stock",
  invalid_item: "Item cannot be purchased",
  invalid_price: "Item price is invalid",
  insufficient_crowns: "Not enough Crowns",
  inventory_full: "Inventory is full",
  inventory_add_failed: "Inventory could not receive the item",
  currency_remove_failed: "Crowns could not be spent",
};

type ViewportSize = {
  width: number;
  height: number;
};

type PerformanceMemorySnapshot = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

type BrowserPerformance = Performance & {
  memory?: PerformanceMemorySnapshot;
};

type PerformanceOverlayStats = {
  fps: number;
  frameMs: number;
  slowFrames: number;
  simFramesPerSecond: number;
  entityCount: number;
  companionCount: number;
  enemyCount: number;
  livingEnemyCount: number;
  resourceCount: number;
  activeResourceCount: number;
  npcCount: number;
  mapCells: number;
  wallCount: number;
  pathCount: number;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  memoryLimitMb: number | null;
};

function isWildernessVisualMap(mapId: string | undefined): boolean {
  return Boolean(mapId && wildernessMapIds.has(mapId));
}

function isHubVisualMap(mapId: string | undefined): boolean {
  return mapId === HUB_MAP_ID;
}


function formatIdentifierName(identifier: string): string {
  return identifier
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function LeaderPoiPanel({
  autoModeEnabled,
  consideredTargets,
  hasLeader,
}: {
  autoModeEnabled: boolean;
  consideredTargets: PoiConsideration[] | undefined;
  hasLeader: boolean;
}) {
  let emptyMessage: string | null = null;

  if (!autoModeEnabled) {
    emptyMessage = "Auto mode off";
  } else if (!hasLeader) {
    emptyMessage = "No leader";
  } else if (!consideredTargets || consideredTargets.length === 0) {
    emptyMessage = "No reachable POIs";
  }

  return (
    <aside className="leader-poi-panel" aria-label="Leader POIs">
      <h2>Leader POIs</h2>
      {emptyMessage ? (
        <p className="leader-poi-empty">{emptyMessage}</p>
      ) : (
        <ol className="leader-poi-list">
          {consideredTargets?.map((target) => (
            <li
              key={`${target.mapId}-${target.poiId}`}
              className={`leader-poi-row${target.isSelected ? " selected" : ""}`}
            >
              <span className="leader-poi-main">
                <strong>{formatIdentifierName(target.category)}</strong>
                <span>{target.poiId}</span>
              </span>
              <span className="leader-poi-reason">{target.reason}</span>
              <span className="leader-poi-distance">
                {Math.round(target.pathDistance)} steps
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function PerformanceOverlay({
  currentMap,
  gameState,
}: {
  currentMap: {
    columns: number;
    rows: number;
    walls: Position[];
  };
  gameState: GameState;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [stats, setStats] = useState<PerformanceOverlayStats>(() =>
    getPerformanceOverlayStats(gameState, currentMap, {
      fps: 0,
      frameMs: 0,
      slowFrames: 0,
      simFramesPerSecond: 0,
    }),
  );
  const latestGameStateRef = useRef(gameState);
  const latestMapRef = useRef(currentMap);

  useEffect(() => {
    latestGameStateRef.current = gameState;
    latestMapRef.current = currentMap;
  }, [currentMap, gameState]);

  useEffect(() => {
    let animationFrameId = 0;
    let previousFrameAt = performance.now();
    let previousSampleAt = previousFrameAt;
    let previousSimulationFrame =
      latestGameStateRef.current.simulationFrame ??
      latestGameStateRef.current.simulationTick ??
      0;
    let frameCount = 0;
    let frameMsTotal = 0;
    let slowFrames = 0;

    function sampleFrame(now: number) {
      const frameMs = now - previousFrameAt;
      previousFrameAt = now;
      frameCount += 1;
      frameMsTotal += frameMs;

      if (frameMs > 33) {
        slowFrames += 1;
      }

      if (now - previousSampleAt >= 500) {
        const elapsedSeconds = (now - previousSampleAt) / 1000;
        const currentState = latestGameStateRef.current;
        const currentSimulationFrame =
          currentState.simulationFrame ?? currentState.simulationTick ?? 0;
        const simulationFrameDelta =
          currentSimulationFrame - previousSimulationFrame;
        const timingStats = {
          fps: frameCount / elapsedSeconds,
          frameMs: frameMsTotal / frameCount,
          slowFrames,
          simFramesPerSecond: simulationFrameDelta / elapsedSeconds,
        };

        setStats(
          getPerformanceOverlayStats(
            currentState,
            latestMapRef.current,
            timingStats,
          ),
        );

        previousSampleAt = now;
        previousSimulationFrame = currentSimulationFrame;
        frameCount = 0;
        frameMsTotal = 0;
        slowFrames = 0;
      }

      animationFrameId = window.requestAnimationFrame(sampleFrame);
    }

    animationFrameId = window.requestAnimationFrame(sampleFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <aside
      className={`performance-overlay${isCollapsed ? " collapsed" : ""}`}
      aria-label="Performance overlay"
    >
      <div className="performance-overlay-header">
        <h2>Performance</h2>
        <button onClick={() => setIsCollapsed(!isCollapsed)} type="button">
          {isCollapsed ? "Show" : "Hide"}
        </button>
      </div>
      {isCollapsed ? null : (
        <dl className="performance-overlay-stats">
          <PerformanceStat label="FPS" value={formatStat(stats.fps)} />
          <PerformanceStat label="Frame" value={`${formatStat(stats.frameMs)}ms`} />
          <PerformanceStat label="Slow" value={stats.slowFrames.toString()} />
          <PerformanceStat label="Sim" value={`${formatStat(stats.simFramesPerSecond)}/s`} />
          <PerformanceStat label="Entities" value={stats.entityCount.toString()} />
          <PerformanceStat
            label="Party"
            value={stats.companionCount.toString()}
          />
          <PerformanceStat
            label="Enemies"
            value={`${stats.livingEnemyCount}/${stats.enemyCount}`}
          />
          <PerformanceStat
            label="Resources"
            value={`${stats.activeResourceCount}/${stats.resourceCount}`}
          />
          <PerformanceStat label="NPCs" value={stats.npcCount.toString()} />
          <PerformanceStat
            label="Map"
            value={`${currentMap.columns}x${currentMap.rows}`}
          />
          <PerformanceStat label="Cells" value={stats.mapCells.toLocaleString()} />
          <PerformanceStat label="Walls" value={stats.wallCount.toLocaleString()} />
          <PerformanceStat label="Paths" value={stats.pathCount.toLocaleString()} />
          <PerformanceStat
            label="Heap"
            value={
              stats.memoryUsedMb === null
                ? "n/a"
                : `${formatStat(stats.memoryUsedMb)} MB`
            }
          />
        </dl>
      )}
    </aside>
  );
}

function PerformanceStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="performance-overlay-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getPerformanceOverlayStats(
  gameState: GameState,
  currentMap: {
    columns: number;
    rows: number;
    walls: Position[];
  },
  timingStats: Pick<
    PerformanceOverlayStats,
    "fps" | "frameMs" | "slowFrames" | "simFramesPerSecond"
  >,
): PerformanceOverlayStats {
  const entities = Object.values(gameState.entities);
  const companions = entities.filter((entity) => entity.kind === "companion");
  const enemies = entities.filter((entity) => entity.kind === "enemy");
  const resources = entities.filter((entity) => entity.kind === "resource");
  const npcs = entities.filter((entity) => entity.kind === "npc");
  const memorySnapshot = getPerformanceMemorySnapshot();

  return {
    ...timingStats,
    entityCount: entities.length,
    companionCount: companions.length,
    enemyCount: enemies.length,
    livingEnemyCount: enemies.filter((enemy) => enemy.state !== "dead").length,
    resourceCount: resources.length,
    activeResourceCount: resources.filter(
      (resource) => !("isDepleted" in resource) || !resource.isDepleted,
    ).length,
    npcCount: npcs.length,
    mapCells: currentMap.columns * currentMap.rows,
    wallCount: currentMap.walls.length,
    pathCount: Object.keys(gameState.movementPathsByEntityId ?? {}).length,
    memoryUsedMb: memorySnapshot
      ? bytesToMegabytes(memorySnapshot.usedJSHeapSize)
      : null,
    memoryTotalMb: memorySnapshot
      ? bytesToMegabytes(memorySnapshot.totalJSHeapSize)
      : null,
    memoryLimitMb: memorySnapshot
      ? bytesToMegabytes(memorySnapshot.jsHeapSizeLimit)
      : null,
  };
}

function getPerformanceMemorySnapshot(): PerformanceMemorySnapshot | null {
  return (performance as BrowserPerformance).memory ?? null;
}

function bytesToMegabytes(bytes: number): number {
  return bytes / 1024 / 1024;
}

function formatStat(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  });
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
  const hasHorizontalMovement = Math.abs(xDelta) > 0.01;
  const hasVerticalMovement = Math.abs(yDelta) > 0.01;

  if (hasHorizontalMovement && hasVerticalMovement) {
    if (xDelta > 0) {
      return yDelta > 0 ? "southEast" : "northEast";
    }

    return yDelta > 0 ? "southWest" : "northWest";
  }

  if (Math.abs(xDelta) >= Math.abs(yDelta)) {
    return xDelta >= 0 ? "east" : "west";
  }

  return yDelta >= 0 ? "south" : "north";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function getMaximumCameraOffset({
  viewportSize,
  mapPixelWidth,
  mapPixelHeight,
}: {
  viewportSize: ViewportSize;
  mapPixelWidth: number;
  mapPixelHeight: number;
}): Position {
  return {
    x: Math.max(0, mapPixelWidth - viewportSize.width),
    y: Math.max(0, mapPixelHeight - viewportSize.height),
  };
}

function getDeadZoneCameraOffset({
  focusPosition,
  currentOffset,
  viewportSize,
  mapPixelWidth,
  mapPixelHeight,
}: {
  focusPosition: Position;
  currentOffset: Position;
  viewportSize: ViewportSize;
  mapPixelWidth: number;
  mapPixelHeight: number;
}): Position {
  const maximumOffset = getMaximumCameraOffset({
    viewportSize,
    mapPixelWidth,
    mapPixelHeight,
  });
  const deadZoneWidth = viewportSize.width * cameraDeadZoneWidthRatio;
  const deadZoneHeight = viewportSize.height * cameraDeadZoneHeightRatio;
  const deadZone = {
    left: currentOffset.x + (viewportSize.width - deadZoneWidth) / 2,
    right: currentOffset.x + (viewportSize.width + deadZoneWidth) / 2,
    top: currentOffset.y + (viewportSize.height - deadZoneHeight) / 2,
    bottom: currentOffset.y + (viewportSize.height + deadZoneHeight) / 2,
  };
  let targetOffset = { ...currentOffset };

  if (focusPosition.x < deadZone.left) {
    targetOffset = {
      ...targetOffset,
      x: currentOffset.x - (deadZone.left - focusPosition.x),
    };
  } else if (focusPosition.x > deadZone.right) {
    targetOffset = {
      ...targetOffset,
      x: currentOffset.x + (focusPosition.x - deadZone.right),
    };
  }

  if (focusPosition.y < deadZone.top) {
    targetOffset = {
      ...targetOffset,
      y: currentOffset.y - (deadZone.top - focusPosition.y),
    };
  } else if (focusPosition.y > deadZone.bottom) {
    targetOffset = {
      ...targetOffset,
      y: currentOffset.y + (focusPosition.y - deadZone.bottom),
    };
  }

  return {
    x: clamp(targetOffset.x, 0, maximumOffset.x),
    y: clamp(targetOffset.y, 0, maximumOffset.y),
  };
}

function getCameraAxisStep({
  current,
  target,
  focusDelta,
  deltaMs = 1000 / 60,
}: {
  current: number;
  target: number;
  focusDelta: number;
  deltaMs?: number;
}): number {
  const targetDistance = target - current;

  if (Math.abs(targetDistance) <= cameraSnapDistance) {
    return target;
  }

  if (
    Math.abs(focusDelta) > cameraSnapDistance &&
    Math.sign(focusDelta) === Math.sign(targetDistance)
  ) {
    const matchedDistance =
      Math.sign(targetDistance) *
      Math.min(Math.abs(targetDistance), Math.abs(focusDelta));

    return current + matchedDistance;
  }

  const frameAdjustedSettleFactor =
    1 - Math.pow(1 - cameraSettleFactor, deltaMs / (1000 / 60));

  return current + targetDistance * frameAdjustedSettleFactor;
}

function getVelocityMatchedCameraOffset({
  currentOffset,
  targetOffset,
  focusDelta,
  maximumOffset,
  deltaMs,
}: {
  currentOffset: Position;
  targetOffset: Position;
  focusDelta: Position;
  maximumOffset: Position;
  deltaMs?: number;
}): Position {
  return {
    x: clamp(
      getCameraAxisStep({
        current: currentOffset.x,
        target: targetOffset.x,
        focusDelta: focusDelta.x,
        deltaMs,
      }),
      0,
      maximumOffset.x,
    ),
    y: clamp(
      getCameraAxisStep({
        current: currentOffset.y,
        target: targetOffset.y,
        focusDelta: focusDelta.y,
        deltaMs,
      }),
      0,
      maximumOffset.y,
    ),
  };
}

function getSettledCameraOffset({
  currentOffset,
  targetOffset,
  deltaMs,
}: {
  currentOffset: Position;
  targetOffset: Position;
  deltaMs?: number;
}): Position {
  return {
    x: getCameraAxisStep({
      current: currentOffset.x,
      target: targetOffset.x,
      focusDelta: 0,
      deltaMs,
    }),
    y: getCameraAxisStep({
      current: currentOffset.y,
      target: targetOffset.y,
      focusDelta: 0,
      deltaMs,
    }),
  };
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

  const initialState = [
    leader,
    secondCompanion,
    ...npcs,
    createTargetDummy(targetDummyId, targetDummyPosition),
  ].reduce(addEntity, {
    entities: {},
    inventory: createEmptyPartyInventory(),
    wallet: createEmptyPartyWallet(),
    map: debugMap,
    currentMapId: HUB_MAP_ID,
    activeTeleport: null,
    autoModeEnabled: false,
    worldTravelTargetMapId: null,
    poiPreferences: {
      stayInMap: false,
      searchScope: "free_travel",
    },
    simulationTick: 0,
    simulationFrame: 0,
    simulationTimeMs: 0,
    simulationDeltaMs: 100,
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
    dropVisualEvents: [],
  });

  return addItemToInventoryState(
    initialState,
    "training_sword",
    1,
    "debug",
  ).state;
}

function RescueChoiceButton({
  choice,
  onChoose,
}: {
  choice: WorldWipeRecoveryChoice;
  onChoose: (hubId: string) => void;
}) {
  return (
    <button onClick={() => onChoose(choice.hubId)} type="button">
      <span>{choice.hubDisplayName}</span>
      <strong>{formatCurrencyAmount(choice.fee)} Crowns</strong>
    </button>
  );
}

function formatCurrencyAmount(amount: number): string {
  return Math.max(0, Math.floor(amount)).toLocaleString();
}

function MerchantBuyPanel({
  merchantNpcId,
  state,
  onBuy,
}: {
  merchantNpcId: string;
  state: GameState;
  onBuy: (itemId: ItemId) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<MerchantBuyFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(null);
  const stock = getMerchantBuyStock(state, merchantNpcId);
  const filteredStock =
    activeFilter === "all"
      ? stock
      : stock.filter((entry) => entry.group === activeFilter);
  const selectedEntry =
    filteredStock.find((entry) => entry.itemId === selectedItemId) ??
    filteredStock[0] ??
    null;
  const selectedItemDefinition = selectedEntry
    ? getItemDefinition(selectedEntry.itemId)
    : null;
  const availableSlots = getAvailableInventorySlots(state.inventory);
  const crownBalance = getCurrencyBalance(state.wallet, "crowns");
  const selectedBlockReason = selectedEntry
    ? getMerchantBuyBlockReason(selectedEntry, state)
    : "No item selected";

  return (
    <aside className="merchant-detail-panel merchant-buy-panel" aria-label="Merchant buy">
      <div className="merchant-buy-header">
        <div>
          <h2>Buy</h2>
          <span>
            Slots {state.inventory.slots.length}/{state.inventory.capacity}
          </span>
        </div>
        <strong>{formatCurrencyDisplay(state.wallet, "crowns")}</strong>
      </div>
      <nav className="merchant-buy-filter-tabs" aria-label="Merchant stock filters">
        {merchantBuyFilters.map((filter) => (
          <button
            key={filter}
            className={activeFilter === filter ? "active" : ""}
            onClick={() => setActiveFilter(filter)}
            type="button"
          >
            {merchantBuyFilterLabels[filter]}
          </button>
        ))}
      </nav>
      <div className="merchant-buy-layout">
        <div className="merchant-stock-list" aria-label="Merchant stock">
          {filteredStock.length > 0 ? (
            filteredStock.map((entry) => {
              const itemDefinition = getItemDefinition(entry.itemId);
              const isSelected = selectedEntry?.itemId === entry.itemId;
              const canAffordItem = crownBalance >= entry.priceCrowns;

              return (
                <button
                  key={entry.itemId}
                  className={`merchant-stock-row${
                    isSelected ? " selected" : ""
                  }${canAffordItem ? "" : " unaffordable"}`}
                  onClick={() => setSelectedItemId(entry.itemId)}
                  type="button"
                >
                  <span>
                    <strong>{itemDefinition.displayName}</strong>
                    <small>{getMerchantItemTagText(itemDefinition)}</small>
                  </span>
                  <b>{entry.priceCrowns}</b>
                </button>
              );
            })
          ) : (
            <span className="merchant-empty-stock">No stock in this category</span>
          )}
        </div>
        <div className="merchant-buy-detail" aria-label="Selected stock item">
          {selectedEntry && selectedItemDefinition ? (
            <>
              <div>
                <span className="merchant-detail-kicker">
                  {merchantBuyFilterLabels[selectedEntry.group]}
                </span>
                <h3>{selectedItemDefinition.displayName}</h3>
                <p>{selectedItemDefinition.description}</p>
              </div>
              <dl className="merchant-item-stat-grid">
                <div>
                  <dt>Price</dt>
                  <dd>{selectedEntry.priceCrowns} Crowns</dd>
                </div>
                <div>
                  <dt>Slot</dt>
                  <dd>{getMerchantSlotText(selectedItemDefinition)}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{getMerchantTypeText(selectedItemDefinition)}</dd>
                </div>
                <div>
                  <dt>Requirement</dt>
                  <dd>{getMerchantRequirementText(selectedItemDefinition)}</dd>
                </div>
              </dl>
              <div className="merchant-modifier-list">
                <span className="merchant-detail-kicker">Modifiers</span>
                <p>{getMerchantModifierText(selectedItemDefinition)}</p>
              </div>
              <button
                className="merchant-buy-action"
                disabled={Boolean(selectedBlockReason)}
                onClick={() => onBuy(selectedEntry.itemId)}
                title={selectedBlockReason || `Buy ${selectedItemDefinition.displayName}`}
                type="button"
              >
                {selectedBlockReason || "Buy Item"}
              </button>
              {availableSlots <= 0 ? (
                <span className="merchant-buy-warning">Inventory full</span>
              ) : null}
            </>
          ) : (
            <span className="merchant-empty-stock">Select an item</span>
          )}
        </div>
      </div>
    </aside>
  );
}

function getMerchantBuyBlockReason(
  entry: MerchantStockEntry,
  state: GameState,
): string | null {
  if (getCurrencyBalance(state.wallet, "crowns") < entry.priceCrowns) {
    return "Not enough Crowns";
  }

  if (getAvailableInventorySlots(state.inventory) < 1) {
    return "Inventory Full";
  }

  return null;
}

function getMerchantItemTagText(itemDefinition: ItemDefinition): string {
  return [
    getMerchantTypeText(itemDefinition),
    itemDefinition.armorFamily
      ? ARMOR_FAMILY_LABELS[itemDefinition.armorFamily]
      : null,
    itemDefinition.tier ? `Tier ${itemDefinition.tier}` : null,
    itemDefinition.levelRequirement
      ? `Lv ${itemDefinition.levelRequirement}+`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function getMerchantSlotText(itemDefinition: ItemDefinition): string {
  if (itemDefinition.equipmentKind === "accessory") {
    return "Accessory";
  }

  return itemDefinition.equipmentSlot
    ? EQUIPMENT_SLOT_LABELS[itemDefinition.equipmentSlot]
    : "Equipment";
}

function getMerchantTypeText(itemDefinition: ItemDefinition): string {
  return itemDefinition.equipmentType
    ? EQUIPMENT_TYPE_LABELS[itemDefinition.equipmentType]
    : "Equipment";
}

function getMerchantRequirementText(itemDefinition: ItemDefinition): string {
  const levelText = itemDefinition.levelRequirement
    ? `Level ${itemDefinition.levelRequirement}+`
    : "No level requirement";
  const classText =
    itemDefinition.allowedClassIds && itemDefinition.allowedClassIds.length > 0
      ? itemDefinition.allowedClassIds
          .map((classId) => CLASS_DEFINITIONS[classId].displayName)
          .join(", ")
      : "Any class";

  return `${levelText} | ${classText}`;
}

function getMerchantModifierText(itemDefinition: ItemDefinition): string {
  const primaryStats = Object.entries(itemDefinition.primaryStatModifiers ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(
      ([stat, value]) =>
        `${primaryStatLabels[stat as PrimaryStatId]} ${formatMerchantModifier(value)}`,
    );
  const derivedStats = Object.entries(
    (itemDefinition.statModifiers ?? {}) as EquipmentStatModifiers,
  )
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(
      ([stat, value]) =>
        `${formatMerchantStatName(stat)} ${formatMerchantModifier(value)}`,
    );
  const stats = [...primaryStats, ...derivedStats];

  return stats.length > 0 ? stats.join(", ") : "No stat modifiers";
}

function formatMerchantStatName(stat: string): string {
  return stat.replace(/[A-Z]/g, (letter) => ` ${letter}`).toLowerCase();
}

function formatMerchantModifier(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [showEntityInfo, setShowEntityInfo] = useState(false);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [activeGameMenuTab, setActiveGameMenuTab] =
    useState<GameMenuTab | null>(null);
  const [activePartyManagementSection, setActivePartyManagementSection] =
    useState<PartyManagementSection>("role");
  const [activePartyMenuSection, setActivePartyMenuSection] =
    useState<PartyMenuSection>("stats");
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(
    null,
  );
  const [selectedQuestId, setSelectedQuestId] = useState<QuestId | null>(null);
  const [activeMerchantNpcId, setActiveMerchantNpcId] = useState<string | null>(
    null,
  );
  const [activeMerchantPanel, setActiveMerchantPanel] =
    useState<MerchantPanel | null>(null);
  const [merchantResultMessage, setMerchantResultMessage] =
    useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [currencyGainFeedbackUntil, setCurrencyGainFeedbackUntil] = useState(0);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [
    visualMovementByEntityId,
    setVisualMovementByEntityId,
  ] = useState<Record<string, EntityVisualMovement>>({});
  const stopLoopRef = useRef<(() => void) | null>(null);
  const latestAnimatedEntityPositionsRef = useRef<Record<string, Position>>({});
  const previousAnimatedEntityPositionsRef = useRef<Record<string, Position>>({});
  const visualCameraOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const cameraMapIdRef = useRef<string | undefined>(undefined);
  const previousCameraFocusRef = useRef<Position | null>(null);
  const currentCrownBalance = getCurrencyBalance(gameState.wallet, "crowns");
  const previousCrownBalanceRef = useRef(currentCrownBalance);
  const currentMap = gameState.map ?? debugMap;
  const allEntities = Object.values(gameState.entities);

  const partyMembers = companionIds
    .map((id) => gameState.entities[id] as Companion | undefined)
    .filter((companion): companion is Companion => Boolean(companion));
  const selectedMenuCompanionId = partyMembers.some(
    (member) => member.id === selectedCompanionId,
  )
    ? selectedCompanionId
    : partyMembers[0]?.id ?? null;
  const activePartyMemberIds = partyMembers.map((companion) => companion.id);
  const totalPartyLevel = getTotalPartyCharacterLevel(gameState);
  const leader = getPartyLeader(gameState);
  const hasPartyLeader = Boolean(leader);
  const enemies = Object.values(gameState.entities).filter(
    (entity): entity is Enemy => entity.kind === "enemy",
  );
  const resources = resourceIds
    .map((id) => gameState.entities[id] as ResourceEntity | undefined)
    .filter((resource): resource is ResourceEntity => Boolean(resource));
  const displayQuest = getDisplayQuest(gameState.quests);
  const poiSearchScope = getPoiSearchScope(gameState);
  const activeQuestIds = getQuestLogQuests(gameState.quests).map(
    (quest) => quest.questId,
  );
  const selectedMenuQuestId =
    selectedQuestId && activeQuestIds.includes(selectedQuestId)
      ? selectedQuestId
      : activeQuestIds[0] ?? null;
  const questGiverHasWork = hasQuestGiverWork(gameState);
  const targetEnemy = enemies.find((enemy) => enemy.state !== "dead");
  const targetResource = resources.find((resource) => !resource.isDepleted);
  const inventory = gameState.inventory;
  const activeTeleport = gameState.activeTeleport;
  const activeMerchant =
    activeMerchantNpcId && isMerchantNpc(gameState.entities[activeMerchantNpcId])
      ? gameState.entities[activeMerchantNpcId]
      : null;
  const shouldShowWalletToast =
    !activeMerchant && (gameState.wallet.visibleUntil ?? 0) > currentTime;
  const shouldShowCurrencyGainFeedback =
    currencyGainFeedbackUntil > currentTime;
  const pendingWorldWipeRecovery =
    gameState.worldWipeRecovery?.status === "pending_choice"
      ? gameState.worldWipeRecovery
      : null;
  const activeWorldWipeRescue =
    gameState.worldWipeRecovery?.status === "rescued" &&
    gameState.worldWipeRecovery.expiresAt > currentTime
      ? gameState.worldWipeRecovery
      : null;

  useEffect(() => {
    const previousCrownBalance = previousCrownBalanceRef.current;

    if (currentCrownBalance > previousCrownBalance) {
      setCurrencyGainFeedbackUntil(Date.now() + currencyGainFeedbackDurationMs);
    }

    previousCrownBalanceRef.current = currentCrownBalance;
  }, [currentCrownBalance]);

  useEffect(() => {
    let animationFrameId = 0;
    let isActive = true;

    function stepVisualClock() {
      if (!isActive) {
        return;
      }

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
      animationFrameId = window.requestAnimationFrame(stepVisualClock);
    }

    animationFrameId = window.requestAnimationFrame(stepVisualClock);

    return () => {
      isActive = false;
      window.cancelAnimationFrame(animationFrameId);
      stopLoopRef.current?.();
    };
  }, []);

  useEffect(() => {
    function updateViewportSize() {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener("resize", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
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

  function cyclePoiSearchScope() {
    setGameState((state) =>
      setPoiSearchScope(
        state,
        getNextPoiSearchScope(getPoiSearchScope(state)),
      ),
    );
  }

  function changePartyMemberRole(
    entityId: string,
    role: PartyMemberRole,
  ) {
    setGameState((state) => setPartyMemberRole(state, entityId, role));
  }

  function changePartyLeader(companionId: string) {
    setGameState((state) => {
      const companion = state.entities[companionId];

      return companion?.kind === "companion" && companion.state !== "dead"
        ? setPartyLeader(state, companion.id)
        : state;
    });
  }

  function commandCompanionsToFollow() {
    if (!leader || activePartyMemberIds.length === 0) {
      return;
    }

    setGameState((state) => {
      const livingLeader = getPartyLeader(state);

      if (!livingLeader) {
        return state;
      }

      return issueCompanionCommands(
        state,
        activePartyMemberIds.filter((entityId) => entityId !== livingLeader.id),
        {
          type: "follow",
          targetId: livingLeader.id,
        },
      );
    });
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
      const leader = getPartyLeader(state);

      if (!leader) {
        return state;
      }

      const leaderIntentState = setLeaderIntent(state, {
        type: "attack",
        targetId: targetEnemyId,
        targetPosition: target?.position ?? null,
        source: "player",
      });

      return updateEntity(leaderIntentState, {
        ...leader,
        state: "follow",
        currentTargetId: targetEnemyId,
        commandPriority: "autonomous",
      });
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

  function killOneCompanion() {
    setGameState(debugKillOneCompanion);
  }

  function equipEquipment(
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) {
    setGameState((state) =>
      equipItemToCompanion(state, companionId, itemId, targetSlot).state,
    );
  }

  function unequipEquipment(
    companionId: string,
    targetSlot: EquipmentSlot,
  ) {
    setGameState((state) =>
      unequipItemFromCompanion(state, companionId, targetSlot).state,
    );
  }

  function allocateStatPoint(companionId: string, statId: PrimaryStatId) {
    setGameState((state) => {
      const companion = state.entities[companionId];

      if (companion?.kind !== "companion") {
        return state;
      }

      const result = allocateCompanionStatPoint(companion, statId);

      return result.status === "success"
        ? updateEntity(state, result.companion)
        : state;
    });
  }

  function toggleEntityInfo() {
    setShowEntityInfo((isVisible) => !isVisible);
  }

  function toggleDebugTools() {
    setShowDebugTools((isVisible) => !isVisible);
  }

  function toggleSuperSpeed() {
    setGameState(debugToggleSuperSpeed);
  }

  function toggleSuperExp() {
    setGameState(debugToggleSuperExp);
  }

  function selectGameMenuTab(tab: GameMenuTab | null) {
    setActiveGameMenuTab(tab);
  }

  function setWorldTravelRoute(targetMapId: DebugMapId) {
    setGameState((state) =>
      setAutoModeEnabled(setWorldTravelTargetMapId(state, targetMapId), true),
    );
  }

  function clearWorldTravelRoute() {
    setGameState((state) => setWorldTravelTargetMapId(state, null));
  }

  function openEquipmentManagementFromInventory() {
    setSelectedCompanionId(selectedMenuCompanionId);
    setActiveGameMenuTab("party");
    setActivePartyMenuSection("equipment");
  }

  function movePartyMemberOrder(
    companionId: string,
    direction: "up" | "down",
  ) {
    setGameState((state) => {
      const orderedMembers = companionIds
        .map((id) => state.entities[id] as Companion | undefined)
        .filter((companion): companion is Companion => Boolean(companion))
        .sort((a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id));
      const currentIndex = orderedMembers.findIndex(
        (member) => member.id === companionId,
      );
      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (
        currentIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= orderedMembers.length
      ) {
        return state;
      }

      const currentMember = orderedMembers[currentIndex];
      const targetMember = orderedMembers[targetIndex];
      const swappedCurrent = setPartyOrder(
        state,
        currentMember.id,
        targetMember.partyOrder,
      );

      return setPartyOrder(
        swappedCurrent,
        targetMember.id,
        currentMember.partyOrder,
      );
    });
  }

  function openMerchantInteraction(npc: NpcEntity) {
    setActiveMerchantNpcId(npc.id);
    setActiveMerchantPanel(null);
    setMerchantResultMessage(null);
    setGameState((state) => recordMerchantInteractionOpened(state, npc.id));
  }

  function selectMerchantPanel(panel: MerchantPanel) {
    if (!activeMerchantNpcId) {
      return;
    }

    setActiveMerchantPanel(panel);
    setMerchantResultMessage(null);
    setGameState((state) =>
      recordMerchantMenuSelected(state, activeMerchantNpcId, panel),
    );
  }

  function exchangeMerchantJunk() {
    if (!activeMerchantNpcId) {
      return;
    }

    setActiveMerchantPanel(null);
    const selectedState = recordMerchantMenuSelected(
      gameState,
      activeMerchantNpcId,
      "quick_exchange_parts",
    );
    const exchange = quickExchangeParts(selectedState, activeMerchantNpcId);

    if (exchange.result.status === "success") {
      setMerchantResultMessage(
        `Exchanged junk for ${exchange.result.totalExchangeValue} Crowns`,
      );
    } else if (exchange.result.status === "no_items") {
      setMerchantResultMessage("No junk to exchange");
    } else {
      setMerchantResultMessage("Quick exchange failed");
    }

    setGameState(exchange.state);
  }

  function buyMerchantStockItem(itemId: ItemId) {
    if (!activeMerchantNpcId) {
      return;
    }

    const purchase = buyMerchantItem(gameState, activeMerchantNpcId, itemId);

    if (purchase.result.status === "success") {
      setMerchantResultMessage(
        `Bought ${purchase.result.displayName} for ${purchase.result.priceCrowns} Crowns`,
      );
    } else {
      setMerchantResultMessage(merchantBuyFailureMessages[purchase.result.reason]);
    }

    setGameState(purchase.state);
  }

  function closeMerchantInteraction() {
    const merchantNpcId = activeMerchantNpcId;

    setActiveMerchantNpcId(null);
    setActiveMerchantPanel(null);
    setMerchantResultMessage(null);

    if (!merchantNpcId) {
      return;
    }

    setGameState((state) => {
      const selectedState = recordMerchantMenuSelected(state, merchantNpcId, "leave");

      return recordMerchantInteractionClosed(selectedState, merchantNpcId);
    });
  }

  function chooseWorldWipeRecoveryHub(hubId: string) {
    setGameState((state) =>
      resolveWorldWipeRecoveryChoice(state, hubId, Date.now()),
    );
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
      const leader = getPartyLeader(state);

      if (!leader) {
        return state;
      }

      const leaderIntentState = setLeaderIntent(state, {
        type: "move",
        targetId: null,
        targetPosition: { ...targetPosition },
        source: "player",
      });

      return updateEntity(leaderIntentState, {
        ...leader,
        state: "follow",
        currentTargetId: null,
        commandPriority: "autonomous",
      });
    });
  }

  function commandPartyToMoveFromFloorPosition(targetPosition: Position) {
    if (!isValidFloorPosition(targetPosition)) {
      return;
    }

    commandPartyToMoveToPosition(targetPosition);
  }

  function commandPartyToInteractWithNpc(npcId: string) {
    const npc = gameState.entities[npcId];

    if (npc?.kind !== "npc") {
      return;
    }

    if (npc.npcRole === "merchant") {
      openMerchantInteraction(npc);
      return;
    }

    commandPartyToMoveToPosition(npc.position);
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

  const useWildernessVisuals = isWildernessVisualMap(currentMap.id);
  const useHubVisuals = isHubVisualMap(currentMap.id);
  const mapPixelWidth = currentMap.columns * mapConstructionCellPixelSize;
  const mapPixelHeight = currentMap.rows * mapConstructionCellPixelSize;
  const leaderCameraPosition = leader?.position ?? { x: 0, y: 0 };
  const leaderCameraFocusPosition = {
    x: leaderCameraPosition.x * mapConstructionCellPixelSize + mapConstructionCellPixelSize / 2,
    y: leaderCameraPosition.y * mapConstructionCellPixelSize + mapConstructionCellPixelSize / 2,
  };
  const currentMapKey = currentMap.id ?? currentMap.debugName;
  const terrainCameraOffset = getDeadZoneCameraOffset({
    focusPosition: leaderCameraFocusPosition,
    currentOffset: visualCameraOffsetRef.current,
    viewportSize,
    mapPixelWidth,
    mapPixelHeight,
  });
  useEffect(() => {
    const maximumOffset = getMaximumCameraOffset({
      viewportSize,
      mapPixelWidth,
      mapPixelHeight,
    });
    const targetOffset = getDeadZoneCameraOffset({
      focusPosition: leaderCameraFocusPosition,
      currentOffset: visualCameraOffsetRef.current,
      viewportSize,
      mapPixelWidth,
      mapPixelHeight,
    });

    if (cameraMapIdRef.current !== currentMapKey) {
      cameraMapIdRef.current = currentMapKey;
      previousCameraFocusRef.current = leaderCameraFocusPosition;
      visualCameraOffsetRef.current = targetOffset;
      return;
    }

    const previousFocus =
      previousCameraFocusRef.current ?? leaderCameraFocusPosition;
    const focusDelta = {
      x: leaderCameraFocusPosition.x - previousFocus.x,
      y: leaderCameraFocusPosition.y - previousFocus.y,
    };
    const velocityMatchedOffset = getVelocityMatchedCameraOffset({
      currentOffset: visualCameraOffsetRef.current,
      targetOffset,
      focusDelta,
      maximumOffset,
    });
    previousCameraFocusRef.current = leaderCameraFocusPosition;
    visualCameraOffsetRef.current = velocityMatchedOffset;

    let animationFrameId = 0;
    let isActive = true;
    let previousCameraStepAt = Date.now();

    function stepCamera() {
      const now = Date.now();
      const deltaMs = now - previousCameraStepAt;
      previousCameraStepAt = now;
      const currentOffset = visualCameraOffsetRef.current;
      const nextTargetOffset = getDeadZoneCameraOffset({
        focusPosition: leaderCameraFocusPosition,
        currentOffset,
        viewportSize,
        mapPixelWidth,
        mapPixelHeight,
      });
      const xDistance = nextTargetOffset.x - currentOffset.x;
      const yDistance = nextTargetOffset.y - currentOffset.y;

      if (
        Math.abs(xDistance) <= cameraSnapDistance &&
        Math.abs(yDistance) <= cameraSnapDistance
      ) {
        visualCameraOffsetRef.current = nextTargetOffset;
        return;
      }

      const nextOffset = getSettledCameraOffset({
        currentOffset,
        targetOffset: nextTargetOffset,
        deltaMs,
      });

      visualCameraOffsetRef.current = nextOffset;

      if (isActive) {
        animationFrameId = window.requestAnimationFrame(stepCamera);
      }
    }

    animationFrameId = window.requestAnimationFrame(stepCamera);

    return () => {
      isActive = false;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [
    currentMapKey,
    leaderCameraFocusPosition.x,
    leaderCameraFocusPosition.y,
    mapPixelHeight,
    mapPixelWidth,
    viewportSize.height,
    viewportSize.width,
  ]);

  return (
    <main className="game-page">
      <section className="game-panel">
        <h1>Follow System Test</h1>

        <div
          key={gameState.currentMapId ?? HUB_MAP_ID}
          className={`test-area floor-default${
            useWildernessVisuals ? " floor-wilderness" : ""
          }${useHubVisuals ? " floor-hub" : ""
          }`}
          aria-label="Follow system top-down test area"
        >
          <div className="map-label-overlay">
            <div className="map-title-row">
              <span className="map-version">v{gameVersion}</span>
              <strong>{currentMap.displayName}</strong>
              <button
                className={`stay-in-map-toggle${
                  poiSearchScope !== "free_travel" ? " active" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  cyclePoiSearchScope();
                }}
                type="button"
              >
                Scope: {poiSearchScopeLabels[poiSearchScope]}
              </button>
            </div>
            <span>debug: {currentMap.debugName}</span>
          </div>
          <div className="map-debug-toggle-controls" aria-label="Debug multipliers">
            <button
              className={gameState.debugOptions?.superSpeedEnabled ? "active" : ""}
              onClick={(event) => {
                event.stopPropagation();
                toggleSuperSpeed();
              }}
              type="button"
            >
              Super Speed {gameState.debugOptions?.superSpeedEnabled ? "On" : "Off"}
            </button>
            <button
              className={gameState.debugOptions?.superExpEnabled ? "active" : ""}
              onClick={(event) => {
                event.stopPropagation();
                toggleSuperExp();
              }}
              type="button"
            >
              Super Exp {gameState.debugOptions?.superExpEnabled ? "On" : "Off"}
            </button>
          </div>
          <PerformanceOverlay currentMap={currentMap} gameState={gameState} />
          <LeaderPoiPanel
            autoModeEnabled={gameState.autoModeEnabled}
            consideredTargets={gameState.lastPoiDecision?.consideredTargets}
            hasLeader={hasPartyLeader}
          />
          <PixiWorldRenderer
            activeTeleport={activeTeleport}
            cameraOffset={terrainCameraOffset}
            cellPixelSize={mapConstructionCellPixelSize}
            combatFeedbackEvents={gameState.combatFeedbackEvents}
            currentTime={currentTime}
            dropVisualEvents={gameState.dropVisualEvents ?? []}
            entities={allEntities}
            leaderIntent={gameState.leaderIntent}
            map={currentMap}
            mode="full"
            onEnemyClick={commandPartyToTargetEnemy}
            onFloorClick={commandPartyToMoveFromFloorPosition}
            onNpcClick={commandPartyToInteractWithNpc}
            onResourceClick={commandCompanionsToGatherResource}
            questGiverHasWork={questGiverHasWork}
            resurrectionProgressByCompanionId={
              gameState.resurrectionProgressByCompanionId ?? {}
            }
            showDebugOverlays={showEntityInfo}
            skillBindsByEnemyId={gameState.skillBindsByEnemyId ?? {}}
            skillMarksByEnemyId={gameState.skillMarksByEnemyId ?? {}}
            skillShieldBlocksById={gameState.skillShieldBlocksById ?? {}}
            skillVisualEvents={gameState.skillVisualEvents ?? []}
            viewportSize={viewportSize}
            visualMovementByEntityId={visualMovementByEntityId}
          />
          <PixiWorldRenderer
            activeTeleport={activeTeleport}
            cameraOffset={terrainCameraOffset}
            cellPixelSize={mapConstructionCellPixelSize}
            currentTime={currentTime}
            entities={allEntities}
            leaderIntent={gameState.leaderIntent}
            map={currentMap}
            mode="preview"
            viewportSize={viewportSize}
            visualMovementByEntityId={visualMovementByEntityId}
          />
        </div>

        {activeMerchant ? (
          <section className="merchant-interaction" aria-label="Merchant menu">
            <div className="merchant-menu">
              <div className="merchant-menu-header">
                <h2>{activeMerchant.displayName}</h2>
                <span>{formatCurrencyDisplay(gameState.wallet, "crowns")}</span>
              </div>
              <button
                className={activeMerchantPanel === "buy" ? "active" : ""}
                onClick={() => selectMerchantPanel("buy")}
                type="button"
              >
                Buy
              </button>
              <button
                className={activeMerchantPanel === "sell" ? "active" : ""}
                onClick={() => selectMerchantPanel("sell")}
                type="button"
              >
                Sell
              </button>
              <button onClick={exchangeMerchantJunk} type="button">
                Quick Exchange Junk
              </button>
              <button onClick={closeMerchantInteraction} type="button">
                Leave
              </button>
              {merchantResultMessage ? (
                <p className="merchant-result-message">{merchantResultMessage}</p>
              ) : null}
            </div>
            {activeMerchantPanel ? (
              activeMerchantPanel === "buy" ? (
                <MerchantBuyPanel
                  merchantNpcId={activeMerchant.id}
                  state={gameState}
                  onBuy={buyMerchantStockItem}
                />
              ) : (
                <aside className="merchant-detail-panel">
                  <h2>Sell</h2>
                  <p>Placeholder</p>
                </aside>
              )
            ) : null}
          </section>
        ) : null}

        {shouldShowWalletToast ? (
          <div className="wallet-visibility-toast" aria-label="Wallet balance">
            {shouldShowCurrencyGainFeedback ? (
              <img
                alt=""
                className="currency-gain-vfx"
                src={currencyGainBurstSrc}
              />
            ) : null}
            {formatCurrencyDisplay(gameState.wallet, "crowns")}
          </div>
        ) : null}

        {pendingWorldWipeRecovery ? (
          <section className="rescue-overlay" aria-label="Choose rescue hub">
            <div className="rescue-panel">
              <p className="rescue-kicker">Rescue needed</p>
              <h2>Choose a rescue hub</h2>
              <div className="rescue-choice-list">
                {pendingWorldWipeRecovery.choices.map((choice) => (
                  <RescueChoiceButton
                    key={choice.hubId}
                    choice={choice}
                    onChoose={chooseWorldWipeRecoveryHub}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeWorldWipeRescue ? (
          <section className="rescue-overlay" aria-label="Party rescued">
            <div className="rescue-panel rescue-panel-compact">
              <p className="rescue-kicker">
                {activeWorldWipeRescue.selectedChoice.rescueActorName}
              </p>
              <h2>{activeWorldWipeRescue.selectedChoice.rescueLine}</h2>
              <p>
                Rescue fee: {formatCurrencyAmount(activeWorldWipeRescue.chargedFee)} Crowns
              </p>
            </div>
          </section>
        ) : null}

        <GameMenu
          activeTab={activeGameMenuTab}
          activeManagementSection={activePartyManagementSection}
          activePartySection={activePartyMenuSection}
          inventory={inventory}
          wallet={gameState.wallet}
          isOpen={isGameMenuOpen}
          leaderId={gameState.partyLeaderId}
          members={partyMembers}
          quests={gameState.quests}
          currentMapId={gameState.currentMapId}
          worldTravelTargetMapId={gameState.worldTravelTargetMapId}
          selectedCompanionId={selectedMenuCompanionId}
          selectedQuestId={selectedMenuQuestId}
          totalPartyLevel={totalPartyLevel}
          onAllocateStatPoint={allocateStatPoint}
          onChangeLeader={changePartyLeader}
          onChangeRole={changePartyMemberRole}
          onEquipEquipment={equipEquipment}
          onOpenEquipmentManagement={openEquipmentManagementFromInventory}
          onSelectCompanion={setSelectedCompanionId}
          onSelectManagementSection={setActivePartyManagementSection}
          onSelectPartySection={setActivePartyMenuSection}
          onSelectQuest={setSelectedQuestId}
          onSelectTab={selectGameMenuTab}
          onSetWorldTravelRoute={setWorldTravelRoute}
          onClearWorldTravelRoute={clearWorldTravelRoute}
          onToggle={toggleGameMenu}
          onUnequipEquipment={unequipEquipment}
          onMovePartyOrder={movePartyMemberOrder}
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
                <button onClick={resurrectEnemy}>Resurrect Enemy</button>
                <button onClick={restorePartyHealth}>Restore Party HP</button>
                <button onClick={killOneCompanion}>Kill One Companion</button>
                <button onClick={refreshGatherPoints}>
                  Refresh Gather Points
                </button>
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
                  {gameState.debugTelemetry?.isRecording ? "On" : "Off"} | Samples{" "}
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

