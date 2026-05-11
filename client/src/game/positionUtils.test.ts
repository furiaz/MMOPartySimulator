import { describe, expect, it } from "vitest";
import {
  arePositionsEqual,
  getEuclideanDistance,
  getGridDistance,
  getManhattanDistance,
  getPositionKey,
} from "./positionUtils";

describe("position utilities", () => {
  it("calculates shared distance helpers consistently", () => {
    const from = { x: 1, y: 2 };
    const to = { x: 4, y: 6 };

    expect(arePositionsEqual(from, to)).toBe(false);
    expect(arePositionsEqual(from, { x: 1, y: 2 })).toBe(true);
    expect(getGridDistance(from, to)).toBe(4);
    expect(getManhattanDistance(from, to)).toBe(7);
    expect(getEuclideanDistance(from, to)).toBe(5);
    expect(getPositionKey(to)).toBe("4,6");
  });
});
