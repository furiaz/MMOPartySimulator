import type { GameState } from "./state";
import type { Companion, PrimaryStatId, SkillDefinition } from "./types";

export function applyOverchargeToSkillDefinition(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now = Date.now(),
): SkillDefinition {
  const overcharge = getActiveOvercharge(state, caster, skill, now);

  if (!overcharge) {
    return skill;
  }

  return scaleSkillEffect(skill, 1 + overcharge.skillPowerBonusPercent / 100);
}

export function getOverchargedSkillCooldownMs(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  cooldownMs: number,
  now = Date.now(),
): number {
  const overcharge = getActiveOvercharge(state, caster, skill, now);

  return overcharge
    ? Math.round(cooldownMs * (1 + overcharge.cooldownPenaltyPercent / 100))
    : cooldownMs;
}

function getActiveOvercharge(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
) {
  if (skill.id === "overcharge") {
    return undefined;
  }

  const overcharge = state.skillOverchargesByCompanionId?.[caster.id];

  return overcharge && overcharge.expiresAt > now ? overcharge : undefined;
}

function scaleSkillEffect(
  skill: SkillDefinition,
  multiplier: number,
): SkillDefinition {
  const { effect } = skill;

  switch (effect.type) {
    case "damage":
    case "lungeDamage":
    case "skirmishShot":
    case "arrowBurst":
    case "pounce":
    case "maulSweep":
    case "shockwave":
    case "heal":
    case "selfCostHeal":
    case "circleOfRenewal":
      return {
        ...skill,
        effect: {
          ...effect,
          powerMultiplier: effect.powerMultiplier * multiplier,
        },
      };
    case "flagellantLash":
      return {
        ...skill,
        effect: {
          ...effect,
          powerMultiplier: effect.powerMultiplier * multiplier,
          bleedDamageAttackPowerPercent:
            effect.bleedDamageAttackPowerPercent * multiplier,
        },
      };
    case "sweepingDamage":
      return {
        ...skill,
        effect: {
          ...effect,
          mainPowerMultiplier: effect.mainPowerMultiplier * multiplier,
          splashPowerMultiplier: effect.splashPowerMultiplier * multiplier,
        },
      };
    case "taunt":
      return {
        ...skill,
        effect: {
          ...effect,
          powerMultiplier: effect.powerMultiplier
            ? effect.powerMultiplier * multiplier
            : undefined,
        },
      };
    case "pinningShot":
      return {
        ...skill,
        effect: {
          ...effect,
          durationMs: Math.round(effect.durationMs * multiplier),
        },
      };
    case "barrierBlock":
      return {
        ...skill,
        effect: {
          ...effect,
          blocks: Math.ceil(effect.blocks * multiplier),
          healPercentMaxHealthOnConsume: effect.healPercentMaxHealthOnConsume
            ? effect.healPercentMaxHealthOnConsume * multiplier
            : undefined,
        },
      };
    case "rewindRune":
      return {
        ...skill,
        effect: {
          ...effect,
          healPercentRecordedDamage:
            effect.healPercentRecordedDamage * multiplier,
        },
      };
    case "fakeDeath":
      return {
        ...skill,
        effect: {
          ...effect,
          nextAttackDamageMultiplierBonus:
            effect.nextAttackDamageMultiplierBonus * multiplier,
        },
      };
    case "selfBuff":
      return {
        ...skill,
        effect: {
          ...effect,
          bonusDamage: effect.bonusDamage * multiplier,
          movementSpeedBonusPercent: effect.movementSpeedBonusPercent
            ? effect.movementSpeedBonusPercent * multiplier
            : undefined,
        },
      };
    case "allyBuff":
    case "partyBuff":
      return {
        ...skill,
        effect: {
          ...effect,
          bonusDamage: effect.bonusDamage * multiplier,
        },
      };
    case "partyClassBuff":
      return {
        ...skill,
        effect: {
          ...effect,
          primaryStatBonusPercentByStat:
            effect.primaryStatBonusPercentByStat &&
            scalePrimaryStatPercentages(
              effect.primaryStatBonusPercentByStat,
              multiplier,
            ),
          physicalDamageBonusPercent: effect.physicalDamageBonusPercent
            ? effect.physicalDamageBonusPercent * multiplier
            : undefined,
          magicDamageBonusPercent: effect.magicDamageBonusPercent
            ? effect.magicDamageBonusPercent * multiplier
            : undefined,
          mitigationPercent: effect.mitigationPercent
            ? effect.mitigationPercent * multiplier
            : undefined,
          poisonCoating: effect.poisonCoating
            ? {
                ...effect.poisonCoating,
                poisonDamageAttackPowerPercent:
                  effect.poisonCoating.poisonDamageAttackPowerPercent *
                  multiplier,
              }
            : undefined,
        },
      };
    case "partyPoisonCoating":
      return {
        ...skill,
        effect: {
          ...effect,
          poisonDamageAttackPowerPercent:
            effect.poisonDamageAttackPowerPercent * multiplier,
        },
      };
    case "gatherBuff":
      return {
        ...skill,
        effect: {
          ...effect,
          bonusGatherSpeed: effect.bonusGatherSpeed * multiplier,
        },
      };
    case "manaShield":
      return {
        ...skill,
        effect: {
          ...effect,
          absorbPercentMaxHealth: effect.absorbPercentMaxHealth * multiplier,
        },
      };
    case "frostArmor":
      return {
        ...skill,
        effect: {
          ...effect,
          defenseBonusPercent: effect.defenseBonusPercent * multiplier,
          mitigationPercent: effect.mitigationPercent * multiplier,
        },
      };
    case "lifestealBuff":
      return {
        ...skill,
        effect: {
          ...effect,
          lifestealPercent: effect.lifestealPercent * multiplier,
        },
      };
    case "flameStep":
      return {
        ...skill,
        effect: {
          ...effect,
          burnDamageMagicPowerPercent:
            effect.burnDamageMagicPowerPercent * multiplier,
          },
      };
    case "runeStep":
      return {
        ...skill,
        effect: {
          ...effect,
          trapImmobilizeDurationMs: Math.round(
            effect.trapImmobilizeDurationMs * multiplier,
          ),
        },
      };
    case "cursedRay":
      return {
        ...skill,
        effect: {
          ...effect,
          durationMs: Math.round(effect.durationMs * multiplier),
        },
      };
    case "dawnStep":
      return {
        ...skill,
        effect: {
          ...effect,
          disarmDurationMs: Math.round(effect.disarmDurationMs * multiplier),
        },
      };
    case "whipPrison":
      return {
        ...skill,
        effect: {
          ...effect,
          bleedDamageAttackPowerPercent:
            effect.bleedDamageAttackPowerPercent * multiplier,
        },
      };
    case "sacrificeHeal":
      return {
        ...skill,
        effect: {
          ...effect,
          healSacrificeMultiplier: effect.healSacrificeMultiplier * multiplier,
        },
      };
    case "eternalHope":
      return {
        ...skill,
        effect: {
          ...effect,
          healSacrificeMultiplier: effect.healSacrificeMultiplier * multiplier,
          mitigationPercent: effect.mitigationPercent * multiplier,
        },
      };
    case "atonementStep":
      return {
        ...skill,
        effect: {
          ...effect,
          healSacrificeMultiplier: effect.healSacrificeMultiplier * multiplier,
        },
      };
    case "healOverTime":
      return {
        ...skill,
        effect: {
          ...effect,
          healPercentMaxHealth: effect.healPercentMaxHealth * multiplier,
        },
      };
    case "fireBurst":
      return {
        ...skill,
        effect: {
          ...effect,
          powerMultiplier: effect.powerMultiplier * multiplier,
          burnDamageMagicPowerPercent:
            effect.burnDamageMagicPowerPercent * multiplier,
        },
      };
    case "damageMitigation":
      return {
        ...skill,
        effect: {
          ...effect,
          mitigationPercent: effect.mitigationPercent * multiplier,
        },
      };
    case "absorbShield":
      return {
        ...skill,
        effect: {
          ...effect,
          absorbPercentMaxHealth: effect.absorbPercentMaxHealth * multiplier,
        },
      };
    case "holdFast":
      return {
        ...skill,
        effect: {
          ...effect,
          defenseBonusPercent: effect.defenseBonusPercent * multiplier,
          absorbPercentMaxHealth: effect.absorbPercentMaxHealth * multiplier,
        },
      };
    case "selfMitigationBuff":
    case "partyMitigationBuff":
      return {
        ...skill,
        effect: {
          ...effect,
          mitigationPercent: effect.mitigationPercent * multiplier,
        },
      };
    case "selfPercentHeal":
      return {
        ...skill,
        effect: {
          ...effect,
          healPercent: effect.healPercent * multiplier,
        },
      };
    default:
      return skill;
  }
}

function scalePrimaryStatPercentages(
  percentages: Partial<Record<PrimaryStatId, number>>,
  multiplier: number,
): Partial<Record<PrimaryStatId, number>> {
  return Object.fromEntries(
    Object.entries(percentages).map(([statId, percent]) => [
      statId,
      percent * multiplier,
    ]),
  ) as Partial<Record<PrimaryStatId, number>>;
}
