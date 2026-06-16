import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getSkillRoleScore } from "./skillRolePreferences";
import { getActiveSkillsForCompanion } from "./skillProgression";
import { getSkillCooldownMs } from "./skills";
import { type GameState } from "./state";
import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getCompanionAttackRange } from "./companionCombat";
import { getActiveDirectCompanionCommand } from "./directCompanionCommands";
import {
  resolveSkillEffect,
  type SkillUse,
} from "./skillEffectResolution";
import { isBeginnerFirstAidSelfHealPriorityUse } from "./skillBehavior";
import {
  getSkillTarget,
  hasPartyCombatContext,
  isLeaderOpeningKickSkillUse,
  isProtectiveTauntSkillUse,
  isSupportAttackerKickSkillUse,
} from "./skillTargeting";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { getGridDistance } from "./positionUtils";
import { getPartyCombatTarget } from "./partyTargetSystem";
import {
  isCompanionGlobalCooldownActive,
  isSkillCooldownActive,
  startCompanionGlobalCooldown,
  startSkillCooldown,
} from "./companionCooldowns";
import type { Companion, Enemy, GameEntity, SkillDefinition } from "./types";

export { updateSkillShieldBlockPositions } from "./skillEffectResolution";

const LOW_HEALTH_BUFFER = 1;
const BEGINNER_FIRST_AID_SELF_HEAL_SCORE_BONUS = 20;
const PROTECTIVE_THROW_ROCK_SCORE_BONUS = 5;
const SUPPORT_ATTACKER_KICK_SCORE_BONUS = 12;
const LEADER_OPENING_KICK_SCORE_BONUS = 10;
const OUT_OF_COMBAT_FIRST_AID_ALLY_SCORE_BONUS = 7;
const NORMAL_SKILL_SELECTION_PRIORITY = 0;
const EMERGENCY_SKILL_SELECTION_PRIORITY = 1;
const ATTACK_SKILL_TELEMETRY_CONTEXT_RANGE = 5;

type SkillUseOptions = {
  now: number;
  combatOnly?: boolean;
  forcedEnemyTargetId?: string | null;
  firstAidReservedTargetIds?: Set<string>;
};

export function updateSkillSystem(state: GameState, now = Date.now()): GameState {
  let nextState = state;
  const firstAidReservedTargetIds = new Set<string>();

  for (const entity of Object.values(state.entities)) {
    const caster = nextState.entities[entity.id];

    if (
      isLivingCompanion(caster) &&
      isCompanionGlobalCooldownActive(nextState, caster.id, now)
    ) {
      continue;
    }

    if (!canUsePrototypeSkill(nextState, caster)) {
      continue;
    }

    const result = chooseSkillUse(nextState, caster, {
      now,
      firstAidReservedTargetIds,
    });
    nextState = result.state;
    const skillUse = result.skillUse;

    if (!skillUse) {
      continue;
    }

    reserveOutOfCombatFirstAidTarget(
      nextState,
      caster,
      skillUse,
      firstAidReservedTargetIds,
    );
    nextState = applySkill(nextState, caster, skillUse, now);
  }

  return nextState;
}

export function updateCombatSkillSystem(
  state: GameState,
  now = Date.now(),
): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    const caster = nextState.entities[entity.id];

    if (
      isLivingCompanion(caster) &&
      isCompanionGlobalCooldownActive(nextState, caster.id, now)
    ) {
      continue;
    }

    if (!canUsePrototypeCombatSkill(nextState, caster)) {
      continue;
    }

    const result = chooseSkillUse(nextState, caster, {
      now,
      combatOnly: true,
      forcedEnemyTargetId: getForcedDirectAttackTargetId(nextState, caster),
    });
    nextState = result.state;
    const skillUse = result.skillUse;

    if (!skillUse) {
      continue;
    }

    nextState = applySkill(nextState, caster, skillUse, now);
  }

  return nextState;
}

function canUsePrototypeCombatSkill(
  state: GameState,
  entity: GameEntity | undefined,
): entity is Companion {
  return Boolean(
    entity &&
      entity.kind === "companion" &&
      entity.state !== "dead" &&
      entity.health > 0 &&
      hasCombatSkillContext(state, entity),
  );
}

function canUsePrototypeSkill(
  _state: GameState,
  entity: GameEntity | undefined,
): entity is Companion {
  return Boolean(
    entity &&
      entity.kind === "companion" &&
      entity.state !== "dead" &&
      entity.health > 0 &&
      entity.commandPriority !== "direct",
  );
}

function hasCombatSkillContext(state: GameState, caster: Companion): boolean {
  const currentTarget = caster.currentTargetId
    ? state.entities[caster.currentTargetId]
    : undefined;

  if (caster.commandPriority !== "direct") {
    return caster.state === "attack" && isLivingEnemy(currentTarget);
  }

  const directCommand = getActiveDirectCompanionCommand(state, caster.id);

  if (directCommand?.type === "attack") {
    return (
      caster.state === "attack" &&
      isLivingEnemy(currentTarget) &&
      currentTarget.id === directCommand.targetId
    );
  }

  return (
    caster.state === "attack" &&
    isLivingEnemy(currentTarget) &&
    isPersonalThreat(state, caster, currentTarget)
  );
}

function getForcedDirectAttackTargetId(
  state: GameState,
  caster: Companion,
): string | null {
  const directCommand = getActiveDirectCompanionCommand(state, caster.id);

  return directCommand?.type === "attack" ? directCommand.targetId : null;
}

function isPersonalThreat(
  state: GameState,
  caster: Companion,
  enemy: Enemy,
): boolean {
  const movementFailure = state.movementFailuresByEntityId?.[caster.id];

  return (
    enemy.currentTargetId === caster.id ||
    movementFailure?.blockerId === enemy.id
  );
}

function getSkillTargetSkipReason(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): string {
  if (
    skill.effect.type === "selfBuff" &&
    state.skillSelfBuffsByCompanionId?.[caster.id] &&
    !canUseRefreshableRuntimeState(
      state.skillSelfBuffsByCompanionId[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return "active_duplicate_buff";
  }

  if (
    skill.effect.type === "partyBuff" &&
    state.skillPartyBuffsBySourceId?.[caster.id] &&
    !canUseRefreshableRuntimeState(
      state.skillPartyBuffsBySourceId[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return "active_duplicate_buff";
  }

  if (
    skill.effect.type === "gatherBuff" &&
    state.skillGatherBuffsByCompanionId?.[caster.id] &&
    !canUseRefreshableRuntimeState(
      state.skillGatherBuffsByCompanionId[caster.id]?.expiresAt,
      skill.effect.refreshWindowMs,
      now,
    )
  ) {
    return "active_duplicate_buff";
  }

  if (
    skill.effect.type === "shieldBlock" &&
    Object.values(state.skillShieldBlocksById ?? {}).some(
      (shield) => shield.ownerId === caster.id,
    )
  ) {
    return "active_duplicate_shield";
  }

  if (
    (skill.effect.type === "selfBuff" || skill.effect.type === "selfCostHeal") &&
    "hpCost" in skill.effect &&
    caster.health <= skill.effect.hpCost + LOW_HEALTH_BUFFER
  ) {
    return "unsafe_hp_cost";
  }

  return "no_target";
}

function chooseSkillUse(
  state: GameState,
  caster: Companion,
  options: SkillUseOptions,
): { state: GameState; skillUse: SkillUse | null } {
  let nextState = state;
  const skillUses = getActiveSkillsForCompanion(caster)
    .filter((skill) => !options.combatOnly || isCombatSkill(skill))
    .map((skill): SkillUse | null => {
      if (isSkillCooldownActive(state, caster.id, skill.id, options.now)) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill,
          reason: "skill_cooldown",
        });
        return null;
      }

      const target = getSkillTarget(state, caster, skill, {
        now: options.now,
        forcedEnemyTargetId: options.forcedEnemyTargetId,
        firstAidReservedTargetIds: options.firstAidReservedTargetIds,
      });

      if (!target) {
        const reason = getSkillTargetSkipReason(state, caster, skill, options.now);

        if (
          !shouldSuppressSkillSkipTelemetry(state, caster, skill, reason, options)
        ) {
          nextState = recordSkillTelemetry(nextState, caster, {
            type: "skill_skipped",
            skill,
            reason,
          });
        }
        return null;
      }

      if (!isRecoveryAreaSkillUseAllowed(state, caster, skill, target)) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill,
          reason: "resurrection_recovery",
        });
        return null;
      }

      const roleScore = getSkillRoleScore(caster.role, skill.tags);
      const score = getSkillSelectionScore(
        state,
        caster,
        skill,
        target,
        roleScore,
      );

      if (score <= 0) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill,
          score,
          reason: "non_positive_role_score",
        });
        return null;
      }

      return {
        skill,
        target,
        score,
        selectionPriority: getSkillSelectionPriority(skill),
      };
    })
    .filter((skillUse): skillUse is SkillUse => Boolean(skillUse));

  const skillUse =
    skillUses.sort(
      (a, b) =>
        b.selectionPriority - a.selectionPriority ||
        b.score - a.score,
    )[0] ?? null;

  return {
    state: skillUse
      ? recordSkillTelemetry(nextState, caster, {
          type: "skill_selected",
          skill: skillUse.skill,
          score: skillUse.score,
          targetId: skillUse.target?.id,
        })
      : nextState,
    skillUse,
  };
}

function getSkillSelectionScore(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  target: Enemy | Companion | undefined,
  roleScore: number,
): number {
  let score = roleScore;

  if (isProtectiveTauntSkillUse(state, skill, target)) {
    score += PROTECTIVE_THROW_ROCK_SCORE_BONUS;
  }

  if (isSupportAttackerKickSkillUse(state, skill, target)) {
    score += SUPPORT_ATTACKER_KICK_SCORE_BONUS;
  }

  if (isLeaderOpeningKickSkillUse(state, caster, skill, target)) {
    score += LEADER_OPENING_KICK_SCORE_BONUS;
  }

  if (
    target?.kind === "companion" &&
    isBeginnerFirstAidSelfHealPriorityUse(caster, skill, target)
  ) {
    score += BEGINNER_FIRST_AID_SELF_HEAL_SCORE_BONUS;
  }

  if (isOutOfCombatFirstAidAllyUse(state, caster, skill, target)) {
    score += OUT_OF_COMBAT_FIRST_AID_ALLY_SCORE_BONUS;
  }

  return score;
}

function getSkillSelectionPriority(skill: SkillDefinition): number {
  return isEmergencySkill(skill)
    ? EMERGENCY_SKILL_SELECTION_PRIORITY
    : NORMAL_SKILL_SELECTION_PRIORITY;
}

function isEmergencySkill(skill: SkillDefinition): boolean {
  return (
    skill.effect.type === "heal" ||
    skill.effect.type === "selfPercentHeal" ||
    skill.effect.type === "selfCostHeal" ||
    skill.effect.type === "shieldBlock" ||
    skill.effect.type === "damageMitigation"
  );
}

function isRecoveryAreaSkillUseAllowed(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  target: Enemy | Companion,
): boolean {
  if (!isCompanionAssignedToResurrectionRecovery(state, caster.id)) {
    return true;
  }

  if (isLivingEnemy(target)) {
    return (
      getGridDistance(caster.position, target.position) <=
      getCompanionAttackRange(caster)
    );
  }

  return (
    skill.effect.type === "heal" ||
    skill.effect.type === "selfPercentHeal" ||
    skill.effect.type === "selfCostHeal" ||
    skill.effect.type === "selfBuff" ||
    skill.effect.type === "partyBuff" ||
    skill.effect.type === "damageMitigation" ||
    skill.effect.type === "allyBuff" ||
    skill.effect.type === "shieldBlock"
  );
}

function applySkill(
  state: GameState,
  caster: Companion,
  skillUse: SkillUse,
  now: number,
): GameState {
  const { skill, target } = skillUse;
  const usedState = recordSkillTelemetry(state, caster, {
    type: "skill_used",
    skill,
    score: skillUse.score,
    targetId: target?.id,
  });
  const result = resolveSkillEffect(usedState, caster, skillUse, now);

  if (!result.shouldConsumeCooldown) {
    return result.state;
  }

  const appliedState = recordSkillApplied(
    result.state,
    caster,
    skillUse,
    result.appliedTargetId,
  );
  const cooldownState = startSkillCooldown(
    appliedState,
    caster.id,
    skill,
    now,
    getSkillCooldownMs(skill),
  );

  return startCompanionGlobalCooldown(
    cooldownState,
    caster.id,
    now,
    "skill",
    skill.id,
  );
}

function reserveOutOfCombatFirstAidTarget(
  state: GameState,
  caster: Companion,
  skillUse: SkillUse,
  reservedTargetIds: Set<string>,
): void {
  const target = skillUse.target;

  if (
    skillUse.skill.id !== "first_aid" ||
    !target ||
    target.kind !== "companion" ||
    target.id === caster.id ||
    hasPartyCombatContext(state, caster)
  ) {
    return;
  }

  reservedTargetIds.add(target.id);
}

function isOutOfCombatFirstAidAllyUse(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  target: Enemy | Companion | undefined,
): target is Companion {
  return (
    skill.id === "first_aid" &&
    target?.kind === "companion" &&
    target.id !== caster.id &&
    !hasPartyCombatContext(state, caster)
  );
}

function isCombatSkill(skill: SkillDefinition): boolean {
  return skill.effect.type !== "gatherBuff";
}

function shouldSuppressSkillSkipTelemetry(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  reason: string,
  options: SkillUseOptions,
): boolean {
  return (
    reason === "no_target" &&
    isAttackRelatedEnemySkill(skill) &&
    !hasAttackSkillTelemetryContext(state, caster, skill, options)
  );
}

function isAttackRelatedEnemySkill(skill: SkillDefinition): boolean {
  switch (skill.effect.type) {
    case "damage":
    case "lungeDamage":
    case "sweepingDamage":
    case "taunt":
    case "mark":
    case "bind":
      return true;
    default:
      return false;
  }
}

function canUseRefreshableRuntimeState(
  expiresAt: number | undefined,
  refreshWindowMs = 0,
  now: number,
): boolean {
  return expiresAt === undefined || expiresAt - now <= refreshWindowMs;
}

function hasAttackSkillTelemetryContext(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  options: SkillUseOptions,
): boolean {
  const currentTarget = caster.currentTargetId
    ? state.entities[caster.currentTargetId]
    : undefined;

  if (isLivingEnemy(currentTarget)) {
    return true;
  }

  const forcedTarget = options.forcedEnemyTargetId
    ? state.entities[options.forcedEnemyTargetId]
    : undefined;

  if (isLivingEnemy(forcedTarget)) {
    return true;
  }

  if (getPartyCombatTarget(state)) {
    return true;
  }

  const nearbyRange = Math.max(skill.range, ATTACK_SKILL_TELEMETRY_CONTEXT_RANGE);

  return Object.values(state.entities).some(
    (entity) =>
      isLivingEnemy(entity) &&
      getGridDistance(caster.position, entity.position) <= nearbyRange,
  );
}

function recordSkillApplied(
  state: GameState,
  caster: Companion,
  skillUse: SkillUse,
  targetId?: string,
): GameState {
  return recordSkillTelemetry(state, caster, {
    type: "skill_effect_applied",
    skill: skillUse.skill,
    score: skillUse.score,
    targetId,
  });
}

function recordSkillTelemetry(
  state: GameState,
  caster: Companion,
  event: {
    type: "skill_selected" | "skill_used" | "skill_skipped" | "skill_effect_applied";
    skill?: SkillDefinition;
    score?: number;
    targetId?: string;
    reason?: string;
  },
): GameState {
  return appendDebugTelemetryEvent(state, {
    type: event.type,
    entityId: caster.id,
    targetId: event.targetId,
    companionClassId: caster.classId,
    skillId: event.skill?.id,
    skillDisplayName: event.skill?.displayName,
    skillTags: event.skill?.tags,
    skillScore: event.score,
    skillEffectType: event.skill?.effect.type,
    reason: event.reason,
  });
}
