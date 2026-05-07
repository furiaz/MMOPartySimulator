import type { ClassId, SkillDefinition } from "./types";

export const SKILL_DEFINITIONS: Record<SkillDefinition["id"], SkillDefinition> = {
  sweeping_strike: {
    id: "sweeping_strike",
    classId: "blade",
    displayName: "Sweeping Strike",
    tags: ["Offensive", "Damage", "Single Target", "AoE"],
    type: "active",
    range: 1,
    effect: {
      type: "sweepingDamage",
      mainDamage: 1,
      splashDamage: 1,
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
    effect: { type: "shieldBlock", durationMs: 5000, blocks: 1 },
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
    effect: { type: "damage", damage: 1 },
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
    effect: { type: "heal", amount: 1 },
  },
  penitents_gift: {
    id: "penitents_gift",
    classId: "penitent",
    displayName: "Penitent's Gift",
    tags: ["Heal", "Self Cost - HP", "Safety"],
    type: "active",
    range: 4,
    effect: { type: "selfCostHeal", amount: 2, hpCost: 1 },
  },
};

export function getSkillsForClass(classId: ClassId): SkillDefinition[] {
  return Object.values(SKILL_DEFINITIONS).filter(
    (skill) => skill.classId === classId,
  );
}
