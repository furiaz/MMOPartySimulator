import type { DebugMapId, EnemyArchetypeId, GameEntity } from "./game";
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
};

export type PlaceholderVisualAsset = {
  kind: "placeholder";
  className: string;
};

export type ImageVisualAsset = {
  kind: "image";
  src: string;
};

export type EntityVisualAsset =
  | SpriteVisualAsset
  | PlaceholderVisualAsset
  | ImageVisualAsset;

export type MapTileVisualAsset = {
  kind: "placeholder";
  className: string;
};

const testCharacterBasePath = "/Asserts/Characters/Test-Character";
const testEnemyBasePath = "/Asserts/Characters/Test-Enemy";
const testEnemyTwoBasePath = "/Asserts/Characters/Test-Enemy2";
const prototypeEnemyBasePath = "/Asserts/Characters/Prototype-Enemies";
const testNpcBasePath = "/Asserts/Characters/Test-NPC";
const defaultFrameDurationMs = 100;

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

function createEnemyTwoDirectionalFrames() {
  return {
    north: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_North.png`),
    northEast: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_NorthEast.png`),
    east: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_East.png`),
    southEast: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_SouthEast.png`),
    south: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_South.png`),
    southWest: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_SouthWest.png`),
    west: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_West.png`),
    northWest: createSingleFrame(`${testEnemyTwoBasePath}/Enemy2_NorthWest.png`),
  } satisfies Record<SpriteDirection, SpriteAnimationAsset>;
}

const enemyTwoDirectionalFrames = createEnemyTwoDirectionalFrames();

function createStaticEnemySprite(src: string): SpriteVisualAsset {
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
  };
}

const prototypeEnemyVisualAssets: Partial<Record<EnemyArchetypeId, SpriteVisualAsset>> = {
  slime: createStaticEnemySprite(`${prototypeEnemyBasePath}/slime-se.png`),
  cave_bat: createStaticEnemySprite(`${prototypeEnemyBasePath}/cave-bat-se.png`),
  forest_spider: createStaticEnemySprite(`${prototypeEnemyBasePath}/forest-spider-se.png`),
  goblin_scout: createStaticEnemySprite(`${prototypeEnemyBasePath}/goblin-scout-se.png`),
  goblin_thrower: createStaticEnemySprite(`${prototypeEnemyBasePath}/goblin-thrower-se.png`),
  bog_imp: createStaticEnemySprite(`${prototypeEnemyBasePath}/bog-imp-se.png`),
  stone_crawler: createStaticEnemySprite(`${prototypeEnemyBasePath}/stone-crawler-se.png`),
  thorn_shaman: createStaticEnemySprite(`${prototypeEnemyBasePath}/thorn-shaman-se.png`),
  ash_wisp: createStaticEnemySprite(`${prototypeEnemyBasePath}/ash-wisp-se.png`),
  mossling: createStaticEnemySprite(`${prototypeEnemyBasePath}/mossling-se.png`),
};

export const entityVisualAssets = {
  testCharacter: {
    kind: "sprite",
    animations: {
      idle: {
        frames: [`${testCharacterBasePath}/Idle/Idle_000.png`],
        frameDurationMs: defaultFrameDurationMs,
      },
      run: {
        north: {
          frames: createFrames(testCharacterBasePath, "Run", "Honor_North", 8),
          frameDurationMs: defaultFrameDurationMs,
        },
        south: {
          frames: createFrames(testCharacterBasePath, "Run", "Honor_South", 8),
          frameDurationMs: defaultFrameDurationMs,
        },
        west: {
          frames: createFrames(testCharacterBasePath, "Run", "Honor_West", 8),
          frameDurationMs: defaultFrameDurationMs,
        },
        east: {
          frames: createFrames(testCharacterBasePath, "Run", "Honor_East", 8),
          frameDurationMs: defaultFrameDurationMs,
        },
      },
    },
  },
  enemy: {
    kind: "sprite",
    animations: {
      idle: {
        frames: createFrames(testEnemyBasePath, "Idle", "WolfRunSouth", 9),
        frameDurationMs: defaultFrameDurationMs,
      },
      run: {
        north: {
          frames: createFrames(testEnemyBasePath, "Run", "WolfRunNorth", 4),
          frameDurationMs: defaultFrameDurationMs,
        },
        south: {
          frames: createFrames(testEnemyBasePath, "Run", "WolfRunSouth", 4),
          frameDurationMs: defaultFrameDurationMs,
        },
        west: {
          frames: createFrames(testEnemyBasePath, "Run", "WolfRunWest", 4),
          frameDurationMs: defaultFrameDurationMs,
        },
        east: {
          frames: createFrames(testEnemyBasePath, "Run", "WolfRunEast", 4),
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
    src: `${testNpcBasePath}/Bladesouth.png`,
  },
  testHunter: {
    kind: "image",
    src: `${testNpcBasePath}/Huntersouth.png`,
  },
} satisfies {
  testCharacter: SpriteVisualAsset;
  enemy: SpriteVisualAsset;
  enemy2: SpriteVisualAsset;
  resource: Record<string, ImageVisualAsset>;
  npc: PlaceholderVisualAsset;
  dog: PlaceholderVisualAsset;
  testBlade: ImageVisualAsset;
  testHunter: ImageVisualAsset;
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
    return entityVisualAssets.testCharacter;
  }

  if (entity.kind === "resource") {
    return entityVisualAssets.resource[entity.resourceType];
  }

  if (entity.kind === "npc") {
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

    if (entity.npcRole === "test_hunter") {
      return entityVisualAssets.testHunter;
    }

    return entity.npcRole === "dog"
      ? entityVisualAssets.dog
      : entityVisualAssets.npc;
  }

  const prototypeEnemyVisual = entity.archetypeId
    ? prototypeEnemyVisualAssets[entity.archetypeId]
    : undefined;

  if (prototypeEnemyVisual) {
    return prototypeEnemyVisual;
  }

  if (entity.archetypeId === "wolf") {
    return entityVisualAssets.enemy;
  }

  if (entity.archetypeId === "orc") {
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
): SpriteAnimationAsset {
  const direction = movementDirection ?? "south";

  if (isVisuallyMoving) {
    return getDirectionalAnimation(visualAsset.animations.run, direction);
  }

  return getDirectionalAnimation(visualAsset.animations.idle, direction);
}

function getDirectionalAnimation(
  animation:
    | SpriteAnimationAsset
    | Partial<Record<SpriteDirection, SpriteAnimationAsset>>,
  direction: SpriteDirection,
): SpriteAnimationAsset {
  if ("frames" in animation) {
    return animation;
  }

  const fallbackAnimation = animation.south ?? Object.values(animation)[0];

  return (
    animation[direction] ??
    animation[getCardinalDirection(direction)] ??
    fallbackAnimation ?? {
      frames: [],
      frameDurationMs: defaultFrameDurationMs,
    }
  );
}

function getCardinalDirection(direction: SpriteDirection): SpriteDirection {
  if (direction === "northEast" || direction === "northWest") {
    return "north";
  }

  if (direction === "southEast" || direction === "southWest") {
    return "south";
  }

  return direction;
}
