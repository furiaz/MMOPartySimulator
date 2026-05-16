import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import "./App.css";
import {
  HUB_MAP_TILE_SRC,
  INVENTORY_ITEM_ICON_SRC,
  MAP_OBJECT_ICON_SRC,
  SHARED_SKILL_VISUAL_ICON_SRC,
  SKILL_VISUAL_ICON_SRC,
  WILDERNESS_MAP_TILE_SRC,
} from "./assetIcons";
import SpriteAnimation from "./SpriteAnimation";
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

import {
  addEntity,
  allocateCompanionStatPoint,
  CLASS_DEFINITIONS,
  companionIds,
  companionStartPositions,
  createCompanion,
  createDebugMap,
  createEmptyPartyInventory,
  createEmptyPartyWallet,
  createInitialQuestStates,
  createNpc,
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
  hubCompanionStartPositions,
  hubNpcStartData,
  HUB_MAP_ID,
  QUEST_DEFINITIONS,
  QUEST_GIVER_POI_ID,
  addItemToInventoryState,
  getAttackCooldownMs,
  getEnemyArchetype,
  getEnemyDetectionRange,
  getItemDefinition,
  getPartyLeader,
  getTotalPartyCharacterLevel,
  hasQuestGiverWork,
  issueCompanionCommands,
  isCombatEntity,
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
  setStayInMapEnabled,
  setWorldTravelTargetMapId,
  startGameLoop,
  startDebugTelemetryRecording,
  stopDebugTelemetryRecording,
  triggerMapTeleport,
  unequipItemFromCompanion,
  updateEntity,
  type Companion,
  type CombatEntity,
  type DebugMapId,
  type DebugTeleportPoint,
  type Enemy,
  type EquipmentSlot,
  type GameEntity,
  type GameMap,
  type GameState,
  type ItemId,
  type NpcEntity,
  type PartyMemberRole,
  type PrimaryStatId,
  type PoiConsideration,
  type Position,
  type QuestId,
  type ResourceEntity,
  type SkillVisualEvent,
  type WorldWipeRecoveryChoice,
} from "./game";
import {
  getEntityVisualAsset,
  getEntityVisualClassName,
  getSpriteAnimation,
  mapTileVisualAssets,
  type SpriteDirection,
} from "./visualAssets";

const debugMap = createDebugMap();
const gameVersion = "0.01";
const cellSize = 36;
const enemyAggroRange = getEnemyDetectionRange();
const visualMovementGraceMs = 180;
const visualMovementReachedDistance = 1;
const cameraSettleFactor = 0.08;
const cameraSnapDistance = 0.35;
const cameraDeadZoneWidthRatio = 0.34;
const cameraDeadZoneHeightRatio = 0.3;
const wildernessMapIds = new Set(["map-1", "map-2", "map-3", "map-4"]);

type EntityVisualMovement = {
  direction: SpriteDirection;
  expiresAt: number;
};

type MerchantPanel = "buy" | "sell";

type ViewportSize = {
  width: number;
  height: number;
};

type TileBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function getSkillVisualIconSrc(event: SkillVisualEvent): string | undefined {
  if (event.skillId && SKILL_VISUAL_ICON_SRC[event.skillId]) {
    return SKILL_VISUAL_ICON_SRC[event.skillId];
  }

  if (event.type === "projectile") {
    return SHARED_SKILL_VISUAL_ICON_SRC.projectile;
  }

  if (event.type === "slash") {
    return SHARED_SKILL_VISUAL_ICON_SRC.slash;
  }

  if (event.type === "red_flash") {
    return SHARED_SKILL_VISUAL_ICON_SRC.redFlash;
  }

  if (event.type === "heal") {
    return SHARED_SKILL_VISUAL_ICON_SRC.heal;
  }

  return undefined;
}

function isWildernessVisualMap(mapId: string | undefined): boolean {
  return Boolean(mapId && wildernessMapIds.has(mapId));
}

function isHubVisualMap(mapId: string | undefined): boolean {
  return mapId === HUB_MAP_ID;
}

function getVisibleTileBounds({
  cameraOffset,
  viewportSize,
  map,
  bufferTiles = 4,
}: {
  cameraOffset: Position;
  viewportSize: ViewportSize;
  map: GameMap;
  bufferTiles?: number;
}): TileBounds {
  return {
    minX: clamp(Math.floor(cameraOffset.x / cellSize) - bufferTiles, 0, map.columns - 1),
    maxX: clamp(Math.ceil((cameraOffset.x + viewportSize.width) / cellSize) + bufferTiles, 0, map.columns - 1),
    minY: clamp(Math.floor(cameraOffset.y / cellSize) - bufferTiles, 0, map.rows - 1),
    maxY: clamp(Math.ceil((cameraOffset.y + viewportSize.height) / cellSize) + bufferTiles, 0, map.rows - 1),
  };
}

function createVisibleFloorTilePositions(bounds: TileBounds): Position[] {
  const tiles: Position[] = [];

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      tiles.push({ x, y });
    }
  }

  return tiles;
}

function isPositionInTileBounds(position: Position, bounds: TileBounds): boolean {
  return (
    position.x >= bounds.minX &&
    position.x <= bounds.maxX &&
    position.y >= bounds.minY &&
    position.y <= bounds.maxY
  );
}

function getCoordinateHash(position: Position): number {
  return Math.abs(position.x * 31 + position.y * 17 + position.x * position.y * 7);
}

function getWildernessFloorTileSrc(position: Position): string {
  return getCoordinateHash(position) % 4 === 0
    ? WILDERNESS_MAP_TILE_SRC.grassB
    : WILDERNESS_MAP_TILE_SRC.grassA;
}

function getHubFloorTileSrc(position: Position): string {
  const isCityInterior =
    position.x >= 13 &&
    position.x <= 34 &&
    position.y >= 7 &&
    position.y <= 18;

  return isCityInterior ? HUB_MAP_TILE_SRC.stone : getWildernessFloorTileSrc(position);
}

function getWildernessWallTileKind(position: Position): "tree" | "bush" {
  return getCoordinateHash(position) % 10 === 0 ? "tree" : "bush";
}

function getWildernessWallTileSrc(position: Position): string {
  return WILDERNESS_MAP_TILE_SRC[getWildernessWallTileKind(position)];
}

const TerrainLayer = memo(function TerrainLayer({
  floorTiles,
  map,
  useHubVisuals,
  useImageFloorTiles,
  useWildernessVisuals,
  visibleTileBounds,
}: {
  floorTiles: Position[];
  map: GameMap;
  useHubVisuals: boolean;
  useImageFloorTiles: boolean;
  useWildernessVisuals: boolean;
  visibleTileBounds: TileBounds;
}) {
  return (
    <div className="map-terrain" aria-hidden="true">
      {useImageFloorTiles
        ? floorTiles.map((tile) => (
            <img
              key={`floor-${tile.x}-${tile.y}`}
              alt=""
              className="floor-tile"
              src={
                useHubVisuals
                  ? getHubFloorTileSrc(tile)
                  : getWildernessFloorTileSrc(tile)
              }
              style={{
                transform: `translate(${tile.x * cellSize}px, ${
                  tile.y * cellSize
                }px)`,
              }}
            />
          ))
        : null}
      {map.walls
        .filter((wall) => isPositionInTileBounds(wall, visibleTileBounds))
        .map((wall) => (
          <div
            key={`${wall.x}-${wall.y}`}
            className={`wall-tile ${
              useWildernessVisuals
                ? "wall-wilderness"
                : mapTileVisualAssets.wall.className
            }`}
            style={{
              transform: `translate(${wall.x * cellSize}px, ${
                wall.y * cellSize
              }px)`,
            }}
          >
            {useWildernessVisuals ? (
              <img
                alt=""
                className={`wall-wilderness-image ${getWildernessWallTileKind(
                  wall,
                )}`}
                src={getWildernessWallTileSrc(wall)}
              />
            ) : null}
          </div>
        ))}
    </div>
  );
});

function formatResourceName(resourceType: ResourceEntity["resourceType"]): string {
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
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

function getEnemyDisplayName(enemy: Enemy): string {
  if (enemy.archetypeId) {
    return (
      getEnemyArchetype(enemy.archetypeId)?.displayName ??
      formatIdentifierName(enemy.archetypeId)
    );
  }

  return enemy.enemyType ? formatIdentifierName(enemy.enemyType) : "Enemy";
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
    getEnemyDisplayName(enemy),
    enemy.archetypeId ? `Archetype ${enemy.archetypeId}` : null,
    `Level ${enemy.level}`,
    `XP ${enemy.xpReward ?? "auto"}`,
    `HP ${enemy.health}/${enemy.maxHealth}`,
    `State ${enemy.state}`,
    `Target ${formatTargetId(enemy)}`,
    `Aggression ${enemy.aggressionMode}`,
    enemy.targetDecisionReason ? `Decision ${enemy.targetDecisionReason}` : null,
  ].filter(Boolean).join("\n");
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

function getPositionDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
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

  const initialState = [leader, secondCompanion, ...npcs].reduce(addEntity, {
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

function ResurrectionChannelBar({
  progress,
}: {
  progress?: { progressMs: number; requiredMs: number };
}) {
  if (!progress || progress.progressMs <= 0) {
    return null;
  }

  const progressRatio = Math.min(1, progress.progressMs / progress.requiredMs);

  return (
    <div className="channel-feedback" title="Resurrection channel progress">
      <span className="channel-feedback-label">Resurrecting</span>
      <span className="channel-feedback-bar">
        <span style={{ width: `${progressRatio * 100}%` }} />
      </span>
    </div>
  );
}

function EntityNameLabel({
  name,
  isAggressive = false,
}: {
  name: string;
  isAggressive?: boolean;
}) {
  return (
    <span
      className={`entity-name-label${
        isAggressive ? " entity-name-label-aggressive" : ""
      }`}
    >
      {name}
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
    1 - (currentTime - entity.lastAttackAt) / getAttackCooldownMs(entity),
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
  const mapWorldRef = useRef<HTMLDivElement | null>(null);
  const visualCameraOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const cameraMapIdRef = useRef<string | undefined>(undefined);
  const previousCameraFocusRef = useRef<Position | null>(null);
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
  const totalPartyLevel = getTotalPartyCharacterLevel(gameState);
  const leader = getPartyLeader(gameState);
  const hasPartyLeader = Boolean(leader);
  const enemies = Object.values(gameState.entities).filter(
    (entity): entity is Enemy => entity.kind === "enemy",
  );
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
  const questGiverHasWork = hasQuestGiverWork(gameState);
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
  const skillSpriteVisuals = activeSkillVisualEvents.filter((event) =>
    Boolean(getSkillVisualIconSrc(event)),
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
    (event) =>
      !getSkillVisualIconSrc(event) &&
      (event.type === "projectile" || event.type === "heal"),
  );
  const slashVisuals = activeSkillVisualEvents.filter(
    (event) => !getSkillVisualIconSrc(event) && event.type === "slash",
  );
  const activeDropVisualEvents = (gameState.dropVisualEvents ?? []).filter(
    (event) => event.expiresAt > currentTime,
  );
  const activeMerchant =
    activeMerchantNpcId && isMerchantNpc(gameState.entities[activeMerchantNpcId])
      ? gameState.entities[activeMerchantNpcId]
      : null;
  const shouldShowWalletToast =
    !activeMerchant && (gameState.wallet.visibleUntil ?? 0) > currentTime;
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

  function toggleStayInMap() {
    setGameState((state) =>
      setStayInMapEnabled(state, !state.poiPreferences.stayInMap),
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

  function commandPartyToMoveFromFloorClick(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const visualCameraOffset = visualCameraOffsetRef.current;
    const targetPosition = {
      x: Math.floor(
        (event.clientX - bounds.left + visualCameraOffset.x) / cellSize,
      ),
      y: Math.floor(
        (event.clientY - bounds.top + visualCameraOffset.y) / cellSize,
      ),
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

  const useWildernessVisuals = isWildernessVisualMap(currentMap.id);
  const useHubVisuals = isHubVisualMap(currentMap.id);
  const useImageFloorTiles = useWildernessVisuals || useHubVisuals;
  const mapPixelWidth = currentMap.columns * cellSize;
  const mapPixelHeight = currentMap.rows * cellSize;
  const leaderCameraPosition = leader?.position ?? { x: 0, y: 0 };
  const leaderCameraFocusPosition = {
    x: leaderCameraPosition.x * cellSize + cellSize / 2,
    y: leaderCameraPosition.y * cellSize + cellSize / 2,
  };
  const currentMapKey = currentMap.id ?? currentMap.debugName;
  const terrainCameraOffset = getDeadZoneCameraOffset({
    focusPosition: leaderCameraFocusPosition,
    currentOffset: visualCameraOffsetRef.current,
    viewportSize,
    mapPixelWidth,
    mapPixelHeight,
  });
  const visibleTileBounds = getVisibleTileBounds({
    cameraOffset: terrainCameraOffset,
    viewportSize,
    map: currentMap,
  });
  const floorTiles = useMemo(
    () =>
      useImageFloorTiles
        ? createVisibleFloorTilePositions(visibleTileBounds)
        : [],
    [
      useImageFloorTiles,
      visibleTileBounds.minX,
      visibleTileBounds.maxX,
      visibleTileBounds.minY,
      visibleTileBounds.maxY,
    ],
  );

  function applyMapWorldTransform(offset: Position) {
    if (!mapWorldRef.current) {
      return;
    }

    mapWorldRef.current.style.transform = `translate(${-offset.x}px, ${-offset.y}px)`;
  }

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
      applyMapWorldTransform(targetOffset);
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
    applyMapWorldTransform(velocityMatchedOffset);

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
        applyMapWorldTransform(nextTargetOffset);
        return;
      }

      const nextOffset = getSettledCameraOffset({
        currentOffset,
        targetOffset: nextTargetOffset,
        deltaMs,
      });

      visualCameraOffsetRef.current = nextOffset;
      applyMapWorldTransform(nextOffset);

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
          className={`test-area ${mapTileVisualAssets.floor.className}${
            useWildernessVisuals ? " floor-wilderness" : ""
          }${useHubVisuals ? " floor-hub" : ""
          }`}
          aria-label="Follow system top-down test area"
          onClick={commandPartyToMoveFromFloorClick}
        >
          <div className="map-label-overlay">
            <div className="map-title-row">
              <span className="map-version">v{gameVersion}</span>
              <strong>{currentMap.displayName}</strong>
              <button
                className={`stay-in-map-toggle${
                  gameState.poiPreferences.stayInMap ? " active" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleStayInMap();
                }}
                type="button"
              >
                Stay in Map {gameState.poiPreferences.stayInMap ? "On" : "Off"}
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
          <LeaderPoiPanel
            autoModeEnabled={gameState.autoModeEnabled}
            consideredTargets={gameState.lastPoiDecision?.consideredTargets}
            hasLeader={hasPartyLeader}
          />
          <div
            ref={mapWorldRef}
            className="map-world"
            style={{
              width: mapPixelWidth,
              height: mapPixelHeight,
            }}
          >
            <TerrainLayer
              floorTiles={floorTiles}
              map={currentMap}
              useHubVisuals={useHubVisuals}
              useImageFloorTiles={useImageFloorTiles}
              useWildernessVisuals={useWildernessVisuals}
              visibleTileBounds={visibleTileBounds}
            />
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
            {currentMap.subzoneNameLabels?.map((label) => (
              <div
                key={label.id}
                className="subzone-name-label"
                style={{
                  transform: `translate(${label.position.x * cellSize}px, ${
                    label.position.y * cellSize
                  }px) translate(-50%, -50%)`,
                }}
                title={label.text}
              >
                {label.text}
              </div>
            ))}
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
                >
                  <img
                    alt=""
                    aria-hidden="true"
                    className="map-object-icon"
                    src={MAP_OBJECT_ICON_SRC.teleportPoint}
                  />
                </button>
              </div>
            ))}
            {currentMap.healingFountains.map((fountain) => (
              <div
                key={fountain.id}
                className="healing-fountain"
                style={{
                  transform: `translate(${fountain.position.x * cellSize}px, ${
                    fountain.position.y * cellSize
                  }px)`,
                }}
                title="Healing fountain"
              >
                <img
                  alt=""
                  aria-hidden="true"
                  className="map-object-icon"
                  src={MAP_OBJECT_ICON_SRC.healingFountain}
                />
              </div>
            ))}
            {Object.values(gameState.skillShieldBlocksById ?? {})
              .filter((shield) => !shield.id.endsWith("-guard_up"))
              .map((shield) => (
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
            {skillSpriteVisuals.map((event) => {
              const source = gameState.entities[event.sourceId];
              const target = event.targetId
                ? gameState.entities[event.targetId]
                : undefined;
              const iconSrc = getSkillVisualIconSrc(event);

              if (!source || !iconSrc) {
                return null;
              }

              const spritePosition =
                event.type === "heal" && target
                  ? target.position
                  : event.position ?? source.position;

              return (
                <img
                  key={event.id}
                  alt=""
                  aria-hidden="true"
                  className={`skill-visual-sprite ${event.type}`}
                  src={iconSrc}
                  style={{
                    transform: `translate(${
                      spritePosition.x * cellSize + cellSize / 2
                    }px, ${
                      spritePosition.y * cellSize + cellSize / 2
                    }px) translate(-50%, -50%)`,
                  }}
                />
              );
            })}
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
            {activeDropVisualEvents.map((event) => {
              const itemDefinition = getItemDefinition(event.itemId);
              const iconSrc = INVENTORY_ITEM_ICON_SRC[event.itemId];
              const duration = event.expiresAt - event.createdAt;
              const progress = duration > 0
                ? Math.min(1, Math.max(0, (currentTime - event.createdAt) / duration))
                : 1;
              const visualY = event.position.y - progress * 2;

              return (
                <div
                  key={event.id}
                  className={`drop-visual ${itemDefinition.category}`}
                  style={{
                    opacity: 1 - progress,
                    transform: `translate(${event.position.x * cellSize}px, ${
                      visualY * cellSize
                    }px)`,
                  }}
                  title={itemDefinition.displayName}
                >
                  {iconSrc ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      className="drop-visual-icon"
                      src={iconSrc}
                    />
                  ) : (
                    <span aria-hidden="true">
                      {itemDefinition.displayName.charAt(0)}
                    </span>
                  )}
                </div>
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
            {showEntityInfo
              ? enemies.map((enemy) =>
                  enemy.state !== "dead" && enemy.aggressionMode === "aggressive" ? (
                    <div
                      key={`aggro-${gameState.currentMapId ?? HUB_MAP_ID}-${enemy.id}`}
                      className="enemy-aggro-range"
                      style={{
                        width: enemyAggroRange * cellSize * 2,
                        height: enemyAggroRange * cellSize * 2,
                        transform: `translate(${
                          enemy.position.x * cellSize +
                          cellSize / 2 -
                          enemyAggroRange * cellSize
                        }px, ${
                          enemy.position.y * cellSize +
                          cellSize / 2 -
                          enemyAggroRange * cellSize
                        }px)`,
                      }}
                      title="Enemy detection range"
                    />
                  ) : null,
                )
              : null}
            {partyMembers.map((member, index) => {
              const visualAsset = getEntityVisualAsset(member, gameState.currentMapId);
              const visualMovement =
                visualMovementByEntityId[member.id];
              const isDead = member.state === "dead";
              const isVisuallyMoving =
                Boolean(visualMovement) && visualMovement.expiresAt > currentTime;
              const shouldRunAnimation =
                isVisuallyMoving || (!isDead && isCompanionTryingToMove(member));
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
                  }${healedEntityIds.has(member.id) ? " skill-heal-outline" : ""}${
                    isDead ? " companion-dead" : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isDead) {
                      return;
                    }
                    commandPartyToMoveToPosition(member.position);
                  }}
                  style={{
                    transform: `translate(${member.position.x * cellSize}px, ${
                      member.position.y * cellSize
                    }px)`,
                  }}
                  title={
                    isDead
                      ? "Dead companion"
                      : "Move party POI to this party member"
                  }
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
                  <ResurrectionChannelBar
                    progress={gameState.resurrectionProgressByCompanionId?.[member.id]}
                  />
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

              const visualAsset = getEntityVisualAsset(enemy, gameState.currentMapId);
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
                      : getEntityVisualClassName(enemy, gameState.currentMapId)
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
                  <EntityNameLabel
                    name={getEnemyDisplayName(enemy)}
                    isAggressive={enemy.aggressionMode === "aggressive"}
                  />
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
                    detail={`HP ${enemy.health} ${enemy.archetypeId ?? enemy.aggressionMode}`}
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
            {resources.map((resource) => {
              const visualAsset = getEntityVisualAsset(
                resource,
                gameState.currentMapId,
              );
              const isImageResource = visualAsset.kind === "image";

              return resource.isDepleted ? (
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
                  className={`entity-marker ${
                    isImageResource
                      ? "resource-image-entity"
                      : getEntityVisualClassName(resource, gameState.currentMapId)
                  }${
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
                  {isImageResource ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      className="resource-image"
                      src={visualAsset.src}
                    />
                  ) : null}
                  <EntityDebugLabel
                    name={resource.resourceType}
                    entity={resource}
                    detail={`${resource.durability}/${resource.maxDurability} Qty ${resource.quantity}`}
                    isVisible={showEntityInfo}
                  />
                </div>
              );
            })}
            {npcs.map((npc) => {
              const visualAsset = getEntityVisualAsset(npc, gameState.currentMapId);
              const isImageNpc = visualAsset.kind === "image";

              return (
                <div
                  key={`${gameState.currentMapId ?? HUB_MAP_ID}-${npc.id}`}
                  className={`entity-marker ${
                    isImageNpc
                      ? "npc-image-entity"
                      : getEntityVisualClassName(npc, gameState.currentMapId)
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (npc.npcRole === "merchant") {
                      openMerchantInteraction(npc);
                      return;
                    }

                    commandPartyToMoveToPosition(npc.position);
                  }}
                  style={{
                    transform: `translate(${npc.position.x * cellSize}px, ${
                      npc.position.y * cellSize
                    }px)`,
                  }}
                  title={
                    npc.npcRole === "merchant"
                      ? `Open ${npc.displayName}`
                      : `Move party POI to ${npc.displayName}`
                  }
                >
                  <EntityNameLabel name={npc.displayName} />
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
              <aside className="merchant-detail-panel">
                <h2>{activeMerchantPanel === "buy" ? "Buy" : "Sell"}</h2>
                <p>Placeholder</p>
              </aside>
            ) : null}
          </section>
        ) : null}

        {shouldShowWalletToast ? (
          <div className="wallet-visibility-toast" aria-label="Wallet balance">
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
