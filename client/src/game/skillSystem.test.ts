import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { updateGatherSystem } from "./gatherSystem";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateSkillSystem } from "./skillSystem";
import type { Companion, GameEntity } from "./types";

describe("beginner skill system", () => {
  it("uses Throw Rock to pull enemy attention to the caster", () => {
    const defender = createBeginner("defender", "defender", { x: 0, y: 0 });
    const enemy = createEnemy("enemy", { x: 3, y: 0 });
    const nextState = updateSkillSystem(createSkillState([defender, enemy]), 1000);

    expect(nextState.entities.enemy).toMatchObject({
      state: "attack",
      currentTargetId: defender.id,
    });
    expect(nextState.skillVisualEvents?.at(-1)).toMatchObject({
      skillId: "throw_rock",
      type: "projectile",
    });
  });

  it("uses Field Hands to improve gathering temporarily", () => {
    const gatherer = {
      ...createBeginner("gatherer", "gatherer", { x: 0, y: 0 }),
      state: "gather" as const,
      currentTargetId: "wood",
      lastGatherAt: 0,
    };
    const wood = createResource("wood", { x: 0.5, y: 0 }, {
      durability: 2,
      maxDurability: 2,
      quantity: 1,
    });
    const buffedState = updateSkillSystem(createSkillState([gatherer, wood]), 1000);
    const gatheredState = updateGatherSystem(buffedState, new Set(), 2000);

    expect(buffedState.skillGatherBuffsByCompanionId?.[gatherer.id]?.bonusGatherSpeed).toBe(1);
    expect(buffedState.skillVisualEvents?.at(-1)).toMatchObject({
      skillId: "field_hands",
    });
    expect(gatheredState.entities.wood).toMatchObject({
      isDepleted: true,
      durability: 0,
    });
  });

  it("does not stack duplicate self or ally damage buffs", () => {
    const support = createBeginner("support", "support", { x: 0, y: 0 });
    const ally = createBeginner("ally", "fighter", { x: 1, y: 0 });
    const enemy = createEnemy("enemy", { x: 3, y: 0 });
    const state = createSkillState([support, ally, enemy], {
      skillSelfBuffsByCompanionId: {
        [ally.id]: {
          companionId: ally.id,
          bonusDamage: 1,
          expiresAt: 5000,
        },
      },
    });

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.skillSelfBuffsByCompanionId?.[ally.id]?.expiresAt).toBe(5000);
  });

  it("records skill selection, use, and effect telemetry while recording is active", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 0, y: 0 });
    const enemy = createEnemy("enemy", { x: 1, y: 0 });
    const state = startDebugTelemetryRecording(createSkillState([fighter, enemy]));

    const nextState = updateSkillSystem(state, 1000);
    const eventTypes = nextState.debugTelemetry?.events.map((event) => event.type) ?? [];

    expect(eventTypes).toContain("skill_selected");
    expect(eventTypes).toContain("skill_used");
    expect(eventTypes).toContain("skill_effect_applied");
    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(true);
  });

  it("records skipped skills with reasons while recording is active", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 0, y: 0 });
    const state = startDebugTelemetryRecording(createSkillState([fighter]));

    const nextState = updateSkillSystem(state, 1000);

    expect(
      nextState.debugTelemetry?.events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "throw_rock" &&
          event.reason === "no_target",
      ),
    ).toBe(true);
  });

  it("records Beginner skill ids on emitted visual events", () => {
    const cases: Array<{
      skillId: string;
      entities: GameEntity[];
      overrides?: Partial<GameState>;
    }> = [
      {
        skillId: "kick",
        entities: [
          createBeginner("fighter", "fighter", { x: 0, y: 0 }),
          createEnemy("enemy", { x: 1, y: 0 }),
        ],
      },
      {
        skillId: "guard_up",
        entities: [
          createBeginner("defender", "defender", { x: 0, y: 0 }),
          {
            ...createEnemy("enemy", { x: 2, y: 0 }),
            state: "attack",
            currentTargetId: "defender",
          },
        ],
      },
      {
        skillId: "first_aid",
        entities: [
          createBeginner("support", "support", { x: 0, y: 0 }),
          {
            ...createBeginner("ally", "fighter", { x: 1, y: 0 }),
            health: 2,
            maxHealth: 3,
          },
        ],
      },
      {
        skillId: "deep_breath",
        entities: [
          createBeginner("fighter", "fighter", { x: 0, y: 0 }),
          createEnemy("enemy", { x: 3, y: 0 }),
        ],
      },
      {
        skillId: "rally_call",
        entities: [
          createBeginner("support", "support", { x: 0, y: 0 }),
          createBeginner("ally", "fighter", { x: 1, y: 0 }),
          createEnemy("enemy", { x: 3, y: 0 }),
        ],
        overrides: {
          skillSelfBuffsByCompanionId: {
            support: {
              companionId: "support",
              bonusDamage: 1,
              expiresAt: 5000,
            },
          },
        },
      },
      {
        skillId: "quick_step",
        entities: [
          createBeginner("gatherer", "gatherer", { x: 0, y: 0 }),
          {
            ...createEnemy("enemy", { x: 1, y: 0 }),
            state: "attack",
            currentTargetId: "gatherer",
          },
        ],
        overrides: {
          skillSelfBuffsByCompanionId: {
            gatherer: {
              companionId: "gatherer",
              bonusDamage: 1,
              expiresAt: 5000,
            },
          },
          skillShieldBlocksById: {
            "gatherer-guard_up": {
              id: "gatherer-guard_up",
              ownerId: "gatherer",
              position: { x: 0, y: -1 },
              rotationRadians: 0,
              expiresAt: 5000,
              remainingBlocks: 1,
            },
          },
        },
      },
    ];

    for (const testCase of cases) {
      const nextState = updateSkillSystem(
        createSkillState(testCase.entities, testCase.overrides),
        1000,
      );

      expect(
        nextState.skillVisualEvents?.some(
          (event) => event.skillId === testCase.skillId,
        ),
        testCase.skillId,
      ).toBe(true);
    }
  });
});

function createBeginner(
  id: string,
  role: Companion["role"],
  position: Companion["position"],
): Companion {
  return {
    ...createCompanion(id, position, "leader", role),
    state: "idle",
    currentTargetId: null,
  };
}

function createSkillState(
  entities: GameEntity[],
  overrides: Partial<GameState> = {},
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId: "leader",
      ...overrides,
    }),
  );
}
