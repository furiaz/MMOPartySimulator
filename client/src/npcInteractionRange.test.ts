import { describe, expect, it } from "vitest";
import {
  bankInteractionRange,
  defaultNpcInteractionRange,
  farmInteractionRange,
  getNpcInteractionRange,
  guildTavernInteractionRange,
  merchantInteractionRange,
  questGiverInteractionRange,
} from "./npcInteractionRange";

describe("NPC interaction ranges", () => {
  it("uses wider interaction ranges for hub service and quest source NPCs", () => {
    expect(getNpcInteractionRange({ npcRole: "merchant" })).toBe(
      merchantInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "smith" })).toBe(
      merchantInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "bank_chest" })).toBe(
      bankInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "quest_giver" })).toBe(
      questGiverInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "class_mentor" })).toBe(
      questGiverInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "guild_coordinator" })).toBe(
      guildTavernInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "tavern_keeper" })).toBe(
      guildTavernInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "farmer" })).toBe(
      farmInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "livestock_keeper" })).toBe(
      farmInteractionRange,
    );
    expect(merchantInteractionRange).toBe(4);
    expect(bankInteractionRange).toBe(4);
    expect(questGiverInteractionRange).toBe(4);
    expect(guildTavernInteractionRange).toBe(8);
    expect(farmInteractionRange).toBe(8);
  });

  it("keeps other static NPC roles on the default range", () => {
    expect(getNpcInteractionRange({ npcRole: "dog" })).toBe(
      defaultNpcInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "test_blade" })).toBe(
      defaultNpcInteractionRange,
    );
    expect(defaultNpcInteractionRange).toBe(3);
  });
});
