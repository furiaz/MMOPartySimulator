import { isCombatEntity, isResourceEntity } from "./entities";
import { isPartyMember, getPartyMembers } from "./partySystem";
import type {
  GameState,
  InterruptedPoiTarget,
} from "./state";
import type {
  CommandPriority,
  Enemy,
  EntityState,
  GameEntity,
  LeaderIntent,
  Position,
} from "./types";
import type { LocalPoiTarget, PoiDecisionState } from "./questTypes";

export function captureInterruptedPoiTarget(
  state: GameState,
  interruptingEnemy: Enemy,
): GameState {
  const fallbackLeaderIntent = getInterruptedDirectGatherIntent(state);

  if (
    state.interruptedPoiTarget ||
    isSameAttackIntent(state.leaderIntent, interruptingEnemy.id) ||
    (!state.leaderIntent && !state.globalPoiIntent && !state.localPoiTarget && !fallbackLeaderIntent)
  ) {
    return state;
  }

  return {
    ...state,
    interruptedPoiTarget: {
      interruptedByEnemyId: interruptingEnemy.id,
      mapId: state.currentMapId,
      leaderIntent: cloneLeaderIntent(state.leaderIntent ?? fallbackLeaderIntent),
      globalPoiIntent: state.globalPoiIntent ? { ...state.globalPoiIntent } : null,
      localPoiTarget: cloneLocalPoiTarget(state.localPoiTarget),
      lastPoiDecision: clonePoiDecision(state.lastPoiDecision),
    },
  };
}

export function restoreInterruptedPoiTarget(state: GameState): GameState {
  const interruptedTarget = state.interruptedPoiTarget;

  if (!interruptedTarget) {
    return state;
  }

  if (
    interruptedTarget.mapId !== state.currentMapId ||
    hasBlockingDirectPartyCommand(state, interruptedTarget) ||
    !isInterruptedTargetValid(state, interruptedTarget)
  ) {
    return clearInterruptedPoiTarget(state);
  }

  if (hasLivePartyAggro(state)) {
    return state;
  }

  return {
    ...state,
    leaderIntent: cloneLeaderIntent(interruptedTarget.leaderIntent),
    globalPoiIntent: interruptedTarget.globalPoiIntent
      ? { ...interruptedTarget.globalPoiIntent }
      : null,
    localPoiTarget: cloneLocalPoiTarget(interruptedTarget.localPoiTarget),
    lastPoiDecision: clonePoiDecision(interruptedTarget.lastPoiDecision),
    interruptedPoiTarget: null,
  };
}

export function clearInterruptedPoiTarget(state: GameState): GameState {
  if (!state.interruptedPoiTarget) {
    return state;
  }

  return {
    ...state,
    interruptedPoiTarget: null,
  };
}

function getInterruptedDirectGatherIntent(state: GameState): LeaderIntent | null {
  const directGatherer = getPartyMembers(state).find((member) => {
    if (member.commandPriority !== "direct" || member.state !== "gather" || !member.currentTargetId) {
      return false;
    }

    return isAvailableResource(state.entities[member.currentTargetId]);
  });

  if (!directGatherer?.currentTargetId) {
    return null;
  }

  const target = state.entities[directGatherer.currentTargetId];

  return {
    type: "gather",
    targetId: directGatherer.currentTargetId,
    targetPosition: target?.position ?? null,
    source: "player",
  };
}

function isInterruptedTargetValid(
  state: GameState,
  interruptedTarget: InterruptedPoiTarget,
): boolean {
  return (
    isLeaderIntentValid(state, interruptedTarget.leaderIntent) &&
    isLocalPoiTargetValid(state, interruptedTarget.localPoiTarget)
  );
}

function isLeaderIntentValid(
  state: GameState,
  leaderIntent: LeaderIntent | null,
): boolean {
  if (!leaderIntent) {
    return true;
  }

  if (!leaderIntent.targetId) {
    return Boolean(leaderIntent.targetPosition);
  }

  const target = state.entities[leaderIntent.targetId];

  if (leaderIntent.type === "attack") {
    return isLiveEnemy(target);
  }

  if (leaderIntent.type === "gather") {
    return isAvailableResource(target);
  }

  return Boolean(target && target.state !== "dead");
}

function isLocalPoiTargetValid(
  state: GameState,
  localPoiTarget: LocalPoiTarget | null,
): boolean {
  if (!localPoiTarget) {
    return true;
  }

  if (localPoiTarget.mapId !== state.currentMapId) {
    return false;
  }

  if (!localPoiTarget.targetEntityId) {
    return Boolean(localPoiTarget.position);
  }

  if (localPoiTarget.category === "teleport") {
    return Boolean(
      state.map?.teleports.some((teleport) => teleport.id === localPoiTarget.targetEntityId),
    );
  }

  const target = state.entities[localPoiTarget.targetEntityId];

  if (localPoiTarget.category === "combat") {
    return isLiveEnemy(target);
  }

  if (localPoiTarget.category === "resource") {
    return isAvailableResource(target);
  }

  return Boolean(target && target.state !== "dead");
}

function hasLivePartyAggro(state: GameState): boolean {
  return Object.values(state.entities).some((entity): entity is Enemy => {
    if (!isLiveEnemy(entity) || entity.state !== "attack" || !entity.currentTargetId) {
      return false;
    }

    return isPartyMember(state.entities[entity.currentTargetId]);
  });
}

function hasBlockingDirectPartyCommand(
  state: GameState,
  interruptedTarget: InterruptedPoiTarget,
): boolean {
  return getPartyMembers(state).some((member) => {
    if (member.commandPriority !== "direct") {
      return false;
    }

    return !isDirectCommandCompatibleWithInterruptedTarget(
      member.state,
      member.currentTargetId,
      member.commandPriority,
      interruptedTarget.leaderIntent,
    );
  });
}

function isDirectCommandCompatibleWithInterruptedTarget(
  state: EntityState,
  currentTargetId: string | null,
  commandPriority: CommandPriority,
  interruptedLeaderIntent: LeaderIntent | null,
): boolean {
  if (commandPriority !== "direct" || !interruptedLeaderIntent) {
    return false;
  }

  if (interruptedLeaderIntent.type !== "gather") {
    return false;
  }

  return state === "gather" && currentTargetId === interruptedLeaderIntent.targetId;
}

function isSameAttackIntent(
  leaderIntent: LeaderIntent | null,
  interruptingEnemyId: string,
): boolean {
  return leaderIntent?.type === "attack" && leaderIntent.targetId === interruptingEnemyId;
}

function isLiveEnemy(entity: GameEntity | undefined): entity is Enemy {
  return (
    entity?.kind === "enemy" &&
    isCombatEntity(entity) &&
    entity.state !== "dead" &&
    entity.health > 0
  );
}

function isAvailableResource(entity: GameEntity | undefined): boolean {
  return (
    isResourceEntity(entity) &&
    !entity.isDepleted &&
    entity.quantity > 0
  );
}

function cloneLeaderIntent(leaderIntent: LeaderIntent | null): LeaderIntent | null {
  return leaderIntent
    ? {
        ...leaderIntent,
        targetPosition: clonePosition(leaderIntent.targetPosition),
      }
    : null;
}

function cloneLocalPoiTarget(localPoiTarget: LocalPoiTarget | null): LocalPoiTarget | null {
  return localPoiTarget
    ? {
        ...localPoiTarget,
        position: { ...localPoiTarget.position },
      }
    : null;
}

function clonePoiDecision(
  lastPoiDecision: PoiDecisionState | undefined,
): PoiDecisionState | undefined {
  return lastPoiDecision
    ? {
        ...lastPoiDecision,
        selectedPosition: cloneOptionalPosition(lastPoiDecision.selectedPosition),
        consideredTargets: lastPoiDecision.consideredTargets?.map((target) => ({
          ...target,
          position: { ...target.position },
        })),
        skippedReasons: { ...lastPoiDecision.skippedReasons },
      }
    : undefined;
}

function clonePosition(position: Position | null | undefined): Position | null {
  return position ? { ...position } : null;
}

function cloneOptionalPosition(position: Position | undefined): Position | undefined {
  return position ? { ...position } : undefined;
}
