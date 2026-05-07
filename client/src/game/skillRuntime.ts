import { addCombatFeedback, updateEntity, type GameState } from "./state";
import type { CombatEntity, Companion, Enemy, SkillShieldBlockState } from "./types";

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

  return baseDamage + markBonus + selfBuffBonus;
}

export function blockIncomingAttackIfShielded(
  state: GameState,
  attacker: CombatEntity,
  target: Companion,
  now: number,
): { state: GameState; blocked: boolean } {
  const shield = getBlockingShield(state, target);

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
): SkillShieldBlockState | undefined {
  return Object.values(state.skillShieldBlocksById ?? {}).find(
    (shield) =>
      getDistance(shield.position, target.position) <= 1.5 ||
      shield.ownerId === target.id,
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
