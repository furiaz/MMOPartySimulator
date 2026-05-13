import {
  gatherResource,
  isAutonomousEntity,
  isResourceEntity,
  setLastGatherAt,
} from "./entities";
import {
  addCombatFeedback,
  ENTITY_COLLISION_DISTANCE,
  getBoundedPathDistance,
  getEntityById,
  moveEntityTowardIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinitionForResourceType } from "./items";
import { recordResourceGatheredForQuests } from "./questSystem";
import { isResourceTargetInRange } from "./targetSelection";
import type { AutonomousEntity, GameEntity, ResourceEntity } from "./types";

const GATHER_RANGE = ENTITY_COLLISION_DISTANCE * 2;
const GATHER_COOLDOWN_MS = 1000;
const GATHERER_PARTY_RETURN_DISTANCE = 15;
const GATHER_APPROACH_BUFFER = 0.15;

export function updateGatherSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
  now = Date.now(),
): GameState {
  let nextState = state;
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
      gatherer.kind === "companion" &&
      gatherer.commandPriority === "autonomous" &&
      !isResourceTargetInRange(
        nextState,
        resource,
        gatherer.position,
        { maxDistance: getReachableSearchLimit(nextState) },
      )
    ) {
      if (isCommittedGatherer(gatherer)) {
        continue;
      }

      nextState = updateEntity(nextState, switchToFollow(gatherer));
      continue;
    }

    if (
      !allowedGathererIdsByResource
        .get(resource.id)
        ?.has(gatherer.id)
    ) {
      if (isCommittedGatherer(gatherer)) {
        continue;
      }

      nextState = updateEntity(nextState, switchToFollow(gatherer));
      continue;
    }

    if (!isInGatherRange(gatherer, resource)) {
      if (movedEntityIds.has(gatherer.id)) {
        continue;
      }

      nextState = moveEntityTowardIfUnoccupied(nextState, gatherer, resource);
      if (didEntityMove(nextState, gatherer)) {
        movedEntityIds.add(gatherer.id);
      }
      continue;
    }

    if (!canGather(gatherer, now)) {
      continue;
    }

    const gatherAmount = getGatherAmount(gatherer);
    const didYieldResource =
      resource.quantity > 0 &&
      resource.durability > 0 &&
      gatherAmount >= resource.durability;
    const gatheredResource = gatherResource(resource, gatherAmount);

    nextState = updateEntity(nextState, gatheredResource);
    nextState = addCombatFeedback(nextState, {
      type: "gather",
      entityId: gatherer.id,
      text: "Gather",
      now,
    });

    if (didYieldResource) {
      const itemDefinition = getItemDefinitionForResourceType(
        gatheredResource.resourceType,
        gatheredResource.tier,
      );
      const itemAdd = addItemToInventoryState(
        nextState,
        itemDefinition.id,
        1,
        "gathering",
      );
      nextState = itemAdd.state;
      nextState = recordResourceGatheredForQuests(
        nextState,
        gatheredResource.resourceType,
        nextState.currentMapId,
        itemAdd.result.addedQuantity,
      );
      nextState = addCombatFeedback(nextState, {
        type: "gather",
        entityId: gatheredResource.id,
        text:
          itemAdd.result.addedQuantity > 0
            ? itemDefinition.displayName
            : "Inventory Full",
        now,
      });
    }

    const updatedGatherer = setLastGatherAt(gatherer, now);
    const shouldReturnToParty =
      gatheredResource.isDepleted ||
      (didYieldResource &&
        gatherer.kind === "companion" &&
        gatherer.role === "gatherer" &&
        shouldGathererReturnToParty(nextState, gatherer));

    nextState = updateEntity(
      nextState,
      shouldReturnToParty ? switchToFollow(updatedGatherer) : updatedGatherer,
    );
  }

  return nextState;
}

function didEntityMove(state: GameState, entity: GameEntity): boolean {
  const currentEntity = getEntityById(state, entity.id);

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

function isGatheringEntity(entity: GameEntity): entity is AutonomousEntity {
  return isAutonomousEntity(entity) && entity.state === "gather";
}

function isCommittedGatherer(entity: AutonomousEntity): boolean {
  return (
    entity.kind === "companion" &&
    entity.role === "gatherer" &&
    entity.commandPriority === "autonomous"
  );
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
  const distance = Math.hypot(
    resource.position.x - gatherer.position.x,
    resource.position.y - gatherer.position.y,
  );

  return distance <= GATHER_RANGE + GATHER_APPROACH_BUFFER;
}

function canGather(entity: AutonomousEntity, now: number): boolean {
  return now - entity.lastGatherAt >= GATHER_COOLDOWN_MS;
}

function getGatherAmount(gatherer: AutonomousEntity): number {
  return Math.max(0, gatherer.gatherSpeed);
}

function getReachableSearchLimit(state: GameState): number {
  return state.map
    ? state.map.columns * state.map.rows
    : Number.POSITIVE_INFINITY;
}

function shouldGathererReturnToParty(
  state: GameState,
  gatherer: GameEntity,
): boolean {
  if (gatherer.kind !== "companion") {
    return false;
  }

  const leader = state.entities[gatherer.followTargetId];

  if (!leader) {
    return true;
  }

  return (
    getBoundedPathDistance(
      state,
      gatherer,
      leader.position,
      GATHERER_PARTY_RETURN_DISTANCE,
    ) === null
  );
}

function switchToFollow(entity: AutonomousEntity): AutonomousEntity {
  return {
    ...entity,
    state: "follow",
    currentTargetId: entity.kind === "companion" ? entity.followTargetId : null,
    commandPriority: "autonomous",
  };
}
