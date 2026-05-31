import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { handleEnemyDefeatedDrops } from "./dropSystem";
import { setLastAttackAt } from "./entities";
import {
  isLivingCompanion,
  isLivingEnemy,
  isTargetDummyEnemy,
} from "./entityGuards";
import { grantCharacterXpToParty } from "./leveling";
import { getGridDistance } from "./positionUtils";
import { recordEnemyDefeatedForQuests } from "./questSystem";
import {
  isCompanionAssignedToResurrectionRecovery,
  isPositionInActiveResurrectionArea,
} from "./resurrectionSystem";
import { getLeaderMovementDirection } from "./roleSystem";
import {
  getHealingAmount,
  resolveAndApplyCombatDamage,
} from "./combatResolver";
import {
  getClearLungePosition,
  getDirectionAwayFrom,
  getDirectionToward,
  getSkillDashPosition,
} from "./skillMovement";
import { findEnemyTarget } from "./skillTargeting";
import { getCompanionDerivedStats } from "./stats";
import {
  addCombatFeedback,
  addSkillVisualEvent,
  updateEntity,
  type GameState,
} from "./state";
import type {
  Companion,
  Enemy,
  Position,
  SkillDefinition,
  SkillShieldBlockState,
} from "./types";

const LOW_HEALTH_BUFFER = 1;
const VISUAL_DURATION_MS = 600;
const SHIELD_OFFSET_DISTANCE = 1;
const DEFAULT_SHIELD_DIRECTION: Position = { x: 0, y: -1 };

export type SkillUse = {
  skill: SkillDefinition;
  target?: Enemy | Companion;
  score: number;
  selectionPriority: number;
};

export type SkillEffectResolutionResult = {
  state: GameState;
  appliedTargetId?: string;
  shouldConsumeCooldown: boolean;
};

export function resolveSkillEffect(
  state: GameState,
  caster: Companion,
  skillUse: SkillUse,
  now: number,
): SkillEffectResolutionResult {
  const { skill, target } = skillUse;

  if (skill.effect.type === "damage" && isLivingEnemy(target)) {
    return consumeSkillEffect(
      applyDamageSkill(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "lungeDamage" && isLivingEnemy(target)) {
    return consumeSkillEffect(
      applyLungeDamageSkill(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "sweepingDamage" && isLivingEnemy(target)) {
    return consumeSkillEffect(
      applySweepingStrike(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "taunt" && isLivingEnemy(target)) {
    return consumeSkillEffect(
      applyTaunt(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "mark" && isLivingEnemy(target)) {
    return consumeSkillEffect(
      applyMarkTarget(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "selfBuff") {
    return consumeSkillEffect(applySelfBuff(state, caster, skill, now), caster.id);
  }

  if (skill.effect.type === "allyBuff" && isLivingCompanion(target)) {
    return consumeSkillEffect(
      applyAllyBuff(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "gatherBuff") {
    return consumeSkillEffect(
      applyGatherBuff(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "quickStep") {
    const appliedState = applyQuickStep(state, caster, target, skill, now);

    if (!appliedState) {
      return skipSkillEffect(state);
    }

    return consumeSkillEffect(appliedState, caster.id);
  }

  if (skill.effect.type === "shieldBlock") {
    return consumeSkillEffect(
      applyShieldBlock(state, caster, skill, now),
      caster.id,
    );
  }

  if (skill.effect.type === "bind" && isLivingEnemy(target)) {
    return consumeSkillEffect(
      applyBind(state, caster, target, skill, now),
      target.id,
    );
  }

  if (skill.effect.type === "heal" && isLivingCompanion(target)) {
    return consumeSkillEffect(
      applyHeal(
        state,
        caster,
        target,
        skill.effect.powerMultiplier,
        0,
        skill.id,
        now,
      ),
      target.id,
    );
  }

  if (skill.effect.type === "selfCostHeal" && isLivingCompanion(target)) {
    return consumeSkillEffect(
      applyHeal(
        state,
        caster,
        target,
        skill.effect.powerMultiplier,
        skill.effect.hpCost,
        skill.id,
        now,
      ),
      target.id,
    );
  }

  return skipSkillEffect(state);
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
      .filter(
        (entry): entry is [string, SkillShieldBlockState] => Boolean(entry),
      ),
  );

  return {
    ...state,
    skillShieldBlocksById,
  };
}

function consumeSkillEffect(
  state: GameState,
  appliedTargetId: string,
): SkillEffectResolutionResult {
  return {
    state,
    appliedTargetId,
    shouldConsumeCooldown: true,
  };
}

function skipSkillEffect(state: GameState): SkillEffectResolutionResult {
  return {
    state,
    shouldConsumeCooldown: false,
  };
}

function applyDamageSkill(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "damage") {
    return state;
  }

  let nextState = damageEnemy(
    state,
    caster,
    target,
    skill.displayName,
    now,
    skill.effect.damageType,
    skill.effect.powerMultiplier,
    skill.effect.damageType === "physical",
  );

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: VISUAL_DURATION_MS,
  });

  return updateCasterLastAttackAt(nextState, caster.id, now);
}

function applyLungeDamageSkill(
  state: GameState,
  caster: Companion,
  target: Enemy,
  skill: SkillDefinition,
  now: number,
): GameState {
  if (skill.effect.type !== "lungeDamage") {
    return state;
  }

  const lungePosition = getClearLungePosition(
    state,
    caster,
    target,
    skill.effect.lungeDistance,
  );

  if (!lungePosition) {
    return state;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, lungePosition)
  ) {
    return state;
  }

  const lungedCaster = {
    ...caster,
    position: lungePosition,
  };
  let nextState = updateEntity(state, lungedCaster);

  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget)) {
    nextState = damageEnemy(
      nextState,
      lungedCaster,
      currentTarget,
      skill.displayName,
      now,
      skill.effect.damageType,
      skill.effect.powerMultiplier,
      skill.effect.damageType === "physical",
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "slash",
    skillId: skill.id,
    sourceId: caster.id,
    targetId: target.id,
    position: lungePosition,
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

  let nextState = damageEnemy(
    state,
    caster,
    target,
    skill.displayName,
    now,
    skill.effect.damageType,
    skill.effect.mainPowerMultiplier,
    true,
  );
  const currentTarget = nextState.entities[target.id];

  for (const enemy of Object.values(nextState.entities)) {
    if (
      enemy.kind !== "enemy" ||
      enemy.id === target.id ||
      enemy.state === "dead" ||
      !currentTarget ||
      getGridDistance(enemy.position, currentTarget.position) >
        skill.effect.splashRange
    ) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      enemy,
      "Sweep",
      now,
      skill.effect.damageType,
      skill.effect.splashPowerMultiplier,
      true,
    );
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "slash",
    skillId: skill.id,
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

  if (skill.effect.powerMultiplier && skill.effect.powerMultiplier > 0) {
    nextState = damageEnemy(
      nextState,
      caster,
      target,
      skill.displayName,
      now,
      skill.effect.damageType ?? "physical",
      skill.effect.powerMultiplier,
      skill.effect.damageType !== "magic",
    );
  }

  const currentTarget = nextState.entities[target.id];

  if (isLivingEnemy(currentTarget) && !isTargetDummyEnemy(currentTarget)) {
    nextState = updateEntity(nextState, {
      ...currentTarget,
      state: "attack",
      currentTargetId: caster.id,
    });
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "projectile",
    skillId: skill.id,
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
    skillId: skill.id,
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
    skillId: skill.id,
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
    skillId: skill.id,
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
  target: Enemy | Companion | undefined,
  skill: SkillDefinition,
  now: number,
): GameState | null {
  if (skill.effect.type !== "quickStep" || !isLivingEnemy(target)) {
    return null;
  }

  const direction =
    caster.role === "defender" || caster.role === "fighter"
      ? getDirectionToward(caster, target)
      : getDirectionAwayFrom(caster, target);
  const position = getSkillDashPosition(
    state,
    caster,
    direction,
    skill.effect.distance,
    { allowAngles: true },
  );

  if (!position) {
    return null;
  }

  if (
    isCompanionAssignedToResurrectionRecovery(state, caster.id) &&
    !isPositionInActiveResurrectionArea(state, position)
  ) {
    return null;
  }

  let nextState = updateEntity(state, {
    ...caster,
    position,
  });

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
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
        blockedDamageTypes: skill.effect.blockedDamageTypes ?? ["physical"],
      },
    },
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId: skill.id,
    sourceId: caster.id,
    position: shieldPlacement.position,
    now,
    durationMs: 600,
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
  powerMultiplier: number,
  hpCost: number,
  skillId: SkillDefinition["id"],
  now: number,
): GameState {
  if (hpCost > 0 && caster.health <= hpCost + LOW_HEALTH_BUFFER) {
    return state;
  }

  const amount = getHealingAmount(caster, powerMultiplier);
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
        skillId,
        sourceId: caster.id,
        now,
        durationMs: 500,
      });
    }
  }

  nextState = addSkillVisualEvent(nextState, {
    type: "heal",
    skillId,
    sourceId: caster.id,
    targetId: target.id,
    now,
    durationMs: 1000,
  });
  nextState = addCombatFeedback(nextState, {
    type: "heal",
    entityId: target.id,
    text: `+${amount} HP`,
    now,
  });
  nextState = appendDebugTelemetryEvent(nextState, {
    type: "healing_resolved",
    entityId: caster.id,
    targetId: target.id,
    healingPowerRating: getCompanionDerivedStats(caster).healingPower,
    healingMultiplier: powerMultiplier,
    healingAmount: amount,
    previousHealth: target.health,
    nextHealth: healedTarget.health,
    skillId,
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
  label: string,
  now: number,
  damageType: "physical" | "magic",
  powerMultiplier: number,
  allowPassiveBlock: boolean,
): GameState {
  const combatResult = resolveAndApplyCombatDamage(state, caster, target, {
    damageType,
    powerMultiplier,
    allowEvasion: true,
    allowPassiveBlock,
    now,
    label,
  });
  let nextState = combatResult.state;
  const damagedTarget = combatResult.target;

  if (damagedTarget.kind === "enemy" && damagedTarget.state === "dead") {
    nextState = grantCharacterXpToParty(nextState, damagedTarget, caster.id, now);
    nextState = recordEnemyDefeatedForQuests(
      nextState,
      damagedTarget,
      nextState.currentMapId,
      Math.random,
      now,
    );
    if (!damagedTarget.questSpawn?.suppressNormalDrops) {
      nextState = handleEnemyDefeatedDrops(nextState, damagedTarget, caster.id, now);
    }
  }

  if (damagedTarget.kind === "enemy" && damagedTarget.state !== "dead") {
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
