import { createCompanion, isResourceEntity, moveEntityTo } from "./entities";
import {
  addEntity,
  findClosestAvailablePosition,
  getEntityById,
  isWallPosition,
  updateEntity,
  type GameState,
} from "./state";
import type { Companion, Enemy, Player, Position, ResourceEntity } from "./types";

const DEBUG_HEALTH = 10;
const DEBUG_RESOURCE_DURABILITY = 5;
const DEBUG_RESOURCE_QUANTITY = 3;

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

  const entities = { ...state.entities };
  const followTrailsByEntityId = { ...state.followTrailsByEntityId };
  delete entities[companionId];
  delete followTrailsByEntityId[companionId];

  return { ...state, entities, followTrailsByEntityId };
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
  const usedPositions = new Set<string>();

  for (const entity of Object.values(state.entities)) {
    const position = getRandomOpenPosition(nextState, maxX, maxY, usedPositions);
    usedPositions.add(getPositionKey(position));

    nextState = updateEntity(
      nextState,
      moveEntityTo(entity, position),
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

    nextState = moveEntitiesOffResourcePosition(nextState, entity);
    nextState = updateEntity(nextState, resetResource(entity));
  }

  return nextState;
}

function moveEntitiesOffResourcePosition(
  state: GameState,
  resource: ResourceEntity,
): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (
      entity.id === resource.id ||
      entity.kind === "resource" ||
      !isSamePosition(entity.position, resource.position)
    ) {
      continue;
    }

    nextState = updateEntity(
      nextState,
      moveEntityTo(
        entity,
        findClosestAvailablePosition(nextState, entity.position, {
          blockedPositions: [resource.position],
          ignoredEntityId: entity.id,
        }),
      ),
    );
  }

  return nextState;
}

function resetResource(resource: ResourceEntity): ResourceEntity {
  return {
    ...resource,
    state: "idle",
    durability: DEBUG_RESOURCE_DURABILITY,
    maxDurability: DEBUG_RESOURCE_DURABILITY,
    quantity: DEBUG_RESOURCE_QUANTITY,
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

function getRandomOpenPosition(
  state: GameState,
  maxX: number,
  maxY: number,
  usedPositions: Set<string>,
): Position {
  const openPositions: Position[] = [];

  for (let y = 0; y < maxY; y += 1) {
    for (let x = 0; x < maxX; x += 1) {
      const position = { x, y };

      if (
        isWallPosition(state, position) ||
        usedPositions.has(getPositionKey(position))
      ) {
        continue;
      }

      openPositions.push(position);
    }
  }

  return openPositions[getRandomInt(openPositions.length)] ?? { x: 0, y: 0 };
}

function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}
