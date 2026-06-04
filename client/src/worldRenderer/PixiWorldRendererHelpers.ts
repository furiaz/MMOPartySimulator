import {
  HUB_MAP_TILE_SRC,
  HUB_WALL_TILE_SRC,
  MAP_OBJECT_ICON_SRC,
  MAP_VISUAL_OBJECT_SRC,
  NPC_ICON_SRC,
  SHARED_SKILL_VISUAL_ICON_SRC,
  SLIMEWARD_DUNGEON_TILE_SRC,
  SKILL_VISUAL_ICON_SRC,
  WILDERNESS_MAP_TILE_SRC,
} from "../assetIcons";
import type {
  ActiveTeleport,
  CombatFeedbackEvent,
  DirectCompanionCommand,
  DropVisualEvent,
  EnemyAoeChannelState,
  GameEntity,
  GameMap,
  LeaderIntent,
  PartyIntent,
  Position,
  ResurrectionProgressState,
  SkillBindState,
  SkillMarkState,
  SkillShieldBlockState,
  SkillVisualEvent,
} from "../game";
import {
  aoeTargetDummyId,
  getEnemyArchetype,
  getEnemyType,
  isActiveResource,
} from "../game";
import {
  SUPERIOR_ENEMY_RENDER_SCALE,
  isSuperiorEnemy,
} from "../game/enemyVariants";
import {
  entityVisualAssets,
  getEntityVisualAsset,
  type ImageVisualAsset,
  type SpriteAnimationAsset,
  type SpriteDirection,
  type SpriteVisualAsset,
} from "../visualAssets";

export const previewWidth = 256;
export const previewHeight = 144;
export const previewPadding = 8;
export const floorChunkCellSpan = 4;
export const fullModeInteractionRadius = 1.5;
export const MAX_RENDER_FPS = 60;
export const MIN_RENDER_FRAME_MS = 1000 / MAX_RENDER_FPS;

const wildernessMapIds = new Set(["map-1", "map-2", "map-3", "map-4"]);
const aggressiveEnemyNameplateColor = 0xdc2626;
const passiveEnemyNameplateColor = 0x1f2937;
const prototypeVfxSpritePath = "assets/Generated/prototype-vfx/sprites";

export const blockImpactSrc = `${prototypeVfxSpritePath}/block-impact.png`;
export const criticalHitBackingSrc = `${prototypeVfxSpritePath}/critical-hit-backing.png`;
export const deathDownedPuffSrc = `${prototypeVfxSpritePath}/death-downed-puff.png`;
export const enemySpottedAlertSrc = `${prototypeVfxSpritePath}/enemy-spotted-alert.png`;
export const healSparkleSrc = `${prototypeVfxSpritePath}/heal-sparkle.png`;
export const gatherCompleteSparkleSrc = `${prototypeVfxSpritePath}/gather-complete-sparkle.png`;
export const inventoryFullWarningSrc = `${prototypeVfxSpritePath}/inventory-full-warning.png`;
export const levelUpBurstSrc = `${prototypeVfxSpritePath}/level-up-burst.png`;
export const missEvadePuffSrc = `${prototypeVfxSpritePath}/miss-evade-puff.png`;
export const resourceDepletedPuffSrc = `${prototypeVfxSpritePath}/resource-depleted-puff.png`;
export const resourceHitHerbSrc = `${prototypeVfxSpritePath}/resource-hit-herb.png`;
export const resourceHitOreSrc = `${prototypeVfxSpritePath}/resource-hit-ore.png`;
export const resourceHitWoodSrc = `${prototypeVfxSpritePath}/resource-hit-wood.png`;
export const shieldInvulnerableGlintSrc = `${prototypeVfxSpritePath}/shield-invulnerable-glint.png`;
export const teleportPulseSrc = `${prototypeVfxSpritePath}/teleport-pulse.png`;

export const TELEPORT_OBJECT_SPRITE_SIZE_PX = 250;
export const TELEPORT_OBJECT_SPRITE_ANCHOR_X = 0.5;
export const TELEPORT_OBJECT_SPRITE_ANCHOR_Y = 0.5;

const staticMapSpriteKeyPrefixes = [
  "floor:",
  "slimeward-floor:",
  "wall:",
  "slimeward-wall:",
  "object:",
  "map-visual-object:",
];

export type PixiRendererPerformanceSample = {
  activeFeedbackCount: number;
  drawCount: number;
  drawnEntityCount: number;
  drawnFeedbackCount: number;
  drawnSprites: number;
  drawnTexts: number;
  durableTextureSourceCount: number;
  evictedTextureCount: number;
  fullDrawCount: number;
  managedSpriteCount: number;
  managedTextCount: number;
  mapScopedTextureSourceCount: number;
  mapTrackedTextureSourceCount: number;
  pendingTextureCount: number;
  previewDrawCount: number;
  managedStaticSpriteCount: number;
  renderMs: number;
  spriteCreates: number;
  spriteReuses: number;
  textCreates: number;
  textReuses: number;
  textureCount: number;
  retainedMapCount: number;
  stalePendingTextureCount: number;
  failedTextureCount: number;
  unloadFailedTextureCount: number;
  visibleEntityCount: number;
};

export type TileBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type RendererFrameSchedulerOptions = {
  cancelAnimationFrame: (frameId: number) => void;
  draw: () => boolean;
  getShouldContinueRedrawing?: () => boolean;
  minFrameMs?: number;
  now: () => number;
  requestAnimationFrame: (callback: (nowMs: number) => void) => number;
};

export type RendererFrameScheduler = {
  cancel: () => void;
  getLastDrawAtMs: () => number | null;
  hasPendingFrame: () => boolean;
  requestImmediateRedraw: () => void;
  requestRedraw: () => void;
};

export function createRendererFrameScheduler({
  cancelAnimationFrame,
  draw,
  getShouldContinueRedrawing = () => false,
  minFrameMs = MIN_RENDER_FRAME_MS,
  now,
  requestAnimationFrame,
}: RendererFrameSchedulerOptions): RendererFrameScheduler {
  let isCancelled = false;
  let lastDrawAtMs: number | null = null;
  let scheduledFrameId: number | null = null;

  function clearScheduledFrame() {
    if (scheduledFrameId === null) {
      return;
    }

    cancelAnimationFrame(scheduledFrameId);
    scheduledFrameId = null;
  }

  function requestRedraw() {
    if (isCancelled || scheduledFrameId !== null) {
      return;
    }

    scheduledFrameId = requestAnimationFrame(runScheduledFrame);
  }

  function runScheduledFrame(frameTimeMs: number) {
    scheduledFrameId = null;

    if (isCancelled) {
      return;
    }

    const drawAtMs = Number.isFinite(frameTimeMs) ? frameTimeMs : now();

    if (!isRendererFrameDue(drawAtMs, lastDrawAtMs, minFrameMs)) {
      requestRedraw();
      return;
    }

    runDraw(drawAtMs);
  }

  function runDraw(drawAtMs: number) {
    if (isCancelled) {
      return;
    }

    const didDraw = draw();

    if (didDraw) {
      lastDrawAtMs = getAdvancedRendererDrawTime(drawAtMs, lastDrawAtMs, minFrameMs);
    }

    if (getShouldContinueRedrawing()) {
      requestRedraw();
    }
  }

  return {
    cancel() {
      isCancelled = true;
      clearScheduledFrame();
    },
    getLastDrawAtMs() {
      return lastDrawAtMs;
    },
    hasPendingFrame() {
      return scheduledFrameId !== null;
    },
    requestImmediateRedraw() {
      clearScheduledFrame();
      runDraw(now());
    },
    requestRedraw,
  };
}

export function isRendererFrameDue(
  nowMs: number,
  lastDrawAtMs: number | null,
  minFrameMs = MIN_RENDER_FRAME_MS,
): boolean {
  if (lastDrawAtMs === null || !Number.isFinite(lastDrawAtMs)) {
    return true;
  }

  if (!Number.isFinite(nowMs) || !Number.isFinite(minFrameMs) || minFrameMs <= 0) {
    return true;
  }

  return nowMs - lastDrawAtMs >= minFrameMs;
}

export function getAdvancedRendererDrawTime(
  nowMs: number,
  lastDrawAtMs: number | null,
  minFrameMs = MIN_RENDER_FRAME_MS,
): number {
  if (
    lastDrawAtMs === null ||
    !Number.isFinite(lastDrawAtMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(minFrameMs) ||
    minFrameMs <= 0
  ) {
    return nowMs;
  }

  const elapsedMs = nowMs - lastDrawAtMs;

  if (elapsedMs < minFrameMs) {
    return lastDrawAtMs;
  }

  return lastDrawAtMs + Math.floor(elapsedMs / minFrameMs) * minFrameMs;
}

export type PreviewTransform = {
  scale: number;
  xOffset: number;
  yOffset: number;
};

export type RenderSize = {
  width: number;
  height: number;
};

export type ClientBounds = Pick<DOMRect, "left" | "top" | "width" | "height">;

export type ViewportSize = {
  width: number;
  height: number;
};

export type QuestInspectMarker = {
  id: string;
  position: Position;
};

export type FullRenderVisualMovement = {
  direction: SpriteDirection;
  angleDegrees?: number;
  expiresAt: number;
};

export type FullRenderSignatureInput = {
  activeTeleport: ActiveTeleport | null;
  cameraOffset: Position;
  cellPixelSize: number;
  combatFeedbackEvents: CombatFeedbackEvent[];
  directCompanionCommandsById: Record<string, DirectCompanionCommand>;
  dropVisualEvents: DropVisualEvent[];
  enemyAoeChannelsByCasterId: Record<string, EnemyAoeChannelState>;
  entities: GameEntity[];
  leaderIntent: LeaderIntent | null;
  map: GameMap;
  partyIntent: PartyIntent | null;
  questGiverHasWork: boolean;
  questInspectMarkers: QuestInspectMarker[];
  renderSize: RenderSize;
  resurrectionProgressByCompanionId: Record<string, ResurrectionProgressState>;
  showDebugOverlays: boolean;
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  suppressMovePoiRing: boolean;
  teleportWorkingById: Record<string, boolean>;
  visualMovementByEntityId: Record<string, FullRenderVisualMovement>;
};

export type StableRendererFrameSkipInput = {
  hadTimedWork: boolean;
  hasTimedWork: boolean;
  lastDrawnTextureRevision: number | null;
  signatureUnchanged: boolean;
  textureRevision: number;
};

export function isStaticMapSpriteKey(key: string): boolean {
  return staticMapSpriteKeyPrefixes.some((prefix) => key.startsWith(prefix));
}

export type EntitySpriteLayout = {
  anchorX: number;
  anchorY: number;
  height: number;
  width: number;
};

type InteractableEntityKind = "enemy" | "resource" | "npc";

export type InteractableEntity = GameEntity & {
  kind: InteractableEntityKind;
};

export function getHealingFountainRenderDiameterPx(
  range: number,
  cellPixelSize: number,
): number {
  return range * 2 * cellPixelSize;
}

export function getTeleportIconSrc(
  isWorking = true,
  visualTheme: "default" | "slimeward" = "default",
): string {
  if (visualTheme === "slimeward") {
    return isWorking
      ? MAP_OBJECT_ICON_SRC.slimewardTeleportGood
      : MAP_OBJECT_ICON_SRC.slimewardTeleportBroken;
  }

  return isWorking
    ? MAP_OBJECT_ICON_SRC.teleportGood
    : MAP_OBJECT_ICON_SRC.teleportBroken;
}

export function collectAnimationFrames(
  animation:
    | SpriteAnimationAsset
    | Partial<Record<SpriteDirection, SpriteAnimationAsset>>,
) {
  if ("frames" in animation) {
    return animation.frames;
  }

  return Object.values(animation).flatMap((directionAnimation) =>
    directionAnimation?.frames ?? [],
  );
}

export function collectSpriteVisualAssetFrames(visualAsset: SpriteVisualAsset) {
  return [
    ...collectAnimationFrames(visualAsset.animations.idle),
    ...Object.values(visualAsset.animations.run).flatMap(
      (animation) => animation?.frames ?? [],
    ),
  ];
}

function collectEntityVisualTextureSrcs(entity: GameEntity, map: GameMap): string[] {
  const visualAsset = getEntityVisualAsset(entity, map.id);

  if (visualAsset.kind === "image") {
    return [visualAsset.src];
  }

  if (visualAsset.kind === "sprite") {
    return collectSpriteVisualAssetFrames(visualAsset);
  }

  return [];
}

function collectFullMapFloorTextureSrcs(map: GameMap): string[] {
  if (map.visualTheme === "slimeward-cave") {
    return [
      SLIMEWARD_DUNGEON_TILE_SRC.floorDamp,
      SLIMEWARD_DUNGEON_TILE_SRC.floorAzure,
      SLIMEWARD_DUNGEON_TILE_SRC.wall,
    ];
  }

  if (!isHubVisualMap(map.id) && !isWildernessVisualMap(map.id)) {
    return [];
  }

  const sources = new Set<string>();

  for (let y = 0; y < map.rows; y += floorChunkCellSpan) {
    for (let x = 0; x < map.columns; x += floorChunkCellSpan) {
      sources.add(
        isHubVisualMap(map.id)
          ? getHubFloorTileSrc({ x, y })
          : getWildernessFloorTileSrc({ x, y }, map),
      );
    }
  }

  return [...sources];
}

export function collectDurableVisualTextureSrcs(): Set<string> {
  const sources = new Set<string>([
    ...Object.values(NPC_ICON_SRC),
    ...Object.values(SHARED_SKILL_VISUAL_ICON_SRC),
    ...Object.values(SKILL_VISUAL_ICON_SRC).filter(
      (src): src is string => Boolean(src),
    ),
    blockImpactSrc,
    criticalHitBackingSrc,
    deathDownedPuffSrc,
    enemySpottedAlertSrc,
    healSparkleSrc,
    gatherCompleteSparkleSrc,
    inventoryFullWarningSrc,
    levelUpBurstSrc,
    missEvadePuffSrc,
    resourceDepletedPuffSrc,
    resourceHitHerbSrc,
    resourceHitOreSrc,
    resourceHitWoodSrc,
    shieldInvulnerableGlintSrc,
    teleportPulseSrc,
  ]);

  addEntityVisualAssetTextureSrcs(sources, entityVisualAssets.beginnerCharacter);
  addEntityVisualAssetTextureSrcs(sources, entityVisualAssets.testCharacter);
  addEntityVisualAssetTextureSrcs(sources, entityVisualAssets.questGuideCharacter);

  return sources;
}

export function collectCurrentMapVisualTextureSrcs(
  map: GameMap,
  entities: GameEntity[],
): string[] {
  const sources = new Set<string>([
    ...Object.values(MAP_OBJECT_ICON_SRC),
    ...collectFullMapFloorTextureSrcs(map),
  ]);

  if (isWildernessVisualMap(map.id)) {
    for (const wall of map.walls) {
      sources.add(getWildernessWallTileSrc(wall));
    }
  }

  if (isHubVisualMap(map.id)) {
    for (const src of Object.values(HUB_WALL_TILE_SRC)) {
      sources.add(src);
    }
  }

  for (const visualObject of map.visualObjects ?? []) {
    sources.add(MAP_VISUAL_OBJECT_SRC[visualObject.visualId]);
  }

  for (const entity of entities) {
    for (const src of collectEntityVisualTextureSrcs(entity, map)) {
      sources.add(src);
    }
  }

  return [...sources].sort();
}

export function collectCurrentMapScopedVisualTextureSrcs(
  map: GameMap,
  entities: GameEntity[],
): string[] {
  const durableSources = collectDurableVisualTextureSrcs();

  return collectCurrentMapVisualTextureSrcs(map, entities).filter(
    (src) => !durableSources.has(src),
  );
}

function addEntityVisualAssetTextureSrcs(
  sources: Set<string>,
  visualAsset: ReturnType<typeof getEntityVisualAsset>,
) {
  if (visualAsset.kind === "image") {
    sources.add(visualAsset.src);
    return;
  }

  if (visualAsset.kind === "sprite") {
    for (const src of collectSpriteVisualAssetFrames(visualAsset)) {
      sources.add(src);
    }
  }
}

export function isWildernessVisualMap(mapId: string | undefined): boolean {
  return Boolean(mapId && wildernessMapIds.has(mapId));
}

export function isHubVisualMap(mapId: string | undefined): boolean {
  return mapId === "hub";
}

export function getPreviewTransform(map: GameMap): PreviewTransform {
  const scale = Math.min(
    (previewWidth - previewPadding * 2) / map.columns,
    (previewHeight - previewPadding * 2) / map.rows,
  );
  const width = map.columns * scale;
  const height = map.rows * scale;

  return {
    scale,
    xOffset: (previewWidth - width) / 2,
    yOffset: (previewHeight - height) / 2,
  };
}

function getVisibleTileBounds({
  cameraOffset,
  cellPixelSize,
  map,
  renderSize,
  bufferTiles = 4,
}: {
  cameraOffset: Position;
  cellPixelSize: number;
  map: GameMap;
  renderSize: RenderSize;
  bufferTiles?: number;
}): TileBounds {
  return {
    minX: clamp(
      Math.floor(cameraOffset.x / cellPixelSize) - bufferTiles,
      0,
      map.columns - 1,
    ),
    maxX: clamp(
      Math.ceil((cameraOffset.x + renderSize.width) / cellPixelSize) +
        bufferTiles,
      0,
      map.columns - 1,
    ),
    minY: clamp(
      Math.floor(cameraOffset.y / cellPixelSize) - bufferTiles,
      0,
      map.rows - 1,
    ),
    maxY: clamp(
      Math.ceil((cameraOffset.y + renderSize.height) / cellPixelSize) +
        bufferTiles,
      0,
      map.rows - 1,
    ),
  };
}

export function getFullVisibleTileBounds({
  bufferTiles = 4,
  cameraOffset,
  cellPixelSize,
  map,
  renderSize,
}: {
  bufferTiles?: number;
  cameraOffset: Position;
  cellPixelSize: number;
  map: GameMap;
  renderSize: RenderSize;
}): TileBounds {
  return getVisibleTileBounds({
    bufferTiles,
    cameraOffset,
    cellPixelSize,
    map,
    renderSize,
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createVisibleFloorChunkPositions(bounds: TileBounds): Position[] {
  const chunks: Position[] = [];
  const startX =
    Math.floor(bounds.minX / floorChunkCellSpan) * floorChunkCellSpan;
  const startY =
    Math.floor(bounds.minY / floorChunkCellSpan) * floorChunkCellSpan;

  for (let y = startY; y <= bounds.maxY; y += floorChunkCellSpan) {
    for (let x = startX; x <= bounds.maxX; x += floorChunkCellSpan) {
      chunks.push({ x, y });
    }
  }

  return chunks;
}

export function isPositionInTileBounds(position: Position, bounds: TileBounds): boolean {
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

function isPositionInsideSubzoneBounds(
  position: Position,
  subzone: NonNullable<GameMap["subzones"]>[number],
): boolean {
  return (
    position.x >= subzone.bounds.x &&
    position.x < subzone.bounds.x + subzone.bounds.width &&
    position.y >= subzone.bounds.y &&
    position.y < subzone.bounds.y + subzone.bounds.height
  );
}

export function getWildernessFloorTileSrc(chunk: Position, map: GameMap): string {
  const wildernessFloorTiles = [
    WILDERNESS_MAP_TILE_SRC.grass128,
    WILDERNESS_MAP_TILE_SRC.grassDetail128,
    WILDERNESS_MAP_TILE_SRC.grassBackup128,
    WILDERNESS_MAP_TILE_SRC.grassFlowers128,
  ] as const;
  const chunkCenter = {
    x: chunk.x + floorChunkCellSpan / 2,
    y: chunk.y + floorChunkCellSpan / 2,
  };
  const subzoneIndex =
    map.subzones?.findIndex((subzone) =>
      isPositionInsideSubzoneBounds(chunkCenter, subzone),
    ) ?? -1;

  if (subzoneIndex >= 0) {
    return wildernessFloorTiles[subzoneIndex % wildernessFloorTiles.length];
  }

  return WILDERNESS_MAP_TILE_SRC.grass128;
}

export function getHubFloorTileSrc(chunk: Position): string {
  const isCityFloorChunk =
    chunk.x >= 28 &&
    chunk.x <= 80 &&
    chunk.y >= 12 &&
    chunk.y <= 48;

  return isCityFloorChunk ? HUB_MAP_TILE_SRC.stone128 : HUB_MAP_TILE_SRC.grass128;
}

function getWildernessWallTileKind(position: Position): "tree" | "bush" {
  return getCoordinateHash(position) % 10 === 0 ? "tree" : "bush";
}

export function getWildernessWallTileSrc(position: Position): string {
  return WILDERNESS_MAP_TILE_SRC[getWildernessWallTileKind(position)];
}

export function createHubWallKeySet(walls: Position[]): Set<string> {
  return new Set(walls.map(getHubWallKey));
}

function getHubWallKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function getHubWallTileSrc(
  position: Position,
  map: GameMap,
  wallKeys: Set<string>,
): string {
  const hasLeft = wallKeys.has(`${position.x - 1},${position.y}`);
  const hasRight = wallKeys.has(`${position.x + 1},${position.y}`);
  const hasUp = wallKeys.has(`${position.x},${position.y - 1}`);
  const hasDown = wallKeys.has(`${position.x},${position.y + 1}`);

  if ((hasLeft || hasRight) && !(hasUp || hasDown)) {
    return position.y < map.rows / 2
      ? HUB_WALL_TILE_SRC.north
      : HUB_WALL_TILE_SRC.south;
  }

  if ((hasUp || hasDown) && !(hasLeft || hasRight)) {
    return position.x < map.columns / 2
      ? HUB_WALL_TILE_SRC.west
      : HUB_WALL_TILE_SRC.east;
  }

  if (hasLeft || hasRight) {
    return position.y < map.rows / 2
      ? HUB_WALL_TILE_SRC.north
      : HUB_WALL_TILE_SRC.south;
  }

  return position.x < map.columns / 2
    ? HUB_WALL_TILE_SRC.west
    : HUB_WALL_TILE_SRC.east;
}

export function toPreviewPosition(position: Position, transform: PreviewTransform) {
  return {
    x: transform.xOffset + position.x * transform.scale,
    y: transform.yOffset + position.y * transform.scale,
  };
}

export function getPreviewMapPosition(
  clientPosition: Position,
  bounds: ClientBounds,
  map: GameMap,
): Position | null {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const transform = getPreviewTransform(map);
  const previewPosition = {
    x: ((clientPosition.x - bounds.left) / bounds.width) * previewWidth,
    y: ((clientPosition.y - bounds.top) / bounds.height) * previewHeight,
  };
  const mapWidth = map.columns * transform.scale;
  const mapHeight = map.rows * transform.scale;

  if (
    previewPosition.x < transform.xOffset ||
    previewPosition.x >= transform.xOffset + mapWidth ||
    previewPosition.y < transform.yOffset ||
    previewPosition.y >= transform.yOffset + mapHeight
  ) {
    return null;
  }

  const mapPosition = {
    x: Math.floor((previewPosition.x - transform.xOffset) / transform.scale),
    y: Math.floor((previewPosition.y - transform.yOffset) / transform.scale),
  };

  if (
    mapPosition.x < 0 ||
    mapPosition.x >= map.columns ||
    mapPosition.y < 0 ||
    mapPosition.y >= map.rows
  ) {
    return null;
  }

  return mapPosition;
}

export function isInteractableEntity(entity: GameEntity): entity is InteractableEntity {
  if (entity.kind === "enemy") {
    return entity.state !== "dead";
  }

  if (entity.kind === "resource") {
    return isActiveResource(entity);
  }

  return entity.kind === "npc";
}

export function shouldRenderEntity(entity: GameEntity): boolean {
  return entity.kind !== "resource" || isActiveResource(entity);
}

export function getPreviewRenderSignature({
  cameraOffset,
  cellPixelSize,
  entities,
  map,
  viewportSize,
}: {
  cameraOffset: Position;
  cellPixelSize: number;
  entities: GameEntity[];
  map: GameMap;
  viewportSize?: ViewportSize;
}): string {
  const wallSignature = map.walls
    .map((wall) => `${wall.x},${wall.y}`)
    .join(";");
  const teleportSignature = map.teleports
    .map(
      (teleport) =>
        `${teleport.id}:${teleport.position.x},${teleport.position.y}:${teleport.range}`,
    )
    .join(";");
  const fountainSignature = map.healingFountains
    .map(
      (fountain) =>
        `${fountain.id}:${fountain.position.x},${fountain.position.y}:${fountain.range}`,
    )
    .join(";");
  const subzoneSignature = (map.subzones ?? [])
    .map(
      (subzone) =>
        `${subzone.id}:${subzone.bounds.x},${subzone.bounds.y},${subzone.bounds.width},${subzone.bounds.height}`,
    )
    .join(";");
  const entitySignature = entities
    .filter(shouldRenderEntity)
    .map((entity) => {
      const resourceState =
        entity.kind === "resource" ? `:${entity.isDepleted ? "d" : "a"}` : "";

      return `${entity.id}:${entity.kind}:${entity.state}:${entity.position.x},${entity.position.y}${resourceState}`;
    })
    .sort()
    .join(";");

  return [
    map.id ?? "",
    map.debugName,
    map.columns,
    map.rows,
    map.visualTheme ?? "",
    wallSignature,
    teleportSignature,
    fountainSignature,
    subzoneSignature,
    entitySignature,
    cameraOffset.x,
    cameraOffset.y,
    cellPixelSize,
    viewportSize?.width ?? "",
    viewportSize?.height ?? "",
  ].join("|");
}

export function shouldSkipStableRendererFrame({
  hadTimedWork,
  hasTimedWork,
  lastDrawnTextureRevision,
  signatureUnchanged,
  textureRevision,
}: StableRendererFrameSkipInput): boolean {
  return (
    signatureUnchanged &&
    !hasTimedWork &&
    !hadTimedWork &&
    lastDrawnTextureRevision === textureRevision
  );
}

export function getFullRenderSignature({
  activeTeleport,
  cameraOffset,
  cellPixelSize,
  combatFeedbackEvents,
  directCompanionCommandsById,
  dropVisualEvents,
  enemyAoeChannelsByCasterId,
  entities,
  leaderIntent,
  map,
  partyIntent,
  questGiverHasWork,
  questInspectMarkers,
  renderSize,
  resurrectionProgressByCompanionId,
  showDebugOverlays,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  suppressMovePoiRing,
  teleportWorkingById,
  visualMovementByEntityId,
}: FullRenderSignatureInput): string {
  const visibleTileBounds = getFullVisibleTileBounds({
    cameraOffset,
    cellPixelSize,
    map,
    renderSize,
  });
  const visibleEntitySignature = entities
    .filter(
      (entity) =>
        shouldRenderEntity(entity) &&
        isPositionInTileBounds(entity.position, visibleTileBounds),
    )
    .map(getFullRenderEntitySignature)
    .sort()
    .join(";");

  return [
    map.id ?? "",
    map.debugName,
    map.columns,
    map.rows,
    map.visualTheme ?? "",
    map.walls.length,
    map.floorCells?.length ?? 0,
    getMapObjectSignature(map),
    getTileBoundsSignature(visibleTileBounds),
    getPositionSignature(cameraOffset),
    cellPixelSize,
    renderSize.width,
    renderSize.height,
    visibleEntitySignature,
    getIntentSignature(leaderIntent),
    getPartyRenderSignature(partyIntent),
    getActiveTeleportSignature(activeTeleport),
    getRecordSignature(teleportWorkingById, (_, isWorking) =>
      isWorking ? "1" : "0",
    ),
    getEventSignature(combatFeedbackEvents, getCombatFeedbackSignature),
    getEventSignature(dropVisualEvents, getDropVisualSignature),
    getRecordSignature(enemyAoeChannelsByCasterId, getEnemyAoeChannelSignature),
    getEventSignature(skillVisualEvents, getSkillVisualSignature),
    suppressMovePoiRing ? "move-ring-suppressed" : "move-ring-visible",
    getRecordSignature(skillBindsByEnemyId, getSkillBindSignature),
    getRecordSignature(skillMarksByEnemyId, getSkillMarkSignature),
    getRecordSignature(skillShieldBlocksById, getSkillShieldBlockSignature),
    getRecordSignature(
      resurrectionProgressByCompanionId,
      getResurrectionProgressSignature,
    ),
    getEventSignature(questInspectMarkers, getQuestInspectMarkerSignature),
    questGiverHasWork ? "quest-work" : "quest-idle",
    showDebugOverlays ? "debug-on" : "debug-off",
    showDebugOverlays
      ? getRecordSignature(directCompanionCommandsById, getDirectCommandSignature)
      : "",
    getRecordSignature(visualMovementByEntityId, getVisualMovementSignature),
    collectCurrentMapScopedVisualTextureSrcs(map, entities).join(";"),
  ].join("|");
}

function getFullRenderEntitySignature(entity: GameEntity): string {
  const baseSignature = [
    entity.id,
    entity.kind,
    entity.state,
    getPositionSignature(entity.position),
  ];

  if (entity.kind === "companion") {
    return [
      ...baseSignature,
      entity.classId,
      entity.role,
      entity.commandPriority,
      entity.health,
      entity.maxHealth,
      entity.currentTargetId ?? "",
      getPositionSignature(entity.defendPosition),
    ].join(":");
  }

  if (entity.kind === "enemy") {
    return [
      ...baseSignature,
      entity.aggressionMode,
      entity.archetypeId ?? "",
      entity.enemyTypeId ?? "",
      entity.variant ?? "",
      entity.isTargetDummy ? "dummy" : "",
      entity.health,
      entity.maxHealth,
      entity.currentTargetId ?? "",
      entity.level,
      entity.defeatedAtMs ?? "",
      entity.attackWindupStartedAt ?? "",
      entity.attackWindupDurationMs ?? "",
      entity.attackWindupTargetId ?? "",
    ].join(":");
  }

  if (entity.kind === "resource") {
    return [
      ...baseSignature,
      entity.resourceType,
      entity.tier,
      entity.durability,
      entity.maxDurability,
      entity.quantity,
      entity.isDepleted ? "depleted" : "active",
    ].join(":");
  }

  return [...baseSignature, entity.displayName, entity.npcRole].join(":");
}

function getMapObjectSignature(map: GameMap): string {
  return [
    map.teleports
      .map(
        (teleport) =>
          `${teleport.id}:${teleport.targetMapId}:${getPositionSignature(
            teleport.position,
          )}:${teleport.range}:${teleport.visualTheme ?? ""}`,
      )
      .sort()
      .join(";"),
    map.healingFountains
      .map(
        (fountain) =>
          `${fountain.id}:${getPositionSignature(fountain.position)}:${fountain.range}`,
      )
      .sort()
      .join(";"),
    (map.visualObjects ?? [])
      .map(
        (visualObject) =>
          `${visualObject.id}:${visualObject.visualId}:${getPositionSignature(
            visualObject.position,
          )}:${visualObject.widthCells}:${visualObject.heightCells}`,
      )
      .sort()
      .join(";"),
    (map.waypoints ?? [])
      .map(
        (waypoint) =>
          `${waypoint.id}:${getPositionSignature(waypoint.position)}`,
      )
      .sort()
      .join(";"),
  ].join("|");
}

function getTileBoundsSignature(bounds: TileBounds): string {
  return `${bounds.minX},${bounds.maxX},${bounds.minY},${bounds.maxY}`;
}

function getPositionSignature(position: Position | null | undefined): string {
  return position ? `${formatNumber(position.x)},${formatNumber(position.y)}` : "";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(3);
}

function getIntentSignature(intent: LeaderIntent | null): string {
  return intent
    ? `${intent.type}:${intent.source ?? ""}:${intent.targetId ?? ""}:${getPositionSignature(
        intent.targetPosition,
      )}`
    : "";
}

function getPartyRenderSignature(partyIntent: PartyIntent | null): string {
  if (!partyIntent) {
    return "";
  }

  const recoveryThreatEnemyIds = Array.isArray(
    partyIntent.recoveryIntent?.threatEnemyIds,
  )
    ? partyIntent.recoveryIntent.threatEnemyIds
    : [];

  return [
    partyIntent.mode,
    partyIntent.source,
    getIntentSignature(partyIntent.executionIntent),
    partyIntent.recoveryIntent
      ? `${partyIntent.recoveryIntent.action}:${partyIntent.recoveryIntent.deadCompanionId}:${recoveryThreatEnemyIds.join(",")}`
      : "",
  ].join(":");
}

function getActiveTeleportSignature(activeTeleport: ActiveTeleport | null): string {
  return activeTeleport
    ? `${activeTeleport.id}:${getPositionSignature(activeTeleport.position)}:${
        activeTeleport.range
      }:${activeTeleport.sourceMapId}:${activeTeleport.targetMapId}:${
        activeTeleport.triggeredBy
      }`
    : "";
}

function getRecordSignature<T>(
  record: Record<string, T> | null | undefined,
  getValueSignature: (key: string, value: T) => string,
): string {
  return Object.entries(record ?? {})
    .filter((entry): entry is [string, T] => entry[1] !== null && entry[1] !== undefined)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([key, value]) => `${key}:${getValueSignature(key, value)}`)
    .join(";");
}

function getEventSignature<T extends { id: string }>(
  events: T[] | null | undefined,
  getValueSignature: (event: T) => string,
): string {
  return (events ?? [])
    .filter((event): event is T => Boolean(event?.id))
    .map((event) => `${event.id}:${getValueSignature(event)}`)
    .sort()
    .join(";");
}

function getCombatFeedbackSignature(event: CombatFeedbackEvent): string {
  return [
    event.type,
    event.feedbackKind ?? "",
    event.entityId,
    event.sourceEntityId ?? "",
    event.targetEntityId ?? "",
    event.text,
    event.amount ?? "",
    event.createdAt,
    event.expiresAt,
  ].join(":");
}

function getDropVisualSignature(event: DropVisualEvent): string {
  return [
    event.kind ?? "",
    event.enemyId,
    event.itemId ?? "",
    event.displayName ?? "",
    event.iconRole ?? "",
    event.quantity,
    getPositionSignature(event.position),
    event.createdAt,
    event.expiresAt,
    event.currentMapId ?? "",
  ].join(":");
}

function getEnemyAoeChannelSignature(
  _casterId: string,
  channel: EnemyAoeChannelState,
): string {
  return [
    channel.id,
    channel.abilityId,
    channel.phase,
    getPositionSignature(channel.shape.center),
    channel.shape.radius,
    channel.startedAt,
    channel.channelEndsAt,
    channel.windupEndsAt,
  ].join(":");
}

function getSkillVisualSignature(event: SkillVisualEvent): string {
  return [
    event.type,
    event.skillId ?? "",
    event.sourceId,
    event.targetId ?? "",
    getPositionSignature(event.position),
    event.createdAt,
    event.expiresAt,
  ].join(":");
}

function getSkillBindSignature(_enemyId: string, bind: SkillBindState): string {
  return `${bind.sourceId}:${bind.targetId}:${bind.expiresAt}`;
}

function getSkillMarkSignature(_enemyId: string, mark: SkillMarkState): string {
  return `${mark.sourceId}:${mark.targetId}:${mark.bonusDamage}:${mark.expiresAt}`;
}

function getSkillShieldBlockSignature(
  _shieldId: string,
  shield: SkillShieldBlockState,
): string {
  return [
    shield.ownerId,
    getPositionSignature(shield.position),
    shield.rotationRadians,
    shield.expiresAt,
    shield.remainingBlocks,
    shield.blockedDamageTypes?.join(",") ?? "",
  ].join(":");
}

function getResurrectionProgressSignature(
  _companionId: string,
  progress: ResurrectionProgressState,
): string {
  return `${progress.companionId}:${progress.progressMs}:${progress.requiredMs}`;
}

function getQuestInspectMarkerSignature(marker: QuestInspectMarker): string {
  return getPositionSignature(marker.position);
}

function getDirectCommandSignature(
  _companionId: string,
  command: DirectCompanionCommand,
): string {
  return [
    command.type,
    command.companionId,
    command.type === "move" ? "" : command.targetId,
    getPositionSignature(command.targetPosition),
    command.issuedAt,
  ].join(":");
}

function getVisualMovementSignature(
  _entityId: string,
  movement: FullRenderVisualMovement,
): string {
  return `${movement.direction}:${movement.angleDegrees ?? ""}:${movement.expiresAt}`;
}

export function getNearestInteractableEntity({
  cellPixelSize,
  entities,
  map,
  mapPosition,
}: {
  cellPixelSize: number;
  entities: GameEntity[];
  map: GameMap;
  mapPosition: Position;
}): InteractableEntity | null {
  const priorities: InteractableEntityKind[] = ["npc", "resource", "enemy"];
  const maximumDistanceSquared =
    fullModeInteractionRadius * fullModeInteractionRadius;

  for (const kind of priorities) {
    const nearest = entities
      .filter(
        (entity): entity is InteractableEntity =>
          entity.kind === kind && isInteractableEntity(entity),
      )
      .map((entity) => {
        const hit = getEntityPointerHit({
          cellPixelSize,
          entity,
          map,
          mapPosition,
        });

        return hit ? { ...hit, entity } : null;
      })
      .filter(
        (
          candidate,
        ): candidate is {
          distanceSquared: number;
          entity: InteractableEntity;
        } => Boolean(candidate),
      )
      .filter((candidate) => candidate.distanceSquared <= maximumDistanceSquared)
      .sort(
        (first, second) =>
          first.distanceSquared - second.distanceSquared ||
          first.entity.id.localeCompare(second.entity.id),
      )[0]?.entity;

    if (nearest) {
      return nearest;
    }
  }

  return null;
}

export function getNearestHoverEntity({
  cellPixelSize,
  entities,
  map,
  mapPosition,
}: {
  cellPixelSize: number;
  entities: GameEntity[];
  map: GameMap;
  mapPosition: Position;
}): GameEntity | null {
  const priorities: Array<GameEntity["kind"]> = [
    "npc",
    "companion",
    "resource",
    "enemy",
  ];
  const maximumDistanceSquared =
    fullModeInteractionRadius * fullModeInteractionRadius;

  for (const kind of priorities) {
    const nearest = entities
      .filter((entity) => entity.kind === kind && shouldRenderEntity(entity))
      .map((entity) => {
        const hit = getEntityPointerHit({
          cellPixelSize,
          entity,
          map,
          mapPosition,
        });

        return hit ? { ...hit, entity } : null;
      })
      .filter(
        (
          candidate,
        ): candidate is {
          distanceSquared: number;
          entity: GameEntity;
        } => Boolean(candidate),
      )
      .filter((candidate) => candidate.distanceSquared <= maximumDistanceSquared)
      .sort(
        (first, second) =>
          first.distanceSquared - second.distanceSquared ||
          first.entity.id.localeCompare(second.entity.id),
      )[0]?.entity;

    if (nearest) {
      return nearest;
    }
  }

  return null;
}

export function getEntityPointerHit({
  cellPixelSize,
  entity,
  map,
  mapPosition,
}: {
  cellPixelSize: number;
  entity: GameEntity;
  map: GameMap;
  mapPosition: Position;
}): { distanceSquared: number } | null {
  const isContentBoundsHit = isInsideImageContentBounds(
    entity,
    map,
    mapPosition,
    cellPixelSize,
  );

  if (!isContentBoundsHit && hasImageContentBounds(entity, map)) {
    return null;
  }

  const anchorXDistance = mapPosition.x - entity.position.x;
  const anchorYDistance = mapPosition.y - entity.position.y;
  const centerXDistance = mapPosition.x - (entity.position.x + 0.5);
  const centerYDistance = mapPosition.y - (entity.position.y + 0.5);
  const anchorDistanceSquared =
    anchorXDistance * anchorXDistance + anchorYDistance * anchorYDistance;
  const centerDistanceSquared =
    centerXDistance * centerXDistance + centerYDistance * centerYDistance;

  return {
    distanceSquared: isContentBoundsHit
      ? 0
      : Math.min(anchorDistanceSquared, centerDistanceSquared),
  };
}

function hasImageContentBounds(entity: GameEntity, map: GameMap): boolean {
  const visualAsset = getEntityVisualAsset(entity, map.id);

  return Boolean(visualAsset.kind === "image" && visualAsset.contentBounds);
}

function isInsideImageContentBounds(
  entity: GameEntity,
  map: GameMap,
  mapPosition: Position,
  cellPixelSize: number,
): boolean {
  const visualAsset = getEntityVisualAsset(entity, map.id);

  if (visualAsset.kind !== "image" || !visualAsset.contentBounds) {
    return false;
  }

  const layout = getEntitySpriteLayout(entity, cellPixelSize, visualAsset);
  const scaleX = visualAsset.naturalSize
    ? layout.width / visualAsset.naturalSize.width
    : 1;
  const scaleY = visualAsset.naturalSize
    ? layout.height / visualAsset.naturalSize.height
    : 1;
  const anchorWorldPixel = {
    x: entity.position.x * cellPixelSize + cellPixelSize / 2,
    y: entity.position.y * cellPixelSize + cellPixelSize,
  };
  const spriteTopLeft = {
    x: anchorWorldPixel.x - layout.anchorX * layout.width,
    y: anchorWorldPixel.y - layout.anchorY * layout.height,
  };
  const contentLeft = spriteTopLeft.x + visualAsset.contentBounds.x * scaleX;
  const contentTop = spriteTopLeft.y + visualAsset.contentBounds.y * scaleY;
  const contentRight =
    contentLeft + visualAsset.contentBounds.width * scaleX;
  const contentBottom =
    contentTop + visualAsset.contentBounds.height * scaleY;
  const mapPixelPosition = {
    x: mapPosition.x * cellPixelSize,
    y: mapPosition.y * cellPixelSize,
  };

  return (
    mapPixelPosition.x >= contentLeft &&
    mapPixelPosition.x <= contentRight &&
    mapPixelPosition.y >= contentTop &&
    mapPixelPosition.y <= contentBottom
  );
}

export function getEntitySpriteLayout(
  entity: GameEntity,
  cellPixelSize: number,
  visualAsset: ReturnType<typeof getEntityVisualAsset>,
): EntitySpriteLayout {
  if (entity.kind === "enemy") {
    const naturalSize =
      visualAsset.kind === "image" || visualAsset.kind === "sprite"
        ? visualAsset.naturalSize
        : undefined;
    const variantScale = isSuperiorEnemy(entity)
      ? SUPERIOR_ENEMY_RENDER_SCALE
      : 1;

    return {
      anchorX: 0.5,
      anchorY: entity.enemyTypeId === "azure_mass" ? 0.5 : 0.7,
      width: (naturalSize?.width ?? cellPixelSize * 2.25) * variantScale,
      height: (naturalSize?.height ?? cellPixelSize * 2.25) * variantScale,
    };
  }

  if (visualAsset.kind === "image" && visualAsset.naturalSize) {
    return {
      anchorX: getImageContentAnchorX(visualAsset),
      anchorY: getImageContentAnchorY(visualAsset),
      width: visualAsset.naturalSize.width,
      height: visualAsset.naturalSize.height,
    };
  }

  if (
    entity.kind === "npc" &&
    visualAsset.kind === "sprite" &&
    visualAsset.naturalSize
  ) {
    return {
      anchorX: 0.5,
      anchorY: 1,
      width: visualAsset.naturalSize.width,
      height: visualAsset.naturalSize.height,
    };
  }

  if (visualAsset.kind === "sprite" && visualAsset.naturalSize) {
    return {
      anchorX: 0.5,
      anchorY: 0.5,
      width: visualAsset.naturalSize.width,
      height: visualAsset.naturalSize.height,
    };
  }

  if (entity.kind === "resource") {
    return {
      anchorX: 0.5,
      anchorY: 1,
      width: cellPixelSize * 1.2,
      height: cellPixelSize * 1.2,
    };
  }

  if (entity.kind === "npc") {
    return {
      anchorX: 0.5,
      anchorY: 1,
      width: cellPixelSize * 1.7,
      height: cellPixelSize * 1.7,
    };
  }

  return {
    anchorX: 0.5,
    anchorY: 1,
    width: cellPixelSize * 2.25,
    height: cellPixelSize * 2.25,
  };
}

function getImageContentAnchorX(visualAsset: ImageVisualAsset): number {
  if (!visualAsset.naturalSize || !visualAsset.contentBounds) {
    return 0.5;
  }

  return (
    (visualAsset.contentBounds.x + visualAsset.contentBounds.width / 2) /
    visualAsset.naturalSize.width
  );
}

function getImageContentAnchorY(visualAsset: ImageVisualAsset): number {
  if (!visualAsset.naturalSize || !visualAsset.contentBounds) {
    return 1;
  }

  return (
    (visualAsset.contentBounds.y + visualAsset.contentBounds.height) /
    visualAsset.naturalSize.height
  );
}

export function getEnemyNameplateText(
  enemy: Extract<GameEntity, { kind: "enemy" }>,
): string {
  const enemyType = getEnemyType(enemy.enemyTypeId);
  const archetype = getEnemyArchetype(enemy.archetypeId);
  const displayName =
    enemyType?.displayName ??
    archetype?.displayName ??
    (enemy.id === aoeTargetDummyId ? "AoE Dummy" : undefined) ??
    (enemy.isTargetDummy ? "Target Dummy" : "Enemy");
  const variantPrefix = isSuperiorEnemy(enemy) ? "Superior " : "";

  return `${variantPrefix}${displayName} Lv ${enemy.level}`;
}

export function getEnemyNameplateColor(
  enemy: Extract<GameEntity, { kind: "enemy" }>,
): number {
  return enemy.aggressionMode === "aggressive"
    ? aggressiveEnemyNameplateColor
    : passiveEnemyNameplateColor;
}

export function isDamageNumberFeedback(event: CombatFeedbackEvent): boolean {
  return event.type === "damage" && /^-\d+ HP$/.test(event.text);
}

export function isHealingNumberFeedback(event: CombatFeedbackEvent): boolean {
  return event.type === "heal" && /^\+\d+ HP$/.test(event.text);
}

export function getCombatFeedbackLaneKey(event: CombatFeedbackEvent): string {
  const feedbackKind = event.feedbackKind ?? event.type;

  if (
    event.amount !== undefined &&
    (isDamageNumberFeedback(event) || isHealingNumberFeedback(event))
  ) {
    return [
      "feedback-lane",
      event.targetEntityId ?? event.entityId,
      event.sourceEntityId ?? "unknown-source",
      feedbackKind,
      event.damageType ?? "none",
    ].join(":");
  }

  return ["feedback-event", event.id, event.type].join(":");
}

export function shouldDrawCombatFeedbackEvent(
  event: CombatFeedbackEvent,
  entity: GameEntity,
): boolean {
  if (event.type === "enemy_spotted" || event.type === "level_up") {
    return false;
  }

  if (event.type === "attack" && event.text === "Attack") {
    return false;
  }

  if (event.type === "death" && entity.kind === "enemy") {
    return false;
  }

  return true;
}

export function getCombatFeedbackLifetimeProgress(
  event: CombatFeedbackEvent,
  currentTime: number,
): number {
  const duration = event.expiresAt - event.createdAt;

  if (duration <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, (currentTime - event.createdAt) / duration));
}

export function getLevelUpBurstPresentation(
  event: CombatFeedbackEvent,
  currentTime: number,
): { alpha: number; scale: number } {
  const progress = getCombatFeedbackLifetimeProgress(event, currentTime);

  return {
    alpha: 1 - progress * 0.7,
    scale: 1 + progress,
  };
}
