import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import {
  BEGINNER_COLLISION_CAPSULE_ANCHOR_Y,
  BEGINNER_COLLISION_CAPSULE_HEIGHT_MULTIPLIER,
  BEGINNER_COLLISION_CAPSULE_WIDTH_MULTIPLIER,
  ENTITY_COLLISION_DISTANCE,
  getEntityCollisionShape,
  isPositionInsideEntityCollisionShape,
} from "./movementPlanning";

describe("entity collision shapes", () => {
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

    expect(shape).toEqual({
      kind: "verticalCapsule",
      radius:
        ENTITY_COLLISION_DISTANCE *
        BEGINNER_COLLISION_CAPSULE_WIDTH_MULTIPLIER,
      height:
        ENTITY_COLLISION_DISTANCE *
        2 *
        BEGINNER_COLLISION_CAPSULE_HEIGHT_MULTIPLIER,
      anchorY: BEGINNER_COLLISION_CAPSULE_ANCHOR_Y,
    });
  });

  it("makes the Beginner capsule width 0.85 times the default collision circle", () => {
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
      BEGINNER_COLLISION_CAPSULE_WIDTH_MULTIPLIER;

    expect(BEGINNER_COLLISION_CAPSULE_WIDTH_MULTIPLIER).toBe(0.8);
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

  it("makes the Beginner capsule height match the configured circle-height multiplier", () => {
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
      BEGINNER_COLLISION_CAPSULE_HEIGHT_MULTIPLIER;
    const capsuleTop = -capsuleHeight * BEGINNER_COLLISION_CAPSULE_ANCHOR_Y;
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

  it("anchors the Beginner capsule slightly below the entity position", () => {
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
      BEGINNER_COLLISION_CAPSULE_HEIGHT_MULTIPLIER;
    const capsuleTop = -capsuleHeight * BEGINNER_COLLISION_CAPSULE_ANCHOR_Y;
    const capsuleBottom = capsuleTop + capsuleHeight;

    expect(BEGINNER_COLLISION_CAPSULE_ANCHOR_Y).toBe(0.3);
    expect(capsuleHeight * (1 - BEGINNER_COLLISION_CAPSULE_ANCHOR_Y)).toBeGreaterThan(
      capsuleHeight * BEGINNER_COLLISION_CAPSULE_ANCHOR_Y,
    );
    expect(
      isPositionInsideEntityCollisionShape(beginner, {
        x: 0,
        y: capsuleBottom - 0.01,
      }),
    ).toBe(true);
  });

  it("keeps default collision shape for non-Beginner companions", () => {
    const blade = createCompanion(
      "blade",
      { x: 0, y: 0 },
      "blade",
      "none",
      1,
      "blade",
    );

    expect(getEntityCollisionShape(blade)).toEqual({
      kind: "circle",
      radius: ENTITY_COLLISION_DISTANCE,
    });
  });
});
