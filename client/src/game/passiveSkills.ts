import type { GameState } from "./state";
import {
  getCompanionSkillRank,
  getLearnedPassivesForCompanion,
  getSkillScaleUnits,
} from "./skillProgression";
import type {
  Companion,
  PassiveSkillDefinition,
  StatusEffectType,
} from "./types";

const STEADY_NERVES_CONTROL_TYPES: ReadonlySet<StatusEffectType> = new Set([
  "immobilized",
  "disarmed",
  "forcedEvasion",
  "silenced",
  "taunted",
]);

export function getResourcefulnessHealingBonusPercent(
  companion: Companion,
): number {
  const rank = getLearnedPassiveRank(companion, "resourcefulness");

  return rank === null ? 0 : 2 * getSkillScaleUnits(rank);
}

export function getSteadyNervesControlReductionPercent(
  companion: Companion,
): number {
  const rank = getLearnedPassiveRank(companion, "steady_nerves");

  return rank === null ? 0 : 2 * getSkillScaleUnits(rank);
}

export function getAdjustedHostileControlDurationMs(
  state: GameState,
  target: Companion,
  type: StatusEffectType,
  sourceId: string | undefined,
  durationMs: number,
): number {
  const source = sourceId ? state.entities[sourceId] : undefined;

  if (
    source?.kind !== "enemy" ||
    !STEADY_NERVES_CONTROL_TYPES.has(type)
  ) {
    return Math.max(0, durationMs);
  }

  const reductionPercent = getSteadyNervesControlReductionPercent(target);

  return Math.max(
    0,
    Math.round(durationMs * (1 - reductionPercent / 100)),
  );
}

export function getPassiveSkillEffectSummary(
  companion: Companion,
  skill: PassiveSkillDefinition,
): string {
  if (skill.effect.type === "resourcefulness") {
    return `Equipped flasks restore ${formatPercent(getResourcefulnessHealingBonusPercent(companion))}% more health.`;
  }

  return `Harmful bind, immobilize, disarm, blind, silence, and taunt durations are reduced by ${formatPercent(getSteadyNervesControlReductionPercent(companion))}%.`;
}

function getLearnedPassiveRank(
  companion: Companion,
  skillId: PassiveSkillDefinition["id"],
): number | null {
  const learned = getLearnedPassivesForCompanion(companion).some(
    (skill) => skill.id === skillId,
  );

  return learned ? getCompanionSkillRank(companion, skillId) : null;
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
