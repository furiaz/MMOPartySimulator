import {
  gatherResource,
  isAutonomousEntity,
  isCombatEntity,
  setLastGatherAt,
} from "./entities";
import { isActiveResource } from "./entityGuards";
import { getEnemyAttackLeashDistance } from "./enemyAISystem";
import {
  addCombatFeedback,
  getEntityById,
  updateEntity,
  type GameState,
} from "./state";
import {
  ENTITY_COLLISION_DISTANCE,
  getBoundedPathDistance,
  moveEntityTowardIfUnoccupied,
} from "./movementPlanning";
import { getPartyExecutionIntent } from "./partyIntentState";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinitionForResourceType } from "./items";
import { recordResourceGatheredForQuests } from "./questSystem";
import { ROLE_TUNING } from "./roleProfiles";
import { getPrototypeGatherAmountBonus } from "./skillRuntime";
import { isResourceTargetInRange } from "./targetSelection";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { getDirectGatherCommandTargetId } from "./directCompanionCommands";
import {
  isWithinGathererLeaderBoundary,
} from "./gathererResourceReservation";
import type { AutonomousEntity, Enemy, GameEntity, ResourceEntity } from "./types";

const GATHER_RANGE = ENTITY_COLLISION_DISTANCE * 2;
const GATHER_COOLDOWN_MS = 1000;
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

    if (
      !gatherer ||
      (gatherer.kind === "companion" &&
        isCompanionAssignedToResurrectionRecovery(nextState, gatherer.id)) ||
      !isGatheringEntity(gatherer)
    ) {
      continue;
    }

    if (!gatherer.currentTargetId) {
      continue;
    }

    const playerIntentOverride = getPlayerIntentOverride(gatherer, nextState);

    if (playerIntentOverride) {
      nextState = updateEntity(nextState, playerIntentOverride);
      continue;
    }

    const resource = getEntityById(nextState, gatherer.currentTargetId);

    if (!isActiveResource(resource)) {
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

    const selfDefenseThreat = findGathererSelfDefenseThreat(nextState, gatherer);

    if (selfDefenseThreat) {
      nextState = updateEntity(nextState, {
        ...gatherer,
        state: "attack",
        currentTargetId: selfDefenseThreat.id,
        commandPriority: "autonomous",
      });
      continue;
    }

    if (!isInGatherRange(gatherer, resource)) {
      if (movedEntityIds.has(gatherer.id)) {
        continue;
      }

      nextState = moveEntityTowardIfUnoccupied(nextState, gatherer, resource, {
        pathProfile: "gather",
        pathTargetKey: `gather:${resource.id}`,
        pathTargetPosition: resource.position,
      });
      if (didEntityMove(nextState, gatherer)) {
        movedEntityIds.add(gatherer.id);
        const movedGatherer = getEntityById(nextState, gatherer.id);

        if (movedGatherer && isGatheringEntity(movedGatherer)) {
          const postMoveThreat = findGathererSelfDefenseThreat(
            nextState,
            movedGatherer,
          );

          if (postMoveThreat) {
            nextState = updateEntity(nextState, {
              ...movedGatherer,
              state: "attack",
              currentTargetId: postMoveThreat.id,
              commandPriority: "autonomous",
            });
          }
        }
      }
      continue;
    }

    if (!canGather(gatherer, now)) {
      continue;
    }

    const gatherAmount = getGatherAmount(nextState, gatherer);
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
        gatheredResource,
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

function findGathererSelfDefenseThreat(
  state: GameState,
  gatherer: AutonomousEntity,
): Enemy | null {
  const executionIntent = getPartyExecutionIntent(state);

  if (gatherer.kind !== "companion") {
    return null;
  }

  if (
    gatherer.commandPriority === "direct" &&
    getDirectGatherCommandTargetId(state, gatherer.id) !== gatherer.currentTargetId &&
    (executionIntent?.type !== "gather" ||
      executionIntent.targetId !== gatherer.currentTargetId)
  ) {
    return null;
  }

  return findEnemyAttackingGatherer(state, gatherer);
}

function getPlayerIntentOverride(
  gatherer: AutonomousEntity,
  state: GameState,
): AutonomousEntity | null {
  const executionIntent = getPartyExecutionIntent(state);

  if (
    gatherer.kind !== "companion" ||
    gatherer.commandPriority !== "autonomous" ||
    executionIntent?.source !== "player"
  ) {
    return null;
  }

  if (
    executionIntent.type === "gather" &&
    executionIntent.targetId === gatherer.currentTargetId
  ) {
    return null;
  }

  if (
    (executionIntent.type === "attack" ||
      executionIntent.type === "gather") &&
    executionIntent.targetId
  ) {
    return {
      ...gatherer,
      state: executionIntent.type,
      currentTargetId: executionIntent.targetId,
      commandPriority: "autonomous",
    };
  }

  return switchToFollow(gatherer);
}

function findEnemyAttackingGatherer(
  state: GameState,
  gatherer: AutonomousEntity,
): Enemy | null {
  let closestThreat: Enemy | null = null;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const entity of Object.values(state.entities)) {
    if (!isLiveEnemy(entity)) {
      continue;
    }

    if (
      entity.state !== "attack" ||
      entity.currentTargetId !== gatherer.id ||
      getDistance(entity.homePosition, gatherer.position) > getEnemyAttackLeashDistance()
    ) {
      continue;
    }

    const distanceSquared = getDistanceSquared(entity.position, gatherer.position);

    if (distanceSquared < closestDistanceSquared) {
      closestThreat = entity;
      closestDistanceSquared = distanceSquared;
    }
  }

  return closestThreat;
}

function isLiveEnemy(entity: GameEntity): entity is Enemy {
  return (
    entity.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function didEntityMove(state: GameState, entity: GameEntity): boolean {
  const currentEntity = getEntityById(state, entity.id);

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

function getDistance(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function getDistanceSquared(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const xDistance = to.x - from.x;
  const yDistance = to.y - from.y;

  return xDistance * xDistance + yDistance * yDistance;
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
  const gatheringEntities = Object.values(state.entities)
    .filter(
      (entity): entity is AutonomousEntity =>
        isGatheringEntity(entity) && Boolean(entity.currentTargetId),
    )
    .sort((first, second) => {
      const firstDirectTargetId =
        first.kind === "companion"
          ? getDirectGatherCommandTargetId(state, first.id)
          : null;
      const secondDirectTargetId =
        second.kind === "companion"
          ? getDirectGatherCommandTargetId(state, second.id)
          : null;
      const firstIsDirect =
        firstDirectTargetId !== null && firstDirectTargetId === first.currentTargetId;
      const secondIsDirect =
        secondDirectTargetId !== null && secondDirectTargetId === second.currentTargetId;

      return Number(secondIsDirect) - Number(firstIsDirect) || first.id.localeCompare(second.id);
    });

  for (const entity of gatheringEntities) {
    if (!entity.currentTargetId) {
      continue;
    }

    const resource = getEntityById(state, entity.currentTargetId);

    if (!isActiveResource(resource)) {
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

function getGatherAmount(state: GameState, gatherer: AutonomousEntity): number {
  const skillBonus =
    gatherer.kind === "companion"
      ? getPrototypeGatherAmountBonus(state, gatherer)
      : 0;

  return Math.max(0, gatherer.gatherSpeed + skillBonus);
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

  if (
    gatherer.kind === "companion" &&
    leader.kind === "companion" &&
    isWithinGathererLeaderBoundary(state, gatherer, leader)
  ) {
    return false;
  }

  return (
    getBoundedPathDistance(
      state,
      gatherer,
      leader.position,
      ROLE_TUNING.gatherer.leashDistance,
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
