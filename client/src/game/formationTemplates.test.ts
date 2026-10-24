import { describe, expect, it } from "vitest";
import { createCompanion } from "./entities";
import { assignFormationSlots } from "./formationAssignments";
import { DEFAULT_FORMATION_SPACING, getFormationTemplate, transformFormationSlots } from "./formationTemplates";
import { doCollisionBodiesOverlap } from "./spatialGeometry";
import type { FormationPresetId, PartyMemberRole, Position } from "./types";

const presets: FormationPresetId[] = ["arrow", "balanced", "side-by-side"];
const roles: PartyMemberRole[] = ["defender", "fighter", "support", "gatherer", "none"];
const layouts = {
  arrow: [[1], [1, 1], [1, 2], [1, 2, 1], [1, 2, 2]],
  balanced: [[1], [2], [2, 1], [2, 2], [2, 1, 2]],
  "side-by-side": [[1], [2], [3], [4], [5]],
};

describe("continuous formation templates", () => {
  it.each(presets)("defines centered continuous %s layouts for all supported sizes", preset => {
    for (let count = 1; count <= 5; count++) {
      const template = getFormationTemplate(preset, count)!;
      const rows = layouts[preset][count - 1];
      expect(template.slots).toHaveLength(count);
      expect(new Set(template.slots.map(slot => slot.id)).size).toBe(count);
      rows.forEach((columns, row) => {
        const slots = template.slots.filter(slot => slot.forward === -row * DEFAULT_FORMATION_SPACING);
        expect(slots).toHaveLength(columns);
        expect(slots.reduce((sum, slot) => sum + slot.side, 0)).toBe(0);
        expect(slots.map(slot => slot.lane)).toEqual(slots.map(slot => slot.side < 0 ? "left" : slot.side > 0 ? "right" : "center"));
        expect(slots[0].depth).toBe(rows.length === 1 ? "neutral" : row === 0 ? "front" : row === rows.length - 1 ? "rear" : "middle");
      });
    }
  });

  it("accepts fractional spacing without navigation or sprite dependencies", () => {
    const template = getFormationTemplate("arrow", 3, 1.3)!;
    expect(template.slots.map(({ side, forward }) => ({ side, forward }))).toEqual([
      { side: 0, forward: 0 }, { side: -0.65, forward: -1.3 }, { side: 0.65, forward: -1.3 },
    ]);
    for (const count of [0, -1, 1.5, 6, NaN]) expect(getFormationTemplate("arrow", count)).toBeUndefined();
    for (const spacing of [0, -1, NaN, Infinity]) expect(getFormationTemplate("arrow", 3, spacing)).toBeUndefined();
  });

  it.each(presets)("anchors %s to every assigned leader at arbitrary facings", preset => {
    const members = roles.map((role, partyOrder) => createCompanion(`member-${partyOrder}`, { x: 0, y: 0 }, "member-0", role, partyOrder));
    for (const leader of members) {
      const assignments = assignFormationSlots(members, leader.id, preset)!;
      const template = getFormationTemplate(preset, members.length)!;
      const anchor = template.slots.find(slot => slot.id === assignments.slotsByEntityId[leader.id])!;
      for (const facing of [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: -2.7, y: 4.1 }, { x: 0, y: 0 }]) {
        const origin = { x: 10.35, y: 12.15 };
        const world = transformFormationSlots(assignments, leader, facing, origin);
        const length = Math.hypot(facing.x, facing.y);
        const forward = length ? { x: facing.x / length, y: facing.y / length } : { x: 0, y: -1 };
        expect(world[leader.id]).toEqual(origin);
        for (const member of members) {
          const slot = template.slots.find(candidate => candidate.id === assignments.slotsByEntityId[member.id])!;
          expect(world[member.id].x).toBeCloseTo(origin.x + forward.x * (slot.forward - anchor.forward) - forward.y * (slot.side - anchor.side));
          expect(world[member.id].y).toBeCloseTo(origin.y + forward.y * (slot.forward - anchor.forward) + forward.x * (slot.side - anchor.side));
        }
      }
    }
  });

  it.each(presets)("keeps complete companion bodies clear in every baseline %s layout and facing", preset => {
    for (let count = 1; count <= 5; count++) {
      const members = Array.from({ length: count }, (_, i) => createCompanion(`member-${i}`, { x: 0, y: 0 }, "member-0", roles[i], i));
      const assignments = assignFormationSlots(members, members[0].id, preset)!;
      for (let angle = 0; angle < 360; angle += 5) {
        const facing = { x: Math.cos(angle * Math.PI / 180), y: Math.sin(angle * Math.PI / 180) };
        const positions = transformFormationSlots(assignments, members[0], facing);
        for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
          expect(doCollisionBodiesOverlap(members[a], positions[members[a].id], members[b], positions[members[b].id])).toBe(false);
        }
      }
    }
  });

  it("uses the designated living leader only and permits ideal positions outside the map", () => {
    const leader = createCompanion("leader", { x: 0.1, y: 0.2 }, "leader", "support");
    const other = createCompanion("other", { x: 20, y: 20 }, "leader", "defender");
    const assignments = assignFormationSlots([leader, other], leader.id)!;
    expect(transformFormationSlots(assignments, undefined, { x: 0, y: -1 })).toEqual({});
    expect(transformFormationSlots(assignments, other, { x: 0, y: -1 })).toEqual({});
    expect(transformFormationSlots(assignments, { ...leader, state: "dead" }, { x: 0, y: -1 })).toEqual({});
    expect(transformFormationSlots(assignments, { ...leader, health: 0 }, { x: 0, y: -1 })).toEqual({});
    expect(transformFormationSlots(assignments, leader, { x: 0, y: -1 })[other.id].y).toBeLessThan(0);
    expect(transformFormationSlots(assignments, leader, { x: 1, y: 0 }, { x: NaN, y: 0 })).toEqual({});
  });

  it("defaults zero facing to north and defines right consistently", () => {
    const leader = createCompanion("leader", { x: 3.1, y: 4.2 }, "leader", "none", 0);
    const right = createCompanion("right", { x: 20, y: 20 }, "leader", "none", 1);
    const assignments = assignFormationSlots([leader, right], leader.id, "side-by-side")!;
    const expected: Position = { x: 5.6, y: 4.2 };
    expect(transformFormationSlots(assignments, leader, { x: 0, y: 0 }).right).toEqual(expected);
  });
});
