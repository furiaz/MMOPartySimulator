import { addCombatFeedback, updateEntity, type GameState } from "./state";
import type {
  CombatDamageType,
  CombatEntity,
  Companion,
  Enemy,
  ResourceEntity,
  SkillAbsorbShieldState,
  SkillDamageMitigationState,
  SkillMitigationBuffState,
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
  const absorbShield = getAbsorbShield(state, target, damageType);

  if (!absorbShield || rawDamage <= 0) {
    return { state, remainingDamage: rawDamage, absorbedDamage: 0 };
  }

  const absorbedDamage = Math.min(rawDamage, absorbShield.remainingAbsorb);
  const remainingAbsorb = absorbShield.remainingAbsorb - absorbedDamage;
  const skillAbsorbShieldsByCompanionId = {
    ...(state.skillAbsorbShieldsByCompanionId ?? {}),
  };

  if (remainingAbsorb > 0) {
    skillAbsorbShieldsByCompanionId[target.id] = {
      ...absorbShield,
      remainingAbsorb,
    };
  } else {
    delete skillAbsorbShieldsByCompanionId[target.id];
  }

  let nextState: GameState = {
    ...state,
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
    remainingDamage: Math.max(0, rawDamage - absorbedDamage),
    absorbedDamage,
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

  return selfPercent + partyPercent;
}

function getAbsorbShield(
  state: GameState,
  target: Companion,
  damageType: CombatDamageType,
): SkillAbsorbShieldState | undefined {
  const shield = state.skillAbsorbShieldsByCompanionId?.[target.id];

  return shield && doesAbsorbApply(shield, damageType) ? shield : undefined;
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

export function isEnemyBound(state: GameState, enemy: Enemy): boolean {
  return Boolean(state.skillBindsByEnemyId?.[enemy.id]);
}

function getDistance(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}
