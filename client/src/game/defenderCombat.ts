import { damageEntity, setLastAttackAt } from "./entities";
import { grantCharacterXpToParty } from "./leveling";
import { getPrototypeAttackDamage } from "./skillRuntime";
import {
  addCombatFeedback,
  updateEntity,
  type GameState,
} from "./state";
import type { Companion, Enemy } from "./types";

const DEFENDER_ATTACK_DAMAGE = 1;
const DEFENDER_ATTACK_COOLDOWN_MS = 1000;

export function attackDefenderTarget(
  state: GameState,
  defender: Companion,
  target: Enemy,
  now: number,
): GameState {
  if (now - defender.lastAttackAt < DEFENDER_ATTACK_COOLDOWN_MS) {
    return updateEntity(state, {
      ...defender,
      currentTargetId: target.id,
    });
  }

  const attackDamage = getPrototypeAttackDamage(
    state,
    defender,
    target,
    DEFENDER_ATTACK_DAMAGE,
  );
  const damagedTarget = damageEntity(target, attackDamage);
  let nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: defender.id,
    text: "Attack",
    now,
  });
  nextState = addCombatFeedback(nextState, {
    type: "damage",
    entityId: damagedTarget.id,
    text: `-${attackDamage} HP`,
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
    nextState = grantCharacterXpToParty(
      nextState,
      damagedTarget,
      defender.id,
    );
  }

  if (damagedTarget.state !== "dead") {
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
