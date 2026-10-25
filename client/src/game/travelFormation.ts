import { getDirectLeaderCommand, hasDirectCompanionAuthority } from "./directCommandState";
import { canRegroupAutoRoute } from "./autoRouteSystem";
import { getFormationTemplate, transformFormationSlots } from "./formationTemplates";
import { getCombatFormationTarget, prepareCombatFormation } from "./combatFormation";
export { rotateFormationFacing as rotateTravelFacing } from "./formationTemplates";
import { rotateFormationFacing as rotateTravelFacing } from "./formationTemplates";
import { createNormalMovementRequest, getMovementPositionCommit, getMovementRequestRejection, getNormalMovementResult, getSpecializedMovementOwner } from "./movementAuthority";
import { holdEntityMovement, moveEntityTowardPositionIfUnoccupied } from "./movementPlanning";
import type { NormalMovementSource } from "./movementTypes";
import { isRequiredForTravelCohesion } from "./partyActivityCoordinator";
import { getPartyExecutionIntent } from "./partyIntentState";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { getActiveQuestGuide, getActiveQuestGuideObjectiveId } from "./questGuideSystem";
import { doCollisionBodiesOverlap } from "./spatialGeometry";
import { getSpecializedMovementReservations, isSpecializedMovementPathAvailable, isSpecializedMovementPositionAvailable } from "./specializedMovementGeometry";
import type { GameState } from "./state";
import { isMovementBlockedByStatus } from "./statusEffects";
import type { Companion, Position, TravelFormationGoal, TravelFormationRuntime } from "./types";

export const TRAVEL_FORMATION = {
  settle: 0.35, resume: 0.6, catchUpDistance: 4, maxSpeed: 1.8,
  slowEnter: 4, slowExit: 3, waitEnter: 7, waitExit: 5, slowSpeed: 0.45,
  clearanceMs: 500, expansionPerSecond: 0.5, trailLength: 32, trailPoints: 256,
  recoveryCandidates: 32,
} as const;
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);
const frameKey = (state: GameState) => `${state.simulationFrame ?? state.simulationTick ?? 0}:${state.simulationTimeMs ?? 0}`;

function leaderOf(state: GameState): Companion | undefined {
  const leader = state.entities[state.partyLeaderId];
  return leader?.kind === "companion" && leader.health > 0 && leader.state !== "dead" ? leader : undefined;
}

export function usesTravelFormation(state: GameState): boolean {
  if (!state.formationAssignments || !leaderOf(state) || state.activeTeleport || !canRegroupAutoRoute(state)) return false;
  if (getActiveQuestGuideObjectiveId(state) && getActiveQuestGuide(state)) return false;
  if (getDirectLeaderCommand(state)) return true;
  if (getCombatFormationTarget(state)) return false;
  const intent = getPartyExecutionIntent(state);
  const target = intent?.targetId ? state.entities[intent.targetId] : undefined;
  const leader = leaderOf(state)!;
  const personalTarget = leader.currentTargetId ? state.entities[leader.currentTargetId] : undefined;
  return !(state.partyFormation?.phase === "combat" && target && "health" in target && target.health > 0) &&
    !(leader.state === "attack" && personalTarget && (personalTarget.kind === "enemy" || personalTarget.kind === "structure") && personalTarget.health > 0);
}

export function isTravelFormationMember(state: GameState, actor: Companion): boolean {
  const target = actor.currentTargetId ? state.entities[actor.currentTargetId] : undefined;
  const hasCombatTarget = target && (target.kind === "enemy" || target.kind === "structure") && target.health > 0 && target.state !== "dead";
  const hasCombatRequest = state.normalMovementPhase?.submissions.some(({ request }) => request.entityId === actor.id &&
    !request.travelFormationGoal && (request.source === "defend" || request.source === "attack"));
  return usesTravelFormation(state) && actor.id !== state.partyLeaderId && actor.health > 0 && actor.state !== "dead" &&
    (actor.state === "idle" || actor.state === "follow" || (actor.state === "defend" && !actor.defendPosition && !hasCombatTarget)) &&
    !hasCombatRequest &&
    !hasDirectCompanionAuthority(state, actor) && !isCompanionAssignedToResurrectionRecovery(state, actor.id) &&
    !getSpecializedMovementOwner(state, actor.id) && !isMovementBlockedByStatus(state, actor.id);
}

export function travelFormationSource(state: GameState, actor: Companion): NormalMovementSource {
  if (actor.state === "defend" && state.partyFormation?.phase !== "traveling") return "defend";
  return getPartyExecutionIntent(state) && !getDirectLeaderCommand(state) ? "partyTravel" : "follow";
}

export function sampleTravelTrail(trail: readonly Position[], behind: number): Position | undefined {
  let remaining = behind;
  for (let i = trail.length - 1; i > 0; i--) {
    const length = distance(trail[i], trail[i - 1]);
    if (remaining <= length && length > 0) {
      const ratio = remaining / length;
      return { x: trail[i].x + (trail[i - 1].x - trail[i].x) * ratio, y: trail[i].y + (trail[i - 1].y - trail[i].y) * ratio };
    }
    remaining -= length;
  }
  return undefined;
}

function appendTrail(points: Position[], position: Position): Position[] {
  const trail = [...points];
  if (!trail.length || distance(trail[trail.length - 1], position) > 0.001) {
    const a = trail.at(-2), b = trail.at(-1);
    // Distance history keeps real corners, rather than spending its point budget on straight steps.
    if (a && b && Math.abs((b.x - a.x) * (position.y - b.y) - (b.y - a.y) * (position.x - b.x)) < 1e-7 &&
      (b.x - a.x) * (position.x - b.x) + (b.y - a.y) * (position.y - b.y) >= 0) trail[trail.length - 1] = { ...position };
    else trail.push({ ...position });
  }
  let length = 0;
  for (let i = trail.length - 1; i > 0; i--) {
    const segment = distance(trail[i], trail[i - 1]);
    if (length + segment > TRAVEL_FORMATION.trailLength) {
      const ratio = (TRAVEL_FORMATION.trailLength - length) / segment;
      trail.splice(0, i, { x: trail[i].x + (trail[i - 1].x - trail[i].x) * ratio, y: trail[i].y + (trail[i - 1].y - trail[i].y) * ratio });
      break;
    }
    length += segment;
  }
  return trail.slice(-TRAVEL_FORMATION.trailPoints);
}

function runtimeOf(state: GameState): TravelFormationRuntime {
  const leader = leaderOf(state)!;
  const old = state.formationAssignments!.travel;
  const order = getFormationTemplate(state.formationAssignments!.preset, state.formationAssignments!.members.length)!.slots
    .flatMap(slot => state.formationAssignments!.members.filter(member => member.id !== leader.id && state.formationAssignments!.slotsByEntityId[member.id] === slot.id).map(member => member.id));
  if (old?.leaderId === leader.id) return { ...old, trailOrder: old.trailing
    ? [...old.trailOrder.filter(id => order.includes(id)), ...order.filter(id => !old.trailOrder.includes(id))] : order };
  const origin = old ? leader.position : getMovementPositionCommit(state, leader.id)?.from ?? leader.position;
  const recovery = state.formationAssignments?.combat?.mode === "recovering" ? state.formationAssignments.combat : undefined;
  return { leaderId: leader.id, facing: recovery?.facing ?? old?.facing ?? { x: 0, y: -1 },
    lateralScale: recovery?.lateralScale ?? 1, rowScale: recovery ? recovery.spacing / state.formationAssignments!.spacing : 1, trailing: false,
    trail: [{ ...origin }], trailOrder: order, lastLeaderPosition: { ...origin },
    cohesion: "normal", goalsByEntityId: {}, frameKey: recovery?.frameKey === frameKey(state) ? frameKey(state) : undefined };
}

function withRuntime(state: GameState, travel: TravelFormationRuntime): GameState {
  const combat = state.formationAssignments?.combat;
  return { ...state, formationAssignments: { ...state.formationAssignments!, travel,
    combat: combat?.mode === "recovering" && (travel.rowScale ?? 1) <= 1 && travel.lateralScale <= 1 ? undefined : combat } };
}

function participants(state: GameState): Companion[] {
  return state.formationAssignments!.members.flatMap(member => {
    const actor = state.entities[member.id];
    return actor?.kind === "companion" && (actor.id === state.partyLeaderId || isTravelFormationMember(state, actor)) ? [actor] : [];
  });
}

function slotPositions(state: GameState, runtime: TravelFormationRuntime, scale = runtime.lateralScale) {
  return transformFormationSlots(state.formationAssignments!, leaderOf(state), runtime.facing, leaderOf(state)!.position, scale, runtime.rowScale ?? 1);
}

function alternatives(position: Position, radius: number, directions = 8): Position[] {
  return [position, ...Array.from({ length: directions }, (_, i) => ({ x: position.x + Math.cos(i * 2 * Math.PI / directions) * radius,
    y: position.y + Math.sin(i * 2 * Math.PI / directions) * radius }))];
}

/** Pure hard fit: passing living bodies are handled by avoidance, not compression. */
function shapeGoals(state: GameState, runtime: TravelFormationRuntime, scale: number): Record<string, Position> | undefined {
  const points = slotPositions(state, runtime, scale), members = participants(state);
  const goals: Record<string, Position> = { [state.partyLeaderId]: leaderOf(state)!.position };
  for (const actor of members.filter(member => member.id !== state.partyLeaderId)) {
    const goal = alternatives(points[actor.id], state.formationAssignments!.spacing / 2).find(position =>
      isSpecializedMovementPositionAvailable(state, actor, position) && !members.some(other => goals[other.id] && other.id !== actor.id &&
        doCollisionBodiesOverlap(actor, position, other, goals[other.id], 0.05)));
    if (!goal) return undefined;
    goals[actor.id] = goal;
  }
  return goals;
}

/** Observe the leader only after its applicable phase has committed. Idempotent in a frame. */
export function prepareTravelFormation(state: GameState): GameState {
  state = prepareCombatFormation(state);
  if (!usesTravelFormation(state)) return state;
  const leader = leaderOf(state)!, runtime = runtimeOf(state);
  if (runtime.frameKey === frameKey(state)) return runtime.proposedGoalsByEntityId ? state : withRuntime(state,
    { ...runtime, proposedGoalsByEntityId: planTravelGoals(state, runtime) });
  const recovering = state.formationAssignments?.combat?.mode === "recovering";
  if (recovering) runtime.rowScale = Math.max(1, (runtime.rowScale ?? 1) - getCombatRecoveryStep(state));
  const commit = getMovementPositionCommit(state, leader.id), result = getNormalMovementResult(state, leader.id);
  const walking = commit?.source === "normal" && result?.request.mode === "walk" &&
    ["direct", "partyTravel", "follow", "explore", "attack", "gather"].includes(result.request.source);
  const discontinuity = distance(runtime.lastLeaderPosition, commit?.from ?? leader.position) > 0.01 ||
    Boolean(getSpecializedMovementOwner(state, leader.id)) || Boolean(commit && !walking);
  if (discontinuity) runtime.trail = [{ ...leader.position }];
  else if (walking) {
    runtime.facing = rotateTravelFacing(runtime.facing, { x: commit.to.x - commit.from.x, y: commit.to.y - commit.from.y }, (state.simulationDeltaMs ?? 100) / 1000);
    runtime.trail = appendTrail(runtime.trail, leader.position);
  }
  const now = state.simulationTimeMs ?? 0;
  const widest = [1, 0.75, 0.5].find(scale => shapeGoals(state, runtime, scale));
  if (widest === undefined) {
    runtime.trailing = true;
    runtime.clearSinceMs = undefined;
  } else if (runtime.trailing || widest > runtime.lateralScale) {
    runtime.clearSinceMs ??= now;
    if (now - runtime.clearSinceMs >= TRAVEL_FORMATION.clearanceMs) {
      runtime.trailing = false;
      const expanded = Math.min(widest, runtime.lateralScale + TRAVEL_FORMATION.expansionPerSecond * (state.simulationDeltaMs ?? 100) / 1000);
      if (shapeGoals(state, runtime, expanded)) runtime.lateralScale = expanded;
    }
  } else {
    runtime.lateralScale = recovering && runtime.lateralScale > 1 && widest === 1
      ? Math.max(1, runtime.lateralScale - getCombatRecoveryStep(state)) : widest;
    runtime.trailing = false;
    runtime.clearSinceMs = undefined;
  }
  runtime.lastLeaderPosition = { ...leader.position };
  runtime.proposedGoalsByEntityId = planTravelGoals(state, runtime);
  runtime.frameKey = frameKey(state);
  return withRuntime(state, runtime);
}

function getCombatRecoveryStep(state: GameState): number {
  return 0.5 / state.formationAssignments!.spacing * Math.max(0, state.simulationDeltaMs ?? 100) / 1000;
}

function expectedPosition(state: GameState, runtime: TravelFormationRuntime, actor: Companion): Position {
  if (runtime.trailing || runtime.goalsByEntityId[actor.id]?.recovery?.resolved) return trailingPosition(state, runtime, actor);
  return slotPositions(state, runtime)[actor.id];
}

function trailingPosition(state: GameState, runtime: TravelFormationRuntime, actor: Companion): Position {
  const behind = (runtime.trailOrder.indexOf(actor.id) + 1) * state.formationAssignments!.spacing;
  // This is a proposed region, not invented committed trail history.
  const leader = leaderOf(state)!;
  return sampleTravelTrail(runtime.trail, behind) ?? {
    x: leader.position.x - runtime.facing.x * behind,
    y: leader.position.y - runtime.facing.y * behind,
  };
}

/** Cohesion reads ideal slot/trail geometry, never a held or obstructed substitute. */
export function getTravelFormationExpectedPosition(state: GameState, actor: Companion): Position | undefined {
  if (!state.formationAssignments?.slotsByEntityId[actor.id] || !leaderOf(state)) return undefined;
  return expectedPosition(state, runtimeOf(state), actor);
}

function standingGoal(state: GameState, actor: Companion, position: Position): boolean {
  if (!isSpecializedMovementPositionAvailable(state, actor, position)) return false;
  if (getSpecializedMovementReservations(state).some(other => other.entity.id !== actor.id && doCollisionBodiesOverlap(actor, position, other.entity, other.position, 0.05))) return false;
  return !Object.values(state.entities).some(other => other.id !== actor.id && other.state !== "dead" &&
    (other.kind === "enemy" || other.kind === "npc" || (other.kind === "companion" && !isTravelFormationMember(state, other))) &&
    doCollisionBodiesOverlap(actor, position, other, other.position, 0.05));
}

function chooseGoal(state: GameState, actor: Companion, runtime: TravelFormationRuntime, proposed: Record<string, Position>): TravelFormationGoal {
  const nominal = runtime.trailing ? trailingPosition(state, runtime, actor) : slotPositions(state, runtime)[actor.id];
  const old = runtime.goalsByEntityId[actor.id], now = state.simulationTimeMs ?? 0;
  const radius = state.formationAssignments!.spacing / 2;
  const insufficientTrail = runtime.trailing && !sampleTravelTrail(runtime.trail, (runtime.trailOrder.indexOf(actor.id) + 1) * state.formationAssignments!.spacing);
  let position: Position | undefined;
  let clearSinceMs: number | undefined;
  const available = (candidate: Position) => standingGoal(state, actor, candidate) && !Object.entries(proposed).some(([id, other]) =>
    id !== actor.id && doCollisionBodiesOverlap(actor, candidate, state.entities[id], other, 0.05));
  const search = state.formationPathSearchesByEntityId?.[actor.id];
  const failedApproach = Boolean(old && search?.failed && search.requestKey?.includes(`formation:${runtime.leaderId}:${state.formationAssignments!.slotsByEntityId[actor.id]}:`) &&
    (!old.recovery || search.requestKey.includes(":recovery:")));
  const normal = alternatives(nominal, radius).find(available);
  if (old?.recovery) clearSinceMs = normal && !failedApproach ? old.clearSinceMs ?? now : undefined;
  const anchor = trailingPosition(state, runtime, actor);
  const recoveryNeedsProgress = old?.recovery?.resolved && (distance(old.recovery.anchorPosition, anchor) >= 1 ||
    distance(actor.position, old.position) > TRAVEL_FORMATION.resume);
  if (old?.recovery && normal && !insufficientTrail && !recoveryNeedsProgress && clearSinceMs !== undefined && now - clearSinceMs >= TRAVEL_FORMATION.clearanceMs) {
    // Geometry alone cannot prove a rejoin: the clear slot may be across a wall.
    // Validate its approach in the same winning request and shared search budget.
    return { position: normal, expectedPosition: nominal, mode: runtime.trailing ? "trailing" : runtime.lateralScale < 1 ? "compressed" : "normal",
      settled: false, clearSinceMs, recovery: { reason: old.recovery.reason, anchorPosition: nominal,
        candidates: alternatives(nominal, radius).filter(available), resolved: false, rejoining: true } };
  }
  const recovering = insufficientTrail || !normal || failedApproach || Boolean(old?.recovery &&
    (recoveryNeedsProgress || clearSinceMs === undefined || now - clearSinceMs < TRAVEL_FORMATION.clearanceMs));
  if (recovering) {
    const retained = old?.recovery?.resolved && !failedApproach && available(old.position) &&
      distance(old.recovery.anchorPosition, anchor) < 1 ? old.position : undefined;
    const candidates: Position[] = [];
    for (const candidate of retained ? [retained] : [...alternatives(anchor, radius, 16), ...alternatives(nominal, radius, 16),
      ...alternatives(anchor, radius * 2, 16), ...alternatives(nominal, radius * 2, 16)]) {
      if (candidate && available(candidate) && !candidates.some(other => distance(candidate, other) < 0.001)) candidates.push(candidate);
      if (candidates.length === TRAVEL_FORMATION.recoveryCandidates) break;
    }
    const selected = retained ?? candidates[0];
    const resolved = Boolean(retained);
    return { position: selected ?? actor.position, expectedPosition: resolved || runtime.trailing ? anchor : nominal,
      mode: selected ? "trailing" : "held", settled: resolved && distance(actor.position, selected!) <= (old?.settled ? TRAVEL_FORMATION.resume : TRAVEL_FORMATION.settle),
      clearSinceMs, recovery: { reason: insufficientTrail ? "short_trail" : failedApproach ? "path_failed" : "blocked_slot",
        anchorPosition: retained ? old!.recovery!.anchorPosition : anchor, candidates, resolved } };
  }
  if (old?.mode === "substitute" && available(old.position) && distance(old.position, nominal) <= radius + 0.001) {
    clearSinceMs = available(nominal) ? old.clearSinceMs ?? now : undefined;
    if (clearSinceMs === undefined || now - clearSinceMs < TRAVEL_FORMATION.clearanceMs) position = old.position;
  }
  position ??= normal;
  const held = !position;
  position ??= actor.position;
  const mode = held ? "held" : runtime.trailing ? "trailing" : distance(position, nominal) > 0.01 ? "substitute" : runtime.lateralScale < 1 ? "compressed" : "normal";
  // Reuse the selected request's existing bounded path planning; no candidate launches a search.
  const error = distance(actor.position, position);
  const settled = !held && (old?.settled ? error <= TRAVEL_FORMATION.resume : error <= TRAVEL_FORMATION.settle);
  return { position, expectedPosition: nominal, mode, settled, clearSinceMs };
}

/** Shared geometry proposals, never collision reservations or accepted movement results. */
function planTravelGoals(state: GameState, runtime: TravelFormationRuntime): Record<string, TravelFormationGoal> {
  const members = participants(state).filter(actor => actor.id !== state.partyLeaderId);
  const proposed = Object.fromEntries(members.map(actor => [actor.id, actor.position]));
  const goals: Record<string, TravelFormationGoal> = {};
  for (const id of runtime.trailOrder) {
    const actor = members.find(member => member.id === id);
    if (!actor) continue;
    goals[id] = chooseGoal(state, actor, runtime, proposed);
    proposed[id] = goals[id].position;
  }
  return goals;
}

/** Adapt an existing producer; losing/deferred requests leave all planning untouched. */
export function moveTravelFormationMember(state: GameState, actor: Companion, source = travelFormationSource(state, actor)): GameState {
  if (!isTravelFormationMember(state, actor) || getMovementRequestRejection(state, createNormalMovementRequest(state, actor, actor.position, { source }))) return state;
  let next = prepareTravelFormation(state);
  const runtime = next.formationAssignments!.travel!;
  const goal = runtime.proposedGoalsByEntityId?.[actor.id];
  if (!goal) return state;
  const reason = `formation ${next.formationAssignments?.combat?.mode === "recovering" ? "recovering " : ""}${goal.mode}${goal.recovery ? ` recovery ${goal.recovery.reason}` : ""}`;
  const settlingWithoutTravel = !getPartyExecutionIntent(next) && !getDirectLeaderCommand(next);
  if (goal.settled || goal.mode === "held") next = holdEntityMovement(next, actor, source, reason, goal);
  else next = moveEntityTowardPositionIfUnoccupied(next, actor, goal.position, {
    source, sourceReason: reason, allowPartyPassThrough: true, pathProfile: "follow",
    travelFormationGoal: goal,
    pathTargetKey: `formation:${runtime.leaderId}:${next.formationAssignments!.slotsByEntityId[actor.id]}:${goal.recovery && !goal.recovery.rejoining ? "recovery" : runtime.trailing ? "trail" : "shape"}`,
    pathTargetPosition: goal.recovery?.anchorPosition ?? goal.position, acceptableRadius: TRAVEL_FORMATION.settle,
    speedMultiplier: 1 + (TRAVEL_FORMATION.maxSpeed - 1) * Math.max(0, Math.min(1, (distance(actor.position, goal.position) - TRAVEL_FORMATION.resume) / (TRAVEL_FORMATION.catchUpDistance - TRAVEL_FORMATION.resume))),
    isSettlingPosition: position => settlingWithoutTravel || distance(position, goal.position) <= TRAVEL_FORMATION.resume,
    isPositionAllowed: position => isSpecializedMovementPathAvailable(next, actor, actor.position, position),
    rejectedPositionOutcome: "held",
  });
  return next;
}

/** Read expected slots, never a hold fallback, before committing the leader's next step. */
export function updateTravelFormationCohesion(state: GameState): { state: GameState; canMoveLeader: boolean; leaderSpeedMultiplier: number } | undefined {
  if (!usesTravelFormation(state) || getDirectLeaderCommand(state)) return undefined;
  const runtime = runtimeOf(state), leader = leaderOf(state)!;
  let error = 0;
  for (const actor of participants(state)) {
    if (actor.id !== leader.id && isRequiredForTravelCohesion(state, actor, leader)) error = Math.max(error, distance(actor.position, expectedPosition(state, runtime, actor)));
  }
  runtime.cohesion = error > TRAVEL_FORMATION.waitEnter || (runtime.cohesion === "wait" && error >= TRAVEL_FORMATION.waitExit) ? "wait"
    : error > TRAVEL_FORMATION.slowEnter || (runtime.cohesion !== "normal" && error >= TRAVEL_FORMATION.slowExit) ? "slow" : "normal";
  return { state: withRuntime(state, runtime), canMoveLeader: runtime.cohesion !== "wait", leaderSpeedMultiplier: runtime.cohesion === "normal" ? 1 : TRAVEL_FORMATION.slowSpeed };
}
