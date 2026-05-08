import { createCompanion, isResourceEntity, moveEntityTo } from "./entities";
import { getPartySizeLimit } from "./leveling";
import {
  addEntity,
  findClosestAvailablePosition,
  getEntityById,
  isWallPosition,
  updateEntity,
  type GameState,
} from "./state";
import type { Companion, Enemy, GameEntity, Position, ResourceEntity } from "./types";

const DEBUG_ENEMY_HEALTH = 3;
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

  const companionCount = Object.values(state.entities).filter(
    (entity) => entity.kind === "companion",
  ).length;

  if (companionCount >= getPartySizeLimit(state)) {
    return state;
  }

  const partyOrder = companionCount;
  const availablePosition = findClosestAvailablePosition(state, position);

  return addEntity(
    state,
    createCompanion(
      companionId,
      availablePosition,
      followTargetId,
      "none",
      partyOrder,
    ),
  );
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

  return {
    ...state,
    entities,
    followTrailsByEntityId,
    partyLeaderId:
      state.partyLeaderId === companionId ? getFallbackLeaderId(entities) : state.partyLeaderId,
  };
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
    health: entity.maxHealth || DEBUG_ENEMY_HEALTH,
    maxHealth: entity.maxHealth || DEBUG_ENEMY_HEALTH,
    currentTargetId: null,
    lastAttackAt: 0,
  };

  return updateEntity(state, enemy);
}

export function debugRestorePartyHealth(state: GameState): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "companion") {
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

function restorePartyMember<T extends Companion>(entity: T): T {
  return {
    ...entity,
    health: entity.maxHealth,
    state: entity.state === "dead" ? "idle" : entity.state,
  };
}

function getFallbackLeaderId(entities: Record<string, GameEntity>): string {
  return (
    Object.values(entities).find(
      (entity) => entity.kind === "companion",
    )?.id ?? ""
  );
}

function getRandomOpenPosition(
  state: GameState,
  maxX: number,
  maxY: number,
  usedPositions: Set<string>,
): Position {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const position = {
      x: Math.random() * maxX,
      y: Math.random() * maxY,
    };

    if (
      isWallPosition(state, position) ||
      usedPositions.has(getPositionKey(position))
    ) {
      continue;
    }

    return position;
  }

  return { x: 0, y: 0 };
}

function getPositionKey(position: Position): string {
  return `${Math.round(position.x)},${Math.round(position.y)}`;
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}
