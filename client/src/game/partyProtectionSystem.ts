import { isWithinFollowLeash } from "./followSystem";
import { captureInterruptedPoiTarget } from "./poiResumeSystem";
import {
  getActiveQuestGuide,
  QUEST_GUIDE_ESCORT_RANGE,
} from "./questGuideSystem";
import { setLeaderIntent, updateEntity, type GameState } from "./state";
import { getPartyLeader, isGathererBusy, isPartyMember } from "./partySystem";
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

  let nextState = setLeaderIntent(captureInterruptedPoiTarget(state, attacker), {
    type: "attack",
    targetId: attacker.id,
    targetPosition: attacker.position,
  });

  for (const entity of Object.values(state.entities)) {
    if (!canProtectPartyMember(state, entity, attackedMember, attacker)) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...entity,
      state: "attack",
      currentTargetId: attacker.id,
      commandPriority: "autonomous",
    });
  }

  return nextState;
}

export const protectLeader = protectPartyMember;

function isRelevantGuideEscortAttack(
  state: GameState,
  attackedMember: AutonomousEntity,
  attacker: Enemy,
): boolean {
  const guide = getActiveQuestGuide(state);

  if (!guide || !isPartyMember(attackedMember)) {
    return true;
  }

  return (
    getGridDistance(attacker.position, guide.position) <=
      QUEST_GUIDE_ESCORT_RANGE
  );
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
    entity.kind === "companion" &&
    entity.id !== attackedMember.id &&
    isGathererBusy(state, entity)
  ) {
    const leader = getPartyLeader(state);

    if (leader && !isWithinFollowLeash(state, attacker, leader)) {
      return false;
    }
  }

  if (!isPartyMember(attackedMember)) {
    return false;
  }

  if (entity.id !== attackedMember.id && !isWithinFollowLeash(state, entity, attackedMember)) {
    return false;
  }

  if (
    entity.id === attackedMember.id &&
    entity.commandPriority !== "direct" &&
    isGathererBusy(state, entity)
  ) {
    return false;
  }

  if (entity.id === attackedMember.id) {
    return entity.state === "idle" || entity.state === "follow" || entity.state === "gather";
  }

  return entity.state === "idle" || entity.state === "follow" || entity.state === "gather";
}
