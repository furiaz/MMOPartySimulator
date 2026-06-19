import { updateEntity, type GameState } from "./state";
import type {
  Companion,
  CompanionSkillBehavior,
  CircleOfRenewalTargetMode,
  FireBurstTargetMode,
  MobilitySkillUseMode,
  SkillDefinition,
  SupportFocus,
} from "./types";

export const DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT = 20;
export const DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT = 35;
export const DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT = 30;
export const SECOND_WIND_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT = 30;
export const DEFAULT_HOLD_FAST_USE_HP_THRESHOLD_PERCENT = 30;
export const HOLD_FAST_USE_HP_THRESHOLD_MAX_PERCENT = 100;
export const DEFAULT_FAKE_DEATH_USE_HP_THRESHOLD_PERCENT = 30;
export const FAKE_DEATH_USE_HP_THRESHOLD_MAX_PERCENT = 30;
export const DEFAULT_BLOOD_FEAST_USE_HP_THRESHOLD_PERCENT = 30;
export const BLOOD_FEAST_USE_HP_THRESHOLD_MAX_PERCENT = 30;
export const DEFAULT_LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_PERCENT = 50;
export const LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT = 80;
export const DEFAULT_SELF_SACRIFICE_SAFETY_FLOOR_PERCENT = 20;
export const SELF_SACRIFICE_SAFETY_FLOOR_MAX_PERCENT = 50;
export const DEFAULT_PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_PERCENT = 50;
export const PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT = 80;
export const DEFAULT_PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_PERCENT = 30;
export const PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT = 30;
export const DEFAULT_ETERNAL_HOPE_USE_HP_THRESHOLD_PERCENT = 60;
export const ETERNAL_HOPE_USE_HP_THRESHOLD_MAX_PERCENT = 80;
export const DEFAULT_MOBILITY_SKILL_USE_MODE: MobilitySkillUseMode = "offensive";
export const DEFAULT_DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_PERCENT = 30;
export const DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_MAX_PERCENT = 30;
export const DEFAULT_SUPPORT_FOCUS: SupportFocus = "lowest_hp";
export const DEFAULT_OVERCHARGE_ENABLED = true;
export const DEFAULT_FIRE_BURST_TARGET_MODE: FireBurstTargetMode = "big_group";
export const DEFAULT_CIRCLE_OF_RENEWAL_TARGET_MODE: CircleOfRenewalTargetMode =
  "big_group";
export const DEFAULT_CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_PERCENT = 70;
export const CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_MAX_PERCENT = 90;

const SUPPORT_FOCUS_VALUES: ReadonlySet<SupportFocus> = new Set([
  "lowest_hp",
  "leader",
  "defender",
]);
const MOBILITY_SKILL_USE_MODE_VALUES: ReadonlySet<MobilitySkillUseMode> = new Set([
  "offensive",
  "defensive",
]);
const FIRE_BURST_TARGET_MODE_VALUES: ReadonlySet<FireBurstTargetMode> = new Set([
  "big_group",
  "low_health",
  "highest_health",
]);
const CIRCLE_OF_RENEWAL_TARGET_MODE_VALUES: ReadonlySet<CircleOfRenewalTargetMode> =
  new Set(["big_group", "low_health", "defender"]);

export type SkillBehaviorUpdate = Partial<CompanionSkillBehavior>;
type StoredCompanionSkillBehavior = Partial<CompanionSkillBehavior> & {
  holdFastSelfHealHpThresholdPercent?: number;
};

export function createDefaultCompanionSkillBehavior(): CompanionSkillBehavior {
  return {
    beginnerFirstAidSelfHealHpThresholdPercent:
      DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
    beginnerFirstAidAllyHealHpThresholdPercent:
      DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT,
    secondWindSelfHealHpThresholdPercent:
      DEFAULT_SECOND_WIND_SELF_HEAL_HP_THRESHOLD_PERCENT,
    holdFastUseHpThresholdPercent: DEFAULT_HOLD_FAST_USE_HP_THRESHOLD_PERCENT,
    fakeDeathUseHpThresholdPercent: DEFAULT_FAKE_DEATH_USE_HP_THRESHOLD_PERCENT,
    bloodFeastUseHpThresholdPercent: DEFAULT_BLOOD_FEAST_USE_HP_THRESHOLD_PERCENT,
    lightMendAllyHealHpThresholdPercent:
      DEFAULT_LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_PERCENT,
    selfSacrificeSafetyFloorPercent:
      DEFAULT_SELF_SACRIFICE_SAFETY_FLOOR_PERCENT,
    penitentsGiftAllyHealHpThresholdPercent:
      DEFAULT_PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_PERCENT,
    penitentsGiftSelfHealHpThresholdPercent:
      DEFAULT_PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_PERCENT,
    eternalHopeUseHpThresholdPercent: DEFAULT_ETERNAL_HOPE_USE_HP_THRESHOLD_PERCENT,
    mobilitySkillUseMode: DEFAULT_MOBILITY_SKILL_USE_MODE,
    defensiveMobilityUseHpThresholdPercent:
      DEFAULT_DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_PERCENT,
    supportFocus: DEFAULT_SUPPORT_FOCUS,
    overchargeEnabled: DEFAULT_OVERCHARGE_ENABLED,
    fireBurstTargetMode: DEFAULT_FIRE_BURST_TARGET_MODE,
    circleOfRenewalTargetMode: DEFAULT_CIRCLE_OF_RENEWAL_TARGET_MODE,
    circleOfRenewalMainTargetHpThresholdPercent:
      DEFAULT_CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_PERCENT,
  };
}

export function getCompanionSkillBehavior(
  companion: Companion,
): CompanionSkillBehavior {
  const storedBehavior: StoredCompanionSkillBehavior =
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
    holdFastUseHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.holdFastUseHpThresholdPercent ??
        storedBehavior.holdFastSelfHealHpThresholdPercent ??
        DEFAULT_HOLD_FAST_USE_HP_THRESHOLD_PERCENT,
      HOLD_FAST_USE_HP_THRESHOLD_MAX_PERCENT,
    ),
    fakeDeathUseHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.fakeDeathUseHpThresholdPercent ??
        DEFAULT_FAKE_DEATH_USE_HP_THRESHOLD_PERCENT,
      FAKE_DEATH_USE_HP_THRESHOLD_MAX_PERCENT,
    ),
    bloodFeastUseHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.bloodFeastUseHpThresholdPercent ??
        DEFAULT_BLOOD_FEAST_USE_HP_THRESHOLD_PERCENT,
      BLOOD_FEAST_USE_HP_THRESHOLD_MAX_PERCENT,
    ),
    lightMendAllyHealHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.lightMendAllyHealHpThresholdPercent ??
        DEFAULT_LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT,
    ),
    selfSacrificeSafetyFloorPercent: clampHpThresholdPercent(
      storedBehavior.selfSacrificeSafetyFloorPercent ??
        DEFAULT_SELF_SACRIFICE_SAFETY_FLOOR_PERCENT,
      SELF_SACRIFICE_SAFETY_FLOOR_MAX_PERCENT,
    ),
    penitentsGiftAllyHealHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.penitentsGiftAllyHealHpThresholdPercent ??
        DEFAULT_PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_PERCENT,
      PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT,
    ),
    penitentsGiftSelfHealHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.penitentsGiftSelfHealHpThresholdPercent ??
        DEFAULT_PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_PERCENT,
      PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
    ),
    eternalHopeUseHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.eternalHopeUseHpThresholdPercent ??
        DEFAULT_ETERNAL_HOPE_USE_HP_THRESHOLD_PERCENT,
      ETERNAL_HOPE_USE_HP_THRESHOLD_MAX_PERCENT,
    ),
    mobilitySkillUseMode: normalizeMobilitySkillUseMode(
      storedBehavior.mobilitySkillUseMode,
    ),
    defensiveMobilityUseHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.defensiveMobilityUseHpThresholdPercent ??
        DEFAULT_DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_PERCENT,
      DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_MAX_PERCENT,
    ),
    supportFocus: normalizeSupportFocus(storedBehavior.supportFocus),
    overchargeEnabled:
      storedBehavior.overchargeEnabled ?? DEFAULT_OVERCHARGE_ENABLED,
    fireBurstTargetMode: normalizeFireBurstTargetMode(
      storedBehavior.fireBurstTargetMode,
    ),
    circleOfRenewalTargetMode: normalizeCircleOfRenewalTargetMode(
      storedBehavior.circleOfRenewalTargetMode,
    ),
    circleOfRenewalMainTargetHpThresholdPercent: clampHpThresholdPercent(
      storedBehavior.circleOfRenewalMainTargetHpThresholdPercent ??
        DEFAULT_CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_PERCENT,
      CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_MAX_PERCENT,
    ),
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
      holdFastUseHpThresholdPercent:
        clampHpThresholdPercent(
          update.holdFastUseHpThresholdPercent ??
            getCompanionSkillBehavior(companion).holdFastUseHpThresholdPercent,
          HOLD_FAST_USE_HP_THRESHOLD_MAX_PERCENT,
        ),
      fakeDeathUseHpThresholdPercent:
        clampHpThresholdPercent(
          update.fakeDeathUseHpThresholdPercent ??
            getCompanionSkillBehavior(companion).fakeDeathUseHpThresholdPercent,
          FAKE_DEATH_USE_HP_THRESHOLD_MAX_PERCENT,
        ),
      bloodFeastUseHpThresholdPercent:
        clampHpThresholdPercent(
          update.bloodFeastUseHpThresholdPercent ??
            getCompanionSkillBehavior(companion).bloodFeastUseHpThresholdPercent,
          BLOOD_FEAST_USE_HP_THRESHOLD_MAX_PERCENT,
        ),
      lightMendAllyHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.lightMendAllyHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion).lightMendAllyHealHpThresholdPercent,
          LIGHT_MEND_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT,
        ),
      selfSacrificeSafetyFloorPercent:
        clampHpThresholdPercent(
          update.selfSacrificeSafetyFloorPercent ??
            getCompanionSkillBehavior(companion).selfSacrificeSafetyFloorPercent,
          SELF_SACRIFICE_SAFETY_FLOOR_MAX_PERCENT,
        ),
      penitentsGiftAllyHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.penitentsGiftAllyHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .penitentsGiftAllyHealHpThresholdPercent,
          PENITENTS_GIFT_ALLY_HEAL_HP_THRESHOLD_MAX_PERCENT,
        ),
      penitentsGiftSelfHealHpThresholdPercent:
        clampHpThresholdPercent(
          update.penitentsGiftSelfHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .penitentsGiftSelfHealHpThresholdPercent,
          PENITENTS_GIFT_SELF_HEAL_HP_THRESHOLD_MAX_PERCENT,
        ),
      eternalHopeUseHpThresholdPercent:
        clampHpThresholdPercent(
          update.eternalHopeUseHpThresholdPercent ??
            getCompanionSkillBehavior(companion).eternalHopeUseHpThresholdPercent,
          ETERNAL_HOPE_USE_HP_THRESHOLD_MAX_PERCENT,
        ),
      mobilitySkillUseMode: normalizeMobilitySkillUseMode(
        update.mobilitySkillUseMode ??
          getCompanionSkillBehavior(companion).mobilitySkillUseMode,
      ),
      defensiveMobilityUseHpThresholdPercent:
        clampHpThresholdPercent(
          update.defensiveMobilityUseHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .defensiveMobilityUseHpThresholdPercent,
          DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_MAX_PERCENT,
        ),
      supportFocus: normalizeSupportFocus(
        update.supportFocus ?? getCompanionSkillBehavior(companion).supportFocus,
      ),
      overchargeEnabled:
        update.overchargeEnabled ??
        getCompanionSkillBehavior(companion).overchargeEnabled,
      fireBurstTargetMode: normalizeFireBurstTargetMode(
        update.fireBurstTargetMode ??
          getCompanionSkillBehavior(companion).fireBurstTargetMode,
      ),
      circleOfRenewalTargetMode: normalizeCircleOfRenewalTargetMode(
        update.circleOfRenewalTargetMode ??
          getCompanionSkillBehavior(companion).circleOfRenewalTargetMode,
      ),
      circleOfRenewalMainTargetHpThresholdPercent:
        clampHpThresholdPercent(
          update.circleOfRenewalMainTargetHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .circleOfRenewalMainTargetHpThresholdPercent,
          CIRCLE_OF_RENEWAL_MAIN_TARGET_HP_THRESHOLD_MAX_PERCENT,
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

function normalizeFireBurstTargetMode(value: unknown): FireBurstTargetMode {
  return typeof value === "string" &&
    FIRE_BURST_TARGET_MODE_VALUES.has(value as FireBurstTargetMode)
    ? (value as FireBurstTargetMode)
    : DEFAULT_FIRE_BURST_TARGET_MODE;
}

function normalizeCircleOfRenewalTargetMode(
  value: unknown,
): CircleOfRenewalTargetMode {
  return typeof value === "string" &&
    CIRCLE_OF_RENEWAL_TARGET_MODE_VALUES.has(value as CircleOfRenewalTargetMode)
    ? (value as CircleOfRenewalTargetMode)
    : DEFAULT_CIRCLE_OF_RENEWAL_TARGET_MODE;
}
