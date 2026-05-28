import { describe, expect, it } from "vitest";
import { createNpc } from "./game";
import {
  entityVisualAssets,
  getEntityVisualAsset,
  getSpriteAnimation,
} from "./visualAssets";

describe("entity visual assets", () => {
  it("uses real-size Test-Character Idle and Run art for quest guide NPCs", () => {
    const questGuide = createNpc(
      "guide",
      { x: 0, y: 0 },
      "Glade Surveyor",
      "quest_guide",
    );
    const visualAsset = getEntityVisualAsset(questGuide);

    expect(visualAsset).toBe(entityVisualAssets.questGuideCharacter);

    if (visualAsset.kind !== "sprite") {
      throw new Error("Quest guide visual should be a sprite asset.");
    }

    expect(visualAsset.naturalSize).toEqual({ width: 92, height: 92 });

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

  it("uses narrow vertical angle bands for Beginner four-direction movement", () => {
    const visualAsset = entityVisualAssets.beginnerCharacter;

    const northAnimation = getSpriteAnimation(visualAsset, true, "northEast", 90);
    const southAnimation = getSpriteAnimation(visualAsset, true, "southEast", 270);
    const eastAnimation = getSpriteAnimation(visualAsset, true, "northEast", 45);
    const westAnimation = getSpriteAnimation(visualAsset, true, "northWest", 180);
    const nearNorthEastAnimation = getSpriteAnimation(
      visualAsset,
      true,
      "northEast",
      74.9,
    );
    const nearNorthWestAnimation = getSpriteAnimation(
      visualAsset,
      true,
      "northWest",
      105.1,
    );

    expect(northAnimation.frames[0]).toContain("BeginnerWalkingNorth");
    expect(southAnimation.frames[0]).toContain("BeginnerWalkingSouth");
    expect(eastAnimation.frames[0]).toContain("BeginnerWalkingEast");
    expect(westAnimation.frames[0]).toContain("BeginnerWalkingWest");
    expect(nearNorthEastAnimation.frames[0]).toContain("BeginnerWalkingEast");
    expect(nearNorthWestAnimation.frames[0]).toContain("BeginnerWalkingWest");
  });
});
