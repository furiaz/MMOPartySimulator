import {
  QUEST_DEFINITIONS,
  QUEST_ORDER,
  type GameState,
  type QuestObjectiveDefinition,
  type QuestState,
  type ResourceEntity,
} from "./game";

export function formatQuestStatus(status: QuestState["status"]): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getDisplayQuest(quests: GameState["quests"]): QuestState | null {
  for (const questId of QUEST_ORDER) {
    const quest = quests[questId];

    if (
      quest.status === "active" ||
      quest.status === "ready_to_turn_in" ||
      quest.status === "available"
    ) {
      return quest;
    }
  }

  return null;
}

export function getQuestLogQuests(quests: GameState["quests"]): QuestState[] {
  return QUEST_ORDER
    .map((questId) => quests[questId])
    .filter(
      (quest): quest is QuestState =>
        quest.status === "available" ||
        quest.status === "active" ||
        quest.status === "ready_to_turn_in",
    );
}

export function getQuestProgressTotals(quest: QuestState): {
  currentCount: number;
  requiredCount: number;
} {
  const definition = QUEST_DEFINITIONS[quest.questId];

  return definition.objectives.reduce(
    (totals, objective) => {
      const progress = quest.objectiveProgress[objective.id];
      const requiredCount = objective.requiredCount ?? 1;

      return {
        currentCount: totals.currentCount + (progress?.currentCount ?? 0),
        requiredCount: totals.requiredCount + requiredCount,
      };
    },
    { currentCount: 0, requiredCount: 0 },
  );
}

export function getQuestObjectiveText(quest: QuestState | null): string {
  if (!quest) {
    return "none";
  }

  const definition = QUEST_DEFINITIONS[quest.questId];

  return definition.objectives
    .map((objective) => getObjectiveProgressText(quest, objective))
    .join(" | ");
}

function getObjectiveProgressText(
  quest: QuestState,
  objective: QuestObjectiveDefinition,
): string {
  const progress = quest.objectiveProgress[objective.id];
  const requiredCount = objective.requiredCount ?? 1;

  return `${getObjectiveLabel(objective, requiredCount)} ${progress.currentCount}/${requiredCount}`;
}

export function getObjectiveLabel(
  objective: QuestObjectiveDefinition,
  requiredCount = objective.requiredCount ?? 1,
): string {
  if (objective.type === "defeat_enemy_count") {
    return `Kill ${requiredCount} Enemies`;
  }

  if (objective.type === "gather_item_count") {
    return `Gather ${requiredCount} ${formatQuestResourceName(
      objective.resourceType,
    )}`;
  }

  if (objective.type === "reach_poi") {
    return `Explore ${formatQuestMapName(objective.targetMapId)}`;
  }

  if (objective.type === "return_to_poi") {
    return "Return to Quest Giver";
  }

  if (objective.type === "talk_to_poi") {
    return "Talk to Quest Giver";
  }

  return objective.type;
}

function formatQuestResourceName(
  resourceType: ResourceEntity["resourceType"] | undefined,
): string {
  return resourceType
    ? resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
    : "Resource";
}

function formatQuestMapName(mapId: QuestObjectiveDefinition["targetMapId"]): string {
  if (mapId === "hub") {
    return "Harbor Union Bastion";
  }

  if (mapId === "map-1") {
    return "First Wild Map";
  }

  if (mapId === "map-2") {
    return "Second Wild Map";
  }

  return "Region";
}
