import { describe, expect, it } from "vitest";
import type { GameMap } from "../game";
import { getPreviewMapPosition } from "./PixiWorldRenderer";

const previewCanvasBounds = {
  left: 100,
  top: 20,
  width: 256,
  height: 144,
};

function createWideMap(): GameMap {
  return {
    debugName: "Wide Test Map",
    displayName: "Wide Test Map",
    columns: 160,
    rows: 30,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

describe("getPreviewMapPosition", () => {
  it("maps a minimap click to the represented map tile", () => {
    const map = createWideMap();
    const position = getPreviewMapPosition(
      {
        x: previewCanvasBounds.left + 8 + 80.5 * 1.5,
        y: previewCanvasBounds.top + 49.5 + 15.5 * 1.5,
      },
      previewCanvasBounds,
      map,
    );

    expect(position).toEqual({ x: 80, y: 15 });
  });

  it("returns null for clicks in minimap padding outside the rendered map", () => {
    const map = createWideMap();

    expect(
      getPreviewMapPosition(
        { x: previewCanvasBounds.left + 128, y: previewCanvasBounds.top + 8 },
        previewCanvasBounds,
        map,
      ),
    ).toBeNull();
  });

  it("uses canvas bounds so wrapper borders do not skew conversion", () => {
    const map = createWideMap();
    const borderedCanvasBounds = {
      left: 101,
      top: 21,
      width: 256,
      height: 144,
    };

    expect(
      getPreviewMapPosition(
        {
          x: borderedCanvasBounds.left + 8 + 12.5 * 1.5,
          y: borderedCanvasBounds.top + 49.5 + 4.5 * 1.5,
        },
        borderedCanvasBounds,
        map,
      ),
    ).toEqual({ x: 12, y: 4 });
  });
});
