import {
  gatherResource,
  isAutonomousEntity,
  isCombatEntity,
  isResourceEntity,
  setLastGatherAt,
} from "./entities";
import {
  getEnemyAttackLeashDistance,
  getEnemyDetectionRange as getDefaultEnemyDetectionRange,
} from "./enemyAISystem";
import { getEnemyDetectionRange, getEnemyTemperament } from "./enemyArchetypes";
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
import { protectPartyMember } from "./partyProtectionSystem";
import { recordResourceGatheredForQuests } from "./questSystem";
import { ROLE_TUNING } from "./roleProfiles";
import { getPrototypeGatherAmountBonus } from "./skillRuntime";
import { isResourceTargetInRange } from "./targetSelection";
import { isCompanionResurrectionChanneling } from "./resurrectionSystem";
import {
  createGathererResourceReservations,
  findAllowedGathererResourceTarget,
  isWithinGathererLeaderBoundary,
  type GathererResourceReservations,
  type ResourceWorkContext,
} from "./gathererResourceReservation";
import type { AutonomousEntity, Enemy, GameEntity, ResourceEntity } from "./types";

const GATHER_RANGE = ENTITY_COLLISION_DISTANCE * 2;
const GATHER_COOLDOWN_MS = 1000;
const GATHER_APPROACH_BUFFER = 0.15;

export function updateGatherSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
  now = Date.now(),
  resourceWorkContext?: ResourceWorkContext,
): GameState {
  let nextState = state;
  const allowedGathererIdsByResource = getAllowedGathererIdsByResource(state);
  const gathererReservations = createGathererResourceReservations(
    state,
    resourceWorkContext,
  );

  for (const entity of Object.values(state.entities)) {
    const gatherer = getEntityById(nextState, entity.id);

    if (
      !gatherer ||
      (gatherer.kind === "companion" &&
        isCompanionResurrectionChanneling(nextState, gatherer.id)) ||
      !isGatheringEntity(gatherer)
    ) {
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

    const shouldStayFocusedOnResource = shouldAutonomousGathererStayFocusedOnResource(
      nextState,
      gatherer,
      resource,
      gathererReservations,
      resourceWorkContext,
    );
    const preGatherAggro = interruptGathererForEnemyAggro(
      nextState,
      gatherer,
      shouldStayFocusedOnResource,
    );
    if (preGatherAggro.interrupted) {
      nextState = preGatherAggro.state;
      continue;
    }

    if (!isInGatherRange(gatherer, resource)) {
      if (movedEntityIds.has(gatherer.id)) {
        continue;
      }

      nextState = moveEntityTowardIfUnoccupied(nextState, gatherer, resource);
      if (didEntityMove(nextState, gatherer)) {
        movedEntityIds.add(gatherer.id);
        const movedGatherer = getEntityById(nextState, gatherer.id);

        if (movedGatherer && isGatheringEntity(movedGatherer)) {
          const postMoveAggro = interruptGathererForEnemyAggro(
            nextState,
            movedGatherer,
            shouldStayFocusedOnResource,
          );
          if (postMoveAggro.interrupted) {
            nextState = postMoveAggro.state;
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

function interruptGathererForEnemyAggro(
  state: GameState,
  gatherer: AutonomousEntity,
  shouldStayFocusedOnResource = false,
): { state: GameState; interrupted: boolean } {
  if (gatherer.kind !== "companion") {
    return { state, interrupted: false };
  }

  if (shouldStayFocusedOnResource) {
    return { state, interrupted: false };
  }

  const threat = findGathererAggroThreat(state, gatherer);

  if (!threat) {
    return { state, interrupted: false };
  }

  const attackingEnemy: Enemy = {
    ...threat,
    state: "attack",
    currentTargetId: gatherer.id,
    targetDecisionReason: "closest",
    roamTargetPosition: null,
    roamMoveUntil: undefined,
  };
  const aggroState = updateEntity(state, attackingEnemy);

  return {
    state: protectPartyMember(aggroState, gatherer, attackingEnemy),
    interrupted: true,
  };
}

function findGathererAggroThreat(
  state: GameState,
  gatherer: AutonomousEntity,
): Enemy | null {
  let closestThreat: Enemy | null = null;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const entity of Object.values(state.entities)) {
    if (!isLiveAggressiveEnemy(entity)) {
      continue;
    }

    const detectionRange = getEnemyDetectionRange(
      entity,
      getDefaultEnemyDetectionRange(),
    );

    if (
      getDistanceSquared(entity.position, gatherer.position) > detectionRange * detectionRange ||
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

function isLiveAggressiveEnemy(entity: GameEntity): entity is Enemy {
  return (
    entity.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0 &&
    getEnemyTemperament(entity) === "aggressive"
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

function shouldAutonomousGathererStayFocusedOnResource(
  state: GameState,
  gatherer: AutonomousEntity,
  resource: ResourceEntity,
  gathererReservations: GathererResourceReservations,
  resourceWorkContext?: ResourceWorkContext,
): boolean {
  if (
    gatherer.kind !== "companion" ||
    gatherer.role !== "gatherer" ||
    gatherer.commandPriority !== "autonomous" ||
    gatherer.currentTargetId !== resource.id
  ) {
    return false;
  }

  return (
    gathererReservations.resourceIdByGathererId.get(gatherer.id) === resource.id ||
    findAllowedGathererResourceTarget(state, gatherer, resourceWorkContext)?.id ===
      resource.id
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
