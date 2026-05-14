import { damageEntity, setLastAttackAt } from "./entities";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { grantCharacterXpToParty } from "./leveling";
import { getSkillRoleScore } from "./skillRolePreferences";
import { getPrototypeAttackDamage } from "./skillRuntime";
import { getSkillsForClass } from "./skills";
import {
  addCombatFeedback,
  addSkillVisualEvent,
  findClosestAvailablePosition,
  updateEntity,
  type GameState,
} from "./state";
import { getLeaderMovementDirection } from "./roleSystem";
import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { findEnemyTarget, getSkillTarget } from "./skillTargeting";
import { getGridDistance } from "./positionUtils";
import type {
  Companion,
  Enemy,
  GameEntity,
  Position,
  SkillDefinition,
  SkillShieldBlockState,
} from "./types";

const SKILL_COOLDOWN_MS = 5000;
const LOW_HEALTH_BUFFER = 1;
const VISUAL_DURATION_MS = 600;
const SHIELD_OFFSET_DISTANCE = 1;
const DEFAULT_SHIELD_DIRECTION: Position = { x: 0, y: -1 };

type SkillUse = {
  skill: SkillDefinition;
  target?: Enemy | Companion;
  score: number;
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

export function updateSkillShieldBlockPositions(state: GameState): GameState {
  const skillShieldBlocksById = Object.fromEntries(
    Object.entries(state.skillShieldBlocksById ?? {})
      .map(([shieldId, shield]) => {
        const owner = state.entities[shield.ownerId];

        if (!isLivingCompanion(owner)) {
          return null;
        }

        return [shieldId, getUpdatedShieldBlock(state, owner, shield)];
      })
      .filter((entry): entry is [string, SkillShieldBlockState] => Boolean(entry)),
  );

  return {
    ...state,
    skillShieldBlocksById,
  };
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
): { state: GameState; skillUse: SkillUse | null } {
  let nextState = state;
  const skillUses = getSkillsForClass(caster.classId)
    .map((skill): SkillUse | null => {
      const target = getSkillTarget(state, caster, skill);

      if (!target) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill,
          reason: getSkillTargetSkipReason(state, caster, skill),
        });
        return null;
      }

      const score = getSkillRoleScore(caster.role, skill.tags);

      if (score <= 0) {
        nextState = recordSkillTelemetry(nextState, caster, {
          type: "skill_skipped",
          skill,
          score,
          reason: "non_positive_role_score",
        });
        return null;
      }

      return { skill, target, score };
    })
    .filter((skillUse): skillUse is SkillUse => Boolean(skillUse));

  const skillUse = skillUses.sort((a, b) => b.score - a.score)[0] ?? null;

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

function applySkill(
  state: GameState,
  caster: Companion,
  skillUse: SkillUse,
  now: number,
): GameState {
  const { skill, target } = skillUse;
  let nextState = recordSkillTelemetry(state, caster, {
    type: "skill_used",
    skill,
    score: skillUse.score,
    targetId: target?.id,
  });

  if (skill.effect.type === "damage" && isLivingEnemy(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applyDamageSkill(nextState, caster, target, skill, skill.effect.damage, now),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "sweepingDamage" && isLivingEnemy(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applySweepingStrike(nextState, caster, target, skill, now),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "taunt" && isLivingEnemy(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applyTaunt(nextState, caster, target, skill, now),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "mark" && isLivingEnemy(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applyMarkTarget(nextState, caster, target, skill, now),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "selfBuff") {
    return startSkillCooldown(
      recordSkillApplied(
        applySelfBuff(nextState, caster, skill, now),
        caster,
        skillUse,
        caster.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "allyBuff" && isLivingCompanion(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applyAllyBuff(nextState, caster, target, skill, now),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "gatherBuff") {
    return startSkillCooldown(
      recordSkillApplied(
        applyGatherBuff(nextState, caster, skill, now),
        caster,
        skillUse,
        caster.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "quickStep") {
    return startSkillCooldown(
      recordSkillApplied(
        applyQuickStep(nextState, caster, skill, now),
        caster,
        skillUse,
        caster.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "shieldBlock") {
    return startSkillCooldown(
      recordSkillApplied(
        applyShieldBlock(nextState, caster, skill, now),
        caster,
        skillUse,
        caster.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "bind" && isLivingEnemy(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applyBind(nextState, caster, target, skill, now),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "heal" && isLivingCompanion(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applyHeal(nextState, caster, target, skill.effect.amount, 0, now),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  if (skill.effect.type === "selfCostHeal" && isLivingCompanion(target)) {
    return startSkillCooldown(
      recordSkillApplied(
        applyHeal(
          nextState,
          caster,
          target,
          skill.effect.amount,
          skill.effect.hpCost,
          now,
        ),
        caster,
        skillUse,
        target.id,
      ),
      caster,
      skill,
      now,
    );
  }

  return nextState;
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
        expiresAt: now + SKILL_COOLDOWN_MS,
      },
    },
  };
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

function applyDamageSkill(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  baseDamage: number,
  now: number,
): GameState {
  const damage = getPrototypeAttackDamage(state, caster, target, baseDamage);
  let nextState = damageEnemy(state, caster, target, damage, skill.displayName, now);

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return updateCasterLastAttackAt(nextState, caster.id, now);
}

function applySweepingStrike(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "sweepingDamage") {
    return state;
  }

  const mainDamage = getPrototypeAttackDamage(
    state,
    caster,
    target,
    skill.effect.mainDamage,
  );
  let nextState = damageEnemy(state, caster, target, mainDamage, skill.displayName, now);
  const currentTarget = nextState.entities[target.id];

  for (const enemy of Object.values(nextState.entities)) {
    if (
      enemy.kind !== "enemy" ||
      enemy.id === target.id ||
      enemy.state === "dead" ||
      !currentTarget ||
      getGridDistance(enemy.position, currentTarget.position) > skill.effect.splashRange
    ) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      enemy,
      skill.effect.splashDamage,
      "Sweep",
      now,
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "slash",
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return updateCasterLastAttackAt(nextState, caster.id, now);
}

function applyTaunt(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "taunt") {
    return state;
  }

  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  if (skill.effect.damage > 0) {
    nextState = damageEnemy(nextState, caster, target, skill.effect.damage, skill.displayName, now);
  }

  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget)) {
    nextState = updateEntity(nextState, {
      ...currentTarget,
      state: "attack",
      currentTargetId: caster.id,
    });
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return updateCasterLastAttackAt(nextState, caster.id, now);
}

function applyMarkTarget(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "mark") {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillMarksByEnemyId: {
      ...(state.skillMarksByEnemyId ?? {}),
      [target.id]: {
        sourceId: caster.id,
        targetId: target.id,
        bonusDamage: skill.effect.bonusDamage,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return updateEntity(nextState, setLastAttackAt(caster, now));
}

function applySelfBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "selfBuff" ||
    state.skillSelfBuffsByCompanionId?.[caster.id] ||
    caster.health <= skill.effect.hpCost + LOW_HEALTH_BUFFER
  ) {
    return state;
  }

  const damagedCaster = {
    ...caster,
    health: caster.health - skill.effect.hpCost,
  };
  let nextState: GameState = {
    ...updateEntity(state, damagedCaster),
    skillSelfBuffsByCompanionId: {
      ...(state.skillSelfBuffsByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        bonusDamage: skill.effect.bonusDamage,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: skill.effect.hpCost > 0 ? "red_flash" : "heal",
    sourceId: caster.id,
    now,
    durationMs: 500,
  });
  nextState = addCombatFeedback(nextState, {
    type: skill.effect.hpCost > 0 ? "damage" : "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return updateEntity(nextState, setLastAttackAt(damagedCaster, now));
}

function applyAllyBuff(
  state: GameState,
  caster: Companion,
  target: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "allyBuff" ||
    state.skillSelfBuffsByCompanionId?.[target.id]
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillSelfBuffsByCompanionId: {
      ...(state.skillSelfBuffsByCompanionId ?? {}),
      [target.id]: {
        companionId: target.id,
        bonusDamage: skill.effect.bonusDamage,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return updateEntity(nextState, setLastAttackAt(caster, now));
}

function applyGatherBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (
    skill.effect.type !== "gatherBuff" ||
    state.skillGatherBuffsByCompanionId?.[caster.id]
  ) {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillGatherBuffsByCompanionId: {
      ...(state.skillGatherBuffsByCompanionId ?? {}),
      [caster.id]: {
        companionId: caster.id,
        bonusGatherSpeed: skill.effect.bonusGatherSpeed,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    sourceId: caster.id,
    now,
    durationMs: 600,
  });
  nextState = addCombatFeedback(nextState, {
    type: "gather",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return updateEntity(nextState, setLastAttackAt(caster, now));
}

function applyQuickStep(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "quickStep") {
    return state;
  }

  const enemy = findEnemyTarget(state, caster, 6);
  const direction = getUnitDirection(
    enemy
      ? {
          x: caster.position.x - enemy.position.x,
          y: caster.position.y - enemy.position.y,
        }
      : getLeaderMovementDirection(state, caster),
    DEFAULT_SHIELD_DIRECTION,
  );
  const intendedPosition = {
    x: caster.position.x + direction.x * skill.effect.distance,
    y: caster.position.y + direction.y * skill.effect.distance,
  };
  const position = findClosestAvailablePosition(state, intendedPosition, {
    ignoredEntityId: caster.id,
  });
  let nextState = updateEntity(state, {
    ...caster,
    position,
  });

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    sourceId: caster.id,
    position,
    now,
    durationMs: 400,
  });
  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return updateEntity(nextState, setLastAttackAt({ ...caster, position }, now));
}

function applyShieldBlock(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "shieldBlock") {
    return state;
  }

  const shieldPlacement = getShieldPlacement(state, caster);
  const shieldId = `${caster.id}-${skill.id}`;
  let nextState: GameState = {
    ...state,
    skillShieldBlocksById: {
      ...(state.skillShieldBlocksById ?? {}),
      [shieldId]: {
        id: shieldId,
        ownerId: caster.id,
        position: shieldPlacement.position,
        rotationRadians: shieldPlacement.rotationRadians,
        expiresAt: now + skill.effect.durationMs,
        remainingBlocks: skill.effect.blocks,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return updateEntity(nextState, setLastAttackAt(caster, now));
}

function applyBind(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "bind") {
    return state;
  }

  let nextState: GameState = {
    ...state,
    skillBindsByEnemyId: {
      ...(state.skillBindsByEnemyId ?? {}),
      [target.id]: {
        sourceId: caster.id,
        targetId: target.id,
        expiresAt: now + skill.effect.durationMs,
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: skill.displayName,
    now,
  });

  return updateEntity(nextState, setLastAttackAt(caster, now));
}

function applyHeal(
  state: GameState,
  caster: Companion,
  target: Companion,
  amount: number,
  hpCost: number,
  now: number,
): GameState {
  if (hpCost > 0 && caster.health <= hpCost + LOW_HEALTH_BUFFER) {
    return state;
  }

  const healedTarget = {
    ...target,
    health: Math.min(target.maxHealth, target.health + amount),
  };
  let nextState = updateEntity(state, healedTarget);

  if (hpCost > 0) {
    const currentCaster = nextState.entities[caster.id];

    if (isLivingCompanion(currentCaster)) {
      const damagedCaster = {
        ...currentCaster,
        health: currentCaster.health - hpCost,
      };

      nextState = updateEntity(nextState, damagedCaster);
      nextState = addSkillVisualEvent(nextState, {
        type: "red_flash",
        sourceId: caster.id,
        now,
        durationMs: 500,
      });
    }
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 1000,
  });
  nextState = addCombatFeedback(nextState, {
    type: "gather",
    entityId: target.id,
    text: `+${amount} HP`,
    now,
  });

  const currentCaster = nextState.entities[caster.id];

  return isLivingCompanion(currentCaster)
    ? updateEntity(nextState, setLastAttackAt(currentCaster, now))
    : nextState;
}

function damageEnemy(
  state: GameState,
  caster: Companion,
  target: Enemy,
  damage: number,
  label: string,
  now: number,
): GameState {
  const damagedTarget = damageEntity(target, damage);
  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: label,
    now,
  });

  nextState = addCombatFeedback(nextState, {
    type: "damage",
    entityId: target.id,
    text: `-${damage} HP`,
    now,
  });

  if (damagedTarget.state === "dead") {
    nextState = addCombatFeedback(nextState, {
      type: "death",
      entityId: damagedTarget.id,
      text: "Defeated",
      now,
    });
  }

  nextState = updateEntity(nextState, damagedTarget);

  if (damagedTarget.state === "dead") {
    nextState = grantCharacterXpToParty(nextState, damagedTarget, caster.id);
  }

  if (damagedTarget.state !== "dead") {
    nextState = updateEntity(nextState, {
      ...damagedTarget,
      state: "attack",
      currentTargetId: caster.id,
    });
  }

  return nextState;
}

function updateCasterLastAttackAt(
  state: GameState,
  casterId: string,
  now: number,
): GameState {
  const currentCaster = state.entities[casterId];

  return isLivingCompanion(currentCaster)
    ? updateEntity(state, setLastAttackAt(currentCaster, now))
    : state;
}

function getUpdatedShieldBlock(
  state: GameState,
  owner: Companion,
  shield: SkillShieldBlockState,
): SkillShieldBlockState {
  const shieldPlacement = getShieldPlacement(
    state,
    owner,
    getDirectionFromShieldRotation(shield.rotationRadians),
  );

  return {
    ...shield,
    position: shieldPlacement.position,
    rotationRadians: shieldPlacement.rotationRadians,
  };
}

function getShieldPlacement(
  state: GameState,
  caster: Companion,
  fallbackDirection = DEFAULT_SHIELD_DIRECTION,
): { position: Position; rotationRadians: number } {
  const direction = getUnitDirection(
    getShieldDirection(state, caster),
    fallbackDirection,
  );

  if (direction.x === 0 && direction.y === 0) {
    return {
      position: caster.position,
      rotationRadians: 0,
    };
  }

  return {
    position: {
      x: caster.position.x + direction.x * SHIELD_OFFSET_DISTANCE,
      y: caster.position.y + direction.y * SHIELD_OFFSET_DISTANCE,
    },
    rotationRadians: Math.atan2(direction.y, direction.x) - Math.PI / 2,
  };
}

function getUnitDirection(
  direction: Position,
  fallbackDirection: Position,
): Position {
  const directionLength = Math.hypot(direction.x, direction.y);

  if (directionLength > 0) {
    return {
      x: direction.x / directionLength,
      y: direction.y / directionLength,
    };
  }

  const fallbackLength = Math.hypot(fallbackDirection.x, fallbackDirection.y);

  if (fallbackLength === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: fallbackDirection.x / fallbackLength,
    y: fallbackDirection.y / fallbackLength,
  };
}

function getDirectionFromShieldRotation(rotationRadians: number): Position {
  const directionRadians = rotationRadians + Math.PI / 2;

  return {
    x: Math.cos(directionRadians),
    y: Math.sin(directionRadians),
  };
}

function getShieldDirection(state: GameState, caster: Companion): Position {
  const enemy = findEnemyTarget(state, caster, 5);
  const direction = enemy
    ? {
        x: Math.sign(enemy.position.x - caster.position.x),
        y: Math.sign(enemy.position.y - caster.position.y),
      }
    : getLeaderMovementDirection(state, caster);

  if (direction.x !== 0 || direction.y !== 0) {
    return direction;
  }

  const previousPosition = state.followTrailsByEntityId[caster.id]?.[0];

  if (!previousPosition) {
    return direction;
  }

  return {
    x: Math.sign(caster.position.x - previousPosition.x),
    y: Math.sign(caster.position.y - previousPosition.y),
  };
}
