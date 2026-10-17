import { describe, expect, it } from "vitest";
import { clipSquareAoeAreaToForwardDistance, createAoeCastTransform, doesAoeIntersectFootprint, resolveAoePattern } from "./aoePatterns";
import type { AoePattern } from "./types";

const transform = createAoeCastTransform({ x: 0, y: 0 }, { x: 1, y: 0 });
describe("AoE ground-footprint intersection", () => {
  it("accepts circle edge contact even when the building center is outside", () => {
    const area = resolveAoePattern({ type: "circle", radius: 2 }, transform);
    expect(doesAoeIntersectFootprint(area, { minX: 2, maxX: 7, minY: -1, maxY: 1 })).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: 2.001, maxX: 7, minY: -1, maxY: 1 })).toBe(false);
  });
  it("respects a ring hole and both inner and outer boundary contacts", () => {
    const area = resolveAoePattern({ type: "ring", innerRadius: 3, outerRadius: 5 }, transform);
    expect(doesAoeIntersectFootprint(area, { minX: -1, maxX: 1, minY: -1, maxY: 1 })).toBe(false);
    expect(doesAoeIntersectFootprint(area, { minX: 0, maxX: 3, minY: 0, maxY: 0 })).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: 5, maxX: 6, minY: 0, maxY: 1 })).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: -6, maxX: 6, minY: -6, maxY: 6 })).toBe(true);
  });
  it.each<AoePattern>([
    { type: "line", squareCount: 4 }, { type: "rectangle", rows: 4, columns: 2 },
    { type: "cross", armLength: 2 }, { type: "x", armLength: 2 },
  ])("handles translated rotated square patterns: $type", pattern => {
    const area = resolveAoePattern(pattern, createAoeCastTransform({ x: 10, y: 10 }, { x: 11, y: 11 }));
    const primitive = area.primitives[0];
    if (primitive.type !== "square") throw new Error("Expected square");
    expect(doesAoeIntersectFootprint(area, { minX: primitive.center.x - 0.1, maxX: primitive.center.x + 0.1,
      minY: primitive.center.y - 0.1, maxY: primitive.center.y + 0.1 })).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: 100, maxX: 105, minY: 100, maxY: 102 })).toBe(false);
  });
  it("handles the rotated partial rectangle after dash clipping", () => {
    const area = clipSquareAoeAreaToForwardDistance(resolveAoePattern({ type: "line", squareCount: 4 }, transform), 2.1);
    expect(area.primitives.some(p => p.type === "rectangle")).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: 2.1, maxX: 3, minY: 0, maxY: 0.5 })).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: 2.11, maxX: 3, minY: 0, maxY: 0.5 })).toBe(false);
  });
  it("handles cone rays, curved edge crossings, enclosure and empty corners", () => {
    const area = resolveAoePattern({ type: "cone", range: 5, angleRadians: Math.PI / 2 }, transform);
    expect(doesAoeIntersectFootprint(area, { minX: 4.9, maxX: 5.1, minY: -0.5, maxY: 0.5 })).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: -1, maxX: 6, minY: -6, maxY: 6 })).toBe(true);
    expect(doesAoeIntersectFootprint(area, { minX: 2, maxX: 3, minY: 4, maxY: 5 })).toBe(false);
    expect(doesAoeIntersectFootprint(area, { minX: 2, maxX: 2.1, minY: 2, maxY: 2.1 })).toBe(true);
  });
  it("returns one boolean for overlapping union primitives, not multiple hits", () => {
    const area = resolveAoePattern({ type: "union", patterns: [ { type: "circle", radius: 2 }, { type: "circle", radius: 3 } ] }, transform);
    expect(doesAoeIntersectFootprint(area, { minX: 1, maxX: 2, minY: 1, maxY: 2 })).toBe(true);
  });
  it("does not intersect a rectangle beyond the circle radius", () => {
    const roofArea = resolveAoePattern({ type: "circle", radius: 1 }, createAoeCastTransform({ x: 75, y: 22 }, { x: 75, y: 22 }));
    expect(doesAoeIntersectFootprint(roofArea, { minX: 73, maxX: 78, minY: 25, maxY: 27 })).toBe(false);
  });
});
