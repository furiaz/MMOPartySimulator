import { moveEntityTo } from "./entities";
import { getEnemyCombatBodyRadius } from "./enemyArchetypes";
import {
  isEntitySeparationPositionAvailable,
} from "./movementPlanning";
import { areEntitiesOverlapping } from "./spatialGeometry";
import { getNormalMovementResult } from "./movementAuthority";
import { getEuclideanDistance } from "./positionUtils";
import { updateEntity, type GameState } from "./state";
import type { GameEntity, Position } from "./types";

const SEPARATION_NUDGE_DISTANCE = 0.12;
const SAME_POSITION_DIRECTION_COUNT = 8;

type SeparationParticipant = GameEntity & {
  kind: "companion" | "enemy" | "npc";
};

export function updateEntitySeparationSystem(
  state: GameState,
  movedEntityIds: Set<string>,
): GameState {
  let nextState = state;
  const separatedEntityIds = new Set<string>();
  const participants = Object.values(state.entities).filter(
    isSeparationParticipant,
  );

  for (let firstIndex = 0; firstIndex < participants.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < participants.length;
      secondIndex += 1
    ) {
      const first = nextState.entities[participants[firstIndex].id];
      const second = nextState.entities[participants[secondIndex].id];

      if (
        !isSeparationParticipant(first) ||
        !isSeparationParticipant(second) ||
        separatedEntityIds.has(first.id) ||
        separatedEntityIds.has(second.id) ||
        !canPairSeparate(nextState, first, second, movedEntityIds)
      ) {
        continue;
      }

      nextState = separateStationaryPair(nextState, first, second);
      markSeparatedEntity(first, nextState, separatedEntityIds);
      markSeparatedEntity(second, nextState, separatedEntityIds);
    }
  }

  return nextState;
}

function markSeparatedEntity(
  entity: SeparationParticipant,
  state: GameState,
  separatedEntityIds: Set<string>,
): void {
  const nextEntity = state.entities[entity.id];

  if (
    nextEntity &&
    getEuclideanDistance(entity.position, nextEntity.position) > 0.001
  ) {
    separatedEntityIds.add(entity.id);
  }
}

function canPairSeparate(
  state: GameState,
  first: SeparationParticipant,
  second: SeparationParticipant,
  movedEntityIds: Set<string>,
): boolean {
  return (
    isStationaryForSeparation(state, first, movedEntityIds) &&
    isStationaryForSeparation(state, second, movedEntityIds) &&
    areEntitiesOverlapping(first, second) &&
    (isPushable(first) || isPushable(second))
  );
}

function separateStationaryPair(
  state: GameState,
  first: SeparationParticipant,
  second: SeparationParticipant,
): GameState {
  const firstPushable = isPushable(first);
  const secondPushable = isPushable(second);
  const leaderPair = getSamePartyLeaderPair(state, first, second);

  if (leaderPair) {
    return pushEntityAwayFromSource(
      state,
      leaderPair.follower,
      leaderPair.leader,
    );
  }

  if (firstPushable && secondPushable) {
    const nextState = pushEntityAwayFromSource(state, first, second);
    const updatedSecond = nextState.entities[second.id];

    return isSeparationParticipant(updatedSecond)
      ? pushEntityAwayFromSource(nextState, updatedSecond, first)
      : nextState;
  }

  if (firstPushable) {
    return pushEntityAwayFromSource(state, first, second);
  }

  return secondPushable ? pushEntityAwayFromSource(state, second, first) : state;
}

function getSamePartyLeaderPair(
  state: GameState,
  first: SeparationParticipant,
  second: SeparationParticipant,
): { leader: SeparationParticipant; follower: SeparationParticipant } | null {
  if (first.kind !== "companion" || second.kind !== "companion") {
    return null;
  }

  if (first.id === state.partyLeaderId && isPushable(second)) {
    return { leader: first, follower: second };
  }

  if (second.id === state.partyLeaderId && isPushable(first)) {
    return { leader: second, follower: first };
  }

  return null;
}

function pushEntityAwayFromSource(
  state: GameState,
  entity: SeparationParticipant,
  source: SeparationParticipant,
): GameState {
  const direction = getSeparationDirection(entity, source);
  const nextPosition = {
    x: entity.position.x + direction.x * SEPARATION_NUDGE_DISTANCE,
    y: entity.position.y + direction.y * SEPARATION_NUDGE_DISTANCE,
  };

  if (
    !isEntitySeparationPositionAvailable(
      state,
      entity.id,
      source.id,
      nextPosition,
    )
  ) {
    return state;
  }

  return updateEntity(state, moveEntityTo(entity, nextPosition));
}

function isSeparationParticipant(
  entity: GameEntity | undefined,
): entity is SeparationParticipant {
  return Boolean(
    entity &&
      entity.state !== "dead" &&
      (entity.kind === "companion" ||
        entity.kind === "enemy" ||
        entity.kind === "npc"),
  );
}

function isStationaryForSeparation(
  state: GameState,
  entity: SeparationParticipant,
  movedEntityIds: Set<string>,
): boolean {
  return (
    !movedEntityIds.has(entity.id) &&
    getNormalMovementResult(state, entity.id)?.outcome !== "moved" &&
    !state.moveIntentsByEntityId?.[entity.id] &&
    !state.reservedPositionsByEntityId?.[entity.id]
  );
}

function isPushable(entity: SeparationParticipant): boolean {
  return (
    entity.kind === "companion" ||
    (entity.kind === "enemy" && getEnemyCombatBodyRadius(entity) <= 0)
  );
}

function getSeparationDirection(
  entity: SeparationParticipant,
  source: SeparationParticipant,
): Position {
  const xDistance = entity.position.x - source.position.x;
  const yDistance = entity.position.y - source.position.y;
  const distance = Math.hypot(xDistance, yDistance);

  if (distance > 0) {
    return {
      x: xDistance / distance,
      y: yDistance / distance,
    };
  }

  return getDeterministicDirection(entity.id, source.id);
}

function getDeterministicDirection(entityId: string, sourceId: string): Position {
  const [firstId, secondId] = [entityId, sourceId].sort();
  const hash = `${firstId}:${secondId}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  const angle =
    ((hash % SAME_POSITION_DIRECTION_COUNT) / SAME_POSITION_DIRECTION_COUNT) *
    Math.PI *
    2;
  const direction = {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };

  return entityId === firstId
    ? direction
    : { x: -direction.x, y: -direction.y };
}
