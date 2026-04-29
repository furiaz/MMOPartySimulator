import { damageEntity, setLastAttackAt } from "./entities";
import {
  moveEntityTowardIfUnoccupied,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
  updateEntity,
  type GameState,
} from "./state";
import {
  getDefenderAnchorPosition,
  getLeaderEnemyTarget,
  getLeaderIntentPosition,
  getLeaderMovementDirection,
} from "./roleSystem";
import type { Companion, Enemy, GameEntity, Player, Position } from "./types";

const DEFENDER_CATCH_UP_DISTANCE = 3;
const MAX_DEFENDER_MOVE_STEPS = 3;
const DEFENDER_ATTACK_RANGE = 1;
const DEFENDER_ATTACK_DAMAGE = 1;
const DEFENDER_ATTACK_COOLDOWN_MS = 1000;
const DEFENDER_GUARD_RADIUS = 3;
const DEFENDER_MAX_LEADER_DISTANCE = 4;
const DEFENDER_INTERCEPT_READY_DISTANCE = 1;
const DEFENDER_LEADER_WAIT_TICKS = 3;
const DEFENDER_BLOCKED_FALLBACK_TICKS = 3;
const DEFENDER_MAX_PREFERRED_LEADER_DISTANCE = 2;

export function updateDefendSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const now = Date.now();
  const waitingLeaderIds = new Set<string>();
  const resetLeaderWaitIds = new Set<string>();

  for (const entity of Object.values(state.entities)) {
    const defender = nextState.entities[entity.id];

    if (
      !isDefendingCompanion(defender) ||
      movedEntityIds.has(defender.id)
    ) {
      continue;
    }

    const leader = nextState.entities[defender.followTargetId];
    const defendPosition = getDefenderAnchorPosition(nextState, defender);
    const target = leader
      ? getDefenderTarget(nextState, defender, leader, defendPosition)
      : undefined;
    const shouldWaitForIntercept =
      target &&
      leader &&
      shouldLeaderWaitForDefender(nextState, defender, leader, defendPosition);

    if (shouldWaitForIntercept) {
      waitingLeaderIds.add(leader.id);
      movedEntityIds.add(leader.id);
    } else if (
      leader &&
      (!target ||
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
      nextState = attackDefenderTarget(nextState, syncedDefender, target, now);
      nextState = updateDefenderBlockedTicks(nextState, syncedDefender.id, false);
      continue;
    }

    if (target) {
      nextState = updateEntity(nextState, syncedDefender);
      nextState = moveDefenderTowardCommittedTarget(
        nextState,
        syncedDefender,
        target,
        leader,
        defendPosition,
        Boolean(shouldWaitForIntercept),
      );
      movedEntityIds.add(defender.id);
      continue;
    }

    let guardDefender = syncedDefender;

    if (
      !target &&
      (guardDefender.currentTargetId ||
        guardDefender.position.x !== defendPosition.x ||
        guardDefender.position.y !== defendPosition.y)
    ) {
      guardDefender = {
        ...guardDefender,
        currentTargetId: null,
      };

      nextState = updateEntity(nextState, guardDefender);
    }

    nextState = updateDefenderBlockedTicks(nextState, guardDefender.id, false);

    if (
      defender.position.x === defendPosition.x &&
      defender.position.y === defendPosition.y
    ) {
      continue;
    }

    nextState = moveDefenderTowardPosition(
      nextState,
      guardDefender,
      defendPosition,
      Boolean(shouldWaitForIntercept),
    );
    movedEntityIds.add(defender.id);
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

function attackDefenderTarget(
  state: GameState,
  defender: Companion,
  target: Enemy,
  now: number,
): GameState {
  if (now - defender.lastAttackAt < DEFENDER_ATTACK_COOLDOWN_MS) {
    return updateEntity(state, {
      ...defender,
      currentTargetId: target.id,
    });
  }

  const damagedTarget = damageEntity(target, DEFENDER_ATTACK_DAMAGE);
  const updatedDefender = setLastAttackAt({
    ...defender,
    currentTargetId: damagedTarget.state === "dead" ? null : target.id,
  }, now);

  let nextState = updateEntity(state, damagedTarget);

  if (damagedTarget.state !== "dead") {
    nextState = updateEntity(nextState, {
      ...damagedTarget,
      state: "attack",
      currentTargetId: defender.id,
    });
  }

  return updateEntity(nextState, updatedDefender);
}

function getDefenderTarget(
  state: GameState,
  defender: Companion,
  leader: GameEntity,
  defendPosition: Position,
): Enemy | undefined {
  const leaderTarget = getLeaderEnemyTarget(state, leader);

  if (leaderTarget) {
    return leaderTarget;
  }

  const enemyAttackingLeader = Object.values(state.entities).find(
    (entity): entity is Enemy =>
      isLiveEnemy(entity) &&
      entity.state === "attack" &&
      entity.currentTargetId === leader.id &&
      getGridDistance(entity.position, leader.position) <=
        DEFENDER_MAX_LEADER_DISTANCE,
  );

  if (enemyAttackingLeader) {
    return enemyAttackingLeader;
  }

  return Object.values(state.entities).find(
    (entity): entity is Enemy =>
      isLiveEnemy(entity) &&
      isEnemyRelevantToGuard(defender, leader, defendPosition, entity),
  );
}

function isEnemyRelevantToGuard(
  defender: Companion,
  leader: GameEntity,
  defendPosition: Position,
  enemy: Enemy,
): boolean {
  return (
    getGridDistance(enemy.position, defender.position) <=
      DEFENDER_GUARD_RADIUS ||
    getGridDistance(enemy.position, leader.position) <=
      DEFENDER_GUARD_RADIUS ||
    getGridDistance(enemy.position, defendPosition) <= DEFENDER_GUARD_RADIUS
  );
}

function isLiveEnemy(entity: GameEntity | undefined): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    entity.state !== "dead" &&
    entity.health > 0
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
  if (leader.kind === "player" && leader.commandPriority === "direct") {
    return false;
  }

  if (!isWithinLeaderLeash(defender, leader)) {
    return false;
  }

  if (
    getGridDistance(defender.position, defendPosition) <=
    DEFENDER_INTERCEPT_READY_DISTANCE
  ) {
    return false;
  }

  return (state.defenderWaitTicksByLeaderId?.[leader.id] ?? 0) <
    DEFENDER_LEADER_WAIT_TICKS;
}

function updateLeaderWait(
  state: GameState,
  leaderId: string,
  shouldWait: boolean,
): GameState {
  const waitTicks = { ...(state.defenderWaitTicksByLeaderId ?? {}) };

  if (!shouldWait) {
    if (!waitTicks[leaderId]) {
      return state;
    }

    delete waitTicks[leaderId];

    return {
      ...state,
      defenderWaitTicksByLeaderId: waitTicks,
    };
  }

  waitTicks[leaderId] = (waitTicks[leaderId] ?? 0) + 1;

  return {
    ...state,
    defenderWaitTicksByLeaderId: waitTicks,
  };
}

function moveDefenderTowardCommittedTarget(
  state: GameState,
  defender: Companion,
  target: Enemy,
  leader: GameEntity | undefined,
  fallbackPosition: Position,
  useInterceptBoost: boolean,
): GameState {
  const blockedTicks = state.defenderBlockedTicksByEntityId?.[defender.id] ?? 0;

  if (blockedTicks >= DEFENDER_BLOCKED_FALLBACK_TICKS) {
    return moveDefenderTowardPosition(
      updateDefenderBlockedTicks(state, defender.id, false),
      defender,
      fallbackPosition,
      false,
    );
  }

  let nextState = state;
  const stepCount = getCommittedTargetStepCount(
    state,
    defender,
    target,
    leader,
    useInterceptBoost,
  );

  for (let step = 0; step < stepCount; step += 1) {
    const currentDefender = nextState.entities[defender.id];

    if (!isDefendingCompanion(currentDefender)) {
      break;
    }

    if (isInAttackRange(currentDefender, target)) {
      break;
    }

    if (shouldHoldDefenderLine(currentDefender, leader, target)) {
      break;
    }

    const nextPosition = previewMoveTowardPosition(
      nextState,
      currentDefender,
      target.position,
    );

    if (
      nextPosition &&
      wouldExceedDefenderLineAtPosition(nextPosition, leader, target)
    ) {
      break;
    }

    const previousPosition = currentDefender.position;

    nextState = moveEntityTowardIfUnoccupied(
      nextState,
      currentDefender,
      target,
    );

    const movedDefender = nextState.entities[defender.id];

    if (
      !isDefendingCompanion(movedDefender) ||
      (movedDefender.position.x === previousPosition.x &&
        movedDefender.position.y === previousPosition.y)
    ) {
      return updateDefenderBlockedTicks(nextState, defender.id, true);
    }
  }

  return updateDefenderBlockedTicks(nextState, defender.id, false);
}

function getCommittedTargetStepCount(
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

  return getDefenderStepCount(state, defender, target.position, true);
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
    (leader.kind === "player" && isBehindLeader(defender, leader, state))
  );
}

function shouldHoldDefenderLine(
  defender: Companion,
  leader: GameEntity | undefined,
  target: Enemy,
): boolean {
  return shouldHoldDefenderLineAtPosition(defender.position, leader, target);
}

function shouldHoldDefenderLineAtPosition(
  defenderPosition: Position,
  leader: GameEntity | undefined,
  target: Enemy,
): boolean {
  if (!leader) {
    return false;
  }

  return (
    getGridDistance(defenderPosition, leader.position) >=
      DEFENDER_MAX_PREFERRED_LEADER_DISTANCE &&
    getGridDistance(defenderPosition, target.position) <
      getGridDistance(leader.position, target.position)
  );
}

function wouldExceedDefenderLineAtPosition(
  defenderPosition: Position,
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
      getGridDistance(leader.position, target.position)
  );
}

function updateDefenderBlockedTicks(
  state: GameState,
  defenderId: string,
  isBlocked: boolean,
): GameState {
  const blockedTicks = { ...(state.defenderBlockedTicksByEntityId ?? {}) };

  if (!isBlocked) {
    if (!blockedTicks[defenderId]) {
      return state;
    }

    delete blockedTicks[defenderId];

    return {
      ...state,
      defenderBlockedTicksByEntityId: blockedTicks,
    };
  }

  blockedTicks[defenderId] = (blockedTicks[defenderId] ?? 0) + 1;

  return {
    ...state,
    defenderBlockedTicksByEntityId: blockedTicks,
  };
}

function moveDefenderTowardPosition(
  state: GameState,
  defender: Companion,
  targetPosition: Position,
  useInterceptBoost = false,
): GameState {
  let nextState = state;
  const stepCount = getDefenderStepCount(
    state,
    defender,
    targetPosition,
    useInterceptBoost,
  );

  for (let step = 0; step < stepCount; step += 1) {
    const currentDefender = nextState.entities[defender.id];

    if (!isDefendingCompanion(currentDefender)) {
      break;
    }

    if (
      currentDefender.position.x === targetPosition.x &&
      currentDefender.position.y === targetPosition.y
    ) {
      break;
    }

    const previousPosition = currentDefender.position;

    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      currentDefender,
      targetPosition,
    );

    const movedDefender = nextState.entities[defender.id];

    if (
      !isDefendingCompanion(movedDefender) ||
      (movedDefender.position.x === previousPosition.x &&
        movedDefender.position.y === previousPosition.y)
    ) {
      break;
    }
  }

  return nextState;
}

function getDefenderStepCount(
  state: GameState,
  defender: Companion,
  targetPosition: Position,
  useInterceptBoost: boolean,
): number {
  const followTarget = state.entities[defender.followTargetId];

  if (followTarget?.kind !== "player") {
    return useInterceptBoost ? 2 : 1;
  }

  const distanceToIntent = getGridDistance(defender.position, targetPosition);

  if (distanceToIntent < DEFENDER_CATCH_UP_DISTANCE) {
    return useInterceptBoost ? 2 : 1;
  }

  if (!isBehindLeader(defender, followTarget, state)) {
    return Math.min(useInterceptBoost ? 3 : 2, MAX_DEFENDER_MOVE_STEPS);
  }

  return Math.min(
    useInterceptBoost ? MAX_DEFENDER_MOVE_STEPS + 1 : MAX_DEFENDER_MOVE_STEPS,
    distanceToIntent,
  );
}

function isBehindLeader(
  defender: Companion,
  leader: Player,
  state: GameState,
): boolean {
  const movementDirection = getLeaderMovementDirection(state, leader);

  if (movementDirection.x === 0 && movementDirection.y === 0) {
    return false;
  }

  const leaderIntent = getLeaderIntentPosition(state, leader);
  const offsetFromIntentX = defender.position.x - leaderIntent.x;
  const offsetFromIntentY = defender.position.y - leaderIntent.y;

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
