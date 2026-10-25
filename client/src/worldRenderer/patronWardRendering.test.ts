import { afterEach, describe, expect, it } from "vitest";
import { Container, Sprite, Texture } from "pixi.js";
import { MAP_VISUAL_OBJECT_SRC } from "../assetIcons";
import { PUBLIC_ASSET_ROOT } from "../publicAssetUrl";
import { createDebugMap } from "../game/debugMap";
import { createEnemy } from "../game/entities";
import { PATRON_WARD_DEFINITIONS } from "../game/patronWardState";
import type { PatronWardPresentationState } from "../game/patronWardSystem";
import type { PatronWardId } from "../game/questTypes";
import {
  beginManagedFrame,
  clearLayers,
  createManagedRendererState,
  createPixiDrawMetrics,
  createPixiRenderLayers,
  createTextureCache,
  destroyManagedRendererState,
  drawPatronDefenderAuras,
  drawPatronWardObjects,
  endManagedFrame,
  resetManagedRendererState,
} from "./PixiWorldRenderer";

const auraSources = Array.from({ length: 7 }, (_, index) =>
  `${PUBLIC_ASSET_ROOT}/effects/gameplay/orc-aura/OrcAura${String(index + 1).padStart(4, "0")}.png`);
function createFixture() {
  const stage = new Container();
  const layers = createPixiRenderLayers(stage);
  const cache = createTextureCache();
  cache.currentMapId = "map-6";
  for (const src of [...auraSources, ...PATRON_WARD_DEFINITIONS.map(ward => MAP_VISUAL_OBJECT_SRC[ward.visualId])]) {
    cache.textures.set(src, Texture.WHITE);
  }
  const result = {
    stage, layers, cache,
    map: createDebugMap("map-6"),
    managedState: createManagedRendererState(),
    metrics: createPixiDrawMetrics(),
    presentation: {
      barrier: null, warmaster: null,
      wards: PATRON_WARD_DEFINITIONS.map(ward => ({
        id: ward.id, position: ward.position, visualObjectId: ward.visualObjectId,
        completed: false, isInteractable: false, label: null,
      })),
    } satisfies PatronWardPresentationState,
    transform: { cameraOffset: { x: 0, y: 0 }, cellPixelSize: 32 },
    visibleTileBounds: { minX: 0, minY: 0, maxX: 200, maxY: 200 },
  };
  return result;
}

type Fixture = ReturnType<typeof createFixture>;
const fixtures: Fixture[] = [];

function fixture() {
  const result = createFixture();
  fixtures.push(result);
  return result;
}

type FrameOverrides = Partial<Pick<Parameters<typeof drawPatronWardObjects>[0], "map" | "presentation" | "visibleTileBounds">>;

function frame(world: Fixture, currentTime: number, overrides: FrameOverrides = {}) {
  const map = overrides.map ?? world.map;
  beginManagedFrame(world.managedState, map.id ?? map.debugName);
  drawPatronWardObjects({
    ...world, ...overrides, currentTime,
    auraLayer: world.layers.wardAuraLayer, propLayer: world.layers.objectLayer,
  });
  endManagedFrame(world.managedState);
}

function entry(world: Fixture, id: PatronWardId, kind: "aura" | "prop") {
  return world.managedState.sprites.get(`patron-ward-${kind}:${id}`);
}

function expectBehind(world: Fixture, id: PatronWardId) {
  const aura = entry(world, id, "aura")!;
  const prop = entry(world, id, "prop")!;
  expect(aura.sprite.parent).toBe(world.layers.wardAuraLayer);
  expect(prop.sprite.parent).toBe(world.layers.objectLayer);
  expect(world.stage.getChildIndex(aura.layer)).toBeLessThan(world.stage.getChildIndex(prop.layer));
  expect(aura.sprite.position.x).toBe(prop.sprite.position.x);
  expect(aura.sprite.position.y).toBe(prop.sprite.position.y);
  expect(aura.sprite.anchor.x).toBe(0.5);
  expect(aura.sprite.anchor.y).toBe(1);
  expect(aura.sprite.width).toBe(128);
  expect(aura.sprite.height).toBe(128);
}

function delay(world: Fixture, src: string) {
  world.cache.textures.delete(src);
  world.cache.pendingSrcs.add(src);
}

function ready(world: Fixture, src: string) {
  world.cache.pendingSrcs.delete(src);
  world.cache.textures.set(src, Texture.WHITE);
}

afterEach(() => {
  for (const world of fixtures.splice(0)) {
    destroyManagedRendererState(world.managedState);
    if (!world.stage.destroyed) world.stage.destroy({ children: true });
  }
});

describe("Patron Ward render ordering", () => {
  it("inserts only the Ward aura layer into the existing stage order", () => {
    const { stage, layers } = fixture();
    expect(stage.children).toEqual([
      layers.backgroundGraphics, layers.floorLayer, layers.wallLayer, layers.wardAuraLayer,
      layers.objectLayer, layers.auraLayer, layers.entityLayer, layers.fallbackGraphics,
      layers.effectsGraphics, layers.effectsLayer, layers.overlayGraphics, layers.speechLayer,
    ]);
  });

  describe.each(PATRON_WARD_DEFINITIONS)("$displayName", ward => {
    it.each(["both_ready", "aura_first", "prop_first"] as const)("stays behind the prop with %s", order => {
      const world = fixture();
      const propSrc = MAP_VISUAL_OBJECT_SRC[ward.visualId];
      if (order === "aura_first") delay(world, propSrc);
      if (order === "prop_first") delay(world, auraSources[0]);
      frame(world, 0);
      const existing = entry(world, ward.id, order === "aura_first" ? "aura" : "prop")!.sprite;
      if (order === "aura_first") expect(entry(world, ward.id, "prop")).toBeUndefined();
      if (order === "prop_first") expect(entry(world, ward.id, "aura")).toBeUndefined();
      ready(world, propSrc);
      ready(world, auraSources[0]);
      frame(world, 0);
      expectBehind(world, ward.id);
      expect(entry(world, ward.id, order === "aura_first" ? "aura" : "prop")!.sprite).toBe(existing);
    });

    it("keeps a recreated late animation frame behind the retained prop", () => {
      const world = fixture();
      frame(world, 0);
      const aura = entry(world, ward.id, "aura")!.sprite;
      const prop = entry(world, ward.id, "prop")!.sprite;
      delay(world, auraSources[1]);
      frame(world, 100);
      expect(aura.destroyed).toBe(true);
      expect(entry(world, ward.id, "aura")).toBeUndefined();
      ready(world, auraSources[1]);
      frame(world, 100);
      expectBehind(world, ward.id);
      expect(entry(world, ward.id, "aura")!.sprite).not.toBe(aura);
      expect(entry(world, ward.id, "prop")!.sprite).toBe(prop);
    });

    it("removes the completed aura while preserving the prop's one-second fade", () => {
      const world = fixture();
      frame(world, 0);
      const aura = entry(world, ward.id, "aura")!.sprite;
      const prop = entry(world, ward.id, "prop")!.sprite;
      const presentation: PatronWardPresentationState = {
        ...world.presentation,
        wards: world.presentation.wards.map(value => value.id === ward.id
          ? { ...value, completed: true, propFadeStartedAtMs: 1000 } : value),
      };
      frame(world, 1000, { presentation });
      expect(aura.destroyed).toBe(true);
      expect(prop.alpha).toBe(1);
      frame(world, 1500, { presentation });
      expect(entry(world, ward.id, "aura")).toBeUndefined();
      expect(entry(world, ward.id, "prop")!.sprite).toBe(prop);
      expect(prop.alpha).toBe(0.5);
      frame(world, 2000, { presentation });
      expect(prop.destroyed).toBe(true);
      expect(entry(world, ward.id, "prop")).toBeUndefined();
      for (const other of PATRON_WARD_DEFINITIONS.filter(value => value.id !== ward.id)) expectBehind(world, other.id);
    });
  });

  it("reuses sprites and maintains ordering across ten complete animation cycles", () => {
    const world = fixture();
    frame(world, 0);
    const sprites = new Map([...world.managedState.sprites].map(([key, value]) => [key, value.sprite]));
    for (let i = 1; i <= 70; i++) {
      frame(world, i * 100);
      for (const ward of PATRON_WARD_DEFINITIONS) {
        expectBehind(world, ward.id);
        expect(entry(world, ward.id, "aura")!.src).toBe(auraSources[i % 7]);
      }
      for (const [key, sprite] of sprites) expect(world.managedState.sprites.get(key)!.sprite).toBe(sprite);
    }
  });

  it("culls and recreates Wards after viewport exit without retaining old sprites", () => {
    const world = fixture();
    frame(world, 0);
    const oldSprites = [...world.managedState.sprites.values()].map(value => value.sprite);
    frame(world, 100, { visibleTileBounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } });
    expect(world.managedState.sprites.size).toBe(0);
    expect(oldSprites.every(sprite => sprite.destroyed)).toBe(true);
    frame(world, 200);
    for (const ward of PATRON_WARD_DEFINITIONS) expectBehind(world, ward.id);
  });

  it("cleans both Ward layers across map changes and full/preview switches", () => {
    const world = fixture();
    frame(world, 0);
    frame(world, 100, { map: createDebugMap("map-1"), presentation: null });
    expect(world.managedState.sprites.size).toBe(0);
    expect(world.layers.wardAuraLayer.children).toHaveLength(0);
    expect(world.layers.objectLayer.children).toHaveLength(0);
    frame(world, 200);
    const oldSprites = [...world.managedState.sprites.values()].map(value => value.sprite);
    clearLayers(world.layers);
    resetManagedRendererState(world.managedState);
    expect(oldSprites.every(sprite => sprite.destroyed)).toBe(true);
    expect(world.managedState.sprites.size).toBe(0);
    expect(world.layers.wardAuraLayer.children).toHaveLength(0);
    frame(world, 300);
    for (const ward of PATRON_WARD_DEFINITIONS) expectBehind(world, ward.id);
  });

  it("preserves the separate behind-actor layer for Ward defenders and the Warmaster", () => {
    const world = fixture();
    const defender = createEnemy("defender", { x: 96, y: 20 }, "aggressive", {
      enemyTypeId: "night_bat",
      questSpawn: { questId: "the_patrons_shadow", objectiveId: "break_night_bat_ward", patronAura: true },
    });
    const boss = createEnemy("boss", { x: 90, y: 30 }, "aggressive", { enemyTypeId: "orc_warmaster" });
    const orc = createEnemy("arena-orc", { x: 90, y: 34 }, "aggressive", { enemyTypeId: "orc" });
    beginManagedFrame(world.managedState, "map-6");
    drawPatronDefenderAuras({
      ...world, currentTime: 0, entities: [defender, boss, orc], layer: world.layers.auraLayer,
      warmasterAttempt: { id: "attempt", bossId: boss.id, power: 0, transferSequence: 0, transfers: [] },
    });
    endManagedFrame(world.managedState);
    for (const enemy of [defender, boss, orc]) {
      const aura = world.managedState.sprites.get(`patron-defender-aura:${enemy.id}`)!;
      expect(aura.sprite.parent).toBe(world.layers.auraLayer);
      const actorSprite = new Sprite(Texture.WHITE);
      world.layers.entityLayer.addChild(actorSprite);
      expect(world.stage.getChildIndex(aura.layer)).toBeLessThan(world.stage.getChildIndex(actorSprite.parent!));
    }
    expect(world.layers.wardAuraLayer.children).toHaveLength(0);
  });

  it("disposes the new layer and all managed Ward sprites with the stage", () => {
    const world = fixture();
    frame(world, 0);
    const sprites = [...world.managedState.sprites.values()].map(value => value.sprite);
    destroyManagedRendererState(world.managedState);
    world.stage.destroy({ children: true });
    expect(sprites.every(sprite => sprite.destroyed)).toBe(true);
    expect(world.layers.wardAuraLayer.destroyed).toBe(true);
    expect(world.managedState.sprites.size).toBe(0);
  });
});
