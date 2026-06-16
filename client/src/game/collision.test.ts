import { describe, expect, it } from "vitest";
import { FIRST_CLASS_IDS } from "./classes";
import { createCompanion } from "./entities";
import {
  COMPANION_COLLISION_CAPSULE_ANCHOR_Y,
  COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER,
  COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER,
  ENTITY_COLLISION_DISTANCE,
  getEntityCollisionShape,
  isPositionInsideEntityCollisionShape,
} from "./movementPlanning";

describe("entity collision shapes", () => {
  const companionCapsuleShape = {
    kind: "verticalCapsule" as const,
    radius:
      ENTITY_COLLISION_DISTANCE *
      COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER,
    height:
      ENTITY_COLLISION_DISTANCE *
      2 *
      COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER,
    anchorY: COMPANION_COLLISION_CAPSULE_ANCHOR_Y,
  };

  it("uses a vertical capsule for Beginner companions", () => {
    const beginner = createCompanion(
      "beginner",
      { x: 0, y: 0 },
      "beginner",
      "none",
      1,
      "beginner",
    );

    const shape = getEntityCollisionShape(beginner);

    expect(shape).toEqual(companionCapsuleShape);
  });

  it("makes the companion capsule width 0.8 times the default collision circle", () => {
    const beginner = createCompanion(
      "beginner",
      { x: 0, y: 0 },
      "beginner",
      "none",
      1,
      "beginner",
    );

    const capsuleRadius =
      ENTITY_COLLISION_DISTANCE *
      COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER;

    expect(COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER).toBe(0.8);
    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: capsuleRadius - 0.01,
        y: 0,
      }),
    ).toBe(true);
    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: capsuleRadius + 0.01,
        y: 0,
      }),
    ).toBe(false);
  });

  it("makes the companion capsule height match the configured circle-height multiplier", () => {
    const beginner = createCompanion(
      "beginner",
      { x: 0, y: 0 },
      "beginner",
      "none",
      1,
      "beginner",
    );
    const capsuleHeight =
      ENTITY_COLLISION_DISTANCE *
      2 *
      COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER;
    const capsuleTop = -capsuleHeight * COMPANION_COLLISION_CAPSULE_ANCHOR_Y;
    const capsuleBottom = capsuleTop + capsuleHeight;

    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: 0,
        y: capsuleTop + 0.01,
      }),
    ).toBe(true);
    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: 0,
        y: capsuleTop - 0.01,
      }),
    ).toBe(false);
    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: 0,
        y: capsuleBottom - 0.01,
      }),
    ).toBe(true);
    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: 0,
        y: capsuleBottom + 0.01,
      }),
    ).toBe(false);
  });

  it("anchors the companion capsule slightly below the entity position", () => {
    const beginner = createCompanion(
      "beginner",
      { x: 0, y: 0 },
      "beginner",
      "none",
      1,
      "beginner",
    );
    const capsuleHeight =
      ENTITY_COLLISION_DISTANCE *
      2 *
      COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER;
    const capsuleTop = -capsuleHeight * COMPANION_COLLISION_CAPSULE_ANCHOR_Y;
    const capsuleBottom = capsuleTop + capsuleHeight;

    expect(COMPANION_COLLISION_CAPSULE_ANCHOR_Y).toBe(0.3);
    expect(
      capsuleHeight * (1 - COMPANION_COLLISION_CAPSULE_ANCHOR_Y),
    ).toBeGreaterThan(
      capsuleHeight * COMPANION_COLLISION_CAPSULE_ANCHOR_Y,
    );
    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: 0,
        y: capsuleBottom - 0.01,
      }),
    ).toBe(true);
  });

  it("uses the companion capsule for every first class", () => {
    for (const classId of FIRST_CLASS_IDS) {
      const companion = createCompanion(
        classId,
        { x: 0, y: 0 },
        classId,
        "none",
        1,
        classId,
      );

      expect(getEntityCollisionShape(companion)).toEqual(companionCapsuleShape);
    }
  });
});
