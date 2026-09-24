import {
  createDebugMapForQuestState,
  debugMapDefinitions,
  getHubNpcStartDataForQuestState,
  getHubTwoNpcStartDataForQuestState,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  slimewardCampNpcStartData,
  SLIMEWARD_CAMP_ID,
} from "./debugMap";
import {
  sanitizeBankAutoRoutingMode,
  sanitizePartyBank,
} from "./bank";
import { createNpc } from "./entities";
import { estimateCurrentPartyAfkCombat } from "./afkCombatEstimate";
import {
  estimateEnemyDropTableRewards,
  getLootTierForLevel,
} from "./dropTables";
import { getEnemyType } from "./enemyArchetypes";
import { SUPERIOR_ENEMY_CHANCE } from "./enemyVariants";
import { sanitizeGuildNoticeBoardState } from "./guildNoticeBoard";
import { addItemToInventoryState } from "./inventory";
import { sanitizeGuildRecruitState } from "./guildRecruit";
import { sanitizeGuildUpgradesState } from "./guildRecruitUpgrades";
import { sanitizeGuildSecondaryPartiesState } from "./guildSecondaryParties";
import { sanitizeFarmState, settleFarmState } from "./farm";
import {
  ensureInitialLivestockKeyItems,
  sanitizeLivestockState,
  settleLivestockState,
} from "./livestock";
import { sanitizeInnKitchenState } from "./innKitchen";
import { sanitizeInnUpgradesState } from "./innRoomUpgrades";
import { sanitizeWorldDiscoveryState } from "./worldDiscovery";
import { sanitizePartyInventory } from "./inventory";
import {
  getItemDefinition,
  getItemDefinitionForResourceType,
} from "./items";
import { sanitizeKeyItemsById } from "./keyItems";
import {
  grantCharacterXpToCompanion,
} from "./leveling";
import {
  getHighestCharacterLevelEver,
  getPartyLeader,
  recordHighestCharacterLevelEver,
} from "./partySystem";
import {
  createInitialQuestStates,
  QUEST_DEFINITIONS,
  QUEST_ORDER,
} from "./questSystem";
import { sanitizeProgressionForCompanion } from "./skillProgression";
import { getSubzoneAtPosition } from "./subzoneSystem";
import type { GameState } from "./state";
import type {
  Companion,
  DebugMapId,
  GameEntity,
  InventorySlot,
  ItemId,
  OfflineFarmingPendingLootState,
  PartyInventory,
  ZoneSubzone,
} from "./types";
import type { QuestId, QuestState, QuestStatus } from "./questTypes";

const OBSOLETE_FOOD_ITEM_IDS = new Set<string>([
  "hearty_trail_rations",
  "skirmisher_rations",
]);

export const SAVE_VERSION = 1;
export const MAX_OFFLINE_FARMING_MS = 30 * 60 * 1000;

export type SavedGame = {
  saveVersion: typeof SAVE_VERSION;
  savedAtMs: number;
  offlineFarmingBlockedReason?: string;
  state: GameState;
};

export type SaveValidationResult =
  | { ok: true; save: SavedGame }
  | { ok: false; reason: string };

export type RestoreSaveResult =
  | { ok: true; state: GameState; savedAtMs: number }
  | { ok: false; reason: string };

export type OfflineFarmingResourceSummary = {
  itemId: ItemId;
  quantity: number;
};

export type OfflineFarmingSummary = {
  didApply: boolean;
  creditedMs: number;
  mapId?: DebugMapId;
  subzoneId?: string;
  subzoneName?: string;
  enemyKills: number;
  xpGranted: number;
  resourcesAdded: OfflineFarmingResourceSummary[];
  lootAdded: OfflineFarmingResourceSummary[];
  pendingLoot: OfflineFarmingResourceSummary[];
  skippedReason?: string;
};

const WILD_MAP_IDS: DebugMapId[] = [
  "map-1",
  "map-2",
  "map-3",
  "map-4",
  "map-5",
  "map-6",
  "map-7",
];


export function createSavedGame(
  state: GameState,
  savedAtMs = Date.now(),
): SavedGame {
  return {
    saveVersion: SAVE_VERSION,
    savedAtMs,
    offlineFarmingBlockedReason: getSaveOfflineFarmingBlockedReason(state),
    state: sanitizeGameStateForSave(state),
  };
}

export function validateSavedGame(value: unknown): SaveValidationResult {
  if (!isRecord(value)) {
    return { ok: false, reason: "Save data is not an object." };
  }

  if (value.saveVersion !== SAVE_VERSION) {
    return { ok: false, reason: "Save version is not supported." };
  }

  if (!Number.isFinite(value.savedAtMs)) {
    return { ok: false, reason: "Save timestamp is invalid." };
  }

  if (!isRecord(value.state)) {
    return { ok: false, reason: "Save state is missing." };
  }

  const state = value.state as Partial<GameState>;

  if (!isRecord(state.entities)) {
    return { ok: false, reason: "Save entities are missing." };
  }

  if (
    state.restingCompanionsById !== undefined &&
    !isRecord(state.restingCompanionsById)
  ) {
    return { ok: false, reason: "Save resting companions are invalid." };
  }

  if (!isRecord(state.inventory) || !Array.isArray(state.inventory.slots)) {
    return { ok: false, reason: "Save inventory is invalid." };
  }

  if (!isRecord(state.wallet)) {
    return { ok: false, reason: "Save wallet is invalid." };
  }

  if (!isRecord(state.quests)) {
    return { ok: false, reason: "Save quests are invalid." };
  }

  if (typeof state.partyLeaderId !== "string") {
    return { ok: false, reason: "Save leader is invalid." };
  }

  if (!state.currentMapId || !(state.currentMapId in debugMapDefinitions)) {
    return { ok: false, reason: "Save map is invalid." };
  }

  return {
    ok: true,
    save: value as SavedGame,
  };
}

export function restoreGameStateFromSave(value: unknown): RestoreSaveResult {
  const validation = validateSavedGame(value);

  if (!validation.ok) {
    return validation;
  }

  const currentMapId = validation.save.state.currentMapId ?? "hub";
  const map = createDebugMapForQuestState(currentMapId, validation.save.state.quests);

  const sanitizedState = sanitizeGameStateForSave({
    ...validation.save.state,
    currentMapId,
    map,
  });
  const restoredAtMs = Date.now();

  return {
    ok: true,
    savedAtMs: validation.save.savedAtMs,
    state: settleLivestockState(
      settleFarmState(sanitizedState, restoredAtMs),
      restoredAtMs,
    ),
  };
}

export function applyOfflineFarmingProgress(
  state: GameState,
  savedAtMs: number,
  nowMs = Date.now(),
): { state: GameState; summary: OfflineFarmingSummary } {
  const elapsedMs = Math.max(0, nowMs - savedAtMs);
  const creditedMs = Math.min(elapsedMs, MAX_OFFLINE_FARMING_MS);
  const baseSummary: OfflineFarmingSummary = {
    didApply: false,
    creditedMs,
    enemyKills: 0,
    xpGranted: 0,
    resourcesAdded: [],
    lootAdded: [],
    pendingLoot: state.pendingOfflineFarmingLoot?.pendingLoot ?? [],
  };

  if (creditedMs < 60_000) {
    return {
      state,
      summary: { ...baseSummary, skippedReason: "Less than one minute offline." },
    };
  }

  if (!state.currentMapId || !WILD_MAP_IDS.includes(state.currentMapId)) {
    return {
      state,
      summary: { ...baseSummary, skippedReason: "Offline farming is only available in wild zones." },
    };
  }

  if (
    state.activeTeleport ||
    state.worldWipeRecovery ||
    Object.keys(state.resurrectionChannelsByHelperId ?? {}).length > 0 ||
    Object.keys(state.resurrectionProgressByCompanionId ?? {}).length > 0 ||
    state.slimewardDungeon?.chest?.isUiOpen
  ) {
    return {
      state,
      summary: { ...baseSummary, skippedReason: "Offline farming paused during active recovery or transition." },
    };
  }

  const leader = getPartyLeader(state);

  if (!leader || leader.state === "dead") {
    return {
      state,
      summary: { ...baseSummary, skippedReason: "No living leader was available." },
    };
  }

  const companions = Object.values(state.entities).filter(
    (entity): entity is Companion => entity.kind === "companion",
  );
  const livingCompanions = companions.filter((companion) => companion.state !== "dead");

  if (livingCompanions.length === 0) {
    return {
      state,
      summary: { ...baseSummary, skippedReason: "The party was defeated." },
    };
  }

  const subzone = getSubzoneAtPosition(state.map, leader.position);

  if (!subzone) {
    return {
      state,
      summary: { ...baseSummary, skippedReason: "No wild subzone matched the saved party position." },
    };
  }

  const minutes = creditedMs / 60_000;
  const estimate = estimateCurrentPartyAfkCombat(state);

  if (!estimate.available) {
    return {
      state,
      summary: { ...baseSummary, skippedReason: estimate.message },
    };
  }

  const durationHours = creditedMs / 3_600_000;
  const enemyKills = Math.floor(estimate.killsPerHour * durationHours);
  const xpPerCompanion = Math.floor(estimate.experiencePerMinute * minutes);
  const resourceGathers = Math.floor(estimate.resourceEstimatePerMinute * minutes);
  const resourceLoot = getOfflineResourceLoot(subzone, resourceGathers);
  const resourceItemIds = new Set(resourceLoot.map((slot) => slot.itemId));
  const monsterLoot = getOfflineMonsterDropLoot(estimate.enemyKillShares, durationHours);
  const rolledLoot = mergeInventorySlots([...resourceLoot, ...monsterLoot]);

  let nextState = grantOfflineXp(state, livingCompanions, xpPerCompanion);
  const collectionResult = collectOfflineLoot(nextState, rolledLoot);
  nextState = collectionResult.state;
  const resourcesAdded = filterLootByItemIds(
    collectionResult.collectedLoot,
    resourceItemIds,
  );
  const lootAdded = filterLootExcludingItemIds(
    collectionResult.collectedLoot,
    resourceItemIds,
  );
  const pendingLoot = collectionResult.pendingLoot;
  const xpGranted = livingCompanions.reduce((total, companion) => {
    const nextCompanion = nextState.entities[companion.id];

    return total + (nextCompanion?.kind === "companion"
      ? nextCompanion.lastCharacterXpGained ?? 0
      : 0);
  }, 0);
  const collectedLoot = collectionResult.collectedLoot;

  nextState = {
    ...nextState,
    pendingOfflineFarmingLoot: pendingLoot.length > 0
      ? {
          mapId: state.currentMapId,
          subzoneId: subzone.id,
          subzoneName: subzone.displayName,
          creditedMs,
          enemyKills,
          xpGranted,
          rolledLoot,
          collectedLoot,
          pendingLoot,
          createdAtMs: nowMs,
        }
      : null,
  };

  return {
    state: nextState,
    summary: {
      didApply:
        enemyKills > 0 ||
        resourcesAdded.length > 0 ||
        lootAdded.length > 0 ||
        pendingLoot.length > 0,
      creditedMs,
      mapId: state.currentMapId,
      subzoneId: subzone.id,
      subzoneName: subzone.displayName,
      enemyKills,
      xpGranted,
      resourcesAdded,
      lootAdded,
      pendingLoot,
      skippedReason:
        enemyKills <= 0 &&
        resourcesAdded.length === 0 &&
        lootAdded.length === 0 &&
        pendingLoot.length === 0
          ? "The party did not earn offline rewards in this subzone."
          : undefined,
    },
  };
}

export function claimPendingOfflineFarmingLoot(
  state: GameState,
  nowMs = Date.now(),
): { state: GameState; summary: OfflineFarmingSummary } {
  const pending = state.pendingOfflineFarmingLoot;
  const baseSummary: OfflineFarmingSummary = {
    didApply: false,
    creditedMs: pending?.creditedMs ?? 0,
    mapId: pending?.mapId,
    subzoneId: pending?.subzoneId,
    subzoneName: pending?.subzoneName,
    enemyKills: pending?.enemyKills ?? 0,
    xpGranted: pending?.xpGranted ?? 0,
    resourcesAdded: [],
    lootAdded: [],
    pendingLoot: pending?.pendingLoot ?? [],
  };

  if (!pending || pending.pendingLoot.length === 0) {
    return {
      state: {
        ...state,
        pendingOfflineFarmingLoot: null,
      },
      summary: {
        ...baseSummary,
        pendingLoot: [],
        skippedReason: "No pending AFK loot to claim.",
      },
    };
  }

  const collectionResult = collectOfflineLoot(state, pending.pendingLoot);
  const nextPendingLoot = collectionResult.pendingLoot;
  const collectedLoot = mergeInventorySlots([
    ...pending.collectedLoot,
    ...collectionResult.collectedLoot,
  ]);
  const nextState = {
    ...collectionResult.state,
    pendingOfflineFarmingLoot: nextPendingLoot.length > 0
      ? {
          ...pending,
          collectedLoot,
          pendingLoot: nextPendingLoot,
          createdAtMs: pending.createdAtMs || nowMs,
        }
      : null,
  };

  return {
    state: nextState,
    summary: {
      ...baseSummary,
      didApply: collectionResult.collectedLoot.length > 0,
      lootAdded: collectionResult.collectedLoot,
      pendingLoot: nextPendingLoot,
      skippedReason:
        collectionResult.collectedLoot.length === 0
          ? "Inventory is still full."
          : undefined,
    },
  };
}

export function sanitizeGameStateForSave(state: GameState): GameState {
  const currentMapId = state.currentMapId ?? "hub";
  const quests = sanitizeQuestStates(state.quests);
  const map = createDebugMapForQuestState(currentMapId, quests);
  const savedEntities = Object.fromEntries(
    Object.entries(state.entities).map(([id, entity]) => [id, sanitizeEntityForSave(entity, state.partyLeaderId)]),
  );
  const entities = restoreCurrentMapNpcs(savedEntities, currentMapId, quests);
  const restingCompanionsById = sanitizeRestingCompanionsForSave(
    state.restingCompanionsById,
    entities,
  );
  const followTrailsByEntityId = Object.fromEntries(
    Object.keys(entities).map((entityId) => [entityId, []]),
  );
  const highestCharacterLevelEver = getHighestCharacterLevelEver({
    ...state,
    entities,
    restingCompanionsById,
  });
  const guildUpgrades = sanitizeGuildUpgradesState(state.guildUpgrades);
  const innUpgrades = sanitizeInnUpgradesState(state.innUpgrades);
  const guildRecruit = sanitizeGuildRecruitState(state.guildRecruit, undefined, {
    ...state,
    guildUpgrades,
    innUpgrades,
  });
  const guildNoticeBoard = sanitizeGuildNoticeBoardState(
    state.guildNoticeBoard,
    undefined,
    {
      ...state,
      guildUpgrades,
    },
  );
  const guildSecondaryParties = sanitizeGuildSecondaryPartiesState(
    state.guildSecondaryParties,
    restingCompanionsById,
    {
      ...state,
      entities,
      restingCompanionsById,
      guildUpgrades,
      innUpgrades,
      currentMapId,
      map,
    },
  );
  const innKitchen = sanitizeInnKitchenState(state.innKitchen, {
    ...state,
    entities,
    restingCompanionsById,
  }, undefined, { settleHearthFire: false });
  const farm = sanitizeFarmState(state.farm);
  const livestock = sanitizeLivestockState(state.livestock);
  const worldDiscovery = sanitizeWorldDiscoveryState(
    state.worldDiscovery,
    {
      ...state,
      entities,
      currentMapId,
      map,
    },
  );

  return {
    ...state,
    entities,
    restingCompanionsById,
    highestCharacterLevelEver,
    guildRecruit,
    guildUpgrades,
    guildNoticeBoard,
    guildSecondaryParties,
    innUpgrades,
    innKitchen,
    farm,
    livestock,
    worldDiscovery,
    inventory: sanitizeObsoleteFoodFromInventory(
      sanitizePartyInventory(state.inventory),
    ),
    keyItemsById: sanitizeKeyItemsById(
      ensureInitialLivestockKeyItems(state.keyItemsById),
    ),
    bank: {
      ...sanitizePartyBank(state.bank),
      autoRoutingMode: sanitizeBankAutoRoutingMode(
        state.bank?.autoRoutingMode,
      ),
    },
    currentMapId,
    map,
    quests,
    activeTeleport: null,
    autoCombatOnArrivalEnabled: Boolean(state.autoCombatOnArrivalEnabled),
    autoRoute: undefined,
    partyIntent: null,
    leaderIntent: null,
    directCompanionCommandsById: {},
    directCommandGraceUntilByCompanionId: {},
    interruptedPoiTarget: null,
    globalPoiIntent: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
    followTrailsByEntityId,
    lastPositionsByEntityId: {},
    failedMoveByEntityId: {},
    movementFailureMsByEntityId: {},
    movementFailuresByEntityId: {},
    movementPathRetryAtMsByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
    movementPathsByEntityId: {},
    attackSlotCacheByEntityId: {},
    movementDecisionsByEntityId: {},
    defenderWaitTicksByLeaderId: {},
    defenderBlockedTicksByEntityId: {},
    defenderWaitMsByLeaderId: {},
    defenderBlockedMsByEntityId: {},
    partyFormation: undefined,
    combatFeedbackEvents: [],
    combatProjectiles: [],
    autonomousTargetSuppressionsByEnemyId: undefined,
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
    lastCompanionDamageTakenAtByCompanionId: {},
    skillVisualEvents: [],
    companionAoeChannelsByCasterId: {},
    enemyAoeChannelsByCasterId: {},
    enemyAoeCooldownsByCasterId: {},
    consumableUsesByCompanionId: {},
    dropVisualEvents: [],
    pendingOfflineFarmingLoot: sanitizePendingOfflineFarmingLoot(
      state.pendingOfflineFarmingLoot,
      currentMapId,
    ),
    newsBroadcasts: [],
    slimewardDungeon: sanitizeSlimewardDungeon(state.slimewardDungeon),
    resurrectionProgressByCompanionId: {},
    resurrectionChannelsByHelperId: {},
    worldWipeRecovery: undefined,
    lastHealthRegenAtByCompanionId: {},
    lastTargetDummyRegenAtByEnemyId: {},
    debugTelemetry: undefined,
  };
}

function sanitizeQuestStates(
  quests: Partial<Record<QuestId, QuestState>>,
): Record<QuestId, QuestState> {
  const initialQuests = createInitialQuestStates();
  const didSaveHaveSmithQuest = Boolean(quests.smiths_first_work);
  const sanitizedEntries = QUEST_ORDER.map((questId) => {
    const definition = QUEST_DEFINITIONS[questId];
    const fallbackQuest = initialQuests[questId];
    const savedQuest = quests[questId];
    const status = sanitizeQuestStatus(savedQuest?.status, fallbackQuest.status);
    const objectiveProgress = Object.fromEntries(
      definition.objectives.map((objective) => {
        const requiredCount = objective.requiredCount ?? 1;
        const savedProgress = isRecord(savedQuest?.objectiveProgress)
          ? savedQuest?.objectiveProgress[objective.id]
          : undefined;
        const shouldCompleteMissingObjective =
          (status === "ready_to_turn_in" || status === "completed") &&
          !savedProgress;
        const savedCurrentCount = savedProgress?.currentCount;
        const currentCount =
          typeof savedCurrentCount === "number" &&
          Number.isFinite(savedCurrentCount)
          ? Math.min(
              requiredCount,
              Math.max(0, Math.floor(savedCurrentCount)),
            )
          : shouldCompleteMissingObjective
            ? requiredCount
            : 0;
        const completed = Boolean(savedProgress?.completed) ||
          shouldCompleteMissingObjective ||
          currentCount >= requiredCount;

        return [
          objective.id,
          {
            objectiveId: objective.id,
            currentCount,
            completed,
          },
        ];
      }),
    );

    return [
      questId,
      {
        ...fallbackQuest,
        ...savedQuest,
        questId,
        status,
        completedCycle: Number.isFinite(savedQuest?.completedCycle)
          ? Math.max(0, Math.floor(savedQuest?.completedCycle ?? 0))
          : fallbackQuest.completedCycle,
        rewardClaimedCycle:
          savedQuest?.rewardClaimedCycle === null ||
          Number.isFinite(savedQuest?.rewardClaimedCycle)
            ? savedQuest?.rewardClaimedCycle === null
              ? null
              : Math.max(0, Math.floor(savedQuest?.rewardClaimedCycle ?? 0))
            : fallbackQuest.rewardClaimedCycle,
        objectiveProgress,
      },
    ];
  });
  const sanitizedQuests = Object.fromEntries(sanitizedEntries) as Record<
    QuestId,
    QuestState
  >;

  if (!didSaveHaveSmithQuest) {
    const outfitStatus = sanitizedQuests.outfit_the_expedition.status;
    const stolenStatus = quests.stolen_field_supplies?.status;

    if (outfitStatus === "completed" && stolenStatus && stolenStatus !== "locked") {
      sanitizedQuests.smiths_first_work = completeSanitizedQuest(
        sanitizedQuests.smiths_first_work,
      );
    } else if (
      outfitStatus === "completed" &&
      sanitizedQuests.smiths_first_work.status === "locked"
    ) {
      sanitizedQuests.smiths_first_work = {
        ...sanitizedQuests.smiths_first_work,
        status: "available",
      };
    }
  }

  return sanitizedQuests;
}

function sanitizeQuestStatus(
  status: QuestStatus | undefined,
  fallback: QuestStatus,
): QuestStatus {
  return status === "locked" ||
    status === "available" ||
    status === "active" ||
    status === "ready_to_turn_in" ||
    status === "completed"
    ? status
    : fallback;
}

function completeSanitizedQuest(quest: QuestState): QuestState {
  const definition = QUEST_DEFINITIONS[quest.questId];

  return {
    ...quest,
    status: "completed",
    completedCycle: Math.max(1, quest.completedCycle),
    rewardClaimedCycle: Math.max(1, quest.rewardClaimedCycle ?? 0),
    objectiveProgress: Object.fromEntries(
      definition.objectives.map((objective) => {
        const requiredCount = objective.requiredCount ?? 1;

        return [
          objective.id,
          {
            objectiveId: objective.id,
            currentCount: requiredCount,
            completed: true,
          },
        ];
      }),
    ),
  };
}

function getSaveOfflineFarmingBlockedReason(state: GameState): string | undefined {
  if (state.activeTeleport) {
    return "Offline farming paused during active travel.";
  }

  if (state.worldWipeRecovery) {
    return "Offline farming paused during recovery.";
  }

  if (
    Object.keys(state.resurrectionChannelsByHelperId ?? {}).length > 0 ||
    Object.keys(state.resurrectionProgressByCompanionId ?? {}).length > 0
  ) {
    return "Offline farming paused during resurrection.";
  }

  if (state.slimewardDungeon?.chest?.isUiOpen) {
    return "Offline farming paused while dungeon chest loot was open.";
  }

  return undefined;
}

function grantOfflineXp(
  state: GameState,
  companions: Companion[],
  xpAmount: number,
): GameState {
  if (xpAmount <= 0) {
    return state;
  }

  let nextState = state;

  for (const companion of companions) {
    const updatedCompanion = grantCharacterXpToCompanion(companion, xpAmount);

    nextState = {
      ...nextState,
      entities: {
        ...nextState.entities,
        [companion.id]: updatedCompanion,
      },
    };
    nextState = recordHighestCharacterLevelEver(
      nextState,
      updatedCompanion.characterLevel,
    );
  }

  return nextState;
}

function getOfflineResourceLoot(
  subzone: ZoneSubzone,
  resourceGathers: number,
): InventorySlot[] {
  if (subzone.resourceLocations.length === 0 || resourceGathers <= 0) {
    return [];
  }

  const loot: InventorySlot[] = [];

  for (let index = 0; index < resourceGathers; index += 1) {
    const resourceLocation =
      subzone.resourceLocations[index % subzone.resourceLocations.length];
    const itemDefinition = getItemDefinitionForResourceType(
      resourceLocation.resourceType,
      resourceLocation.tier ?? 1,
    );

    loot.push({ itemId: itemDefinition.id, quantity: 1 });
  }

  return mergeInventorySlots(loot);
}

function getOfflineMonsterDropLoot(
  enemyKillShares: Array<{ enemyTypeId: ItemId | string; level: number; killsPerHour: number }>,
  durationHours: number,
): InventorySlot[] {
  const loot: InventorySlot[] = [];

  for (const share of enemyKillShares) {
    const enemyTypeId = share.enemyTypeId as Parameters<typeof getEnemyType>[0];
    const enemyType = getEnemyType(enemyTypeId);

    if (!enemyType) {
      continue;
    }

    const tier = getLootTierForLevel(share.level);
    const kills = share.killsPerHour * durationHours;
    const superiorKills = kills * SUPERIOR_ENEMY_CHANCE;
    const normalKills = Math.max(0, kills - superiorKills);

    loot.push(
      ...estimateEnemyDropTableRewards(
        enemyType.archetypeId,
        tier,
        normalKills,
        Math.random,
        enemyTypeId,
      ),
      ...estimateEnemyDropTableRewards(
        enemyType.archetypeId,
        tier,
        superiorKills,
        Math.random,
        enemyTypeId,
        "superior",
      ),
    );
  }

  return mergeInventorySlots(loot);
}

function collectOfflineLoot(
  state: GameState,
  loot: InventorySlot[],
): { state: GameState; collectedLoot: InventorySlot[]; pendingLoot: InventorySlot[] } {
  let nextState = state;
  const collectedLoot: InventorySlot[] = [];
  const pendingLoot: InventorySlot[] = [];

  for (const slot of loot) {
    const itemAdd = addItemToInventoryState(
      nextState,
      slot.itemId,
      slot.quantity,
      "combat_loot",
    );
    nextState = itemAdd.state;

    if (itemAdd.result.addedQuantity > 0) {
      collectedLoot.push({
        itemId: slot.itemId,
        quantity: itemAdd.result.addedQuantity,
      });
    }

    if (itemAdd.result.overflowQuantity > 0) {
      pendingLoot.push({
        itemId: slot.itemId,
        quantity: itemAdd.result.overflowQuantity,
      });
    }
  }

  return {
    state: nextState,
    collectedLoot: mergeInventorySlots(collectedLoot),
    pendingLoot: mergeInventorySlots(pendingLoot),
  };
}

function filterLootByItemIds(
  loot: InventorySlot[],
  itemIds: Set<ItemId>,
): OfflineFarmingResourceSummary[] {
  return loot
    .filter((slot) => itemIds.has(slot.itemId))
    .map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity }));
}

function filterLootExcludingItemIds(
  loot: InventorySlot[],
  itemIds: Set<ItemId>,
): OfflineFarmingResourceSummary[] {
  return loot
    .filter((slot) => !itemIds.has(slot.itemId))
    .map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity }));
}

function mergeInventorySlots(slots: InventorySlot[]): InventorySlot[] {
  const quantitiesByItemId = new Map<ItemId, number>();

  for (const slot of slots) {
    quantitiesByItemId.set(
      slot.itemId,
      (quantitiesByItemId.get(slot.itemId) ?? 0) + slot.quantity,
    );
  }

  return [...quantitiesByItemId.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

function sanitizePendingOfflineFarmingLoot(
  pending: OfflineFarmingPendingLootState | null | undefined,
  fallbackMapId: DebugMapId,
): OfflineFarmingPendingLootState | null {
  if (!pending || !Array.isArray(pending.pendingLoot)) {
    return null;
  }

  const pendingLoot = sanitizeInventorySlotList(pending.pendingLoot);

  if (pendingLoot.length === 0) {
    return null;
  }

  return {
    mapId: pending.mapId && pending.mapId in debugMapDefinitions
      ? pending.mapId
      : fallbackMapId,
    subzoneId: typeof pending.subzoneId === "string" ? pending.subzoneId : undefined,
    subzoneName: typeof pending.subzoneName === "string" ? pending.subzoneName : undefined,
    creditedMs: sanitizeNonNegativeNumber(pending.creditedMs),
    enemyKills: sanitizeNonNegativeNumber(pending.enemyKills),
    xpGranted: sanitizeNonNegativeNumber(pending.xpGranted),
    rolledLoot: sanitizeInventorySlotList(pending.rolledLoot),
    collectedLoot: sanitizeInventorySlotList(pending.collectedLoot),
    pendingLoot,
    createdAtMs: sanitizeNonNegativeNumber(pending.createdAtMs),
  };
}

function sanitizeInventorySlotList(slots: unknown): InventorySlot[] {
  if (!Array.isArray(slots)) {
    return [];
  }

  return mergeInventorySlots(
    slots.flatMap((slot) => {
      if (!isRecord(slot) || typeof slot.itemId !== "string") {
        return [];
      }

      const itemId = slot.itemId as ItemId;
      const quantity = sanitizeNonNegativeNumber(slot.quantity);

      return quantity > 0 && getItemDefinition(itemId)
        ? [{ itemId, quantity }]
        : [];
    }),
  );
}

function sanitizeNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function sanitizeEntityForSave(entity: GameEntity, leaderId: string): GameEntity {
  if (entity.kind === "companion") {
    const isLeader = entity.id === leaderId;

    const sanitizedCompanion = sanitizeProgressionForCompanion(entity);

    return {
      ...sanitizedCompanion,
      state: entity.state === "dead" ? "dead" : isLeader ? "idle" : "follow",
      currentTargetId: entity.state === "dead" || isLeader ? null : leaderId,
      commandPriority: "autonomous",
      defendPosition: null,
      consumables: {
        flask: sanitizedCompanion.consumables.flask,
      },
      consumableBuffs: {
        flask: null,
      },
    };
  }

  if (entity.kind === "enemy") {
    return {
      ...entity,
      state: entity.state === "dead" ? "dead" : "idle",
      currentTargetId: null,
    };
  }

  return entity;
}

function restoreCurrentMapNpcs(
  entities: Record<string, GameEntity>,
  currentMapId: DebugMapId,
  quests: GameState["quests"],
): Record<string, GameEntity> {
  const npcStartData =
    currentMapId === HUB_MAP_ID
      ? getHubNpcStartDataForQuestState(quests)
      : currentMapId === HUB_TWO_MAP_ID
        ? getHubTwoNpcStartDataForQuestState(quests)
      : currentMapId === SLIMEWARD_CAMP_ID
        ? slimewardCampNpcStartData
        : [];

  if (npcStartData.length === 0) {
    return entities;
  }

  let nextEntities = entities;

  for (const npc of npcStartData) {
    if (nextEntities[npc.id] !== undefined) {
      continue;
    }

    nextEntities = {
      ...nextEntities,
      [npc.id]: createNpc(npc.id, npc.position, npc.displayName, npc.npcRole),
    };
  }

  return nextEntities;
}

function sanitizeRestingCompanionsForSave(
  restingCompanionsById: GameState["restingCompanionsById"],
  activeEntities: Record<string, GameEntity>,
): GameState["restingCompanionsById"] {
  return Object.fromEntries(
    Object.entries(restingCompanionsById ?? {})
      .filter(
        ([companionId, companion]) =>
          activeEntities[companionId] === undefined &&
          isSavedCompanion(companion),
      )
      .map(([companionId, companion]) => {
        const sanitizedCompanion = sanitizeProgressionForCompanion(companion);

        return [
          companionId,
          {
            ...sanitizedCompanion,
            state: "idle",
            currentTargetId: null,
            commandPriority: "autonomous",
            defendPosition: null,
            consumables: {
              flask: sanitizedCompanion.consumables.flask,
            },
            consumableBuffs: {
              flask: null,
            },
          },
        ];
      }),
  );
}

function sanitizeObsoleteFoodFromInventory(inventory: PartyInventory): PartyInventory {
  return {
    ...inventory,
    slots: inventory.slots.filter(
      (slot) => !OBSOLETE_FOOD_ITEM_IDS.has(slot.itemId),
    ),
  };
}

function isSavedCompanion(value: unknown): value is Companion {
  return (
    isRecord(value) &&
    value.kind === "companion" &&
    typeof value.id === "string" &&
    Number.isFinite(value.characterLevel)
  );
}

function sanitizeSlimewardDungeon(
  slimewardDungeon: GameState["slimewardDungeon"],
): GameState["slimewardDungeon"] {
  if (!slimewardDungeon) {
    return slimewardDungeon;
  }

  return {
    chest: slimewardDungeon?.chest
      ? {
          ...slimewardDungeon.chest,
          isUiOpen: false,
          autoContinueAtMs: undefined,
        }
      : null,
    azureMass: slimewardDungeon?.azureMass
      ? {
          triggeredPhaseThresholds: [
            ...slimewardDungeon.azureMass.triggeredPhaseThresholds,
          ],
          fleeUntilMs: undefined,
        }
      : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
