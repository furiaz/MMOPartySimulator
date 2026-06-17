import { getMovementStepDistance, isAutonomousEntity } from "./entities";
import {
  addCombatFeedback,
  getEntityById,
  PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS,
  updateEntity,
  type GameState,
} from "./state";
import {
  getBoundedPathDistance,
  moveEntityTowardPositionIfUnoccupied,
} from "./movementPlanning";
import { getEuclideanDistance } from "./positionUtils";
import { isEnemyEntity, isTargetDummyEnemy } from "./entityGuards";
import { isEnemyAoeChanneling } from "./enemyAoeChannelSystem";
import { GAME_LOOP_TICK_MS, type SimulationTiming } from "./simulationTiming";
import { getPartyLeader } from "./partySystem";
import {
  HUB_MAP_ID,
  MAP_FOUR_ID,
  MAP_ONE_ID,
  MAP_THREE_ID,
  MAP_TWO_ID,
} from "./debugMap";
import {
  recordEnemyAiActive,
  recordEnemyAiDormant,
  recordEnemyRoamMove,
  recordEnemyRoamStart,
} from "./performanceMetrics";
import {
  getEnemyDetectionRange as getArchetypeDetectionRange,
  getEnemyTargetPreference,
  getEnemyTemperament,
} from "./enemyArchetypes";
import { isFakeDeathActive } from "./statusEffects";
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
const QUEST_PRESSURE_TARGET_REACHED_DISTANCE = 1;
const ENEMY_WANDER_ATTEMPTS = 5;
const WILD_ZONE_BACKGROUND_ACTIVITY_RADIUS = 28;
const ENEMY_TARGET_REACHABILITY_CACHE_MS = 250;
const WILD_ZONE_MAP_IDS = new Set([MAP_ONE_ID, MAP_TWO_ID, MAP_THREE_ID, MAP_FOUR_ID]);

type TargetSearchResult = {
  target?: AutonomousEntity;
  reason: EnemyTargetDecisionReason;
};

type TargetCandidate = {
  target: AutonomousEntity;
  pathDistance: number;
};

export function updateEnemyAISystem(
  state: GameState,
  timing: SimulationTiming = {
    nowMs: Date.now(),
    deltaMs: GAME_LOOP_TICK_MS,
    deltaSeconds: GAME_LOOP_TICK_MS / 1000,
    frameNumber: state.simulationFrame ?? state.simulationTick ?? 0,
  },
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const entities = Object.values(state.entities);
  const partyLeader = getPartyLeader(state);

  for (const entity of entities) {
    if (!isEnemy(entity) || entity.state === "dead") {
      continue;
    }

    if (isEnemyAoeChanneling(nextState, entity.id)) {
      recordEnemyAiActive();
      continue;
    }

    if (isTargetDummyEnemy(entity)) {
      recordEnemyAiActive();
      nextState = updateEntity(nextState, keepTargetDummyStationary(entity));
      continue;
    }

    const currentTarget = entity.currentTargetId
      ? getEntityById(nextState, entity.currentTargetId)
      : undefined;

    const targetRetention =
      currentTarget && isValidEnemyTarget(nextState, currentTarget)
        ? canKeepCurrentTarget(nextState, entity, currentTarget, timing.nowMs)
        : null;

    if (targetRetention) {
      nextState = targetRetention.state;
    }

    if (currentTarget && targetRetention?.canKeep) {
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
      recordEnemyAiActive();
      nextState = updateEntity(nextState, clearEnemyTarget(entity, timing.nowMs));
      continue;
    }

    if (shouldPressureQuestTarget(entity)) {
      recordEnemyAiActive();
      nextState = moveQuestSpawnTowardPressureTarget(
        nextState,
        entity,
        movedEntityIds,
      );
      continue;
    }

    if (
      !entity.questSpawn &&
      getDistance(entity.position, entity.homePosition) > ENEMY_ROAM_LEASH_DISTANCE
    ) {
      recordEnemyAiActive();
      nextState = moveEnemyTowardHome(
        nextState,
        entity,
        timing.nowMs,
        movedEntityIds,
      );
      continue;
    }

    if (isDormantBackgroundWildEnemy(nextState, entity, entities)) {
      recordEnemyAiDormant();
      continue;
    }

    recordEnemyAiActive();

    if (getEnemyTemperament(entity) === "passive") {
      const reasonedEnemy = withTargetDecisionReason(entity, "passive_no_auto_target");
      nextState = updateEntity(nextState, reasonedEnemy);
      nextState = updateEnemyWander(
        nextState,
        reasonedEnemy,
        timing,
        movedEntityIds,
      );
      continue;
    }

    const { target, reason } = findPreferredTarget(
      nextState,
      entity,
      entities,
      partyLeader,
    );

    if (!target) {
      const reasonedEnemy = withTargetDecisionReason(entity, reason);
      nextState = updateEntity(nextState, reasonedEnemy);
      if (shouldPressureQuestTarget(reasonedEnemy)) {
        nextState = moveQuestSpawnTowardPressureTarget(
          nextState,
          reasonedEnemy,
          movedEntityIds,
        );
        continue;
      }
      nextState = updateEnemyWander(
        nextState,
        reasonedEnemy,
        timing,
        movedEntityIds,
      );
      continue;
    }

    const updatedEnemy: Enemy = {
      ...entity,
      state: "attack",
      currentTargetId: target.id,
      targetDecisionReason: reason,
    };

    nextState = updateEntity(nextState, updatedEnemy);
    nextState = addCombatFeedback(nextState, {
      type: "enemy_spotted",
      entityId: updatedEnemy.id,
      targetEntityId: target.id,
      text: "Spotted",
      now: timing.nowMs,
      durationMs: PROTOTYPE_VISUAL_FEEDBACK_DURATION_MS,
    });
  }

  return nextState;
}

function keepTargetDummyStationary(enemy: Enemy): Enemy {
  if (
    getDistance(enemy.position, enemy.homePosition) <= 0.001 &&
    enemy.state === "idle" &&
    enemy.currentTargetId === null &&
    enemy.roamTargetPosition === null &&
    enemy.nextRoamAt === undefined &&
    enemy.roamMoveUntil === undefined &&
    enemy.targetDecisionReason === "passive_no_auto_target"
  ) {
    return enemy;
  }

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

export function getWildZoneBackgroundActivityRadius(): number {
  return WILD_ZONE_BACKGROUND_ACTIVITY_RADIUS;
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
  state: GameState,
  enemy: Enemy,
  entities: GameEntity[],
  partyLeader: AutonomousEntity | undefined,
): TargetSearchResult {
  const candidates = getValidTargetCandidates(state, enemy, entities);

  if (candidates.length === 0) {
    return getNoTargetReason(state, enemy, entities);
  }

  const preference = getEnemyTargetPreference(enemy);

  if (preference === "leader") {
    if (
      partyLeader &&
      candidates.some((candidate) => candidate.target.id === partyLeader.id)
    ) {
      return { target: partyLeader, reason: "leader" };
    }

    return {
      target: findClosestCandidate(candidates),
      reason: "closest",
    };
  }

  if (preference === "lowestHealth") {
    return {
      target: findLowestHealthCandidate(candidates),
      reason: "lowest_health",
    };
  }

  return {
    target: findClosestCandidate(candidates),
    reason: "closest",
  };
}

function getValidTargetCandidates(
  state: GameState,
  enemy: Enemy,
  entities: GameEntity[],
): TargetCandidate[] {
  const detectionRange = getEnemyAggroRange(enemy);

  return entities.flatMap((entity) => {
    if (
      !isValidEnemyTarget(state, entity) ||
      getDistanceSquared(enemy, entity) > detectionRange * detectionRange ||
      !isInsideAttackLeash(enemy, entity.position)
    ) {
      return [];
    }

    const pathDistance = getBoundedPathDistance(
      state,
      enemy,
      entity.position,
      detectionRange,
    );

    return pathDistance === null ? [] : [{ target: entity, pathDistance }];
  });
}

function getNoTargetReason(
  state: GameState,
  enemy: Enemy,
  entities: GameEntity[],
): TargetSearchResult {
  const detectionRange = getEnemyAggroRange(enemy);
  const validTargets = entities.filter((entity) => isValidEnemyTarget(state, entity));

  if (
    validTargets.some(
      (entity) =>
        getDistanceSquared(enemy, entity) <= detectionRange * detectionRange &&
        !isInsideAttackLeash(enemy, entity.position),
    )
  ) {
    return { reason: "outside_leash" };
  }

  if (
    validTargets.some((entity) => {
      if (
        getDistanceSquared(enemy, entity) > detectionRange * detectionRange ||
        !isInsideAttackLeash(enemy, entity.position)
      ) {
        return false;
      }

      return (
        getBoundedPathDistance(state, enemy, entity.position, detectionRange) ===
        null
      );
    })
  ) {
    return { reason: "unreachable" };
  }

  if (validTargets.length > 0) {
    return { reason: "outside_detection" };
  }

  return { reason: "no_valid_target" };
}

function findClosestCandidate(
  candidates: TargetCandidate[],
): AutonomousEntity | undefined {
  let closestCandidate: AutonomousEntity | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = candidate.pathDistance;

    if (distance < closestDistance) {
      closestCandidate = candidate.target;
      closestDistance = distance;
    }
  }

  return closestCandidate;
}

function findLowestHealthCandidate(
  candidates: TargetCandidate[],
): AutonomousEntity | undefined {
  let lowestHealthCandidate: AutonomousEntity | undefined;
  let lowestHealthRatio = Number.POSITIVE_INFINITY;
  let lowestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const healthRatio = candidate.target.health / candidate.target.maxHealth;
    const distance = candidate.pathDistance;

    if (
      healthRatio < lowestHealthRatio ||
      (healthRatio === lowestHealthRatio && distance < lowestDistance)
    ) {
      lowestHealthCandidate = candidate.target;
      lowestHealthRatio = healthRatio;
      lowestDistance = distance;
    }
  }

  return lowestHealthCandidate;
}

function isValidEnemyTarget(
  state: GameState,
  entity: GameEntity,
): entity is AutonomousEntity {
  return (
    isAutonomousEntity(entity) &&
    entity.state !== "dead" &&
    !isFakeDeathActive(state, entity.id)
  );
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
  movedEntityIds: Set<string>,
): GameState {
  const now = timing.nowMs;

  if (enemy.roamTargetPosition && enemy.roamMoveUntil && now <= enemy.roamMoveUntil) {
    return moveEnemyTowardRoamTarget(state, enemy, now, movedEntityIds);
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

  recordEnemyRoamStart();

  return updateEntity(state, {
    ...enemy,
    roamTargetPosition: wanderTarget,
    nextRoamAt: undefined,
    roamMoveUntil: wanderTarget ? now + roamMoveDuration : now,
  });
}

function moveEnemyTowardHome(
  state: GameState,
  enemy: Enemy,
  now: number,
  movedEntityIds: Set<string>,
): GameState {
  const clearedEnemy = clearEnemyTarget(enemy, now);
  const nextState =
    enemy.state === "idle" && !enemy.currentTargetId
      ? state
      : updateEntity(state, clearedEnemy);

  return markEnemyMovedIfPositionChanged(
    enemy,
    moveEntityTowardPositionIfUnoccupied(
      nextState,
      clearedEnemy,
      enemy.homePosition,
      {
        pathProfile: "home",
        pathTargetKey: `home:${enemy.id}`,
        pathTargetPosition: enemy.homePosition,
        speedMultiplier: ENEMY_ROAM_SPEED_MULTIPLIER,
      },
    ),
    movedEntityIds,
  );
}

function shouldPressureQuestTarget(enemy: Enemy): boolean {
  const targetPosition = enemy.questSpawn?.targetPosition;

  return Boolean(
    targetPosition &&
      getDistance(enemy.position, targetPosition) >
        QUEST_PRESSURE_TARGET_REACHED_DISTANCE,
  );
}

function moveQuestSpawnTowardPressureTarget(
  state: GameState,
  enemy: Enemy,
  movedEntityIds: Set<string>,
): GameState {
  const questSpawn = enemy.questSpawn;
  const targetPosition = questSpawn?.targetPosition;

  if (!questSpawn || !targetPosition) {
    return state;
  }

  return markEnemyMovedIfPositionChanged(
    enemy,
    moveEntityTowardPositionIfUnoccupied(
      state,
      enemy,
      targetPosition,
      {
        allowPartyPassThrough: false,
        pathProfile: "chase",
        pathTargetKey: `quest:${questSpawn.questId}:${questSpawn.objectiveId}`,
        pathTargetPosition: targetPosition,
        speedMultiplier: ENEMY_CHASE_SPEED_MULTIPLIER,
      },
    ),
    movedEntityIds,
  );
}

function moveEnemyTowardRoamTarget(
  state: GameState,
  enemy: Enemy,
  now: number,
  movedEntityIds: Set<string>,
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

  if (getDistance(enemy.position, movedEnemy.position) > 0.001) {
    recordEnemyRoamMove();
    movedEntityIds.add(enemy.id);
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

function markEnemyMovedIfPositionChanged(
  previousEnemy: Enemy,
  state: GameState,
  movedEntityIds: Set<string>,
): GameState {
  const nextEnemy = getEntityById(state, previousEnemy.id);

  if (
    nextEnemy &&
    isEnemy(nextEnemy) &&
    getDistance(previousEnemy.position, nextEnemy.position) > 0.001
  ) {
    movedEntityIds.add(previousEnemy.id);
  }

  return state;
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

function isDormantBackgroundWildEnemy(
  state: GameState,
  enemy: Enemy,
  entities: GameEntity[],
): boolean {
  if (
    state.currentMapId === HUB_MAP_ID ||
    !state.currentMapId ||
    !WILD_ZONE_MAP_IDS.has(state.currentMapId) ||
    enemy.currentTargetId ||
    enemy.questSpawn ||
    enemy.state === "attack" ||
    enemy.attackWindupStartedAt !== undefined ||
    enemy.attackWindupTargetId ||
    isEnemyAoeChanneling(state, enemy.id)
  ) {
    return false;
  }

  return getNearestLivingCompanionDistance(enemy, entities) >
    WILD_ZONE_BACKGROUND_ACTIVITY_RADIUS;
}

function getNearestLivingCompanionDistance(
  enemy: Enemy,
  entities: GameEntity[],
): number {
  let nearestDistance = Infinity;

  for (const entity of entities) {
    if (entity.kind !== "companion" || entity.state === "dead" || entity.health <= 0) {
      continue;
    }

    nearestDistance = Math.min(nearestDistance, getDistance(enemy.position, entity.position));
  }

  return nearestDistance;
}

function canKeepCurrentTarget(
  state: GameState,
  enemy: Enemy,
  target: AutonomousEntity,
  nowMs: number,
): { canKeep: boolean; state: GameState } {
  if (
    !isInsideAttackLeash(enemy, target.position) &&
    getDistance(enemy.position, target.position) > ENEMY_COMBAT_RETAIN_RANGE
  ) {
    return { canKeep: false, state };
  }

  const maxDistance = getTargetRetainPathDistance(state, enemy);
  const cacheKey = getTargetReachabilityCacheKey(state, enemy, target, maxDistance);
  const cachedReachability =
    state.enemyTargetReachabilityCacheByEnemyId?.[enemy.id];

  if (
    cachedReachability?.cacheKey === cacheKey &&
    cachedReachability.expiresAtMs > nowMs
  ) {
    return { canKeep: cachedReachability.reachable, state };
  }

  const reachable =
    getBoundedPathDistance(state, enemy, target.position, maxDistance) !== null;

  return {
    canKeep: reachable,
    state: setEnemyTargetReachabilityCache(state, enemy.id, {
      cacheKey,
      expiresAtMs: nowMs + ENEMY_TARGET_REACHABILITY_CACHE_MS,
      reachable,
    }),
  };
}

function setEnemyTargetReachabilityCache(
  state: GameState,
  enemyId: string,
  cacheEntry: NonNullable<
    GameState["enemyTargetReachabilityCacheByEnemyId"]
  >[string],
): GameState {
  return {
    ...state,
    enemyTargetReachabilityCacheByEnemyId: {
      ...(state.enemyTargetReachabilityCacheByEnemyId ?? {}),
      [enemyId]: cacheEntry,
    },
  };
}

function getTargetReachabilityCacheKey(
  state: GameState,
  enemy: Enemy,
  target: AutonomousEntity,
  maxDistance: number,
): string {
  return [
    state.map?.id ?? state.map?.debugName ?? state.currentMapId ?? "no-map",
    enemy.id,
    target.id,
    getPositionPathKey(enemy.position),
    getPositionPathKey(target.position),
    maxDistance,
  ].join(":");
}

function getTargetRetainPathDistance(state: GameState, enemy: Enemy): number {
  if (enemy.questSpawn && state.map) {
    return state.map.columns * state.map.rows * 2;
  }

  return enemy.questSpawn ? Number.POSITIVE_INFINITY : ENEMY_ATTACK_LEASH_DISTANCE;
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
