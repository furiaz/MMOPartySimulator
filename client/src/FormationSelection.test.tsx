import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartyManagementPanel } from "./CompanionPanels";
import { getFormationSelectionOptions } from "./game/formationSelection";
import { createCompanion } from "./game/entities";
import type { FormationPresetId } from "./game/types";

function markup(count: number, selected: FormationPresetId = "arrow", dead = false) {
  const members = Array.from({ length: count }, (_, i) => ({ ...createCompanion(`m${i}`, { x: 0, y: 0 }, "m0"),
    ...(dead ? { health: 0, state: "dead" as const } : {}) }));
  return renderToStaticMarkup(<PartyManagementPanel activeSection="formation" currentTime={0} leaderId="m0" members={members}
    selectedCompanionId={null} highestCharacterLevelEver={60} selectedFormationPreset={selected} formationOptions={getFormationSelectionOptions(count)}
    onSelectFormationPreset={() => {}} onChangeLeader={() => {}} onChangeConsumableBehavior={() => {}} onChangeRole={() => {}}
    onSelectCompanion={() => {}} onSelectSection={() => {}} onMovePartyOrder={() => {}} />);
}

describe("party-wide formation selection presentation", () => {
  it.each(["arrow", "balanced", "side-by-side"] as const)("shows selected %s without requiring a selected companion", selected => {
    const html = markup(5, selected);
    expect(html).toContain('aria-label="Formation selection"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(`${selected === "side-by-side" ? "Side-by-side" : selected === "balanced" ? "Balanced" : "Arrow"}</strong>`);
    expect(html).not.toContain("No companion selected");
    expect(html).not.toContain("Apply");
    expect(html).not.toContain("placeholder");
  });

  it("uses adapted previews including death holes and retains empty/unsupported selection", () => {
    for (let count = 1; count <= 5; count++) expect(markup(count, "arrow", true).match(/class="formation-preview-dot"/g)).toHaveLength(count * 3);
    for (const count of [0, 6]) {
      const html = markup(count, "balanced");
      expect(html.match(/Preview unavailable for this party size/g)).toHaveLength(3);
      expect(html).toContain('aria-pressed="true"');
      expect(html.split('aria-label="Formation selection"')[1]).not.toContain("disabled");
    }
  });
});
