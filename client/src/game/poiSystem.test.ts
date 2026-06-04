import { describe, expect, it } from "vitest";
import { HUB_MAP_ID, npcIds } from "./debugMap";
import { createCompanion, createNpc } from "./entities";
import { addItemToInventoryState } from "./inventory";
import { updatePoiSystem } from "./poiSystem";
import { createInitialQuestStates } from "./questSystem";
import { createTestGameState } from "./testState";
import type { GameMap } from "./types";

function createMap(): GameMap {
  return {
    id: HUB_MAP_ID,
    displayName: "Hub Interaction Test Map",
    debugName: "hub-interaction-test-map",
    columns: 8,
    rows: 8,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

describe("POI system interaction movement", () => {
  it("uses an approach position for auto merchant interaction intent", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc(npcIds[1], { x: 5, y: 5 }, "Merchant", "merchant");
    const questGiver = createNpc(npcIds[0], { x: 6, y: 5 }, "Quest Giver", "quest_giver");
    const quests = createInitialQuestStates();
    quests.outfit_the_expedition = {
      ...quests.outfit_the_expedition,
      status: "completed",
    };
    let state = createTestGameState({
      autoModeEnabled: true,
      currentMapId: HUB_MAP_ID,
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
        [questGiver.id]: questGiver,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      quests,
    });
    state = addItemToInventoryState(state, "wolf_pelt", 1, "debug").state;

    const nextState = updatePoiSystem(state);

    expect(nextState.localPoiTarget).toMatchObject({
      poiId: merchant.id,
      interactionRange: 1.5,
    });
    expect(nextState.partyIntent?.executionIntent?.targetPosition).toEqual({
      x: 4,
      y: 5,
    });
    expect(nextState.partyIntent?.executionIntent?.targetPosition).not.toEqual(
      merchant.position,
    );
  });
});
