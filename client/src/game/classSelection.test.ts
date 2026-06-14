import { describe, expect, it } from "vitest";
import { FIRST_CLASS_IDS } from "./classes";
import { createCompanion } from "./entities";
import {
  canCompanionEnterFirstClassSelection,
  selectFirstClass,
} from "./classSelection";
import { createTestGameState } from "./testState";

describe("first class selection", () => {
  it("allows an eligible Beginner to choose each first class", () => {
    for (const classId of FIRST_CLASS_IDS) {
      const companion = {
        ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
        characterLevel: 10,
      };
      const state = createTestGameState({
        entities: {
          [companion.id]: companion,
        },
      });

      const result = selectFirstClass(state, companion.id, classId);

      expect(result.result).toEqual({
        status: "success",
        companionId: companion.id,
        classId,
      });
      expect(result.state.entities[companion.id]).toMatchObject({
        classId,
      });
    }
  });

  it("rejects a Beginner below level 10", () => {
    const companion = createCompanion("companion-1", { x: 0, y: 0 }, "companion-1");
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
    });

    const result = selectFirstClass(state, companion.id, "blade");

    expect(result.result).toMatchObject({
      status: "failed",
      reason: "level_too_low",
    });
    expect(result.state).toBe(state);
  });

  it("rejects a non-Beginner companion", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      classId: "blade" as const,
      characterLevel: 10,
    };
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
    });

    const result = selectFirstClass(state, companion.id, "aegis");

    expect(result.result).toMatchObject({
      status: "failed",
      reason: "not_beginner",
    });
    expect(result.state).toBe(state);
  });

  it("rejects a dead companion", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      characterLevel: 10,
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
    });

    const result = selectFirstClass(state, companion.id, "blade");

    expect(result.result).toMatchObject({
      status: "failed",
      reason: "companion_dead",
    });
    expect(result.state).toBe(state);
  });

  it("rejects Beginner as a first class target", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      characterLevel: 10,
    };
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
    });

    const result = selectFirstClass(state, companion.id, "beginner");

    expect(result.result).toMatchObject({
      status: "failed",
      reason: "invalid_class",
    });
    expect(result.state).toBe(state);
  });

  it("rejects incompatible equipped gear", () => {
    const companion = {
      ...createCompanion("companion-1", { x: 0, y: 0 }, "companion-1"),
      characterLevel: 10,
      equipment: {
        ...createCompanion("unused", { x: 0, y: 0 }, "unused").equipment,
        mainHand: "training_sword" as const,
      },
    };
    const state = createTestGameState({
      entities: {
        [companion.id]: companion,
      },
    });

    const result = selectFirstClass(state, companion.id, "blade");

    expect(result.result).toMatchObject({
      status: "failed",
      reason: "incompatible_equipment",
      incompatibleItemIds: ["training_sword"],
    });
    expect(canCompanionEnterFirstClassSelection(companion)).toBe(false);
    expect(result.state).toBe(state);
  });
});
