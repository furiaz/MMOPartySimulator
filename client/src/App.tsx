import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import "./App.css";
import { CompanionVitalsPanel } from "./CompanionVitalsPanel";
import { GuidePopup } from "./GuidePopup";
import {
  guidePopupDefinitions,
  type GuidePopupId,
} from "./guidePopupDefinitions";
import type {
  GameMenuTab,
  PartyManagementSection,
  PartyMenuSection,
} from "./gameMenuTypes";
import { getNpcInteractionRange } from "./npcInteractionRange";
import {
  formatQuestStatus,
  getDisplayQuest,
  getObjectiveLabel,
  getQuestLogQuests,
  getQuestObjectiveText,
  getQuestProgressTotals,
  getQuestRewardText,
  getQuestTurnInErrorText,
} from "./questUiHelpers";
import { QuestTrackerPanel } from "./QuestTrackerPanel";
import type { PixiRendererPerformanceSample } from "./worldRenderer/PixiWorldRendererHelpers";

import {
  allocateCompanionStatPoint,
  ARMOR_FAMILY_LABELS,
  buyMerchantItem,
  CLASS_DEFINITIONS,
  companionIds,
  companionStartPositions,
  createDebugMap,
  createInitialGameState,
  clearDebugTelemetry,
  closeSlimewardDungeonChestUi,
  continueSlimewardDungeonChest,
  debugAddCompanionToParty,
  debugAddPrototypeConsumablesToInventory,
  debugAddTestCrowns,
  debugFinishCurrentQuest,
  debugForceSuperiorEnemyInCurrentSubzone,
  debugKillOneCompanion,
  debugLevelUpAllCompanions,
  debugRefreshResources,
  debugRemoveCompanionFromParty,
  debugResetSlimewardDungeon,
  debugResurrectEnemy,
  debugRestorePartyHealth,
  debugToggleCompanionInfiniteHealth,
  debugToggleCompanionOneHunterClass,
  debugToggleSuperExp,
  debugToggleSuperSpeed,
  debugTurnInCurrentQuest,
  enemyIds,
  assignFoodToCompanion,
  equipItemToCompanion,
  equipFlaskToCompanion,
  exportDebugTelemetryReport,
  EQUIPMENT_TUTORIAL_QUEST_ID,
  formatCurrencyDisplay,
  getAvailableInventorySlots,
  getCurrencyBalance,
  getCompanionDerivedStats,
  getEnemyArchetype,
  getEnemyType,
  getFilteredMerchantBuyStock,
  getActiveQuest,
  getItemDefinition,
  getMerchantBuyStock,
  getMerchantSecondaryFilterOptions,
  hubCompanionStartPositions,
  HUB_MAP_ID,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_TYPE_LABELS,
  QUEST_DEFINITIONS,
  acceptQuestFromQuestGiver,
  applyOfflineFarmingProgress,
  finishReadyQuestsForQuestGiver,
  createSavedGame,
  getPartyLeader,
  getQuestGiverAvailableQuests,
  getQuestGiverCurrentQuests,
  getQuestGiverReadyQuests,
  getPoiSearchScope,
  getTeleportWorkingStateById,
  getTotalPartyCharacterLevel,
  hasQuestGiverWork,
  issueCompanionDirectCommand,
  issuePartyOrder,
  isActiveResource,
  isMerchantUnlockedForQuests,
  isMerchantNpc,
  quickExchangeParts,
  recordMerchantInteractionClosed,
  recordMerchantInteractionOpened,
  recordMerchantLockedForQuest,
  recordMerchantMenuSelected,
  resourceIds,
  restoreGameStateFromSave,
  buildNavigationClickAccessibility,
  getNavigationClickCellKey,
  resolveNavigationClickTarget,
  resolveNpcInteractionApproachTarget,
  resolveWorldWipeRecoveryChoice,
  setAutoModeEnabled,
  setPartyLeader,
  setPartyMemberRole,
  setPartyOrder,
  setPoiSearchScope,
  setWorldTravelTargetMapId,
  startPartyConsumableUse,
  startGameLoop,
  startDebugTelemetryRecording,
  stopDebugTelemetryRecording,
  unequipItemFromCompanion,
  unequipFlaskFromCompanion,
  updateEntity,
  updateCompanionConsumableBehavior,
  updateCompanionSkillBehavior,
  type ActiveCombatProjectile,
  type Companion,
  type DirectCompanionCommand,
  type CompanionDirectCommandInput,
  type ConsumableBehaviorUpdate,
  type SkillBehaviorUpdate,
  type DebugMapId,
  type DirectCompanionCommandResultCode,
  type DropVisualEvent,
  type Enemy,
  type EnemyAoeChannelState,
  type EquipmentSlot,
  type EquipmentStatModifiers,
  type GameEntity,
  type GameMap,
  type GameState,
  type ItemDefinition,
  type ItemId,
  type MerchantBuyFailureReason,
  type MerchantStockEntry,
  type MerchantStockGroup,
  type NavigationClickAccessibility,
  type NpcEntity,
  type OfflineFarmingSummary,
  type PartyMemberRole,
  type PrimaryStatId,
  type PoiConsideration,
  type PoiSearchScope,
  type Position,
  type QuestId,
  type QuestState,
  type ResourceEntity,
  type ResurrectionProgressState,
  type SkillBindState,
  type SkillMarkState,
  type SkillShieldBlockState,
  type SkillVisualEvent,
  type WorldWipeRecoveryChoice,
} from "./game";
import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  deleteLocalSave,
  downloadSavedGame,
  hasStoredSaveFile,
  parseSavedGameText,
  readLocalSave,
  writeLocalSave,
  writeLocalSaveFile,
} from "./saveStorage";
import {
  consumeGamePerformanceMetrics,
  type GamePerformanceMetrics,
} from "./game/performanceMetrics";
import {
  getTrackedVisualMovementPositions,
  pruneVisualMovementEntries,
} from "./visualMovement";
import { type SpriteDirection } from "./visualAssets";

const LazyGameMenu = lazy(() =>
  import("./GameMenu").then((module) => ({ default: module.GameMenu })),
);

const LazyPixiWorldRenderer = lazy(() =>
  import("./worldRenderer/PixiWorldRenderer").then((module) => ({
    default: module.PixiWorldRenderer,
  })),
);

function PixiWorldRendererFallback({ mode }: { mode: "full" | "preview" }) {
  return (
    <div
      aria-hidden="true"
      className={`pixi-world-renderer pixi-world-renderer-${mode} pixi-world-renderer-loading`}
    />
  );
}

const debugMap = createDebugMap();
const gameVersion = "0.01";
const currencyGainFeedbackDurationMs = 1200;
const directCommandFeedbackDurationMs = 1400;
const movementClickFeedbackDurationMs = 900;
const currencyGainBurstSrc =
  "assets/Generated/prototype-vfx/sprites/currency-gain-burst.png";
const mapConstructionCellPixelSize = 32;
const visualMovementGraceMs = 180;
const visualMovementEnemyViewportMarginTiles = 6;
const uiClockIntervalMs = 250;
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
const emptyDirectCompanionCommands: Record<string, DirectCompanionCommand> = {};
const emptyDropVisualEvents: DropVisualEvent[] = [];
const emptyCombatProjectiles: ActiveCombatProjectile[] = [];
const emptyEnemyAoeChannels: Record<string, EnemyAoeChannelState> = {};
const emptyResurrectionProgress: Record<string, ResurrectionProgressState> = {};
const emptySkillBinds: Record<string, SkillBindState> = {};
const emptySkillMarks: Record<string, SkillMarkState> = {};
const emptySkillShieldBlocks: Record<string, SkillShieldBlockState> = {};
const emptySkillVisualEvents: SkillVisualEvent[] = [];

function getNextPoiSearchScope(scope: PoiSearchScope): PoiSearchScope {
  const currentIndex = poiSearchScopeCycle.indexOf(scope);

  return poiSearchScopeCycle[
    (currentIndex + 1) % poiSearchScopeCycle.length
  ] ?? "free_travel";
}

type EntityVisualMovement = {
  direction: SpriteDirection;
  angleDegrees: number;
  expiresAt: number;
};

type MovementClickFeedbackEvent = {
  id: string;
  position: Position;
  createdAt: number;
  expiresAt: number;
};

type NavigationClickAccessibilityCache = {
  accessibility: NavigationClickAccessibility;
  leaderId: string;
  map: GameMap;
};

type MerchantPanel = "buy" | "sell";
type QuestGiverPanel = "available" | "current";
type NpcInteractionKind = "merchant" | "quest_giver";

type MerchantBuyFilter = "all" | MerchantStockGroup;

type EntityHoverTooltipState = {
  entityId: string;
  position: Position;
};

const merchantBuyFilterLabels: Record<MerchantBuyFilter, string> = {
  all: "All",
  flasks: "Flasks",
  food: "Food",
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
  "flasks",
  "food",
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

const partyMemberRoleLabels: Record<PartyMemberRole, string> = {
  defender: "Defender",
  fighter: "Fighter",
  support: "Support",
  gatherer: "Gatherer",
  none: "None / Unassigned",
};

const entityStateLabels: Record<GameEntity["state"], string> = {
  idle: "Idle",
  follow: "Following",
  attack: "Attacking",
  gather: "Gathering",
  defend: "Defending",
  dead: "Dead",
};

const resourceTypeLabels: Record<ResourceEntity["resourceType"], string> = {
  wood: "Wood",
  ore: "Ore",
  herb: "Herb",
};

const npcRoleLabels: Record<NpcEntity["npcRole"], string> = {
  merchant: "Merchant",
  quest_giver: "Quest Giver",
  class_mentor: "Class Mentor",
  smith: "Smith",
  dog: "Dog",
  test_blade: "Test Blade",
  quest_guide: "Quest Guide",
  dungeon_chest_closed: "Dungeon Chest",
  dungeon_chest_open: "Dungeon Chest",
};

const enemyTemperamentLabels: Record<Enemy["aggressionMode"], string> = {
  passive: "Passive",
  aggressive: "Aggressive",
};

const enemyTargetPreferenceLabels = {
  closest: "Closest party member",
  leader: "Current leader",
  lowestHealth: "Lowest-health party member",
} as const;

const merchantBuyFailureMessages: Record<MerchantBuyFailureReason, string> = {
  invalid_merchant: "Merchant unavailable",
  item_not_in_stock: "Item is not in stock",
  invalid_item: "Item cannot be purchased",
  invalid_price: "Item price is invalid",
  insufficient_crowns: "Not enough Crowns",
  inventory_full: "Inventory is full",
  inventory_add_failed: "Inventory could not receive the item",
  currency_remove_failed: "Crowns could not be spent",
  merchant_locked_for_quest: "Merchant unlocks during Outfit the Expedition",
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
  activeFeedbackCount: number;
  attackSlotChecksPerSecond: number;
  combatFeedbackEventCount: number;
  debugTelemetryEventCount: number;
  debugTelemetryRecording: boolean;
  debugTelemetryTickCount: number;
  dropVisualEventCount: number;
  fps: number;
  frameMs: number;
  drawnEntityCount: number;
  drawnFeedbackCount: number;
  drawnSprites: number;
  drawnTexts: number;
  durableTextureSourceCount: number;
  enemyAiActivePerSecond: number;
  enemyAiDormantPerSecond: number;
  enemyRoamMovesPerSecond: number;
  enemyRoamStartsPerSecond: number;
  failedTextureCount: number;
  slowFrames: number;
  simFramesPerSecond: number;
  fullDrawsPerSecond: number;
  previewDrawsPerSecond: number;
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
  navigationPathQueriesPerSecond: number;
  navigationPathCombatPerSecond: number;
  navigationPathFollowPerSecond: number;
  navigationPathGatherPerSecond: number;
  navigationPathHomePerSecond: number;
  navigationPathOtherPerSecond: number;
  navigationPathPoiPerSecond: number;
  navigationPathRoamPerSecond: number;
  pathDistanceQueriesPerSecond: number;
  movementFailuresPerSecond: number;
  movementRuntimeRecordCount: number;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  memoryLimitMb: number | null;
  mapScopedTextureSourceCount: number;
  mapTrackedTextureSourceCount: number;
  evictedTextureCount: number;
  pendingTextureCount: number;
  retainedMapCount: number;
  renderMs: number;
  spriteCreatesPerSecond: number;
  spriteReusesPerSecond: number;
  managedSpriteCount: number;
  managedStaticSpriteCount: number;
  managedTextCount: number;
  textCreatesPerSecond: number;
  textReusesPerSecond: number;
  textureCount: number;
  stalePendingTextureCount: number;
  skillVisualEventCount: number;
  unloadFailedTextureCount: number;
  updateMs: number;
  visibleEntityCount: number;
  visualMovementEntryCount: number;
};

type RendererPerformanceAccumulator = Omit<
  PixiRendererPerformanceSample,
  "drawCount"
> & {
  drawCount: number;
};

type RendererPerformanceSnapshot = {
  activeFeedbackCount: number;
  drawCount: number;
  drawnEntityCount: number;
  drawnFeedbackCount: number;
  drawnSprites: number;
  drawnTexts: number;
  durableTextureSourceCount: number;
  failedTextureCount: number;
  fullDrawCount: number;
  managedSpriteCount: number;
  managedTextCount: number;
  mapScopedTextureSourceCount: number;
  mapTrackedTextureSourceCount: number;
  pendingTextureCount: number;
  previewDrawCount: number;
  retainedMapCount: number;
  renderMs: number;
  spriteCreates: number;
  spriteReuses: number;
  stalePendingTextureCount: number;
  textCreates: number;
  textReuses: number;
  textureCount: number;
  evictedTextureCount: number;
  managedStaticSpriteCount: number;
  unloadFailedTextureCount: number;
  visibleEntityCount: number;
};

function isWildernessVisualMap(mapId: string | undefined): boolean {
  return Boolean(mapId && wildernessMapIds.has(mapId));
}

function isHubVisualMap(mapId: string | undefined): boolean {
  return mapId === HUB_MAP_ID;
}

function getNpcInteractionKind(npc: NpcEntity): NpcInteractionKind | null {
  if (npc.npcRole === "merchant") {
    return "merchant";
  }

  if (npc.npcRole === "quest_giver" || npc.npcRole === "class_mentor") {
    return "quest_giver";
  }

  return null;
}

function getPositionDistance(first: Position, second: Position): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  let emptyMessage: string | null = null;

  if (!autoModeEnabled) {
    emptyMessage = "Auto mode off";
  } else if (!hasLeader) {
    emptyMessage = "No leader";
  } else if (!consideredTargets || consideredTargets.length === 0) {
    emptyMessage = "No reachable POIs";
  }

  return (
    <aside
      className={`leader-poi-panel${isCollapsed ? " collapsed" : ""}`}
      aria-label="Leader POIs"
    >
      <div className="leader-poi-header">
        <h2>Leader POIs</h2>
        <button
          onClick={(event) => {
            event.stopPropagation();
            setIsCollapsed((currentValue) => !currentValue);
          }}
          type="button"
        >
          {isCollapsed ? "Show" : "Hide"}
        </button>
      </div>
      {isCollapsed ? null : emptyMessage ? (
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

function createRendererPerformanceAccumulator(): RendererPerformanceAccumulator {
  return {
    activeFeedbackCount: 0,
    drawCount: 0,
    drawnEntityCount: 0,
    drawnFeedbackCount: 0,
    drawnSprites: 0,
    drawnTexts: 0,
    durableTextureSourceCount: 0,
    evictedTextureCount: 0,
    failedTextureCount: 0,
    fullDrawCount: 0,
    managedSpriteCount: 0,
    managedStaticSpriteCount: 0,
    managedTextCount: 0,
    mapScopedTextureSourceCount: 0,
    mapTrackedTextureSourceCount: 0,
    pendingTextureCount: 0,
    previewDrawCount: 0,
    retainedMapCount: 0,
    renderMs: 0,
    spriteCreates: 0,
    spriteReuses: 0,
    stalePendingTextureCount: 0,
    textCreates: 0,
    textReuses: 0,
    textureCount: 0,
    unloadFailedTextureCount: 0,
    visibleEntityCount: 0,
  };
}

function recordRendererPerformanceSample(
  accumulator: RendererPerformanceAccumulator,
  sample: PixiRendererPerformanceSample,
) {
  accumulator.activeFeedbackCount = sample.activeFeedbackCount;
  accumulator.drawCount += sample.drawCount;
  accumulator.drawnEntityCount = sample.drawnEntityCount;
  accumulator.drawnFeedbackCount = sample.drawnFeedbackCount;
  accumulator.drawnSprites = sample.drawnSprites;
  accumulator.drawnTexts = sample.drawnTexts;
  accumulator.durableTextureSourceCount = sample.durableTextureSourceCount;
  accumulator.evictedTextureCount = sample.evictedTextureCount;
  accumulator.failedTextureCount = sample.failedTextureCount;
  accumulator.fullDrawCount += sample.fullDrawCount;
  accumulator.managedSpriteCount = sample.managedSpriteCount;
  accumulator.managedStaticSpriteCount = sample.managedStaticSpriteCount;
  accumulator.managedTextCount = sample.managedTextCount;
  accumulator.mapScopedTextureSourceCount = sample.mapScopedTextureSourceCount;
  accumulator.mapTrackedTextureSourceCount = sample.mapTrackedTextureSourceCount;
  accumulator.pendingTextureCount = sample.pendingTextureCount;
  accumulator.previewDrawCount += sample.previewDrawCount;
  accumulator.retainedMapCount = sample.retainedMapCount;
  accumulator.renderMs += sample.renderMs;
  accumulator.spriteCreates += sample.spriteCreates;
  accumulator.spriteReuses += sample.spriteReuses;
  accumulator.stalePendingTextureCount = sample.stalePendingTextureCount;
  accumulator.textCreates += sample.textCreates;
  accumulator.textReuses += sample.textReuses;
  accumulator.textureCount = sample.textureCount;
  accumulator.unloadFailedTextureCount = sample.unloadFailedTextureCount;
  accumulator.visibleEntityCount = sample.visibleEntityCount;
}

function consumeRendererPerformanceAccumulator(
  accumulator: RendererPerformanceAccumulator,
): RendererPerformanceSnapshot {
  const drawCount = accumulator.drawCount;
  const snapshot = {
    activeFeedbackCount: accumulator.activeFeedbackCount,
    drawCount,
    drawnEntityCount: accumulator.drawnEntityCount,
    drawnFeedbackCount: accumulator.drawnFeedbackCount,
    drawnSprites: accumulator.drawnSprites,
    drawnTexts: accumulator.drawnTexts,
    durableTextureSourceCount: accumulator.durableTextureSourceCount,
    evictedTextureCount: accumulator.evictedTextureCount,
    failedTextureCount: accumulator.failedTextureCount,
    fullDrawCount: accumulator.fullDrawCount,
    managedSpriteCount: accumulator.managedSpriteCount,
    managedStaticSpriteCount: accumulator.managedStaticSpriteCount,
    managedTextCount: accumulator.managedTextCount,
    mapScopedTextureSourceCount: accumulator.mapScopedTextureSourceCount,
    mapTrackedTextureSourceCount: accumulator.mapTrackedTextureSourceCount,
    pendingTextureCount: accumulator.pendingTextureCount,
    previewDrawCount: accumulator.previewDrawCount,
    retainedMapCount: accumulator.retainedMapCount,
    renderMs: drawCount > 0 ? accumulator.renderMs / drawCount : 0,
    spriteCreates: accumulator.spriteCreates,
    spriteReuses: accumulator.spriteReuses,
    stalePendingTextureCount: accumulator.stalePendingTextureCount,
    textCreates: accumulator.textCreates,
    textReuses: accumulator.textReuses,
    textureCount: accumulator.textureCount,
    unloadFailedTextureCount: accumulator.unloadFailedTextureCount,
    visibleEntityCount: accumulator.visibleEntityCount,
  };

  Object.assign(accumulator, createRendererPerformanceAccumulator());

  return snapshot;
}

function createEmptyRendererPerformanceSnapshot(): RendererPerformanceSnapshot {
  return createRendererPerformanceAccumulator();
}

function PerformanceOverlay({
  currentMap,
  gameState,
  rendererPerformanceRef,
  visualMovementEntryCount,
}: {
  currentMap: {
    columns: number;
    rows: number;
    walls: Position[];
  };
  gameState: GameState;
  rendererPerformanceRef: { current: RendererPerformanceAccumulator };
  visualMovementEntryCount: number;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [stats, setStats] = useState<PerformanceOverlayStats>(() =>
    getPerformanceOverlayStats(gameState, currentMap, {
      gameMetrics: consumeGamePerformanceMetrics(),
      fps: 0,
      frameMs: 0,
      rendererSnapshot: createEmptyRendererPerformanceSnapshot(),
      slowFrames: 0,
      simFramesPerSecond: 0,
      elapsedSeconds: 1,
      visualMovementEntryCount,
    }),
  );
  const latestGameStateRef = useRef(gameState);
  const latestMapRef = useRef(currentMap);
  const latestVisualMovementEntryCountRef = useRef(visualMovementEntryCount);

  useEffect(() => {
    latestGameStateRef.current = gameState;
    latestMapRef.current = currentMap;
    latestVisualMovementEntryCountRef.current = visualMovementEntryCount;
  }, [currentMap, gameState, visualMovementEntryCount]);

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
          elapsedSeconds,
          fps: frameCount / elapsedSeconds,
          frameMs: frameMsTotal / frameCount,
          gameMetrics: consumeGamePerformanceMetrics(),
          rendererSnapshot: consumeRendererPerformanceAccumulator(
            rendererPerformanceRef.current,
          ),
          slowFrames,
          simFramesPerSecond: simulationFrameDelta / elapsedSeconds,
          visualMovementEntryCount: latestVisualMovementEntryCountRef.current,
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
  }, [rendererPerformanceRef]);

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
          <PerformanceStat label="Render" value={`${formatStat(stats.renderMs)}ms`} />
          <PerformanceStat label="Slow" value={stats.slowFrames.toString()} />
          <PerformanceStat label="Sim" value={`${formatStat(stats.simFramesPerSecond)}/s`} />
          <PerformanceStat label="Update" value={`${formatStat(stats.updateMs)}ms`} />
          <PerformanceStat
            label="Draws"
            value={`${formatStat(stats.fullDrawsPerSecond)}/s`}
          />
          <PerformanceStat
            label="Preview"
            value={`${formatStat(stats.previewDrawsPerSecond)}/s`}
          />
          <PerformanceStat label="Pixi" value="manual" />
          <PerformanceStat label="Entities" value={stats.entityCount.toString()} />
          <PerformanceStat
            label="Drawn"
            value={`${stats.drawnEntityCount}/${stats.visibleEntityCount}`}
          />
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
            label="Nav Path"
            value={`${formatStat(stats.navigationPathQueriesPerSecond)}/s`}
          />
          <PerformanceStat
            label="Nav Roam"
            value={`${formatStat(stats.navigationPathRoamPerSecond)}/s`}
          />
          <PerformanceStat
            label="Nav Home"
            value={`${formatStat(stats.navigationPathHomePerSecond)}/s`}
          />
          <PerformanceStat
            label="Nav Gather"
            value={`${formatStat(stats.navigationPathGatherPerSecond)}/s`}
          />
          <PerformanceStat
            label="Nav Combat"
            value={`${formatStat(stats.navigationPathCombatPerSecond)}/s`}
          />
          <PerformanceStat
            label="Nav Follow"
            value={`${formatStat(stats.navigationPathFollowPerSecond)}/s`}
          />
          <PerformanceStat
            label="Nav POI"
            value={`${formatStat(stats.navigationPathPoiPerSecond)}/s`}
          />
          <PerformanceStat
            label="Nav Other"
            value={`${formatStat(stats.navigationPathOtherPerSecond)}/s`}
          />
          <PerformanceStat
            label="Path Dist"
            value={`${formatStat(stats.pathDistanceQueriesPerSecond)}/s`}
          />
          <PerformanceStat
            label="Slot Chk"
            value={`${formatStat(stats.attackSlotChecksPerSecond)}/s`}
          />
          <PerformanceStat
            label="Move Fail"
            value={`${formatStat(stats.movementFailuresPerSecond)}/s`}
          />
          <PerformanceStat
            label="Enemy AI"
            value={`${formatStat(stats.enemyAiActivePerSecond)}/${formatStat(stats.enemyAiDormantPerSecond)}`}
          />
          <PerformanceStat
            label="Roam"
            value={`${formatStat(stats.enemyRoamStartsPerSecond)}/${formatStat(stats.enemyRoamMovesPerSecond)}/s`}
          />
          <PerformanceStat
            label="Sprites"
            value={`${stats.drawnSprites}/${stats.managedSpriteCount} (${formatStat(stats.spriteCreatesPerSecond)}/${formatStat(stats.spriteReusesPerSecond)})`}
          />
          <PerformanceStat
            label="Static Spr"
            value={stats.managedStaticSpriteCount.toString()}
          />
          <PerformanceStat
            label="Text"
            value={`${stats.drawnTexts}/${stats.managedTextCount} (${formatStat(stats.textCreatesPerSecond)}/${formatStat(stats.textReusesPerSecond)})`}
          />
          <PerformanceStat
            label="Feedback"
            value={`${stats.drawnFeedbackCount}/${stats.activeFeedbackCount}`}
          />
          <PerformanceStat
            label="Visual Move"
            value={stats.visualMovementEntryCount.toString()}
          />
          <PerformanceStat
            label="Textures"
            value={`${stats.textureCount} (${stats.pendingTextureCount}/${stats.failedTextureCount})`}
          />
          <PerformanceStat
            label="Map Tex"
            value={`${stats.mapScopedTextureSourceCount}/${stats.durableTextureSourceCount} m${stats.retainedMapCount} ev${stats.evictedTextureCount}`}
          />
          <PerformanceStat
            label="Tex Hold"
            value={`st${stats.stalePendingTextureCount} uf${stats.unloadFailedTextureCount} all${stats.mapTrackedTextureSourceCount}`}
          />
          <PerformanceStat
            label="Runtime"
            value={`m${stats.movementRuntimeRecordCount} f${stats.combatFeedbackEventCount} s${stats.skillVisualEventCount} d${stats.dropVisualEventCount}`}
          />
          <PerformanceStat
            label="Telemetry"
            value={`${stats.debugTelemetryRecording ? "on" : "off"} ${stats.debugTelemetryTickCount}/${stats.debugTelemetryEventCount}`}
          />
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
  > & {
    elapsedSeconds: number;
    gameMetrics: GamePerformanceMetrics;
    rendererSnapshot: RendererPerformanceSnapshot;
    visualMovementEntryCount: number;
  },
): PerformanceOverlayStats {
  const entities = Object.values(gameState.entities);
  const companions = entities.filter((entity) => entity.kind === "companion");
  const enemies = entities.filter((entity) => entity.kind === "enemy");
  const resources = entities.filter((entity) => entity.kind === "resource");
  const npcs = entities.filter((entity) => entity.kind === "npc");
  const memorySnapshot = getPerformanceMemorySnapshot();
  const { elapsedSeconds, gameMetrics, rendererSnapshot } = timingStats;
  const movementRuntimeRecordCount =
    Object.keys(gameState.failedMoveByEntityId ?? {}).length +
    Object.keys(gameState.movementFailureMsByEntityId ?? {}).length +
    Object.keys(gameState.movementFailuresByEntityId ?? {}).length +
    Object.keys(gameState.movementPathRetryAtMsByEntityId ?? {}).length +
    Object.keys(gameState.movementDecisionsByEntityId ?? {}).length +
    Object.keys(gameState.moveIntentsByEntityId ?? {}).length +
    Object.keys(gameState.reservedPositionsByEntityId ?? {}).length;
  const updateMs =
    gameMetrics.updateCount > 0
      ? gameMetrics.updateMsTotal / gameMetrics.updateCount
      : 0;

  return {
    fps: timingStats.fps,
    frameMs: timingStats.frameMs,
    slowFrames: timingStats.slowFrames,
    simFramesPerSecond: timingStats.simFramesPerSecond,
    activeFeedbackCount: rendererSnapshot.activeFeedbackCount,
    attackSlotChecksPerSecond:
      gameMetrics.attackSlotChecks / elapsedSeconds,
    combatFeedbackEventCount: gameState.combatFeedbackEvents.length,
    debugTelemetryEventCount: gameState.debugTelemetry?.events.length ?? 0,
    debugTelemetryRecording: Boolean(gameState.debugTelemetry?.isRecording),
    debugTelemetryTickCount: gameState.debugTelemetry?.ticks.length ?? 0,
    dropVisualEventCount: gameState.dropVisualEvents?.length ?? 0,
    drawnEntityCount: rendererSnapshot.drawnEntityCount,
    drawnFeedbackCount: rendererSnapshot.drawnFeedbackCount,
    drawnSprites: rendererSnapshot.drawnSprites,
    drawnTexts: rendererSnapshot.drawnTexts,
    durableTextureSourceCount: rendererSnapshot.durableTextureSourceCount,
    enemyAiActivePerSecond: gameMetrics.enemyAiActiveCount / elapsedSeconds,
    enemyAiDormantPerSecond: gameMetrics.enemyAiDormantCount / elapsedSeconds,
    enemyRoamMovesPerSecond: gameMetrics.enemyRoamMoves / elapsedSeconds,
    enemyRoamStartsPerSecond: gameMetrics.enemyRoamStarts / elapsedSeconds,
    evictedTextureCount: rendererSnapshot.evictedTextureCount,
    failedTextureCount: rendererSnapshot.failedTextureCount,
    fullDrawsPerSecond: rendererSnapshot.fullDrawCount / elapsedSeconds,
    previewDrawsPerSecond: rendererSnapshot.previewDrawCount / elapsedSeconds,
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
    navigationPathQueriesPerSecond:
      gameMetrics.navigationPathQueries / elapsedSeconds,
    navigationPathCombatPerSecond:
      gameMetrics.navigationPathQueriesByBucket.combat / elapsedSeconds,
    navigationPathFollowPerSecond:
      gameMetrics.navigationPathQueriesByBucket.follow / elapsedSeconds,
    navigationPathGatherPerSecond:
      gameMetrics.navigationPathQueriesByBucket.gather / elapsedSeconds,
    navigationPathHomePerSecond:
      gameMetrics.navigationPathQueriesByBucket.home / elapsedSeconds,
    navigationPathOtherPerSecond:
      gameMetrics.navigationPathQueriesByBucket.other / elapsedSeconds,
    navigationPathPoiPerSecond:
      gameMetrics.navigationPathQueriesByBucket.poi / elapsedSeconds,
    navigationPathRoamPerSecond:
      gameMetrics.navigationPathQueriesByBucket.roam / elapsedSeconds,
    pathDistanceQueriesPerSecond:
      gameMetrics.pathDistanceQueries / elapsedSeconds,
    movementFailuresPerSecond: gameMetrics.movementFailures / elapsedSeconds,
    movementRuntimeRecordCount,
    memoryUsedMb: memorySnapshot
      ? bytesToMegabytes(memorySnapshot.usedJSHeapSize)
      : null,
    memoryTotalMb: memorySnapshot
      ? bytesToMegabytes(memorySnapshot.totalJSHeapSize)
      : null,
    memoryLimitMb: memorySnapshot
      ? bytesToMegabytes(memorySnapshot.jsHeapSizeLimit)
      : null,
    mapScopedTextureSourceCount: rendererSnapshot.mapScopedTextureSourceCount,
    mapTrackedTextureSourceCount: rendererSnapshot.mapTrackedTextureSourceCount,
    retainedMapCount: rendererSnapshot.retainedMapCount,
    renderMs: rendererSnapshot.renderMs,
    spriteCreatesPerSecond: rendererSnapshot.spriteCreates / elapsedSeconds,
    spriteReusesPerSecond: rendererSnapshot.spriteReuses / elapsedSeconds,
    managedSpriteCount: rendererSnapshot.managedSpriteCount,
    managedStaticSpriteCount: rendererSnapshot.managedStaticSpriteCount,
    managedTextCount: rendererSnapshot.managedTextCount,
    pendingTextureCount: rendererSnapshot.pendingTextureCount,
    textCreatesPerSecond: rendererSnapshot.textCreates / elapsedSeconds,
    textReusesPerSecond: rendererSnapshot.textReuses / elapsedSeconds,
    textureCount: rendererSnapshot.textureCount,
    stalePendingTextureCount: rendererSnapshot.stalePendingTextureCount,
    skillVisualEventCount: gameState.skillVisualEvents?.length ?? 0,
    unloadFailedTextureCount: rendererSnapshot.unloadFailedTextureCount,
    updateMs,
    visibleEntityCount: rendererSnapshot.visibleEntityCount,
    visualMovementEntryCount: timingStats.visualMovementEntryCount,
  };
}

function getPerformanceMemorySnapshot(): PerformanceMemorySnapshot | null {
  return (performance as BrowserPerformance).memory ?? null;
}

function shouldSuppressEscortGuideMovePoiRing(state: GameState): boolean {
  const target = state.localPoiTarget;
  const activeQuest = getActiveQuest(state);

  if (
    !target ||
    target.category !== "npc" ||
    target.reason !== "active quest guide objective" ||
    state.partyIntent?.source !== "ai" ||
    state.partyIntent.executionIntent?.type !== "move" ||
    state.partyIntent.executionIntent.source !== "ai" ||
    !activeQuest ||
    activeQuest.status !== "active" ||
    activeQuest.questId !== target.questId ||
    !target.objectiveId
  ) {
    return false;
  }

  return (
    QUEST_DEFINITIONS[activeQuest.questId].objectives.find(
      (objective) => objective.id === target.objectiveId,
    )?.type === "guide_npc_to_poi"
  );
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

function getMovementAngleDegrees(
  previousPosition: Position,
  currentPosition: Position,
): number {
  const xDelta = currentPosition.x - previousPosition.x;
  const yDelta = currentPosition.y - previousPosition.y;
  const radians = Math.atan2(-yDelta, xDelta);
  const degrees = (radians * 180) / Math.PI;

  return (degrees + 360) % 360;
}

function getNextVisualMovementPruneAt(
  visualMovementByEntityId: Record<string, EntityVisualMovement>,
): number {
  const nextExpiry = Math.min(
    ...Object.values(visualMovementByEntityId).map(
      (visualMovement) => visualMovement.expiresAt,
    ),
  );

  return Number.isFinite(nextExpiry) ? nextExpiry : Infinity;
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
  const [activeSecondaryFilter, setActiveSecondaryFilter] = useState<string | null>(null);
  const [partyCompatibleOnly, setPartyCompatibleOnly] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(null);
  const stock = getMerchantBuyStock(state, merchantNpcId);
  const secondaryFilterOptions = useMemo(
    () =>
      activeFilter === "all"
        ? []
        : getMerchantSecondaryFilterOptions(stock, activeFilter),
    [activeFilter, stock],
  );
  const effectiveSecondaryFilter =
    activeSecondaryFilter &&
    secondaryFilterOptions.some((option) => option.id === activeSecondaryFilter)
      ? activeSecondaryFilter
      : null;
  const filteredStock = getFilteredMerchantBuyStock(state, merchantNpcId, {
    mainFilter: activeFilter,
    secondaryFilter: effectiveSecondaryFilter,
    partyCompatibleOnly,
  });
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
            onClick={() => {
              setActiveFilter(filter);
              setActiveSecondaryFilter(null);
              setSelectedItemId(null);
            }}
            type="button"
          >
            {merchantBuyFilterLabels[filter]}
          </button>
        ))}
      </nav>
      <div className="merchant-buy-filter-controls">
        {secondaryFilterOptions.length > 0 ? (
          <nav className="merchant-buy-filter-tabs" aria-label="Merchant stock subtype filters">
            <button
              className={effectiveSecondaryFilter === null ? "active" : ""}
              onClick={() => setActiveSecondaryFilter(null)}
              type="button"
            >
              All
            </button>
            {secondaryFilterOptions.map((filter) => (
              <button
                key={filter.id}
                className={effectiveSecondaryFilter === filter.id ? "active" : ""}
                onClick={() => {
                  setActiveSecondaryFilter(filter.id);
                  setSelectedItemId(null);
                }}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </nav>
        ) : null}
        <label className="merchant-buy-compatible-toggle">
          <input
            checked={partyCompatibleOnly}
            onChange={(event) => {
              setPartyCompatibleOnly(event.currentTarget.checked);
              setSelectedItemId(null);
            }}
            type="checkbox"
          />
          Party compatible
        </label>
      </div>
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

function QuestGiverDetailPanel({
  quest,
  canAccept,
  onAccept,
  onIgnore,
}: {
  quest: QuestState;
  canAccept: boolean;
  onAccept: (questId: QuestId) => void;
  onIgnore: () => void;
}) {
  const definition = QUEST_DEFINITIONS[quest.questId];
  const turnInErrorText = getQuestTurnInErrorText(quest);

  return (
    <aside className="merchant-detail-panel quest-giver-detail-panel">
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
        Rewards: {getQuestRewardText(definition.rewards)}
      </div>
      {turnInErrorText ? (
        <div className="placeholder-box">{turnInErrorText}</div>
      ) : null}
      <div className="quest-giver-detail-actions">
        {canAccept ? (
          <button onClick={() => onAccept(quest.questId)} type="button">
            Accept
          </button>
        ) : null}
        <button onClick={onIgnore} type="button">
          Ignore
        </button>
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

  const itemDefinition = getItemDefinition(entry.itemId);

  if (!itemDefinition || !canInventoryAcceptMerchantItem(state, itemDefinition)) {
    return "Inventory Full";
  }

  return null;
}

function canInventoryAcceptMerchantItem(
  state: GameState,
  itemDefinition: ItemDefinition,
): boolean {
  if (
    itemDefinition.stackable &&
    state.inventory.slots.some(
      (slot) =>
        slot.itemId === itemDefinition.id &&
        slot.quantity < itemDefinition.maxStack,
    )
  ) {
    return true;
  }

  return getAvailableInventorySlots(state.inventory) > 0;
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
  if (itemDefinition.consumableKind === "flask") {
    return "Flask Slot";
  }

  if (itemDefinition.consumableKind === "food") {
    return "Food Assignment";
  }

  if (itemDefinition.equipmentKind === "accessory") {
    return "Accessory";
  }

  return itemDefinition.equipmentSlot
    ? EQUIPMENT_SLOT_LABELS[itemDefinition.equipmentSlot]
    : "Equipment";
}

function getMerchantTypeText(itemDefinition: ItemDefinition): string {
  if (itemDefinition.consumableKind === "flask") {
    return "Flask";
  }

  if (itemDefinition.consumableKind === "food") {
    return "Food";
  }

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
  const consumableEffects = [
    itemDefinition.healPercent
      ? `Heals ${Math.round(itemDefinition.healPercent * 100)}% max HP`
      : null,
    itemDefinition.maxCharges
      ? `${itemDefinition.maxCharges} max charges`
      : null,
  ].filter(Boolean);
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
  const stats = [...consumableEffects, ...primaryStats, ...derivedStats];

  return stats.length > 0 ? stats.join(", ") : "No stat modifiers";
}

function formatMerchantStatName(stat: string): string {
  return stat.replace(/[A-Z]/g, (letter) => ` ${letter}`).toLowerCase();
}

function formatMerchantModifier(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function EntityHoverTooltip({
  entity,
  position,
  viewportSize,
}: {
  entity: GameEntity;
  position: Position;
  viewportSize: ViewportSize;
}) {
  const tooltipWidth = 260;
  const x = Math.min(position.x + 16, viewportSize.width - tooltipWidth - 12);
  const y = Math.min(position.y + 16, viewportSize.height - 140);
  const tooltipPosition = {
    left: Math.max(12, x),
    top: Math.max(12, y),
  };
  const details = getEntityHoverDetails(entity);

  return (
    <aside
      className="entity-hover-tooltip"
      style={tooltipPosition}
      aria-label={`${details.title} details`}
    >
      <strong>{details.title}</strong>
      <dl>
        {details.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function getEntityHoverDetails(entity: GameEntity): {
  title: string;
  rows: Array<{ label: string; value: string }>;
} {
  if (entity.kind === "companion") {
    const derivedStats = getCompanionDerivedStats(entity);

    return {
      title: getCompanionDisplayName(entity),
      rows: [
        { label: "Class", value: CLASS_DEFINITIONS[entity.classId].displayName },
        { label: "Role", value: partyMemberRoleLabels[entity.role] },
        { label: "HP", value: `${entity.health}/${derivedStats.maxHealth}` },
        { label: "State", value: entityStateLabels[entity.state] },
      ],
    };
  }

  if (entity.kind === "enemy") {
    const enemyType = getEnemyType(entity.enemyTypeId);
    const archetype = getEnemyArchetype(entity.archetypeId);
    const targetStyle =
      enemyType?.targetPreference &&
      enemyTargetPreferenceLabels[enemyType.targetPreference];

    return {
      title: enemyType?.displayName ?? archetype?.displayName ?? "Enemy",
      rows: [
        { label: "Level", value: entity.level.toString() },
        { label: "HP", value: `${entity.health}/${entity.maxHealth}` },
        {
          label: "Temperament",
          value: enemyTemperamentLabels[entity.aggressionMode],
        },
        { label: "Target Style", value: targetStyle ?? "Closest party member" },
      ],
    };
  }

  if (entity.kind === "resource") {
    return {
      title: resourceTypeLabels[entity.resourceType],
      rows: [
        { label: "Type", value: resourceTypeLabels[entity.resourceType] },
        { label: "Tier", value: entity.tier.toString() },
        {
          label: "Durability",
          value: `${entity.durability}/${entity.maxDurability}`,
        },
      ],
    };
  }

  return {
    title: entity.displayName,
    rows: [
      { label: "Name", value: entity.displayName },
      { label: "Role", value: npcRoleLabels[entity.npcRole] },
    ],
  };
}

function getCompanionDisplayName(member: Companion): string {
  const index = companionIds.indexOf(member.id);

  return index >= 0 ? `Companion ${index + 1}` : member.id;
}

function getDirectCommandFeedbackText(
  resultCode: DirectCompanionCommandResultCode | string,
): string {
  if (resultCode === "invalid_source") {
    return "That companion cannot act.";
  }

  if (resultCode === "invalid_target") {
    return "That target is not valid.";
  }

  if (resultCode === "out_of_range") {
    return "Direct command is beyond 30 cells.";
  }

  if (resultCode === "resource_full") {
    return "That resource already has max collectors.";
  }

  if (resultCode === "blocked_position") {
    return "Cannot move there.";
  }

  return "Direct command rejected.";
}

type AppMode = "start" | "playing";

function StartScreen({
  hasSaveFile,
  statusMessage,
  onContinue,
  onNewGame,
  onDeleteSave,
}: {
  hasSaveFile: boolean;
  statusMessage: string | null;
  onContinue: () => void;
  onNewGame: () => void;
  onDeleteSave: () => void;
}) {
  return (
    <main className="game-page start-game-page">
      <section className="start-game-panel" aria-label="Start game">
        <h1>MMO Party Simulator</h1>
        <div className="start-game-actions">
          <button
            disabled={!hasSaveFile}
            onClick={onContinue}
            type="button"
          >
            Continue
          </button>
          <button onClick={onNewGame} type="button">
            New Game
          </button>
          <button
            disabled={!hasSaveFile}
            onClick={onDeleteSave}
            type="button"
          >
            Delete Save File
          </button>
        </div>
        {statusMessage ? (
          <p className="save-status-text" role="status">
            {statusMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function OfflineSummaryToast({
  summary,
  onClose,
}: {
  summary: OfflineFarmingSummary;
  onClose: () => void;
}) {
  const resourceText =
    summary.resourcesAdded.length > 0
      ? summary.resourcesAdded
          .map((resource) => {
            const item = getItemDefinition(resource.itemId);

            return `${item.displayName} x${resource.quantity}`;
          })
          .join(", ")
      : "None";

  return (
    <section className="offline-summary-toast" role="status">
      <div>
        <strong>Continue Summary</strong>
        <span>{formatOfflineDuration(summary.creditedMs)}</span>
      </div>
      <p>{summary.subzoneName ?? "Saved subzone"}</p>
      <p>
        Enemies defeated: {summary.enemyKills}
      </p>
      <p>XP earned: {summary.xpGranted}</p>
      <p>Gathered: {resourceText}</p>
      {summary.skippedReason ? <p>{summary.skippedReason}</p> : null}
      <button aria-label="Close Continue summary" onClick={onClose} type="button">
        Close
      </button>
    </section>
  );
}

function formatOfflineDuration(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);

  if (minutes <= 0) {
    return `${seconds}s credited`;
  }

  return `${minutes}m ${seconds}s credited`;
}

function getQuestStatuses(state: GameState): Record<string, string> {
  return Object.fromEntries(
    Object.entries(state.quests).map(([questId, quest]) => [
      questId,
      quest.status,
    ]),
  );
}

function App() {
  const [appMode, setAppMode] = useState<AppMode>("start");
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);
  const [hasLocalSaveFile, setHasLocalSaveFile] = useState(hasStoredSaveFile);
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(
    null,
  );
  const [offlineSummary, setOfflineSummary] =
    useState<OfflineFarmingSummary | null>(null);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [showEntityInfo, setShowEntityInfo] = useState(false);
  const [mapCursorPosition, setMapCursorPosition] =
    useState<Position | null>(null);
  const [entityHoverTooltip, setEntityHoverTooltip] =
    useState<EntityHoverTooltipState | null>(null);
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
  const [activeGuidePopupId, setActiveGuidePopupId] =
    useState<GuidePopupId | null>(null);
  const [activeGuidePanelIndex, setActiveGuidePanelIndex] = useState(0);
  const [viewedGuidePopupIds, setViewedGuidePopupIds] = useState<GuidePopupId[]>(
    [],
  );
  const [queuedGuidePopupIds, setQueuedGuidePopupIds] = useState<GuidePopupId[]>(
    [],
  );
  const [isQuestTrackerHidden, setIsQuestTrackerHidden] = useState(false);
  const [activeMerchantNpcId, setActiveMerchantNpcId] = useState<string | null>(
    null,
  );
  const [activeMerchantPanel, setActiveMerchantPanel] =
    useState<MerchantPanel | null>(null);
  const [merchantResultMessage, setMerchantResultMessage] =
    useState<string | null>(null);
  const [activeQuestGiverNpcId, setActiveQuestGiverNpcId] = useState<
    string | null
  >(null);
  const [activeQuestGiverPanel, setActiveQuestGiverPanel] =
    useState<QuestGiverPanel | null>(null);
  const [selectedQuestGiverQuestId, setSelectedQuestGiverQuestId] =
    useState<QuestId | null>(null);
  const [questGiverResultMessage, setQuestGiverResultMessage] =
    useState<string | null>(null);
  const [pendingNpcInteractionId, setPendingNpcInteractionId] = useState<
    string | null
  >(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [rendererResetNonce, setRendererResetNonce] = useState(0);
  const [currencyGainFeedbackUntil, setCurrencyGainFeedbackUntil] = useState(0);
  const [directCommandFeedback, setDirectCommandFeedback] = useState<{
    text: string;
    expiresAt: number;
  } | null>(null);
  const [movementClickFeedbackEvents, setMovementClickFeedbackEvents] = useState<
    MovementClickFeedbackEvent[]
  >([]);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [
    visualMovementByEntityId,
    setVisualMovementByEntityId,
  ] = useState<Record<string, EntityVisualMovement>>({});
  const stopLoopRef = useRef<(() => void) | null>(null);
  const latestGameStateRef = useRef(gameState);
  const pendingSaveReasonRef = useRef<string | null>(null);
  const previousSavedMapIdRef = useRef(gameState.currentMapId ?? HUB_MAP_ID);
  const previousQuestStatusesRef = useRef(getQuestStatuses(gameState));
  const activeGuidePopupIdRef = useRef<GuidePopupId | null>(null);
  const viewedGuidePopupIdsRef = useRef(new Set<GuidePopupId>());
  const queuedGuidePopupIdsRef = useRef<GuidePopupId[]>([]);
  const isGuideSequenceActiveRef = useRef(false);
  const shouldResumeAfterGuideSequenceRef = useRef(false);
  const latestAnimatedEntityPositionsRef = useRef<Record<string, Position>>({});
  const latestTrackedVisualMovementEntityIdsRef = useRef<Set<string>>(new Set());
  const previousAnimatedEntityPositionsRef = useRef<Record<string, Position>>({});
  const visualMovementMapIdRef = useRef<string | undefined>(undefined);
  const nextVisualMovementPruneAtRef = useRef(Infinity);
  const visualCameraOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const [terrainCameraOffset, setTerrainCameraOffset] = useState<Position>({
    x: 0,
    y: 0,
  });
  const rendererPerformanceRef = useRef(createRendererPerformanceAccumulator());
  const cameraMapIdRef = useRef<string | undefined>(undefined);
  const navigationClickAccessibilityCacheRef =
    useRef<NavigationClickAccessibilityCache | null>(null);
  const previousCameraFocusRef = useRef<Position | null>(null);
  const currentCrownBalance = getCurrencyBalance(gameState.wallet, "crowns");
  const previousCrownBalanceRef = useRef(currentCrownBalance);
  const currentMap = gameState.map ?? debugMap;
  const navigationLeader = getPartyLeader(gameState);
  const navigationLeaderCellKey = navigationLeader
    ? getNavigationClickCellKey(navigationLeader.position)
    : null;
  const cachedNavigationClickAccessibility =
    navigationClickAccessibilityCacheRef.current;
  const navigationClickAccessibility =
    cachedNavigationClickAccessibility &&
    navigationLeader &&
    navigationLeaderCellKey &&
    cachedNavigationClickAccessibility.map === currentMap &&
    cachedNavigationClickAccessibility.leaderId === navigationLeader.id &&
    cachedNavigationClickAccessibility.accessibility.reachableCellKeys.has(
      navigationLeaderCellKey,
    )
      ? cachedNavigationClickAccessibility.accessibility
      : buildNavigationClickAccessibility(gameState);

  if (
    navigationClickAccessibility &&
    navigationLeader &&
    (!cachedNavigationClickAccessibility ||
      cachedNavigationClickAccessibility.accessibility !==
        navigationClickAccessibility)
  ) {
    navigationClickAccessibilityCacheRef.current = {
      accessibility: navigationClickAccessibility,
      leaderId: navigationLeader.id,
      map: currentMap,
    };
  } else if (!navigationClickAccessibility || !navigationLeader) {
    navigationClickAccessibilityCacheRef.current = null;
  }

  const allEntities = useMemo(
    () => Object.values(gameState.entities),
    [gameState.entities],
  );
  const handleRendererPerformanceSample = useCallback(
    (sample: PixiRendererPerformanceSample) => {
      recordRendererPerformanceSample(rendererPerformanceRef.current, sample);
    },
    [],
  );
  const updateMapCursorPosition = useCallback(
    (position: Position | null) => {
      setMapCursorPosition((currentPosition) => {
        if (!currentPosition && !position) {
          return currentPosition;
        }

        if (
          currentPosition &&
          position &&
          currentPosition.x === position.x &&
          currentPosition.y === position.y
        ) {
          return currentPosition;
        }

        return position;
      });
    },
    [],
  );
  const releaseRendererCache = useCallback(() => {
    latestAnimatedEntityPositionsRef.current = {};
    latestTrackedVisualMovementEntityIdsRef.current.clear();
    previousAnimatedEntityPositionsRef.current = {};
    nextVisualMovementPruneAtRef.current = Infinity;
    rendererPerformanceRef.current = createRendererPerformanceAccumulator();
    setVisualMovementByEntityId({});
    setRendererResetNonce((currentValue) => currentValue + 1);
  }, []);
  const writeCurrentSave = useCallback(
    (
      reason: string,
      state: GameState = latestGameStateRef.current,
      savedAtMs = Date.now(),
    ) => {
      const result = writeLocalSave(state, savedAtMs);

      if (result.ok) {
        setHasLocalSaveFile(true);
        setSaveStatusMessage(
          `${reason} at ${new Date(result.savedAtMs).toLocaleTimeString()}.`,
        );
        return true;
      }

      setSaveStatusMessage(`${reason} failed: ${result.reason}`);
      return false;
    },
    [],
  );
  const queueSaveAfterStateChange = useCallback(
    (reason: string) => {
      if (appMode !== "playing") {
        return;
      }

      pendingSaveReasonRef.current = reason;
    },
    [appMode],
  );

  useEffect(() => {
    latestGameStateRef.current = gameState;

    if (appMode !== "playing" || !pendingSaveReasonRef.current) {
      return;
    }

    const reason = pendingSaveReasonRef.current;
    pendingSaveReasonRef.current = null;
    writeCurrentSave(reason, gameState);
  }, [appMode, gameState, writeCurrentSave]);

  useEffect(() => {
    if (appMode !== "playing") {
      return;
    }

    const intervalId = window.setInterval(() => {
      writeCurrentSave("Autosaved");
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [appMode, writeCurrentSave]);

  useEffect(() => {
    if (appMode !== "playing") {
      return;
    }

    function saveBeforeSleep() {
      writeCurrentSave("Autosaved before tab sleep");
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        saveBeforeSleep();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", saveBeforeSleep);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", saveBeforeSleep);
    };
  }, [appMode, writeCurrentSave]);

  const partyMembers = useMemo(
    () =>
      companionIds
        .map((id) => gameState.entities[id] as Companion | undefined)
        .filter((companion): companion is Companion => Boolean(companion)),
    [gameState.entities],
  );
  const selectedMenuCompanionId = partyMembers.some(
    (member) => member.id === selectedCompanionId,
  )
    ? selectedCompanionId
    : partyMembers[0]?.id ?? null;
  const totalPartyLevel = getTotalPartyCharacterLevel(gameState);
  const leader = navigationLeader;
  const hasPartyLeader = Boolean(leader);
  const leaderCoordinateText = leader
    ? `${leader.position.x.toFixed(1)}, ${leader.position.y.toFixed(1)}`
    : "--, --";
  const mapCursorCoordinateText = mapCursorPosition
    ? `${mapCursorPosition.x}, ${mapCursorPosition.y}`
    : "--, --";
  const enemies = useMemo(
    () =>
      allEntities.filter(
        (entity): entity is Enemy => entity.kind === "enemy",
      ),
    [allEntities],
  );
  const questGuideNpcs = useMemo(
    () =>
      allEntities.filter(
        (entity): entity is NpcEntity =>
          entity.kind === "npc" && entity.npcRole === "quest_guide",
      ),
    [allEntities],
  );
  const resources = useMemo(
    () =>
      resourceIds
        .map((id) => gameState.entities[id] as ResourceEntity | undefined)
        .filter((resource): resource is ResourceEntity => Boolean(resource)),
    [gameState.entities],
  );
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
  const suppressEscortGuideMovePoiRing =
    shouldSuppressEscortGuideMovePoiRing(gameState);
  const questInspectMarkers = useMemo(() => {
    const activeQuest = getActiveQuest(gameState);

    if (!activeQuest) {
      return [];
    }

    return QUEST_DEFINITIONS[activeQuest.questId].objectives
      .filter(
        (objective) =>
          objective.type === "inspect_poi" &&
          objective.targetMapId === gameState.currentMapId &&
          Boolean(objective.targetPosition) &&
          !activeQuest.objectiveProgress[objective.id]?.completed,
      )
      .map((objective) => ({
        id: `${activeQuest.questId}:${objective.id}`,
        position: objective.targetPosition!,
      }));
  }, [gameState]);
  const targetEnemy = enemies.find((enemy) => enemy.state !== "dead");
  const targetResource = resources.find(isActiveResource);
  const inventory = gameState.inventory;
  const activeDungeonChest = gameState.slimewardDungeon?.chest?.isUiOpen
    ? gameState.slimewardDungeon.chest
    : null;
  const dungeonChestCountdownSeconds =
    activeDungeonChest?.autoContinueAtMs && !activeDungeonChest.inventoryFull
      ? Math.max(
          0,
          Math.ceil((activeDungeonChest.autoContinueAtMs - currentTime) / 1000),
        )
      : null;
  const activeTeleport = gameState.activeTeleport;
  const teleportWorkingById = useMemo(
    () =>
      getTeleportWorkingStateById({
        map: gameState.map,
        teleportStatesById: gameState.teleportStatesById,
      }),
    [gameState.map, gameState.teleportStatesById],
  );
  const directCompanionCommandsById =
    gameState.directCompanionCommandsById ?? emptyDirectCompanionCommands;
  const combatProjectiles = gameState.combatProjectiles ?? emptyCombatProjectiles;
  const dropVisualEvents = gameState.dropVisualEvents ?? emptyDropVisualEvents;
  const enemyAoeChannelsByCasterId =
    gameState.enemyAoeChannelsByCasterId ?? emptyEnemyAoeChannels;
  const resurrectionProgressByCompanionId =
    gameState.resurrectionProgressByCompanionId ?? emptyResurrectionProgress;
  const skillBindsByEnemyId = gameState.skillBindsByEnemyId ?? emptySkillBinds;
  const skillMarksByEnemyId = gameState.skillMarksByEnemyId ?? emptySkillMarks;
  const skillShieldBlocksById =
    gameState.skillShieldBlocksById ?? emptySkillShieldBlocks;
  const skillVisualEvents = gameState.skillVisualEvents ?? emptySkillVisualEvents;
  const activeMerchant =
    activeMerchantNpcId && isMerchantNpc(gameState.entities[activeMerchantNpcId])
      ? gameState.entities[activeMerchantNpcId]
      : null;
  const activeMerchantLocked =
    Boolean(activeMerchant) && !isMerchantUnlockedForQuests(gameState);
  const activeQuestGiver =
    activeQuestGiverNpcId &&
    gameState.entities[activeQuestGiverNpcId]?.kind === "npc" &&
    (gameState.entities[activeQuestGiverNpcId].npcRole === "quest_giver" ||
      gameState.entities[activeQuestGiverNpcId].npcRole === "class_mentor")
      ? gameState.entities[activeQuestGiverNpcId]
      : null;
  const activeQuestGiverIsClassMentor =
    activeQuestGiver?.npcRole === "class_mentor";
  const activeQuestGiverReadyQuests = activeQuestGiver
    ? getQuestGiverReadyQuests(gameState, activeQuestGiver.id)
    : [];
  const activeQuestGiverAvailableQuests = activeQuestGiver
    ? getQuestGiverAvailableQuests(gameState, activeQuestGiver.id)
    : [];
  const activeQuestGiverCurrentQuests = activeQuestGiver
    ? getQuestGiverCurrentQuests(gameState, activeQuestGiver.id)
    : [];
  const activeQuestGiverPanelQuests =
    activeQuestGiverPanel === "available"
      ? activeQuestGiverAvailableQuests
      : activeQuestGiverPanel === "current"
        ? activeQuestGiverCurrentQuests
        : [];
  const selectedQuestGiverQuest =
    selectedQuestGiverQuestId === null
      ? null
      : activeQuestGiverPanelQuests.find(
          (quest) => quest.questId === selectedQuestGiverQuestId,
        ) ?? null;
  const shouldShowWalletToast =
    !activeMerchant &&
    !activeQuestGiver &&
    (gameState.wallet.visibleUntil ?? 0) > currentTime;
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
  const hubDepartureFoodWarning =
    gameState.hubDepartureFoodWarning &&
    gameState.hubDepartureFoodWarning.expiresAt > currentTime
      ? gameState.hubDepartureFoodWarning
      : null;
  const activeDirectCommandFeedback =
    directCommandFeedback && directCommandFeedback.expiresAt > currentTime
      ? directCommandFeedback
      : null;
  const activeMovementClickFeedbackEvents = movementClickFeedbackEvents.filter(
    (event) => event.expiresAt > currentTime,
  );
  const activeDirectCommandCount = Object.keys(
    directCompanionCommandsById,
  ).length;
  const directCommandGraceCount = Object.values(
    gameState.directCommandGraceUntilByCompanionId ?? {},
  ).filter((graceUntil) => graceUntil > currentTime).length;
  const isMerchantCurrentlyUnlocked = isMerchantUnlockedForQuests(gameState);

  const openMerchantInteraction = useCallback((npc: NpcEntity) => {
    setPendingNpcInteractionId(null);
    setActiveQuestGiverNpcId(null);
    setActiveQuestGiverPanel(null);
    setSelectedQuestGiverQuestId(null);
    setQuestGiverResultMessage(null);
    setActiveMerchantNpcId(npc.id);
    setActiveMerchantPanel(null);
    setMerchantResultMessage(
      isMerchantCurrentlyUnlocked
        ? null
        : "Merchant unlocks during Outfit the Expedition",
    );
    setGameState((state) =>
      isMerchantUnlockedForQuests(state)
        ? recordMerchantInteractionOpened(state, npc.id)
        : recordMerchantLockedForQuest(state, npc.id, "merchant_interaction_locked"),
    );
  }, [isMerchantCurrentlyUnlocked]);

  const openQuestGiverInteraction = useCallback((npc: NpcEntity) => {
    setPendingNpcInteractionId(null);
    setActiveMerchantNpcId(null);
    setActiveMerchantPanel(null);
    setMerchantResultMessage(null);
    setActiveQuestGiverNpcId(npc.id);
    setActiveQuestGiverPanel(null);
    setSelectedQuestGiverQuestId(null);
    setQuestGiverResultMessage(null);
  }, []);

  const openNpcInteraction = useCallback((npc: NpcEntity) => {
    const interactionKind = getNpcInteractionKind(npc);

    if (interactionKind === "merchant") {
      openMerchantInteraction(npc);
      return;
    }

    if (interactionKind === "quest_giver") {
      openQuestGiverInteraction(npc);
    }
  }, [openMerchantInteraction, openQuestGiverInteraction]);

  const closeNpcInteractions = useCallback(() => {
    const merchantNpcId = activeMerchantNpcId;

    setPendingNpcInteractionId(null);
    setActiveMerchantNpcId(null);
    setActiveMerchantPanel(null);
    setMerchantResultMessage(null);
    setActiveQuestGiverNpcId(null);
    setActiveQuestGiverPanel(null);
    setSelectedQuestGiverQuestId(null);
    setQuestGiverResultMessage(null);

    if (!merchantNpcId) {
      return;
    }

    setGameState((state) => {
      const selectedState = recordMerchantMenuSelected(state, merchantNpcId, "leave");

      return recordMerchantInteractionClosed(selectedState, merchantNpcId);
    });
  }, [activeMerchantNpcId]);

  useEffect(() => {
    if (!activeDungeonChest?.autoContinueAtMs || activeDungeonChest.inventoryFull) {
      return;
    }

    const remainingMs = activeDungeonChest.autoContinueAtMs - Date.now();
    const timeoutId = window.setTimeout(() => {
      queueSaveAfterStateChange("Dungeon chest continued");
      setGameState(continueSlimewardDungeonChest);
    }, Math.max(0, remainingMs));

    return () => window.clearTimeout(timeoutId);
  }, [
    activeDungeonChest?.autoContinueAtMs,
    activeDungeonChest?.inventoryFull,
    queueSaveAfterStateChange,
  ]);
  const previousInteractionMapIdRef = useRef(currentMap.id);
  const equipmentTutorialQuestStatus =
    gameState.quests[EQUIPMENT_TUTORIAL_QUEST_ID]?.status ?? null;
  const previousEquipmentTutorialQuestStatusRef = useRef(
    equipmentTutorialQuestStatus,
  );
  const rescuedWipeId =
    gameState.worldWipeRecovery?.status === "rescued"
      ? gameState.worldWipeRecovery.wipeId
      : null;
  const previousRescuedWipeIdRef = useRef(rescuedWipeId);
  const activeGuidePopup = activeGuidePopupId
    ? guidePopupDefinitions[activeGuidePopupId]
    : null;

  const startSimulationLoop = useCallback(() => {
    if (stopLoopRef.current) {
      return;
    }

    stopLoopRef.current = startGameLoop(setGameState);
    setIsSimulationRunning(true);
  }, []);

  const stopSimulationLoop = useCallback(() => {
    if (!stopLoopRef.current) {
      return;
    }

    stopLoopRef.current();
    stopLoopRef.current = null;
    setIsSimulationRunning(false);
  }, []);

  function resetUiForLoadedGame() {
    setIsGameMenuOpen(false);
    setActiveGameMenuTab(null);
    setActiveMerchantNpcId(null);
    setActiveMerchantPanel(null);
    setMerchantResultMessage(null);
    setActiveQuestGiverNpcId(null);
    setActiveQuestGiverPanel(null);
    setSelectedQuestGiverQuestId(null);
    setQuestGiverResultMessage(null);
    setPendingNpcInteractionId(null);
    setEntityHoverTooltip(null);
    setDirectCommandFeedback(null);
    releaseRendererCache();
  }

  function resetGuidePopupState() {
    activeGuidePopupIdRef.current = null;
    viewedGuidePopupIdsRef.current = new Set();
    queuedGuidePopupIdsRef.current = [];
    isGuideSequenceActiveRef.current = false;
    shouldResumeAfterGuideSequenceRef.current = false;
    setActiveGuidePopupId(null);
    setActiveGuidePanelIndex(0);
    setViewedGuidePopupIds([]);
    setQueuedGuidePopupIds([]);
  }

  function enterGameState(state: GameState) {
    latestGameStateRef.current = state;
    previousSavedMapIdRef.current = state.currentMapId ?? HUB_MAP_ID;
    previousQuestStatusesRef.current = getQuestStatuses(state);
    setGameState(state);
    setAppMode("playing");
    resetUiForLoadedGame();
  }

  function continueSavedGame() {
    const loadedSave = readLocalSave();

    if (!loadedSave.ok) {
      setSaveStatusMessage(`Continue failed: ${loadedSave.reason}`);
      setHasLocalSaveFile(false);
      return;
    }

    const restored = restoreGameStateFromSave(loadedSave.save);

    if (!restored.ok) {
      setSaveStatusMessage(`Continue failed: ${restored.reason}`);
      return;
    }

    const now = Date.now();
    const offlineResult = loadedSave.save.offlineFarmingBlockedReason
      ? {
          state: restored.state,
          summary: {
            didApply: false,
            creditedMs: Math.min(Math.max(0, now - restored.savedAtMs), 30 * 60_000),
            enemyKills: 0,
            xpGranted: 0,
            resourcesAdded: [],
            skippedReason: loadedSave.save.offlineFarmingBlockedReason,
          },
        }
      : applyOfflineFarmingProgress(restored.state, restored.savedAtMs, now);
    const saved = writeLocalSave(offlineResult.state, now);

    if (!saved.ok) {
      setSaveStatusMessage(`Continue save failed: ${saved.reason}`);
      return;
    }

    stopSimulationLoop();
    setOfflineSummary(offlineResult.summary);
    setHasLocalSaveFile(true);
    setSaveStatusMessage("Save loaded.");
    enterGameState(offlineResult.state);
  }

  function startNewGame() {
    if (
      hasLocalSaveFile &&
      !window.confirm("Start a new game and overwrite the current save file?")
    ) {
      return;
    }

    const nextState = createInitialGameState();
    const saved = writeLocalSave(nextState, Date.now());

    if (!saved.ok) {
      setSaveStatusMessage(`New game save failed: ${saved.reason}`);
      return;
    }

    stopSimulationLoop();
    setOfflineSummary(null);
    setHasLocalSaveFile(true);
    setSaveStatusMessage("New game started.");
    enterGameState(nextState);
    resetGuidePopupState();
    queueGuidePopup("welcome");
  }

  function deleteSavedGame() {
    if (!window.confirm("Delete the browser save file?")) {
      return;
    }

    const result = deleteLocalSave();

    if (!result.ok) {
      setSaveStatusMessage(`Delete failed: ${result.reason}`);
      return;
    }

    setHasLocalSaveFile(false);
    setOfflineSummary(null);
    setSaveStatusMessage("Save file deleted.");
  }

  function manualSave() {
    writeCurrentSave("Manual save");
  }

  function exportSave() {
    const now = Date.now();
    const save = createSavedGame(latestGameStateRef.current, now);
    const written = writeLocalSaveFile(save);

    if (!written.ok) {
      setSaveStatusMessage(`Export save failed: ${written.reason}`);
      return;
    }

    downloadSavedGame(save);
    setHasLocalSaveFile(true);
    setSaveStatusMessage(
      `Save exported at ${new Date(written.savedAtMs).toLocaleTimeString()}.`,
    );
  }

  async function importSaveFile(file: File) {
    try {
      const importedText = await file.text();
      const parsedSave = parseSavedGameText(importedText);

      if (!parsedSave.ok) {
        setSaveStatusMessage(`Import failed: ${parsedSave.reason}`);
        return;
      }

      if (
        appMode === "playing" &&
        !window.confirm("Import this save and replace current progress?")
      ) {
        return;
      }

      const restored = restoreGameStateFromSave(parsedSave.save);

      if (!restored.ok) {
        setSaveStatusMessage(`Import failed: ${restored.reason}`);
        return;
      }

      const now = Date.now();
      const saved = writeLocalSave(restored.state, now);

      if (!saved.ok) {
        setSaveStatusMessage(`Import save failed: ${saved.reason}`);
        return;
      }

      stopSimulationLoop();
      setOfflineSummary(null);
      setHasLocalSaveFile(true);
      setSaveStatusMessage("Save imported.");
      enterGameState(restored.state);
    } catch (error) {
      setSaveStatusMessage(
        `Import failed: ${error instanceof Error ? error.message : "File could not be read."}`,
      );
    }
  }

  const queueGuidePopup = useCallback((guidePopupId: GuidePopupId) => {
    if (
      viewedGuidePopupIdsRef.current.has(guidePopupId) ||
      activeGuidePopupIdRef.current === guidePopupId ||
      queuedGuidePopupIdsRef.current.includes(guidePopupId)
    ) {
      return;
    }

    setQueuedGuidePopupIds((currentQueue) => {
      if (currentQueue.includes(guidePopupId)) {
        return currentQueue;
      }

      const nextQueue = [...currentQueue, guidePopupId];
      queuedGuidePopupIdsRef.current = nextQueue;

      return nextQueue;
    });
  }, []);

  useEffect(() => {
    viewedGuidePopupIdsRef.current = new Set(viewedGuidePopupIds);
  }, [viewedGuidePopupIds]);

  useEffect(() => {
    activeGuidePopupIdRef.current = activeGuidePopupId;
  }, [activeGuidePopupId]);

  useEffect(() => {
    if (activeGuidePopupId || queuedGuidePopupIds.length === 0) {
      return;
    }

    const [nextGuidePopupId, ...remainingGuidePopupIds] = queuedGuidePopupIds;
    const timeoutId = window.setTimeout(() => {
      queuedGuidePopupIdsRef.current = remainingGuidePopupIds;
      setQueuedGuidePopupIds(remainingGuidePopupIds);

      if (!isGuideSequenceActiveRef.current) {
        isGuideSequenceActiveRef.current = true;
        shouldResumeAfterGuideSequenceRef.current = Boolean(stopLoopRef.current);
        stopSimulationLoop();
      }

      activeGuidePopupIdRef.current = nextGuidePopupId;
      setActiveGuidePopupId(nextGuidePopupId);
      setActiveGuidePanelIndex(0);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeGuidePopupId, queuedGuidePopupIds, stopSimulationLoop]);

  useEffect(() => {
    const previousStatus = previousEquipmentTutorialQuestStatusRef.current;
    previousEquipmentTutorialQuestStatusRef.current =
      equipmentTutorialQuestStatus;

    if (
      previousStatus !== "active" &&
      equipmentTutorialQuestStatus === "active"
    ) {
      queueGuidePopup("equipment_setup");
    }
  }, [equipmentTutorialQuestStatus, queueGuidePopup]);

  useEffect(() => {
    const previousWipeId = previousRescuedWipeIdRef.current;
    previousRescuedWipeIdRef.current = rescuedWipeId;

    if (rescuedWipeId && rescuedWipeId !== previousWipeId) {
      queueGuidePopup("first_wipe_rescue");
    }
  }, [queueGuidePopup, rescuedWipeId]);

  useEffect(() => {
    const previousMapId = previousInteractionMapIdRef.current;
    previousInteractionMapIdRef.current = currentMap.id;

    if (
      previousMapId !== currentMap.id &&
      (activeMerchantNpcId || activeQuestGiverNpcId || pendingNpcInteractionId)
    ) {
      closeNpcInteractions();
    }
  }, [
    activeMerchantNpcId,
    activeQuestGiverNpcId,
    closeNpcInteractions,
    currentMap.id,
    pendingNpcInteractionId,
  ]);

  useEffect(() => {
    const mapId = gameState.currentMapId ?? currentMap.id ?? HUB_MAP_ID;
    const previousMapId = previousSavedMapIdRef.current;
    previousSavedMapIdRef.current = mapId;

    if (appMode === "playing" && previousMapId !== mapId) {
      writeCurrentSave("Map transition saved", gameState);
    }
  }, [appMode, currentMap.id, gameState, writeCurrentSave]);

  useEffect(() => {
    const nextQuestStatuses = getQuestStatuses(gameState);
    const previousQuestStatuses = previousQuestStatusesRef.current;
    previousQuestStatusesRef.current = nextQuestStatuses;

    if (appMode !== "playing") {
      return;
    }

    const shouldSaveQuestProgress = Object.entries(nextQuestStatuses).some(
      ([questId, status]) => {
        const previousStatus = previousQuestStatuses[questId];

        return (
          previousStatus &&
          previousStatus !== status &&
          (status === "ready_to_turn_in" || status === "completed")
        );
      },
    );

    if (shouldSaveQuestProgress) {
      writeCurrentSave("Quest progress saved", gameState);
    }
  }, [appMode, gameState, writeCurrentSave]);

  useEffect(() => {
    if (!activeMerchantNpcId && !activeQuestGiverNpcId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNpcInteractions();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeMerchantNpcId, activeQuestGiverNpcId, closeNpcInteractions]);

  useEffect(() => {
    if (!activeMerchantNpcId && !activeQuestGiverNpcId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest(".npc-interaction")
      ) {
        return;
      }

      closeNpcInteractions();
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [activeMerchantNpcId, activeQuestGiverNpcId, closeNpcInteractions]);

  useEffect(() => {
    if (!leader) {
      if (activeMerchantNpcId || activeQuestGiverNpcId || pendingNpcInteractionId) {
        const timeoutId = window.setTimeout(closeNpcInteractions, 0);

        return () => window.clearTimeout(timeoutId);
      }
      return;
    }

    const activeNpcId = activeMerchantNpcId ?? activeQuestGiverNpcId;
    const activeNpc =
      activeNpcId && gameState.entities[activeNpcId]?.kind === "npc"
        ? gameState.entities[activeNpcId]
        : null;

    if (
      activeNpc &&
      getPositionDistance(leader.position, activeNpc.position) >
        getNpcInteractionRange(activeNpc)
    ) {
      const timeoutId = window.setTimeout(closeNpcInteractions, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const pendingNpc =
      pendingNpcInteractionId &&
      gameState.entities[pendingNpcInteractionId]?.kind === "npc"
        ? gameState.entities[pendingNpcInteractionId]
        : null;

    if (!pendingNpc) {
      if (pendingNpcInteractionId) {
        const timeoutId = window.setTimeout(() => {
          setPendingNpcInteractionId(null);
        }, 0);

        return () => window.clearTimeout(timeoutId);
      }
      return;
    }

    if (
      getPositionDistance(leader.position, pendingNpc.position) <=
      getNpcInteractionRange(pendingNpc)
    ) {
      const timeoutId = window.setTimeout(() => {
        openNpcInteraction(pendingNpc);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [
    activeMerchantNpcId,
    activeQuestGiverNpcId,
    gameState.entities,
    closeNpcInteractions,
    leader?.position.x,
    leader?.position.y,
    leader,
    openNpcInteraction,
    pendingNpcInteractionId,
  ]);

  useEffect(() => {
    const previousCrownBalance = previousCrownBalanceRef.current;

    if (currentCrownBalance > previousCrownBalance) {
      setCurrencyGainFeedbackUntil(Date.now() + currencyGainFeedbackDurationMs);
    }

    previousCrownBalanceRef.current = currentCrownBalance;
  }, [currentCrownBalance]);

  useEffect(() => {
    const mapId = gameState.currentMapId ?? currentMap.id ?? currentMap.debugName;

    if (visualMovementMapIdRef.current === undefined) {
      visualMovementMapIdRef.current = mapId;
      return;
    }

    if (visualMovementMapIdRef.current === mapId) {
      return;
    }

    visualMovementMapIdRef.current = mapId;
    latestAnimatedEntityPositionsRef.current = {};
    previousAnimatedEntityPositionsRef.current = {};
    latestTrackedVisualMovementEntityIdsRef.current = new Set();
    nextVisualMovementPruneAtRef.current = Infinity;
    setVisualMovementByEntityId((currentVisualMovement) =>
      Object.keys(currentVisualMovement).length === 0 ? currentVisualMovement : {},
    );
  }, [currentMap.debugName, currentMap.id, gameState.currentMapId]);

  useEffect(() => {
    let animationFrameId = 0;
    let isActive = true;
    let lastUiClockAt = 0;

    function stepVisualClock() {
      if (!isActive) {
        return;
      }

      const now = Date.now();
      if (now - lastUiClockAt >= uiClockIntervalMs) {
        lastUiClockAt = now;
        setCurrentTime(now);
      }

      const latestPositions = latestAnimatedEntityPositionsRef.current;
      const previousPositions = previousAnimatedEntityPositionsRef.current;

      const shouldPruneVisualMovement =
        now >= nextVisualMovementPruneAtRef.current;

      if (latestPositions === previousPositions && !shouldPruneVisualMovement) {
        animationFrameId = window.requestAnimationFrame(stepVisualClock);
        return;
      }

      const movedEntityIds = Object.keys(latestPositions).filter(
        (entityId) =>
          previousPositions[entityId] &&
          !isSamePosition(
            previousPositions[entityId],
            latestPositions[entityId],
          ),
      );

      if (movedEntityIds.length > 0 || shouldPruneVisualMovement) {
        setVisualMovementByEntityId((currentVisualMovement) => {
          let nextVisualMovement = shouldPruneVisualMovement
            ? pruneVisualMovementEntries(
                currentVisualMovement,
                latestTrackedVisualMovementEntityIdsRef.current,
                now,
              )
            : currentVisualMovement;

          for (const entityId of movedEntityIds) {
            if (nextVisualMovement === currentVisualMovement) {
              nextVisualMovement = { ...currentVisualMovement };
            }

            nextVisualMovement[entityId] = {
              direction: getMovementDirection(
                previousPositions[entityId],
                latestPositions[entityId],
              ),
              angleDegrees: getMovementAngleDegrees(
                previousPositions[entityId],
                latestPositions[entityId],
              ),
              expiresAt: now + visualMovementGraceMs,
            };
          }

          nextVisualMovementPruneAtRef.current =
            getNextVisualMovementPruneAt(nextVisualMovement);

          return nextVisualMovement;
        });
      }

      previousAnimatedEntityPositionsRef.current = latestPositions;
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
  }, [rendererPerformanceRef]);

  useEffect(() => {
    const trackedPositions = getTrackedVisualMovementPositions({
      cameraOffset: terrainCameraOffset,
      cellPixelSize: mapConstructionCellPixelSize,
      combatFeedbackEvents: gameState.combatFeedbackEvents,
      currentTime,
      enemies,
      marginTiles: visualMovementEnemyViewportMarginTiles,
      partyMembers,
      questGuideNpcs,
      viewportSize,
      visualMovementByEntityId,
    });

    latestAnimatedEntityPositionsRef.current = trackedPositions;
    latestTrackedVisualMovementEntityIdsRef.current = new Set(
      Object.keys(trackedPositions),
    );

    if (Object.keys(visualMovementByEntityId).length > 0) {
      nextVisualMovementPruneAtRef.current = Math.min(
        nextVisualMovementPruneAtRef.current,
        currentTime,
      );
    }
  }, [
    currentTime,
    enemies,
    gameState.combatFeedbackEvents,
    partyMembers,
    questGuideNpcs,
    terrainCameraOffset,
    viewportSize,
    visualMovementByEntityId,
  ]);

  useEffect(() => {
    function handleConsumableShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key !== "1" && event.key !== "2") {
        return;
      }

      event.preventDefault();
      setGameState((state) =>
        startPartyConsumableUse(
          state,
          event.key === "1" ? "flask" : "food",
          Date.now(),
        ),
      );
    }

    window.addEventListener("keydown", handleConsumableShortcut);

    return () => {
      window.removeEventListener("keydown", handleConsumableShortcut);
    };
  }, []);

  function toggleSimulationLoop() {
    if (stopLoopRef.current) {
      stopSimulationLoop();
      return;
    }

    startSimulationLoop();
  }

  function toggleAutoMode() {
    setGameState((state) =>
      setAutoModeEnabled(state, !state.autoModeEnabled),
    );
  }

  function showPreviousGuidePanel() {
    setActiveGuidePanelIndex((currentIndex) => Math.max(currentIndex - 1, 0));
  }

  function showNextGuidePanel() {
    if (!activeGuidePopupId) {
      return;
    }

    const lastPanelIndex =
      guidePopupDefinitions[activeGuidePopupId].panels.length - 1;

    setActiveGuidePanelIndex((currentIndex) =>
      Math.min(currentIndex + 1, lastPanelIndex),
    );
  }

  function closeActiveGuidePopup() {
    if (!activeGuidePopupId) {
      return;
    }

    viewedGuidePopupIdsRef.current.add(activeGuidePopupId);
    setViewedGuidePopupIds((currentViewedIds) =>
      currentViewedIds.includes(activeGuidePopupId)
        ? currentViewedIds
        : [...currentViewedIds, activeGuidePopupId],
    );
    activeGuidePopupIdRef.current = null;
    setActiveGuidePopupId(null);
    setActiveGuidePanelIndex(0);

    if (queuedGuidePopupIdsRef.current.length > 0) {
      return;
    }

    const shouldResumeSimulation = shouldResumeAfterGuideSequenceRef.current;
    isGuideSequenceActiveRef.current = false;
    shouldResumeAfterGuideSequenceRef.current = false;

    if (shouldResumeSimulation) {
      startSimulationLoop();
    }
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
    queueSaveAfterStateChange("Party role saved");
    setGameState((state) => setPartyMemberRole(state, entityId, role));
  }

  function changePartyLeader(companionId: string) {
    queueSaveAfterStateChange("Party leader saved");
    setGameState((state) => {
      const companion = state.entities[companionId];

      return companion?.kind === "companion" && companion.state !== "dead"
        ? setPartyLeader(state, companion.id)
        : state;
    });
  }

  function commandPartyToTargetEnemy(targetEnemyId = targetEnemy?.id) {
    if (!targetEnemyId) {
      return;
    }

    setGameState((state) =>
      issuePartyOrder(state, {
        type: "attack",
        targetId: targetEnemyId,
      }),
    );
  }

  function commandCompanionsToGatherResource(targetResourceId = targetResource?.id) {
    if (!targetResourceId) {
      return;
    }

    setGameState((state) =>
      issuePartyOrder(state, {
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

  function levelUpAllCompanions() {
    setGameState(debugLevelUpAllCompanions);
  }

  function toggleCompanionInfiniteHealth() {
    setGameState(debugToggleCompanionInfiniteHealth);
  }

  function toggleCompanionOneHunterClass() {
    setGameState(debugToggleCompanionOneHunterClass);
  }

  function addTestCrowns() {
    setGameState(debugAddTestCrowns);
  }

  function addPrototypeConsumables() {
    setGameState(debugAddPrototypeConsumablesToInventory);
  }

  function finishCurrentQuestForDebug() {
    setGameState((state) =>
      debugFinishCurrentQuest(state, getDisplayQuest(state.quests)?.questId),
    );
  }

  function turnInCurrentQuestForDebug() {
    setGameState((state) =>
      debugTurnInCurrentQuest(state, getDisplayQuest(state.quests)?.questId),
    );
  }

  function killOneCompanion() {
    setGameState(debugKillOneCompanion);
  }

  function forceSuperiorEnemy() {
    setGameState(debugForceSuperiorEnemyInCurrentSubzone);
  }

  function resetSlimewardDungeon() {
    setGameState(debugResetSlimewardDungeon);
  }

  function equipEquipment(
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) {
    queueSaveAfterStateChange("Equipment saved");
    setGameState((state) =>
      equipItemToCompanion(state, companionId, itemId, targetSlot).state,
    );
  }

  function unequipEquipment(
    companionId: string,
    targetSlot: EquipmentSlot,
  ) {
    queueSaveAfterStateChange("Equipment saved");
    setGameState((state) =>
      unequipItemFromCompanion(state, companionId, targetSlot).state,
    );
  }

  function equipFlask(companionId: string, itemId: ItemId) {
    queueSaveAfterStateChange("Flask saved");
    setGameState((state) =>
      equipFlaskToCompanion(state, companionId, itemId).state,
    );
  }

  function unequipFlask(companionId: string) {
    queueSaveAfterStateChange("Flask saved");
    setGameState((state) =>
      unequipFlaskFromCompanion(state, companionId).state,
    );
  }

  function assignFood(companionId: string, itemId: ItemId | null) {
    queueSaveAfterStateChange("Food assignment saved");
    setGameState((state) =>
      assignFoodToCompanion(state, companionId, itemId).state,
    );
  }

  function changeConsumableBehavior(
    companionId: string,
    update: ConsumableBehaviorUpdate,
  ) {
    queueSaveAfterStateChange("Consumable behavior saved");
    setGameState((state) =>
      updateCompanionConsumableBehavior(state, companionId, update),
    );
  }

  function changeSkillBehavior(
    companionId: string,
    update: SkillBehaviorUpdate,
  ) {
    queueSaveAfterStateChange("Skill behavior saved");
    setGameState((state) =>
      updateCompanionSkillBehavior(state, companionId, update),
    );
  }

  function allocateStatPoint(companionId: string, statId: PrimaryStatId) {
    queueSaveAfterStateChange("Stats saved");
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

  const updateEntityHoverTooltip = useCallback(
    (entityId: string | null, pointerPosition?: Position) => {
      setEntityHoverTooltip((currentTooltip) => {
        if (!entityId || !pointerPosition) {
          return currentTooltip === null ? currentTooltip : null;
        }

        if (
          currentTooltip?.entityId === entityId &&
          currentTooltip.position.x === pointerPosition.x &&
          currentTooltip.position.y === pointerPosition.y
        ) {
          return currentTooltip;
        }

        return {
          entityId,
          position: pointerPosition,
        };
      });
    },
    [],
  );

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
    queueSaveAfterStateChange("World travel route saved");
    setGameState((state) =>
      setAutoModeEnabled(setWorldTravelTargetMapId(state, targetMapId), true),
    );
  }

  function clearWorldTravelRoute() {
    queueSaveAfterStateChange("World travel route saved");
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
    queueSaveAfterStateChange("Party order saved");
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

  function selectMerchantPanel(panel: MerchantPanel) {
    if (!activeMerchantNpcId) {
      return;
    }

    if (!isMerchantUnlockedForQuests(gameState)) {
      setMerchantResultMessage("Merchant unlocks during Outfit the Expedition");
      setGameState((state) =>
        recordMerchantLockedForQuest(
          state,
          activeMerchantNpcId,
          "merchant_menu_locked",
        ),
      );
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

    if (!isMerchantUnlockedForQuests(gameState)) {
      setMerchantResultMessage("Merchant unlocks during Outfit the Expedition");
      setGameState((state) =>
        recordMerchantLockedForQuest(
          state,
          activeMerchantNpcId,
          "merchant_exchange_locked",
        ),
      );
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
      queueSaveAfterStateChange("Merchant exchange saved");
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
      queueSaveAfterStateChange("Merchant purchase saved");
      setMerchantResultMessage(
        `Bought ${purchase.result.displayName} for ${purchase.result.priceCrowns} Crowns`,
      );
    } else {
      setMerchantResultMessage(merchantBuyFailureMessages[purchase.result.reason]);
    }

    setGameState(purchase.state);
  }

  function selectQuestGiverPanel(panel: QuestGiverPanel) {
    setActiveQuestGiverPanel(panel);
    setSelectedQuestGiverQuestId(null);
    setQuestGiverResultMessage(null);
  }

  function finishQuestGiverQuests() {
    if (!activeQuestGiverNpcId || activeQuestGiverReadyQuests.length === 0) {
      return;
    }

    const readyCount = activeQuestGiverReadyQuests.length;
    const nextState = finishReadyQuestsForQuestGiver(
      gameState,
      activeQuestGiverNpcId,
    );
    const completedCount = activeQuestGiverReadyQuests.filter(
      (quest) => nextState.quests[quest.questId]?.status === "completed",
    ).length;

    setQuestGiverResultMessage(
      completedCount === readyCount
        ? `Finished ${completedCount} quest${completedCount === 1 ? "" : "s"}`
        : "Inventory too full for quest rewards",
    );
    queueSaveAfterStateChange("Quest rewards saved");
    setGameState(nextState);
  }

  function acceptQuestGiverQuest(questId: QuestId) {
    if (!activeQuestGiverNpcId) {
      return;
    }

    queueSaveAfterStateChange("Quest accepted saved");
    setGameState((state) =>
      acceptQuestFromQuestGiver(state, activeQuestGiverNpcId, questId),
    );
    setQuestGiverResultMessage("Quest accepted");
    setSelectedQuestGiverQuestId(null);
  }

  function closeMerchantInteraction() {
    closeNpcInteractions();
  }

  function chooseWorldWipeRecoveryHub(hubId: string) {
    queueSaveAfterStateChange("Recovery choice saved");
    setGameState((state) =>
      resolveWorldWipeRecoveryChoice(state, hubId, Date.now()),
    );
  }

  function closeDungeonChest() {
    queueSaveAfterStateChange("Dungeon chest continued");
    setGameState(closeSlimewardDungeonChestUi);
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
    setGameState((state) =>
      issuePartyOrder(state, {
        type: "move",
        targetPosition: { ...targetPosition },
      }),
    );
  }

  function addMovementClickFeedback(position: Position) {
    const now = Date.now();

    setMovementClickFeedbackEvents((currentEvents) => [
      ...currentEvents.filter((event) => event.expiresAt > now),
      {
        id: `movement-click-blocked-${now}`,
        position: { ...position },
        createdAt: now,
        expiresAt: now + movementClickFeedbackDurationMs,
      },
    ]);
  }

  function commandPartyToMoveFromNavigationClick(
    clickedPosition: Position,
    accessibility?: NavigationClickAccessibility | null,
  ) {
    const clickAccessibility =
      accessibility ?? buildNavigationClickAccessibility(gameState);
    const resolvedPosition = resolveNavigationClickTarget(
      gameState,
      clickedPosition,
      clickAccessibility,
    );

    if (!resolvedPosition) {
      addMovementClickFeedback(clickedPosition);
      return;
    }

    setGameState((state) => {
      return issuePartyOrder(state, {
        type: "move",
        targetPosition: resolvedPosition,
      });
    });
  }

  function commandCompanionByDrag(command: CompanionDirectCommandInput) {
    const now = Date.now();
    let resultCode: DirectCompanionCommandResultCode | null = null;

    setGameState((state) => {
      const result = issueCompanionDirectCommand(state, command, now);
      resultCode = result.code;

      return result.state;
    });

    if (resultCode && resultCode !== "success") {
      setDirectCommandFeedback({
        text: getDirectCommandFeedbackText(resultCode),
        expiresAt: now + directCommandFeedbackDurationMs,
      });
    }
  }

  function commandPartyToMoveFromFloorPosition(targetPosition: Position) {
    if (!isPositionInsideCurrentMap(targetPosition)) {
      addMovementClickFeedback(targetPosition);
      return;
    }

    commandPartyToMoveFromNavigationClick(targetPosition);
  }

  function commandPartyToMoveFromMinimapPosition(clickedPosition: Position) {
    commandPartyToMoveFromNavigationClick(
      clickedPosition,
      navigationClickAccessibility,
    );
  }

  function commandPartyToInteractWithNpc(npcId: string) {
    const npc = gameState.entities[npcId];

    if (npc?.kind !== "npc") {
      return;
    }

    const interactionKind = getNpcInteractionKind(npc);
    const interactionRange = getNpcInteractionRange(npc);

    if (!interactionKind) {
      closeNpcInteractions();
      const approachTarget = resolveNpcInteractionApproachTarget(
        gameState,
        npc.position,
        interactionRange,
      );

      if (approachTarget) {
        commandPartyToMoveToPosition(approachTarget);
      }

      return;
    }

    if (
      leader &&
      getPositionDistance(leader.position, npc.position) <= interactionRange
    ) {
      openNpcInteraction(npc);
      return;
    }

    const approachTarget = resolveNpcInteractionApproachTarget(
      gameState,
      npc.position,
      interactionRange,
    );

    if (!approachTarget) {
      closeNpcInteractions();
      return;
    }

    closeNpcInteractions();
    setPendingNpcInteractionId(npc.id);
    commandPartyToMoveToPosition(approachTarget);
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

  function exportDebugTelemetryJson({
    clearAfterExport = false,
  }: { clearAfterExport?: boolean } = {}) {
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
    window.setTimeout(() => URL.revokeObjectURL(url), 0);

    if (clearAfterExport) {
      setGameState(clearDebugTelemetry);
    }
  }

  function isPositionInsideCurrentMap(position: Position): boolean {
    return (
      position.x >= 0 &&
      position.x < currentMap.columns &&
      position.y >= 0 &&
      position.y < currentMap.rows
    );
  }

  const useWildernessVisuals = isWildernessVisualMap(currentMap.id);
  const useHubVisuals = isHubVisualMap(currentMap.id);
  const mapPixelWidth = currentMap.columns * mapConstructionCellPixelSize;
  const mapPixelHeight = currentMap.rows * mapConstructionCellPixelSize;
  const hoveredEntity = entityHoverTooltip
    ? gameState.entities[entityHoverTooltip.entityId]
    : null;
  const leaderCameraPositionX = leader?.position.x ?? 0;
  const leaderCameraPositionY = leader?.position.y ?? 0;
  const leaderCameraFocusPosition = useMemo(
    () => ({
      x: leaderCameraPositionX * mapConstructionCellPixelSize + mapConstructionCellPixelSize / 2,
      y: leaderCameraPositionY * mapConstructionCellPixelSize + mapConstructionCellPixelSize / 2,
    }),
    [leaderCameraPositionX, leaderCameraPositionY],
  );
  const currentMapKey = currentMap.id ?? currentMap.debugName;
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
      const syncFrameId = window.requestAnimationFrame(() => {
        setTerrainCameraOffset(targetOffset);
      });

      return () => window.cancelAnimationFrame(syncFrameId);
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
        setTerrainCameraOffset(nextTargetOffset);
        return;
      }

      const nextOffset = getSettledCameraOffset({
        currentOffset,
        targetOffset: nextTargetOffset,
        deltaMs,
      });

      visualCameraOffsetRef.current = nextOffset;
      setTerrainCameraOffset(nextOffset);

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
    leaderCameraFocusPosition,
    mapPixelHeight,
    mapPixelWidth,
    viewportSize,
  ]);

  if (appMode === "start") {
    return (
      <StartScreen
        hasSaveFile={hasLocalSaveFile}
        statusMessage={saveStatusMessage}
        onContinue={continueSavedGame}
        onDeleteSave={deleteSavedGame}
        onNewGame={startNewGame}
      />
    );
  }

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
            <div className="map-label-content">
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
              <span>Prototype Zone ID: {currentMap.debugName}</span>
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
          </div>
          <PerformanceOverlay
            currentMap={currentMap}
            gameState={gameState}
            rendererPerformanceRef={rendererPerformanceRef}
            visualMovementEntryCount={Object.keys(visualMovementByEntityId).length}
          />
          <LeaderPoiPanel
            autoModeEnabled={gameState.autoModeEnabled}
            consideredTargets={gameState.lastPoiDecision?.consideredTargets}
            hasLeader={hasPartyLeader}
          />
          <Suspense fallback={<PixiWorldRendererFallback mode="full" />}>
            <LazyPixiWorldRenderer
              key={`full-${currentMap.id ?? currentMap.debugName}-${rendererResetNonce}`}
              activeTeleport={activeTeleport}
              cameraOffset={terrainCameraOffset}
              cellPixelSize={mapConstructionCellPixelSize}
              combatFeedbackEvents={gameState.combatFeedbackEvents}
              combatProjectiles={combatProjectiles}
              directCompanionCommandsById={directCompanionCommandsById}
              dropVisualEvents={dropVisualEvents}
              enemyAoeChannelsByCasterId={enemyAoeChannelsByCasterId}
              entities={allEntities}
              leaderIntent={gameState.leaderIntent}
              map={currentMap}
              mode="full"
              movementClickFeedbackEvents={activeMovementClickFeedbackEvents}
              navigationClickAccessibility={navigationClickAccessibility}
              onCompanionDragCommand={commandCompanionByDrag}
              onEnemyClick={commandPartyToTargetEnemy}
              onEntityHover={updateEntityHoverTooltip}
              onFloorClick={commandPartyToMoveFromFloorPosition}
              onNpcClick={commandPartyToInteractWithNpc}
              onPerformanceSample={handleRendererPerformanceSample}
              onCursorPositionChange={updateMapCursorPosition}
              onResourceClick={commandCompanionsToGatherResource}
              partyIntent={gameState.partyIntent}
              questInspectMarkers={questInspectMarkers}
              questGiverHasWork={questGiverHasWork}
              resurrectionProgressByCompanionId={resurrectionProgressByCompanionId}
              showDebugOverlays={showEntityInfo}
              skillBindsByEnemyId={skillBindsByEnemyId}
              skillMarksByEnemyId={skillMarksByEnemyId}
              skillShieldBlocksById={skillShieldBlocksById}
              skillVisualEvents={skillVisualEvents}
              suppressMovePoiRing={suppressEscortGuideMovePoiRing}
              teleportWorkingById={teleportWorkingById}
              viewportSize={viewportSize}
              visualMovementByEntityId={visualMovementByEntityId}
            />
          </Suspense>
          {hoveredEntity && entityHoverTooltip ? (
            <EntityHoverTooltip
              entity={hoveredEntity}
              position={entityHoverTooltip.position}
              viewportSize={viewportSize}
            />
          ) : null}
          <div className="minimap-coordinate-readout" aria-label="Minimap coordinates">
            <span>Leader: {leaderCoordinateText}</span>
            <span>Cursor: {mapCursorCoordinateText}</span>
          </div>
          <Suspense fallback={<PixiWorldRendererFallback mode="preview" />}>
            <LazyPixiWorldRenderer
              key={`preview-${currentMap.id ?? currentMap.debugName}-${rendererResetNonce}`}
              activeTeleport={activeTeleport}
              cameraOffset={terrainCameraOffset}
              cellPixelSize={mapConstructionCellPixelSize}
              entities={allEntities}
              leaderIntent={gameState.leaderIntent}
              map={currentMap}
              mode="preview"
              movementClickFeedbackEvents={activeMovementClickFeedbackEvents}
              navigationClickAccessibility={navigationClickAccessibility}
              onFloorClick={commandPartyToMoveFromMinimapPosition}
              onPerformanceSample={handleRendererPerformanceSample}
              onCursorPositionChange={updateMapCursorPosition}
              suppressMovePoiRing={suppressEscortGuideMovePoiRing}
              teleportWorkingById={teleportWorkingById}
              viewportSize={viewportSize}
            />
          </Suspense>
        </div>

        {activeMerchant ? (
          <section
            className="merchant-interaction quest-tracker-offset npc-interaction"
            aria-label="Merchant menu"
          >
            <div className="merchant-menu">
              <div className="merchant-menu-header">
                <h2>{activeMerchant.displayName}</h2>
                <span>{formatCurrencyDisplay(gameState.wallet, "crowns")}</span>
              </div>
              <button
                className={activeMerchantPanel === "buy" ? "active" : ""}
                disabled={activeMerchantLocked}
                onClick={() => selectMerchantPanel("buy")}
                type="button"
              >
                Buy
              </button>
              <button
                className={activeMerchantPanel === "sell" ? "active" : ""}
                disabled={activeMerchantLocked}
                onClick={() => selectMerchantPanel("sell")}
                type="button"
              >
                Sell
              </button>
              <button
                disabled={activeMerchantLocked}
                onClick={exchangeMerchantJunk}
                type="button"
              >
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

        {activeQuestGiver ? (
          <section
            className="merchant-interaction npc-interaction"
            aria-label="Quest Giver menu"
          >
            <div className="merchant-menu quest-giver-menu">
              <div className="merchant-menu-header">
                <h2>{activeQuestGiver.displayName}</h2>
                <span>{activeQuestGiverReadyQuests.length} Ready</span>
              </div>
              <button
                className={activeQuestGiverPanel ? "active" : ""}
                onClick={() => {
                  if (!activeQuestGiverPanel) {
                    selectQuestGiverPanel("available");
                  }
                }}
                type="button"
              >
                Quests
              </button>
              <button disabled type="button">
                Talk
              </button>
              {activeQuestGiverIsClassMentor ? (
                <button disabled type="button">
                  Class Change
                </button>
              ) : null}
              {activeQuestGiverPanel ? (
                <>
                  <button
                    disabled={activeQuestGiverReadyQuests.length === 0}
                    onClick={finishQuestGiverQuests}
                    type="button"
                  >
                    Finish Quests
                  </button>
                  <button
                    className={
                      activeQuestGiverPanel === "available" ? "active" : ""
                    }
                    onClick={() => selectQuestGiverPanel("available")}
                    type="button"
                  >
                    Available Quests
                  </button>
                  <button
                    className={activeQuestGiverPanel === "current" ? "active" : ""}
                    onClick={() => selectQuestGiverPanel("current")}
                    type="button"
                  >
                    Current Quests
                  </button>
                </>
              ) : null}
              <button onClick={closeNpcInteractions} type="button">
                Leave
              </button>
              {questGiverResultMessage ? (
                <p className="merchant-result-message">
                  {questGiverResultMessage}
                </p>
              ) : null}
            </div>
            {activeQuestGiverPanel ? (
              <aside className="merchant-detail-panel quest-giver-list-panel">
                <div className="menu-section-heading">
                  <span>
                    {activeQuestGiverPanel === "available"
                      ? "Available Quests"
                      : "Current Quests"}
                  </span>
                  <span>{activeQuestGiverPanelQuests.length}</span>
                </div>
                {activeQuestGiverPanelQuests.length > 0 ? (
                  <div className="quest-list">
                    {activeQuestGiverPanelQuests.map((quest) => {
                      const definition = QUEST_DEFINITIONS[quest.questId];
                      const progressTotals = getQuestProgressTotals(quest);
                      const isSelected =
                        selectedQuestGiverQuest?.questId === quest.questId;

                      return (
                        <button
                          key={quest.questId}
                          className={`quest-list-item${
                            isSelected ? " selected" : ""
                          }`}
                          onClick={() =>
                            setSelectedQuestGiverQuestId(quest.questId)
                          }
                          type="button"
                        >
                          <span>{definition.displayName}</span>
                          <span>
                            {progressTotals.currentCount}/
                            {progressTotals.requiredCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="placeholder-box">
                    {activeQuestGiverPanel === "available"
                      ? "No available quests."
                      : "No current quests."}
                  </div>
                )}
              </aside>
            ) : null}
            {selectedQuestGiverQuest ? (
              <QuestGiverDetailPanel
                canAccept={activeQuestGiverPanel === "available"}
                quest={selectedQuestGiverQuest}
                onAccept={acceptQuestGiverQuest}
                onIgnore={() => setSelectedQuestGiverQuestId(null)}
              />
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

        {activeDungeonChest ? (
          <section className="dungeon-chest-overlay" aria-label="Dungeon chest loot">
            <div className="dungeon-chest-panel">
              <h2>Dungeon's Chest Loot</h2>
              {activeDungeonChest.inventoryFull ? (
                <p className="dungeon-chest-warning">
                  Inventory full. Auto Mode stopped.
                </p>
              ) : null}
              {dungeonChestCountdownSeconds !== null ? (
                <p className="dungeon-chest-countdown">
                  Auto Mode continues in {dungeonChestCountdownSeconds}s.
                </p>
              ) : null}
              <div className="dungeon-chest-grid">
                {activeDungeonChest.collectedLoot.length > 0 ? (
                  activeDungeonChest.collectedLoot.map((slot) => {
                    const item = getItemDefinition(slot.itemId);
                    const iconSrc = INVENTORY_ITEM_ICON_SRC[slot.itemId];

                    return (
                      <div className="dungeon-chest-slot" key={slot.itemId}>
                        {iconSrc ? <img alt="" src={iconSrc} /> : null}
                        <span>{item.displayName}</span>
                        <strong>x{slot.quantity}</strong>
                      </div>
                    );
                  })
                ) : (
                  <div className="dungeon-chest-empty">No loot collected.</div>
                )}
              </div>
              <button
                className="dungeon-chest-continue"
                onClick={closeDungeonChest}
                type="button"
              >
                {activeDungeonChest.inventoryFull ? "Back" : "Continue"}
              </button>
            </div>
          </section>
        ) : null}

        {activeGuidePopup ? (
          <GuidePopup
            guide={activeGuidePopup}
            panelIndex={activeGuidePanelIndex}
            onBack={showPreviousGuidePanel}
            onClose={closeActiveGuidePopup}
            onNext={showNextGuidePanel}
          />
        ) : null}

        <button
          className="game-menu-toggle-button"
          onClick={toggleGameMenu}
          type="button"
        >
          {isGameMenuOpen ? "Close Menu" : "Menu"}
        </button>
        {isGameMenuOpen ? (
          <Suspense fallback={null}>
            <LazyGameMenu
              activeTab={activeGameMenuTab}
              activeManagementSection={activePartyManagementSection}
              activePartySection={activePartyMenuSection}
              inventory={inventory}
              wallet={gameState.wallet}
              leaderId={gameState.partyLeaderId}
              members={partyMembers}
              currentTime={currentTime}
              quests={gameState.quests}
              currentMapId={gameState.currentMapId}
              worldTravelTargetMapId={gameState.worldTravelTargetMapId}
              selectedCompanionId={selectedMenuCompanionId}
              selectedQuestId={selectedMenuQuestId}
              totalPartyLevel={totalPartyLevel}
              onAllocateStatPoint={allocateStatPoint}
              onChangeLeader={changePartyLeader}
              onChangeRole={changePartyMemberRole}
              onAssignFood={assignFood}
              onChangeConsumableBehavior={changeConsumableBehavior}
              onChangeSkillBehavior={changeSkillBehavior}
              onEquipEquipment={equipEquipment}
              onEquipFlask={equipFlask}
              onOpenEquipmentManagement={openEquipmentManagementFromInventory}
              onSelectCompanion={setSelectedCompanionId}
              onSelectManagementSection={setActivePartyManagementSection}
              onSelectPartySection={setActivePartyMenuSection}
              onSelectQuest={setSelectedQuestId}
              onSelectTab={selectGameMenuTab}
              onSetWorldTravelRoute={setWorldTravelRoute}
              onClearWorldTravelRoute={clearWorldTravelRoute}
              onUnequipEquipment={unequipEquipment}
              onUnequipFlask={unequipFlask}
              onMovePartyOrder={movePartyMemberOrder}
              saveStatusMessage={saveStatusMessage}
              onExportSave={exportSave}
              onImportSaveFile={importSaveFile}
              onManualSave={manualSave}
            />
          </Suspense>
        ) : null}
        {offlineSummary ? (
          <OfflineSummaryToast
            summary={offlineSummary}
            onClose={() => setOfflineSummary(null)}
          />
        ) : null}
        <CompanionVitalsPanel
          currentTime={currentTime}
          globalCooldownsByCompanionId={gameState.globalCooldownsByCompanionId}
          members={partyMembers}
        />
        <QuestTrackerPanel
          isHidden={isQuestTrackerHidden}
          onShow={() => setIsQuestTrackerHidden(false)}
          quest={displayQuest}
          onHide={() => setIsQuestTrackerHidden(true)}
        />
        {hubDepartureFoodWarning ? (
          <div className="hub-food-warning-toast" role="status">
            Food buffs missing for {hubDepartureFoodWarning.companionIds.length}{" "}
            companion
            {hubDepartureFoodWarning.companionIds.length === 1 ? "" : "s"}
          </div>
        ) : null}
        {activeDirectCommandFeedback ? (
          <div className="direct-command-feedback-toast" role="status">
            {activeDirectCommandFeedback.text}
          </div>
        ) : null}

        <div className="bottom-hud-controls">
          <div className="test-controls simulation-controls">
            <button onClick={toggleSimulationLoop}>
              {isSimulationRunning ? "Stop Simulation" : "Start Simulation"}
            </button>
            <button onClick={toggleAutoMode}>
              Auto Mode {gameState.autoModeEnabled ? "On" : "Off"}
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
                  <button onClick={levelUpAllCompanions}>
                    Level Up All Companions
                  </button>
                  <button onClick={toggleCompanionOneHunterClass}>
                    Toggle Companion 1 Hunter
                  </button>
                  <button
                    className={
                      gameState.debugOptions?.companionInfiniteHealthEnabled
                        ? "active"
                        : ""
                    }
                    onClick={toggleCompanionInfiniteHealth}
                  >
                    Companion Infinite Health{" "}
                    {gameState.debugOptions?.companionInfiniteHealthEnabled
                      ? "On"
                      : "Off"}
                  </button>
                  <button onClick={addTestCrowns}>+100 Crowns</button>
                  <button onClick={addPrototypeConsumables}>
                    Add Prototype Consumables
                  </button>
                  <button onClick={finishCurrentQuestForDebug}>
                    Finish Current Quest
                  </button>
                  <button onClick={turnInCurrentQuestForDebug}>
                    Turn In Current Quest
                  </button>
                  <button onClick={killOneCompanion}>Kill One Companion</button>
                  <button onClick={forceSuperiorEnemy}>
                    Force Superior Enemy
                  </button>
                  <button onClick={resetSlimewardDungeon}>
                    Reset Slimeward Dungeon
                  </button>
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
                  <button onClick={() => exportDebugTelemetryJson()}>
                    Export Debug JSON
                  </button>
                  <button
                    onClick={() =>
                      exportDebugTelemetryJson({ clearAfterExport: true })
                    }
                  >
                    Export & Clear JSON
                  </button>
                  <button onClick={clearDebugTelemetryReport}>
                    Clear Debug Report
                  </button>
                  <button onClick={releaseRendererCache}>
                    Release Renderer Cache
                  </button>
                  <span>
                    Debug Recording{" "}
                    {gameState.debugTelemetry?.isRecording ? "On" : "Off"} | Samples{" "}
                    {gameState.debugTelemetry?.ticks.length ?? 0}/
                    {gameState.debugTelemetry?.maxTicks ?? 1000} | Events{" "}
                    {gameState.debugTelemetry?.events.length ?? 0}
                  </span>
                  <span>
                    Direct Commands {activeDirectCommandCount} | Rejoin Grace{" "}
                    {directCommandGraceCount}
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
        </div>
      </section>
    </main>
  );
}

export default App;

