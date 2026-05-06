import type { GameMap } from "./types";

const DEBUG_MAP_COLUMNS = 36;
const DEBUG_MAP_ROWS = 27;

export function createDebugMap(): GameMap {
  return {
    columns: DEBUG_MAP_COLUMNS,
    rows: DEBUG_MAP_ROWS,
    walls: [],
  };
}
