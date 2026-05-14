import type { Companion } from "./types";

export const DEFAULT_COMPANION_ATTACK_RANGE = 1;

const CLASS_BASIC_ATTACK_RANGE: Partial<Record<Companion["classId"], number>> = {};

export function getCompanionAttackRange(companion: Companion): number {
  return CLASS_BASIC_ATTACK_RANGE[companion.classId] ?? DEFAULT_COMPANION_ATTACK_RANGE;
}
