import { createCompanion, isResourceEntity, moveEntityTo } from "./entities";
import { addEntity, getEntityById, updateEntity, type GameState } from "./state";
import type { Companion, Enemy, Player, Position, ResourceEntity } from "./types";

const DEBUG_HEALTH = 10;
const DEBUG_RESOURCE_DURABILITY = 5;

export function debugAddCompanion(
  state: GameState,
  companionId: string,
  followTargetId: string,
  position: Position,
): GameState {
  if (getEntityById(state, companionId)) {
    return state;
  }

  return addEntity(state, createCompanion(companionId, position, followTargetId));
}

export function debugAddCompanionToParty(
  state: GameState,
  companionIds: string[],
  followTargetId: string,
  positions: Position[],
): GameState {
  const nextCompanionId = companionIds.find((id) => !getEntityById(state, id));

  if (!nextCompanionId) {
    return state;
  }

  const position = positions[companionIds.indexOf(nextCompanionId)] ?? {
    x: 0,
    y: 0,
  };

  return debugAddCompanion(state, nextCompanionId, followTargetId, position);
}

export function debugRemoveCompanion(
  state: GameState,
  companionId: string,
): GameState {
  if (!getEntityById(state, companionId)) {
    return state;
  }

  const { [companionId]: _removed, ...entities } = state.entities;

  return { ...state, entities };
}

export function debugRemoveCompanionFromParty(
  state: GameState,
  companionIds: string[],
): GameState {
  const companionId = companionIds
    .slice()
    .reverse()
    .find((id) => getEntityById(state, id));

  if (!companionId) {
    return state;
  }

  return debugRemoveCompanion(state, companionId);
}

export function debugRandomizeLocations(
  state: GameState,
  maxX: number,
  maxY: number,
): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    nextState = updateEntity(
      nextState,
      moveEntityTo(entity, {
        x: getRandomInt(maxX),
        y: getRandomInt(maxY),
      }),
    );
  }

  return nextState;
}

export function debugResurrectEnemy(
  state: GameState,
  enemyId: string,
): GameState {
  const entity = getEntityById(state, enemyId);

  if (entity?.kind !== "enemy") {
    return state;
  }

  const enemy: Enemy = {
    ...entity,
    state: "idle",
    health: DEBUG_HEALTH,
    currentTargetId: null,
    lastAttackAt: 0,
  };

  return updateEntity(state, enemy);
}

export function debugRestorePartyHealth(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "player" && entity.kind !== "companion") {
      continue;
    }

    nextState = updateEntity(nextState, restorePartyMember(entity));
  }

  return nextState;
}

export function debugRefreshResources(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!isResourceEntity(entity)) {
      continue;
    }

    nextState = updateEntity(nextState, resetResource(entity));
  }

  return nextState;
}

function resetResource(resource: ResourceEntity): ResourceEntity {
  return {
    ...resource,
    state: "idle",
    durability: DEBUG_RESOURCE_DURABILITY,
    isDepleted: false,
  };
}

function restorePartyMember<T extends Player | Companion>(entity: T): T {
  return {
    ...entity,
    health: DEBUG_HEALTH,
    state: entity.state === "dead" ? "idle" : entity.state,
  };
}

function getRandomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}
