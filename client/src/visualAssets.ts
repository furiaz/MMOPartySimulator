import type { ClassId, DebugMapId, EnemyTypeId, GameEntity } from "./game";
import { NPC_ICON_SRC, RESOURCE_ICON_SRC } from "./assetIcons";

export type SpriteAnimationAsset = {
  frames: string[];
  frameDurationMs: number;
};

export type SpriteDirection =
  | "north"
  | "northEast"
  | "east"
  | "southEast"
  | "south"
  | "southWest"
  | "west"
  | "northWest";

export type SpriteVisualAsset = {
  kind: "sprite";
  animations: {
    idle: SpriteAnimationAsset | Partial<Record<SpriteDirection, SpriteAnimationAsset>>;
    run: Partial<Record<SpriteDirection, SpriteAnimationAsset>>;
  };
  naturalSize?: {
    width: number;
    height: number;
  };
};

type CardinalSpriteDirection = Extract<
  SpriteDirection,
  "north" | "east" | "south" | "west"
>;

export type PlaceholderVisualAsset = {
  kind: "placeholder";
  className: string;
};

export type ImageVisualAsset = {
  kind: "image";
  src: string;
  naturalSize?: {
    width: number;
    height: number;
  };
  contentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type EntityVisualAsset =
  | SpriteVisualAsset
  | PlaceholderVisualAsset
  | ImageVisualAsset;

export type MapTileVisualAsset = {
  kind: "placeholder";
  className: string;
};

const fallbackCompanionBasePath = "/assets/entities/companions/fallback";
const beginnerCompanionBasePath = "/assets/entities/companions/beginner";
const firstClassCompanionBasePath = "/assets/entities/companions";
const fallbackWolfEnemyBasePath = "/assets/entities/enemies/fallback-wolf";
const fallbackOrcEnemyBasePath = "/assets/entities/enemies/fallback-orc";
const commonEnemyBasePath = "/assets/entities/enemies/common";
const regionalEnemyBasePath = "/assets/entities/enemies";
const standardRegionalEnemyPath = `${regionalEnemyBasePath}/standard-level-10-plus`;
const orcWarcampEnemyPath = `${regionalEnemyBasePath}/orc-warcamp`;
const slimewardEnemyPath = "/assets/world/dungeons/slimeward/enemies";
const azureMassAssetPath = "/assets/entities/enemies/bosses/azure-mass";
const classPlaceholderNpcPath = "/assets/entities/npcs/class-placeholders";
const classPortraitBasePath = "/assets/ui/portraits/classes";
const defaultFrameDurationMs = 100;
const companionCharacterNaturalSize = {
  width: 172,
  height: 172,
};

function createFrames(
  basePath: string,
  folderName: string,
  frameName: string,
  frameCount: number,
): string[] {
  return Array.from(
    { length: frameCount },
    (_, index) =>
      `${basePath}/${folderName}/${frameName}_${String(index).padStart(4, "0")}.png`,
  );
}

function createSingleFrame(src: string): SpriteAnimationAsset {
  return {
    frames: [src],
    frameDurationMs: defaultFrameDurationMs,
  };
}

function createBeginnerDirectionalFrames(): Record<
  CardinalSpriteDirection,
  SpriteAnimationAsset
> {
  const northFrames = createFrames(
    beginnerCompanionBasePath,
    "Walk",
    "BeginnerWalkingNorth",
    7,
  );
  const southFrames = createFrames(
    beginnerCompanionBasePath,
    "Walk",
    "BeginnerWalkingSouth",
    7,
  );
  const westFrames = createFrames(
    beginnerCompanionBasePath,
    "Walk",
    "BeginnerWalkingWest",
    7,
  );
  const eastFrames = createFrames(
    beginnerCompanionBasePath,
    "Walk",
    "BeginnerWalkingEast",
    7,
  );

  return {
    north: { frames: northFrames, frameDurationMs: defaultFrameDurationMs },
    east: { frames: eastFrames, frameDurationMs: defaultFrameDurationMs },
    south: { frames: southFrames, frameDurationMs: defaultFrameDurationMs },
    west: { frames: westFrames, frameDurationMs: defaultFrameDurationMs },
  };
}

function createDirectionalIdleFrames(
  directionalFrames: Record<CardinalSpriteDirection, SpriteAnimationAsset>,
): Record<CardinalSpriteDirection, SpriteAnimationAsset> {
  return Object.fromEntries(
    Object.entries(directionalFrames).map(([direction, animation]) => [
      direction,
      createSingleFrame(animation.frames[0] ?? ""),
    ]),
  ) as Record<CardinalSpriteDirection, SpriteAnimationAsset>;
}

const spriteDirectionAssetNames = {
  north: "North",
  northEast: "NorthEast",
  east: "East",
  southEast: "SouthEast",
  south: "South",
  southWest: "SouthWest",
  west: "West",
  northWest: "NorthWest",
} satisfies Record<SpriteDirection, string>;

const firstClassRunDirections = [
  "north",
  "east",
  "south",
  "west",
] satisfies CardinalSpriteDirection[];

type FirstClassCharacterVisualAssetId = Exclude<ClassId, "beginner">;

type FirstClassCharacterAssetDefinition = {
  folderName: string;
  framePrefix: string;
};

const firstClassCharacterAssetDefinitions = {
  blade: {
    folderName: "blade",
    framePrefix: "Blade",
  },
  aegis: {
    folderName: "aegis",
    framePrefix: "Aegis",
  },
  hunter: {
    folderName: "hunter",
    framePrefix: "Hunter",
  },
  beast: {
    folderName: "beast",
    framePrefix: "Beast",
  },
  elementalist: {
    folderName: "elementalist",
    framePrefix: "Elementalist",
  },
  runecaster: {
    folderName: "runecaster",
    framePrefix: "Runecaster",
  },
  lightbearer: {
    folderName: "lightbearer",
    framePrefix: "Lightbearer",
  },
  penitent: {
    folderName: "penitent",
    framePrefix: "Penitent",
  },
} satisfies Record<
  FirstClassCharacterVisualAssetId,
  FirstClassCharacterAssetDefinition
>;

function createFirstClassCharacterVisualAsset({
  folderName,
  framePrefix,
}: FirstClassCharacterAssetDefinition): SpriteVisualAsset {
  const basePath = `${firstClassCompanionBasePath}/${folderName}`;
  const idle = Object.fromEntries(
    Object.entries(spriteDirectionAssetNames).map(([direction, assetName]) => [
      direction,
      createSingleFrame(`${basePath}/${framePrefix}Idle_${assetName}.png`),
    ]),
  ) as Record<SpriteDirection, SpriteAnimationAsset>;
  const run = Object.fromEntries(
    firstClassRunDirections.map((direction) => [
      direction,
      {
        frames: createFrames(
          firstClassCompanionBasePath,
          folderName,
          `${framePrefix}Running_${spriteDirectionAssetNames[direction]}`,
          7,
        ),
        frameDurationMs: defaultFrameDurationMs,
      },
    ]),
  ) as Record<CardinalSpriteDirection, SpriteAnimationAsset>;

  return {
    kind: "sprite",
    animations: {
      idle,
      run,
    },
    naturalSize: companionCharacterNaturalSize,
  };
}

function createEnemyTwoDirectionalFrames() {
  return {
    north: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_North.png`),
    northEast: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_NorthEast.png`),
    east: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_East.png`),
    southEast: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_SouthEast.png`),
    south: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_South.png`),
    southWest: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_SouthWest.png`),
    west: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_West.png`),
    northWest: createSingleFrame(`${fallbackOrcEnemyBasePath}/Enemy2_NorthWest.png`),
  } satisfies Record<SpriteDirection, SpriteAnimationAsset>;
}

const enemyTwoDirectionalFrames = createEnemyTwoDirectionalFrames();
const beginnerDirectionalFrames = createBeginnerDirectionalFrames();
const beginnerIdleFrames = createDirectionalIdleFrames(beginnerDirectionalFrames);

export const firstClassCharacterVisualAssets = Object.fromEntries(
  Object.entries(firstClassCharacterAssetDefinitions).map(
    ([classId, definition]) => [
      classId,
      createFirstClassCharacterVisualAsset(definition),
    ],
  ),
) as Record<FirstClassCharacterVisualAssetId, SpriteVisualAsset>;

function createStaticEnemySprite(
  src: string,
  naturalSize?: SpriteVisualAsset["naturalSize"],
): SpriteVisualAsset {
  const frame = createSingleFrame(src);

  return {
    kind: "sprite",
    animations: {
      idle: {
        southEast: frame,
        south: frame,
      },
      run: {
        southEast: frame,
        south: frame,
      },
    },
    naturalSize,
  };
}

export const REGIONAL_ENEMY_SPRITE_SRC = {
  goblinShaman: `${standardRegionalEnemyPath}/goblin_shaman.png`,
  ashWisp: `${standardRegionalEnemyPath}/ash_wisp.png`,
  legacyOrc: `${standardRegionalEnemyPath}/orc.png`,
  emberImp: `${standardRegionalEnemyPath}/ember_imp.png`,
  tinCrawler: `${standardRegionalEnemyPath}/tin_crawler.png`,
  briarWolf: `${standardRegionalEnemyPath}/briar_wolf.png`,
  mireSpider: `${standardRegionalEnemyPath}/mire_spider.png`,
  nightBat: `${standardRegionalEnemyPath}/night_bat.png`,
  elderMossling: `${standardRegionalEnemyPath}/elder_mossling.png`,
  cinderWisp: `${standardRegionalEnemyPath}/cinder_wisp.png`,
  orcGrunt: `${orcWarcampEnemyPath}/orc_grunt.png`,
  orcRaider: `${orcWarcampEnemyPath}/orc_raider.png`,
  orcShieldbearer: `${orcWarcampEnemyPath}/orc_shieldbearer.png`,
  orcWarmaster: `${orcWarcampEnemyPath}/orc_warmaster.png`,
} as const;

function createBossSlimeDirectionalSprite(
  framePrefix: string,
  naturalSize?: SpriteVisualAsset["naturalSize"],
): SpriteVisualAsset {
  const frames = Object.fromEntries(
    Object.entries(spriteDirectionAssetNames).map(([direction, assetName]) => [
      direction,
      createSingleFrame(`${azureMassAssetPath}/${framePrefix}${assetName}.png`),
    ]),
  ) as Record<SpriteDirection, SpriteAnimationAsset>;

  return {
    kind: "sprite",
    animations: {
      idle: frames,
      run: frames,
    },
    naturalSize,
  };
}

const prototypeEnemyVisualAssets: Partial<Record<EnemyTypeId, SpriteVisualAsset>> = {
  green_slime: createStaticEnemySprite(`${commonEnemyBasePath}/slime-se.png`),
  slimeward_heavy_slime: createStaticEnemySprite(
    `${slimewardEnemyPath}/cave-slime-heavy-128.png`,
    { width: 104, height: 104 },
  ),
  slimeward_pale_ooze: createStaticEnemySprite(
    `${slimewardEnemyPath}/pale-ooze-dripper-128.png`,
    { width: 96, height: 96 },
  ),
  slimeward_spitter_slime: createStaticEnemySprite(
    `${slimewardEnemyPath}/spitter-slime-sac-128.png`,
    { width: 112, height: 112 },
  ),
  azure_mass: createBossSlimeDirectionalSprite(
    "TheAzureMass",
    { width: 260, height: 260 },
  ),
  cave_bat: createStaticEnemySprite(`${commonEnemyBasePath}/cave-bat-se.png`),
  forest_spider: createStaticEnemySprite(`${commonEnemyBasePath}/forest-spider-se.png`),
  goblin_scout: createStaticEnemySprite(`${commonEnemyBasePath}/goblin-scout-se.png`),
  goblin_thrower: createStaticEnemySprite(`${commonEnemyBasePath}/goblin-thrower-se.png`),
  bog_imp: createStaticEnemySprite(`${commonEnemyBasePath}/bog-imp-se.png`),
  stone_crawler: createStaticEnemySprite(`${commonEnemyBasePath}/stone-crawler-se.png`),
  goblin_shaman: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.goblinShaman),
  ash_wisp: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.ashWisp),
  mossling: createStaticEnemySprite(`${commonEnemyBasePath}/mossling-se.png`),
  wolf: createStaticEnemySprite(`${commonEnemyBasePath}/wolf.png`),
  orc: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.orcGrunt, {
    width: 128,
    height: 128,
  }),
  orc_raider: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.orcRaider, {
    width: 128,
    height: 128,
  }),
  orc_shieldbearer: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.orcShieldbearer, {
    width: 128,
    height: 128,
  }),
  ember_imp: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.emberImp),
  tin_crawler: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.tinCrawler),
  briar_wolf: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.briarWolf),
  mire_spider: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.mireSpider),
  night_bat: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.nightBat),
  elder_mossling: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.elderMossling),
  cinder_wisp: createStaticEnemySprite(REGIONAL_ENEMY_SPRITE_SRC.cinderWisp),
  orc_warmaster: createStaticEnemySprite(
    REGIONAL_ENEMY_SPRITE_SRC.orcWarmaster,
    { width: 128, height: 128 },
  ),
};

export const CLASS_PORTRAIT_SRC: Record<ClassId, string> = {
  beginner: `${classPortraitBasePath}/beginner.png`,
  blade: `${classPortraitBasePath}/blade.png`,
  aegis: `${classPortraitBasePath}/aegis.png`,
  hunter: `${classPortraitBasePath}/hunter.png`,
  beast: `${classPortraitBasePath}/beast.png`,
  elementalist: `${classPortraitBasePath}/elementalist.png`,
  runecaster: `${classPortraitBasePath}/runecaster.png`,
  lightbearer: `${classPortraitBasePath}/lightbearer.png`,
  penitent: `${classPortraitBasePath}/penitent.png`,
};

const testCharacterVisualAsset = {
  kind: "sprite",
  animations: {
    idle: {
      frames: [`${fallbackCompanionBasePath}/Idle/Idle_000.png`],
      frameDurationMs: defaultFrameDurationMs,
    },
    run: {
      north: {
        frames: createFrames(fallbackCompanionBasePath, "Run", "Honor_North", 8),
        frameDurationMs: defaultFrameDurationMs,
      },
      south: {
        frames: createFrames(fallbackCompanionBasePath, "Run", "Honor_South", 8),
        frameDurationMs: defaultFrameDurationMs,
      },
      west: {
        frames: createFrames(fallbackCompanionBasePath, "Run", "Honor_West", 8),
        frameDurationMs: defaultFrameDurationMs,
      },
      east: {
        frames: createFrames(fallbackCompanionBasePath, "Run", "Honor_East", 8),
        frameDurationMs: defaultFrameDurationMs,
      },
    },
  },
} satisfies SpriteVisualAsset;

export const entityVisualAssets = {
  beginnerCharacter: {
    kind: "sprite",
    animations: {
      idle: beginnerIdleFrames,
      run: beginnerDirectionalFrames,
    },
    naturalSize: {
      ...companionCharacterNaturalSize,
    },
  },
  testCharacter: testCharacterVisualAsset,
  questGuideCharacter: {
    ...testCharacterVisualAsset,
    naturalSize: {
      width: 92,
      height: 92,
    },
  },
  enemy: {
    kind: "sprite",
    animations: {
      idle: {
        frames: createFrames(fallbackWolfEnemyBasePath, "Idle", "WolfRunSouth", 9),
        frameDurationMs: defaultFrameDurationMs,
      },
      run: {
        north: {
          frames: createFrames(fallbackWolfEnemyBasePath, "Run", "WolfRunNorth", 4),
          frameDurationMs: defaultFrameDurationMs,
        },
        south: {
          frames: createFrames(fallbackWolfEnemyBasePath, "Run", "WolfRunSouth", 4),
          frameDurationMs: defaultFrameDurationMs,
        },
        west: {
          frames: createFrames(fallbackWolfEnemyBasePath, "Run", "WolfRunWest", 4),
          frameDurationMs: defaultFrameDurationMs,
        },
        east: {
          frames: createFrames(fallbackWolfEnemyBasePath, "Run", "WolfRunEast", 4),
          frameDurationMs: defaultFrameDurationMs,
        },
      },
    },
  },
  enemy2: {
    kind: "sprite",
    animations: {
      idle: enemyTwoDirectionalFrames,
      run: enemyTwoDirectionalFrames,
    },
  },
  resource: {
    wood: {
      kind: "image",
      src: RESOURCE_ICON_SRC.wood,
    },
    ore: {
      kind: "image",
      src: RESOURCE_ICON_SRC.ore,
    },
    herb: {
      kind: "image",
      src: RESOURCE_ICON_SRC.herb,
    },
  },
  npc: {
    kind: "placeholder",
    className: "npc-placeholder",
  },
  dog: {
    kind: "placeholder",
    className: "npc-placeholder dog",
  },
  testBlade: {
    kind: "image",
    src: `${classPlaceholderNpcPath}/Bladesouth.png`,
    naturalSize: {
      width: 224,
      height: 224,
    },
    contentBounds: {
      x: 77,
      y: 57,
      width: 69,
      height: 111,
    },
  },
  testHunter: {
    kind: "image",
    src: `${classPlaceholderNpcPath}/Huntersouth.png`,
    naturalSize: {
      width: 124,
      height: 124,
    },
    contentBounds: {
      x: 45,
      y: 32,
      width: 34,
      height: 59,
    },
  },
  classMentor: {
    kind: "image",
    src: NPC_ICON_SRC.class_mentor ?? "/assets/entities/npcs/hub/class-mentor.png",
    naturalSize: {
      width: 144,
      height: 144,
    },
    contentBounds: {
      x: 40,
      y: 14,
      width: 65,
      height: 111,
    },
  },
  guildCoordinator: {
    kind: "image",
    src: NPC_ICON_SRC.guild_coordinator ?? "",
    naturalSize: {
      width: 50,
      height: 132,
    },
  },
  tavernKeeper: {
    kind: "image",
    src: NPC_ICON_SRC.tavern_keeper ?? "",
    naturalSize: {
      width: 68,
      height: 132,
    },
  },
  farmer: {
    kind: "image",
    src: NPC_ICON_SRC.farmer ?? "",
    naturalSize: {
      width: 88,
      height: 132,
    },
  },
  livestockKeeper: {
    kind: "image",
    src: NPC_ICON_SRC.livestock_keeper ?? "",
    naturalSize: {
      width: 77,
      height: 132,
    },
  },
} satisfies {
  beginnerCharacter: SpriteVisualAsset;
  testCharacter: SpriteVisualAsset;
  questGuideCharacter: SpriteVisualAsset;
  enemy: SpriteVisualAsset;
  enemy2: SpriteVisualAsset;
  resource: Record<string, ImageVisualAsset>;
  npc: PlaceholderVisualAsset;
  dog: PlaceholderVisualAsset;
  testBlade: ImageVisualAsset;
  testHunter: ImageVisualAsset;
  classMentor: ImageVisualAsset;
  guildCoordinator: ImageVisualAsset;
  tavernKeeper: ImageVisualAsset;
  farmer: ImageVisualAsset;
  livestockKeeper: ImageVisualAsset;
};

export const mapTileVisualAssets = {
  floor: {
    kind: "placeholder",
    className: "floor-default",
  },
  wall: {
    kind: "placeholder",
    className: "wall-default",
  },
} satisfies Record<string, MapTileVisualAsset>;

export function getEntityVisualAsset(
  entity: GameEntity,
  currentMapId?: DebugMapId,
): EntityVisualAsset {
  if (entity.kind === "companion") {
    if (entity.classId === "beginner") {
      return entityVisualAssets.beginnerCharacter;
    }

    return (
      firstClassCharacterVisualAssets[entity.classId] ??
      entityVisualAssets.testCharacter
    );
  }

  if (entity.kind === "resource") {
    return entityVisualAssets.resource[entity.resourceType];
  }

  if (entity.kind === "npc") {
    if (entity.npcRole === "class_mentor") {
      return entityVisualAssets.classMentor;
    }

    if (entity.npcRole === "guild_coordinator") {
      return entityVisualAssets.guildCoordinator;
    }

    if (entity.npcRole === "tavern_keeper") {
      return entityVisualAssets.tavernKeeper;
    }

    if (entity.npcRole === "farmer") {
      return entityVisualAssets.farmer;
    }

    if (entity.npcRole === "livestock_keeper") {
      return entityVisualAssets.livestockKeeper;
    }

    const npcIconSrc = NPC_ICON_SRC[entity.npcRole];

    if (npcIconSrc) {
      return {
        kind: "image",
        src: npcIconSrc,
      };
    }

    if (entity.npcRole === "test_blade") {
      return entityVisualAssets.testBlade;
    }

    if (entity.npcRole === "quest_guide") {
      return entityVisualAssets.questGuideCharacter;
    }

    return entity.npcRole === "dog"
      ? entityVisualAssets.dog
      : entityVisualAssets.npc;
  }

  if (entity.isTargetDummy) {
    return entityVisualAssets.testHunter;
  }

  const prototypeEnemyVisual = entity.enemyTypeId
    ? prototypeEnemyVisualAssets[entity.enemyTypeId]
    : undefined;

  if (prototypeEnemyVisual) {
    return prototypeEnemyVisual;
  }

  if (entity.enemyTypeId === "wolf") {
    return entityVisualAssets.enemy;
  }

  if (entity.enemyTypeId === "orc") {
    return entityVisualAssets.enemy2;
  }

  return currentMapId === "map-2"
    ? entityVisualAssets.enemy2
    : entityVisualAssets.enemy;
}

export function getEntityVisualClassName(
  entity: GameEntity,
  currentMapId?: DebugMapId,
): string {
  const visualAsset = getEntityVisualAsset(entity, currentMapId);

  return visualAsset.kind === "placeholder" ? visualAsset.className : "";
}

export function getSpriteAnimation(
  visualAsset: SpriteVisualAsset,
  isVisuallyMoving: boolean,
  movementDirection?: SpriteDirection,
  movementAngleDegrees?: number,
): SpriteAnimationAsset {
  const direction = movementDirection ?? "south";

  if (isVisuallyMoving) {
    return getDirectionalAnimation(
      visualAsset.animations.run,
      direction,
      movementAngleDegrees,
    );
  }

  return getDirectionalAnimation(
    visualAsset.animations.idle,
    direction,
    movementAngleDegrees,
  );
}

export function getClassIdleFrameSrc(
  classId: ClassId,
  direction: SpriteDirection = "south",
): string | null {
  const visualAsset =
    classId === "beginner"
      ? entityVisualAssets.beginnerCharacter
      : firstClassCharacterVisualAssets[classId];
  const animation = getDirectionalAnimation(visualAsset.animations.idle, direction);

  return animation.frames[0] ?? null;
}

export function getEnemyWalkingAnimation(
  enemyTypeId: EnemyTypeId,
  direction: SpriteDirection = "east",
): SpriteAnimationAsset {
  const visualAsset = getEnemySpriteVisualAsset(enemyTypeId);
  return getDirectionalAnimation(visualAsset.animations.run, direction);
}

function getEnemySpriteVisualAsset(enemyTypeId: EnemyTypeId): SpriteVisualAsset {
  const prototypeEnemyVisual = prototypeEnemyVisualAssets[enemyTypeId];

  if (prototypeEnemyVisual) {
    return prototypeEnemyVisual;
  }

  if (enemyTypeId === "wolf") {
    return entityVisualAssets.enemy;
  }

  if (enemyTypeId === "orc") {
    return entityVisualAssets.enemy2;
  }

  return entityVisualAssets.enemy;
}

function getDirectionalAnimation(
  animation:
    | SpriteAnimationAsset
    | Partial<Record<SpriteDirection, SpriteAnimationAsset>>,
  direction: SpriteDirection,
  movementAngleDegrees?: number,
): SpriteAnimationAsset {
  if ("frames" in animation) {
    return animation;
  }

  const fallbackAnimation = animation.south ?? Object.values(animation)[0];

  return (
    animation[direction] ??
    animation[getCardinalDirection(direction, movementAngleDegrees)] ??
    fallbackAnimation ?? {
      frames: [],
      frameDurationMs: defaultFrameDurationMs,
    }
  );
}

function getCardinalDirection(
  direction: SpriteDirection,
  movementAngleDegrees?: number,
): SpriteDirection {
  if (movementAngleDegrees !== undefined) {
    return getCardinalDirectionForAngle(movementAngleDegrees);
  }

  if (direction === "northEast" || direction === "northWest") {
    return "north";
  }

  if (direction === "southEast" || direction === "southWest") {
    return "south";
  }

  return direction;
}

function getCardinalDirectionForAngle(
  movementAngleDegrees: number,
): CardinalSpriteDirection {
  const angle = ((movementAngleDegrees % 360) + 360) % 360;

  if (angle >= 75 && angle <= 105) {
    return "north";
  }

  if (angle >= 255 && angle <= 285) {
    return "south";
  }

  if (angle > 105 && angle < 255) {
    return "west";
  }

  return "east";
}
