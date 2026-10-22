import { createEnemy } from "./entities";
import { findNavigationPath } from "./navigation";
import { getEntityCollisionShape, isPositionAvailable } from "./movementPlanning";
import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import { hasStructureLineOfSight, refreshStructureCollision } from "./combatStructures";
import { BARRACK_DEFINITIONS, BARRACK_ACTIVATION_RADIUS, BARRACK_PREPARATION_MS, BARRACK_RESPAWN_MS,
  createBarrackEntity, getBarrackMaxHealth, rollBarrackEnemy } from "./barrackDefinitions";
import type { BarrackDefinition } from "./barrackDefinitions";
import type { GameState } from "./state";
import type { AoeBounds, BarrackRuntime, GameEntity, Position } from "./types";

export function initializeBarracks(state: GameState): GameState {
  const definitions = BARRACK_DEFINITIONS.filter(definition => definition.mapId === state.currentMapId);
  let changed = false;
  const entities = { ...state.entities };
  const barracksById = { ...state.barracksById };
  for (const definition of definitions) {
    if (!barracksById[definition.id]) {
      barracksById[definition.id] = { health: getBarrackMaxHealth(), maxHealth: getBarrackMaxHealth(), preparationMs: 0, spawnSequence: 0 };
      changed = true;
    }
    if (entities[definition.id]?.kind !== "structure") {
      entities[definition.id] = createBarrackEntity(definition, barracksById[definition.id].health);
      changed = true;
    }
  }
  return changed ? refreshStructureCollision({ ...state, entities, barracksById }) : state;
}

export function doesEntityOverlapFootprint(entity: GameEntity, bounds: AoeBounds, position = entity.position): boolean {
  if (entity.state === "dead" || (entity.kind === "resource" && entity.isDepleted)) return false;
  if (entity.kind === "structure") return entity.health > 0 && entity.footprint.minX < bounds.maxX && entity.footprint.maxX > bounds.minX &&
    entity.footprint.minY < bounds.maxY && entity.footprint.maxY > bounds.minY;
  const shape = getEntityCollisionShape(entity);
  const radius = (entity.kind === "enemy" ? Math.max(shape.radius, getEnemyCombatBodyRadius(entity)) : shape.radius) + 0.05;
  const top = shape.kind === "verticalCapsule" ? position.y - shape.height * shape.anchorY + shape.radius : position.y;
  const bottom = shape.kind === "verticalCapsule" ? position.y - shape.height * shape.anchorY + shape.height - shape.radius : position.y;
  const dx = Math.max(bounds.minX - position.x, position.x - bounds.maxX, 0);
  const dy = Math.max(bounds.minY - bottom, top - bounds.maxY, 0);
  return dx * dx + dy * dy <= radius * radius;
}

export function isBarrackFootprintOccupied(state: GameState, definition: BarrackDefinition): boolean {
  for (const entity of Object.values(state.entities)) {
    if (entity.id === definition.id) continue;
    if (doesEntityOverlapFootprint(entity, definition.footprint)) return true;
    const reservation = state.reservedPositionsByEntityId?.[entity.id];
    if (reservation && doesEntityOverlapFootprint(entity, definition.footprint, reservation)) return true;
    const movement = state.moveIntentsByEntityId?.[entity.id];
    if (movement && doesEntityOverlapFootprint(entity, definition.footprint, movement)) return true;
    const dash = state.enemyDashesByEnemyId?.[entity.id];
    if (dash && doesEntityOverlapFootprint(entity, definition.footprint, dash.destination)) return true;
    const pendingDash = state.enemyAbilityCastsByEnemyId?.[entity.id]?.dashPlan;
    if (pendingDash && doesEntityOverlapFootprint(entity, definition.footprint, pendingDash.destination)) return true;
  }
  return false;
}

export type BarrackActivationContext = { activeEncounterIds?: ReadonlySet<string> };

export function updateBarracks(state: GameState, now: number, deltaMs: number, random = Math.random, context: BarrackActivationContext = {}): GameState {
  let nextState = initializeBarracks(state);
  for (const definition of BARRACK_DEFINITIONS) {
    let runtime = nextState.barracksById?.[definition.id];
    if (!runtime) continue;
    if (definition.mapId !== nextState.currentMapId) {
      if (runtime.wasInRange || runtime.speech || runtime.hintExpiresAtMs) nextState = setRuntime(nextState, definition.id, { ...runtime, wasInRange: false, speech: undefined, hintExpiresAtMs: undefined });
      continue;
    }
    if (runtime.health <= 0) {
      if (runtime.respawnAtMs === undefined || now < runtime.respawnAtMs || isBarrackFootprintOccupied(nextState, definition)) continue;
      runtime = { ...runtime, health: getBarrackMaxHealth(), maxHealth: getBarrackMaxHealth(), preparationMs: 0, respawnAtMs: undefined, wasInRange: false, pendingEnemyTypeId: undefined };
      nextState = refreshStructureCollision({ ...setRuntime(nextState, definition.id, runtime), entities: { ...nextState.entities, [definition.id]: createBarrackEntity(definition) } });
    }
    const barrack = nextState.entities[definition.id];
    if (barrack?.kind !== "structure") continue;
    // Hidden companions neither activate production nor become spawn-path goals.
    const activation = definition.activation;
    const encounterActive = !activation || context.activeEncounterIds?.has(activation.encounterId);
    const nearby = Object.values(nextState.entities).filter(entity => encounterActive && entity.kind === "companion" && entity.health > 0 && entity.state !== "dead" &&
      (activation
        ? entity.position.x >= activation.bounds.minX && entity.position.x <= activation.bounds.maxX && entity.position.y >= activation.bounds.minY && entity.position.y <= activation.bounds.maxY
        : Math.hypot(entity.position.x - definition.position.x, entity.position.y - definition.position.y) <= BARRACK_ACTIVATION_RADIUS) &&
      hasStructureLineOfSight(nextState, entity.position, barrack));
    const inRange = nearby.length > 0;
    const count = Object.values(nextState.entities).filter(entity => entity.kind === "enemy" && entity.barrackSpawn?.barrackId === definition.id && entity.health > 0 && entity.state !== "dead").length;
    const productionAllowed = inRange && count < definition.reinforcementCap;
    const activated = productionAllowed && !runtime.wasInRange;
    runtime = { ...runtime, wasInRange: productionAllowed ? true : inRange ? runtime.wasInRange : false,
      speech: runtime.speech && runtime.speech.expiresAt > now ? runtime.speech : undefined,
      hintExpiresAtMs: (runtime.hintExpiresAtMs ?? 0) > now ? runtime.hintExpiresAtMs : undefined };
    if (activated && definition.tutorial) {
      const text = random() < 0.5 ? "Just you wait, invaders—I’m almost ready!" : "I hope they don’t destroy this!";
      runtime = { ...runtime, speech: { text, createdAt: now, expiresAt: now + 5_000 },
        hintExpiresAtMs: runtime.tutorialSeen ? undefined : now + 5_000, tutorialSeen: true };
    }
    if (productionAllowed) {
      runtime = { ...runtime, preparationMs: Math.min(BARRACK_PREPARATION_MS, runtime.preparationMs + Math.max(0, Math.min(deltaMs, 100))) };
      if (runtime.preparationMs >= BARRACK_PREPARATION_MS) {
        const type = runtime.pendingEnemyTypeId ?? rollBarrackEnemy(random);
        runtime = { ...runtime, pendingEnemyTypeId: type };
        const sequence = runtime.spawnSequence + 1;
        const id = `${definition.id}-orc-${sequence}`;
        const enemy = createEnemy(id, definition.position, "aggressive", { enemyTypeId: type, subzoneId: definition.subzoneId });
        const position = definition.spawnCandidates.find(candidate => isSpawnPositionClear(nextState, candidate, enemy) &&
          nearby.some(companion => findNavigationPath(nextState.map!, candidate, [companion.position]).length > 0 ||
            Math.hypot(candidate.x - companion.position.x, candidate.y - companion.position.y) < 1));
        if (position && !nextState.entities[id]) {
          nextState = { ...nextState, entities: { ...nextState.entities, [id]: { ...enemy, position: { ...position }, homePosition: { ...position }, barrackSpawn: { barrackId: definition.id, sequence } } } };
          runtime = { ...runtime, preparationMs: 0, pendingEnemyTypeId: undefined, spawnSequence: sequence };
        }
      }
    }
    nextState = setRuntime(nextState, definition.id, runtime);
  }
  return nextState;
}

function isSpawnPositionClear(state: GameState, position: Position, enemy: import("./types").Enemy): boolean {
  if (!state.map || !isPositionAvailable(state, position)) return false;
  const radius = getEnemyCombatBodyRadius(enemy) + 0.05;
  const bounds = { minX: position.x - radius, maxX: position.x + radius, minY: position.y - radius, maxY: position.y + radius };
  if (bounds.minX < -0.5 || bounds.minY < -0.5 || bounds.maxX > state.map.columns - 0.5 || bounds.maxY > state.map.rows - 0.5) return false;
  if ([...state.map.walls, ...(state.map.collisionWalls ?? [])].some(cell => {
    const dx = Math.max(cell.x - 0.5 - position.x, position.x - cell.x - 0.5, 0);
    const dy = Math.max(cell.y - 0.5 - position.y, position.y - cell.y - 0.5, 0);
    return dx * dx + dy * dy < radius * radius;
  })) return false;
  return !Object.values(state.entities).some(entity => doesEntityOverlapFootprint(entity, bounds));
}

function setRuntime(state: GameState, id: string, runtime: BarrackRuntime): GameState {
  return { ...state, barracksById: { ...state.barracksById, [id]: runtime } };
}

export function restoreBarracks(state: GameState, now: number): GameState {
  const barracksById: Record<string, BarrackRuntime> = {};
  const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  for (const definition of BARRACK_DEFINITIONS) {
    const saved = state.barracksById?.[definition.id];
    if (!saved || typeof saved !== "object") continue;
    const serializedStructure = state.entities[definition.id];
    const oldMaxHealth = saved.maxHealth && Number.isFinite(saved.maxHealth) && saved.maxHealth > 0
      ? saved.maxHealth
      : serializedStructure?.kind === "structure" && Number.isFinite(serializedStructure.maxHealth) && serializedStructure.maxHealth > 0
        ? serializedStructure.maxHealth : 624;
    const oldHealth = finite(saved.health, oldMaxHealth);
    const health = oldHealth <= 0 ? 0 : Math.max(1, Math.min(getBarrackMaxHealth(), Math.round(oldHealth / oldMaxHealth * getBarrackMaxHealth())));
    barracksById[definition.id] = { health, maxHealth: getBarrackMaxHealth(), preparationMs: Math.max(0, Math.min(BARRACK_PREPARATION_MS, finite(saved.preparationMs, 0))),
      spawnSequence: Number.isSafeInteger(saved.spawnSequence) && saved.spawnSequence >= 0 && saved.spawnSequence < Number.MAX_SAFE_INTEGER ? saved.spawnSequence : 0, tutorialSeen: saved.tutorialSeen === true,
      wasInRange: true,
      ...(health <= 0 ? { respawnAtMs: Math.max(0, finite(saved.respawnAtMs, now + BARRACK_RESPAWN_MS)) } : {}),
      ...(["orc", "orc_raider", "orc_shieldbearer"].includes(saved.pendingEnemyTypeId ?? "") ? { pendingEnemyTypeId: saved.pendingEnemyTypeId } : {}),
    };
  }
  const entities = { ...state.entities };
  for (const [id, entity] of Object.entries(entities)) {
    if (entity.kind === "structure") { delete entities[id]; continue; }
    if (entity.kind !== "enemy" || !entity.barrackSpawn) continue;
    const definition = BARRACK_DEFINITIONS.find(item => item.id === entity.barrackSpawn?.barrackId && item.mapId === state.currentMapId);
    const sequence = entity.barrackSpawn.sequence;
    if (!definition || !Number.isSafeInteger(sequence) || sequence <= 0 || id !== `${definition.id}-orc-${sequence}` || !["orc", "orc_raider", "orc_shieldbearer"].includes(entity.enemyTypeId ?? "")) { delete entities[id]; continue; }
    const runtime = barracksById[definition.id] ?? { health: getBarrackMaxHealth(), maxHealth: getBarrackMaxHealth(), preparationMs: 0, spawnSequence: 0, wasInRange: true };
    barracksById[definition.id] = { ...runtime, spawnSequence: Math.max(runtime.spawnSequence, sequence) };
    const normal = createEnemy(id, entity.homePosition, entity.aggressionMode, { enemyTypeId: entity.enemyTypeId });
    entities[id] = { ...entity, variant: undefined, level: normal.level,
      maxHealth: normal.maxHealth, health: Math.max(0, Math.min(normal.maxHealth, finite(entity.health, normal.maxHealth))),
      attack: normal.attack, defense: normal.defense, magicDefense: normal.magicDefense, evasion: normal.evasion };
  }
  return initializeBarracks({ ...state, entities, barracksById });
}
