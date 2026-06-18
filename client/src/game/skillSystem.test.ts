import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { updateGatherSystem } from "./gatherSystem";
import { getHealingAmount } from "./combatResolver";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { createPendingRoleBonusState } from "./roleBonus";
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
    expect(nextState.globalCooldownsByCompanionId?.defender).toMatchObject({
      companionId: defender.id,
      source: "skill",
      skillId: "throw_rock",
      startedAt: 1000,
      expiresAt: 3000,
    });
  });

  it("does not use Throw Rock on an enemy already targeting the caster", () => {
    const defender = createBeginner("defender", "defender", { x: 3, y: 3 });
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 3 }),
      state: "attack" as const,
      currentTargetId: defender.id,
    };
    const nextState = updateSkillSystem(
      createSkillState([defender, enemy], {
        map: createSkillMap(
          [
            { x: 4, y: 3 },
            { x: 4, y: 4 },
            { x: 4, y: 2 },
            { x: 3, y: 4 },
            { x: 3, y: 2 },
          ],
          8,
        ),
        ...createActiveShield(defender.id),
      }),
      1000,
    );

    expect(
      nextState.skillCooldownsByCompanionId?.defender?.throw_rock,
    ).toBeUndefined();
    expect(
      nextState.skillVisualEvents?.some(
        (event) => event.skillId === "throw_rock" && event.type === "projectile",
      ) ?? false,
    ).toBe(false);
  });

  it("uses Throw Rock on another valid target when the current enemy already targets the caster", () => {
    const defender = {
      ...createBeginner("defender", "defender", { x: 3, y: 3 }),
      currentTargetId: "current-enemy",
    };
    const currentEnemy = {
      ...createEnemy("current-enemy", { x: 5, y: 3 }),
      state: "attack" as const,
      currentTargetId: defender.id,
    };
    const otherEnemy = createEnemy("other-enemy", { x: 2, y: 3 });
    const nextState = updateSkillSystem(
      createSkillState([defender, currentEnemy, otherEnemy], {
        map: createSkillMap(
          [
            { x: 4, y: 3 },
            { x: 4, y: 4 },
            { x: 4, y: 2 },
            { x: 3, y: 4 },
            { x: 3, y: 2 },
          ],
          8,
        ),
        ...createActiveShield(defender.id),
      }),
      1000,
    );

    expect(nextState.entities["current-enemy"]).toMatchObject({
      currentTargetId: defender.id,
    });
    expect(nextState.entities["other-enemy"]).toMatchObject({
      state: "attack",
      currentTargetId: defender.id,
    });
    expect(nextState.skillCooldownsByCompanionId?.defender?.throw_rock?.skillId).toBe(
      "throw_rock",
    );
  });

  it("prefers Throw Rock against enemies attacking Support or low-health allies", () => {
    const defender = createBeginner("defender", "defender", { x: 0, y: 0 });
    const support = createBeginner("support", "support", { x: 0, y: 1 });
    const supportAttacker = {
      ...createEnemy("support-attacker", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: support.id,
    };
    const lowHealthAlly = {
      ...createBeginner("low-health-ally", "fighter", { x: 0, y: 2 }),
      health: 6,
      maxHealth: 20,
    };
    const lowHealthAttacker = {
      ...createEnemy("low-health-attacker", { x: 2, y: 0 }),
      state: "attack" as const,
      currentTargetId: lowHealthAlly.id,
    };
    const nextState = updateSkillSystem(
      createSkillState(
        [defender, support, supportAttacker, lowHealthAlly, lowHealthAttacker],
        {
          map: createSkillMap(),
          ...createActiveShield(defender.id),
        },
      ),
      1000,
    );

    expect(nextState.entities["support-attacker"]).toMatchObject({
      currentTargetId: defender.id,
    });
    expect(
      nextState.skillCooldownsByCompanionId?.defender?.throw_rock?.skillId,
    ).toBe("throw_rock");
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
    expect(buffedState.skillGatherBuffsByCompanionId?.[gatherer.id]?.expiresAt).toBe(10000);
    expect(buffedState.skillCooldownsByCompanionId?.[gatherer.id]?.field_hands).toMatchObject({
      skillId: "field_hands",
      expiresAt: 11000,
    });
    expect(buffedState.skillVisualEvents?.at(-1)).toMatchObject({
      skillId: "field_hands",
    });
    expect(gatheredState.entities.wood).toMatchObject({
      isDepleted: true,
      durability: 0,
    });
  });

  it("only uses Field Hands for the current resource target within 5 units", () => {
    const nearbyCollector = {
      ...createBeginner("nearby-collector", "gatherer", { x: 0, y: 0 }),
      state: "gather" as const,
      currentTargetId: "nearby-wood",
    };
    const farCollector = {
      ...createBeginner("far-collector", "gatherer", { x: 0, y: 0 }),
      state: "gather" as const,
      currentTargetId: "far-wood",
    };
    const idleCollector = createBeginner("idle-collector", "gatherer", {
      x: 0,
      y: 0,
    });
    const nearbyWood = createResource("nearby-wood", { x: 5, y: 0 });
    const farWood = createResource("far-wood", { x: 6, y: 0 });
    const unrelatedWood = createResource("unrelated-wood", { x: 1, y: 0 });

    const nearbyState = updateSkillSystem(
      createSkillState([nearbyCollector, nearbyWood]),
      1000,
    );
    const farState = updateSkillSystem(
      createSkillState([farCollector, farWood]),
      1000,
    );
    const idleState = updateSkillSystem(
      createSkillState([idleCollector, unrelatedWood]),
      1000,
    );

    expect(
      nearbyState.skillCooldownsByCompanionId?.["nearby-collector"]
        ?.field_hands?.skillId,
    ).toBe("field_hands");
    expect(
      farState.skillCooldownsByCompanionId?.["far-collector"]?.field_hands,
    ).toBeUndefined();
    expect(
      idleState.skillCooldownsByCompanionId?.["idle-collector"]?.field_hands,
    ).toBeUndefined();
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

  it("suppresses out-of-context attack no-target skips while keeping utility skips", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 0, y: 0 });
    const state = startDebugTelemetryRecording(createSkillState([fighter]));

    const nextState = updateSkillSystem(state, 1000);
    const events = nextState.debugTelemetry?.events ?? [];

    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "throw_rock" &&
          event.reason === "no_target",
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "kick" &&
          event.reason === "no_target",
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "first_aid" &&
          event.reason === "no_target",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "guard_up" &&
          event.reason === "no_target",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "deep_breath" &&
          event.reason === "no_target",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "rally_call" &&
          event.reason === "no_target",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "field_hands" &&
          event.reason === "no_target",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "quick_step" &&
          event.reason === "no_target",
      ),
    ).toBe(true);
  });

  it("records attack no-target skips when enemy context exists", () => {
    const defender = createBeginner("defender", "defender", { x: 0, y: 0 });
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: defender.id,
    };
    const state = startDebugTelemetryRecording(
      createSkillState([defender, enemy], {
        ...createActiveShield(defender.id),
      }),
    );

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

  it("skips skill selection during companion global cooldown", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 0, y: 0 });
    const enemy = createEnemy("enemy", { x: 5, y: 0 });
    const state = startDebugTelemetryRecording(
      createSkillState([fighter, enemy], {
        globalCooldownsByCompanionId: {
          fighter: {
            companionId: fighter.id,
            source: "basic_attack",
            startedAt: 1000,
            expiresAt: 3000,
          },
        },
      }),
    );

    const nextState = updateSkillSystem(state, 2000);

    expect(nextState.skillCooldownsByCompanionId?.fighter).toBeUndefined();
    expect(nextState.globalCooldownsByCompanionId?.fighter?.expiresAt).toBe(3000);
    expect(
      nextState.debugTelemetry?.events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.entityId === fighter.id &&
          event.reason === "global_cooldown",
      ),
    ).toBe(false);
    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_selected" && event.entityId === fighter.id,
      ),
    ).toBe(false);
  });

  it("records individual skill cooldown skips without blocking other skills", () => {
    const defender = createBeginner("defender", "defender", { x: 1, y: 1 });
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: defender.id,
    };
    const state = startDebugTelemetryRecording(
      createSkillState([defender, enemy], {
        map: createSkillMap(),
        skillCooldownsByCompanionId: {
          defender: {
            throw_rock: {
              companionId: defender.id,
              skillId: "throw_rock",
              expiresAt: 5000,
            },
          },
        },
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.skillCooldownsByCompanionId?.defender?.throw_rock).toMatchObject({
      skillId: "throw_rock",
      expiresAt: 5000,
    });
    expect(nextState.skillCooldownsByCompanionId?.defender?.guard_up).toMatchObject({
      skillId: "guard_up",
      expiresAt: 11000,
    });
    expect(
      nextState.debugTelemetry?.events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.skillId === "throw_rock" &&
          event.reason === "skill_cooldown",
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
          event.skillId === "quick_step" &&
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
            health: 1,
            maxHealth: 4,
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
    const enemy = createEnemy("enemy", { x: 6, y: 1 }, undefined, {
      maxHealth: 100,
    });
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

    expect(nextState.skillCooldownsByCompanionId?.defender?.throw_rock?.skillId).toBe(
      "throw_rock",
    );
    expect(nextState.skillCooldownsByCompanionId?.defender?.throw_rock?.expiresAt).toBe(
      11000,
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

    expect(nextState.skillCooldownsByCompanionId?.defender?.kick?.skillId).toBe(
      "kick",
    );
    expect(nextState.skillCooldownsByCompanionId?.defender?.kick?.expiresAt).toBe(
      11000,
    );
    expect(
      nextState.debugTelemetry?.events.some(
        (event) => event.type === "skill_used" && event.skillId === "kick",
      ),
    ).toBe(true);
  });

  it("does not give Kick opening priority when the leader is already attacking the enemy", () => {
    const leader = {
      ...createBeginner("leader", "fighter", { x: 1, y: 1 }),
      state: "attack" as const,
      currentTargetId: "enemy",
      commandPriority: "direct" as const,
    };
    const defender = createBeginner("defender", "defender", { x: 1, y: 2 });
    const enemy = createEnemy("enemy", { x: 5, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([leader, defender, enemy], {
        map: createSkillMap(),
        partyLeaderId: leader.id,
        ...createActiveSelfBuff(leader.id),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(
      nextState.skillCooldownsByCompanionId?.defender?.throw_rock?.skillId,
    ).toBe("throw_rock");
    expect(
      nextState.debugTelemetry?.events.some(
        (event) =>
          event.type === "skill_used" &&
          event.entityId === "defender" &&
          event.skillId === "kick",
      ),
    ).toBe(false);
  });

  it("prefers Kick against reachable enemies attacking Support", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 1, y: 1 });
    const support = createBeginner("support", "support", { x: 4, y: 2 });
    const supportAttacker = {
      ...createEnemy("support-attacker", { x: 5, y: 1 }, undefined, {
        maxHealth: 100,
      }),
      state: "attack" as const,
      currentTargetId: support.id,
    };
    const otherEnemy = createEnemy("other-enemy", { x: 4, y: 2 }, undefined, {
      maxHealth: 100,
    });
    const state = startDebugTelemetryRecording(
      createSkillState([fighter, support, supportAttacker, otherEnemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(fighter.id),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(
      nextState.skillCooldownsByCompanionId?.fighter?.kick?.skillId,
    ).toBe("kick");
    expect(nextState.entities["support-attacker"]).toMatchObject({
      currentTargetId: fighter.id,
    });
  });

  it.each<Companion["role"]>(["support", "gatherer"])(
    "only lets %s Kick when attacked by a reachable enemy",
    (role) => {
      const idleCompanion = createBeginner("idle-companion", role, { x: 1, y: 1 });
      const idleEnemy = createEnemy("idle-enemy", { x: 5, y: 1 });
      const attackedCompanion = createBeginner("attacked-companion", role, {
        x: 1,
        y: 1,
      });
      const attacker = {
        ...createEnemy("attacker", { x: 5, y: 1 }, undefined, {
          maxHealth: 100,
        }),
        state: "attack" as const,
        currentTargetId: attackedCompanion.id,
      };

      const idleState = updateSkillSystem(
        createSkillState([idleCompanion, idleEnemy], {
          map: createSkillMap(),
          ...createActiveSelfBuff(idleCompanion.id),
          ...createActiveShield(idleCompanion.id),
        }),
        1000,
      );
      const attackedState = updateSkillSystem(
        createSkillState([attackedCompanion, attacker], {
          map: createSkillMap(),
          ...createActiveSelfBuff(attackedCompanion.id),
          ...createActiveShield(attackedCompanion.id),
        }),
        1000,
      );

      expect(
        idleState.skillCooldownsByCompanionId?.["idle-companion"]?.kick,
      ).toBeUndefined();
      expect(
        attackedState.skillCooldownsByCompanionId?.["attacked-companion"]?.kick
          ?.skillId,
      ).toBe("kick");
    },
  );

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

    expect(nextState.skillCooldownsByCompanionId?.defender?.guard_up?.skillId).toBe(
      "guard_up",
    );
    expect(nextState.skillCooldownsByCompanionId?.defender?.guard_up?.expiresAt).toBe(
      11000,
    );
    expect(
      nextState.skillShieldBlocksById?.["defender-guard_up"]?.expiresAt,
    ).toBe(4000);
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
      maxHealth: 20,
    };
    const enemy = createEnemy("enemy", { x: 6, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([support, ally, enemy], {
        map: createSkillMap(),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.skillCooldownsByCompanionId?.support?.first_aid?.skillId).toBe(
      "first_aid",
    );
    expect(nextState.skillCooldownsByCompanionId?.support?.first_aid?.expiresAt).toBe(
      11000,
    );
    expect(nextState.entities.support.position).toEqual(support.position);
    expect(nextState.entities.enemy).toMatchObject({
      health: enemy.health,
    });
    expect(nextState.entities.ally).toMatchObject({
      health: Math.min(
        ally.maxHealth,
        ally.health + getHealingAmount(support, 5),
      ),
    });
    expect(
      nextState.debugTelemetry?.events.some(
        (event) =>
          event.type === "healing_resolved" &&
          event.skillId === "first_aid" &&
          event.healingMultiplier === 5,
      ),
    ).toBe(true);
  });

  it("uses active Support role bonus when resolving First Aid healing", () => {
    const activeSupport = createBeginner("active-support", "support", { x: 1, y: 1 });
    const pendingSupport = {
      ...createBeginner("pending-support", "support", { x: 1, y: 1 }),
      roleBonus: createPendingRoleBonusState("support", 1000),
    };
    const activeAlly = {
      ...createBeginner("active-ally", "fighter", { x: 1, y: 2 }),
      health: 1,
      maxHealth: 200,
    };
    const pendingAlly = {
      ...createBeginner("pending-ally", "fighter", { x: 1, y: 2 }),
      health: 1,
      maxHealth: 200,
    };

    const activeState = updateSkillSystem(
      createSkillState([activeSupport, activeAlly], {
        map: createSkillMap(),
      }),
      1000,
    );
    const pendingState = updateSkillSystem(
      createSkillState([pendingSupport, pendingAlly], {
        map: createSkillMap(),
      }),
      1000,
    );
    const healedActiveAlly = activeState.entities["active-ally"];
    const healedPendingAlly = pendingState.entities["pending-ally"];

    if (
      healedActiveAlly?.kind !== "companion" ||
      healedPendingAlly?.kind !== "companion"
    ) {
      throw new Error("Expected healed allies in Support role bonus First Aid test.");
    }

    expect(healedActiveAlly).toMatchObject({
      health: Math.min(
        activeAlly.maxHealth,
        activeAlly.health + getHealingAmount(activeSupport, 5),
      ),
    });
    expect(healedActiveAlly.health).toBeGreaterThan(healedPendingAlly.health);
  });

  it("prioritizes Beginner First Aid on self at the configured low-health threshold", () => {
    const support = {
      ...createBeginner("support", "support", { x: 1, y: 1 }),
      health: 4,
      maxHealth: 20,
    };
    const ally = {
      ...createBeginner("ally", "fighter", { x: 1, y: 2 }),
      commandPriority: "direct" as const,
      health: 1,
      maxHealth: 20,
    };
    const state = createSkillState([support, ally], {
      map: createSkillMap(),
    });

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.entities.support).toMatchObject({
      health: Math.min(
        support.maxHealth,
        support.health + getHealingAmount(support, 5),
      ),
    });
    expect(nextState.entities.ally).toMatchObject({
      health: ally.health,
    });
    expect(
      nextState.skillCooldownsByCompanionId?.support?.first_aid?.skillId,
    ).toBe("first_aid");
  });

  it("keeps existing First Aid ally targeting above the self-heal threshold", () => {
    const support = {
      ...createBeginner("support", "support", { x: 1, y: 1 }),
      health: 5,
      maxHealth: 20,
    };
    const ally = {
      ...createBeginner("ally", "fighter", { x: 1, y: 2 }),
      commandPriority: "direct" as const,
      health: 1,
      maxHealth: 20,
    };
    const state = createSkillState([support, ally], {
      map: createSkillMap(),
    });

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.entities.support).toMatchObject({
      health: support.health,
    });
    expect(nextState.entities.ally).toMatchObject({
      health: Math.min(
        ally.maxHealth,
        ally.health + getHealingAmount(support, 5),
      ),
    });
    expect(
      nextState.skillCooldownsByCompanionId?.support?.first_aid?.skillId,
    ).toBe("first_aid");
  });

  it("lets a low-health Fighter Beginner self-heal despite normal heal role scoring", () => {
    const fighter = {
      ...createBeginner("fighter", "fighter", { x: 1, y: 1 }),
      health: 4,
      maxHealth: 20,
    };
    const ally = {
      ...createBeginner("ally", "support", { x: 1, y: 2 }),
      commandPriority: "direct" as const,
      health: 1,
      maxHealth: 20,
    };
    const enemy = createEnemy("enemy", { x: 5, y: 1 });
    const state = startDebugTelemetryRecording(
      createSkillState([fighter, ally, enemy], {
        map: createSkillMap(),
      }),
    );

    const nextState = updateSkillSystem(state, 1000);

    expect(nextState.entities.fighter).toMatchObject({
      health: Math.min(
        fighter.maxHealth,
        fighter.health + getHealingAmount(fighter, 5),
      ),
    });
    expect(nextState.entities.ally).toMatchObject({
      health: ally.health,
    });
    expect(
      nextState.skillCooldownsByCompanionId?.fighter?.first_aid?.skillId,
    ).toBe("first_aid");
    expect(
      nextState.debugTelemetry?.events.some(
        (event) =>
          event.type === "skill_skipped" &&
          event.entityId === "fighter" &&
          event.skillId === "first_aid" &&
          event.reason === "non_positive_role_score",
      ),
    ).toBe(false);
  });

  it.each<Companion["role"]>(["defender", "fighter", "support", "gatherer", "none"])(
    "keeps combat First Aid self-use enabled for %s",
    (role) => {
      const companion = {
        ...createBeginner("companion", role, { x: 1, y: 1 }),
        health: 4,
        maxHealth: 20,
      };
      const enemy = {
        ...createEnemy("enemy", { x: 5, y: 1 }),
        state: "attack" as const,
        currentTargetId: companion.id,
      };
      const nextState = updateSkillSystem(
        createSkillState([companion, enemy], {
          map: createSkillMap(),
          ...createActiveShield(companion.id),
        }),
        1000,
      );

      expect(nextState.entities.companion).toMatchObject({
        health: Math.min(
          companion.maxHealth,
          companion.health + getHealingAmount(companion, 5),
        ),
      });
      expect(
        nextState.skillCooldownsByCompanionId?.companion?.first_aid?.skillId,
      ).toBe("first_aid");
    },
  );

  it("keeps combat ally First Aid focused on Support roles", () => {
    const fighter = createBeginner("fighter", "fighter", { x: 1, y: 1 });
    const support = createBeginner("support", "support", { x: 1, y: 1 });
    const ally = {
      ...createBeginner("ally", "fighter", { x: 1, y: 2 }),
      commandPriority: "direct" as const,
      health: 2,
      maxHealth: 20,
    };
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: ally.id,
    };

    const fighterState = updateSkillSystem(
      createSkillState([fighter, ally, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(fighter.id),
        ...createActiveShield(fighter.id),
      }),
      1000,
    );
    const supportState = updateSkillSystem(
      createSkillState([support, ally, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(fighterState.entities.ally).toMatchObject({ health: ally.health });
    expect(
      fighterState.skillCooldownsByCompanionId?.fighter?.first_aid,
    ).toBeUndefined();
    expect(supportState.entities.ally).toMatchObject({
      health: Math.min(ally.maxHealth, ally.health + getHealingAmount(support, 5)),
    });
    expect(
      supportState.skillCooldownsByCompanionId?.support?.first_aid?.skillId,
    ).toBe("first_aid");
  });

  it("does not use ally First Aid above the configured ally threshold", () => {
    const support = {
      ...createBeginner("support", "support", { x: 1, y: 1 }),
      skillBehavior: {
        ...createBeginner("support", "support", { x: 1, y: 1 }).skillBehavior,
        beginnerFirstAidAllyHealHpThresholdPercent: 35,
      },
    };
    const ally = {
      ...createBeginner("ally", "fighter", { x: 1, y: 2 }),
      commandPriority: "direct" as const,
      health: 8,
      maxHealth: 20,
    };
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: ally.id,
    };

    const nextState = updateSkillSystem(
      createSkillState([support, ally, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(nextState.entities.ally).toMatchObject({ health: ally.health });
    expect(
      nextState.skillCooldownsByCompanionId?.support?.first_aid,
    ).toBeUndefined();
  });

  it("uses the configured ally First Aid threshold", () => {
    const support = createBeginner("support", "support", { x: 1, y: 1 });
    const tunedSupport = {
      ...support,
      skillBehavior: {
        ...support.skillBehavior,
        beginnerFirstAidAllyHealHpThresholdPercent: 45,
      },
    };
    const ally = {
      ...createBeginner("ally", "fighter", { x: 1, y: 2 }),
      commandPriority: "direct" as const,
      health: 8,
      maxHealth: 20,
    };
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: ally.id,
    };

    const nextState = updateSkillSystem(
      createSkillState([tunedSupport, ally, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(nextState.entities.ally).toMatchObject({
      health: Math.min(ally.maxHealth, ally.health + getHealingAmount(support, 5)),
    });
    expect(
      nextState.skillCooldownsByCompanionId?.support?.first_aid?.skillId,
    ).toBe("first_aid");
  });

  it("lets Support Focus prefer an injured leader", () => {
    const support = createBeginner("support", "support", { x: 1, y: 1 });
    const focusedSupport = {
      ...support,
      skillBehavior: {
        ...support.skillBehavior,
        supportFocus: "leader" as const,
      },
    };
    const leader = {
      ...createBeginner("leader", "fighter", { x: 1, y: 2 }),
      health: 13,
      maxHealth: 20,
    };
    const urgentAlly = {
      ...createBeginner("urgent-ally", "fighter", { x: 1, y: 3 }),
      commandPriority: "direct" as const,
      health: 2,
      maxHealth: 20,
    };
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: urgentAlly.id,
    };

    const nextState = updateSkillSystem(
      createSkillState([focusedSupport, leader, urgentAlly, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(nextState.entities.leader).toMatchObject({
      health: Math.min(
        leader.maxHealth,
        leader.health + getHealingAmount(support, 5),
      ),
    });
    expect(nextState.entities["urgent-ally"]).toMatchObject({
      health: urgentAlly.health,
    });
  });

  it("falls back from leader Support Focus when the leader is healthy enough", () => {
    const support = createBeginner("support", "support", { x: 1, y: 1 });
    const focusedSupport = {
      ...support,
      skillBehavior: {
        ...support.skillBehavior,
        supportFocus: "leader" as const,
      },
    };
    const leader = {
      ...createBeginner("leader", "fighter", { x: 1, y: 2 }),
      health: 16,
      maxHealth: 20,
    };
    const urgentAlly = {
      ...createBeginner("urgent-ally", "fighter", { x: 1, y: 3 }),
      commandPriority: "direct" as const,
      health: 2,
      maxHealth: 20,
    };
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: urgentAlly.id,
    };

    const nextState = updateSkillSystem(
      createSkillState([focusedSupport, leader, urgentAlly, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(nextState.entities.leader).toMatchObject({ health: leader.health });
    expect(nextState.entities["urgent-ally"]).toMatchObject({
      health: Math.min(
        urgentAlly.maxHealth,
        urgentAlly.health + getHealingAmount(support, 5),
      ),
    });
  });

  it("lets Support Focus prefer the lowest-health injured Defender-role companion", () => {
    const support = createBeginner("support", "support", { x: 1, y: 1 });
    const focusedSupport = {
      ...support,
      skillBehavior: {
        ...support.skillBehavior,
        supportFocus: "defender" as const,
      },
    };
    const injuredDefender = {
      ...createBeginner("injured-defender", "defender", { x: 1, y: 2 }),
      health: 10,
      maxHealth: 20,
    };
    const healthierDefender = {
      ...createBeginner("healthier-defender", "defender", { x: 1, y: 3 }),
      health: 13,
      maxHealth: 20,
    };
    const urgentAlly = {
      ...createBeginner("urgent-ally", "fighter", { x: 2, y: 1 }),
      commandPriority: "direct" as const,
      health: 1,
      maxHealth: 20,
    };
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 1 }),
      state: "attack" as const,
      currentTargetId: urgentAlly.id,
    };

    const nextState = updateSkillSystem(
      createSkillState(
        [focusedSupport, injuredDefender, healthierDefender, urgentAlly, enemy],
        {
          map: createSkillMap(),
          ...createActiveSelfBuff(support.id),
          ...createActiveShield(support.id),
        },
      ),
      1000,
    );

    expect(nextState.entities["injured-defender"]).toMatchObject({
      health: Math.min(
        injuredDefender.maxHealth,
        injuredDefender.health + getHealingAmount(support, 5),
      ),
    });
    expect(nextState.entities["healthier-defender"]).toMatchObject({
      health: healthierDefender.health,
    });
    expect(nextState.entities["urgent-ally"]).toMatchObject({
      health: urgentAlly.health,
    });
  });

  it("reserves out-of-combat First Aid ally targets for one update", () => {
    const firstFighter = createBeginner("first-fighter", "fighter", { x: 1, y: 1 });
    const secondFighter = createBeginner("second-fighter", "fighter", {
      x: 1,
      y: 1,
    });
    const firstAlly = {
      ...createBeginner("first-ally", "support", { x: 1, y: 2 }),
      commandPriority: "direct" as const,
      health: 1,
      maxHealth: 40,
    };
    const secondAlly = {
      ...createBeginner("second-ally", "support", { x: 1, y: 3 }),
      commandPriority: "direct" as const,
      health: 2,
      maxHealth: 40,
    };

    const nextState = updateSkillSystem(
      createSkillState([firstFighter, secondFighter, firstAlly, secondAlly], {
        map: createSkillMap(),
      }),
      1000,
    );

    expect(nextState.entities["first-ally"]).toMatchObject({
      health: Math.min(
        firstAlly.maxHealth,
        firstAlly.health + getHealingAmount(firstFighter, 5),
      ),
    });
    expect(nextState.entities["second-ally"]).toMatchObject({
      health: Math.min(
        secondAlly.maxHealth,
        secondAlly.health + getHealingAmount(secondFighter, 5),
      ),
    });
    expect(
      nextState.skillCooldownsByCompanionId?.["first-fighter"]?.first_aid
        ?.skillId,
    ).toBe("first_aid");
    expect(
      nextState.skillCooldownsByCompanionId?.["second-fighter"]?.first_aid
        ?.skillId,
    ).toBe("first_aid");
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
    expect(nextState.skillCooldownsByCompanionId?.fighter?.quick_step?.skillId).toBe(
      "quick_step",
    );
    expect(nextState.skillCooldownsByCompanionId?.fighter?.quick_step?.expiresAt).toBe(
      11000,
    );
  });

  it("uses Quick Step offensively by default even for non-frontline roles", () => {
    const support = createBeginner("support", "support", { x: 1, y: 3 });
    const enemy = createEnemy("enemy", { x: 7, y: 3 });
    const nextState = updateSkillSystem(
      createSkillState([support, enemy], {
        map: createSkillMap(),
        ...createActiveSelfBuff(support.id),
        ...createActiveShield(support.id),
      }),
      1000,
    );

    expect(nextState.entities.support.position.x).toBeGreaterThan(
      support.position.x,
    );
    expect(nextState.skillCooldownsByCompanionId?.support?.quick_step?.skillId).toBe(
      "quick_step",
    );
  });

  it("uses Second Wind at the configured threshold and caps the heal threshold at 30 percent", () => {
    const baseBlade = createCompanion(
      "blade",
      { x: 0, y: 0 },
      "leader",
      "fighter",
      1,
      "blade",
    );
    const blade = {
      ...baseBlade,
      health: 30,
      maxHealth: 100,
      skillBehavior: {
        ...baseBlade.skillBehavior,
        secondWindSelfHealHpThresholdPercent: 80,
      },
    };
    const nextState = updateSkillSystem(createSkillState([blade]), 1000);

    expect(nextState.entities.blade).toMatchObject({
      health: 50,
    });
    expect(nextState.skillCooldownsByCompanionId?.blade?.second_wind).toMatchObject({
      skillId: "second_wind",
      expiresAt: 31000,
    });
  });

  it("does not use Second Wind above the capped threshold", () => {
    const baseBlade = createCompanion(
      "blade",
      { x: 0, y: 0 },
      "leader",
      "fighter",
      1,
      "blade",
    );
    const blade = {
      ...baseBlade,
      health: 31,
      maxHealth: 100,
      skillBehavior: {
        ...baseBlade.skillBehavior,
        secondWindSelfHealHpThresholdPercent: 80,
      },
    };
    const nextState = updateSkillSystem(createSkillState([blade]), 1000);

    expect(nextState.entities.blade).toMatchObject({
      health: 31,
    });
    expect(nextState.skillCooldownsByCompanionId?.blade?.second_wind).toBeUndefined();
  });

  it("uses Hold Fast during party danger at the configured use threshold", () => {
    const baseAegis = createCompanion(
      "aegis",
      { x: 0, y: 0 },
      "leader",
      "defender",
      1,
      "aegis",
    );
    const aegis = {
      ...baseAegis,
      health: 3,
      maxHealth: 10,
      skillBehavior: {
        ...baseAegis.skillBehavior,
        holdFastUseHpThresholdPercent: 30,
      },
    };
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: aegis.id,
    };
    const nextState = updateSkillSystem(createSkillState([aegis, enemy]), 1000);

    expect(nextState.skillAbsorbShieldsByCompanionId?.aegis).toMatchObject({
      remainingAbsorb: 1,
      maxAbsorb: 1,
      expiresAt: 6000,
    });
    expect(nextState.statusEffectsById?.["aegis-defenseBuff-hold_fast"]).toMatchObject({
      defenseBonusPercent: 25,
      expiresAt: 11000,
    });
    expect(nextState.statusEffectsById?.["aegis-immobilized-hold_fast"]).toMatchObject({
      expiresAt: 6000,
    });
    expect(nextState.skillCooldownsByCompanionId?.aegis?.hold_fast).toMatchObject({
      skillId: "hold_fast",
      expiresAt: 31000,
    });
  });

  it("does not use Hold Fast above the configured use threshold", () => {
    const baseAegis = createCompanion(
      "aegis",
      { x: 0, y: 0 },
      "leader",
      "defender",
      1,
      "aegis",
    );
    const aegis = {
      ...baseAegis,
      health: 60,
      maxHealth: 100,
      skillBehavior: {
        ...baseAegis.skillBehavior,
        holdFastUseHpThresholdPercent: 50,
      },
    };
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: aegis.id,
    };
    const nextState = updateSkillSystem(createSkillState([aegis, enemy]), 1000);

    expect(nextState.skillCooldownsByCompanionId?.aegis?.hold_fast).toBeUndefined();
    expect(nextState.skillAbsorbShieldsByCompanionId?.aegis?.id).not.toBe(
      "aegis-hold_fast",
    );
    expect(
      nextState.statusEffectsById?.["aegis-defenseBuff-hold_fast"],
    ).toBeUndefined();
  });

  it("does not use Hold Fast without party danger", () => {
    const aegis = createCompanion(
      "aegis",
      { x: 0, y: 0 },
      "leader",
      "defender",
      1,
      "aegis",
    );
    const nextState = updateSkillSystem(createSkillState([aegis]), 1000);

    expect(nextState.skillCooldownsByCompanionId?.aegis?.hold_fast).toBeUndefined();
  });

  it("uses Fake Death during party danger at the configured HP threshold", () => {
    const baseHunter = createCompanion(
      "hunter",
      { x: 0, y: 0 },
      "leader",
      "fighter",
      1,
      "hunter",
    );
    const hunter = {
      ...baseHunter,
      health: 30,
      maxHealth: 100,
      skillBehavior: {
        ...baseHunter.skillBehavior,
        fakeDeathUseHpThresholdPercent: 80,
      },
    };
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: hunter.id,
    };
    const nextState = updateSkillSystem(createSkillState([hunter, enemy]), 1000);

    expect(nextState.statusEffectsById?.["hunter-fakeDeath-fake_death"]).toMatchObject({
      expiresAt: 4000,
    });
    expect(nextState.statusEffectsById?.["hunter-incapacitated-fake_death"]).toMatchObject({
      expiresAt: 4000,
    });
    expect(nextState.skillCooldownsByCompanionId?.hunter?.fake_death).toMatchObject({
      skillId: "fake_death",
      expiresAt: 31000,
    });
  });

  it("does not use Fake Death above the capped threshold", () => {
    const baseHunter = createCompanion(
      "hunter",
      { x: 0, y: 0 },
      "leader",
      "fighter",
      1,
      "hunter",
    );
    const hunter = {
      ...baseHunter,
      health: 31,
      maxHealth: 100,
      skillBehavior: {
        ...baseHunter.skillBehavior,
        fakeDeathUseHpThresholdPercent: 80,
      },
    };
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: hunter.id,
    };
    const nextState = updateSkillSystem(createSkillState([hunter, enemy]), 1000);

    expect(nextState.skillCooldownsByCompanionId?.hunter?.fake_death).toBeUndefined();
    expect(nextState.statusEffectsById?.["hunter-fakeDeath-fake_death"]).toBeUndefined();
  });

  it("uses Woodcutter Rhythm only for wood resources", () => {
    const woodcutter = {
      ...createCompanion("blade", { x: 0, y: 0 }, "leader", "gatherer", 1, "blade"),
      state: "gather" as const,
      currentTargetId: "wood",
    };
    const wood = createResource("wood", { x: 0.5, y: 0 }, {
      resourceType: "wood",
      durability: 3,
      maxDurability: 3,
    });
    const buffedState = updateSkillSystem(
      createSkillState([woodcutter, wood]),
      1000,
    );
    const gatheredState = updateGatherSystem(buffedState, new Set(), 2000);

    expect(buffedState.skillGatherBuffsByCompanionId?.blade).toMatchObject({
      bonusGatherSpeed: 2,
      resourceType: "wood",
      expiresAt: 61000,
    });
    expect(gatheredState.entities.wood).toMatchObject({
      durability: 3,
      quantity: wood.quantity - 1,
    });
  });

  it("does not apply Woodcutter Rhythm to ore resources", () => {
    const woodcutter = {
      ...createCompanion("blade", { x: 0, y: 0 }, "leader", "gatherer", 1, "blade"),
      state: "gather" as const,
      currentTargetId: "ore",
    };
    const ore = createResource("ore", { x: 0.5, y: 0 }, {
      resourceType: "ore",
      durability: 3,
      maxDurability: 3,
    });
    const nextState = updateSkillSystem(createSkillState([woodcutter, ore]), 1000);

    expect(nextState.skillGatherBuffsByCompanionId?.blade).toBeUndefined();
  });

  it("uses Stonebreaker Rhythm only for ore resources", () => {
    const collector = {
      ...createCompanion("aegis", { x: 0, y: 0 }, "leader", "gatherer", 1, "aegis"),
      state: "gather" as const,
      currentTargetId: "ore",
    };
    const ore = createResource("ore", { x: 0.5, y: 0 }, {
      resourceType: "ore",
      durability: 3,
      maxDurability: 3,
    });
    const buffedState = updateSkillSystem(createSkillState([collector, ore]), 1000);
    const gatheredState = updateGatherSystem(buffedState, new Set(), 2000);

    expect(buffedState.skillGatherBuffsByCompanionId?.aegis).toMatchObject({
      bonusGatherSpeed: 2,
      resourceType: "ore",
      expiresAt: 61000,
    });
    expect(gatheredState.entities.ore).toMatchObject({
      durability: 3,
      quantity: ore.quantity - 1,
    });
  });

  it("does not apply Stonebreaker Rhythm to wood resources", () => {
    const collector = {
      ...createCompanion("aegis", { x: 0, y: 0 }, "leader", "gatherer", 1, "aegis"),
      state: "gather" as const,
      currentTargetId: "wood",
    };
    const wood = createResource("wood", { x: 0.5, y: 0 }, {
      resourceType: "wood",
      durability: 3,
      maxDurability: 3,
    });
    const nextState = updateSkillSystem(createSkillState([collector, wood]), 1000);

    expect(nextState.skillGatherBuffsByCompanionId?.aegis).toBeUndefined();
  });

  it("uses Flash Step according to the mobility preference", () => {
    const baseOffensiveBlade = createCompanion(
      "blade",
      { x: 1, y: 3 },
      "leader",
      "none",
      1,
      "blade",
    );
    const offensiveBlade = {
      ...baseOffensiveBlade,
      skillBehavior: {
        ...baseOffensiveBlade.skillBehavior,
        mobilitySkillUseMode: "offensive" as const,
      },
    };
    const baseDefensiveBlade = createCompanion(
      "defensive-blade",
      { x: 3, y: 3 },
      "leader",
      "none",
      1,
      "blade",
    );
    const defensiveBlade = {
      ...baseDefensiveBlade,
      skillBehavior: {
        ...baseDefensiveBlade.skillBehavior,
        mobilitySkillUseMode: "defensive" as const,
      },
    };
    const offensiveEnemy = createEnemy("offensive-enemy", { x: 7, y: 3 });
    const defensiveEnemy = {
      ...createEnemy("defensive-enemy", { x: 4, y: 3 }),
      state: "attack" as const,
      currentTargetId: defensiveBlade.id,
    };
    const offensiveState = updateSkillSystem(
      createSkillState([offensiveBlade, offensiveEnemy], {
        map: createSkillMap(),
        skillSelfBuffsByCompanionId: {
          blade: { companionId: "blade", bonusDamage: 1, expiresAt: 65000 },
        },
        skillPartyClassBuffsByCompanionId: {
          blade: {
            blade: {
              targetId: "blade",
              sourceId: "blade",
              sourceClassId: "blade",
              sourceSkillId: "press_the_opening",
              expiresAt: 65000,
              physicalDamageBonusPercent: 5,
              primaryStatBonusPercentByStat: { strength: 5 },
            },
          },
        },
      }),
      1000,
    );
    const defensiveState = updateSkillSystem(
      createSkillState([defensiveBlade, defensiveEnemy], {
        map: createSkillMap(),
        skillSelfBuffsByCompanionId: {
          "defensive-blade": {
            companionId: "defensive-blade",
            bonusDamage: 1,
            expiresAt: 65000,
          },
        },
        skillPartyClassBuffsByCompanionId: {
          "defensive-blade": {
            blade: {
              targetId: "defensive-blade",
              sourceId: "defensive-blade",
              sourceClassId: "blade",
              sourceSkillId: "press_the_opening",
              expiresAt: 65000,
              physicalDamageBonusPercent: 5,
              primaryStatBonusPercentByStat: { strength: 5 },
            },
          },
        },
        skillDamageMitigationsByCompanionId: {
          "defensive-blade": {
            id: "defensive-blade-blade_parry",
            ownerId: "defensive-blade",
            expiresAt: 65000,
            remainingProcs: 2,
            mitigationPercent: 50,
            mitigatedDamageTypes: ["physical"],
          },
        },
      }),
      1000,
    );

    expect(offensiveState.entities.blade.position.x).toBeGreaterThan(
      offensiveBlade.position.x,
    );
    expect(offensiveState.skillCooldownsByCompanionId?.blade?.flash_step?.skillId).toBe(
      "flash_step",
    );
    expect(defensiveState.entities["defensive-blade"].position.x).toBeLessThan(
      defensiveBlade.position.x,
    );
    expect(
      defensiveState.skillCooldownsByCompanionId?.["defensive-blade"]?.flash_step?.skillId,
    ).toBe("flash_step");
  });

  it("uses Shield Rush according to the mobility preference", () => {
    const baseOffensiveAegis = createCompanion(
      "aegis",
      { x: 1, y: 3 },
      "leader",
      "none",
      1,
      "aegis",
    );
    const offensiveAegis = {
      ...baseOffensiveAegis,
      skillBehavior: {
        ...baseOffensiveAegis.skillBehavior,
        mobilitySkillUseMode: "offensive" as const,
      },
    };
    const baseDefensiveAegis = createCompanion(
      "defensive-aegis",
      { x: 3, y: 3 },
      "leader",
      "none",
      1,
      "aegis",
    );
    const defensiveAegis = {
      ...baseDefensiveAegis,
      skillBehavior: {
        ...baseDefensiveAegis.skillBehavior,
        mobilitySkillUseMode: "defensive" as const,
      },
    };
    const offensiveEnemy = createEnemy("offensive-enemy", { x: 7, y: 3 });
    const defensiveEnemy = {
      ...createEnemy("defensive-enemy", { x: 4, y: 3 }),
      state: "attack" as const,
      currentTargetId: defensiveAegis.id,
    };
    const offensiveState = updateSkillSystem(
      createSkillState([offensiveAegis, offensiveEnemy], {
        map: createSkillMap(),
        ...createAegisEarlierSkillCooldowns("aegis"),
      }),
      1000,
    );
    const defensiveState = updateSkillSystem(
      createSkillState([defensiveAegis, defensiveEnemy], {
        map: createSkillMap(),
        ...createAegisEarlierSkillCooldowns("defensive-aegis"),
      }),
      1000,
    );

    expect(offensiveState.entities.aegis.position.x).toBeGreaterThan(
      offensiveAegis.position.x,
    );
    expect(offensiveState.skillCooldownsByCompanionId?.aegis?.shield_rush?.skillId).toBe(
      "shield_rush",
    );
    expect(defensiveState.entities["defensive-aegis"].position.x).toBeLessThan(
      defensiveAegis.position.x,
    );
    expect(
      defensiveState.skillCooldownsByCompanionId?.["defensive-aegis"]?.shield_rush?.skillId,
    ).toBe("shield_rush");
  });

  it("uses Guard Wall with its custom cooldown when Aegis protection is needed", () => {
    const aegis = {
      ...createCompanion("aegis", { x: 0, y: 0 }, "leader", "defender", 1, "aegis"),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }),
      state: "attack" as const,
      currentTargetId: aegis.id,
    };

    const nextState = updateSkillSystem(
      createSkillState([aegis, enemy], {
        skillCooldownsByCompanionId: {
          aegis: {
            shield_challenge: {
              companionId: "aegis",
              skillId: "shield_challenge",
              expiresAt: 5000,
            },
            hold_fast: {
              companionId: "aegis",
              skillId: "hold_fast",
              expiresAt: 5000,
            },
          },
        },
      }),
      1000,
    );

    expect(nextState.skillCooldownsByCompanionId?.aegis?.guard_wall).toMatchObject({
      skillId: "guard_wall",
      expiresAt: 16000,
    });
    expect(nextState.skillAbsorbShieldsByCompanionId?.aegis).toMatchObject({
      maxAbsorb: expect.any(Number),
      expiresAt: 11000,
    });
  });

  it("sets Beginner non-block buff durations to 9 seconds", () => {
    const deepBreathCaster = createBeginner("fighter", "fighter", { x: 1, y: 1 });
    const deepBreathEnemy = createEnemy("deep-breath-enemy", { x: 6, y: 1 });
    const deepBreathState = updateSkillSystem(
      createSkillState([deepBreathCaster, deepBreathEnemy], {
        map: createSkillMap([{ x: 3, y: 1 }]),
      }),
      1000,
    );

    const rallyCaster = createBeginner("support", "support", { x: 0, y: 0 });
    const rallyAlly = createBeginner("ally", "fighter", { x: 1, y: 0 });
    const rallyEnemy = createEnemy("rally-enemy", { x: 3, y: 0 });
    const rallyState = updateSkillSystem(
      createSkillState([rallyCaster, rallyAlly, rallyEnemy], {
        skillSelfBuffsByCompanionId: {
          support: {
            companionId: "support",
            bonusDamage: 1,
            expiresAt: 5000,
          },
        },
      }),
      1000,
    );

    expect(deepBreathState.skillCooldownsByCompanionId?.fighter?.deep_breath).toMatchObject({
      skillId: "deep_breath",
      expiresAt: 11000,
    });
    expect(deepBreathState.skillSelfBuffsByCompanionId?.fighter?.expiresAt).toBe(
      10000,
    );
    expect(rallyState.skillCooldownsByCompanionId?.support?.rally_call).toMatchObject({
      skillId: "rally_call",
      expiresAt: 11000,
    });
    expect(rallyState.skillSelfBuffsByCompanionId?.ally?.expiresAt).toBe(10000);
  });

  it("prioritizes Rally Call targets by role", () => {
    const support = createBeginner("support", "support", { x: 0, y: 0 });
    const defender = createBeginner("defender", "defender", { x: 1, y: 0 });
    const fighter = createBeginner("fighter", "fighter", { x: 2, y: 0 });
    const gatherer = createBeginner("gatherer", "gatherer", { x: 0, y: 1 });
    const enemy = createEnemy("enemy", { x: 3, y: 0 });

    const nextState = updateSkillSystem(
      createSkillState([support, defender, fighter, gatherer, enemy], {
        skillSelfBuffsByCompanionId: {
          support: {
            companionId: "support",
            bonusDamage: 1,
            expiresAt: 5000,
          },
        },
      }),
      1000,
    );

    expect(nextState.skillSelfBuffsByCompanionId?.fighter?.expiresAt).toBe(
      10000,
    );
    expect(nextState.skillCooldownsByCompanionId?.support?.rally_call).toMatchObject({
      skillId: "rally_call",
    });
  });

  it.each<Companion["role"]>(["support", "gatherer", "none"])(
    "moves %s Quick Step away from an attacking enemy",
    (role) => {
      const companion = createBeginner("companion", role, { x: 3, y: 3 });
      companion.skillBehavior = {
        ...companion.skillBehavior,
        mobilitySkillUseMode: "defensive",
      };
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
      expect(nextState.skillCooldownsByCompanionId?.companion?.quick_step?.skillId).toBe(
        "quick_step",
      );
    },
  );

  it("tries angled Quick Step alternatives when the direct destination is blocked", () => {
    const baseSupport = createBeginner("support", "support", { x: 3, y: 3 });
    const support = {
      ...baseSupport,
      skillBehavior: {
        ...baseSupport.skillBehavior,
        mobilitySkillUseMode: "defensive" as const,
      },
    };
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
    expect(nextState.skillCooldownsByCompanionId?.support?.quick_step?.skillId).toBe(
      "quick_step",
    );
  });

  it("does not start Quick Step cooldown when all candidate destinations are blocked", () => {
    const baseSupport = createBeginner("support", "support", { x: 3, y: 3 });
    const support = {
      ...baseSupport,
      skillBehavior: {
        ...baseSupport.skillBehavior,
        mobilitySkillUseMode: "defensive" as const,
      },
    };
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
    expect(nextState.globalCooldownsByCompanionId?.support).toBeUndefined();
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

function createAegisEarlierSkillCooldowns(companionId: string): Partial<GameState> {
  return {
    skillCooldownsByCompanionId: {
      [companionId]: {
        shield_challenge: {
          companionId,
          skillId: "shield_challenge",
          expiresAt: 5000,
        },
        hold_fast: {
          companionId,
          skillId: "hold_fast",
          expiresAt: 5000,
        },
        guard_wall: {
          companionId,
          skillId: "guard_wall",
          expiresAt: 5000,
        },
        iron_stance: {
          companionId,
          skillId: "iron_stance",
          expiresAt: 5000,
        },
        shield_formation: {
          companionId,
          skillId: "shield_formation",
          expiresAt: 5000,
        },
      },
    },
  };
}
