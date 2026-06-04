import { isWithinFollowLeash } from "./followSystem";
import { captureInterruptedPoiTarget } from "./poiResumeSystem";
import {
  getActiveQuestGuide,
  QUEST_GUIDE_ENEMY_PAUSE_RANGE,
} from "./questGuideSystem";
import {
  updateEntity,
  type GameState,
} from "./state";
import {
  getPartyExecutionIntent,
  hasDirectPlayerPartyIntent,
  setPartyExecutionIntent,
} from "./partyIntentState";
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
    return canSelfDefendDuringInteraction(state, attackedMember)
      ? updateSelfDefenseTarget(state, attackedMember, attacker)
      : state;
  }

  let nextState = setPartyExecutionIntent(captureInterruptedPoiTarget(state, attacker), {
    type: "attack",
    targetId: attacker.id,
    targetPosition: attacker.position,
  });

  for (const entity of Object.values(state.entities)) {
    if (!canProtectPartyMember(state, entity, attackedMember)) {
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
): boolean {
  if (!isPartyMember(attackedMember)) {
    return false;
  }

  return (
    isPlayerGatherIntent(state) ||
    isPlayerNpcInteractionIntent(state) ||
    isResourceInteraction(state, attackedMember)
  );
}

function isPlayerGatherIntent(state: GameState): boolean {
  const executionIntent = getPartyExecutionIntent(state);

  return (
    executionIntent?.source === "player" &&
    executionIntent.type === "gather"
  );
}

function isPlayerNpcInteractionIntent(state: GameState): boolean {
  const intent = getPartyExecutionIntent(state);

  if (
    intent?.source !== "player" ||
    intent.type !== "move" ||
    !intent.targetPosition
  ) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      entity.kind === "npc" &&
      getGridDistance(entity.position, intent.targetPosition ?? entity.position) <=
        getNpcInteractionRange(entity),
  );
}

function getNpcInteractionRange(entity: GameEntity): number {
  return entity.kind === "npc" && entity.npcRole === "quest_giver" ? 2 : 1.5;
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
  const defenseState = setPartyExecutionIntent(captureInterruptedPoiTarget(state, attacker), {
    type: "attack",
    targetId: attacker.id,
    targetPosition: attacker.position,
  });

  return updateEntity(defenseState, {
    ...attackedMember,
    state: "attack",
    currentTargetId: attacker.id,
    commandPriority: "autonomous",
  });
}

function canProtectPartyMember(
  state: GameState,
  entity: GameEntity,
  attackedMember: AutonomousEntity,
): entity is AutonomousEntity {
  if (entity.kind !== "companion") {
    return false;
  }

  if (
    entity.commandPriority === "direct" &&
    !(entity.id === attackedMember.id && canSelfDefendDuringInteraction(state, attackedMember))
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
    return entity.state === "idle" || entity.state === "follow" || entity.state === "gather";
  }

  return entity.state === "idle" || entity.state === "follow" || entity.state === "gather";
}
