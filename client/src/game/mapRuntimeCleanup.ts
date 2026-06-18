import type { GameState } from "./state";
import type { PartyFormationState } from "./types";

function createIdlePartyFormation(): PartyFormationState {
  return {
    phase: "idle",
    targetId: null,
    approachPoint: null,
    direction: { x: 0, y: 0 },
    slotsByEntityId: {},
    slotReasonsByEntityId: {},
    skippedTargetIds: [],
  };
}

export function clearMapTransitionRuntimeState(state: GameState): GameState {
  return {
    ...state,
    activeTeleport: null,
    directCompanionCommandsById: {},
    directCommandGraceUntilByCompanionId: {},
    interruptedPoiTarget: null,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    combatProjectiles: [],
    failedMoveByEntityId: {},
    movementFailureMsByEntityId: {},
    movementFailuresByEntityId: {},
    movementPathRetryAtMsByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
    movementPathsByEntityId: {},
    attackSlotCacheByEntityId: {},
    movementDecisionsByEntityId: {},
    lastPositionsByEntityId: {},
    defenderWaitTicksByLeaderId: {},
    defenderBlockedTicksByEntityId: {},
    defenderWaitMsByLeaderId: {},
    defenderBlockedMsByEntityId: {},
    globalCooldownsByCompanionId: {},
    skillVisualEvents: [],
    companionAoeChannelsByCasterId: {},
    enemyAoeChannelsByCasterId: {},
    enemyAoeCooldownsByCasterId: {},
    flaskRechargeCountedEnemyDefeats: {},
    lastHealthRegenAtByCompanionId: {},
    lastTargetDummyRegenAtByEnemyId: {},
    dropVisualEvents: [],
    resurrectionProgressByCompanionId: {},
    resurrectionChannelsByHelperId: {},
    skillBindsByEnemyId: {},
    skillMarksByEnemyId: {},
    skillSelfBuffsByCompanionId: {},
    skillPartyBuffsBySourceId: {},
    skillPartyPoisonCoatingsBySourceId: {},
    skillPartyClassBuffsByCompanionId: {},
    skillOverchargesByCompanionId: {},
    skillManaShieldsByCompanionId: {},
    skillFrostArmorsByCompanionId: {},
    skillLifestealBuffsByCompanionId: {},
    skillGatherBuffsByCompanionId: {},
    skillDamageMitigationsByCompanionId: {},
    skillAbsorbShieldsByCompanionId: {},
    skillSelfMitigationBuffsByCompanionId: {},
    skillPartyMitigationBuffsBySourceId: {},
    skillShieldBlocksById: {},
    statusEffectsById: {},
    partyFormation: createIdlePartyFormation(),
  };
}

export function pruneMissingEntityRuntimeState(state: GameState): GameState {
  const currentEntityIds = new Set(Object.keys(state.entities));
  const followTrailsByEntityId =
    pruneRecordById(state.followTrailsByEntityId, currentEntityIds) ??
    state.followTrailsByEntityId;
  const failedMoveByEntityId = pruneRecordById(state.failedMoveByEntityId, currentEntityIds);
  const movementFailureMsByEntityId = pruneRecordById(
    state.movementFailureMsByEntityId,
    currentEntityIds,
  );
  const movementFailuresByEntityId = pruneRecordById(
    state.movementFailuresByEntityId,
    currentEntityIds,
  );
  const movementPathRetryAtMsByEntityId = pruneRecordById(
    state.movementPathRetryAtMsByEntityId,
    currentEntityIds,
  );
  const moveIntentsByEntityId = pruneRecordById(state.moveIntentsByEntityId, currentEntityIds);
  const reservedPositionsByEntityId = pruneRecordById(
    state.reservedPositionsByEntityId,
    currentEntityIds,
  );
  const movementPathsByEntityId = pruneRecordById(
    state.movementPathsByEntityId,
    currentEntityIds,
  );
  const attackSlotCacheByEntityId = pruneRecordById(
    state.attackSlotCacheByEntityId,
    currentEntityIds,
  );
  const movementDecisionsByEntityId = pruneRecordById(
    state.movementDecisionsByEntityId,
    currentEntityIds,
  );
  const lastPositionsByEntityId = pruneRecordById(
    state.lastPositionsByEntityId,
    currentEntityIds,
  );
  const skillMarksByEnemyId = pruneRecordById(state.skillMarksByEnemyId, currentEntityIds);
  const skillSelfBuffsByCompanionId = pruneRecordById(
    state.skillSelfBuffsByCompanionId,
    currentEntityIds,
  );
  const skillPartyBuffsBySourceId = pruneRecordById(
    state.skillPartyBuffsBySourceId,
    currentEntityIds,
  );
  const skillPartyPoisonCoatingsBySourceId = pruneRecordById(
    state.skillPartyPoisonCoatingsBySourceId,
    currentEntityIds,
  );
  const skillPartyClassBuffsByCompanionId = pruneRecordById(
    state.skillPartyClassBuffsByCompanionId,
    currentEntityIds,
  );
  const skillOverchargesByCompanionId = pruneRecordById(
    state.skillOverchargesByCompanionId,
    currentEntityIds,
  );
  const skillManaShieldsByCompanionId = pruneRecordById(
    state.skillManaShieldsByCompanionId,
    currentEntityIds,
  );
  const skillFrostArmorsByCompanionId = pruneRecordById(
    state.skillFrostArmorsByCompanionId,
    currentEntityIds,
  );
  const skillLifestealBuffsByCompanionId = pruneRecordById(
    state.skillLifestealBuffsByCompanionId,
    currentEntityIds,
  );
  const skillGatherBuffsByCompanionId = pruneRecordById(
    state.skillGatherBuffsByCompanionId,
    currentEntityIds,
  );
  const skillDamageMitigationsByCompanionId = pruneRecordById(
    state.skillDamageMitigationsByCompanionId,
    currentEntityIds,
  );
  const skillAbsorbShieldsByCompanionId = pruneRecordById(
    state.skillAbsorbShieldsByCompanionId,
    currentEntityIds,
  );
  const skillSelfMitigationBuffsByCompanionId = pruneRecordById(
    state.skillSelfMitigationBuffsByCompanionId,
    currentEntityIds,
  );
  const skillPartyMitigationBuffsBySourceId = pruneRecordById(
    state.skillPartyMitigationBuffsBySourceId,
    currentEntityIds,
  );
  const skillBindsByEnemyId = pruneRecordById(state.skillBindsByEnemyId, currentEntityIds);
  const statusEffectsById = pruneStatusEffectsByEntityId(
    state.statusEffectsById,
    currentEntityIds,
  );
  const skillCooldownsByCompanionId = pruneRecordById(
    state.skillCooldownsByCompanionId,
    currentEntityIds,
  );
  const globalCooldownsByCompanionId = pruneRecordById(
    state.globalCooldownsByCompanionId,
    currentEntityIds,
  );
  const enemyAoeCooldownsByCasterId = pruneRecordById(
    state.enemyAoeCooldownsByCasterId,
    currentEntityIds,
  );
  const companionAoeChannelsByCasterId = pruneRecordById(
    state.companionAoeChannelsByCasterId,
    currentEntityIds,
  );
  const flaskRechargeCountedEnemyDefeats = pruneRecordById(
    state.flaskRechargeCountedEnemyDefeats,
    currentEntityIds,
  );
  const lastHealthRegenAtByCompanionId = pruneRecordById(
    state.lastHealthRegenAtByCompanionId,
    currentEntityIds,
  );
  const lastTargetDummyRegenAtByEnemyId = pruneRecordById(
    state.lastTargetDummyRegenAtByEnemyId,
    currentEntityIds,
  );
  const resurrectionProgressByCompanionId = pruneRecordById(
    state.resurrectionProgressByCompanionId,
    currentEntityIds,
  );
  const resurrectionChannelsByHelperId = pruneRecordById(
    state.resurrectionChannelsByHelperId,
    currentEntityIds,
  );

  if (
    followTrailsByEntityId === state.followTrailsByEntityId &&
    failedMoveByEntityId === state.failedMoveByEntityId &&
    movementFailureMsByEntityId === state.movementFailureMsByEntityId &&
    movementFailuresByEntityId === state.movementFailuresByEntityId &&
    movementPathRetryAtMsByEntityId === state.movementPathRetryAtMsByEntityId &&
    moveIntentsByEntityId === state.moveIntentsByEntityId &&
    reservedPositionsByEntityId === state.reservedPositionsByEntityId &&
    movementPathsByEntityId === state.movementPathsByEntityId &&
    attackSlotCacheByEntityId === state.attackSlotCacheByEntityId &&
    movementDecisionsByEntityId === state.movementDecisionsByEntityId &&
    lastPositionsByEntityId === state.lastPositionsByEntityId &&
    skillMarksByEnemyId === state.skillMarksByEnemyId &&
    skillSelfBuffsByCompanionId === state.skillSelfBuffsByCompanionId &&
    skillPartyBuffsBySourceId === state.skillPartyBuffsBySourceId &&
    skillPartyPoisonCoatingsBySourceId ===
      state.skillPartyPoisonCoatingsBySourceId &&
    skillPartyClassBuffsByCompanionId ===
      state.skillPartyClassBuffsByCompanionId &&
    skillOverchargesByCompanionId === state.skillOverchargesByCompanionId &&
    skillManaShieldsByCompanionId === state.skillManaShieldsByCompanionId &&
    skillFrostArmorsByCompanionId === state.skillFrostArmorsByCompanionId &&
    skillLifestealBuffsByCompanionId === state.skillLifestealBuffsByCompanionId &&
    skillGatherBuffsByCompanionId === state.skillGatherBuffsByCompanionId &&
    skillDamageMitigationsByCompanionId === state.skillDamageMitigationsByCompanionId &&
    skillAbsorbShieldsByCompanionId === state.skillAbsorbShieldsByCompanionId &&
    skillSelfMitigationBuffsByCompanionId === state.skillSelfMitigationBuffsByCompanionId &&
    skillPartyMitigationBuffsBySourceId === state.skillPartyMitigationBuffsBySourceId &&
    skillBindsByEnemyId === state.skillBindsByEnemyId &&
    statusEffectsById === state.statusEffectsById &&
    skillCooldownsByCompanionId === state.skillCooldownsByCompanionId &&
    globalCooldownsByCompanionId === state.globalCooldownsByCompanionId &&
    companionAoeChannelsByCasterId === state.companionAoeChannelsByCasterId &&
    enemyAoeCooldownsByCasterId === state.enemyAoeCooldownsByCasterId &&
    flaskRechargeCountedEnemyDefeats === state.flaskRechargeCountedEnemyDefeats &&
    lastHealthRegenAtByCompanionId === state.lastHealthRegenAtByCompanionId &&
    lastTargetDummyRegenAtByEnemyId === state.lastTargetDummyRegenAtByEnemyId &&
    resurrectionProgressByCompanionId === state.resurrectionProgressByCompanionId &&
    resurrectionChannelsByHelperId === state.resurrectionChannelsByHelperId
  ) {
    return state;
  }

  return {
    ...state,
    followTrailsByEntityId,
    failedMoveByEntityId,
    movementFailureMsByEntityId,
    movementFailuresByEntityId,
    movementPathRetryAtMsByEntityId,
    moveIntentsByEntityId,
    reservedPositionsByEntityId,
    movementPathsByEntityId,
    attackSlotCacheByEntityId,
    movementDecisionsByEntityId,
    lastPositionsByEntityId,
    skillMarksByEnemyId,
    skillSelfBuffsByCompanionId,
    skillPartyBuffsBySourceId,
    skillPartyPoisonCoatingsBySourceId,
    skillPartyClassBuffsByCompanionId,
    skillOverchargesByCompanionId,
    skillManaShieldsByCompanionId,
    skillFrostArmorsByCompanionId,
    skillLifestealBuffsByCompanionId,
    skillGatherBuffsByCompanionId,
    skillDamageMitigationsByCompanionId,
    skillAbsorbShieldsByCompanionId,
    skillSelfMitigationBuffsByCompanionId,
    skillPartyMitigationBuffsBySourceId,
    skillBindsByEnemyId,
    statusEffectsById,
    skillCooldownsByCompanionId,
    globalCooldownsByCompanionId,
    companionAoeChannelsByCasterId,
    enemyAoeCooldownsByCasterId,
    flaskRechargeCountedEnemyDefeats,
    lastHealthRegenAtByCompanionId,
    lastTargetDummyRegenAtByEnemyId,
    resurrectionProgressByCompanionId,
    resurrectionChannelsByHelperId,
  };
}

function pruneRecordById<T>(
  record: Record<string, T> | undefined,
  currentEntityIds: Set<string>,
): Record<string, T> | undefined {
  if (!record) {
    return record;
  }

  let nextRecord: Record<string, T> | undefined;

  for (const [id, value] of Object.entries(record)) {
    if (currentEntityIds.has(id)) {
      if (nextRecord) {
        nextRecord[id] = value;
      }
      continue;
    }

    nextRecord = nextRecord ?? copyCurrentEntries(record, currentEntityIds);
    delete nextRecord[id];
  }

  return nextRecord ?? record;
}

function pruneStatusEffectsByEntityId<T extends { targetId: string; sourceId?: string }>(
  record: Record<string, T> | undefined,
  currentEntityIds: Set<string>,
): Record<string, T> | undefined {
  if (!record) {
    return record;
  }

  let didPrune = false;
  const entries = Object.entries(record).filter(([, value]) => {
    const shouldKeep =
      currentEntityIds.has(value.targetId) &&
      (!value.sourceId || currentEntityIds.has(value.sourceId));

    didPrune ||= !shouldKeep;
    return shouldKeep;
  });

  return didPrune ? Object.fromEntries(entries) : record;
}

function copyCurrentEntries<T>(
  record: Record<string, T>,
  currentEntityIds: Set<string>,
): Record<string, T> {
  const nextRecord: Record<string, T> = {};

  for (const [id, value] of Object.entries(record)) {
    if (currentEntityIds.has(id)) {
      nextRecord[id] = value;
    }
  }

  return nextRecord;
}
