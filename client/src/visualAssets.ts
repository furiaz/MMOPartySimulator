import type { GameEntity } from "./game";

export type SpriteAnimationAsset = {
  frames: string[];
  frameDurationMs: number;
};

export type SpriteDirection = "north" | "south" | "west" | "east";

export type SpriteVisualAsset = {
  kind: "sprite";
  animations: {
    idle: SpriteAnimationAsset;
    run: Record<SpriteDirection, SpriteAnimationAsset>;
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
  resource: {
    wood: {
      kind: "placeholder",
      className: "resource wood",
    },
    ore: {
      kind: "placeholder",
      className: "resource ore",
    },
    herb: {
      kind: "placeholder",
      className: "resource herb",
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
  resource: Record<string, PlaceholderVisualAsset>;
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

export function getEntityVisualAsset(entity: GameEntity): EntityVisualAsset {
  if (entity.kind === "companion") {
    return entityVisualAssets.testCharacter;
  }

  if (entity.kind === "resource") {
    return entityVisualAssets.resource[entity.resourceType];
  }

  if (entity.kind === "npc") {
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

  return entityVisualAssets.enemy;
}

export function getEntityVisualClassName(entity: GameEntity): string {
  const visualAsset = getEntityVisualAsset(entity);

  return visualAsset.kind === "placeholder" ? visualAsset.className : "";
}

export function getSpriteAnimation(
  visualAsset: SpriteVisualAsset,
  isVisuallyMoving: boolean,
  movementDirection?: SpriteDirection,
): SpriteAnimationAsset {
  return isVisuallyMoving
    ? visualAsset.animations.run[movementDirection ?? "south"]
    : visualAsset.animations.idle;
}
