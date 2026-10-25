import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { assignFormationSlots } from "./formationAssignments";
import { getFormationTemplate, transformFormationSlots } from "./formationTemplates";
import { compareFormationTargetScores, getAssignedFormationSlot, getFormationTargetScore } from "./formationTargeting";
import { createTestGameState } from "./testState";
import type { Companion, FormationPresetId } from "./types";

describe("formation target geometry", () => {
  it.each(["arrow", "balanced", "side-by-side"] as FormationPresetId[])("uses %s assigned lanes for every size and leader slot", preset => {
    for (let size = 1; size <= 5; size++) for (let leaderIndex = 0; leaderIndex < size; leaderIndex++) {
      const leaderId = `m${leaderIndex}`;
      const members = Array.from({ length: size }, (_, i) => createCompanion(`m${i}`, { x: 30.25, y: 30.5 }, leaderId, "none", i));
      const assignments = assignFormationSlots(members, leaderId, preset)!;
      for (const facing of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: -3, y: 4 }]) {
        const state = createTestGameState({ partyLeaderId: leaderId, formationAssignments: { ...assignments,
          travel: { leaderId, facing, lateralScale: 0.75, trail: [], trailOrder: [], lastLeaderPosition: members[leaderIndex].position,
            trailing: false, cohesion: "normal", goalsByEntityId: {} } },
        entities: Object.fromEntries(members.map(member => [member.id, member])) });
        const points = transformFormationSlots(assignments, members[leaderIndex], facing, members[leaderIndex].position, 0.75);
        const original = JSON.stringify(state);
        for (const actor of members) {
          const target = createEnemy("enemy", points[actor.id], "passive");
          const slot = getFormationTemplate(preset, size)!.slots.find(slot => slot.id === assignments.slotsByEntityId[actor.id])!;
          expect(getFormationTargetScore(state, actor, target, 0, false)).toMatchObject({ lane: slot.lane, assignedLane: slot.lane });
          // A temporary departure must not change the member's assigned lane.
          expect(getFormationTargetScore(state, { ...actor, position: { x: 80, y: 80 } }, target, 0, false)?.assignedLane).toBe(slot.lane);
        }
        expect(JSON.stringify(state)).toBe(original);
      }
    }
  });

  it("includes the exact center-band boundary and scales it with effective width", () => {
    const actor = createCompanion("leader", { x: 30, y: 30 }, "leader", "fighter");
    const state = createTestGameState({ partyLeaderId: actor.id, entities: { leader: actor }, formationAssignments: assignFormationSlots([actor], actor.id) });
    const target = createEnemy("enemy", { x: 30.625, y: 27 }, "passive");
    expect(getFormationTargetScore(state, actor, target, 0, false)?.lane).toBe("center");
    expect(getFormationTargetScore(state, actor, { ...target, position: { x: 30.627, y: 27 } }, 0, false)?.lane).toBe("right");
    state.formationAssignments!.combat = { leaderId: actor.id, mode: "combat", facing: { x: 0, y: 0 }, spacing: 3,
      lateralScale: 1.2, goalsByEntityId: {} };
    expect(getFormationTargetScore(state, actor, { ...target, position: { x: 30.75, y: 27 } }, 0, false)?.lane).toBe("center");
  });

  it("disables lane geometry for missing/dead leaders and unsupported ownership", () => {
    const actor = createCompanion("leader", { x: 10, y: 10 }, "leader", "fighter");
    const state = createTestGameState({ partyLeaderId: actor.id, entities: { leader: actor }, formationAssignments: assignFormationSlots([actor], actor.id) });
    const target = createEnemy("enemy", { x: 12, y: 10 }, "passive");
    state.entities.leader = { ...actor, health: 0, state: "dead" };
    expect(getFormationTargetScore(state, actor, target, 0, false)).toBeUndefined();
    state.entities = { other: { ...actor, id: "other" } };
    expect(getAssignedFormationSlot(state, actor.id)).toBeUndefined();
    state.entities.leader = actor;
    state.formationAssignments!.slotsByEntityId.leader = "invalid";
    expect(getFormationTargetScore(state, actor, target, 0, false)).toBeUndefined();
  });

  it("uses body-aware approach, soft claims, and reachable-before-unknown ranking", () => {
    const actor: Companion = createCompanion("leader", { x: 10, y: 10 }, "leader", "fighter");
    const state = createTestGameState({ partyLeaderId: actor.id, entities: { leader: actor }, formationAssignments: assignFormationSlots([actor], actor.id) });
    const target = createEnemy("enemy", { x: 10, y: 7 }, "passive");
    const score = getFormationTargetScore(state, actor, target, 0, false)!;
    const claimed = getFormationTargetScore(state, actor, target, 3, false)!;
    expect(claimed.score - score.score).toBeCloseTo(1.5);
    expect(score.approachDistance).toBeLessThan(3);
    expect(compareFormationTargetScores({ ...score, score: 100, reachable: true }, score)).toBeLessThan(0);
    expect(getFormationTargetScore(state, actor, { ...target, position: actor.position }, 0, true)?.approachDistance).toBe(0);
  });
});
