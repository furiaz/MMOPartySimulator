import {
  gatherResource,
  isAutonomousEntity,
  isResourceEntity,
  moveEntityToward,
  setLastGatherAt,
} from "./entities";
import { getEntityById, updateEntity, type GameState } from "./state";
import type { AutonomousEntity, GameEntity } from "./types";

const GATHER_RANGE = 1;
const GATHER_AMOUNT = 1;
const GATHER_COOLDOWN_MS = 1000;

export function updateGatherSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const now = Date.now();

  for (const entity of Object.values(state.entities)) {
    const gatherer = getEntityById(nextState, entity.id);

    if (!gatherer || !isGatheringEntity(gatherer)) {
      continue;
    }

    if (!gatherer.currentTargetId) {
      continue;
    }

    const resource = getEntityById(nextState, gatherer.currentTargetId);

    if (!isResourceEntity(resource) || resource.isDepleted) {
      nextState = updateEntity(nextState, {
        ...gatherer,
        state: "idle",
        currentTargetId: null,
      });
      continue;
    }

    if (!isInGatherRange(gatherer, resource)) {
      if (movedEntityIds.has(gatherer.id)) {
        continue;
      }

      nextState = updateEntity(nextState, moveEntityToward(gatherer, resource));
      movedEntityIds.add(gatherer.id);
      continue;
    }

    if (!canGather(gatherer, now)) {
      continue;
    }

    nextState = updateEntity(
      nextState,
      gatherResource(resource, GATHER_AMOUNT),
    );
    nextState = updateEntity(nextState, setLastGatherAt(gatherer, now));
  }

  return nextState;
}

function isGatheringEntity(entity: GameEntity): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "gather";
}

function isInGatherRange(gatherer: GameEntity, resource: GameEntity): boolean {
  const xDistance = Math.abs(resource.position.x - gatherer.position.x);
  const yDistance = Math.abs(resource.position.y - gatherer.position.y);

  return xDistance <= GATHER_RANGE && yDistance <= GATHER_RANGE;
}

function canGather(entity: AutonomousEntity, now: number): boolean {
  return now - entity.lastGatherAt >= GATHER_COOLDOWN_MS;
}
