import { updateEntity, type GameState } from "./state";
import { COMPANION_AOE_VARIANTS } from "./companionAoeVariants";
import type {
  Companion,
  CompanionSkillBehavior,
  CircleOfRenewalTargetMode,
  FireBurstTargetMode,
  MobilitySkillUseMode,
  SkillDefinition,
  SupportFocus,
  SkillId,
  SkillPreferenceValues,
} from "./types";

export const DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT = 20;
export const DEFAULT_BEGINNER_FIRST_AID_ALLY_HEAL_HP_THRESHOLD_PERCENT = 35;
export const FIRST_AID_HP_THRESHOLD_MIN_PERCENT = 10;
export const FIRST_AID_HP_THRESHOLD_MAX_PERCENT = 60;
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
  new Set(["big_group", "low_health", "highest_health", "defender"]);

type LegacyPreferenceKey = Exclude<keyof CompanionSkillBehavior, "preferencesBySkillId">;
export type SkillPreferenceControl = {
  key: keyof SkillPreferenceValues;
  label: string;
  description: string;
  type: "number" | "choice" | "toggle";
  defaultValue: string | number | boolean;
  legacyField?: LegacyPreferenceKey;
  min?: number;
  max?: number;
  choices?: readonly { value: string; label: string; description: string }[];
  offensiveOnly?: boolean;
};

const TARGET_CHOICES = [
  { value: "highest_health", label: "High HP", description: "Prioritize the eligible target with the highest remaining HP." },
  { value: "big_group", label: "Big Group", description: "Choose a valid target/direction that includes the most eligible recipients inside the selected shape." },
  { value: "low_health", label: "Low HP", description: "Prioritize the eligible target with the lowest HP percentage." },
];
const SUPPORT_CHOICES = [
  { value: "lowest_hp", label: "Lowest HP", description: "Prefer the eligible ally with the lowest HP percentage." },
  { value: "leader", label: "Leader", description: "Prefer the living leader when eligible; otherwise use normal support selection." },
  { value: "defender", label: "Defender", description: "Prefer an eligible Defender-role companion; otherwise use normal support selection." },
];

function numberControl(key: keyof SkillPreferenceValues, label: string, legacyField: LegacyPreferenceKey, max: number, min = 1): SkillPreferenceControl {
  return { key, label, legacyField, type: "number", min, max, defaultValue: 1,
    description: `Use this skill's existing HP rule at the selected percentage (${min}–${max}%). Other skills are unaffected.` };
}
const supportControl: SkillPreferenceControl = { key: "supportFocus", label: "Target Focus", type: "choice", legacyField: "supportFocus", defaultValue: "lowest_hp", choices: SUPPORT_CHOICES, description: "Choose this skill's preferred eligible ally, without changing other support skills." };
const safetyControl = numberControl("safetyFloorPercent", "Safety Floor", "selfSacrificeSafetyFloorPercent", SELF_SACRIFICE_SAFETY_FLOOR_MAX_PERCENT);
const mobilityControls: SkillPreferenceControl[] = [
  { key: "mobilityMode", label: "Use Mode", type: "choice", legacyField: "mobilitySkillUseMode", defaultValue: "offensive", description: "Offensive approaches a combat target. Defensive escapes a threat using this skill's HP threshold.", choices: [
    { value: "offensive", label: "Offensive", description: "Use the existing offensive approach and landing rules." },
    { value: "defensive", label: "Defensive", description: "Retreat from the existing threat; area effects remain at departure where supported." },
  ] },
  numberControl("defensiveHpThresholdPercent", "Defensive HP Threshold", "defensiveMobilityUseHpThresholdPercent", DEFENSIVE_MOBILITY_USE_HP_THRESHOLD_MAX_PERCENT),
];
const offensiveTargetControl: SkillPreferenceControl = { key: "targetMode", label: "Target Priority", type: "choice", defaultValue: "big_group", choices: TARGET_CHOICES, description: "Select targets using this skill's real area. Manual target constraints still apply." };

const BASE_SKILL_CONTROLS: Partial<Record<SkillId, readonly SkillPreferenceControl[]>> = {
  first_aid: [
    numberControl("selfHealHpThresholdPercent", "Self-Heal HP Threshold", "beginnerFirstAidSelfHealHpThresholdPercent", 60, 10),
    numberControl("allyHealHpThresholdPercent", "Ally-Heal HP Threshold", "beginnerFirstAidAllyHealHpThresholdPercent", 60, 10), supportControl,
  ],
  second_wind: [numberControl("selfHealHpThresholdPercent", "Self-Heal HP Threshold", "secondWindSelfHealHpThresholdPercent", 30)],
  hold_fast: [numberControl("useHpThresholdPercent", "Use HP Threshold", "holdFastUseHpThresholdPercent", 100)],
  fake_death: [numberControl("useHpThresholdPercent", "Use HP Threshold", "fakeDeathUseHpThresholdPercent", 30)],
  blood_feast: [numberControl("useHpThresholdPercent", "Use HP Threshold", "bloodFeastUseHpThresholdPercent", 30)],
  light_mend: [numberControl("allyHealHpThresholdPercent", "Ally HP Threshold", "lightMendAllyHealHpThresholdPercent", 80), supportControl],
  frost_armor: [supportControl],
  guiding_light: [supportControl],
  penitents_gift: [
    numberControl("allyHealHpThresholdPercent", "Ally HP Threshold", "penitentsGiftAllyHealHpThresholdPercent", 80),
    numberControl("selfHealHpThresholdPercent", "Self HP Threshold", "penitentsGiftSelfHealHpThresholdPercent", 30), safetyControl, supportControl,
  ],
  flagellant_lash: [safetyControl],
  martyrs_veil: [safetyControl],
  eternal_hope: [numberControl("useHpThresholdPercent", "Use HP Threshold", "eternalHopeUseHpThresholdPercent", 80)],
  overcharge: [{ key: "enabled", label: "Enabled", type: "toggle", legacyField: "overchargeEnabled", defaultValue: true, description: "Allow this companion to use Overcharge under its existing combat rules." }],
  flash_step: mobilityControls, shield_rush: mobilityControls, skirmish_shot: mobilityControls,
  pounce: mobilityControls, flame_step: mobilityControls, rune_step: mobilityControls,
  dawn_step: [...mobilityControls, { ...offensiveTargetControl, offensiveOnly: true }],
  atonement_step: [...mobilityControls, safetyControl, { ...offensiveTargetControl, offensiveOnly: true }],
  arrow_burst: [offensiveTargetControl],
  fire_burst: [{ ...offensiveTargetControl, legacyField: "fireBurstTargetMode" }],
  circle_of_renewal: [
    { ...offensiveTargetControl, legacyField: "circleOfRenewalTargetMode", choices: [...TARGET_CHOICES,
      { value: "defender", label: "Defender", description: "Prefer an injured eligible Defender-role companion; otherwise use the normal low-HP fallback." }], description: "Choose an injured, living main target that meets this skill's HP threshold. Big Group counts injured allies inside the selected circle." },
    numberControl("mainTargetHpThresholdPercent", "Main Target HP Threshold", "circleOfRenewalMainTargetHpThresholdPercent", 90),
  ],
};

export function getSkillPreferenceControls(skillId: SkillId): readonly SkillPreferenceControl[] {
  const variants = COMPANION_AOE_VARIANTS[skillId];
  const controls = BASE_SKILL_CONTROLS[skillId] ?? [];
  return variants ? [{ key: "variant", label: "Area Variant", type: "choice", defaultValue: variants[0].id,
    description: "Choose this skill's authored area and effect tradeoff.",
    choices: variants.map(option => ({ value: option.id, label: option.displayName, description: option.description })),
  }, ...controls] : controls;
}

export function getSkillPreferences(companion: Companion, skillId: SkillId): SkillPreferenceValues {
  const legacy = getCompanionSkillBehavior(companion);
  const stored = legacy.preferencesBySkillId?.[skillId];
  const values: Record<string, string | number | boolean> = {};
  for (const control of getSkillPreferenceControls(skillId)) {
    const legacyValue = control.legacyField ? legacy[control.legacyField] : control.defaultValue;
    const fallback = control.type === "number" && (typeof legacyValue !== "number" || !Number.isFinite(legacyValue))
      ? control.legacyField ? createDefaultCompanionSkillBehavior()[control.legacyField] : control.defaultValue : legacyValue;
    const candidate = stored && typeof stored === "object" ? stored[control.key] ?? fallback : fallback;
    values[control.key] = control.type === "number"
      ? Math.min(control.max!, Math.max(control.min!, Math.round(typeof candidate === "number" && Number.isFinite(candidate) ? candidate : Number(fallback))))
      : control.type === "toggle" ? typeof candidate === "boolean" ? candidate : Boolean(fallback)
      : control.choices?.some(option => option.value === candidate) ? candidate as string
      : control.choices?.some(option => option.value === fallback) ? fallback as string : control.defaultValue;
  }
  return values as SkillPreferenceValues;
}

/** Compatibility-shaped read for existing effect helpers, scoped to one skill. */
export function getCompanionSkillBehaviorForSkill(companion: Companion, skillId: SkillId): CompanionSkillBehavior {
  const behavior = getCompanionSkillBehavior(companion);
  const values = getSkillPreferences(companion, skillId);
  const overrides = Object.fromEntries(getSkillPreferenceControls(skillId)
    .filter(control => control.legacyField).map(control => [control.legacyField!, values[control.key]]));
  return { ...behavior, ...overrides };
}

export function normalizeCompanionSkillBehavior(companion: Companion): CompanionSkillBehavior {
  const ids = new Set<SkillId>([
    ...Object.keys(BASE_SKILL_CONTROLS) as SkillId[], ...Object.keys(COMPANION_AOE_VARIANTS) as SkillId[],
  ]);
  return { ...getCompanionSkillBehavior(companion), preferencesBySkillId: Object.fromEntries(
    [...ids].map(skillId => [skillId, getSkillPreferences(companion, skillId)])),
  };
}

export function updateCompanionSkillPreference(state: GameState, companionId: string, skillId: SkillId, update: SkillPreferenceValues): GameState {
  const companion = state.entities[companionId];
  if (companion?.kind !== "companion" || getSkillPreferenceControls(skillId).length === 0) return state;
  const behavior = normalizeCompanionSkillBehavior(companion);
  const candidate = { ...companion, skillBehavior: { ...behavior, preferencesBySkillId: {
    ...behavior.preferencesBySkillId, [skillId]: { ...behavior.preferencesBySkillId?.[skillId], ...update },
  } } };
  return updateEntity(state, { ...candidate, skillBehavior: { ...candidate.skillBehavior, preferencesBySkillId: {
    ...candidate.skillBehavior.preferencesBySkillId, [skillId]: getSkillPreferences(candidate, skillId),
  } } });
}

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
  skillId?: SkillId,
): CompanionSkillBehavior {
  if (skillId) return getCompanionSkillBehaviorForSkill(companion, skillId);
  const storedBehavior: StoredCompanionSkillBehavior =
    companion.skillBehavior ?? createDefaultCompanionSkillBehavior();

  return {
    ...createDefaultCompanionSkillBehavior(),
    ...storedBehavior,
    beginnerFirstAidSelfHealHpThresholdPercent: clampFirstAidHpThresholdPercent(
      storedBehavior.beginnerFirstAidSelfHealHpThresholdPercent ??
        DEFAULT_BEGINNER_FIRST_AID_SELF_HEAL_HP_THRESHOLD_PERCENT,
    ),
    beginnerFirstAidAllyHealHpThresholdPercent: clampFirstAidHpThresholdPercent(
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
  if (update.preferencesBySkillId) {
    let nextState = state;
    for (const [skillId, values] of Object.entries(update.preferencesBySkillId)) {
      if (values && typeof values === "object") nextState = updateCompanionSkillPreference(nextState, companionId, skillId as SkillId, values);
    }
    return nextState;
  }
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
        clampFirstAidHpThresholdPercent(
          update.beginnerFirstAidSelfHealHpThresholdPercent ??
            getCompanionSkillBehavior(companion)
              .beginnerFirstAidSelfHealHpThresholdPercent,
        ),
      beginnerFirstAidAllyHealHpThresholdPercent:
        clampFirstAidHpThresholdPercent(
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
      getCompanionSkillBehaviorForSkill(caster, "first_aid")
        .beginnerFirstAidSelfHealHpThresholdPercent
  );
}

export function getFirstAidHealingEffectiveness(
  targetHealthPercent: number,
): number {
  if (targetHealthPercent > FIRST_AID_HP_THRESHOLD_MAX_PERCENT) {
    return 0;
  }

  if (targetHealthPercent <= FIRST_AID_HP_THRESHOLD_MIN_PERCENT) {
    return 1;
  }

  if (targetHealthPercent <= 30) {
    return 0.6 + ((30 - targetHealthPercent) / 20) * 0.4;
  }

  return 0.1 + ((60 - targetHealthPercent) / 30) * 0.5;
}

function clampFirstAidHpThresholdPercent(value: number): number {
  return Math.min(
    FIRST_AID_HP_THRESHOLD_MAX_PERCENT,
    Math.max(FIRST_AID_HP_THRESHOLD_MIN_PERCENT, Math.round(value)),
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
