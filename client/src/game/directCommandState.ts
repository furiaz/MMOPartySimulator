import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { updateEntity, type GameState } from "./state";
import type { DirectCompanionCommand, GameEntity } from "./types";

export const DIRECT_COMMAND_REJOIN_GRACE_MS = 1500;

export function hasDirectCompanionAuthority(state: GameState, entity: GameEntity): boolean {
  return entity.kind === "companion" && Boolean(state.directCompanionCommandsById?.[entity.id] || entity.commandPriority === "direct");
}

export function getDirectLeaderCommand(state: GameState): DirectCompanionCommand | undefined {
  const leader = state.entities[state.partyLeaderId];
  return leader?.kind === "companion" && leader.state !== "dead" && leader.health > 0
    ? state.directCompanionCommandsById?.[leader.id] : undefined;
}

export function canFollowDirectLeader(state: GameState, entity: GameEntity): boolean {
  return Boolean(getDirectLeaderCommand(state)) && entity.kind === "companion" && entity.health > 0 &&
    entity.id !== state.partyLeaderId && (entity.state === "idle" || entity.state === "follow") &&
    !hasDirectCompanionAuthority(state, entity) && !state.resurrectionChannelsByHelperId?.[entity.id];
}

export function isDirectGatherPersonalThreat(state: GameState, companionId: string, target: GameEntity | undefined): boolean {
  return state.directCompanionCommandsById?.[companionId]?.type === "gather" && target?.kind === "enemy" &&
    target.health > 0 && target.state === "attack" && target.currentTargetId === companionId;
}

/** Discard obsolete planning, never a consumed frame budget or a physical landing. */
export function clearDirectCommandPlanning(state: GameState, companionId: string): GameState {
  const withoutActor = <T,>(record: Record<string, T> | undefined) => {
    if (!record || !(companionId in record)) return record;
    const next = { ...record };
    delete next[companionId];
    return next;
  };
  return { ...state,
    formationPathSearchesByEntityId: state.formationPathSearchesByEntityId?.[companionId] ? {
      ...state.formationPathSearchesByEntityId,
      [companionId]: { ...state.formationPathSearchesByEntityId[companionId], requestKey: undefined, failed: false, temporaryBlockers: undefined },
    } : state.formationPathSearchesByEntityId,
    autoRoute: state.autoRoute?.bodyBlocksByEntityId ? { ...state.autoRoute,
      bodyBlocksByEntityId: withoutActor(state.autoRoute.bodyBlocksByEntityId) } : state.autoRoute,
    formationAssignments: state.formationAssignments ? { ...state.formationAssignments,
      travel: state.formationAssignments.travel ? { ...state.formationAssignments.travel, goalsByEntityId: withoutActor(state.formationAssignments.travel.goalsByEntityId)!,
        proposedGoalsByEntityId: withoutActor(state.formationAssignments.travel.proposedGoalsByEntityId) } : undefined,
      combat: state.formationAssignments.combat ? { ...state.formationAssignments.combat,
        goalsByEntityId: withoutActor(state.formationAssignments.combat.goalsByEntityId)!,
        proposedGoalsByEntityId: withoutActor(state.formationAssignments.combat.proposedGoalsByEntityId) } : undefined,
    } : state.formationAssignments,
    targetCommitmentsByEntityId: withoutActor(state.targetCommitmentsByEntityId),
    targetApproachesByEntityId: withoutActor(state.targetApproachesByEntityId),
    targetEngagementProbeAtMsByEntityId: withoutActor(state.targetEngagementProbeAtMsByEntityId),
    rejectedCombatTargetsByEntityId: withoutActor(state.rejectedCombatTargetsByEntityId),
    companionTargetDecisionByEntityId: withoutActor(state.companionTargetDecisionByEntityId),
    localAvoidanceByEntityId: withoutActor(state.localAvoidanceByEntityId),
    attackSlotCacheByEntityId: withoutActor(state.attackSlotCacheByEntityId),
    failedMoveByEntityId: withoutActor(state.failedMoveByEntityId),
    movementDecisionsByEntityId: withoutActor(state.movementDecisionsByEntityId),
    movementFailuresByEntityId: withoutActor(state.movementFailuresByEntityId),
    movementFailureMsByEntityId: withoutActor(state.movementFailureMsByEntityId),
    movementPathRetryAtMsByEntityId: withoutActor(state.movementPathRetryAtMsByEntityId),
    defenderBlockedMsByEntityId: withoutActor(state.defenderBlockedMsByEntityId),
    defenderBlockedTicksByEntityId: withoutActor(state.defenderBlockedTicksByEntityId),
    movementPathsByEntityId: withoutActor(state.movementPathsByEntityId),
    moveIntentsByEntityId: state.movementPositionCommitsByEntityId?.[companionId] || state.forcedMovementsByEntityId?.[companionId]
      ? state.moveIntentsByEntityId : withoutActor(state.moveIntentsByEntityId),
    normalMovementPhase: state.normalMovementPhase ? { submissions: state.normalMovementPhase.submissions
      .filter(submission => submission.request.entityId !== companionId) } : undefined,
  };
}

/** Shared, idempotent lifecycle end; stale callers cannot complete a replacement. */
export function finishDirectCompanionCommand(
  state: GameState, command: DirectCompanionCommand, now: number,
  eventType: "direct_command_completed" | "direct_command_canceled", reason: string, startGrace = true,
): GameState {
  if (state.directCompanionCommandsById?.[command.companionId] !== command) return state;
  const commands = { ...state.directCompanionCommandsById };
  delete commands[command.companionId];
  let next = clearDirectCommandPlanning({ ...state, directCompanionCommandsById: commands }, command.companionId);
  const companion = next.entities[command.companionId];
  const living = companion?.kind === "companion" && companion.state !== "dead" && companion.health > 0;
  if (living) next = updateEntity(next, { ...companion, state: "follow", commandPriority: "autonomous",
    currentTargetId: companion.id === next.partyLeaderId ? null : next.partyLeaderId });
  const detail = { entityId: command.companionId, targetId: "targetId" in command ? command.targetId : null,
    directCommandType: command.type, directCommandTargetPosition: command.targetPosition ? { ...command.targetPosition } : null };
  next = appendDebugTelemetryEvent(next, { ...detail, type: eventType, reason, result: reason });
  if (!startGrace || !living) return next;
  next = { ...next, directCommandGraceUntilByCompanionId: { ...next.directCommandGraceUntilByCompanionId,
    [command.companionId]: now + DIRECT_COMMAND_REJOIN_GRACE_MS } };
  return appendDebugTelemetryEvent(next, { ...detail, type: "direct_command_grace_started", reason: "rejoin", result: "rejoin" });
}
