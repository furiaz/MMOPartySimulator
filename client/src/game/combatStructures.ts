import { finishDirectCompanionCommand } from "./directCommandState";
import { bakeNavigationGrid } from "./navigation";
import { BARRACK_DEFINITIONS, BARRACK_RESPAWN_MS, getBarrackCollisionCells, getBarrackMaxHealth } from "./barrackDefinitions";
import type { GameState } from "./state";
import type { CombatStructure, Enemy, GameEntity, Position } from "./types";
import { findNearestReachablePosition, isCombatPositionAvailable, isWallPosition } from "./movementPlanning";
import { DEFAULT_COMPANION_ATTACK_RANGE, getCompanionAttackRange } from "./companionCombat";
import { clearEnemyFromPartyTargeting } from "./partyTargetSystem";
import { getGridDistance } from "./positionUtils";
import { getCombatTargetPosition, isWithinAttackReach } from "./spatialGeometry";
export { getCombatTargetPosition } from "./spatialGeometry";
import { createAoeCastTransform, doesAoeIntersectFootprint, resolveAoePattern } from "./aoePatterns";

export function isHostileTargetInRadius(target: Enemy | CombatStructure, center: Position, radius: number): boolean {
  return target.kind === "structure"
    ? doesAoeIntersectFootprint(resolveAoePattern({ type: "circle", radius }, createAoeCastTransform(center, center)), target.attackBounds)
    : getGridDistance(target.position, center) <= radius;
}

export function isLivingHostileTarget(entity: GameEntity | undefined): entity is Enemy | CombatStructure {
  return Boolean(entity && (entity.kind === "enemy" || entity.kind === "structure") && entity.state !== "dead" && entity.health > 0);
}

/** Keep a valid firing position, or search once for any reachable attackable edge. */
export function getStructureApproachPosition(state: GameState, actor: GameEntity, target: CombatStructure): Position | null {
  const range = actor.kind === "companion" ? getCompanionAttackRange(actor) : DEFAULT_COMPANION_ATTACK_RANGE;
  const canAttackFrom = (position: Position) =>
    isWithinAttackReach(actor, target, range, position) &&
    isCombatPositionAvailable(state, actor, position, { allowPartyPassThrough: true }) &&
    hasStructureLineOfSight(state, position, target);
  if (canAttackFrom(actor.position)) {
    return actor.position;
  }
  return findNearestReachablePosition(state, actor, canAttackFrom, { allowPartyPassThrough: true });
}

export function hasStructureLineOfSight(state: GameState, from: Position, target: GameEntity): boolean {
  if (target.kind !== "structure") return true;
  const end = getCombatTargetPosition(from, target);
  const distance = Math.hypot(end.x - from.x, end.y - from.y);
  for (let step = 0; step < distance; step += 0.15) {
    const point = {x: from.x + (end.x - from.x) * step / distance, y: from.y + (end.y - from.y) * step / distance};
    // The target's own collision is intentionally allowed at its perimeter.
    const cellInside = Math.round(point.x) >= Math.ceil(target.footprint.minX) && Math.round(point.x) < target.footprint.maxX &&
      Math.round(point.y) >= Math.ceil(target.footprint.minY) && Math.round(point.y) < target.footprint.maxY;
    if (!cellInside && isWallPosition(state, point)) return false;
  }
  return true;
}

export function updateStructureRuntime(state: GameState, structure: CombatStructure, now: number): GameState {
  const previous = state.barracksById?.[structure.id];
  const health = Math.max(0, Math.min(getBarrackMaxHealth(), structure.health));
  let nextState: GameState = { ...state, barracksById: { ...state.barracksById, [structure.id]: {
    preparationMs: 0, spawnSequence: 0, ...previous, health, maxHealth: getBarrackMaxHealth(),
    ...(health <= 0 ? { respawnAtMs: previous?.respawnAtMs ?? now + BARRACK_RESPAWN_MS,
      preparationMs: 0, pendingEnemyTypeId: undefined, speech: undefined, hintExpiresAtMs: undefined, wasInRange: false,
      ...(!previous || previous.health > 0 ? { rebuildWarningShown: false, nextClearanceRetryAtMs: undefined } : {}) } : {}),
  } } };
  if (health <= 0 && (!previous || previous.health > 0)) {
    nextState = clearEnemyFromPartyTargeting(nextState, structure.id);
    for (const command of Object.values(nextState.directCompanionCommandsById ?? {}))
      if ("targetId" in command && command.targetId === structure.id)
        nextState = finishDirectCompanionCommand(nextState, command, now, "direct_command_completed", "target_invalid");
    nextState = { ...nextState,
      entities: Object.fromEntries(Object.entries(nextState.entities).map(([id, entity]) => [id,
        entity.kind === "companion" && entity.currentTargetId === structure.id
          ? { ...entity, state: "follow", currentTargetId: null, commandPriority: "autonomous" } : entity])),
    };
    return refreshStructureCollision(nextState);
  }
  return nextState;
}

export function refreshStructureCollision(state: GameState): GameState {
  if (!state.map) return state;
  const definitions = BARRACK_DEFINITIONS.filter(definition => definition.mapId === state.currentMapId);
  if (!definitions.length) return state;
  const structureKeys = new Set(definitions.flatMap(getBarrackCollisionCells).map(cell => `${cell.x},${cell.y}`));
  const collisionWalls = (state.map.collisionWalls ?? []).filter(cell => !structureKeys.has(`${cell.x},${cell.y}`));
  for (const definition of definitions) {
    if ((state.barracksById?.[definition.id]?.health ?? getBarrackMaxHealth()) > 0) collisionWalls.push(...getBarrackCollisionCells(definition));
  }
  const map = { ...state.map, collisionWalls };
  map.navigationGrid = bakeNavigationGrid(map);
  return { ...state, map, movementPathsByEntityId: {}, attackSlotCacheByEntityId: {},
    enemyTargetReachabilityCacheByEnemyId: {}, movementPathRetryAtMsByEntityId: {} };
}
