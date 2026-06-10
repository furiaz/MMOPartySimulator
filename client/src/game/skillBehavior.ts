import { updateEntity, type GameState } from "./state";
import type {
  Companion,
  CompanionSkillBehavior,
  SkillDefinition,
  SupportFocus,
} from "./types";

export const DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT = 20;
export const DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT = 35;
export const DEFAULT_SUPPORT_FOCUS: SupportFocus = "lowest_hp";

const SUPPORT_FOCUS_VALUES: ReadonlySet<SupportFocus> = new Set([
  "lowest_hp",
  "leader",
  "defender",
]);

export type SkillBehaviorUpdate = Partial<CompanionSkillBehavior>;

export function createDefaultCompanionSkillBehavior(): CompanionSkillBehavior {
  return {
    beginnerFirstAidSelfHealHpThresholdPercent:
      DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
    beginnerFirstAidAllyHealHpThresholdPercent:
      DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
    supportFocus: DEFAULT_SUPPORT_FOCUS,
  };
}

export function getCompanionSkillBehavior(
  companion: Companion,
): CompanionSkillBehavior {
  const storedBehavior =
    companion.skillBehavior ?? createDefaultCompanionSkillBehavior();

  return {
    ...createDefaultCompanionSkillBehavior(),
    ...storedBehavior,
    beginnerFirstAidSelfHealHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.beginnerFirstAidSelfHealHpThresholdPercent ??
        DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
    ),
    beginnerFirstAidAllyHealHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.beginnerFirstAidAllyHealHpThresholdPercent ??
        DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
    ),
    supportFocus: normalizeSupportFocus(storedBehavior.supportFocus),
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
      ...getCompanionSkillBehavior(companion),
      ...update,
      beginnerFirstAidSelfHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.beginnerFirstAidSelfHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .beginnerFirstAidSelfHealHpThresholdPercent,
        ),
      beginnerFirstAidAllyHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.beginnerFirstAidAllyHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .beginnerFirstAidAllyHealHpThresholdPercent,
        ),
      supportFocus: normalizeSupportFocus(
        update.supportFocus ?? getCompanionSkillBehavior(companion).supportFocus,
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
      getCompanionSkillBehavior(caster)
        .beginnerFirstAidSelfHealHpThresholdPercent
  );
}

function clampHpThresholdPercent(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)));
}

function normalizeSupportFocus(value: unknown): SupportFocus {
  return typeof value === "string" && SUPPORT_FOCUS_VALUES.has(value as SupportFocus)
    ? (value as SupportFocus)
    : DEFAULT_SUPPORT_FOCUS;
}
