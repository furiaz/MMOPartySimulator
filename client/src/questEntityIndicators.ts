import {
  getEnemyType,
  isActiveResource,
  QUEST_DEFINITIONS,
  QUEST_ORDER,
  getQuestGuidanceObjectives,
  type Enemy,
  type GameEntity,
  type GameState,
  type QuestId,
  type QuestObjectiveDefinition,
  type ResourceType,
} from "./game";
import { getSubzoneAtPosition } from "./game/subzoneSystem";
import { getBoardObjectiveEnemyTypes } from "./game/guildNoticeBoardContracts";
import { isBoardOrdinaryEnemy } from "./game/guildNoticeBoardContracts";

export type QuestEntityIndicatorKind =
  | "active_objective"
  | "available_quest"
  | "turn_in";

export type QuestEntityIndicatorSource = "main_quest" | "notice_board";

export type QuestEntityIndicator = {
  id: string;
  entityId: string;
  kind: QuestEntityIndicatorKind;
  source: QuestEntityIndicatorSource;
  questId?: QuestId;
  noticeBoardQuestId?: string;
  objectiveId?: string;
};

export function getQuestEntityIndicators(
  state: GameState,
): QuestEntityIndicator[] {
  const indicatorsByEntityId = new Map<string, QuestEntityIndicator>();
  const entities = Object.values(state.entities);

  addMainQuestGiverIndicators(state, entities, indicatorsByEntityId);
  addMainQuestObjectiveIndicators(state, entities, indicatorsByEntityId);
  addNoticeBoardObjectiveIndicators(state, entities, indicatorsByEntityId);

  return [...indicatorsByEntityId.values()];
}

function addMainQuestGiverIndicators(
  state: GameState,
  entities: GameEntity[],
  indicatorsByEntityId: Map<string, QuestEntityIndicator>,
) {
  for (const questId of QUEST_ORDER) {
    const quest = state.quests[questId];

    if (quest.status !== "available" && quest.status !== "ready_to_turn_in") {
      continue;
    }

    const definition = QUEST_DEFINITIONS[questId];
    const questGiver = entities.find(
      (entity) =>
        entity.kind === "npc" && entity.id === definition.questGiverPoiId,
    );

    if (!questGiver) {
      continue;
    }

    addIndicator(indicatorsByEntityId, {
      entityId: questGiver.id,
      kind: quest.status === "available" ? "available_quest" : "turn_in",
      source: "main_quest",
      questId,
    });
  }
}

function addMainQuestObjectiveIndicators(
  state: GameState,
  entities: GameEntity[],
  indicatorsByEntityId: Map<string, QuestEntityIndicator>,
) {
  for (const questId of QUEST_ORDER) {
    const quest = state.quests[questId];

    if (quest.status !== "active") {
      continue;
    }

    const objectives = getQuestGuidanceObjectives(state, questId);

    for (const objective of objectives) {
      for (const entity of entities) {
        if (!isQuestObjectiveEntity(state, entity, objective)) {
          continue;
        }

        addIndicator(indicatorsByEntityId, {
          entityId: entity.id,
          kind: "active_objective",
          source: "main_quest",
          questId,
          objectiveId: objective.id,
        });
      }
    }
  }
}

function addNoticeBoardObjectiveIndicators(
  state: GameState,
  entities: GameEntity[],
  indicatorsByEntityId: Map<string, QuestEntityIndicator>,
) {
  for (const quest of state.guildNoticeBoard?.slots ?? []) {
    if (!quest || quest.status !== "taken" || (quest.targetMapId && quest.targetMapId !== state.currentMapId)) {
      continue;
    }

    const incompleteEnemyTypeIds = new Set(
      quest.objectives
        .filter((objective) => objective.currentCount < objective.requiredCount)
        .flatMap(getBoardObjectiveEnemyTypes),
    );

    const gathering = quest.objectives.some(objective => objective.type === "gather_resources" && objective.currentCount < objective.requiredCount);

    for (const entity of entities) {
      if (gathering && entity.kind === "resource" && isActiveResource(entity)) {
        addIndicator(indicatorsByEntityId, { entityId: entity.id, kind: "active_objective", source: "notice_board", noticeBoardQuestId: quest.id });
        continue;
      }
      if (
        entity.kind !== "enemy" ||
        entity.state === "dead" ||
        entity.health <= 0 ||
        (quest.schemaVersion === 2 && !isBoardOrdinaryEnemy(entity)) ||
        !entity.enemyTypeId ||
        !incompleteEnemyTypeIds.has(entity.enemyTypeId)
      ) {
        continue;
      }

      addIndicator(indicatorsByEntityId, {
        entityId: entity.id,
        kind: "active_objective",
        source: "notice_board",
        noticeBoardQuestId: quest.id,
      });
    }
  }
}

function isQuestObjectiveEntity(
  state: GameState,
  entity: GameEntity,
  objective: QuestObjectiveDefinition,
): boolean {
  switch (objective.type) {
    case "encounter_milestone":
      return objective.targetMapId === state.currentMapId &&
        (objective.encounterMilestone?.kind === "boss_defeated"
          ? entity.kind === "enemy" && isLivingEnemy(entity) && matchesEnemyObjective(entity, objective) && matchesObjectiveSubzone(state, entity, objective)
          : entity.kind === "npc" && entity.id === objective.targetPoiId);
    case "defeat_enemy_count":
    case "collect_enemy_quest_drop_count":
      return (
        entity.kind === "enemy" &&
        isLivingEnemy(entity) &&
        isEnemyObjectiveInCurrentMap(state, objective) &&
        matchesObjectiveSubzone(state, entity, objective) &&
        matchesEnemyObjective(entity, objective)
      );
    case "gather_item_count":
      return (
        entity.kind === "resource" &&
        isActiveResource(entity) &&
        objective.targetMapId === state.currentMapId &&
        matchesObjectiveSubzone(state, entity, objective) &&
        matchesResourceType(entity.resourceType, objective.resourceType)
      );
    case "guide_npc_to_poi":
    case "rescue_npc":
      return (
        entity.kind === "npc" &&
        entity.id === objective.guideNpcId &&
        objective.targetMapId === state.currentMapId
      );
    case "talk_to_poi":
    case "return_to_poi":
    case "collect_dungeon_chest":
      return (
        entity.kind === "npc" &&
        entity.id === objective.targetPoiId &&
        (!objective.targetMapId || objective.targetMapId === state.currentMapId)
      );
    default:
      return false;
  }
}

function isEnemyObjectiveInCurrentMap(
  state: GameState,
  objective: QuestObjectiveDefinition,
): boolean {
  return !objective.enemyMapId || objective.enemyMapId === state.currentMapId;
}

function matchesObjectiveSubzone(
  state: GameState,
  entity: GameEntity,
  objective: QuestObjectiveDefinition,
): boolean {
  if (!objective.targetSubzoneId) {
    return true;
  }

  if (entity.kind === "enemy" && entity.subzoneId) {
    return entity.subzoneId === objective.targetSubzoneId;
  }

  return (
    getSubzoneAtPosition(state.map, entity.position)?.id ===
    objective.targetSubzoneId
  );
}

function matchesEnemyObjective(
  enemy: Enemy,
  objective: QuestObjectiveDefinition,
): boolean {
  if (objective.enemyTypeId && enemy.enemyTypeId !== objective.enemyTypeId) {
    return false;
  }

  const enemyTypeArchetypeId = getEnemyType(enemy.enemyTypeId)?.archetypeId;
  const archetypeId = enemy.archetypeId ?? enemyTypeArchetypeId;

  if (
    objective.enemyArchetypeId &&
    archetypeId !== objective.enemyArchetypeId
  ) {
    return false;
  }

  if (objective.enemyVariant && enemy.variant !== objective.enemyVariant) {
    return false;
  }

  return true;
}

function matchesResourceType(
  resourceType: ResourceType,
  objectiveResourceType: ResourceType | undefined,
): boolean {
  return !objectiveResourceType || resourceType === objectiveResourceType;
}

function isLivingEnemy(enemy: Enemy): boolean {
  return enemy.state !== "dead" && enemy.health > 0;
}

function addIndicator(
  indicatorsByEntityId: Map<string, QuestEntityIndicator>,
  indicator: Omit<QuestEntityIndicator, "id">,
) {
  if (indicatorsByEntityId.has(indicator.entityId)) {
    return;
  }

  indicatorsByEntityId.set(indicator.entityId, {
    ...indicator,
    id: `${indicator.source}:${indicator.questId ?? indicator.noticeBoardQuestId}:${indicator.objectiveId ?? "quest"}:${indicator.entityId}`,
  });
}
