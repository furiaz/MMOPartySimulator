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
    skillGatherBuffsByCompanionId: {},
    skillDamageMitigationsByCompanionId: {},
    skillShieldBlocksById: {},
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
  const skillGatherBuffsByCompanionId = pruneRecordById(
    state.skillGatherBuffsByCompanionId,
    currentEntityIds,
  );
  const skillDamageMitigationsByCompanionId = pruneRecordById(
    state.skillDamageMitigationsByCompanionId,
    currentEntityIds,
  );
  const skillBindsByEnemyId = pruneRecordById(state.skillBindsByEnemyId, currentEntityIds);
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
    skillGatherBuffsByCompanionId === state.skillGatherBuffsByCompanionId &&
    skillDamageMitigationsByCompanionId === state.skillDamageMitigationsByCompanionId &&
    skillBindsByEnemyId === state.skillBindsByEnemyId &&
    skillCooldownsByCompanionId === state.skillCooldownsByCompanionId &&
    globalCooldownsByCompanionId === state.globalCooldownsByCompanionId &&
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
    skillGatherBuffsByCompanionId,
    skillDamageMitigationsByCompanionId,
    skillBindsByEnemyId,
    skillCooldownsByCompanionId,
    globalCooldownsByCompanionId,
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
