import { handleEnemyDefeatedDrops } from "./dropSystem";
import { isAutonomousEntity } from "./entities";
import { isEnemyEntity, isTargetDummyEnemy } from "./entityGuards";
import { grantCharacterXpToParty } from "./leveling";
import { protectPartyMember } from "./partyProtectionSystem";
import { recordEnemyDefeatedForQuests } from "./questSystem";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { updateEntity, type GameState } from "./state";
import type { CombatEntity, Companion, Enemy } from "./types";

export type BasicAttackImpactResult = {
  state: GameState;
  target: CombatEntity;
};

export function resolveBasicAttackImpact(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  now: number,
): BasicAttackImpactResult {
  const combatResult = resolveAndApplyCombatDamage(state, attacker, target, {
    damageType: "physical",
    powerMultiplier: 1,
    allowEvasion: true,
    allowPassiveBlock: true,
    now,
    label: "Attack",
  });
  let nextState = combatResult.state;
  const updatedTarget = updateTargetAfterDamage(combatResult.target, attacker);

  nextState = updateEntity(nextState, updatedTarget);

  if (
    isPartyCombatEntity(attacker) &&
    isEnemy(updatedTarget) &&
    updatedTarget.state === "dead"
  ) {
    nextState = grantCharacterXpToParty(nextState, updatedTarget, attacker.id, now);
    nextState = recordEnemyDefeatedForQuests(
      nextState,
      updatedTarget,
      nextState.currentMapId,
      Math.random,
      now,
    );
    if (!updatedTarget.questSpawn?.suppressNormalDrops) {
      nextState = handleEnemyDefeatedDrops(nextState, updatedTarget, attacker.id, now);
    }
  }

  if (isEnemy(attacker) && isPartyCombatEntity(updatedTarget)) {
    nextState = protectPartyMember(nextState, updatedTarget, attacker);
  }

  return {
    state: nextState,
    target: updatedTarget,
  };
}

function updateTargetAfterDamage(
  target: CombatEntity,
  attacker: CombatEntity,
): CombatEntity {
  if (
    !isEnemy(target) ||
    isTargetDummyEnemy(target) ||
    target.state === "dead" ||
    !isAutonomousEntity(attacker)
  ) {
    return target;
  }

  return {
    ...target,
    state: "attack",
    currentTargetId: attacker.id,
  };
}

function isEnemy(entity: CombatEntity): entity is Enemy {
  return isEnemyEntity(entity);
}

function isPartyCombatEntity(entity: CombatEntity): entity is Companion {
  return entity.kind === "companion";
}
