import { useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from "react";
import { getEntityPointerHit as getSharedEntityPointerHit } from "./PixiWorldRendererHelpers";
import type { BarrackRuntime } from "../game/types";
import { BARRACK_PREPARATION_MS } from "../game/barrackDefinitions";
import * as PIXI from "pixi.js";
import type {
  Application as PixiApplication,
  Container as PixiContainer,
  Graphics as PixiGraphics,
  Sprite as PixiSprite,
  Text as PixiText,
  Texture,
} from "pixi.js";
import {
  HUB_MAP_TILE_SRC,
  HUB_WALL_TILE_SRC,
  INVENTORY_ITEM_ICON_SRC,
  MAP_OBJECT_ICON_SRC,
  MAP_VISUAL_OBJECT_SRC,
  NPC_ICON_SRC,
  SHARED_SKILL_VISUAL_ICON_SRC,
  SLIMEWARD_DUNGEON_TILE_SRC,
  SKILL_VISUAL_ICON_SRC,
  SKILL_VISUAL_PRESENTATION,
  SKILL_VISUAL_PRESENTATION_TEXTURE_SRC,
  WILDERNESS_MAP_TILE_SRC,
} from "../assetIcons";
import type {
  ActiveCombatProjectile,
  ActiveTeleport,
  AoeVisualIntent,
  CombatFeedbackEvent,
  CompanionAoeChannelState,
  CompanionDirectCommandInput,
  DirectCompanionCommand,
  DropVisualEvent,
  EnemyAbilityCastState,
  EnemyDashState,
  EnemyAoeChannelState,
  EntityCollisionShape,
  GameEntity,
  GameMap,
  LeaderIntent,
  MapVisualObject,
  NavigationClickAccessibility,
  PartyIntent,
  Position,
  ResolvedAoeArea,
  ResolvedAoeCone,
  ResolvedAoeRectangle,
  ResolvedAoeSquare,
  ResurrectionProgressState,
  SkillBindState,
  SkillMarkState,
  SkillShieldBlockState,
  SkillVisualEvent,
  StatusEffectState,
} from "../game";
import {
  FORTIFYING_AURA_STATUS_SOURCE_KEY,
  getEnemyAggroRange,
  getEnemyArchetype,
  getEnemyAbilityDefinition,
  getEnemyType,
  getEntityCollisionShape,
  getItemDefinition,
  isActiveResource,
  QUEST_GIVER_POI_ID,
  RESURRECTION_RANGE,
  SKILL_DEFINITIONS,
  aoeTargetDummyId,
  doAoeBoundsIntersect,
  targetDummyId,
} from "../game";
import {
  SUPERIOR_ENEMY_RENDER_SCALE,
  isSuperiorEnemy,
} from "../game/enemyVariants";
import {
  entityVisualAssets,
  firstClassCharacterVisualAssets,
  getEntityVisualAsset,
  getSpriteAnimation,
  type ImageVisualAsset,
  type SpriteAnimationAsset,
  type SpriteDirection,
  type SpriteVisualAsset,
} from "../visualAssets";
import { REGIONAL_ENEMY_SPRITE_SRC } from "../visualAssets";
import {
  getPatronFinaleOpacity,
  getPatronWardFadeOpacity,
  isPatronWarmasterSpeechVisible,
  PATRON_WARMASTER_SCENE_FADE_DURATION_MS,
  type PatronWardPresentationState,
} from "../game/patronWardSystem";
import {
  PATRON_AURA_FRAME_DURATION_MS,
  PATRON_BARRIER_FADE_DURATION_MS,
  PATRON_WARD_VISUAL_OBJECT_IDS,
} from "../game/patronWardState";
import { PUBLIC_ASSET_ROOT } from "../publicAssetUrl";
import {
  getNpcSpeechOpacity,
  type ActiveNpcSpeech,
} from "../npcSpeechPresentation";
import {
  createRendererFrameScheduler,
  doOverheadUiBoxesOverlap,
  getDotDamageIconSrc,
  getEnemyAbilityCastProgress,
  getEnemyDashAfterimagePresentations,
  getFullRenderSignature,
  getNpcSpeechBubbleLayout,
  getOverheadStatusPresentation,
  getPreviewRenderSignature,
  isStaticMapSpriteKey,
  shouldSkipStableRendererFrame,
  type MovementClickFeedbackEvent,
  type OverheadStatusPresentation,
  type OverheadUiBox,
  type PixiRendererPerformanceSample,
  type QuestEntityIndicator,
  type ViewportRect,
} from "./PixiWorldRendererHelpers";

const { Application, Assets, Container, Graphics, Sprite, Text } = PIXI;
type Application = PixiApplication;
type Container = PixiContainer;
type Graphics = PixiGraphics;
type Sprite = PixiSprite;
type Text = PixiText;

const previewWidth = 256;
const previewHeight = 144;
const previewPadding = 8;
const defaultCellPixelSize = 32;
const floorChunkCellSpan = 4;
const slimewardFloorTileCellSpan = 4;
const slimewardWallTileCellSpan = 2;
const wildernessMapIds = new Set([
  "map-1",
  "map-2",
  "map-3",
  "map-4",
  "map-5",
  "map-6",
  "map-7",
]);
const defaultFeedbackFontSize = 11;
const emphasizedFeedbackFontSize = defaultFeedbackFontSize * 2;
const damageNumberAnimationDurationMs = 1000;
const damageNumberRisePixels = 32;
const damageNumberDriftPixels = 18;
const damageNumberRotationRadians = 0.32;
const dotDamageIconSize = 32;
const criticalHitBackingSize = 128;
const deadEnemyFadeDurationMs = 2500;
const entityFeedbackTintDurationMs = 260;
const enemyNameplateFontSize = 10;
const questEntityIndicatorColor = 0xfacc15;
const questEntityIndicatorStrokeColor = 0x451a03;
const questEntityNameplateGap = 8;
const questEntityLabelFontSize = 10;
const enemyNameplateStatusGap = 2;
const enemyNameplateHealthGap = 3;
const aggressiveEnemyNameplateColor = 0xdc2626;
const passiveEnemyNameplateColor = 0x1f2937;
const superiorEnemyAuraColor = 0xef4444;
const enemyAoeFillColor = 0xdc2626;
const enemyAoeStrokeColor = 0x7f1d1d;
const enemySupportiveAoeFillColor = 0xf59e0b;
const enemySupportiveAoeStrokeColor = 0xd97706;
const partyOffensiveAoeFillColor = 0x2563eb;
const partyOffensiveAoeStrokeColor = 0x1d4ed8;
const partyHealingAoeFillColor = 0x16a34a;
const partyHealingAoeStrokeColor = 0x15803d;
const prototypeVfxSpritePath = `${PUBLIC_ASSET_ROOT}/effects/gameplay`;
const combatProjectileSpritePath = `${PUBLIC_ASSET_ROOT}/effects/projectiles`;
const targetDummyDistanceMarkers = [5, 10, 20];
const blockImpactSrc = `${prototypeVfxSpritePath}/block-impact.png`;
const criticalHitBackingSrc = `${prototypeVfxSpritePath}/critical-hit-backing.png`;
const deathDownedPuffSrc = `${prototypeVfxSpritePath}/death-downed-puff.png`;
const enemySpottedAlertSrc = `${prototypeVfxSpritePath}/enemy-spotted-alert.png`;
const healSparkleSrc = `${prototypeVfxSpritePath}/heal-sparkle.png`;
const gatherCompleteSparkleSrc = `${prototypeVfxSpritePath}/gather-complete-sparkle.png`;
const inventoryFullWarningSrc = `${prototypeVfxSpritePath}/inventory-full-warning.png`;
const levelUpBurstSrc = `${prototypeVfxSpritePath}/level-up-burst.png`;
const missEvadePuffSrc = `${prototypeVfxSpritePath}/miss-evade-puff.png`;
const resourceDepletedPuffSrc = `${prototypeVfxSpritePath}/resource-depleted-puff.png`;
const resourceHitHerbSrc = `${prototypeVfxSpritePath}/resource-hit-herb.png`;
const resourceHitOreSrc = `${prototypeVfxSpritePath}/resource-hit-ore.png`;
const resourceHitWoodSrc = `${prototypeVfxSpritePath}/resource-hit-wood.png`;
const shieldInvulnerableGlintSrc = `${prototypeVfxSpritePath}/shield-invulnerable-glint.png`;
const teleportPulseSrc = `${prototypeVfxSpritePath}/teleport-pulse.png`;
const burnDotDamageIconSrc = `${prototypeVfxSpritePath}/dot-burn.png`;
const poisonDotDamageIconSrc = `${prototypeVfxSpritePath}/dot-poison.png`;
const bleedDotDamageIconSrc = `${prototypeVfxSpritePath}/dot-bleed.png`;
const patronAuraFrameSrcs = Array.from(
  { length: 7 },
  (_, index) =>
    `${prototypeVfxSpritePath}/orc-aura/OrcAura${String(index + 1).padStart(4, "0")}.png`,
);
const overheadStatusLabelHeight = 10;
const overheadStatusLabelGap = 2;
const overheadStatusBarHeight = 8;
const overheadStatusHealthGap = 4;
const overheadHealthHeight = 4;
const overheadStatusTextColor = 0xffffff;
const overheadStatusTextStrokeColor = 0x020617;
const overheadStatusTextStrokeWidth = 4;
const npcSpeechBackgroundColor = 0xfff2cf;
const npcSpeechBorderColor = 0x3a2d24;
const npcSpeechShadowColor = 0x1f1712;
const npcSpeechTextColor = 0x2b211b;
const npcSpeechHorizontalPadding = 12;
const npcSpeechVerticalPadding = 9;
const npcSpeechMinimumWidth = 96;
const npcSpeechMaximumWidth = 260;
const npcSpeechFontSize = 13;

type EntityOverheadUiLayout = OverheadUiBox & {
  healthY: number;
  statusBarY: number;
  statusLabelY: number;
};

const combatProjectileVisualProfiles: Record<
  ActiveCombatProjectile["visualProfileId"],
  { height: number; nativeAngleDegrees: number; src: string; width: number }
> = {
  elementalist_arcane_bolt: {
    height: 18,
    nativeAngleDegrees: 0,
    src: `${combatProjectileSpritePath}/elementalist-arcane-bolt.png`,
    width: 30,
  },
  enemy_fire_bolt: {
    height: 32,
    nativeAngleDegrees: 135,
    src: `${combatProjectileSpritePath}/bog-imp.png`,
    width: 32,
  },
  hunter_arrow: {
    height: 12,
    nativeAngleDegrees: 0,
    src: `${combatProjectileSpritePath}/hunter-arrow.png`,
    width: 34,
  },
  runecaster_rune_bolt: {
    height: 20,
    nativeAngleDegrees: 0,
    src: `${combatProjectileSpritePath}/runecaster-rune-bolt.png`,
    width: 34,
  },
  lightbearer_holy_bolt: {
    height: 18,
    nativeAngleDegrees: 0,
    src: `${combatProjectileSpritePath}/lightbearer-holy-bolt.png`,
    width: 36,
  },
  slime_spitter: {
    height: 22,
    nativeAngleDegrees: 0,
    src: `${combatProjectileSpritePath}/slime-spitter.png`,
    width: 22,
  },
  goblin_thrower: {
    height: 18,
    nativeAngleDegrees: -45,
    src: `${combatProjectileSpritePath}/goblin-thrower.png`,
    width: 18,
  },
  bog_imp: {
    height: 20,
    nativeAngleDegrees: 135,
    src: `${combatProjectileSpritePath}/bog-imp.png`,
    width: 20,
  },
  ash_wisp: {
    height: 24,
    nativeAngleDegrees: 135,
    src: `${combatProjectileSpritePath}/ash-wisp.png`,
    width: 24,
  },
};
const TELEPORT_OBJECT_SPRITE_SIZE_PX = 250;
const TELEPORT_OBJECT_SPRITE_ANCHOR_X = 0.5;
const TELEPORT_OBJECT_SPRITE_ANCHOR_Y = 0.5;
function getHealingFountainRenderDiameterPx(
  range: number,
  cellPixelSize: number,
): number {
  return range * 2 * cellPixelSize;
}
const skillFeedbackDisplayNames = new Set(
  Object.values(SKILL_DEFINITIONS).map((skill) => skill.displayName),
);

import type { WarmasterAttempt } from "../game/warmasterState";
import { isInsideWarmasterArena } from "../game/warmasterState";
import { getPatronTransferPosition, isAuraVisible } from "./warmasterPresentation";

type PixiRendererMode = "preview" | "full";

type QuestObjectiveMarker = {
  id: string;
  position: Position;
};

type ViewportSize = {
  width: number;
  height: number;
};

type PixiWorldRendererProps = {
  activeTeleport?: ActiveTeleport | null;
  cameraOffset?: Position;
  cellPixelSize?: number;
  combatFeedbackEvents?: CombatFeedbackEvent[];
  combatProjectiles?: ActiveCombatProjectile[];
  companionAoeChannelsByCasterId?: Record<string, CompanionAoeChannelState>;
  currentTime?: number;
  directCompanionCommandsById?: Record<string, DirectCompanionCommand>;
  dropVisualEvents?: DropVisualEvent[];
  enemyAbilityCastsByEnemyId?: Record<string, EnemyAbilityCastState>;
  enemyDashesByEnemyId?: Record<string, EnemyDashState>;
  enemyAoeChannelsByCasterId?: Record<string, EnemyAoeChannelState>;
  entities: GameEntity[];
  leaderIntent?: LeaderIntent | null;
  map: GameMap;
  mode?: PixiRendererMode;
  movementClickFeedbackEvents?: MovementClickFeedbackEvent[];
  navigationClickAccessibility?: NavigationClickAccessibility | null;
  npcSpeech?: ActiveNpcSpeech | null;
  onEnemyClick?: (enemyId: string) => void;
  onCompanionDragCommand?: (command: CompanionDirectCommandInput) => void;
  onEntityHover?: (
    entityId: string | null,
    pointerPosition?: Position,
  ) => void;
  onFloorClick?: (position: Position) => void;
  onNpcClick?: (npcId: string) => void;
  onPerformanceSample?: (sample: PixiRendererPerformanceSample) => void;
  onViewportRectChange?: (rect: ViewportRect | null) => void;
  onCursorPositionChange?: (position: Position | null) => void;
  onResourceClick?: (resourceId: string) => void;
  onPatronWardClick?: (wardId: import("../game").PatronWardId) => void;
  partyIntent?: PartyIntent | null;
  patronWardPresentation?: PatronWardPresentationState | null;
  warmasterAttempt?: WarmasterAttempt;
  barracksById?: Record<string, BarrackRuntime>;
  questEntityIndicators?: QuestEntityIndicator[];
  questObjectiveMarkers?: QuestObjectiveMarker[];
  resurrectionProgressByCompanionId?: Record<string, ResurrectionProgressState>;
  questGiverHasWork?: boolean;
  showDebugOverlays?: boolean;
  skillBindsByEnemyId?: Record<string, SkillBindState>;
  skillMarksByEnemyId?: Record<string, SkillMarkState>;
  skillShieldBlocksById?: Record<string, SkillShieldBlockState>;
  skillVisualEvents?: SkillVisualEvent[];
  statusEffectsById?: Record<string, StatusEffectState>;
  statusPresentationTime?: number;
  speechBubbleAvoidanceRects?: readonly ViewportRect[];
  suppressMovePoiRing?: boolean;
  teleportWorkingById?: Record<string, boolean>;
  viewportSize?: ViewportSize;
  visualMovementByEntityId?: Record<string, EntityVisualMovement>;
};

type EntityVisualMovement = {
  direction: SpriteDirection;
  angleDegrees?: number;
  expiresAt: number;
};

type CompanionDragState = {
  companionId: string;
  hasDragged: boolean;
  pointerId: number;
  startClientPosition: Position;
};

type CompanionDragPreview = {
  companionId: string;
  targetKind: "enemy" | "floor" | "resource";
  targetPosition: Position;
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

type ClientBounds = Pick<DOMRect, "left" | "top" | "width" | "height">;

type TileBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type PixiRenderLayers = {
  auraLayer: Container;
  backgroundGraphics: Graphics;
  entityLayer: Container;
  effectsGraphics: Graphics;
  effectsLayer: Container;
  fallbackGraphics: Graphics;
  floorLayer: Container;
  objectLayer: Container;
  overlayGraphics: Graphics;
  speechLayer: Container;
  wallLayer: Container;
};

type NpcSpeechLayerState = {
  alpha: number;
  signature: string | null;
};

type TextureCache = {
  currentMapId: string | null;
  durableTextureSrcs: Set<string>;
  evictedTextureCount: number;
  failedSrcs: Set<string>;
  lastEntitySpriteSrcById: Map<string, string>;
  mapTextureSrcsByMapId: Map<string, Set<string>>;
  pendingRequests: Map<string, TextureRequestScope>;
  pendingSrcs: Set<string>;
  recentMapIds: string[];
  stalePendingTextureCount: number;
  textureRevision: number;
  textures: Map<string, Texture>;
  unloadFailedTextureCount: number;
};

type TextureRequestScope = {
  durable?: boolean;
  mapId?: string;
};

type ManagedSpriteEntry = {
  layer: Container;
  sprite: Sprite;
  src: string;
};

type ManagedTextEntry = {
  layer: Container;
  styleKey: string;
  text: Text;
};

type ManagedRendererState = {
  activeSpriteKeys: Set<string>;
  activeTextKeys: Set<string>;
  mapId: string | null;
  sprites: Map<string, ManagedSpriteEntry>;
  texts: Map<string, ManagedTextEntry>;
};

type PixiDrawMetrics = PixiRendererPerformanceSample;

type StaticMapRenderCache = {
  floorCellKeys: Set<string> | null;
  hubWallKeys: Set<string> | null;
  sortedVisualObjects: MapVisualObject[];
};

type InteractableEntityKind = "enemy" | "structure" | "resource" | "npc";

type InteractableEntity = GameEntity & {
  kind: InteractableEntityKind;
};

type DirectCommandDropTarget = GameEntity & {
  kind: "resource" | "enemy" | "structure";
};

type EntitySpriteLayout = {
  anchorX: number;
  anchorY: number;
  height: number;
  width: number;
};

type EntityTint = {
  alpha: number;
  color: number;
};

function getTeleportIconSrc(
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

type DrawWorldOptions = {
  activeTeleport: ActiveTeleport | null;
  cameraOffset: Position;
  cellPixelSize: number;
  combatFeedbackEvents: CombatFeedbackEvent[];
  combatProjectiles: ActiveCombatProjectile[];
  companionDragPreview: CompanionDragPreview | null;
  companionAoeChannelsByCasterId: Record<string, CompanionAoeChannelState>;
  currentTime: number;
  directCompanionCommandsById: Record<string, DirectCompanionCommand>;
  dropVisualEvents: DropVisualEvent[];
  enemyAbilityCastsByEnemyId: Record<string, EnemyAbilityCastState>;
  enemyDashesByEnemyId: Record<string, EnemyDashState>;
  enemyAoeChannelsByCasterId: Record<string, EnemyAoeChannelState>;
  entities: GameEntity[];
  leaderIntent: LeaderIntent | null;
  layers: PixiRenderLayers;
  map: GameMap;
  managedState: ManagedRendererState;
  mode: PixiRendererMode;
  movementClickFeedbackEvents: MovementClickFeedbackEvent[];
  navigationClickAccessibility: NavigationClickAccessibility | null;
  onPerformanceSample?: (sample: PixiRendererPerformanceSample) => void;
  partyIntent: PartyIntent | null;
  patronWardPresentation: PatronWardPresentationState | null;
  warmasterAttempt?: WarmasterAttempt;
  barracksById: Record<string, BarrackRuntime>;
  questEntityIndicators: QuestEntityIndicator[];
  questObjectiveMarkers: QuestObjectiveMarker[];
  questGiverHasWork: boolean;
  requestRedraw?: () => void;
  renderSize: RenderSize;
  resurrectionProgressByCompanionId: Record<string, ResurrectionProgressState>;
  showDebugOverlays: boolean;
  speechBubbleAvoidanceRects: readonly ViewportRect[];
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  statusEffectsById: Record<string, StatusEffectState>;
  statusPresentationTime: number;
  suppressMovePoiRing: boolean;
  teleportWorkingById: Record<string, boolean>;
  textureCache: TextureCache;
  fullHadTimedWorkRef: { current: boolean };
  fullSignatureRef: { current: string | null };
  lastDrawnTextureRevisionRef: { current: number | null };
  previewSignatureRef: { current: string | null };
  viewportSize?: ViewportSize;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
};

type PreviewInaccessibleCellRun = {
  width: number;
  x: number;
  y: number;
};

type PreviewInaccessibleCellRunCache = {
  runs: PreviewInaccessibleCellRun[];
  signature: string;
};

const fullModeInteractionRadius = 1.5;
const staticMapRenderCacheByMap = new WeakMap<GameMap, StaticMapRenderCache>();
const previewInaccessibleCellRunCacheByMap = new WeakMap<
  GameMap,
  PreviewInaccessibleCellRunCache
>();
const visibleFloorChunkCache = new Map<string, Position[]>();

function getStaticMapRenderCache(map: GameMap): StaticMapRenderCache {
  const cached = staticMapRenderCacheByMap.get(map);

  if (cached) {
    return cached;
  }

  const cache = {
    floorCellKeys:
      map.visualTheme === "slimeward-cave"
        ? new Set((map.floorCells ?? []).map(getHubWallKey))
        : null,
    hubWallKeys: isHubVisualMap(map.id) ? createHubWallKeySet(map.walls) : null,
    sortedVisualObjects: [...(map.visualObjects ?? [])].sort(
      (first, second) =>
        first.position.y - second.position.y || first.id.localeCompare(second.id),
    ),
  };

  staticMapRenderCacheByMap.set(map, cache);

  return cache;
}

function createTextureCache(): TextureCache {
  return {
    currentMapId: null,
    durableTextureSrcs: new Set<string>(),
    evictedTextureCount: 0,
    failedSrcs: new Set<string>(),
    lastEntitySpriteSrcById: new Map<string, string>(),
    mapTextureSrcsByMapId: new Map<string, Set<string>>(),
    pendingRequests: new Map<string, TextureRequestScope>(),
    pendingSrcs: new Set<string>(),
    recentMapIds: [],
    stalePendingTextureCount: 0,
    textureRevision: 0,
    textures: new Map<string, Texture>(),
    unloadFailedTextureCount: 0,
  };
}

function bumpTextureRevision(cache: TextureCache) {
  cache.textureRevision += 1;
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
  clearLayer(layers.auraLayer);
  clearLayer(layers.entityLayer);
  clearLayer(layers.effectsLayer);
  layers.backgroundGraphics.clear();
  layers.effectsGraphics.clear();
  layers.fallbackGraphics.clear();
  layers.overlayGraphics.clear();
}

function createManagedRendererState(): ManagedRendererState {
  return {
    activeSpriteKeys: new Set<string>(),
    activeTextKeys: new Set<string>(),
    mapId: null,
    sprites: new Map<string, ManagedSpriteEntry>(),
    texts: new Map<string, ManagedTextEntry>(),
  };
}

function createPixiDrawMetrics(): PixiDrawMetrics {
  return {
    activeFeedbackCount: 0,
    drawCount: 1,
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
    renderMs: 0,
    spriteCreates: 0,
    spriteReuses: 0,
    textCreates: 0,
    textReuses: 0,
    textureCount: 0,
    retainedMapCount: 0,
    stalePendingTextureCount: 0,
    unloadFailedTextureCount: 0,
    visibleEntityCount: 0,
  };
}

function finishPixiDrawMetrics(
  metrics: PixiDrawMetrics,
  managedState: ManagedRendererState,
  textureCache: TextureCache,
) {
  metrics.evictedTextureCount = textureCache.evictedTextureCount;
  metrics.failedTextureCount = textureCache.failedSrcs.size;
  metrics.durableTextureSourceCount = textureCache.durableTextureSrcs.size;
  metrics.managedSpriteCount = managedState.sprites.size;
  metrics.managedStaticSpriteCount = getManagedStaticSpriteCount(managedState);
  metrics.managedTextCount = managedState.texts.size;
  metrics.mapScopedTextureSourceCount =
    getMapScopedTextureSourceCount(textureCache);
  metrics.mapTrackedTextureSourceCount =
    getMapTrackedTextureSourceCount(textureCache);
  metrics.pendingTextureCount = textureCache.pendingSrcs.size;
  metrics.retainedMapCount = textureCache.mapTextureSrcsByMapId.size;
  metrics.stalePendingTextureCount = textureCache.stalePendingTextureCount;
  metrics.textureCount = textureCache.textures.size;
  metrics.unloadFailedTextureCount = textureCache.unloadFailedTextureCount;
}

function getManagedStaticSpriteCount(managedState: ManagedRendererState) {
  let staticSpriteCount = 0;

  for (const key of managedState.sprites.keys()) {
    if (isStaticMapSpriteKey(key)) {
      staticSpriteCount += 1;
    }
  }

  return staticSpriteCount;
}

function getMapScopedTextureSourceCount(textureCache: TextureCache): number {
  let sourceCount = 0;

  for (const mapSources of textureCache.mapTextureSrcsByMapId.values()) {
    sourceCount += mapSources.size;
  }

  return sourceCount;
}

function getMapTrackedTextureSourceCount(textureCache: TextureCache): number {
  const sources = new Set<string>();

  for (const mapSources of textureCache.mapTextureSrcsByMapId.values()) {
    for (const src of mapSources) {
      sources.add(src);
    }
  }

  return sources.size;
}

function destroyManagedTextEntry(entry: ManagedTextEntry) {
  entry.text.parent?.removeChild(entry.text);

  try {
    entry.text.destroy();
  } catch {
    // Pixi can throw while returning canvas text textures; keep the frame alive.
  }
}

function destroyPixiApplication(app: Application) {
  app.canvas.parentElement?.removeChild(app.canvas);

  try {
    app.destroy(true, { children: true });
  } catch {
    // Pixi can throw while tearing down its canvas text system.
  }
}

function destroyManagedRendererState(state: ManagedRendererState) {
  for (const entry of state.sprites.values()) {
    entry.sprite.destroy();
  }

  for (const entry of state.texts.values()) {
    destroyManagedTextEntry(entry);
  }

  state.sprites.clear();
  state.texts.clear();
  state.activeSpriteKeys.clear();
  state.activeTextKeys.clear();
  state.mapId = null;
}

function resetManagedRendererState(state: ManagedRendererState) {
  state.sprites.clear();
  state.texts.clear();
  state.activeSpriteKeys.clear();
  state.activeTextKeys.clear();
  state.mapId = null;
}

function beginManagedFrame(state: ManagedRendererState, mapId: string) {
  if (state.mapId !== mapId) {
    destroyManagedRendererState(state);
    state.mapId = mapId;
  }

  state.activeSpriteKeys.clear();
  state.activeTextKeys.clear();
}

function endManagedFrame(state: ManagedRendererState) {
  for (const [key, entry] of state.sprites) {
    if (!state.activeSpriteKeys.has(key)) {
      entry.sprite.destroy();
      state.sprites.delete(key);
    }
  }

  for (const [key, entry] of state.texts) {
    if (!state.activeTextKeys.has(key)) {
      state.texts.delete(key);
      destroyManagedTextEntry(entry);
    }
  }
}

function requestTexture(
  src: string,
  cache: TextureCache,
  requestRedraw?: () => void,
  scope: TextureRequestScope = {},
): Texture | null {
  registerTextureScope(cache, src, scope);

  const cachedTexture = cache.textures.get(src);

  if (cachedTexture) {
    return cachedTexture;
  }

  if (cache.failedSrcs.has(src)) {
    return null;
  }

  if (cache.pendingSrcs.has(src)) {
    const pendingScope = cache.pendingRequests.get(src) ?? {};
    cache.pendingRequests.set(src, mergeTextureScopes(pendingScope, scope));
    return null;
  }

  cache.pendingSrcs.add(src);
  cache.pendingRequests.set(src, scope);
  void Assets.load<Texture>(src)
    .then((texture) => {
      cache.pendingSrcs.delete(src);
      const requestScope = cache.pendingRequests.get(src) ?? scope;
      cache.pendingRequests.delete(src);

      if (shouldRetainLoadedTexture(cache, src, requestScope)) {
        cache.textures.set(src, texture);
      } else {
        cache.stalePendingTextureCount += 1;
        unloadTextureSrc(cache, src);
      }

      bumpTextureRevision(cache);
      requestRedraw?.();
    })
    .catch(() => {
      cache.pendingSrcs.delete(src);
      cache.pendingRequests.delete(src);
      cache.failedSrcs.add(src);
      bumpTextureRevision(cache);
      requestRedraw?.();
    });

  return null;
}

function registerTextureScope(
  cache: TextureCache,
  src: string,
  scope: TextureRequestScope,
) {
  if (scope.durable) {
    const durableSize = cache.durableTextureSrcs.size;
    cache.durableTextureSrcs.add(src);

    if (cache.durableTextureSrcs.size !== durableSize) {
      bumpTextureRevision(cache);
    }
  }

  if (scope.mapId) {
    let mapSources = cache.mapTextureSrcsByMapId.get(scope.mapId);

    if (!mapSources) {
      mapSources = new Set<string>();
      cache.mapTextureSrcsByMapId.set(scope.mapId, mapSources);
      bumpTextureRevision(cache);
    }

    const mapSourceSize = mapSources.size;
    mapSources.add(src);

    if (mapSources.size !== mapSourceSize) {
      bumpTextureRevision(cache);
    }
  }
}

function mergeTextureScopes(
  currentScope: TextureRequestScope,
  nextScope: TextureRequestScope,
): TextureRequestScope {
  return {
    durable: Boolean(currentScope.durable || nextScope.durable),
    mapId: nextScope.mapId ?? currentScope.mapId,
  };
}

function shouldRetainLoadedTexture(
  cache: TextureCache,
  src: string,
  scope: TextureRequestScope,
): boolean {
  if (scope.durable || cache.durableTextureSrcs.has(src)) {
    return true;
  }

  return Boolean(scope.mapId && cache.mapTextureSrcsByMapId.get(scope.mapId)?.has(src));
}

function unloadTextureSrc(cache: TextureCache, src: string) {
  cache.failedSrcs.delete(src);
  cache.lastEntitySpriteSrcById.forEach((entitySrc, entityId) => {
    if (entitySrc === src) {
      cache.lastEntitySpriteSrcById.delete(entityId);
    }
  });
  void Assets.unload(src).catch(() => {
    cache.unloadFailedTextureCount += 1;
  });
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
  scope: TextureRequestScope = {},
) {
  for (const src of new Set(collectSpriteVisualAssetFrames(visualAsset))) {
    requestTexture(src, cache, requestRedraw, scope);
  }
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

function collectDurableVisualTextureSrcs(): Set<string> {
  const sources = new Set<string>([
    ...Object.values(NPC_ICON_SRC),
    ...Object.values(SHARED_SKILL_VISUAL_ICON_SRC),
    ...Object.values(SKILL_VISUAL_ICON_SRC).filter(
      (src): src is string => Boolean(src),
    ),
    ...SKILL_VISUAL_PRESENTATION_TEXTURE_SRC,
    ...Object.values(combatProjectileVisualProfiles).map((profile) => profile.src),
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
    burnDotDamageIconSrc,
    poisonDotDamageIconSrc,
    bleedDotDamageIconSrc,
  ]);

  addEntityVisualAssetTextureSrcs(sources, entityVisualAssets.beginnerCharacter);
  for (const visualAsset of Object.values(firstClassCharacterVisualAssets)) {
    addEntityVisualAssetTextureSrcs(sources, visualAsset);
  }
  addEntityVisualAssetTextureSrcs(sources, entityVisualAssets.testCharacter);
  addEntityVisualAssetTextureSrcs(sources, entityVisualAssets.questGuideCharacter);

  return sources;
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

function collectCurrentMapVisualTextureSrcs(
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

function getCurrentMapVisualTextureSignature(
  map: GameMap,
  entities: GameEntity[],
): string {
  const durableSources = collectDurableVisualTextureSrcs();

  return [
    map.id ?? map.debugName,
    ...collectCurrentMapVisualTextureSrcs(map, entities).filter(
      (src) => !durableSources.has(src),
    ),
  ].join("|");
}

function preloadCurrentMapVisualTextures({
  cache,
  entities,
  map,
  requestRedraw,
}: {
  cache: TextureCache;
  entities: GameEntity[];
  map: GameMap;
  requestRedraw?: () => void;
}) {
  const mapId = map.id ?? map.debugName;
  const durableSources = collectDurableVisualTextureSrcs();
  const mapScopedSources = collectCurrentMapVisualTextureSrcs(map, entities)
    .filter((src) => !durableSources.has(src));

  cache.currentMapId = mapId;
  replaceMapScopedTextureSources(cache, mapId, mapScopedSources);
  cache.recentMapIds = [mapId];

  evictOldMapTextures(cache);
  pruneLastEntitySpriteSrcs(cache, entities);

  for (const src of durableSources) {
    requestTexture(src, cache, requestRedraw, { durable: true });
  }

  for (const src of mapScopedSources) {
    requestTexture(src, cache, requestRedraw, { mapId });
  }
}

function replaceMapScopedTextureSources(
  cache: TextureCache,
  mapId: string,
  sources: string[],
) {
  const currentSources = cache.mapTextureSrcsByMapId.get(mapId);
  const nextSources = new Set(sources);

  if (areTextureSourceSetsEqual(currentSources, nextSources)) {
    return;
  }

  cache.mapTextureSrcsByMapId.set(mapId, nextSources);
  bumpTextureRevision(cache);
}

function areTextureSourceSetsEqual(
  firstSources: Set<string> | undefined,
  secondSources: Set<string>,
): boolean {
  if (!firstSources || firstSources.size !== secondSources.size) {
    return false;
  }

  for (const src of firstSources) {
    if (!secondSources.has(src)) {
      return false;
    }
  }

  return true;
}

function evictOldMapTextures(cache: TextureCache) {
  const keptMapIds = new Set(cache.currentMapId ? [cache.currentMapId] : []);
  const keptSrcs = new Set<string>();
  let didEvict = false;

  for (const mapId of keptMapIds) {
    for (const src of cache.mapTextureSrcsByMapId.get(mapId) ?? []) {
      keptSrcs.add(src);
    }
  }

  for (const [mapId, srcs] of cache.mapTextureSrcsByMapId) {
    if (keptMapIds.has(mapId)) {
      continue;
    }

    for (const src of srcs) {
      if (
        cache.durableTextureSrcs.has(src) ||
        keptSrcs.has(src) ||
        !cache.textures.has(src)
      ) {
        continue;
      }

      cache.textures.delete(src);
      cache.evictedTextureCount += 1;
      didEvict = true;
      unloadTextureSrc(cache, src);
    }

    cache.mapTextureSrcsByMapId.delete(mapId);
    didEvict = true;
  }

  if (didEvict) {
    bumpTextureRevision(cache);
  }
}

function pruneLastEntitySpriteSrcs(
  cache: TextureCache,
  entities: GameEntity[],
) {
  const currentEntityIds = new Set(entities.map((entity) => entity.id));

  for (const entityId of cache.lastEntitySpriteSrcById.keys()) {
    if (!currentEntityIds.has(entityId)) {
      cache.lastEntitySpriteSrcById.delete(entityId);
    }
  }
}

function isWildernessVisualMap(mapId: string | undefined): boolean {
  return Boolean(mapId && wildernessMapIds.has(mapId));
}

function isHubVisualMap(mapId: string | undefined): boolean {
  return mapId === "hub" || mapId === "hub-2";
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

function getFullVisibleTileBounds({
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createVisibleFloorChunkPositions(bounds: TileBounds): Position[] {
  const cacheKey = `${bounds.minX}:${bounds.maxX}:${bounds.minY}:${bounds.maxY}`;
  const cached = visibleFloorChunkCache.get(cacheKey);

  if (cached) {
    return cached;
  }

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

  if (visibleFloorChunkCache.size > 128) {
    visibleFloorChunkCache.clear();
  }

  visibleFloorChunkCache.set(cacheKey, chunks);

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
    chunk.x >= 28 &&
    chunk.x <= 80 &&
    chunk.y >= 12 &&
    chunk.y <= 48;

  return isCityFloorChunk ? HUB_MAP_TILE_SRC.stone128 : HUB_MAP_TILE_SRC.grass128;
}

function getWildernessWallTileKind(position: Position): "tree" | "bush" {
  return getCoordinateHash(position) % 10 === 0 ? "tree" : "bush";
}

function getWildernessWallTileSrc(position: Position): string {
  return WILDERNESS_MAP_TILE_SRC[getWildernessWallTileKind(position)];
}

function createHubWallKeySet(walls: Position[]): Set<string> {
  return new Set(walls.map(getHubWallKey));
}

function getHubWallKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function getHubWallTileSrc(
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
  bounds: ClientBounds,
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

function getPreviewMapPosition(
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

function getFloorPosition(position: Position): Position {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
  };
}

function getMapFloorColor(map: GameMap): number {
  if (map.visualTheme === "slimeward-cave") {
    return 0x05080a;
  }

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
  if (entity.kind === "enemy" || entity.kind === "structure") {
    return entity.state !== "dead";
  }

  if (entity.kind === "resource") {
    return isActiveResource(entity);
  }

  return entity.kind === "npc";
}

function shouldRenderEntity(entity: GameEntity): boolean {
  return entity.kind !== "resource" || isActiveResource(entity);
}

function getNearestInteractableEntity({
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
  const priorities: InteractableEntityKind[] = ["npc", "structure", "resource", "enemy"];
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

function getNearestDirectCommandSourceCompanion({
  cellPixelSize,
  entities,
  map,
  mapPosition,
}: {
  cellPixelSize: number;
  entities: GameEntity[];
  map: GameMap;
  mapPosition: Position;
}): Extract<GameEntity, { kind: "companion" }> | null {
  const maximumDistanceSquared =
    fullModeInteractionRadius * fullModeInteractionRadius;

  return (
    entities
      .filter(
        (entity): entity is Extract<GameEntity, { kind: "companion" }> =>
          entity.kind === "companion" &&
          entity.state !== "dead" &&
          entity.health > 0,
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
          entity: Extract<GameEntity, { kind: "companion" }>;
        } => Boolean(candidate),
      )
      .filter((candidate) => candidate.distanceSquared <= maximumDistanceSquared)
      .sort(
        (first, second) =>
          first.distanceSquared - second.distanceSquared ||
          first.entity.id.localeCompare(second.entity.id),
      )[0]?.entity ?? null
  );
}

function getNearestDirectCommandDropTarget({
  cellPixelSize,
  entities,
  map,
  mapPosition,
}: {
  cellPixelSize: number;
  entities: GameEntity[];
  map: GameMap;
  mapPosition: Position;
}): DirectCommandDropTarget | null {
  const priorities: DirectCommandDropTarget["kind"][] = ["structure", "resource", "enemy"];
  const maximumDistanceSquared =
    fullModeInteractionRadius * fullModeInteractionRadius;

  for (const kind of priorities) {
    const nearest = entities
      .filter(
        (entity): entity is DirectCommandDropTarget =>
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
          entity: DirectCommandDropTarget;
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

function getCompanionDragPreview({
  cellPixelSize,
  companionId,
  entities,
  map,
  pointerPosition,
  targetBounds,
  transform,
}: {
  cellPixelSize: number;
  companionId: string;
  entities: GameEntity[];
  map: GameMap;
  pointerPosition: Position;
  targetBounds: ClientBounds;
  transform: FullTransform;
}): CompanionDragPreview {
  const mapPosition = getFullMapPosition(pointerPosition, targetBounds, transform);
  const target = getNearestDirectCommandDropTarget({
    cellPixelSize,
    entities,
    map,
    mapPosition,
  });

  if (target?.kind === "resource") {
    return {
      companionId,
      targetKind: "resource",
      targetPosition: { ...target.position },
    };
  }

  if (target?.kind === "enemy" || target?.kind === "structure") {
    return {
      companionId,
      targetKind: "enemy",
      targetPosition: { ...target.position },
    };
  }

  return {
    companionId,
    targetKind: "floor",
    targetPosition: getFloorPosition(mapPosition),
  };
}

function getNearestHoverEntity({
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
    "structure",
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

function getEntityPointerHit({
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
  if (entity.kind === "structure") {
    return getSharedEntityPointerHit({ cellPixelSize, entity, map, mapPosition });
  }
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

function drawQuestObjectiveMarkers(
  graphics: Graphics,
  markers: QuestObjectiveMarker[],
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  for (const marker of markers) {
    if (!isPositionInTileBounds(marker.position, visibleTileBounds)) {
      continue;
    }

    drawDottedCircle(
      graphics,
      toFullPosition(marker.position, transform),
      transform.cellPixelSize * 0.82,
      0xfacc15,
    );
  }
}

function drawDirectCompanionCommandIndicators(
  graphics: Graphics,
  entities: GameEntity[],
  commandsByCompanionId: Record<string, DirectCompanionCommand>,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  for (const command of Object.values(commandsByCompanionId)) {
    const companion = entities.find((entity) => entity.id === command.companionId);
    const targetPosition = getDirectCommandRenderTargetPosition(command, entities);

    if (
      !companion ||
      !targetPosition ||
      !isPositionInTileBounds(companion.position, visibleTileBounds)
    ) {
      continue;
    }

    const start = toFullPosition(companion.position, transform);
    const end = toFullPosition(targetPosition, transform);
    const color = getDirectCommandIndicatorColor(command.type);

    graphics
      .moveTo(start.x, start.y)
      .lineTo(end.x, end.y)
      .stroke({ color, alpha: 0.72, width: 2 });
    graphics.circle(end.x, end.y, transform.cellPixelSize * 0.28).stroke({
      color,
      alpha: 0.9,
      width: 2,
    });
  }
}

function drawCompanionDragPreview(
  graphics: Graphics,
  entities: GameEntity[],
  preview: CompanionDragPreview | null,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  if (!preview) {
    return;
  }

  const companion = entities.find((entity) => entity.id === preview.companionId);

  if (
    !companion ||
    !isPositionInTileBounds(companion.position, visibleTileBounds)
  ) {
    return;
  }

  const start = toFullPosition(companion.position, transform);
  const end = toFullPosition(preview.targetPosition, transform);
  const color = getCompanionDragPreviewColor(preview.targetKind);
  const radius = transform.cellPixelSize * 0.72;

  graphics
    .moveTo(start.x, start.y)
    .lineTo(end.x, end.y)
    .stroke({ color, alpha: 0.88, width: 3 });
  graphics
    .circle(start.x, start.y, transform.cellPixelSize * 0.34)
    .stroke({ color: 0xffffff, alpha: 0.75, width: 2 });
  drawDottedCircle(graphics, end, radius, color);
}

function drawDottedCircle(
  graphics: Graphics,
  center: Position,
  radius: number,
  color: number,
) {
  const dotCount = 28;
  const dotRadius = 2.4;

  for (let index = 0; index < dotCount; index += 1) {
    const angle = (Math.PI * 2 * index) / dotCount;

    graphics
      .circle(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        dotRadius,
      )
      .fill({ color, alpha: 0.92 });
  }
}

function getCompanionDragPreviewColor(
  targetKind: CompanionDragPreview["targetKind"],
): number {
  if (targetKind === "enemy") {
    return 0xef4444;
  }

  if (targetKind === "resource") {
    return 0x22c55e;
  }

  return 0x38bdf8;
}

function getDirectCommandRenderTargetPosition(
  command: DirectCompanionCommand,
  entities: GameEntity[],
): Position | null {
  if (command.type === "move") {
    return command.targetPosition;
  }

  const target = entities.find((entity) => entity.id === command.targetId);

  return target?.position ?? command.targetPosition;
}

function getDirectCommandIndicatorColor(
  commandType: DirectCompanionCommand["type"],
): number {
  if (commandType === "attack") {
    return 0xef4444;
  }

  if (commandType === "gather") {
    return 0x22c55e;
  }

  return 0x38bdf8;
}

function isEntityVisuallyMoving(
  entity: GameEntity,
  currentTime: number,
  visualMovementByEntityId: Record<string, EntityVisualMovement>,
): boolean {
  const visualMovement = visualMovementByEntityId[entity.id];

  return Boolean(visualMovement && visualMovement.expiresAt > currentTime);
}

function shouldDrawEnemyAggroRange(
  entity: GameEntity,
  currentTime: number,
  visualMovementByEntityId: Record<string, EntityVisualMovement>,
): entity is Extract<GameEntity, { kind: "enemy" }> {
  return (
    entity.kind === "enemy" &&
    entity.state !== "dead" &&
    entity.health > 0 &&
    !isEntityVisuallyMoving(entity, currentTime, visualMovementByEntityId)
  );
}

function drawEnemyAggroRange(
  graphics: Graphics,
  enemy: Extract<GameEntity, { kind: "enemy" }>,
  transform: FullTransform,
) {
  const center = toFullPosition(enemy.position, transform);
  const radius = getEnemyAggroRange(enemy) * transform.cellPixelSize;

  graphics
    .circle(center.x, center.y, radius)
    .fill({ color: 0xef4444, alpha: 0.06 });
  graphics
    .circle(center.x, center.y, radius)
    .stroke({ color: 0xef4444, alpha: 0.2, width: 2 });
}

function drawTargetDummyDistanceMarkers({
  entities,
  graphics,
  layer,
  managedState,
  metrics,
  transform,
  visibleTileBounds,
}: {
  entities: GameEntity[];
  graphics: Graphics;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  for (const entity of entities) {
    if (
      entity.kind !== "enemy" ||
      (entity.id !== targetDummyId && entity.id !== aoeTargetDummyId) ||
      !isPositionInTileBounds(entity.position, visibleTileBounds)
    ) {
      continue;
    }

    const center = toFullPosition(entity.position, transform);

    for (const markerDistance of targetDummyDistanceMarkers) {
      const radius = markerDistance * transform.cellPixelSize;

      graphics
        .circle(center.x, center.y, radius)
        .stroke({ color: 0x38bdf8, alpha: 0.5, width: 2 });
      drawManagedFeedbackText({
        alpha: 0.92,
        color: 0x0ea5e9,
        fontSize: 13,
        key: `target-dummy-distance:${entity.id}:${markerDistance}`,
        layer,
        managedState,
        metrics,
        position: {
          x: center.x + radius + transform.cellPixelSize * 0.35,
          y: center.y,
        },
        text: String(markerDistance),
      });
    }
  }
}

function drawCompanionDebugCollisionShape(
  graphics: Graphics,
  entity: GameEntity,
  transform: FullTransform,
) {
  if (entity.kind !== "companion") {
    return;
  }

  const center = toFullPosition(entity.position, transform);
  const collisionShape = getEntityCollisionShape(entity);

  drawDebugCollisionShape(graphics, center, collisionShape, transform);
  graphics
    .circle(center.x, center.y, 4)
    .fill({ color: 0xfacc15, alpha: 0.95 });
}

function drawDebugCollisionShape(
  graphics: Graphics,
  center: Position,
  shape: EntityCollisionShape,
  transform: FullTransform,
) {
  const radius = shape.radius * transform.cellPixelSize;

  if (shape.kind === "circle") {
    graphics.circle(center.x, center.y, radius).fill({
      color: 0x06b6d4,
      alpha: 0.12,
    });
    graphics
      .circle(center.x, center.y, radius)
      .stroke({ color: 0x06b6d4, alpha: 0.85, width: 2 });
    return;
  }

  const width = radius * 2;
  const height = shape.height * transform.cellPixelSize;
  const top = center.y - height * shape.anchorY;

  graphics
    .roundRect(center.x - width / 2, top, width, height, radius)
    .fill({ color: 0x06b6d4, alpha: 0.12 });
  graphics
    .roundRect(center.x - width / 2, top, width, height, radius)
    .stroke({ color: 0x06b6d4, alpha: 0.85, width: 2 });
}

function drawEntityOverheadUiPass({
  warmasterAttempt,
  currentTime,
  enemyAbilityCastsByEnemyId,
  entities,
  graphics,
  layer,
  managedState,
  metrics,
  questEntityIndicators,
  statusPresentationTime,
  statusEffectsById,
  transform,
  visibleTileBounds,
}: {
  warmasterAttempt?: WarmasterAttempt;
  currentTime: number;
  enemyAbilityCastsByEnemyId: Record<string, EnemyAbilityCastState>;
  entities: GameEntity[];
  graphics: Graphics;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  questEntityIndicators: QuestEntityIndicator[];
  statusPresentationTime: number;
  statusEffectsById: Record<string, StatusEffectState>;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  const questIndicatorEntityIds = new Set(
    questEntityIndicators.map((indicator) => indicator.entityId),
  );
  const entries = entities
    .filter((entity) => isPositionInTileBounds(entity.position, visibleTileBounds))
    .map((entity) => {
      const status = getOverheadStatusPresentation({
        entityId: entity.id,
        now: statusPresentationTime,
        statusEffectsById,
      });
      const box = getEntityOverheadUiBox(entity, transform, status);
      const activeCast =
        entity.kind === "enemy"
          ? enemyAbilityCastsByEnemyId[entity.id]
          : undefined;
      const layoutBox =
        box && activeCast && activeCast.windupEndsAt > currentTime
          ? { ...box, height: box.height + 18 + (warmasterAttempt?.bossId === entity.id ? 14 : 0) }
          : box;

      return layoutBox ? { box: layoutBox, entity, status } : null;
    })
    .filter(
      (
        entry,
      ): entry is {
        box: EntityOverheadUiLayout;
        entity: GameEntity;
        status: OverheadStatusPresentation | null;
      } => Boolean(entry),
    );

  const companionBoxes: OverheadUiBox[] = [];

  for (const entry of entries.filter((candidate) => candidate.entity.kind === "companion")) {
    drawEntityOverheadUi({
      box: entry.box,
      entity: entry.entity,
      graphics,
      layer,
      managedState,
      metrics,
      status: entry.status,
    });
    companionBoxes.push(entry.box);
  }

  for (const entry of entries.filter((candidate) => candidate.entity.kind === "enemy")) {
    if (companionBoxes.some((box) => doOverheadUiBoxesOverlap(box, entry.box))) {
      continue;
    }

    drawEntityOverheadUi({
      box: entry.box,
      entity: entry.entity,
      graphics,
      layer,
      managedState,
      metrics,
      status: entry.status,
    });

    if (entry.entity.kind !== "enemy") {
      continue;
    }

    drawEnemyNameplate({
      enemy: entry.entity,
      layer,
      managedState,
      metrics,
      hasQuestIndicator: questIndicatorEntityIds.has(entry.entity.id),
      transform,
    });
    drawEnemyAbilityCastUi({
      box: entry.box,
      cast: enemyAbilityCastsByEnemyId[entry.entity.id],
      currentTime,
      enemy: entry.entity,
      graphics,
      layer,
      managedState,
      metrics,
    });
    if (warmasterAttempt?.bossId === entry.entity.id) {
      drawManagedFeedbackText({ color: 0x86efac, fontSize: 9, key: `patron-power:${entry.entity.id}`, layer, managedState, metrics, position: { x: entry.box.x + entry.box.width / 2, y: entry.box.healthY + overheadHealthHeight + 7 }, text: `Patron Power: ${warmasterAttempt.power}/10` });
    }
  }

  drawQuestEntityLabels({
    entities,
    layer,
    managedState,
    metrics,
    questIndicatorEntityIds,
    transform,
    visibleTileBounds,
  });
}

function drawEnemyAbilityCastUi({
  box,
  cast,
  currentTime,
  enemy,
  graphics,
  layer,
  managedState,
  metrics,
}: {
  box: EntityOverheadUiLayout;
  cast: EnemyAbilityCastState | undefined;
  currentTime: number;
  enemy: Extract<GameEntity, { kind: "enemy" }>;
  graphics: Graphics;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
}) {
  if (!cast || cast.windupEndsAt <= currentTime) {
    return;
  }

  const definition = getEnemyAbilityDefinition(cast.abilityId);

  if (!definition) {
    return;
  }

  const labelHeight = 10;
  const barHeight = 4;
  const gap = 2;
  const labelY = box.healthY + overheadHealthHeight + gap + (enemy.enemyTypeId === "orc_warmaster" ? 14 : 0);
  const barY = labelY + labelHeight + gap;
  const progress = getEnemyAbilityCastProgress(cast, currentTime);

  graphics
    .roundRect(box.x, labelY, box.width, labelHeight, 3)
    .fill({ color: 0x431407, alpha: 0.92 });
  graphics
    .rect(box.x, barY, box.width, barHeight)
    .fill({ color: 0x431407, alpha: 0.92 });
  graphics
    .rect(box.x, barY, box.width * progress, barHeight)
    .fill(0xf97316);

  drawManagedFeedbackText({
    color: 0xef4444,
    fontSize: 9,
    key: `enemy-ability-cast:${enemy.id}`,
    layer,
    managedState,
    metrics,
    position: {
      x: box.x + box.width / 2,
      y: labelY + labelHeight / 2,
    },
    strokeColor: 0x431407,
    strokeWidth: 3,
    text: definition.displayName,
  });
}

function getEntityOverheadUiBox(
  entity: GameEntity,
  transform: FullTransform,
  status: OverheadStatusPresentation | null,
): EntityOverheadUiLayout | null {
  if (
    entity.kind === "enemy" &&
    (entity.state === "dead" || entity.health <= 0)
  ) {
    return null;
  }

  const healthPercent = getEntityHealthPercent(entity);

  if (healthPercent === null) {
    return null;
  }

  const center = toFullPosition(entity.position, transform);
  const width = status ? 64 : Math.max(36, transform.cellPixelSize * 0.72);
  const x = center.x - width / 2;

  if (entity.kind === "enemy" && status) {
    const nameplatePosition = getEnemyNameplatePosition(entity, transform);
    const nameplateTop = nameplatePosition.y - enemyNameplateFontSize / 2;
    const statusBarY =
      nameplateTop - enemyNameplateStatusGap - overheadStatusBarHeight;
    const statusLabelY =
      statusBarY - overheadStatusLabelGap - overheadStatusLabelHeight;
    const healthY =
      nameplatePosition.y + enemyNameplateFontSize / 2 + enemyNameplateHealthGap;

    return {
      healthY,
      height: healthY + overheadHealthHeight - statusLabelY,
      statusBarY,
      statusLabelY,
      width,
      x,
      y: statusLabelY,
    };
  }

  const y = center.y - transform.cellPixelSize * (status ? 1.05 : 0.86) * (entity.kind === "enemy" ? entity.combatSizeMultiplier ?? 1 : 1);
  const statusLabelY = y;
  const statusBarY = statusLabelY + overheadStatusLabelHeight + overheadStatusLabelGap;
  const healthY = status
    ? statusBarY + overheadStatusBarHeight + overheadStatusHealthGap
    : y;

  return {
    healthY,
    height: healthY + overheadHealthHeight - y,
    statusBarY,
    statusLabelY,
    width,
    x,
    y,
  };
}

function drawEntityOverheadUi({
  box,
  entity,
  graphics,
  layer,
  managedState,
  metrics,
  status,
}: {
  box: EntityOverheadUiLayout;
  entity: GameEntity;
  graphics: Graphics;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  status: OverheadStatusPresentation | null;
}) {
  const healthPercent = getEntityHealthPercent(entity);

  if (healthPercent === null) {
    return;
  }

  const healthColor =
    healthPercent <= 0.25
      ? 0xef4444
      : healthPercent <= 0.5
        ? 0xfacc15
        : 0x22c55e;

  if (status) {
    graphics
      .roundRect(box.x, box.statusLabelY, box.width, overheadStatusLabelHeight, 3)
      .fill({ color: 0x020617, alpha: 0.94 });
    graphics
      .roundRect(box.x, box.statusBarY, box.width, overheadStatusBarHeight, 3)
      .fill({ color: status.backgroundColor, alpha: 0.9 });
    graphics
      .roundRect(
        box.x,
        box.statusBarY,
        box.width * status.fillPercent,
        overheadStatusBarHeight,
        3,
      )
      .fill({ color: status.fillColor, alpha: 0.95 });

    drawManagedFeedbackText({
      color: overheadStatusTextColor,
      fontSize: 9,
      key: `status-label:${entity.id}`,
      layer,
      managedState,
      metrics,
      position: {
        x: box.x + box.width / 2,
        y: box.statusLabelY + overheadStatusLabelHeight / 2,
      },
      strokeColor: overheadStatusTextStrokeColor,
      strokeWidth: overheadStatusTextStrokeWidth,
      text: status.label,
    });
  }

  graphics
    .rect(box.x, box.healthY, box.width, overheadHealthHeight)
    .fill({ color: 0x0f172a, alpha: 0.9 });
  graphics
    .rect(box.x, box.healthY, box.width * healthPercent, overheadHealthHeight)
    .fill(healthColor);
}

function getEnemyNameplateText(
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

function getEnemyNameplateColor(
  enemy: Extract<GameEntity, { kind: "enemy" }>,
): number {
  return enemy.aggressionMode === "aggressive"
    ? aggressiveEnemyNameplateColor
    : passiveEnemyNameplateColor;
}

function getEnemyNameplatePosition(
  enemy: Extract<GameEntity, { kind: "enemy" }>,
  transform: FullTransform,
) {
  const center = toFullPosition(enemy.position, transform);

  return {
    x: center.x,
    y: center.y - transform.cellPixelSize * 1.32 * (enemy.combatSizeMultiplier ?? 1),
  };
}

function drawEnemyNameplate({
  enemy,
  hasQuestIndicator,
  layer,
  managedState,
  metrics,
  transform,
}: {
  enemy: Extract<GameEntity, { kind: "enemy" }>;
  hasQuestIndicator: boolean;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  transform: FullTransform;
}) {
  if (enemy.state === "dead" || enemy.health <= 0) {
    return;
  }

  const nameplate = drawManagedFeedbackText({
    color: getEnemyNameplateColor(enemy),
    fontSize: enemyNameplateFontSize,
    key: `enemy-nameplate:${enemy.id}`,
    layer,
    managedState,
    metrics,
    position: getEnemyNameplatePosition(enemy, transform),
    text: getEnemyNameplateText(enemy),
  });

  if (hasQuestIndicator) {
    drawQuestNameplatePrefix({
      fontSize: enemyNameplateFontSize + 1,
      key: `quest-entity-indicator:${enemy.id}`,
      layer,
      managedState,
      metrics,
      nameplate,
    });
  }
}

function drawQuestEntityLabels({
  entities,
  layer,
  managedState,
  metrics,
  questIndicatorEntityIds,
  transform,
  visibleTileBounds,
}: {
  entities: GameEntity[];
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  questIndicatorEntityIds: Set<string>;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  for (const entity of entities) {
    if (
      !questIndicatorEntityIds.has(entity.id) ||
      !isPositionInTileBounds(entity.position, visibleTileBounds) ||
      (entity.kind !== "npc" && entity.kind !== "resource")
    ) {
      continue;
    }

    if (entity.kind === "resource" && !isActiveResource(entity)) {
      continue;
    }

    const text = getQuestEntityLabelText(entity);

    if (!text) {
      continue;
    }

    const label = drawManagedFeedbackText({
      color: 0xf8fafc,
      fontSize: questEntityLabelFontSize,
      key: `quest-entity-label:${entity.id}`,
      layer,
      managedState,
      metrics,
      position: getQuestEntityLabelPosition(entity, transform),
      strokeColor: 0x0f172a,
      strokeWidth: 4,
      text,
    });

    drawQuestNameplatePrefix({
      fontSize: questEntityLabelFontSize + 1,
      key: `quest-entity-indicator:${entity.id}`,
      layer,
      managedState,
      metrics,
      nameplate: label,
    });
  }
}

function getQuestEntityLabelText(entity: GameEntity): string | null {
  if (entity.kind === "npc") {
    return entity.displayName;
  }

  if (entity.kind === "resource") {
    return {
      herb: "Herb",
      ore: "Ore",
      wood: "Wood",
    }[entity.resourceType];
  }

  return null;
}

function getQuestEntityLabelPosition(
  entity: GameEntity,
  transform: FullTransform,
): Position {
  const center = toFullPosition(entity.position, transform);

  return {
    x: center.x,
    y: center.y - transform.cellPixelSize * 1.08,
  };
}

function drawQuestNameplatePrefix({
  fontSize,
  key,
  layer,
  managedState,
  metrics,
  nameplate,
}: {
  fontSize: number;
  key: string;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  nameplate: Text;
}) {
  drawManagedFeedbackText({
    color: questEntityIndicatorColor,
    fontSize,
    key,
    layer,
    managedState,
    metrics,
    position: {
      x: nameplate.x - nameplate.width / 2 - questEntityNameplateGap,
      y: nameplate.y,
    },
    strokeColor: questEntityIndicatorStrokeColor,
    strokeWidth: 4,
    text: "!",
  });
}

function drawEnemyAttackWindupBar(
  graphics: Graphics,
  entity: GameEntity,
  currentTime: number,
  transform: FullTransform,
) {
  if (
    entity.kind !== "enemy" ||
    entity.state === "dead" ||
    entity.health <= 0 ||
    entity.attackWindupStartedAt === undefined
  ) {
    return;
  }

  const durationMs = entity.attackWindupDurationMs ?? 500;
  const windupPercent = Math.max(
    0,
    Math.min(1, (currentTime - entity.attackWindupStartedAt) / durationMs),
  );
  const center = toFullPosition(entity.position, transform);
  const width = transform.cellPixelSize * 0.72;
  const height = 3;
  const x = center.x - width / 2;
  const y = center.y - transform.cellPixelSize * 0.48 - height - 3;

  graphics.rect(x, y, width, height).fill({ color: 0x451a03, alpha: 0.86 });
  graphics.rect(x, y, width * windupPercent, height).fill(0xf97316);
}

function drawFallbackEntity(
  graphics: Graphics,
  entity: GameEntity,
  currentTime: number,
  transform: FullTransform,
  tint: EntityTint | null = null,
) {
  const entityPosition = toFullPosition(entity.position, transform);
  const entityRadius = Math.max(8, transform.cellPixelSize * 0.33);
  const alpha = getEntityRenderAlpha(entity, currentTime);

  graphics
    .circle(entityPosition.x, entityPosition.y, entityRadius)
    .fill({ color: getEntityColor(entity), alpha });

  if (tint) {
    graphics
      .circle(entityPosition.x, entityPosition.y, entityRadius)
      .fill({ color: tint.color, alpha: tint.alpha });
  }
}

function updateSpriteVisualState({
  alpha,
  anchorX,
  anchorY,
  height,
  position,
  rotation,
  sprite,
  tint,
  width,
}: {
  alpha: number;
  anchorX: number;
  anchorY: number;
  height: number;
  position: Position;
  rotation: number;
  sprite: Sprite;
  tint?: number;
  width: number;
}) {
  sprite.anchor.set(anchorX, anchorY);
  sprite.alpha = alpha;
  sprite.position.set(position.x, position.y);
  sprite.rotation = rotation;
  sprite.tint = tint ?? 0xffffff;
  sprite.visible = true;
  sprite.width = width;
  sprite.height = height;
}

function drawManagedImageSprite({
  alpha = 1,
  anchorX = 0.5,
  anchorY = 1,
  cache,
  height,
  key,
  layer,
  managedState,
  metrics,
  position,
  requestRedraw,
  rotation = 0,
  src,
  tint,
  width,
}: {
  alpha?: number;
  anchorX?: number;
  anchorY?: number;
  cache: TextureCache;
  height: number;
  key: string;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  position: Position;
  requestRedraw?: () => void;
  rotation?: number;
  src: string;
  tint?: number;
  width: number;
}): boolean {
  const texture = requestTexture(
    src,
    cache,
    requestRedraw,
    cache.durableTextureSrcs.has(src)
      ? { durable: true }
      : { mapId: cache.currentMapId ?? undefined },
  );
  const existingEntry = managedState.sprites.get(key);

  if (!texture) {
    if (!existingEntry || existingEntry.src !== src) {
      return false;
    }

    managedState.activeSpriteKeys.add(key);
    updateSpriteVisualState({
      alpha,
      anchorX,
      anchorY,
      height,
      position,
      rotation,
      sprite: existingEntry.sprite,
      tint,
      width,
    });
    metrics.spriteReuses += 1;
    metrics.drawnSprites += 1;
    return true;
  }

  if (existingEntry) {
    if (existingEntry.layer !== layer) {
      existingEntry.layer.removeChild(existingEntry.sprite);
      layer.addChild(existingEntry.sprite);
      existingEntry.layer = layer;
    }

    if (existingEntry.src !== src) {
      existingEntry.sprite.texture = texture;
      existingEntry.src = src;
    }

    managedState.activeSpriteKeys.add(key);
    updateSpriteVisualState({
      alpha,
      anchorX,
      anchorY,
      height,
      position,
      rotation,
      sprite: existingEntry.sprite,
      tint,
      width,
    });
    metrics.spriteReuses += 1;
    metrics.drawnSprites += 1;
    return true;
  }

  const sprite = new Sprite(texture);
  updateSpriteVisualState({
    alpha,
    anchorX,
    anchorY,
    height,
    position,
    rotation,
    sprite,
    tint,
    width,
  });
  layer.addChild(sprite);
  managedState.sprites.set(key, { layer, sprite, src });
  managedState.activeSpriteKeys.add(key);
  metrics.spriteCreates += 1;
  metrics.drawnSprites += 1;

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
      visualMovement?.angleDegrees,
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

function getEntitySpriteLayout(
  entity: GameEntity,
  cellPixelSize: number,
  visualAsset: ReturnType<typeof getEntityVisualAsset>,
): EntitySpriteLayout {
  if (entity.kind === "enemy") {
    const naturalSize =
      visualAsset.kind === "image" || visualAsset.kind === "sprite"
        ? visualAsset.naturalSize
        : undefined;
    const variantScale = (isSuperiorEnemy(entity) ? SUPERIOR_ENEMY_RENDER_SCALE : 1) * (entity.combatSizeMultiplier ?? 1);

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

function getEntityRenderAlpha(entity: GameEntity, currentTime: number): number {
  if (entity.kind !== "enemy" || entity.state !== "dead") {
    return 1;
  }

  const defeatedAtMs = entity.defeatedAtMs ?? currentTime;
  const fadeProgress = Math.min(
    1,
    Math.max(0, (currentTime - defeatedAtMs) / deadEnemyFadeDurationMs),
  );

  return 1 - fadeProgress;
}

function getEntityFeedbackTint({
  combatFeedbackEvents,
  currentTime,
  entity,
  skillShieldBlocksById,
}: {
  combatFeedbackEvents: CombatFeedbackEvent[];
  currentTime: number;
  entity: GameEntity;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
}): EntityTint | null {
  if (entity.state === "dead") {
    return { color: 0x64748b, alpha: 0.5 };
  }

  const recentEvents = combatFeedbackEvents.filter(
    (event) =>
      event.entityId === entity.id &&
      currentTime - event.createdAt <= entityFeedbackTintDurationMs,
  );

  if (recentEvents.some(isHealingNumberFeedback)) {
    return { color: 0xd9f99d, alpha: 0.5 };
  }

  if (recentEvents.some(isDamageNumberFeedback)) {
    return { color: 0xef4444, alpha: 0.5 };
  }

  if (
    entity.kind === "companion" &&
    Object.values(skillShieldBlocksById).some(
      (shield) => shield.ownerId === entity.id && shield.expiresAt > currentTime,
    )
  ) {
    return { color: 0xe0f2fe, alpha: 0.5 };
  }

  return null;
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

function getSkillVisualPresentation(event: SkillVisualEvent): {
  src: string | undefined;
  width: number;
  height: number;
  endOpacity?: number;
} {
  const presentation = event.skillId
    ? SKILL_VISUAL_PRESENTATION[event.skillId]
    : undefined;

  if (!presentation) {
    return {
      src: getSkillVisualIconSrc(event),
      width: 50,
      height: 50,
    };
  }

  if (event.targetId && presentation.targetedSrc) {
    return {
      src: presentation.targetedSrc,
      width: presentation.targetedWidth ?? presentation.width,
      height: presentation.targetedHeight ?? presentation.height,
      endOpacity: presentation.endOpacity,
    };
  }

  return {
    src: presentation.src,
    width: presentation.width,
    height: presentation.height,
    endOpacity: presentation.endOpacity,
  };
}

export function getSkillVisualOpacity(
  event: SkillVisualEvent,
  currentTime: number,
  endOpacity?: number,
): number {
  if (endOpacity === undefined) {
    return 1;
  }

  const durationMs = Math.max(1, event.expiresAt - event.createdAt);
  const progress = clamp((currentTime - event.createdAt) / durationMs, 0, 1);

  return 1 + (endOpacity - 1) * progress;
}

function createFeedbackText({
  color,
  fontSize = defaultFeedbackFontSize,
  strokeColor = 0xffffff,
  strokeWidth = 3,
  text,
}: {
  color: number;
  fontSize?: number;
  strokeColor?: number;
  strokeWidth?: number;
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
      stroke: { color: strokeColor, width: strokeWidth },
    },
  });

  label.anchor.set(0.5);

  return label;
}

function getFeedbackTextStyleKey({
  color,
  fontSize,
  strokeColor = 0xffffff,
  strokeWidth = 3,
}: {
  color: number;
  fontSize: number;
  strokeColor?: number;
  strokeWidth?: number;
}): string {
  return `${color}:${fontSize}:${strokeColor}:${strokeWidth}`;
}

function drawManagedFeedbackText({
  alpha = 1,
  color,
  fontSize = defaultFeedbackFontSize,
  key,
  layer,
  managedState,
  metrics,
  position,
  rotation = 0,
  strokeColor,
  strokeWidth,
  text,
}: {
  alpha?: number;
  color: number;
  fontSize?: number;
  key: string;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  position: Position;
  rotation?: number;
  strokeColor?: number;
  strokeWidth?: number;
  text: string;
}) {
  const styleKey = getFeedbackTextStyleKey({
    color,
    fontSize,
    strokeColor,
    strokeWidth,
  });
  const existingEntry = managedState.texts.get(key);

  if (existingEntry && existingEntry.styleKey === styleKey) {
    if (existingEntry.layer !== layer) {
      existingEntry.layer.removeChild(existingEntry.text);
      layer.addChild(existingEntry.text);
      existingEntry.layer = layer;
    }

    existingEntry.text.text = text;
    existingEntry.text.alpha = alpha;
    existingEntry.text.position.set(position.x, position.y);
    existingEntry.text.rotation = rotation;
    existingEntry.text.scale.set(1);
    managedState.activeTextKeys.add(key);
    metrics.textReuses += 1;
    metrics.drawnTexts += 1;
    return existingEntry.text;
  }

  if (existingEntry) {
    managedState.texts.delete(key);
    destroyManagedTextEntry(existingEntry);
  }

  const label = createFeedbackText({
    color,
    fontSize,
    strokeColor,
    strokeWidth,
    text,
  });

  label.alpha = alpha;
  label.position.set(position.x, position.y);
  label.rotation = rotation;
  label.scale.set(1);
  layer.addChild(label);
  managedState.texts.set(key, { layer, styleKey, text: label });
  managedState.activeTextKeys.add(key);
  metrics.textCreates += 1;
  metrics.drawnTexts += 1;

  return label;
}

function getCombatFeedbackFontSize(event: CombatFeedbackEvent): number {
  if (
    skillFeedbackDisplayNames.has(event.text) ||
    isDamageNumberFeedback(event) ||
    event.text === "Critical"
  ) {
    return emphasizedFeedbackFontSize;
  }

  if (event.text === "Dodged" || event.text === "Blocked") {
    return defaultFeedbackFontSize;
  }

  return defaultFeedbackFontSize;
}

function isDamageNumberFeedback(event: CombatFeedbackEvent): boolean {
  return event.type === "damage" && /^-\d+( HP)?$/.test(event.text);
}

function isHealingNumberFeedback(event: CombatFeedbackEvent): boolean {
  return event.type === "heal" && /^\+\d+ HP$/.test(event.text);
}

function getCombatFeedbackLaneKey(event: CombatFeedbackEvent): string {
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
      event.dotStatusType ?? "direct",
    ].join(":");
  }

  return ["feedback-event", event.id, event.type].join(":");
}

function hasPairedCriticalFeedback(
  event: CombatFeedbackEvent,
  combatFeedbackEvents: CombatFeedbackEvent[],
): boolean {
  if (!isDamageNumberFeedback(event)) {
    return false;
  }

  return combatFeedbackEvents.some(
    (candidate) =>
      candidate.entityId === event.entityId &&
      candidate.createdAt === event.createdAt &&
      candidate.text === "Critical",
  );
}

function shouldDrawSkippedFrequentEffect(event: CombatFeedbackEvent): boolean {
  const hash = Array.from(event.id).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return hash % 2 === 0;
}

function getCombatFeedbackColor(
  event: CombatFeedbackEvent,
  isCriticalDamage = false,
): number {
  if (isCriticalDamage || event.text === "Critical") {
    return 0xf97316;
  }

  if (event.text === "Blocked") {
    return 0x38bdf8;
  }

  if (event.text === "Dodged") {
    return 0xcbd5e1;
  }

  if (isDamageNumberFeedback(event)) {
    return 0xf43f1f;
  }

  if (isHealingNumberFeedback(event) || event.type === "heal") {
    return 0x65a30d;
  }

  const colorByType = {
    attack: 0x1d4ed8,
    damage: 0xb91c1c,
    death: 0x111827,
    enemy_spotted: 0xdc2626,
    gather: 0x047857,
    heal: 0x65a30d,
    level_up: 0xfacc15,
  } satisfies Record<CombatFeedbackEvent["type"], number>;

  return colorByType[event.type];
}

function getResourceHitEffectSrc(resource: Extract<GameEntity, { kind: "resource" }>): string {
  if (resource.resourceType === "ore") {
    return resourceHitOreSrc;
  }

  if (resource.resourceType === "herb") {
    return resourceHitHerbSrc;
  }

  return resourceHitWoodSrc;
}

function shouldDrawCombatFeedbackEvent(
  event: CombatFeedbackEvent,
  entity: GameEntity,
): boolean {
  if (event.type === "enemy_spotted" || event.type === "level_up") {
    return false;
  }

  if (
    event.type === "attack" &&
    (event.text === "Attack" || entity.kind === "enemy")
  ) {
    return false;
  }

  if (event.type === "death" && entity.kind === "enemy") {
    return false;
  }

  return true;
}

function getCombatFeedbackLifetimeProgress(
  event: CombatFeedbackEvent,
  currentTime: number,
): number {
  const duration = event.expiresAt - event.createdAt;

  if (duration <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, (currentTime - event.createdAt) / duration));
}

function getLevelUpBurstPresentation(
  event: CombatFeedbackEvent,
  currentTime: number,
): { alpha: number; scale: number } {
  const progress = getCombatFeedbackLifetimeProgress(event, currentTime);

  return {
    alpha: 1 - progress * 0.7,
    scale: 1 + progress,
  };
}

function getDamageNumberProgress(event: CombatFeedbackEvent, currentTime: number): number {
  return Math.min(
    1,
    Math.max(0, (currentTime - event.createdAt) / damageNumberAnimationDurationMs),
  );
}

function getDamageNumberDirection(event: CombatFeedbackEvent): -1 | 1 {
  const hash = Array.from(event.id).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return hash % 2 === 0 ? -1 : 1;
}

function getCombatFeedbackPosition(
  event: CombatFeedbackEvent,
  entity: GameEntity,
  currentTime: number,
  map: GameMap,
  transform: FullTransform,
): Position {
  const center = toFullPosition(entity.position, transform);

  if (!isDamageNumberFeedback(event)) {
    return {
      x: center.x,
      y: center.y + (event.type === "attack" ? -34 : -18),
    };
  }

  const visualAsset = getEntityVisualAsset(entity, map.id);
  const layout = getEntitySpriteLayout(
    entity,
    transform.cellPixelSize,
    visualAsset,
  );
  const progress = getDamageNumberProgress(event, currentTime);
  const easedProgress = 1 - (1 - progress) * (1 - progress);
  const direction = getDamageNumberDirection(event);

  return {
    x: center.x + direction * damageNumberDriftPixels * easedProgress,
    y:
      center.y +
      transform.cellPixelSize / 2 -
      layout.anchorY * layout.height -
      6 -
      damageNumberRisePixels * easedProgress,
  };
}

function applyDamageNumberAnimation(
  label: Text,
  event: CombatFeedbackEvent,
  currentTime: number,
) {
  const progress = getDamageNumberProgress(event, currentTime);
  const direction = getDamageNumberDirection(event);

  label.alpha = 1 - progress;
  label.rotation = direction * damageNumberRotationRadians * progress;
  label.scale.set(1 - progress * 0.3);
}

function getEntityById(entities: GameEntity[]) {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function getSameMomentAttacker(
  event: CombatFeedbackEvent,
  combatFeedbackEvents: CombatFeedbackEvent[],
  entitiesById: Map<string, GameEntity>,
): GameEntity | undefined {
  const attackEvent = combatFeedbackEvents.find(
    (candidate) =>
      candidate.createdAt === event.createdAt &&
      candidate.type === "attack" &&
      candidate.entityId !== event.entityId,
  );

  return attackEvent ? entitiesById.get(attackEvent.entityId) : undefined;
}

function drawBetweenEntitiesEffect({
  alpha = 1,
  cache,
  currentTime,
  event,
  eventEntity,
  eventPosition,
  height,
  layer,
  managedState,
  metrics,
  requestRedraw,
  source,
  src,
  target,
  transform,
  width,
}: {
  alpha?: number;
  cache: TextureCache;
  currentTime: number;
  event: CombatFeedbackEvent;
  eventEntity: GameEntity;
  eventPosition: Position;
  height: number;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  source?: GameEntity;
  src: string;
  target?: GameEntity;
  transform: FullTransform;
  width: number;
}) {
  const sourcePosition = source
    ? toFullPosition(source.position, transform)
    : undefined;
  const targetPosition = target
    ? toFullPosition(target.position, transform)
    : toFullPosition(eventEntity.position, transform);
  const progress = getDamageNumberProgress(event, currentTime);
  const effectPosition = sourcePosition
    ? {
        x: sourcePosition.x + (targetPosition.x - sourcePosition.x) * 0.72,
        y: sourcePosition.y + (targetPosition.y - sourcePosition.y) * 0.72,
      }
    : eventPosition;
  const rotation = sourcePosition
    ? Math.atan2(
        targetPosition.y - sourcePosition.y,
        targetPosition.x - sourcePosition.x,
      )
    : 0;

  drawManagedImageSprite({
    alpha: alpha * (1 - progress),
    anchorX: 0.5,
    anchorY: 0.5,
    cache,
    height,
    key: `feedback-sprite:${event.id}:${src}`,
    layer,
    managedState,
    metrics,
    position: effectPosition,
    requestRedraw,
    rotation,
    src,
    width,
  });
}

function drawCombatFeedbackSpriteEffect({
  cache,
  combatFeedbackEvents,
  currentTime,
  entitiesById,
  entity,
  event,
  layer,
  map,
  managedState,
  metrics,
  requestRedraw,
  transform,
}: {
  cache: TextureCache;
  combatFeedbackEvents: CombatFeedbackEvent[];
  currentTime: number;
  entitiesById: Map<string, GameEntity>;
  entity: GameEntity;
  event: CombatFeedbackEvent;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  transform: FullTransform;
}) {
  const position = getCombatFeedbackPosition(
    event,
    entity,
    currentTime,
    map,
    transform,
  );
  const progress = getDamageNumberProgress(event, currentTime);

  if (event.type === "enemy_spotted") {
    const center = toFullPosition(entity.position, transform);
    const lifetimeProgress = getCombatFeedbackLifetimeProgress(event, currentTime);

    drawManagedImageSprite({
      alpha: 1 - lifetimeProgress * 0.25,
      anchorX: 0.5,
      anchorY: 1,
      cache,
      height: 34,
      key: `feedback-sprite:${event.id}:${enemySpottedAlertSrc}`,
      layer,
      managedState,
      metrics,
      position: {
        x: center.x,
        y: center.y - transform.cellPixelSize * 0.65,
      },
      requestRedraw,
      src: enemySpottedAlertSrc,
      width: 34,
    });
  }

  if (event.type === "level_up") {
    const center = toFullPosition(entity.position, transform);
    const presentation = getLevelUpBurstPresentation(event, currentTime);
    const baseSize = 42;

    drawManagedImageSprite({
      alpha: presentation.alpha,
      anchorX: 0.5,
      anchorY: 0.5,
      cache,
      height: baseSize * presentation.scale,
      key: `feedback-sprite:${event.id}:${levelUpBurstSrc}`,
      layer,
      managedState,
      metrics,
      position: {
        x: center.x,
        y: center.y - transform.cellPixelSize * 0.55,
      },
      requestRedraw,
      src: levelUpBurstSrc,
      width: baseSize * presentation.scale,
    });
  }

  if (event.text === "Dodged" && shouldDrawSkippedFrequentEffect(event)) {
    drawManagedImageSprite({
      alpha: 0.72 * (1 - progress),
      anchorX: 0.5,
      anchorY: 0.5,
      cache,
      height: 26,
      key: `feedback-sprite:${event.id}:${missEvadePuffSrc}`,
      layer,
      managedState,
      metrics,
      position: {
        x: position.x + transform.cellPixelSize * 0.35,
        y: position.y + transform.cellPixelSize * 0.12,
      },
      requestRedraw,
      src: missEvadePuffSrc,
      width: 26,
    });
  }

  if (event.text === "Blocked") {
    const source =
      event.type === "attack"
        ? entity
        : getSameMomentAttacker(event, combatFeedbackEvents, entitiesById);
    const target =
      event.type === "attack" && "currentTargetId" in entity
        ? entitiesById.get(entity.currentTargetId ?? "")
        : entity;

    drawBetweenEntitiesEffect({
      alpha: 0.9,
      cache,
      currentTime,
      event,
      eventEntity: entity,
      eventPosition: position,
      height: 36,
      layer,
      managedState,
      metrics,
      requestRedraw,
      source,
      src: blockImpactSrc,
      target,
      transform,
      width: 36,
    });

    if (event.type === "attack" && target) {
      const targetPosition = toFullPosition(target.position, transform);

      drawManagedImageSprite({
        alpha: 0.85 * (1 - progress),
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 34,
        key: `feedback-sprite:${event.id}:${shieldInvulnerableGlintSrc}`,
        layer,
        managedState,
        metrics,
        position: targetPosition,
        requestRedraw,
        src: shieldInvulnerableGlintSrc,
        width: 34,
      });
    }
  }

  if (isHealingNumberFeedback(event)) {
    drawManagedImageSprite({
      alpha: 0.84 * (1 - progress),
      anchorX: 0.5,
      anchorY: 0.5,
      cache,
      height: 36,
      key: `feedback-sprite:${event.id}:${healSparkleSrc}`,
      layer,
      managedState,
      metrics,
      position: {
        x: position.x,
        y: position.y + transform.cellPixelSize * 0.18,
      },
      requestRedraw,
      src: healSparkleSrc,
      width: 36,
    });
  }

  if (event.type === "death") {
    const center = toFullPosition(entity.position, transform);

    drawManagedImageSprite({
      alpha: 0.82 * (1 - progress),
      anchorX: 0.5,
      anchorY: 0.5,
      cache,
      height: 42,
      key: `feedback-sprite:${event.id}:${deathDownedPuffSrc}`,
      layer,
      managedState,
      metrics,
      position: center,
      requestRedraw,
      src: deathDownedPuffSrc,
      width: 42,
    });
  }

  if (event.type === "gather" && event.text === "Gather") {
    const resource =
      "currentTargetId" in entity
        ? entitiesById.get(entity.currentTargetId ?? "")
        : undefined;

    if (resource?.kind === "resource") {
      const resourcePosition = toFullPosition(resource.position, transform);

      const resourceHitSrc = getResourceHitEffectSrc(resource);
      drawManagedImageSprite({
        alpha: 0.82 * (1 - progress),
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 34,
        key: `feedback-sprite:${event.id}:${resourceHitSrc}`,
        layer,
        managedState,
        metrics,
        position: resourcePosition,
        requestRedraw,
        src: resourceHitSrc,
        width: 34,
      });
    }
  }

  if (event.type === "gather" && entity.kind === "resource") {
    const resourcePosition = toFullPosition(entity.position, transform);

    if (entity.isDepleted) {
      drawManagedImageSprite({
        alpha: 0.78 * (1 - progress),
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 38,
        key: `feedback-sprite:${event.id}:${resourceDepletedPuffSrc}`,
        layer,
        managedState,
        metrics,
        position: resourcePosition,
        requestRedraw,
        src: resourceDepletedPuffSrc,
        width: 38,
      });
    }

    if (event.text === "Inventory Full") {
      drawManagedImageSprite({
        alpha: 0.92 * (1 - progress),
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 38,
        key: `feedback-sprite:${event.id}:${inventoryFullWarningSrc}`,
        layer,
        managedState,
        metrics,
        position: {
          x: resourcePosition.x,
          y: resourcePosition.y - transform.cellPixelSize * 0.62,
        },
        requestRedraw,
        src: inventoryFullWarningSrc,
        width: 38,
      });
    } else {
      drawManagedImageSprite({
        alpha: 0.86 * (1 - progress),
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 34,
        key: `feedback-sprite:${event.id}:${gatherCompleteSparkleSrc}`,
        layer,
        managedState,
        metrics,
        position: {
          x: resourcePosition.x,
          y: resourcePosition.y - transform.cellPixelSize * 0.4,
        },
        requestRedraw,
        src: gatherCompleteSparkleSrc,
        width: 34,
      });
    }
  }
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

function drawEnemyAbilityAreas(
  graphics: Graphics,
  castsByEnemyId: Record<string, EnemyAbilityCastState>,
  currentTime: number,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  for (const cast of Object.values(castsByEnemyId)) {
    if (
      !cast.area ||
      !cast.visualIntent ||
      cast.windupEndsAt <= currentTime ||
      !doAoeBoundsIntersect(cast.area.bounds, visibleTileBounds)
    ) {
      continue;
    }

    drawResolvedAoeArea(graphics, {
      area: cast.area,
      transform,
      intent: cast.visualIntent,
      opacity: 0.55,
    });
  }
}

function drawEnemyAoeChannels(
  graphics: Graphics,
  channelsByCasterId: Record<string, EnemyAoeChannelState>,
  currentTime: number,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  for (const channel of Object.values(channelsByCasterId)) {
    if (!doAoeBoundsIntersect(channel.area.bounds, visibleTileBounds)) {
      continue;
    }

    const channelProgress = getEnemyAoeChannelProgress(channel, currentTime);
    const dangerOpacity = channel.phase === "windup" ? 1 : channelProgress;

    drawResolvedAoeArea(graphics, {
      area: channel.area,
      transform,
      intent: "enemyOffensive",
      opacity: dangerOpacity,
    });
  }
}

function drawCompanionAoeChannels(
  graphics: Graphics,
  channelsByCasterId: Record<string, CompanionAoeChannelState>,
  currentTime: number,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  for (const channel of Object.values(channelsByCasterId)) {
    if (
      !doAoeBoundsIntersect(channel.area.bounds, visibleTileBounds) ||
      channel.channelEndsAt <= currentTime
    ) {
      continue;
    }

    const duration = channel.channelEndsAt - channel.startedAt;
    const progress =
      duration <= 0
        ? 1
        : Math.max(0, Math.min(1, (currentTime - channel.startedAt) / duration));

    drawResolvedAoeArea(graphics, {
      area: channel.area,
      transform,
      intent: channel.visualIntent,
      opacity: 0.35 + progress * 0.65,
    });
  }
}

function drawResolvedAoeArea(
  graphics: Graphics,
  options: {
    area: ResolvedAoeArea;
    transform: FullTransform;
    intent: AoeVisualIntent;
    opacity: number;
  },
) {
  for (const primitive of options.area.primitives) {
    if (primitive.type === "circle") {
      drawAoeCircle(graphics, {
        center: toFullPosition(primitive.center, options.transform),
        radiusPx: primitive.radius * options.transform.cellPixelSize,
        intent: options.intent,
        opacity: options.opacity,
      });
      continue;
    }

    if (primitive.type === "ring") {
      drawAoeRing(graphics, {
        center: toFullPosition(primitive.center, options.transform),
        innerRadiusPx: primitive.innerRadius * options.transform.cellPixelSize,
        outerRadiusPx: primitive.outerRadius * options.transform.cellPixelSize,
        intent: options.intent,
        opacity: options.opacity,
      });
      continue;
    }

    if (primitive.type === "square") {
      drawAoeSquare(
        graphics,
        primitive,
        options.transform,
        options.intent,
        options.opacity,
      );
      continue;
    }

    if (primitive.type === "rectangle") {
      drawAoeRectangle(
        graphics,
        primitive,
        options.transform,
        options.intent,
        options.opacity,
      );
      continue;
    }

    drawAoeCone(
      graphics,
      primitive,
      options.transform,
      options.intent,
      options.opacity,
    );
  }
}

function drawAoeRectangle(
  graphics: Graphics,
  rectangle: ResolvedAoeRectangle,
  transform: FullTransform,
  intent: AoeVisualIntent,
  opacity: number,
) {
  const style = getAoeShapeStyle(intent, opacity);
  const halfWidth = rectangle.width / 2;
  const halfHeight = rectangle.height / 2;
  const cosine = Math.cos(rectangle.rotationRadians);
  const sine = Math.sin(rectangle.rotationRadians);
  const points = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].flatMap((corner) => {
    const worldPosition = {
      x: rectangle.center.x + corner.x * cosine - corner.y * sine,
      y: rectangle.center.y + corner.x * sine + corner.y * cosine,
    };
    const pixelPosition = toFullPosition(worldPosition, transform);
    return [pixelPosition.x, pixelPosition.y];
  });

  graphics
    .poly(points)
    .fill({ color: style.fillColor, alpha: style.fillAlpha })
    .stroke({ color: style.strokeColor, alpha: style.strokeAlpha, width: 3 });
}

function drawAoeRing(
  graphics: Graphics,
  options: {
    center: Position;
    innerRadiusPx: number;
    outerRadiusPx: number;
    intent: AoeVisualIntent;
    opacity: number;
  },
) {
  const style = getAoeShapeStyle(options.intent, options.opacity);
  const ringWidth = Math.max(0, options.outerRadiusPx - options.innerRadiusPx);
  const middleRadius = options.innerRadiusPx + ringWidth / 2;

  if (ringWidth > 0) {
    graphics.circle(options.center.x, options.center.y, middleRadius).stroke({
      color: style.fillColor,
      alpha: style.fillAlpha,
      width: ringWidth,
    });
  }

  graphics
    .circle(options.center.x, options.center.y, options.outerRadiusPx)
    .stroke({ color: style.strokeColor, alpha: style.strokeAlpha, width: 3 });

  if (options.innerRadiusPx > 0) {
    graphics
      .circle(options.center.x, options.center.y, options.innerRadiusPx)
      .stroke({ color: style.strokeColor, alpha: style.strokeAlpha, width: 3 });
  }
}

function drawAoeSquare(
  graphics: Graphics,
  square: ResolvedAoeSquare,
  transform: FullTransform,
  intent: AoeVisualIntent,
  opacity: number,
) {
  const style = getAoeShapeStyle(intent, opacity);
  const halfSize = square.size / 2;
  const cosine = Math.cos(square.rotationRadians);
  const sine = Math.sin(square.rotationRadians);
  const points = [
    { x: -halfSize, y: -halfSize },
    { x: halfSize, y: -halfSize },
    { x: halfSize, y: halfSize },
    { x: -halfSize, y: halfSize },
  ].flatMap((corner) => {
    const worldPosition = {
      x: square.center.x + corner.x * cosine - corner.y * sine,
      y: square.center.y + corner.x * sine + corner.y * cosine,
    };
    const pixelPosition = toFullPosition(worldPosition, transform);
    return [pixelPosition.x, pixelPosition.y];
  });

  graphics
    .poly(points)
    .fill({ color: style.fillColor, alpha: style.fillAlpha })
    .stroke({ color: style.strokeColor, alpha: style.strokeAlpha, width: 3 });
}

function drawAoeCone(
  graphics: Graphics,
  cone: ResolvedAoeCone,
  transform: FullTransform,
  intent: AoeVisualIntent,
  opacity: number,
) {
  const style = getAoeShapeStyle(intent, opacity);
  const directionAngle = Math.atan2(cone.direction.y, cone.direction.x);
  const halfAngle = cone.angleRadians / 2;
  const arcSteps = Math.max(8, Math.ceil(cone.angleRadians / (Math.PI / 24)));
  const worldPoints: Position[] = [{ ...cone.origin }];

  for (let step = 0; step <= arcSteps; step += 1) {
    const angle = directionAngle - halfAngle + (cone.angleRadians * step) / arcSteps;
    worldPoints.push({
      x: cone.origin.x + Math.cos(angle) * cone.range,
      y: cone.origin.y + Math.sin(angle) * cone.range,
    });
  }

  const points = worldPoints.flatMap((position) => {
    const pixelPosition = toFullPosition(position, transform);
    return [pixelPosition.x, pixelPosition.y];
  });

  graphics
    .poly(points)
    .fill({ color: style.fillColor, alpha: style.fillAlpha })
    .stroke({ color: style.strokeColor, alpha: style.strokeAlpha, width: 3 });
}

function getAoeShapeStyle(
  intent: AoeVisualIntent,
  opacity: number,
) {
  const alpha = Math.min(1, Math.max(0, opacity));

  if (intent === "enemyOffensive") {
    return {
      fillColor: enemyAoeFillColor,
      fillAlpha: 0.13 + alpha * 0.5,
      strokeColor: enemyAoeStrokeColor,
      strokeAlpha: 0.48 + alpha * 0.52,
    };
  }

  if (intent === "enemySupportive") {
    return {
      fillColor: enemySupportiveAoeFillColor,
      fillAlpha: 0.05 + alpha * 0.1,
      strokeColor: enemySupportiveAoeStrokeColor,
      strokeAlpha: 0.42 + alpha * 0.4,
    };
  }

  if (intent === "partyHealing") {
    return {
      fillColor: partyHealingAoeFillColor,
      fillAlpha: 0.08 + alpha * 0.14,
      strokeColor: partyHealingAoeStrokeColor,
      strokeAlpha: 0.54 + alpha * 0.36,
    };
  }

  return {
    fillColor: partyOffensiveAoeFillColor,
    fillAlpha: 0.1 + alpha * 0.2,
    strokeColor: partyOffensiveAoeStrokeColor,
    strokeAlpha: 0.5 + alpha * 0.42,
  };
}

function drawAoeCircle(
  graphics: Graphics,
  options: {
    center: { x: number; y: number };
    intent: AoeVisualIntent;
    opacity: number;
    radiusPx: number;
  },
) {
  if (options.intent === "enemyOffensive") {
    drawSpikyAoeCircle(
      graphics,
      options.center,
      options.radiusPx,
      enemyAoeFillColor,
      enemyAoeStrokeColor,
      options.opacity,
    );
    return;
  }

  if (options.intent === "enemySupportive") {
    const alpha = Math.min(1, Math.max(0, options.opacity));

    graphics
      .circle(options.center.x, options.center.y, options.radiusPx)
      .fill({ color: enemySupportiveAoeFillColor, alpha: 0.05 + alpha * 0.1 })
      .stroke({
        color: enemySupportiveAoeStrokeColor,
        alpha: 0.42 + alpha * 0.4,
        width: 3,
      });
    return;
  }

  if (options.intent === "partyHealing") {
    drawDottedAoeCircle(
      graphics,
      options.center,
      options.radiusPx,
      partyHealingAoeFillColor,
      partyHealingAoeStrokeColor,
      options.opacity,
    );
    return;
  }

  const alpha = Math.min(1, Math.max(0, options.opacity));

  graphics
    .circle(options.center.x, options.center.y, options.radiusPx)
    .fill({ color: partyOffensiveAoeFillColor, alpha: 0.1 + alpha * 0.2 })
    .stroke({
      color: partyOffensiveAoeStrokeColor,
      alpha: 0.5 + alpha * 0.42,
      width: 3,
    });
}

function drawSpikyAoeCircle(
  graphics: Graphics,
  center: { x: number; y: number },
  radiusPx: number,
  fillColor: number,
  strokeColor: number,
  opacity: number,
) {
  const alpha = Math.min(1, Math.max(0, opacity));
  const spikeCount = 28;
  const points: number[] = [];

  for (let index = 0; index < spikeCount * 2; index += 1) {
    const angle = (index / (spikeCount * 2)) * Math.PI * 2;
    const radius = index % 2 === 0 ? radiusPx : radiusPx * 0.88;
    points.push(center.x + Math.cos(angle) * radius);
    points.push(center.y + Math.sin(angle) * radius);
  }

  graphics
    .poly(points)
    .fill({ color: fillColor, alpha: 0.13 + alpha * 0.5 })
    .stroke({ color: strokeColor, alpha: 0.48 + alpha * 0.52, width: 3 });
}

function drawDottedAoeCircle(
  graphics: Graphics,
  center: { x: number; y: number },
  radiusPx: number,
  fillColor: number,
  strokeColor: number,
  opacity: number,
) {
  const alpha = Math.min(1, Math.max(0, opacity));
  const dotCount = 24;
  const dotRadius = Math.max(2, radiusPx * 0.035);

  graphics
    .circle(center.x, center.y, radiusPx)
    .fill({ color: fillColor, alpha: 0.08 + alpha * 0.14 });

  for (let index = 0; index < dotCount; index += 1) {
    const angle = (index / dotCount) * Math.PI * 2;

    graphics
      .circle(
        center.x + Math.cos(angle) * radiusPx,
        center.y + Math.sin(angle) * radiusPx,
        dotRadius,
      )
      .fill({ color: strokeColor, alpha: 0.54 + alpha * 0.36 });
  }
}

function drawEnemyAoeChannelBars(
  graphics: Graphics,
  channelsByCasterId: Record<string, EnemyAoeChannelState>,
  entitiesById: Map<string, GameEntity>,
  currentTime: number,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  for (const channel of Object.values(channelsByCasterId)) {
    const caster = entitiesById.get(channel.casterId);

    if (!caster || !isPositionInTileBounds(caster.position, visibleTileBounds)) {
      continue;
    }

    const progress =
      channel.phase === "windup"
        ? 1
        : getEnemyAoeChannelProgress(channel, currentTime);
    const center = toFullPosition(caster.position, transform);
    const width = transform.cellPixelSize * 0.86;
    const height = 4;
    const x = center.x - width / 2;
    const y = center.y - transform.cellPixelSize * 0.82 - height;

    graphics.rect(x, y, width, height).fill({ color: 0x450a0a, alpha: 0.9 });
    graphics.rect(x, y, width * progress, height).fill(0xef4444);
  }
}

function drawEnemyAbilityCastGlows(
  graphics: Graphics,
  castsByEnemyId: Record<string, EnemyAbilityCastState>,
  entitiesById: Map<string, GameEntity>,
  currentTime: number,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  const pulse = (Math.sin((currentTime / 700) * Math.PI * 2) + 1) / 2;

  for (const cast of Object.values(castsByEnemyId)) {
    const caster = entitiesById.get(cast.casterId);

    if (
      !caster ||
      caster.kind !== "enemy" ||
      caster.state === "dead" ||
      caster.health <= 0 ||
      cast.windupEndsAt <= currentTime ||
      !isPositionInTileBounds(caster.position, visibleTileBounds)
    ) {
      continue;
    }

    const center = toFullPosition(caster.position, transform);
    const radius = transform.cellPixelSize * (0.58 + pulse * 0.1);

    graphics
      .circle(center.x, center.y, radius)
      .fill({ color: 0xf97316, alpha: 0.08 + pulse * 0.08 })
      .stroke({ color: 0xfb923c, alpha: 0.52 + pulse * 0.3, width: 3 });
  }
}

function drawFortifyingAuraOutlines(
  graphics: Graphics,
  entities: GameEntity[],
  statusEffectsById: Record<string, StatusEffectState>,
  currentTime: number,
  map: GameMap,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  const fortifiedEnemyIds = new Set(
    Object.values(statusEffectsById)
      .filter(
        (status) =>
          status.type === "defenseBuff" &&
          status.sourceKey === FORTIFYING_AURA_STATUS_SOURCE_KEY &&
          status.expiresAt > currentTime,
      )
      .map((status) => status.targetId),
  );

  for (const entity of entities) {
    if (
      entity.kind !== "enemy" ||
      entity.state === "dead" ||
      entity.health <= 0 ||
      !fortifiedEnemyIds.has(entity.id) ||
      !isPositionInTileBounds(entity.position, visibleTileBounds)
    ) {
      continue;
    }

    const visualAsset = getEntityVisualAsset(entity, map.id);
    const layout = getEntitySpriteLayout(
      entity,
      transform.cellPixelSize,
      visualAsset,
    );
    const entityPosition = toFullPosition(entity.position, transform);
    const spritePosition = {
      x: entityPosition.x,
      y: entityPosition.y + transform.cellPixelSize / 2,
    };
    const radiusMultiplier = isSuperiorEnemy(entity) ? 0.48 : 0.42;
    const radius = Math.max(layout.width, layout.height) * radiusMultiplier;
    const centerY = spritePosition.y - layout.height * 0.18;

    graphics
      .circle(spritePosition.x, centerY, radius)
      .fill({ color: enemySupportiveAoeFillColor, alpha: 0.04 })
      .stroke({
        color: enemySupportiveAoeStrokeColor,
        alpha: 0.92,
        width: 3,
      });
  }
}

function getEnemyAoeChannelProgress(
  channel: EnemyAoeChannelState,
  currentTime: number,
): number {
  const duration = channel.channelEndsAt - channel.startedAt;

  if (duration <= 0) {
    return 1;
  }

  return Math.max(
    0,
    Math.min(1, (currentTime - channel.startedAt) / duration),
  );
}

function drawFullEffects({
  cache,
  combatFeedbackEvents,
  combatProjectiles,
  currentTime,
  dropVisualEvents,
  entities,
  graphics,
  layer,
  map,
  managedState,
  metrics,
  partyIntent,
  requestRedraw,
  resurrectionProgressByCompanionId,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  transform,
  visibleTileBounds,
}: {
  cache: TextureCache;
  combatFeedbackEvents: CombatFeedbackEvent[];
  combatProjectiles: ActiveCombatProjectile[];
  currentTime: number;
  dropVisualEvents: DropVisualEvent[];
  entities: GameEntity[];
  graphics: Graphics;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  partyIntent: PartyIntent | null;
  requestRedraw?: () => void;
  resurrectionProgressByCompanionId: Record<string, ResurrectionProgressState>;
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  const entitiesById = getEntityById(entities);
  const resurrectionTargetId =
    partyIntent?.recoveryIntent?.action === "resurrect"
      ? partyIntent.recoveryIntent.deadCompanionId
      : null;
  const resurrectionTarget = resurrectionTargetId
    ? entitiesById.get(resurrectionTargetId)
    : undefined;

  if (
    resurrectionTarget?.kind === "companion" &&
    isPositionInTileBounds(resurrectionTarget.position, visibleTileBounds)
  ) {
    const center = toFullPosition(resurrectionTarget.position, transform);

    graphics
      .circle(
        center.x,
        center.y,
        RESURRECTION_RANGE * transform.cellPixelSize,
      )
      .fill({ color: 0x7c3aed, alpha: 0.13 })
      .stroke({ color: 0xa855f7, alpha: 0.45, width: 2 });
  }

  for (const shield of Object.values(skillShieldBlocksById)) {
    if (shield.expiresAt <= currentTime || shield.id.endsWith("-guard_up")) {
      continue;
    }

    if (!isPositionInTileBounds(shield.position, visibleTileBounds)) {
      continue;
    }

    const position = toFullPosition(shield.position, transform);

    graphics
      .rect(position.x - 12, position.y - 5, 24, 10)
      .fill({ color: 0x7dd3fc, alpha: 0.34 })
      .stroke({ color: 0x38bdf8, alpha: 0.9, width: 2 });
  }

  for (const projectile of combatProjectiles) {
    if (!isPositionInTileBounds(projectile.position, visibleTileBounds)) {
      continue;
    }

    const profile = combatProjectileVisualProfiles[projectile.visualProfileId];
    const target =
      entitiesById.get(projectile.targetId)?.position ??
      projectile.targetFallbackPosition;
    const travelAngle = Math.atan2(
      target.y - projectile.position.y,
      target.x - projectile.position.x,
    );
    const rotation =
      travelAngle - (profile.nativeAngleDegrees * Math.PI) / 180;
    const position = toFullPosition(projectile.position, transform);

    drawManagedImageSprite({
      anchorX: 0.5,
      anchorY: 0.5,
      cache,
      height: profile.height,
      key: `combat-projectile:${projectile.id}`,
      layer,
      managedState,
      metrics,
      position,
      requestRedraw,
      rotation,
      src: profile.src,
      width: profile.width,
    });
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

    const skillVisualPresentation = getSkillVisualPresentation(event);
    const spritePosition =
      target?.position ?? event.position ?? source.position;
    const center = toFullPosition(spritePosition, transform);

    if (!isPositionInTileBounds(spritePosition, visibleTileBounds)) {
      continue;
    }

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

    if (skillVisualPresentation.src) {
      const didDraw = drawManagedImageSprite({
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: skillVisualPresentation.height,
        key: `skill-effect:${event.id}:${skillVisualPresentation.src}`,
        layer,
        managedState,
        metrics,
        alpha: getSkillVisualOpacity(
          event,
          currentTime,
          skillVisualPresentation.endOpacity,
        ),
        position: center,
        requestRedraw,
        src: skillVisualPresentation.src,
        width: skillVisualPresentation.width,
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

    if (!isPositionInTileBounds(event.position, visibleTileBounds)) {
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
    const itemDefinition = event.itemId ? getItemDefinition(event.itemId) : null;
    const displayName = event.displayName ?? itemDefinition?.displayName ?? "Quest Item";
    const iconSrc =
      event.iconRole === "quest_giver"
        ? NPC_ICON_SRC.quest_giver
        : event.itemId
          ? INVENTORY_ITEM_ICON_SRC[event.itemId]
          : undefined;
    const dropColor =
      event.kind === "quest_item"
        ? 0xfacc15
        : itemDefinition?.category === "equipment"
          ? 0x7c3aed
          : 0x047857;

    graphics
      .roundRect(position.x - 13, position.y - 13, 26, 26, 6)
      .fill({ color: 0xffffff, alpha: 0.94 * (1 - progress) })
      .stroke({ color: dropColor, alpha: 1 - progress, width: 2 });

    if (iconSrc) {
      drawManagedImageSprite({
        alpha: 1 - progress,
        anchorX: 0.5,
        anchorY: 0.5,
        cache,
        height: 22,
        key: `drop:${event.id}:${iconSrc}`,
        layer,
        managedState,
        metrics,
        position,
        requestRedraw,
        src: iconSrc,
        width: 22,
      });
    } else {
      drawManagedFeedbackText({
        alpha: 1 - progress,
        color: 0x111827,
        fontSize: 13,
        key: `drop-label:${event.id}`,
        layer,
        managedState,
        metrics,
        position,
        text: displayName.charAt(0),
      });
    }
  }

  for (const entity of entities) {
    if (!isPositionInTileBounds(entity.position, visibleTileBounds)) {
      continue;
    }

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
      drawManagedFeedbackText({
        color: 0x475569,
        fontSize: 10,
        key: `idle-label:${entity.id}`,
        layer,
        managedState,
        metrics,
        position: {
          x: center.x + transform.cellPixelSize * 0.62,
          y: center.y + transform.cellPixelSize * 0.3,
        },
        text: "AFK",
      });
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

        drawManagedFeedbackText({
          color: 0x14532d,
          fontSize: 10,
          key: `resurrection-label:${entity.id}`,
          layer,
          managedState,
          metrics,
          position: { x: center.x, y: y + 7 },
          text: "Resurrecting",
        });
      }
    }
  }

  metrics.activeFeedbackCount = combatFeedbackEvents.filter(
    (event) => event.expiresAt > currentTime,
  ).length;

  for (const event of combatFeedbackEvents) {
    if (event.expiresAt <= currentTime) {
      continue;
    }

    const entity = entitiesById.get(event.entityId);

    if (!entity) {
      continue;
    }

    if (!isPositionInTileBounds(entity.position, visibleTileBounds)) {
      continue;
    }

    drawCombatFeedbackSpriteEffect({
      cache,
      combatFeedbackEvents,
      currentTime,
      entitiesById,
      entity,
      event,
      layer,
      map,
      managedState,
      metrics,
      requestRedraw,
      transform,
    });

    if (!shouldDrawCombatFeedbackEvent(event, entity)) {
      continue;
    }

    const isCriticalDamage = hasPairedCriticalFeedback(
      event,
      combatFeedbackEvents,
    );
    const labelPosition = getCombatFeedbackPosition(
      event,
      entity,
      currentTime,
      map,
      transform,
    );

    if (isCriticalDamage) {
      const progress = getDamageNumberProgress(event, currentTime);
      const direction = getDamageNumberDirection(event);
      const backingSize = criticalHitBackingSize * (1 - progress * 0.3);

      drawManagedImageSprite({
        alpha: 0.88 * (1 - progress),
        anchorX: 0.5,
        anchorY: 0.6,
        cache,
        height: backingSize,
        key: `critical-backing:${getCombatFeedbackLaneKey(event)}`,
        layer,
        managedState,
        metrics,
        position: labelPosition,
        requestRedraw,
        rotation: direction * damageNumberRotationRadians * progress,
        src: criticalHitBackingSrc,
        width: backingSize,
      });
    }

    const label = drawManagedFeedbackText({
      color: getCombatFeedbackColor(event, isCriticalDamage),
      fontSize: getCombatFeedbackFontSize(event),
      key: getCombatFeedbackLaneKey(event),
      layer,
      managedState,
      metrics,
      position: labelPosition,
      text: event.text,
    });
    if (isDamageNumberFeedback(event)) {
      const dotIconSrc = getDotDamageIconSrc(event);
      if (dotIconSrc) {
        const progress = getDamageNumberProgress(event, currentTime);
        const direction = getDamageNumberDirection(event);
        const iconPosition = {
          x: labelPosition.x - direction * 18,
          y: labelPosition.y,
        };

        drawManagedImageSprite({
          alpha: 1 - progress,
          anchorX: 0.5,
          anchorY: 0.5,
          cache,
          height: dotDamageIconSize,
          key: `dot-damage-icon:${getCombatFeedbackLaneKey(event)}`,
          layer,
          managedState,
          metrics,
          position: iconPosition,
          requestRedraw,
          rotation: direction * damageNumberRotationRadians * progress,
          src: dotIconSrc,
          width: dotDamageIconSize,
        });
      }
      applyDamageNumberAnimation(label, event, currentTime);
    }
    metrics.drawnFeedbackCount += 1;
  }
}

function drawFullFloor({
  backgroundGraphics,
  cache,
  layer,
  map,
  managedState,
  metrics,
  requestRedraw,
  transform,
  visibleTileBounds,
}: {
  backgroundGraphics: Graphics;
  cache: TextureCache;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  const mapPixelWidth = map.columns * transform.cellPixelSize;
  const mapPixelHeight = map.rows * transform.cellPixelSize;
  const mapX = -transform.cameraOffset.x;
  const mapY = -transform.cameraOffset.y;
  const useImageFloorTiles =
    map.visualTheme === "slimeward-cave" ||
    isHubVisualMap(map.id) ||
    isWildernessVisualMap(map.id);

  backgroundGraphics
    .rect(mapX, mapY, mapPixelWidth, mapPixelHeight)
    .fill(getMapFloorColor(map));

  if (!useImageFloorTiles) {
    return;
  }

  if (map.visualTheme === "slimeward-cave") {
    drawSlimewardFloorCells({
      cache,
      layer,
      map,
      managedState,
      metrics,
      requestRedraw,
      transform,
      visibleTileBounds,
    });
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
    const didDraw = drawManagedImageSprite({
      anchorX: 0,
      anchorY: 0,
      cache,
      height: floorSize,
      key: `floor:${map.id}:${chunk.x}:${chunk.y}:${floorTileSrc}`,
      layer,
      managedState,
      metrics,
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
  managedState,
  metrics,
  requestRedraw,
  transform,
  visibleTileBounds,
}: {
  cache: TextureCache;
  fallbackGraphics: Graphics;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  const staticMapCache = getStaticMapRenderCache(map);
  const hubWallKeys = staticMapCache.hubWallKeys;
  const floorCellKeys = staticMapCache.floorCellKeys;
  const drawnSlimewardWallBlocks = new Set<string>();

  for (const wall of map.walls) {
    if (!isPositionInTileBounds(wall, visibleTileBounds)) {
      continue;
    }

    const wallX = wall.x * transform.cellPixelSize - transform.cameraOffset.x;
    const wallY = wall.y * transform.cellPixelSize - transform.cameraOffset.y;

    if (floorCellKeys) {
      const wallBlock = getSlimewardWallBlockPosition(wall);
      const wallBlockKey = getHubWallKey(wallBlock);

      if (
        drawnSlimewardWallBlocks.has(wallBlockKey) ||
        !isBlockInTileBounds(
          wallBlock,
          slimewardWallTileCellSpan,
          visibleTileBounds,
        ) ||
        !isSlimewardWallBlockAdjacentToFloor(wallBlock, floorCellKeys)
      ) {
        continue;
      }

      drawnSlimewardWallBlocks.add(wallBlockKey);
      const didDraw = drawManagedImageSprite({
        anchorX: 0,
        anchorY: 0,
        cache,
        height: transform.cellPixelSize * slimewardWallTileCellSpan,
        key: `slimeward-wall:${map.id}:${wallBlock.x}:${wallBlock.y}`,
        layer,
        managedState,
        metrics,
        position: {
          x: wallBlock.x * transform.cellPixelSize - transform.cameraOffset.x,
          y: wallBlock.y * transform.cellPixelSize - transform.cameraOffset.y,
        },
        requestRedraw,
        src: SLIMEWARD_DUNGEON_TILE_SRC.wall,
        width: transform.cellPixelSize * slimewardWallTileCellSpan,
      });

      if (didDraw) {
        continue;
      }
    }

    if (isWildernessVisualMap(map.id)) {
      const wallKind = getWildernessWallTileKind(wall);
      const wallSpriteSrc = getWildernessWallTileSrc(wall);
      const didDraw = drawManagedImageSprite({
        cache,
        height:
          wallKind === "tree"
            ? transform.cellPixelSize * 2.25
            : transform.cellPixelSize * 1.32,
        key: `wall:${map.id}:${wall.x}:${wall.y}:${wallSpriteSrc}`,
        layer,
        managedState,
        metrics,
        position: {
          x: wallX + transform.cellPixelSize / 2,
          y: wallY + transform.cellPixelSize,
        },
        requestRedraw,
        src: wallSpriteSrc,
        width:
          wallKind === "tree"
            ? transform.cellPixelSize * 2.25
            : transform.cellPixelSize * 1.32,
      });

      if (didDraw) {
        continue;
      }
    }

    if (hubWallKeys) {
      const wallSpriteSrc = getHubWallTileSrc(wall, map, hubWallKeys);
      const didDraw = drawManagedImageSprite({
        anchorX: 0,
        anchorY: 0,
        cache,
        height: transform.cellPixelSize,
        key: `wall:${map.id}:${wall.x}:${wall.y}:${wallSpriteSrc}`,
        layer,
        managedState,
        metrics,
        position: {
          x: wallX,
          y: wallY,
        },
        requestRedraw,
        src: wallSpriteSrc,
        width: transform.cellPixelSize,
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
  managedState,
  metrics,
  requestRedraw,
  teleportWorkingById,
  transform,
  visibleTileBounds,
}: {
  cache: TextureCache;
  fallbackGraphics: Graphics;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  teleportWorkingById: Record<string, boolean>;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  const objectSize = transform.cellPixelSize * 1.55;

  for (const teleport of map.teleports) {
    if (!isPositionInTileBounds(teleport.position, visibleTileBounds)) {
      continue;
    }

    const teleportPosition = toFullPosition(teleport.position, transform);
    const teleporterSpritePosition = {
      x: teleportPosition.x,
      y: teleportPosition.y,
    };
    const didDraw = drawManagedImageSprite({
      anchorX: TELEPORT_OBJECT_SPRITE_ANCHOR_X,
      anchorY: TELEPORT_OBJECT_SPRITE_ANCHOR_Y,
      cache,
      height: TELEPORT_OBJECT_SPRITE_SIZE_PX,
      key: `object:${map.id}:teleport:${teleport.targetMapId}:${teleport.position.x}:${teleport.position.y}`,
      layer,
      managedState,
      metrics,
      position: teleporterSpritePosition,
      requestRedraw,
      src: getTeleportIconSrc(
        teleportWorkingById[teleport.id] ?? true,
        teleport.visualTheme ?? "default",
      ),
      width: TELEPORT_OBJECT_SPRITE_SIZE_PX,
    });

    if (!didDraw) {
      fallbackGraphics
        .circle(teleportPosition.x, teleportPosition.y, objectSize * 0.34)
        .fill(0x9333ea);
    }
  }

  for (const fountain of map.healingFountains) {
    if (!isPositionInTileBounds(fountain.position, visibleTileBounds)) {
      continue;
    }

    const fountainPosition = toFullPosition(fountain.position, transform);
    const fountainDiameter = getHealingFountainRenderDiameterPx(
      fountain.range,
      transform.cellPixelSize,
    );
    const didDraw = drawManagedImageSprite({
      anchorX: 0.5,
      anchorY: 0.5,
      cache,
      height: fountainDiameter,
      key: `object:${map.id}:fountain:${fountain.position.x}:${fountain.position.y}`,
      layer,
      managedState,
      metrics,
      position: fountainPosition,
      requestRedraw,
      src: MAP_OBJECT_ICON_SRC.healingFountain,
      width: fountainDiameter,
    });

    if (!didDraw) {
      fallbackGraphics
        .circle(fountainPosition.x, fountainPosition.y, fountainDiameter / 2)
        .fill(0x38bdf8);
    }
  }
}

function getSlimewardWallBlockPosition(wall: Position): Position {
  return {
    x: Math.floor(wall.x / slimewardWallTileCellSpan) * slimewardWallTileCellSpan,
    y: Math.floor(wall.y / slimewardWallTileCellSpan) * slimewardWallTileCellSpan,
  };
}

function isSlimewardWallBlockAdjacentToFloor(
  wallBlock: Position,
  floorCellKeys: Set<string>,
): boolean {
  for (let y = wallBlock.y; y < wallBlock.y + slimewardWallTileCellSpan; y += 1) {
    for (let x = wallBlock.x; x < wallBlock.x + slimewardWallTileCellSpan; x += 1) {
      if (
        floorCellKeys.has(`${x - 1},${y}`) ||
        floorCellKeys.has(`${x + 1},${y}`) ||
        floorCellKeys.has(`${x},${y - 1}`) ||
        floorCellKeys.has(`${x},${y + 1}`)
      ) {
        return true;
      }
    }
  }

  return false;
}

function isBlockInTileBounds(
  position: Position,
  cellSpan: number,
  bounds: TileBounds,
): boolean {
  return (
    position.x + cellSpan - 1 >= bounds.minX &&
    position.x <= bounds.maxX &&
    position.y + cellSpan - 1 >= bounds.minY &&
    position.y <= bounds.maxY
  );
}

function drawSlimewardFloorCells({
  cache,
  layer,
  map,
  managedState,
  metrics,
  requestRedraw,
  transform,
  visibleTileBounds,
}: {
  cache: TextureCache;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  const floorCellKeys = new Set((map.floorCells ?? []).map(getHubWallKey));
  const startX =
    Math.floor(visibleTileBounds.minX / slimewardFloorTileCellSpan) *
    slimewardFloorTileCellSpan;
  const startY =
    Math.floor(visibleTileBounds.minY / slimewardFloorTileCellSpan) *
    slimewardFloorTileCellSpan;
  const tileSize = transform.cellPixelSize * slimewardFloorTileCellSpan;

  for (
    let y = startY;
    y <= visibleTileBounds.maxY;
    y += slimewardFloorTileCellSpan
  ) {
    for (
      let x = startX;
      x <= visibleTileBounds.maxX;
      x += slimewardFloorTileCellSpan
    ) {
      const floorBlock = { x, y };

      if (!doesBlockContainFloorCell(floorBlock, slimewardFloorTileCellSpan, floorCellKeys)) {
        continue;
      }

      const src =
        getCoordinateHash(floorBlock) % 5 === 0
          ? SLIMEWARD_DUNGEON_TILE_SRC.floorAzure
          : SLIMEWARD_DUNGEON_TILE_SRC.floorDamp;

      drawManagedImageSprite({
        anchorX: 0,
        anchorY: 0,
        cache,
        height: tileSize,
        key: `slimeward-floor:${map.id}:${floorBlock.x}:${floorBlock.y}:${src}`,
        layer,
        managedState,
        metrics,
        position: {
          x: floorBlock.x * transform.cellPixelSize - transform.cameraOffset.x,
          y: floorBlock.y * transform.cellPixelSize - transform.cameraOffset.y,
        },
        requestRedraw,
        src,
        width: tileSize,
      });
    }
  }
}

function doesBlockContainFloorCell(
  blockPosition: Position,
  cellSpan: number,
  floorCellKeys: Set<string>,
): boolean {
  for (let y = blockPosition.y; y < blockPosition.y + cellSpan; y += 1) {
    for (let x = blockPosition.x; x < blockPosition.x + cellSpan; x += 1) {
      if (floorCellKeys.has(`${x},${y}`)) {
        return true;
      }
    }
  }

  return false;
}

function drawFullMapVisualObjects({
  cache,
  layer,
  map,
  managedState,
  metrics,
  requestRedraw,
  transform,
  visibleTileBounds,
  entities,
}: {
  cache: TextureCache;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
  entities: GameEntity[];
}) {
  const visualObjects = getStaticMapRenderCache(map).sortedVisualObjects;

  for (const visualObject of visualObjects) {
    if (entities.some(entity => entity.kind === "structure" && entity.id === visualObject.id && entity.health <= 0)) continue;
    if (
      map.id === "map-6" &&
      PATRON_WARD_VISUAL_OBJECT_IDS.has(visualObject.id)
    ) {
      continue;
    }

    if (!isMapVisualObjectInTileBounds(visualObject, visibleTileBounds)) {
      continue;
    }

    const objectPosition = toFullPosition(visualObject.position, transform);
    drawManagedImageSprite({
      anchorX: visualObject.anchorX ?? 0.5,
      anchorY: visualObject.anchorY ?? 1,
      cache,
      height: visualObject.heightCells * transform.cellPixelSize,
      key: `map-visual-object:${map.id}:${visualObject.id}`,
      layer,
      managedState,
      metrics,
      position: {
        x: objectPosition.x,
        y: objectPosition.y + transform.cellPixelSize / 2,
      },
      requestRedraw,
      src: MAP_VISUAL_OBJECT_SRC[visualObject.visualId],
      width: visualObject.widthCells * transform.cellPixelSize,
    });
  }
}

function isMapVisualObjectInTileBounds(
  visualObject: MapVisualObject,
  bounds: TileBounds,
): boolean {
  const halfWidth = visualObject.widthCells / 2;

  return (
    visualObject.position.x + halfWidth >= bounds.minX &&
    visualObject.position.x - halfWidth <= bounds.maxX &&
    visualObject.position.y >= bounds.minY &&
    visualObject.position.y - visualObject.heightCells <= bounds.maxY
  );
}

function drawPatronWardObjects({
  cache,
  currentTime,
  layer,
  map,
  managedState,
  metrics,
  presentation,
  requestRedraw,
  transform,
  visibleTileBounds,
}: {
  cache: TextureCache;
  currentTime: number;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  presentation: PatronWardPresentationState | null;
  requestRedraw?: () => void;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  if (!presentation) {
    return;
  }

  for (const ward of presentation.wards) {
    const visualObject = map.visualObjects?.find(
      (candidate) => candidate.id === ward.visualObjectId,
    );

    if (!visualObject || !isMapVisualObjectInTileBounds(visualObject, visibleTileBounds)) {
      continue;
    }

    const propAlpha = ward.completed
      ? getPatronWardFadeOpacity(ward.propFadeStartedAtMs, currentTime)
      : 1;

    if (propAlpha <= 0) {
      continue;
    }

    const objectPosition = toFullPosition(ward.position, transform);
    const bottomPosition = {
      x: objectPosition.x,
      y: objectPosition.y + transform.cellPixelSize / 2,
    };

    if (!ward.completed) {
      drawManagedImageSprite({
        anchorX: 0.5,
        anchorY: 1,
        cache,
        height: 128,
        key: `patron-ward-aura:${ward.id}`,
        layer,
        managedState,
        metrics,
        position: bottomPosition,
        requestRedraw,
        src: getPatronAuraFrameSrc(currentTime),
        width: 128,
      });
    }

    drawManagedImageSprite({
      alpha: propAlpha,
      anchorX: visualObject.anchorX ?? 0.5,
      anchorY: visualObject.anchorY ?? 1,
      cache,
      height: visualObject.heightCells * transform.cellPixelSize,
      key: `patron-ward-prop:${ward.id}`,
      layer,
      managedState,
      metrics,
      position: bottomPosition,
      requestRedraw,
      src: MAP_VISUAL_OBJECT_SRC[visualObject.visualId],
      width: visualObject.widthCells * transform.cellPixelSize,
    });
  }
}

function drawPatronDefenderAuras({
  warmasterAttempt,
  cache,
  currentTime,
  entities,
  layer,
  managedState,
  metrics,
  requestRedraw,
  transform,
  visibleTileBounds,
}: {
  warmasterAttempt?: WarmasterAttempt;
  cache: TextureCache;
  currentTime: number;
  entities: GameEntity[];
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  for (const entity of entities) {
    if (
      entity.kind !== "enemy" ||
      !(entity.questSpawn?.patronAura === true || entity.enemyTypeId === "orc_warmaster" || (warmasterAttempt && isInsideWarmasterArena(entity.position) && ["orc", "orc_raider", "orc_shieldbearer"].includes(entity.enemyTypeId ?? ""))) ||
      entity.state === "dead" ||
      !isAuraVisible(entity.position, 4 * (entity.combatSizeMultiplier ?? 1), visibleTileBounds)
    ) {
      continue;
    }

    const position = toFullPosition(entity.position, transform);

    drawManagedImageSprite({
      anchorX: 0.5,
      anchorY: 1,
      cache,
      height: 128 * (entity.combatSizeMultiplier ?? 1),
      key: `patron-defender-aura:${entity.id}`,
      layer,
      managedState,
      metrics,
      position: {
        x: position.x,
        y: position.y + transform.cellPixelSize / 2,
      },
      requestRedraw,
      src: getPatronAuraFrameSrc(currentTime),
      width: 128 * (entity.combatSizeMultiplier ?? 1),
    });
  }
  const boss = entities.find(entity => entity.id === warmasterAttempt?.bossId);
  if (!boss || boss.state === "dead") return;
  for (const transfer of warmasterAttempt?.transfers ?? []) {
    if (currentTime >= transfer.arrivesAt) continue;
    const position = getPatronTransferPosition(transfer, boss.position, currentTime);
    if (!isAuraVisible(position, 4, visibleTileBounds)) continue;
    const pixel = toFullPosition(position, transform);
    drawManagedImageSprite({ anchorX: 0.5, anchorY: 1, cache, height: 128, width: 128, key: `patron-transfer:${transfer.id}`, layer, managedState, metrics, position: { x: pixel.x, y: pixel.y + transform.cellPixelSize / 2 }, requestRedraw, src: getPatronAuraFrameSrc(currentTime) });
  }
}

function drawPatronBarrier(
  graphics: Graphics,
  presentation: PatronWardPresentationState | null,
  currentTime: number,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
) {
  const barrier = presentation?.barrier;

  if (
    !barrier ||
    barrier.center.x + barrier.radius < visibleTileBounds.minX ||
    barrier.center.x - barrier.radius > visibleTileBounds.maxX ||
    barrier.center.y + barrier.radius < visibleTileBounds.minY ||
    barrier.center.y - barrier.radius > visibleTileBounds.maxY
  ) {
    return;
  }

  const opacity = getPatronFinaleOpacity(
    barrier.finaleStartedAtMs,
    currentTime,
    PATRON_BARRIER_FADE_DURATION_MS,
  );

  if (opacity <= 0) {
    return;
  }

  const center = toFullPosition(barrier.center, transform);
  const pulse = 0.88 + Math.sin(currentTime / 240) * 0.12;

  graphics
    .circle(center.x, center.y, barrier.radius * transform.cellPixelSize)
    .fill({ color: 0x052e16, alpha: 0.28 * opacity * pulse })
    .stroke({ color: 0x22c55e, alpha: 0.82 * opacity * pulse, width: 4 });
}

function drawPatronWarmasterScene({
  cache,
  currentTime,
  graphics,
  layer,
  managedState,
  metrics,
  presentation,
  renderSize,
  requestRedraw,
  speechBubbleAvoidanceRects,
  transform,
  visibleTileBounds,
}: {
  cache: TextureCache;
  currentTime: number;
  graphics: Graphics;
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  presentation: PatronWardPresentationState | null;
  renderSize: RenderSize;
  requestRedraw?: () => void;
  speechBubbleAvoidanceRects: readonly ViewportRect[];
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  const warmaster = presentation?.warmaster;

  if (!warmaster || !isPositionInTileBounds(warmaster.position, visibleTileBounds)) {
    return;
  }

  const alpha = getPatronFinaleOpacity(
    warmaster.finaleStartedAtMs,
    currentTime,
    PATRON_WARMASTER_SCENE_FADE_DURATION_MS,
  );

  if (alpha <= 0) {
    return;
  }

  const position = toFullPosition(warmaster.position, transform);
  const bottomPosition = {
    x: position.x,
    y: position.y + transform.cellPixelSize / 2,
  };

  drawManagedImageSprite({
    alpha,
    anchorX: 0.5,
    anchorY: 1,
    cache,
    height: 128,
    key: "patron-warmaster-scene",
    layer,
    managedState,
    metrics,
    position: bottomPosition,
    requestRedraw,
    src: REGIONAL_ENEMY_SPRITE_SRC.orcWarmaster,
    width: 128,
  });
  drawManagedFeedbackText({
    alpha,
    color: aggressiveEnemyNameplateColor,
    fontSize: 12,
    key: "patron-warmaster-name",
    layer,
    managedState,
    metrics,
    position: { x: position.x, y: bottomPosition.y + 12 },
    strokeColor: 0x020617,
    strokeWidth: 4,
    text: "Orc Warmaster",
  });

  if (
    warmaster.speech &&
    isPatronWarmasterSpeechVisible(warmaster.finaleStartedAtMs, currentTime)
  ) {
    const bubbleWidth = Math.min(380, Math.max(1, renderSize.width - 16));
    const bubbleHeight = 40;
    const layout = getNpcSpeechBubbleLayout({
      avoidanceRects: speechBubbleAvoidanceRects,
      bubbleHeight,
      bubbleWidth,
      renderHeight: renderSize.height,
      renderWidth: renderSize.width,
      speakerBottomY: bottomPosition.y,
      speakerTopY: bottomPosition.y - 128,
      speakerX: position.x,
    });

    graphics
      .poly([
        layout.tailBaseLeftX,
        layout.tailBaseY,
        layout.tailBaseRightX,
        layout.tailBaseY,
        layout.tailPointX,
        layout.tailPointY,
      ])
      .fill(npcSpeechBackgroundColor)
      .stroke({ color: npcSpeechBorderColor, width: 3 });
    graphics
      .roundRect(
        layout.bubbleX,
        layout.bubbleY,
        bubbleWidth,
        bubbleHeight,
        8,
      )
      .fill(npcSpeechBackgroundColor)
      .stroke({ color: npcSpeechBorderColor, width: 3 });
    drawManagedFeedbackText({
      color: npcSpeechTextColor,
      fontSize: npcSpeechFontSize,
      key: "patron-warmaster-speech",
      layer,
      managedState,
      metrics,
      position: {
        x: layout.bubbleX + bubbleWidth / 2,
        y: layout.bubbleY + bubbleHeight / 2,
      },
      strokeColor: npcSpeechBackgroundColor,
      strokeWidth: 0,
      text: warmaster.speech,
    });
  }
}

function drawPatronWardLabels({
  layer,
  managedState,
  metrics,
  presentation,
  transform,
  visibleTileBounds,
}: {
  layer: Container;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  presentation: PatronWardPresentationState | null;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
}) {
  for (const ward of presentation?.wards ?? []) {
    if (!ward.label || !isPositionInTileBounds(ward.position, visibleTileBounds)) {
      continue;
    }

    const position = toFullPosition(ward.position, transform);

    drawManagedFeedbackText({
      color: 0x86efac,
      fontSize: 12,
      key: `patron-ward-label:${ward.id}`,
      layer,
      managedState,
      metrics,
      position: {
        x: position.x,
        y: position.y - transform.cellPixelSize * 4,
      },
      strokeColor: 0x052e16,
      strokeWidth: 4,
      text: ward.label,
    });
  }
}

function getPatronAuraFrameSrc(currentTime: number): string {
  const frameIndex =
    Math.floor(currentTime / PATRON_AURA_FRAME_DURATION_MS) %
    patronAuraFrameSrcs.length;

  return patronAuraFrameSrcs[frameIndex];
}

function drawFullEntities({
  cache,
  combatFeedbackEvents,
  currentTime,
  entities,
  fallbackGraphics,
  layer,
  map,
  managedState,
  metrics,
  requestRedraw,
  skillShieldBlocksById,
  transform,
  visibleTileBounds,
  visualMovementByEntityId,
}: {
  cache: TextureCache;
  combatFeedbackEvents: CombatFeedbackEvent[];
  currentTime: number;
  entities: GameEntity[];
  fallbackGraphics: Graphics;
  layer: Container;
  map: GameMap;
  managedState: ManagedRendererState;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}) {
  const sortedByY = [...entities].sort(
    (first, second) =>
      first.position.y - second.position.y || first.id.localeCompare(second.id),
  );

  for (const entity of sortedByY) {
    if (
      entity.kind === "structure" ||
      !shouldRenderEntity(entity) ||
      !isPositionInTileBounds(entity.position, visibleTileBounds)
    ) {
      continue;
    }

    metrics.visibleEntityCount += 1;
    const spriteSrc = getEntitySpriteSrc({
      currentTime,
      entity,
      map,
      visualMovementByEntityId,
    });
    const idleSpriteSrc = getEntityIdleSpriteSrc(entity, map);
    const entityPosition = toFullPosition(entity.position, transform);
    const visualAsset = getEntityVisualAsset(entity, map.id);
    const layout = getEntitySpriteLayout(
      entity,
      transform.cellPixelSize,
      visualAsset,
    );
    const alpha = getEntityRenderAlpha(entity, currentTime);
    const tint = getEntityFeedbackTint({
      combatFeedbackEvents,
      currentTime,
      entity,
      skillShieldBlocksById,
    });
    const spritePosition = {
      x: entityPosition.x,
      y: entityPosition.y + transform.cellPixelSize / 2,
    };

    if (entity.kind === "enemy" && isSuperiorEnemy(entity)) {
      drawSuperiorEnemyAura(fallbackGraphics, spritePosition, layout);
    }

    let drawnSpriteSrc: string | null = null;
    let didDraw = spriteSrc
      ? drawManagedImageSprite({
          alpha,
          anchorX: layout.anchorX,
          anchorY: layout.anchorY,
          cache,
          height: layout.height,
          key: `entity:${entity.id}`,
          layer,
          managedState,
          metrics,
          position: spritePosition,
          requestRedraw,
          src: spriteSrc,
          width: layout.width,
        })
      : false;

    if (didDraw && spriteSrc) {
      cache.lastEntitySpriteSrcById.set(entity.id, spriteSrc);
      drawnSpriteSrc = spriteSrc;
    }

    if (!didDraw) {
      const lastSpriteSrc = cache.lastEntitySpriteSrcById.get(entity.id);

      if (lastSpriteSrc && lastSpriteSrc !== spriteSrc) {
        didDraw = drawManagedImageSprite({
          alpha,
          anchorX: layout.anchorX,
          anchorY: layout.anchorY,
          cache,
          height: layout.height,
          key: `entity:${entity.id}`,
          layer,
          managedState,
          metrics,
          position: spritePosition,
          requestRedraw,
          src: lastSpriteSrc,
          width: layout.width,
        });

        if (didDraw) {
          drawnSpriteSrc = lastSpriteSrc;
        }
      }
    }

    if (!didDraw && idleSpriteSrc && idleSpriteSrc !== spriteSrc) {
      didDraw = drawManagedImageSprite({
        alpha,
        anchorX: layout.anchorX,
        anchorY: layout.anchorY,
        cache,
        height: layout.height,
        key: `entity:${entity.id}`,
        layer,
        managedState,
        metrics,
        position: spritePosition,
        requestRedraw,
        src: idleSpriteSrc,
        width: layout.width,
      });

      if (didDraw) {
        cache.lastEntitySpriteSrcById.set(entity.id, idleSpriteSrc);
        drawnSpriteSrc = idleSpriteSrc;
      }
    }

    if (drawnSpriteSrc && tint) {
      drawManagedImageSprite({
        alpha: tint.alpha * alpha,
        anchorX: layout.anchorX,
        anchorY: layout.anchorY,
        cache,
        height: layout.height,
        key: `entity-tint:${entity.id}`,
        layer,
        managedState,
        metrics,
        position: spritePosition,
        requestRedraw,
        src: drawnSpriteSrc,
        tint: tint.color,
        width: layout.width,
      });
    }

    if (!didDraw) {
      drawFallbackEntity(fallbackGraphics, entity, currentTime, transform, tint);
    }

    metrics.drawnEntityCount += 1;
  }
}

function drawEnemyDashAfterimages({
  cache,
  currentTime,
  enemyDashesByEnemyId,
  entitiesById,
  layer,
  managedState,
  map,
  metrics,
  requestRedraw,
  transform,
  visibleTileBounds,
  visualMovementByEntityId,
}: {
  cache: TextureCache;
  currentTime: number;
  enemyDashesByEnemyId: Record<string, EnemyDashState>;
  entitiesById: Map<string, GameEntity>;
  layer: Container;
  managedState: ManagedRendererState;
  map: GameMap;
  metrics: PixiDrawMetrics;
  requestRedraw?: () => void;
  transform: FullTransform;
  visibleTileBounds: TileBounds;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}) {
  for (const dash of Object.values(enemyDashesByEnemyId)) {
    const caster = entitiesById.get(dash.casterId);

    if (!caster || caster.kind !== "enemy" || dash.distance <= 0) {
      continue;
    }

    const visualAsset = getEntityVisualAsset(caster, map.id);
    const layout = getEntitySpriteLayout(
      { ...caster, combatSizeMultiplier: dash.bodyScale ?? caster.combatSizeMultiplier },
      transform.cellPixelSize,
      visualAsset,
    );
    const spacing = layout.width / transform.cellPixelSize + 0.1;
    const presentations = getEnemyDashAfterimagePresentations(
      dash,
      currentTime,
      spacing,
      getEnemyDashAfterimageFadeDurationMs(dash.abilityId),
    );

    for (const presentation of presentations) {
      const { createdAt: creationTime, index, opacity: alpha, position } = presentation;

      if (!isPositionInTileBounds(position, visibleTileBounds)) {
        continue;
      }

      const spriteSrc = getEntitySpriteSrc({
        currentTime: creationTime,
        entity: caster,
        map,
        visualMovementByEntityId,
      }) ?? getEntityIdleSpriteSrc(caster, map);

      if (!spriteSrc) {
        continue;
      }

      const pixelPosition = toFullPosition(position, transform);
      drawManagedImageSprite({
        alpha,
        anchorX: layout.anchorX,
        anchorY: layout.anchorY,
        cache,
        height: layout.height,
        key: `enemy-dash-afterimage:${dash.id}:${index}`,
        layer,
        managedState,
        metrics,
        position: {
          x: pixelPosition.x,
          y: pixelPosition.y + transform.cellPixelSize / 2,
        },
        requestRedraw,
        src: spriteSrc,
        tint: 0x7dd3fc,
        width: layout.width,
      });
    }
  }
}

function getEnemyDashAfterimageFadeDurationMs(abilityId: string): number {
  return abilityId === "night_bat_rending_dash" ? 220 : 300;
}

function drawSuperiorEnemyAura(
  graphics: Graphics,
  position: Position,
  layout: EntitySpriteLayout,
) {
  const radius = Math.max(layout.width, layout.height) * 0.38;

  graphics
    .circle(position.x, position.y - layout.height * 0.18, radius)
    .fill({ color: superiorEnemyAuraColor, alpha: 0.12 });
  graphics
    .circle(position.x, position.y - layout.height * 0.18, radius)
    .stroke({ color: superiorEnemyAuraColor, alpha: 0.92, width: 3 });
}

function drawQuestGiverMarker(
  graphics: Graphics,
  layer: Container,
  entities: GameEntity[],
  managedState: ManagedRendererState,
  metrics: PixiDrawMetrics,
  transform: FullTransform,
  visibleTileBounds: TileBounds,
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

  if (!isPositionInTileBounds(questGiver.position, visibleTileBounds)) {
    return;
  }

  const position = toFullPosition(questGiver.position, transform);
  const badgeRadius = Math.max(8, transform.cellPixelSize * 0.25);
  const markerPosition = {
    x: position.x + transform.cellPixelSize * 0.48,
    y: position.y - transform.cellPixelSize * 0.58,
  };

  graphics
    .circle(markerPosition.x, markerPosition.y, badgeRadius)
    .fill(0xfacc15)
    .stroke({ color: 0x92400e, alpha: 1, width: 1 });
  graphics
    .circle(markerPosition.x, markerPosition.y, badgeRadius + 2)
    .stroke({ color: 0xfacc15, alpha: 0.28, width: 4 });
  drawManagedFeedbackText({
    color: 0x451a03,
    fontSize: Math.max(12, transform.cellPixelSize * 0.38),
    key: "quest-giver-marker-label",
    layer,
    managedState,
    metrics,
    position: { x: markerPosition.x, y: markerPosition.y - 1 },
    text: "!",
  });
}

function drawPreviewInaccessibleCells(
  graphics: Graphics,
  map: GameMap,
  transform: PreviewTransform,
  accessibility: NavigationClickAccessibility | null,
) {
  for (const run of getPreviewInaccessibleCellRuns(map, accessibility)) {
    graphics
      .rect(
        transform.xOffset + run.x * transform.scale,
        transform.yOffset + run.y * transform.scale,
        run.width * transform.scale,
        transform.scale,
      )
      .fill({ color: 0x020617, alpha: 0.48 });
  }
}

function getPreviewInaccessibleCellRuns(
  map: GameMap,
  accessibility: NavigationClickAccessibility | null,
): PreviewInaccessibleCellRun[] {
  if (
    !accessibility ||
    accessibility.columns !== map.columns ||
    accessibility.rows !== map.rows
  ) {
    return [];
  }

  const cached = previewInaccessibleCellRunCacheByMap.get(map);

  if (cached?.signature === accessibility.signature) {
    return cached.runs;
  }

  const wallKeys = new Set(
    [...map.walls, ...(map.collisionWalls ?? [])].map(
      (position) => `${position.x},${position.y}`,
    ),
  );
  const runs: PreviewInaccessibleCellRun[] = [];

  for (let y = 0; y < map.rows; y += 1) {
    let runStartX: number | null = null;

    for (let x = 0; x <= map.columns; x += 1) {
      const key = `${x},${y}`;
      const cell = map.navigationGrid?.cellsByKey[key];
      const isInsideRow = x < map.columns;
      const isWalkable = isInsideRow
        ? (cell?.walkable ?? !wallKeys.has(key))
        : false;
      const shouldDim =
        isInsideRow && isWalkable && !accessibility.reachableCellKeys.has(key);

      if (shouldDim && runStartX === null) {
        runStartX = x;
        continue;
      }

      if ((!shouldDim || !isInsideRow) && runStartX !== null) {
        runs.push({
          width: x - runStartX,
          x: runStartX,
          y,
        });
        runStartX = null;
      }
    }
  }

  previewInaccessibleCellRunCacheByMap.set(map, {
    runs,
    signature: accessibility.signature,
  });

  return runs;
}

function drawMovementClickFeedbackEvents({
  currentTime,
  events,
  getCenterPosition,
  graphics,
  markerRadius,
}: {
  currentTime: number;
  events: MovementClickFeedbackEvent[];
  getCenterPosition: (position: Position) => Position;
  graphics: Graphics;
  markerRadius: number;
}) {
  for (const event of events) {
    if (event.expiresAt <= currentTime) {
      continue;
    }

    const duration = Math.max(1, event.expiresAt - event.createdAt);
    const progress = Math.min(
      1,
      Math.max(0, (currentTime - event.createdAt) / duration),
    );
    const alpha = Math.max(0, 1 - progress);
    const center = getCenterPosition(event.position);
    const radius = markerRadius * (1 + progress * 0.18);
    const slashOffset = radius * 0.6;

    graphics
      .circle(center.x, center.y, radius)
      .fill({ color: 0x7f1d1d, alpha: 0.42 * alpha })
      .stroke({ color: 0xf8fafc, alpha, width: Math.max(1, radius * 0.18) });
    graphics
      .moveTo(center.x - slashOffset, center.y + slashOffset)
      .lineTo(center.x + slashOffset, center.y - slashOffset)
      .stroke({ color: 0xf8fafc, alpha, width: Math.max(1, radius * 0.2) });
  }
}

function drawPreviewQuestObjectiveMarkers(
  graphics: Graphics,
  markers: QuestObjectiveMarker[],
  transform: PreviewTransform,
) {
  const radius = Math.max(3, transform.scale * 2.1);

  for (const marker of markers) {
    const markerPosition = toPreviewPosition(marker.position, transform);
    const center = {
      x: markerPosition.x + transform.scale / 2,
      y: markerPosition.y + transform.scale / 2,
    };

    graphics
      .circle(center.x, center.y, radius)
      .fill({ color: 0xfacc15, alpha: 0.48 });
    graphics
      .circle(center.x, center.y, radius + 2)
      .stroke({ color: 0xfacc15, alpha: 0.92, width: 2 });
  }
}

function drawPreviewMap(
  graphics: Graphics,
  map: GameMap,
  entities: GameEntity[],
  {
    cameraOffset,
    cellPixelSize,
    currentTime,
    movementClickFeedbackEvents,
    navigationClickAccessibility,
    questObjectiveMarkers,
    viewportSize,
  }: {
    cameraOffset: Position;
    cellPixelSize: number;
    currentTime: number;
    movementClickFeedbackEvents: MovementClickFeedbackEvent[];
    navigationClickAccessibility: NavigationClickAccessibility | null;
    questObjectiveMarkers: QuestObjectiveMarker[];
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

  drawPreviewInaccessibleCells(graphics, map, transform, navigationClickAccessibility);

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
    const fountainRadius = Math.max(
      entityRadius + 1,
      fountain.range * transform.scale,
    );

    graphics.circle(fountainPosition.x, fountainPosition.y, fountainRadius).fill(0x38bdf8);
  }

  for (const entity of entities) {
    if (entity.kind === "structure" || !shouldRenderEntity(entity)) {
      continue;
    }

    const entityPosition = toPreviewPosition(entity.position, transform);

    graphics
      .circle(entityPosition.x, entityPosition.y, entityRadius)
      .fill(getEntityColor(entity));
  }

  drawPreviewQuestObjectiveMarkers(
    graphics,
    questObjectiveMarkers,
    transform,
  );

  drawMovementClickFeedbackEvents({
    currentTime,
    events: movementClickFeedbackEvents,
    graphics,
    getCenterPosition: (position) => {
      const previewPosition = toPreviewPosition(position, transform);

      return {
        x: previewPosition.x + transform.scale / 2,
        y: previewPosition.y + transform.scale / 2,
      };
    },
    markerRadius: Math.max(5, transform.scale * 2.2),
  });

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
  combatProjectiles,
  companionDragPreview,
  companionAoeChannelsByCasterId,
  currentTime,
  directCompanionCommandsById,
  dropVisualEvents,
  enemyAbilityCastsByEnemyId,
  enemyDashesByEnemyId,
  enemyAoeChannelsByCasterId,
  entities,
  leaderIntent,
  layers,
  map,
  managedState,
  movementClickFeedbackEvents,
  onPerformanceSample,
  partyIntent,
  patronWardPresentation,
  warmasterAttempt,
  barracksById,
  questEntityIndicators,
  questObjectiveMarkers,
  questGiverHasWork,
  requestRedraw,
  renderSize,
  resurrectionProgressByCompanionId,
  showDebugOverlays,
  speechBubbleAvoidanceRects,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  statusPresentationTime,
  statusEffectsById,
  suppressMovePoiRing,
  teleportWorkingById,
  textureCache,
  visualMovementByEntityId,
}: {
  activeTeleport: ActiveTeleport | null;
  cameraOffset: Position;
  cellPixelSize: number;
  combatFeedbackEvents: CombatFeedbackEvent[];
  combatProjectiles: ActiveCombatProjectile[];
  companionDragPreview: CompanionDragPreview | null;
  companionAoeChannelsByCasterId: Record<string, CompanionAoeChannelState>;
  currentTime: number;
  directCompanionCommandsById: Record<string, DirectCompanionCommand>;
  dropVisualEvents: DropVisualEvent[];
  enemyAbilityCastsByEnemyId: Record<string, EnemyAbilityCastState>;
  enemyDashesByEnemyId: Record<string, EnemyDashState>;
  enemyAoeChannelsByCasterId: Record<string, EnemyAoeChannelState>;
  entities: GameEntity[];
  leaderIntent: LeaderIntent | null;
  layers: PixiRenderLayers;
  map: GameMap;
  managedState: ManagedRendererState;
  movementClickFeedbackEvents: MovementClickFeedbackEvent[];
  onPerformanceSample?: (sample: PixiRendererPerformanceSample) => void;
  partyIntent: PartyIntent | null;
  patronWardPresentation: PatronWardPresentationState | null;
  warmasterAttempt?: WarmasterAttempt;
  barracksById: Record<string, BarrackRuntime>;
  questEntityIndicators: QuestEntityIndicator[];
  questObjectiveMarkers: QuestObjectiveMarker[];
  questGiverHasWork: boolean;
  requestRedraw?: () => void;
  renderSize: RenderSize;
  resurrectionProgressByCompanionId: Record<string, ResurrectionProgressState>;
  showDebugOverlays: boolean;
  speechBubbleAvoidanceRects: readonly ViewportRect[];
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  statusPresentationTime: number;
  statusEffectsById: Record<string, StatusEffectState>;
  suppressMovePoiRing: boolean;
  teleportWorkingById: Record<string, boolean>;
  textureCache: TextureCache;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}) {
  const renderStartedAt = performance.now();
  const metrics = createPixiDrawMetrics();
  const transform: FullTransform = {
    cameraOffset,
    cellPixelSize,
  };
  const overlayGraphics = layers.overlayGraphics;
  const backgroundGraphics = layers.backgroundGraphics;
  const fallbackGraphics = layers.fallbackGraphics;
  const effectsGraphics = layers.effectsGraphics;
  const entitiesById = getEntityById(entities);
  const visibleTileBounds = getFullVisibleTileBounds({
    cameraOffset,
    cellPixelSize,
    map,
    renderSize,
  });

  beginManagedFrame(managedState, map.id ?? map.debugName);
  backgroundGraphics.clear();
  effectsGraphics.clear();
  fallbackGraphics.clear();
  overlayGraphics.clear();
  backgroundGraphics.rect(0, 0, renderSize.width, renderSize.height).fill(0x0f172a);
  drawFullFloor({
    backgroundGraphics,
    cache: textureCache,
    layer: layers.floorLayer,
    map,
    managedState,
    metrics,
    requestRedraw,
    transform,
    visibleTileBounds,
  });
  drawFullWalls({
    cache: textureCache,
    fallbackGraphics,
    layer: layers.wallLayer,
    map,
    managedState,
    metrics,
    requestRedraw,
    transform,
    visibleTileBounds,
  });
  drawFullMapVisualObjects({
    cache: textureCache,
    layer: layers.objectLayer,
    map,
    managedState,
    metrics,
    requestRedraw,
    transform,
    visibleTileBounds,
    entities,
  });
  drawPatronWardObjects({
    cache: textureCache,
    currentTime,
    layer: layers.objectLayer,
    map,
    managedState,
    metrics,
    presentation: patronWardPresentation,
    requestRedraw,
    transform,
    visibleTileBounds,
  });
  drawFullMapObjects({
    cache: textureCache,
    fallbackGraphics,
    layer: layers.objectLayer,
    map,
    managedState,
    metrics,
    requestRedraw,
    teleportWorkingById,
    transform,
    visibleTileBounds,
  });
  drawEnemyAbilityAreas(
    effectsGraphics,
    enemyAbilityCastsByEnemyId,
    currentTime,
    transform,
    visibleTileBounds,
  );
  drawEnemyDashAfterimages({
    cache: textureCache,
    currentTime,
    enemyDashesByEnemyId,
    entitiesById,
    layer: layers.objectLayer,
    managedState,
    map,
    metrics,
    requestRedraw,
    transform,
    visibleTileBounds,
    visualMovementByEntityId,
  });
  drawPatronDefenderAuras({
    warmasterAttempt,
    cache: textureCache,
    currentTime,
    entities,
    layer: layers.auraLayer,
    managedState,
    metrics,
    requestRedraw,
    transform,
    visibleTileBounds,
  });
  drawFullEntities({
    cache: textureCache,
    combatFeedbackEvents,
    currentTime,
    entities,
    fallbackGraphics,
    layer: layers.entityLayer,
    map,
    managedState,
    metrics,
    requestRedraw,
    skillShieldBlocksById,
    transform,
    visibleTileBounds,
    visualMovementByEntityId,
  });
  drawPatronBarrier(
    effectsGraphics,
    patronWardPresentation,
    currentTime,
    transform,
    visibleTileBounds,
  );
  drawPatronWarmasterScene({
    cache: textureCache,
    currentTime,
    graphics: effectsGraphics,
    layer: layers.effectsLayer,
    managedState,
    metrics,
    presentation: patronWardPresentation,
    renderSize,
    requestRedraw,
    speechBubbleAvoidanceRects,
    transform,
    visibleTileBounds,
  });
  drawFortifyingAuraOutlines(
    effectsGraphics,
    entities,
    statusEffectsById,
    statusPresentationTime,
    map,
    transform,
    visibleTileBounds,
  );
  drawEnemyAbilityCastGlows(
    effectsGraphics,
    enemyAbilityCastsByEnemyId,
    entitiesById,
    currentTime,
    transform,
    visibleTileBounds,
  );
  drawEnemyAoeChannels(
    effectsGraphics,
    enemyAoeChannelsByCasterId,
    currentTime,
    transform,
    visibleTileBounds,
  );
  drawCompanionAoeChannels(
    effectsGraphics,
    companionAoeChannelsByCasterId,
    currentTime,
    transform,
    visibleTileBounds,
  );
  drawFullEffects({
    cache: textureCache,
    combatFeedbackEvents,
    combatProjectiles,
    currentTime,
    dropVisualEvents,
    entities,
    graphics: effectsGraphics,
    layer: layers.effectsLayer,
    map,
    managedState,
    metrics,
    partyIntent,
    requestRedraw,
    resurrectionProgressByCompanionId,
    skillBindsByEnemyId,
    skillMarksByEnemyId,
    skillShieldBlocksById,
    skillVisualEvents,
    transform,
    visibleTileBounds,
  });
  drawQuestObjectiveMarkers(
    overlayGraphics,
    questObjectiveMarkers,
    transform,
    visibleTileBounds,
  );
  if (activeTeleport && isPositionInTileBounds(activeTeleport.position, visibleTileBounds)) {
    const activeTeleportPosition = toFullPosition(activeTeleport.position, transform);
    const pulseProgress = (currentTime % 900) / 900;
    const pulseSize = transform.cellPixelSize * (1.65 + pulseProgress * 0.45);

    drawManagedImageSprite({
      alpha: 0.78 * (1 - pulseProgress * 0.55),
      anchorX: 0.5,
      anchorY: 0.5,
      cache: textureCache,
      height: pulseSize,
      key: `active-teleport:${activeTeleport.id}`,
      layer: layers.effectsLayer,
      managedState,
      metrics,
      position: activeTeleportPosition,
      requestRedraw,
      src: teleportPulseSrc,
      width: pulseSize,
    });
  }
  drawQuestGiverMarker(
    effectsGraphics,
    layers.effectsLayer,
    entities,
    managedState,
    metrics,
    transform,
    visibleTileBounds,
    questGiverHasWork,
  );
  drawMovementClickFeedbackEvents({
    currentTime,
    events: movementClickFeedbackEvents,
    graphics: overlayGraphics,
    getCenterPosition: (position) => toFullPosition(position, transform),
    markerRadius: Math.max(8, transform.cellPixelSize * 0.28),
  });
  drawCompanionDragPreview(
    overlayGraphics,
    entities,
    companionDragPreview,
    transform,
    visibleTileBounds,
  );

  if (showDebugOverlays) {
    drawDirectCompanionCommandIndicators(
      overlayGraphics,
      entities,
      directCompanionCommandsById,
      transform,
      visibleTileBounds,
    );
  }

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

    for (const waypoint of map.waypoints ?? []) {
      if (!isPositionInTileBounds(waypoint.position, visibleTileBounds)) {
        continue;
      }

      const waypointPosition = toFullPosition(waypoint.position, transform);
      const didDraw = drawManagedImageSprite({
        anchorX: 0.5,
        anchorY: 0.5,
        cache: textureCache,
        height: cellPixelSize,
        key: `waypoint:${map.id}:${waypoint.id}`,
        layer: layers.effectsLayer,
        managedState,
        metrics,
        position: waypointPosition,
        requestRedraw,
        src: MAP_OBJECT_ICON_SRC.slimewardWaypoint,
        width: cellPixelSize,
      });

      if (!didDraw) {
        overlayGraphics
          .circle(waypointPosition.x, waypointPosition.y, cellPixelSize * 0.25)
          .fill({ color: 0x38bdf8, alpha: 0.75 });
      }
    }

    for (const entity of entities) {
      if (
        isPositionInTileBounds(entity.position, visibleTileBounds) &&
        shouldDrawEnemyAggroRange(entity, currentTime, visualMovementByEntityId)
      ) {
        drawEnemyAggroRange(overlayGraphics, entity, transform);
      }

      if (isPositionInTileBounds(entity.position, visibleTileBounds)) {
        drawCompanionDebugCollisionShape(overlayGraphics, entity, transform);
      }
    }

    drawTargetDummyDistanceMarkers({
      entities,
      graphics: overlayGraphics,
      layer: layers.effectsLayer,
      managedState,
      metrics,
      transform,
      visibleTileBounds,
    });
  }

  if (activeTeleport && isPositionInTileBounds(activeTeleport.position, visibleTileBounds)) {
    const activeTeleportPosition = toFullPosition(activeTeleport.position, transform);

    overlayGraphics
      .circle(
        activeTeleportPosition.x,
        activeTeleportPosition.y,
        activeTeleport.range * cellPixelSize,
      )
      .stroke({ color: 0xa855f7, alpha: 0.55, width: 3 });
  }

  drawEnemyAoeChannelBars(
    overlayGraphics,
    enemyAoeChannelsByCasterId,
    entitiesById,
    currentTime,
    transform,
    visibleTileBounds,
  );

  drawEntityOverheadUiPass({
    warmasterAttempt,
    currentTime,
    enemyAbilityCastsByEnemyId,
    entities,
    graphics: layers.effectsGraphics,
    layer: layers.effectsLayer,
    managedState,
    metrics,
    questEntityIndicators,
    statusPresentationTime,
    statusEffectsById,
    transform,
    visibleTileBounds,
  });
  for (const entity of entities) {
    if (entity.kind !== "structure" || entity.health <= 0) continue;
    const visual = map.visualObjects?.find(object => object.id === entity.id);
    if (!visual || !isMapVisualObjectInTileBounds(visual, visibleTileBounds)) continue;
    const runtime = barracksById[entity.id];
    const center = toFullPosition(entity.position, transform);
    const width = visual.widthCells * cellPixelSize;
    const height = visual.heightCells * cellPixelSize;
    const x = center.x - width / 2;
    const y = center.y + cellPixelSize / 2 - height;
    const pulse = 0.35 + Math.sin(currentTime / 240) * 0.15;
    overlayGraphics.roundRect(x, y, width, height, 6).stroke({ color: 0xef4444, alpha: pulse, width: visual.widthCells > 3 ? 3 : 2 });
    overlayGraphics.rect(x, y - 12, width, 6).fill(0x450a0a);
    overlayGraphics.rect(x, y - 12, width * entity.health / entity.maxHealth, 6).fill(0xef4444);
    if (runtime?.wasInRange && runtime.preparationMs > 0) {
      overlayGraphics.rect(x, y - 4, width, 4).fill(0x422006);
      overlayGraphics.rect(x, y - 4, width * runtime.preparationMs / BARRACK_PREPARATION_MS, 4).fill(0xfbbf24);
    }
    if ((runtime?.hintExpiresAtMs ?? 0) > currentTime) {
      drawManagedFeedbackText({ color: 0xfef08a, fontSize: 12, key: `barrack-hint:${entity.id}`,
        layer: layers.effectsLayer, managedState, metrics,
        position: { x: center.x, y: center.y + cellPixelSize }, text: "Click the Barrack to attack it" });
    }
  }
  drawPatronWardLabels({
    layer: layers.effectsLayer,
    managedState,
    metrics,
    presentation: patronWardPresentation,
    transform,
    visibleTileBounds,
  });

  for (const entity of entities) {
    if (isPositionInTileBounds(entity.position, visibleTileBounds)) {
      drawEnemyAttackWindupBar(overlayGraphics, entity, currentTime, transform);
    }
  }

  const targetEntity = leaderIntent?.targetId
    ? entities.find((entity) => entity.id === leaderIntent.targetId)
    : undefined;

  if (
    leaderIntent?.type === "move" &&
    leaderIntent.targetPosition &&
    !suppressMovePoiRing
  ) {
    drawPoiRing(overlayGraphics, leaderIntent.targetPosition, transform, 0xfacc15);
  } else if (targetEntity) {
    drawPoiRing(overlayGraphics, targetEntity.position, transform, 0xf97316);
  }

  endManagedFrame(managedState);
  metrics.fullDrawCount = 1;
  finishPixiDrawMetrics(metrics, managedState, textureCache);
  metrics.renderMs = performance.now() - renderStartedAt;
  onPerformanceSample?.(metrics);
}

function drawNpcSpeechLayer({
  avoidanceRects,
  cameraOffset,
  cellPixelSize,
  currentTime,
  entities,
  layer,
  layerState,
  map,
  mode,
  renderSize,
  speech,
}: {
  avoidanceRects: readonly ViewportRect[];
  cameraOffset: Position;
  cellPixelSize: number;
  currentTime: number;
  entities: GameEntity[];
  layer: Container;
  layerState: NpcSpeechLayerState;
  map: GameMap;
  mode: PixiRendererMode;
  renderSize: RenderSize;
  speech: ActiveNpcSpeech | null;
}): boolean {
  const speaker = speech
    ? entities.find(
        (entity) => entity.id === speech.npcId && (entity.kind === "npc" || (entity.kind === "structure" && entity.health > 0)),
      )
    : null;

  if (
    mode !== "full" ||
    !speech ||
    !speaker ||
    getNpcSpeechOpacity(speech, currentTime) <= 0
  ) {
    if (layerState.signature === null && !layer.visible) {
      return false;
    }

    clearLayer(layer);
    layer.visible = false;
    layer.alpha = 0;
    layerState.alpha = 0;
    layerState.signature = null;
    return true;
  }

  const transform: FullTransform = { cameraOffset, cellPixelSize };
  const entityPosition = toFullPosition(speaker.position, transform);
  const visualAsset = getEntityVisualAsset(speaker, map.id);
  const spriteLayout = speaker.kind === "structure"
    ? { height: (map.visualObjects?.find(object => object.id === speaker.id)?.heightCells ?? 3) * cellPixelSize, anchorY: 1 }
    : getEntitySpriteLayout(
    speaker,
    cellPixelSize,
    visualAsset,
  );
  const spritePositionY = entityPosition.y + cellPixelSize / 2;
  const speakerTopY = spritePositionY - spriteLayout.height * spriteLayout.anchorY;
  const speakerBottomY =
    spritePositionY + spriteLayout.height * (1 - spriteLayout.anchorY);
  const signature = [
    speech.npcId,
    speech.text,
    speech.createdAt,
    speech.expiresAt,
    speaker.position.x,
    speaker.position.y,
    cameraOffset.x,
    cameraOffset.y,
    cellPixelSize,
    renderSize.width,
    renderSize.height,
    getViewportRectsSignature(avoidanceRects),
    map.id ?? map.debugName,
  ].join("|");
  let didChange = false;

  if (layerState.signature !== signature) {
    clearLayer(layer);

    const availableWidth = Math.max(1, renderSize.width - 16);
    const maximumBubbleWidth = Math.min(
      npcSpeechMaximumWidth,
      availableWidth,
    );
    const wrapWidth = Math.max(
      40,
      maximumBubbleWidth - npcSpeechHorizontalPadding * 2,
    );
    const label = new Text({
      text: speech.text,
      style: {
        breakWords: true,
        fill: npcSpeechTextColor,
        fontFamily: '"Courier New", monospace',
        fontSize: npcSpeechFontSize,
        fontWeight: "700",
        lineHeight: 16,
        wordWrap: true,
        wordWrapWidth: wrapWidth,
      },
    });
    const minimumBubbleWidth = Math.min(
      npcSpeechMinimumWidth,
      maximumBubbleWidth,
    );
    const bubbleWidth = Math.min(
      maximumBubbleWidth,
      Math.max(
        minimumBubbleWidth,
        Math.ceil(label.width) + npcSpeechHorizontalPadding * 2,
      ),
    );
    const bubbleHeight = Math.ceil(label.height) + npcSpeechVerticalPadding * 2;
    const layout = getNpcSpeechBubbleLayout({
      avoidanceRects,
      bubbleHeight,
      bubbleWidth,
      renderHeight: renderSize.height,
      renderWidth: renderSize.width,
      speakerBottomY,
      speakerTopY,
      speakerX: entityPosition.x,
    });
    const graphics = new Graphics();
    const shadowOffset = 4;
    const tailPoints = [
      layout.tailBaseLeftX,
      layout.tailBaseY,
      layout.tailBaseRightX,
      layout.tailBaseY,
      layout.tailPointX,
      layout.tailPointY,
    ];
    const shadowTailPoints = tailPoints.map((coordinate) => coordinate + shadowOffset);

    graphics
      .poly(shadowTailPoints)
      .fill({ color: npcSpeechShadowColor, alpha: 0.72 });
    graphics
      .rect(
        layout.bubbleX + shadowOffset,
        layout.bubbleY + shadowOffset,
        bubbleWidth,
        bubbleHeight,
      )
      .fill({ color: npcSpeechShadowColor, alpha: 0.72 });
    graphics
      .poly(tailPoints)
      .fill(npcSpeechBackgroundColor)
      .stroke({ color: npcSpeechBorderColor, width: 3 });
    graphics
      .rect(layout.bubbleX, layout.bubbleY, bubbleWidth, bubbleHeight)
      .fill(npcSpeechBackgroundColor)
      .stroke({ color: npcSpeechBorderColor, width: 3 });

    label.position.set(
      layout.bubbleX + npcSpeechHorizontalPadding,
      layout.bubbleY + npcSpeechVerticalPadding,
    );
    layer.addChild(graphics);
    layer.addChild(label);
    layer.visible = true;
    layerState.signature = signature;
    didChange = true;
  }

  const alpha = getNpcSpeechOpacity(speech, currentTime);

  if (layerState.alpha !== alpha || layer.alpha !== alpha) {
    layer.alpha = alpha;
    layerState.alpha = alpha;
    didChange = true;
  }

  return didChange;
}

function drawWorld({
  activeTeleport,
  cameraOffset,
  cellPixelSize,
  combatFeedbackEvents,
  combatProjectiles,
  companionDragPreview,
  companionAoeChannelsByCasterId,
  currentTime,
  directCompanionCommandsById,
  dropVisualEvents,
  enemyAbilityCastsByEnemyId,
  enemyDashesByEnemyId,
  enemyAoeChannelsByCasterId,
  entities,
  leaderIntent,
  layers,
  map,
  managedState,
  mode,
  movementClickFeedbackEvents,
  navigationClickAccessibility,
  onPerformanceSample,
  partyIntent,
  patronWardPresentation,
  warmasterAttempt,
  barracksById,
  fullHadTimedWorkRef,
  fullSignatureRef,
  lastDrawnTextureRevisionRef,
  previewSignatureRef,
  questEntityIndicators,
  questObjectiveMarkers,
  questGiverHasWork,
  requestRedraw,
  renderSize,
  resurrectionProgressByCompanionId,
  showDebugOverlays,
  speechBubbleAvoidanceRects,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  statusPresentationTime,
  statusEffectsById,
  suppressMovePoiRing,
  teleportWorkingById,
  textureCache,
  viewportSize,
  visualMovementByEntityId,
}: DrawWorldOptions): boolean {
  if (mode === "full") {
    previewSignatureRef.current = null;
    const hasTimedWork = hasActiveTimedRendererWork({
      activeTeleport,
      combatFeedbackEvents,
      combatProjectiles,
      companionAoeChannelsByCasterId,
      currentTime,
      dropVisualEvents,
      enemyAbilityCastsByEnemyId,
      enemyDashesByEnemyId,
      enemyAoeChannelsByCasterId,
      entities,
      movementClickFeedbackEvents,
      mode,
      patronWardPresentation,
      warmasterAttempt,
      barracksById,
      skillBindsByEnemyId,
      skillMarksByEnemyId,
      skillShieldBlocksById,
      skillVisualEvents,
      statusPresentationTime,
      statusEffectsById,
      visualMovementByEntityId,
    });
    const fullSignature = `${getFullRenderSignature({
      barracksById,
      activeTeleport,
      cameraOffset,
      cellPixelSize,
      combatFeedbackEvents,
      combatProjectiles,
      companionAoeChannelsByCasterId,
      directCompanionCommandsById,
      dropVisualEvents,
      enemyAbilityCastsByEnemyId,
      enemyDashesByEnemyId,
      enemyAoeChannelsByCasterId,
      entities,
      leaderIntent,
      map,
      movementClickFeedbackEvents,
      partyIntent,
      questEntityIndicators,
      questGiverHasWork,
      questObjectiveMarkers,
      renderSize,
      resurrectionProgressByCompanionId,
      showDebugOverlays,
      skillBindsByEnemyId,
      skillMarksByEnemyId,
      skillShieldBlocksById,
      skillVisualEvents,
      statusEffectsById,
      suppressMovePoiRing,
      teleportWorkingById,
      visualMovementByEntityId,
    })}|patron:${getPatronWardPresentationSignature(
      patronWardPresentation,
    )}|warmaster:${JSON.stringify(warmasterAttempt)}|speech-avoidance:${getViewportRectsSignature(
      speechBubbleAvoidanceRects,
    )}`;

    const textureRevision = textureCache.textureRevision;

    if (
      shouldSkipStableRendererFrame({
        hadTimedWork: fullHadTimedWorkRef.current,
        hasTimedWork,
        lastDrawnTextureRevision: lastDrawnTextureRevisionRef.current,
        signatureUnchanged: fullSignatureRef.current === fullSignature,
        textureRevision,
      })
    ) {
      return false;
    }

    fullSignatureRef.current = fullSignature;
    fullHadTimedWorkRef.current = hasTimedWork;
    lastDrawnTextureRevisionRef.current = textureRevision;
    drawFullMap({
      activeTeleport,
      cameraOffset,
      cellPixelSize,
      combatFeedbackEvents,
      combatProjectiles,
      companionDragPreview,
      companionAoeChannelsByCasterId,
      currentTime,
      directCompanionCommandsById,
      dropVisualEvents,
      enemyAbilityCastsByEnemyId,
      enemyDashesByEnemyId,
      enemyAoeChannelsByCasterId,
      entities,
      leaderIntent,
      layers,
      map,
      managedState,
      movementClickFeedbackEvents,
      onPerformanceSample,
      partyIntent,
      patronWardPresentation,
      warmasterAttempt,
      barracksById,
      questEntityIndicators,
      questObjectiveMarkers,
      questGiverHasWork,
      requestRedraw,
      renderSize,
      resurrectionProgressByCompanionId,
      showDebugOverlays,
      speechBubbleAvoidanceRects,
      skillBindsByEnemyId,
      skillMarksByEnemyId,
      skillShieldBlocksById,
      skillVisualEvents,
      statusPresentationTime,
      statusEffectsById,
      suppressMovePoiRing,
      teleportWorkingById,
      textureCache,
      visualMovementByEntityId,
    });
    return true;
  }

  fullHadTimedWorkRef.current = false;
  fullSignatureRef.current = null;
  const hasPreviewTimedWork = movementClickFeedbackEvents.some(
    (event) => event.expiresAt > currentTime,
  );
  const previewSignature = getPreviewRenderSignature({
    cameraOffset,
    cellPixelSize,
    entities,
    map,
    movementClickFeedbackEvents,
    navigationClickAccessibility,
    questObjectiveMarkers,
    viewportSize,
  });

  const textureRevision = textureCache.textureRevision;

  if (
    shouldSkipStableRendererFrame({
      hadTimedWork: movementClickFeedbackEvents.length > 0,
      hasTimedWork: hasPreviewTimedWork,
      lastDrawnTextureRevision: lastDrawnTextureRevisionRef.current,
      signatureUnchanged: previewSignatureRef.current === previewSignature,
      textureRevision,
    })
  ) {
    return false;
  }

  previewSignatureRef.current = previewSignature;
  lastDrawnTextureRevisionRef.current = textureRevision;
  clearLayers(layers);
  resetManagedRendererState(managedState);
  const renderStartedAt = performance.now();
  const metrics = createPixiDrawMetrics();
  metrics.previewDrawCount = 1;
  drawPreviewMap(layers.overlayGraphics, map, entities, {
    cameraOffset,
    cellPixelSize,
    currentTime,
    movementClickFeedbackEvents,
    navigationClickAccessibility,
    questObjectiveMarkers,
    viewportSize,
  });
  finishPixiDrawMetrics(metrics, managedState, textureCache);
  metrics.renderMs = performance.now() - renderStartedAt;
  onPerformanceSample?.(metrics);

  return true;
}

function hasActiveTimedRendererWork({
  activeTeleport,
  combatFeedbackEvents,
  combatProjectiles,
  companionAoeChannelsByCasterId,
  currentTime,
  dropVisualEvents,
  enemyAbilityCastsByEnemyId,
  enemyDashesByEnemyId,
  enemyAoeChannelsByCasterId,
  entities,
  movementClickFeedbackEvents,
  mode,
  patronWardPresentation,
  warmasterAttempt,
  barracksById,
  skillBindsByEnemyId,
  skillMarksByEnemyId,
  skillShieldBlocksById,
  skillVisualEvents,
  statusPresentationTime,
  statusEffectsById,
  visualMovementByEntityId,
}: {
  activeTeleport: ActiveTeleport | null;
  combatFeedbackEvents: CombatFeedbackEvent[];
  combatProjectiles: ActiveCombatProjectile[];
  companionAoeChannelsByCasterId: Record<string, CompanionAoeChannelState>;
  currentTime: number;
  dropVisualEvents: DropVisualEvent[];
  enemyAbilityCastsByEnemyId: Record<string, EnemyAbilityCastState>;
  enemyDashesByEnemyId: Record<string, EnemyDashState>;
  enemyAoeChannelsByCasterId: Record<string, EnemyAoeChannelState>;
  entities: GameEntity[];
  movementClickFeedbackEvents: MovementClickFeedbackEvent[];
  mode: PixiRendererMode;
  patronWardPresentation: PatronWardPresentationState | null;
  warmasterAttempt?: WarmasterAttempt;
  barracksById: Record<string, BarrackRuntime>;
  skillBindsByEnemyId: Record<string, SkillBindState>;
  skillMarksByEnemyId: Record<string, SkillMarkState>;
  skillShieldBlocksById: Record<string, SkillShieldBlockState>;
  skillVisualEvents: SkillVisualEvent[];
  statusPresentationTime: number;
  statusEffectsById: Record<string, StatusEffectState>;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}): boolean {
  const hasActiveMovementClickFeedback = movementClickFeedbackEvents.some(
    (event) => event.expiresAt > currentTime,
  );

  if (mode !== "full") {
    return hasActiveMovementClickFeedback;
  }

  return (
    Boolean(activeTeleport) ||
    Boolean(warmasterAttempt) ||
    entities.some(entity => entity.kind === "structure" && (barracksById[entity.id]?.health ?? entity.health) > 0) ||
    Boolean(
      patronWardPresentation?.barrier ||
        patronWardPresentation?.wards.some(
          (ward) =>
            !ward.completed ||
            getPatronWardFadeOpacity(
              ward.propFadeStartedAtMs,
              currentTime,
            ) > 0,
        ) ||
        entities.some(
          (entity) =>
            entity.kind === "enemy" &&
            entity.questSpawn?.patronAura === true &&
            entity.state !== "dead",
        ),
    ) ||
    hasActiveMovementClickFeedback ||
    combatProjectiles.length > 0 ||
    combatFeedbackEvents.some((event) => event.expiresAt > currentTime) ||
    dropVisualEvents.some((event) => event.expiresAt > currentTime) ||
    skillVisualEvents.some((event) => event.expiresAt > currentTime) ||
    Object.values(enemyAbilityCastsByEnemyId).some(
      (cast) => cast.windupEndsAt > currentTime,
    ) ||
    Object.values(enemyDashesByEnemyId).some(
      (dash) => dash.endsAt > currentTime,
    ) ||
    Object.values(visualMovementByEntityId).some(
      (movement) => movement.expiresAt > currentTime,
    ) ||
    Object.values(skillBindsByEnemyId).some((bind) => bind.expiresAt > currentTime) ||
    Object.values(skillMarksByEnemyId).some((mark) => mark.expiresAt > currentTime) ||
    Object.values(skillShieldBlocksById).some(
      (shield) => shield.expiresAt > currentTime,
    ) ||
    Object.values(statusEffectsById).some(
      (status) => status.expiresAt > statusPresentationTime,
    ) ||
    Object.values(companionAoeChannelsByCasterId).some(
      (channel) => channel.channelEndsAt > currentTime,
    ) ||
    Object.values(enemyAoeChannelsByCasterId).some(
      (channel) =>
        channel.channelEndsAt > currentTime ||
        channel.windupEndsAt > currentTime,
    ) ||
    entities.some(
      (entity) =>
        (entity.kind === "enemy" &&
          entity.state === "dead" &&
          (entity.defeatedAtMs ?? currentTime) + deadEnemyFadeDurationMs >
            currentTime) ||
        (entity.kind === "enemy" &&
          entity.attackWindupStartedAt !== undefined &&
          entity.attackWindupStartedAt +
            (entity.attackWindupDurationMs ?? 500) >
            currentTime),
    )
  );
}

function getPatronWardPresentationSignature(
  presentation: PatronWardPresentationState | null,
): string {
  return presentation ? JSON.stringify(presentation) : "none";
}

function getViewportRectsSignature(rects: readonly ViewportRect[]): string {
  return rects
    .map(
      (rect) =>
        `${rect.x.toFixed(1)},${rect.y.toFixed(1)},${rect.width.toFixed(1)},${rect.height.toFixed(1)}`,
    )
    .join("|");
}

export function PixiWorldRenderer({
  activeTeleport = null,
  cameraOffset = { x: 0, y: 0 },
  cellPixelSize = defaultCellPixelSize,
  combatFeedbackEvents = [],
  combatProjectiles = [],
  companionAoeChannelsByCasterId = {},
  currentTime,
  directCompanionCommandsById = {},
  dropVisualEvents = [],
  enemyAbilityCastsByEnemyId = {},
  enemyDashesByEnemyId = {},
  enemyAoeChannelsByCasterId = {},
  entities,
  leaderIntent = null,
  map,
  mode = "preview",
  movementClickFeedbackEvents = [],
  navigationClickAccessibility = null,
  npcSpeech = null,
  onCompanionDragCommand,
  onEnemyClick,
  onEntityHover,
  onFloorClick,
  onNpcClick,
  onPerformanceSample,
  onViewportRectChange,
  onCursorPositionChange,
  onPatronWardClick,
  onResourceClick,
  partyIntent = null,
  patronWardPresentation = null,
  warmasterAttempt,
  barracksById = {},
  questEntityIndicators = [],
  questObjectiveMarkers = [],
  resurrectionProgressByCompanionId = {},
  questGiverHasWork = false,
  showDebugOverlays = false,
  speechBubbleAvoidanceRects = [],
  skillBindsByEnemyId = {},
  skillMarksByEnemyId = {},
  skillShieldBlocksById = {},
  skillVisualEvents = [],
  statusEffectsById = {},
  statusPresentationTime,
  suppressMovePoiRing = false,
  teleportWorkingById = {},
  viewportSize,
  visualMovementByEntityId = {},
}: PixiWorldRendererProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<PixiRenderLayers | null>(null);
  const appliedRenderSizeRef = useRef<RenderSize | null>(null);
  const requestRedrawRef = useRef<() => void>(() => {});
  const textureCacheRef = useRef(createTextureCache());
  const managedStateRef = useRef(createManagedRendererState());
  const fullHadTimedWorkRef = useRef(false);
  const fullSignatureRef = useRef<string | null>(null);
  const lastDrawnTextureRevisionRef = useRef<number | null>(null);
  const previewSignatureRef = useRef<string | null>(null);
  const npcSpeechLayerStateRef = useRef<NpcSpeechLayerState>({
    alpha: 0,
    signature: null,
  });
  const preloadedVisualTextureSignatureRef = useRef<string | null>(null);
  const latestCameraOffsetRef = useRef(cameraOffset);
  const latestCellPixelSizeRef = useRef(cellPixelSize);
  const latestCombatFeedbackEventsRef = useRef(combatFeedbackEvents);
  const latestCombatProjectilesRef = useRef(combatProjectiles);
  const latestCompanionAoeChannelsByCasterIdRef = useRef(
    companionAoeChannelsByCasterId,
  );
  const latestCurrentTimeRef = useRef(currentTime ?? Date.now());
  const latestStatusPresentationTimeRef = useRef(
    statusPresentationTime ?? currentTime ?? Date.now(),
  );
  const latestDirectCompanionCommandsByIdRef = useRef(directCompanionCommandsById);
  const latestDropVisualEventsRef = useRef(dropVisualEvents);
  const latestEnemyAbilityCastsByEnemyIdRef = useRef(
    enemyAbilityCastsByEnemyId,
  );
  const latestEnemyDashesByEnemyIdRef = useRef(enemyDashesByEnemyId);
  const latestEnemyAoeChannelsByCasterIdRef = useRef(enemyAoeChannelsByCasterId);
  const latestActiveTeleportRef = useRef<ActiveTeleport | null>(activeTeleport);
  const latestMapRef = useRef(map);
  const latestEntitiesRef = useRef<GameEntity[]>(entities);
  const latestLeaderIntentRef = useRef<LeaderIntent | null>(leaderIntent);
  const latestMovementClickFeedbackEventsRef = useRef(
    movementClickFeedbackEvents,
  );
  const latestNavigationClickAccessibilityRef = useRef(
    navigationClickAccessibility,
  );
  const latestNpcSpeechRef = useRef<ActiveNpcSpeech | null>(npcSpeech);
  const latestModeRef = useRef(mode);
  const latestOnPerformanceSampleRef = useRef(onPerformanceSample);
  const latestPartyIntentRef = useRef<PartyIntent | null>(partyIntent);
  const latestPatronWardPresentationRef = useRef(patronWardPresentation);
  const latestWarmasterAttemptRef = useRef(warmasterAttempt);
  const latestBarracksByIdRef = useRef(barracksById);
  const latestQuestEntityIndicatorsRef = useRef(questEntityIndicators);
  const latestQuestObjectiveMarkersRef = useRef(questObjectiveMarkers);
  const latestQuestGiverHasWorkRef = useRef(questGiverHasWork);
  const latestRenderSizeRef = useRef(getRenderSize(mode, viewportSize));
  const latestViewportSizeRef = useRef(viewportSize);
  const latestResurrectionProgressByCompanionIdRef = useRef(
    resurrectionProgressByCompanionId,
  );
  const latestShowDebugOverlaysRef = useRef(showDebugOverlays);
  const latestSpeechBubbleAvoidanceRectsRef = useRef(
    speechBubbleAvoidanceRects,
  );
  const latestSkillBindsByEnemyIdRef = useRef(skillBindsByEnemyId);
  const latestSkillMarksByEnemyIdRef = useRef(skillMarksByEnemyId);
  const latestSkillShieldBlocksByIdRef = useRef(skillShieldBlocksById);
  const latestSkillVisualEventsRef = useRef(skillVisualEvents);
  const latestStatusEffectsByIdRef = useRef(statusEffectsById);
  const latestSuppressMovePoiRingRef = useRef(suppressMovePoiRing);
  const latestTeleportWorkingByIdRef = useRef(teleportWorkingById);
  const latestVisualMovementByEntityIdRef = useRef(visualMovementByEntityId);
  const companionDragStateRef = useRef<CompanionDragState | null>(null);
  const companionDragPreviewRef = useRef<CompanionDragPreview | null>(null);
  const suppressNextClickRef = useRef(false);
  const renderSize = useMemo(
    () => getRenderSize(mode, viewportSize),
    [mode, viewportSize],
  );
  const requestLatestRedraw = useMemo(
    () => () => {
      requestRedrawRef.current();
    },
    [],
  );
  const sortedEntities = useMemo(
    () => [...entities].sort((first, second) => first.id.localeCompare(second.id)),
    [entities],
  );

  useEffect(() => {
    if (!onViewportRectChange) {
      return;
    }

    const host = hostRef.current;

    if (!host) {
      onViewportRectChange(null);
      return;
    }
    const measuredHost = host;

    function reportBounds() {
      const bounds = measuredHost.getBoundingClientRect();

      onViewportRectChange?.({
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });
    }

    reportBounds();
    window.addEventListener("resize", reportBounds);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(reportBounds);
    resizeObserver?.observe(measuredHost);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", reportBounds);
      onViewportRectChange(null);
    };
  }, [onViewportRectChange]);

  useEffect(() => {
    latestActiveTeleportRef.current = activeTeleport;
    latestCameraOffsetRef.current = cameraOffset;
    latestCellPixelSizeRef.current = cellPixelSize;
    latestCombatFeedbackEventsRef.current = combatFeedbackEvents;
    latestCombatProjectilesRef.current = combatProjectiles;
    latestCompanionAoeChannelsByCasterIdRef.current =
      companionAoeChannelsByCasterId;
    if (currentTime !== undefined) {
      latestCurrentTimeRef.current = currentTime;
    }
    if (statusPresentationTime !== undefined) {
      latestStatusPresentationTimeRef.current = statusPresentationTime;
    } else if (currentTime !== undefined) {
      latestStatusPresentationTimeRef.current = currentTime;
    }
    latestDirectCompanionCommandsByIdRef.current = directCompanionCommandsById;
    latestDropVisualEventsRef.current = dropVisualEvents;
    latestEnemyAbilityCastsByEnemyIdRef.current = enemyAbilityCastsByEnemyId;
    latestEnemyDashesByEnemyIdRef.current = enemyDashesByEnemyId;
    latestEnemyAoeChannelsByCasterIdRef.current = enemyAoeChannelsByCasterId;
    latestMapRef.current = map;
    latestEntitiesRef.current = sortedEntities;
    latestLeaderIntentRef.current = leaderIntent;
    latestMovementClickFeedbackEventsRef.current = movementClickFeedbackEvents;
    latestNavigationClickAccessibilityRef.current = navigationClickAccessibility;
    latestNpcSpeechRef.current = npcSpeech;
    latestModeRef.current = mode;
    latestOnPerformanceSampleRef.current = onPerformanceSample;
    latestPartyIntentRef.current = partyIntent;
    latestPatronWardPresentationRef.current = patronWardPresentation;
    latestWarmasterAttemptRef.current = warmasterAttempt;
    latestBarracksByIdRef.current = barracksById;
    latestQuestEntityIndicatorsRef.current = questEntityIndicators;
    latestQuestObjectiveMarkersRef.current = questObjectiveMarkers;
    latestQuestGiverHasWorkRef.current = questGiverHasWork;
    latestRenderSizeRef.current = renderSize;
    latestViewportSizeRef.current = viewportSize;
    latestResurrectionProgressByCompanionIdRef.current =
      resurrectionProgressByCompanionId;
    latestShowDebugOverlaysRef.current = showDebugOverlays;
    latestSpeechBubbleAvoidanceRectsRef.current = speechBubbleAvoidanceRects;
    latestSkillBindsByEnemyIdRef.current = skillBindsByEnemyId;
    latestSkillMarksByEnemyIdRef.current = skillMarksByEnemyId;
    latestSkillShieldBlocksByIdRef.current = skillShieldBlocksById;
    latestSkillVisualEventsRef.current = skillVisualEvents;
    latestStatusEffectsByIdRef.current = statusEffectsById;
    latestSuppressMovePoiRingRef.current = suppressMovePoiRing;
    latestTeleportWorkingByIdRef.current = teleportWorkingById;
    latestVisualMovementByEntityIdRef.current = visualMovementByEntityId;
  }, [
    activeTeleport,
    cameraOffset,
    cellPixelSize,
    combatFeedbackEvents,
    combatProjectiles,
    companionAoeChannelsByCasterId,
    currentTime,
    directCompanionCommandsById,
    dropVisualEvents,
    enemyAbilityCastsByEnemyId,
    enemyDashesByEnemyId,
    enemyAoeChannelsByCasterId,
    leaderIntent,
    map,
    mode,
    movementClickFeedbackEvents,
    navigationClickAccessibility,
    npcSpeech,
    onPerformanceSample,
    partyIntent,
    patronWardPresentation,
    warmasterAttempt,
    barracksById,
    questEntityIndicators,
    questObjectiveMarkers,
    questGiverHasWork,
    renderSize,
    resurrectionProgressByCompanionId,
    showDebugOverlays,
    speechBubbleAvoidanceRects,
    skillBindsByEnemyId,
    skillMarksByEnemyId,
    skillShieldBlocksById,
    skillVisualEvents,
    statusEffectsById,
    statusPresentationTime,
    suppressMovePoiRing,
    teleportWorkingById,
    sortedEntities,
    viewportSize,
    visualMovementByEntityId,
  ]);

  useEffect(() => {
    const visualTextureSignature = getCurrentMapVisualTextureSignature(
      map,
      sortedEntities,
    );

    if (preloadedVisualTextureSignatureRef.current === visualTextureSignature) {
      return;
    }

    preloadedVisualTextureSignatureRef.current = visualTextureSignature;
    preloadCurrentMapVisualTextures({
      cache: textureCacheRef.current,
      entities: sortedEntities,
      map,
      requestRedraw: requestLatestRedraw,
    });
  }, [map, requestLatestRedraw, sortedEntities]);

  useEffect(() => {
    let isDisposed = false;
    let isInitialized = false;
    const app = new Application();
    const stage = new Container();
    const layers: PixiRenderLayers = {
      auraLayer: new Container(),
      backgroundGraphics: new Graphics(),
      entityLayer: new Container(),
      effectsLayer: new Container(),
      effectsGraphics: new Graphics(),
      fallbackGraphics: new Graphics(),
      floorLayer: new Container(),
      objectLayer: new Container(),
      overlayGraphics: new Graphics(),
      speechLayer: new Container(),
      wallLayer: new Container(),
    };
    const managedState = managedStateRef.current;

    function shouldContinueRedrawing() {
      const now = Date.now();

      const hasTimedWorldWork = hasActiveTimedRendererWork({
        activeTeleport: latestActiveTeleportRef.current,
        combatFeedbackEvents: latestCombatFeedbackEventsRef.current,
        combatProjectiles: latestCombatProjectilesRef.current,
        companionAoeChannelsByCasterId:
          latestCompanionAoeChannelsByCasterIdRef.current,
        currentTime: now,
        dropVisualEvents: latestDropVisualEventsRef.current,
        enemyAbilityCastsByEnemyId:
          latestEnemyAbilityCastsByEnemyIdRef.current,
        enemyDashesByEnemyId: latestEnemyDashesByEnemyIdRef.current,
        enemyAoeChannelsByCasterId:
          latestEnemyAoeChannelsByCasterIdRef.current,
        entities: latestEntitiesRef.current,
        movementClickFeedbackEvents:
          latestMovementClickFeedbackEventsRef.current,
        mode: latestModeRef.current,
        patronWardPresentation: latestPatronWardPresentationRef.current,
        warmasterAttempt: latestWarmasterAttemptRef.current,
        barracksById: latestBarracksByIdRef.current,
        skillBindsByEnemyId: latestSkillBindsByEnemyIdRef.current,
        skillMarksByEnemyId: latestSkillMarksByEnemyIdRef.current,
        skillShieldBlocksById: latestSkillShieldBlocksByIdRef.current,
        skillVisualEvents: latestSkillVisualEventsRef.current,
        statusPresentationTime: latestStatusPresentationTimeRef.current,
        statusEffectsById: latestStatusEffectsByIdRef.current,
        visualMovementByEntityId: latestVisualMovementByEntityIdRef.current,
      });
      const speech = latestNpcSpeechRef.current;

      return (
        hasTimedWorldWork ||
        Boolean(speech && getNpcSpeechOpacity(speech, now) > 0)
      );
    }

    function redrawLatestWorld(): boolean {
      if (isDisposed || !isInitialized || !layersRef.current) {
        return false;
      }

      latestCurrentTimeRef.current = Date.now();
      const didDrawWorld = drawWorld({
        activeTeleport: latestActiveTeleportRef.current,
        cameraOffset: latestCameraOffsetRef.current,
        cellPixelSize: latestCellPixelSizeRef.current,
        combatFeedbackEvents: latestCombatFeedbackEventsRef.current,
        combatProjectiles: latestCombatProjectilesRef.current,
        companionDragPreview: companionDragPreviewRef.current,
        companionAoeChannelsByCasterId:
          latestCompanionAoeChannelsByCasterIdRef.current,
        currentTime: latestCurrentTimeRef.current,
        directCompanionCommandsById:
          latestDirectCompanionCommandsByIdRef.current,
        dropVisualEvents: latestDropVisualEventsRef.current,
        enemyAbilityCastsByEnemyId:
          latestEnemyAbilityCastsByEnemyIdRef.current,
        enemyDashesByEnemyId: latestEnemyDashesByEnemyIdRef.current,
        enemyAoeChannelsByCasterId:
          latestEnemyAoeChannelsByCasterIdRef.current,
        entities: latestEntitiesRef.current,
        layers: layersRef.current,
        leaderIntent: latestLeaderIntentRef.current,
        map: latestMapRef.current,
        managedState: managedStateRef.current,
        mode: latestModeRef.current,
        movementClickFeedbackEvents:
          latestMovementClickFeedbackEventsRef.current,
        navigationClickAccessibility:
          latestNavigationClickAccessibilityRef.current,
        onPerformanceSample: latestOnPerformanceSampleRef.current,
        partyIntent: latestPartyIntentRef.current,
        patronWardPresentation: latestPatronWardPresentationRef.current,
        warmasterAttempt: latestWarmasterAttemptRef.current,
        barracksById: latestBarracksByIdRef.current,
        fullHadTimedWorkRef,
        fullSignatureRef,
        lastDrawnTextureRevisionRef,
        questEntityIndicators: latestQuestEntityIndicatorsRef.current,
        questObjectiveMarkers: latestQuestObjectiveMarkersRef.current,
        previewSignatureRef,
        questGiverHasWork: latestQuestGiverHasWorkRef.current,
        renderSize: latestRenderSizeRef.current,
        requestRedraw: requestLatestRedraw,
        resurrectionProgressByCompanionId:
          latestResurrectionProgressByCompanionIdRef.current,
        showDebugOverlays: latestShowDebugOverlaysRef.current,
        speechBubbleAvoidanceRects:
          latestSpeechBubbleAvoidanceRectsRef.current,
        skillBindsByEnemyId: latestSkillBindsByEnemyIdRef.current,
        skillMarksByEnemyId: latestSkillMarksByEnemyIdRef.current,
        skillShieldBlocksById: latestSkillShieldBlocksByIdRef.current,
        skillVisualEvents: latestSkillVisualEventsRef.current,
        statusPresentationTime: latestStatusPresentationTimeRef.current,
        statusEffectsById: latestStatusEffectsByIdRef.current,
        suppressMovePoiRing: latestSuppressMovePoiRingRef.current,
        teleportWorkingById: latestTeleportWorkingByIdRef.current,
        textureCache: textureCacheRef.current,
        viewportSize: latestViewportSizeRef.current,
        visualMovementByEntityId: latestVisualMovementByEntityIdRef.current,
      });
      const didDrawSpeech = drawNpcSpeechLayer({
        cameraOffset: latestCameraOffsetRef.current,
        cellPixelSize: latestCellPixelSizeRef.current,
        currentTime: latestCurrentTimeRef.current,
        entities: latestEntitiesRef.current,
        layer: layersRef.current.speechLayer,
        layerState: npcSpeechLayerStateRef.current,
        map: latestMapRef.current,
        mode: latestModeRef.current,
        renderSize: latestRenderSizeRef.current,
        speech: latestNpcSpeechRef.current,
        avoidanceRects: latestSpeechBubbleAvoidanceRectsRef.current,
      });
      if (didDrawWorld || didDrawSpeech) {
        appRef.current?.render();
      }

      return didDrawWorld || didDrawSpeech;
    }

    const redrawScheduler = createRendererFrameScheduler({
      cancelAnimationFrame: (frameId) => window.cancelAnimationFrame(frameId),
      draw: redrawLatestWorld,
      getShouldContinueRedrawing: shouldContinueRedrawing,
      now: () => performance.now(),
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    });

    function scheduleRedraw() {
      redrawScheduler.requestRedraw();
    }

    requestRedrawRef.current = scheduleRedraw;
    preloadSpriteVisualAssetTextures(
      entityVisualAssets.beginnerCharacter,
      textureCacheRef.current,
      requestLatestRedraw,
      { durable: true },
    );
    preloadSpriteVisualAssetTextures(
      entityVisualAssets.testCharacter,
      textureCacheRef.current,
      requestLatestRedraw,
      { durable: true },
    );
    preloadSpriteVisualAssetTextures(
      entityVisualAssets.questGuideCharacter,
      textureCacheRef.current,
      requestLatestRedraw,
      { durable: true },
    );

    async function initPixiApp() {
      await app.init({
        antialias: false,
        autoStart: false,
        autoDensity: true,
        backgroundAlpha: 0,
        height: latestRenderSizeRef.current.height,
        resolution: window.devicePixelRatio || 1,
        width: latestRenderSizeRef.current.width,
      });
      isInitialized = true;

      if (isDisposed || !hostRef.current) {
        destroyPixiApplication(app);
        return;
      }

      app.stage.addChild(stage);
      stage.addChild(layers.backgroundGraphics);
      stage.addChild(layers.floorLayer);
      stage.addChild(layers.wallLayer);
      stage.addChild(layers.objectLayer);
      stage.addChild(layers.auraLayer);
      stage.addChild(layers.entityLayer);
      stage.addChild(layers.fallbackGraphics);
      stage.addChild(layers.effectsGraphics);
      stage.addChild(layers.effectsLayer);
      stage.addChild(layers.overlayGraphics);
      stage.addChild(layers.speechLayer);
      hostRef.current.appendChild(app.canvas);
      appRef.current = app;
      layersRef.current = layers;
      appliedRenderSizeRef.current = latestRenderSizeRef.current;
      redrawScheduler.requestImmediateRedraw();
    }

    void initPixiApp();

    return () => {
      isDisposed = true;
      redrawScheduler.cancel();
      requestRedrawRef.current = () => {};
      appRef.current = null;
      layersRef.current = null;
      appliedRenderSizeRef.current = null;
      fullHadTimedWorkRef.current = false;
      fullSignatureRef.current = null;
      lastDrawnTextureRevisionRef.current = null;
      npcSpeechLayerStateRef.current = { alpha: 0, signature: null };
      destroyManagedRendererState(managedState);
      if (isInitialized) {
        destroyPixiApplication(app);
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

    latestCurrentTimeRef.current = currentTime ?? Date.now();
    latestStatusPresentationTimeRef.current =
      statusPresentationTime ?? currentTime ?? latestStatusPresentationTimeRef.current;
    requestRedrawRef.current();
  }, [
    activeTeleport,
    cameraOffset,
    cellPixelSize,
    combatFeedbackEvents,
    combatProjectiles,
    companionAoeChannelsByCasterId,
    currentTime,
    directCompanionCommandsById,
    dropVisualEvents,
    enemyAbilityCastsByEnemyId,
    enemyDashesByEnemyId,
    enemyAoeChannelsByCasterId,
    leaderIntent,
    map,
    mode,
    movementClickFeedbackEvents,
    navigationClickAccessibility,
    npcSpeech,
    onPerformanceSample,
    partyIntent,
    questEntityIndicators,
    warmasterAttempt,
    questObjectiveMarkers,
    questGiverHasWork,
    renderSize,
    resurrectionProgressByCompanionId,
    showDebugOverlays,
    speechBubbleAvoidanceRects,
    skillBindsByEnemyId,
    skillMarksByEnemyId,
    skillShieldBlocksById,
    skillVisualEvents,
    statusEffectsById,
    statusPresentationTime,
    teleportWorkingById,
    sortedEntities,
    viewportSize,
    visualMovementByEntityId,
  ]);

  function handleRendererPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "full" || event.button !== 0 || !onCompanionDragCommand) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const mapPosition = getFullMapPosition(
      { x: event.clientX, y: event.clientY },
      bounds,
      {
        cameraOffset,
        cellPixelSize,
      },
    );
    const companion = getNearestDirectCommandSourceCompanion({
      cellPixelSize,
      entities: sortedEntities,
      map,
      mapPosition,
    });

    if (!companion) {
      return;
    }

    companionDragStateRef.current = {
      companionId: companion.id,
      hasDragged: false,
      pointerId: event.pointerId,
      startClientPosition: { x: event.clientX, y: event.clientY },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function getBoundedFullCursorPosition(
    clientPosition: Position,
    bounds: DOMRect,
  ): Position | null {
    const mapPosition = getFullMapPosition(clientPosition, bounds, {
      cameraOffset,
      cellPixelSize,
    });
    const floorPosition = getFloorPosition(mapPosition);

    if (
      floorPosition.x < 0 ||
      floorPosition.x >= map.columns ||
      floorPosition.y < 0 ||
      floorPosition.y >= map.rows
    ) {
      return null;
    }

    return floorPosition;
  }

  function handleRendererPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (mode === "preview") {
      if (!onCursorPositionChange) {
        return;
      }

      const bounds =
        appRef.current?.canvas.getBoundingClientRect() ??
        event.currentTarget.getBoundingClientRect();
      const mapPosition = getPreviewMapPosition(
        { x: event.clientX, y: event.clientY },
        bounds,
        map,
      );

      onCursorPositionChange(mapPosition);
      return;
    }

    onCursorPositionChange?.(
      getBoundedFullCursorPosition(
        { x: event.clientX, y: event.clientY },
        event.currentTarget.getBoundingClientRect(),
      ),
    );

    const dragState = companionDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const dragDistance = Math.hypot(
      event.clientX - dragState.startClientPosition.x,
      event.clientY - dragState.startClientPosition.y,
    );

    if (dragDistance >= 6) {
      dragState.hasDragged = true;
      companionDragPreviewRef.current = getCompanionDragPreview({
        cellPixelSize,
        companionId: dragState.companionId,
        entities: sortedEntities,
        map,
        pointerPosition: { x: event.clientX, y: event.clientY },
        targetBounds: event.currentTarget.getBoundingClientRect(),
        transform: {
          cameraOffset,
          cellPixelSize,
        },
      });
      requestRedrawRef.current();
      return;
    }

    if (companionDragPreviewRef.current) {
      companionDragPreviewRef.current = null;
      requestRedrawRef.current();
    }
  }

  function handleRendererPointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragState = companionDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    companionDragStateRef.current = null;
    companionDragPreviewRef.current = null;
    requestRedrawRef.current();
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!dragState.hasDragged || mode !== "full" || !onCompanionDragCommand) {
      return;
    }

    suppressNextClickRef.current = true;
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
    const target = getNearestDirectCommandDropTarget({
      cellPixelSize,
      entities: sortedEntities,
      map,
      mapPosition,
    });

    if (target?.kind === "resource") {
      onCompanionDragCommand({
        type: "gather",
        companionId: dragState.companionId,
        targetId: target.id,
      });
      return;
    }

    if (target?.kind === "enemy" || target?.kind === "structure") {
      onCompanionDragCommand({
        type: "attack",
        companionId: dragState.companionId,
        targetId: target.id,
      });
      return;
    }

    onCompanionDragCommand({
      type: "move",
      companionId: dragState.companionId,
      targetPosition: getFloorPosition(mapPosition),
    });
  }

  function handleRendererPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const dragState = companionDragStateRef.current;

    if (dragState?.pointerId === event.pointerId) {
      companionDragStateRef.current = null;
      companionDragPreviewRef.current = null;
      requestRedrawRef.current();
    }
  }

  function handleRendererClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    if (mode === "preview") {
      const bounds =
        appRef.current?.canvas.getBoundingClientRect() ??
        event.currentTarget.getBoundingClientRect();
      const mapPosition = getPreviewMapPosition(
        { x: event.clientX, y: event.clientY },
        bounds,
        map,
      );

      if (mapPosition) {
        onFloorClick?.(mapPosition);
      }

      return;
    }

    if (mode !== "full") {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const mapPosition = getFullMapPosition(
      { x: event.clientX, y: event.clientY },
      bounds,
      {
        cameraOffset,
        cellPixelSize,
      },
    );
    const patronWard = patronWardPresentation?.wards
      .filter((ward) => ward.isInteractable)
      .map((ward) => ({
        ward,
        distance: Math.hypot(
          ward.position.x - mapPosition.x,
          ward.position.y - mapPosition.y,
        ),
      }))
      .filter((candidate) => candidate.distance <= 2.5)
      .sort((first, second) => first.distance - second.distance)[0]?.ward;

    if (patronWard) {
      onPatronWardClick?.(patronWard.id);
      return;
    }

    const entity = getNearestInteractableEntity({
      cellPixelSize,
      entities: sortedEntities,
      map,
      mapPosition,
    });

    if (entity?.kind === "npc") {
      onNpcClick?.(entity.id);
      return;
    }

    if (entity?.kind === "resource") {
      onResourceClick?.(entity.id);
      return;
    }

    if (entity?.kind === "enemy" || entity?.kind === "structure") {
      onEnemyClick?.(entity.id);
      return;
    }

    onFloorClick?.(getFloorPosition(mapPosition));
  }

  function handleRendererMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (mode !== "full") {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const mapPosition = getFullMapPosition(
      { x: event.clientX, y: event.clientY },
      bounds,
      {
        cameraOffset,
        cellPixelSize,
      },
    );
    onCursorPositionChange?.(
      getBoundedFullCursorPosition(
        { x: event.clientX, y: event.clientY },
        bounds,
      ),
    );

    if (!onEntityHover) {
      return;
    }

    const entity = getNearestHoverEntity({
      cellPixelSize,
      entities: sortedEntities,
      map,
      mapPosition,
    });

    onEntityHover(
      entity?.id ?? null,
      entity ? { x: event.clientX, y: event.clientY } : undefined,
    );
  }

  function handleRendererMouseLeave() {
    companionDragPreviewRef.current = null;
    requestRedrawRef.current();
    onCursorPositionChange?.(null);
    onEntityHover?.(null);
  }

  return (
    <div
      ref={hostRef}
      className={`pixi-world-renderer pixi-world-renderer-${mode}`}
      onClick={handleRendererClick}
      onMouseLeave={handleRendererMouseLeave}
      onMouseMove={handleRendererMouseMove}
      onPointerCancel={handleRendererPointerCancel}
      onPointerDown={handleRendererPointerDown}
      onPointerMove={handleRendererPointerMove}
      onPointerUp={handleRendererPointerUp}
      aria-label={
        mode === "full"
          ? "PixiJS full world renderer"
          : "PixiJS world renderer preview"
      }
    />
  );
}
