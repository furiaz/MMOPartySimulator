import { HUB_TWO_MAP_ID } from "./debugMap";
import { getPartySizeLimit } from "./leveling";
import type { GameState } from "./state";

export function shouldQueuePartySizeGrowthGuide(state: GameState): boolean {
  return (
    state.partySizeGrowthGuideViewed !== true &&
    state.currentMapId === HUB_TWO_MAP_ID &&
    getPartySizeLimit(state) >= 3
  );
}

export function markPartySizeGrowthGuideViewed(state: GameState): GameState {
  if (state.partySizeGrowthGuideViewed === true) {
    return state;
  }

  return {
    ...state,
    partySizeGrowthGuideViewed: true,
  };
}
