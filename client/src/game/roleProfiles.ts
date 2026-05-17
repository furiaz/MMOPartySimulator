import type { PartyMemberRole } from "./types";

export type RoleProfile = {
  positionBias: "front" | "mid" | "back" | "free";
  followDistance: "tight" | "normal" | "loose";
  aggression: "veryLow" | "low" | "medium" | "high";
  taskCommitment: "low" | "medium" | "high";
  riskTolerance: "veryLow" | "low" | "medium" | "high";
  movementPriority: "lead" | "follow" | "adaptive" | "independent";
  cooldownUsage: "minimal" | "conservative" | "defensive" | "aggressive";
  resourceSpending: "minimal" | "conservative" | "moderate" | "aggressive";
};

export type RoleTuning = {
  engageRange?: number;
  chaseLimit: number;
  leashDistance: number;
  interruptBuffer: number;
  dangerThreshold: number;
  protectionRadius?: number;
  criticalHpPercent?: number;
  preferredHealHpPercent?: number;
  resourceSearchRange?: number;
  combatAssistRange?: number;
};

export const COMBAT_APPROACH_DISTANCE = 3;
export const FORMATION_COHESION_PATH_DISTANCE = 5;

export const ROLE_PRIORITY: Record<PartyMemberRole, number> = {
  defender: 0,
  fighter: 1,
  support: 2,
  gatherer: 3,
  none: 4,
};

export const ROLE_PROFILES: Record<PartyMemberRole, RoleProfile> = {
  defender: {
    positionBias: "front",
    followDistance: "tight",
    aggression: "medium",
    taskCommitment: "medium",
    riskTolerance: "high",
    movementPriority: "lead",
    cooldownUsage: "defensive",
    resourceSpending: "conservative",
  },
  fighter: {
    positionBias: "mid",
    followDistance: "normal",
    aggression: "high",
    taskCommitment: "medium",
    riskTolerance: "medium",
    movementPriority: "adaptive",
    cooldownUsage: "aggressive",
    resourceSpending: "moderate",
  },
  support: {
    positionBias: "back",
    followDistance: "normal",
    aggression: "low",
    taskCommitment: "medium",
    riskTolerance: "low",
    movementPriority: "follow",
    cooldownUsage: "conservative",
    resourceSpending: "conservative",
  },
  gatherer: {
    positionBias: "back",
    followDistance: "loose",
    aggression: "veryLow",
    taskCommitment: "high",
    riskTolerance: "low",
    movementPriority: "independent",
    cooldownUsage: "minimal",
    resourceSpending: "minimal",
  },
  none: {
    positionBias: "free",
    followDistance: "normal",
    aggression: "low",
    taskCommitment: "low",
    riskTolerance: "low",
    movementPriority: "follow",
    cooldownUsage: "minimal",
    resourceSpending: "minimal",
  },
};

export const ROLE_TUNING: Record<PartyMemberRole, RoleTuning> = {
  defender: {
    engageRange: 6,
    chaseLimit: 3,
    leashDistance: 4,
    protectionRadius: 6,
    interruptBuffer: 10,
    dangerThreshold: 6,
  },
  fighter: {
    engageRange: 8,
    chaseLimit: 6,
    leashDistance: 8,
    interruptBuffer: 20,
    dangerThreshold: 4,
  },
  support: {
    engageRange: 3,
    chaseLimit: 0,
    leashDistance: 6,
    criticalHpPercent: 0.35,
    preferredHealHpPercent: 0.65,
    interruptBuffer: 10,
    dangerThreshold: 3,
  },
  gatherer: {
    resourceSearchRange: 30,
    combatAssistRange: 3,
    chaseLimit: 0,
    leashDistance: 32,
    interruptBuffer: 30,
    dangerThreshold: 2,
  },
  none: {
    chaseLimit: 0,
    leashDistance: 6,
    interruptBuffer: 20,
    dangerThreshold: 2,
  },
};

export function getRolePriority(role: PartyMemberRole): number {
  return ROLE_PRIORITY[role];
}
