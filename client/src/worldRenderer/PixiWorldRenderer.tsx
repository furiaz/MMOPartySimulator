import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import {
  HUB_MAP_TILE_SRC,
  INVENTORY_ITEM_ICON_SRC,
  MAP_OBJECT_ICON_SRC,
  SHARED_SKILL_VISUAL_ICON_SRC,
  SKILL_VISUAL_ICON_SRC,
  WILDERNESS_MAP_TILE_SRC,
} from "../assetIcons";
import type {
  ActiveTeleport,
  CombatFeedbackEvent,
  DropVisualEvent,
  GameEntity,
  GameMap,
  LeaderIntent,
  Position,
  ResurrectionProgressState,
  SkillBindState,
  SkillMarkState,
  SkillShieldBlockState,
  SkillVisualEvent,
} from "../game";
import { getItemDefinition, QUEST_GIVER_POI_ID } from "../game";
import {
  entityVisualAssets,
  getEntityVisualAsset,
  getSpriteAnimation,
  type SpriteAnimationAsset,
  type SpriteDirection,
  type SpriteVisualAsset,
} from "../visualAssets";

const previewWidth = 256;
const previewHeight = 144;
const previewPadding = 8;
const defaultCellPixelSize = 32;
const floorChunkCellSpan = 4;
const wildernessMapIds = new Set(["map-1", "map-2", "map-3", "map-4"]);

type PixiRendererMode = "preview" | "full";

type ViewportSize = {
  width: number;
  height: number;
};

type PixiWorldRendererProps = {
  activeTeleport?: ActiveTeleport | null;
  cameraOffset?: Position;
  cellPixelSize?: number;
  combatFeedbackEvents?: CombatFeedbackEvent[];
  currentTime: number;
  dropVisualEvents?: DropVisualEvent[];
  entities: GameEntity[];
  leaderIntent?: LeaderIntent | null;
  map: GameMap;
  mode?: PixiRendererMode;
  onEnemyClick?: (enemyId: string) => void;
  onFloorClick?: (position: Position) => void;
  onNpcClick?: (npcId: string) => void;
  onResourceClick?: (resourceId: string) => void;
  resurrectionProgressByCompanionId?: Record<string, ResurrectionProgressState>;
  questGiverHasWork?: boolean;
  showDebugOverlays?: boolean;
  skillBindsByEnemyId?: Record<string, SkillBindState>;
  skillMarksByEnemyId?: Record<string, SkillMarkState>;
  skillShieldBlocksById?: Record<string, SkillShieldBlockState>;
  skillVisualEvents?: SkillVisualEvent[];
  viewportSize?: ViewportSize;
  visualMovementByEntityId?: Record<string, EntityVisualMovement>;
};

type EntityVisualMovement = {
  direction: SpriteDirection;
  expiresAt: number;
};

type PreviewTransform = {
  scale: number;
  xOffset: number;
  yOffset: number;
};

type FullTransform = {
  cameraOffset: Position;
  cellPixelSize: number;
};

type RenderSize = {
  width: number;
  height: number;
};

type TileBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type PixiRenderLayers = {
  backgroundGraphics: Graphics;
  entityLayer: Container;
  effectsLayer: Container;
  fallbackGraphics: Graphics;
  floorLayer: Container;
  objectLayer: Container;
  overlayGraphics: Graphics;
  wallLayer: Container;
};

type TextureCache = {
  failedSrcs: Set<string>;
  lastEntitySpriteSrcById: Map<string, string>;
  pendingSrcs: Set<string>;
  textures: Map<string, Texture>;
};

type InteractableEntityKind = "enemy" | "resource" | "npc";

type InteractableEntity = GameEntity & {
  kind: InteractableEntityKind;
};

type DrawWorldOptions = {
  activeTeleport: ActiveTeleport | null;
  cameraOffset: Position;
  cellPixelSize: number;
  combatFeedbackEvents: CombatFeedbackEvent[];
  currentTime: number;
  dropVisualEvents: DropVisualEvent[];
  entities: GameEntity[];
  leaderIntent: LeaderIntent | null;
  layers: PixiRenderLayers;
  map: GameMap;
  mode: PixiRendererMode;
  questGiverHasWork: boolean;
  requestRedraw?: () => void;
  renderSize: RenderSize;
  resurrectionProgressByCompanionId: Record<string, ResurrectionProgressState>;
  showDebugOverlays: boolean;
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  textureCache: TextureCache;
  viewportSize?: ViewportSize;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
};

const fullModeInteractionRadius = 1.5;

function createTextureCache(): TextureCache {
  return {
    failedSrcs: new Set<string>(),
    lastEntitySpriteSrcById: new Map<string, string>(),
    pendingSrcs: new Set<string>(),
    textures: new Map<string, Texture>(),
  };
}

function clearLayer(layer: Container) {
  layer.removeChildren().forEach((child) => {
    child.destroy();
  });
}

function clearLayers(layers: PixiRenderLayers) {
  clearLayer(layers.floorLayer);
  clearLayer(layers.wallLayer);
  clearLayer(layers.objectLayer);
  clearLayer(layers.entityLayer);
  clearLayer(layers.effectsLayer);
  layers.backgroundGraphics.clear();
  layers.fallbackGraphics.clear();
  layers.overlayGraphics.clear();
}

function requestTexture(
  src: string,
  cache: TextureCache,
  requestRedraw?: () => void,
): Texture | null {
  const cachedTexture = cache.textures.get(src);

  if (cachedTexture) {
    return cachedTexture;
  }

  if (cache.failedSrcs.has(src) || cache.pendingSrcs.has(src)) {
    return null;
  }

  cache.pendingSrcs.add(src);
  void Assets.load<Texture>(src)
    .then((texture) => {
      cache.pendingSrcs.delete(src);
      cache.textures.set(src, texture);
      requestRedraw?.();
    })
    .catch(() => {
      cache.pendingSrcs.delete(src);
      cache.failedSrcs.add(src);
      requestRedraw?.();
    });

  return null;
}

function createSprite(
  src: string,
  cache: TextureCache,
  requestRedraw?: () => void,
): Sprite | null {
  const texture = requestTexture(src, cache, requestRedraw);

  return texture ? new Sprite(texture) : null;
}

function collectAnimationFrames(
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

function collectSpriteVisualAssetFrames(visualAsset: SpriteVisualAsset) {
  return [
    ...collectAnimationFrames(visualAsset.animations.idle),
    ...Object.values(visualAsset.animations.run).flatMap(
      (animation) => animation?.frames ?? [],
    ),
  ];
}

function preloadSpriteVisualAssetTextures(
  visualAsset: SpriteVisualAsset,
  cache: TextureCache,
  requestRedraw?: () => void,
) {
  for (const src of new Set(collectSpriteVisualAssetFrames(visualAsset))) {
    requestTexture(src, cache, requestRedraw);
  }
}

function isWildernessVisualMap(mapId: string | undefined): boolean {
  return Boolean(mapId && wildernessMapIds.has(mapId));
}

function isHubVisualMap(mapId: string | undefined): boolean {
  return mapId === "hub";
}

function getPreviewTransform(map: GameMap): PreviewTransform {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createVisibleFloorChunkPositions(bounds: TileBounds): Position[] {
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

function getWildernessFloorTileSrc(chunk: Position, map: GameMap): string {
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

function getHubFloorTileSrc(chunk: Position): string {
  const isCityFloorChunk =
    chunk.x >= 12 &&
    chunk.x <= 34 &&
    chunk.y >= 6 &&
    chunk.y <= 18;

  return isCityFloorChunk ? HUB_MAP_TILE_SRC.stone128 : HUB_MAP_TILE_SRC.grass128;
}

function getWildernessWallTileKind(position: Position): "tree" | "bush" {
  return getCoordinateHash(position) % 10 === 0 ? "tree" : "bush";
}

function getWildernessWallTileSrc(position: Position): string {
  return WILDERNESS_MAP_TILE_SRC[getWildernessWallTileKind(position)];
}

function getRenderSize(
  mode: PixiRendererMode,
  viewportSize: ViewportSize | undefined,
): RenderSize {
  if (mode === "full") {
    return {
      width: Math.max(1, viewportSize?.width ?? window.innerWidth),
      height: Math.max(1, viewportSize?.height ?? window.innerHeight),
    };
  }

  return {
    width: previewWidth,
    height: previewHeight,
  };
}

function toPreviewPosition(position: Position, transform: PreviewTransform) {
  return {
    x: transform.xOffset + position.x * transform.scale,
    y: transform.yOffset + position.y * transform.scale,
  };
}

function toFullPosition(position: Position, transform: FullTransform) {
  return {
    x:
      position.x * transform.cellPixelSize -
      transform.cameraOffset.x +
      transform.cellPixelSize / 2,
    y:
      position.y * transform.cellPixelSize -
      transform.cameraOffset.y +
      transform.cellPixelSize / 2,
  };
}

function getFullMapPosition(
  clientPosition: Position,
  bounds: DOMRect,
  transform: FullTransform,
): Position {
  return {
    x:
      (clientPosition.x - bounds.left + transform.cameraOffset.x) /
      transform.cellPixelSize,
    y:
      (clientPosition.y - bounds.top + transform.cameraOffset.y) /
      transform.cellPixelSize,
  };
}

function getFloorPosition(position: Position): Position {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
  };
}

function getMapFloorColor(map: GameMap): number {
  if (map.id === "hub") {
    return 0x7b9a47;
  }

  return 0x6c982e;
}

function getEntityColor(entity: GameEntity): number {
  if (entity.kind === "companion") {
    return entity.state === "dead" ? 0x64748b : 0x2563eb;
  }

  if (entity.kind === "enemy") {
    return entity.state === "dead" ? 0x7f1d1d : 0xdc2626;
  }

  if (entity.kind === "resource") {
    return entity.isDepleted ? 0x713f12 : 0x16a34a;
  }

  return 0xfacc15;
}

function getEntityHealthPercent(entity: GameEntity): number | null {
  if (!("health" in entity) || !("maxHealth" in entity) || entity.maxHealth <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, entity.health / entity.maxHealth));
}

function isInteractableEntity(entity: GameEntity): entity is InteractableEntity {
  if (entity.kind === "enemy") {
    return entity.state !== "dead";
  }

  if (entity.kind === "resource") {
    return !entity.isDepleted;
  }

  return entity.kind === "npc";
}

function getNearestInteractableEntity(
  entities: GameEntity[],
  mapPosition: Position,
): InteractableEntity | null {
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
        const anchorXDistance = mapPosition.x - entity.position.x;
        const anchorYDistance = mapPosition.y - entity.position.y;
        const centerXDistance = mapPosition.x - (entity.position.x + 0.5);
        const centerYDistance = mapPosition.y - (entity.position.y + 0.5);
        const anchorDistanceSquared =
          anchorXDistance * anchorXDistance + anchorYDistance * anchorYDistance;
        const centerDistanceSquared =
          centerXDistance * centerXDistance + centerYDistance * centerYDistance;

        return {
          distanceSquared: Math.min(anchorDistanceSquared, centerDistanceSquared),
          entity,
        };
      })
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

function drawPoiRing(
  graphics: Graphics,
  position: Position,
  transform: FullTransform,
  color: number,
) {
  const center = toFullPosition(position, transform);
  const radius = transform.cellPixelSize * 0.64;

  graphics
    .circle(center.x, center.y, radius)
    .stroke({ color, alpha: 0.85, width: 3 });
  graphics
    .circle(center.x, center.y, radius + 5)
    .stroke({ color, alpha: 0.32, width: 2 });
}

function drawHealthBar(
  graphics: Graphics,
  entity: GameEntity,
  transform: FullTransform,
) {
  const healthPercent = getEntityHealthPercent(entity);

  if (healthPercent === null) {
    return;
  }

  const center = toFullPosition(entity.position, transform);
  const width = transform.cellPixelSize * 0.72;
  const height = 4;
  const x = center.x - width / 2;
  const y = center.y - transform.cellPixelSize * 0.48;
  const healthColor = healthPercent > 0.45 ? 0x22c55e : 0xef4444;

  graphics.rect(x, y, width, height).fill({ color: 0x0f172a, alpha: 0.9 });
  graphics.rect(x, y, width * healthPercent, height).fill(healthColor);
}

function drawFallbackEntity(
  graphics: Graphics,
  entity: GameEntity,
  transform: FullTransform,
) {
  const entityPosition = toFullPosition(entity.position, transform);
  const entityRadius = Math.max(8, transform.cellPixelSize * 0.33);

  graphics
    .circle(entityPosition.x, entityPosition.y, entityRadius)
    .fill(getEntityColor(entity));
}

function drawImageSprite({
  alpha = 1,
  anchorX = 0.5,
  anchorY = 1,
  cache,
  height,
  layer,
  position,
  requestRedraw,
  src,
  width,
}: {
  alpha?: number;
  anchorX?: number;
  anchorY?: number;
  cache: TextureCache;
  height: number;
  layer: Container;
  position: Position;
  requestRedraw?: () => void;
  src: string;
  width: number;
}): boolean {
  const sprite = createSprite(src, cache, requestRedraw);

  if (!sprite) {
    return false;
  }

  sprite.anchor.set(anchorX, anchorY);
  sprite.alpha = alpha;
  sprite.position.set(position.x, position.y);
  sprite.width = width;
  sprite.height = height;
  layer.addChild(sprite);

  return true;
}

function getEntitySpriteSrc({
  currentTime,
  entity,
  map,
  visualMovementByEntityId,
}: {
  currentTime: number;
  entity: GameEntity;
  map: GameMap;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}): string | null {
  const visualAsset = getEntityVisualAsset(entity, map.id);

  if (visualAsset.kind === "image") {
    return visualAsset.src;
  }

  if (visualAsset.kind === "sprite") {
    const visualMovement = visualMovementByEntityId[entity.id];
    const isVisuallyMoving =
      Boolean(visualMovement) && visualMovement.expiresAt > currentTime;
    const animation = getSpriteAnimation(
      visualAsset,
      isVisuallyMoving,
      visualMovement?.direction,
    );

    if (animation.frames.length === 0) {
      return null;
    }

    const frameIndex =
      Math.floor(currentTime / animation.frameDurationMs) %
      animation.frames.length;

    return animation.frames[frameIndex] ?? null;
  }

  return null;
}

function getEntityIdleSpriteSrc(entity: GameEntity, map: GameMap): string | null {
  const visualAsset = getEntityVisualAsset(entity, map.id);

  if (visualAsset.kind === "image") {
    return visualAsset.src;
  }

  if (visualAsset.kind === "sprite") {
    const animation = getSpriteAnimation(visualAsset, false);

    return animation.frames[0] ?? null;
  }

  return null;
}

function getEntitySpriteSize(entity: GameEntity, cellPixelSize: number) {
  if (entity.kind === "resource") {
    return {
      width: cellPixelSize * 1.2,
      height: cellPixelSize * 1.2,
    };
  }

  if (entity.kind === "npc") {
    return {
      width: cellPixelSize * 1.7,
      height: cellPixelSize * 1.7,
    };
  }

  return {
    width: cellPixelSize * 2.25,
    height: cellPixelSize * 2.25,
  };
}

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

function createFeedbackText({
  color,
  fontSize = 11,
  text,
}: {
  color: number;
  fontSize?: number;
  text: string;
}) {
  const label = new Text({
    text,
    style: {
      align: "center",
      fill: color,
      fontFamily: "Arial, sans-serif",
      fontSize,
      fontWeight: "700",
      stroke: { color: 0xffffff, width: 3 },
    },
  });

  label.anchor.set(0.5);

  return label;
}

function getEntityById(entities: GameEntity[]) {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function drawSkillLink(
  graphics: Graphics,
  source: GameEntity,
  target: GameEntity,
  transform: FullTransform,
  color: number,
  width: number,
) {
  const sourcePosition = toFullPosition(source.position, transform);
  const targetPosition = toFullPosition(target.position, transform);

  graphics
    .moveTo(sourcePosition.x, sourcePosition.y)
    .lineTo(targetPosition.x, targetPosition.y)
    .stroke({ color, alpha: 0.72, width });
}

function drawFullEffects({
  cache,
  combatFeedbackEvents,
  currentTime,
  dropVisualEvents,
  entities,
  layer,
  map,
  requestRedraw,
  resurrectionProgressByCompanionId,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  transform,
}: {
  cache: TextureCache;
  combatFeedbackEvents: CombatFeedbackEvent[];
  currentTime: number;
  dropVisualEvents: DropVisualEvent[];
  entities: GameEntity[];
  layer: Container;
  map: GameMap;
  requestRedraw?: () => void;
  resurrectionProgressByCompanionId: Record<string, ResurrectionProgressState>;
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  transform: FullTransform;
}) {
  const graphics = new Graphics();
  const entitiesById = getEntityById(entities);

  layer.addChild(graphics);

  for (const shield of Object.values(skillShieldBlocksById)) {
    if (shield.expiresAt <= currentTime || shield.id.endsWith("-guard_up")) {
      continue;
    }

    const position = toFullPosition(shield.position, transform);

    const shieldGraphic = new Graphics();
    shieldGraphic
      .rect(-12, -5, 24, 10)
      .fill({ color: 0x7dd3fc, alpha: 0.34 })
      .stroke({ color: 0x38bdf8, alpha: 0.9, width: 2 });
    shieldGraphic.position.set(position.x, position.y);
    shieldGraphic.rotation = shield.rotationRadians;
    layer.addChild(shieldGraphic);
  }

  for (const event of skillVisualEvents) {
    if (event.expiresAt <= currentTime) {
      continue;
    }

    const source = entitiesById.get(event.sourceId);
    const target = event.targetId ? entitiesById.get(event.targetId) : undefined;

    if (!source) {
      continue;
    }

    const iconSrc = getSkillVisualIconSrc(event);
    const spritePosition =
      event.type === "heal" && target
        ? target.position
        : event.position ?? source.position;
    const center = toFullPosition(spritePosition, transform);

    if (event.type === "red_flash") {
      graphics
        .circle(center.x, center.y, transform.cellPixelSize * 0.74)
        .stroke({ color: 0xef4444, alpha: 0.86, width: 3 });
    }

    if (event.type === "heal") {
      graphics
        .circle(center.x, center.y, transform.cellPixelSize * 0.78)
        .stroke({ color: 0xfacc15, alpha: 0.82, width: 3 });
    }

    if (iconSrc) {
      const didDraw = drawImageSprite({
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 50,
        layer,
        position: center,
        requestRedraw,
        src: iconSrc,
        width: 50,
      });

      if (didDraw) {
        continue;
      }
    }

    if ((event.type === "projectile" || event.type === "heal") && target) {
      drawSkillLink(
        graphics,
        source,
        target,
        transform,
        event.type === "heal" ? 0xfacc15 : 0x60a5fa,
        event.type === "heal" ? 8 : 3,
      );
    } else if (event.type === "slash") {
      graphics
        .arc(
          center.x,
          center.y,
          transform.cellPixelSize * 0.55,
          Math.PI * 1.08,
          Math.PI * 1.9,
        )
        .stroke({ color: 0xf97316, alpha: 0.9, width: 3 });
    }
  }

  for (const event of dropVisualEvents) {
    if (
      event.expiresAt <= currentTime ||
      (event.currentMapId && event.currentMapId !== map.id)
    ) {
      continue;
    }

    const duration = event.expiresAt - event.createdAt;
    const progress =
      duration > 0
        ? Math.min(1, Math.max(0, (currentTime - event.createdAt) / duration))
        : 1;
    const position = toFullPosition(
      {
        x: event.position.x,
        y: event.position.y - progress * 2,
      },
      transform,
    );
    const itemDefinition = getItemDefinition(event.itemId);
    const iconSrc = INVENTORY_ITEM_ICON_SRC[event.itemId];
    const dropColor =
      itemDefinition.category === "equipment" ? 0x7c3aed : 0x047857;

    graphics
      .roundRect(position.x - 13, position.y - 13, 26, 26, 6)
      .fill({ color: 0xffffff, alpha: 0.94 * (1 - progress) })
      .stroke({ color: dropColor, alpha: 1 - progress, width: 2 });

    if (iconSrc) {
      drawImageSprite({
        alpha: 1 - progress,
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 22,
        layer,
        position,
        requestRedraw,
        src: iconSrc,
        width: 22,
      });
    } else {
      const label = createFeedbackText({
        color: 0x111827,
        fontSize: 13,
        text: itemDefinition.displayName.charAt(0),
      });

      label.alpha = 1 - progress;
      label.position.set(position.x, position.y);
      layer.addChild(label);
    }
  }

  for (const entity of entities) {
    const center = toFullPosition(entity.position, transform);

    if (entity.kind === "enemy" && skillMarksByEnemyId[entity.id]?.expiresAt > currentTime) {
      graphics
        .rect(center.x - 4, center.y - transform.cellPixelSize * 0.72, 8, 8)
        .fill(0xef4444)
        .stroke({ color: 0x7f1d1d, alpha: 1, width: 1 });
    }

    if (entity.kind === "enemy" && skillBindsByEnemyId[entity.id]?.expiresAt > currentTime) {
      graphics
        .circle(center.x, center.y, transform.cellPixelSize * 0.58)
        .fill({ color: 0xfacc15, alpha: 0.16 })
        .stroke({ color: 0xfacc15, alpha: 0.82, width: 2 });
    }

    if (entity.kind === "companion" && entity.state === "idle") {
      const label = createFeedbackText({
        color: 0x475569,
        fontSize: 10,
        text: "AFK",
      });

      label.position.set(
        center.x + transform.cellPixelSize * 0.62,
        center.y + transform.cellPixelSize * 0.3,
      );
      layer.addChild(label);
    }

    if (entity.kind === "companion") {
      const progress = resurrectionProgressByCompanionId[entity.id];

      if (progress && progress.progressMs > 0) {
        const progressRatio = Math.min(1, progress.progressMs / progress.requiredMs);
        const width = 76;
        const height = 20;
        const x = center.x - width / 2;
        const y = center.y - transform.cellPixelSize * 1.25;

        graphics
          .roundRect(x, y, width, height, 5)
          .fill({ color: 0xf0fdf4, alpha: 0.96 })
          .stroke({ color: 0x14532d, alpha: 1, width: 1 });
        graphics
          .roundRect(x + 5, y + 12, width - 10, 4, 2)
          .fill(0xbbf7d0);
        graphics
          .roundRect(x + 5, y + 12, (width - 10) * progressRatio, 4, 2)
          .fill(0x16a34a);

        const label = createFeedbackText({
          color: 0x14532d,
          fontSize: 10,
          text: "Resurrecting",
        });

        label.position.set(center.x, y + 7);
        layer.addChild(label);
      }
    }
  }

  for (const event of combatFeedbackEvents) {
    if (event.expiresAt <= currentTime) {
      continue;
    }

    const entity = entitiesById.get(event.entityId);

    if (!entity) {
      continue;
    }

    const center = toFullPosition(entity.position, transform);
    const colorByType = {
      attack: 0x1d4ed8,
      damage: 0xb91c1c,
      death: 0x111827,
      gather: 0x047857,
      heal: 0x047857,
    } satisfies Record<CombatFeedbackEvent["type"], number>;
    const label = createFeedbackText({
      color: colorByType[event.type],
      text: event.text,
    });
    const yOffset = event.type === "attack" ? -34 : -18;

    label.position.set(center.x, center.y + yOffset);
    layer.addChild(label);
  }
}

function drawFullFloor({
  backgroundGraphics,
  cache,
  layer,
  map,
  renderSize,
  requestRedraw,
  transform,
}: {
  backgroundGraphics: Graphics;
  cache: TextureCache;
  layer: Container;
  map: GameMap;
  renderSize: RenderSize;
  requestRedraw?: () => void;
  transform: FullTransform;
}) {
  const mapPixelWidth = map.columns * transform.cellPixelSize;
  const mapPixelHeight = map.rows * transform.cellPixelSize;
  const mapX = -transform.cameraOffset.x;
  const mapY = -transform.cameraOffset.y;
  const visibleTileBounds = getVisibleTileBounds({
    cameraOffset: transform.cameraOffset,
    cellPixelSize: transform.cellPixelSize,
    map,
    renderSize,
  });
  const useImageFloorTiles =
    isHubVisualMap(map.id) || isWildernessVisualMap(map.id);

  backgroundGraphics
    .rect(mapX, mapY, mapPixelWidth, mapPixelHeight)
    .fill(getMapFloorColor(map));

  if (!useImageFloorTiles) {
    return;
  }

  for (const chunk of createVisibleFloorChunkPositions(visibleTileBounds)) {
    const floorTileSrc = isHubVisualMap(map.id)
      ? getHubFloorTileSrc(chunk)
      : getWildernessFloorTileSrc(chunk, map);
    const floorPosition = {
      x: chunk.x * transform.cellPixelSize - transform.cameraOffset.x,
      y: chunk.y * transform.cellPixelSize - transform.cameraOffset.y,
    };
    const floorSize = transform.cellPixelSize * floorChunkCellSpan;
    const didDraw = drawImageSprite({
      anchorX: 0,
      anchorY: 0,
      cache,
      height: floorSize,
      layer,
      position: floorPosition,
      requestRedraw,
      src: floorTileSrc,
      width: floorSize,
    });

    if (!didDraw) {
      backgroundGraphics
        .rect(floorPosition.x, floorPosition.y, floorSize, floorSize)
        .fill(getMapFloorColor(map));
    }
  }
}

function drawFullWalls({
  cache,
  fallbackGraphics,
  layer,
  map,
  renderSize,
  requestRedraw,
  transform,
}: {
  cache: TextureCache;
  fallbackGraphics: Graphics;
  layer: Container;
  map: GameMap;
  renderSize: RenderSize;
  requestRedraw?: () => void;
  transform: FullTransform;
}) {
  const visibleTileBounds = getVisibleTileBounds({
    cameraOffset: transform.cameraOffset,
    cellPixelSize: transform.cellPixelSize,
    map,
    renderSize,
  });

  for (const wall of map.walls) {
    if (!isPositionInTileBounds(wall, visibleTileBounds)) {
      continue;
    }

    const wallX = wall.x * transform.cellPixelSize - transform.cameraOffset.x;
    const wallY = wall.y * transform.cellPixelSize - transform.cameraOffset.y;

    if (isWildernessVisualMap(map.id)) {
      const wallKind = getWildernessWallTileKind(wall);
      const didDraw = drawImageSprite({
        cache,
        height:
          wallKind === "tree"
            ? transform.cellPixelSize * 2.25
            : transform.cellPixelSize * 1.32,
        layer,
        position: {
          x: wallX + transform.cellPixelSize / 2,
          y: wallY + transform.cellPixelSize,
        },
        requestRedraw,
        src: getWildernessWallTileSrc(wall),
        width:
          wallKind === "tree"
            ? transform.cellPixelSize * 2.25
            : transform.cellPixelSize * 1.32,
      });

      if (didDraw) {
        continue;
      }
    }

    fallbackGraphics
      .rect(wallX, wallY, transform.cellPixelSize, transform.cellPixelSize)
      .fill(0x1f2937);
  }
}

function drawFullMapObjects({
  cache,
  fallbackGraphics,
  layer,
  map,
  requestRedraw,
  transform,
}: {
  cache: TextureCache;
  fallbackGraphics: Graphics;
  layer: Container;
  map: GameMap;
  requestRedraw?: () => void;
  transform: FullTransform;
}) {
  const objectSize = transform.cellPixelSize * 1.55;

  for (const teleport of map.teleports) {
    const teleportPosition = toFullPosition(teleport.position, transform);
    const didDraw = drawImageSprite({
      cache,
      height: objectSize,
      layer,
      position: teleportPosition,
      requestRedraw,
      src: MAP_OBJECT_ICON_SRC.teleportPoint,
      width: objectSize,
    });

    if (!didDraw) {
      fallbackGraphics
        .circle(teleportPosition.x, teleportPosition.y, objectSize * 0.34)
        .fill(0x9333ea);
    }
  }

  for (const fountain of map.healingFountains) {
    const fountainPosition = toFullPosition(fountain.position, transform);
    const didDraw = drawImageSprite({
      cache,
      height: objectSize,
      layer,
      position: fountainPosition,
      requestRedraw,
      src: MAP_OBJECT_ICON_SRC.healingFountain,
      width: objectSize,
    });

    if (!didDraw) {
      fallbackGraphics
        .circle(fountainPosition.x, fountainPosition.y, objectSize * 0.34)
        .fill(0x38bdf8);
    }
  }
}

function drawFullEntities({
  cache,
  currentTime,
  entities,
  fallbackGraphics,
  layer,
  map,
  requestRedraw,
  transform,
  visualMovementByEntityId,
}: {
  cache: TextureCache;
  currentTime: number;
  entities: GameEntity[];
  fallbackGraphics: Graphics;
  layer: Container;
  map: GameMap;
  requestRedraw?: () => void;
  transform: FullTransform;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}) {
  const sortedByY = [...entities].sort(
    (first, second) =>
      first.position.y - second.position.y || first.id.localeCompare(second.id),
  );

  for (const entity of sortedByY) {
    const spriteSrc = getEntitySpriteSrc({
      currentTime,
      entity,
      map,
      visualMovementByEntityId,
    });
    const idleSpriteSrc = getEntityIdleSpriteSrc(entity, map);
    const entityPosition = toFullPosition(entity.position, transform);
    const size = getEntitySpriteSize(entity, transform.cellPixelSize);
    let didDraw = spriteSrc
      ? drawImageSprite({
          alpha: entity.kind === "enemy" && entity.state === "dead" ? 0.45 : 1,
          cache,
          height: size.height,
          layer,
          position: {
            x: entityPosition.x,
            y: entityPosition.y + transform.cellPixelSize / 2,
          },
          requestRedraw,
          src: spriteSrc,
          width: size.width,
        })
      : false;

    if (didDraw && spriteSrc) {
      cache.lastEntitySpriteSrcById.set(entity.id, spriteSrc);
    }

    if (!didDraw) {
      const lastSpriteSrc = cache.lastEntitySpriteSrcById.get(entity.id);

      if (lastSpriteSrc && lastSpriteSrc !== spriteSrc) {
        didDraw = drawImageSprite({
          alpha: entity.kind === "enemy" && entity.state === "dead" ? 0.45 : 1,
          cache,
          height: size.height,
          layer,
          position: {
            x: entityPosition.x,
            y: entityPosition.y + transform.cellPixelSize / 2,
          },
          requestRedraw,
          src: lastSpriteSrc,
          width: size.width,
        });
      }
    }

    if (!didDraw && idleSpriteSrc && idleSpriteSrc !== spriteSrc) {
      didDraw = drawImageSprite({
        alpha: entity.kind === "enemy" && entity.state === "dead" ? 0.45 : 1,
        cache,
        height: size.height,
        layer,
        position: {
          x: entityPosition.x,
          y: entityPosition.y + transform.cellPixelSize / 2,
        },
        requestRedraw,
        src: idleSpriteSrc,
        width: size.width,
      });

      if (didDraw) {
        cache.lastEntitySpriteSrcById.set(entity.id, idleSpriteSrc);
      }
    }

    if (!didDraw) {
      drawFallbackEntity(fallbackGraphics, entity, transform);
    }
  }
}

function drawQuestGiverMarker(
  layer: Container,
  entities: GameEntity[],
  transform: FullTransform,
  questGiverHasWork: boolean,
) {
  if (!questGiverHasWork) {
    return;
  }

  const questGiver = entities.find(
    (entity) => entity.kind === "npc" && entity.id === QUEST_GIVER_POI_ID,
  );

  if (!questGiver) {
    return;
  }

  const position = toFullPosition(questGiver.position, transform);
  const badgeRadius = Math.max(8, transform.cellPixelSize * 0.25);
  const marker = new Container();
  const badge = new Graphics();
  const label = new Text({
    text: "!",
    style: {
      align: "center",
      fill: 0x451a03,
      fontFamily: "Arial, sans-serif",
      fontSize: Math.max(12, transform.cellPixelSize * 0.38),
      fontWeight: "800",
      stroke: { color: 0xfef3c7, width: 2 },
    },
  });

  badge
    .circle(0, 0, badgeRadius)
    .fill(0xfacc15)
    .stroke({ color: 0x92400e, alpha: 1, width: 1 });
  badge
    .circle(0, 0, badgeRadius + 2)
    .stroke({ color: 0xfacc15, alpha: 0.28, width: 4 });
  label.anchor.set(0.5);
  label.position.set(0, -1);
  marker.position.set(
    position.x + transform.cellPixelSize * 0.48,
    position.y - transform.cellPixelSize * 0.58,
  );
  marker.addChild(badge, label);
  layer.addChild(marker);
}

function drawPreviewMap(
  graphics: Graphics,
  map: GameMap,
  entities: GameEntity[],
  {
    cameraOffset,
    cellPixelSize,
    viewportSize,
  }: {
    cameraOffset: Position;
    cellPixelSize: number;
    viewportSize?: ViewportSize;
  },
) {
  const transform = getPreviewTransform(map);
  const mapWidth = map.columns * transform.scale;
  const mapHeight = map.rows * transform.scale;
  const entityRadius = Math.max(2, transform.scale * 1.8);

  graphics.clear();
  graphics.rect(0, 0, previewWidth, previewHeight).fill(0x0f172a);
  graphics
    .rect(transform.xOffset, transform.yOffset, mapWidth, mapHeight)
    .fill(getMapFloorColor(map));

  for (const subzone of map.subzones ?? []) {
    graphics
      .rect(
        transform.xOffset + subzone.bounds.x * transform.scale,
        transform.yOffset + subzone.bounds.y * transform.scale,
        subzone.bounds.width * transform.scale,
        subzone.bounds.height * transform.scale,
      )
      .stroke({ color: 0xd9f99d, alpha: 0.55, width: 1 });
  }

  for (const wall of map.walls) {
    const wallPosition = toPreviewPosition(wall, transform);

    graphics
      .rect(wallPosition.x, wallPosition.y, transform.scale, transform.scale)
      .fill(0x1f2937);
  }

  for (const teleport of map.teleports) {
    const teleportPosition = toPreviewPosition(teleport.position, transform);

    graphics.circle(teleportPosition.x, teleportPosition.y, entityRadius + 1).fill(0x9333ea);
  }

  for (const fountain of map.healingFountains) {
    const fountainPosition = toPreviewPosition(fountain.position, transform);

    graphics.circle(fountainPosition.x, fountainPosition.y, entityRadius + 1).fill(0x38bdf8);
  }

  for (const entity of entities) {
    const entityPosition = toPreviewPosition(entity.position, transform);

    graphics
      .circle(entityPosition.x, entityPosition.y, entityRadius)
      .fill(getEntityColor(entity));
  }

  if (viewportSize) {
    const mapLeft = transform.xOffset;
    const mapTop = transform.yOffset;
    const mapRight = mapLeft + mapWidth;
    const mapBottom = mapTop + mapHeight;
    const viewportLeft =
      mapLeft + (cameraOffset.x / cellPixelSize) * transform.scale;
    const viewportTop =
      mapTop + (cameraOffset.y / cellPixelSize) * transform.scale;
    const viewportRight =
      viewportLeft + (viewportSize.width / cellPixelSize) * transform.scale;
    const viewportBottom =
      viewportTop + (viewportSize.height / cellPixelSize) * transform.scale;
    const clampedLeft = clamp(viewportLeft, mapLeft, mapRight);
    const clampedTop = clamp(viewportTop, mapTop, mapBottom);
    const clampedRight = clamp(viewportRight, mapLeft, mapRight);
    const clampedBottom = clamp(viewportBottom, mapTop, mapBottom);

    if (clampedRight > clampedLeft && clampedBottom > clampedTop) {
      graphics
        .rect(
          clampedLeft,
          clampedTop,
          clampedRight - clampedLeft,
          clampedBottom - clampedTop,
        )
        .stroke({ color: 0xfacc15, alpha: 0.9, width: 1 });
    }
  }
}

function drawFullMap({
  activeTeleport,
  cameraOffset,
  cellPixelSize,
  combatFeedbackEvents,
  currentTime,
  dropVisualEvents,
  entities,
  leaderIntent,
  layers,
  map,
  questGiverHasWork,
  requestRedraw,
  renderSize,
  resurrectionProgressByCompanionId,
  showDebugOverlays,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  textureCache,
  visualMovementByEntityId,
}: {
  activeTeleport: ActiveTeleport | null;
  cameraOffset: Position;
  cellPixelSize: number;
  combatFeedbackEvents: CombatFeedbackEvent[];
  currentTime: number;
  dropVisualEvents: DropVisualEvent[];
  entities: GameEntity[];
  leaderIntent: LeaderIntent | null;
  layers: PixiRenderLayers;
  map: GameMap;
  questGiverHasWork: boolean;
  requestRedraw?: () => void;
  renderSize: RenderSize;
  resurrectionProgressByCompanionId: Record<string, ResurrectionProgressState>;
  showDebugOverlays: boolean;
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  textureCache: TextureCache;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}) {
  const transform: FullTransform = {
    cameraOffset,
    cellPixelSize,
  };
  const overlayGraphics = layers.overlayGraphics;
  const backgroundGraphics = layers.backgroundGraphics;
  const fallbackGraphics = layers.fallbackGraphics;

  clearLayers(layers);
  backgroundGraphics.rect(0, 0, renderSize.width, renderSize.height).fill(0x0f172a);
  drawFullFloor({
    backgroundGraphics,
    cache: textureCache,
    layer: layers.floorLayer,
    map,
    renderSize,
    requestRedraw,
    transform,
  });
  drawFullWalls({
    cache: textureCache,
    fallbackGraphics,
    layer: layers.wallLayer,
    map,
    renderSize,
    requestRedraw,
    transform,
  });
  drawFullMapObjects({
    cache: textureCache,
    fallbackGraphics,
    layer: layers.objectLayer,
    map,
    requestRedraw,
    transform,
  });
  drawFullEntities({
    cache: textureCache,
    currentTime,
    entities,
    fallbackGraphics,
    layer: layers.entityLayer,
    map,
    requestRedraw,
    transform,
    visualMovementByEntityId,
  });
  drawFullEffects({
    cache: textureCache,
    combatFeedbackEvents,
    currentTime,
    dropVisualEvents,
    entities,
    layer: layers.effectsLayer,
    map,
    requestRedraw,
    resurrectionProgressByCompanionId,
    skillBindsByEnemyId,
    skillMarksByEnemyId,
    skillShieldBlocksById,
    skillVisualEvents,
    transform,
  });
  drawQuestGiverMarker(
    layers.effectsLayer,
    entities,
    transform,
    questGiverHasWork,
  );

  if (showDebugOverlays) {
    for (const subzone of map.subzones ?? []) {
      overlayGraphics
        .rect(
          subzone.bounds.x * cellPixelSize - cameraOffset.x,
          subzone.bounds.y * cellPixelSize - cameraOffset.y,
          subzone.bounds.width * cellPixelSize,
          subzone.bounds.height * cellPixelSize,
        )
        .stroke({ color: 0xd9f99d, alpha: 0.42, width: 2 });
    }
  }

  if (activeTeleport) {
    const activeTeleportPosition = toFullPosition(activeTeleport.position, transform);

    overlayGraphics
      .circle(
        activeTeleportPosition.x,
        activeTeleportPosition.y,
        activeTeleport.range * cellPixelSize,
      )
      .stroke({ color: 0xa855f7, alpha: 0.55, width: 3 });
  }

  for (const entity of entities) {
    drawHealthBar(overlayGraphics, entity, transform);
  }

  const targetEntity = leaderIntent?.targetId
    ? entities.find((entity) => entity.id === leaderIntent.targetId)
    : undefined;

  if (leaderIntent?.type === "move" && leaderIntent.targetPosition) {
    drawPoiRing(overlayGraphics, leaderIntent.targetPosition, transform, 0xfacc15);
  } else if (targetEntity) {
    drawPoiRing(overlayGraphics, targetEntity.position, transform, 0xf97316);
  }
}

function drawWorld({
  activeTeleport,
  cameraOffset,
  cellPixelSize,
  combatFeedbackEvents,
  currentTime,
  dropVisualEvents,
  entities,
  leaderIntent,
  layers,
  map,
  mode,
  questGiverHasWork,
  requestRedraw,
  renderSize,
  resurrectionProgressByCompanionId,
  showDebugOverlays,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  textureCache,
  viewportSize,
  visualMovementByEntityId,
}: DrawWorldOptions) {
  if (mode === "full") {
    drawFullMap({
      activeTeleport,
      cameraOffset,
      cellPixelSize,
      combatFeedbackEvents,
      currentTime,
      dropVisualEvents,
      entities,
      leaderIntent,
      layers,
      map,
      questGiverHasWork,
      requestRedraw,
      renderSize,
      resurrectionProgressByCompanionId,
      showDebugOverlays,
      skillBindsByEnemyId,
      skillMarksByEnemyId,
      skillShieldBlocksById,
      skillVisualEvents,
      textureCache,
      visualMovementByEntityId,
    });
    return;
  }

  clearLayers(layers);
  drawPreviewMap(layers.overlayGraphics, map, entities, {
    cameraOffset,
    cellPixelSize,
    viewportSize,
  });
}

export function PixiWorldRenderer({
  activeTeleport = null,
  cameraOffset = { x: 0, y: 0 },
  cellPixelSize = defaultCellPixelSize,
  combatFeedbackEvents = [],
  currentTime,
  dropVisualEvents = [],
  entities,
  leaderIntent = null,
  map,
  mode = "preview",
  onEnemyClick,
  onFloorClick,
  onNpcClick,
  onResourceClick,
  resurrectionProgressByCompanionId = {},
  questGiverHasWork = false,
  showDebugOverlays = false,
  skillBindsByEnemyId = {},
  skillMarksByEnemyId = {},
  skillShieldBlocksById = {},
  skillVisualEvents = [],
  viewportSize,
  visualMovementByEntityId = {},
}: PixiWorldRendererProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<PixiRenderLayers | null>(null);
  const appliedRenderSizeRef = useRef<RenderSize | null>(null);
  const requestRedrawRef = useRef<() => void>(() => {});
  const textureCacheRef = useRef(createTextureCache());
  const latestCameraOffsetRef = useRef(cameraOffset);
  const latestCellPixelSizeRef = useRef(cellPixelSize);
  const latestCombatFeedbackEventsRef = useRef(combatFeedbackEvents);
  const latestCurrentTimeRef = useRef(currentTime);
  const latestDropVisualEventsRef = useRef(dropVisualEvents);
  const latestActiveTeleportRef = useRef<ActiveTeleport | null>(activeTeleport);
  const latestMapRef = useRef(map);
  const latestEntitiesRef = useRef<GameEntity[]>(entities);
  const latestLeaderIntentRef = useRef<LeaderIntent | null>(leaderIntent);
  const latestModeRef = useRef(mode);
  const latestQuestGiverHasWorkRef = useRef(questGiverHasWork);
  const latestRenderSizeRef = useRef(getRenderSize(mode, viewportSize));
  const latestViewportSizeRef = useRef(viewportSize);
  const latestResurrectionProgressByCompanionIdRef = useRef(
    resurrectionProgressByCompanionId,
  );
  const latestShowDebugOverlaysRef = useRef(showDebugOverlays);
  const latestSkillBindsByEnemyIdRef = useRef(skillBindsByEnemyId);
  const latestSkillMarksByEnemyIdRef = useRef(skillMarksByEnemyId);
  const latestSkillShieldBlocksByIdRef = useRef(skillShieldBlocksById);
  const latestSkillVisualEventsRef = useRef(skillVisualEvents);
  const latestVisualMovementByEntityIdRef = useRef(visualMovementByEntityId);
  const renderSize = useMemo(
    () => getRenderSize(mode, viewportSize),
    [mode, viewportSize],
  );
  const sortedEntities = useMemo(
    () => [...entities].sort((first, second) => first.id.localeCompare(second.id)),
    [entities],
  );

  useEffect(() => {
    latestActiveTeleportRef.current = activeTeleport;
    latestCameraOffsetRef.current = cameraOffset;
    latestCellPixelSizeRef.current = cellPixelSize;
    latestCombatFeedbackEventsRef.current = combatFeedbackEvents;
    latestCurrentTimeRef.current = currentTime;
    latestDropVisualEventsRef.current = dropVisualEvents;
    latestMapRef.current = map;
    latestEntitiesRef.current = sortedEntities;
    latestLeaderIntentRef.current = leaderIntent;
    latestModeRef.current = mode;
    latestQuestGiverHasWorkRef.current = questGiverHasWork;
    latestRenderSizeRef.current = renderSize;
    latestViewportSizeRef.current = viewportSize;
    latestResurrectionProgressByCompanionIdRef.current =
      resurrectionProgressByCompanionId;
    latestShowDebugOverlaysRef.current = showDebugOverlays;
    latestSkillBindsByEnemyIdRef.current = skillBindsByEnemyId;
    latestSkillMarksByEnemyIdRef.current = skillMarksByEnemyId;
    latestSkillShieldBlocksByIdRef.current = skillShieldBlocksById;
    latestSkillVisualEventsRef.current = skillVisualEvents;
    latestVisualMovementByEntityIdRef.current = visualMovementByEntityId;
  }, [
    activeTeleport,
    cameraOffset,
    cellPixelSize,
    combatFeedbackEvents,
    currentTime,
    dropVisualEvents,
    leaderIntent,
    map,
    mode,
    questGiverHasWork,
    renderSize,
    resurrectionProgressByCompanionId,
    showDebugOverlays,
    skillBindsByEnemyId,
    skillMarksByEnemyId,
    skillShieldBlocksById,
    skillVisualEvents,
    sortedEntities,
    viewportSize,
    visualMovementByEntityId,
  ]);

  useEffect(() => {
    let isDisposed = false;
    let isInitialized = false;
    let scheduledRedrawFrame: number | null = null;
    const app = new Application();
    const stage = new Container();
    const layers: PixiRenderLayers = {
      backgroundGraphics: new Graphics(),
      entityLayer: new Container(),
      effectsLayer: new Container(),
      fallbackGraphics: new Graphics(),
      floorLayer: new Container(),
      objectLayer: new Container(),
      overlayGraphics: new Graphics(),
      wallLayer: new Container(),
    };

    function cancelScheduledRedraw() {
      if (scheduledRedrawFrame === null) {
        return;
      }

      window.cancelAnimationFrame(scheduledRedrawFrame);
      scheduledRedrawFrame = null;
    }

    function redrawLatestWorld() {
      if (isDisposed || !isInitialized || !layersRef.current) {
        return;
      }

      drawWorld({
        activeTeleport: latestActiveTeleportRef.current,
        cameraOffset: latestCameraOffsetRef.current,
        cellPixelSize: latestCellPixelSizeRef.current,
        combatFeedbackEvents: latestCombatFeedbackEventsRef.current,
        currentTime: latestCurrentTimeRef.current,
        dropVisualEvents: latestDropVisualEventsRef.current,
        entities: latestEntitiesRef.current,
        layers: layersRef.current,
        leaderIntent: latestLeaderIntentRef.current,
        map: latestMapRef.current,
        mode: latestModeRef.current,
        questGiverHasWork: latestQuestGiverHasWorkRef.current,
        renderSize: latestRenderSizeRef.current,
        requestRedraw: requestRedrawRef.current,
        resurrectionProgressByCompanionId:
          latestResurrectionProgressByCompanionIdRef.current,
        showDebugOverlays: latestShowDebugOverlaysRef.current,
        skillBindsByEnemyId: latestSkillBindsByEnemyIdRef.current,
        skillMarksByEnemyId: latestSkillMarksByEnemyIdRef.current,
        skillShieldBlocksById: latestSkillShieldBlocksByIdRef.current,
        skillVisualEvents: latestSkillVisualEventsRef.current,
        textureCache: textureCacheRef.current,
        viewportSize: latestViewportSizeRef.current,
        visualMovementByEntityId: latestVisualMovementByEntityIdRef.current,
      });
    }

    function scheduleRedraw() {
      if (isDisposed || scheduledRedrawFrame !== null) {
        return;
      }

      scheduledRedrawFrame = window.requestAnimationFrame(() => {
        scheduledRedrawFrame = null;
        redrawLatestWorld();
      });
    }

    requestRedrawRef.current = scheduleRedraw;
    preloadSpriteVisualAssetTextures(
      entityVisualAssets.testCharacter,
      textureCacheRef.current,
      requestRedrawRef.current,
    );

    async function initPixiApp() {
      await app.init({
        antialias: false,
        autoDensity: true,
        backgroundAlpha: 0,
        height: latestRenderSizeRef.current.height,
        resolution: window.devicePixelRatio || 1,
        width: latestRenderSizeRef.current.width,
      });
      isInitialized = true;

      if (isDisposed || !hostRef.current) {
        app.destroy(true, { children: true });
        return;
      }

      app.stage.addChild(stage);
      stage.addChild(layers.backgroundGraphics);
      stage.addChild(layers.floorLayer);
      stage.addChild(layers.wallLayer);
      stage.addChild(layers.objectLayer);
      stage.addChild(layers.entityLayer);
      stage.addChild(layers.fallbackGraphics);
      stage.addChild(layers.effectsLayer);
      stage.addChild(layers.overlayGraphics);
      hostRef.current.appendChild(app.canvas);
      appRef.current = app;
      layersRef.current = layers;
      appliedRenderSizeRef.current = latestRenderSizeRef.current;
      redrawLatestWorld();
    }

    void initPixiApp();

    return () => {
      isDisposed = true;
      cancelScheduledRedraw();
      requestRedrawRef.current = () => {};
      appRef.current = null;
      layersRef.current = null;
      appliedRenderSizeRef.current = null;
      if (isInitialized) {
        app.destroy(true, { children: true });
      }
    };
  }, []);

  useEffect(() => {
    if (!layersRef.current) {
      return;
    }

    const appliedRenderSize = appliedRenderSizeRef.current;

    if (
      appRef.current &&
      (!appliedRenderSize ||
        appliedRenderSize.width !== renderSize.width ||
        appliedRenderSize.height !== renderSize.height)
    ) {
      appRef.current.renderer.resize(renderSize.width, renderSize.height);
      appliedRenderSizeRef.current = renderSize;
    }

    drawWorld({
      activeTeleport,
      cameraOffset,
      cellPixelSize,
      combatFeedbackEvents,
      currentTime,
      dropVisualEvents,
      entities: sortedEntities,
      layers: layersRef.current,
      leaderIntent,
      map,
      mode,
      questGiverHasWork,
      requestRedraw: requestRedrawRef.current,
      renderSize,
      resurrectionProgressByCompanionId,
      showDebugOverlays,
      skillBindsByEnemyId,
      skillMarksByEnemyId,
      skillShieldBlocksById,
      skillVisualEvents,
      textureCache: textureCacheRef.current,
      viewportSize,
      visualMovementByEntityId,
    });
  }, [
    activeTeleport,
    cameraOffset,
    cellPixelSize,
    combatFeedbackEvents,
    currentTime,
    dropVisualEvents,
    leaderIntent,
    map,
    mode,
    questGiverHasWork,
    renderSize,
    resurrectionProgressByCompanionId,
    showDebugOverlays,
    skillBindsByEnemyId,
    skillMarksByEnemyId,
    skillShieldBlocksById,
    skillVisualEvents,
    sortedEntities,
    viewportSize,
    visualMovementByEntityId,
  ]);

  function handleRendererClick(event: MouseEvent<HTMLDivElement>) {
    if (mode !== "full") {
      return;
    }

    event.stopPropagation();

    const bounds = event.currentTarget.getBoundingClientRect();
    const mapPosition = getFullMapPosition(
      { x: event.clientX, y: event.clientY },
      bounds,
      {
        cameraOffset,
        cellPixelSize,
      },
    );
    const entity = getNearestInteractableEntity(sortedEntities, mapPosition);

    if (entity?.kind === "npc") {
      onNpcClick?.(entity.id);
      return;
    }

    if (entity?.kind === "resource") {
      onResourceClick?.(entity.id);
      return;
    }

    if (entity?.kind === "enemy") {
      onEnemyClick?.(entity.id);
      return;
    }

    onFloorClick?.(getFloorPosition(mapPosition));
  }

  return (
    <div
      ref={hostRef}
      className={`pixi-world-renderer pixi-world-renderer-${mode}`}
      onClick={handleRendererClick}
      aria-label={
        mode === "full"
          ? "PixiJS full world renderer"
          : "PixiJS world renderer preview"
      }
    />
  );
}
