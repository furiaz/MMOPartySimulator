import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { damageEntity } from "./entities";
import { getEnemyCombatStats } from "./enemyScaling";
import { getCompanionDerivedStats } from "./stats";
import {
  applyIncomingDamageMitigation,
  blockIncomingAttackIfShielded,
  getPrototypeAttackDamage,
} from "./skillRuntime";
import { addCombatFeedback, updateEntity, type GameState } from "./state";
import type {
  CombatDamageType,
  CombatEntity,
  Companion,
  CompanionDerivedStats,
} from "./types";

export type CombatRng = () => number;

export type CombatResolution = {
  state: GameState;
  target: CombatEntity;
  finalDamage: number;
  rawDamage: number;
  defenseReduction: number;
  evaded: boolean;
  activeShieldBlocked: boolean;
  passiveBlocked: boolean;
  critical: boolean;
  evasionChance: number;
  evasionRoll?: number;
  blockChance: number;
  blockRoll?: number;
  criticalChance: number;
  criticalRoll?: number;
  attackerAccuracy: number;
  targetDefense: number;
  targetMagicDefense: number;
  targetEvasion: number;
  targetBlock: number;
};

export type CombatResolutionOptions = {
  damageType: CombatDamageType;
  powerMultiplier: number;
  allowEvasion: boolean;
  allowPassiveBlock: boolean;
  now: number;
  label?: string;
  rng?: CombatRng;
};

const DEFENSE_REDUCTION_FACTOR = 0.6;
const DEFENSE_SOFTNESS = 50;
const EVASION_FACTOR = 0.45;
const EVASION_SOFTNESS = 20;
const BLOCK_FACTOR = 0.45;
const BLOCK_SOFTNESS = 35;
const ENEMY_BASE_ACCURACY = 1;

export function resolveAndApplyCombatDamage(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  options: CombatResolutionOptions,
): CombatResolution {
  const rng = options.rng ?? Math.random;
  const attackerStats = getCombatStats(attacker);
  const targetStats = getCombatStats(target);
  const basePower = getBasePower(attacker, options.damageType);
  const bonusDamage =
    attacker.kind === "companion" && target.kind === "enemy"
      ? getPrototypeAttackDamage(state, attacker, target, 0)
      : 0;
  const rawDamage = basePower * options.powerMultiplier + bonusDamage;
  const attackerAccuracy = getAccuracy(attackerStats);
  const targetDefense = targetStats.defense;
  const targetMagicDefense = targetStats.magicDefense;
  const targetEvasion = targetStats.evasion;
  const targetBlock = targetStats.block;
  const evasionChance = options.allowEvasion
    ? getEvasionChance(targetEvasion, attackerAccuracy)
    : 0;
  const evasionRoll = options.allowEvasion ? rng() : undefined;
  const evaded = evasionRoll !== undefined && evasionRoll < evasionChance;

  let nextState = state;
  let activeShieldBlocked = false;
  let passiveBlocked = false;
  let critical = false;
  let criticalRoll: number | undefined;
  let blockRoll: number | undefined;
  const blockChance =
    options.damageType === "physical" && options.allowPassiveBlock
      ? getBlockChance(targetBlock)
      : 0;
  const criticalChance = attackerStats?.criticalChance ?? 0;
  let finalDamage = 0;
  let defenseReduction = 0;

  if (!evaded) {
    const shieldResult =
      target.kind === "companion"
        ? blockIncomingAttackIfShielded(
            nextState,
            attacker,
            target,
            options.now,
            options.damageType,
          )
        : { state: nextState, blocked: false };

    nextState = shieldResult.state;
    activeShieldBlocked = shieldResult.blocked;
  }

  if (!evaded && !activeShieldBlocked) {
    const relevantDefense =
      options.damageType === "magic" ? targetMagicDefense : targetDefense;
    defenseReduction = getDefenseReduction(relevantDefense);
    let mitigatedDamage = rawDamage * (1 - defenseReduction);

    if (blockChance > 0) {
      blockRoll = rng();
      passiveBlocked = blockRoll < blockChance;
    }

    if (passiveBlocked) {
      mitigatedDamage *= 0.5;
    }

    if (criticalChance > 0) {
      criticalRoll = rng();
      critical = criticalRoll < criticalChance;
    }

    if (critical) {
      mitigatedDamage *= attackerStats?.criticalDamage ?? 1;
    }

    if (target.kind === "companion") {
      const mitigationResult = applyIncomingDamageMitigation(
        nextState,
        target,
        mitigatedDamage,
        options.damageType,
      );
      nextState = mitigationResult.state;
      mitigatedDamage = mitigationResult.mitigatedDamage;
    }

    finalDamage = Math.max(1, Math.round(mitigatedDamage));
    const damagedTarget = damageEntity(target, finalDamage);
    nextState = updateEntity(nextState, damagedTarget);
  }

  const updatedTarget = nextState.entities[target.id];
  const resolvedTarget =
    updatedTarget && (updatedTarget.kind === "companion" || updatedTarget.kind === "enemy")
      ? updatedTarget
      : target;

  nextState = addCombatResolutionFeedback(
    nextState,
    attacker,
    resolvedTarget,
    options,
    {
      finalDamage,
      evaded,
      activeShieldBlocked,
      passiveBlocked,
      critical,
    },
  );
  nextState = appendDebugTelemetryEvent(nextState, {
    type: "combat_resolved",
    entityId: attacker.id,
    targetId: target.id,
    archetypeId: attacker.kind === "enemy" ? attacker.archetypeId : undefined,
    enemyTypeId: attacker.kind === "enemy" ? attacker.enemyTypeId : undefined,
    enemyLevel: attacker.kind === "enemy" ? attacker.level : undefined,
    enemyEffectiveScalingLevel:
      attacker.kind === "enemy" ? attacker.effectiveScalingLevel : undefined,
    enemyScalingBand: attacker.kind === "enemy" ? attacker.scalingBand : undefined,
    enemyThreat: attacker.kind === "enemy" ? attacker.threat : undefined,
    enemyAttack: attacker.kind === "enemy" ? attacker.attack : undefined,
    enemyDefense: attacker.kind === "enemy" ? attacker.defense : undefined,
    enemyMagicDefense:
      attacker.kind === "enemy" ? attacker.magicDefense : undefined,
    enemyEvasion: attacker.kind === "enemy" ? attacker.evasion : undefined,
    enemyScalingOverrides:
      attacker.kind === "enemy" ? attacker.scalingOverrides : undefined,
    damageType: options.damageType,
    powerMultiplier: options.powerMultiplier,
    rawDamage,
    finalDamage,
    attackRating: attackerStats.attack,
    magicPowerRating: attackerStats.magicPower,
    defenseRating: targetDefense,
    magicDefenseRating: targetMagicDefense,
    defenseReduction,
    evasionRating: targetEvasion,
    accuracyRating: attackerAccuracy,
    evasionChance,
    evasionRoll,
    evaded,
    blockRating: targetBlock,
    blockChance,
    blockRoll,
    blocked: activeShieldBlocked || passiveBlocked,
    criticalChance,
    criticalRoll,
    critical,
    criticalDamage: attackerStats.criticalDamage,
    reason: options.label,
  });

  return {
    state: nextState,
    target: resolvedTarget,
    finalDamage,
    rawDamage,
    defenseReduction,
    evaded,
    activeShieldBlocked,
    passiveBlocked,
    critical,
    evasionChance,
    evasionRoll,
    blockChance,
    blockRoll,
    criticalChance,
    criticalRoll,
    attackerAccuracy,
    targetDefense,
    targetMagicDefense,
    targetEvasion,
    targetBlock,
  };
}

export function getHealingAmount(caster: Companion, powerMultiplier: number): number {
  return Math.max(
    1,
    Math.round(getCompanionDerivedStats(caster).healingPower * powerMultiplier),
  );
}

function getBasePower(attacker: CombatEntity, damageType: CombatDamageType): number {
  if (attacker.kind === "enemy") {
    return attacker.attack;
  }

  const stats = getCompanionDerivedStats(attacker);

  return damageType === "magic" ? stats.magicPower : stats.attack;
}

function getCombatStats(entity: CombatEntity): CompanionDerivedStats {
  if (entity.kind === "companion") {
    return getCompanionDerivedStats(entity);
  }

  const enemyStats = getEnemyCombatStats(entity);

  return {
    attack: enemyStats.attack,
    defense: enemyStats.defense,
    maxHealth: enemyStats.maxHealth,
    evasion: enemyStats.evasion,
    block: 0,
    magicPower: enemyStats.attack,
    healingPower: 0,
    magicDefense: enemyStats.magicDefense,
    accuracy: ENEMY_BASE_ACCURACY,
    criticalChance: 0,
    criticalDamage: 1,
    healthRegen: 0,
  };
}

function getAccuracy(stats: CompanionDerivedStats): number {
  return stats.accuracy || ENEMY_BASE_ACCURACY;
}

function getDefenseReduction(defense: number): number {
  return DEFENSE_REDUCTION_FACTOR * defense / (defense + DEFENSE_SOFTNESS);
}

export function getDefenseReductionPercent(defense: number): number {
  return Math.round(getDefenseReduction(defense) * 100);
}

function getEvasionChance(evasion: number, attackerAccuracy: number): number {
  return EVASION_FACTOR * evasion / (evasion + attackerAccuracy + EVASION_SOFTNESS);
}

function getBlockChance(block: number): number {
  return BLOCK_FACTOR * block / (block + BLOCK_SOFTNESS);
}

function addCombatResolutionFeedback(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  options: CombatResolutionOptions,
  outcome: {
    finalDamage: number;
    evaded: boolean;
    activeShieldBlocked: boolean;
    passiveBlocked: boolean;
    critical: boolean;
  },
): GameState {
  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: attacker.id,
    sourceEntityId: attacker.id,
    targetEntityId: target.id,
    feedbackKind: "attack",
    text: options.label ?? "Attack",
    now: options.now,
  });

  if (outcome.evaded) {
    return addCombatFeedback(nextState, {
      type: "damage",
      entityId: target.id,
      sourceEntityId: attacker.id,
      targetEntityId: target.id,
      damageType: options.damageType,
      feedbackKind: "dodged",
      text: "Dodged",
      now: options.now,
    });
  }

  if (outcome.activeShieldBlocked) {
    return nextState;
  }

  if (outcome.passiveBlocked) {
    nextState = addCombatFeedback(nextState, {
      type: "damage",
      entityId: target.id,
      sourceEntityId: attacker.id,
      targetEntityId: target.id,
      damageType: options.damageType,
      feedbackKind: "blocked",
      text: "Blocked",
      now: options.now,
    });
  }

  if (outcome.critical) {
    nextState = addCombatFeedback(nextState, {
      type: "damage",
      entityId: target.id,
      sourceEntityId: attacker.id,
      targetEntityId: target.id,
      damageType: options.damageType,
      feedbackKind: "critical",
      text: "Critical",
      now: options.now,
    });
  }

  nextState = addCombatFeedback(nextState, {
    type: "damage",
    entityId: target.id,
    sourceEntityId: attacker.id,
    targetEntityId: target.id,
    damageType: options.damageType,
    feedbackKind: "damage",
    amount: outcome.finalDamage,
    text: `-${outcome.finalDamage} HP`,
    now: options.now,
  });

  if (target.state === "dead") {
    nextState = addCombatFeedback(nextState, {
      type: "death",
      entityId: target.id,
      sourceEntityId: attacker.id,
      targetEntityId: target.id,
      feedbackKind: "death",
      text: "Defeated",
      now: options.now,
    });
  }

  return nextState;
}
