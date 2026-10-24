import type { GameState } from "./state";
import { initializeBarracks } from "./barracks";
import { reconcileWarmasterLifecycle } from "./warmasterLifecycle";
import type { PartyFormationState } from "./types";
import { pruneTargetCommitmentState } from "./targetCommitment";

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
    targetCommitmentsByEntityId: {},
    targetApproachesByEntityId: {},
    targetEngagementProbeAtMsByEntityId: {},
    rejectedCombatTargetsByEntityId: {},
    companionTargetDecisionByEntityId: {},
    companionTargetTransitions: [],
    normalMovementResultsByEntityId: {},
    localAvoidanceByEntityId: {},
    overlapRecoveryByEntityId: {},
    overlapRecoveryGeometryKey: undefined,
    movementPositionCommitsByEntityId: {},
    warmasterResetPending: undefined,
    normalMovementPhase: undefined,
    externalMovementOwnersByEntityId: {},
    warmasterAttempt: undefined,
    warmasterInteraction: undefined,
    warmasterLifecycle: state.warmasterLifecycle?.phase === "active" ? { ...state.warmasterLifecycle, phase: "ready" } : state.warmasterLifecycle,
    forcedMovementsByEntityId: {},
    barracksById: state.barracksById ? Object.fromEntries(Object.entries(state.barracksById).map(([id, runtime]) =>
      [id, { ...runtime, wasInRange: false, speech: undefined, hintExpiresAtMs: undefined, nextClearanceRetryAtMs: undefined }])) : undefined,
    activeTeleport: null,
    directCompanionCommandsById: {},
    directCommandGraceUntilByCompanionId: {},
    interruptedPoiTarget: null,
    questNpcSpeechCue: undefined,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    combatProjectiles: [],
    autonomousTargetSuppressionsByEnemyId: undefined,
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
    enemyAbilityCastsByEnemyId: {},
    enemyAbilityCooldownsByEnemyId: {},
    enemyAbilityBasicAttackRequiredByEnemyId: {},
    enemyDashesByEnemyId: {},
    aoeDummyPatternSequenceIndex: 0,
    flaskRechargeCountedEnemyDefeats: {},
    lastHealthRegenAtByCompanionId: {},
    lastTargetDummyRegenAtByEnemyId: {},
    lastCompanionDamageTakenAtByCompanionId: {},
    dropVisualEvents: [],
    resurrectionProgressByCompanionId: {},
    resurrectionChannelsByHelperId: {},
    skillBindsByEnemyId: {},
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
    skillShieldBlocksById: {},
    statusEffectsById: {},
    partyFormation: createIdlePartyFormation(),
  };
}

export function pruneMissingEntityRuntimeState(state: GameState): GameState {
  state = pruneTargetCommitmentState(state);
  const living = (id: string) => state.entities[id] && state.entities[id].state !== "dead";
  state = { ...state,
    localAvoidanceByEntityId: Object.fromEntries(Object.entries(state.localAvoidanceByEntityId ?? {}).filter(([id]) => living(id))),
    overlapRecoveryByEntityId: Object.fromEntries(Object.entries(state.overlapRecoveryByEntityId ?? {}).filter(([id]) => living(id))),
    normalMovementResultsByEntityId: Object.fromEntries(Object.entries(state.normalMovementResultsByEntityId ?? {}).filter(([id]) => living(id))),
    movementPositionCommitsByEntityId: Object.fromEntries(Object.entries(state.movementPositionCommitsByEntityId ?? {}).filter(([id]) => living(id))),
    warmasterResetPending: state.warmasterResetPending && living(state.warmasterResetPending) ? state.warmasterResetPending : undefined,
    normalMovementPhase: state.normalMovementPhase ? { submissions: state.normalMovementPhase.submissions.filter(submission => living(submission.request.entityId)) } : undefined,
    externalMovementOwnersByEntityId: Object.fromEntries(Object.entries(state.externalMovementOwnersByEntityId ?? {}).filter(([id]) => living(id))),
  };
  if (state.warmasterAttempt && !state.entities[state.warmasterAttempt.bossId]) state = { ...state, warmasterAttempt: undefined };
  if (Object.keys(state.forcedMovementsByEntityId ?? {}).some(id => !living(id))) {
    state = { ...state, forcedMovementsByEntityId: Object.fromEntries(Object.entries(state.forcedMovementsByEntityId ?? {}).filter(([id]) => living(id))) };
  }
  state = initializeBarracks(state);
  state = reconcileWarmasterLifecycle(state);
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
  const arcaneCrescendoByCompanionId = pruneRecordById(
    state.arcaneCrescendoByCompanionId,
    currentEntityIds,
  );
  const wordResonanceByCompanionId = pruneRecordById(
    state.wordResonanceByCompanionId,
    currentEntityIds,
  );
  const manyBeaconsByCompanionId = pruneRecordById(
    state.manyBeaconsByCompanionId,
    currentEntityIds,
  );
  const cruelMercyByCompanionId = pruneRecordById(
    state.cruelMercyByCompanionId,
    currentEntityIds,
  );
  const overflowingGraceBarriersByCompanionId = pruneRecordById(
    state.overflowingGraceBarriersByCompanionId,
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
  const skillHealOverTimesByCompanionId = pruneRecordById(
    state.skillHealOverTimesByCompanionId,
    currentEntityIds,
  );
  const skillLifestealBuffsByCompanionId = pruneRecordById(
    state.skillLifestealBuffsByCompanionId,
    currentEntityIds,
  );
  const skillRewindRunesByCompanionId = pruneRecordById(
    state.skillRewindRunesByCompanionId,
    currentEntityIds,
  );
  const skillRunicFocusByCompanionId = pruneRecordById(
    state.skillRunicFocusByCompanionId,
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
  const enemyAbilityCastsByEnemyId = pruneRecordById(
    state.enemyAbilityCastsByEnemyId,
    currentEntityIds,
  );
  const enemyAbilityCooldownsByEnemyId = pruneRecordById(
    state.enemyAbilityCooldownsByEnemyId,
    currentEntityIds,
  );
  const enemyAbilityBasicAttackRequiredByEnemyId = pruneRecordById(
    state.enemyAbilityBasicAttackRequiredByEnemyId,
    currentEntityIds,
  );
  const enemyDashesByEnemyId = pruneRecordById(
    state.enemyDashesByEnemyId,
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
  const lastCompanionDamageTakenAtByCompanionId = pruneRecordById(
    state.lastCompanionDamageTakenAtByCompanionId,
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
    arcaneCrescendoByCompanionId === state.arcaneCrescendoByCompanionId &&
    wordResonanceByCompanionId === state.wordResonanceByCompanionId &&
    manyBeaconsByCompanionId === state.manyBeaconsByCompanionId &&
    cruelMercyByCompanionId === state.cruelMercyByCompanionId &&
    overflowingGraceBarriersByCompanionId ===
      state.overflowingGraceBarriersByCompanionId &&
    skillManaShieldsByCompanionId === state.skillManaShieldsByCompanionId &&
    skillFrostArmorsByCompanionId === state.skillFrostArmorsByCompanionId &&
    skillHealOverTimesByCompanionId === state.skillHealOverTimesByCompanionId &&
    skillLifestealBuffsByCompanionId === state.skillLifestealBuffsByCompanionId &&
    skillRewindRunesByCompanionId === state.skillRewindRunesByCompanionId &&
    skillRunicFocusByCompanionId === state.skillRunicFocusByCompanionId &&
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
    enemyAbilityCastsByEnemyId === state.enemyAbilityCastsByEnemyId &&
    enemyAbilityCooldownsByEnemyId === state.enemyAbilityCooldownsByEnemyId &&
    enemyAbilityBasicAttackRequiredByEnemyId ===
      state.enemyAbilityBasicAttackRequiredByEnemyId &&
    enemyDashesByEnemyId === state.enemyDashesByEnemyId &&
    flaskRechargeCountedEnemyDefeats === state.flaskRechargeCountedEnemyDefeats &&
    lastHealthRegenAtByCompanionId === state.lastHealthRegenAtByCompanionId &&
    lastTargetDummyRegenAtByEnemyId === state.lastTargetDummyRegenAtByEnemyId &&
    lastCompanionDamageTakenAtByCompanionId ===
      state.lastCompanionDamageTakenAtByCompanionId &&
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
    arcaneCrescendoByCompanionId,
    wordResonanceByCompanionId,
    manyBeaconsByCompanionId,
    cruelMercyByCompanionId,
    overflowingGraceBarriersByCompanionId,
    skillManaShieldsByCompanionId,
    skillFrostArmorsByCompanionId,
    skillHealOverTimesByCompanionId,
    skillLifestealBuffsByCompanionId,
    skillRewindRunesByCompanionId,
    skillRunicFocusByCompanionId,
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
    enemyAbilityCastsByEnemyId,
    enemyAbilityCooldownsByEnemyId,
    enemyAbilityBasicAttackRequiredByEnemyId,
    enemyDashesByEnemyId,
    flaskRechargeCountedEnemyDefeats,
    lastHealthRegenAtByCompanionId,
    lastTargetDummyRegenAtByEnemyId,
    lastCompanionDamageTakenAtByCompanionId,
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

function pruneStatusEffectsByEntityId<
  T extends {
    targetId: string;
    sourceId?: string;
    endsWhenSourceDies?: true;
  },
>(
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
      (value.endsWhenSourceDies !== true ||
        !value.sourceId ||
        currentEntityIds.has(value.sourceId));

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
