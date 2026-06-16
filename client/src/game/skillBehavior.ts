import { updateEntity, type GameState } from "./state";
import type {
  Companion,
  CompanionSkillBehavior,
  MobilitySkillUseMode,
  SkillDefinition,
  SupportFocus,
} from "./types";

export const DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT = 20;
export const DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT = 35;
export const DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT = 30;
export const SECOND_WIND_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT = 30;
export const DEFAULT_HOLD_FAST_SELF_HEAL_HP_THRESHOLD_PERCENT = 30;
export const HOLD_FAST_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT = 30;
export const DEFAULT_MOBILITY_SKILL_USE_MODE: MobilitySkillUseMode = "offensive";
export const DEFAULT_SUPPORT_FOCUS: SupportFocus = "lowest_hp";

const SUPPORT_FOCUS_VALUES: ReadonlySet<SupportFocus> = new Set([
  "lowest_hp",
  "leader",
  "defender",
]);
const MOBILITY_SKILL_USE_MODE_VALUES: ReadonlySet<MobilitySkillUseMode> = new Set([
  "offensive",
  "defensive",
]);

export type SkillBehaviorUpdate = Partial<CompanionSkillBehavior>;

export function createDefaultCompanionSkillBehavior(): CompanionSkillBehavior {
  return {
    beginnerFirstAidSelfHealHpThresholdPercent:
      DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
    beginnerFirstAidAllyHealHpThresholdPercent:
      DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
    secondWindSelfHealHpThresholdPercent:
      DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT,
    holdFastSelfHealHpThresholdPercent:
      DEFAULT_HOLD_FAST_SELF_HEAL_HP_THRESHOLD_PERCENT,
    mobilitySkillUseMode: DEFAULT_MOBILITY_SKILL_USE_MODE,
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
    secondWindSelfHealHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.secondWindSelfHealHpThresholdPercent ??
        DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT,
      SECOND_WIND_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
    ),
    holdFastSelfHealHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.holdFastSelfHealHpThresholdPercent ??
        DEFAULT_HOLD_FAST_SELF_HEAL_HP_THRESHOLD_PERCENT,
      HOLD_FAST_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
    ),
    mobilitySkillUseMode: normalizeMobilitySkillUseMode(
      storedBehavior.mobilitySkillUseMode,
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
      secondWindSelfHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.secondWindSelfHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .secondWindSelfHealHpThresholdPercent,
          SECOND_WIND_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
        ),
      holdFastSelfHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.holdFastSelfHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .holdFastSelfHealHpThresholdPercent,
          HOLD_FAST_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
        ),
      mobilitySkillUseMode: normalizeMobilitySkillUseMode(
        update.mobilitySkillUseMode ??
          getCompanionSkillBehavior(companion).mobilitySkillUseMode,
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

function clampHpThresholdPercent(value: number, maxPercent = 100): number {
  return Math.min(maxPercent, Math.max(1, Math.round(value)));
}

function normalizeSupportFocus(value: unknown): SupportFocus {
  return typeof value === "string" && SUPPORT_FOCUS_VALUES.has(value as SupportFocus)
    ? (value as SupportFocus)
    : DEFAULT_SUPPORT_FOCUS;
}

function normalizeMobilitySkillUseMode(value: unknown): MobilitySkillUseMode {
  return typeof value === "string" &&
    MOBILITY_SKILL_USE_MODE_VALUES.has(value as MobilitySkillUseMode)
    ? (value as MobilitySkillUseMode)
    : DEFAULT_MOBILITY_SKILL_USE_MODE;
}
