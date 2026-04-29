import {
  gatherResource,
  isAutonomousEntity,
  isResourceEntity,
  setLastGatherAt,
} from "./entities";
import {
  getEntityById,
  moveEntityTowardIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import type { AutonomousEntity, GameEntity, ResourceEntity } from "./types";

const GATHER_RANGE = 1;
const GATHER_COOLDOWN_MS = 1000;

export function updateGatherSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  let nextState = state;
  const now = Date.now();
  const allowedGathererIdsByResource = getAllowedGathererIdsByResource(state);

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
      nextState = updateEntity(nextState, switchToFollow(gatherer));
      continue;
    }

    if (
      !allowedGathererIdsByResource
        .get(resource.id)
        ?.has(gatherer.id)
    ) {
      nextState = updateEntity(nextState, switchToFollow(gatherer));
      continue;
    }

    if (!isInGatherRange(gatherer, resource)) {
      if (movedEntityIds.has(gatherer.id)) {
        continue;
      }

      nextState = moveEntityTowardIfUnoccupied(nextState, gatherer, resource);
      movedEntityIds.add(gatherer.id);
      continue;
    }

    if (!canGather(gatherer, now)) {
      continue;
    }

    const gatheredResource = gatherResource(
      resource,
      getGatherAmount(gatherer),
    );

    nextState = updateEntity(nextState, gatheredResource);
    nextState = updateEntity(
      nextState,
      gatheredResource.isDepleted
        ? switchToFollow(setLastGatherAt(gatherer, now))
        : setLastGatherAt(gatherer, now),
    );
  }

  return nextState;
}

function isGatheringEntity(entity: GameEntity): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "gather";
}

function getAllowedGathererIdsByResource(
  state: GameState,
): Map<string, Set<string>> {
  const allowedGathererIdsByResource = new Map<string, Set<string>>();
  const gathererCountsByResource = new Map<string, number>();

  for (const entity of Object.values(state.entities)) {
    if (!isGatheringEntity(entity) || !entity.currentTargetId) {
      continue;
    }

    const resource = getEntityById(state, entity.currentTargetId);

    if (!isResourceEntity(resource) || resource.isDepleted) {
      continue;
    }

    const currentCount = gathererCountsByResource.get(resource.id) ?? 0;

    if (currentCount >= getMaxGatherers(resource)) {
      continue;
    }

    gathererCountsByResource.set(resource.id, currentCount + 1);

    const allowedGathererIds =
      allowedGathererIdsByResource.get(resource.id) ?? new Set<string>();
    allowedGathererIds.add(entity.id);
    allowedGathererIdsByResource.set(resource.id, allowedGathererIds);
  }

  return allowedGathererIdsByResource;
}

function getMaxGatherers(resource: ResourceEntity): number {
  return Math.max(0, resource.maxGatherers);
}

function isInGatherRange(gatherer: GameEntity, resource: GameEntity): boolean {
  const xDistance = Math.abs(resource.position.x - gatherer.position.x);
  const yDistance = Math.abs(resource.position.y - gatherer.position.y);

  return xDistance <= GATHER_RANGE && yDistance <= GATHER_RANGE;
}

function canGather(entity: AutonomousEntity, now: number): boolean {
  return now - entity.lastGatherAt >= GATHER_COOLDOWN_MS;
}

function getGatherAmount(gatherer: AutonomousEntity): number {
  return Math.max(0, gatherer.gatherSpeed);
}

function switchToFollow(entity: AutonomousEntity): AutonomousEntity {
  return {
    ...entity,
    state: "follow",
    currentTargetId: entity.kind === "companion" ? entity.followTargetId : null,
  };
}
