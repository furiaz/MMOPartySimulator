import { describe, expect, it } from "vitest";
import { createTestGameState } from "./game/testState";
import { getCompanionBuffDisplayEntries } from "./companionBuffPresentation";
import type { SkillId } from "./game";

const companionId = "companion";
const now = 100_000;

describe("companion buff presentation", () => {
  it("sorts timed buffs by lowest remaining time and untimed buffs last", () => {
    const state = createTestGameState({
      skillSelfBuffsByCompanionId: {
        [companionId]: {
          companionId,
          sourceSkillId: "edge_focus",
          bonusDamage: 1,
          expiresAt: now + 30_000,
        },
      },
      skillGatherBuffsByCompanionId: {
        [companionId]: {
          companionId,
          sourceSkillId: "woodcutter_rhythm",
          bonusGatherSpeed: 2,
          expiresAt: now + 10_000,
          resourceType: "wood",
        },
      },
      skillManaShieldsByCompanionId: {
        [companionId]: {
          id: `${companionId}-mana_shield`,
          ownerId: companionId,
          sourceSkillId: "mana_shield",
          remainingAbsorb: 10,
          maxAbsorb: 10,
        },
      },
      skillRunicFocusByCompanionId: {
        [companionId]: {
          companionId,
          skillId: "runic_focus",
        },
      },
    });

    const entries = getCompanionBuffDisplayEntries({
      companionId,
      currentTime: now,
      gameState: state,
    });

    expect(entries.map((entry) => entry.skillId)).toEqual([
      "woodcutter_rhythm",
      "edge_focus",
      "mana_shield",
      "runic_focus",
    ]);
    expect(entries[0].isExpiring).toBe(true);
    expect(entries[2].isUntimed).toBe(true);
    expect(entries[2].tooltip).toContain("Active");
  });

  it("merges multiple active effects from one skill into one icon", () => {
    const state = createTestGameState({
      skillSelfMitigationBuffsByCompanionId: {
        [companionId]: {
          id: `${companionId}-eternal_hope`,
          sourceId: companionId,
          sourceSkillId: "eternal_hope",
          mitigationPercent: 20,
          expiresAt: now + 25_000,
        },
      },
      skillHealOverTimesByCompanionId: {
        [companionId]: {
          id: `${companionId}-eternal_hope`,
          targetId: companionId,
          sourceId: companionId,
          sourceSkillId: "eternal_hope",
          healAmountPerTick: 4,
          tickIntervalMs: 3_000,
          nextTickAt: now + 3_000,
          expiresAt: now + 25_000,
        },
      },
    });

    const entries = getCompanionBuffDisplayEntries({
      companionId,
      currentTime: now,
      gameState: state,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].skillId).toBe("eternal_hope");
    expect(entries[0].effectLines).toEqual([
      "Heals 4 HP/3s: 25s",
      "Mitigation +20%: 25s",
    ]);
  });

  it("shows precise trimmed Overcharge values", () => {
    const state = createTestGameState({
      skillOverchargesByCompanionId: {
        [companionId]: {
          companionId,
          sourceSkillId: "overcharge",
          skillPowerBonusPercent: 26.25,
          cooldownPenaltyPercent: 33,
          expiresAt: now + 30_000,
        },
      },
    });

    const entries = getCompanionBuffDisplayEntries({
      companionId,
      currentTime: now,
      gameState: state,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].effectLines).toEqual([
      "Skill power +26.25%, cooldowns +33%: 30s",
    ]);
  });

  it("caps visible buffs at eight with lowest remaining timed buffs first", () => {
    const skillIds: SkillId[] = [
      "deep_breath",
      "edge_focus",
      "woodcutter_rhythm",
      "guard_up",
      "blade_parry",
      "blood_feast",
      "frost_armor",
      "guiding_light",
      "eternal_hope",
    ];
    const state = createTestGameState({
      skillShieldBlocksById: Object.fromEntries(
        skillIds.map((skillId, index) => [
          `${companionId}-${skillId}`,
          {
            id: `${companionId}-${skillId}`,
            ownerId: companionId,
            sourceSkillId: skillId,
            position: { x: 0, y: 0 },
            rotationRadians: 0,
            remainingBlocks: 1,
            expiresAt: now + (index + 1) * 1_000,
          },
        ]),
      ),
    });

    const entries = getCompanionBuffDisplayEntries({
      companionId,
      currentTime: now,
      gameState: state,
    });

    expect(entries.map((entry) => entry.skillId)).toEqual(skillIds.slice(0, 8));
  });

  it("includes beneficial status effects and excludes debuffs", () => {
    const state = createTestGameState({
      statusEffectsById: {
        fakeDeath: {
          id: `${companionId}-fakeDeath-fake_death`,
          type: "fakeDeath",
          targetId: companionId,
          sourceId: companionId,
          sourceKey: "fake_death",
          appliedAt: now,
          expiresAt: now + 3_000,
        },
        poison: {
          id: `${companionId}-poison-poison_coating`,
          type: "poison",
          targetId: companionId,
          sourceId: "enemy",
          sourceKey: "poison_coating",
          appliedAt: now,
          expiresAt: now + 4_000,
          tickDamage: 1,
          tickIntervalMs: 2_000,
          nextTickAt: now + 2_000,
          baseDurationMs: 4_000,
          maxDurationMs: 12_000,
        },
      },
    });

    const entries = getCompanionBuffDisplayEntries({
      companionId,
      currentTime: now,
      gameState: state,
    });

    expect(entries.map((entry) => entry.skillId)).toEqual(["fake_death"]);
    expect(entries[0].effectLines).toEqual([
      "Drops aggro; temporarily incapacitated: 3s",
    ]);
  });
});
