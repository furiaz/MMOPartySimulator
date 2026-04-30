import { damageEntity, setLastAttackAt } from "./entities";
import {
  addCombatFeedback,
  getBoundedPathDistance,
  isWalkablePosition,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
  reservePositionForTick,
  updateEntity,
  type GameState,
} from "./state";
import { chooseAttackSlot } from "./attackSlots";
import {
  getDefenderAnchorPosition,
  getLeaderEnemyTarget,
  getLeaderIntentPosition,
  getLeaderMovementDirection,
} from "./roleSystem";
import type { Companion, Enemy, GameEntity, Player, Position } from "./types";

const DEFENDER_CATCH_UP_DISTANCE = 3;
const DEFENDER_CATCH_UP_MOVE_STEPS = 2;
const DEFENDER_ATTACK_RANGE = 1;
const DEFENDER_ATTACK_DAMAGE = 1;
const DEFENDER_ATTACK_COOLDOWN_MS = 1000;
const DEFENDER_GUARD_RADIUS = 3;
const DEFENDER_MAX_LEADER_DISTANCE = 4;
const DEFENDER_INTERCEPT_READY_DISTANCE = 1;
const DEFENDER_LEADER_WAIT_TICKS = 3;
const DEFENDER_BLOCKED_FALLBACK_TICKS = 3;
const DEFENDER_MAX_PREFERRED_LEADER_DISTANCE = 2;
const DEFENDER_MAX_ATTACK_SLOT_PATH_DISTANCE = 4;
const DEFENDER_LEADER_SAFE_ATTACK_SLOT_DISTANCE = 2;
const DEFENDER_LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE = 3;
const DEFENDER_ANCHOR_SEARCH_RADIUS = 2;
const DEFENDER_ANCHOR_MAX_PATH_DISTANCE = 6;

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
    const preferredDefendPosition = getDefenderAnchorPosition(nextState, defender);
    const defendPosition = leader
      ? getValidDefenderAnchorPosition(
          nextState,
          defender,
          leader,
          preferredDefendPosition,
        )
      : null;
    const targetAnchorPosition =
      defendPosition ?? leader?.position ?? defender.position;
    const target = leader
      ? getDefenderTarget(nextState, defender, leader, targetAnchorPosition)
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
        defendPosition ?? leader?.position ?? defender.position,
        Boolean(shouldWaitForIntercept),
      );
      if (didEntityMove(nextState, defender) || shouldHoldDefenderLine(syncedDefender, leader, target)) {
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

    nextState = updateDefenderBlockedTicks(nextState, defender.id, false);
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

  if (leader.kind === "player") {
    return { x: 0, y: 0 };
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

  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: defender.id,
    text: "Attack",
    now,
  });
  nextState = addCombatFeedback(nextState, {
    type: "damage",
    entityId: damagedTarget.id,
    text: `-${DEFENDER_ATTACK_DAMAGE} HP`,
    now,
  });

  if (damagedTarget.state === "dead") {
    nextState = addCombatFeedback(nextState, {
      type: "death",
      entityId: damagedTarget.id,
      text: "Defeated",
      now,
    });
  }

  nextState = updateEntity(nextState, damagedTarget);

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

    const attackPosition = chooseAttackSlot(
      nextState,
      currentDefender,
      target.position,
      DEFENDER_ATTACK_RANGE,
      {
        maxPathDistance: DEFENDER_MAX_ATTACK_SLOT_PATH_DISTANCE,
        leader,
        leaderSafeDistance: DEFENDER_LEADER_SAFE_ATTACK_SLOT_DISTANCE,
        leaderMaxPathDistance: DEFENDER_LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE,
      },
    );

    if (!attackPosition) {
      return moveDefenderTowardPosition(
        updateDefenderBlockedTicks(nextState, defender.id, false),
        currentDefender,
        fallbackPosition,
        false,
      );
    }

    const movementTarget = attackPosition;
    const nextPosition = previewMoveTowardPosition(
      reservePositionForTick(nextState, currentDefender.id, attackPosition),
      currentDefender,
      movementTarget,
    );

    if (
      nextPosition &&
      wouldExceedDefenderLineAtPosition(nextPosition, leader, target)
    ) {
      break;
    }

    const previousPosition = currentDefender.position;

    nextState = moveEntityTowardPositionIfUnoccupied(
      reservePositionForTick(nextState, currentDefender.id, attackPosition),
      currentDefender,
      attackPosition,
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

  return Math.min(
    DEFENDER_CATCH_UP_MOVE_STEPS,
    getGridDistance(defender.position, target.position),
  );
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

  return Math.min(DEFENDER_CATCH_UP_MOVE_STEPS, distanceToIntent);
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
