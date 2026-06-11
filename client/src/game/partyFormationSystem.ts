import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isCombatEntity } from "./entities";
import { isActiveResource } from "./entityGuards";
import { isInteractionTargetReached } from "./interactionApproach";
import { getSoftFollowPosition, isStackedWithPartyMember } from "./partySpacing";
import { getPartyExecutionIntentReachability } from "./partyOrderReachability";
import { captureInterruptedPoiTarget } from "./poiResumeSystem";
import {
  getPartyLeader,
  getPartyMembers,
  isPartyMember,
  isPartyMemberBusyGatheringResource,
  type PartyMember,
} from "./partySystem";
import { isPartyMemberRespondingToActiveThreat } from "./partyThreatSystem";
import { isTeleportWorking } from "./teleportState";
import {
  getActiveQuestGuide,
  getActiveQuestGuideObjectiveId,
  isQuestGuideObjectiveRelevant,
  isActiveRepairOrDefenseObjectiveRelevant,
} from "./questGuideSystem";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import {
  getEntityById,
  updateEntity,
  type GameState,
} from "./state";
import { moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import {
  getPartyExecutionIntent,
  hasDirectPlayerPartyIntent,
  setPartyExecutionIntent,
} from "./partyIntentState";
import { RESOURCE_INTERACTION_RANGE } from "./resourceInteraction";
import { getPartyMovementTargetPosition } from "./partyTargetSystem";
import {
  FOLLOW_DISTANCE,
  PARTY_COHESION_DISTANCE,
  PARTY_WAIT_DISTANCE,
  POI_REACHED_DISTANCE,
  canAssignPartyCombatTarget,
  canAssignPartyGatherTarget,
  canAssignPartyTravelTarget,
  isRequiredForTravelCohesion,
  resolvePartyActivityPlan,
  type PartyActivityPlan,
} from "./partyActivityCoordinator";
import type {
  Enemy,
  GameEntity,
  PartyFormationState,
  Position,
} from "./types";

export {
  COMBAT_BREAK_DISTANCE,
  FOLLOW_CATCHUP_DISTANCE,
  FOLLOW_DISTANCE,
  GATHERER_REJOIN_DISTANCE,
  PARTY_COHESION_DISTANCE,
  PARTY_WAIT_DISTANCE,
  POI_REACHED_DISTANCE,
} from "./partyActivityCoordinator";

const LEADER_COHESION_SLOW_SPEED_MULTIPLIER = 0.45;
const FOLLOWER_CATCH_UP_SPEED_MULTIPLIER = 1.8;
const ESCORT_GUIDE_HOLD_DISTANCE = 0.75;
const ESCORT_GUIDE_RESUME_DISTANCE = 1.25;

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

  const playerIntentClearedState = clearStalePlayerPartyIntent(state, leader);

  if (playerIntentClearedState !== state) {
    return playerIntentClearedState;
  }

  const gatherIntentClearedState = clearStaleGatherPartyIntent(state, leader);

  if (gatherIntentClearedState !== state) {
    return gatherIntentClearedState;
  }

  const plan = resolvePartyActivityPlan(state, leader);

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

  const smallObjectiveHoldActive = isSmallObjectiveHoldActive(
    nextState,
    leader.id,
    plan,
  );

  if (smallObjectiveHoldActive) {
    markSmallObjectiveHoldMembers(nextState, movedEntityIds);
  } else {
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

    nextState = moveFollowersTowardLeader(
      nextState,
      leader.id,
      movedEntityIds,
      plan,
    );
  }

  return consumeLeaderHandoffTick(
    maybeFinishReachedPoi(nextState, leader.id, plan),
    leader.id,
  );
}

function markSmallObjectiveHoldMembers(
  state: GameState,
  movedEntityIds: Set<string>,
): void {
  for (const member of getPartyMembers(state)) {
    if (
      member.state === "dead" ||
      member.commandPriority === "direct" ||
      isCompanionAssignedToResurrectionRecovery(state, member.id) ||
      isPartyMemberRespondingToActiveThreat(state, member) ||
      isPartyMemberBusyGatheringResource(state, member)
    ) {
      continue;
    }

    movedEntityIds.add(member.id);
  }
}

function isSmallObjectiveHoldActive(
  state: GameState,
  leaderId: string,
  plan: PartyActivityPlan,
): boolean {
  if (
    plan.phase !== "traveling" ||
    plan.target ||
    !isActiveRepairOrDefenseObjectiveRelevant(state)
  ) {
    return false;
  }

  const leader = getEntityById(state, leaderId);

  return Boolean(
    leader &&
      isPartyMember(leader) &&
      isLocalInteractionTargetReached(state, leader),
  );
}

function assignPartyTravelTargets(
  state: GameState,
  leader: PartyMember,
  plan: PartyActivityPlan,
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
    if (!canAssignPartyTravelTarget(nextState, member, leader.id, hasPlayerIntent)) {
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
    if (!canAssignPartyGatherTarget(nextState, member, hasPlayerIntent)) {
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

function clearStalePlayerPartyIntent(
  state: GameState,
  leader: PartyMember,
): GameState {
  if (!hasDirectPlayerPartyIntent(state)) {
    return state;
  }

  const executionIntent = getPartyExecutionIntent(state);

  if (!executionIntent) {
    return state;
  }

  const reachability = getPartyExecutionIntentReachability(
    state,
    leader,
    executionIntent,
    { allowBlockedMoveTarget: true },
  );

  if (reachability.reason === "valid") {
    return state;
  }

  let nextState = setPartyExecutionIntent(clearFormation(state), null);
  nextState = appendDebugTelemetryEvent(nextState, {
    type: "party_intent_canceled",
    entityId: leader.id,
    targetId: reachability.targetId,
    intendedPosition: reachability.targetPosition,
    reason: reachability.reason,
  });

  for (const member of getPartyMembers(nextState)) {
    if (
      member.commandPriority === "direct" ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id) ||
      isPartyMemberRespondingToActiveThreat(nextState, member) ||
      !isMemberAssignedToExecutionIntent(member, leader.id, executionIntent)
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

function isMemberAssignedToExecutionIntent(
  member: PartyMember,
  leaderId: string,
  executionIntent: NonNullable<ReturnType<typeof getPartyExecutionIntent>>,
): boolean {
  if (executionIntent.type === "move") {
    return (
      member.state === "follow" &&
      (member.id === leaderId
        ? member.currentTargetId === null
        : member.currentTargetId === leaderId)
    );
  }

  return (
    member.state === executionIntent.type &&
    member.currentTargetId === executionIntent.targetId
  );
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
    if (!canAssignPartyCombatTarget(nextState, member, hasPlayerIntent)) {
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
  plan: PartyActivityPlan,
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

  const escortGuide = getActiveEscortGuide(state);

  if (
    escortGuide &&
    plan.phase === "traveling" &&
    canHoldNearEscortGuide(state, leader) &&
    getDistance(leader.position, escortGuide.position) <=
      ESCORT_GUIDE_RESUME_DISTANCE
  ) {
    return state;
  }

  if (
    isLocalInteractionTargetReached(state, leader) ||
    getDistance(leader.position, plan.targetPosition) <=
    getPoiReachedDistance(state, plan)
  ) {
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

function getPoiReachedDistance(
  state: GameState,
  plan: PartyActivityPlan,
): number {
  if (isGatherPoiTarget(state, plan)) {
    return RESOURCE_INTERACTION_RANGE;
  }

  return POI_REACHED_DISTANCE;
}

function isGatherPoiTarget(
  state: GameState,
  plan: PartyActivityPlan,
): boolean {
  if (plan.target) {
    return false;
  }

  const executionIntent = getPartyExecutionIntent(state);
  const target = executionIntent?.targetId
    ? getEntityById(state, executionIntent.targetId)
    : undefined;

  return executionIntent?.type === "gather" && isActiveResource(target);
}

function moveFollowersTowardLeader(
  state: GameState,
  leaderId: string,
  movedEntityIds: Set<string>,
  plan: PartyActivityPlan,
): GameState {
  let nextState = state;
  const leader = getEntityById(nextState, leaderId);
  const escortGuide =
    plan.phase === "traveling" ? getActiveEscortGuide(nextState) : null;

  if (!leader || !isPartyMember(leader)) {
    return nextState;
  }

  for (const member of getPartyMembers(nextState)) {
    if (
      member.id === leader.id ||
      member.commandPriority === "direct" ||
      isCompanionAssignedToResurrectionRecovery(nextState, member.id) ||
      isPartyMemberRespondingToActiveThreat(nextState, member) ||
      isPartyMemberBusyGatheringResource(nextState, member) ||
      movedEntityIds.has(member.id)
    ) {
      continue;
    }

    const currentMember = getEntityById(nextState, member.id);

    if (!currentMember || !isPartyMember(currentMember)) {
      continue;
    }

    if (escortGuide && canHoldNearEscortGuide(nextState, currentMember)) {
      const escortGuideDistance = getDistance(
        currentMember.position,
        escortGuide.position,
      );

      if (
        shouldHoldNearEscortGuide(escortGuideDistance) &&
        !isStackedWithPartyMember(nextState, currentMember)
      ) {
        movedEntityIds.add(currentMember.id);
        continue;
      }
    }

    if (
      getDistance(currentMember.position, leader.position) <= FOLLOW_DISTANCE &&
      !isStackedWithPartyMember(nextState, currentMember)
    ) {
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
          getPartyMovementTargetPosition(nextState),
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
  plan: PartyActivityPlan,
): GameState {
  if (plan.target || !plan.targetPosition) {
    return state;
  }

  const leader = getEntityById(state, leaderId);

  if (
    !leader ||
    !isPartyMember(leader) ||
    !isLocalInteractionTargetReached(state, leader) &&
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

  if (isActiveRepairOrDefenseObjectiveRelevant(state)) {
    return state;
  }

  return setPartyExecutionIntent(clearFormationTarget(state), null);
}

function isLocalInteractionTargetReached(
  state: GameState,
  leader: PartyMember,
): boolean {
  const localTarget = state.localPoiTarget;

  return localTarget
    ? isInteractionTargetReached(state, leader, localTarget)
    : false;
}

function isActiveGuidePoi(state: GameState): boolean {
  return (
    isQuestGuideObjectiveRelevant(state) &&
    state.localPoiTarget?.objectiveId === getActiveQuestGuideObjectiveId(state)
  );
}

function getActiveEscortGuide(state: GameState): GameEntity | null {
  if (!isActiveGuidePoi(state)) {
    return null;
  }

  return getActiveQuestGuide(state);
}

function canHoldNearEscortGuide(state: GameState, member: PartyMember): boolean {
  return (
    member.state !== "dead" &&
    member.commandPriority !== "direct" &&
    !isCompanionAssignedToResurrectionRecovery(state, member.id) &&
    !isPartyMemberBusyGatheringResource(state, member) &&
    !isPartyMemberRespondingToActiveThreat(state, member)
  );
}

function shouldHoldNearEscortGuide(distance: number): boolean {
  if (distance <= ESCORT_GUIDE_HOLD_DISTANCE) {
    return true;
  }

  return distance <= ESCORT_GUIDE_RESUME_DISTANCE;
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

function setFormationState(state: GameState, plan: PartyActivityPlan): GameState {
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
