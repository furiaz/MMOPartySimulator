import { describe, expect, it } from "vitest";
import { createEnemy } from "./entities";
import { createEmptyPartyInventory } from "./inventory";
import {
  DROP_VISUAL_DURATION_MS,
  handleEnemyDefeatedDrops,
  updateDropSystem,
} from "./dropSystem";
import { createDebugMap, MAP_ONE_ID, MAP_TWO_ID } from "./debugMap";
import { createTestGameState } from "./testState";
import type { DropVisualEvent } from "./types";

describe("enemy drop system", () => {
  it("queues drop visuals before adding drops to inventory", () => {
    const now = 1000;
    const enemy = {
      ...createEnemy("wolf", { x: 5, y: 5 }, "aggressive", {
        enemyType: "wolf",
      }),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [enemy.id]: enemy },
    });
    const randomValues = [0.1, 0, 0.99];

    const withDrops = handleEnemyDefeatedDrops(
      state,
      enemy,
      "leader",
      now,
      () => randomValues.shift() ?? 0,
    );

    expect(withDrops.dropVisualEvents).toHaveLength(1);
    expect(withDrops.inventory.slots).toEqual([]);

    const beforeExpiry = updateDropSystem(withDrops, now + DROP_VISUAL_DURATION_MS - 1);

    expect(beforeExpiry.dropVisualEvents).toHaveLength(1);
    expect(beforeExpiry.inventory.slots).toEqual([]);

    const afterExpiry = updateDropSystem(withDrops, now + DROP_VISUAL_DURATION_MS);

    expect(afterExpiry.dropVisualEvents).toEqual([]);
    expect(afterExpiry.inventory.slots).toEqual([
      { itemId: "wolf_pelt", quantity: 1 },
    ]);
  });

  it("reports inventory overflow without adding unavailable drops", () => {
    const now = 1000;
    const state = createTestGameState({
      inventory: createEmptyPartyInventory(0),
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      dropVisualEvents: [
        createDropVisualEvent({
          enemyId: "wolf",
          itemId: "wolf_fang",
          now,
          currentMapId: MAP_ONE_ID,
        }),
      ],
    });

    const nextState = updateDropSystem(state, now + DROP_VISUAL_DURATION_MS);

    expect(nextState.dropVisualEvents).toEqual([]);
    expect(nextState.inventory.slots).toEqual([]);
    expect(nextState.combatFeedbackEvents.at(-1)?.text).toBe("Inventory Full");
  });

  it("does not add stale pending drops after a map change", () => {
    const now = 1000;
    const state = createTestGameState({
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      dropVisualEvents: [
        createDropVisualEvent({
          enemyId: "wolf",
          itemId: "wolf_claw",
          now,
          currentMapId: MAP_ONE_ID,
        }),
      ],
    });

    const nextState = updateDropSystem(state, now + DROP_VISUAL_DURATION_MS);

    expect(nextState.dropVisualEvents).toEqual([]);
    expect(nextState.inventory.slots).toEqual([]);
  });
});

function createDropVisualEvent({
  enemyId,
  itemId,
  now,
  currentMapId,
}: {
  enemyId: string;
  itemId: DropVisualEvent["itemId"];
  now: number;
  currentMapId: DropVisualEvent["currentMapId"];
}): DropVisualEvent {
  return {
    id: `${enemyId}-${itemId}`,
    enemyId,
    enemyType: "wolf",
    itemId,
    quantity: 1,
    position: { x: 1, y: 1 },
    createdAt: now,
    expiresAt: now + DROP_VISUAL_DURATION_MS,
    currentMapId,
    tableId: "wolf_drops",
    dropChance: 0.85,
  };
}
