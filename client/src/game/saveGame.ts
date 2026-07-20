import { createDebugMapForQuestState, debugMapDefinitions } from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinitionForResourceType } from "./items";
import {
  getLevelGapXpModifier,
  getSameLevelEnemyXp,
  grantCharacterXpToCompanion,
} from "./leveling";
import { getPartyLeader } from "./partySystem";
import { sanitizeProgressionForCompanion } from "./skillProgression";
import { getSubzoneAtPosition } from "./subzoneSystem";
import type { GameState } from "./state";
import type {
  Companion,
  DebugMapId,
  GameEntity,
  ItemId,
  PartyMemberRole,
  ResourceLocation,
  ZoneSubzone,
} from "./types";

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
  skippedReason?: string;
};

type OfflineFarmingProfile = {
  enemyRatePerMinute: number;
  resourceRatePerMinute: number;
};

const WILD_MAP_IDS: DebugMapId[] = ["map-1", "map-2", "map-3", "map-4"];

const OFFLINE_FARMING_PROFILES: Record<string, OfflineFarmingProfile> = {
  "map-1:shore-fringe": { enemyRatePerMinute: 10, resourceRatePerMinute: 2.4 },
  "map-1:mossy-glade": { enemyRatePerMinute: 8, resourceRatePerMinute: 2.16 },
  "map-1:lower-shore": { enemyRatePerMinute: 6.5, resourceRatePerMinute: 1.92 },
  "map-2:south-center": { enemyRatePerMinute: 6, resourceRatePerMinute: 1.3 },
  "map-2:south-east": { enemyRatePerMinute: 5.5, resourceRatePerMinute: 1.9 },
  "map-2:north-east": { enemyRatePerMinute: 4.8, resourceRatePerMinute: 1.8 },
  "map-3:south-west": { enemyRatePerMinute: 4.2, resourceRatePerMinute: 1.2 },
  "map-3:north-west": { enemyRatePerMinute: 3.8, resourceRatePerMinute: 1.7 },
  "map-3:south-center": { enemyRatePerMinute: 3.5, resourceRatePerMinute: 1.7 },
  "map-4:north-center": { enemyRatePerMinute: 3.2, resourceRatePerMinute: 1.1 },
  "map-4:north-east": { enemyRatePerMinute: 3.2, resourceRatePerMinute: 1.6 },
  "map-4:south-east": { enemyRatePerMinute: 3, resourceRatePerMinute: 1.5 },
};

const COMBAT_ROLE_WEIGHTS: Record<PartyMemberRole, number> = {
  defender: 0.8,
  fighter: 1.2,
  support: 0.4,
  gatherer: 0.2,
  none: 0.2,
};

const SAFETY_ROLE_WEIGHTS: Record<PartyMemberRole, number> = {
  defender: 1.2,
  fighter: 0.5,
  support: 1,
  gatherer: 0.3,
  none: 0.2,
};

const GATHERING_ROLE_WEIGHTS: Record<PartyMemberRole, number> = {
  defender: 0.25,
  fighter: 0.2,
  support: 0.3,
  gatherer: 1.2,
  none: 0.15,
};

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

  return {
    ok: true,
    savedAtMs: validation.save.savedAtMs,
    state: sanitizeGameStateForSave({
      ...validation.save.state,
      currentMapId,
      map,
    }),
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
  const profile = getOfflineFarmingProfile(state.currentMapId, subzone?.id);

  if (!subzone || !profile) {
    return {
      state,
      summary: { ...baseSummary, skippedReason: "No offline farming profile matched the saved subzone." },
    };
  }

  const minutes = creditedMs / 60_000;
  const averageEnemyLevel = getAverageSubzoneEnemyLevel(subzone);
  const averagePartyLevel =
    livingCompanions.reduce((total, companion) => total + companion.characterLevel, 0) /
    livingCompanions.length;
  const levelRatio = clamp(averagePartyLevel / Math.max(1, averageEnemyLevel), 0.25, 1.5);
  const combatEfficiency = clamp(
    getRoleScore(livingCompanions, COMBAT_ROLE_WEIGHTS) * levelRatio / livingCompanions.length,
    0,
    1.25,
  );
  const safetyEfficiency = clamp(
    getRoleScore(livingCompanions, SAFETY_ROLE_WEIGHTS) * levelRatio / livingCompanions.length,
    0,
    1.1,
  );
  const gatherEfficiency = clamp(
    getRoleScore(livingCompanions, GATHERING_ROLE_WEIGHTS) * levelRatio,
    0,
    1.25,
  );
  const enemyKills = Math.floor(
    minutes * profile.enemyRatePerMinute * combatEfficiency * safetyEfficiency,
  );
  const resourceGathers = Math.floor(
    minutes * profile.resourceRatePerMinute * gatherEfficiency * safetyEfficiency,
  );

  let nextState = grantOfflineXp(state, livingCompanions, enemyKills, averageEnemyLevel);
  nextState = grantOfflineResources(nextState, subzone.resourceLocations, resourceGathers);

  const resourcesAdded = getInventoryDelta(state, nextState);
  const xpGranted = livingCompanions.reduce((total, companion) => {
    const nextCompanion = nextState.entities[companion.id];

    return total + (nextCompanion?.kind === "companion"
      ? nextCompanion.lastCharacterXpGained ?? 0
      : 0);
  }, 0);

  return {
    state: nextState,
    summary: {
      didApply: enemyKills > 0 || resourcesAdded.length > 0,
      creditedMs,
      mapId: state.currentMapId,
      subzoneId: subzone.id,
      subzoneName: subzone.displayName,
      enemyKills,
      xpGranted,
      resourcesAdded,
      skippedReason:
        enemyKills <= 0 && resourcesAdded.length === 0
          ? "The party did not earn offline rewards in this subzone."
          : undefined,
    },
  };
}

export function sanitizeGameStateForSave(state: GameState): GameState {
  const currentMapId = state.currentMapId ?? "hub";
  const map = createDebugMapForQuestState(currentMapId, state.quests);
  const entities = Object.fromEntries(
    Object.entries(state.entities).map(([id, entity]) => [id, sanitizeEntityForSave(entity, state.partyLeaderId)]),
  );
  const followTrailsByEntityId = Object.fromEntries(
    Object.keys(entities).map((entityId) => [entityId, []]),
  );

  return {
    ...state,
    entities,
    currentMapId,
    map,
    activeTeleport: null,
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
    hubDepartureFoodWarning: null,
    dropVisualEvents: [],
    slimewardDungeon: sanitizeSlimewardDungeon(state.slimewardDungeon),
    resurrectionProgressByCompanionId: {},
    resurrectionChannelsByHelperId: {},
    worldWipeRecovery: undefined,
    lastHealthRegenAtByCompanionId: {},
    lastTargetDummyRegenAtByEnemyId: {},
    debugTelemetry: undefined,
  };
}

function getOfflineFarmingProfile(
  mapId: DebugMapId,
  subzoneId: string | undefined,
): OfflineFarmingProfile | undefined {
  return subzoneId ? OFFLINE_FARMING_PROFILES[`${mapId}:${subzoneId}`] : undefined;
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

function getRoleScore(
  companions: Companion[],
  weights: Record<PartyMemberRole, number>,
): number {
  return companions.reduce(
    (total, companion) => total + weights[companion.role],
    0,
  );
}

function getAverageSubzoneEnemyLevel(subzone: ZoneSubzone): number {
  if (!subzone.enemyTypeIds || subzone.enemyTypeIds.length === 0) {
    return (subzone.levelRange.min + subzone.levelRange.max) / 2;
  }

  return Math.max(1, (subzone.levelRange.min + subzone.levelRange.max) / 2);
}

function grantOfflineXp(
  state: GameState,
  companions: Companion[],
  enemyKills: number,
  averageEnemyLevel: number,
): GameState {
  if (enemyKills <= 0) {
    return state;
  }

  const enemyLevel = Math.max(1, Math.round(averageEnemyLevel));
  const averageXp = getSameLevelEnemyXp(enemyLevel);
  let nextState = state;

  for (const companion of companions) {
    const xpModifier = getLevelGapXpModifier(companion.characterLevel, enemyLevel);
    const xpAmount = Math.floor(enemyKills * averageXp * xpModifier);

    if (xpAmount <= 0) {
      continue;
    }

    nextState = {
      ...nextState,
      entities: {
        ...nextState.entities,
        [companion.id]: grantCharacterXpToCompanion(companion, xpAmount),
      },
    };
  }

  return nextState;
}

function grantOfflineResources(
  state: GameState,
  resourceLocations: ResourceLocation[] | undefined,
  resourceGathers: number,
): GameState {
  if (!resourceLocations || resourceLocations.length === 0 || resourceGathers <= 0) {
    return state;
  }

  let nextState = state;

  for (let index = 0; index < resourceGathers; index += 1) {
    const resourceLocation = resourceLocations[index % resourceLocations.length];
    const itemDefinition = getItemDefinitionForResourceType(
      resourceLocation.resourceType,
      resourceLocation.tier ?? 1,
    );
    const itemAdd = addItemToInventoryState(
      nextState,
      itemDefinition.id,
      1,
      "gathering",
    );

    nextState = itemAdd.state;

    if (itemAdd.result.addedQuantity <= 0) {
      return nextState;
    }
  }

  return nextState;
}

function getInventoryDelta(
  previousState: GameState,
  nextState: GameState,
): OfflineFarmingResourceSummary[] {
  const previousCounts = getInventoryCounts(previousState);
  const nextCounts = getInventoryCounts(nextState);
  const added: OfflineFarmingResourceSummary[] = [];

  for (const [itemId, quantity] of Object.entries(nextCounts)) {
    const delta = quantity - (previousCounts[itemId as ItemId] ?? 0);

    if (delta > 0) {
      added.push({ itemId: itemId as ItemId, quantity: delta });
    }
  }

  return added;
}

function getInventoryCounts(state: GameState): Partial<Record<ItemId, number>> {
  const counts: Partial<Record<ItemId, number>> = {};

  for (const slot of state.inventory.slots) {
    counts[slot.itemId] = (counts[slot.itemId] ?? 0) + slot.quantity;
  }

  return counts;
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
      consumableBuffs: {
        flask: null,
        food: null,
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
