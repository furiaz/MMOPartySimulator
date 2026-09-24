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
import { createInitialWorldDiscoveryState } from "./worldDiscovery";
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
    restingCompanionsById: {},
    highestCharacterLevelEver: Math.max(
      leader.characterLevel,
      secondCompanion.characterLevel,
    ),
    guildRecruit: createInitialGuildRecruitState(),
    guildUpgrades: createInitialGuildUpgradesState(),
    guildNoticeBoard: createInitialGuildNoticeBoardState(),
    guildSecondaryParties: createInitialGuildSecondaryPartiesState(),
    innUpgrades: createInitialInnUpgradesState(),
    innKitchen: createInitialInnKitchenState(),
    farm: createInitialFarmState(),
    livestock: createInitialLivestockState(),
    worldDiscovery: createInitialWorldDiscoveryState(),
    inventory: createEmptyPartyInventory(),
    keyItemsById: {
      [LIVESTOCK_DUSKHEN_DISCOVERY_KEY_ITEM_ID]: 1,
    },
    bank: createEmptyPartyBank(),
    wallet: createEmptyPartyWallet(),
    map: debugMap,
    currentMapId: HUB_MAP_ID,
    activeTeleport: null,
    teleportStatesById: {},
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
    duelistsMomentumByCompanionId: {},
    riposteTrainingByCompanionId: {},
    rootedBastionByCompanionId: {},
    headhunterByCompanionId: {},
    arcaneCrescendoByCompanionId: {},
    wordResonanceByCompanionId: {},
    manyBeaconsByCompanionId: {},
    cruelMercyByCompanionId: {},
    overflowingGraceBarriersByCompanionId: {},
    skillSelfBuffsByCompanionId: {},
    skillPartyBuffsBySourceId: {},
    skillPartyPoisonCoatingsBySourceId: {},
    skillPartyClassBuffsByCompanionId: {},
    skillOverchargesByCompanionId: {},
    skillManaShieldsByCompanionId: {},
    skillFrostArmorsByCompanionId: {},
    skillHealOverTimesByCompanionId: {},
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
    pendingOfflineFarmingLoot: null,
    newsBroadcasts: [],
    lastCompanionDamageTakenAtByCompanionId: {},
  });

  return addItemToInventoryState(
    initialState,
    "training_sword",
    1,
    "debug",
  ).state;
}
