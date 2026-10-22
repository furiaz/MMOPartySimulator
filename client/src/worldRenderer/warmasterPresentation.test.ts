import { describe, expect, it } from "vitest";
import { getPatronTransferPosition, isAuraVisible } from "./warmasterPresentation";
describe("Patron presentation", () => {
  it("follows the current Boss position but respects the simulation deadline", () => {
    const transfer = {
      id: "t",
      bossId: "b",
      attemptId: "a",
      origin: { x: 0, y: 0 },
      startedAt: 1000,
      arrivesAt: 2000
    };
    expect(getPatronTransferPosition(transfer, { x: 10, y: 0 }, 1500)).toEqual({ x: 5, y: 0 });
    expect(getPatronTransferPosition(transfer, { x: 10, y: 10 }, 1500)).toEqual({ x: 5, y: 5 });
    expect(getPatronTransferPosition(transfer, { x: 10, y: 10 }, 2100)).toEqual({ x: 10, y: 10 });
  });
  it("culls by aura bounds instead of requiring its center on screen", () => {
    const bounds = {
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10
    };
    expect(isAuraVisible({ x: 12, y: 5 }, 4, bounds)).toBe(true);
    expect(isAuraVisible({ x: 15, y: 5 }, 4, bounds)).toBe(false);
  });
});
