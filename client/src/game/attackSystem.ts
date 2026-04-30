import {
  damageEntity,
  isAutonomousEntity,
  isCombatEntity,
  setLastAttackAt,
} from "./entities";
import {
  addCombatFeedback,
  getEntityById,
  moveEntityTowardIfUnoccupied,
  moveEntityTowardPositionIfUnoccupied,
  reservePositionForTick,
  updateEntity,
  type GameState,
} from "./state";
import { chooseAttackSlot } from "./attackSlots";
import { protectLeader } from "./partyProtectionSystem";
import {
  getLeaderEnemyTarget,
  isDefenderAttackTargetRelevant,
} from "./roleSystem";
import type {
  AutonomousEntity,
  Companion,
  CombatEntity,
  Enemy,
  GameEntity,
  Player,
} from "./types";

type MovementResult = {
  state: GameState;
  didHold?: boolean;
};

const ATTACK_RANGE = 1;
const ATTACK_DAMAGE = 1;
const ATTACK_COOLDOWN_MS = 1000;
const PARTY_ASSIST_LEASH_RADIUS = 3;
const MAX_ATTACK_SLOT_PATH_DISTANCE = 5;
const LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE_SELF = 2;
const LEADER_SAFE_ATTACK_SLOT_DISTANCE = 3;
const LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE = 4;

export function updateAttackSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const now = Date.now();

  for (const entity of getCombatMovementOrder(state)) {
    const attacker = getEntityById(nextState, entity.id);

    if (!attacker || !isAttackingCombatEntity(attacker)) {
      continue;
    }

    if (!attacker.currentTargetId) {
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    const target = getEntityById(nextState, attacker.currentTargetId);

    if (!target) {
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    if (!isCombatEntity(target) || target.state === "dead") {
      nextState = updateEntity(nextState, finishAttack(nextState, attacker));
      continue;
    }

    if (
      isAutonomousDefender(attacker) &&
      !isDefenderAttackTargetRelevant(nextState, attacker, target)
    ) {
      nextState = updateEntity(nextState, switchToFollow(attacker));
      continue;
    }

    if (
      isAutonomousEntity(attacker) &&
      shouldRegroupPartyAttacker(nextState, attacker, target)
    ) {
      nextState = updateEntity(nextState, switchToFollow(attacker));
      continue;
    }

    if (isInAttackRange(attacker, target)) {
      if (!canAttack(attacker, now)) {
        continue;
      }

      const updatedTarget = updateTargetAfterDamage(target, attacker);
      const updatedAttacker = setLastAttackAt(attacker, now);

      nextState = addAttackFeedback(nextState, attacker, updatedTarget, now);
      nextState = updateEntity(
        nextState,
        updatedTarget,
      );
      if (isEnemy(attacker) && isPlayer(updatedTarget)) {
        nextState = protectLeader(nextState, updatedTarget, attacker);
      }
      nextState = updateEntity(
        nextState,
        updatedTarget.state === "dead"
          ? finishAttack(nextState, updatedAttacker)
          : updatedAttacker,
      );
      continue;
    }

    if (movedEntityIds.has(attacker.id)) {
      continue;
    }

    const movementResult = moveAttackerTowardCombatPosition(
      nextState,
      attacker,
      target,
    );

    nextState = movementResult.state;

    if (movementResult.didHold || didEntityMove(nextState, attacker)) {
      movedEntityIds.add(attacker.id);
    }
  }

  return nextState;
}

function getCombatMovementOrder(state: GameState): GameEntity[] {
  return [...Object.values(state.entities)].sort(
    (a, b) => getCombatOrderPriority(a) - getCombatOrderPriority(b),
  );
}

function getCombatOrderPriority(entity: GameEntity): number {
  if (entity.kind === "player") {
    return 0;
  }

  if (entity.kind === "companion" && entity.role === "fighter") {
    return 1;
  }

  if (entity.kind === "companion" && entity.role === "gatherer") {
    return 2;
  }

  if (entity.kind === "companion") {
    return 2;
  }

  return 3;
}

function moveAttackerTowardCombatPosition(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): MovementResult {
  const movementTarget = getCombatMovementTarget(state, attacker, target);

  if (
    !shouldUseAttackSlot(attacker, target, movementTarget)
  ) {
    return {
      state: moveEntityTowardIfUnoccupied(state, attacker, movementTarget),
    };
  }

  const attackPosition = chooseAttackSlot(
    state,
    attacker,
    target.position,
    ATTACK_RANGE,
    {
      maxPathDistance: getAttackSlotPathLimit(attacker),
      leader: getAttackSlotLeader(state, attacker),
      leaderSafeDistance: LEADER_SAFE_ATTACK_SLOT_DISTANCE,
      leaderMaxPathDistance: LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE,
    },
  );

  if (!attackPosition) {
    return moveAttackerTowardSafeFallback(state, attacker, movementTarget);
  }

  return {
    state: moveEntityTowardPositionIfUnoccupied(
      reservePositionForTick(state, attacker.id, attackPosition),
      attacker,
      attackPosition,
    ),
  };
}

function moveAttackerTowardSafeFallback(
  state: GameState,
  attacker: CombatEntity,
  movementTarget: CombatEntity,
): MovementResult {
  const leader = getAttackSlotLeader(state, attacker);

  if (leader && movementTarget.id !== leader.id) {
    return {
      state: moveEntityTowardIfUnoccupied(state, attacker, leader),
    };
  }

  if (movementTarget.id !== attacker.id && movementTarget.id !== attacker.currentTargetId) {
    return {
      state: moveEntityTowardIfUnoccupied(state, attacker, movementTarget),
    };
  }

  return { state, didHold: true };
}

function didEntityMove(state: GameState, entity: GameEntity): boolean {
  const currentEntity = getEntityById(state, entity.id);

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

function addAttackFeedback(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  now: number,
): GameState {
  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: attacker.id,
    text: "Attack",
    now,
  });

  nextState = addCombatFeedback(nextState, {
    type: "damage",
    entityId: target.id,
    text: `-${ATTACK_DAMAGE} HP`,
    now,
  });

  if (target.state === "dead") {
    nextState = addCombatFeedback(nextState, {
      type: "death",
      entityId: target.id,
      text: "Defeated",
      now,
    });
  }

  return nextState;
}

function isAttackingCombatEntity(entity: GameEntity): entity is CombatEntity {
  return isCombatEntity(entity) && entity.state === "attack";
}

function isInAttackRange(attacker: GameEntity, target: GameEntity): boolean {
  const xDistance = Math.abs(target.position.x - attacker.position.x);
  const yDistance = Math.abs(target.position.y - attacker.position.y);

  return xDistance <= ATTACK_RANGE && yDistance <= ATTACK_RANGE;
}

function getAttackSlotPathLimit(attacker: CombatEntity): number {
  return attacker.kind === "player"
    ? LEADER_MAX_ATTACK_SLOT_PATH_DISTANCE_SELF
    : MAX_ATTACK_SLOT_PATH_DISTANCE;
}

function shouldUseAttackSlot(
  attacker: CombatEntity,
  target: CombatEntity,
  movementTarget: CombatEntity,
): boolean {
  if (
    attacker.kind === "player" &&
    movementTarget.id !== target.id &&
    getGridDistance(attacker.position, target.position) > ATTACK_RANGE + 1
  ) {
    return false;
  }

  return (
    isPartyCombatEntity(attacker) &&
    isEnemy(target) &&
    (movementTarget.id === target.id ||
      getGridDistance(attacker.position, target.position) <=
        PARTY_ASSIST_LEASH_RADIUS ||
      getGridDistance(movementTarget.position, target.position) <=
        PARTY_ASSIST_LEASH_RADIUS)
  );
}

function getAttackSlotLeader(
  state: GameState,
  attacker: CombatEntity,
): GameEntity | undefined {
  if (attacker.kind !== "companion") {
    return undefined;
  }

  return state.entities[attacker.followTargetId];
}

function canAttack(entity: CombatEntity, now: number): boolean {
  return now - entity.lastAttackAt >= ATTACK_COOLDOWN_MS;
}

function updateTargetAfterDamage(
  target: CombatEntity,
  attacker: CombatEntity,
): CombatEntity {
  const damagedTarget = damageEntity(target, ATTACK_DAMAGE);

  if (
    !isEnemy(damagedTarget) ||
    damagedTarget.state === "dead" ||
    !isAutonomousEntity(attacker)
  ) {
    return damagedTarget;
  }

  const enemy: Enemy = {
    ...damagedTarget,
    state: "attack",
    currentTargetId: attacker.id,
  };

  return enemy;
}

function getCombatMovementTarget(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): CombatEntity {
  if (!isAutonomousEntity(attacker) || attacker.commandPriority === "direct") {
    return target;
  }

  if (attacker.kind === "player" && isEnemy(target)) {
    return findLeadingDefender(state, attacker.id, target.id) ?? target;
  }

  if (attacker.kind === "companion" && attacker.role === "fighter") {
    const leader = state.entities[attacker.followTargetId];
    const leaderTarget = leader ? getLeaderEnemyTarget(state, leader) : undefined;

    if (leaderTarget?.id === target.id && isCombatEntity(leader)) {
      return leader;
    }
  }

  if (
    attacker.kind === "companion" &&
    (attacker.role === "fighter" || attacker.role === "gatherer")
  ) {
    const leader = state.entities[attacker.followTargetId];

    if (isCombatEntity(leader)) {
      return leader;
    }
  }

  return target;
}

function shouldRegroupPartyAttacker(
  state: GameState,
  attacker: CombatEntity,
  target: GameEntity,
): boolean {
  if (
    attacker.kind !== "companion" ||
    attacker.commandPriority === "direct" ||
    (attacker.role !== "fighter" && attacker.role !== "gatherer")
  ) {
    return false;
  }

  const leader = state.entities[attacker.followTargetId];

  if (!leader) {
    return true;
  }

  const leaderTarget = getLeaderEnemyTarget(state, leader);

  if (
    leaderTarget?.id !== target.id &&
    getGridDistance(target.position, leader.position) > PARTY_ASSIST_LEASH_RADIUS
  ) {
    return true;
  }

  return (
    getGridDistance(attacker.position, leader.position) >
    PARTY_ASSIST_LEASH_RADIUS
  );
}

function findLeadingDefender(
  state: GameState,
  leaderId: string,
  targetId: string,
): Companion | undefined {
  const target = state.entities[targetId];

  if (!target) {
    return undefined;
  }

  return Object.values(state.entities)
    .filter(
      (entity): entity is Companion =>
        entity.kind === "companion" &&
        entity.role === "defender" &&
        entity.state === "defend" &&
        entity.commandPriority !== "direct" &&
        entity.followTargetId === leaderId &&
        entity.currentTargetId === targetId,
    )
    .sort(
      (a, b) =>
        getGridDistance(a.position, target.position) -
        getGridDistance(b.position, target.position),
    )[0];
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return entity.kind === "enemy";
}

function isPlayer(entity: GameEntity): entity is Player {
  return entity.kind === "player";
}

function isPartyCombatEntity(entity: CombatEntity): entity is Player | Companion {
  return entity.kind === "player" || entity.kind === "companion";
}

function finishAttack(state: GameState, attacker: CombatEntity): CombatEntity {
  if (!isAutonomousEntity(attacker)) {
    return {
      ...attacker,
      state: "idle",
      currentTargetId: null,
    };
  }

  if (isAutonomousDefender(attacker)) {
    return switchToFollow(attacker);
  }

  const sharedTarget = findPartyCombatTarget(state, attacker.id);

  if (sharedTarget) {
    return {
      ...attacker,
      state: "attack",
      currentTargetId: sharedTarget.id,
    };
  }

  return switchToFollow(attacker);
}

function findPartyCombatTarget(
  state: GameState,
  attackerId: string,
): CombatEntity | undefined {
  for (const entity of Object.values(state.entities)) {
    if (
      entity.id === attackerId ||
      !isAutonomousEntity(entity) ||
      entity.state !== "attack" ||
      !entity.currentTargetId
    ) {
      continue;
    }

    const target = getEntityById(state, entity.currentTargetId);

    if (isCombatEntity(target) && target.state !== "dead") {
      return target;
    }
  }

  return undefined;
}

function switchToFollow(entity: AutonomousEntity): AutonomousEntity {
  if (entity.kind === "companion" && entity.role === "defender") {
    return {
      ...entity,
      state: "defend",
      currentTargetId: null,
      commandPriority: "autonomous",
    };
  }

  return {
    ...entity,
    state: "follow",
    currentTargetId: entity.kind === "companion" ? entity.followTargetId : null,
    commandPriority: "autonomous",
  };
}

function isAutonomousDefender(entity: CombatEntity): entity is Companion {
  return (
    entity.kind === "companion" &&
    entity.role === "defender" &&
    entity.commandPriority !== "direct"
  );
}

function getGridDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}
