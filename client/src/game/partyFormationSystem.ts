import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isCombatEntity } from "./entities";
import { isActiveResource } from "./entityGuards";
import { getSoftFollowPosition, isStackedWithPartyMember } from "./partySpacing";
import { captureInterruptedPoiTarget } from "./poiResumeSystem";
import {
  getPartyLeader,
  getPartyMembers,
  isGathererBusy,
  isPartyMember,
  type PartyMember,
} from "./partySystem";
import { isPartyMemberRespondingToActiveThreat } from "./partyThreatSystem";
import { isTeleportWorking } from "./teleportState";
import {
  QUEST_GUIDE_OBJECTIVE_ID,
  isQuestGuideObjectiveRelevant,
} from "./questGuideSystem";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { isCompanionInDirectCommandGrace } from "./directCompanionCommands";
import {
  getEntityById,
  getPartyExecutionIntent,
  hasDirectPlayerPartyIntent,
  moveEntityTowardPositionIfUnoccupied,
  setPartyExecutionIntent,
  updateEntity,
  type GameState,
} from "./state";
import { isActivePartyThreat } from "./partyThreatSystem";
import type {
  Enemy,
  FormationPhase,
  GameEntity,
  PartyFormationState,
  Position,
} from "./types";

export const PARTY_COHESION_DISTANCE = 4;
export const PARTY_WAIT_DISTANCE = 7;
export const FOLLOW_DISTANCE = 1.5;
export const FOLLOW_CATCHUP_DISTANCE = 5;
const LEADER_COHESION_SLOW_SPEED_MULTIPLIER = 0.45;
const FOLLOWER_CATCH_UP_SPEED_MULTIPLIER = 1.8;
export const COMBAT_BREAK_DISTANCE = 3;
export const POI_REACHED_DISTANCE = 1;
export const GATHERER_REJOIN_DISTANCE = 6;

type PartyPlan = {
  phase: FormationPhase;
  target: Enemy | null;
  targetPosition: Position | null;
};

type PartyTravelCohesion = {
  canMoveLeader: boolean;
  leaderSpeedMultiplier: number;
};

export function updatePartyFormationSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  const leader = getPartyLeader(state);

  if (
    !leader ||
    leader.state === "dead" ||
    leader.commandPriority === "direct" ||
    isCompanionAssignedToResurrectionRecovery(state, leader.id)
  ) {
    return clearFormation(state);
  }

  const gatherIntentClearedState = clearStaleGatherPartyIntent(state, leader);

  if (gatherIntentClearedState !== state) {
    return gatherIntentClearedState;
  }

  const plan = getPartyPlan(state, leader);

  if (!plan.targetPosition) {
    return clearFinishedCombat(clearFormation(state));
  }

  let nextState = state;

  nextState = setFormationState(nextState, plan);

  if (plan.phase === "combat" && plan.target) {
    nextState = assignPartyCombatTarget(nextState, plan.target.id);
    return nextState;
  }

  nextState = assignPartyTravelTargets(nextState, leader, plan);

  const handoffActive = isLeaderHandoffActive(nextState, leader);
  const travelCohesion = getPartyTravelCohesion(nextState, leader);

  if (travelCohesion.canMoveLeader || handoffActive) {
    nextState = moveLeaderTowardPoi(
      nextState,
      leader.id,
      plan,
      movedEntityIds,
      handoffActive ? 1 : travelCohesion.leaderSpeedMultiplier,
    );
  }

  nextState = moveFollowersTowardLeader(nextState, leader.id, movedEntityIds);

  return consumeLeaderHandoffTick(
    maybeFinishReachedPoi(nextState, leader.id, plan),
    leader.id,
  );
}

function getPartyPlan(state: GameState, leader: PartyMember): PartyPlan {
  const executionIntent = getPartyExecutionIntent(state);

  if (hasDirectPlayerPartyIntent(state)) {
    const intentTarget = getIntentEnemyTarget(state);

    return {
      phase:
        intentTarget &&
        getDistance(leader.position, intentTarget.position) <= COMBAT_BREAK_DISTANCE
          ? "combat"
          : "traveling",
      target: intentTarget,
      targetPosition:
        intentTarget?.position ??
        executionIntent?.targetPosition ??
        null,
    };
  }

  const nearbyThreatTarget = getNearbyPartyThreatTarget(state);
  const intentTarget = getIntentEnemyTarget(state);
  const leaderTarget = getLeaderEnemyTarget(state, leader);
  const target = nearbyThreatTarget ?? intentTarget ?? leaderTarget;
  const targetPosition =
    target?.position ??
    executionIntent?.targetPosition ??
    null;
  const phase =
    target && isWithinPartyCombatDistance(state, leader, target)
      ? "combat"
      : "traveling";

  return {
    phase,
    target,
    targetPosition,
  };
}

function assignPartyTravelTargets(
  state: GameState,
  leader: PartyMember,
  plan: PartyPlan,
): GameState {
  const hasPlayerIntent = hasDirectPlayerPartyIntent(state);
  const executionIntent = getPartyExecutionIntent(state);
  const isGatherIntent =
    !plan.target &&
    executionIntent?.type === "gather" &&
    Boolean(executionIntent.targetId);
  let nextState = setPartyExecutionIntent(state, {
    type: plan.target ? "attack" : (executionIntent?.type ?? "move"),
    targetId: plan.target?.id ?? executionIntent?.targetId ?? null,
    targetPosition: plan.targetPosition,
    source: executionIntent?.source,
  });

  const currentLeader = getEntityById(nextState, leader.id);

  if (
    currentLeader &&
    isPartyMember(currentLeader) &&
    (hasPlayerIntent ||
      !isPartyMemberRespondingToActiveThreat(nextState, currentLeader))
  ) {
    nextState = updateEntity(nextState, {
      ...currentLeader,
      state: isGatherIntent ? "gather" : "follow",
      currentTargetId:
        plan.target?.id ??
        (isGatherIntent ? executionIntent?.targetId ?? null : null),
      commandPriority: "autonomous",
    });
  }

  if (isGatherIntent) {
    return assignPartyGatherTarget(
      nextState,
      executionIntent?.targetId ?? null,
    );
  }

  for (const member of getPartyMembers(nextState)) {
    if (
      member.id === leader.id ||
      member.commandPriority === "direct" ||
      (!hasPlayerIntent &&
        isPartyMemberRespondingToActiveThreat(nextState, member)) ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id) ||
      (!hasPlayerIntent && isGathererBusy(nextState, member))
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: "follow",
      currentTargetId: leader.id,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function assignPartyGatherTarget(
  state: GameState,
  targetId: string | null,
): GameState {
  let nextState = state;
  const hasPlayerIntent = hasDirectPlayerPartyIntent(state);

  if (!targetId) {
    return nextState;
  }

  for (const member of getPartyMembers(nextState)) {
    if (
      member.commandPriority === "direct" ||
      (!hasPlayerIntent &&
        isPartyMemberRespondingToActiveThreat(nextState, member)) ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id)
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: "gather",
      currentTargetId: targetId,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function clearStaleGatherPartyIntent(
  state: GameState,
  leader: PartyMember,
): GameState {
  const executionIntent = getPartyExecutionIntent(state);

  if (executionIntent?.type !== "gather" || !executionIntent.targetId) {
    return state;
  }

  const targetId = executionIntent.targetId;

  if (isActiveResource(getEntityById(state, targetId))) {
    return state;
  }

  let nextState = setPartyExecutionIntent(clearFormation(state), null);

  for (const member of getPartyMembers(nextState)) {
    if (
      member.commandPriority === "direct" ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id) ||
      member.state !== "gather" ||
      member.currentTargetId !== targetId
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: "follow",
      currentTargetId: member.id === leader.id ? null : leader.id,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function assignPartyCombatTarget(state: GameState, targetId: string): GameState {
  const hasPlayerIntent = hasDirectPlayerPartyIntent(state);
  const executionIntent = getPartyExecutionIntent(state);
  const target = getEntityById(state, targetId);
  const baseState =
    executionIntent?.type !== "attack" && isLiveEnemy(target)
      ? captureInterruptedPoiTarget(state, target)
      : state;
  let nextState = setPartyExecutionIntent(baseState, {
    type: "attack",
    targetId,
    targetPosition: target?.position ?? null,
    source: executionIntent?.source,
  });

  for (const member of getPartyMembers(nextState)) {
    if (
      member.commandPriority === "direct" ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id) ||
      (!hasPlayerIntent &&
        isPartyMemberRespondingToActiveThreat(nextState, member)) ||
      (!hasPlayerIntent && isGathererBusy(nextState, member))
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: "attack",
      currentTargetId: targetId,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function moveLeaderTowardPoi(
  state: GameState,
  leaderId: string,
  plan: PartyPlan,
  movedEntityIds: Set<string>,
  speedMultiplier = 1,
): GameState {
  if (!plan.targetPosition || movedEntityIds.has(leaderId)) {
    return state;
  }

  const leader = getEntityById(state, leaderId);

  if (!leader || !isPartyMember(leader)) {
    return state;
  }

  if (getDistance(leader.position, plan.targetPosition) <= POI_REACHED_DISTANCE) {
    return state;
  }

  const nextState = moveEntityTowardPositionIfUnoccupied(
    state,
    leader,
    plan.targetPosition,
    {
      allowPartyPassThrough: true,
      pathProfile: plan.target ? "chase" : "poi",
      pathTargetKey: plan.target
        ? `leader-chase:${plan.target.id}`
        : `leader-poi:${getPositionPathKey(plan.targetPosition)}`,
      pathTargetPosition: plan.targetPosition,
      speedMultiplier,
    },
  );

  if (didEntityMove(nextState, leader)) {
    movedEntityIds.add(leader.id);
  }

  return nextState;
}

function moveFollowersTowardLeader(
  state: GameState,
  leaderId: string,
  movedEntityIds: Set<string>,
): GameState {
  let nextState = state;
  const leader = getEntityById(nextState, leaderId);

  if (!leader || !isPartyMember(leader)) {
    return nextState;
  }

  for (const member of getPartyMembers(nextState)) {
    if (
      member.id === leader.id ||
      member.commandPriority === "direct" ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id) ||
      isPartyMemberRespondingToActiveThreat(nextState, member) ||
      isGathererBusy(nextState, member) ||
      movedEntityIds.has(member.id)
    ) {
      continue;
    }

    if (
      getDistance(member.position, leader.position) <= FOLLOW_DISTANCE &&
      !isStackedWithPartyMember(nextState, member)
    ) {
      continue;
    }

    const currentMember = getEntityById(nextState, member.id);

    if (!currentMember || !isPartyMember(currentMember)) {
      continue;
    }

    const shouldCatchUp =
      getDistance(currentMember.position, leader.position) >
      PARTY_COHESION_DISTANCE;
    const followPosition = shouldCatchUp
      ? leader.position
      : getSoftFollowPosition(
          nextState,
          currentMember,
          leader,
          nextState.leaderIntent?.targetPosition,
        );
    const nextMemberState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      currentMember,
      followPosition,
      {
        allowPartyPassThrough: true,
        pathProfile: "follow",
        pathTargetKey: `follow:${leader.id}`,
        pathTargetPosition: followPosition,
        speedMultiplier: shouldCatchUp ? FOLLOWER_CATCH_UP_SPEED_MULTIPLIER : 1,
      },
    );

    if (didEntityMove(nextMemberState, currentMember)) {
      movedEntityIds.add(currentMember.id);
    }

    nextState = nextMemberState;
  }

  return nextState;
}

function maybeFinishReachedPoi(
  state: GameState,
  leaderId: string,
  plan: PartyPlan,
): GameState {
  if (plan.target || !plan.targetPosition) {
    return state;
  }

  const leader = getEntityById(state, leaderId);

  if (
    !leader ||
    !isPartyMember(leader) ||
    getDistance(leader.position, plan.targetPosition) > POI_REACHED_DISTANCE
  ) {
    return state;
  }

  if (isTeleportPoi(state, plan.targetPosition)) {
    return state;
  }

  const executionIntent = getPartyExecutionIntent(state);

  if (executionIntent?.type === "gather" && executionIntent.targetId) {
    return state;
  }

  if (isActiveGuidePoi(state)) {
    return state;
  }

  return setPartyExecutionIntent(clearFormationTarget(state), null);
}

function isActiveGuidePoi(state: GameState): boolean {
  return (
    isQuestGuideObjectiveRelevant(state) &&
    state.localPoiTarget?.objectiveId === QUEST_GUIDE_OBJECTIVE_ID
  );
}

function clearFinishedCombat(state: GameState): GameState {
  let nextState = state;
  const partyHasLiveTarget = getPartyMembers(state).some((member) => {
    const target = member.currentTargetId
      ? getEntityById(state, member.currentTargetId)
      : undefined;

    return isLiveEnemy(target);
  });

  if (partyHasLiveTarget) {
    return nextState;
  }

  for (const member of getPartyMembers(nextState)) {
    if (member.commandPriority === "direct" || member.state !== "attack") {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: "follow",
      currentTargetId: member.id === nextState.partyLeaderId ? null : nextState.partyLeaderId,
      commandPriority: "autonomous",
    });
  }

  return setPartyExecutionIntent(nextState, null);
}

function getPartyTravelCohesion(
  state: GameState,
  leader: PartyMember,
): PartyTravelCohesion {
  let shouldSlowLeader = false;

  for (const member of getPartyMembers(state)) {
    if (member.id === leader.id || !isRequiredForTravelCohesion(state, member, leader)) {
      continue;
    }

    const distance = getDistance(member.position, leader.position);

    if (distance > PARTY_WAIT_DISTANCE) {
      return {
        canMoveLeader: false,
        leaderSpeedMultiplier: 0,
      };
    }

    if (distance > PARTY_COHESION_DISTANCE) {
      shouldSlowLeader = true;
    }
  }

  return {
    canMoveLeader: true,
    leaderSpeedMultiplier: shouldSlowLeader
      ? LEADER_COHESION_SLOW_SPEED_MULTIPLIER
      : 1,
  };
}

function isRequiredForTravelCohesion(
  state: GameState,
  member: PartyMember,
  leader: PartyMember,
): boolean {
  if (
    member.commandPriority === "direct" ||
    isCompanionInDirectCommandGrace(state, member.id) ||
    isCompanionAssignedToResurrectionRecovery(state, member.id) ||
    isPartyMemberRespondingToActiveThreat(state, member)
  ) {
    return false;
  }

  if (member.role !== "gatherer") {
    return true;
  }

  return (
    !isGathererBusy(state, member) &&
    getDistance(member.position, leader.position) <= GATHERER_REJOIN_DISTANCE
  );
}

function isLeaderHandoffActive(state: GameState, leader: PartyMember): boolean {
  return (
    state.partyLeaderId === leader.id &&
    (state.leaderHandoffRemainingMs ?? 0) > 0
  );
}

function consumeLeaderHandoffTick(
  state: GameState,
  leaderId: string,
): GameState {
  if (
    state.partyLeaderId !== leaderId ||
    !state.leaderHandoffRemainingMs
  ) {
    return state;
  }

  const nextRemainingMs = Math.max(
    0,
    (state.leaderHandoffRemainingMs ?? 0) - (state.simulationDeltaMs ?? 100),
  );

  return {
    ...state,
    leaderHandoffRemainingMs: nextRemainingMs,
  };
}

function setFormationState(state: GameState, plan: PartyPlan): GameState {
  const previousFormation = state.partyFormation ?? createIdleFormation();
  const nextFormation: PartyFormationState = {
    phase: plan.phase,
    targetId: plan.target?.id ?? null,
    approachPoint: plan.targetPosition,
    direction: { x: 0, y: 0 },
    slotsByEntityId: {},
    slotReasonsByEntityId: {},
    skippedTargetIds: [],
  };

  let nextState: GameState = {
    ...state,
    partyFormation: nextFormation,
  };

  if (
    previousFormation.phase !== nextFormation.phase ||
    previousFormation.targetId !== nextFormation.targetId
  ) {
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "formation_changed",
      entityId: nextFormation.targetId ?? "party",
      targetId: nextFormation.targetId,
      formationPhase: nextFormation.phase,
      approachPoint: nextFormation.approachPoint,
    });
  }

  return nextState;
}

function clearFormation(state: GameState): GameState {
  if (!state.partyFormation || state.partyFormation.phase === "idle") {
    return state;
  }

  return {
    ...state,
    partyFormation: createIdleFormation(),
  };
}

function clearFormationTarget(state: GameState): GameState {
  return {
    ...state,
    partyFormation: createIdleFormation(),
  };
}

function createIdleFormation(): PartyFormationState {
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

function getIntentEnemyTarget(state: GameState): Enemy | null {
  const executionIntent = getPartyExecutionIntent(state);
  const target = executionIntent?.targetId
    ? state.entities[executionIntent.targetId]
    : undefined;

  return isLiveEnemy(target) ? target : null;
}

function getLeaderEnemyTarget(
  state: GameState,
  leader: PartyMember,
): Enemy | null {
  const target = leader.currentTargetId
    ? state.entities[leader.currentTargetId]
    : undefined;

  return isLiveEnemy(target) ? target : null;
}

function getNearbyPartyThreatTarget(state: GameState): Enemy | null {
  return (
    Object.values(state.entities)
      .filter((entity): entity is Enemy => isActivePartyThreat(state, entity))
      .filter((enemy) =>
        getPartyMembers(state).some(
          (member) =>
            member.commandPriority !== "direct" &&
            !isCompanionInDirectCommandGrace(state, member.id) &&
            getDistance(member.position, enemy.position) <= COMBAT_BREAK_DISTANCE,
        ),
      )
      .sort(
        (first, second) =>
          getNearestPartyDistance(state, first) -
            getNearestPartyDistance(state, second) ||
          first.id.localeCompare(second.id),
      )[0] ?? null
  );
}

function isWithinPartyCombatDistance(
  state: GameState,
  leader: PartyMember,
  target: Enemy,
): boolean {
  if (getDistance(leader.position, target.position) <= COMBAT_BREAK_DISTANCE) {
    return true;
  }

  return getNearestPartyDistance(state, target) <= COMBAT_BREAK_DISTANCE;
}

function getNearestPartyDistance(state: GameState, target: Enemy): number {
  const distances = getPartyMembers(state)
    .filter(
      (member) =>
        member.commandPriority !== "direct" &&
        !isCompanionInDirectCommandGrace(state, member.id),
    )
    .map((member) => getDistance(member.position, target.position));

  return distances.length > 0 ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

function isLiveEnemy(entity: GameEntity | undefined): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function didEntityMove(state: GameState, entity: GameEntity): boolean {
  const currentEntity = getEntityById(state, entity.id);

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

function getDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function isTeleportPoi(state: GameState, position: Position): boolean {
  return Boolean(
    state.map?.teleports.some(
      (teleport) =>
        isTeleportWorking(state, teleport.id) &&
        getDistance(position, teleport.position) <= 0,
    ),
  );
}

function getPositionPathKey(position: Position): string {
  return `${Math.round(position.x)},${Math.round(position.y)}`;
}
