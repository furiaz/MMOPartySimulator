import { getCompanionAoeVariant } from "./companionAoeVariants";
import { getFirstAidHealingEffectiveness, getSkillPreferenceControls } from "./skillBehavior";
import { getCompanionSkillRank, getScaledSkillDefinitionForCompanion } from "./skillProgression";
import { SKILL_DEFINITIONS } from "./skills";
import type { Companion, SkillId, SkillPreferenceValues } from "./types";

/** UI read model, calculated from the same authored patterns and rank scaling as combat. */
export function getSkillPreferenceOptionDetails(companion: Companion, skillId: SkillId, key: keyof SkillPreferenceValues, value: string | number | boolean): string {
  const control = getSkillPreferenceControls(skillId).find(candidate => candidate.key === key);
  const description = control?.choices?.find(option => option.value === value)?.description ?? control?.description ?? "";
  if (skillId === "first_aid" && typeof value === "number")
    return `${description} Healing effectiveness at this threshold: ${Number((getFirstAidHealingEffectiveness(value) * 100).toFixed(1))}%.`;
  if (key !== "variant") return description;
  const skill = getScaledSkillDefinitionForCompanion(companion, SKILL_DEFINITIONS[skillId]);
  const variant = getCompanionAoeVariant(skillId, value);
  const effect = skill.effect;
  const power = effect.type === "sweepingDamage" ? effect.mainPowerMultiplier
    : "powerMultiplier" in effect ? effect.powerMultiplier : undefined;
  const potency = power === undefined ? "" : ` Rank ${getCompanionSkillRank(companion, skillId)}: ${Number((power * (variant?.powerMultiplier ?? 1) * 100).toFixed(2))}% of ${effect.type === "circleOfRenewal" ? "Healing Power" : "damageType" in effect && effect.damageType === "magic" ? "Magic Power" : "Attack"}, before combat modifiers.`;
  const controlText = effect.type === "maulSweep" ? ` Disarms for ${effect.disarmDurationMs / 1000} seconds.`
    : effect.type === "dawnStep" || effect.type === "atonementStep" ? ` Disarm lasts ${effect.disarmDurationMs / 1000} seconds where this mode applies it.` : "";
  return `${description}${potency}${controlText}`;
}
