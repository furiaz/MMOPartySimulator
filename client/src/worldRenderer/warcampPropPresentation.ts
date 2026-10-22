import { ORC_WARCAMP_CAGE_POSITION } from "../game/orcWarcampLayout";
import type { MapVisualObject, MapVisualObjectId } from "../game/types";

export function getWarmasterCageVisual(rescued: boolean): MapVisualObject {
  return { id: "warmaster-cage", visualId: rescued ? "orc_warcamp_cage_open" : "orc_warcamp_cage_closed",
    position: ORC_WARCAMP_CAGE_POSITION, widthCells: 3, heightCells: 3, anchorX: 0.5, anchorY: 1 };
}

export function getStructurePropVisualId(visualId: MapVisualObjectId, destroyed: boolean): MapVisualObjectId {
  return destroyed && visualId === "orc_warcamp_barracks" ? "orc_warcamp_barracks_ruined" : visualId;
}
