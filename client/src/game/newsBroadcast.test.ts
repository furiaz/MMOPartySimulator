import { describe, expect, it } from "vitest";
import {
  formatImportantItemAcquisitionLine,
  queueImportantItemAcquisitionBroadcast,
  queueNewsBroadcast,
  queueUnlockNewsBroadcast,
  restartNewsBroadcastDisplayDuration,
} from "./newsBroadcast";
import { createTestGameState } from "./testState";

describe("news broadcasts", () => {
  it("keeps text-only broadcasts compatible", () => {
    const state = queueNewsBroadcast(createTestGameState(), "Simple update", 100);

    expect(state.newsBroadcasts).toEqual([
      {
        id: "100-news-0",
        text: "Simple update",
        createdAt: 100,
        expiresAt: 3100,
      },
    ]);
  });

  it("formats stackable and non-stackable acquisition lines", () => {
    expect(
      formatImportantItemAcquisitionLine({
        verb: "Obtained",
        itemId: "copper_ore",
        quantity: 1,
      }),
    ).toBe("Obtained: Copper Ore x1");
    expect(
      formatImportantItemAcquisitionLine({
        verb: "Obtained",
        itemId: "training_sword",
        quantity: 1,
      }),
    ).toBe("Obtained: Training Sword");
    expect(
      formatImportantItemAcquisitionLine({
        verb: "Obtained",
        itemId: "training_sword",
        quantity: 2,
      }),
    ).toBe("Obtained: Training Sword x2");
  });

  it("groups one source into one titled broadcast", () => {
    const state = queueImportantItemAcquisitionBroadcast(
      createTestGameState(),
      {
        title: "Quest Complete",
        entries: [
          { verb: "Delivered", displayName: "Wood", quantity: 3 },
          { verb: "Obtained", itemId: "minor_recovery_flask", quantity: 1 },
        ],
      },
      200,
    );

    expect(state.newsBroadcasts).toEqual([
      {
        id: "200-news-0",
        title: "Quest Complete",
        text: "Delivered: Wood x3 | Obtained: Minor Recovery Flask x1",
        details: ["Delivered: Wood x3", "Obtained: Minor Recovery Flask x1"],
        createdAt: 200,
        expiresAt: 3200,
      },
    ]);
  });

  it("queues separate source broadcasts", () => {
    let state = queueImportantItemAcquisitionBroadcast(
      createTestGameState(),
      {
        title: "Quest Complete",
        entries: [{ verb: "Obtained", itemId: "guard_coif", quantity: 1 }],
      },
      300,
    );
    state = queueImportantItemAcquisitionBroadcast(
      state,
      {
        title: "Quest Complete",
        entries: [{ verb: "Obtained", itemId: "scout_boots", quantity: 1 }],
      },
      301,
    );

    expect(state.newsBroadcasts).toHaveLength(2);
    expect(state.newsBroadcasts?.[0].details).toEqual([
      "Obtained: Guard Coif",
    ]);
    expect(state.newsBroadcasts?.[1].details).toEqual([
      "Obtained: Scout Boots",
    ]);
  });

  it("uses unlock wording for key and progression notifications", () => {
    const state = queueUnlockNewsBroadcast(createTestGameState(), "Potato Seed", 400);

    expect(state.newsBroadcasts?.at(-1)).toMatchObject({
      title: "Unlock Acquired",
      text: "Unlocked: Potato Seed",
      details: ["Unlocked: Potato Seed"],
    });
  });

  it("restarts hidden broadcasts when guide popups finish", () => {
    const queuedState = queueImportantItemAcquisitionBroadcast(
      createTestGameState(),
      {
        title: "Items Received",
        entries: [{ verb: "Obtained", itemId: "copper_ore", quantity: 2 }],
      },
      500,
    );

    const visibleState = restartNewsBroadcastDisplayDuration(queuedState, 5_000);

    expect(visibleState.newsBroadcasts?.[0]).toMatchObject({
      text: "Obtained: Copper Ore x2",
      details: ["Obtained: Copper Ore x2"],
      createdAt: 5_000,
      expiresAt: 8_000,
    });
  });
});
