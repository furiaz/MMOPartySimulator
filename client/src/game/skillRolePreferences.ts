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
      "Party Buff",
      "Self Healing",
      "Maintenance",
    ],
    secondary: ["Mobility", "Control"],
    fallback: [],
    avoid: ["Heal", "Shield", "Barrier", "Gathering", "Taunt", "Aggro"],
  },
  defender: {
    primary: [
      "Taunt",
      "Aggro",
      "Defensive",
      "Shield",
      "Barrier",
      "Damage Mitigation",
      "Elemental Mitigation",
      "Control",
      "Self Healing",
      "Self Buff",
      "Party Buff",
      "Maintenance",
      "Summon - Defense",
    ],
    secondary: ["Mobility", "Damage"],
    fallback: [],
    avoid: ["Gathering", "Self Cost - HP"],
  },
  support: {
    primary: [
      "Heal",
      "Self Healing",
      "Shield",
      "Barrier",
      "Buff",
      "Self Buff",
      "Party Buff",
      "Cleanse",
      "Safety",
      "Maintenance",
      "Summon - Support",
    ],
    secondary: ["Control", "Mobility", "Self Cost - HP"],
    fallback: ["Damage", "Single Target"],
    avoid: ["Aggro", "Taunt"],
  },
  gatherer: {
    primary: [
      "Gathering",
      "Resource Buff",
      "Tool Buff",
      "Self Buff",
      "Party Buff",
      "Maintenance",
    ],
    secondary: ["Mobility", "Escape", "Safety", "Self Healing"],
    fallback: ["Light Damage", "Single Target"],
    avoid: ["Aggro", "Taunt"],
  },
  none: {
    primary: ["Self Buff", "Party Buff", "Maintenance"],
    secondary: ["Safety", "Mobility", "Self Healing"],
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
    countAvoidMatches(tags, preference.avoid) * 6
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

function countAvoidMatches(
  tags: SkillTag[],
  avoidedTags: SkillTag[],
): number {
  let effectiveAvoids = avoidedTags;

  if (tags.includes("Self Healing")) {
    effectiveAvoids = effectiveAvoids.filter((tag) => tag !== "Heal");
  }

  if (tags.includes("Maintenance")) {
    effectiveAvoids = effectiveAvoids.filter(
      (tag) => tag !== "Shield" && tag !== "Barrier",
    );
  }

  return tags.filter((tag) => effectiveAvoids.includes(tag)).length;
}
