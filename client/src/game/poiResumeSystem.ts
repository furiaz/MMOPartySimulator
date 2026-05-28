import { isCombatEntity, isResourceEntity } from "./entities";
import { isPartyMember, getPartyMembers } from "./partySystem";
import type {
  GameState,
  InterruptedPoiTarget,
} from "./state";
import {
  getPartyExecutionIntent,
  setPartyIntent,
} from "./state";
import { isTeleportWorking } from "./teleportState";
import type {
  CommandPriority,
  Enemy,
  EntityState,
  GameEntity,
  PartyExecutionIntent,
  Position,
} from "./types";
import type { LocalPoiTarget, PoiDecisionState } from "./questTypes";

export function captureInterruptedPoiTarget(
  state: GameState,
  interruptingEnemy: Enemy,
): GameState {
  const fallbackExecutionIntent = getInterruptedDirectGatherIntent(state);
  const executionIntent = getPartyExecutionIntent(state);

  if (
    state.interruptedPoiTarget ||
    isSameAttackIntent(executionIntent, interruptingEnemy.id) ||
    (!executionIntent && !state.globalPoiIntent && !state.localPoiTarget && !fallbackExecutionIntent)
  ) {
    return state;
  }

  return {
    ...state,
    interruptedPoiTarget: {
      interruptedByEnemyId: interruptingEnemy.id,
      mapId: state.currentMapId,
      leaderIntent: clonePartyExecutionIntent(executionIntent ?? fallbackExecutionIntent),
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

  const restoredState = setPartyIntent(state, {
    mode: getPartyBehaviorModeForIntent(interruptedTarget.leaderIntent),
    source: interruptedTarget.leaderIntent?.source ?? "ai",
    executionIntent: clonePartyExecutionIntent(interruptedTarget.leaderIntent),
    globalPoiIntent: interruptedTarget.globalPoiIntent
      ? { ...interruptedTarget.globalPoiIntent }
      : null,
    localPoiTarget: cloneLocalPoiTarget(interruptedTarget.localPoiTarget),
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    lastPoiDecision: clonePoiDecision(interruptedTarget.lastPoiDecision),
    queuedIntent: state.partyIntent?.queuedIntent ?? null,
    recoveryIntent: state.partyIntent?.recoveryIntent ?? null,
  });

  return {
    ...restoredState,
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

function getInterruptedDirectGatherIntent(
  state: GameState,
): PartyExecutionIntent | null {
  const directGatherer = getPartyMembers(state).find((member) => {
    if (state.directCompanionCommandsById?.[member.id]) {
      return false;
    }

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
    isExecutionIntentValid(state, interruptedTarget.leaderIntent) &&
    isLocalPoiTargetValid(state, interruptedTarget.localPoiTarget)
  );
}

function isExecutionIntentValid(
  state: GameState,
  executionIntent: PartyExecutionIntent | null,
): boolean {
  if (!executionIntent) {
    return true;
  }

  if (!executionIntent.targetId) {
    return Boolean(executionIntent.targetPosition);
  }

  const target = state.entities[executionIntent.targetId];

  if (executionIntent.type === "attack") {
    return isLiveEnemy(target);
  }

  if (executionIntent.type === "gather") {
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
      state.map?.teleports.some(
        (teleport) =>
          teleport.id === localPoiTarget.targetEntityId &&
          isTeleportWorking(state, teleport.id),
      ),
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
  interruptedExecutionIntent: PartyExecutionIntent | null,
): boolean {
  if (commandPriority !== "direct" || !interruptedExecutionIntent) {
    return false;
  }

  if (interruptedExecutionIntent.type !== "gather") {
    return false;
  }

  return state === "gather" && currentTargetId === interruptedExecutionIntent.targetId;
}

function isSameAttackIntent(
  executionIntent: PartyExecutionIntent | null,
  interruptingEnemyId: string,
): boolean {
  return executionIntent?.type === "attack" && executionIntent.targetId === interruptingEnemyId;
}

function getPartyBehaviorModeForIntent(
  executionIntent: PartyExecutionIntent | null,
): "idle" | "travel" | "engage" {
  if (!executionIntent) {
    return "idle";
  }

  return executionIntent.type === "attack" ? "engage" : "travel";
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

function clonePartyExecutionIntent(
  executionIntent: PartyExecutionIntent | null,
): PartyExecutionIntent | null {
  return executionIntent
    ? {
        ...executionIntent,
        targetPosition: clonePosition(executionIntent.targetPosition),
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
