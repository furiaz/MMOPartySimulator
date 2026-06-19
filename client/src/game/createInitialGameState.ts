import {
  createCompanion,
  createNpc,
  createTargetDummy,
} from "./entities";
import {
  HUB_MAP_ID,
  aoeTargetDummyId,
  aoeTargetDummyPosition,
  companionIds,
  createDebugMap,
  getHubNpcStartDataForQuestState,
  hubCompanionStartPositions,
  targetDummyId,
  targetDummyPosition,
} from "./debugMap";
import {
  addItemToInventoryState,
  createEmptyPartyInventory,
} from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import { addEntity, type GameState } from "./state";
import { createEmptyPartyWallet } from "./wallet";
import type { Companion } from "./types";

export function createInitialGameState(): GameState {
  const debugMap = createDebugMap();
  const leader: Companion = {
    ...createCompanion(
      companionIds[0],
      hubCompanionStartPositions[0],
      companionIds[0],
      "defender",
      0,
    ),
    state: "idle",
    currentTargetId: null,
  };
  const secondCompanion: Companion = {
    ...createCompanion(
      companionIds[1],
      hubCompanionStartPositions[1],
      companionIds[0],
      "fighter",
      1,
    ),
    state: "idle",
    currentTargetId: null,
  };
  const npcs = getHubNpcStartDataForQuestState().map((npc) =>
    createNpc(npc.id, npc.position, npc.displayName, npc.npcRole),
  );

  const initialState = [
    leader,
    secondCompanion,
    ...npcs,
    createTargetDummy(targetDummyId, targetDummyPosition),
    createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition),
  ].reduce(addEntity, {
    entities: {},
    inventory: createEmptyPartyInventory(),
    wallet: createEmptyPartyWallet(),
    map: debugMap,
    currentMapId: HUB_MAP_ID,
    activeTeleport: null,
    teleportStatesById: {},
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
    partyLeaderId: leader.id,
    partyIntent: null,
    leaderIntent: null,
    quests: createInitialQuestStates(),
    globalPoiIntent: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
    exploredTiles: {
      [`${leader.position.x},${leader.position.y}`]: true,
    },
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    combatProjectiles: [],
    skillMarksByEnemyId: {},
    skillSelfBuffsByCompanionId: {},
    skillPartyBuffsBySourceId: {},
    skillPartyPoisonCoatingsBySourceId: {},
    skillPartyClassBuffsByCompanionId: {},
    skillOverchargesByCompanionId: {},
    skillManaShieldsByCompanionId: {},
    skillFrostArmorsByCompanionId: {},
    skillLifestealBuffsByCompanionId: {},
    skillRewindRunesByCompanionId: {},
    skillRunicFocusByCompanionId: {},
    skillGatherBuffsByCompanionId: {},
    skillDamageMitigationsByCompanionId: {},
    skillAbsorbShieldsByCompanionId: {},
    skillSelfMitigationBuffsByCompanionId: {},
    skillPartyMitigationBuffsBySourceId: {},
    skillBindsByEnemyId: {},
    skillShieldBlocksById: {},
    statusEffectsById: {},
    skillCooldownsByCompanionId: {},
    globalCooldownsByCompanionId: {},
    skillVisualEvents: [],
    companionAoeChannelsByCasterId: {},
    dropVisualEvents: [],
  });

  return addItemToInventoryState(
    initialState,
    "training_sword",
    1,
    "debug",
  ).state;
}
