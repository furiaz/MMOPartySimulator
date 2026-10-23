import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  getPartyExecutionIntent,
  setPartyIntent,
} from "./partyIntentState";
import {
  getFirstIncompleteObjective,
  QUEST_DEFINITIONS,
  QUEST_ORDER,
} from "./questSystem";
import { updateEntity, type GameState } from "./state";
import type { Position } from "./types";
import type {
  QuestId,
  QuestObjectiveDefinition,
  QuestObjectiveProgress,
  QuestRuntimeState,
} from "./questTypes";

export type ActiveQuestDefenseFocus = {
  anchorPosition: Position;
  defenderIds: string[];
  objectiveId: string;
  questId: QuestId;
};

export function getActiveQuestDefenseFocus(
  state: GameState,
): ActiveQuestDefenseFocus | null {
  for (const questId of QUEST_ORDER) {
    const quest = state.quests[questId];

    if (quest?.status !== "active") {
      continue;
    }

    const objective = getActiveDefenseObjective(
      QUEST_DEFINITIONS[questId].objectives,
      quest.objectiveProgress,
      quest.runtime,
    ) ?? getSuppressionHandoffObjective(state, questId);

    if (
      !objective?.targetPosition ||
      (objective.targetMapId && objective.targetMapId !== state.currentMapId)
    ) {
      continue;
    }

    const defenderIds = Object.values(state.entities)
      .filter(
        (entity) =>
          entity.kind === "enemy" &&
          entity.state !== "dead" &&
          entity.health > 0 &&
          entity.questSpawn?.questId === questId &&
          entity.questSpawn.objectiveId === objective.id,
      )
      .map((enemy) => enemy.id)
      .sort((first, second) => first.localeCompare(second));

    return {
      anchorPosition: { ...objective.targetPosition },
      defenderIds,
      objectiveId: objective.id,
      questId,
    };
  }

  return null;
}

function getSuppressionHandoffObjective(
  state: GameState,
  questId: QuestId,
): QuestObjectiveDefinition | null {
  const definition = QUEST_DEFINITIONS[questId];

  if (definition.objectiveFlow !== "sequential") {
    return null;
  }

  const objective = getFirstIncompleteObjective(state, questId);
  const suppression = objective?.ambientEnemySuppression;
  const targetMapId = objective?.targetMapId;

  if (
    !objective ||
    objective.type === "defend_area" ||
    objective.type === "patron_ward" ||
    !suppression ||
    targetMapId !== state.currentMapId
  ) {
    return null;
  }

  const groupId = suppression.groupId ?? objective.id;
  const runtime =
    state.quests[questId].runtime?.ambientEnemySuppressionsByGroupId?.[
      groupId
    ];

  if (
    !runtime ||
    runtime.targetMapId !== targetMapId ||
    runtime.scope !== suppression.scope ||
    (suppression.scope === "subzone" &&
      runtime.targetSubzoneId !== objective.targetSubzoneId)
  ) {
    return null;
  }

  const ownsSuppression = runtime.activeObjectiveIds.includes(objective.id);
  const isAwaitingHandoff =
    runtime.activeObjectiveIds.length === 0 &&
    Number.isFinite(runtime.restoreAtMs);

  return ownsSuppression || isAwaitingHandoff ? objective : null;
}

export function shouldUseAutomaticQuestDefenseFocus(
  state: GameState,
): boolean {
  return (
    state.autoModeEnabled &&
    getPartyExecutionIntent(state)?.source !== "player" &&
    getActiveQuestDefenseFocus(state) !== null
  );
}

export function clearAutomaticResourceWorkForQuestDefense(
  state: GameState,
): GameState {
  if (!shouldUseAutomaticQuestDefenseFocus(state)) {
    return state;
  }

  const leader = getPartyLeader(state);
  let nextState = state;

  for (const member of getPartyMembers(nextState)) {
    if (
      member.commandPriority === "direct" ||
      (member.state !== "gather" &&
        nextState.entities[member.currentTargetId ?? ""]?.kind !== "resource")
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      state: member.id === leader?.id ? "idle" : "follow",
      currentTargetId: member.id === leader?.id ? null : leader?.id ?? null,
      commandPriority: "autonomous",
    });
  }

  const executionIntent = getPartyExecutionIntent(nextState);

  if (
    executionIntent?.source !== "player" &&
    (nextState.localPoiTarget?.category === "resource" ||
      executionIntent?.type === "gather")
  ) {
    nextState = setPartyIntent(nextState, null);
  }

  return nextState;
}

function getActiveDefenseObjective(
  objectives: QuestObjectiveDefinition[],
  objectiveProgress: Record<string, QuestObjectiveProgress>,
  runtime: QuestRuntimeState | undefined,
): QuestObjectiveDefinition | null {
  const activeWardId = runtime?.patronWards?.activeWardId;

  if (activeWardId) {
    const wardObjective = objectives.find(
      (objective) =>
        objective.type === "patron_ward" &&
        objective.patronWardId === activeWardId &&
        !objectiveProgress[objective.id]?.completed,
    );

    if (wardObjective) {
      return wardObjective;
    }
  }

  return (
    objectives.find(
      (objective) =>
        objective.type === "defend_area" &&
        runtime?.defenseStartedObjectiveIds?.[objective.id] === true &&
        !objectiveProgress[objective.id]?.completed,
    ) ?? null
  );
}
