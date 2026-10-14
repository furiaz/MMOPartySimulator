import { describe, expect, it } from "vitest";
import {
  AOE_PATTERN_SQUARE_SIZE,
  DEFAULT_AOE_CIRCLE_DIAMETER,
  createAoeCastTransform,
  doAoeBoundsIntersect,
  isPositionInsideAoe,
  resolveAoePattern,
} from "./aoePatterns";

describe("AoE patterns", () => {
  it("locks copied world-space origin and normalized direction", () => {
    const origin = { x: 2, y: 3 };
    const target = { x: 2, y: 8 };
    const transform = createAoeCastTransform(origin, target);
    const area = resolveAoePattern({ type: "circle", radius: 2 }, transform);

    origin.x = 20;
    target.y = 30;
    transform.origin.y = 40;
    transform.direction.x = 1;

    expect(area.castTransform).toEqual({
      origin: { x: 2, y: 3 },
      direction: { x: 0, y: 1 },
    });
    expect(area.primitives[0]).toEqual({
      type: "circle",
      center: { x: 2, y: 3 },
      radius: 2,
    });
  });

  it("uses the approved 1.5-unit square and default circle diameter", () => {
    expect(AOE_PATTERN_SQUARE_SIZE).toBe(1.5);
    expect(DEFAULT_AOE_CIRCLE_DIAMETER).toBe(1.125);
  });

  it("resolves translated circles and true rings with an excluded hole", () => {
    const transform = createAoeCastTransform({ x: 10, y: 10 }, { x: 11, y: 10 });
    const circle = resolveAoePattern(
      { type: "circle", radius: 2, offset: { x: 3, y: -1 } },
      transform,
    );
    const ring = resolveAoePattern(
      { type: "ring", innerRadius: 1, outerRadius: 2 },
      transform,
    );

    expect(circle.primitives[0]).toMatchObject({ center: { x: 13, y: 9 } });
    expect(isPositionInsideAoe(circle, { x: 15, y: 9 })).toBe(true);
    expect(isPositionInsideAoe(circle, { x: 15.01, y: 9 })).toBe(false);
    expect(isPositionInsideAoe(ring, { x: 10, y: 10 })).toBe(false);
    expect(isPositionInsideAoe(ring, { x: 11, y: 10 })).toBe(true);
    expect(isPositionInsideAoe(ring, { x: 12, y: 10 })).toBe(true);
    expect(isPositionInsideAoe(ring, { x: 12.01, y: 10 })).toBe(false);
  });

  it("resolves separate concentric ring bands", () => {
    const area = resolveAoePattern(
      {
        type: "concentricRings",
        rings: [
          { innerRadius: 0.5, outerRadius: 1 },
          { innerRadius: 1.5, outerRadius: 2 },
        ],
      },
      createAoeCastTransform({ x: 0, y: 0 }, { x: 1, y: 0 }),
    );

    expect(area.primitives).toHaveLength(2);
    expect(isPositionInsideAoe(area, { x: 0.75, y: 0 })).toBe(true);
    expect(isPositionInsideAoe(area, { x: 1.25, y: 0 })).toBe(false);
    expect(isPositionInsideAoe(area, { x: 1.75, y: 0 })).toBe(true);
  });

  it("rotates and translates a touching-square line continuously", () => {
    const area = resolveAoePattern(
      { type: "line", squareCount: 3 },
      createAoeCastTransform({ x: 4, y: 5 }, { x: 4, y: 8 }),
    );

    expect(area.primitives).toHaveLength(3);
    expect(area.primitives.map((primitive) => primitive.type === "square" && primitive.center))
      .toEqual([
        { x: 4, y: 5.75 },
        { x: 4, y: 7.25 },
        { x: 4, y: 8.75 },
      ]);
    expect(isPositionInsideAoe(area, { x: 4.74, y: 9.49 })).toBe(true);
    expect(isPositionInsideAoe(area, { x: 4.76, y: 9.49 })).toBe(false);
  });

  it("resolves rectangle, cross, and X square layouts", () => {
    const transform = createAoeCastTransform({ x: 0, y: 0 }, { x: 1, y: 0 });
    const rectangle = resolveAoePattern(
      { type: "rectangle", columns: 4, rows: 3 },
      transform,
    );
    const cross = resolveAoePattern({ type: "cross", armLength: 2 }, transform);
    const x = resolveAoePattern({ type: "x", armLength: 2 }, transform);

    expect(rectangle.primitives).toHaveLength(12);
    expect(rectangle.bounds).toEqual({ minX: 0, maxX: 4.5, minY: -3, maxY: 3 });
    expect(cross.primitives).toHaveLength(9);
    expect(isPositionInsideAoe(cross, { x: -3.7, y: 0 })).toBe(true);
    expect(isPositionInsideAoe(cross, { x: -2.25, y: 2.25 })).toBe(false);
    expect(x.primitives).toHaveLength(9);
    expect(isPositionInsideAoe(x, { x: 3, y: 3 })).toBe(true);
    expect(isPositionInsideAoe(x, { x: 0, y: 3 })).toBe(false);
  });

  it("uses a true curved cone with inclusive angle and range boundaries", () => {
    const area = resolveAoePattern(
      { type: "cone", range: 5, angleRadians: Math.PI / 3 },
      createAoeCastTransform({ x: 0, y: 0 }, { x: 1, y: 0 }),
    );
    const boundary = {
      x: Math.cos(Math.PI / 6) * 5,
      y: Math.sin(Math.PI / 6) * 5,
    };

    expect(isPositionInsideAoe(area, { x: 0, y: 0 })).toBe(true);
    expect(isPositionInsideAoe(area, boundary)).toBe(true);
    expect(isPositionInsideAoe(area, { x: 0, y: 4 })).toBe(false);
    expect(isPositionInsideAoe(area, { x: 5.01, y: 0 })).toBe(false);
  });

  it("deduplicates exact union primitives and resolves overlaps as one boolean area", () => {
    const area = resolveAoePattern(
      {
        type: "union",
        patterns: [
          { type: "circle", radius: 2 },
          { type: "circle", radius: 2 },
          { type: "line", squareCount: 2 },
        ],
      },
      createAoeCastTransform({ x: 0, y: 0 }, { x: 1, y: 0 }),
    );

    expect(area.primitives).toHaveLength(3);
    expect(isPositionInsideAoe(area, { x: 1, y: 0 })).toBe(true);
  });

  it("computes rotated bounds and supports bounds-based renderer culling", () => {
    const area = resolveAoePattern(
      { type: "line", squareCount: 2 },
      createAoeCastTransform({ x: 5, y: 5 }, { x: 6, y: 6 }),
    );

    expect(area.bounds.minX).toBeCloseTo(
      5 - AOE_PATTERN_SQUARE_SIZE * Math.SQRT1_2 / 2,
    );
    expect(area.bounds.maxX).toBeCloseTo(
      5 + AOE_PATTERN_SQUARE_SIZE * 2.5 * Math.SQRT1_2,
    );
    expect(doAoeBoundsIntersect(area.bounds, {
      minX: 6,
      maxX: 7,
      minY: 6,
      maxY: 7,
    })).toBe(true);
    expect(doAoeBoundsIntersect(area.bounds, {
      minX: 20,
      maxX: 21,
      minY: 20,
      maxY: 21,
    })).toBe(false);
  });
});
