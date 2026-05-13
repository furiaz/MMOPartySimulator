import { getMovementStepDistance, isAutonomousEntity } from "./entities";
import { protectPartyMember } from "./partyProtectionSystem";
import {
  getEntityById,
  moveEntityTowardPositionIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import { getEuclideanDistance } from "./positionUtils";
import { isEnemyEntity } from "./entityGuards";
import { GAME_LOOP_TICK_MS, type SimulationTiming } from "./simulationTiming";
import { getPartyLeader } from "./partySystem";
import {
  getEnemyDetectionRange as getArchetypeDetectionRange,
  getEnemyTargetPreference,
  getEnemyTemperament,
} from "./enemyArchetypes";
import type {
  AutonomousEntity,
  Enemy,
  EnemyTargetDecisionReason,
  GameEntity,
  Position,
} from "./types";

const ENEMY_DETECTION_RANGE = 5;
const ENEMY_ROAM_LEASH_DISTANCE = 4;
const ENEMY_ATTACK_LEASH_DISTANCE = 8;
const ENEMY_ROAM_MOVE_MIN_MS = 1000;
const ENEMY_ROAM_MOVE_MAX_MS = 2000;
const ENEMY_ROAM_IDLE_MIN_MS = 2000;
const ENEMY_ROAM_IDLE_MAX_MS = 3000;
const ENEMY_COMBAT_RETAIN_RANGE = 1;
const ROAM_TARGET_REACHED_DISTANCE = 0.1;
const ENEMY_WANDER_ATTEMPTS = 5;

type TargetSearchResult = {
  target?: AutonomousEntity;
  reason: EnemyTargetDecisionReason;
};

export function updateEnemyAISystem(
  state: GameState,
  timing: SimulationTiming = {
    nowMs: Date.now(),
    deltaMs: GAME_LOOP_TICK_MS,
    deltaSeconds: GAME_LOOP_TICK_MS / 1000,
    frameNumber: state.simulationFrame ?? state.simulationTick ?? 0,
  },
): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isEnemy(entity) || entity.state === "dead") {
      continue;
    }

    const currentTarget = entity.currentTargetId
      ? getEntityById(nextState, entity.currentTargetId)
      : undefined;

    if (
      currentTarget &&
      isValidEnemyTarget(currentTarget) &&
      canKeepCurrentTarget(entity, currentTarget)
    ) {
      if (entity.state === "attack") {
        if (isAutonomousEntity(currentTarget)) {
          nextState = protectPartyMember(nextState, currentTarget, entity);
        }

        continue;
      }

      const updatedEnemy: Enemy = {
        ...entity,
        state: "attack",
      };

      nextState = updateEntity(nextState, updatedEnemy);
      if (isAutonomousEntity(currentTarget)) {
        nextState = protectPartyMember(nextState, currentTarget, updatedEnemy);
      }
      continue;
    }

    if (entity.currentTargetId) {
      nextState = updateEntity(nextState, clearEnemyTarget(entity, timing.nowMs));
      continue;
    }

    if (getDistance(entity.position, entity.homePosition) > ENEMY_ROAM_LEASH_DISTANCE) {
      nextState = moveEnemyTowardHome(nextState, entity, timing.nowMs);
      continue;
    }

    if (getEnemyTemperament(entity) === "passive") {
      const reasonedEnemy = withTargetDecisionReason(entity, "passive_no_auto_target");
      nextState = updateEntity(nextState, reasonedEnemy);
      nextState = updateEnemyWander(nextState, reasonedEnemy, timing);
      continue;
    }

    const { target, reason } = findPreferredTarget(nextState, entity);

    if (!target) {
      const reasonedEnemy = withTargetDecisionReason(entity, reason);
      nextState = updateEntity(nextState, reasonedEnemy);
      nextState = updateEnemyWander(nextState, reasonedEnemy, timing);
      continue;
    }

    const updatedEnemy: Enemy = {
      ...entity,
      state: "attack",
      currentTargetId: target.id,
      targetDecisionReason: reason,
    };

    nextState = updateEntity(nextState, updatedEnemy);
    if (isAutonomousEntity(target)) {
      nextState = protectPartyMember(nextState, target, updatedEnemy);
    }
  }

  return nextState;
}

export function getEnemyHomeLeashDistance(): number {
  return ENEMY_ROAM_LEASH_DISTANCE;
}

export function getEnemyAttackLeashDistance(): number {
  return ENEMY_ATTACK_LEASH_DISTANCE;
}

export function getEnemyDetectionRange(): number {
  return ENEMY_DETECTION_RANGE;
}

function clearEnemyTarget(enemy: Enemy, now = Date.now()): Enemy {
  return {
    ...enemy,
    state: "idle",
    currentTargetId: null,
    roamTargetPosition: null,
    nextRoamAt: getNextRoamIdleTime(now),
    roamMoveUntil: undefined,
  };
}

function findPreferredTarget(
  state: GameState,
  enemy: Enemy,
): TargetSearchResult {
  const candidates = getValidTargetCandidates(enemy, Object.values(state.entities));

  if (candidates.length === 0) {
    return getNoTargetReason(enemy, Object.values(state.entities));
  }

  const preference = getEnemyTargetPreference(enemy);

  if (preference === "leader") {
    const leader = getPartyLeader(state);

    if (leader && candidates.some((candidate) => candidate.id === leader.id)) {
      return { target: leader, reason: "leader" };
    }

    return {
      target: findClosestCandidate(enemy, candidates),
      reason: "closest",
    };
  }

  if (preference === "lowestHealth") {
    return {
      target: findLowestHealthCandidate(enemy, candidates),
      reason: "lowest_health",
    };
  }

  return {
    target: findClosestCandidate(enemy, candidates),
    reason: "closest",
  };
}

function getValidTargetCandidates(
  enemy: Enemy,
  entities: GameEntity[],
): AutonomousEntity[] {
  const detectionRange = getArchetypeDetectionRange(enemy, ENEMY_DETECTION_RANGE);

  return entities.filter(
    (entity): entity is AutonomousEntity =>
      isValidEnemyTarget(entity) &&
      getDistanceSquared(enemy, entity) <= detectionRange * detectionRange &&
      isInsideAttackLeash(enemy, entity.position),
  );
}

function getNoTargetReason(
  enemy: Enemy,
  entities: GameEntity[],
): TargetSearchResult {
  const detectionRange = getArchetypeDetectionRange(enemy, ENEMY_DETECTION_RANGE);
  const validTargets = entities.filter(isValidEnemyTarget);

  if (
    validTargets.some(
      (entity) =>
        getDistanceSquared(enemy, entity) <= detectionRange * detectionRange &&
        !isInsideAttackLeash(enemy, entity.position),
    )
  ) {
    return { reason: "outside_leash" };
  }

  if (validTargets.length > 0) {
    return { reason: "outside_detection" };
  }

  return { reason: "no_valid_target" };
}

function findClosestCandidate(
  enemy: Enemy,
  candidates: AutonomousEntity[],
): AutonomousEntity | undefined {
  return candidates.sort(
    (a, b) => getDistanceSquared(enemy, a) - getDistanceSquared(enemy, b),
  )[0];
}

function findLowestHealthCandidate(
  enemy: Enemy,
  candidates: AutonomousEntity[],
): AutonomousEntity | undefined {
  return candidates.sort(
    (a, b) =>
      a.health / a.maxHealth - b.health / b.maxHealth ||
      getDistanceSquared(enemy, a) - getDistanceSquared(enemy, b),
  )[0];
}

function isValidEnemyTarget(entity: GameEntity): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state !== "dead";
}

function getDistanceSquared(a: GameEntity, b: GameEntity): number {
  const xDistance = b.position.x - a.position.x;
  const yDistance = b.position.y - a.position.y;

  return xDistance * xDistance + yDistance * yDistance;
}

function updateEnemyWander(
  state: GameState,
  enemy: Enemy,
  timing: SimulationTiming,
): GameState {
  const now = timing.nowMs;

  if (enemy.roamTargetPosition && enemy.roamMoveUntil && now <= enemy.roamMoveUntil) {
    return moveEnemyTowardRoamTarget(state, enemy, now);
  }

  if (enemy.roamTargetPosition) {
    return updateEntity(state, finishEnemyRoam(enemy, now));
  }

  if (!enemy.nextRoamAt) {
    return updateEntity(state, {
      ...enemy,
      nextRoamAt: getNextRoamIdleTime(now),
    });
  }

  if (now < enemy.nextRoamAt) {
    return state;
  }

  const roamMoveDuration = getRandomDuration(
    ENEMY_ROAM_MOVE_MIN_MS,
    ENEMY_ROAM_MOVE_MAX_MS,
  );
  const wanderTarget = getRandomWanderTarget(enemy, roamMoveDuration);

  return updateEntity(state, {
    ...enemy,
    roamTargetPosition: wanderTarget,
    nextRoamAt: undefined,
    roamMoveUntil: wanderTarget ? now + roamMoveDuration : now,
  });
}

function moveEnemyTowardHome(state: GameState, enemy: Enemy, now: number): GameState {
  const clearedEnemy = clearEnemyTarget(enemy, now);
  const nextState =
    enemy.state === "idle" && !enemy.currentTargetId
      ? state
      : updateEntity(state, clearedEnemy);

  return moveEntityTowardPositionIfUnoccupied(nextState, clearedEnemy, enemy.homePosition);
}

function moveEnemyTowardRoamTarget(
  state: GameState,
  enemy: Enemy,
  now: number,
): GameState {
  const roamTarget = enemy.roamTargetPosition;

  if (!roamTarget) {
    return updateEntity(state, finishEnemyRoam(enemy, now));
  }

  if (getDistance(enemy.position, roamTarget) <= ROAM_TARGET_REACHED_DISTANCE) {
    return updateEntity(state, finishEnemyRoam(enemy, now));
  }

  const movedState = moveEntityTowardPositionIfUnoccupied(state, enemy, roamTarget);
  const movedEnemy = getEntityById(movedState, enemy.id);

  if (!movedEnemy || !isEnemy(movedEnemy)) {
    return movedState;
  }

  if (getDistance(movedEnemy.position, enemy.position) <= ROAM_TARGET_REACHED_DISTANCE) {
    return updateEntity(movedState, finishEnemyRoam(movedEnemy, now));
  }

  if (getDistance(movedEnemy.position, movedEnemy.homePosition) > ENEMY_ROAM_LEASH_DISTANCE) {
    return updateEntity(movedState, finishEnemyRoam(movedEnemy, now));
  }

  return movedState;
}

function finishEnemyRoam(enemy: Enemy, now: number): Enemy {
  return {
    ...enemy,
    roamTargetPosition: null,
    nextRoamAt: getNextRoamIdleTime(now),
    roamMoveUntil: undefined,
  };
}

function getRandomWanderTarget(enemy: Enemy, roamMoveDuration: number): Position | null {
  for (let attempt = 0; attempt < ENEMY_WANDER_ATTEMPTS; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = getRoamDistanceForDuration(enemy, roamMoveDuration);
    const unclampedPosition = {
      x: enemy.position.x + Math.cos(angle) * distance,
      y: enemy.position.y + Math.sin(angle) * distance,
    };
    const position = clampToRoamLeash(enemy.homePosition, unclampedPosition);

    if (isInsideRoamLeash(enemy, position)) {
      return position;
    }
  }

  return null;
}

function getRoamDistanceForDuration(enemy: Enemy, roamMoveDuration: number): number {
  return getMovementStepDistance(enemy, roamMoveDuration);
}

function clampToRoamLeash(homePosition: Position, position: Position): Position {
  const xDistance = position.x - homePosition.x;
  const yDistance = position.y - homePosition.y;
  const distance = Math.hypot(xDistance, yDistance);

  if (distance <= ENEMY_ROAM_LEASH_DISTANCE || distance === 0) {
    return position;
  }

  return {
    x: homePosition.x + (xDistance / distance) * ENEMY_ROAM_LEASH_DISTANCE,
    y: homePosition.y + (yDistance / distance) * ENEMY_ROAM_LEASH_DISTANCE,
  };
}

function getRandomDuration(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

function getNextRoamIdleTime(now: number): number {
  return now + getRandomDuration(
    ENEMY_ROAM_IDLE_MIN_MS,
    ENEMY_ROAM_IDLE_MAX_MS,
  );
}

function isInsideRoamLeash(enemy: Enemy, position: Position): boolean {
  return getDistance(enemy.homePosition, position) <= ENEMY_ROAM_LEASH_DISTANCE;
}

function isInsideAttackLeash(enemy: Enemy, position: Position): boolean {
  return getDistance(enemy.homePosition, position) <= ENEMY_ATTACK_LEASH_DISTANCE;
}

function canKeepCurrentTarget(enemy: Enemy, target: AutonomousEntity): boolean {
  return (
    isInsideAttackLeash(enemy, target.position) ||
    getDistance(enemy.position, target.position) <= ENEMY_COMBAT_RETAIN_RANGE
  );
}

function withTargetDecisionReason(
  enemy: Enemy,
  reason: EnemyTargetDecisionReason,
): Enemy {
  return enemy.targetDecisionReason === reason
    ? enemy
    : {
        ...enemy,
        targetDecisionReason: reason,
      };
}

function getDistance(from: Position, to: Position): number {
  return getEuclideanDistance(from, to);
}

function isEnemy(entity: GameEntity): entity is Enemy {
  return isEnemyEntity(entity);
}
