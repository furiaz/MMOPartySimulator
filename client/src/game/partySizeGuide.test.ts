import { describe, expect, it } from "vitest";

import { HUB_MAP_ID, HUB_TWO_MAP_ID } from "./debugMap";
import { createCompanion } from "./entities";
import {
  markPartySizeGrowthGuideViewed,
  shouldQueuePartySizeGrowthGuide,
} from "./partySizeGuide";
import { createTestGameState } from "./testState";

describe("party size growth guide", () => {
  it("queues only after the third party slot is unlocked in Hub 2", () => {
    expect(
      shouldQueuePartySizeGrowthGuide(
        createTestGameState({
          currentMapId: HUB_TWO_MAP_ID,
          highestCharacterLevelEver: 9,
        }),
      ),
    ).toBe(false);
    expect(
      shouldQueuePartySizeGrowthGuide(
        createTestGameState({
          currentMapId: HUB_MAP_ID,
          highestCharacterLevelEver: 10,
        }),
      ),
    ).toBe(false);
    expect(
      shouldQueuePartySizeGrowthGuide(
        createTestGameState({
          currentMapId: HUB_TWO_MAP_ID,
          highestCharacterLevelEver: 10,
        }),
      ),
    ).toBe(true);
  });

  it("uses the highest companion level ever instead of combined party level", () => {
    const firstCompanion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      characterLevel: 5,
    };
    const secondCompanion = {
      ...createCompanion("companion-2", { x: 1, y: 0 }, "companion-2"),
      characterLevel: 5,
    };

    expect(
      shouldQueuePartySizeGrowthGuide(
        createTestGameState({
          currentMapId: HUB_TWO_MAP_ID,
          highestCharacterLevelEver: 5,
          entities: {
            [firstCompanion.id]: firstCompanion,
            [secondCompanion.id]: secondCompanion,
          },
        }),
      ),
    ).toBe(false);
    expect(
      shouldQueuePartySizeGrowthGuide(
        createTestGameState({
          currentMapId: HUB_TWO_MAP_ID,
          highestCharacterLevelEver: 10,
          entities: {
            [firstCompanion.id]: firstCompanion,
          },
        }),
      ),
    ).toBe(true);
  });

  it("stops queueing after the guide is viewed and marks state idempotently", () => {
    const eligibleState = createTestGameState({
      currentMapId: HUB_TWO_MAP_ID,
      highestCharacterLevelEver: 10,
    });
    const viewedState = markPartySizeGrowthGuideViewed(eligibleState);

    expect(viewedState.partySizeGrowthGuideViewed).toBe(true);
    expect(shouldQueuePartySizeGrowthGuide(viewedState)).toBe(false);
    expect(markPartySizeGrowthGuideViewed(viewedState)).toBe(viewedState);
  });
});
