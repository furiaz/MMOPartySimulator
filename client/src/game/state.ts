import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { findClosestAvailablePosition } from "./movementPlanning";
import type {
  CombatDamageType,
  CombatFeedbackEvent,
  CombatFeedbackType,
  ClassId,
  CompanionAoeChannelState,
  CompanionGlobalCooldownState,
  ConsumableUseState,
  DebugNavigationReason,
  DebugTelemetryState,
  DirectCompanionCommand,
  ActiveCombatProjectile,
  ActiveTeleport,
  DebugMapId,
  GameMap,
  GameEntity,
  Enemy,
  HubDepartureFoodWarningState,
  LeaderIntent,
  PartyIntent,
  PartyInventory,
  PartyWallet,
  PartyFormationState,
  PartyMemberRole,
  Position,
  DropVisualEvent,
  EnemyAoeChannelState,
  EnemyAoeCooldownState,
  SkillAbsorbShieldState,
  SkillBindState,
  SkillCooldownsBySkillId,
  SkillDamageMitigationState,
  SkillGatherBuffState,
  SkillMarkState,
  SkillPartyPoisonCoatingState,
  SkillMitigationBuffState,
  SkillPartyBuffState,
  ResurrectionProgressState,
  ResurrectionRecoveryAssignmentState,
  SkillSelfBuffState,
  SkillShieldBlockState,
  SkillVisualEvent,
  SlimewardDungeonRuntimeState,
  StatusEffectState,
  TeleportRuntimeState,
  WorldWipeRecoveryState,
} from "./types";
import {
  filterExpiredGlobalCooldowns,
  filterExpiredSkillCooldownsByCompanion,
} from "./companionCooldowns";
import { createPendingRoleBonusState } from "./roleBonus";
import { ensureCompanionSkillProgressionForClass } from "./skillProgression";
import type {
  GlobalPoiIntent,
  LocalPoiTarget,
  PoiDecisionState,
  QuestId,
  QuestState,
} from "./questTypes";
import type { SimulationTiming } from "./simulationTiming";
import type {
  MovementFailureDetail,
  MovementPath,
} from "./movementTypes";

const COMBAT_FEEDBACK_DURATION_MS = 1000;
export const PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS = 2000;
const POSITION_EPSILON = 0.001;
const PARTY_LEADER_HANDOFF_MS = 800;

export type DebugOptions = {
  superSpeedEnabled: boolean;
  superExpEnabled: boolean;
  companionInfiniteHealthEnabled?: boolean;
  deepNavigationTelemetryEnabled?: boolean;
};

export type PoiSearchScope = "free_travel" | "zone_only" | "subzone_only";

export type PoiPreferences = {
  stayInMap: boolean;
  searchScope?: PoiSearchScope;
};

type AttackSlotCacheEntry = {
  attackRange: number;
  attackSlot: Position;
  createdAtMs: number;
  mapKey: string;
  targetId?: string;
  targetPosition: Position;
  usesPartyPassThrough: boolean;
};

type EnemyTargetReachabilityCacheEntry = {
  cacheKey: string;
  expiresAtMs: number;
  reachable: boolean;
};

export type InterruptedPoiTarget = {
  interruptedByEnemyId: string;
  mapId?: DebugMapId;
  leaderIntent: LeaderIntent | null;
  globalPoiIntent: GlobalPoiIntent | null;
  localPoiTarget: LocalPoiTarget | null;
  lastPoiDecision?: PoiDecisionState;
};

export { clearFrameMovementPlanning, clearTickMovementPlanning } from "./movementState";
export {
  COMPANION_COLLISION_CAPSULE_ANCHOR_Y,
  COMPANION_COLLISION_CAPSULE_HEIGHT_MULTIPLIER,
  COMPANION_COLLISION_CAPSULE_WIDTH_MULTIPLIER,
  ENTITY_COLLISION_DISTANCE,
  findClosestAvailablePosition,
  getBoundedNavigationDistance,
  getBoundedPathDistance,
  getEntityCollisionShape,
  isEntitySeparationPositionAvailable,
  isActiveResourcePosition,
  isPositionAvailable,
  isPositionInsideEntityCollisionShape,
  isWalkablePosition,
  isWallPosition,
  moveEntityTowardIfUnoccupied,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
  reservePositionForFrame,
  reservePositionForTick,
} from "./movementPlanning";
export type {
  EntityCollisionShape,
  FindAvailablePositionOptions,
  MovementFailureDetail,
  MovementOptions,
  MovementPath,
  MovementPathProfile,
} from "./movementTypes";

export type GameState = {
  entities: Record<string, GameEntity>;
  inventory: PartyInventory;
  wallet: PartyWallet;
  currentMapId?: DebugMapId;
  map?: GameMap;
  activeTeleport?: ActiveTeleport | null;
  teleportStatesById?: Record<string, TeleportRuntimeState>;
  autoModeEnabled: boolean;
  worldTravelTargetMapId: DebugMapId | null;
  poiPreferences: PoiPreferences;
  simulationTick: number;
  simulationFrame?: number;
  simulationTimeMs?: number;
  simulationDeltaMs?: number;
  partyLeaderId: string;
  leaderHandoffTicks?: number;
  leaderHandoffRemainingMs?: number;
  partyIntent: PartyIntent | null;
  leaderIntent: LeaderIntent | null;
  directCompanionCommandsById?: Record<string, DirectCompanionCommand>;
  directCommandGraceUntilByCompanionId?: Record<string, number>;
  interruptedPoiTarget?: InterruptedPoiTarget | null;
  quests: Record<QuestId, QuestState>;
  globalPoiIntent: GlobalPoiIntent | null;
  localPoiTarget: LocalPoiTarget | null;
  lastPoiDecision?: PoiDecisionState;
  exploredTiles: Record<string, true>;
  followTrailsByEntityId: Record<string, Position[]>;
  lastPositionsByEntityId?: Record<string, Position>;
  failedMoveByEntityId?: Record<string, true>;
  movementFailureMsByEntityId?: Record<string, number>;
  movementFailuresByEntityId?: Record<string, MovementFailureDetail>;
  movementPathRetryAtMsByEntityId?: Record<string, number>;
  moveIntentsByEntityId?: Record<string, Position>;
  reservedPositionsByEntityId?: Record<string, Position>;
  movementPathsByEntityId?: Record<string, MovementPath>;
  attackSlotCacheByEntityId?: Record<string, AttackSlotCacheEntry>;
  enemyTargetReachabilityCacheByEnemyId?: Record<
    string,
    EnemyTargetReachabilityCacheEntry
  >;
  movementDecisionsByEntityId?: Record<string, DebugNavigationReason>;
  defenderWaitTicksByLeaderId?: Record<string, number>;
  defenderBlockedTicksByEntityId?: Record<string, number>;
  defenderWaitMsByLeaderId?: Record<string, number>;
  defenderBlockedMsByEntityId?: Record<string, number>;
  partyFormation?: PartyFormationState;
  combatFeedbackEvents: CombatFeedbackEvent[];
  combatProjectiles?: ActiveCombatProjectile[];
  skillMarksByEnemyId?: Record<string, SkillMarkState>;
  skillSelfBuffsByCompanionId?: Record<string, SkillSelfBuffState>;
  skillPartyBuffsBySourceId?: Record<string, SkillPartyBuffState>;
  skillPartyPoisonCoatingsBySourceId?: Record<string, SkillPartyPoisonCoatingState>;
  skillGatherBuffsByCompanionId?: Record<string, SkillGatherBuffState>;
  skillDamageMitigationsByCompanionId?: Record<string, SkillDamageMitigationState>;
  skillAbsorbShieldsByCompanionId?: Record<string, SkillAbsorbShieldState>;
  skillSelfMitigationBuffsByCompanionId?: Record<string, SkillMitigationBuffState>;
  skillPartyMitigationBuffsBySourceId?: Record<string, SkillMitigationBuffState>;
  skillBindsByEnemyId?: Record<string, SkillBindState>;
  skillShieldBlocksById?: Record<string, SkillShieldBlockState>;
  statusEffectsById?: Record<string, StatusEffectState>;
  skillCooldownsByCompanionId?: Record<string, SkillCooldownsBySkillId>;
  globalCooldownsByCompanionId?: Record<string, CompanionGlobalCooldownState>;
  skillVisualEvents?: SkillVisualEvent[];
  companionAoeChannelsByCasterId?: Record<string, CompanionAoeChannelState>;
  enemyAoeChannelsByCasterId?: Record<string, EnemyAoeChannelState>;
  enemyAoeCooldownsByCasterId?: Record<string, EnemyAoeCooldownState>;
  consumableUsesByCompanionId?: Record<string, ConsumableUseState>;
  hubDepartureFoodWarning?: HubDepartureFoodWarningState | null;
  flaskRechargeEnemyKillCounter?: number;
  flaskRechargeCountedEnemyDefeats?: Record<string, number>;
  dropVisualEvents?: DropVisualEvent[];
  slimewardDungeon?: SlimewardDungeonRuntimeState;
  resurrectionProgressByCompanionId?: Record<string, ResurrectionProgressState>;
  resurrectionChannelsByHelperId?: Record<string, ResurrectionRecoveryAssignmentState>;
  worldWipeRecovery?: WorldWipeRecoveryState;
  lastHealthRegenAtByCompanionId?: Record<string, number>;
  lastTargetDummyRegenAtByEnemyId?: Record<string, number>;
  debugTelemetry?: DebugTelemetryState;
  debugOptions?: DebugOptions;
};

export function addEntity(state: GameState, entity: GameEntity): GameState {
  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
    followTrailsByEntityId: state.followTrailsByEntityId[entity.id]
      ? state.followTrailsByEntityId
      : {
          ...state.followTrailsByEntityId,
          [entity.id]: [],
        },
  };
}

export function addEnemy(state: GameState, enemy: Enemy): GameState {
  const position = findClosestAvailablePosition(state, enemy.position);

  return addEntity(state, {
    ...enemy,
    position,
    homePosition: position,
  });
}

export function updateEntity(state: GameState, entity: GameEntity): GameState {
  const previousEntity = state.entities[entity.id];

  if (previousEntity === entity) {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [entity.id]: entity,
    },
    followTrailsByEntityId:
      previousEntity &&
      !isSamePosition(previousEntity.position, entity.position)
        ? {
            ...state.followTrailsByEntityId,
            [entity.id]: getUpdatedFollowTrail(
              state.followTrailsByEntityId[entity.id] ?? [],
              previousEntity.position,
            ),
          }
        : state.followTrailsByEntityId,
  };
}

export function addCombatFeedback(
  state: GameState,
  event: {
    amount?: number;
    damageType?: CombatDamageType;
    feedbackKind?: string;
    type: CombatFeedbackType;
    entityId: string;
    sourceEntityId?: string;
    targetEntityId?: string;
    text: string;
    now: number;
    durationMs?: number;
  },
): GameState {
  const durationMs = event.durationMs ?? COMBAT_FEEDBACK_DURATION_MS;

  return {
    ...state,
    combatFeedbackEvents: [
      ...state.combatFeedbackEvents,
      {
        id: `${event.now}-${event.type}-${event.entityId}-${state.combatFeedbackEvents.length}`,
        amount: event.amount,
        damageType: event.damageType,
        type: event.type,
        entityId: event.entityId,
        feedbackKind: event.feedbackKind,
        sourceEntityId: event.sourceEntityId,
        targetEntityId: event.targetEntityId,
        text: event.text,
        createdAt: event.now,
        expiresAt: event.now + durationMs,
      },
    ],
  };
}

export function clearExpiredCombatFeedback(
  state: GameState,
  now = Date.now(),
): GameState {
  const combatFeedbackEvents = state.combatFeedbackEvents.filter(
    (event) => event.expiresAt > now,
  );

  if (combatFeedbackEvents.length === state.combatFeedbackEvents.length) {
    return state;
  }

  return {
    ...state,
    combatFeedbackEvents,
  };
}

export function addSkillVisualEvent(
  state: GameState,
  event: Omit<SkillVisualEvent, "id" | "createdAt" | "expiresAt"> & {
    now: number;
    durationMs: number;
  },
): GameState {
  return {
    ...state,
    skillVisualEvents: [
      ...(state.skillVisualEvents ?? []),
      {
        id: `${event.now}-${event.type}-${event.sourceId}-${state.skillVisualEvents?.length ?? 0}`,
        type: event.type,
        skillId: event.skillId,
        sourceId: event.sourceId,
        targetId: event.targetId,
        position: event.position,
        createdAt: event.now,
        expiresAt: event.now + event.durationMs,
      },
    ],
  };
}

export function clearExpiredSkillRuntimeState(
  state: GameState,
  now = Date.now(),
): GameState {
  const skillMarksByEnemyId = filterExpiredRecord(
    state.skillMarksByEnemyId,
    now,
  );
  const skillSelfBuffsByCompanionId = filterExpiredRecord(
    state.skillSelfBuffsByCompanionId,
    now,
  );
  const skillPartyBuffsBySourceId = filterExpiredRecord(
    state.skillPartyBuffsBySourceId,
    now,
  );
  const skillPartyPoisonCoatingsBySourceId = filterExpiredRecord(
    state.skillPartyPoisonCoatingsBySourceId,
    now,
  );
  const skillGatherBuffsByCompanionId = filterExpiredRecord(
    state.skillGatherBuffsByCompanionId,
    now,
  );
  const skillDamageMitigationsByCompanionId = filterExpiredRecord(
    state.skillDamageMitigationsByCompanionId,
    now,
  );
  const skillAbsorbShieldsByCompanionId = filterExpiredRecord(
    state.skillAbsorbShieldsByCompanionId,
    now,
  );
  const skillSelfMitigationBuffsByCompanionId = filterExpiredRecord(
    state.skillSelfMitigationBuffsByCompanionId,
    now,
  );
  const skillPartyMitigationBuffsBySourceId = filterExpiredRecord(
    state.skillPartyMitigationBuffsBySourceId,
    now,
  );
  const skillBindsByEnemyId = filterExpiredRecord(
    state.skillBindsByEnemyId,
    now,
  );
  const skillShieldBlocksById = filterExpiredRecord(
    state.skillShieldBlocksById,
    now,
  );
  const statusEffectsById = filterExpiredRecord(
    state.statusEffectsById,
    now,
  );
  const skillCooldownsByCompanionId = filterExpiredSkillCooldownsByCompanion(
    state.skillCooldownsByCompanionId,
    now,
  );
  const globalCooldownsByCompanionId = filterExpiredGlobalCooldowns(
    state.globalCooldownsByCompanionId,
    now,
  );
  const skillVisualEvents = filterExpiredEvents(state.skillVisualEvents, now);

  if (
    skillMarksByEnemyId === state.skillMarksByEnemyId &&
    skillSelfBuffsByCompanionId === state.skillSelfBuffsByCompanionId &&
    skillPartyBuffsBySourceId === state.skillPartyBuffsBySourceId &&
    skillPartyPoisonCoatingsBySourceId ===
      state.skillPartyPoisonCoatingsBySourceId &&
    skillGatherBuffsByCompanionId === state.skillGatherBuffsByCompanionId &&
    skillDamageMitigationsByCompanionId === state.skillDamageMitigationsByCompanionId &&
    skillAbsorbShieldsByCompanionId === state.skillAbsorbShieldsByCompanionId &&
    skillSelfMitigationBuffsByCompanionId === state.skillSelfMitigationBuffsByCompanionId &&
    skillPartyMitigationBuffsBySourceId === state.skillPartyMitigationBuffsBySourceId &&
    skillBindsByEnemyId === state.skillBindsByEnemyId &&
    skillShieldBlocksById === state.skillShieldBlocksById &&
    statusEffectsById === state.statusEffectsById &&
    skillCooldownsByCompanionId === state.skillCooldownsByCompanionId &&
    globalCooldownsByCompanionId === state.globalCooldownsByCompanionId &&
    skillVisualEvents === state.skillVisualEvents
  ) {
    return state;
  }

  return {
    ...state,
    skillMarksByEnemyId,
    skillSelfBuffsByCompanionId,
    skillPartyBuffsBySourceId,
    skillPartyPoisonCoatingsBySourceId,
    skillGatherBuffsByCompanionId,
    skillDamageMitigationsByCompanionId,
    skillAbsorbShieldsByCompanionId,
    skillSelfMitigationBuffsByCompanionId,
    skillPartyMitigationBuffsBySourceId,
    skillBindsByEnemyId,
    skillShieldBlocksById,
    statusEffectsById,
    skillCooldownsByCompanionId,
    globalCooldownsByCompanionId,
    skillVisualEvents,
  };
}

function filterExpiredRecord<T extends { expiresAt: number }>(
  record: Record<string, T> | undefined,
  now: number,
): Record<string, T> | undefined {
  if (!record) {
    return record;
  }

  let didExpire = false;
  const entries = Object.entries(record).filter(([, value]) => {
    const isActive = value.expiresAt > now;
    didExpire ||= !isActive;
    return isActive;
  });

  return didExpire ? Object.fromEntries(entries) : record;
}

function filterExpiredEvents<T extends { expiresAt: number }>(
  events: T[] | undefined,
  now: number,
): T[] | undefined {
  if (!events) {
    return events;
  }

  const hasExpiredEvent = events.some((event) => event.expiresAt <= now);

  return hasExpiredEvent
    ? events.filter((event) => event.expiresAt > now)
    : events;
}

export function getFollowTrailPosition(
  state: GameState,
  entityId: string,
  trailIndex: number,
): Position | null {
  const trail = state.followTrailsByEntityId[entityId];

  if (!trail || trailIndex < 0) {
    return null;
  }

  return trail[trailIndex] ?? null;
}

export function setAutoModeEnabled(
  state: GameState,
  autoModeEnabled: boolean,
): GameState {
  return {
    ...state,
    autoModeEnabled,
  };
}

export function setStayInMapEnabled(
  state: GameState,
  stayInMap: boolean,
): GameState {
  return setPoiSearchScope(state, stayInMap ? "subzone_only" : "free_travel");
}

export function getPoiSearchScope(state: GameState): PoiSearchScope {
  return (
    state.poiPreferences.searchScope ??
    (state.poiPreferences.stayInMap ? "subzone_only" : "free_travel")
  );
}

export function setPoiSearchScope(
  state: GameState,
  searchScope: PoiSearchScope,
): GameState {
  return {
    ...state,
    poiPreferences: {
      ...state.poiPreferences,
      searchScope,
      stayInMap: searchScope === "subzone_only",
    },
  };
}

export function setCompanionRole(
  state: GameState,
  companionId: string,
  role: PartyMemberRole,
  nowMs = Date.now(),
): GameState {
  return setPartyMemberRole(state, companionId, role, nowMs);
}

export function setPartyLeader(
  state: GameState,
  entityId: string,
): GameState {
  const entity = state.entities[entityId];

  if (entity?.kind !== "companion") {
    return state;
  }

  return {
    ...state,
    partyLeaderId: entity.id,
    leaderHandoffRemainingMs:
      state.partyLeaderId === entity.id
        ? state.leaderHandoffRemainingMs
        : PARTY_LEADER_HANDOFF_MS,
  };
}

export function advanceSimulationTick(state: GameState): GameState {
  return {
    ...state,
    simulationTick: state.simulationTick + 1,
  };
}

export function advanceSimulationTime(
  state: GameState,
  timing: SimulationTiming,
): GameState {
  const nextFrame = (state.simulationFrame ?? state.simulationTick ?? 0) + 1;

  return {
    ...state,
    simulationTick: nextFrame,
    simulationFrame: nextFrame,
    simulationTimeMs: (state.simulationTimeMs ?? 0) + timing.deltaMs,
    simulationDeltaMs: timing.deltaMs,
  };
}

export function setPartyMemberRole(
  state: GameState,
  entityId: string,
  role: PartyMemberRole,
  nowMs = Date.now(),
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "companion") {
    return state;
  }

  if (partyMember.role === role) {
    return state;
  }

  const nextState = updateEntity(state, {
    ...partyMember,
    role,
    roleBonus: createPendingRoleBonusState(role, nowMs),
  });

  return appendDebugTelemetryEvent(nextState, {
    type: "role_changed",
    entityId: partyMember.id,
    previousRole: partyMember.role,
    nextRole: role,
  });
}

export function setPartyMemberClass(
  state: GameState,
  entityId: string,
  classId: ClassId,
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "companion") {
    return state;
  }

  const nextPartyMember = ensureCompanionSkillProgressionForClass(
    ensureCompanionSkillProgressionForClass(partyMember),
    classId,
  );
  const nextState = updateEntity(state, nextPartyMember);

  if (partyMember.classId === classId) {
    return nextState;
  }

  return appendDebugTelemetryEvent(nextState, {
    type: "class_changed",
    entityId: partyMember.id,
    previousClassId: partyMember.classId,
    nextClassId: classId,
  });
}

export function setPartyOrder(
  state: GameState,
  entityId: string,
  partyOrder: number,
): GameState {
  const partyMember = state.entities[entityId];

  if (partyMember?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...partyMember,
    partyOrder,
  });
}

export function setCompanionDefendPosition(
  state: GameState,
  companionId: string,
  defendPosition: Position | null,
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...companion,
    defendPosition,
  });
}

export function getEntityById(
  state: GameState,
  entityId: string,
): GameEntity | undefined {
  return state.entities[entityId];
}

const FOLLOW_TRAIL_LENGTH = 12;

function getUpdatedFollowTrail(
  trail: Position[],
  position: Position,
): Position[] {
  const nextTrail = [
    position,
    ...trail.filter((trailPosition) => !isSamePosition(trailPosition, position)),
  ];

  return nextTrail.slice(0, FOLLOW_TRAIL_LENGTH);
}

function isSamePosition(a: Position, b: Position): boolean {
  return getEuclideanDistance(a, b) <= POSITION_EPSILON;
}

function getEuclideanDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
