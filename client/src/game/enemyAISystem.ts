import { getMovementStepDistance, isAutonomousEntity } from "./entities";
import {
  getEntityById,
  moveEntityTowardPositionIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import { getEuclideanDistance } from "./positionUtils";
import { isEnemyEntity, isTargetDummyEnemy } from "./entityGuards";
import { isEnemyAoeChanneling } from "./enemyAoeChannelSystem";
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

const ENEMY_DETECTION_RANGE = 10;
const ENEMY_ROAM_LEASH_DISTANCE = 8;
const ENEMY_ATTACK_LEASH_DISTANCE = 16;
const ENEMY_ROAM_SPEED_MULTIPLIER = 2;
const ENEMY_CHASE_SPEED_MULTIPLIER = 3;
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
  const entities = Object.values(state.entities);
  const partyLeader = getPartyLeader(state);

  for (const entity of entities) {
    if (!isEnemy(entity) || entity.state === "dead") {
      continue;
    }

    if (isEnemyAoeChanneling(nextState, entity.id)) {
      continue;
    }

    if (isTargetDummyEnemy(entity)) {
      nextState = updateEntity(nextState, keepTargetDummyStationary(entity));
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
        continue;
      }

      const updatedEnemy: Enemy = {
        ...entity,
        state: "attack",
      };

      nextState = updateEntity(nextState, updatedEnemy);
      continue;
    }

    if (entity.currentTargetId) {
      nextState = updateEntity(nextState, clearEnemyTarget(entity, timing.nowMs));
      continue;
    }

    if (
      !entity.questSpawn &&
      getDistance(entity.position, entity.homePosition) > ENEMY_ROAM_LEASH_DISTANCE
    ) {
      nextState = moveEnemyTowardHome(nextState, entity, timing.nowMs);
      continue;
    }

    if (getEnemyTemperament(entity) === "passive") {
      const reasonedEnemy = withTargetDecisionReason(entity, "passive_no_auto_target");
      nextState = updateEntity(nextState, reasonedEnemy);
      nextState = updateEnemyWander(nextState, reasonedEnemy, timing);
      continue;
    }

    const { target, reason } = findPreferredTarget(entity, entities, partyLeader);

    if (!target) {
      const reasonedEnemy = withTargetDecisionReason(entity, reason);
      nextState = updateEntity(nextState, reasonedEnemy);
      if (reasonedEnemy.questSpawn?.targetPosition) {
        nextState = moveEntityTowardPositionIfUnoccupied(
          nextState,
          reasonedEnemy,
          reasonedEnemy.questSpawn.targetPosition,
          {
            allowPartyPassThrough: false,
            pathProfile: "chase",
            pathTargetKey: `quest:${reasonedEnemy.questSpawn.questId}:${reasonedEnemy.questSpawn.objectiveId}`,
            pathTargetPosition: reasonedEnemy.questSpawn.targetPosition,
            speedMultiplier: ENEMY_CHASE_SPEED_MULTIPLIER,
          },
        );
        continue;
      }
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
  }

  return nextState;
}

function keepTargetDummyStationary(enemy: Enemy): Enemy {
  return {
    ...enemy,
    position: enemy.homePosition,
    state: "idle",
    currentTargetId: null,
    roamTargetPosition: null,
    nextRoamAt: undefined,
    roamMoveUntil: undefined,
    targetDecisionReason: "passive_no_auto_target",
  };
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

export function getEnemyAggroRange(enemy: Enemy): number {
  return getArchetypeDetectionRange(enemy, ENEMY_DETECTION_RANGE);
}

export function getEnemyChaseSpeedMultiplier(): number {
  return ENEMY_CHASE_SPEED_MULTIPLIER;
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
  enemy: Enemy,
  entities: GameEntity[],
  partyLeader: AutonomousEntity | undefined,
): TargetSearchResult {
  const candidates = getValidTargetCandidates(enemy, entities);

  if (candidates.length === 0) {
    return getNoTargetReason(enemy, entities);
  }

  const preference = getEnemyTargetPreference(enemy);

  if (preference === "leader") {
    if (
      partyLeader &&
      candidates.some((candidate) => candidate.id === partyLeader.id)
    ) {
      return { target: partyLeader, reason: "leader" };
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
  const detectionRange = getEnemyAggroRange(enemy);

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
  const detectionRange = getEnemyAggroRange(enemy);
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
  let closestCandidate: AutonomousEntity | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = getDistanceSquared(enemy, candidate);

    if (distance < closestDistance) {
      closestCandidate = candidate;
      closestDistance = distance;
    }
  }

  return closestCandidate;
}

function findLowestHealthCandidate(
  enemy: Enemy,
  candidates: AutonomousEntity[],
): AutonomousEntity | undefined {
  let lowestHealthCandidate: AutonomousEntity | undefined;
  let lowestHealthRatio = Number.POSITIVE_INFINITY;
  let lowestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const healthRatio = candidate.health / candidate.maxHealth;
    const distance = getDistanceSquared(enemy, candidate);

    if (
      healthRatio < lowestHealthRatio ||
      (healthRatio === lowestHealthRatio && distance < lowestDistance)
    ) {
      lowestHealthCandidate = candidate;
      lowestHealthRatio = healthRatio;
      lowestDistance = distance;
    }
  }

  return lowestHealthCandidate;
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

  return moveEntityTowardPositionIfUnoccupied(
    nextState,
    clearedEnemy,
    enemy.homePosition,
    {
      pathProfile: "home",
      pathTargetKey: `home:${enemy.id}`,
      pathTargetPosition: enemy.homePosition,
      speedMultiplier: ENEMY_ROAM_SPEED_MULTIPLIER,
    },
  );
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

  const movedState = moveEntityTowardPositionIfUnoccupied(state, enemy, roamTarget, {
    pathProfile: "roam",
    pathTargetKey: `roam:${enemy.id}:${getPositionPathKey(roamTarget)}`,
    pathTargetPosition: roamTarget,
    speedMultiplier: ENEMY_ROAM_SPEED_MULTIPLIER,
  });
  const movedEnemy = getEntityById(movedState, enemy.id);

  if (!movedEnemy || !isEnemy(movedEnemy)) {
    return movedState;
  }

  if (getDistance(movedEnemy.position, movedEnemy.homePosition) > ENEMY_ROAM_LEASH_DISTANCE) {
    return updateEntity(
      movedState,
      finishEnemyRoam(
        {
          ...movedEnemy,
          position: enemy.position,
        },
        now,
      ),
    );
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
  return getMovementStepDistance(
    enemy,
    roamMoveDuration * ENEMY_ROAM_SPEED_MULTIPLIER,
  );
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
  if (enemy.questSpawn) {
    return true;
  }

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

function getPositionPathKey(position: Position): string {
  return `${Math.round(position.x)},${Math.round(position.y)}`;
}
