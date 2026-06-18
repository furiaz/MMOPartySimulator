import type { Companion } from "./types";

export const DEFAULT_COMPANION_ATTACK_RANGE = 1;
export const HUNTER_BASIC_ATTACK_RANGE = 5;
export const ELEMENTALIST_BASIC_ATTACK_RANGE = 4;

const CLASS_BASIC_ATTACK_RANGE: Partial<Record<Companion["classId"], number>> = {
  elementalist: ELEMENTALIST_BASIC_ATTACK_RANGE,
  hunter: HUNTER_BASIC_ATTACK_RANGE,
};

export function getCompanionAttackRange(companion: Companion): number {
  return CLASS_BASIC_ATTACK_RANGE[companion.classId] ?? DEFAULT_COMPANION_ATTACK_RANGE;
}
