import { updateEntity, type GameState } from "./state";
import type {
  Companion,
  CompanionSkillBehavior,
  SkillDefinition,
} from "./types";

export const DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT = 20;

export type SkillBehaviorUpdate = Partial<CompanionSkillBehavior>;

export function createDefaultCompanionSkillBehavior(): CompanionSkillBehavior {
  return {
    beginnerFirstAidSelfHealHpThresholdPercent:
      DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
  };
}

export function updateCompanionSkillBehavior(
  state: GameState,
  companionId: string,
  update: SkillBehaviorUpdate,
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...companion,
    skillBehavior: {
      ...companion.skillBehavior,
      ...update,
      beginnerFirstAidSelfHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.beginnerFirstAidSelfHealHpThresholdPercent ??
            companion.skillBehavior.beginnerFirstAidSelfHealHpThresholdPercent,
        ),
    },
  });
}

export function isBeginnerFirstAidSelfHealPriorityUse(
  caster: Companion,
  skill: SkillDefinition,
  target: Companion | undefined,
): boolean {
  return Boolean(
    target?.id === caster.id &&
      isBeginnerFirstAidSelfHealPriorityActive(caster, skill),
  );
}

export function isBeginnerFirstAidSelfHealPriorityActive(
  caster: Companion,
  skill: SkillDefinition,
): boolean {
  return (
    caster.classId === "beginner" &&
    skill.id === "first_aid" &&
    caster.maxHealth > 0 &&
    caster.health < caster.maxHealth &&
    (caster.health / caster.maxHealth) * 100 <=
      caster.skillBehavior.beginnerFirstAidSelfHealHpThresholdPercent
  );
}

function clampHpThresholdPercent(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)));
}
