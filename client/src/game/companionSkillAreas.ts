import { getCombatTargetPosition, isLivingHostileTarget } from "./combatStructures";
import { getCompanionAoeVariant, resolveCompanionAoeArea } from "./companionAoeVariants";
import { getSkillPreferences } from "./skillBehavior";
import { getPartyCombatTarget } from "./partyTargetSystem";
import type { GameState } from "./state";
import type { Companion, CompanionAoeVariantId, Position, ResolvedAoeArea, SkillDefinition } from "./types";

export type PreparedCompanionSkillArea = {
  area: ResolvedAoeArea;
  variantId?: CompanionAoeVariantId;
  powerMultiplier: number;
};

/** One simulation-owned snapshot shared by each cast's recipients and presentation. */
export function prepareCompanionSkillArea(
  state: GameState, caster: Companion, skill: SkillDefinition,
  targetPosition?: Position, mobilityOrigin?: Position,
): PreparedCompanionSkillArea | undefined {
  const preference = getSkillPreferences(caster, skill.id);
  const variant = getCompanionAoeVariant(skill.id, preference.variant);
  const currentTarget = state.entities[caster.currentTargetId ?? ""];
  const combatTarget = isLivingHostileTarget(currentTarget) ? currentTarget : getPartyCombatTarget(state);
  const facing = targetPosition ?? (combatTarget ? getCombatTargetPosition(caster.position, combatTarget) : undefined);
  if (!facing && variant?.pattern.type === "cone") return undefined;
  const area = resolveCompanionAoeArea(caster, skill.id, preference.variant, facing ?? caster.position, mobilityOrigin);
  return area ? { area, variantId: variant?.id, powerMultiplier: variant?.powerMultiplier ?? 1 } : undefined;
}
