import {
  getBoundedPathDistance,
  isWalkablePosition,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
  reservePositionForFrame,
  updateEntity,
  type GameState,
} from "./state";
import type { SimulationTiming } from "./simulationTiming";
import {
  chooseAttackSlot,
  rememberAttackSlot,
  type AttackSlotPathDistanceCache,
} from "./attackSlots";
import { getPartyLeader } from "./partySystem";
import { attackDefenderTarget } from "./defenderCombat";
import {
  getDefenderAnchorPosition,
  getLeaderEnemyTarget,
  getLeaderMovementDirection,
  getPartyExecutionIntentPosition,
} from "./roleSystem";
import {
  getActiveQuestGuide,
  QUEST_GUIDE_ESCORT_RANGE,
} from "./questGuideSystem";
import { getActivePartyThreatTarget } from "./partyThreatSystem";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { isCombatPositionSpacedFromParty } from "./partySpacing";
import type { Companion, Enemy, GameEntity, Position } from "./types";

const DEFENDER_CATCH_UP_DISTANCE = 3;
const DEFENDER_CATCH_UP_SPEED_MULTIPLIER = 2;
const DEFENDER_ATTACK_RANGE = 1;
const DEFENDER_MAX_LEADER_DISTANCE = 4;
const DEFENDER_INTERCEPT_READY_DISTANCE = 1;
const DEFENDER_LEADER_WAIT_MS = 300;
const DEFENDER_BLOCKED_FALLBACK_MS = 300;
const DEFENDER_MAX_PREFERRED_LEADER_DISTANCE = 2;
const DEFENDER_MAX_ATTACK_SLOT_PATH_DISTANCE = 4;
const DEFENDER_LEADER_SAFE_ATTACK_SLOT_DISTANCE = 2;
const DEFENDER_LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE = 3;
const DEFENDER_ANCHOR_SEARCH_RADIUS = 2;
const DEFENDER_ANCHOR_MAX_PATH_DISTANCE = 6;

export function updateDefendSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
  timing: SimulationTiming = {
    nowMs: Date.now(),
    deltaMs: 100,
    deltaSeconds: 0.1,
    frameNumber: state.simulationFrame ?? state.simulationTick ?? 0,
  },
  pathDistanceCache?: AttackSlotPathDistanceCache,
): GameState {
  let nextState = state;
  const now = timing.nowMs;
  const waitingLeaderIds = new Set<string>();
  const resetLeaderWaitIds = new Set<string>();

  for (const entity of Object.values(state.entities)) {
    const defender = nextState.entities[entity.id];

    if (
      !isDefendingCompanion(defender) ||
      isCompanionAssignedToResurrectionRecovery(nextState, defender.id) ||
      movedEntityIds.has(defender.id)
    ) {
      continue;
    }

    if (isFormationTravelMovementActive(nextState)) {
      continue;
    }

    const leader = getDefenderLeader(nextState, defender);
    const preferredDefendPosition = getDefenderAnchorPosition(nextState, defender);
    const defendPosition = leader
      ? getValidDefenderAnchorPosition(
          nextState,
          defender,
          leader,
          preferredDefendPosition,
        )
      : null;
    const target = leader
      ? getDefenderTarget(nextState, leader)
      : undefined;
    const shouldWaitForIntercept =
      target &&
      leader &&
      defendPosition &&
      shouldLeaderWaitForDefender(nextState, defender, leader, defendPosition);

    if (shouldWaitForIntercept) {
      waitingLeaderIds.add(leader.id);
      movedEntityIds.add(leader.id);
    } else if (
      leader &&
      (!target ||
        !defendPosition ||
        !isWithinLeaderLeash(defender, leader) ||
        getGridDistance(defender.position, defendPosition) <=
          DEFENDER_INTERCEPT_READY_DISTANCE)
    ) {
      resetLeaderWaitIds.add(leader.id);
    }

    const syncedDefender = target
      ? {
          ...defender,
          currentTargetId: target.id,
        }
      : defender;

    if (target && defender.currentTargetId !== target.id) {
      nextState = updateEntity(nextState, syncedDefender);
    }

    if (
      target &&
      isInAttackRange(syncedDefender, target)
    ) {
      if (
        !isCombatPositionSpacedFromParty(
          nextState,
          syncedDefender,
          syncedDefender.position,
        )
      ) {
        const spacedSlotState = moveDefenderTowardRequiredSpacedAttackSlot(
          nextState,
          syncedDefender,
          target,
          pathDistanceCache,
        );

        if (spacedSlotState !== nextState) {
          nextState = updateDefenderBlockedMs(spacedSlotState, syncedDefender.id, false);
          movedEntityIds.add(syncedDefender.id);
          continue;
        }
      }

      nextState = attackDefenderTarget(nextState, syncedDefender, target, now);
      nextState = updateDefenderBlockedMs(nextState, syncedDefender.id, false);
      continue;
    }

    if (target) {
      nextState = updateEntity(nextState, syncedDefender);
      nextState = moveDefenderTowardCommittedTarget(
        nextState,
        syncedDefender,
        target,
        leader,
        defendPosition ?? leader?.position ?? defender.position,
        Boolean(
          shouldWaitForIntercept ||
            (leader && (nextState.defenderWaitMsByLeaderId?.[leader.id] ?? 0) > 0),
        ),
        pathDistanceCache,
      );
      if (
        didEntityMove(nextState, defender) ||
        shouldHoldDefenderLine(nextState, syncedDefender, leader, target)
      ) {
        movedEntityIds.add(defender.id);
      }
      continue;
    }

    if (syncedDefender.currentTargetId) {
      nextState = updateEntity(nextState, {
        ...syncedDefender,
        currentTargetId: null,
      });
    }

    if (
      defendPosition &&
      getGridDistance(defender.position, defendPosition) >
        DEFENDER_INTERCEPT_READY_DISTANCE
    ) {
      const currentDefender = nextState.entities[defender.id];

      if (isDefendingCompanion(currentDefender)) {
        nextState = moveDefenderTowardPosition(
          nextState,
          currentDefender,
          defendPosition,
          false,
        );
        if (didEntityMove(nextState, currentDefender)) {
          movedEntityIds.add(defender.id);
        }
      }
    }

    nextState = updateDefenderBlockedMs(nextState, defender.id, false);
  }

  for (const leaderId of waitingLeaderIds) {
    nextState = updateLeaderWait(nextState, leaderId, true);
  }

  for (const leaderId of resetLeaderWaitIds) {
    if (!waitingLeaderIds.has(leaderId)) {
      nextState = updateLeaderWait(nextState, leaderId, false);
    }
  }

  return nextState;
}

function getValidDefenderAnchorPosition(
  state: GameState,
  defender: Companion,
  leader: GameEntity,
  preferredPosition: Position,
): Position | null {
  if (isReachableDefenderAnchor(state, defender, preferredPosition)) {
    return preferredPosition;
  }

  const frontDirection = getFrontDirection(leader, preferredPosition);

  return getAnchorCandidates(preferredPosition, DEFENDER_ANCHOR_SEARCH_RADIUS)
    .filter((position) => isReachableDefenderAnchor(state, defender, position))
    .sort(
      (a, b) =>
        getBehindLeaderPenalty(a, leader, frontDirection) -
          getBehindLeaderPenalty(b, leader, frontDirection) ||
        getGridDistance(a, preferredPosition) -
          getGridDistance(b, preferredPosition) ||
        getGridDistance(a, defender.position) -
          getGridDistance(b, defender.position) ||
        a.y - b.y ||
        a.x - b.x,
    )[0] ?? null;
}

function isReachableDefenderAnchor(
  state: GameState,
  defender: Companion,
  position: Position,
): boolean {
  return (
    isWalkablePosition(state, position, defender.id) &&
    getBoundedPathDistance(
      state,
      defender,
      position,
      DEFENDER_ANCHOR_MAX_PATH_DISTANCE,
    ) !== null
  );
}

function getAnchorCandidates(center: Position, radius: number): Position[] {
  const positions: Position[] = [];

  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      positions.push({ x, y });
    }
  }

  return positions;
}

function getFrontDirection(leader: GameEntity, preferredPosition: Position): Position {
  const direction = {
    x: Math.sign(preferredPosition.x - leader.position.x),
    y: Math.sign(preferredPosition.y - leader.position.y),
  };

  if (direction.x !== 0 || direction.y !== 0) {
    return direction;
  }

  return direction;
}

function getBehindLeaderPenalty(
  position: Position,
  leader: GameEntity,
  frontDirection: Position,
): number {
  if (frontDirection.x === 0 && frontDirection.y === 0) {
    return 0;
  }

  const offset = {
    x: position.x - leader.position.x,
    y: position.y - leader.position.y,
  };

  return offset.x * frontDirection.x + offset.y * frontDirection.y < 0 ? 1 : 0;
}

function didEntityMove(state: GameState, entity: GameEntity): boolean {
  const currentEntity = state.entities[entity.id];

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

function getDefenderTarget(
  state: GameState,
  leader: GameEntity,
): Enemy | undefined {
  const leaderTarget = getLeaderEnemyTarget(state, leader);

  if (leaderTarget && isRelevantGuideEscortThreat(state, leaderTarget)) {
    return leaderTarget;
  }

  const activeThreatTarget = getActivePartyThreatTarget(state);

  return activeThreatTarget && isRelevantGuideEscortThreat(state, activeThreatTarget)
    ? activeThreatTarget
    : undefined;
}

function isRelevantGuideEscortThreat(
  state: GameState,
  enemy: Enemy,
): boolean {
  const guide = getActiveQuestGuide(state);

  return (
    !guide ||
    getGridDistance(enemy.position, guide.position) <= QUEST_GUIDE_ESCORT_RANGE
  );
}

function isWithinLeaderLeash(
  defender: Companion,
  leader: GameEntity | undefined,
): boolean {
  return Boolean(
    leader &&
      getGridDistance(defender.position, leader.position) <=
        DEFENDER_MAX_LEADER_DISTANCE,
  );
}

function isInAttackRange(defender: Companion, target: Enemy): boolean {
  return getGridDistance(defender.position, target.position) <= DEFENDER_ATTACK_RANGE;
}

function shouldLeaderWaitForDefender(
  state: GameState,
  defender: Companion,
  leader: GameEntity,
  defendPosition: Position,
): boolean {
  if (leader.kind === "companion" && leader.commandPriority === "direct") {
    return false;
  }

  if (!isWithinLeaderLeash(defender, leader)) {
    return false;
  }

  if (canLeaderStepTowardDefender(state, leader, defender)) {
    return false;
  }

  if (
    getGridDistance(defender.position, defendPosition) <=
    DEFENDER_INTERCEPT_READY_DISTANCE
  ) {
    return false;
  }

  return (state.defenderWaitMsByLeaderId?.[leader.id] ?? 0) <
    DEFENDER_LEADER_WAIT_MS;
}

function updateLeaderWait(
  state: GameState,
  leaderId: string,
  shouldWait: boolean,
): GameState {
  const waitMs = { ...(state.defenderWaitMsByLeaderId ?? {}) };

  if (!shouldWait) {
    if (!waitMs[leaderId]) {
      return state;
    }

    delete waitMs[leaderId];

    return {
      ...state,
      defenderWaitMsByLeaderId: waitMs,
    };
  }

  waitMs[leaderId] = (waitMs[leaderId] ?? 0) + (state.simulationDeltaMs ?? 100);

  return {
    ...state,
    defenderWaitMsByLeaderId: waitMs,
  };
}

function moveDefenderTowardCommittedTarget(
  state: GameState,
  defender: Companion,
  target: Enemy,
  leader: GameEntity | undefined,
  fallbackPosition: Position,
  useInterceptBoost: boolean,
  pathDistanceCache?: AttackSlotPathDistanceCache,
): GameState {
  const blockedMs = state.defenderBlockedMsByEntityId?.[defender.id] ?? 0;

  if (blockedMs >= DEFENDER_BLOCKED_FALLBACK_MS) {
    return moveDefenderTowardPosition(
      updateDefenderBlockedMs(state, defender.id, false),
      defender,
      fallbackPosition,
      false,
    );
  }

  if (isInAttackRange(defender, target)) {
    return updateDefenderBlockedMs(state, defender.id, false);
  }

  if (shouldHoldDefenderLine(state, defender, leader, target)) {
    return updateDefenderBlockedMs(state, defender.id, false);
  }

  const attackPosition = chooseAttackSlot(
    state,
    defender,
    target.position,
    DEFENDER_ATTACK_RANGE,
    {
      maxPathDistance: DEFENDER_MAX_ATTACK_SLOT_PATH_DISTANCE,
      leader,
      leaderSafeDistance: DEFENDER_LEADER_SAFE_ATTACK_SLOT_DISTANCE,
      leaderMaxPathDistance: DEFENDER_LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE,
      nowMs: state.simulationTimeMs,
      pathDistanceCache,
      partySpacingMode: "prefer",
      targetId: target.id,
    },
  );

  if (!attackPosition) {
    return moveDefenderTowardPosition(
      updateDefenderBlockedMs(state, defender.id, false),
      defender,
      fallbackPosition,
      false,
    );
  }

  const movementOptions = {
    pathProfile: "combatSlot" as const,
    pathTargetKey: `defender-combat:${target.id}:${getPositionPathKey(attackPosition)}`,
    pathTargetPosition: attackPosition,
    speedMultiplier: getCommittedTargetSpeedMultiplier(
      state,
      defender,
      target,
      leader,
      useInterceptBoost,
    ),
  };
  const slotState = rememberAttackSlot(
    state,
    defender,
    target.position,
    DEFENDER_ATTACK_RANGE,
    attackPosition,
    {
      nowMs: state.simulationTimeMs,
      targetId: target.id,
    },
  );
  const nextPosition = previewMoveTowardPosition(
    reservePositionForFrame(slotState, defender.id, attackPosition),
    defender,
    attackPosition,
    movementOptions,
  );

  if (
    nextPosition &&
    wouldExceedDefenderLineAtPosition(
      state,
      nextPosition,
      defender,
      leader,
      target,
    )
  ) {
    return updateDefenderBlockedMs(state, defender.id, false);
  }

  const nextState = moveEntityTowardPositionIfUnoccupied(
    reservePositionForFrame(slotState, defender.id, attackPosition),
    defender,
    attackPosition,
    movementOptions,
  );

  const movedDefender = nextState.entities[defender.id];

  if (!isDefendingCompanion(movedDefender) || !didEntityMove(nextState, defender)) {
    return updateDefenderBlockedMs(nextState, defender.id, true);
  }

  return updateDefenderBlockedMs(nextState, defender.id, false);
}

function moveDefenderTowardRequiredSpacedAttackSlot(
  state: GameState,
  defender: Companion,
  target: Enemy,
  pathDistanceCache?: AttackSlotPathDistanceCache,
): GameState {
  const attackPosition = chooseAttackSlot(
    state,
    defender,
    target.position,
    DEFENDER_ATTACK_RANGE,
    {
      maxPathDistance: DEFENDER_MAX_ATTACK_SLOT_PATH_DISTANCE,
      nowMs: state.simulationTimeMs,
      pathDistanceCache,
      partySpacingMode: "required",
      targetId: target.id,
    },
  );

  if (!attackPosition || isSamePosition(defender.position, attackPosition)) {
    return state;
  }

  const movementOptions = {
    pathProfile: "combatSlot" as const,
    pathTargetKey: `defender-combat:${target.id}:${getPositionPathKey(attackPosition)}`,
    pathTargetPosition: attackPosition,
  };
  const slotState = rememberAttackSlot(
    state,
    defender,
    target.position,
    DEFENDER_ATTACK_RANGE,
    attackPosition,
    {
      nowMs: state.simulationTimeMs,
      targetId: target.id,
    },
  );
  const nextState = moveEntityTowardPositionIfUnoccupied(
    reservePositionForFrame(slotState, defender.id, attackPosition),
    defender,
    attackPosition,
    movementOptions,
  );

  return didEntityMove(nextState, defender) ? nextState : state;
}

function getCommittedTargetSpeedMultiplier(
  state: GameState,
  defender: Companion,
  target: Enemy,
  leader: GameEntity | undefined,
  useInterceptBoost: boolean,
): number {
  if (
    !useInterceptBoost ||
    !leader ||
    !shouldBoostCommittedTargetStep(state, defender, leader, target)
  ) {
    return 1;
  }

  return DEFENDER_CATCH_UP_SPEED_MULTIPLIER;
}

function shouldBoostCommittedTargetStep(
  state: GameState,
  defender: Companion,
  leader: GameEntity,
  target: Enemy,
): boolean {
  return (
    getGridDistance(defender.position, target.position) >
      getGridDistance(leader.position, target.position) ||
    (leader.kind === "companion" && isBehindLeader(defender, leader, state))
  );
}

function shouldHoldDefenderLine(
  state: GameState,
  defender: Companion,
  leader: GameEntity | undefined,
  target: Enemy,
): boolean {
  return shouldHoldDefenderLineAtPosition(
    state,
    defender.position,
    defender,
    leader,
    target,
  );
}

function getDefenderLeader(
  state: GameState,
  defender: Companion,
): GameEntity | undefined {
  return getPartyLeader(state) ?? state.entities[defender.followTargetId];
}

function shouldHoldDefenderLineAtPosition(
  state: GameState,
  defenderPosition: Position,
  defender: Companion,
  leader: GameEntity | undefined,
  target: Enemy,
): boolean {
  if (!leader) {
    return false;
  }

  return (
    getGridDistance(defenderPosition, leader.position) >
      DEFENDER_MAX_PREFERRED_LEADER_DISTANCE &&
    getGridDistance(defenderPosition, target.position) <
      getGridDistance(leader.position, target.position) &&
    !canLeaderStepTowardDefender(state, leader, defender)
  );
}

function wouldExceedDefenderLineAtPosition(
  state: GameState,
  defenderPosition: Position,
  defender: Companion,
  leader: GameEntity | undefined,
  target: Enemy,
): boolean {
  if (!leader) {
    return false;
  }

  return (
    getGridDistance(defenderPosition, leader.position) >
      DEFENDER_MAX_PREFERRED_LEADER_DISTANCE &&
    getGridDistance(defenderPosition, target.position) <
      getGridDistance(leader.position, target.position) &&
    !canLeaderStepTowardDefender(state, leader, defender)
  );
}

function canLeaderStepTowardDefender(
  state: GameState,
  leader: GameEntity,
  defender: Companion,
): boolean {
  if (leader.kind !== "companion" || leader.commandPriority === "direct") {
    return true;
  }

  const nextPosition = previewMoveTowardPosition(state, leader, defender.position);

  if (nextPosition && !isSamePosition(nextPosition, leader.position)) {
    return true;
  }

  const stepTowardDefenderTrail = getStepTowardPosition(
    leader.position,
    defender.position,
  );

  return (
    !isSamePosition(stepTowardDefenderTrail, leader.position) &&
    (isSamePosition(stepTowardDefenderTrail, defender.position) ||
      isWalkablePosition(state, stepTowardDefenderTrail, leader.id))
  );
}

function getStepTowardPosition(from: Position, to: Position): Position {
  return {
    x: from.x + Math.sign(to.x - from.x),
    y: from.y + Math.sign(to.y - from.y),
  };
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function getPositionPathKey(position: Position): string {
  return `${Math.round(position.x)},${Math.round(position.y)}`;
}

function updateDefenderBlockedMs(
  state: GameState,
  defenderId: string,
  isBlocked: boolean,
): GameState {
  const blockedMs = { ...(state.defenderBlockedMsByEntityId ?? {}) };

  if (!isBlocked) {
    if (!blockedMs[defenderId]) {
      return state;
    }

    delete blockedMs[defenderId];

    return {
      ...state,
      defenderBlockedMsByEntityId: blockedMs,
    };
  }

  blockedMs[defenderId] = (blockedMs[defenderId] ?? 0) + (state.simulationDeltaMs ?? 100);

  return {
    ...state,
    defenderBlockedMsByEntityId: blockedMs,
  };
}

function moveDefenderTowardPosition(
  state: GameState,
  defender: Companion,
  targetPosition: Position,
  useInterceptBoost = false,
): GameState {
  const speedMultiplier = getDefenderSpeedMultiplier(
    state,
    defender,
    targetPosition,
    useInterceptBoost,
  );

  if (
    defender.position.x === targetPosition.x &&
    defender.position.y === targetPosition.y
  ) {
    return state;
  }

  return moveEntityTowardPositionIfUnoccupied(
    state,
    defender,
    targetPosition,
    {
      pathProfile: "follow",
      pathTargetKey: `defender-position:${getPositionPathKey(targetPosition)}`,
      pathTargetPosition: targetPosition,
      speedMultiplier,
    },
  );
}

function getDefenderSpeedMultiplier(
  state: GameState,
  defender: Companion,
  targetPosition: Position,
  useInterceptBoost: boolean,
): number {
  const followTarget = state.entities[defender.followTargetId];

  if (followTarget?.kind !== "companion") {
    return 1;
  }

  const distanceToIntent = getGridDistance(defender.position, targetPosition);
  const canCatchUp =
    useInterceptBoost &&
    distanceToIntent >= DEFENDER_CATCH_UP_DISTANCE &&
    isBehindLeader(defender, followTarget, state);

  if (!canCatchUp) {
    return 1;
  }

  return DEFENDER_CATCH_UP_SPEED_MULTIPLIER;
}

function isBehindLeader(
  defender: Companion,
  leader: Companion,
  state: GameState,
): boolean {
  const movementDirection = getLeaderMovementDirection(state, leader);

  if (movementDirection.x === 0 && movementDirection.y === 0) {
    return false;
  }

  const partyIntentPosition = getPartyExecutionIntentPosition(state, leader);
  const offsetFromIntentX = defender.position.x - partyIntentPosition.x;
  const offsetFromIntentY = defender.position.y - partyIntentPosition.y;

  return (
    offsetFromIntentX * movementDirection.x +
      offsetFromIntentY * movementDirection.y <
    0
  );
}

function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function isDefendingCompanion(entity: Companion | object): entity is Companion {
  return (
    "kind" in entity &&
    entity.kind === "companion" &&
    "role" in entity &&
    entity.role === "defender" &&
    "state" in entity &&
    entity.state === "defend" &&
    "commandPriority" in entity &&
    entity.commandPriority !== "direct"
  );
}

function isFormationTravelMovementActive(state: GameState): boolean {
  return (
    state.partyFormation?.phase === "forming" ||
    state.partyFormation?.phase === "traveling"
  );
}
