import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  getActiveHeadhunterKillTimestamps,
  getHeadhunterCriticalChanceBonus,
  getMartialPassiveDamageBonusPercent,
  getRootedBastionDefenseBonusPercent,
  getUnbrokenLineDamageReductionPercent,
  grantRiposteTrainingCharge,
  prepareDuelistsMomentumForDirectAttack,
  recordHeadhunterPartyKill,
  recordSuccessfulDirectPhysicalHit,
  updateMartialPassiveRuntime,
} from "./martialPassives";
import { addEntity } from "./state";
import { applyIncomingDamageMitigation } from "./skillRuntime";
import { applyStatusEffect, updateStatusEffects } from "./statusEffects";
import { grantCharacterXpToParty } from "./leveling";
import { createTestGameState } from "./testState";
import type { Companion, Enemy, GameEntity } from "./types";

describe("martial first-class passives", () => {
  it("uses existing Momentum stacks, Riposte, and control additively", () => {
    const blade = withRanks(
      createCompanion("blade", { x: 0, y: 0 }, "blade", "none", 1, "blade"),
      {
        duelists_momentum: 1,
        riposte_training: 1,
      },
    );
    const hunter = createCompanion(
      "hunter",
      { x: 0, y: 0 },
      "hunter",
      "none",
      1,
      "hunter",
    );
    const target = createEnemy("target", { x: 1, y: 0 }, "aggressive");
    const state = createState([hunter, target], {
      simulationTimeMs: 1_000,
      duelistsMomentumByCompanionId: {
        [blade.id]: { companionId: blade.id, targetId: target.id, stacks: 2 },
      },
      riposteTrainingByCompanionId: {
        [blade.id]: { companionId: blade.id, expiresAt: 5_000 },
      },
      statusEffectsById: {
        snare: {
          id: "snare",
          type: "immobilized",
          targetId: target.id,
          sourceId: hunter.id,
          appliedAt: 0,
          expiresAt: 5_000,
        },
      },
    });

    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        blade,
        target,
        "physical",
        "direct",
      ),
    ).toBe(7);
    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        hunter,
        target,
        "physical",
        "direct",
      ),
    ).toBe(3);
  });

  it("applies Blood Scent to physical direct and bleed damage and Pack Instinct to all damage", () => {
    const beast = createCompanion(
      "beast",
      { x: 0, y: 0 },
      "beast",
      "none",
      1,
      "beast",
    );
    const ally = createCompanion("ally", { x: 1, y: 1 }, "beast");
    const target = {
      ...createEnemy("target", { x: 1, y: 0 }, "aggressive", { maxHealth: 100 }),
      health: 30,
    };
    const state = createState([beast, ally, target]);

    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        beast,
        target,
        "physical",
        "direct",
      ),
    ).toBe(5);
    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        beast,
        target,
        "physical",
        "dot",
      ),
    ).toBe(5);
    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        beast,
        target,
        "magic",
        "dot",
      ),
    ).toBe(2);
  });

  it("uses only the strongest Unbroken Line and never protects its taunter", () => {
    const firstAegis = createCompanion(
      "aegis-1",
      { x: 0, y: 0 },
      "aegis-1",
      "none",
      1,
      "aegis",
    );
    const secondAegis = withRanks(
      createCompanion(
        "aegis-2",
        { x: 0, y: 1 },
        "aegis-1",
        "none",
        2,
        "aegis",
      ),
      { unbroken_line: 5 },
    );
    const ally = createCompanion("ally", { x: 1, y: 0 }, "aegis-1");
    const enemy = createEnemy("enemy", { x: 2, y: 0 }, "aggressive");
    const state = createState([firstAegis, secondAegis, ally, enemy], {
      statusEffectsById: {
        first: {
          id: "first",
          type: "taunted",
          targetId: enemy.id,
          sourceId: firstAegis.id,
          appliedAt: 0,
          expiresAt: 10_000,
        },
        second: {
          id: "second",
          type: "taunted",
          targetId: enemy.id,
          sourceId: secondAegis.id,
          appliedAt: 0,
          expiresAt: 10_000,
        },
      },
    });

    expect(getUnbrokenLineDamageReductionPercent(state, enemy, ally)).toBe(15);
    expect(getUnbrokenLineDamageReductionPercent(state, enemy, secondAegis)).toBe(3);
  });

  it("builds Headhunter stacks at the rank cap, replaces the oldest, and expires them", () => {
    const hunter = createCompanion(
      "hunter",
      { x: 0, y: 0 },
      "hunter",
      "none",
      1,
      "hunter",
    );
    let state = createState([hunter]);

    state = recordHeadhunterPartyKill(state, 1_000);
    state = recordHeadhunterPartyKill(state, 2_000);
    state = recordHeadhunterPartyKill(state, 3_000);
    state = recordHeadhunterPartyKill(state, 4_000);

    expect(getActiveHeadhunterKillTimestamps(state, hunter.id, 4_000)).toEqual([
      2_000,
      3_000,
      4_000,
    ]);
    expect(getHeadhunterCriticalChanceBonus(state, hunter, 4_000)).toBe(0.03);
    expect(getHeadhunterCriticalChanceBonus(state, hunter, 33_000)).toBe(0.01);
    expect(getHeadhunterCriticalChanceBonus(state, hunter, 34_000)).toBe(0);
  });

  it("activates Rooted Bastion after five seconds and resets it on movement", () => {
    const aegis = createCompanion(
      "aegis",
      { x: 0, y: 0 },
      "aegis",
      "none",
      1,
      "aegis",
    );
    let state = updateMartialPassiveRuntime(createState([aegis]), 0);
    state = updateMartialPassiveRuntime(state, 5_000);
    expect(getRootedBastionDefenseBonusPercent(state, aegis)).toBe(3);

    const movedAegis = { ...aegis, position: { x: 1, y: 0 } };
    state = {
      ...state,
      entities: { ...state.entities, [aegis.id]: movedAegis },
    };
    state = updateMartialPassiveRuntime(state, 5_100, new Set([aegis.id]));
    expect(getRootedBastionDefenseBonusPercent(state, movedAegis)).toBe(0);
  });

  it("clears Momentum on a different attempted target and builds after successful hits", () => {
    const blade = createCompanion(
      "blade",
      { x: 0, y: 0 },
      "blade",
      "none",
      1,
      "blade",
    );
    const first = createEnemy("first", { x: 1, y: 0 }, "aggressive");
    const second = createEnemy("second", { x: 1, y: 1 }, "aggressive");
    let state = createState([blade, first, second], {
      duelistsMomentumByCompanionId: {
        [blade.id]: { companionId: blade.id, targetId: first.id, stacks: 2 },
      },
    });

    state = prepareDuelistsMomentumForDirectAttack(state, blade, second, "physical");
    expect(state.duelistsMomentumByCompanionId?.[blade.id]).toBeUndefined();
    state = recordSuccessfulDirectPhysicalHit(state, blade, second);
    state = recordSuccessfulDirectPhysicalHit(state, blade, second);
    expect(state.duelistsMomentumByCompanionId?.[blade.id]?.stacks).toBe(2);
  });

  it("refreshes and consumes Riposte Training only through a successful physical hit", () => {
    const blade = createCompanion(
      "blade",
      { x: 0, y: 0 },
      "blade",
      "none",
      1,
      "blade",
    );
    const enemy = createEnemy("enemy", { x: 1, y: 0 }, "aggressive");
    let state = createState([blade, enemy]);
    state = grantRiposteTrainingCharge(state, blade, 1_000);
    state = grantRiposteTrainingCharge(state, blade, 2_000);
    expect(state.riposteTrainingByCompanionId?.[blade.id]?.expiresAt).toBe(12_000);
    state = recordSuccessfulDirectPhysicalHit(state, blade, enemy);
    expect(state.riposteTrainingByCompanionId?.[blade.id]).toBeUndefined();
  });

  it("primes Riposte Training when Blade Parry mitigation is consumed", () => {
    const blade = createCompanion(
      "blade",
      { x: 0, y: 0 },
      "blade",
      "none",
      1,
      "blade",
    );
    const state = createState([blade], {
      skillDamageMitigationsByCompanionId: {
        [blade.id]: {
          id: "parry",
          ownerId: blade.id,
          sourceSkillId: "blade_parry",
          expiresAt: 10_000,
          remainingProcs: 1,
          mitigationPercent: 50,
        },
      },
    });

    const result = applyIncomingDamageMitigation(
      state,
      blade,
      10,
      "physical",
      1_000,
    );
    expect(result.mitigatedDamage).toBe(5);
    expect(result.state.riposteTrainingByCompanionId?.[blade.id]?.expiresAt).toBe(
      11_000,
    );
  });

  it("uses every approved rank-5 martial passive value", () => {
    const blade = withRanks(
      createCompanion("blade", { x: 0, y: 0 }, "blade", "none", 1, "blade"),
      { duelists_momentum: 5, riposte_training: 5 },
    );
    const aegis = withRanks(
      createCompanion("aegis", { x: 0, y: 1 }, "blade", "none", 2, "aegis"),
      { rooted_bastion: 5, unbroken_line: 5 },
    );
    const hunter = withRanks(
      createCompanion("hunter", { x: 0, y: 2 }, "blade", "none", 3, "hunter"),
      { headhunter: 5, exploit_the_snare: 5 },
    );
    const beast = withRanks(
      createCompanion("beast", { x: 0, y: 3 }, "blade", "none", 4, "beast"),
      { blood_scent: 5, pack_instinct: 5 },
    );
    const ally = createCompanion("ally", { x: 1, y: 0 }, "blade");
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 1 }, "aggressive", { maxHealth: 100 }),
      health: 30,
    };
    let state = createState([blade, aegis, hunter, beast, ally, enemy], {
      simulationTimeMs: 1_000,
      duelistsMomentumByCompanionId: {
        [blade.id]: { companionId: blade.id, targetId: enemy.id, stacks: 2 },
      },
      riposteTrainingByCompanionId: {
        [blade.id]: { companionId: blade.id, expiresAt: 5_000 },
      },
      rootedBastionByCompanionId: {
        [aegis.id]: {
          companionId: aegis.id,
          position: aegis.position,
          stationarySince: 0,
          active: true,
        },
      },
      statusEffectsById: {
        control: {
          id: "control",
          type: "silenced",
          targetId: enemy.id,
          sourceId: hunter.id,
          appliedAt: 0,
          expiresAt: 5_000,
        },
        taunt: {
          id: "taunt",
          type: "taunted",
          targetId: enemy.id,
          sourceId: aegis.id,
          appliedAt: 0,
          expiresAt: 5_000,
        },
      },
    });

    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        blade,
        enemy,
        "physical",
        "direct",
        1_000,
      ),
    ).toBe(35);
    expect(getRootedBastionDefenseBonusPercent(state, aegis)).toBe(15);
    expect(getUnbrokenLineDamageReductionPercent(state, enemy, ally, 1_000)).toBe(15);
    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        hunter,
        enemy,
        "physical",
        "direct",
        1_000,
      ),
    ).toBe(15);
    expect(
      getMartialPassiveDamageBonusPercent(
        state,
        beast,
        enemy,
        "physical",
        "direct",
        1_000,
      ),
    ).toBe(25);

    for (let kill = 0; kill < 8; kill += 1) {
      state = recordHeadhunterPartyKill(state, 1_000 + kill);
    }
    expect(getHeadhunterCriticalChanceBonus(state, hunter, 2_000)).toBe(0.07);
  });

  it("does not add Headhunter stacks for zero-XP enemies", () => {
    const hunter = createCompanion(
      "hunter",
      { x: 0, y: 0 },
      "hunter",
      "none",
      1,
      "hunter",
    );
    const targetDummy = createEnemy(
      "dummy",
      { x: 1, y: 0 },
      "passive",
      { isTargetDummy: true, xpReward: 0 },
    );
    const state = grantCharacterXpToParty(
      createState([hunter, targetDummy]),
      targetDummy,
      hunter.id,
      1_000,
    );

    expect(state.headhunterByCompanionId?.[hunter.id]).toBeUndefined();
  });

  it("rechecks Blood Scent independently as overdue bleed ticks cross 30% health", () => {
    const beast = withRanks(
      createCompanion("beast", { x: 0, y: 0 }, "beast", "none", 1, "beast"),
      { blood_scent: 5 },
    );
    const enemy = {
      ...createEnemy("enemy", { x: 1, y: 0 }, "aggressive", { maxHealth: 100 }),
      health: 32,
    };
    const state = applyStatusEffect(
      createState([beast, enemy]),
      {
        type: "bleed",
        targetId: enemy.id,
        sourceId: beast.id,
        sourceKey: "rank-five-bleed",
        durationMs: 2_000,
        tickDamage: 10,
        tickIntervalMs: 1_000,
      },
      0,
    );

    const nextState = updateStatusEffects(state, 2_000);
    expect((nextState.entities[enemy.id] as Enemy).health).toBe(10);
  });

  it("rechecks Pack Instinct proximity for each DoT update", () => {
    const beast = withRanks(
      createCompanion("beast", { x: 0, y: 0 }, "beast", "none", 1, "beast"),
      { pack_instinct: 5 },
    );
    const ally = createCompanion("ally", { x: 1, y: 1 }, "beast");
    const enemy = createEnemy("enemy", { x: 1, y: 0 }, "aggressive", {
      maxHealth: 100,
    });
    let state = applyStatusEffect(
      createState([beast, ally, enemy]),
      {
        type: "poison",
        targetId: enemy.id,
        sourceId: beast.id,
        sourceKey: "pack-poison",
        durationMs: 2_000,
        tickDamage: 10,
        tickIntervalMs: 1_000,
      },
      0,
    );
    state = updateStatusEffects(state, 1_000);
    state = {
      ...state,
      entities: {
        ...state.entities,
        [ally.id]: { ...ally, position: { x: 10, y: 10 } },
      },
    };
    state = updateStatusEffects(state, 2_000);

    expect((state.entities[enemy.id] as Enemy).health).toBe(79);
  });
});

function createState(
  entities: GameEntity[],
  overrides: Parameters<typeof createTestGameState>[0] = {},
) {
  return entities.reduce(
    addEntity,
    createTestGameState({ partyLeaderId: entities[0]?.id ?? "", ...overrides }),
  );
}

function withRanks(
  companion: Companion,
  ranksBySkillId: NonNullable<Companion["skillProgression"]>["ranksBySkillId"],
): Companion {
  return {
    ...companion,
    skillProgression: {
      ...(companion.skillProgression ?? {
        ranksBySkillId: {},
        legacyEnabledSkillIds: [],
      }),
      ranksBySkillId: {
        ...(companion.skillProgression?.ranksBySkillId ?? {}),
        ...ranksBySkillId,
      },
    },
  };
}
