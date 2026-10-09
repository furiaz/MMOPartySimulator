import { describe, expect, it } from "vitest";
import { createNpc } from "./game/entities";
import { createTestGameState } from "./game/testState";
import {
  bankInteractionRange,
  defaultNpcInteractionRange,
  farmInteractionRange,
  getNpcInteractionRange,
  guildTavernInteractionRange,
  merchantInteractionRange,
  questGiverInteractionRange,
  isNpcInteractionAvailable,
} from "./npcInteractionRange";

describe("NPC interaction ranges", () => {
  it("retains local approach ranges without using them for hub-wide access", () => {
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

  it("makes functional NPCs available across their current town hub", () => {
    const smith = createNpc("smith", { x: 100, y: 50 }, "Smith", "smith");
    const state = createTestGameState({
      currentMapId: "hub",
      entities: { [smith.id]: smith },
    });

    expect(isNpcInteractionAvailable(state, { x: 0, y: 0 }, smith)).toBe(true);
    expect(
      isNpcInteractionAvailable(
        { ...state, currentMapId: "slimeward-camp" },
        { x: 100, y: 50 },
        smith,
      ),
    ).toBe(false);
    expect(
      isNpcInteractionAvailable(
        { ...state, entities: {} },
        { x: 100, y: 50 },
        smith,
      ),
    ).toBe(false);
  });

  it("keeps decorative NPCs on their numeric interaction range", () => {
    const dog = createNpc("dog", { x: 10, y: 10 }, "Dog", "dog");
    const state = createTestGameState({
      currentMapId: "hub",
      entities: { [dog.id]: dog },
    });

    expect(isNpcInteractionAvailable(state, { x: 0, y: 0 }, dog)).toBe(false);
    expect(isNpcInteractionAvailable(state, { x: 8, y: 10 }, dog)).toBe(true);
  });
});
