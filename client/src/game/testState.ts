import { createEmptyPartyBank } from "./bank";
import { createInitialGuildNoticeBoardState } from "./guildNoticeBoard";
import { createInitialGuildRecruitState } from "./guildRecruit";
import { createInitialGuildUpgradesState } from "./guildRecruitUpgrades";
import { createInitialGuildSecondaryPartiesState } from "./guildSecondaryParties";
import { createInitialFarmState } from "./farm";
import { createInitialInnKitchenState } from "./innKitchen";
import { createInitialInnUpgradesState } from "./innRoomUpgrades";
import { LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID } from "./keyItems";
import { createInitialLivestockState } from "./livestock";
import { createEmptyPartyInventory } from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import type { GameState } from "./state";
import { createEmptyPartyWallet } from "./wallet";

export function createTestGameState(
  overrides: Partial<GameState> = {},
): GameState {
  return {
    entities: {},
    restingCompanionsById: {},
    highestCharacterLevelEver: 1,
    partySizeGrowthGuideViewed: false,
    guildRecruit: createInitialGuildRecruitState(0),
    guildUpgrades: createInitialGuildUpgradesState(),
    guildNoticeBoard: createInitialGuildNoticeBoardState(0),
    guildSecondaryParties: createInitialGuildSecondaryPartiesState(),
    innUpgrades: createInitialInnUpgradesState(),
    innKitchen: createInitialInnKitchenState(),
    farm: createInitialFarmState(),
    livestock: createInitialLivestockState(),
    inventory: createEmptyPartyInventory(),
    keyItemsById: {
      [LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]: 1,
    },
    bank: createEmptyPartyBank(),
    wallet: createEmptyPartyWallet(),
    autoModeEnabled: false,
    autoCombatOnArrivalEnabled: false,
    autoRoute: undefined,
    worldTravelTargetMapId: null,
    poiPreferences: {
      stayInMap: false,
      searchScope: "zone_only",
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
    combatProjectiles: [],
    newsBroadcasts: [],
    ...overrides,
  };
}
