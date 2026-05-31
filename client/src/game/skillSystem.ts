import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { getSkillRoleScore } from "./skillRolePreferences";
import { getSkillsForClass } from "./skills";
import { type GameState } from "./state";
import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getCompanionAttackRange } from "./companionCombat";
import { getActiveDirectCompanionCommand } from "./directCompanionCommands";
import {
  resolveSkillEffect,
  type SkillUse,
} from "./skillEffectResolution";
import { getSkillTarget } from "./skillTargeting";
import { isCompanionAssignedToResurrectionRecovery } from "./resurrectionSystem";
import { getGridDistance } from "./positionUtils";
import type { Companion, Enemy, GameEntity, SkillDefinition } from "./types";

export { updateSkillShieldBlockPositions } from "./skillEffectResolution";

const SKILL_COOLDOWN_MS = 5000;
const LOW_HEALTH_BUFFER = 1;
const OPENING_LUNGE_SCORE_BONUS = 10;
const NORMAL_SKILL_SELECTION_PRIORITY = 0;
const EMERGENCY_SKILL_SELECTION_PRIORITY = 1;

type SkillUseOptions = {
  combatOnly?: boolean;
  forcedEnemyTargetId?: string | null;
};

export function updateSkillSystem(state: GameState, now = Date.now()): GameState {
  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    const caster = nextState.entities[entity.id];
    const cooldownSkill =
      isLivingCompanion(caster) && isSkillOnCooldown(nextState, caster, now)
        ? getCooldownSkill(nextState, caster)
        : undefined;

    if (!canUsePrototypeSkill(nextState, caster, now)) {
      if (isLivingCompanion(caster) && cooldownSkill) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill: cooldownSkill,
          reason: "cooldown",
        });
      }
      continue;
    }

    const result = chooseSkillUse(nextState, caster);
    nextState = result.state;
    const skillUse = result.skillUse;

    if (!skillUse) {
      continue;
    }

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
    const cooldownSkill =
      isLivingCompanion(caster) && isSkillOnCooldown(nextState, caster, now)
        ? getCooldownSkill(nextState, caster)
        : undefined;

    if (!canUsePrototypeCombatSkill(nextState, caster, now)) {
      if (isLivingCompanion(caster) && cooldownSkill) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill: cooldownSkill,
          reason: "cooldown",
        });
      }
      continue;
    }

    const result = chooseSkillUse(nextState, caster, {
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
  now: number,
): entity is Companion {
  return Boolean(
    entity &&
      entity.kind === "companion" &&
      entity.state !== "dead" &&
      entity.health > 0 &&
      hasCombatSkillContext(state, entity) &&
      !isSkillOnCooldown(state, entity, now),
  );
}

function canUsePrototypeSkill(
  state: GameState,
  entity: GameEntity | undefined,
  now: number,
): entity is Companion {
  return Boolean(
    entity &&
      entity.kind === "companion" &&
      entity.state !== "dead" &&
      entity.health > 0 &&
      entity.commandPriority !== "direct" &&
      !isSkillOnCooldown(state, entity, now),
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

function isSkillOnCooldown(
  state: GameState,
  entity: Companion,
  now: number,
): boolean {
  const cooldown = state.skillCooldownsByCompanionId?.[entity.id];
  return Boolean(cooldown && cooldown.expiresAt > now);
}

function getCooldownSkill(
  state: GameState,
  entity: Companion,
): SkillDefinition | undefined {
  const cooldown = state.skillCooldownsByCompanionId?.[entity.id];

  return cooldown
    ? getSkillsForClass(entity.classId).find((skill) => skill.id === cooldown.skillId)
    : undefined;
}

function getSkillTargetSkipReason(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
): string {
  if (
    (skill.effect.type === "selfBuff" || skill.effect.type === "allyBuff") &&
    state.skillSelfBuffsByCompanionId?.[caster.id]
  ) {
    return "active_duplicate_buff";
  }

  if (
    skill.effect.type === "gatherBuff" &&
    state.skillGatherBuffsByCompanionId?.[caster.id]
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
  options: SkillUseOptions = {},
): { state: GameState; skillUse: SkillUse | null } {
  let nextState = state;
  const skillUses = getSkillsForClass(caster.classId)
    .filter((skill) => !options.combatOnly || isCombatSkill(skill))
    .map((skill): SkillUse | null => {
      const target = getSkillTarget(state, caster, skill, {
        forcedEnemyTargetId: options.forcedEnemyTargetId,
      });

      if (!target) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill,
          reason: getSkillTargetSkipReason(state, caster, skill),
        });
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

      if (roleScore <= 0) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill,
          score: roleScore,
          reason: "non_positive_role_score",
        });
        return null;
      }

      return {
        skill,
        target,
        score: getSkillSelectionScore(caster, skill, target, roleScore),
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
  caster: Companion,
  skill: SkillDefinition,
  target: Enemy | Companion | undefined,
  roleScore: number,
): number {
  return isOpeningLungeSkillUse(caster, skill, target)
    ? roleScore + OPENING_LUNGE_SCORE_BONUS
    : roleScore;
}

function getSkillSelectionPriority(skill: SkillDefinition): number {
  return isEmergencySkill(skill)
    ? EMERGENCY_SKILL_SELECTION_PRIORITY
    : NORMAL_SKILL_SELECTION_PRIORITY;
}

function isEmergencySkill(skill: SkillDefinition): boolean {
  return (
    skill.effect.type === "heal" ||
    skill.effect.type === "selfCostHeal" ||
    skill.effect.type === "shieldBlock"
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
    skill.effect.type === "selfCostHeal" ||
    skill.effect.type === "selfBuff" ||
    skill.effect.type === "allyBuff" ||
    skill.effect.type === "shieldBlock"
  );
}

function isOpeningLungeSkillUse(
  caster: Companion,
  skill: SkillDefinition,
  target: Enemy | Companion | undefined,
): target is Enemy {
  return (
    skill.effect.type === "lungeDamage" &&
    isLivingEnemy(target) &&
    getGridDistance(caster.position, target.position) >
      getCompanionAttackRange(caster)
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

  return startSkillCooldown(
    recordSkillApplied(result.state, caster, skillUse, result.appliedTargetId),
    caster,
    skill,
    now,
  );
}

function startSkillCooldown(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  return {
    ...state,
    skillCooldownsByCompanionId: {
      ...(state.skillCooldownsByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        skillId: skill.id,
        expiresAt: now + getSkillCooldownMs(skill),
      },
    },
  };
}

function isCombatSkill(skill: SkillDefinition): boolean {
  return skill.effect.type !== "gatherBuff";
}

function getSkillCooldownMs(skill: SkillDefinition): number {
  return skill.cooldownMs ?? SKILL_COOLDOWN_MS;
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
