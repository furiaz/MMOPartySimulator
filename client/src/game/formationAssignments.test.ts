import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import { assignFormationSlots, getFormationMemberDepartures, getFormationWorldPositions, reconcileFormationAssignments } from "./formationAssignments";
import { getFormationTemplate } from "./formationTemplates";
import { createTestGameState } from "./testState";
import type { FormationAssignments, FormationMemberInput, FormationPresetId, PartyMemberRole } from "./types";

const presets: FormationPresetId[] = ["arrow", "balanced", "side-by-side"];
const roles: PartyMemberRole[] = ["defender", "fighter", "support", "gatherer", "none"];

function members(roleList: PartyMemberRole[] = roles): FormationMemberInput[] {
  return roleList.map((role, partyOrder) => ({ id: `member-${partyOrder}`, role, partyOrder }));
}

function slotFor(assignments: FormationAssignments, id: string) {
  return getFormationTemplate(assignments.preset, assignments.members.length)!.slots.find(slot => slot.id === assignments.slotsByEntityId[id])!;
}

describe("role-aware formation ownership", () => {
  it.each(presets)("assigns every size and duplicate role composition deterministically in %s", preset => {
    for (let size = 1; size <= 5; size++) {
      for (const composition of [roles.slice(0, size), ...roles.map(role => Array<PartyMemberRole>(size).fill(role))]) {
        const input = members(composition);
        const assigned = assignFormationSlots(input, input[0].id, preset)!;
        expect(new Set(Object.values(assigned.slotsByEntityId)).size).toBe(size);
        expect(assigned).toEqual(assignFormationSlots([...input].reverse(), input[0].id, preset));
        expect(assignFormationSlots(input, input[0].id, preset, assigned)).toBe(assigned);
      }
    }
  });

  it("places a Defender at the front and a Support leader at the rear without leadership preferences", () => {
    const input = members(["support", "defender", "fighter", "gatherer", "fighter"]);
    const assigned = assignFormationSlots(input, input[0].id)!;
    expect(slotFor(assigned, "member-0").depth).toBe("rear");
    expect(slotFor(assigned, "member-1").depth).toBe("front");
    for (const leader of input) expect(assignFormationSlots(input, leader.id)!.slotsByEntityId).toEqual(assigned.slotsByEntityId);
  });

  it("prefers inner Support/Gatherer slots and outer Defender/Fighter slots in a row", () => {
    const assigned = assignFormationSlots(members(), "member-0", "side-by-side")!;
    const side = (index: number) => Math.abs(slotFor(assigned, `member-${index}`).side);
    expect(side(0)).toBe(5);
    expect(side(1)).toBe(5);
    expect(side(2)).toBeLessThanOrEqual(2.5);
    expect(side(3)).toBeLessThanOrEqual(2.5);
  });

  it("uses party order and stable IDs to break fresh ties", () => {
    const input = members(["fighter", "fighter", "fighter"]);
    input[0].partyOrder = 2;
    input[2].partyOrder = 0;
    const assigned = assignFormationSlots(input, "member-0")!;
    expect(slotFor(assigned, "member-2").depth).toBe("front");
    const ties = input.map(member => ({ ...member, partyOrder: 0 }));
    expect(assignFormationSlots(ties, "member-0")).toEqual(assignFormationSlots([...ties].reverse(), "member-0"));
  });

  it("keeps valid prior ownership ahead of fresh ties but applies explicit order edits", () => {
    const input = members(["fighter", "fighter", "fighter"]);
    const initial = assignFormationSlots(input, "member-0")!;
    const prior = { ...initial, slotsByEntityId: { ...initial.slotsByEntityId,
      "member-1": initial.slotsByEntityId["member-2"], "member-2": initial.slotsByEntityId["member-1"] } };
    expect(assignFormationSlots(input, "member-0", "arrow", prior)).toBe(prior);
    const edited = input.map(member => ({ ...member, partyOrder: 2 - member.partyOrder }));
    const reassigned = assignFormationSlots(edited, "member-0", "arrow", prior)!;
    expect(slotFor(reassigned, "member-2").depth).toBe("front");
    expect(slotFor(reassigned, "member-1").lane).toBe("left");
    expect(slotFor(reassigned, "member-0").lane).toBe("right");
  });

  it("preserves unaffected role groups during an explicit order swap", () => {
    const input = members(["defender", "fighter", "fighter", "support", "gatherer"]);
    const prior = assignFormationSlots(input, "member-3")!;
    const edited = input.map(member => ({ ...member, partyOrder: member.partyOrder === 1 ? 2 : member.partyOrder === 2 ? 1 : member.partyOrder }));
    const next = assignFormationSlots(edited, "member-3", "arrow", prior)!;
    for (const id of ["member-0", "member-3", "member-4"]) expect(next.slotsByEntityId[id]).toBe(prior.slotsByEntityId[id]);
    expect(next.slotsByEntityId["member-1"]).toBe(prior.slotsByEntityId["member-2"]);
  });

  it("does not reorder unaffected Supports after role edits leave their slots out of party order", () => {
    const input = members(["defender", "fighter", "fighter", "support", "gatherer"]);
    const initial = assignFormationSlots(input, "member-0")!;
    const roleEdit: FormationMemberInput[] = input.map(member => ({ ...member,
      role: member.id === "member-0" ? "support" : member.id === "member-4" ? "defender" : member.role }));
    const prior = assignFormationSlots(roleEdit, "member-0", "arrow", initial)!;
    expect(slotFor(prior, "member-0").lane).toBe("right");
    expect(slotFor(prior, "member-3").lane).toBe("left");

    const orderEdit = roleEdit.map(member => ({ ...member,
      partyOrder: member.partyOrder === 1 ? 2 : member.partyOrder === 2 ? 1 : member.partyOrder }));
    const next = assignFormationSlots(orderEdit, "member-0", "arrow", prior)!;
    for (const id of ["member-0", "member-3", "member-4"]) expect(next.slotsByEntityId[id]).toBe(prior.slotsByEntityId[id]);
    expect(next.slotsByEntityId["member-1"]).toBe(prior.slotsByEntityId["member-2"]);
    expect(next.slotsByEntityId["member-2"]).toBe(prior.slotsByEntityId["member-1"]);
  });

  it("retains all slots when order values change without changing relative member order", () => {
    const input = members(["defender", "fighter", "fighter", "support", "gatherer"])
      .map(member => ({ ...member, partyOrder: member.partyOrder * 10 }));
    const initial = assignFormationSlots(input, "member-0")!;
    const roleEdit: FormationMemberInput[] = input.map(member => ({ ...member,
      role: member.id === "member-0" ? "support" : member.id === "member-4" ? "defender" : member.role }));
    const prior = assignFormationSlots(roleEdit, "member-0", "arrow", initial)!;
    const orderEdit = roleEdit.map(member => ({ ...member, partyOrder: member.id === "member-1" ? 11 : member.partyOrder }));
    expect(assignFormationSlots(orderEdit, "member-0", "arrow", prior)!.slotsByEntityId).toEqual(prior.slotsByEntityId);
  });

  it("deliberately reassigns changed roles and presets", () => {
    const input = members(["support", "defender"]);
    const prior = assignFormationSlots(input, "member-0")!;
    const edited = members(["defender", "support"]);
    const next = assignFormationSlots(edited, "member-0", "arrow", prior)!;
    expect(slotFor(next, "member-0").depth).toBe("front");
    const row = assignFormationSlots(edited, "member-0", "side-by-side", next)!;
    expect(Object.values(row.slotsByEntityId).every(id => id.startsWith("side-by-side:"))).toBe(true);
  });

  it("repairs duplicate, missing, foreign, and unsupported prior slot ownership", () => {
    const input = members();
    const prior = assignFormationSlots(input, "member-0")!;
    for (const broken of [
      { ...prior.slotsByEntityId, "member-1": prior.slotsByEntityId["member-0"] },
      { ...prior.slotsByEntityId, "member-2": "unsupported" },
      { ...prior.slotsByEntityId, foreign: "foreign" },
      Object.fromEntries(Object.entries(prior.slotsByEntityId).filter(([id]) => id !== "member-3")),
    ]) {
      const fixed = assignFormationSlots(input, "member-0", "arrow", { ...prior, slotsByEntityId: broken })!;
      expect(Object.keys(fixed.slotsByEntityId)).toHaveLength(5);
      expect(new Set(Object.values(fixed.slotsByEntityId)).size).toBe(5);
      expect(Object.values(fixed.slotsByEntityId).every(id => getFormationTemplate("arrow", 5)!.slots.some(slot => slot.id === id))).toBe(true);
    }
    expect(assignFormationSlots([], "missing")).toBeUndefined();
    expect(assignFormationSlots([...input, { id: "extra", role: "none", partyOrder: 6 }], "member-0")).toBeUndefined();
    expect(assignFormationSlots([input[0], input[0]], "member-0")).toBeUndefined();
  });

  it("changes only assignment metadata and derives departures without storing another task state", () => {
    const actor = createCompanion("actor", { x: 10, y: 10 }, "actor", "fighter");
    const source = createTestGameState({ entities: { actor }, partyLeaderId: actor.id });
    const next = reconcileFormationAssignments(source);
    expect(next).toEqual({ ...source, formationAssignments: next.formationAssignments });
    expect(next.entities).toBe(source.entities);
    expect(reconcileFormationAssignments(next)).toBe(next);
    expect(getFormationMemberDepartures(next, actor.id)).toEqual([]);
    expect(getFormationMemberDepartures(next, "missing")).toEqual(["missing"]);
    expect(getFormationMemberDepartures({ ...next, entities: { actor: { ...actor, health: 0 } } }, actor.id)).toEqual(["dead"]);
    expect(getFormationMemberDepartures({ ...next, entities: { actor: { ...actor, state: "gather" } } }, actor.id)).toEqual(["gathering"]);
    expect(getFormationMemberDepartures({ ...next, entities: { actor: { ...actor, state: "attack" } } }, actor.id)).toEqual(["combat"]);
    expect(getFormationWorldPositions({ ...next, partyLeaderId: "missing" }, { x: 1, y: 0 })).toEqual({});
    expect(reconcileFormationAssignments({ ...next, entities: {} }).formationAssignments).toBeUndefined();
  });
});
