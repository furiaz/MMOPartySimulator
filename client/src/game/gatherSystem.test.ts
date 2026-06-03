import { describe, expect, it } from "vitest";
import { createCompanion, createResource } from "./entities";
import { updateGatherSystem } from "./gatherSystem";
import { RESOURCE_INTERACTION_RANGE } from "./resourceInteraction";
import { createTestGameState } from "./testState";

describe("gather system interaction range", () => {
  it("lets a collector gather at the resource interaction edge without moving closer", () => {
    const resource = createResource("resource", { x: 5, y: 5 });
    const collector = {
      ...createCompanion(
        "collector",
        { x: 5 - RESOURCE_INTERACTION_RANGE, y: 5 },
        "collector",
      ),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
      lastGatherAt: 0,
    };
    const state = createTestGameState({
      entities: {
        [collector.id]: collector,
        [resource.id]: resource,
      },
      partyLeaderId: collector.id,
    });

    const nextState = updateGatherSystem(state, new Set(), 1_000);

    expect(nextState.entities[collector.id].position).toEqual(
      collector.position,
    );
    expect(nextState.entities[resource.id]).toMatchObject({
      durability: resource.durability - collector.gatherSpeed,
    });
  });

  it("moves a collector toward the resource when outside interaction range", () => {
    const resource = createResource("resource", { x: 5, y: 5 });
    const collector = {
      ...createCompanion(
        "collector",
        { x: 5 - RESOURCE_INTERACTION_RANGE - 0.1, y: 5 },
        "collector",
      ),
      state: "gather" as const,
      currentTargetId: resource.id,
      commandPriority: "direct" as const,
      lastGatherAt: 0,
    };
    const state = createTestGameState({
      entities: {
        [collector.id]: collector,
        [resource.id]: resource,
      },
      partyLeaderId: collector.id,
      simulationDeltaMs: 100,
    });

    const nextState = updateGatherSystem(state, new Set(), 1_000);

    expect(nextState.entities[collector.id].position.x).toBeGreaterThan(
      collector.position.x,
    );
    expect(nextState.entities[resource.id]).toMatchObject({
      durability: resource.durability,
    });
  });
});
