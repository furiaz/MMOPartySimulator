import { isWithinFollowLeash } from "./followSystem";
import { hasDirectCompanionAuthority, isDirectGatherPersonalThreat } from "./directCommandState";
import {
  getActiveQuestGuide,
  QUEST_GUIDE_ENEMY_PAUSE_RANGE,
} from "./questGuideSystem";
import {
  type GameState,
} from "./state";
import {
  hasDirectPlayerPartyIntent,
} from "./partyIntentState";
import { applyTargetCommitment, isPlayerInteractionIntent, selectTargetCommitment } from "./targetCommitment";
import { isPartyMember, isPartyMemberBusyGatheringResource } from "./partySystem";
import { getGridDistance } from "./positionUtils";
import type { AutonomousEntity, Enemy, GameEntity } from "./types";

export function protectPartyMember(
  state: GameState,
  attackedMember: AutonomousEntity,
  attacker: Enemy,
): GameState {
  if (attackedMember.state === "dead" || attacker.state === "dead") {
    return state;
  }

  if (!isRelevantGuideEscortAttack(state, attackedMember, attacker)) {
    return state;
  }

  if (hasDirectPlayerPartyIntent(state)) {
    return canSelfDefendDuringInteraction(state, attackedMember, attacker)
      ? updateSelfDefenseTarget(state, attackedMember, attacker)
      : state;
  }

  let nextState = state;

  for (const entity of Object.values(state.entities)) {
    if (!canProtectPartyMember(state, entity, attackedMember, attacker)) {
      continue;
    }

    if (entity.kind === "companion") nextState = applyTargetCommitment(nextState, entity,
      selectTargetCommitment(nextState, entity, { damage: { attackerId: attacker.id, victimId: attackedMember.id } }));
  }

  return nextState;
}

export const protectLeader = protectPartyMember;

function isRelevantGuideEscortAttack(
  state: GameState,
  attackedMember: AutonomousEntity,
  attacker: Enemy,
): boolean {
  if (isPartyMember(attackedMember)) {
    return true;
  }

  const guide = getActiveQuestGuide(state);

  if (!guide) {
    return true;
  }

  return (
    getGridDistance(attacker.position, guide.position) <=
      QUEST_GUIDE_ENEMY_PAUSE_RANGE
  );
}

function canSelfDefendDuringInteraction(
  state: GameState,
  attackedMember: AutonomousEntity,
  attacker: Enemy,
): boolean {
  if (!isPartyMember(attackedMember)) {
    return false;
  }

  if (hasDirectCompanionAuthority(state, attackedMember)) {
    return isDirectGatherPersonalThreat(state, attackedMember.id, attacker);
  }

  return (
    isPlayerInteractionIntent(state) ||
    isResourceInteraction(state, attackedMember)
  );
}

function isResourceInteraction(
  state: GameState,
  attackedMember: AutonomousEntity,
): boolean {
  if (attackedMember.state !== "gather" || !attackedMember.currentTargetId) {
    return false;
  }

  return state.entities[attackedMember.currentTargetId]?.kind === "resource";
}

function updateSelfDefenseTarget(
  state: GameState,
  attackedMember: AutonomousEntity,
  attacker: Enemy,
): GameState {
  return attackedMember.kind === "companion" ? applyTargetCommitment(state, attackedMember,
    selectTargetCommitment(state, attackedMember, { allowPlayerInteractionDefense: true,
      damage: { attackerId: attacker.id, victimId: attackedMember.id } })) : state;
}

function canProtectPartyMember(
  state: GameState,
  entity: GameEntity,
  attackedMember: AutonomousEntity,
  attacker: Enemy,
): entity is AutonomousEntity {
  if (entity.kind !== "companion") {
    return false;
  }

  if (
    hasDirectCompanionAuthority(state, entity) &&
    !(entity.id === attackedMember.id && canSelfDefendDuringInteraction(state, attackedMember, attacker))
  ) {
    return false;
  }

  if (
    entity.kind === "companion" &&
    entity.id !== attackedMember.id &&
    isPartyMemberBusyGatheringResource(state, entity)
  ) {
    return false;
  }

  if (!isPartyMember(attackedMember)) {
    return false;
  }

  if (entity.id !== attackedMember.id && !isWithinFollowLeash(state, entity, attackedMember)) {
    return false;
  }

  if (entity.id === attackedMember.id) {
    return entity.state === "idle" || entity.state === "follow" || entity.state === "gather" || entity.state === "attack" || entity.state === "defend";
  }

  return entity.state === "idle" || entity.state === "follow" || entity.state === "gather" || entity.state === "attack" || entity.state === "defend";
}
