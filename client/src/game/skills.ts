import type { ClassId, SkillDefinition } from "./types";

const BEGINNER_SKILL_COOLDOWN_MS = 10000;
const BEGINNER_BUFF_DURATION_MS = 9000;
export const DEFAULT_SKILL_COOLDOWN_MS = 5000;

export const SKILL_DEFINITIONS: Record<SkillDefinition["id"], SkillDefinition> = {
  throw_rock: {
    id: "throw_rock",
    classId: "beginner",
    displayName: "Throw Rock",
    tags: ["Offensive", "Single Target", "Taunt"],
    type: "active",
    range: 4,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: { type: "taunt" },
  },
  kick: {
    id: "kick",
    classId: "beginner",
    displayName: "Kick",
    tags: ["Offensive", "Damage", "Single Target"],
    type: "active",
    range: 5,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: {
      type: "lungeDamage",
      damageType: "physical",
      powerMultiplier: 1,
      lungeDistance: 5,
    },
  },
  guard_up: {
    id: "guard_up",
    classId: "beginner",
    displayName: "Guard Up",
    tags: ["Defensive", "Shield", "Safety"],
    type: "active",
    range: 0,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: {
      type: "shieldBlock",
      durationMs: 3000,
      blocks: 1,
      blockedDamageTypes: ["physical"],
    },
  },
  first_aid: {
    id: "first_aid",
    classId: "beginner",
    displayName: "First Aid",
    tags: ["Heal", "Safety"],
    type: "active",
    range: 3,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: { type: "heal", powerMultiplier: 5 },
  },
  deep_breath: {
    id: "deep_breath",
    classId: "beginner",
    displayName: "Deep Breath",
    tags: ["Buff", "Self Buff", "Safety"],
    type: "active",
    range: 0,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: {
      type: "selfBuff",
      bonusDamage: 1,
      durationMs: BEGINNER_BUFF_DURATION_MS,
      hpCost: 0,
    },
  },
  rally_call: {
    id: "rally_call",
    classId: "beginner",
    displayName: "Rally Call",
    tags: ["Buff", "Safety"],
    type: "active",
    range: 4,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: {
      type: "allyBuff",
      bonusDamage: 1,
      durationMs: BEGINNER_BUFF_DURATION_MS,
    },
  },
  field_hands: {
    id: "field_hands",
    classId: "beginner",
    displayName: "Field Hands",
    tags: ["Gathering", "Resource Buff", "Tool Buff"],
    type: "active",
    range: 0,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: {
      type: "gatherBuff",
      bonusGatherSpeed: 1,
      durationMs: BEGINNER_BUFF_DURATION_MS,
    },
  },
  quick_step: {
    id: "quick_step",
    classId: "beginner",
    displayName: "Quick Step",
    tags: ["Mobility", "Dash", "Escape"],
    type: "active",
    range: 0,
    cooldownMs: BEGINNER_SKILL_COOLDOWN_MS,
    effect: { type: "quickStep", distance: 1 },
  },
  sweeping_strike: {
    id: "sweeping_strike",
    classId: "blade",
    displayName: "Sweeping Strike",
    tags: ["Offensive", "Damage", "Single Target", "AoE"],
    type: "active",
    range: 1,
    effect: {
      type: "sweepingDamage",
      damageType: "physical",
      mainPowerMultiplier: 1.5,
      splashPowerMultiplier: 1,
      splashRange: 1.5,
    },
  },
  guard_wall: {
    id: "guard_wall",
    classId: "aegis",
    displayName: "Guard Wall",
    tags: ["Defensive", "Shield", "Safety"],
    type: "active",
    range: 0,
    effect: {
      type: "shieldBlock",
      durationMs: 5000,
      blocks: 1,
      blockedDamageTypes: ["physical"],
    },
  },
  mark_target: {
    id: "mark_target",
    classId: "hunter",
    displayName: "Mark Target",
    tags: ["Offensive", "Buff", "Single Target"],
    type: "active",
    range: 5,
    effect: { type: "mark", bonusDamage: 1, durationMs: 5000 },
  },
  feral_surge: {
    id: "feral_surge",
    classId: "beast",
    displayName: "Feral Surge",
    tags: ["Offensive", "Buff", "Self Buff", "Self Cost - HP"],
    type: "active",
    range: 0,
    effect: { type: "selfBuff", bonusDamage: 1, durationMs: 5000, hpCost: 1 },
  },
  elemental_bolt: {
    id: "elemental_bolt",
    classId: "elementalist",
    displayName: "Elemental Bolt",
    tags: ["Offensive", "Damage", "Single Target"],
    type: "active",
    range: 5,
    effect: { type: "damage", damageType: "magic", powerMultiplier: 1.5 },
  },
  binding_rune: {
    id: "binding_rune",
    classId: "runecaster",
    displayName: "Binding Rune",
    tags: ["Control", "Trap", "Safety"],
    type: "active",
    range: 4,
    effect: { type: "bind", durationMs: 3000 },
  },
  light_mend: {
    id: "light_mend",
    classId: "lightbearer",
    displayName: "Light Mend",
    tags: ["Heal", "Safety"],
    type: "active",
    range: 4,
    effect: { type: "heal", powerMultiplier: 1.5 },
  },
  penitents_gift: {
    id: "penitents_gift",
    classId: "penitent",
    displayName: "Penitent's Gift",
    tags: ["Heal", "Self Cost - HP", "Safety"],
    type: "active",
    range: 4,
    effect: { type: "selfCostHeal", powerMultiplier: 2, hpCost: 1 },
  },
};

export function getSkillsForClass(classId: ClassId): SkillDefinition[] {
  return Object.values(SKILL_DEFINITIONS).filter(
    (skill) => skill.classId === classId,
  );
}

export function getSkillCooldownMs(skill: SkillDefinition): number {
  return skill.cooldownMs ?? DEFAULT_SKILL_COOLDOWN_MS;
}
