import { describe, expect, it } from "vitest";

import { NPC_ICON_SRC } from "./assetIcons";
import { guidePopupDefinitions } from "./guidePopupDefinitions";

describe("guide popup definitions", () => {
  it("combines the first menu tour into the welcome guide", () => {
    const welcome = guidePopupDefinitions.welcome;

    expect(welcome.panels).toHaveLength(9);
    expect(welcome.panels[2]).toMatchObject({
      title: "Get the First Quest",
      bodyIcon: {
        src: NPC_ICON_SRC.quest_giver,
        alt: "Available quest marker",
      },
    });
    expect(welcome.panels[3].menuTarget).toEqual({
      tab: "party",
      partySection: "stats",
    });
    expect(welcome.panels[4].menuTarget).toEqual({
      tab: "partyManagement",
      partyManagementSection: "role",
    });
    expect(welcome.panels[5].menuTarget).toEqual({ tab: "inventory" });
    expect(welcome.panels[6].menuTarget).toEqual({
      tab: "atlas",
      atlasSubpage: "quests",
    });
    expect(welcome.panels[7].menuTarget).toEqual({ tab: "world" });
    expect(welcome.panels[8].menuTarget).toEqual({ tab: "options" });
  });

  it("keeps the equipment setup guide focused on the First Aid book", () => {
    expect(guidePopupDefinitions.equipment_setup.panels).toEqual([
      {
        title: "First Aid Book",
        body: "Buy a First Aid skill book from the Merchant, then open Inventory and read it with an eligible companion.",
      },
    ]);
  });

  it("defines the first party-size growth guide", () => {
    expect(guidePopupDefinitions.first_party_size_growth).toEqual({
      id: "first_party_size_growth",
      ariaLabel: "Party size growth guide",
      panels: [
        {
          title: "Active Party Expanded",
          body: "Your active party can now hold 3 companions. Visit the Guild & Inn to recruit someone for the new slot.",
        },
      ],
    });
  });
});
