import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isCombatEntity } from "./entities";
import { getSoftFollowPosition, isStackedWithPartyMember } from "./partySpacing";
import {
  getPartyLeader,
  getPartyMembers,
  isGathererBusy,
  isPartyMember,
  type PartyMember,
} from "./partySystem";
import { captureInterruptedPoiTarget } from "./poiResumeSystem";
import {
  getEntityById,
  moveEntityTowardPositionIfUnoccupied,
  setLeaderIntent,
  updateEntity,
  type GameState,
} from "./state";
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
  isAggroInterruption: boolean;
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

  if (!leader || leader.state === "dead" || leader.commandPriority === "direct") {
    return clearFormation(state);
  }

  const plan = getPartyPlan(state, leader);

  if (!plan.targetPosition) {
    return clearFinishedCombat(clearFormation(state));
  }

  let nextState = plan.isAggroInterruption && plan.target
    ? captureInterruptedPoiTarget(state, plan.target)
    : state;

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
  const aggroTarget = getPartyAggroTarget(state);
  const intentTarget = getIntentEnemyTarget(state);
  const leaderTarget = getLeaderEnemyTarget(state, leader);
  const target = aggroTarget ?? intentTarget ?? leaderTarget;
  const targetPosition =
    target?.position ??
    state.leaderIntent?.targetPosition ??
    null;
  const phase =
    target && getDistance(leader.position, target.position) <= COMBAT_BREAK_DISTANCE
      ? "combat"
      : "traveling";

  return {
    phase,
    target,
    targetPosition,
    isAggroInterruption: Boolean(aggroTarget),
  };
}

function assignPartyTravelTargets(
  state: GameState,
  leader: PartyMember,
  plan: PartyPlan,
): GameState {
  const isGatherIntent =
    !plan.target &&
    state.leaderIntent?.type === "gather" &&
    Boolean(state.leaderIntent.targetId);
  let nextState = setLeaderIntent(state, {
    type: plan.target ? "attack" : (state.leaderIntent?.type ?? "move"),
    targetId: plan.target?.id ?? state.leaderIntent?.targetId ?? null,
    targetPosition: plan.targetPosition,
    source: state.leaderIntent?.source,
  });

  const currentLeader = getEntityById(nextState, leader.id);

  if (currentLeader && isPartyMember(currentLeader)) {
    nextState = updateEntity(nextState, {
      ...currentLeader,
      state: isGatherIntent ? "gather" : "follow",
      currentTargetId:
        plan.target?.id ??
        (isGatherIntent ? state.leaderIntent?.targetId ?? null : null),
      commandPriority: "autonomous",
    });
  }

  if (isGatherIntent) {
    return assignPartyGatherTarget(
      nextState,
      state.leaderIntent?.targetId ?? null,
    );
  }

  for (const member of getPartyMembers(nextState)) {
    if (
      member.id === leader.id ||
      member.commandPriority === "direct" ||
      isGathererBusy(nextState, member)
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

  if (!targetId) {
    return nextState;
  }

  for (const member of getPartyMembers(nextState)) {
    if (member.commandPriority === "direct") {
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

function assignPartyCombatTarget(state: GameState, targetId: string): GameState {
  let nextState = setLeaderIntent(state, {
    type: "attack",
    targetId,
    targetPosition: getEntityById(state, targetId)?.position ?? null,
    source: state.leaderIntent?.source,
  });

  for (const member of getPartyMembers(nextState)) {
    if (member.commandPriority === "direct" || isGathererBusy(nextState, member)) {
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
    { allowPartyPassThrough: true, speedMultiplier },
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

  if (state.leaderIntent?.type === "gather" && state.leaderIntent.targetId) {
    return state;
  }

  return setLeaderIntent(clearFormationTarget(state), null);
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

  return setLeaderIntent(nextState, null);
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
  if (member.commandPriority === "direct") {
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

function getPartyAggroTarget(state: GameState): Enemy | null {
  for (const enemy of Object.values(state.entities)) {
    if (!isLiveEnemy(enemy) || enemy.state !== "attack" || !enemy.currentTargetId) {
      continue;
    }

    const target = state.entities[enemy.currentTargetId];

    if (isPartyMember(target)) {
      return enemy;
    }
  }

  return null;
}

function getIntentEnemyTarget(state: GameState): Enemy | null {
  const target = state.leaderIntent?.targetId
    ? state.entities[state.leaderIntent.targetId]
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
      (teleport) => getDistance(position, teleport.position) <= 0,
    ),
  );
}
