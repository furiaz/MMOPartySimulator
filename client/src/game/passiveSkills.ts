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
  const rank = getLearnedPassiveRank(companion, skill.id) ?? 1;
  const units = getSkillScaleUnits(rank);

  switch (skill.effect.type) {
    case "resourcefulness":
      return `Equipped flasks restore ${formatPercent(2 * units)}% more health.`;
    case "steadyNerves":
      return `Harmful bind, immobilize, disarm, blind, silence, and taunt durations are reduced by ${formatPercent(2 * units)}%.`;
    case "duelistsMomentum":
      return `Direct physical hits against the same enemy build up to 3 stacks. Each existing stack grants ${formatPercent(units)}% physical damage.`;
    case "riposteTraining":
      return `Blade Parry mitigation primes the next direct physical hit within 10 seconds for ${formatPercent(5 * units)}% more damage.`;
    case "rootedBastion":
      return `After 5 seconds without moving, Defense increases by ${formatPercent(3 * units)}% until movement.`;
    case "unbrokenLine":
      return `Enemies taunted by this companion deal ${formatPercent(3 * units)}% less damage to other companions.`;
    case "headhunter":
      return `Each XP-granting party kill in the last 30 seconds grants +1% critical chance, up to ${getHeadhunterStackCap(rank)} stacks.`;
    case "exploitTheSnare":
      return `Direct physical damage is increased by ${formatPercent(3 * units)}% against controlled enemies.`;
    case "bloodScent":
      return `Physical direct and bleed damage is increased by ${formatPercent(3 * units)}% against enemies at or below 30% health.`;
    case "packInstinct":
      return `Direct and damage-over-time damage is increased by ${formatPercent(2 * units)}% while another living companion is within 2 spaces of the target.`;
  }
}

export function getLearnedPassiveRank(
  companion: Companion,
  skillId: PassiveSkillDefinition["id"],
): number | null {
  const learned = getLearnedPassivesForCompanion(companion).some(
    (skill) => skill.id === skillId,
  );

  return learned ? getCompanionSkillRank(companion, skillId) : null;
}

export function getHeadhunterStackCap(rank: number): number {
  return Math.min(9, 2 + Math.min(5, rank) + Math.floor(Math.max(0, rank - 5) / 5));
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
