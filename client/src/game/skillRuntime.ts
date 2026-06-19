import { addCombatFeedback, updateEntity, type GameState } from "./state";
import { applyStatusEffect } from "./statusEffects";
import { isLivingCompanion } from "./entityGuards";
import { getPartyMembers } from "./partySystem";
import type {
  CombatDamageType,
  CombatEntity,
  Companion,
  Enemy,
  ResourceEntity,
  SkillAbsorbShieldState,
  SkillDamageMitigationState,
  SkillFrostArmorState,
  SkillDefinition,
  SkillLifestealBuffState,
  SkillManaShieldState,
  SkillMitigationBuffState,
  SkillPartyClassBuffState,
  SkillShieldBlockState,
} from "./types";

export function getPrototypeAttackDamage(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  baseDamage: number,
): number {
  if (attacker.kind !== "companion" || target.kind !== "enemy") {
    return baseDamage;
  }

  const markBonus = state.skillMarksByEnemyId?.[target.id]?.bonusDamage ?? 0;
  const selfBuffBonus =
    state.skillSelfBuffsByCompanionId?.[attacker.id]?.bonusDamage ?? 0;
  const partyBuffBonus = Object.values(state.skillPartyBuffsBySourceId ?? {})
    .reduce((total, buff) => total + buff.bonusDamage, 0);

  return baseDamage + markBonus + selfBuffBonus + partyBuffBonus;
}

export function updateRuneSkillRuntime(
  state: GameState,
  now: number,
): GameState {
  let nextState = updateRewindRunes(state, now);
  nextState = updateHealOverTimes(nextState, now);
  const skillRunicFocusByCompanionId = Object.fromEntries(
    Object.entries(nextState.skillRunicFocusByCompanionId ?? {}).filter(
      ([companionId]) => isLivingCompanion(nextState.entities[companionId]),
    ),
  );

  return objectShallowEqual(
    skillRunicFocusByCompanionId,
    nextState.skillRunicFocusByCompanionId ?? {},
  )
    ? nextState
    : {
        ...nextState,
        skillRunicFocusByCompanionId,
      };
}

export function getHealingReceivedBonusPercent(
  state: GameState,
  target: Companion,
): number {
  return getActivePartyClassBuffsForCompanion(state, target).reduce(
    (total, buff) => total + (buff.healingReceivedBonusPercent ?? 0),
    0,
  );
}

export function applyCompanionHealing(
  state: GameState,
  target: Companion,
  baseAmount: number,
  now: number,
  {
    sourceId,
    feedback = true,
  }: { sourceId?: string; feedback?: boolean } = {},
): { state: GameState; healedAmount: number; target: Companion } {
  const currentTarget = state.entities[target.id];

  if (!isLivingCompanion(currentTarget) || baseAmount <= 0) {
    return { state, healedAmount: 0, target };
  }

  const healingReceivedBonusPercent = getHealingReceivedBonusPercent(
    state,
    currentTarget,
  );
  const amount = Math.max(
    1,
    Math.round(baseAmount * (1 + healingReceivedBonusPercent / 100)),
  );
  const nextHealth = Math.min(
    currentTarget.maxHealth,
    currentTarget.health + amount,
  );
  const healedAmount = nextHealth - currentTarget.health;

  if (healedAmount <= 0) {
    return { state, healedAmount: 0, target: currentTarget };
  }

  let nextState = updateEntity(state, {
    ...currentTarget,
    health: nextHealth,
  });

  if (feedback) {
    nextState = addCombatFeedback(nextState, {
      type: "heal",
      entityId: currentTarget.id,
      sourceEntityId: sourceId,
      targetEntityId: currentTarget.id,
      amount: healedAmount,
      text: `+${healedAmount} HP`,
      now,
    });
  }

  const healedTarget = nextState.entities[currentTarget.id];

  return {
    state: nextState,
    healedAmount,
    target: isLivingCompanion(healedTarget) ? healedTarget : currentTarget,
  };
}

export function recordRewindRuneDamage(
  state: GameState,
  target: Companion,
  damageAmount: number,
): GameState {
  const rewindRune = state.skillRewindRunesByCompanionId?.[target.id];

  if (!rewindRune || damageAmount <= 0) {
    return state;
  }

  return {
    ...state,
    skillRewindRunesByCompanionId: {
      ...(state.skillRewindRunesByCompanionId ?? {}),
      [target.id]: {
        ...rewindRune,
        recordedDamage: rewindRune.recordedDamage + damageAmount,
      },
    },
  };
}

export function getPartyClassDamageBonusPercent(
  state: GameState,
  attacker: CombatEntity,
  damageType: CombatDamageType,
): number {
  if (attacker.kind !== "companion") {
    return 0;
  }

  return getActivePartyClassBuffsForCompanion(state, attacker)
    .reduce((total, buff) => {
      if (damageType === "magic") {
        return total + (buff.magicDamageBonusPercent ?? 0);
      }

      return total + (buff.physicalDamageBonusPercent ?? 0);
    }, 0);
}

export function getPrototypeGatherAmountBonus(
  state: GameState,
  companion: Companion,
  resource?: ResourceEntity,
): number {
  const buff = state.skillGatherBuffsByCompanionId?.[companion.id];

  if (!buff || (buff.resourceType && buff.resourceType !== resource?.resourceType)) {
    return 0;
  }

  return buff.bonusGatherSpeed;
}

export function applyPartyPoisonCoatingFromAttack(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  finalDamage: number,
  now: number,
): GameState {
  if (
    finalDamage <= 0 ||
    attacker.kind !== "companion" ||
    target.kind !== "enemy"
  ) {
    return state;
  }

  let nextState = state;

  for (const coating of getActivePartyClassBuffsForCompanion(
    state,
    attacker,
  ).flatMap((buff) =>
    buff.poisonCoating
      ? [
          {
            ...buff.poisonCoating,
            sourceId: buff.sourceId,
          },
        ]
      : [],
  )) {
    nextState = applyStatusEffect(
      nextState,
      {
        type: "poison",
        targetId: target.id,
        durationMs: coating.poisonDurationMs,
        tickDamage: coating.tickDamage,
        sourceId: coating.sourceId,
        sourceKey: coating.sourceKey,
        tickIntervalMs: coating.poisonTickIntervalMs,
      },
      now,
    );
  }

  for (const coating of Object.values(
    state.skillPartyPoisonCoatingsBySourceId ?? {},
  )) {
    nextState = applyStatusEffect(
      nextState,
      {
        type: "poison",
        targetId: target.id,
        durationMs: coating.poisonDurationMs,
        tickDamage: coating.tickDamage,
        sourceId: coating.sourceId,
        sourceKey: coating.sourceKey,
        tickIntervalMs: coating.poisonTickIntervalMs,
      },
      now,
    );
  }

  return nextState;
}

export function canUsePartyClassBuff(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now = Date.now(),
): boolean {
  if (skill.effect.type !== "partyClassBuff") {
    return false;
  }

  const refreshWindowMs = skill.effect.refreshWindowMs ?? 0;

  return getPartyMembers(state).some((member) => {
    const activeBuff =
      state.skillPartyClassBuffsByCompanionId?.[member.id]?.[caster.classId];

    return (
      !activeBuff ||
      activeBuff.expiresAt <= now ||
      activeBuff.expiresAt - now <= refreshWindowMs
    );
  });
}

export function applyLifestealFromAttack(
  state: GameState,
  attacker: CombatEntity,
  finalDamage: number,
  damageType: CombatDamageType,
  now: number,
): GameState {
  if (
    finalDamage <= 0 ||
    damageType !== "physical" ||
    attacker.kind !== "companion"
  ) {
    return state;
  }

  const currentAttacker = state.entities[attacker.id];

  if (currentAttacker?.kind !== "companion") {
    return state;
  }

  const lifesteal = getLifestealBuff(state, currentAttacker);

  if (!lifesteal || currentAttacker.health >= currentAttacker.maxHealth) {
    return state;
  }

  const healAmount = Math.max(
    1,
    Math.round(finalDamage * (lifesteal.lifestealPercent / 100)),
  );
  return applyCompanionHealing(state, currentAttacker, healAmount, now, {
    sourceId: attacker.id,
  }).state;
}

export function applyIncomingDamageMitigation(
  state: GameState,
  target: Companion,
  rawDamage: number,
  damageType: CombatDamageType,
): { state: GameState; mitigatedDamage: number; mitigationPercent: number } {
  const mitigation = getDamageMitigation(state, target, damageType);
  const timedMitigationPercent = getTimedMitigationPercent(
    state,
    target,
    damageType,
  );

  if (!mitigation) {
    if (timedMitigationPercent <= 0) {
      return {
        state,
        mitigatedDamage: rawDamage,
        mitigationPercent: 0,
      };
    }

    return {
      state,
      mitigatedDamage: rawDamage * (1 - Math.min(100, timedMitigationPercent) / 100),
      mitigationPercent: timedMitigationPercent,
    };
  }

  const skillDamageMitigationsByCompanionId = {
    ...(state.skillDamageMitigationsByCompanionId ?? {}),
  };
  const remainingProcs = mitigation.remainingProcs - 1;

  if (remainingProcs > 0) {
    skillDamageMitigationsByCompanionId[target.id] = {
      ...mitigation,
      remainingProcs,
    };
  } else {
    delete skillDamageMitigationsByCompanionId[target.id];
  }

  const totalMitigationPercent = Math.min(
    100,
    mitigation.mitigationPercent + timedMitigationPercent,
  );

  return {
    state: {
      ...state,
      skillDamageMitigationsByCompanionId,
    },
    mitigatedDamage: rawDamage * (1 - totalMitigationPercent / 100),
    mitigationPercent: totalMitigationPercent,
  };
}

export function applyIncomingDamageAbsorb(
  state: GameState,
  target: Companion,
  rawDamage: number,
  damageType: CombatDamageType,
  now: number,
): { state: GameState; remainingDamage: number; absorbedDamage: number } {
  const manaShield = getManaShield(state, target, damageType);
  let nextState = state;
  let remainingDamage = rawDamage;
  let absorbedDamage = 0;

  if (manaShield && remainingDamage > 0) {
    const manaAbsorbedDamage = Math.min(
      remainingDamage,
      manaShield.remainingAbsorb,
    );
    const remainingAbsorb = manaShield.remainingAbsorb - manaAbsorbedDamage;
    const skillManaShieldsByCompanionId = {
      ...(nextState.skillManaShieldsByCompanionId ?? {}),
    };

    if (remainingAbsorb > 0) {
      skillManaShieldsByCompanionId[target.id] = {
        ...manaShield,
        remainingAbsorb,
      };
    } else {
      delete skillManaShieldsByCompanionId[target.id];
    }

    nextState = {
      ...nextState,
      skillManaShieldsByCompanionId,
    };
    nextState = addCombatFeedback(nextState, {
      type: "attack",
      entityId: target.id,
      text: "Mana Shield",
      now,
    });
    remainingDamage = Math.max(0, remainingDamage - manaAbsorbedDamage);
    absorbedDamage += manaAbsorbedDamage;
  }

  const absorbShield = getAbsorbShield(nextState, target, damageType);

  if (!absorbShield || remainingDamage <= 0) {
    return { state: nextState, remainingDamage, absorbedDamage };
  }

  const shieldAbsorbedDamage = Math.min(
    remainingDamage,
    absorbShield.remainingAbsorb,
  );
  const remainingAbsorb = absorbShield.remainingAbsorb - shieldAbsorbedDamage;
  const skillAbsorbShieldsByCompanionId = {
    ...(nextState.skillAbsorbShieldsByCompanionId ?? {}),
  };

  if (remainingAbsorb > 0) {
    skillAbsorbShieldsByCompanionId[target.id] = {
      ...absorbShield,
      remainingAbsorb,
    };
  } else {
    delete skillAbsorbShieldsByCompanionId[target.id];
  }

  nextState = {
    ...nextState,
    skillAbsorbShieldsByCompanionId,
  };

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: target.id,
    text: "Absorbed",
    now,
  });

  return {
    state: nextState,
    remainingDamage: Math.max(0, remainingDamage - shieldAbsorbedDamage),
    absorbedDamage: absorbedDamage + shieldAbsorbedDamage,
  };
}

export function blockIncomingAttackIfShielded(
  state: GameState,
  attacker: CombatEntity,
  target: Companion,
  now: number,
  damageType: CombatDamageType = "physical",
): { state: GameState; blocked: boolean } {
  const shield = getBlockingShield(state, target, damageType);

  if (!shield) {
    return { state, blocked: false };
  }

  const skillShieldBlocksById = { ...(state.skillShieldBlocksById ?? {}) };
  const remainingBlocks = shield.remainingBlocks - 1;

  if (remainingBlocks > 0) {
    skillShieldBlocksById[shield.id] = {
      ...shield,
      remainingBlocks,
    };
  } else {
    delete skillShieldBlocksById[shield.id];
  }

  let nextState: GameState = {
    ...state,
    skillShieldBlocksById,
  };

  if (remainingBlocks <= 0 && shield.healPercentMaxHealthOnConsume) {
    const currentTarget = nextState.entities[target.id];

    if (isLivingCompanion(currentTarget)) {
      const healAmount = Math.max(
        1,
        Math.ceil(
          currentTarget.maxHealth *
            (shield.healPercentMaxHealthOnConsume / 100),
        ),
      );
      nextState = applyCompanionHealing(nextState, currentTarget, healAmount, now, {
        sourceId: shield.sourceId ?? target.id,
      }).state;
    }
  }

  nextState = addCombatFeedback(nextState, {
    type: "attack",
    entityId: attacker.id,
    text: "Blocked",
    now,
  });

  return {
    state: updateEntity(nextState, {
      ...attacker,
      state: attacker.state,
      currentTargetId: target.id,
    }),
    blocked: true,
  };
}

function getBlockingShield(
  state: GameState,
  target: Companion,
  damageType: CombatDamageType,
): SkillShieldBlockState | undefined {
  return Object.values(state.skillShieldBlocksById ?? {}).find(
    (shield) =>
      (shield.blockedDamageTypes ?? ["physical"]).includes(damageType) &&
      (getDistance(shield.position, target.position) <= 1.5 ||
        shield.ownerId === target.id),
  );
}

function getDamageMitigation(
  state: GameState,
  target: Companion,
  damageType: CombatDamageType,
): SkillDamageMitigationState | undefined {
  const mitigation = state.skillDamageMitigationsByCompanionId?.[target.id];

  return mitigation &&
    (mitigation.mitigatedDamageTypes ?? ["physical"]).includes(damageType)
    ? mitigation
    : undefined;
}

function getTimedMitigationPercent(
  state: GameState,
  target: Companion,
  damageType: CombatDamageType,
): number {
  const selfMitigation = state.skillSelfMitigationBuffsByCompanionId?.[target.id];
  const selfPercent = doesMitigationApply(selfMitigation, damageType)
    ? selfMitigation.mitigationPercent
    : 0;
  const partyPercent = Object.values(
    state.skillPartyMitigationBuffsBySourceId ?? {},
  ).reduce(
    (total, buff) =>
      doesMitigationApply(buff, damageType) ? total + buff.mitigationPercent : total,
    0,
  );
  const partyClassPercent = getActivePartyClassBuffsForCompanion(state, target)
    .reduce(
      (total, buff) =>
        doesPartyClassMitigationApply(buff, damageType)
          ? total + (buff.mitigationPercent ?? 0)
          : total,
      0,
    );
  const frostArmor = state.skillFrostArmorsByCompanionId?.[target.id];
  const frostArmorPercent = doesFrostArmorApply(frostArmor, damageType)
    ? frostArmor.mitigationPercent
    : 0;

  return selfPercent + partyPercent + partyClassPercent + frostArmorPercent;
}

function getAbsorbShield(
  state: GameState,
  target: Companion,
  damageType: CombatDamageType,
): SkillAbsorbShieldState | undefined {
  const shield = state.skillAbsorbShieldsByCompanionId?.[target.id];

  return shield && doesAbsorbApply(shield, damageType) ? shield : undefined;
}

function getManaShield(
  state: GameState,
  target: Companion,
  damageType: CombatDamageType,
): SkillManaShieldState | undefined {
  const shield = state.skillManaShieldsByCompanionId?.[target.id];

  return shield && doesManaShieldApply(shield, damageType) ? shield : undefined;
}

export function getFrostArmorDefenseBonusPercent(
  state: GameState,
  target: Companion,
  damageType: CombatDamageType,
): number {
  const frostArmor = state.skillFrostArmorsByCompanionId?.[target.id];

  return doesFrostArmorApply(frostArmor, damageType)
    ? frostArmor.defenseBonusPercent
    : 0;
}

function doesMitigationApply(
  mitigation: SkillMitigationBuffState | undefined,
  damageType: CombatDamageType,
): mitigation is SkillMitigationBuffState {
  return Boolean(
    mitigation &&
      (mitigation.mitigatedDamageTypes === undefined ||
        mitigation.mitigatedDamageTypes.includes(damageType)),
  );
}

function doesAbsorbApply(
  shield: SkillAbsorbShieldState,
  damageType: CombatDamageType,
): boolean {
  return (
    shield.absorbedDamageTypes === undefined ||
    shield.absorbedDamageTypes.includes(damageType)
  );
}

function doesManaShieldApply(
  shield: SkillManaShieldState,
  damageType: CombatDamageType,
): boolean {
  return (
    shield.absorbedDamageTypes === undefined ||
    shield.absorbedDamageTypes.includes(damageType)
  );
}

function doesFrostArmorApply(
  frostArmor: SkillFrostArmorState | undefined,
  damageType: CombatDamageType,
): frostArmor is SkillFrostArmorState {
  return Boolean(
    frostArmor &&
      (frostArmor.mitigatedDamageTypes === undefined ||
        frostArmor.mitigatedDamageTypes.includes(damageType)),
  );
}

function getLifestealBuff(
  state: GameState,
  attacker: Companion,
): SkillLifestealBuffState | undefined {
  return state.skillLifestealBuffsByCompanionId?.[attacker.id];
}

function getActivePartyClassBuffsForCompanion(
  state: GameState,
  companion: Companion,
): SkillPartyClassBuffState[] {
  const now = state.simulationTimeMs ?? Date.now();

  return Object.values(
    state.skillPartyClassBuffsByCompanionId?.[companion.id] ?? {},
  ).filter(
    (buff): buff is SkillPartyClassBuffState =>
      Boolean(buff) && buff.expiresAt > now,
  );
}

function updateRewindRunes(state: GameState, now: number): GameState {
  const rewinds = state.skillRewindRunesByCompanionId;

  if (!rewinds) {
    return state;
  }

  let nextState = state;
  const nextRewinds = { ...rewinds };
  let didChange = false;

  for (const rewind of Object.values(rewinds)) {
    const target = nextState.entities[rewind.targetId];

    if (!isLivingCompanion(target)) {
      delete nextRewinds[rewind.targetId];
      didChange = true;
      continue;
    }

    let nextTickAt = rewind.nextTickAt;
    let recordedDamage = rewind.recordedDamage;

    while (nextTickAt <= now && nextTickAt <= rewind.expiresAt) {
      if (recordedDamage > 0 && target.health < target.maxHealth) {
        const healAmount = Math.max(
          1,
          Math.round(recordedDamage * (rewind.healPercentRecordedDamage / 100)),
        );
        const currentTarget = nextState.entities[rewind.targetId];

        if (isLivingCompanion(currentTarget)) {
          nextState = applyCompanionHealing(nextState, currentTarget, healAmount, now, {
            sourceId: rewind.sourceId,
          }).state;
        }
      }

      recordedDamage = 0;
      nextTickAt += rewind.tickIntervalMs;
    }

    if (rewind.expiresAt <= now) {
      delete nextRewinds[rewind.targetId];
      didChange = true;
      continue;
    }

    if (nextTickAt !== rewind.nextTickAt || recordedDamage !== rewind.recordedDamage) {
      nextRewinds[rewind.targetId] = {
        ...rewind,
        nextTickAt,
        recordedDamage,
      };
      didChange = true;
    }
  }

  return didChange
    ? {
        ...nextState,
        skillRewindRunesByCompanionId: nextRewinds,
      }
    : nextState;
}

function updateHealOverTimes(state: GameState, now: number): GameState {
  const healOverTimes = state.skillHealOverTimesByCompanionId;

  if (!healOverTimes) {
    return state;
  }

  let nextState = state;
  const nextHealOverTimes = { ...healOverTimes };
  let didChange = false;

  for (const healOverTime of Object.values(healOverTimes)) {
    const target = nextState.entities[healOverTime.targetId];

    if (!isLivingCompanion(target)) {
      delete nextHealOverTimes[healOverTime.targetId];
      didChange = true;
      continue;
    }

    let nextTickAt = healOverTime.nextTickAt;

    while (nextTickAt <= now && nextTickAt <= healOverTime.expiresAt) {
      if (target.health < target.maxHealth) {
        const currentTarget = nextState.entities[healOverTime.targetId];

        if (isLivingCompanion(currentTarget)) {
          const healAmount = Math.max(
            1,
            Math.ceil(
              currentTarget.maxHealth *
                (healOverTime.healPercentMaxHealth / 100),
            ),
          );
          nextState = applyCompanionHealing(
            nextState,
            currentTarget,
            healAmount,
            now,
            { sourceId: healOverTime.sourceId },
          ).state;
        }
      }

      nextTickAt += healOverTime.tickIntervalMs;
    }

    if (healOverTime.expiresAt <= now) {
      delete nextHealOverTimes[healOverTime.targetId];
      didChange = true;
      continue;
    }

    if (nextTickAt !== healOverTime.nextTickAt) {
      nextHealOverTimes[healOverTime.targetId] = {
        ...healOverTime,
        nextTickAt,
      };
      didChange = true;
    }
  }

  return didChange
    ? {
        ...nextState,
        skillHealOverTimesByCompanionId: nextHealOverTimes,
      }
    : nextState;
}

function objectShallowEqual<T>(
  first: Record<string, T>,
  second: Record<string, T>,
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);

  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every((key) => first[key] === second[key])
  );
}

function doesPartyClassMitigationApply(
  buff: SkillPartyClassBuffState,
  damageType: CombatDamageType,
): boolean {
  return Boolean(
    buff.mitigationPercent &&
      (buff.mitigatedDamageTypes === undefined ||
        buff.mitigatedDamageTypes.includes(damageType)),
  );
}

export function isEnemyBound(state: GameState, enemy: Enemy): boolean {
  return Boolean(state.skillBindsByEnemyId?.[enemy.id]);
}

function getDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}
