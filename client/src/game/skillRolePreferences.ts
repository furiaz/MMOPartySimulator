import type { PartyMemberRole, SkillTag } from "./types";

export type SkillRolePreference = {
  primary: SkillTag[];
  secondary: SkillTag[];
  fallback: SkillTag[];
  avoid: SkillTag[];
};

export const SKILL_ROLE_PREFERENCES: Record<PartyMemberRole, SkillRolePreference> = {
  fighter: {
    primary: [
      "Offensive",
      "Damage",
      "Single Target",
      "Multi Target",
      "AoE",
      "DoT",
      "Summon - Attack",
      "Self Buff",
    ],
    secondary: ["Mobility", "Control"],
    fallback: [],
    avoid: ["Heal", "Shield", "Gathering", "Taunt", "Aggro"],
  },
  defender: {
    primary: [
      "Taunt",
      "Aggro",
      "Defensive",
      "Shield",
      "Damage Mitigation",
      "Elemental Mitigation",
      "Control",
      "Summon - Defense",
    ],
    secondary: ["Mobility", "Damage"],
    fallback: [],
    avoid: ["Gathering", "Self Cost - HP"],
  },
  support: {
    primary: ["Heal", "Shield", "Buff", "Cleanse", "Safety", "Summon - Support"],
    secondary: ["Control", "Mobility", "Self Cost - HP"],
    fallback: ["Damage", "Single Target"],
    avoid: ["Aggro", "Taunt"],
  },
  gatherer: {
    primary: ["Gathering", "Resource Buff", "Tool Buff"],
    secondary: ["Mobility", "Escape", "Safety"],
    fallback: ["Light Damage", "Single Target"],
    avoid: ["Aggro", "Taunt"],
  },
  none: {
    primary: [],
    secondary: ["Safety"],
    fallback: ["Damage", "Single Target"],
    avoid: ["Self Cost - HP"],
  },
};

export function getSkillRoleScore(
  role: PartyMemberRole,
  tags: SkillTag[],
): number {
  const preference = SKILL_ROLE_PREFERENCES[role];

  return (
    countMatches(tags, preference.primary, 2) * 3 +
    countMatches(tags, preference.secondary, 1) * 2 +
    countMatches(tags, preference.fallback, 1) -
    countMatches(tags, preference.avoid) * 6
  );
}

function countMatches(
  tags: SkillTag[],
  preferredTags: SkillTag[],
  cap = Number.POSITIVE_INFINITY,
): number {
  return Math.min(
    cap,
    tags.filter((tag) => preferredTags.includes(tag)).length,
  );
}
