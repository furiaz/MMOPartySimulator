import { describe, expect, it } from "vitest";
import {
  defaultNpcInteractionRange,
  getNpcInteractionRange,
  merchantInteractionRange,
  questGiverInteractionRange,
} from "./npcInteractionRange";

describe("NPC interaction ranges", () => {
  it("uses wider interaction ranges for merchant and quest source NPCs", () => {
    expect(getNpcInteractionRange({ npcRole: "merchant" })).toBe(
      merchantInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "quest_giver" })).toBe(
      questGiverInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "class_mentor" })).toBe(
      questGiverInteractionRange,
    );
    expect(merchantInteractionRange).toBe(2);
    expect(questGiverInteractionRange).toBe(2);
  });

  it("keeps other static NPC roles on the default range", () => {
    expect(getNpcInteractionRange({ npcRole: "smith" })).toBe(
      defaultNpcInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "dog" })).toBe(
      defaultNpcInteractionRange,
    );
    expect(getNpcInteractionRange({ npcRole: "test_blade" })).toBe(
      defaultNpcInteractionRange,
    );
    expect(defaultNpcInteractionRange).toBe(1.5);
  });
});
