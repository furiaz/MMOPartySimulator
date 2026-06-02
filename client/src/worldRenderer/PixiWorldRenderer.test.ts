import { describe, expect, it } from "vitest";
import type { CombatFeedbackEvent, GameMap } from "../game";
import { createCompanion, createEnemy, createNpc, createResource, createTargetDummy } from "../game";
import {
  collectCurrentMapScopedVisualTextureSrcs,
  collectDurableVisualTextureSrcs,
  enemySpottedAlertSrc,
  getCombatFeedbackLifetimeProgress,
  getCombatFeedbackLaneKey,
  getEnemyNameplateColor,
  getEnemyNameplateText,
  getFullVisibleTileBounds,
  getHealingFountainRenderDiameterPx,
  getLevelUpBurstPresentation,
  getNearestHoverEntity,
  getNearestInteractableEntity,
  getPreviewMapPosition,
  getPreviewRenderSignature,
  getTeleportIconSrc,
  isPositionInTileBounds,
  isStaticMapSpriteKey,
  levelUpBurstSrc,
  shouldDrawCombatFeedbackEvent,
  TELEPORT_OBJECT_SPRITE_ANCHOR_X,
  TELEPORT_OBJECT_SPRITE_ANCHOR_Y,
  TELEPORT_OBJECT_SPRITE_SIZE_PX,
} from "./PixiWorldRendererHelpers";
import { MAP_OBJECT_ICON_SRC, MAP_VISUAL_OBJECT_SRC } from "../assetIcons";

const previewCanvasBounds = {
  left: 100,
  top: 20,
  width: 256,
  height: 144,
};

function createWideMap(): GameMap {
  return {
    debugName: "Wide Test Map",
    displayName: "Wide Test Map",
    columns: 160,
    rows: 30,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

describe("getPreviewMapPosition", () => {
  it("maps a minimap click to the represented map tile", () => {
    const map = createWideMap();
    const position = getPreviewMapPosition(
      {
        x: previewCanvasBounds.left + 8 + 80.5 * 1.5,
        y: previewCanvasBounds.top + 49.5 + 15.5 * 1.5,
      },
      previewCanvasBounds,
      map,
    );

    expect(position).toEqual({ x: 80, y: 15 });
  });

  it("returns null for clicks in minimap padding outside the rendered map", () => {
    const map = createWideMap();

    expect(
      getPreviewMapPosition(
        { x: previewCanvasBounds.left + 128, y: previewCanvasBounds.top + 8 },
        previewCanvasBounds,
        map,
      ),
    ).toBeNull();
  });

  it("uses canvas bounds so wrapper borders do not skew conversion", () => {
    const map = createWideMap();
    const borderedCanvasBounds = {
      left: 101,
      top: 21,
      width: 256,
      height: 144,
    };

    expect(
      getPreviewMapPosition(
        {
          x: borderedCanvasBounds.left + 8 + 12.5 * 1.5,
          y: borderedCanvasBounds.top + 49.5 + 4.5 * 1.5,
        },
        borderedCanvasBounds,
        map,
      ),
    ).toEqual({ x: 12, y: 4 });
  });
});

describe("getPreviewRenderSignature", () => {
  it("changes when preview-visible inputs change", () => {
    const map = createWideMap();
    const companion = createCompanion("companion", { x: 4, y: 4 }, "companion");
    const baseInput = {
      cameraOffset: { x: 0, y: 0 },
      cellPixelSize: 32,
      entities: [companion],
      map,
      viewportSize: { width: 800, height: 600 },
    };
    const baseSignature = getPreviewRenderSignature(baseInput);

    expect(
      getPreviewRenderSignature({
        ...baseInput,
        entities: [
          {
            ...companion,
            position: { x: 5, y: 4 },
          },
        ],
      }),
    ).not.toBe(baseSignature);
    expect(
      getPreviewRenderSignature({
        ...baseInput,
        entities: [
          {
            ...companion,
            state: "dead",
          },
        ],
      }),
    ).not.toBe(baseSignature);
    expect(
      getPreviewRenderSignature({
        ...baseInput,
        map: {
          ...map,
          id: "map-1",
        },
      }),
    ).not.toBe(baseSignature);
    expect(
      getPreviewRenderSignature({
        ...baseInput,
        cameraOffset: { x: 32, y: 0 },
      }),
    ).not.toBe(baseSignature);
    expect(
      getPreviewRenderSignature({
        ...baseInput,
        viewportSize: { width: 1024, height: 600 },
      }),
    ).not.toBe(baseSignature);
    expect(
      getPreviewRenderSignature({
        ...baseInput,
        cellPixelSize: 16,
      }),
    ).not.toBe(baseSignature);
  });
});

describe("texture lifetime classification", () => {
  it("classifies walking frames and shared VFX as durable", () => {
    const durableSources = collectDurableVisualTextureSrcs();

    expect(durableSources.has(enemySpottedAlertSrc)).toBe(true);
    expect(durableSources.has(MAP_OBJECT_ICON_SRC.teleportGood)).toBe(false);
    expect(
      [...durableSources].some((src) => src.includes("/Asserts/Characters/Beginner/")),
    ).toBe(true);
  });

  it("classifies wild-map visual sources as current-map scoped", () => {
    const map: GameMap = {
      ...createWideMap(),
      id: "map-1",
      walls: [{ x: 1, y: 1 }],
      visualObjects: [
        {
          id: "test-closed-gate",
          visualId: "passage_gate_closed",
          position: { x: 52, y: 29 },
          widthCells: 100 / 32,
          heightCells: 350 / 32,
        },
        {
          id: "test-open-gate",
          visualId: "passage_gate_open",
          position: { x: 52, y: 29 },
          widthCells: 100 / 32,
          heightCells: 350 / 32,
        },
      ],
    };
    const resource = createResource("wood", { x: 4, y: 4 });
    const enemy = createEnemy("enemy", { x: 6, y: 6 }, undefined, {
      enemyTypeId: "slime",
    });
    const scopedSources = collectCurrentMapScopedVisualTextureSrcs(map, [
      resource,
      enemy,
    ]);

    expect(scopedSources).toContain(MAP_OBJECT_ICON_SRC.teleportGood);
    expect(scopedSources).toContain(MAP_VISUAL_OBJECT_SRC.passage_gate_closed);
    expect(scopedSources).toContain(MAP_VISUAL_OBJECT_SRC.passage_gate_open);
    expect(scopedSources.some((src) => src.includes("map-wilderness"))).toBe(true);
    expect(scopedSources.some((src) => src.includes("slime-se.png"))).toBe(true);
    expect(scopedSources).not.toContain(enemySpottedAlertSrc);
  });
});

describe("teleport object art", () => {
  it("uses the good teleport asset for working teleports", () => {
    expect(getTeleportIconSrc(true)).toBe(MAP_OBJECT_ICON_SRC.teleportGood);
  });

  it("uses the broken teleport asset for non-working teleports", () => {
    expect(getTeleportIconSrc(false)).toBe(MAP_OBJECT_ICON_SRC.teleportBroken);
  });

  it("renders the generated teleporter art at its authored size", () => {
    expect(TELEPORT_OBJECT_SPRITE_SIZE_PX).toBe(250);
  });

  it("anchors the generated teleporter art from its center", () => {
    expect(TELEPORT_OBJECT_SPRITE_ANCHOR_X).toBe(0.5);
    expect(TELEPORT_OBJECT_SPRITE_ANCHOR_Y).toBe(0.5);
  });
});

describe("healing fountain art", () => {
  it("renders at the diameter of its healing range", () => {
    expect(getHealingFountainRenderDiameterPx(5, 32)).toBe(320);
  });
});

describe("getFullVisibleTileBounds", () => {
  it("includes the configured margin around the camera view", () => {
    const map = createWideMap();

    expect(
      getFullVisibleTileBounds({
        bufferTiles: 2,
        cameraOffset: { x: 64, y: 32 },
        cellPixelSize: 32,
        map,
        renderSize: { width: 320, height: 160 },
      }),
    ).toEqual({
      minX: 0,
      maxX: 14,
      minY: 0,
      maxY: 8,
    });
  });

  it("excludes positions outside the visible tile bounds", () => {
    const bounds = getFullVisibleTileBounds({
      bufferTiles: 1,
      cameraOffset: { x: 320, y: 0 },
      cellPixelSize: 32,
      map: createWideMap(),
      renderSize: { width: 160, height: 96 },
    });

    expect(isPositionInTileBounds({ x: 10, y: 2 }, bounds)).toBe(true);
    expect(isPositionInTileBounds({ x: 20, y: 2 }, bounds)).toBe(false);
  });
});

describe("isStaticMapSpriteKey", () => {
  it("identifies static map sprite keys but not transient entity/effect keys", () => {
    expect(isStaticMapSpriteKey("floor:map-1:0:0:grass.png")).toBe(true);
    expect(isStaticMapSpriteKey("wall:map-1:4:5:tree.png")).toBe(true);
    expect(isStaticMapSpriteKey("object:map-1:teleport:hub:1:2")).toBe(true);
    expect(isStaticMapSpriteKey("map-visual-object:map-1:tree-1")).toBe(true);
    expect(isStaticMapSpriteKey("entity:test-enemy-1")).toBe(false);
    expect(isStaticMapSpriteKey("feedback:damage-1")).toBe(false);
  });
});

describe("world entity pointer priority", () => {
  it("targets NPCs before other overlapping interactables", () => {
    const map = createWideMap();
    const npc = createNpc("npc", { x: 4, y: 4 }, "Quest Giver", "quest_giver");
    const resource = createResource("wood", { x: 4, y: 4 });
    const enemy = createEnemy("enemy", { x: 4, y: 4 });

    expect(
      getNearestInteractableEntity({
        cellPixelSize: 32,
        entities: [enemy, resource, npc],
        map,
        mapPosition: { x: 4, y: 4 },
      })?.id,
    ).toBe(npc.id);
  });

  it("hovers NPCs before overlapping companions", () => {
    const map = createWideMap();
    const companion = createCompanion("companion", { x: 4, y: 4 }, "companion");
    const npc = createNpc("npc", { x: 4, y: 4 }, "Quest Giver", "quest_giver");

    expect(
      getNearestHoverEntity({
        cellPixelSize: 32,
        entities: [companion, npc],
        map,
        mapPosition: { x: 4, y: 4 },
      })?.id,
    ).toBe(npc.id);
  });
});

describe("getCombatFeedbackLaneKey", () => {
  const baseEvent: CombatFeedbackEvent = {
    createdAt: 0,
    entityId: "enemy-1",
    expiresAt: 1000,
    id: "feedback-1",
    text: "-5 HP",
    type: "damage",
  };

  it("groups damage numbers by source, target, kind, and damage type", () => {
    const first = getCombatFeedbackLaneKey({
      ...baseEvent,
      amount: 5,
      damageType: "physical",
      feedbackKind: "damage",
      sourceEntityId: "companion-1",
      targetEntityId: "enemy-1",
    });
    const second = getCombatFeedbackLaneKey({
      ...baseEvent,
      id: "feedback-2",
      amount: 7,
      damageType: "physical",
      feedbackKind: "damage",
      sourceEntityId: "companion-1",
      targetEntityId: "enemy-1",
    });

    expect(second).toBe(first);
  });

  it("keeps different sources or damage types on separate lanes", () => {
    const first = getCombatFeedbackLaneKey({
      ...baseEvent,
      amount: 5,
      damageType: "physical",
      sourceEntityId: "companion-1",
      targetEntityId: "enemy-1",
    });
    const differentSource = getCombatFeedbackLaneKey({
      ...baseEvent,
      amount: 5,
      damageType: "physical",
      sourceEntityId: "companion-2",
      targetEntityId: "enemy-1",
    });
    const differentType = getCombatFeedbackLaneKey({
      ...baseEvent,
      amount: 5,
      damageType: "magic",
      sourceEntityId: "companion-1",
      targetEntityId: "enemy-1",
    });

    expect(differentSource).not.toBe(first);
    expect(differentType).not.toBe(first);
  });

  it("keeps special labels separate by event id", () => {
    expect(
      getCombatFeedbackLaneKey({
        ...baseEvent,
        id: "blocked-1",
        text: "Blocked",
        type: "attack",
      }),
    ).toBe("feedback-event:blocked-1:attack");
  });
});

describe("prototype VFX feedback sprites", () => {
  const baseEvent: CombatFeedbackEvent = {
    createdAt: 1_000,
    entityId: "companion-1",
    expiresAt: 3_000,
    id: "feedback-1",
    text: "Level Up",
    type: "level_up",
  };

  it("preloads enemy spotted and level-up sprite assets", () => {
    const sources = collectDurableVisualTextureSrcs();

    expect(sources.has(enemySpottedAlertSrc)).toBe(true);
    expect(sources.has(levelUpBurstSrc)).toBe(true);
  });

  it("suppresses text labels for icon-only feedback events", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");
    const enemy = createEnemy("enemy-1", { x: 1, y: 0 }, "aggressive");

    expect(shouldDrawCombatFeedbackEvent(baseEvent, companion)).toBe(false);
    expect(
      shouldDrawCombatFeedbackEvent(
        {
          ...baseEvent,
          entityId: enemy.id,
          text: "Spotted",
          type: "enemy_spotted",
        },
        enemy,
      ),
    ).toBe(false);
  });

  it("uses event lifetime progress for level-up burst scale and opacity", () => {
    expect(getCombatFeedbackLifetimeProgress(baseEvent, 2_000)).toBe(0.5);
    expect(getLevelUpBurstPresentation(baseEvent, 2_000).alpha).toBeCloseTo(0.65);
    expect(getLevelUpBurstPresentation(baseEvent, 2_000).scale).toBe(1.5);
    expect(getLevelUpBurstPresentation(baseEvent, 3_000).alpha).toBeCloseTo(0.3);
    expect(getLevelUpBurstPresentation(baseEvent, 3_000).scale).toBe(2);
  });
});

describe("enemy nameplates", () => {
  it("uses enemy type display name with level", () => {
    const enemy = createEnemy("bat", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "cave_bat",
    });

    expect(getEnemyNameplateText(enemy)).toBe("Cave Bat Lv 2");
  });

  it("prefixes Superior enemies", () => {
    const enemy = createEnemy("slime", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "slime",
      variant: "superior",
    });

    expect(getEnemyNameplateText(enemy)).toBe("Superior Slime Lv 1");
  });

  it("uses red text for aggressive enemies", () => {
    const enemy = createEnemy("enemy", { x: 0, y: 0 }, "aggressive");

    expect(getEnemyNameplateColor(enemy)).toBe(0xdc2626);
  });

  it("uses target dummy display text when no enemy type is set", () => {
    const dummy = createTargetDummy("dummy", { x: 0, y: 0 });

    expect(getEnemyNameplateText(dummy)).toBe("Target Dummy Lv 1");
  });
});
