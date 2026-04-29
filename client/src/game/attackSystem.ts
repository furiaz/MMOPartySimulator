import {
  damageEntity,
  isAutonomousEntity,
  isCombatEntity,
  setLastAttackAt,
} from "./entities";
import {
  addCombatFeedback,
  getEntityById,
  isActiveResourcePosition,
  isWallPosition,
  moveEntityTowardIfUnoccupied,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
  reservePositionForTick,
  updateEntity,
  type GameState,
} from "./state";
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
  Position,
} from "./types";

const ATTACK_RANGE = 1;
const ATTACK_DAMAGE = 1;
const ATTACK_COOLDOWN_MS = 1000;

export function updateAttackSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const now = Date.now();

  for (const entity of Object.values(state.entities)) {
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

    nextState = moveAttackerTowardCombatPosition(nextState, attacker, target);
    movedEntityIds.add(attacker.id);
  }

  return nextState;
}

function moveAttackerTowardCombatPosition(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): GameState {
  const movementTarget = getCombatMovementTarget(state, attacker, target);

  if (
    movementTarget.id !== target.id ||
    !isPartyCombatEntity(attacker) ||
    !isEnemy(target)
  ) {
    return moveEntityTowardIfUnoccupied(state, attacker, movementTarget);
  }

  const attackPosition = chooseAttackPosition(state, attacker, target);

  if (!attackPosition) {
    return moveEntityTowardIfUnoccupied(state, attacker, target);
  }

  return moveEntityTowardPositionIfUnoccupied(
    reservePositionForTick(state, attacker.id, attackPosition),
    attacker,
    attackPosition,
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

function chooseAttackPosition(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): Position | null {
  return (
    getSortedCombatPositions(
      getAttackPositions(target.position),
      attacker,
      target.position,
    ).find((position) =>
      isReachableCombatPosition(state, attacker, position),
    ) ??
    getSortedCombatPositions(
      getNearbyCombatPositions(target.position),
      attacker,
      target.position,
    ).find((position) =>
      isReachableCombatPosition(state, attacker, position),
    ) ??
    null
  );
}

function getAttackPositions(targetPosition: Position): Position[] {
  const positions: Position[] = [];

  for (
    let y = targetPosition.y - ATTACK_RANGE;
    y <= targetPosition.y + ATTACK_RANGE;
    y += 1
  ) {
    for (
      let x = targetPosition.x - ATTACK_RANGE;
      x <= targetPosition.x + ATTACK_RANGE;
      x += 1
    ) {
      const position = { x, y };

      if (isSamePosition(position, targetPosition)) {
        continue;
      }

      positions.push(position);
    }
  }

  return positions;
}

function getNearbyCombatPositions(targetPosition: Position): Position[] {
  const positions: Position[] = [];

  for (let radius = ATTACK_RANGE + 1; radius <= ATTACK_RANGE + 3; radius += 1) {
    for (
      let y = targetPosition.y - radius;
      y <= targetPosition.y + radius;
      y += 1
    ) {
      for (
        let x = targetPosition.x - radius;
        x <= targetPosition.x + radius;
        x += 1
      ) {
        if (
          Math.max(
            Math.abs(targetPosition.x - x),
            Math.abs(targetPosition.y - y),
          ) !== radius
        ) {
          continue;
        }

        positions.push({ x, y });
      }
    }
  }

  return positions;
}

function getSortedCombatPositions(
  positions: Position[],
  attacker: CombatEntity,
  targetPosition: Position,
): Position[] {
  return [...positions].sort(
    (a, b) =>
      getGridDistance(a, targetPosition) - getGridDistance(b, targetPosition) ||
      getManhattanDistance(a, targetPosition) -
        getManhattanDistance(b, targetPosition) ||
      getGridDistance(a, attacker.position) -
        getGridDistance(b, attacker.position) ||
      getManhattanDistance(a, attacker.position) -
        getManhattanDistance(b, attacker.position) ||
      a.y - b.y ||
      a.x - b.x,
  );
}

function isReachableCombatPosition(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return (
    isCombatPositionAvailable(state, attacker, position) &&
    (isSamePosition(attacker.position, position) ||
      previewMoveTowardPosition(state, attacker, position) !== null)
  );
}

function isCombatPositionAvailable(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return (
    isInMapBounds(state, position) &&
    !isWallPosition(state, position) &&
    !isActiveResourcePosition(state, position, attacker.id) &&
    !isReservedByOtherEntity(state, attacker, position) &&
    !isOccupiedByOtherEntity(state, attacker, position)
  );
}

function isInMapBounds(state: GameState, position: Position): boolean {
  return (
    !state.map ||
    (position.x >= 0 &&
      position.x < state.map.columns &&
      position.y >= 0 &&
      position.y < state.map.rows)
  );
}

function isReservedByOtherEntity(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return Object.entries(state.reservedPositionsByEntityId ?? {}).some(
    ([entityId, reservedPosition]) =>
      entityId !== attacker.id && isSamePosition(reservedPosition, position),
  );
}

function isOccupiedByOtherEntity(
  state: GameState,
  attacker: CombatEntity,
  position: Position,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      entity.id !== attacker.id && isSamePosition(entity.position, position),
  );
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
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

  return target;
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

function getManhattanDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}
