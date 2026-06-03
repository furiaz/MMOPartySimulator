import {
  getItemDefinition,
  QUEST_DEFINITIONS,
  QUEST_ORDER,
  type GameState,
  type QuestObjectiveDefinition,
  type QuestReward,
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
      quest.status === "ready_to_turn_in"
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

export function getQuestRewardText(reward: QuestReward | undefined): string {
  if (!reward) {
    return "No listed rewards";
  }

  const rewardParts = [
    reward.crowns ? `${reward.crowns} Crowns` : null,
    reward.characterXp ? `${reward.characterXp} XP` : null,
    ...(reward.items ?? []).map(formatRewardItem),
    ...(reward.equipment ?? []).map(formatRewardItem),
  ].filter((part): part is string => Boolean(part));

  return rewardParts.length > 0 ? rewardParts.join(" | ") : "No listed rewards";
}

export function getQuestTurnInErrorText(quest: QuestState): string | null {
  if (quest.lastTurnInError === "inventory_full") {
    return "Inventory too full";
  }

  if (quest.lastTurnInError === "invalid_reward") {
    return "Quest reward unavailable";
  }

  return null;
}

export type QuestRuntimeProgressDisplay = {
  objectiveId: string;
  label: string;
  currentMs: number;
  requiredMs: number;
  percent: number;
  statusText: string;
};

export function getQuestRuntimeProgressDisplay(
  quest: QuestState | null,
): QuestRuntimeProgressDisplay | null {
  if (!quest || quest.status !== "active") {
    return null;
  }

  const definition = QUEST_DEFINITIONS[quest.questId];

  for (const objective of definition.objectives) {
    if (objective.type !== "repair_poi" && objective.type !== "defend_area") {
      continue;
    }

    const progress = quest.objectiveProgress[objective.id];

    if (!progress || progress.completed) {
      continue;
    }

    const currentMs =
      quest.runtime?.repairProgressMsByObjectiveId?.[objective.id] ?? 0;
    const hasStartedDefense = Boolean(
      quest.runtime?.defenseStartedObjectiveIds?.[objective.id],
    );

    if (currentMs <= 0 && !hasStartedDefense) {
      continue;
    }

    const requiredMs = Math.max(
      1,
      objective.repairDurationMs ?? objective.defenseDurationMs ?? 1,
    );
    const percent = Math.min(100, Math.max(0, (currentMs / requiredMs) * 100));
    const label =
      objective.type === "defend_area" ? "Defending Area" : "Repairing Objective";
    const roundedPercent = Math.round(percent);

    return {
      objectiveId: objective.id,
      label,
      currentMs,
      requiredMs,
      percent,
      statusText: `${label} ${roundedPercent}%`,
    };
  }

  return null;
}

function getObjectiveProgressText(
  quest: QuestState,
  objective: QuestObjectiveDefinition,
): string {
  const progress = quest.objectiveProgress[objective.id];
  const requiredCount = objective.requiredCount ?? 1;

  return `${getObjectiveLabel(objective, requiredCount)} ${progress.currentCount}/${requiredCount}`;
}

function formatRewardItem(rewardItem: NonNullable<QuestReward["items"]>[number]): string {
  const itemDefinition = getItemDefinition(rewardItem.itemId);
  const quantity = Math.floor(rewardItem.quantity);

  return quantity > 1
    ? `${itemDefinition.displayName} x${quantity}`
    : itemDefinition.displayName;
}

export function getObjectiveLabel(
  objective: QuestObjectiveDefinition,
  requiredCount = objective.requiredCount ?? 1,
): string {
  if (objective.type === "defeat_enemy_count") {
    return `Kill ${requiredCount} ${formatQuestEnemyName(
      objective.enemyArchetypeId,
    )}`;
  }

  if (objective.type === "collect_enemy_quest_drop_count") {
    return `Recover ${requiredCount} ${objective.questItemDisplayName ?? "Quest Drops"}`;
  }

  if (objective.type === "gather_item_count") {
    return `Gather ${requiredCount} ${formatQuestResourceName(
      objective.resourceType,
    )}`;
  }

  if (objective.type === "equip_item" || objective.type === "equip_flask") {
    const itemDefinition = objective.itemId
      ? getItemDefinition(objective.itemId)
      : null;

    return itemDefinition
      ? `Equip ${itemDefinition.displayName}`
      : "Equip Item";
  }

  if (objective.type === "buy_merchant_equipment") {
    return "Buy Equipment";
  }

  if (objective.type === "reach_poi") {
    return `Explore ${formatQuestMapName(objective.targetMapId)}`;
  }

  if (objective.type === "inspect_poi") {
    return "Inspect Marker";
  }

  if (objective.type === "repair_poi") {
    return "Repair Objective";
  }

  if (objective.type === "defend_area") {
    return "Defend Area";
  }

  if (objective.type === "rescue_npc") {
    return "Rescue NPC";
  }

  if (objective.type === "guide_npc_to_poi") {
    return "Escort NPC";
  }

  if (objective.type === "unlock_route") {
    return "Open Route";
  }

  if (objective.type === "defeat_elite") {
    return "Defeat Elite";
  }

  if (objective.type === "return_to_poi") {
    return "Return to Quest Giver";
  }

  if (objective.type === "talk_to_poi") {
    return "Talk to Quest Giver";
  }

  return objective.type;
}

function formatQuestEnemyName(
  enemyArchetypeId: QuestObjectiveDefinition["enemyArchetypeId"],
): string {
  if (enemyArchetypeId === "slime") {
    return "Slimes";
  }

  if (enemyArchetypeId === "bat") {
    return "Cave Bats";
  }

  if (enemyArchetypeId === "spider") {
    return "Forest Spiders";
  }

  if (enemyArchetypeId === "goblin") {
    return "Goblins";
  }

  if (enemyArchetypeId === "crawler") {
    return "Stone Crawlers";
  }

  if (enemyArchetypeId === "mossling") {
    return "Mosslings";
  }

  if (enemyArchetypeId === "imp") {
    return "Bog Imps";
  }

  if (enemyArchetypeId === "wolf") {
    return "Wolves";
  }

  return "Enemies";
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
    return "First Wild Zone";
  }

  if (mapId === "map-2") {
    return "Second Wild Zone";
  }

  if (mapId === "map-3") {
    return "Third Wild Zone";
  }

  if (mapId === "map-4") {
    return "Fourth Wild Zone";
  }

  return "Region";
}
