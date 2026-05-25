import { describe, expect, it } from "vitest";
import { createNpc } from "./game";
import {
  entityVisualAssets,
  getEntityVisualAsset,
  getSpriteAnimation,
} from "./visualAssets";

describe("entity visual assets", () => {
  it("uses Test-Character Idle and Run art for quest guide NPCs", () => {
    const questGuide = createNpc(
      "guide",
      { x: 0, y: 0 },
      "Glade Surveyor",
      "quest_guide",
    );
    const visualAsset = getEntityVisualAsset(questGuide);

    expect(visualAsset).toBe(entityVisualAssets.testCharacter);

    if (visualAsset.kind !== "sprite") {
      throw new Error("Quest guide visual should be a sprite asset.");
    }

    const idleAnimation = getSpriteAnimation(visualAsset, false);
    const eastRunAnimation = getSpriteAnimation(visualAsset, true, "east");

    expect(idleAnimation.frames).toEqual([
      "/Asserts/Characters/Test-Character/Idle/Idle_000.png",
    ]);
    expect(eastRunAnimation.frames).toHaveLength(8);
    expect(eastRunAnimation.frames.every((frame) => frame.includes("/Run/"))).toBe(
      true,
    );
    expect(eastRunAnimation.frames.some((frame) => frame.includes("/Attack/"))).toBe(
      false,
    );
  });

  it("keeps other NPC-specific visuals unchanged", () => {
    const testBlade = createNpc(
      "test-blade",
      { x: 0, y: 0 },
      "Test Blade",
      "test_blade",
    );

    expect(getEntityVisualAsset(testBlade)).toBe(entityVisualAssets.testBlade);
  });
});
