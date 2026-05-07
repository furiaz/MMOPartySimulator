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
    avoid: ["Heal", "Shield", "Gathering"],
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
    secondary: ["Control", "Mobility"],
    fallback: ["Damage", "Single Target"],
    avoid: ["Aggro", "Taunt", "Self Cost - HP"],
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
    countMatches(tags, preference.primary) * 3 +
    countMatches(tags, preference.secondary) * 2 +
    countMatches(tags, preference.fallback) -
    countMatches(tags, preference.avoid) * 4
  );
}

function countMatches(tags: SkillTag[], preferredTags: SkillTag[]): number {
  return tags.filter((tag) => preferredTags.includes(tag)).length;
}
