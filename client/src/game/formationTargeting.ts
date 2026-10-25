import { getCompanionAttackRange } from "./companionCombat";
import { getFormationTemplate } from "./formationTemplates";
import { getEffectiveAttackRange, SPATIAL_EPSILON } from "./spatialGeometry";
import type { GameState } from "./state";
import type { Companion, Enemy, FormationLane, FormationSlot } from "./types";

export type FormationTargetScore = {
  lane: FormationLane;
  assignedLane: FormationLane;
  approachDistance: number;
  claimCount: number;
  score: number;
  reachable: boolean;
};

/** Read effective geometry without advancing facing or making targeting decisions. */
function formationFrame(state: GameState) {
  const assignments = state.formationAssignments, leader = state.entities[state.partyLeaderId];
  if (!assignments || assignments.leaderId !== state.partyLeaderId || leader?.kind !== "companion" ||
    leader.health <= 0 || leader.state === "dead") return undefined;
  const template = getFormationTemplate(assignments.preset, assignments.members.length, assignments.spacing);
  const leaderSlot = template?.slots.find(slot => slot.id === assignments.slotsByEntityId[leader.id]);
  if (!template || !leaderSlot) return undefined;
  const combat = assignments.combat;
  const runtime = combat?.mode === "combat" ? combat : assignments.travel ?? combat;
  const facing = runtime?.facing ?? { x: 0, y: -1 }, length = Math.hypot(facing.x, facing.y);
  const forward = Number.isFinite(length) && length > 0 ? { x: facing.x / length, y: facing.y / length } : { x: 0, y: -1 };
  const scale = runtime?.lateralScale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  return { assignments, template, leader, leaderSlot, right: { x: -forward.y, y: forward.x }, scale };
}

export function getAssignedFormationSlot(state: GameState, actorId: string): FormationSlot | undefined {
  const frame = formationFrame(state);
  return frame?.assignments.members.some(member => member.id === actorId)
    ? frame.template.slots.find(slot => slot.id === frame.assignments.slotsByEntityId[actorId]) : undefined;
}

export function getFormationTargetScore(state: GameState, actor: Companion, target: Enemy,
  claimCount: number, reachable: boolean): FormationTargetScore | undefined {
  const frame = formationFrame(state), slot = getAssignedFormationSlot(state, actor.id);
  if (!frame || !slot) return undefined;
  const side = (target.position.x - frame.leader.position.x) * frame.right.x +
    (target.position.y - frame.leader.position.y) * frame.right.y + frame.leaderSlot.side * frame.scale;
  const band = frame.assignments.spacing * frame.scale / 4;
  const lane: FormationLane = side < -band - SPATIAL_EPSILON ? "left" : side > band + SPATIAL_EPSILON ? "right" : "center";
  const lanes = { left: -1, center: 0, right: 1 };
  const reach = actor.role === "defender" ? 1 : getCompanionAttackRange(actor);
  const approachDistance = Math.max(0, Math.hypot(target.position.x - actor.position.x, target.position.y - actor.position.y) -
    getEffectiveAttackRange(actor, target, reach));
  return { lane, assignedLane: slot.lane, approachDistance, claimCount, reachable,
    score: approachDistance + 2 * Math.abs(lanes[lane] - lanes[slot.lane]) + 0.5 * claimCount };
}

export function compareFormationTargetScores(a: FormationTargetScore, b: FormationTargetScore): number {
  const difference = a.score - b.score;
  return Number(b.reachable) - Number(a.reachable) ||
    (Math.abs(difference) > SPATIAL_EPSILON ? difference : 0) ||
    (Math.abs(a.approachDistance - b.approachDistance) > SPATIAL_EPSILON ? a.approachDistance - b.approachDistance : 0);
}
