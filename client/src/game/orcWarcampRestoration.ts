import { BARRACK_DEFINITIONS } from "./barrackDefinitions";
import { getEnemyStartDataForMap } from "./debugMap";
import { isEnemyMovementPositionAllowed } from "./enemyMovementBounds";
import { isForcedMovementPositionAvailable } from "./forcedMovement";
import { ORC_WARCAMP_ARENA, ORC_WARCAMP_SAFE_ARRIVAL } from "./orcWarcampLayout";
import { updateEntity, type GameState } from "./state";
import type { GameEntity, Position } from "./types";

function isSafe(state: GameState, actor: GameEntity, position: Position, landing = true): boolean {
  return isForcedMovementPositionAvailable(state, actor, position, landing) &&
    (actor.kind !== "enemy" || isEnemyMovementPositionAllowed(state, actor, position));
}

function findSafePosition(state: GameState, actor: GameEntity, preferred: Position): Position | undefined {
  const candidates: Position[] = [preferred];
  for (let y = Math.ceil(ORC_WARCAMP_ARENA.minY); y <= Math.floor(ORC_WARCAMP_ARENA.maxY); y++) {
    for (let x = Math.ceil(ORC_WARCAMP_ARENA.minX); x <= Math.floor(ORC_WARCAMP_ARENA.maxX); x++) candidates.push({ x, y });
  }
  candidates.sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y) || a.y - b.y || a.x - b.x);
  const safe = candidates.find(position => isSafe(state, actor, position));
  if (safe) return safe;
  // Only needed for unusually crowded imported/debug saves; never runs in simulation ticks.
  for (let y = 1; y < (state.map?.rows ?? 0) - 1; y++) {
    for (let x = 1; x < (state.map?.columns ?? 0) - 1; x++) {
      if (isSafe(state, actor, { x, y })) return { x, y };
    }
  }
  return undefined;
}

/** Reconcile changed authored homes and blocked bodies without changing roster or life state. */
export function restoreOrcWarcampLayout(state: GameState): GameState {
  if (state.currentMapId !== "map-7") return state;
  let next = state;
  const authoredBoss = getEnemyStartDataForMap("map-7").find(spawn => spawn.enemyTypeId === "orc_warmaster");
  const actors = Object.values(state.entities).filter(actor => actor.kind === "companion" || actor.kind === "enemy")
    .sort((a, b) => (a.kind === "companion" ? a.partyOrder : Number.MAX_SAFE_INTEGER) - (b.kind === "companion" ? b.partyOrder : Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  for (const savedActor of actors) {
    let actor = next.entities[savedActor.id];
    let preferred = ORC_WARCAMP_SAFE_ARRIVAL;
    if (actor.kind === "enemy") {
      const barrackId = actor.barrackSpawn?.barrackId;
      const barrack = BARRACK_DEFINITIONS.find(definition => definition.id === barrackId);
      if (authoredBoss?.id === actor.id) {
        actor = { ...actor, homePosition: { ...authoredBoss.position }, movementBounds: ORC_WARCAMP_ARENA,
          combatSizeMultiplier: 1, minimumMovementBodyRadius: (actor.combatBodyRadius ?? 1.25) * 1.5 };
        preferred = actor.homePosition;
      } else if (barrack) {
        const home = barrack.spawnCandidates.find(position => isSafe(next, actor, position, false));
        if (home) actor = { ...actor, homePosition: { ...home } };
        preferred = actor.homePosition;
      } else if (isSafe(next, actor, actor.homePosition, false)) preferred = actor.homePosition;
    }
    if (!isSafe(next, actor, actor.position, false)) {
      const position = findSafePosition(next, actor, preferred);
      if (position) actor = { ...actor, position: { ...position } };
    }
    if (actor !== savedActor) next = updateEntity(next, actor);
  }
  return next;
}
