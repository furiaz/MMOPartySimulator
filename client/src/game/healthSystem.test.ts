import { describe, expect, it } from "vitest";
import { createCompanion, createTargetDummy } from "./entities";
import {
  updatePassiveHealthRegen,
  updateTargetDummyHealthRegen,
} from "./healthSystem";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";

describe("passive health regen", () => {
  it("preserves state when companion regen has no elapsed interval or stale ids", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "companion");
    const state = addEntity(
      createTestGameState({
        partyLeaderId: companion.id,
        lastHealthRegenAtByCompanionId: { [companion.id]: 1000 },
      }),
      companion,
    );

    expect(updatePassiveHealthRegen(state, 2000)).toBe(state);
  });

  it("heals living companions every five seconds without exceeding max health", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "companion"),
      health: 5,
    };
    const state = addEntity(
      createTestGameState({ partyLeaderId: companion.id }),
      companion,
    );
    const initializedState = updatePassiveHealthRegen(state, 1000);
    const nextState = updatePassiveHealthRegen(initializedState, 6000);

    expect(nextState.entities[companion.id]).toMatchObject({ health: 6 });
  });

  it("does not revive dead companions", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "companion"),
      state: "dead" as const,
      health: 0,
    };
    const state = addEntity(
      createTestGameState({
        partyLeaderId: companion.id,
        lastHealthRegenAtByCompanionId: { [companion.id]: 0 },
      }),
      companion,
    );
    const nextState = updatePassiveHealthRegen(state, 5000);

    expect(nextState.entities[companion.id]).toMatchObject({
      state: "dead",
      health: 0,
    });
  });

  it("removes stale companion regen timestamp ids", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "companion");
    const state = addEntity(
      createTestGameState({
        partyLeaderId: companion.id,
        lastHealthRegenAtByCompanionId: {
          [companion.id]: 1000,
          missing: 1000,
        },
      }),
      companion,
    );
    const nextState = updatePassiveHealthRegen(state, 2000);

    expect(nextState).not.toBe(state);
    expect(nextState.lastHealthRegenAtByCompanionId).toEqual({
      [companion.id]: 1000,
    });
  });

  it("heals target dummies every five seconds without exceeding max health", () => {
    const dummy = {
      ...createTargetDummy("dummy", { x: 0, y: 0 }),
      health: 85,
    };
    const state = addEntity(
      createTestGameState({
        lastTargetDummyRegenAtByEnemyId: { [dummy.id]: 0 },
      }),
      dummy,
    );
    const nextState = updateTargetDummyHealthRegen(state, 5000);
    const cappedState = updateTargetDummyHealthRegen(nextState, 10000);

    expect(nextState.entities[dummy.id]).toMatchObject({ health: 95 });
    expect(cappedState.entities[dummy.id]).toMatchObject({ health: 100 });
  });

  it("preserves state when target dummy regen has no elapsed interval or stale ids", () => {
    const dummy = createTargetDummy("dummy", { x: 0, y: 0 });
    const state = addEntity(
      createTestGameState({
        lastTargetDummyRegenAtByEnemyId: { [dummy.id]: 1000 },
      }),
      dummy,
    );

    expect(updateTargetDummyHealthRegen(state, 2000)).toBe(state);
  });

  it("removes stale target dummy regen timestamp ids", () => {
    const dummy = createTargetDummy("dummy", { x: 0, y: 0 });
    const state = addEntity(
      createTestGameState({
        lastTargetDummyRegenAtByEnemyId: {
          [dummy.id]: 1000,
          missing: 1000,
        },
      }),
      dummy,
    );
    const nextState = updateTargetDummyHealthRegen(state, 2000);

    expect(nextState).not.toBe(state);
    expect(nextState.lastTargetDummyRegenAtByEnemyId).toEqual({
      [dummy.id]: 1000,
    });
  });
});
