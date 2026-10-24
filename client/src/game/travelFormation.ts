import { getDirectLeaderCommand, hasDirectCompanionAuthority } from "./directCommandState";
import { getFormationTemplate, transformFormationSlots } from "./formationTemplates";
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
} as const;
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);
const frameKey = (state: GameState) => `${state.simulationFrame ?? state.simulationTick ?? 0}:${state.simulationTimeMs ?? 0}`;

function leaderOf(state: GameState): Companion | undefined {
  const leader = state.entities[state.partyLeaderId];
  return leader?.kind === "companion" && leader.health > 0 && leader.state !== "dead" ? leader : undefined;
}

/** #701 owns every Auto Route state, including pauses and individual leader overrides. */
export function usesTravelFormation(state: GameState): boolean {
  if (!state.formationAssignments || !leaderOf(state) || state.worldTravelTargetMapId || state.autoRoute || state.activeTeleport) return false;
  if (getActiveQuestGuideObjectiveId(state) && getActiveQuestGuide(state)) return false;
  if (getDirectLeaderCommand(state)) return true;
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

export function rotateTravelFacing(previous: Position, desired: Position, deltaSeconds: number): Position {
  if (Math.hypot(desired.x, desired.y) < 0.001) return previous;
  const start = Math.atan2(previous.y, previous.x), end = Math.atan2(desired.y, desired.x);
  let turn = ((end - start) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (Math.abs(turn + Math.PI) < 1e-9) turn = Math.PI; // Clockwise in world/screen coordinates.
  const cap = Math.max(0, deltaSeconds) * 2 * Math.PI;
  const angle = start + Math.max(-cap, Math.min(cap, turn));
  return { x: Math.cos(angle), y: Math.sin(angle) };
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
  if (old?.leaderId === leader.id) return { ...old, trailOrder: order };
  const origin = old ? leader.position : getMovementPositionCommit(state, leader.id)?.from ?? leader.position;
  return { leaderId: leader.id, facing: old?.facing ?? { x: 0, y: -1 }, lateralScale: 1, trailing: false,
    trail: [{ ...origin }], trailOrder: order, lastLeaderPosition: { ...origin },
    cohesion: "normal", goalsByEntityId: {} };
}

function withRuntime(state: GameState, travel: TravelFormationRuntime): GameState {
  return { ...state, formationAssignments: { ...state.formationAssignments!, travel } };
}

function participants(state: GameState): Companion[] {
  return state.formationAssignments!.members.flatMap(member => {
    const actor = state.entities[member.id];
    return actor?.kind === "companion" && (actor.id === state.partyLeaderId || isTravelFormationMember(state, actor)) ? [actor] : [];
  });
}

function slotPositions(state: GameState, runtime: TravelFormationRuntime, scale = runtime.lateralScale) {
  return transformFormationSlots(state.formationAssignments!, leaderOf(state), runtime.facing, leaderOf(state)!.position, scale);
}

function alternatives(position: Position, radius: number): Position[] {
  return [position, ...Array.from({ length: 8 }, (_, i) => ({ x: position.x + Math.cos(i * Math.PI / 4) * radius, y: position.y + Math.sin(i * Math.PI / 4) * radius }))];
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
  if (!usesTravelFormation(state)) return state;
  const leader = leaderOf(state)!, runtime = runtimeOf(state);
  if (runtime.frameKey === frameKey(state)) return state;
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
    runtime.lateralScale = widest;
    runtime.trailing = false;
    runtime.clearSinceMs = undefined;
  }
  runtime.lastLeaderPosition = { ...leader.position };
  runtime.proposedGoalsByEntityId = planTravelGoals(state, runtime);
  runtime.frameKey = frameKey(state);
  return withRuntime(state, runtime);
}

function expectedPosition(state: GameState, runtime: TravelFormationRuntime, actor: Companion): Position {
  if (runtime.trailing) {
    const behind = (runtime.trailOrder.indexOf(actor.id) + 1) * state.formationAssignments!.spacing;
    const sample = sampleTravelTrail(runtime.trail, behind);
    if (sample) return sample;
  }
  return slotPositions(state, runtime)[actor.id];
}

function standingGoal(state: GameState, actor: Companion, position: Position): boolean {
  if (!isSpecializedMovementPositionAvailable(state, actor, position)) return false;
  if (getSpecializedMovementReservations(state).some(other => other.entity.id !== actor.id && doCollisionBodiesOverlap(actor, position, other.entity, other.position, 0.05))) return false;
  return !Object.values(state.entities).some(other => other.id !== actor.id && other.state !== "dead" &&
    (other.kind === "enemy" || other.kind === "npc" || (other.kind === "companion" && !isTravelFormationMember(state, other))) &&
    doCollisionBodiesOverlap(actor, position, other, other.position, 0.05));
}

function chooseGoal(state: GameState, actor: Companion, runtime: TravelFormationRuntime, proposed: Record<string, Position>): TravelFormationGoal {
  const expected = expectedPosition(state, runtime, actor), old = runtime.goalsByEntityId[actor.id], now = state.simulationTimeMs ?? 0;
  const radius = state.formationAssignments!.spacing / 2;
  const insufficientTrail = runtime.trailing && !sampleTravelTrail(runtime.trail, (runtime.trailOrder.indexOf(actor.id) + 1) * state.formationAssignments!.spacing);
  let position: Position | undefined;
  let clearSinceMs: number | undefined;
  const available = (candidate: Position) => standingGoal(state, actor, candidate) && !Object.entries(proposed).some(([id, other]) =>
    id !== actor.id && doCollisionBodiesOverlap(actor, candidate, state.entities[id], other, 0.05));
  if (old?.mode === "substitute" && available(old.position) && distance(old.position, expected) <= radius + 0.001) {
    clearSinceMs = available(expected) ? old.clearSinceMs ?? now : undefined;
    if (clearSinceMs === undefined || now - clearSinceMs < TRAVEL_FORMATION.clearanceMs) position = old.position;
  }
  const approach = insufficientTrail ? runtime.trail[0] : expected;
  if (!position) position = alternatives(approach, radius).find(available);
  const held = !position;
  position ??= actor.position;
  const mode = held ? "held" : runtime.trailing ? "trailing" : distance(position, expected) > 0.01 ? "substitute" : runtime.lateralScale < 1 ? "compressed" : "normal";
  // Reuse the selected request's existing bounded path planning; no candidate launches a search.
  const error = distance(actor.position, position);
  const settled = mode === "held" || (old?.settled ? error <= TRAVEL_FORMATION.resume : error <= TRAVEL_FORMATION.settle);
  return { position, expectedPosition: expected, mode, settled, clearSinceMs };
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
  const reason = `formation ${goal.mode}`;
  const settlingWithoutTravel = !getPartyExecutionIntent(next) && !getDirectLeaderCommand(next);
  if (goal.settled) next = holdEntityMovement(next, actor, source, reason, goal);
  else next = moveEntityTowardPositionIfUnoccupied(next, actor, goal.position, {
    source, sourceReason: reason, allowPartyPassThrough: true, pathProfile: "follow",
    travelFormationGoal: goal,
    pathTargetKey: `formation:${runtime.leaderId}:${next.formationAssignments!.slotsByEntityId[actor.id]}:${runtime.trailing ? "trail" : "shape"}`,
    pathTargetPosition: goal.position, acceptableRadius: TRAVEL_FORMATION.settle,
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
