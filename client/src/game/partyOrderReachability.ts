import { isCombatEntity } from "./entities";
import { isActiveResource } from "./entityGuards";
import {
  getBoundedPathDistance,
  isPositionAvailable,
  isWallPosition,
} from "./movementPlanning";
import { getEntityById, type GameState } from "./state";
import type {
  GameEntity,
  Enemy,
  PartyExecutionIntent,
  Position,
} from "./types";

export type PartyOrderReachabilityReason =
  | "valid"
  | "invalid_target"
  | "blocked_position"
  | "unreachable";

export type PartyOrderReachabilityResult = {
  reason: PartyOrderReachabilityReason;
  targetId?: string | null;
  targetPosition?: Position | null;
};

export type PartyOrderReachabilityOptions = {
  allowBlockedMoveTarget?: boolean;
};

export function getPartyExecutionIntentReachability(
  state: GameState,
  leader: GameEntity,
  intent: PartyExecutionIntent,
  options: PartyOrderReachabilityOptions = {},
): PartyOrderReachabilityResult {
  if (intent.type === "move") {
    return getPartyMoveReachability(
      state,
      leader,
      intent.targetPosition,
      options,
    );
  }

  if (intent.type === "attack") {
    const target = intent.targetId
      ? getEntityById(state, intent.targetId)
      : undefined;

    if (!isLiveEnemy(target)) {
      return {
        reason: "invalid_target",
        targetId: intent.targetId,
        targetPosition: intent.targetPosition,
      };
    }

    return getTargetReachability(state, leader, target.id, target.position);
  }

  if (intent.type === "gather") {
    const target = intent.targetId
      ? getEntityById(state, intent.targetId)
      : undefined;

    if (!isActiveResource(target)) {
      return {
        reason: "invalid_target",
        targetId: intent.targetId,
        targetPosition: intent.targetPosition,
      };
    }

    return getTargetReachability(state, leader, target.id, target.position);
  }

  return { reason: "valid" };
}

function getPartyMoveReachability(
  state: GameState,
  leader: GameEntity,
  targetPosition: Position | null,
  options: PartyOrderReachabilityOptions,
): PartyOrderReachabilityResult {
  if (!targetPosition) {
    return {
      reason: "invalid_target",
      targetId: null,
      targetPosition,
    };
  }

  if (
    state.map &&
    !isPositionAvailable(state, targetPosition, { ignoredEntityId: leader.id })
  ) {
    if (
      options.allowBlockedMoveTarget &&
      isInsideMapBounds(state, targetPosition) &&
      !isWallPosition(state, targetPosition)
    ) {
      return {
        reason: "valid",
        targetId: null,
        targetPosition,
      };
    }

    return {
      reason: "blocked_position",
      targetId: null,
      targetPosition,
    };
  }

  return getTargetReachability(state, leader, null, targetPosition);
}

function getTargetReachability(
  state: GameState,
  leader: GameEntity,
  targetId: string | null,
  targetPosition: Position,
): PartyOrderReachabilityResult {
  if (!state.map) {
    return {
      reason: "valid",
      targetId,
      targetPosition,
    };
  }

  const maxDistance = state.map.columns * state.map.rows * 2;
  const pathDistance = getBoundedPathDistance(
    state,
    leader,
    targetPosition,
    maxDistance,
  );

  return {
    reason: pathDistance === null ? "unreachable" : "valid",
    targetId,
    targetPosition,
  };
}

function isLiveEnemy(entity: GameEntity | undefined): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function isInsideMapBounds(state: GameState, position: Position): boolean {
  return Boolean(
    state.map &&
      position.x >= 0 &&
      position.y >= 0 &&
      position.x < state.map.columns &&
      position.y < state.map.rows,
  );
}
