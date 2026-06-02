import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc } from "./game";
import {
  getTrackedVisualMovementPositions,
  pruneVisualMovementEntries,
} from "./visualMovement";

const baseOptions = {
  cameraOffset: { x: 0, y: 0 },
  cellPixelSize: 32,
  combatFeedbackEvents: [],
  currentTime: 1_000,
  marginTiles: 6,
  viewportSize: { width: 320, height: 320 },
  visualMovementByEntityId: {},
};

describe("visual movement tracking", () => {
  it("tracks companions and visible enemies while excluding offscreen idle enemies", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "Companion");
    const visibleEnemy = createEnemy("enemy-visible", { x: 8, y: 8 });
    const offscreenEnemy = createEnemy("enemy-offscreen", { x: 80, y: 80 });

    const positions = getTrackedVisualMovementPositions({
      ...baseOptions,
      enemies: [visibleEnemy, offscreenEnemy],
      partyMembers: [companion],
      questGuideNpcs: [],
    });

    expect(positions[companion.id]).toEqual(companion.position);
    expect(positions[visibleEnemy.id]).toEqual(visibleEnemy.position);
    expect(positions[offscreenEnemy.id]).toBeUndefined();
  });

  it("tracks offscreen enemies when they are combat-visible", () => {
    const attackingEnemy = {
      ...createEnemy("enemy-attacking", { x: 80, y: 80 }),
      state: "attack" as const,
      currentTargetId: "companion-1",
    };
    const feedbackEnemy = createEnemy("enemy-feedback", { x: 90, y: 90 });

    const positions = getTrackedVisualMovementPositions({
      ...baseOptions,
      combatFeedbackEvents: [
        {
          createdAt: 900,
          entityId: feedbackEnemy.id,
          expiresAt: 1_500,
          id: "feedback-1",
          text: "-1",
          type: "damage",
        },
      ],
      enemies: [attackingEnemy, feedbackEnemy],
      partyMembers: [],
      questGuideNpcs: [],
    });

    expect(positions[attackingEnemy.id]).toEqual(attackingEnemy.position);
    expect(positions[feedbackEnemy.id]).toEqual(feedbackEnemy.position);
  });

  it("tracks quest guide NPCs and prunes expired or missing visual movement entries", () => {
    const questGuide = createNpc("guide", { x: 12, y: 12 }, "Guide", "quest_guide");
    const positions = getTrackedVisualMovementPositions({
      ...baseOptions,
      enemies: [],
      partyMembers: [],
      questGuideNpcs: [questGuide],
    });
    const pruned = pruneVisualMovementEntries(
      {
        guide: {
          angleDegrees: 0,
          direction: "east",
          expiresAt: 1_500,
        },
        missing: {
          angleDegrees: 0,
          direction: "east",
          expiresAt: 1_500,
        },
        expired: {
          angleDegrees: 0,
          direction: "east",
          expiresAt: 900,
        },
      },
      new Set(Object.keys(positions)),
      1_000,
    );

    expect(positions[questGuide.id]).toEqual(questGuide.position);
    expect(pruned).toEqual({
      guide: {
        angleDegrees: 0,
        direction: "east",
        expiresAt: 1_500,
      },
    });
  });
});
