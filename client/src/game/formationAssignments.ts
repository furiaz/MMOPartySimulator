import { getSpecializedMovementOwner } from "./movementAuthority";
import { DEFAULT_FORMATION_SPACING, getFormationTemplate, transformFormationSlots } from "./formationTemplates";
import type { GameState } from "./state";
import type {
  FormationAssignments,
  FormationDepartureReason,
  FormationMemberInput,
  FormationPresetId,
  FormationSlot,
  FormationTemplate,
  PartyMemberRole,
  Position,
} from "./types";

const DEPTH_COSTS: Record<PartyMemberRole, Record<"front" | "middle" | "rear", number>> = {
  defender: { front: 0, middle: 1, rear: 2 },
  fighter: { front: 0, middle: 0, rear: 1 },
  support: { front: 2, middle: 1, rear: 0 },
  gatherer: { front: 2, middle: 1, rear: 0 },
  none: { front: 0, middle: 0, rear: 0 },
};

function compareMembers(a: FormationMemberInput, b: FormationMemberInput): number {
  return a.partyOrder - b.partyOrder || a.id.localeCompare(b.id);
}

function slotCost(role: PartyMemberRole, slot: FormationSlot, template: FormationTemplate): number {
  if (role === "none") return 0;
  if (template.preset === "side-by-side") {
    const ranks = [...new Set(template.slots.map(candidate => Math.abs(candidate.side)))].sort((a, b) => a - b);
    const rank = ranks.indexOf(Math.abs(slot.side));
    return role === "support" || role === "gatherer" ? rank : ranks.length - 1 - rank;
  }
  return slot.depth === "neutral" ? 0 : DEPTH_COSTS[role][slot.depth];
}

function validPreviousSlots(previous: FormationAssignments | undefined): Map<string, FormationSlot> {
  const slots = new Map<string, FormationSlot>();
  if (!previous) return slots;
  const template = getFormationTemplate(previous.preset, previous.members.length, previous.spacing);
  const counts = new Map<string, number>();
  for (const slotId of Object.values(previous.slotsByEntityId)) counts.set(slotId, (counts.get(slotId) ?? 0) + 1);
  for (const member of previous.members) {
    const id = previous.slotsByEntityId[member.id];
    const slot = template?.slots.find(candidate => candidate.id === id);
    if (slot && counts.get(id) === 1) slots.set(member.id, slot);
  }
  return slots;
}

/** Only structural inputs enter this allocator; tasks and physical positions cannot reshuffle it. */
export function assignFormationSlots(
  input: readonly FormationMemberInput[],
  leaderId: string,
  preset: FormationPresetId = "arrow",
  previous?: FormationAssignments,
  spacing = DEFAULT_FORMATION_SPACING,
): FormationAssignments | undefined {
  const members = input.map(({ id, role, partyOrder }) => ({ id, role, partyOrder })).sort(compareMembers);
  const template = getFormationTemplate(preset, members.length, spacing);
  if (!template || new Set(members.map(member => member.id)).size !== members.length) return undefined;
  const oldSlots = validPreviousSlots(previous);
  const sameInputs = previous?.preset === preset && previous.spacing === spacing && previous.leaderId === leaderId &&
    previous.members.length === members.length && members.every((member, i) => {
      const old = previous.members[i];
      return old.id === member.id && old.role === member.role && old.partyOrder === member.partyOrder;
    });
  if (sameInputs && oldSlots.size === members.length && Object.keys(previous.slotsByEntityId).length === members.length) return previous;

  const costs = members.map(member => template.slots.map(slot => slotCost(member.role, slot, template)));
  const profiles = costs.map(values => values.join(","));
  const previousOrder = new Map([...(previous?.members ?? [])].sort(compareMembers).map((member, i) => [member.id, i]));
  const reorderedProfiles = new Set<string>();
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const beforeFirst = previousOrder.get(members[i].id), beforeSecond = previousOrder.get(members[j].id);
    if (profiles[i] === profiles[j] && beforeFirst !== undefined && beforeSecond !== undefined && beforeFirst > beforeSecond)
      reorderedProfiles.add(profiles[i]);
  }
  let best: { indices: number[]; score: number[] } | undefined;

  function evaluate(indices: number[]) {
    const individualCosts = indices.map((slot, member) => costs[member][slot]);
    let inversions = 0, changed = 0, displacement = 0;
    for (let i = 0; i < members.length; i++) {
      const slot = template!.slots[indices[i]];
      const old = oldSlots.get(members[i].id);
      if (old) {
        if (template!.slots.some(candidate => candidate.id === old.id) && old.id !== slot.id) changed++;
        displacement += Math.hypot(old.side - slot.side, old.forward - slot.forward);
      }
      if (reorderedProfiles.has(profiles[i])) for (let j = i + 1; j < members.length; j++) {
        if (profiles[i] !== profiles[j]) continue;
        if (individualCosts[i] > individualCosts[j] ||
          (individualCosts[i] === individualCosts[j] && indices[i] > indices[j])) inversions++;
      }
    }
    const score = [individualCosts.reduce((sum, cost) => sum + cost, 0), inversions, changed, displacement,
      ...individualCosts, ...indices];
    if (!best || compareScores(score, best.score) < 0) best = { indices: [...indices], score };
  }

  // Five companions require at most 5! = 120 complete candidates.
  function visit(indices: number[], remaining: number[]) {
    if (!remaining.length) return evaluate(indices);
    for (const slot of remaining) visit([...indices, slot], remaining.filter(candidate => candidate !== slot));
  }
  visit([], template.slots.map((_, index) => index));

  return {
    preset, spacing, leaderId, members,
    slotsByEntityId: Object.fromEntries(members.map((member, i) => [member.id, template.slots[best!.indices[i]].id])),
    travel: previous?.travel ? { ...previous.travel,
      goalsByEntityId: Object.fromEntries(Object.entries(previous.travel.goalsByEntityId).filter(([id]) => members.some(member => member.id === id))),
      proposedGoalsByEntityId: undefined,
      trailOrder: previous.travel.trailOrder.filter(id => members.some(member => member.id === id)),
      frameKey: undefined,
    } : undefined,
  };
}

function compareScores(first: number[], second: number[]): number {
  for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) return first[i] - second[i];
  return 0;
}

export function reconcileFormationAssignments(state: GameState): GameState {
  if (state.worldWipeRecovery?.status === "pending_choice") {
    return state.formationAssignments ? { ...state, formationAssignments: undefined } : state;
  }
  // Active entities include dead members; reserves and secondary parties live elsewhere.
  const members = Object.values(state.entities).filter(entity => entity.kind === "companion");
  const assignments = assignFormationSlots(members, state.partyLeaderId, "arrow", state.formationAssignments);
  return assignments === state.formationAssignments ? state : { ...state, formationAssignments: assignments };
}

export function getFormationWorldPositions(state: GameState, facing: Position, origin?: Position): Record<string, Position> {
  if (!state.formationAssignments) return {};
  const leader = state.entities[state.partyLeaderId];
  return transformFormationSlots(state.formationAssignments, leader?.kind === "companion" ? leader : undefined, facing, origin);
}

/** Informational departures only; consumers retain their existing participation rules. */
export function getFormationMemberDepartures(state: GameState, entityId: string): FormationDepartureReason[] {
  const actor = state.entities[entityId];
  if (actor?.kind !== "companion") return ["missing"];
  if (actor.state === "dead" || actor.health <= 0) return ["dead"];
  const reasons: FormationDepartureReason[] = [];
  if (state.directCompanionCommandsById?.[entityId]) reasons.push("direct");
  if (actor.state === "gather") reasons.push("gathering");
  if (actor.state === "attack") reasons.push("combat");
  if (state.resurrectionChannelsByHelperId?.[entityId]) reasons.push("resurrection");
  if (getSpecializedMovementOwner(state, entityId)) reasons.push("specialized");
  return reasons;
}
