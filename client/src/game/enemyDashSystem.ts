import {
  clipSquareAoeAreaToForwardDistance,
  isPositionInsideAoe,
} from "./aoePatterns";
import { resolveAndApplyCombatDamage, type CombatRng } from "./combatResolver";
import { moveEntityTo, setLastAttackAt } from "./entities";
import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import { ENEMY_ATTACK_LEASH_DISTANCE } from "./enemyLeash";
import { isLivingCompanion } from "./entityGuards";
import {
  ENTITY_COLLISION_DISTANCE,
  getEntityCollisionShape,
} from "./movementPlanning";
import { getPartyMembers } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import { isEnemyBound } from "./skillRuntime";
import { getEntityById, updateEntity, type GameState } from "./state";
import { hasActiveStatusEffect, isFakeDeathActive } from "./statusEffects";
import type {
  CombatEntity,
  Enemy,
  EnemyAbilityCastState,
  EnemyDashInterruptReason,
  EnemyDashPlan,
  EnemyDashState,
  GameEntity,
  Position,
  ResolvedAoeArea,
} from "./types";
import type { EntityCollisionShape } from "./movementTypes";

const DASH_TERRAIN_SAMPLE_DISTANCE = 0.1;
const DASH_LANDING_SAMPLE_DISTANCE = 0.25;
const DASH_MINIMUM_DISTANCE = 3;
const DASH_CLEARANCE = 0.05;
const POSITION_EPSILON = 0.0001;

export type EnemyDashPreparation = {
  area: ResolvedAoeArea;
  dashPlan: EnemyDashPlan;
};

export function prepareEnemyDash(
  state: GameState,
  caster: Enemy,
  target: CombatEntity,
  area: ResolvedAoeArea,
  fullDistance: number,
  fullDurationMs: number,
): EnemyDashPreparation | null {
  const terrainDistance = getTerrainLimitedDashDistance(
    state,
    caster,
    area.castTransform.direction,
    fullDistance,
  );
  const landingDistance = findFurthestSafeDashDistance(
    state,
    caster,
    area.castTransform.origin,
    area.castTransform.direction,
    terrainDistance,
  );

  if (landingDistance === null || landingDistance < DASH_MINIMUM_DISTANCE) {
    return null;
  }

  const clippedArea = clipSquareAoeAreaToForwardDistance(area, landingDistance);

  if (!isPositionInsideAoe(clippedArea, target.position)) {
    return null;
  }

  return {
    area: clippedArea,
    dashPlan: {
      destination: getPositionAlongDirection(
        area.castTransform.origin,
        area.castTransform.direction,
        landingDistance,
      ),
      distance: landingDistance,
      durationMs: Math.max(
        0,
        fullDurationMs * (landingDistance / Math.max(fullDistance, POSITION_EPSILON)),
      ),
    },
  };
}

export function startEnemyDash(
  state: GameState,
  caster: Enemy,
  cast: EnemyAbilityCastState,
  powerMultiplier: number,
  now: number,
): GameState {
  if (!cast.area || !cast.dashPlan) {
    return state;
  }

  const dash: EnemyDashState = {
    id: `${cast.id}:dash`,
    abilityId: cast.abilityId,
    casterId: caster.id,
    origin: { ...cast.origin },
    direction: { ...cast.direction },
    destination: { ...cast.dashPlan.destination },
    distance: cast.dashPlan.distance,
    area: cast.area,
    startedAt: now,
    endsAt: now + cast.dashPlan.durationMs,
    lastUpdatedAt: now,
    lastProgressDistance: 0,
    lastSafePosition: { ...cast.origin },
    powerMultiplier,
    hitTargetIds: [],
  };

  return {
    ...state,
    enemyDashesByEnemyId: {
      ...(state.enemyDashesByEnemyId ?? {}),
      [caster.id]: dash,
    },
  };
}

export function updateEnemyDashSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
  now = Date.now(),
  rng: CombatRng = Math.random,
): GameState {
  let nextState = state;

  for (const dash of Object.values(state.enemyDashesByEnemyId ?? {})) {
    nextState = updateEnemyDash(nextState, dash.casterId, movedEntityIds, now, rng);
  }

  return nextState;
}

export function cancelEnemyDash(
  state: GameState,
  enemyId: string,
  _reason: EnemyDashInterruptReason,
  now = Date.now(),
): GameState {
  const dash = state.enemyDashesByEnemyId?.[enemyId];

  if (!dash) {
    return state;
  }

  const enemyDashesByEnemyId = { ...(state.enemyDashesByEnemyId ?? {}) };
  delete enemyDashesByEnemyId[enemyId];
  let nextState: GameState = { ...state, enemyDashesByEnemyId };
  const caster = getEntityById(nextState, enemyId);

  if (caster?.kind === "enemy" && caster.state !== "dead" && caster.health > 0) {
    nextState = updateEntity(
      nextState,
      setLastAttackAt(moveEntityTo(caster, dash.lastSafePosition), now),
    );
  }

  return nextState;
}

export function cleanupEnemyDashRuntime(
  state: GameState,
  now = Date.now(),
): GameState {
  let nextState = state;

  for (const dash of Object.values(state.enemyDashesByEnemyId ?? {})) {
    const caster = getEntityById(nextState, dash.casterId);

    if (!caster || caster.kind !== "enemy" || caster.state === "dead" || caster.health <= 0) {
      nextState = removeEnemyDash(nextState, dash.casterId);
      continue;
    }

    if (hasActiveStatusEffect(nextState, caster.id, "incapacitated")) {
      nextState = cancelEnemyDash(nextState, caster.id, "incapacitated", now);
      continue;
    }

    if (isEnemyBound(nextState, caster)) {
      nextState = cancelEnemyDash(nextState, caster.id, "bound", now);
    }
  }

  return nextState;
}

function updateEnemyDash(
  state: GameState,
  enemyId: string,
  movedEntityIds: Set<string>,
  now: number,
  rng: CombatRng,
): GameState {
  const dash = state.enemyDashesByEnemyId?.[enemyId];
  const caster = getEntityById(state, enemyId);

  if (!dash) {
    return state;
  }

  if (!caster) {
    return removeEnemyDash(state, enemyId);
  }

  if (caster.kind !== "enemy" || caster.state === "dead" || caster.health <= 0) {
    return removeEnemyDash(state, enemyId);
  }

  if (hasActiveStatusEffect(state, caster.id, "incapacitated")) {
    return cancelEnemyDash(state, caster.id, "incapacitated", now);
  }

  if (isEnemyBound(state, caster)) {
    return cancelEnemyDash(state, caster.id, "bound", now);
  }

  const durationMs = Math.max(0, dash.endsAt - dash.startedAt);
  const progress = durationMs === 0
    ? 1
    : Math.max(0, Math.min(1, (now - dash.startedAt) / durationMs));
  let progressDistance = dash.distance * progress;
  let nextPosition = getPositionAlongDirection(
    dash.origin,
    dash.direction,
    progressDistance,
  );

  if (progress >= 1) {
    const finalDistance = findFurthestSafeDashDistance(
      state,
      caster,
      dash.origin,
      dash.direction,
      dash.distance,
      dash.lastProgressDistance,
    );

    if (finalDistance !== null) {
      progressDistance = finalDistance;
      nextPosition = getPositionAlongDirection(
        dash.origin,
        dash.direction,
        progressDistance,
      );
    } else {
      progressDistance = dash.lastProgressDistance;
      nextPosition = dash.lastSafePosition;
    }
  }

  let nextState = applyDashHits(
    state,
    caster,
    dash,
    dash.lastProgressDistance,
    progressDistance,
    now,
    rng,
  );
  const currentCaster = getEntityById(nextState, caster.id);

  if (!currentCaster || currentCaster.kind !== "enemy") {
    return removeEnemyDash(nextState, caster.id);
  }

  const movedCaster = moveEntityTo(currentCaster, nextPosition);
  nextState = updateEntity(nextState, movedCaster);
  movedEntityIds.add(caster.id);

  if (progress >= 1) {
    return finishEnemyDash(nextState, caster.id, now);
  }

  const currentDash = nextState.enemyDashesByEnemyId?.[caster.id];

  if (!currentDash) {
    return nextState;
  }

  const isSafe = isDashLandingAvailable(
    nextState,
    movedCaster,
    nextPosition,
    caster.id,
  );

  return {
    ...nextState,
    enemyDashesByEnemyId: {
      ...(nextState.enemyDashesByEnemyId ?? {}),
      [caster.id]: {
        ...currentDash,
        lastUpdatedAt: now,
        lastProgressDistance: progressDistance,
        lastSafePosition: isSafe
          ? { ...nextPosition }
          : currentDash.lastSafePosition,
      },
    },
  };
}

function applyDashHits(
  state: GameState,
  caster: Enemy,
  dash: EnemyDashState,
  fromDistance: number,
  toDistance: number,
  now: number,
  rng: CombatRng,
): GameState {
  let nextState = state;
  const hitTargetIds = new Set(dash.hitTargetIds);

  for (const member of getPartyMembers(state)) {
    const target = getEntityById(nextState, member.id);

    if (
      !isLivingCompanion(target) ||
      hitTargetIds.has(target.id) ||
      isFakeDeathActive(nextState, target.id) ||
      !isPositionInsideAoe(dash.area, target.position)
    ) {
      continue;
    }

    const targetDistance = getForwardDistance(
      dash.origin,
      dash.direction,
      target.position,
    );

    if (
      targetDistance < fromDistance - POSITION_EPSILON ||
      targetDistance > toDistance + POSITION_EPSILON
    ) {
      continue;
    }

    hitTargetIds.add(target.id);
    const currentCaster = getEntityById(nextState, caster.id);

    if (!currentCaster || currentCaster.kind !== "enemy") {
      break;
    }

    nextState = resolveAndApplyCombatDamage(
      nextState,
      currentCaster,
      target,
      {
        damageType: "physical",
        powerMultiplier: dash.powerMultiplier,
        allowEvasion: true,
        allowPassiveBlock: true,
        label: "Rending Dash",
        now,
        rng,
      },
    ).state;
  }

  const currentDash = nextState.enemyDashesByEnemyId?.[caster.id];

  if (!currentDash) {
    return nextState;
  }

  return {
    ...nextState,
    enemyDashesByEnemyId: {
      ...(nextState.enemyDashesByEnemyId ?? {}),
      [caster.id]: {
        ...currentDash,
        hitTargetIds: [...hitTargetIds],
      },
    },
  };
}

function finishEnemyDash(
  state: GameState,
  enemyId: string,
  now: number,
): GameState {
  const nextState = removeEnemyDash(state, enemyId);
  const caster = getEntityById(nextState, enemyId);

  return caster?.kind === "enemy" && caster.state !== "dead" && caster.health > 0
    ? updateEntity(nextState, setLastAttackAt(caster, now))
    : nextState;
}

function removeEnemyDash(state: GameState, enemyId: string): GameState {
  if (!state.enemyDashesByEnemyId?.[enemyId]) {
    return state;
  }

  const enemyDashesByEnemyId = { ...(state.enemyDashesByEnemyId ?? {}) };
  delete enemyDashesByEnemyId[enemyId];
  return { ...state, enemyDashesByEnemyId };
}

function getTerrainLimitedDashDistance(
  state: GameState,
  caster: Enemy,
  direction: Position,
  maximumDistance: number,
): number {
  const steps = Math.max(
    1,
    Math.ceil(maximumDistance / DASH_TERRAIN_SAMPLE_DISTANCE),
  );
  let lastValidDistance = 0;

  for (let step = 1; step <= steps; step += 1) {
    const distance = Math.min(
      maximumDistance,
      step * DASH_TERRAIN_SAMPLE_DISTANCE,
    );
    const position = getPositionAlongDirection(caster.position, direction, distance);

    if (!isDashTerrainAvailable(state, caster, position)) {
      break;
    }

    lastValidDistance = distance;
  }

  return lastValidDistance;
}

function findFurthestSafeDashDistance(
  state: GameState,
  caster: Enemy,
  origin: Position,
  direction: Position,
  maximumDistance: number,
  minimumDistance = DASH_MINIMUM_DISTANCE,
): number | null {
  for (
    let distance = maximumDistance;
    distance >= minimumDistance - POSITION_EPSILON;
    distance -= DASH_LANDING_SAMPLE_DISTANCE
  ) {
    const clampedDistance = Math.max(minimumDistance, distance);
    const position = getPositionAlongDirection(origin, direction, clampedDistance);

    if (isDashLandingAvailable(state, caster, position, caster.id)) {
      return clampedDistance;
    }
  }

  return null;
}

function isDashTerrainAvailable(
  state: GameState,
  caster: Enemy,
  position: Position,
): boolean {
  const radius = getEnemyCombatBodyRadius(caster) + DASH_CLEARANCE;

  if (state.map) {
    if (
      position.x - radius < -0.5 ||
      position.x + radius > state.map.columns - 0.5 ||
      position.y - radius < -0.5 ||
      position.y + radius > state.map.rows - 0.5
    ) {
      return false;
    }

    for (const wall of [...state.map.walls, ...(state.map.collisionWalls ?? [])]) {
      if (doesCircleOverlapCell(position, radius, wall)) {
        return false;
      }
    }

    const subzone = caster.subzoneId
      ? state.map.subzones?.find((candidate) => candidate.id === caster.subzoneId)
      : undefined;

    if (subzone) {
      const minimumX = subzone.bounds.x - 0.5;
      const maximumX = subzone.bounds.x + subzone.bounds.width - 0.5;
      const minimumY = subzone.bounds.y - 0.5;
      const maximumY = subzone.bounds.y + subzone.bounds.height - 0.5;

      if (
        position.x - radius < minimumX ||
        position.x + radius > maximumX ||
        position.y - radius < minimumY ||
        position.y + radius > maximumY
      ) {
        return false;
      }

      const encounterArea = caster.encounterAreaId
        ? subzone.encounterAreas.find(
            (candidate) => candidate.id === caster.encounterAreaId,
          )
        : undefined;

      if (
        encounterArea?.leashRadius !== undefined &&
        getEuclideanDistance(position, encounterArea.center) + radius >
          encounterArea.leashRadius
      ) {
        return false;
      }
    }
  }

  if (
    !caster.questSpawn &&
    getEuclideanDistance(position, caster.homePosition) + radius >
      ENEMY_ATTACK_LEASH_DISTANCE
  ) {
    return false;
  }

  return !Object.values(state.entities).some(
    (entity) =>
      entity.id !== caster.id &&
      entity.kind === "resource" &&
      !entity.isDepleted &&
      entity.quantity > 0 &&
      getEuclideanDistance(position, entity.position) <
        radius + ENTITY_COLLISION_DISTANCE,
  );
}

function isDashLandingAvailable(
  state: GameState,
  caster: Enemy,
  position: Position,
  ignoredEnemyId: string,
): boolean {
  if (!isDashTerrainAvailable(state, caster, position)) {
    return false;
  }

  const casterRadius = getEnemyCombatBodyRadius(caster);

  if (
    Object.values(state.entities).some(
      (entity) =>
        entity.id !== caster.id &&
        entity.state !== "dead" &&
        isSolidEntity(entity) &&
        doesCasterCircleOverlapEntity(
          position,
          casterRadius,
          entity,
          DASH_CLEARANCE,
        ),
    )
  ) {
    return false;
  }

  return !getReservedDashDestinations(state, ignoredEnemyId).some(
    ({ enemy, position: destination }) =>
      getEuclideanDistance(position, destination) <
      casterRadius + getEnemyCombatBodyRadius(enemy) + DASH_CLEARANCE,
  );
}

function getReservedDashDestinations(
  state: GameState,
  ignoredEnemyId: string,
): Array<{ enemy: Enemy; position: Position }> {
  const reservations: Array<{ enemy: Enemy; position: Position }> = [];

  for (const cast of Object.values(state.enemyAbilityCastsByEnemyId ?? {})) {
    const enemy = getEntityById(state, cast.casterId);

    if (
      cast.casterId !== ignoredEnemyId &&
      cast.dashPlan &&
      enemy?.kind === "enemy" &&
      enemy.state !== "dead"
    ) {
      reservations.push({ enemy, position: cast.dashPlan.destination });
    }
  }

  for (const dash of Object.values(state.enemyDashesByEnemyId ?? {})) {
    const enemy = getEntityById(state, dash.casterId);

    if (
      dash.casterId !== ignoredEnemyId &&
      enemy?.kind === "enemy" &&
      enemy.state !== "dead"
    ) {
      reservations.push({ enemy, position: dash.destination });
    }
  }

  return reservations;
}

function isSolidEntity(entity: GameEntity): boolean {
  return (
    entity.kind === "companion" ||
    entity.kind === "enemy" ||
    entity.kind === "npc"
  );
}

function doesCasterCircleOverlapEntity(
  casterPosition: Position,
  casterRadius: number,
  entity: GameEntity,
  clearance: number,
): boolean {
  if (entity.kind === "enemy") {
    return getEuclideanDistance(casterPosition, entity.position) <
      casterRadius + getEnemyCombatBodyRadius(entity) + clearance;
  }

  return doesCircleOverlapCollisionShape(
    casterPosition,
    casterRadius + clearance,
    entity.position,
    getEntityCollisionShape(entity),
  );
}

function doesCircleOverlapCollisionShape(
  circlePosition: Position,
  circleRadius: number,
  shapePosition: Position,
  shape: EntityCollisionShape,
): boolean {
  if (shape.kind === "circle") {
    return getEuclideanDistance(circlePosition, shapePosition) <
      circleRadius + shape.radius;
  }

  const top = shapePosition.y - shape.height * shape.anchorY;
  const bottom = top + shape.height;
  const segmentStartY = top + shape.radius;
  const segmentEndY = bottom - shape.radius;
  const closestY = Math.min(
    Math.max(circlePosition.y, segmentStartY),
    segmentEndY,
  );

  return getEuclideanDistance(circlePosition, {
    x: shapePosition.x,
    y: closestY,
  }) < circleRadius + shape.radius;
}

function doesCircleOverlapCell(
  circlePosition: Position,
  circleRadius: number,
  cellPosition: Position,
): boolean {
  const closestX = Math.max(
    cellPosition.x - 0.5,
    Math.min(circlePosition.x, cellPosition.x + 0.5),
  );
  const closestY = Math.max(
    cellPosition.y - 0.5,
    Math.min(circlePosition.y, cellPosition.y + 0.5),
  );
  return getEuclideanDistance(circlePosition, { x: closestX, y: closestY }) <
    circleRadius;
}

function getPositionAlongDirection(
  origin: Position,
  direction: Position,
  distance: number,
): Position {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
  };
}

function getForwardDistance(
  origin: Position,
  direction: Position,
  position: Position,
): number {
  return (
    (position.x - origin.x) * direction.x +
    (position.y - origin.y) * direction.y
  );
}
