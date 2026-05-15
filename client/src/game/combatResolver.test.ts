import { describe, expect, it } from "vitest";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { createCompanion, createEnemy } from "./entities";
import { addEntity } from "./state";
import { createTestGameState } from "./testState";
import type { CompanionPrimaryStats, GameEntity } from "./types";

describe("combat resolver", () => {
  it("applies physical companion attack power through the shared resolver", () => {
    const attacker = withStats(
      createCompanion("attacker", { x: 0, y: 0 }, "attacker"),
      { strength: 10, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1 },
    );
    const target = createEnemy("target", { x: 1, y: 0 }, "passive", {
      maxHealth: 50,
    });

    const result = resolveAndApplyCombatDamage(
      createState([attacker, target]),
      attacker,
      target,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: true,
        allowPassiveBlock: true,
        now: 1000,
        rng: () => 0.99,
      },
    );

    expect(result.finalDamage).toBe(11);
    expect(result.target.health).toBe(39);
  });

  it("uses magic power and magic defense for magic damage", () => {
    const attacker = withStats(
      createCompanion("attacker", { x: 0, y: 0 }, "attacker"),
      { strength: 1, dexterity: 1, constitution: 1, intelligence: 100, wisdom: 1 },
    );
    const target = withStats(
      createCompanion("target", { x: 1, y: 0 }, "attacker"),
      { strength: 1, dexterity: 1, constitution: 1, intelligence: 0, wisdom: 100 },
    );

    const result = resolveAndApplyCombatDamage(
      createState([attacker, target]),
      attacker,
      target,
      {
        damageType: "magic",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: true,
        now: 1000,
        rng: () => 0.99,
      },
    );

    expect(result.targetMagicDefense).toBe(50);
    expect(result.defenseReduction).toBeCloseTo(0.3);
    expect(result.finalDamage).toBe(70);
  });

  it("can deterministically evade, block, and crit", () => {
    const attacker = withStats(
      createCompanion("attacker", { x: 0, y: 0 }, "attacker"),
      { strength: 10, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1 },
    );
    const target = withStats(
      createCompanion("target", { x: 1, y: 0 }, "attacker"),
      { strength: 10, dexterity: 1, constitution: 20, intelligence: 1, wisdom: 1 },
    );
    const rolls = [0.99, 0, 0];

    const result = resolveAndApplyCombatDamage(
      createState([attacker, target]),
      attacker,
      target,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: true,
        allowPassiveBlock: true,
        now: 1000,
        rng: () => rolls.shift() ?? 0.99,
      },
    );

    expect(result.evaded).toBe(false);
    expect(result.passiveBlocked).toBe(true);
    expect(result.critical).toBe(true);
    expect(result.finalDamage).toBeGreaterThanOrEqual(1);
  });

  it("uses minimum one damage after mitigation unless evaded", () => {
    const attacker = createEnemy("attacker", { x: 0, y: 0 }, "aggressive");
    const target = withStats(
      createCompanion("target", { x: 1, y: 0 }, "target"),
      { strength: 1, dexterity: 1, constitution: 1000, intelligence: 1, wisdom: 1 },
    );

    const result = resolveAndApplyCombatDamage(
      createState([attacker, target]),
      attacker,
      target,
      {
        damageType: "physical",
        powerMultiplier: 1,
        allowEvasion: false,
        allowPassiveBlock: false,
        now: 1000,
        rng: () => 0.99,
      },
    );

    expect(result.finalDamage).toBe(1);
  });
});

function createState(entities: GameEntity[]) {
  return entities.reduce(addEntity, createTestGameState({ partyLeaderId: "attacker" }));
}

function withStats<T extends ReturnType<typeof createCompanion>>(
  companion: T,
  naturalStats: CompanionPrimaryStats,
): T {
  return {
    ...companion,
    naturalStats,
  };
}
