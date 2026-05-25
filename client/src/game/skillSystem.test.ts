import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { updateGatherSystem } from "./gatherSystem";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateSkillSystem } from "./skillSystem";
import type { Companion, GameEntity, GameMap, Position } from "./types";

describe("beginner skill system", () => {
  it("uses Throw Rock to pull enemy attention to the caster", () => {
    const defender = createBeginner("defender", "defender", { x: 0, y: 0 });
    const enemy = createEnemy("enemy", { x: 1, y: 0 });
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
    const enemy = createEnemy("enemy", { x: 5, y: 0 });
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

  it("dedupes repeated skipped skill telemetry while keeping the first reason", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 0, y: 0 });
    const state = startDebugTelemetryRecording(createSkillState([fighter]));

    const firstState = updateSkillSystem(state, 1000);
    const secondState = updateSkillSystem(firstState, 1100);
    const matchingSkips =
      secondState.debugTelemetry?.events.filter(
        (event) =>
          event.type === "skill_skipped" &&
          event.entityId === fighter.id &&
          event.skillId === "throw_rock" &&
          event.reason === "no_target",
      ) ?? [];

    expect(matchingSkips).toHaveLength(1);
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
          createEnemy("enemy", { x: 5, y: 0 }),
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
          createEnemy("enemy", { x: 5, y: 0 }),
        ],
        overrides: {
          map: createSkillMap([{ x: 3, y: 0 }]),
        },
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

  it("skips Kick when a wall blocks the direct lunge path", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 1, y: 1 });
    const enemy = createEnemy("enemy", { x: 6, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([fighter, enemy], {
        map: createSkillMap([{ x: 3, y: 1 }]),
        ...createActiveSelfBuff(fighter.id),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(false);
    expect(nextState.entities.enemy).toMatchObject({
      health: enemy.health,
    });
  });

  it("uses Kick as a clear-path lunge and damage skill", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 1, y: 1 });
    const enemy = createEnemy("enemy", { x: 6, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([fighter, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(fighter.id),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);
    const currentFighter = nextState.entities.fighter;
    const currentEnemy = nextState.entities.enemy;

    if (currentEnemy.kind !== "enemy") {
      throw new Error("Expected current enemy in Kick lunge test");
    }

    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(true);
    expect(currentFighter.position.x).toBeGreaterThan(fighter.position.x);
    expect(currentFighter.position.x).toBeLessThan(enemy.position.x);
    expect(currentEnemy).toMatchObject({
      state: "attack",
      currentTargetId: fighter.id,
    });
    expect(currentEnemy.health).toBeLessThan(enemy.health);
  });

  it("does not use Kick when the target is already in normal attack range", () => {
    const defender = createBeginner("defender", "defender", { x: 1, y: 1 });
    const enemy = createEnemy("enemy", { x: 2, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([defender, enemy], {
        map: createSkillMap(),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.skillCooldownsByCompanionId?.defender?.skillId).toBe(
      "throw_rock",
    );
    expect(nextState.entities.defender.position).toEqual(defender.position);
    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(false);
  });

  it("prefers opening Kick over Defender Throw Rock outside melee range", () => {
    const defender = createBeginner("defender", "defender", { x: 1, y: 1 });
    const enemy = createEnemy("enemy", { x: 5, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([defender, enemy], {
        map: createSkillMap(),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.skillCooldownsByCompanionId?.defender?.skillId).toBe(
      "kick",
    );
    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(true);
  });

  it("keeps Guard Up ahead of opening Kick when party danger is present", () => {
    const defender = createBeginner("defender", "defender", { x: 1, y: 1 });
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: defender.id,
    };
    const state = startDebugTelemetryRecording(
      createSkillState([defender, enemy], {
        map: createSkillMap(),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.skillCooldownsByCompanionId?.defender?.skillId).toBe(
      "guard_up",
    );
    expect(nextState.entities.defender.position).toEqual(defender.position);
    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(false);
  });

  it("keeps First Aid ahead of opening Kick when an ally needs healing", () => {
    const support = createBeginner("support", "support", { x: 1, y: 1 });
    const ally = {
      ...createBeginner("ally", "fighter", { x: 1, y: 2 }),
      health: 2,
      maxHealth: 3,
    };
    const enemy = createEnemy("enemy", { x: 6, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([support, ally, enemy], {
        map: createSkillMap(),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.skillCooldownsByCompanionId?.support?.skillId).toBe(
      "first_aid",
    );
    expect(nextState.entities.support.position).toEqual(support.position);
    expect(nextState.entities.enemy).toMatchObject({
      health: enemy.health,
    });
  });

  it("does not use Kick through active resources", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 1, y: 1 });
    const enemy = createEnemy("enemy", { x: 6, y: 1 });
    const wood = createResource("wood", { x: 3, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([fighter, enemy, wood], {
        map: createSkillMap(),
        ...createActiveSelfBuff(fighter.id),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(false);
    expect(nextState.entities.enemy).toMatchObject({
      health: enemy.health,
    });
  });

  it("moves Fighter Quick Step toward a valid enemy", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 1, y: 3 });
    const enemy = createEnemy("enemy", { x: 7, y: 3 });
    const nextState = updateSkillSystem(
      createSkillState([fighter, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(fighter.id),
      }),
      1000,
    );

    expect(nextState.entities.fighter.position.x).toBeGreaterThan(
      fighter.position.x,
    );
    expect(nextState.skillCooldownsByCompanionId?.fighter?.skillId).toBe(
      "quick_step",
    );
  });

  it.each<Companion["role"]>(["support", "gatherer", "none"])(
    "moves %s Quick Step away from an attacking enemy",
    (role) => {
      const companion = createBeginner("companion", role, { x: 3, y: 3 });
      const enemy = {
        ...createEnemy("enemy", { x: 4, y: 3 }),
        state: "attack" as const,
        currentTargetId: companion.id,
      };
      const nextState = updateSkillSystem(
        createSkillState([companion, enemy], {
          map: createSkillMap(),
          ...createActiveSelfBuff(companion.id),
          ...createActiveShield(companion.id),
        }),
        1000,
      );

      expect(nextState.entities.companion.position.x).toBeLessThan(
        companion.position.x,
      );
      expect(nextState.skillCooldownsByCompanionId?.companion?.skillId).toBe(
        "quick_step",
      );
    },
  );

  it("tries angled Quick Step alternatives when the direct destination is blocked", () => {
    const support = createBeginner("support", "support", { x: 3, y: 3 });
    const enemy = {
      ...createEnemy("enemy", { x: 4, y: 3 }),
      state: "attack" as const,
      currentTargetId: support.id,
    };
    const nextState = updateSkillSystem(
      createSkillState([support, enemy], {
        map: createSkillMap([{ x: 2, y: 3 }]),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(nextState.entities.support.position.x).toBeLessThan(
      support.position.x,
    );
    expect(nextState.entities.support.position.y).not.toBe(support.position.y);
    expect(nextState.skillCooldownsByCompanionId?.support?.skillId).toBe(
      "quick_step",
    );
  });

  it("does not start Quick Step cooldown when all candidate destinations are blocked", () => {
    const support = createBeginner("support", "support", { x: 3, y: 3 });
    const enemy = {
      ...createEnemy("enemy", { x: 9, y: 3 }),
      state: "attack" as const,
      currentTargetId: support.id,
    };
    const nextState = updateSkillSystem(
      createSkillState([support, enemy], {
        map: createSkillMap(
          [
            { x: 2, y: 3 },
            { x: 2, y: 2 },
            { x: 2, y: 4 },
            { x: 3, y: 2 },
            { x: 3, y: 4 },
          ],
          12,
        ),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(nextState.entities.support.position).toEqual(support.position);
    expect(nextState.skillCooldownsByCompanionId?.support).toBeUndefined();
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

function createSkillMap(walls: Position[] = [], columns = 8): GameMap {
  return {
    displayName: "Skill Test Map",
    debugName: "skill-test-map",
    columns,
    rows: 8,
    walls,
    teleports: [],
    healingFountains: [],
  };
}

function createActiveSelfBuff(companionId: string): Partial<GameState> {
  return {
    skillSelfBuffsByCompanionId: {
      [companionId]: {
        companionId,
        bonusDamage: 1,
        expiresAt: 5000,
      },
    },
  };
}

function createActiveShield(companionId: string): Partial<GameState> {
  return {
    skillShieldBlocksById: {
      [`${companionId}-guard_up`]: {
        id: `${companionId}-guard_up`,
        ownerId: companionId,
        position: { x: 0, y: -1 },
        rotationRadians: 0,
        expiresAt: 5000,
        remainingBlocks: 1,
      },
    },
  };
}
