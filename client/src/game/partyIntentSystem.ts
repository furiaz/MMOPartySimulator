import { hasDirectCompanionAuthority } from "./directCommandState";
import { isCompanionEntity } from "./entityGuards";
import {
  updateAutoRouteExecution,
  isAutoRouteActive,
} from "./autoRouteSystem";
import { getPartyMembers } from "./partySystem";
import {
  getEntityById,
  type GameState,
} from "./state";
import {
  getPartyExecutionIntent,
  queuePartyIntent,
  restoreQueuedPartyIntent,
  setPartyIntent,
  setPartyExecutionIntent,
} from "./partyIntentState";
import { canAssignSelfDefenseTarget } from "./partyActivityCoordinator";
import { getCommittedPartyThreatTarget } from "./partyThreatSystem";
import { applyTargetCommitment, isAutomaticCombatTarget, isPlayerInteractionDefense, selectTargetCommitment } from "./targetCommitment";
import { isDefenderAttackTargetRelevant } from "./roleSystem";
import type {
  Companion,
  Enemy,
  GameEntity,
  PartyExecutionIntent,
} from "./types";

/** Consume late attack-approach evidence after its single movement result is final. */
export function updateFinalizedTargetApproaches(state: GameState): GameState {
  let next = state;
  for (const member of getPartyMembers(state).sort((a, b) => a.id.localeCompare(b.id))) {
    const actor = next.entities[member.id], observation = next.targetApproachesByEntityId?.[member.id];
    if (actor?.kind !== "companion" || !observation || observation.frame !== (next.simulationFrame ?? next.simulationTick) ||
      observation.timeMs !== (next.simulationTimeMs ?? 0) || observation.targetId !== actor.currentTargetId) continue;
    const decision = selectTargetCommitment(next, actor, { allowEmergency: false, allowOrdinaryThreat: false,
      isEligible: enemy => isDefenderAttackTargetRelevant(next, actor, enemy) });
    if ((decision.kind !== "switch" && decision.kind !== "release") ||
      (decision.reason !== "sustained_obstruction" && decision.reason !== "unreachable_engagement")) continue;
    const intent = getPartyExecutionIntent(next);
    next = applyTargetCommitment(next, actor, decision, actor.state === "defend" ? "defend" : "attack");
    if (decision.kind === "release" && actor.id === next.partyLeaderId && intent?.source !== "player" &&
      intent?.type === "attack" && intent.targetId === actor.currentTargetId) next = setPartyExecutionIntent(next, null);
  }
  return next;
}

export function updatePartyIntentRecoverySystem(state: GameState): GameState {
  const deadCompanion = getDeadCompanion(state);

  if (!deadCompanion) {
    return state.partyIntent?.recoveryIntent
      ? restoreQueuedPartyIntent(state)
      : state;
  }

  const livingCompanions = getPartyMembers(state);

  if (livingCompanions.length === 0) {
    return state;
  }

  const queuedState = queuePartyIntent(state);

  return setResurrectionRecoveryIntent(queuedState, deadCompanion);
}

export function getPartyResurrectionRecoveryTargetId(
  state: GameState,
): string | null {
  const recoveryIntent = state.partyIntent?.recoveryIntent;

  return recoveryIntent?.action === "resurrect"
    ? recoveryIntent.deadCompanionId
    : null;
}

export function updatePartyIntentSelfDefenseSystem(state: GameState): GameState {
  const executionIntent = getPartyExecutionIntent(state);

  if (!isAutoRouteActive(state)) {
    let next = state;
    for (const companion of getPartyMembers(state).sort((a, b) => a.id.localeCompare(b.id))) {
      const actor = next.entities[companion.id];
      if (actor?.kind !== "companion" || actor.state === "dead" || state.resurrectionChannelsByHelperId?.[actor.id]) continue;
      const command = next.directCompanionCommandsById?.[actor.id];
      if ((hasDirectCompanionAuthority(next, actor) && command?.type !== "gather") ||
        (executionIntent?.source === "player" && !command && !isPlayerInteractionDefense(next, actor))) continue;
      const decision = selectTargetCommitment(next, actor, { allowOrdinaryThreat: Boolean(executionIntent) || next.autoModeEnabled,
        isEligible: enemy => isDefenderAttackTargetRelevant(next, actor, enemy) });
      next = applyTargetCommitment(next, actor, decision);
      if (decision.kind === "release" && decision.reason === "unreachable_engagement" && actor.id === next.partyLeaderId &&
        executionIntent?.type === "attack" && executionIntent.source !== "player" && executionIntent.targetId === actor.currentTargetId)
        next = setPartyExecutionIntent(next, null);
    }
    return next;
  }
  if (executionIntent?.source === "player") return state;
  const routeState = updateAutoRouteExecution(state, true);
  const emergencyId = routeState.autoRoute?.pauseReason === "emergency" ? routeState.autoRoute.emergencyTargetId : undefined;
  const emergency = emergencyId ? routeState.entities[emergencyId] : undefined;
  const currentIntent = getPartyExecutionIntent(routeState);
  const current = currentIntent?.type === "attack" && currentIntent.targetId ? routeState.entities[currentIntent.targetId] : undefined;
  const selfDefenseTarget = isAutomaticCombatTarget(routeState, emergency)
    ? getCommittedPartyThreatTarget(routeState, { currentTarget: current?.kind === "enemy" ? current : emergency, range: 3 }) ?? emergency
    : undefined;
  if (!selfDefenseTarget) return routeState;

  const baseState = routeState;
  const defenseState = setPartyIntent(baseState, {
    mode: "engage",
    source: "ai",
    executionIntent: createAttackIntent(selfDefenseTarget),
    globalPoiIntent: baseState.globalPoiIntent,
    localPoiTarget: baseState.localPoiTarget,
    worldTravelTargetMapId: baseState.worldTravelTargetMapId,
    lastPoiDecision: baseState.lastPoiDecision,
    queuedIntent: baseState.partyIntent?.queuedIntent ?? null,
    recoveryIntent: baseState.partyIntent?.recoveryIntent ?? null,
  });

  return assignCompanionsToSelfDefense(defenseState, selfDefenseTarget);
}

function setResurrectionRecoveryIntent(
  state: GameState,
  deadCompanion: Companion,
): GameState {
  return setPartyIntent(state, {
    mode: "resurrect",
    source: "ai",
    executionIntent: null,
    globalPoiIntent: null,
    localPoiTarget: null,
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    queuedIntent: state.partyIntent?.queuedIntent ?? null,
    recoveryIntent: {
      action: "resurrect",
      deadCompanionId: deadCompanion.id,
      threatEnemyIds: [],
    },
  });
}

function assignCompanionsToSelfDefense(
  state: GameState,
  target: Enemy,
): GameState {
  let nextState = state;

  for (const companion of getPartyMembers(nextState)) {
    if (!canAssignSelfDefenseTarget(nextState, companion, target)) {
      continue;
    }

    nextState = applyTargetCommitment(nextState, companion, selectTargetCommitment(nextState, companion, { preferredTarget: target }));
  }

  return nextState;
}

function getDeadCompanion(state: GameState): Companion | null {
  const configuredLeader = getEntityById(state, state.partyLeaderId);

  if (isDeadCompanion(configuredLeader)) {
    return configuredLeader;
  }

  return (
    Object.values(state.entities).find(
      (entity): entity is Companion => isDeadCompanion(entity),
    ) ?? null
  );
}

function createAttackIntent(target: Enemy): PartyExecutionIntent {
  return { type: "attack", targetId: target.id, targetPosition: target.position, source: "ai" };
}

function isDeadCompanion(entity: GameEntity | undefined): entity is Companion {
  return Boolean(
    isCompanionEntity(entity) &&
      (entity.state === "dead" || entity.health <= 0),
  );
}
