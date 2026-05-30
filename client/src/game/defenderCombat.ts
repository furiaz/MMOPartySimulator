import { setLastAttackAt } from "./entities";
import { ATTACK_COOLDOWN_MS } from "./attackSystem";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { grantCharacterXpToParty } from "./leveling";
import { updateEntity, type GameState } from "./state";
import type { Companion, Enemy } from "./types";

export function attackDefenderTarget(
  state: GameState,
  defender: Companion,
  target: Enemy,
  now: number,
): GameState {
  if (now - defender.lastAttackAt < ATTACK_COOLDOWN_MS) {
    return updateEntity(state, {
      ...defender,
      currentTargetId: target.id,
    });
  }

  const combatResult = resolveAndApplyCombatDamage(
    state,
    defender,
    target,
    {
      damageType: "physical",
      powerMultiplier: 1,
      allowEvasion: true,
      allowPassiveBlock: true,
      now,
      label: "Attack",
    },
  );
  let nextState = combatResult.state;
  const damagedTarget = combatResult.target;

  if (damagedTarget.kind === "enemy" && damagedTarget.state === "dead") {
    nextState = grantCharacterXpToParty(
      nextState,
      damagedTarget,
      defender.id,
      now,
    );
  }

  if (damagedTarget.kind === "enemy" && damagedTarget.state !== "dead") {
    nextState = updateEntity(nextState, {
      ...damagedTarget,
      state: "attack",
      currentTargetId: defender.id,
    });
  }

  const currentDefender = nextState.entities[defender.id];

  return currentDefender?.kind === "companion"
    ? updateEntity(
        nextState,
        setLastAttackAt({
          ...currentDefender,
          currentTargetId: damagedTarget.state === "dead" ? null : target.id,
        }, now),
      )
    : nextState;
}
