import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isCombatEntity } from "./entities";
import { chooseAttackSlot } from "./attackSlots";
import {
  getBoundedPathDistance,
  getEntityById,
  isWalkablePosition,
  moveEntityTowardPositionIfUnoccupied,
  reservePositionForTick,
  setLeaderIntent,
  updateEntity,
  type GameState,
} from "./state";
import type {
  Companion,
  Enemy,
  FormationPhase,
  GameEntity,
  PartyFormationState,
  Player,
  Position,
} from "./types";

const ENGAGEMENT_PATH_DISTANCE = 3;
const ENGAGEMENT_EXIT_PATH_DISTANCE = 6;
const FORMATION_READY_DISTANCE = 1;
const ATTACK_RANGE = 1;
const FORMATION_SLOT_SEARCH_RADIUS = 2;
const FORMATION_SLOT_MAX_MEMBER_PATH_DISTANCE = 8;
const FORMATION_SLOT_MAX_ANCHOR_PATH_DISTANCE = 5;
const DETOUR_HEAVY_DISTANCE_DELTA = 4;

type FormationPlan = {
  target: Enemy | null;
  approachPoint: Position | null;
  direction: Position;
  slotsByEntityId: Record<string, Position>;
  slotReasonsByEntityId: Record<string, string>;
  skippedTargetIds: string[];
};

export function updatePartyFormationSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  const leader = getPartyLeader(state);

  if (!leader || leader.commandPriority === "direct" || leader.state === "dead") {
    return clearFormation(state);
  }

  const aggroTarget = getPartyAggroTarget(state, leader.id);
  const plan = getFormationPlan(state, leader, aggroTarget);

  if (!plan.target || !plan.approachPoint) {
    return clearFormationTarget(state, leader, plan);
  }

  const phase = getNextFormationPhase(state, leader, plan, Boolean(aggroTarget));
  let nextState = setFormationState(state, phase, plan);

  nextState = setLeaderIntent(nextState, {
    type: "attack",
    targetId: plan.target.id,
    targetPosition: plan.approachPoint,
  });

  nextState = updateEntity(nextState, {
    ...leader,
    state: phase === "combat" || phase === "engaging" ? "attack" : "follow",
    currentTargetId: plan.target.id,
    commandPriority: "autonomous",
  });

  if (phase === "combat") {
    return updatePartyTarget(nextState, leader.id, plan.target.id, phase);
  }

  nextState = updatePartyTarget(nextState, leader.id, plan.target.id, phase);
  nextState = reserveFormationSlots(nextState, plan.slotsByEntityId);
  nextState = movePartyInFormation(nextState, leader.id, phase, plan, movedEntityIds);

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

function clearFormationTarget(
  state: GameState,
  leader: Player,
  plan: FormationPlan,
): GameState {
  let nextState = setFormationState(state, "idle", plan);

  if (leader.currentTargetId || leader.state === "attack") {
    nextState = updateEntity(nextState, {
      ...leader,
      state: "follow",
      currentTargetId: null,
      commandPriority: "autonomous",
    });
  }

  return setLeaderIntent(nextState, null);
}

function getFormationPlan(
  state: GameState,
  leader: Player,
  forcedTarget: Enemy | null,
): FormationPlan {
  const skippedTargetIds: string[] = [];
  const target = forcedTarget ?? getStickyOrClosestEnemy(state, leader, skippedTargetIds);

  if (!target) {
    return {
      target: null,
      approachPoint: null,
      direction: { x: 0, y: 0 },
      slotsByEntityId: {},
      slotReasonsByEntityId: {},
      skippedTargetIds,
    };
  }

  const approachPoint = getReachableApproachPoint(state, leader, target);

  if (!approachPoint) {
    skippedTargetIds.push(target.id);
    return getFormationPlanWithoutSkippedTargets(state, leader, skippedTargetIds);
  }

  const path = getPathToPosition(state, leader, approachPoint, leader.id);
  const direction = getPathDirection(leader.position, path[1] ?? approachPoint);
  const anchor = getFormationAnchor(state, leader, direction);
  const formationSlots = getFormationSlots(
    state,
    leader,
    anchor,
    direction,
    approachPoint,
  );

  return {
    target,
    approachPoint,
    direction,
    slotsByEntityId: formationSlots.slotsByEntityId,
    slotReasonsByEntityId: formationSlots.slotReasonsByEntityId,
    skippedTargetIds,
  };
}

function getFormationPlanWithoutSkippedTargets(
  state: GameState,
  leader: Player,
  skippedTargetIds: string[],
): FormationPlan {
  const target = getClosestReachableEnemy(state, leader, skippedTargetIds);

  if (!target) {
    return {
      target: null,
      approachPoint: null,
      direction: { x: 0, y: 0 },
      slotsByEntityId: {},
      slotReasonsByEntityId: {},
      skippedTargetIds,
    };
  }

  const approachPoint = getReachableApproachPoint(state, leader, target);

  if (!approachPoint) {
    skippedTargetIds.push(target.id);
    return getFormationPlanWithoutSkippedTargets(state, leader, skippedTargetIds);
  }

  const path = getPathToPosition(state, leader, approachPoint, leader.id);
  const direction = getPathDirection(leader.position, path[1] ?? approachPoint);
  const anchor = getFormationAnchor(state, leader, direction);
  const formationSlots = getFormationSlots(
    state,
    leader,
    anchor,
    direction,
    approachPoint,
  );

  return {
    target,
    approachPoint,
    direction,
    slotsByEntityId: formationSlots.slotsByEntityId,
    slotReasonsByEntityId: formationSlots.slotReasonsByEntityId,
    skippedTargetIds,
  };
}

function getNextFormationPhase(
  state: GameState,
  leader: Player,
  plan: FormationPlan,
  isAggroTarget: boolean,
): FormationPhase {
  if (isAggroTarget) {
    return "combat";
  }

  if (!plan.target || !plan.approachPoint) {
    return "idle";
  }

  const currentPhase = state.partyFormation?.phase ?? "idle";
  const leadEntity = getFormationLeadEntity(state, leader.id);
  if (
    leadEntity &&
    getGridDistance(leadEntity.position, plan.target.position) <= ATTACK_RANGE
  ) {
    return "combat";
  }

  const leadDistance = leadEntity
    ? getBoundedPathDistance(
        state,
        leadEntity,
        plan.approachPoint,
        ENGAGEMENT_PATH_DISTANCE,
      )
    : null;

  if (
    currentPhase === "engaging" &&
    leadEntity &&
    getBoundedPathDistance(
      state,
      leadEntity,
      plan.approachPoint,
      ENGAGEMENT_EXIT_PATH_DISTANCE,
    ) !== null
  ) {
    return "engaging";
  }

  if (leadDistance !== null) {
    return "engaging";
  }

  if (currentPhase !== "traveling" && !isFormationReady(state, plan.slotsByEntityId)) {
    return "forming";
  }

  return "traveling";
}

function setFormationState(
  state: GameState,
  phase: FormationPhase,
  plan: FormationPlan,
): GameState {
  const previousFormation = state.partyFormation ?? createIdleFormation();
  const nextFormation: PartyFormationState = {
    phase,
    targetId: plan.target?.id ?? null,
    approachPoint: plan.approachPoint,
    direction: plan.direction,
    slotsByEntityId: plan.slotsByEntityId,
    slotReasonsByEntityId: plan.slotReasonsByEntityId,
    skippedTargetIds: plan.skippedTargetIds,
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

  for (const skippedTargetId of plan.skippedTargetIds) {
    if (previousFormation.skippedTargetIds.includes(skippedTargetId)) {
      continue;
    }

    nextState = appendDebugTelemetryEvent(nextState, {
      type: "target_skipped",
      entityId: "party",
      targetId: skippedTargetId,
      reason: "unreachable approach point",
    });
  }

  return nextState;
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

function updatePartyTarget(
  state: GameState,
  leaderId: string,
  targetId: string,
  phase: FormationPhase,
): GameState {
  let nextState = state;

  for (const entity of getPartyMembers(state, leaderId)) {
    if (
      entity.id === leaderId ||
      entity.kind !== "companion" ||
      entity.commandPriority === "direct"
    ) {
      continue;
    }

    if (entity.role === "gatherer" && entity.state === "gather") {
      continue;
    }

    if (phase === "combat" && entity.role !== "defender") {
      nextState = updateEntity(nextState, {
        ...entity,
        state: "attack",
        currentTargetId: targetId,
        commandPriority: "autonomous",
      });
      continue;
    }

    nextState = updateEntity(nextState, {
      ...entity,
      state: entity.role === "defender" ? "defend" : "follow",
      currentTargetId: entity.role === "defender" ? targetId : leaderId,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

function reserveFormationSlots(
  state: GameState,
  slotsByEntityId: Record<string, Position>,
): GameState {
  let nextState = state;

  for (const [entityId, position] of Object.entries(slotsByEntityId)) {
    nextState = reservePositionForTick(nextState, entityId, position, {
      allowPartyPassThrough: true,
    });
  }

  return nextState;
}

function movePartyInFormation(
  state: GameState,
  leaderId: string,
  phase: FormationPhase,
  plan: FormationPlan,
  movedEntityIds: Set<string>,
): GameState {
  let nextState = state;
  const allowPartyPassThrough = phase === "forming";
  const leader = getEntityById(nextState, leaderId);
  const leadEntity = leader?.kind === "player"
    ? getFormationLeadEntity(nextState, leader.id)
    : undefined;

  if (phase === "engaging" && plan.target) {
    return movePartyIntoEngagement(nextState, leaderId, plan, movedEntityIds);
  }

  if (phase === "traveling" && leadEntity && plan.approachPoint) {
    const previousPosition = leadEntity.position;

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      leadEntity,
      plan.approachPoint,
      { allowPartyPassThrough },
    );

    const movedLeadEntity = getEntityById(nextState, leadEntity.id);

    if (movedLeadEntity && !isSamePosition(movedLeadEntity.position, previousPosition)) {
      movedEntityIds.add(leadEntity.id);
    }
  }

  for (const [entityId, slot] of Object.entries(plan.slotsByEntityId)) {
    if (movedEntityIds.has(entityId)) {
      continue;
    }

    const entity = getEntityById(nextState, entityId);

    if (!entity || !canMoveInFormation(entity, leaderId)) {
      continue;
    }

    if (shouldFollowLineTrailDuringTravel(entity)) {
      continue;
    }

    const previousPosition = entity.position;

    nextState = moveEntityTowardPositionIfUnoccupied(nextState, entity, slot, {
      allowPartyPassThrough,
    });

    const movedEntity = getEntityById(nextState, entity.id);

    if (movedEntity && !isSamePosition(movedEntity.position, previousPosition)) {
      movedEntityIds.add(entity.id);
    }
  }

  return nextState;
}

function shouldFollowLineTrailDuringTravel(entity: Player | Companion): boolean {
  return entity.kind === "companion" && entity.role !== "defender";
}

function movePartyIntoEngagement(
  state: GameState,
  leaderId: string,
  plan: FormationPlan,
  movedEntityIds: Set<string>,
): GameState {
  let nextState = state;

  if (!plan.target) {
    return nextState;
  }

  for (const entity of getPartyMembers(nextState, leaderId)) {
    const currentEntity = getEntityById(nextState, entity.id);

    if (
      !currentEntity ||
      movedEntityIds.has(currentEntity.id) ||
      !canMoveInEngagement(currentEntity, leaderId)
    ) {
      continue;
    }

    const attackSlot = chooseAttackSlot(
      nextState,
      currentEntity,
      plan.target.position,
      ATTACK_RANGE,
      { maxPathDistance: ENGAGEMENT_EXIT_PATH_DISTANCE },
    );

    if (!attackSlot) {
      continue;
    }

    const previousPosition = currentEntity.position;

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      currentEntity,
      attackSlot,
    );

    const movedEntity = getEntityById(nextState, currentEntity.id);

    if (movedEntity && !isSamePosition(movedEntity.position, previousPosition)) {
      movedEntityIds.add(currentEntity.id);
    }
  }

  return nextState;
}

function canMoveInEngagement(
  entity: GameEntity,
  leaderId: string,
): entity is Player | Companion {
  if (entity.state === "dead") {
    return false;
  }

  if (entity.kind === "player") {
    return entity.id === leaderId && entity.commandPriority !== "direct";
  }

  return (
    entity.kind === "companion" &&
    entity.followTargetId === leaderId &&
    entity.commandPriority !== "direct" &&
    entity.state !== "gather"
  );
}

function canMoveInFormation(
  entity: GameEntity,
  leaderId: string,
): entity is Player | Companion {
  if (entity.state === "dead") {
    return false;
  }

  if (entity.kind === "player") {
    return entity.id === leaderId && entity.commandPriority !== "direct";
  }

  return (
    entity.kind === "companion" &&
    entity.followTargetId === leaderId &&
    entity.commandPriority !== "direct" &&
    entity.state !== "gather"
  );
}

function getPartyLeader(state: GameState): Player | undefined {
  return Object.values(state.entities).find(
    (entity): entity is Player => entity.kind === "player" && entity.state !== "dead",
  );
}

function getPartyMembers(state: GameState, leaderId: string): (Player | Companion)[] {
  return Object.values(state.entities).filter(
    (entity): entity is Player | Companion =>
      entity.state !== "dead" &&
      (entity.id === leaderId ||
        (entity.kind === "companion" && entity.followTargetId === leaderId)),
  );
}

function getFormationLeadEntity(
  state: GameState,
  leaderId: string,
): Player | Companion | undefined {
  const defenders = getOrderedCompanions(state, leaderId, "defender");

  if (defenders.length > 0) {
    return defenders[0];
  }

  const leader = state.entities[leaderId];
  return leader?.kind === "player" ? leader : undefined;
}

function getFormationAnchor(
  state: GameState,
  leader: Player,
  direction: Position,
): Position {
  const leadEntity = getFormationLeadEntity(state, leader.id);

  if (leadEntity && leadEntity.id !== leader.id) {
    return subtractPosition(leadEntity.position, direction);
  }

  return leader.position;
}

function getFormationSlots(
  state: GameState,
  leader: Player,
  anchor: Position,
  direction: Position,
  approachPoint: Position,
): {
  slotsByEntityId: Record<string, Position>;
  slotReasonsByEntityId: Record<string, string>;
} {
  const idealSlotsByEntityId: Record<string, Position> = {};
  const defenders = getOrderedCompanions(state, leader.id, "defender");
  const fighters = getOrderedCompanions(state, leader.id, "fighter");
  const gatherers = getOrderedCompanions(state, leader.id, "gatherer");

  if (defenders.length === 0) {
    idealSlotsByEntityId[leader.id] = addPosition(anchor, direction);
  } else {
    idealSlotsByEntityId[leader.id] = anchor;
    assignRoleSlots(idealSlotsByEntityId, defenders, anchor, direction, [
      { forward: 1, side: 0 },
      { forward: 1, side: -1 },
      { forward: 1, side: 1 },
      { forward: 2, side: -1 },
      { forward: 2, side: 1 },
    ]);
  }

  assignRoleSlots(
    idealSlotsByEntityId,
    fighters,
    anchor,
    direction,
    getLineOffsets(-1, fighters.length),
  );
  assignRoleSlots(
    idealSlotsByEntityId,
    gatherers,
    anchor,
    direction,
    getLineOffsets(-1 - fighters.length, gatherers.length),
  );

  return resolveFormationSlots(
    state,
    idealSlotsByEntityId,
    anchor,
    direction,
    approachPoint,
  );
}

function assignRoleSlots(
  slotsByEntityId: Record<string, Position>,
  companions: Companion[],
  anchor: Position,
  direction: Position,
  offsets: { forward: number; side: number }[],
): void {
  companions.forEach((companion, index) => {
    const offset = offsets[index] ?? {
      forward: offsets[offsets.length - 1]?.forward ?? 0,
      side: index,
    };
    slotsByEntityId[companion.id] = getOffsetPosition(anchor, direction, offset);
  });
}

function getLineOffsets(
  firstForwardOffset: number,
  count: number,
): { forward: number; side: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    forward: firstForwardOffset - index,
    side: 0,
  }));
}

function resolveFormationSlots(
  state: GameState,
  idealSlotsByEntityId: Record<string, Position>,
  anchor: Position,
  direction: Position,
  approachPoint: Position,
): {
  slotsByEntityId: Record<string, Position>;
  slotReasonsByEntityId: Record<string, string>;
} {
  const slotsByEntityId: Record<string, Position> = {};
  const slotReasonsByEntityId: Record<string, string> = {};
  const usedPositions: Position[] = [];

  for (const [entityId, idealSlot] of Object.entries(idealSlotsByEntityId)) {
    const entity = state.entities[entityId];

    if (!entity) {
      continue;
    }

    const slot = getBestFormationSlot(
      state,
      entity,
      idealSlot,
      anchor,
      direction,
      approachPoint,
      usedPositions,
    );

    slotsByEntityId[entityId] = slot.position;
    slotReasonsByEntityId[entityId] = slot.reason;
    usedPositions.push(slot.position);
  }

  return { slotsByEntityId, slotReasonsByEntityId };
}

function getBestFormationSlot(
  state: GameState,
  entity: GameEntity,
  idealSlot: Position,
  anchor: Position,
  direction: Position,
  approachPoint: Position,
  usedPositions: Position[],
): { position: Position; reason: string } {
  const previousSlot = state.partyFormation?.slotsByEntityId[entity.id];
  const candidates = getFormationSlotCandidates(
    idealSlot,
    anchor,
    direction,
    previousSlot,
  )
    .filter((candidate) =>
      isFormationSlotCandidateValid(state, entity, candidate, usedPositions),
    )
    .map((candidate) => ({
      position: candidate.position,
      reason: candidate.reason,
      score: scoreFormationSlotCandidate(
        state,
        entity,
        candidate.position,
        idealSlot,
        anchor,
        approachPoint,
        previousSlot,
      ),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.position.y - b.position.y ||
        a.position.x - b.position.x,
    );

  return candidates[0] ?? {
    position: entity.position,
    reason: "current position fallback",
  };
}

function getFormationSlotCandidates(
  idealSlot: Position,
  anchor: Position,
  direction: Position,
  previousSlot: Position | undefined,
): { position: Position; reason: string }[] {
  const candidates: { position: Position; reason: string }[] = [
    { position: idealSlot, reason: "ideal" },
  ];

  if (previousSlot) {
    candidates.push({ position: previousSlot, reason: "previous slot" });
  }

  for (let radius = 1; radius <= FORMATION_SLOT_SEARCH_RADIUS; radius += 1) {
    for (const position of getPositionRing(idealSlot, radius)) {
      candidates.push({ position, reason: "nearby fallback" });
    }
  }

  for (let distance = 0; distance <= 4; distance += 1) {
    candidates.push({
      position: getOffsetPosition(anchor, direction, {
        forward: -distance,
        side: 0,
      }),
      reason: "compressed line",
    });
  }

  return dedupeCandidatePositions(candidates);
}

function isFormationSlotCandidateValid(
  state: GameState,
  entity: GameEntity,
  candidate: { position: Position },
  usedPositions: Position[],
): boolean {
  return (
    !usedPositions.some((position) => isSamePosition(position, candidate.position)) &&
    isWalkablePosition(state, candidate.position, entity.id, {
      allowPartyPassThrough: true,
    })
  );
}

function scoreFormationSlotCandidate(
  state: GameState,
  entity: GameEntity,
  candidate: Position,
  idealSlot: Position,
  anchor: Position,
  approachPoint: Position,
  previousSlot: Position | undefined,
): number {
  const memberPathDistance = getPathDistanceOrFallback(
    state,
    entity,
    candidate,
    FORMATION_SLOT_MAX_MEMBER_PATH_DISTANCE,
  );
  const anchorPathDistance = getPathDistanceBetweenPositionsOrFallback(
    state,
    anchor,
    candidate,
    entity.id,
    FORMATION_SLOT_MAX_ANCHOR_PATH_DISTANCE,
  );
  const approachPathDistance = getPathDistanceBetweenPositionsOrFallback(
    state,
    candidate,
    approachPoint,
    entity.id,
    FORMATION_SLOT_MAX_MEMBER_PATH_DISTANCE,
  );

  if (
    memberPathDistance === null ||
    anchorPathDistance === null ||
    approachPathDistance === null
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const idealGridDistance = getManhattanDistance(candidate, idealSlot);
  const anchorGridDistance = getManhattanDistance(candidate, anchor);
  const approachGridDistance = getManhattanDistance(candidate, approachPoint);
  const detourPenalty =
    Math.max(0, memberPathDistance - getManhattanDistance(entity.position, candidate)) +
    Math.max(0, anchorPathDistance - anchorGridDistance);
  const previousSlotBonus =
    previousSlot && isSamePosition(previousSlot, candidate) ? -4 : 0;
  const heavyDetourPenalty =
    detourPenalty >= DETOUR_HEAVY_DISTANCE_DELTA ? 20 : 0;

  return (
    idealGridDistance * 5 +
    memberPathDistance * 3 +
    anchorPathDistance * 4 +
    approachPathDistance +
    approachGridDistance +
    heavyDetourPenalty +
    detourPenalty * 4 +
    previousSlotBonus
  );
}
function getOrderedCompanions(
  state: GameState,
  leaderId: string,
  role: Companion["role"],
): Companion[] {
  return Object.values(state.entities)
    .filter(
      (entity): entity is Companion =>
        entity.kind === "companion" &&
        entity.followTargetId === leaderId &&
        entity.role === role &&
        entity.commandPriority !== "direct" &&
        entity.state !== "dead",
    )
    .sort(
      (a, b) =>
        getCompanionPartyNumber(a) - getCompanionPartyNumber(b) ||
        a.id.localeCompare(b.id),
    );
}

function getCompanionPartyNumber(companion: Companion): number {
  const match = companion.id.match(/(\d+)$/);

  return match ? Number(match[1]) : 1;
}

function getStickyOrClosestEnemy(
  state: GameState,
  leader: Player,
  skippedTargetIds: string[],
): Enemy | null {
  const currentTarget = leader.currentTargetId
    ? state.entities[leader.currentTargetId]
    : undefined;

  if (isLiveEnemy(currentTarget)) {
    const approachPoint = getReachableApproachPoint(state, leader, currentTarget);

    if (approachPoint) {
      return currentTarget;
    }

    skippedTargetIds.push(currentTarget.id);
  }

  return getClosestReachableEnemy(state, leader, skippedTargetIds);
}

function getClosestReachableEnemy(
  state: GameState,
  leader: Player,
  skippedTargetIds: string[],
): Enemy | null {
  return Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        isLiveEnemy(entity) && !skippedTargetIds.includes(entity.id),
    )
    .map((enemy) => ({
      enemy,
      approachPoint: getReachableApproachPoint(state, leader, enemy),
    }))
    .filter(
      (candidate): candidate is { enemy: Enemy; approachPoint: Position } =>
        Boolean(candidate.approachPoint),
    )
    .sort(
      (a, b) =>
        getManhattanDistance(leader.position, a.enemy.position) -
          getManhattanDistance(leader.position, b.enemy.position) ||
        a.enemy.id.localeCompare(b.enemy.id),
    )[0]?.enemy ?? null;
}

function getPartyAggroTarget(state: GameState, leaderId: string): Enemy | null {
  for (const enemy of Object.values(state.entities)) {
    if (!isLiveEnemy(enemy) || enemy.state !== "attack" || !enemy.currentTargetId) {
      continue;
    }

    const target = state.entities[enemy.currentTargetId];

    if (
      target?.id === leaderId ||
      (target?.kind === "companion" && target.followTargetId === leaderId)
    ) {
      return enemy;
    }
  }

  return null;
}

function getReachableApproachPoint(
  state: GameState,
  leader: Player,
  enemy: Enemy,
): Position | null {
  const preferredDirection = getCardinalDirection(leader.position, enemy.position);
  const candidates = getNeighborPositions(enemy.position)
    .filter((position) => isApproachPointWalkable(state, leader, position))
    .sort(
      (a, b) =>
        getFrontPreference(a, enemy.position, preferredDirection) -
          getFrontPreference(b, enemy.position, preferredDirection) ||
        getPathDistanceToPosition(state, leader, a) -
          getPathDistanceToPosition(state, leader, b) ||
        getManhattanDistance(leader.position, a) -
          getManhattanDistance(leader.position, b),
    );

  return candidates[0] ?? null;
}

function isApproachPointWalkable(
  state: GameState,
  leader: Player,
  position: Position,
): boolean {
  return (
    isWalkablePosition(state, position, leader.id, {
      allowPartyPassThrough: true,
    }) &&
    getPathToPosition(state, leader, position, leader.id).length > 0
  );
}

function getPathDistanceToPosition(
  state: GameState,
  leader: Player,
  position: Position,
): number {
  const path = getPathToPosition(state, leader, position, leader.id);

  return path.length > 0 ? path.length - 1 : Number.POSITIVE_INFINITY;
}

function getPathToPosition(
  state: GameState,
  entity: GameEntity,
  target: Position,
  ignoredEntityId: string,
): Position[] {
  if (!state.map) {
    return [entity.position, target];
  }

  const targetKey = getPositionKey(target);
  const startKey = getPositionKey(entity.position);
  const visited = new Set<string>([startKey]);
  const queue: { position: Position; path: Position[] }[] = [
    { position: entity.position, path: [entity.position] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (getPositionKey(current.position) === targetKey) {
      return current.path;
    }

    for (const neighbor of getNeighborPositions(current.position)) {
      const key = getPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isWalkablePosition(state, neighbor, ignoredEntityId, {
          allowPartyPassThrough: true,
        })
      ) {
        continue;
      }

      visited.add(key);
      queue.push({
        position: neighbor,
        path: [...current.path, neighbor],
      });
    }
  }

  return [];
}

function isFormationReady(
  state: GameState,
  slotsByEntityId: Record<string, Position>,
): boolean {
  const leader = getPartyLeader(state);

  return Object.entries(slotsByEntityId).every(([entityId, slot]) => {
    const entity = state.entities[entityId];

    if (!entity || !leader || !canMoveInFormation(entity, leader.id)) {
      return true;
    }

    return (
      getGridDistance(entity.position, slot) <= FORMATION_READY_DISTANCE
    );
  });
}

function isLiveEnemy(entity: GameEntity | undefined): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function getPathDistanceOrFallback(
  state: GameState,
  entity: GameEntity,
  target: Position,
  maxDistance: number,
): number | null {
  if (!state.map) {
    return getManhattanDistance(entity.position, target);
  }

  return getBoundedPathDistance(state, entity, target, maxDistance);
}

function getPathDistanceBetweenPositionsOrFallback(
  state: GameState,
  from: Position,
  to: Position,
  ignoredEntityId: string,
  maxDistance: number,
): number | null {
  if (!state.map) {
    return getManhattanDistance(from, to);
  }

  const path = getPathBetweenPositions(state, from, to, ignoredEntityId, maxDistance);

  return path.length > 0 ? path.length - 1 : null;
}

function getPathBetweenPositions(
  state: GameState,
  from: Position,
  to: Position,
  ignoredEntityId: string,
  maxDistance: number,
): Position[] {
  const targetKey = getPositionKey(to);
  const startKey = getPositionKey(from);
  const visited = new Set<string>([startKey]);
  const queue: { position: Position; path: Position[] }[] = [
    { position: from, path: [from] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (getPositionKey(current.position) === targetKey) {
      return current.path;
    }

    if (current.path.length - 1 >= maxDistance) {
      continue;
    }

    for (const neighbor of getNeighborPositions(current.position)) {
      const key = getPositionKey(neighbor);

      if (
        visited.has(key) ||
        !isWalkablePosition(state, neighbor, ignoredEntityId, {
          allowPartyPassThrough: true,
        })
      ) {
        continue;
      }

      visited.add(key);
      queue.push({
        position: neighbor,
        path: [...current.path, neighbor],
      });
    }
  }

  return [];
}

function getPathDirection(from: Position, to: Position): Position {
  return getCardinalDirection(from, to);
}

function getCardinalDirection(from: Position, to: Position): Position {
  const xDistance = to.x - from.x;
  const yDistance = to.y - from.y;

  if (Math.abs(xDistance) >= Math.abs(yDistance) && xDistance !== 0) {
    return { x: Math.sign(xDistance), y: 0 };
  }

  if (yDistance !== 0) {
    return { x: 0, y: Math.sign(yDistance) };
  }

  return { x: 0, y: 0 };
}

function getFrontPreference(
  position: Position,
  target: Position,
  direction: Position,
): number {
  const offset = subtractPosition(position, target);

  return offset.x === -direction.x && offset.y === -direction.y ? 0 : 1;
}

function getOffsetPosition(
  anchor: Position,
  direction: Position,
  offset: { forward: number; side: number },
): Position {
  const forward = direction.x === 0 && direction.y === 0
    ? { x: 0, y: 1 }
    : direction;
  const side = { x: -forward.y, y: forward.x };

  return {
    x: anchor.x + forward.x * offset.forward + side.x * offset.side,
    y: anchor.y + forward.y * offset.forward + side.y * offset.side,
  };
}

function addPosition(a: Position, b: Position): Position {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function subtractPosition(a: Position, b: Position): Position {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function getNeighborPositions(position: Position): Position[] {
  return [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];
}

function getPositionRing(center: Position, radius: number): Position[] {
  const positions: Position[] = [];

  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const position = { x, y };

      if (getManhattanDistance(center, position) !== radius) {
        continue;
      }

      positions.push(position);
    }
  }

  return positions;
}

function dedupeCandidatePositions(
  candidates: { position: Position; reason: string }[],
): { position: Position; reason: string }[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = getPositionKey(candidate.position);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getManhattanDistance(from: Position, to: Position): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}
