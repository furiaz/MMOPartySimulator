import type { AoeBounds, Position } from "./types";

/** Authored simulation/map data only; no renderer or runtime dependencies. */
export const ORC_WARCAMP_ARENA: AoeBounds = {
  minX: 80.5, maxX: 108.5, minY: 21.5, maxY: 51.5,
};
export const ORC_WARCAMP_ENCOUNTER_ID = "orc-warcamp-warmaster-ring";
export const ORC_WARCAMP_BOSS_POSITION: Position = { x: 95, y: 32 };
export const ORC_WARCAMP_ROUTE_BARRACK_POSITION: Position = { x: 75, y: 26 };
export const ORC_WARCAMP_GATE_POSITION: Position = { x: 87, y: 51 };
export const ORC_WARCAMP_CAGE_POSITION: Position = { x: 88, y: 45 };
export const ORC_WARCAMP_CHEST_POSITION: Position = { x: 102, y: 45 };
export const ORC_WARCAMP_SAFE_ARRIVAL: Position = { x: 95, y: 46 };
export const ORC_WARCAMP_ARENA_BARRACKS: Array<{
  id: string;
  position: Position;
  spawnCandidates: Position[];
}> = [
  { id: "map-7-arena-barrack-west", position: { x: 88, y: 29 },
    spawnCandidates: [{ x: 88, y: 32 }, { x: 85, y: 32 }, { x: 90, y: 32 }] },
  { id: "map-7-arena-barrack-east", position: { x: 102, y: 29 },
    spawnCandidates: [{ x: 102, y: 32 }, { x: 100, y: 32 }, { x: 105, y: 32 }] },
  { id: "map-7-arena-barrack-north", position: { x: 95, y: 26 },
    spawnCandidates: [{ x: 95, y: 28 }, { x: 92, y: 28 }, { x: 98, y: 28 }] },
];
