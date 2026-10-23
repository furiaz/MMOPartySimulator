import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanionSkillPreferences } from "./CompanionSkillPreferences";
import { createCompanion } from "./game/entities";
import { normalizeCompanionSkillBehavior } from "./game/skillBehavior";
import { setCompanionLegacySkillEnabled } from "./game/skillProgression";
import { addEntity } from "./game/state";
import { createTestGameState } from "./game/testState";
import type { Companion } from "./game/types";

function markup(member: Companion) {
  return renderToStaticMarkup(<CompanionSkillPreferences member={member} onChangeSkillBehavior={() => {}} onSetLegacySkillEnabled={() => {}} />);
}
describe("individual skill preference presentation", () => {
  it("hides disabled legacy settings but keeps activation controls and current-class preferences", () => {
    const member = createCompanion("light", { x: 1, y: 1 }, "light", "support", 1, "lightbearer");
    member.skillProgression = { ...member.skillProgression, ranksBySkillId: { ...member.skillProgression?.ranksBySkillId, first_aid: 5 }, legacyEnabledSkillIds: [] };
    const html = markup(member);
    expect(html).not.toContain('aria-label="First Aid Preferences"');
    expect(html).toContain('aria-label="Legacy skill toggles"');
    expect(html).toContain("First Aid");
    expect(html).toContain(">Enable</button>");
    expect(html).toContain('aria-label="Light Mend Preferences"');
  });
  it("reveals legacy preferences when enabled and preserves them across disabling and re-enabling", () => {
    const member = createCompanion("light", { x: 1, y: 1 }, "light", "support", 1, "lightbearer");
    member.skillProgression = { ...member.skillProgression, ranksBySkillId: { ...member.skillProgression?.ranksBySkillId, first_aid: 5 }, legacyEnabledSkillIds: [] };
    member.skillBehavior = normalizeCompanionSkillBehavior(member);
    member.skillBehavior.preferencesBySkillId!.first_aid!.selfHealHpThresholdPercent = 45;
    let state = addEntity(createTestGameState({ partyLeaderId: member.id }), member);
    state = setCompanionLegacySkillEnabled(state, member.id, "first_aid", true);
    let current = state.entities[member.id] as Companion;
    expect(markup(current)).toContain('aria-label="First Aid Preferences"');
    expect(markup(current)).toContain('value="45"');
    state = setCompanionLegacySkillEnabled(state, member.id, "first_aid", false);
    current = state.entities[member.id] as Companion;
    expect(markup(current)).not.toContain('aria-label="First Aid Preferences"');
    expect(current.skillBehavior).toEqual(member.skillBehavior);
    state = setCompanionLegacySkillEnabled(state, member.id, "first_aid", true);
    current = state.entities[member.id] as Companion;
    expect(markup(current)).toContain('aria-label="First Aid Preferences"');
    expect(current.skillBehavior).toEqual(member.skillBehavior);
  });
  it("does not hide current Beginner preferences or expose ineligible disabled legacy settings", () => {
    const beginner = createCompanion("beginner", { x: 1, y: 1 }, "beginner");
    expect(markup(beginner)).toContain('aria-label="First Aid Preferences"');
    const advanced = { ...beginner, classId: "lightbearer" as const };
    expect(markup(advanced)).not.toContain('aria-label="First Aid Preferences"');
  });
  it("names every supported skill and exposes accessible geometry descriptions", () => {
    const member = createCompanion("light", { x: 1, y: 1 }, "light", "support", 1, "lightbearer");
    const html = markup(member);
    expect(html).toContain('aria-label="Circle of Renewal Preferences"');
    expect(html).toContain('aria-label="Dawn Step Preferences"');
    expect(html).toContain('aria-label="Light Mend Preferences"');
    expect(html).toContain("70% of the normal circle");
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("aria-describedby=");
    expect(html).not.toContain("Mobility Skill Use");
    expect(html).not.toContain("Support Skill Focus");
    expect(html).toContain("High HP");
  });
  it("hides offensive priority in defensive mode without hiding other skills' settings", () => {
    const member = createCompanion("light", { x: 1, y: 1 }, "light", "support", 1, "lightbearer");
    member.skillBehavior = normalizeCompanionSkillBehavior(member);
    member.skillBehavior.preferencesBySkillId!.dawn_step!.mobilityMode = "defensive";
    const html = markup(member);
    expect(html).not.toContain('aria-label="Dawn Step Target Priority"');
    expect(html).toContain('aria-label="Dawn Step Defensive HP Threshold"');
    expect(html).toContain('aria-label="Circle of Renewal Target Priority"');
  });
  it("offers no shape or priority for Shield Challenge", () => {
    const member = createCompanion("aegis", { x: 1, y: 1 }, "aegis", "defender", 1, "aegis");
    const html = markup(member);
    expect(html).toContain('aria-label="Shield Shockwave Preferences"');
    expect(html).not.toContain('aria-label="Shield Challenge Preferences"');
    expect(html).not.toContain('aria-label="Shield Shockwave Target Priority"');
  });
});
