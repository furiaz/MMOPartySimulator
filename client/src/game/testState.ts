import { createEmptyPartyInventory } from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import type { GameState } from "./state";
import { createEmptyPartyWallet } from "./wallet";

export function createTestGameState(
  overrides: Partial<GameState> = {},
): GameState {
  return {
    entities: {},
    inventory: createEmptyPartyInventory(),
    wallet: createEmptyPartyWallet(),
    autoModeEnabled: false,
    worldTravelTargetMapId: null,
    poiPreferences: {
      stayInMap: false,
      searchScope: "free_travel",
    },
    simulationTick: 0,
    simulationFrame: 0,
    simulationTimeMs: 0,
    simulationDeltaMs: 100,
    partyLeaderId: "",
    partyIntent: null,
    leaderIntent: null,
    quests: createInitialQuestStates(),
    globalPoiIntent: null,
    localPoiTarget: null,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    ...overrides,
  };
}
