import { describe, expect, it } from "vitest";
import { createCompanion, createNpc, createResource } from "./entities";
import { resolveInteractionStandPosition } from "./interactionApproach";
import { createTestGameState } from "./testState";
import type { GameMap } from "./types";

function createMap(): GameMap {
  return {
    displayName: "Interaction Test Map",
    debugName: "interaction-test-map",
    columns: 8,
    rows: 8,
    walls: [],
    teleports: [],
    healingFountains: [],
  };
}

describe("interaction approach", () => {
  it("resolves a reachable stand position near an occupied resource", () => {
    const collector = createCompanion("collector", { x: 1, y: 5 }, "collector", "fighter");
    const resource = createResource("resource", { x: 5, y: 5 });
    const state = createTestGameState({
      entities: {
        [collector.id]: collector,
        [resource.id]: resource,
      },
      map: createMap(),
      partyLeaderId: collector.id,
    });

    const standPosition = resolveInteractionStandPosition(
      state,
      collector,
      resource.position,
      2,
    );

    expect(standPosition).toEqual({ x: 4, y: 5 });
  });

  it("does not choose occupied or reserved stand positions", () => {
    const leader = createCompanion("leader", { x: 1, y: 5 }, "leader", "fighter");
    const merchant = createNpc("merchant", { x: 5, y: 5 }, "Merchant", "merchant");
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [merchant.id]: merchant,
      },
      map: createMap(),
      partyLeaderId: leader.id,
      reservedPositionsByEntityId: {
        other: { x: 4, y: 5 },
      },
    });

    const standPosition = resolveInteractionStandPosition(
      state,
      leader,
      merchant.position,
      2,
    );

    expect(standPosition).not.toEqual(merchant.position);
    expect(standPosition).not.toEqual({ x: 4, y: 5 });
    expect(standPosition).toEqual({ x: 5, y: 4 });
  });
});
