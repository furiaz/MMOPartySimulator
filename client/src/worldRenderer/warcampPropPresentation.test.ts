import { describe, expect, it } from "vitest";
import { getStructurePropVisualId, getWarmasterCageVisual } from "./warcampPropPresentation";
import { BARRACK_DEFINITIONS } from "../game/barrackDefinitions";
import { createEnemy } from "../game/entities";
import { isLivingHostileTarget } from "../game/combatStructures";
import { isWorldSpeechSpeaker } from "../npcSpeechPresentation";
describe("Warcamp prop presentation", () => {
  it("swaps the cage state without moving or resizing its three-unit canvas", () => {
    const closed = getWarmasterCageVisual(false), open = getWarmasterCageVisual(true);
    expect(closed).toMatchObject({ visualId: "orc_warcamp_cage_closed", widthCells: 3, heightCells: 3, position: { x: 88, y: 45 } });
    expect(open).toEqual({ ...closed, visualId: "orc_warcamp_cage_open" });
  });
  it("selects ruins only for destroyed Barracks and preserves unrelated props", () => {
    expect(getStructurePropVisualId("orc_warcamp_barracks", false)).toBe("orc_warcamp_barracks");
    expect(getStructurePropVisualId("orc_warcamp_barracks", true)).toBe("orc_warcamp_barracks_ruined");
    expect(getStructurePropVisualId("orc_warcamp_orc_supply_pile", true)).toBe("orc_warcamp_orc_supply_pile");
  });
  it("allows destroyed-structure speech without making ruins hostile targets", async () => {
    const { createBarrackEntity } = await import("../game/barrackDefinitions");
    const ruin = createBarrackEntity(BARRACK_DEFINITIONS[0], 0);
    expect(isWorldSpeechSpeaker(ruin)).toBe(true);
    expect(isLivingHostileTarget(ruin)).toBe(false);
    expect(isWorldSpeechSpeaker({ ...createEnemy("dead", { x: 0, y: 0 }), health: 0, state: "dead" })).toBe(false);
  });
});
