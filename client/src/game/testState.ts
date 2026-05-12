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
    simulationTick: 0,
    partyLeaderId: "",
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
