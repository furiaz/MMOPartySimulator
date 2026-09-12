import { describe, expect, it } from "vitest";
import { createEnemy } from "./entities";
import { createEmptyPartyInventory } from "./inventory";
import {
  DROP_VISUAL_DURATION_MS,
  handleEnemyDefeatedDrops,
  updateDropSystem,
} from "./dropSystem";
import {
  TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
  getKeyItemQuantity,
  LIVESTOCK_WOLF_DISCOVERY_KEY_ITEM_ID,
} from "./keyItems";
import { createDebugMap, MAP_ONE_ID, MAP_TWO_ID } from "./debugMap";
import { createTestGameState } from "./testState";
import type { DropVisualEvent } from "./types";

describe("enemy drop system", () => {
  it("preserves the state reference when there are no drop visuals", () => {
    const state = createTestGameState({
      dropVisualEvents: [],
    });

    expect(updateDropSystem(state, 1000)).toBe(state);
  });

  it("preserves the state reference when all drop visuals are still active", () => {
    const now = 1000;
    const state = createTestGameState({
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

    expect(updateDropSystem(state, now + DROP_VISUAL_DURATION_MS - 1)).toBe(
      state,
    );
  });

  it("queues drop visuals before adding drops to inventory", () => {
    const now = 1000;
    const enemy = {
      ...createEnemy("wolf", { x: 5, y: 5 }, "aggressive", {
        enemyTypeId: "wolf",
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
      () => randomValues.shift() ?? 0.99,
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
    expect(afterExpiry.newsBroadcasts).toEqual([]);
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
          itemId: "wolf_fang",
          now,
          currentMapId: MAP_ONE_ID,
        }),
      ],
    });

    const nextState = updateDropSystem(state, now + DROP_VISUAL_DURATION_MS);

    expect(nextState.dropVisualEvents).toEqual([]);
    expect(nextState.inventory.slots).toEqual([]);
  });

  it("awards the Slimeward Camp teleport echo once from Azure Mass", () => {
    const now = 1000;
    const enemy = {
      ...createEnemy("azure", { x: 5, y: 5 }, "aggressive", {
        enemyTypeId: "azure_mass",
      }),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [enemy.id]: enemy },
      inventory: createEmptyPartyInventory(0),
    });

    const firstDefeat = handleEnemyDefeatedDrops(
      state,
      enemy,
      "leader",
      now,
      () => 0.99,
    );
    const secondDefeat = handleEnemyDefeatedDrops(
      firstDefeat,
      enemy,
      "leader",
      now + 1,
      () => 0.99,
    );

    expect(getKeyItemQuantity(
      firstDefeat,
      TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
    )).toBe(1);
    expect(firstDefeat.newsBroadcasts?.at(-1)?.text).toBe(
      "Unlocked: Teleportation Echo - Slimeward Camp",
    );
    expect(getKeyItemQuantity(
      secondDefeat,
      TELEPORT_ECHO_SLIMEWARD_CAMP_KEY_ITEM_ID,
    )).toBe(1);
    expect(secondDefeat.newsBroadcasts).toHaveLength(
      firstDefeat.newsBroadcasts?.length ?? 0,
    );
    expect(secondDefeat.inventory.slots).toEqual([]);
  });

  it("can unlock livestock creatures from enemy defeat processing", () => {
    const now = 1000;
    const enemy = {
      ...createEnemy("wolf", { x: 5, y: 5 }, "aggressive", {
        enemyTypeId: "wolf",
      }),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      entities: { [enemy.id]: enemy },
    });
    const randomValues = [0.99, 0.99, 0.09];

    const nextState = handleEnemyDefeatedDrops(
      state,
      enemy,
      "leader",
      now,
      () => randomValues.shift() ?? 0.99,
    );

    expect(getKeyItemQuantity(nextState, LIVESTOCK_WOLF_DISCOVERY_KEY_ITEM_ID))
      .toBe(1);
    expect(nextState.livestock?.ownedCreaturesById.wolf).toBe(1);
    expect(nextState.newsBroadcasts?.at(-1)).toMatchObject({
      title: "Unlock Acquired",
      text: "Unlocked: Wolf Pup",
      details: ["Unlocked: Wolf Pup"],
    });
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
    enemyTypeId: "wolf",
    enemyArchetypeId: "wolf",
    itemId,
    quantity: 1,
    position: { x: 1, y: 1 },
    createdAt: now,
    expiresAt: now + DROP_VISUAL_DURATION_MS,
    currentMapId,
    tableId: "wolf_tier_1_drops",
    dropChance: 0.85,
  };
}
