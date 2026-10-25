import { getDirectLeaderCommand, hasDirectCompanionAuthority } from "./directCommandState";
import { rotateFormationFacing, transformFormationSlots } from "./formationTemplates";
import { createNormalMovementRequest, getMovementRequestRejection, getSpecializedMovementOwner } from "./movementAuthority";
import { isCombatPositionAvailable, moveEntityTowardPositionIfUnoccupied, resolveNormalMovement } from "./movementPlanning";
import { COMBAT_BREAK_DISTANCE } from "./partyActivityCoordinator";
import { getPartyExecutionIntent } from "./partyIntentState";
import { getPartyCombatTarget } from "./partyTargetSystem";
import { getActiveQuestGuide, getActiveQuestGuideObjectiveId } from "./questGuideSystem";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { ROLE_TUNING } from "./roleProfiles";
import { doCollisionBodiesOverlap, getCombatTargetPosition } from "./spatialGeometry";
import { getSpecializedMovementReservations, isSpecializedMovementPathAvailable, isSpecializedMovementPositionAvailable } from "./specializedMovementGeometry";
import type { GameState } from "./state";
import { isMovementBlockedByStatus } from "./statusEffects";
import { isRetainableCombatEnemy } from "./targetCommitment";
import { getCompanionAttackRange } from "./companionCombat";
import { isWithinAttackReach } from "./spatialGeometry";
import type { CombatFormationGoal, CombatFormationRuntime, Companion, Enemy, CombatStructure, Position } from "./types";
import { isWarmasterRewardUiOpen } from "./warmasterLifecycleState";
import type { MovementOptions, NormalMovementSource } from "./movementTypes";

export const COMBAT_FORMATION = { spacing: 3, spacingPerSecond: 0.5, clearanceMs: 500, settle: 0.35, resume: 0.6, alternativeRadius: 1.25 } as const;
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);
const frameKey = (state: GameState) => `${state.simulationFrame ?? state.simulationTick ?? 0}:${state.simulationTimeMs ?? 0}`;

function leaderOf(state: GameState): Companion | undefined {
  const leader = state.entities[state.partyLeaderId];
  return leader?.kind === "companion" && leader.health > 0 && leader.state !== "dead" ? leader : undefined;
}

function isSuspended(state: GameState): boolean {
  return Boolean(state.activeTeleport || isWarmasterRewardUiOpen(state) ||
    (getActiveQuestGuideObjectiveId(state) && getActiveQuestGuide(state)));
}

/** Read current commitments only. This reference never assigns a gameplay target. */
export function getCombatFormationTarget(state: GameState): Enemy | CombatStructure | undefined {
  const leader = leaderOf(state);
  if (!state.formationAssignments || !leader || isSuspended(state) || getDirectLeaderCommand(state)) return undefined;
  const intent = getPartyExecutionIntent(state);
  if (intent?.source === "player" && intent.type !== "attack") return undefined;
  const shared = getPartyCombatTarget(state);
  const members = state.formationAssignments.members.flatMap(({ id }) => {
    const actor = state.entities[id];
    return actor?.kind === "companion" && actor.health > 0 && actor.state !== "dead" &&
      !hasDirectCompanionAuthority(state, actor) && !isCompanionAssignedToResurrectionRecovery(state, id) &&
      actor.state !== "gather" && distance(actor.position, leader.position) <= Math.min(8, ROLE_TUNING[actor.role].leashDistance) ? [actor] : [];
  });
  const engaged = (actor: Companion, target: Enemy | CombatStructure) => (actor.state === "attack" || actor.state === "defend") && actor.currentTargetId === target.id &&
    (isWithinAttackReach(actor, target, actor.state === "defend" ? 1 : getCompanionAttackRange(actor)) ||
      (target.id === state.formationAssignments?.combat?.referenceTargetId && Boolean(getSpecializedMovementOwner(state, target.id))));
  if (shared) {
    const near = (actor: Companion) => distance(actor.position, getCombatTargetPosition(actor.position, shared)) <= COMBAT_BREAK_DISTANCE || engaged(actor, shared);
    if (near(leader) || (intent?.source !== "player" && members.some(near))) return shared;
  }
  if (intent?.source === "player" || (state.worldTravelTargetMapId && state.autoRoute?.pauseReason !== "emergency")) return undefined;
  const candidates = members.flatMap(actor => {
    const target = actor.currentTargetId ? state.entities[actor.currentTargetId] : undefined;
    return (actor.state === "attack" || actor.state === "defend") && isRetainableCombatEnemy(state, target) &&
      (distance(actor.position, target.position) <= COMBAT_BREAK_DISTANCE || engaged(actor, target)) ? [{ actor, target }] : [];
  });
  return candidates.find(({ target }) => target.id === state.formationAssignments?.combat?.referenceTargetId)?.target ??
    candidates.sort((a, b) => a.actor.partyOrder - b.actor.partyOrder || a.actor.id.localeCompare(b.actor.id) || a.target.id.localeCompare(b.target.id))[0]?.target;
}

export function isCombatFormationMember(state: GameState, actor: Companion): boolean {
  const target = actor.currentTargetId ? state.entities[actor.currentTargetId] : undefined;
  return Boolean(getCombatFormationTarget(state) && state.formationAssignments?.slotsByEntityId[actor.id] &&
    actor.id !== state.partyLeaderId && actor.health > 0 && actor.state !== "dead" &&
    (actor.state === "idle" || actor.state === "follow" || (actor.state === "defend" && !actor.defendPosition &&
      !(target && (target.kind === "enemy" || target.kind === "structure") && target.health > 0 && target.state !== "dead"))) &&
    !hasDirectCompanionAuthority(state, actor) && !isCompanionAssignedToResurrectionRecovery(state, actor.id) &&
    !state.companionAoeChannelsByCasterId?.[actor.id] && !getSpecializedMovementOwner(state, actor.id) && !isMovementBlockedByStatus(state, actor.id));
}

export function getCombatFormationPositions(state: GameState, runtime = state.formationAssignments?.combat): Record<string, Position> {
  const assignments = state.formationAssignments;
  if (!assignments || !runtime) return {};
  return transformFormationSlots(assignments, leaderOf(state), runtime.facing, leaderOf(state)?.position,
    runtime.lateralScale, runtime.spacing / assignments.spacing);
}

/** A preference for an existing target's engagement positions, never a mandatory destination. */
export function getCombatFormationPreference(state: GameState, actor: Companion): Position | undefined {
  if (hasDirectCompanionAuthority(state, actor) || isCompanionAssignedToResurrectionRecovery(state, actor.id) ||
    !getCombatFormationTarget(state)) return undefined;
  return getCombatFormationPositions(state)[actor.id];
}

function alternatives(point: Position): Position[] {
  return [point, ...Array.from({ length: 8 }, (_, i) => ({ x: point.x + Math.cos(i * Math.PI / 4) * COMBAT_FORMATION.alternativeRadius,
    y: point.y + Math.sin(i * Math.PI / 4) * COMBAT_FORMATION.alternativeRadius }))];
}

function membersOf(state: GameState): Companion[] {
  return state.formationAssignments!.members.flatMap(({ id }) => {
    const actor = state.entities[id];
    return actor?.kind === "companion" && (id === state.partyLeaderId || isCombatFormationMember(state, actor)) ? [actor] : [];
  });
}

/** Hard fit excludes passing bodies; their transient obstruction belongs to local avoidance. */
function fits(state: GameState, runtime: CombatFormationRuntime): boolean {
  const points = getCombatFormationPositions(state, runtime), leader = leaderOf(state)!;
  const proposed: Record<string, Position> = { [leader.id]: leader.position };
  const members = membersOf(state);
  if (!isSpecializedMovementPositionAvailable(state, leader, leader.position)) return false;
  for (const actor of members.filter(member => member.id !== leader.id)) {
    const point = points[actor.id];
    if (!point) return false;
    const candidate = alternatives(point).find(position =>
      isSpecializedMovementPositionAvailable(state, actor, position) &&
      !members.some(other => proposed[other.id] && doCollisionBodiesOverlap(actor, position, other, proposed[other.id], 0.05)));
    if (!candidate) return false;
    proposed[actor.id] = candidate;
  }
  return true;
}

function planGoals(state: GameState, runtime: CombatFormationRuntime): Record<string, CombatFormationGoal> {
  const points = getCombatFormationPositions(state, runtime), members = membersOf(state);
  const proposed: Record<string, Position> = Object.fromEntries(members.map(actor => [actor.id, actor.position]));
  const goals: Record<string, CombatFormationGoal> = {};
  for (const actor of members.filter(actor => actor.id !== state.partyLeaderId)) {
    const expectedPosition = points[actor.id], old = runtime.goalsByEntityId[actor.id];
    const available = (position: Position) => isCombatPositionAvailable(state, actor, position, { allowPartyPassThrough: true }) &&
      isSpecializedMovementPositionAvailable(state, actor, position) &&
      !getSpecializedMovementReservations(state).some(other => other.entity.id !== actor.id && doCollisionBodiesOverlap(actor, position, other.entity, other.position, 0.05)) &&
      !Object.entries(proposed).some(([id, point]) => id !== actor.id && doCollisionBodiesOverlap(actor, position, state.entities[id], point, 0.05));
    let position: Position | undefined, clearSinceMs: number | undefined;
    if (old?.mode === "substitute" && distance(old.position, expectedPosition) <= COMBAT_FORMATION.alternativeRadius && available(old.position)) {
      clearSinceMs = available(expectedPosition) ? old.clearSinceMs ?? state.simulationTimeMs ?? 0 : undefined;
      if (clearSinceMs === undefined || (state.simulationTimeMs ?? 0) - clearSinceMs < COMBAT_FORMATION.clearanceMs) position = old.position;
    }
    position ??= alternatives(expectedPosition).find(available);
    const mode = !position ? "held" : distance(position, expectedPosition) > 0.01 ? "substitute" : runtime.lateralScale < 1 ? "compressed" : "expanded";
    position ??= actor.position;
    const error = distance(position, actor.position);
    goals[actor.id] = { position, expectedPosition, mode, clearSinceMs,
      settled: mode === "held" || (old?.settled ? error <= COMBAT_FORMATION.resume : error <= COMBAT_FORMATION.settle) };
    proposed[actor.id] = position;
  }
  return goals;
}

/** Phase-local refreshes may update proposals/origin, but advance blending only once. */
export function prepareCombatFormation(state: GameState): GameState {
  const assignments = state.formationAssignments, leader = leaderOf(state);
  if (!assignments || !leader || isSuspended(state)) return state;
  const target = getCombatFormationTarget(state), old = assignments.combat;
  if (!target && !old) return state;
  const runtime: CombatFormationRuntime = old ? { ...old } : {
    leaderId: leader.id, mode: "combat", facing: assignments.travel?.facing ?? { x: 0, y: -1 },
    spacing: assignments.spacing * (assignments.travel?.rowScale ?? 1), lateralScale: assignments.travel?.lateralScale ?? 1,
    // A late first combat context inherits travel's already-consumed geometry update.
    frameKey: assignments.travel?.frameKey,
    goalsByEntityId: {},
  };
  if (runtime.leaderId !== leader.id) {
    runtime.leaderId = leader.id;
    runtime.referenceTargetId = undefined;
    runtime.goalsByEntityId = {};
    runtime.proposedGoalsByEntityId = undefined;
  }
  if (target && old?.mode === "recovering" && assignments.travel) {
    runtime.facing = assignments.travel.facing;
    runtime.spacing = assignments.spacing * (assignments.travel.rowScale ?? 1);
    runtime.lateralScale = assignments.travel.lateralScale;
    runtime.clearSinceMs = undefined;
    if (assignments.travel.frameKey === frameKey(state)) runtime.frameKey = frameKey(state);
  }
  runtime.referenceTargetId = target?.id;
  const recovering = !target;
  if (recovering) {
    runtime.mode = "recovering";
    runtime.proposedGoalsByEntityId = undefined;
    // Travel owns recovery locomotion, clearance, and once-per-update blending.
    const travel = assignments.travel;
    if (old?.mode === "combat" && travel) return { ...state, formationAssignments: { ...assignments, combat: runtime, travel: {
      ...travel, facing: runtime.facing, lateralScale: runtime.lateralScale, rowScale: runtime.spacing / assignments.spacing,
      goalsByEntityId: { ...travel.goalsByEntityId, ...Object.fromEntries(Object.entries(runtime.goalsByEntityId).map(([id, goal]) =>
        [id, { ...goal, mode: goal.mode === "expanded" ? "normal" as const : goal.mode }])) },
      frameKey: runtime.frameKey === frameKey(state) ? frameKey(state) : undefined,
      proposedGoalsByEntityId: undefined,
    } } };
    return old?.mode === "recovering" && old.leaderId === leader.id && old.referenceTargetId === undefined ? state
      : { ...state, formationAssignments: { ...assignments, combat: runtime } };
  }
  runtime.mode = "combat";
  if (runtime.frameKey !== frameKey(state)) {
    const seconds = Math.max(0, state.simulationDeltaMs ?? 100) / 1000;
    if (!getSpecializedMovementOwner(state, target.id)) {
      const point = target.kind === "structure" ? { x: (target.attackBounds.minX + target.attackBounds.maxX) / 2,
        y: (target.attackBounds.minY + target.attackBounds.maxY) / 2 } : target.position;
      runtime.facing = rotateFormationFacing(runtime.facing, { x: point.x - leader.position.x, y: point.y - leader.position.y }, seconds);
    }
    const desired = [{ spacing: COMBAT_FORMATION.spacing, lateralScale: COMBAT_FORMATION.spacing / assignments.spacing },
      ...[1, 0.75, 0.5].map(lateralScale => ({ spacing: assignments.spacing, lateralScale }))]
      .find(shape => fits(state, { ...runtime, ...shape }));
    if (desired && (desired.spacing < runtime.spacing || desired.lateralScale < runtime.lateralScale)) {
      runtime.spacing = desired.spacing;
      runtime.lateralScale = desired.lateralScale;
      runtime.clearSinceMs = undefined;
    } else if (desired && (desired.spacing > runtime.spacing || desired.lateralScale > runtime.lateralScale)) {
      runtime.clearSinceMs ??= state.simulationTimeMs ?? 0;
      if ((state.simulationTimeMs ?? 0) - runtime.clearSinceMs >= COMBAT_FORMATION.clearanceMs) {
        runtime.spacing = Math.min(desired.spacing, runtime.spacing + COMBAT_FORMATION.spacingPerSecond * seconds);
        runtime.lateralScale = Math.min(desired.lateralScale, runtime.lateralScale + COMBAT_FORMATION.spacingPerSecond * seconds / assignments.spacing);
      }
    } else runtime.clearSinceMs = undefined;
    runtime.frameKey = frameKey(state);
  }
  runtime.proposedGoalsByEntityId = planGoals(state, runtime);
  return { ...state, formationAssignments: { ...assignments, combat: runtime } };
}

export function moveCombatFormationMember(state: GameState, actor: Companion): GameState {
  if (!isCombatFormationMember(state, actor)) return state;
  const source: NormalMovementSource = actor.state === "defend" ? "defend" : getPartyExecutionIntent(state)?.source === "player" ? "partyTravel" : "follow";
  if (getMovementRequestRejection(state, createNormalMovementRequest(state, actor, actor.position, { source }))) return state;
  const next = prepareCombatFormation(state), runtime = next.formationAssignments?.combat;
  const goal = runtime?.proposedGoalsByEntityId?.[actor.id];
  if (!goal) return state;
  const options: MovementOptions = { source, sourceReason: `combat formation ${goal.mode}`, combatFormationGoal: goal,
    allowPartyPassThrough: true, pathProfile: "follow" as const,
    pathTargetKey: `combat-formation:${runtime!.leaderId}:${next.formationAssignments!.slotsByEntityId[actor.id]}`,
    pathTargetPosition: goal.position, acceptableRadius: COMBAT_FORMATION.settle,
    isSettlingPosition: (position: Position) => distance(position, goal.position) <= COMBAT_FORMATION.resume,
    isPositionAllowed: (position: Position) => isSpecializedMovementPathAvailable(next, actor, actor.position, position),
    rejectedPositionOutcome: "held" as const };
  return goal.settled
    ? resolveNormalMovement(next, createNormalMovementRequest(next, actor, actor.position, options, "hold"), options).state
    : moveEntityTowardPositionIfUnoccupied(next, actor, goal.position, options);
}

/** Removal/death releases proposals, never surviving members' slot ownership. */
export function pruneCombatFormationState(state: GameState): GameState {
  const assignments = state.formationAssignments, runtime = assignments?.combat;
  if (!assignments || !runtime) return state;
  const keep = (id: string) => state.entities[id]?.kind === "companion" && state.entities[id].state !== "dead" &&
    (state.entities[id] as Companion).health > 0 && Boolean(assignments.slotsByEntityId[id]);
  const referenceTargetId = getCombatFormationTarget(state)?.id;
  const goals = Object.fromEntries(Object.entries(runtime.goalsByEntityId).filter(([id]) => keep(id)));
  const proposed = runtime.proposedGoalsByEntityId && Object.fromEntries(Object.entries(runtime.proposedGoalsByEntityId).filter(([id]) => keep(id)));
  if (referenceTargetId === runtime.referenceTargetId && Object.keys(goals).length === Object.keys(runtime.goalsByEntityId).length &&
    Object.keys(proposed ?? {}).length === Object.keys(runtime.proposedGoalsByEntityId ?? {}).length) return state;
  return { ...state, formationAssignments: { ...assignments, combat: { ...runtime, referenceTargetId,
    goalsByEntityId: goals, proposedGoalsByEntityId: proposed } } };
}
