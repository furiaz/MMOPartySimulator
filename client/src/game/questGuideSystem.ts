import { MAP_ONE_ID } from "./debugMap";
import { createNpc } from "./entities";
import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  QUEST_DEFINITIONS,
  getFirstIncompleteObjective,
  recordQuestPoiReachedForQuests,
} from "./questSystem";
import {
  addEntity,
  moveEntityTowardPositionIfUnoccupied,
  updateEntity,
  type GameState,
} from "./state";
import type { NpcEntity, Position } from "./types";

export const QUEST_GUIDE_NPC_ID = "map-1-mossy-guide";
export const QUEST_GUIDE_START_POSITION: Position = { x: 10, y: 29 };
export const QUEST_GUIDE_TARGET_POI_ID = "mossy-glade-route-marker";
export const QUEST_GUIDE_TARGET_POSITION: Position = { x: 101, y: 25 };
export const QUEST_GUIDE_ESCORT_RANGE = 7;
export const QUEST_GUIDE_MOVE_SPEED_MULTIPLIER = 0.7;
export const QUEST_GUIDE_OBJECTIVE_ID = "guide_mossy_glade_surveyor";

const QUEST_GUIDE_CONTACT_RANGE = 1.5;
const QUEST_GUIDE_COMPLETION_RANGE = 1.5;

export function createQuestGuideNpc(): NpcEntity {
  return createNpc(
    QUEST_GUIDE_NPC_ID,
    QUEST_GUIDE_START_POSITION,
    "Glade Surveyor",
    "quest_guide",
  );
}

export function shouldSpawnQuestGuide(state: GameState, mapId: string): boolean {
  return mapId === MAP_ONE_ID && isQuestGuideObjectiveRelevant(state);
}

export function getActiveQuestGuide(state: GameState): NpcEntity | null {
  if (!isQuestGuideObjectiveRelevant(state)) {
    return null;
  }

  const guide = state.entities[QUEST_GUIDE_NPC_ID];

  return guide?.kind === "npc" && guide.npcRole === "quest_guide"
    ? guide
    : null;
}

export function updateQuestGuideSystem(
  state: GameState,
  movedEntityIds: Set<string>,
): GameState {
  if (state.currentMapId !== MAP_ONE_ID || !isQuestGuideObjectiveRelevant(state)) {
    return state;
  }

  const leader = getPartyLeader(state);
  let guide = getActiveQuestGuide(state);

  if (!leader) {
    return state;
  }

  let nextState = state;

  if (!guide) {
    guide = createQuestGuideNpc();
    nextState = addEntity(nextState, guide);
  }

  if (!isQuestGuideObjectiveActive(nextState)) {
    return nextState;
  }

  if (isGuideAtTarget(guide.position)) {
    return completeQuestGuideObjective(nextState);
  }

  let currentGuide = guide;

  if (
    guide.state !== "follow" &&
    getDistance(leader.position, guide.position) <= QUEST_GUIDE_CONTACT_RANGE
  ) {
    currentGuide = {
      ...guide,
      state: "follow",
    };
    nextState = updateEntity(nextState, currentGuide);
  }

  if (currentGuide.state !== "follow") {
    return nextState;
  }

  if (
    !isGuideAtTarget(currentGuide.position) &&
    isAnyCompanionWithinEscortRange(nextState, currentGuide.position)
  ) {
    nextState = moveEntityTowardPositionIfUnoccupied(
      nextState,
      currentGuide,
      QUEST_GUIDE_TARGET_POSITION,
      {
        allowPartyPassThrough: true,
        pathProfile: "poi",
        pathTargetKey: "quest-guide-target",
        pathTargetPosition: QUEST_GUIDE_TARGET_POSITION,
        speedMultiplier: QUEST_GUIDE_MOVE_SPEED_MULTIPLIER,
      },
    );
    movedEntityIds.add(currentGuide.id);
    const movedGuide = nextState.entities[currentGuide.id];
    if (movedGuide?.kind === "npc") {
      currentGuide = movedGuide;
    }
  }

  return isGuideAtTarget(currentGuide.position)
    ? completeQuestGuideObjective(nextState)
    : nextState;
}

export function isQuestGuideObjectiveRelevant(state: GameState): boolean {
  const quest = state.quests.gather_expedition_supplies;
  const progress = quest?.objectiveProgress[QUEST_GUIDE_OBJECTIVE_ID];

  return quest?.status === "active" && !progress?.completed;
}

function isQuestGuideObjectiveActive(state: GameState): boolean {
  const quest = state.quests.gather_expedition_supplies;

  if (quest?.status !== "active") {
    return false;
  }

  const objective = getFirstIncompleteObjective(
    state,
    "gather_expedition_supplies",
  );

  return objective?.id === QUEST_GUIDE_OBJECTIVE_ID;
}

function completeQuestGuideObjective(state: GameState): GameState {
  return recordQuestPoiReachedForQuests(
    state,
    QUEST_DEFINITIONS.gather_expedition_supplies.objectives.find(
      (objective) => objective.id === QUEST_GUIDE_OBJECTIVE_ID,
    )?.targetPoiId ?? QUEST_GUIDE_TARGET_POI_ID,
    state.currentMapId,
  );
}

function isGuideAtTarget(position: Position): boolean {
  return getDistance(position, QUEST_GUIDE_TARGET_POSITION) <= QUEST_GUIDE_COMPLETION_RANGE;
}

function isAnyCompanionWithinEscortRange(
  state: GameState,
  position: Position,
): boolean {
  return getPartyMembers(state).some(
    (member) => getDistance(member.position, position) <= QUEST_GUIDE_ESCORT_RANGE,
  );
}

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
